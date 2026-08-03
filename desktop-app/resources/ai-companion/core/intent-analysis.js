/**
 * Intent-analysis stage: turns a request into an intent contract before workspace
 * discovery. Owns the forced capture_intent_contract extraction call, the one-shot
 * repair/fallback policy, and the Chat-only fast-path gate that skips extraction for
 * trivial read-only prompts.
 *
 * This module performs provider calls but no workspace mutation and no UI side effects.
 * The tool loop orchestrates concurrency (running extraction alongside the discovery
 * seed) and injection; this module only produces a contract.
 */

"use strict";

const {
  INTENT_CONTRACT_SCHEMA_VERSION,
  TASK_TYPES,
  RELATIONSHIP_VALUES,
  PROVENANCE_VALUES,
  TARGET_KINDS_BY_GROUP,
  normalizePromptText,
  normalizeIntentContract,
  validateIntentContract,
  createRawFallbackContract,
  CRITERION_SHAPES
} = require("./intent-contract");
const { isRelationshipOnly, validateRawIntentContract } = require("./intent-contract-raw-validation");
const { UNCERTAIN_CONTRACT_MODES, buildUncertainContract, mergeIntentContracts } = require("./intent-relationship");

const { collectCanonicalFieldRefs } = require("./intent-field-references");
/**
 * The internal forced function used to capture a structured intent contract. Its
 * arguments are the contract fields; the harness validates and consumes them. It is
 * never added to the normal Agent tool inventory.
 */
const taggedValueSchema = (valueKey) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    [valueKey]: { type: "string" },
    provenance: { type: "string", enum: [...PROVENANCE_VALUES] }
  },
  required: [valueKey, "provenance"]
});

const namedTargetSchema = (kinds) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    value: { type: "string" },
    kind: { type: "string", enum: [...kinds] }
  },
  required: ["value", "kind"]
});

const CAPTURE_INTENT_CONTRACT_TOOL = Object.freeze({
  type: "function",
  function: {
    name: "capture_intent_contract",
    description: "Capture the structured intent contract for the current request. Call exactly once.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        taskType: { type: "string", enum: [...TASK_TYPES] },
        relationshipToPrior: { type: "string", enum: [...RELATIONSHIP_VALUES] },
        goal: taggedValueSchema("value"),
        expectedOutcome: taggedValueSchema("value"),
        requestedActions: { type: "array", items: taggedValueSchema("value") },
        prohibitedActions: { type: "array", items: taggedValueSchema("value") },
        outOfScope: { type: "array", items: taggedValueSchema("value") },
        acceptanceCriteria: {
          type: "array",
          minItems: 1,
          items: {
            ...taggedValueSchema("statement"),
            properties: {
              ...taggedValueSchema("statement").properties,
              shape: { type: "string", enum: [...CRITERION_SHAPES] },
              sourceSpan: { type: "string", description: "Verbatim words from the user prompt or the referenced document that this criterion traces to. Required for explicit criteria." },
              mustInspect: { type: "array", items: { type: "string" }, description: "Files, globs, or named artifacts (especially source code) the verifier must have read to judge this criterion. Required for conformance/diagnostic inspection and comparison shapes." },
              evidenceRequired: { type: "string", description: "What counts as proof: the content-level observation and where it must be cited from. Never tool-family success alone." }
            },
            required: ["statement", "shape", "provenance"]
          }
        },
        namedTargets: {
          type: "object",
          additionalProperties: false,
          properties: Object.fromEntries(Object.entries(TARGET_KINDS_BY_GROUP).map(([group, kinds]) => [
            group,
            { type: "array", items: namedTargetSchema(kinds) }
          ])),
          required: Object.keys(TARGET_KINDS_BY_GROUP)
        },
        assumptions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              statement: { type: "string" },
              kind: { type: "string", enum: ["locational", "behavioral", "environmental", "policy"] },
              risk: { type: "string", enum: ["low", "medium", "high"] },
              provenance: { type: "string", enum: [...PROVENANCE_VALUES] },
              relatedTargets: { type: "array", items: { type: "string" } },
              keywords: { type: "array", items: { type: "string" } }
            },
            required: ["statement", "kind", "risk", "provenance", "relatedTargets", "keywords"]
          }
        },
        unresolvedDecisions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              blocking: { type: "boolean" },
              controlsMutation: { type: "boolean" },
              controlledCapabilities: { type: "array", items: { type: "string" } },
              controlledTargets: { type: "array", items: { type: "string" } }
            },
            required: ["description", "blocking", "controlsMutation", "controlledCapabilities", "controlledTargets"]
          }
        },
        ambiguities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              reason: { type: "string" },
              impact: { type: "string", enum: ["low", "medium", "high"] },
              blocking: { type: "boolean" },
              safetyOrScopeCritical: { type: "boolean" },
              suggestedAnswers: { type: "array", items: { type: "string" } }
            },
            required: ["question", "reason", "impact", "blocking", "safetyOrScopeCritical", "suggestedAnswers"]
          }
        },
        relationshipEvidence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              quote: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["quote", "explanation"]
          }
        },
        carriedFieldRefs: { type: "array", items: { type: "string" }, description: "Canonical prior-contract fields deliberately retained by continues or extends." },
        correctedFieldRefs: { type: "array", items: { type: "string" }, description: "Canonical field references changed when relationshipToPrior is corrects." }
      },
      required: [
        "taskType", "relationshipToPrior", "goal", "expectedOutcome", "requestedActions",
        "prohibitedActions", "outOfScope", "acceptanceCriteria", "namedTargets", "assumptions",
        "unresolvedDecisions", "ambiguities", "relationshipEvidence", "carriedFieldRefs", "correctedFieldRefs"
      ]
    }
  }
});

const CAPTURE_REDUCED_INTENT_CONTRACT_TOOL = Object.freeze({
  type: "function",
  function: {
    name: "capture_intent_contract",
    description: "Capture a reduced, falsifiable intent contract when the full schema could not be produced. Call exactly once.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["taskType", "goal", "acceptanceCriterion"],
      properties: {
        taskType: { type: "string", enum: [...TASK_TYPES] },
        goal: { type: "string" },
        acceptanceCriterion: { type: "string" },
        criterionShape: { type: "string", enum: [...CRITERION_SHAPES], description: "Shape of the single criterion (see full schema)." }
      }
    }
  }
});

/** Build a request-scoped capture schema constrained to the actual prior contract. */
function createCaptureIntentContractTool(priorContract, options = {}) {
  const tool = JSON.parse(JSON.stringify(CAPTURE_INTENT_CONTRACT_TOOL));
  const allowed = collectCanonicalFieldRefs(priorContract);
  const carried = tool.function.parameters.properties.carriedFieldRefs;
  const corrected = tool.function.parameters.properties.correctedFieldRefs;
  if (allowed.length) {
    carried.items.enum = allowed;
    corrected.items.enum = allowed;
  } else {
    carried.maxItems = 0;
    corrected.maxItems = 0;
  }
  if (options.relationship === "corrects") {
    carried.maxItems = 0;
    corrected.minItems = 1;
  }
  return tool;
}

/** Change/action verbs that disqualify a prompt from the Chat fast path. */
const CHANGE_VERBS = /\b(add|change|edit|fix|implement|refactor|rename|delete|create|update|remove|write|replace|generate|build|install|migrate|convert|move|split|merge)\b/i;
/** Diagnostic/error language that implies non-trivial work. */
const DIAGNOSTIC_LANGUAGE = /\b(error|errors|exception|stack ?trace|traceback|fail|fails|failing|broken|bug|crash|crashes|throws?)\b/i;
/** Explicit constraint/prohibition language. */
const CONSTRAINT_LANGUAGE = /\b(must|only|do not|don'?t|without|never|always|ensure|require[ds]?)\b/i;
/** Cross-turn referential phrases implying accumulated context. */
const REFERENTIAL_LANGUAGE = /\b(also|instead|continue|as before|keep|still|again|that change|the change|previous)\b/i;

/**
 * Decide whether a Chat prompt may bypass extraction to a fast-path contract. All
 * signals must clear: no attachments, no change verbs, no diagnostic/error language, no
 * explicit constraints, no cross-turn referential phrase, and below the length cap.
 *
 * @param {string} prompt - Raw user prompt.
 * @param {object} settings - Normalized AI Companion settings.
 * @param {{ hasAttachments?: boolean }} [options] - Extra pre-call signals.
 * @returns {boolean} True when the fast path applies.
 */
function shouldUseChatFastPath(prompt, settings, options = {}) {
  if (!settings || settings.intentFastPathEnabled === false) return false;
  if (options.hasAttachments) return false;
  const text = normalizePromptText(prompt);
  if (!text) return false;
  if (text.length > (settings.intentFastPathMaxPromptChars || 0)) return false;
  return !(CHANGE_VERBS.test(text) || DIAGNOSTIC_LANGUAGE.test(text) || CONSTRAINT_LANGUAGE.test(text) || REFERENTIAL_LANGUAGE.test(text));
}

/**
 * Build the compact extraction envelope. Only intent-relevant context is included --
 * never a directory listing, search results, or inferred repository facts.
 *
 * @param {string} prompt - Raw user prompt.
 * @param {string} mode - Request mode.
 * @param {object} [activeFile] - Active editor file context.
 * @param {Array} [attachments] - Attachment descriptors.
 * @returns {string} The envelope text for the extraction user message.
 */
function buildExtractionEnvelope(prompt, mode, activeFile, attachments, priorContract, priorTurns, resumeIntentContext) {
  const lines = [`Mode: ${mode}`, "", "Request:", String(prompt == null ? "" : prompt)];
  if (activeFile && activeFile.path) {
    lines.push("", `Active file: ${activeFile.path}${activeFile.tabType ? ` (${activeFile.tabType})` : ""}`);
    const selection = activeFile.selection?.text || activeFile.selectedText || activeFile.selectionText || "";
    if (selection) lines.push(`Active selection: ${String(selection).slice(0, 1200)}`);
  }
  const attachmentSummary = (Array.isArray(attachments) ? attachments : []).map((attachment) => {
    if (!attachment) return "";
    const name = attachment.name || "attachment";
    const type = attachment.type || attachment.mimeType || "unknown type";
    const excerpt = attachment.excerpt || attachment.text || "";
    return `${name} (${type})${excerpt ? `: ${String(excerpt).slice(0, 500)}` : ""}`;
  }).filter(Boolean);
  if (attachmentSummary.length) lines.push("", "Attachments:", ...attachmentSummary);
  if (priorContract) lines.push("", "Prior intent contract:", JSON.stringify(priorContract).slice(0, 7000));
  const turns = (Array.isArray(priorTurns) ? priorTurns : []).slice(-4).map((turn) => ({
    role: turn?.role,
    content: String(turn?.content || "").slice(0, 1000)
  })).filter((turn) => turn.role && turn.content);
  if (turns.length) lines.push("", "Minimal prior turns:", JSON.stringify(turns));
  if (resumeIntentContext && typeof resumeIntentContext === "object") {
    lines.push("", "Persisted clarification context from the interrupted request (authoritative user answers):", JSON.stringify(resumeIntentContext).slice(0, 5000));
  }
  return lines.join("\n");
}

/**
 * Safely parse capture_intent_contract arguments, which arrive as a JSON string.
 *
 * @param {string|object} value - Raw arguments.
 * @returns {object} Parsed contract arguments.
 * @throws A bounded, coded error when the arguments are malformed JSON.
 */
function parseContractArguments(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || "{}"));
  } catch (_error) {
    const error = new Error("capture_intent_contract arguments were not valid JSON.");
    error.code = "malformed-function-arguments";
    throw error;
  }
}

/**
 * Issue one forced capture_intent_contract call and return the raw contract payload.
 *
 * @param {object} provider - Provider exposing completeMessage.
 * @param {Array} messages - Extraction messages.
 * @param {object} settings - Normalized settings (for maxTokens).
 * @param {AbortSignal} [signal] - Abort signal for the extraction deadline.
 * @returns {Promise<object>} The parsed contract payload.
 * @throws If the model does not call capture_intent_contract.
 */
async function callCaptureIntentContract(provider, messages, settings, signal, captureTool = CAPTURE_INTENT_CONTRACT_TOOL) {
  const message = await provider.completeMessage(messages, {
    temperature: 0,
    maxTokens: settings.intentMaxOutputTokens,
    signal,
    tools: [captureTool],
    toolChoice: { type: "function", function: { name: "capture_intent_contract" } }
  });
  const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const call = toolCalls.find((entry) => (entry.function?.name || entry.name) === "capture_intent_contract") || toolCalls[0];
  if (!call) {
    const error = new Error("capture_intent_contract was not called.");
    error.code = "missing-forced-tool-call";
    throw error;
  }
  return parseContractArguments(call.function?.arguments || call.arguments || "{}");
}

function validateCapturedContract(raw, priorContract, currentPrompt, options = {}) {
  let validation = validateRawIntentContract(raw, { hasPriorContract: !!priorContract, priorContract, currentPrompt });
  if (!validation.valid) return { contract: null, validation, stage: "raw-validation" };
  const contract = normalizeIntentContract(raw);
  validation = validateIntentContract(contract, options);
  return { contract: validation.valid ? contract : null, validation, stage: validation.valid ? "valid" : "normalized-validation" };
}

function containsUnvalidatedCarriedProvenance(raw) {
  const values = [
    raw?.goal,
    raw?.expectedOutcome,
    ...(Array.isArray(raw?.requestedActions) ? raw.requestedActions : []),
    ...(Array.isArray(raw?.prohibitedActions) ? raw.prohibitedActions : []),
    ...(Array.isArray(raw?.outOfScope) ? raw.outOfScope : []),
    ...(Array.isArray(raw?.acceptanceCriteria) ? raw.acceptanceCriteria : []),
    ...(Array.isArray(raw?.assumptions) ? raw.assumptions : []),
    ...(Array.isArray(raw?.unresolvedDecisions) ? raw.unresolvedDecisions : []),
    ...["files", "symbols", "errors", "uiAreas"].flatMap((group) => (
      Array.isArray(raw?.namedTargets?.[group]) ? raw.namedTargets[group] : []
    ))
  ];
  return values.some((entry) => entry?.provenance === "carried");
}

/** Preserve a semantically valid current request after only its relationship protocol failed. */
function salvageRelationshipContract(raw, priorContract, currentPrompt, errors) {
  if (!isRelationshipOnly(errors) || containsUnvalidatedCarriedProvenance(raw)) return null;
  const semanticRaw = {
    ...raw,
    relationshipToPrior: "independent",
    relationshipEvidence: [],
    carriedFieldRefs: [],
    correctedFieldRefs: [],
    supersededCriteria: []
  };
  const candidate = validateCapturedContract(semanticRaw, priorContract, currentPrompt);
  if (!candidate.validation.valid) return null;
  const current = normalizeIntentContract({
    ...candidate.contract,
    source: "extracted-relationship-degraded",
    verifiability: "verified",
    relationshipDegraded: true,
    relationshipResolutionSource: "harness-degraded"
  });
  return priorContract
    ? buildUncertainContract({ prior: priorContract, current, mode: UNCERTAIN_CONTRACT_MODES.CURRENT_AUTHORITATIVE })
    : current;
}

function normalizeReducedContract(raw) {
  const taskType = TASK_TYPES.includes(raw?.taskType) ? raw.taskType : "";
  const goal = String(raw?.goal || "").trim();
  const criterion = String(raw?.acceptanceCriterion || "").trim();
  if (!taskType || !goal || !criterion) return null;
  const shape = CRITERION_SHAPES.includes(raw?.criterionShape) ? raw.criterionShape : "";
  return normalizeIntentContract({
    source: "extracted-reduced",
    verifiability: "provisional",
    relationshipToPrior: "independent",
    taskType,
    goal: { value: goal, provenance: "inferred" },
    expectedOutcome: { value: criterion, provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", shape, statement: criterion, provenance: "inferred" }]
  });
}

function createExtractionDiagnostic(attempt, stage, errorCodes, allowedFieldRefs) {
  return {
    attempt,
    stage: String(stage || "provider-failure").slice(0, 80),
    errorCodes: [...new Set((Array.isArray(errorCodes) ? errorCodes : [errorCodes]).map((code) => String(code || "unknown-error").slice(0, 120)))],
    ...(allowedFieldRefs ? { allowedFieldRefs: allowedFieldRefs.slice(0, 80) } : {})
  };
}

/**
 * Build a raw-prompt fallback result.
 *
 * @param {string} prompt - Raw user prompt.
 * @param {string} reason - Fallback reason for auditing.
 * @returns {{ contract: object, source: string, validation: object }} Fallback result.
 */
function fallbackResult(prompt, reason, attempts = []) {
  const diagnostics = {
    schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION,
    attempts: attempts.slice(-3)
  };
  const errors = diagnostics.attempts.flatMap((attempt) => attempt.errorCodes);
  return {
    contract: createRawFallbackContract(prompt, { reason }),
    source: "raw-prompt-fallback",
    validation: { valid: false, errors: [...new Set(["fallback", ...errors])] },
    diagnostics
  };
}

/**
 * Extract a validated intent contract for a request. Chat falls back immediately on
 * invalid extraction; Agent and Plan get one repair attempt before falling back. Any
 * provider error or abort resolves to a raw-prompt fallback rather than throwing.
 *
 * @param {object} params - Extraction inputs.
 * @param {object} params.provider - Provider exposing completeMessage.
 * @param {object} params.settings - Normalized settings.
 * @param {object} params.prompts - Loaded prompt strings (uses intentExtractionSystem).
 * @param {string} params.prompt - Raw user prompt.
 * @param {string} params.mode - Request mode.
 * @param {object} [params.activeFile] - Active editor context.
 * @param {Array} [params.attachments] - Attachment descriptors.
 * @param {AbortSignal} [params.signal] - Extraction-deadline signal.
 * @returns {Promise<{ contract: object, source: string, validation: object }>} The result.
 */
async function extractContract(params) {
  const { provider, settings, prompts, prompt, mode, activeFile, attachments, priorContract, priorTurns, resumeIntentContext, signal } = params;
  const system = (prompts && prompts.intentExtractionSystem) || "";
  const envelope = buildExtractionEnvelope(prompt, mode, activeFile, attachments, priorContract, priorTurns, resumeIntentContext);
  const captureTool = createCaptureIntentContractTool(priorContract);
  const baseMessages = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        "Analyze the current request envelope and capture its intent contract. Do not use repository knowledge or solve the task.",
        "Harness coverage rule: scan the current user message for every explicitly named file, symbol, error, guide, page, section, panel, settings area, tab, or other UI area and preserve each reference in the corresponding namedTargets collection.",
        "A specific guide, page, section, panel, settings area, tab, or UI area must appear in namedTargets.uiAreas even when a related file or folder target is also present; do not broaden, collapse, or omit it.",
        envelope
      ].join("\n\n")
    }
  ];
  const diagnostics = [];
  const reducedOrFallback = async (reason) => {
    if (signal?.aborted) return fallbackResult(prompt, reason, diagnostics);
    const reducedMessages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "The full intent contract could not be validated. Capture only the task type, one concrete goal, and one observable acceptance criterion.",
          "The criterion must describe a result that evidence can prove or disprove; do not use phrases such as satisfying the request.",
          "Do not solve the task. Call capture_intent_contract exactly once.",
          envelope
        ].join("\n\n")
      }
    ];
    try {
      const reducedRaw = await callCaptureIntentContract(provider, reducedMessages, settings, signal, CAPTURE_REDUCED_INTENT_CONTRACT_TOOL);
      const reduced = normalizeReducedContract(reducedRaw);
      if (reduced && validateIntentContract(reduced).valid) {
        return {
          contract: reduced,
          source: "extracted-reduced",
          validation: { valid: true, errors: [] },
          diagnostics: { schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION, attempts: diagnostics.slice(-3) }
        };
      }
      diagnostics.push(createExtractionDiagnostic(3, "reduced-validation", "invalid-reduced-contract"));
    } catch (error) {
      const stage = signal?.aborted ? "deadline" : (error?.code || "reduced-provider-failure");
      diagnostics.push(createExtractionDiagnostic(3, stage, stage));
    }
    return fallbackResult(prompt, reason, diagnostics);
  };
  let raw;
  try {
    raw = await callCaptureIntentContract(provider, baseMessages, settings, signal, captureTool);
  } catch (error) {
    const stage = signal?.aborted ? "deadline" : (error?.code || "provider-failure");
    diagnostics.push(createExtractionDiagnostic(1, stage, stage));
    return signal?.aborted
      ? fallbackResult(prompt, "extraction-timeout", diagnostics)
      : reducedOrFallback("extraction-error");
  }

  let candidate = validateCapturedContract(raw, priorContract, prompt);
  if (candidate.validation.valid) {
    return { contract: mergeIntentContracts(priorContract, candidate.contract), source: "extracted", validation: candidate.validation };
  }
  diagnostics.push(createExtractionDiagnostic(1, candidate.stage, candidate.validation.errors));

  const repairMessages = baseMessages.concat([
    {
      role: "user",
      content: [
        `The previous contract failed ${candidate.stage} with these error codes: ${candidate.validation.errors.join(", ")}.`,
        "Return a complete replacement object, not a patch. Include every required collection, using empty arrays when needed.",
        `Allowed canonical prior-field references: ${collectCanonicalFieldRefs(priorContract).join(", ") || "none"}.`,
        "For corrects, correctedFieldRefs must identify changed fields and carriedFieldRefs must be empty.",
        "Call capture_intent_contract exactly once."
      ].join(" ")
    }
  ]);
  try {
    raw = await callCaptureIntentContract(provider, repairMessages, settings, signal, captureTool);
  } catch (error) {
    const stage = signal?.aborted ? "deadline" : (error?.code || "repair-provider-failure");
    diagnostics.push(createExtractionDiagnostic(2, stage, stage));
    return signal?.aborted
      ? fallbackResult(prompt, "extraction-timeout", diagnostics)
      : reducedOrFallback("extraction-error-after-repair");
  }

  candidate = validateCapturedContract(raw, priorContract, prompt);
  if (candidate.validation.valid) {
    return { contract: mergeIntentContracts(priorContract, candidate.contract), source: "extracted", validation: candidate.validation };
  }
  diagnostics.push(createExtractionDiagnostic(2, candidate.stage, candidate.validation.errors));
  const salvaged = salvageRelationshipContract(raw, priorContract, prompt, candidate.validation.errors);
  if (salvaged) {
    return {
      contract: salvaged,
      source: "extracted-relationship-degraded",
      validation: { valid: true, errors: [], relationshipDegraded: true },
      diagnostics: {
        schemaVersion: INTENT_CONTRACT_SCHEMA_VERSION,
        attempts: diagnostics.slice(-3),
        degradation: {
          originalRelationship: String(raw?.relationshipToPrior || "").slice(0, 40),
          errorCodes: candidate.validation.errors.slice(0, 20),
          priorFieldsMerged: false
        }
      }
    };
  }
  return reducedOrFallback("invalid-extraction-after-repair");
}

/**
 * Run extraction with a hard harness deadline. A timed-out result is discarded even if
 * the provider ignores abort and eventually resolves.
 *
 * @param {object} params - extractContract parameters plus requestId/revision.
 * @returns {Promise<{ contract: object, source: string, validation: object }>} Bounded result.
 */
async function extractContractWithDeadline(params) {
  const controller = params.controller || new AbortController();
  const deadlineMs = Math.max(1, Number(params.settings?.intentExtractionDeadlineMs) || 12000);
  const state = { key: `${params.requestId || "request"}:${params.revision || 0}`, timedOut: false };
  let timer;
  let onAbort;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
      resolve(fallbackResult(params.prompt, "extraction-timeout", [createExtractionDiagnostic(1, "deadline", "extraction-timeout")]));
    }, deadlineMs);
  });
  const aborted = new Promise((resolve) => {
    onAbort = () => {
      if (state.timedOut) return;
      state.timedOut = true;
      resolve(fallbackResult(params.prompt, "extraction-aborted", [createExtractionDiagnostic(1, "deadline", "extraction-aborted")]));
    };
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const extraction = extractContract({ ...params, signal: controller.signal }).then((result) => (
    state.timedOut
      ? fallbackResult(params.prompt, "late-extraction-discarded", [createExtractionDiagnostic(1, "deadline", "late-extraction-discarded")])
      : result
  ));
  try {
    return await Promise.race([extraction, deadline, aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Refresh a contract from authoritative user clarification or conflict guidance using
 * only capture_intent_contract. The caller decides how to merge the validated result.
 *
 * @param {object} params - Provider/settings/prompts/current contract/userContext/signal.
 * @returns {Promise<{ contract: object|null, validation: object, diagnostics: object[] }>} Validated refresh.
 */
async function refreshContractFromUserContext(params) {
  const { provider, settings, prompts, contract, userContext, signal } = params;
  const attempt = Math.max(1, Math.min(2, Number(params.attempt) || 1));
  const repairErrors = [...new Set((Array.isArray(params.repairErrors) ? params.repairErrors : [])
    .map((code) => String(code || "unknown-error").slice(0, 120))
    .filter(Boolean))];
  const allowedFieldRefs = collectCanonicalFieldRefs(contract);
  const captureTool = createCaptureIntentContractTool(contract, { relationship: "corrects" });
  const messages = [
    { role: "system", content: (prompts && prompts.intentContractRefreshSystem) || (prompts && prompts.intentExtractionSystem) || "" },
    { role: "user", content: [
      "Refresh the current intent contract from the authoritative user input below.",
      "Preserve unaffected requirements and IDs. Use provenance clarified for fields established by the answer.",
      "Set relationshipToPrior to corrects and list every changed existing field in correctedFieldRefs.",
      `The only allowed canonical references are: ${allowedFieldRefs.join(", ") || "none"}.`,
      "For corrects, carriedFieldRefs must be an empty array because corrected fields are merged through correctedFieldRefs.",
      repairErrors.length ? "The previous refresh failed validation with these error codes: " + repairErrors.join(", ") + ". Return a complete replacement contract, not a partial patch." : "",
      "Do not solve the task. Call capture_intent_contract exactly once.",
      "",
      `Current contract:\n${JSON.stringify(contract)}`,
      "",
      `Authoritative user input:\n${String(userContext || "")}`
    ].join("\n") }
  ];
  try {
    const raw = await callCaptureIntentContract(provider, messages, settings, signal, captureTool);
    const candidate = validateCapturedContract(raw, contract, userContext, { enforceCriterionQuality: false });
    if (!candidate.validation.valid) {
      return {
        contract: null,
        validation: candidate.validation,
        diagnostics: [createExtractionDiagnostic(attempt, candidate.stage, candidate.validation.errors, allowedFieldRefs)]
      };
    }
    return {
      contract: mergeIntentContracts(contract, candidate.contract),
      validation: candidate.validation,
      diagnostics: []
    };
  } catch (error) {
    const errorCode = signal?.aborted ? "refresh-aborted" : String(error?.code || "refresh-provider-failure");
    const stage = signal?.aborted || !error?.code
      ? "provider"
      : (error.code === "missing-forced-tool-call" ? "forced-call" : (error.code === "malformed-function-arguments" ? "arguments" : "provider"));
    return {
      contract: null,
      validation: { valid: false, errors: [errorCode] },
      diagnostics: [createExtractionDiagnostic(attempt, stage, errorCode, allowedFieldRefs)]
    };
  }
}

  createCaptureIntentContractTool,
module.exports = {
  CAPTURE_INTENT_CONTRACT_TOOL,
  CAPTURE_REDUCED_INTENT_CONTRACT_TOOL,
  shouldUseChatFastPath,
  buildExtractionEnvelope,
  extractContract,
  extractContractWithDeadline,
  refreshContractFromUserContext
};
