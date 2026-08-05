/**
 * Plan-mode typed decision contract (M8.2).
 *
 * Plan reuses the shared M4 decision protocol (one typed decision per round,
 * runtime-owned identity and state version) but under a read-only policy:
 *
 *   - allowed decision types:  tool_call, request_user_input,
 *                              revise_plan_strategy, propose_plan_completion,
 *                              report_blocked
 *   - forbidden decision types: any mutation or authority-claiming action
 *   - allowed tools:            the explicit Plan read-only allowlist
 *
 * The model may PROPOSE a plan or completion; only the verifier, state
 * transition service, and completion gate (later sub-milestones) may accept it.
 * This module is pure and does no I/O; `derivePlanAllowedToolNames` lazily
 * consults the shared tool registry so unit tests can pass an explicit set.
 */

"use strict";

const PLAN_DECISION_SCHEMA_VERSION = 1;

const PLAN_DECISION_TYPES = Object.freeze({
  TOOL_CALL: "tool_call",
  REQUEST_USER_INPUT: "request_user_input",
  REVISE_PLAN_STRATEGY: "revise_plan_strategy",
  PROPOSE_PLAN_COMPLETION: "propose_plan_completion",
  REPORT_BLOCKED: "report_blocked",
  INVALID: "invalid"
});

/** Provider-visible control tool name -> internal Plan decision type. */
const PLAN_CONTROL_TOOL_TYPES = Object.freeze({
  plan_request_user_input: PLAN_DECISION_TYPES.REQUEST_USER_INPUT,
  plan_revise_strategy: PLAN_DECISION_TYPES.REVISE_PLAN_STRATEGY,
  plan_propose_completion: PLAN_DECISION_TYPES.PROPOSE_PLAN_COMPLETION,
  plan_report_blocked: PLAN_DECISION_TYPES.REPORT_BLOCKED
});

/**
 * Decision types Plan must never expose or accept. These claim mutation or
 * authority the read-only controller does not grant.
 */
const FORBIDDEN_PLAN_DECISION_TYPES = Object.freeze(new Set([
  "commit",
  "mark_intent",
  "mark_complete",
  "set_verification",
  "set_criterion_status",
  "abort",
  "write_file",
  "patch_file",
  "delete_file",
  "move_file",
  "run_mutating_command",
  "launch_mutating_external_action"
]));

/**
 * Tool names that are always forbidden in Plan mode even if some upstream change
 * accidentally adds them to the mode's definitions. Defense in depth alongside
 * the positive allowlist.
 */
const FORBIDDEN_PLAN_TOOL_NAMES = Object.freeze(new Set([
  "apply_edit", "write_file", "run_command", "compile_project", "run_tests",
  "restore_dependencies", "manage_dependencies", "start_code_conversion",
  "open_file_in_tab", "create_document_tab", "insert_at_cursor",
  "replace_selection", "replace_document_range", "extract_selection_to_note",
  "git_stage", "git_unstage", "git_commit",
  "git_fetch", "git_pull", "git_push",
  "git_branch_create", "git_branch_switch",
  "preferences_update", "preferences_reset", "preferences_import",
  "request_create", "request_update", "request_send",
  "environment_update", "mock_create", "mock_update", "mock_call",
  "plan_create", "plan_update", "plan_update_status", "plan_rebuild_index",
  "export_active_document", "export_active_folder_graph",
  "graph_apply_filter", "graph_focus_nodes", "graph_show_local", "graph_clear_focus"
]));

const MAX_TEXT = 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, max = MAX_TEXT) {
  const text = String(value == null ? "" : value).trim();
  return text.length > max ? text.slice(0, max) : text;
}

function uniqueCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : []).map(String).filter(Boolean))];
}

/**
 * The authoritative Plan read-only tool allowlist, derived from the shared tool
 * registry for `mode === "plan"`. Lazily required to avoid loading the large
 * tool-loop module in pure unit tests.
 * @returns {Set<string>}
 */
function derivePlanAllowedToolNames(options = {}) {
  // eslint-disable-next-line global-require
  const { getAgentToolDefinitions } = require("./agent-tool-loop");
  const names = getAgentToolDefinitions("plan", options)
    .map((definition) => definition?.function?.name)
    .filter(Boolean)
    .filter((name) => !FORBIDDEN_PLAN_TOOL_NAMES.has(name));
  return new Set(names);
}

/**
 * Provider-facing control tool definitions for Plan mode. Real read-only tools
 * come from the shared registry; these add the Plan control actions.
 * @returns {object[]}
 */
function createPlanControlToolDefinitions() {
  const metadata = {
    type: "object",
    additionalProperties: false,
    required: ["rationale", "expectedObservation"],
    properties: {
      intentId: { type: "string" },
      rationale: { type: "string" },
      expectedObservation: { type: "string" }
    }
  };
  return [
    {
      type: "function",
      function: {
        name: "plan_request_user_input",
        description: "Ask one blocking clarification when a required detail cannot be found in the read-only workspace.",
        parameters: {
          type: "object",
          required: ["_decision", "question", "reason"],
          properties: { _decision: metadata, question: { type: "string" }, reason: { type: "string" }, answerType: { type: "string", enum: ["free_text", "single_choice"] }, choices: { type: "array", items: { type: "string" } } }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "plan_revise_strategy",
        description: "Abandon a stalled investigation approach and describe a materially different one. Does not mutate state.",
        parameters: {
          type: "object",
          required: ["_decision", "abandonedApproach", "revisedApproach"],
          properties: { _decision: metadata, abandonedApproach: { type: "string" }, revisedApproach: { type: "string" } }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "plan_propose_completion",
        description: "Propose the structured plan artifact. The runtime verifier and completion gate still decide whether the plan is complete.",
        parameters: {
          type: "object",
          required: ["_decision", "artifact"],
          properties: { _decision: metadata, artifact: { type: "object" } }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "plan_report_blocked",
        description: "Report a structurally supported blocker when neither a read-only action nor a clarification can make progress.",
        parameters: {
          type: "object",
          required: ["_decision", "blockerType", "description"],
          properties: { _decision: metadata, blockerType: { type: "string" }, description: { type: "string" }, recoverableByUser: { type: "boolean" }, requiredUserAction: { type: "string" } }
        }
      }
    }
  ];
}

/**
 * Map a provider tool-call name to its Plan decision type.
 * @param {string} toolName
 * @returns {string} A PLAN_DECISION_TYPES value.
 */
function classifyPlanDecisionType(toolName) {
  if (PLAN_CONTROL_TOOL_TYPES[toolName]) return PLAN_CONTROL_TOOL_TYPES[toolName];
  if (typeof toolName === "string" && toolName.length > 0) return PLAN_DECISION_TYPES.TOOL_CALL;
  return PLAN_DECISION_TYPES.INVALID;
}

/**
 * Validate exactly one typed Plan decision against read-only policy and the
 * current authoritative state version.
 *
 * @param {object} decision - Normalized decision candidate.
 *   Expected shape: { type, toolName, basedOnStateVersion, intentId, rationale,
 *   expectedObservation, tool, payload }.
 * @param {object} context
 * @param {number} context.currentStateVersion - Authoritative state version.
 * @param {Set<string>} [context.allowedToolNames] - Read-only allowlist.
 * @returns {{ valid: boolean, type: string, reasonCodes: string[], normalized: object|null }}
 */
function validatePlanDecision(decision, context = {}) {
  const reasonCodes = [];
  const allowedToolNames = context.allowedToolNames instanceof Set
    ? context.allowedToolNames
    : new Set(Array.isArray(context.allowedToolNames) ? context.allowedToolNames : []);

  if (!isPlainObject(decision)) {
    return { valid: false, type: PLAN_DECISION_TYPES.INVALID, reasonCodes: ["malformed_decision"], normalized: null };
  }

  const toolName = typeof decision.toolName === "string" ? decision.toolName : "";
  const declaredType = typeof decision.type === "string" ? decision.type : "";

  // Reject mutation / authority-claiming actions before anything else.
  if (FORBIDDEN_PLAN_DECISION_TYPES.has(declaredType) || FORBIDDEN_PLAN_DECISION_TYPES.has(toolName)) {
    return { valid: false, type: PLAN_DECISION_TYPES.INVALID, reasonCodes: ["forbidden_mutation_decision"], normalized: null };
  }

  const type = declaredType && Object.values(PLAN_DECISION_TYPES).includes(declaredType)
    ? declaredType
    : classifyPlanDecisionType(toolName);

  if (type === PLAN_DECISION_TYPES.INVALID) {
    return { valid: false, type, reasonCodes: ["unsupported_decision_type"], normalized: null };
  }

  // State-version binding: stale decisions cannot execute.
  const basedOn = Number.isInteger(decision.basedOnStateVersion) ? decision.basedOnStateVersion : null;
  if (context.currentStateVersion != null) {
    if (basedOn == null) reasonCodes.push("missing_state_version");
    else if (basedOn !== context.currentStateVersion) reasonCodes.push("stale_decision");
  }

  // Tool-call decisions must target an allowlisted read-only tool.
  if (type === PLAN_DECISION_TYPES.TOOL_CALL) {
    if (!toolName) reasonCodes.push("missing_tool_name");
    else if (FORBIDDEN_PLAN_TOOL_NAMES.has(toolName)) reasonCodes.push("forbidden_tool");
    else if (allowedToolNames.size > 0 && !allowedToolNames.has(toolName)) reasonCodes.push("tool_not_allowlisted");
  }

  const valid = reasonCodes.length === 0;
  const normalized = valid
    ? {
        schemaVersion: PLAN_DECISION_SCHEMA_VERSION,
        mode: "plan",
        type,
        basedOnStateVersion: basedOn,
        toolName: type === PLAN_DECISION_TYPES.TOOL_CALL ? toolName : null,
        intentId: boundedText(decision.intentId, 200) || null,
        rationale: boundedText(decision.rationale),
        expectedObservation: boundedText(decision.expectedObservation),
        payload: decision.payload === undefined ? null : decision.payload
      }
    : null;

  return { valid, type, reasonCodes: uniqueCodes(reasonCodes), normalized };
}

/**
 * Validate that a provider returned exactly one actionable decision.
 * @param {number} decisionCount
 * @returns {{ valid: boolean, reasonCodes: string[] }}
 */
function validateSinglePlanDecision(decisionCount) {
  if (decisionCount === 1) return { valid: true, reasonCodes: [] };
  return { valid: false, reasonCodes: [decisionCount === 0 ? "no_decision" : "multiple_decisions"] };
}

module.exports = {
  PLAN_DECISION_SCHEMA_VERSION,
  PLAN_DECISION_TYPES,
  PLAN_CONTROL_TOOL_TYPES,
  FORBIDDEN_PLAN_DECISION_TYPES,
  FORBIDDEN_PLAN_TOOL_NAMES,
  derivePlanAllowedToolNames,
  createPlanControlToolDefinitions,
  classifyPlanDecisionType,
  validatePlanDecision,
  validateSinglePlanDecision
};
