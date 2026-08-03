/**
 * Isolated rewriting for assessed responses that contain unmet acceptance criteria.
 */

"use strict";

const { isEvidenceAdmissible } = require("./completion-evidence-ledger");
const correctionConsistency = require("./intent-correction-consistency");

const MAX_REWRITTEN_RESPONSE_CHARS = 12000;
const REWRITE_ASSESSED_CANDIDATE_TOOL = Object.freeze({
  type: "function",
  function: {
    name: "rewrite_assessed_candidate",
    description: "Rewrite an incomplete candidate so it reports only outcomes supported by the validated assessment and evidence.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["content", "acknowledgedUnmetCriterionIds"],
      properties: {
        content: { type: "string", minLength: 1, maxLength: MAX_REWRITTEN_RESPONSE_CHARS },
        acknowledgedUnmetCriterionIds: { type: "array", items: { type: "string" } }
      }
    }
  }
});

/**
 * Normalize and bound one diagnostic or evidence string before it enters the rewrite prompt.
 * @param {*} value - Value to normalize.
 * @param {number} maximum - Maximum returned character count.
 * @returns {string} Bounded single-line text.
 */
function boundedText(value, maximum = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? text.slice(0, maximum) + "...[truncated]" : text;
}

/**
 * Check the Plan-mode invariant required of an accepted rewritten response.
 * @param {*} content - Candidate rewrite content.
 * @returns {boolean} Whether exactly one complete plan block occupies the response.
 */
function singleProposedPlanBlock(content) {
  const text = String(content || "").trim();
  return (text.match(/<proposed_plan>/g) || []).length === 1
    && (text.match(/<\/proposed_plan>/g) || []).length === 1
    && text.startsWith("<proposed_plan>")
    && text.endsWith("</proposed_plan>");
}

/**
 * Parse the one forced rewrite tool call without accepting free-form provider output.
 * @param {object} message - Provider completion message.
 * @returns {{value?:object,error?:string}} Parsed arguments or a bounded error code.
 */
function parseRewriteCall(message) {
  const calls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  const matching = calls.filter((call) => (call.function?.name || call.name) === "rewrite_assessed_candidate");
  if (matching.length !== 1) return { error: "missing-forced-rewrite-call" };
  try {
    const raw = matching[0].function?.arguments ?? matching[0].arguments ?? "{}";
    return { value: typeof raw === "object" ? raw : JSON.parse(String(raw)) };
  } catch (_error) {
    return { error: "malformed-rewrite-arguments" };
  }
}

/**
 * Validate rewrite shape, unmet-criterion acknowledgement, size, and Plan structure.
 * @param {object} raw - Parsed rewrite arguments.
 * @param {string} mode - Conversation mode.
 * @param {object} assessment - Validated acceptance assessment.
 * @returns {{valid:boolean,errors:string[],content:string}} Validation result.
 */
function validateRewrite(raw, mode, assessment, contract = null) {
  const errors = [];
  const content = typeof raw?.content === "string" ? raw.content.trim() : "";
  const expectedIds = (assessment.criteria || []).filter((criterion) => criterion.status !== "met").map((criterion) => criterion.id).sort();
  const actualIds = Array.isArray(raw?.acknowledgedUnmetCriterionIds)
    ? [...new Set(raw.acknowledgedUnmetCriterionIds.map((id) => String(id || "")))].filter(Boolean).sort()
    : [];
  if (!content) errors.push("missing-rewritten-content");
  if (content.length > MAX_REWRITTEN_RESPONSE_CHARS) errors.push("rewritten-content-too-large");
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) errors.push("unmet-criterion-acknowledgement-mismatch");
  if (mode === "plan" && !singleProposedPlanBlock(content)) errors.push("invalid-proposed-plan-block");
  if (correctionConsistency.findSupersededReferencesInText(content, contract).length) errors.push("rewritten-content-contains-superseded-reference");
  return { valid: errors.length === 0, errors, content };
}

/**
 * Build the isolated rewrite conversation using only the candidate, unmet criteria,
 * and admissible evidence.
 * @param {object} params - Rewrite inputs.
 * @returns {object[]} Provider messages for the isolated completion.
 */
function createRewriteMessages(params) {
  const unmetCriteria = (params.assessment.criteria || []).filter((criterion) => criterion.status !== "met").map((criterion) => ({
    id: criterion.id,
    explanation: boundedText(criterion.explanation)
  }));
  const evidence = (params.evidenceLedger || []).filter(isEvidenceAdmissible).map((entry) => ({
    id: entry.id,
    source: entry.source,
    tool: entry.tool || "",
    outcome: entry.outcome,
    summary: boundedText(entry.summary),
    files: Array.isArray(entry.files) ? entry.files.slice(0, 20) : []
  }));
  const system = [
    "You are the isolated final-response correction stage.",
    "Rewrite the candidate so it is consistent with the validated incomplete assessment and admissible evidence.",
    "Preserve useful verified information, remove every success claim for an unmet criterion, and add no new facts.",
    "Use every active intent correction and remove superseded resource references from the response.",
    "Do not add an acceptance-criteria table or completion verdict; the harness renders those deterministically.",
    params.mode === "plan" ? "Return exactly one complete <proposed_plan> block and no text outside it." : "",
    "Call rewrite_assessed_candidate exactly once and do not answer outside the tool call."
  ].filter(Boolean).join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({
      candidate: String(params.candidate || "").slice(0, MAX_REWRITTEN_RESPONSE_CHARS),
      unmetCriteria,
      evidence,
      activeCorrections: correctionConsistency.listActiveReferenceReplacements(params.contract)
    }) }
  ];
}

/**
 * Rewrite one incomplete candidate against its validated assessment.
 * @param {object} params - Provider, mode, candidate, assessment, and evidence inputs.
 * @returns {Promise<{valid:boolean,content:string,diagnostics:object[]}>} Validated rewrite or a safe empty fallback.
 */
async function rewriteIncompleteCandidate(params) {
  try {
    const message = await params.provider.completeMessage(createRewriteMessages(params), {
      temperature: 0,
      maxTokens: Math.max(800, Math.min(4000, Number(params.settings?.intentMaxOutputTokens) || 1200)),
      signal: params.signal,
      tools: [REWRITE_ASSESSED_CANDIDATE_TOOL],
      toolChoice: { type: "function", function: { name: "rewrite_assessed_candidate" } },
      onUsage: params.onUsage,
      onDebug: params.onDebug
    });
    const parsed = parseRewriteCall(message);
    if (parsed.error) return { valid: false, content: "", diagnostics: [{ stage: "forced-call", errorCodes: [parsed.error] }] };
    const validation = validateRewrite(parsed.value, params.mode, params.assessment, params.contract);
    return validation.valid
      ? { valid: true, content: validation.content, diagnostics: [] }
      : { valid: false, content: "", diagnostics: [{ stage: "validation", errorCodes: validation.errors }] };
  } catch (_error) {
    return { valid: false, content: "", diagnostics: [{ stage: "provider", errorCodes: ["rewrite-provider-failure"] }] };
  }
}

module.exports = {
  MAX_REWRITTEN_RESPONSE_CHARS,
  REWRITE_ASSESSED_CANDIDATE_TOOL,
  rewriteIncompleteCandidate,
  validateRewrite
};
