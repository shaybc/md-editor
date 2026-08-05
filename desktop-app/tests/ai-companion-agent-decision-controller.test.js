/**
 * M4 typed next-action controller tests.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const controller = require("../resources/ai-companion/core/agent-decision-controller");
const runtime = require("../resources/ai-companion/core/agent-runtime");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");
const { createInitialAgentState } = require("../resources/ai-companion/core/agent-state");

function metadata(expectedObservation = "The requested evidence") {
  return { intentId: "task", rationale: "Choose the smallest useful next action.", expectedObservation };
}

function toolCall(name, args, id = `call-${name}`, extra = {}) {
  const call = {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
    ...extra
  };
  return { ...call, raw: JSON.parse(JSON.stringify(call)) };
}

function createControllerSession(requestId, prompt, options = {}) {
  const session = createAgentStateShadow({ requestId, prompt, controlMode: "controller", ...options });
  session.configureContextSources({ requestId, prompt, systemPrompt: "You are the Agent." });
  return session;
}

async function runController(root, provider, session, options = {}) {
  const events = [];
  const emit = session.wrapEmit((event) => events.push(event));
  const settings = runtime.normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    intentContractsEnabled: false,
    agentConfirmBeforeWrite: true,
    maxTasksPerChat: 8
  });
  const content = await runtime.runAgentToolLoop(provider, settings, root, options.prompt || "Complete the task", "agent", emit, runtime, {
    requestId: options.requestId || "controller-test",
    systemPrompt: "You are the Agent.",
    skipIntentPhase: true,
    observeToolEvidence: session.observeToolEvidence,
    observeDecisionContext: session.observeDecisionContext,
    agentStateSession: session,
    requestApproval: options.requestApproval ? session.wrapApproval(options.requestApproval) : undefined,
    requestClarification: options.requestClarification ? session.wrapClarification(options.requestClarification) : undefined,
    signal: options.signal
  });
  return { content, events, state: session.getState() };
}

test("controller decorates native tools and strips metadata without losing provider fields", () => {
  const definitions = [{
    type: "function",
    function: {
      name: "read_file",
      parameters: { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string", minLength: 1, maxLength: 20, pattern: "^[^\\r\\n]+$" } } }
    }
  }];
  const decorated = controller.createControllerToolDefinitions(definitions);
  assert.equal(definitions[0].function.parameters.properties._decision, undefined, "shared definitions must remain unchanged");
  assert.ok(decorated[0].function.parameters.required.includes("_decision"));
  assert.deepEqual(decorated.slice(-3).map((entry) => entry.function.name), [
    "agent_request_user_input",
    "agent_propose_completion",
    "agent_report_blocked"
  ]);

  const state = createInitialAgentState({ runId: "normalize", controlMode: "controller" });
  const signature = { google: { thought_signature: "opaque" } };
  const result = controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("read_file", { path: "README.md", _decision: metadata("README contents") }, "read-1", { extra_content: signature })]
  }, definitions, state, { decisionId: "D1" });
  assert.deepEqual(result.validationCodes, []);
  assert.equal(result.decision.type, "tool_call");
  assert.deepEqual(JSON.parse(result.sanitizedToolCall.function.arguments), { path: "README.md" });
  assert.deepEqual(result.sanitizedToolCall.extra_content, signature);
  assert.deepEqual(result.sanitizedToolCall.raw.extra_content, signature);
  assert.ok(JSON.parse(result.sanitizedToolCall.raw.function.arguments)._decision, "raw provider metadata remains intact");

  const invalidOriginalArguments = controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("read_file", { path: "", unexpected: true, _decision: metadata("README contents") }, "read-2")]
  }, definitions, state, { decisionId: "D2" });
  assert.deepEqual(invalidOriginalArguments.validationCodes, ["invalid_tool_arguments"]);
});

test("controller rejects missing, multiple, malformed, and unsupported blocked decisions without retaining raw arguments", () => {
  const definitions = [{
    type: "function",
    function: { name: "read_file", parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } } }
  }];
  const state = createInitialAgentState({ runId: "invalid", controlMode: "controller" });
  assert.deepEqual(
    controller.normalizeDecisionAttempt({ toolCalls: [] }, definitions, state, { decisionId: "D1" }).validationCodes,
    ["missing_function_call"]
  );
  assert.deepEqual(
    controller.normalizeDecisionAttempt({
      toolCalls: [
        toolCall("read_file", { path: "a", _decision: metadata() }, "a"),
        toolCall("read_file", { path: "b", _decision: metadata() }, "b")
      ]
    }, definitions, state, { decisionId: "D2" }).validationCodes,
    ["multiple_function_calls"]
  );
  const malformed = controller.normalizeDecisionAttempt({
    toolCalls: [{ id: "bad", function: { name: "read_file", arguments: "{secret" } }]
  }, definitions, state, { decisionId: "D3" });
  assert.deepEqual(malformed.validationCodes, ["invalid_tool_arguments"]);
  assert.equal(JSON.stringify(malformed.decision).includes("secret"), false);
  assert.ok(controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("read_file", { path: "README.md" }, "missing-metadata")]
  }, definitions, state, { decisionId: "D3b" }).validationCodes.includes("missing_decision_metadata"));
  assert.ok(controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("read_file", {
      path: "README.md",
      _decision: { ...metadata(), status: "accepted" }
    }, "model-lifecycle")]
  }, definitions, state, { decisionId: "D3b-runtime" }).validationCodes.includes("invalid_decision_metadata"));
  assert.ok(controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("not_a_tool", { _decision: metadata() }, "unknown-tool")]
  }, definitions, state, { decisionId: "D3c" }).validationCodes.includes("unknown_tool"));

  const blocked = controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("agent_report_blocked", {
      _decision: metadata(""),
      blockerType: "missing_information",
      description: "Need a value",
      attemptedDecisionIds: [],
      recoverableByUser: true,
      requiredUserAction: "Provide it",
      requiredCapability: ""
    })]
  }, definitions, state, { decisionId: "D4", hasClarificationChannel: true });
  assert.ok(blocked.validationCodes.includes("use_request_user_input"));
});

test("blocked reports require internally consistent state evidence", () => {
  const definitions = [{
    type: "function",
    function: { name: "read_file", parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } } }
  }];
  const state = {
    ...createInitialAgentState({ runId: "blockers", controlMode: "controller" }),
    recentDecisions: [
      { decisionId: "denied", runtimeReasonCodes: ["authorization_denied"], observationIds: [] },
      { decisionId: "failed", runtimeReasonCodes: [], observationIds: ["observation-failed"] }
    ],
    recentObservations: [{ observationId: "observation-failed", outcome: "failed" }]
  };
  const report = (decisionId, payload, hasClarificationChannel = true) => controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("agent_report_blocked", { _decision: metadata(""), ...payload }, decisionId)]
  }, definitions, state, { decisionId, hasClarificationChannel });

  assert.deepEqual(report("permission", {
    blockerType: "permission_denied", description: "Write approval was denied", attemptedDecisionIds: ["denied"],
    recoverableByUser: true, requiredUserAction: "Approve the write", requiredCapability: ""
  }).validationCodes, []);
  assert.deepEqual(report("external", {
    blockerType: "external_failure", description: "The external read failed", attemptedDecisionIds: ["failed"],
    recoverableByUser: false, requiredUserAction: "", requiredCapability: ""
  }).validationCodes, []);
  assert.deepEqual(report("unavailable", {
    blockerType: "unavailable_capability", description: "No deployment function is available", attemptedDecisionIds: [],
    recoverableByUser: false, requiredUserAction: "", requiredCapability: "deploy_application"
  }).validationCodes, []);
  assert.deepEqual(report("missing", {
    blockerType: "missing_information", description: "A required value is absent", attemptedDecisionIds: [],
    recoverableByUser: false, requiredUserAction: "", requiredCapability: ""
  }, false).validationCodes, []);
  assert.ok(report("contradiction", {
    blockerType: "unavailable_capability", description: "Reading files is unavailable", attemptedDecisionIds: [],
    recoverableByUser: false, requiredUserAction: "", requiredCapability: "read_file"
  }).validationCodes.includes("contradictory_capability_blocker"));
});

test("controller requires a current materially different replan when progress control stalls", () => {
  const definitions = [{
    type: "function",
    function: { name: "search_text", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } }
  }];
  const state = createInitialAgentState({
    runId: "replan",
    controlMode: "controller",
    progressEvaluationEnabled: true,
    progressControlEnabled: true
  });
  state.progress.replanRequired = true;
  state.progress.lastControlAction = "require_replan";
  state.progress.recentAssessments = [{ assessmentId: "P1", status: "no_progress" }];

  const attempt = (revisedApproach) => controller.normalizeDecisionAttempt({
    toolCalls: [toolCall("search_text", {
      query: "parser callers",
      _decision: {
        ...metadata("Call sites of the parser"),
        strategyRevision: 1,
        replan: {
          triggerAssessmentIds: ["P1"],
          abandonedApproach: "Search for the parser",
          revisedApproach
        }
      }
    }, "replan-search")]
  }, definitions, state, { decisionId: "D-replan" });

  assert.ok(attempt("Search more carefully for the parser").validationCodes.some((code) =>
    ["unchanged_replan_approach", "superficial_replan_approach"].includes(code)));
  const valid = attempt("Trace callers from the parser entry point");
  assert.deepEqual(valid.validationCodes, []);
  assert.equal(valid.decision.strategyRevision, 1);
  assert.equal(valid.decision.replan.triggerAssessmentIds[0], "P1");
});

test("controller uses state-built context and executes one native tool per decision", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-controller-"));
  await fs.writeFile(path.join(root, "README.md"), "hello", "utf8");
  const session = createControllerSession("state-context", "List the workspace");
  const calls = [];
  let round = 0;
  const provider = {
    completeMessage: async (messages, options) => {
      calls.push({ messages: JSON.parse(JSON.stringify(messages)), options: JSON.parse(JSON.stringify({ toolChoice: options.toolChoice, tools: options.tools })) });
      round += 1;
      if (round === 1) return { content: "I will inspect the workspace.", toolCalls: [toolCall("glob", { pattern: "*", maxFiles: 10, _decision: metadata("Workspace file names") }, "list-1")] };
      return {
        content: "",
        toolCalls: [toolCall("agent_propose_completion", {
          _decision: metadata(""),
          content: "The workspace contains README.md.",
          evidenceIds: []
        }, "complete-1")]
      };
    }
  };
  try {
    const result = await runController(root, provider, session, { prompt: "List the workspace", requestId: "state-context" });
    assert.equal(result.content, "The workspace contains README.md.");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.toolChoice, "required");
    assert.ok(calls[0].options.tools.find((entry) => entry.function.name === "glob").function.parameters.required.includes("_decision"));
    assert.equal(calls[1].messages.some((message) => message.role === "tool"), false, "ordinary decisions must not reuse legacy tool turns");
    assert.match(calls[1].messages.map((message) => String(message.content || "")).join("\n"), /recentDecisions|recentObservations/);
    assert.deepEqual(result.state.recentDecisions.map((decision) => decision.status), ["executed", "executed"]);
    assert.equal(result.events.filter((event) => event.type === "tool" && event.summary === "running").length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("controller allows one content-safe repair and then blocks without executing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-repair-"));
  const session = createControllerSession("repair", "Do work");
  const calls = [];
  const provider = {
    completeMessage: async (messages) => {
      calls.push(JSON.parse(JSON.stringify(messages)));
      return { content: "text only", toolCalls: [] };
    }
  };
  try {
    const result = await runController(root, provider, session, { requestId: "repair" });
    assert.match(result.content, /did not receive a valid next action/i);
    assert.equal(calls.length, 2);
    assert.match(calls[1].at(-1).content, /missing_function_call/);
    assert.equal(JSON.stringify(calls[1]).includes("text only"), false);
    assert.equal(result.events.some((event) => event.type === "tool"), false);
    assert.equal(result.state.decisionCounts.rejected, 2);
    assert.equal(result.state.recentDecisions[1].replacesDecisionId, result.state.recentDecisions[0].decisionId);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("state change during approval supersedes the old decision and prevents its write", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-stale-"));
  const session = createControllerSession("stale", "Write a file");
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [toolCall("write_file", {
            path: "stale.txt",
            content: "must not be written",
            approvalReason: "Create the requested file.",
            _decision: metadata("The file is written")
          }, "write-stale")]
        };
      }
      return {
        content: "",
        toolCalls: [toolCall("agent_propose_completion", {
          _decision: metadata(""),
          content: "The original write was superseded and was not executed.",
          evidenceIds: []
        }, "complete-stale")]
      };
    }
  };
  const requestApproval = session.wrapApproval(async () => {
    session.applyControllerEvent("steering_observed", { revision: 1, reason: "User changed scope during approval." });
    return true;
  });
  try {
    const result = await runController(root, provider, session, { requestId: "stale", requestApproval });
    await assert.rejects(fs.access(path.join(root, "stale.txt")));
    assert.equal(result.state.recentDecisions[0].status, "superseded");
    assert.deepEqual(result.state.recentDecisions[0].runtimeReasonCodes, ["stale_state_version"]);
    assert.equal(result.state.recentDecisions[1].status, "executed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("plain approval authorizes the latest state and executes the write once", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-approved-"));
  const session = createControllerSession("approved", "Write a file");
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [toolCall("write_file", {
            path: "approved.txt",
            content: "written once",
            approvalReason: "Create the requested file.",
            _decision: metadata("The file is written")
          }, "write-approved")]
        };
      }
      return {
        content: "",
        toolCalls: [toolCall("agent_propose_completion", {
          _decision: metadata(""),
          content: "The approved file was written.",
          evidenceIds: []
        }, "complete-approved")]
      };
    }
  };
  try {
    const result = await runController(root, provider, session, {
      requestId: "approved",
      requestApproval: session.wrapApproval(async () => true)
    });
    assert.equal(await fs.readFile(path.join(root, "approved.txt"), "utf8"), "written once");
    assert.equal(result.state.recentDecisions[0].status, "executed");
    assert.ok(Number.isInteger(result.state.recentDecisions[0].authorizedAtStateVersion));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("durable mutation barriers are committed before dispatch and after observation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m7-barriers-"));
  const target = path.join(root, "durable.txt");
  const barriers = [];
  const session = createControllerSession("durable-barriers", "Write a file", {
    checkpointBarrier: async ({ phase, state }) => {
      let fileExists = true;
      try { await fs.access(target); } catch (_error) { fileExists = false; }
      barriers.push({ phase, fileExists, stateVersion: state.stateVersion });
      return { artifactManifest: { refs: [] } };
    }
  });
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) return {
        content: "",
        toolCalls: [toolCall("write_file", {
          path: "durable.txt",
          content: "durable",
          approvalReason: "Create the requested file.",
          _decision: metadata("The file is durably written")
        }, "write-durable")]
      };
      return {
        content: "",
        toolCalls: [toolCall("agent_propose_completion", {
          _decision: metadata(""),
          content: "The durable file was written.",
          evidenceIds: []
        }, "complete-durable")]
      };
    }
  };
  try {
    await runController(root, provider, session, {
      requestId: "durable-barriers",
      requestApproval: async () => true
    });
    assert.equal(await fs.readFile(target, "utf8"), "durable");
    const prepared = barriers.find((entry) => entry.phase === "action_prepared");
    const dispatching = barriers.find((entry) => entry.phase === "action_dispatching");
    const observed = barriers.find((entry) => entry.phase === "action_observed");
    assert.equal(prepared.fileExists, false);
    assert.equal(dispatching.fileExists, false);
    assert.equal(observed.fileExists, true);
    assert.ok(barriers.indexOf(prepared) < barriers.indexOf(dispatching));
    assert.ok(barriers.indexOf(dispatching) < barriers.indexOf(observed));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("denied approval rejects the decision and executes no mutation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-denied-"));
  const session = createControllerSession("approval-denied", "Create denied.txt");
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) return {
        content: "",
        toolCalls: [toolCall("write_file", {
          path: "denied.txt",
          content: "must not exist",
          approvalReason: "Create the requested file.",
          _decision: metadata("The file is created")
        }, "write-denied")]
      };
      return {
        content: "",
        toolCalls: [toolCall("agent_report_blocked", {
          _decision: metadata(""),
          blockerType: "permission_denied",
          description: "The requested write was denied.",
          attemptedDecisionIds: ["approval-denied:decision:1"],
          recoverableByUser: true,
          requiredUserAction: "Approve the write.",
          requiredCapability: ""
        }, "blocked-denied")]
      };
    }
  };
  try {
    const result = await runController(root, provider, session, { requestApproval: async () => false, requestId: "approval-denied" });
    assert.match(result.content, /denied/i);
    await assert.rejects(fs.access(path.join(root, "denied.txt")), /ENOENT/);
    const denied = result.state.recentDecisions.find((decision) => decision.decisionId === "approval-denied:decision:1");
    assert.equal(denied.status, "rejected");
    assert.ok(denied.runtimeReasonCodes.includes("authorization_denied"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("controller clarification preserves the user response verbatim before rebuilding context", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-clarification-"));
  const session = createControllerSession("clarification", "Use my chosen value");
  const answer = "Use Value-X exactly; keep punctuation!";
  const calls = [];
  const provider = {
    completeMessage: async (messages) => {
      calls.push(JSON.parse(JSON.stringify(messages)));
      if (calls.length === 1) return {
        content: "",
        toolCalls: [toolCall("agent_request_user_input", {
          _decision: metadata("The user supplies the required value"),
          question: "Which value should be used?",
          reason: "The prompt does not name it.",
          answerType: "free_text",
          choices: []
        }, "clarify")]
      };
      return {
        content: "",
        toolCalls: [toolCall("agent_propose_completion", {
          _decision: metadata(""),
          content: `The selected value is ${answer}`,
          evidenceIds: []
        }, "complete")]
      };
    }
  };
  try {
    const result = await runController(root, provider, session, { requestClarification: async () => answer });
    assert.match(result.content, /Value-X exactly; keep punctuation!/);
    assert.equal(result.state.interactions.find((interaction) => interaction.kind === "clarification")?.response, answer);
    assert.ok(JSON.stringify(calls[1]).includes(answer));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("cancellation returned from approval prevents the pending mutation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m4-cancel-"));
  const session = createControllerSession("cancel", "Write a file");
  const abortController = new AbortController();
  const provider = {
    completeMessage: async () => ({
      content: "",
      toolCalls: [toolCall("write_file", {
        path: "cancelled.txt",
        content: "must not exist",
        approvalReason: "Create the requested file.",
        _decision: metadata("The file is written")
      }, "write-cancelled")]
    })
  };
  try {
    await assert.rejects(
      runController(root, provider, session, {
        requestId: "cancel",
        signal: abortController.signal,
        requestApproval: session.wrapApproval(async () => {
          abortController.abort();
          return true;
        })
      }),
      /cancelled/i
    );
    await assert.rejects(fs.access(path.join(root, "cancelled.txt")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
