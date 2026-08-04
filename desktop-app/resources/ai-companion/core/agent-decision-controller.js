/**
 * Agent-mode typed decision schemas, validation, and freshness checks.
 */

"use strict";

const { compareApproachText } = require("./agent-strategy-signature");

const DECISION_SCHEMA_VERSION = 1;
const DECISION_METADATA_KEY = "_decision";
const DECISION_TYPES = Object.freeze({
  TOOL_CALL: "tool_call",
  REQUEST_USER_INPUT: "request_user_input",
  PROPOSE_COMPLETION: "propose_completion",
  REPORT_BLOCKED: "report_blocked",
  INVALID: "invalid"
});
const CONTROL_TOOL_TYPES = Object.freeze({
  agent_request_user_input: DECISION_TYPES.REQUEST_USER_INPUT,
  agent_propose_completion: DECISION_TYPES.PROPOSE_COMPLETION,
  agent_report_blocked: DECISION_TYPES.REPORT_BLOCKED
});
const BLOCKER_TYPES = new Set(["missing_information", "permission_denied", "unavailable_capability", "external_failure"]);
const MAX_RATIONALE_CHARS = 1000;
const MAX_EXPECTED_OBSERVATION_CHARS = 1000;

const DECISION_METADATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  description: "Controller metadata. This is descriptive only; the runtime owns validation and authorization.",
  required: ["intentId", "rationale", "expectedObservation"],
  properties: {
    intentId: { type: "string", description: "Primary task or acceptance-criterion id served by this action." },
    rationale: { type: "string", description: "Concise untrusted rationale for selecting this action." },
    expectedObservation: { type: "string", description: "What new evidence or result this action is expected to produce." },
    strategyRevision: { type: "integer", minimum: 0 },
    replan: {
      type: "object",
      additionalProperties: false,
      required: ["triggerAssessmentIds", "abandonedApproach", "revisedApproach"],
      properties: {
        triggerAssessmentIds: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
        abandonedApproach: { type: "string", minLength: 1, maxLength: 1000 },
        revisedApproach: { type: "string", minLength: 1, maxLength: 1000 }
      }
    }
  }
});

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stringValue(value, maximum = 2000) {
  const text = String(value || "").trim();
  return text.length > maximum ? text.slice(0, maximum) : text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : []).map(String).filter(Boolean))];
}

function createControlToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "agent_request_user_input",
        description: "Ask one blocking question when the required information cannot be obtained from available tools.",
        parameters: {
          type: "object",
          required: [DECISION_METADATA_KEY, "question", "reason", "answerType", "choices"],
          properties: {
            [DECISION_METADATA_KEY]: DECISION_METADATA_SCHEMA,
            question: { type: "string" },
            reason: { type: "string" },
            answerType: { type: "string", enum: ["free_text", "single_choice"] },
            choices: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "agent_propose_completion",
        description: "Propose the final user response. The runtime will still assess completion before returning it.",
        parameters: {
          type: "object",
          required: [DECISION_METADATA_KEY, "content", "evidenceIds"],
          properties: {
            [DECISION_METADATA_KEY]: DECISION_METADATA_SCHEMA,
            content: { type: "string" },
            evidenceIds: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "agent_report_blocked",
        description: "Report a structurally supported blocker when neither a tool action nor a user question can make progress.",
        parameters: {
          type: "object",
          required: [DECISION_METADATA_KEY, "blockerType", "description", "attemptedDecisionIds", "recoverableByUser", "requiredUserAction", "requiredCapability"],
          properties: {
            [DECISION_METADATA_KEY]: DECISION_METADATA_SCHEMA,
            blockerType: { type: "string", enum: [...BLOCKER_TYPES] },
            description: { type: "string" },
            attemptedDecisionIds: { type: "array", items: { type: "string" } },
            recoverableByUser: { type: "boolean" },
            requiredUserAction: { type: "string" },
            requiredCapability: { type: "string" }
          }
        }
      }
    }
  ];
}

/**
 * Create Agent-controller tool definitions without mutating the shared tool registry.
 * @param {object[]} definitions Existing provider-native Agent tools.
 * @returns {object[]} Decorated real tools followed by controller-only control tools.
 */
function createControllerToolDefinitions(definitions) {
  const decorated = (Array.isArray(definitions) ? definitions : []).map((definition) => {
    const parameters = definition?.function?.parameters || { type: "object", properties: {} };
    return {
      ...cloneSerializable(definition),
      function: {
        ...cloneSerializable(definition.function),
        parameters: {
          ...cloneSerializable(parameters),
          required: [...new Set([...(parameters.required || []), DECISION_METADATA_KEY])],
          properties: { ...(cloneSerializable(parameters.properties) || {}), [DECISION_METADATA_KEY]: DECISION_METADATA_SCHEMA }
        }
      }
    };
  });
  return [...decorated, ...createControlToolDefinitions()];
}

function validateSchemaValue(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path}:enum`);
  if (!schema.type) return;
  if (schema.type === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path}:object`);
      return;
    }
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key}:required`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateSchemaValue(value[key], childSchema, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) errors.push(`${path}.${key}:additional`);
      }
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}:array`);
      return;
    }
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) errors.push(`${path}:minItems`);
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) errors.push(`${path}:maxItems`);
    value.forEach((entry, index) => validateSchemaValue(entry, schema.items, `${path}[${index}]`, errors));
    return;
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push(`${path}:integer`);
      return;
    }
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${path}:number`);
      return;
    }
  } else if (typeof value !== schema.type) {
    errors.push(`${path}:${schema.type}`);
    return;
  }
  if ((schema.type === "integer" || schema.type === "number") && typeof value === "number") {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path}:minimum`);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path}:maximum`);
  }
  if (schema.type === "string" && typeof value === "string") {
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) errors.push(`${path}:minLength`);
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) errors.push(`${path}:maxLength`);
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}:pattern`);
      } catch (_error) {
        errors.push(`${path}:pattern`);
      }
    }
  }
}

function parseToolArguments(toolCall) {
  const raw = toolCall?.function?.arguments ?? toolCall?.arguments ?? "{}";
  if (isPlainObject(raw)) return cloneSerializable(raw);
  const parsed = JSON.parse(String(raw || "{}"));
  if (!isPlainObject(parsed)) throw new Error("Tool arguments must be a JSON object.");
  return parsed;
}

function validIntentIds(state) {
  return new Set(["task", ...(Array.isArray(state?.criteria) ? state.criteria.map((criterion) => String(criterion?.id || "")).filter(Boolean) : [])]);
}

function sanitizeToolCall(toolCall, cleanArguments) {
  const serialized = JSON.stringify(cleanArguments || {});
  const next = cloneSerializable(toolCall) || {};
  next.function = { ...(next.function || {}), arguments: serialized };
  return next;
}

function decisionRecord(options = {}) {
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionId: String(options.decisionId || ""),
    basedOnStateVersion: Number(options.basedOnStateVersion) || 0,
    type: options.type || DECISION_TYPES.INVALID,
    intentId: String(options.intentId || ""),
    rationale: stringValue(options.rationale, MAX_RATIONALE_CHARS),
    expectedObservation: stringValue(options.expectedObservation, MAX_EXPECTED_OBSERVATION_CHARS),
    status: "proposed",
    proposedAtStateVersion: null,
    acceptedAtStateVersion: null,
    authorizedAtStateVersion: null,
    executedAtStateVersion: null,
    runtimeReasonCodes: uniqueCodes(options.runtimeReasonCodes),
    replacesDecisionId: String(options.replacesDecisionId || ""),
    strategyRevision: Math.max(0, Number(options.strategyRevision) || 0),
    replan: cloneSerializable(options.replan || null),
    actionSignature: String(options.actionSignature || ""),
    strategySignature: String(options.strategySignature || ""),
    strategyClass: String(options.strategyClass || "other"),
    targetScope: String(options.targetScope || ""),
    tool: options.tool ? { name: String(options.tool.name || ""), providerCallId: String(options.tool.providerCallId || "") } : null,
    payload: cloneSerializable(options.payload || null),
    observationIds: []
  };
}

function currentStallAssessmentIds(state) {
  const entries = state?.progress?.recentAssessments || [];
  const lastMeaningful = entries.map((entry) => entry.status).lastIndexOf("meaningful");
  return new Set(entries.slice(lastMeaningful + 1).map((entry) => String(entry.assessmentId || "")).filter(Boolean));
}

function validateReplanMetadata(metadata, state, decisionType) {
  const progress = state?.progress;
  if (progress?.mode !== "enforce" || progress.replanRequired !== true) return [];
  if ([DECISION_TYPES.PROPOSE_COMPLETION, DECISION_TYPES.REQUEST_USER_INPUT, DECISION_TYPES.REPORT_BLOCKED].includes(decisionType)) return [];
  const codes = [];
  if (!isPlainObject(metadata?.replan)) return ["missing_replan_metadata"];
  if (Number(metadata.strategyRevision) !== Number(progress.strategyRevision) + 1) codes.push("invalid_strategy_revision");
  const currentIds = currentStallAssessmentIds(state);
  const triggerIds = Array.isArray(metadata.replan.triggerAssessmentIds) ? metadata.replan.triggerAssessmentIds.map(String) : [];
  if (!triggerIds.length || triggerIds.some((id) => !currentIds.has(id))) codes.push("invalid_replan_trigger");
  const comparison = compareApproachText(metadata.replan.abandonedApproach, metadata.replan.revisedApproach);
  if (!comparison.different && !comparison.ambiguous) codes.push(comparison.reasonCode);
  return codes;
}

function validateBlockedClaim(args, state, availableToolNames, hasClarificationChannel) {
  const codes = [];
  if (!BLOCKER_TYPES.has(args.blockerType) || !stringValue(args.description)) codes.push("invalid_blocker_claim");
  if (args.recoverableByUser === true && !stringValue(args.requiredUserAction)) codes.push("invalid_blocker_claim");
  const decisions = new Map((state?.recentDecisions || []).map((decision) => [decision.decisionId, decision]));
  const attemptedIds = Array.isArray(args.attemptedDecisionIds) ? args.attemptedDecisionIds.map(String) : [];
  if (attemptedIds.some((id) => !decisions.has(id))) codes.push("invalid_blocker_decision_reference");
  const attempted = attemptedIds.map((id) => decisions.get(id)).filter(Boolean);
  if (args.blockerType === "permission_denied" && !attempted.some((decision) => decision.runtimeReasonCodes?.includes("authorization_denied"))) {
    codes.push("unsupported_permission_blocker");
  }
  if (args.blockerType === "external_failure") {
    const observations = new Map((state?.recentObservations || []).map((observation) => [observation.observationId, observation]));
    const hasFailure = attempted.some((decision) => (decision.observationIds || []).some((id) => ["failed", "partial"].includes(observations.get(id)?.outcome)));
    if (!hasFailure) codes.push("unsupported_external_failure_blocker");
  }
  if (args.blockerType === "missing_information" && args.recoverableByUser === true && hasClarificationChannel) {
    codes.push("use_request_user_input");
  }
  if (args.blockerType === "unavailable_capability") {
    const capability = stringValue(args.requiredCapability, 200);
    if (!capability || availableToolNames.has(capability)) codes.push("contradictory_capability_blocker");
  }
  return uniqueCodes(codes);
}

/**
 * Normalize one provider response into a content-safe decision attempt.
 * @param {object} message Provider response with OpenAI-shaped tool calls.
 * @param {object[]} realDefinitions Undecorated executable tool definitions.
 * @param {object} state Current authoritative AgentState.
 * @param {object} options Runtime-generated identity and repair metadata.
 * @returns {{decision: object, validationCodes: string[], sanitizedToolCall: object|null}}
 */
function normalizeDecisionAttempt(message, realDefinitions, state, options = {}) {
  const decisionId = String(options.decisionId || "");
  const basedOnStateVersion = Number(state?.stateVersion) || 0;
  const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  if (toolCalls.length !== 1) {
    const code = toolCalls.length ? "multiple_function_calls" : "missing_function_call";
    return {
      decision: decisionRecord({ decisionId, basedOnStateVersion, runtimeReasonCodes: [code], replacesDecisionId: options.replacesDecisionId }),
      validationCodes: [code],
      sanitizedToolCall: null
    };
  }

  const call = toolCalls[0];
  const name = String(call?.function?.name || call?.name || "");
  const definitions = new Map((realDefinitions || []).map((definition) => [String(definition?.function?.name || ""), definition]));
  const availableToolNames = new Set(definitions.keys());
  let args;
  try {
    args = parseToolArguments(call);
  } catch (_error) {
    const decision = decisionRecord({ decisionId, basedOnStateVersion, tool: { name, providerCallId: call?.id }, runtimeReasonCodes: ["invalid_tool_arguments"], replacesDecisionId: options.replacesDecisionId });
    return { decision, validationCodes: ["invalid_tool_arguments"], sanitizedToolCall: null };
  }

  const metadata = args[DECISION_METADATA_KEY];
  const metadataCodes = [];
  if (!isPlainObject(metadata)) metadataCodes.push("missing_decision_metadata");
  else {
    const metadataErrors = [];
    validateSchemaValue(metadata, DECISION_METADATA_SCHEMA, "arguments._decision", metadataErrors);
    if (metadataErrors.some((error) => error.endsWith(":required") || error.endsWith(":object"))) metadataCodes.push("missing_decision_metadata");
    if (metadataErrors.some((error) => !error.endsWith(":required") && !error.endsWith(":object"))) metadataCodes.push("invalid_decision_metadata");
  }
  const intentId = String(metadata?.intentId || "");
  const rationale = stringValue(metadata?.rationale, MAX_RATIONALE_CHARS);
  const expectedObservation = stringValue(metadata?.expectedObservation, MAX_EXPECTED_OBSERVATION_CHARS);
  if (isPlainObject(metadata) && (!intentId || !rationale || !Object.prototype.hasOwnProperty.call(metadata, "expectedObservation"))) metadataCodes.push("missing_decision_metadata");
  if (intentId && !validIntentIds(state).has(intentId)) metadataCodes.push("invalid_intent_reference");

  const cleanArguments = { ...args };
  delete cleanArguments[DECISION_METADATA_KEY];
  const controlType = CONTROL_TOOL_TYPES[name];
  const type = controlType || DECISION_TYPES.TOOL_CALL;
  const validationCodes = [...metadataCodes];
  let payload = null;

  if (controlType) {
    const controlDefinition = createControlToolDefinitions().find((definition) => definition.function.name === name);
    const schemaErrors = [];
    validateSchemaValue(args, controlDefinition.function.parameters, "arguments", schemaErrors);
    if (schemaErrors.length) validationCodes.push("invalid_control_arguments");
    payload = cloneSerializable(cleanArguments);
    if (controlType === DECISION_TYPES.REQUEST_USER_INPUT && (!stringValue(cleanArguments.question) || !stringValue(cleanArguments.reason) || !["free_text", "single_choice"].includes(cleanArguments.answerType))) {
      validationCodes.push("invalid_user_input_request");
    }
    if (controlType === DECISION_TYPES.REQUEST_USER_INPUT && options.hasClarificationChannel !== true) {
      validationCodes.push("clarification_channel_unavailable");
    }
    if (controlType === DECISION_TYPES.PROPOSE_COMPLETION && !stringValue(cleanArguments.content)) validationCodes.push("invalid_completion_proposal");
    if (controlType === DECISION_TYPES.REPORT_BLOCKED) {
      validationCodes.push(...validateBlockedClaim(cleanArguments, state, availableToolNames, options.hasClarificationChannel === true));
    }
  } else {
    const definition = definitions.get(name);
    if (!definition) validationCodes.push("unknown_tool");
    else {
      const schemaErrors = [];
      validateSchemaValue(cleanArguments, definition.function?.parameters, "arguments", schemaErrors);
      if (schemaErrors.length) validationCodes.push("invalid_tool_arguments");
    }
    if (!expectedObservation) validationCodes.push("missing_expected_observation");
  }
  validationCodes.push(...validateReplanMetadata(metadata, state, type));

  const uniqueValidationCodes = uniqueCodes(validationCodes);
  const decision = decisionRecord({
    decisionId,
    basedOnStateVersion,
    type,
    intentId,
    rationale,
    expectedObservation,
    strategyRevision: metadata?.strategyRevision,
    replan: metadata?.replan,
    runtimeReasonCodes: uniqueValidationCodes,
    replacesDecisionId: options.replacesDecisionId,
    tool: type === DECISION_TYPES.TOOL_CALL ? { name, providerCallId: call?.id } : null,
    payload
  });
  return {
    decision,
    validationCodes: uniqueValidationCodes,
    sanitizedToolCall: uniqueValidationCodes.length || type !== DECISION_TYPES.TOOL_CALL ? null : sanitizeToolCall(call, cleanArguments)
  };
}

/** Build the content-safe repair instruction appended to a rebuilt context bundle. */
function createRepairMessage(decision, currentStateVersion) {
  return {
    role: "system",
    content: [
      "The prior Agent decision was rejected by deterministic validation.",
      `Rejected decision id: ${decision.decisionId}`,
      `Validation codes: ${(decision.runtimeReasonCodes || []).join(", ") || "invalid_decision"}`,
      `Current state version: ${Number(currentStateVersion) || 0}`,
      `Allowed decision types: ${Object.values(DECISION_TYPES).filter((type) => type !== DECISION_TYPES.INVALID).join(", ")}`,
      "Return exactly one valid function call. Do not repeat the invalid structure."
    ].join("\n")
  };
}

/** Describe the provider-native one-decision protocol without changing the Agent's goal. */
function createControllerInstructionMessage(state = null) {
  const replanInstruction = state?.progress?.mode === "enforce" && state.progress.replanRequired === true
    ? `Progress control requires a materially different strategy revision ${state.progress.strategyRevision + 1}. Include _decision.strategyRevision and _decision.replan with current trigger assessment ids.`
    : "Do not include replan metadata unless authoritative progress state requires it.";
  return {
    role: "system",
    content: [
      "Agent controller protocol:",
      "Return exactly one function call for the next action. A text-only response or multiple function calls is invalid.",
      "For a workspace tool, include _decision.intentId, _decision.rationale, and _decision.expectedObservation.",
      "Use agent_request_user_input only for blocking information unavailable through tools.",
      "Use agent_propose_completion only when the requested work is ready for runtime completion assessment.",
      "Use agent_report_blocked only when its blocker can be supported by current state.",
      replanInstruction,
      "Model rationale is descriptive only; the runtime independently validates and authorizes every action."
    ].join("\n")
  };
}

function isSameDecisionTransition(transition, decisionId) {
  return String(transition?.payload?.decisionId || transition?.payload?.decision?.decisionId || "") === String(decisionId || "");
}

/**
 * Find state changes that invalidate an accepted decision before execution.
 * Decision bookkeeping and a plain approval for the same decision remain valid.
 */
function findInvalidatingTransitions(decision, transitions) {
  const allowedDecisionEvents = new Set(["decision_proposed", "decision_accepted", "decision_execution_authorized", "replan_attempted", "strategy_revised"]);
  return (Array.isArray(transitions) ? transitions : []).filter((transition) => {
    if (allowedDecisionEvents.has(transition.type) && isSameDecisionTransition(transition, decision.decisionId)) return false;
    if (transition.type === "approval_requested" && isSameDecisionTransition(transition, decision.decisionId)) return false;
    if (transition.type === "approval_resolved" && isSameDecisionTransition(transition, decision.decisionId)) {
      return transition.payload?.decision !== "approve" || Boolean(String(transition.payload?.instructions || "").trim());
    }
    if (transition.type === "action_started" && isSameDecisionTransition(transition, decision.decisionId)) return false;
    return true;
  });
}

function createDecisionEvent(decision) {
  return {
    type: "agent-decision",
    decisionId: decision?.decisionId || "",
    decisionStatus: decision?.status || "",
    decisionType: decision?.type || DECISION_TYPES.INVALID,
    tool: decision?.tool?.name || "",
    providerCallId: decision?.tool?.providerCallId || "",
    intentId: decision?.intentId || "",
    basedOnStateVersion: Number(decision?.basedOnStateVersion) || 0,
    proposedAtStateVersion: decision?.proposedAtStateVersion ?? null,
    acceptedAtStateVersion: decision?.acceptedAtStateVersion ?? null,
    authorizedAtStateVersion: decision?.authorizedAtStateVersion ?? null,
    executedAtStateVersion: decision?.executedAtStateVersion ?? null,
    runtimeReasonCodes: uniqueCodes(decision?.runtimeReasonCodes),
    replacesDecisionId: decision?.replacesDecisionId || ""
  };
}

function createControllerBlockedContent(codes = []) {
  const suffix = uniqueCodes(codes).length ? ` Validation codes: ${uniqueCodes(codes).join(", ")}.` : "";
  return `The task could not continue because the Agent controller did not receive a valid next action after one repair attempt. No rejected action was executed.${suffix}`;
}

function createReportedBlockerContent(payload = {}) {
  const details = [
    `The task is blocked: ${stringValue(payload.description) || "No further valid action is available."}`,
    payload.requiredUserAction ? `Required user action: ${stringValue(payload.requiredUserAction)}` : "",
    payload.requiredCapability ? `Required capability: ${stringValue(payload.requiredCapability)}` : ""
  ].filter(Boolean);
  return details.join("\n\n");
}

module.exports = {
  CONTROL_TOOL_TYPES,
  DECISION_METADATA_KEY,
  DECISION_SCHEMA_VERSION,
  DECISION_TYPES,
  createControllerBlockedContent,
  createControllerInstructionMessage,
  createControllerToolDefinitions,
  createDecisionEvent,
  createRepairMessage,
  createReportedBlockerContent,
  findInvalidatingTransitions,
  normalizeDecisionAttempt,
  _test: { validateBlockedClaim, validateSchemaValue }
};
