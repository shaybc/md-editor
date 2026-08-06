/**
 * Independent workspace-claim classifier (M9.4).
 *
 * Detects whether an answer makes a workspace-specific claim, so a direct/grounded
 * answer that asserts a fact about the current project is escalated to groundedness
 * verification. This is a deterministic, conservative runtime boundary that is
 * biased toward escalation: a model-provided claim `kind` can never exempt a claim.
 *
 * Not solvable perfectly with lexical rules — the goal is to never *under*-escalate
 * a genuine workspace claim, accepting some safe over-escalation.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

const CLAIM_LEVELS = Object.freeze({ WORKSPACE: "workspace", AMBIGUOUS: "ambiguous", GENERIC: "generic" });

// Strong signals: the statement is about the current project.
const THIS_WORKSPACE = /\b(this|the current|our|the)\s+(project|repo|repository|codebase|workspace|file|module|app|application|component|config(?:uration)?)\b/i;
// A path or a filename with a known code/config extension.
const FILE_REFERENCE = /(?:^|[\s`'"(\[])(?:[\w.-]+[\\/][\w./\\-]+|[\w-]+\.(?:js|ts|jsx|tsx|cjs|mjs|json|md|css|scss|html|py|java|kt|kts|xml|ya?ml|toml|cfg|ini|txt|sh|bat|ps1|gradle|properties))(?=$|[\s`'"),:;.])/i;

// Weaker signals: a value/assertion that could be general advice OR a project claim.
const VALUE_ATTRIBUTION = /\b(defaults?\s+to|is\s+set\s+to|is\s+configured\s+(?:to|as)|is\s+currently|set\s+to|equals?|=\s*["'\d])/i;
const NUMERIC_UNIT = /\b\d+(?:\.\d+)?\s?(?:ms|milliseconds?|s|seconds?|minutes?|mb|kb|gb|px|%)\b/i;
const BACKTICK_IDENTIFIER = /`[A-Za-z_$][\w.$-]*`/;

function textOf(value) {
  return typeof value === "string" ? value : String(value == null ? "" : value);
}

/**
 * Classify the workspace-specificity of an answer.
 *
 * @param {string} answerText - The rendered answer / claim statement.
 * @param {object} [context] - Optional; `namedTargets` (files/symbols) sharpen detection.
 * @returns {{ level: string, signals: string[], requiresVerification: boolean }}
 */
function classifyAnswerText(answerText, context = {}) {
  const text = textOf(answerText);
  const signals = [];

  if (FILE_REFERENCE.test(text)) signals.push("file-reference");
  if (THIS_WORKSPACE.test(text)) signals.push("this-workspace");

  // Named targets from the request/contract that appear verbatim in the answer are
  // a strong workspace signal.
  const named = collectNamedTargets(context);
  if (named.some((target) => target && text.toLowerCase().includes(target))) signals.push("named-target");

  const strong = signals.length > 0;

  if (!strong) {
    if (VALUE_ATTRIBUTION.test(text)) signals.push("value-attribution");
    if (NUMERIC_UNIT.test(text)) signals.push("numeric-unit");
    if (BACKTICK_IDENTIFIER.test(text)) signals.push("quoted-identifier");
  }

  let level = CLAIM_LEVELS.GENERIC;
  if (strong) level = CLAIM_LEVELS.WORKSPACE;
  else if (signals.length > 0) level = CLAIM_LEVELS.AMBIGUOUS;

  // Escalate for workspace AND ambiguous (bias toward escalation); generic accepts.
  return { level, signals, requiresVerification: level !== CLAIM_LEVELS.GENERIC };
}

function collectNamedTargets(context) {
  const groups = context && context.namedTargets ? context.namedTargets : {};
  const values = [];
  for (const key of ["files", "symbols", "errors"]) {
    const list = Array.isArray(groups[key]) ? groups[key] : [];
    for (const entry of list) {
      const value = typeof entry === "string" ? entry : (entry && entry.value);
      if (value) values.push(String(value).toLowerCase());
    }
  }
  return values;
}

/**
 * Reconcile a model's per-claim `kind` with the independent scan of the same text.
 * The scanner is authoritative: if the model says "general-knowledge" but the scan
 * finds a workspace claim, the claim still requires verification.
 *
 * @param {{ statement: string, kind?: string }} claim
 * @param {object} [context]
 * @returns {{ effectiveLevel: string, requiresVerification: boolean, overrodeModel: boolean }}
 */
function reconcileClaim(claim, context = {}) {
  const scan = classifyAnswerText(claim && claim.statement, context);
  const modelKind = String(claim && claim.kind || "").toLowerCase();
  const modelSaysGeneric = modelKind === "general-knowledge";
  const requiresVerification = scan.requiresVerification; // scanner wins
  return {
    effectiveLevel: scan.level,
    requiresVerification,
    overrodeModel: modelSaysGeneric && requiresVerification
  };
}

module.exports = {
  CLAIM_LEVELS,
  classifyAnswerText,
  reconcileClaim
};
