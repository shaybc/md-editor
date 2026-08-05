/**
 * Deterministic Chat request routing and bounded workspace grounding.
 */

"use strict";

const CHAT_ROUTES = Object.freeze({
  DIRECT: "direct",
  GROUNDED: "grounded",
  COMPLEX: "complex"
});

const MAX_GROUNDING_READS = 2;
const MAX_GROUNDING_LINES = 160;
const MAX_GROUNDING_CHARS = 16000;
const MAX_LOCATOR_RESULTS = 8;
const PROJECT_MANIFEST_NAMES = new Set(["package.json", "pom.xml", "pyproject.toml", "cargo.toml", "build.gradle", "build.gradle.kts"]);

const GREETING_PROMPT = /^\s*(?:hello|hi|hey|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you)[!,.\s]*$/i;
const DIAGNOSTIC_PROMPT = /\b(?:bug|broken|crash(?:es|ed)?|error|exception|fail(?:s|ed|ing|ure)?|stack\s*trace|traceback|why\s+(?:is|does|did|won't|isn't))\b/i;
const INVESTIGATION_PROMPT = /\b(?:analy[sz]e|audit|investigate|review|trace|across\s+(?:the\s+)?(?:project|workspace|repository|repo)|all\s+files|entire\s+(?:project|workspace|repository|repo))\b/i;
const WORKSPACE_REFERENCE = /\b(?:active\s+(?:document|file|tab)|codebase|config(?:uration)?|current\s+(?:document|file|tab)|document|file|folder|manifest|package|project|readme|repo(?:sitory)?|source|workspace)\b/i;
const WORKSPACE_CHANGE = /\b(?:add|change|create|delete|edit|fix|implement|install|merge|migrate|move|refactor|remove|rename|replace|split|update)\b/i;
const ACTIVE_DOCUMENT_REFERENCE = /\b(?:active|current|open)\s+(?:document|file|tab)\b/i;
const PROJECT_VERSION_PROMPT = /\b(?:project|package|application|app|module)?\s*version\b|\bwhat\s+version\s+is\s+(?:this|the)\s+(?:project|package|application|app)\b/i;
const CONFIGURATION_PROMPT = /\b(?:config(?:uration|ure|ured)?|setting|settings)\b/i;
const PROVIDED_TEXT_TRANSFORMATION = /\b(?:proofread|rewrite|shorten|summari[sz]e|translate)\b/i;
const HISTORY_REFERENCE = /\b(?:that|those|it|its|this|same|the\s+previous\s+(?:answer|value|result))\b/i;
const MULTI_TARGET_PROMPT = /\b(?:compare|contrast)\b|\bbetween\b.+\band\b/i;
const GENERIC_EXPLANATION_PROMPT = /^\s*(?:explain|what\s+(?:is|are))\b/i;

function normalizePrompt(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeWorkspacePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractNamedFiles(prompt) {
  const matches = String(prompt || "").match(/\b(?:[\w@.-]+[\\/])*[\w@.-]+\.[A-Za-z0-9]{1,10}\b/g) || [];
  const namedDocuments = String(prompt || "").match(/\bREADME\b/gi) || [];
  return unique([
    ...matches.map(normalizeWorkspacePath).filter((match) => !/^\d+(?:\.\d+)+$/.test(match)),
    ...namedDocuments.map(() => "README.md")
  ]);
}

function extractSymbolTarget(prompt) {
  const text = String(prompt || "");
  const patterns = [
    /\bwhere\s+is\s+([A-Za-z_$][\w$]*)\s+(?:defined|declared|implemented)\b/i,
    /\bwhat\s+value\s+does\s+([A-Za-z_$][\w$]*)\s+have\b/i,
    /\bexplain\s+(?:the\s+)?([A-Za-z_$][\w$]*)\s+(?:function|method|class|constant|variable)\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function hasConversationHistory(request) {
  return Array.isArray(request?.conversationHistory) && request.conversationHistory.some((message) => String(message?.content || "").trim());
}

function isProvidedTextTransformation(prompt) {
  if (!PROVIDED_TEXT_TRANSFORMATION.test(prompt)) return false;
  return /["'`][\s\S]+["'`]/.test(prompt) || /:\s*\S/.test(prompt);
}

function hasCodeIdentifier(prompt) {
  return /\b[a-z]+(?:[A-Z][A-Za-z0-9]*)+\b/.test(prompt)
    || /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/i.test(prompt)
    || /\b[A-Za-z_$][\w$]*\s+(?:class|constant|function|method|variable)\b/i.test(prompt);
}

function createGroundedDecision(reasonCode, groundingKind, target = "") {
  return { route: CHAT_ROUTES.GROUNDED, reasonCode, grounding: { kind: groundingKind, target } };
}

/**
 * Classify one Chat request without invoking a model or reading workspace state.
 * @param {object} request - Chat request data already supplied to Chat mode.
 * @returns {{ route: string, reasonCode: string, grounding?: { kind: string, target: string } }} A typed route decision.
 */
function classifyChatRequest(request = {}) {
  const prompt = normalizePrompt(request.prompt);
  const attachments = Array.isArray(request.attachments) ? request.attachments.filter(Boolean) : [];
  if (!prompt) return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-empty-request" };
  if (attachments.length) return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-attachment" };
  if (["edited-rerun", "resume"].includes(request.executionKind) || request.resumeIntentContext) {
    return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-resume-or-rerun" };
  }
  if (prompt.length > 1200) return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-long-request" };
  const namedFiles = extractNamedFiles(prompt);
  const isGenericExplanation = GENERIC_EXPLANATION_PROMPT.test(prompt) && !WORKSPACE_REFERENCE.test(prompt) && !namedFiles.length;
  if ((DIAGNOSTIC_PROMPT.test(prompt) || INVESTIGATION_PROMPT.test(prompt)) && !isGenericExplanation) {
    return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-investigation" };
  }

  if (namedFiles.length > 1 || MULTI_TARGET_PROMPT.test(prompt)) {
    return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-multiple-targets" };
  }
  if (WORKSPACE_CHANGE.test(prompt) && (WORKSPACE_REFERENCE.test(prompt) || namedFiles.length || hasCodeIdentifier(prompt))) {
    return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-workspace-change" };
  }
  if (GREETING_PROMPT.test(prompt)) return { route: CHAT_ROUTES.DIRECT, reasonCode: "direct-greeting" };
  if (isProvidedTextTransformation(prompt) && !WORKSPACE_REFERENCE.test(prompt)) {
    return { route: CHAT_ROUTES.DIRECT, reasonCode: "direct-provided-text" };
  }
  if (ACTIVE_DOCUMENT_REFERENCE.test(prompt)) return createGroundedDecision("grounded-active-document", "active-document");
  if (namedFiles.length === 1) return createGroundedDecision("grounded-explicit-file", "explicit-file", namedFiles[0]);
  if (PROJECT_VERSION_PROMPT.test(prompt)) return createGroundedDecision("grounded-project-version", "project-version");

  const symbol = extractSymbolTarget(prompt);
  if (symbol) return createGroundedDecision("grounded-symbol", "symbol", symbol);
  if (CONFIGURATION_PROMPT.test(prompt) || /\bhost\s+and\s+port\b/i.test(prompt)) {
    return createGroundedDecision("grounded-configuration", "configuration", /\bhost\b/i.test(prompt) ? "host" : "config");
  }
  if (HISTORY_REFERENCE.test(prompt) && hasConversationHistory(request) && !WORKSPACE_REFERENCE.test(prompt)) {
    return { route: CHAT_ROUTES.DIRECT, reasonCode: "direct-history-follow-up" };
  }
  if (WORKSPACE_REFERENCE.test(prompt)) return { route: CHAT_ROUTES.COMPLEX, reasonCode: "complex-uncertain-workspace-request" };
  return { route: CHAT_ROUTES.DIRECT, reasonCode: "direct-conversation" };
}

function createActivityId(tool, index) {
  return `chat-grounding-${tool}-${index}-${Date.now()}`;
}

async function runObservedTool(emit, tool, input, index, operation) {
  const activityId = createActivityId(tool, index);
  emit({ type: "tool", tool, input, summary: "running", activityId });
  try {
    const result = await operation();
    const count = Array.isArray(result) ? result.length : 1;
    emit({ type: "tool", tool, input, summary: `${count} result${count === 1 ? "" : "s"}`, result, activityId });
    return { ok: true, result };
  } catch (error) {
    emit({ type: "tool-error", tool, input, error: error?.message || String(error), activityId });
    return { ok: false, error };
  }
}

function selectUniqueManifest(files) {
  const manifests = unique((files || []).filter((file) => PROJECT_MANIFEST_NAMES.has(String(file).split("/").at(-1).toLowerCase())));
  const rootManifests = manifests.filter((file) => !String(file).includes("/"));
  if (rootManifests.length === 1) return rootManifests[0];
  if (rootManifests.length > 1 || manifests.length !== 1) return "";
  return manifests[0];
}

function calculateEndLine(content, startLine) {
  const lineCount = String(content || "").split("\n").length;
  return Math.min(startLine + Math.max(0, lineCount - 1), startLine + MAX_GROUNDING_LINES - 1);
}

function normalizeEvidence(sourceType, slice, remainingChars) {
  const content = String(slice?.content || "").slice(0, Math.max(0, remainingChars));
  const startLine = Math.max(1, Number(slice?.startLine || 1));
  return {
    sourceType,
    path: normalizeWorkspacePath(slice?.path),
    startLine,
    endLine: Number(slice?.endLine || calculateEndLine(content, startLine)),
    content
  };
}

async function readGroundingEvidence(runtime, request, emit, path, sourceType, startLine = 1, readIndex = 1) {
  const observed = await runObservedTool(emit, "read_file", path, readIndex, () => runtime.tools.readFile(request.workspaceRoot, path, {
    startLine,
    endLine: startLine + MAX_GROUNDING_LINES - 1,
    signal: request.signal
  }));
  if (!observed.ok) return { ok: false, reasonCode: "grounding-read-failed" };
  const evidence = normalizeEvidence(sourceType, observed.result, MAX_GROUNDING_CHARS);
  return evidence.content.trim()
    ? { ok: true, evidence: [evidence] }
    : { ok: false, reasonCode: "grounding-empty-evidence" };
}

async function locateExplicitFile(runtime, request, emit, target) {
  const normalizedTarget = normalizeWorkspacePath(target);
  const pattern = normalizedTarget.includes("/") ? normalizedTarget : `**/${normalizedTarget}`;
  const observed = await runObservedTool(emit, "glob", pattern, 1, () => runtime.tools.globFiles(request.workspaceRoot, pattern, {
    maxFiles: MAX_LOCATOR_RESULTS,
    signal: request.signal
  }));
  if (!observed.ok) return { ok: false, reasonCode: "grounding-locator-failed" };
  const matches = unique(observed.result || []);
  if (matches.length !== 1) return { ok: false, reasonCode: matches.length ? "grounding-ambiguous-evidence" : "grounding-target-not-found" };
  return readGroundingEvidence(runtime, request, emit, matches[0], "workspace-file");
}

async function locateProjectVersion(runtime, request, emit) {
  const pattern = "**/*";
  const observed = await runObservedTool(emit, "glob", pattern, 1, () => runtime.tools.globFiles(request.workspaceRoot, pattern, {
    maxFiles: 2000,
    signal: request.signal
  }));
  if (!observed.ok) return { ok: false, reasonCode: "grounding-locator-failed" };
  const manifest = selectUniqueManifest(observed.result);
  if (!manifest) return { ok: false, reasonCode: "grounding-ambiguous-evidence" };
  const result = await readGroundingEvidence(runtime, request, emit, manifest, "project-manifest");
  if (!result.ok) return result;
  return /version/i.test(result.evidence[0].content)
    ? result
    : { ok: false, reasonCode: "grounding-insufficient-evidence" };
}

async function locateSearchTarget(runtime, request, emit, target, sourceType) {
  const observed = await runObservedTool(emit, "search_text", target, 1, () => runtime.tools.searchGrep(request.workspaceRoot, target, {
    maxMatches: MAX_LOCATOR_RESULTS,
    signal: request.signal
  }));
  if (!observed.ok) return { ok: false, reasonCode: "grounding-locator-failed" };
  const matches = Array.isArray(observed.result) ? observed.result.filter((match) => match?.path) : [];
  const paths = unique(matches.map((match) => normalizeWorkspacePath(match.path)));
  if (paths.length !== 1) return { ok: false, reasonCode: paths.length ? "grounding-ambiguous-evidence" : "grounding-target-not-found" };
  const firstMatch = matches.find((match) => normalizeWorkspacePath(match.path) === paths[0]);
  const startLine = Math.max(1, Number(firstMatch?.line || 1) - 40);
  const result = await readGroundingEvidence(runtime, request, emit, paths[0], sourceType, startLine);
  if (!result.ok) return result;
  return result.evidence[0].content.toLowerCase().includes(String(target).toLowerCase())
    ? result
    : { ok: false, reasonCode: "grounding-insufficient-evidence" };
}

function groundActiveDocument(request, emit) {
  const activeFile = request.activeFile;
  if (!activeFile?.path || typeof activeFile.content !== "string" || !activeFile.content.trim()) {
    return { ok: false, reasonCode: "grounding-active-document-unavailable" };
  }
  const activityId = createActivityId("read_active_document", 1);
  emit({ type: "tool", tool: "read_active_document", input: activeFile.path, summary: "running", activityId });
  const rawLines = activeFile.content.replace(/\r\n?/g, "\n").split("\n").slice(0, MAX_GROUNDING_LINES);
  const content = rawLines.map((line, index) => `${index + 1}: ${line}`).join("\n").slice(0, MAX_GROUNDING_CHARS);
  const evidence = { sourceType: "active-document", path: normalizeWorkspacePath(activeFile.path), startLine: 1, endLine: rawLines.length, content };
  emit({ type: "tool", tool: "read_active_document", input: activeFile.path, summary: "1 result", result: evidence, activityId });
  return { ok: true, evidence: [evidence] };
}

/**
 * Gather a small, deterministic evidence set for a grounded Chat decision.
 * @param {object} runtime - AI Companion runtime exposing read-only workspace tools.
 * @param {object} request - Current Chat request.
 * @param {object} decision - Grounded decision returned by classifyChatRequest.
 * @param {(event: object) => void} emit - Existing AI Companion event sink.
 * @returns {Promise<{ ok: boolean, evidence?: Array<object>, reasonCode?: string }>} Evidence or an escalation reason.
 */
async function gatherGroundedEvidence(runtime, request, decision, emit) {
  runtime.throwIfAborted(request.signal);
  if (!request.workspaceRoot && decision.grounding?.kind !== "active-document") {
    return { ok: false, reasonCode: "grounding-workspace-unavailable" };
  }
  switch (decision.grounding?.kind) {
    case "active-document": return groundActiveDocument(request, emit);
    case "explicit-file": return locateExplicitFile(runtime, request, emit, decision.grounding.target);
    case "project-version": return locateProjectVersion(runtime, request, emit);
    case "configuration": return locateSearchTarget(runtime, request, emit, decision.grounding.target || "config", "workspace-configuration");
    case "symbol": return locateSearchTarget(runtime, request, emit, decision.grounding.target, "workspace-symbol");
    default: return { ok: false, reasonCode: "grounding-plan-unavailable" };
  }
}

/**
 * Build the authoritative context message consumed by the one-shot grounded answer.
 * @param {Array<object>} evidence - Normalized evidence returned by gatherGroundedEvidence.
 * @returns {{ role: "system", content: string }} A bounded system context message.
 */
function buildGroundedContextMessage(evidence) {
  const sections = (evidence || []).slice(0, MAX_GROUNDING_READS).map((entry) => [
    `Evidence source: ${entry.sourceType}`,
    `File: ${entry.path}`,
    `Lines: ${entry.startLine}-${entry.endLine}`,
    entry.content
  ].join("\n"));
  return {
    role: "system",
    content: [
      "The conversational router gathered the following read-only workspace evidence deterministically.",
      "Treat it as the only workspace evidence available for this answer. Do not invent unobserved files, values, or behavior.",
      ...sections
    ].join("\n\n").slice(0, MAX_GROUNDING_CHARS + 1200)
  };
}

module.exports = {
  CHAT_ROUTES,
  buildGroundedContextMessage,
  classifyChatRequest,
  gatherGroundedEvidence
};
