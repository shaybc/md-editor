/**
 * Plan requirements source with the M8.2 fallback derivation guard.
 *
 * The Plan verifier's coverage checks need an authoritative requirement set.
 * Preferred source: the intent contract's acceptance criteria (when intent
 * extraction ran for Plan mode). Fallback source: deterministic derivation from
 * the verbatim prompt and accepted clarifications.
 *
 * Guard (from the M8 plan):
 *
 *   Simple, explicit request      -> deterministic fallback allowed (final)
 *   Complex/ambiguous/multi-part  -> request clarification, or terminate
 *                                    unverified; fallback requirements are
 *                                    provisional and cannot complete without
 *                                    user confirmation.
 *
 * The "simple and fully represented" determination is made here by deterministic
 * runtime logic, never by the model claiming the request is simple. This module
 * is pure and does no I/O or model calls.
 */

"use strict";

const MAX_REQUIREMENTS = 40;

function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
}

/**
 * Split a prompt into candidate requirement clauses using conservative,
 * deterministic separators (list markers, "and", "then", "also", ";").
 * @param {string} prompt
 * @returns {string[]}
 */
function splitClauses(prompt) {
  const text = normalizeText(prompt);
  if (!text) return [];
  const byLine = text.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim());
  const clauses = [];
  for (const line of byLine) {
    if (!line) continue;
    const parts = line
      .split(/;|(?:,?\s+(?:and then|then|and also|also|as well as|plus)\s+)|(?:\s+and\s+)/i)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) clauses.push(part);
  }
  return clauses;
}

const IMPERATIVE_VERBS = /\b(add|create|build|implement|fix|update|change|remove|delete|refactor|migrate|write|support|introduce|replace|rename|move|split|extract|document|test|configure|integrate|expose|enable|disable)\b/gi;

/**
 * Deterministically classify a request as "simple" (single explicit ask) or
 * "complex" (multi-part, ambiguous, or long). Conservative: when in doubt it
 * returns "complex" so the fallback guard errs toward provisional.
 *
 * @param {string} prompt
 * @param {Array<{text:string}>} [clarifications]
 * @returns {{ shape: "simple"|"complex", signals: string[] }}
 */
function classifyRequestShape(prompt, clarifications = []) {
  const text = normalizeText(prompt);
  const signals = [];
  if (!text) {
    return { shape: "complex", signals: ["empty_prompt"] };
  }

  const clauses = splitClauses(text);
  if (clauses.length > 1) signals.push("multiple_clauses");

  const verbMatches = text.match(IMPERATIVE_VERBS) || [];
  const distinctVerbs = new Set(verbMatches.map((v) => v.toLowerCase()));
  if (distinctVerbs.size > 1) signals.push("multiple_actions");

  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) signals.push("multiple_questions");

  if (/\b(and|also|then|as well as|plus|additionally|moreover)\b/i.test(text) && clauses.length > 1) {
    signals.push("conjunctions");
  }

  if (/\b(maybe|perhaps|somehow|not sure|figure out|etc\.?|and so on|or something)\b/i.test(text)) {
    signals.push("ambiguous_language");
  }

  if (text.length > 280) signals.push("long_prompt");
  if (/[\r\n].*[\r\n]/.test(prompt || "")) signals.push("multi_line");

  // Unanswered clarification requests keep the request complex.
  if (Array.isArray(clarifications) && clarifications.some((c) => c && c.answered === false)) {
    signals.push("open_clarification");
  }

  const shape = signals.length === 0 ? "simple" : "complex";
  return { shape, signals };
}

/**
 * Map intent-contract acceptance criteria to Plan requirements.
 * @param {object} intentContract
 * @returns {Array<object>|null}
 */
function requirementsFromIntentContract(intentContract) {
  const criteria = intentContract && Array.isArray(intentContract.acceptanceCriteria)
    ? intentContract.acceptanceCriteria
    : null;
  if (!criteria || criteria.length === 0) return null;
  return criteria.slice(0, MAX_REQUIREMENTS).map((criterion, index) => ({
    id: String(criterion.id || `R${index + 1}`),
    statement: normalizeText(criterion.description || criterion.statement),
    source: "intent-contract",
    required: true,
    provisional: false
  })).filter((requirement) => requirement.statement.length > 0);
}

/**
 * Derive the authoritative Plan requirement set with provenance and provisional
 * marking.
 *
 * @param {object} params
 * @param {object} [params.intentContract] - Intent contract if extraction ran.
 * @param {string} params.prompt - Verbatim user prompt.
 * @param {Array<{text:string, answered?:boolean}>} [params.clarifications]
 * @returns {{
 *   requirements: Array<object>,
 *   provenance: "intent-contract"|"fallback",
 *   provisional: boolean,
 *   needsClarification: boolean,
 *   shape: "simple"|"complex",
 *   reasonCodes: string[]
 * }}
 */
function derivePlanRequirements(params = {}) {
  const { intentContract, prompt, clarifications = [] } = params;

  const contractRequirements = requirementsFromIntentContract(intentContract);
  if (contractRequirements && contractRequirements.length > 0) {
    return {
      requirements: contractRequirements,
      provenance: "intent-contract",
      provisional: false,
      needsClarification: false,
      shape: "simple",
      reasonCodes: []
    };
  }

  // Fallback path — gated by deterministic request-shape classification.
  const { shape, signals } = classifyRequestShape(prompt, clarifications);
  const clauses = splitClauses(prompt);
  const statements = clauses.length > 0 ? clauses : [normalizeText(prompt)].filter(Boolean);
  const provisional = shape !== "simple";

  const requirements = (statements.length > 0 ? statements : ["Satisfy the user's request."])
    .slice(0, MAX_REQUIREMENTS)
    .map((statement, index) => ({
      id: `R${index + 1}`,
      statement,
      source: "user",
      required: true,
      provisional
    }));

  return {
    requirements,
    provenance: "fallback",
    provisional,
    // Complex requests without an intent contract must clarify or terminate
    // unverified; fallback cannot silently stand in for failed extraction.
    needsClarification: provisional,
    shape,
    reasonCodes: provisional ? ["fallback_requires_confirmation", ...signals] : []
  };
}

module.exports = {
  classifyRequestShape,
  requirementsFromIntentContract,
  derivePlanRequirements,
  splitClauses
};
