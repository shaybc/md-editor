/**
 * Provider-neutral construction of bounded Agent decision context from explicit sources.
 */

"use strict";

const crypto = require("node:crypto");
const intentContract = require("./intent-contract");

const DEFAULT_CONTEXT_MAX_CHARS = 96000;
const MAX_ACTIVE_FILE_CHARS = 20000;
const MAX_ATTACHMENT_FILE_CHARS = 12000;
const MAX_ATTACHMENT_TOTAL_CHARS = 32000;
const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_MESSAGE_CHARS = 4000;
const MAX_STATE_PROJECTION_CHARS = 12000;
const MAX_OBSERVATION_CONTEXT_CHARS = 24000;
const MAX_ARTIFACT_EXCERPT_CHARS = 12000;

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function truncateText(value, maximum) {
  const text = String(value || "");
  return text.length > maximum ? `${text.slice(0, Math.max(0, maximum - 15))}\n...[truncated]` : text;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase();
}

function authorityForSourceType(sourceType) {
  if (sourceType === "system") return "policy";
  if (["current-prompt", "attachment", "user-instruction"].includes(sourceType)) return "user";
  if (["active-file", "observation", "artifact-excerpt"].includes(sourceType)) return "environment";
  if (["intent-contract", "agent-state"].includes(sourceType)) return "runtime";
  return "historical";
}

function stringify(value) {
  try { return JSON.stringify(value, null, 2); } catch (_error) { return ""; }
}

function messageChars(message) {
  if (typeof message?.content === "string") return message.content.length;
  if (!Array.isArray(message?.content)) return 0;
  return message.content.reduce((total, part) => total + (part?.type === "text" ? String(part.text || "").length : 0), 0);
}

function createCurrentUserMessage(prompt, attachments) {
  const images = (Array.isArray(attachments) ? attachments : []).filter((attachment) => attachment?.kind === "image" && attachment?.dataUrl);
  if (!images.length) return { role: "user", content: String(prompt || "") };
  return {
    role: "user",
    content: [
      { type: "text", text: String(prompt || "") },
      ...images.map((attachment) => ({ type: "image_url", image_url: { url: String(attachment.dataUrl) } }))
    ]
  };
}

function collectUserInstructions(state) {
  return (Array.isArray(state?.interactions) ? state.interactions : []).flatMap((interaction) => {
    const values = [];
    if (String(interaction?.instructions || "").trim()) values.push(String(interaction.instructions));
    else if (interaction?.response !== undefined && interaction?.response !== null && interaction?.response !== "") {
      values.push(typeof interaction.response === "string" ? interaction.response : stringify(interaction.response));
    }
    return values.filter(Boolean).map((text, index) => ({
      sourceId: `user-interaction:${String(interaction.interactionId || "unknown")}:${index}`,
      text
    }));
  });
}

function buildStateProjection(state) {
  const projection = {
    run: state?.run || null,
    controlMode: state?.controlMode || "shadow",
    lifecycle: state?.lifecycle || null,
    criteria: state?.criteria || [],
    recentDecisions: state?.recentDecisions || [],
    decisionCounts: state?.decisionCounts || {},
    activeActions: state?.activeActions || [],
    recentActions: state?.recentActions || [],
    observationRefs: (state?.recentObservations || []).map((observation) => ({
      observationId: observation.observationId,
      tool: observation.tool,
      executionStatus: observation.executionStatus,
      outcome: observation.outcome,
      evidenceRef: observation.evidenceRef,
      artifactRef: observation.artifactRef?.id || ""
    })),
    observationCounts: state?.observationCounts || null,
    verification: state?.verification || null,
    artifacts: state?.artifacts || null,
    steering: state?.steering || null
  };
  return truncateText(stringify(projection), MAX_STATE_PROJECTION_CHARS);
}

function createObservationCandidate(observation, artifactStore, supersedingPaths, sourceDecisions) {
  const normalizedFiles = (observation.files || []).map(normalizePath).filter(Boolean);
  const supersedingReason = normalizedFiles.map((file) => supersedingPaths.get(file)).find(Boolean) || "";
  const isSuperseded = Boolean(supersedingReason);
  let excerpt = null;
  if (observation.artifactRef && !isSuperseded) {
    excerpt = artifactStore?.readExcerpt?.(observation.artifactRef, MAX_ARTIFACT_EXCERPT_CHARS) || null;
  } else if (observation.artifactRef && isSuperseded) {
    sourceDecisions.push({
      sourceId: observation.artifactRef.id,
      sourceType: "artifact-excerpt",
      authority: authorityForSourceType("artifact-excerpt"),
      fingerprint: observation.artifactRef.digest || "",
      renderedInSection: "",
      omittedFromSections: ["observations"],
      omissionReason: supersedingReason
    });
  }
  const payload = {
    observationId: observation.observationId,
    toolCallId: observation.toolCallId,
    tool: observation.tool,
    executionStatus: observation.executionStatus,
    outcome: observation.outcome,
    summary: observation.summary,
    files: observation.files,
    evidenceRef: observation.evidenceRef,
    artifactRef: observation.artifactRef,
    artifactExcerpt: excerpt?.text || undefined,
    artifactExcerptTruncated: excerpt?.truncated || undefined,
    artifactSuperseded: isSuperseded || undefined
  };
  return { observation, text: stringify(payload), excerptIncluded: Boolean(excerpt) };
}

/**
 * Build a deterministic Agent context without mutating state, request inputs, or artifacts.
 * @param {object} input Authoritative request sources, AgentState, and artifact resolver.
 * @returns {object} Provider-neutral messages plus a content-free selection manifest.
 */
function buildAgentContext(input = {}) {
  const state = input.state || {};
  const maxChars = Math.max(16000, Number(input.maxChars) || DEFAULT_CONTEXT_MAX_CHARS);
  const sourceDecisions = [];
  const sections = [];
  const requiredSourcesMissing = [];
  const mandatoryMessages = [];
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];

  function recordSource(sourceId, sourceType, content, renderedInSection, extra = {}) {
    sourceDecisions.push({
      sourceId,
      sourceType,
      authority: extra.authority || authorityForSourceType(sourceType),
      fingerprint: fingerprint(typeof content === "string" ? content : stringify(content)),
      renderedInSection,
      omittedFromSections: extra.omittedFromSections || [],
      omissionReason: extra.omissionReason || "",
      ...(extra.freshness ? { freshness: extra.freshness } : {}),
      ...(extra.unsaved === true ? { unsaved: true } : {}),
      ...(extra.mayContainUnsavedChanges === true ? { mayContainUnsavedChanges: true } : {})
    });
  }

  function addMandatory(sectionId, sourceId, sourceType, message, extra = {}) {
    mandatoryMessages.push({ sectionId, sourceId, message });
    recordSource(sourceId, sourceType, message?.content || "", sectionId, extra);
  }

  const systemPrompt = String(input.systemPrompt || "");
  if (systemPrompt) addMandatory("system", "system:agent", "system", { role: "system", content: systemPrompt });
  else requiredSourcesMissing.push("system");

  for (const [index, message] of (Array.isArray(input.additionalSystemMessages) ? input.additionalSystemMessages : []).entries()) {
    if (message?.role === "system" && String(message.content || "").trim()) {
      addMandatory("system", `system:additional:${index}`, "system", { role: "system", content: String(message.content) });
    }
  }

  const activeFile = input.activeFile;
  const activePath = normalizePath(activeFile?.path);
  const activeDocument = input.editorReadContext?.activeDocument;
  const activeIsDirty = activeDocument?.dirty === true && (!activeDocument.path || normalizePath(activeDocument.path) === activePath);
  if (activeFile?.path && typeof activeFile.content === "string") {
    const activeContent = [
      `Live editor buffer: ${activeFile.path}`,
      activeIsDirty ? "This buffer has unsaved changes." : "This live buffer may contain unsaved changes.",
      "It is newer than saved-file reads and artifact excerpts for the same path.",
      "",
      truncateText(activeFile.content, MAX_ACTIVE_FILE_CHARS)
    ].join("\n");
    addMandatory("active-file", `active-file:${fingerprint(activePath)}`, "active-file", { role: "system", content: activeContent }, {
      freshness: "live-editor",
      unsaved: activeIsDirty,
      mayContainUnsavedChanges: !activeIsDirty
    });
  }

  let remainingAttachmentChars = MAX_ATTACHMENT_TOTAL_CHARS;
  const attachmentLines = [];
  const attachmentPaths = new Set();
  for (const [index, attachment] of attachments.entries()) {
    const attachmentPath = normalizePath(attachment?.path);
    if (attachmentPath) attachmentPaths.add(attachmentPath);
    if (attachment?.kind === "image" && attachment?.dataUrl) {
      recordSource(`attachment:image:${index}:${fingerprint(attachment.dataUrl)}`, "attachment", attachment.dataUrl, "current-request");
      continue;
    }
    const rawContent = String(attachment?.content || "");
    const name = String(attachment?.name || attachment?.path || "file");
    const sourceId = `attachment:text:${index}:${fingerprint(`${attachmentPath}:${name}`)}`;
    if (!rawContent.trim()) continue;
    if (remainingAttachmentChars <= 0) {
      recordSource(sourceId, "attachment", rawContent, "", {
        omittedFromSections: ["attachments"],
        omissionReason: "attachment-source-limit"
      });
      continue;
    }
    const content = truncateText(rawContent, Math.min(MAX_ATTACHMENT_FILE_CHARS, remainingAttachmentChars));
    remainingAttachmentChars -= content.length;
    attachmentLines.push(`Attached file: ${name}${attachment?.path ? ` (${attachment.path})` : ""}\n${content}`);
    recordSource(sourceId, "attachment", content, "attachments");
  }
  if (attachmentLines.length) {
    mandatoryMessages.push({
      sectionId: "attachments",
      sourceId: "attachments:current-request",
      message: { role: "system", content: `Current request text attachments:\n\n${attachmentLines.join("\n\n")}` }
    });
  }

  if (state.intentContract) {
    const contractMessage = intentContract.buildContractInjectionMessage(state.intentContract, { maxChars: input.intentInjectedMaxChars });
    addMandatory("intent-contract", `intent-contract:${state.intentContractMeta?.promptFingerprint || fingerprint(stringify(state.intentContract))}`, "intent-contract", contractMessage);
  } else {
    requiredSourcesMissing.push("intent-contract");
  }

  const prompt = String(input.prompt ?? state.originalPrompt ?? "");
  const promptFingerprint = fingerprint(prompt);
  const allUserInstructions = collectUserInstructions(state);
  const userInstructions = allUserInstructions.filter((entry) => fingerprint(entry.text) !== promptFingerprint);
  allUserInstructions.filter((entry) => fingerprint(entry.text) === promptFingerprint).forEach((entry) => recordSource(entry.sourceId, "user-instruction", entry.text, "", {
    omittedFromSections: ["user-instructions"],
    omissionReason: "duplicate-authoritative-source"
  }));
  if (userInstructions.length) {
    const instructionContent = ["Authoritative user instructions received during this run:", ...userInstructions.map((entry) => `- ${entry.text}`)].join("\n");
    mandatoryMessages.push({ sectionId: "user-instructions", sourceId: "user-instructions:current-run", message: { role: "system", content: instructionContent } });
    userInstructions.forEach((entry) => recordSource(entry.sourceId, "user-instruction", entry.text, "user-instructions"));
  }

  const stateProjection = buildStateProjection(state);
  addMandatory("state", `agent-state:${Number(state.stateVersion) || 0}`, "agent-state", {
    role: "system",
    content: `Authoritative AgentState projection (raw prompt and verbatim user responses are intentionally excluded):\n${stateProjection}`
  });

  const currentUserMessage = createCurrentUserMessage(prompt, attachments);
  addMandatory("current-request", `user-request:${String(input.requestId || fingerprint(prompt))}`, "current-prompt", currentUserMessage);

  const mandatoryChars = mandatoryMessages.reduce((total, entry) => total + messageChars(entry.message), 0);
  let optionalRemaining = Math.max(0, maxChars - mandatoryChars);
  const supersedingPaths = new Map([...attachmentPaths].map((attachmentPath) => [attachmentPath, "superseded-by-current-attachment"]));
  if (activePath) supersedingPaths.set(activePath, "superseded-by-live-buffer");
  const observationCandidates = (Array.isArray(state.recentObservations) ? state.recentObservations : [])
    .map((observation) => createObservationCandidate(observation, input.artifactStore, supersedingPaths, sourceDecisions));
  const selectedObservations = [];
  let observationChars = 0;
  for (let index = observationCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = observationCandidates[index];
    const nextSize = candidate.text.length;
    if (observationChars + nextSize > MAX_OBSERVATION_CONTEXT_CHARS || nextSize > optionalRemaining) continue;
    selectedObservations.push(candidate);
    observationChars += nextSize;
    optionalRemaining -= nextSize;
  }
  selectedObservations.reverse();
  const selectedObservationIds = new Set(selectedObservations.map((candidate) => candidate.observation.observationId));
  for (const candidate of observationCandidates) {
    const rendered = selectedObservationIds.has(candidate.observation.observationId);
    recordSource(candidate.observation.observationId, "observation", candidate.text, rendered ? "observations" : "", {
      omittedFromSections: rendered ? [] : ["observations"],
      omissionReason: rendered ? "" : "optional-context-budget"
    });
  }

  const historyCandidates = (Array.isArray(input.conversationHistory) ? input.conversationHistory : []).map((message, index) => {
    const role = message?.role === "assistant" ? "assistant" : (message?.role === "user" ? "user" : "");
    const content = truncateText(message?.content, MAX_HISTORY_MESSAGE_CHARS).trim();
    const canonicalFingerprint = fingerprint(`${role}:${content}`);
    return role && content ? {
      role,
      content,
      canonicalFingerprint,
      sourceId: `history:${index}:${canonicalFingerprint}`,
      duplicatesCurrentPrompt: role === "user" && fingerprint(content) === promptFingerprint
    } : null;
  }).filter(Boolean).slice(-MAX_HISTORY_MESSAGES);
  const selectedHistory = [];
  const seenHistoryFingerprints = new Set();
  for (let index = historyCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = historyCandidates[index];
    candidate.duplicatesHistory = seenHistoryFingerprints.has(candidate.canonicalFingerprint);
    seenHistoryFingerprints.add(candidate.canonicalFingerprint);
    if (candidate.duplicatesCurrentPrompt || candidate.duplicatesHistory) continue;
    if (candidate.content.length > optionalRemaining) continue;
    selectedHistory.push(candidate);
    optionalRemaining -= candidate.content.length;
  }
  selectedHistory.reverse();
  const selectedHistoryIds = new Set(selectedHistory.map((entry) => entry.sourceId));
  historyCandidates.forEach((entry) => recordSource(entry.sourceId, "conversation-history", entry.content, selectedHistoryIds.has(entry.sourceId) ? "history" : "", {
    omittedFromSections: selectedHistoryIds.has(entry.sourceId) ? [] : ["history"],
    omissionReason: selectedHistoryIds.has(entry.sourceId) ? "" : ((entry.duplicatesCurrentPrompt || entry.duplicatesHistory) ? "duplicate-authoritative-source" : "optional-context-budget")
  }));

  const messages = [];
  const pushMandatorySection = (sectionId) => mandatoryMessages.filter((entry) => entry.sectionId === sectionId).forEach((entry) => messages.push(entry.message));
  pushMandatorySection("system");
  pushMandatorySection("active-file");
  pushMandatorySection("attachments");
  if (selectedHistory.length) {
    messages.push(...selectedHistory.map(({ role, content }) => ({ role, content })));
    messages.push({ role: "system", content: "The messages above are prior conversation context. Follow the current request and authoritative state below when they differ." });
  }
  pushMandatorySection("intent-contract");
  pushMandatorySection("user-instructions");
  pushMandatorySection("state");
  pushMandatorySection("current-request");
  if (selectedObservations.length) {
    messages.push({
      role: "user",
      content: `Normalized tool observations (authoritative environment context; not user-authored):\n${selectedObservations.map((candidate) => candidate.text).join("\n")}`
    });
  }

  const totalChars = messages.reduce((total, message) => total + messageChars(message), 0);
  const sectionOrder = ["system", "active-file", "attachments", "history", "intent-contract", "user-instructions", "state", "current-request", "observations"];
  for (const id of sectionOrder) {
    const sourceIds = sourceDecisions.filter((entry) => entry.renderedInSection === id).map((entry) => entry.sourceId);
    const chars = id === "history"
      ? selectedHistory.reduce((total, entry) => total + entry.content.length, 0)
      : (id === "observations" ? observationChars : mandatoryMessages.filter((entry) => entry.sectionId === id).reduce((total, entry) => total + messageChars(entry.message), 0));
    if (sourceIds.length || chars) sections.push({ id, mandatory: !["history", "observations"].includes(id), chars, sourceIds });
  }

  return {
    schemaVersion: 1,
    mode: "agent",
    stateVersion: Number(state.stateVersion) || 0,
    messages,
    manifest: {
      totalChars,
      estimatedTokens: Math.ceil(totalChars / 4),
      sections,
      sourceDecisions,
      includedObservationIds: selectedObservations.map((candidate) => candidate.observation.observationId),
      includedArtifactRefs: selectedObservations.filter((candidate) => candidate.excerptIncluded).map((candidate) => candidate.observation.artifactRef?.id).filter(Boolean),
      omittedCounts: {
        observations: observationCandidates.length - selectedObservations.length,
        history: historyCandidates.length - selectedHistory.length
      },
      requiredSourcesMissing: [...new Set(requiredSourcesMissing)],
      overBudget: totalChars > maxChars
    }
  };
}

module.exports = {
  DEFAULT_CONTEXT_MAX_CHARS,
  buildAgentContext,
  fingerprint,
  normalizePath
};
