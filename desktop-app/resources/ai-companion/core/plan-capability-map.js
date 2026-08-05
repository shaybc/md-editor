/**
 * Plan capability reachability map and pre-flight gate (Fix 2).
 *
 * A plan is a claim about the workspace. If a task requires data that no tool
 * available in Plan mode can produce, the run must say so and stop or ask —
 * never fabricate the missing data. This module deterministically detects the
 * capabilities a prompt requires, compares them against the tools actually
 * available in the mode, and decides whether to proceed, ask the user, or block.
 *
 * Pure module: no IO, no model calls. The decision is made by runtime logic, not
 * by the model claiming a task is reachable.
 */

"use strict";

/**
 * Capability -> signal that a prompt requires it. Conservative regexes: they aim
 * to catch genuine requests for a capability, accepting a small amount of
 * over-asking (which is safe) over silent fabrication (which is not).
 */
const CAPABILITY_SIGNALS = Object.freeze({
  inspect_git: /\b(un-?committed|un-?pushed|not\s+(?:yet\s+)?(?:pushed|committed)|staged|unstaged|git\s+(?:status|diff|changes|log|stash)|working\s+tree|pending\s+changes|latest\s+changes|recent\s+commits?|\bcommits?\b|\bbranch(?:es)?\b|\bstash(?:ed)?\b|\bdiff\b)/i
});

/** Capability -> the tool names that satisfy it (any one is sufficient). */
const CAPABILITY_TOOLS = Object.freeze({
  inspect_git: [
    "git_panel_status",
    "git_panel_changes_digest",
    "git_panel_compare_file",
    "git_panel_branch_list",
    "git_panel_pr_notes_context"
  ]
});

/** Capabilities the user can resolve themselves (supply data or redirect scope). */
const CAPABILITY_USER_RESOLVABLE = Object.freeze({
  inspect_git: true
});

/** Human-readable descriptions for clarification questions. */
const CAPABILITY_DESCRIPTION = Object.freeze({
  inspect_git: "read the repository's git status/diff (uncommitted or unpushed changes)"
});

/**
 * Detect the capabilities a prompt (and optional extra context) requires.
 * @param {string} text
 * @returns {string[]} Capability ids, stable order.
 */
function detectRequiredCapabilities(text) {
  const haystack = String(text || "");
  const required = [];
  for (const [capability, signal] of Object.entries(CAPABILITY_SIGNALS)) {
    if (signal.test(haystack)) required.push(capability);
  }
  return required;
}

/**
 * Given required capabilities and the tools available, return those with no
 * satisfying tool available.
 * @param {string[]} required
 * @param {Set<string>|string[]} availableToolNames
 * @returns {Array<{ capability: string, userResolvable: boolean, description: string }>}
 */
function unreachableCapabilities(required, availableToolNames) {
  const available = availableToolNames instanceof Set
    ? availableToolNames
    : new Set(Array.isArray(availableToolNames) ? availableToolNames : []);
  const unreachable = [];
  for (const capability of required) {
    const tools = CAPABILITY_TOOLS[capability] || [];
    const reachable = tools.some((tool) => available.has(tool));
    if (!reachable) {
      unreachable.push({
        capability,
        userResolvable: CAPABILITY_USER_RESOLVABLE[capability] === true,
        description: CAPABILITY_DESCRIPTION[capability] || capability
      });
    }
  }
  return unreachable;
}

/**
 * Compose the single clarification question for one or more unreachable,
 * user-resolvable capabilities.
 * @param {Array<object>} unreachable
 * @returns {{ ambiguityId: string, question: string, reason: string, answerType: string, choices: string[] }}
 */
function buildCapabilityQuestion(unreachable) {
  const descriptions = unreachable.map((entry) => entry.description).join("; ");
  return {
    ambiguityId: "plan-capability-gap",
    question: `Plan mode cannot ${descriptions} directly, so I can't gather that data myself. How should I proceed? `
      + `Reply "files" to plan only from the working-tree files I can read, `
      + `paste the data (e.g. the git status/diff) for me to use, `
      + `or reply "stop" to cancel.`,
    reason: "The task requires data no read-only Plan tool can produce. I will not invent it.",
    answerType: "free_text",
    choices: ["files", "stop"]
  };
}

/**
 * Interpret a clarification answer into a proceed/stop decision plus any
 * user-supplied context to inject.
 * @param {string} answer
 * @returns {{ proceed: boolean, fromFilesOnly: boolean, suppliedData: string }}
 */
function interpretCapabilityAnswer(answer) {
  const text = String(answer == null ? "" : answer).trim();
  if (!text) return { proceed: false, fromFilesOnly: false, suppliedData: "" };
  const lower = text.toLowerCase();
  if (/^(stop|cancel|abort|no)\b/.test(lower)) return { proceed: false, fromFilesOnly: false, suppliedData: "" };
  if (/^(files?|from files|use files|working tree)\b/.test(lower)) return { proceed: true, fromFilesOnly: true, suppliedData: "" };
  // Anything else is treated as user-supplied data to use.
  return { proceed: true, fromFilesOnly: false, suppliedData: text };
}

/**
 * Pre-flight capability gate for a Plan run.
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {Set<string>|string[]} input.availableToolNames - Plan-mode tools.
 * @param {boolean} input.canAsk - Whether a clarification channel is available.
 * @returns {{ action: "proceed"|"ask"|"block", unreachable: object[], question: object|null, reason: string }}
 */
function evaluatePlanCapabilityGate(input = {}) {
  const required = detectRequiredCapabilities(input.prompt);
  const unreachable = unreachableCapabilities(required, input.availableToolNames);
  if (unreachable.length === 0) {
    return { action: "proceed", unreachable: [], question: null, reason: "" };
  }
  const allUserResolvable = unreachable.every((entry) => entry.userResolvable);
  if (allUserResolvable && input.canAsk === true) {
    return { action: "ask", unreachable, question: buildCapabilityQuestion(unreachable), reason: "" };
  }
  const names = unreachable.map((entry) => entry.description).join("; ");
  return {
    action: "block",
    unreachable,
    question: null,
    reason: `Plan mode cannot ${names}, and that data cannot be obtained here. Stopping instead of inventing it.`
  };
}

module.exports = {
  CAPABILITY_SIGNALS,
  CAPABILITY_TOOLS,
  detectRequiredCapabilities,
  unreachableCapabilities,
  buildCapabilityQuestion,
  interpretCapabilityAnswer,
  evaluatePlanCapabilityGate
};
