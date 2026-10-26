"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { runAutonomousLoop } = require("../resources/ai-companion/orchestration/autonomous/autonomous-loop");
const { CompanionOrchestrator } = require("../resources/ai-companion/orchestration");
const { CapabilityCatalog } = require("../resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog");
const { GoalCompletionEvaluator, parseDecision } = require("../resources/ai-companion/orchestration/autonomous/goal-completion-evaluator");
const { ToolFailureLoopGuard } = require("../resources/ai-companion/orchestration/autonomous/tool-failure-loop-guard");
const { describeWorkspaceContext, requireWorkspaceForTool } = require("../resources/ai-companion/orchestration/autonomous/workspace-context");

function request(overrides = {}) {
  return {
    action: "agent", prompt: "hi", workspaceRoot: process.cwd(), profileRoot: "",
    settings: { enabled: true, agentEnabled: true, agentMaxResponseTokens: 0 },
    ...overrides
  };
}

test("natural text is completed without being declared verified success", async () => {
  let calls = 0;
  const provider = { async completeMessage() { calls += 1; return { role: "assistant", content: "Hello!", toolCalls: [] }; } };
  const events = [];
  const result = await new AutonomousOrchestrator().run(request(), { provider }, (event) => events.push(event));
  assert.equal(result.content, "Hello!");
  assert.equal(calls, 1);
  assert.deepEqual(events.filter((event) => event.type === "assistant-final").map((event) => event.content), ["Hello!"]);
  const summaries = events.filter((event) => event.type === "agent-summary");
  assert.equal(summaries.length, 1);
  assert.equal(result.status, "completed");
  assert.equal(summaries[0].status, "completed");
});

test("Chat requests permit at most one transient provider retry", async () => {
  let requestOptions;
  const provider = { async completeMessage(_messages, options) {
    requestOptions = options;
    return { role: "assistant", content: "Hello!", toolCalls: [] };
  } };
  await new AutonomousOrchestrator().run(request({ action: "chat" }), { provider }, () => {});
  assert.equal(requestOptions.rateLimitMaxRetries, 1);
});

test("exact user slash workflow expands before the first provider call", async () => {
  let calls = 0;
  const events = [];
  const provider = { async completeMessage(messages) {
    calls += 1;
    assert.equal(messages.some((message) => message.role === "user" && message.content === "/develop-change add a status badge"), true);
    assert.equal(messages.some((message) => message.role === "system" && /workflow:develop-change/.test(message.content) && /smallest coherent change/i.test(message.content)), true);
    return { content: "I will follow the selected workflow.", toolCalls: [] };
  } };
  await new AutonomousOrchestrator().run(request({ prompt: "/develop-change add a status badge" }), { provider }, (event) => events.push(event));
  assert.equal(calls, 1);
  assert.equal(events.some((event) => event.type === "slash-workflow-expanded" && event.name === "develop-change"), true);
});

test("unknown exact slash workflow fails before calling the provider", async () => {
  let calls = 0;
  await assert.rejects(
    () => new AutonomousOrchestrator().run(request({ prompt: "/not-a-workflow" }), { provider: { async completeMessage() { calls += 1; } } }, () => {}),
    (error) => error.code === "UNKNOWN_SLASH_WORKFLOW"
  );
  assert.equal(calls, 0);
});

test("empty model completion receives one structural correction", async () => {
  let calls = 0;
  let correctionObserved = false;
  const provider = { async completeMessage(messages) {
    calls += 1;
    if (calls === 1) return { role: "assistant", content: "", finishReason: "stop", toolCalls: [] };
    correctionObserved = messages.some((message) => message.role === "system" && /neither final text nor a usable tool call/i.test(message.content));
    return { role: "assistant", content: "Recovered response.", finishReason: "stop", toolCalls: [] };
  } };
  const events = [];
  const result = await new AutonomousOrchestrator().run(request(), { provider }, (event) => events.push(event));
  assert.equal(result.content, "Recovered response.");
  assert.equal(calls, 2);
  assert.equal(correctionObserved, true);
  assert.equal(events.some((event) => event.type === "recovery-warning" && event.reason === "empty-model-response"), true);
});

test("two consecutive unusable responses fail instead of publishing a blank completion", async () => {
  const events = [];
  await assert.rejects(
    () => new AutonomousOrchestrator().run(request(), { provider: { completeMessage: async () => ({ content: "", finishReason: "stop", toolCalls: [] }) } }, (event) => events.push(event)),
    /unusable response twice/i
  );
  assert.equal(events.some((event) => event.type === "run-failed"), true);
  assert.equal(events.some((event) => event.type === "run-completed"), false);
  assert.equal(events.some((event) => event.type === "assistant-final"), false);
  const summaries = events.filter((event) => event.type === "agent-summary");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].status, "failure");
});

test("malformed tool-call finish receives one provider-neutral correction", async () => {
  let calls = 0;
  const provider = { async completeMessage(messages) {
    calls += 1;
    if (calls === 1) return { content: "", finishReason: "MALFORMED_FUNCTION_CALL", finishMessage: "Malformed function call", toolCalls: [] };
    assert.equal(messages.some((message) => message.role === "system" && /tool call was malformed/i.test(message.content)), true);
    return { content: "I could not perform the requested operation.", finishReason: "STOP", toolCalls: [] };
  } };
  const result = await new AutonomousOrchestrator().run(request(), { provider }, () => {});
  assert.equal(result.content, "I could not perform the requested operation.");
  assert.equal(calls, 2);
});

test("tool calls are observed and the model decides when to finish", async () => {
  let calls = 0;
  const provider = {
    async completeMessage() {
      calls += 1;
      if (calls === 1) return { role: "assistant", content: "", toolCalls: [{ id: "search", function: { name: "capability_search", arguments: JSON.stringify({ query: "select:work_create" }) } }] };
      if (calls === 2) return { role: "assistant", content: "", toolCalls: [{ id: "one", function: { name: "work_create", arguments: JSON.stringify({ subject: "Inspect", description: "Inspect the relevant files" }) } }] };
      return { role: "assistant", content: "Done.", toolCalls: [] };
    }
  };
  const events = [];
  await new AutonomousOrchestrator().run(request(), { provider }, (event) => events.push(event));
  assert.equal(calls, 3);
  assert.equal(events.some((event) => event.type === "tool-completed" && event.tool === "work_create"), true);
  assert.equal(events.filter((event) => event.type === "assistant-final").length, 1);
});

test("public companion entry point always uses the autonomous runtime", async () => {
  const provider = { completeMessage: async () => ({ content: "Ready.", toolCalls: [] }) };
  const result = await CompanionOrchestrator.run(request(), { provider }, () => {});
  assert.equal(result.content, "Ready.");
});

test("autonomous modules do not import legacy orchestration or M0-M11 controllers", () => {
  const root = path.join(__dirname, "../resources/ai-companion/orchestration/autonomous");
  const source = fs.readdirSync(root).filter((name) => name.endsWith(".js")).map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.doesNotMatch(source, /legacy-orchestrator|agent-tool-loop|agent-state|intent-contract|decision-controller|completion-assessment/);
});

test("tool failure handling preserves the original exception and effective input", async () => {
  let providerCalls = 0;
  const observedFailures = [];
  const emitted = [];
  const provider = {
    async completeMessage() {
      providerCalls += 1;
      if (providerCalls === 1) return {
        content: "",
        toolCalls: [{ id: "search-call", function: { name: "capability_search", arguments: JSON.stringify({ query: "workspace" }) } }]
      };
      return { content: "The original failure was reported.", toolCalls: [] };
    }
  };
  const context = {
    capabilities: {
      assertCallable() {}, consumeCatalogNotice: () => "", registration: () => null,
      search: () => [{ name: "read_file" }]
    },
    hooks: {
      drainContext: () => [],
      async run(event) {
        if (event === "after-tool") throw new Error("original post-tool failure");
        return { additionalContext: [] };
      }
    },
    runSummary: {
      recordToolCompleted() {},
      recordToolFailed(_tool, input, error) { observedFailures.push({ input, error: error.message }); },
      snapshot: () => ({ changedFiles: [], attemptedChanges: [], blockedChanges: [] })
    },
    windowSteward: { prepare: async () => ({ renewed: false }), recordUsage() {}, reportedTokens: 0 },
    observationLedger: { refresh() {}, register() {}, summary: () => ({}) },
    interactionGate: { acknowledgeToolResults: async () => {} },
    request: { workspaceRoot: "", settings: {} },
    saveSnapshot: async () => {},
    pendingTools: []
  };
  const result = await runAutonomousLoop({
    provider, messages: [], tools: [], request: { settings: {}, autonomousMaxRounds: 3 },
    events: { emit: (event) => emitted.push(event) }, context
  });
  assert.equal(result.status, "completed");
  assert.equal(result.content, "The original failure was reported.");
  assert.deepEqual(observedFailures, [{ input: { query: "workspace" }, error: "original post-tool failure" }]);
  assert.equal(emitted.some((event) => event.type === "tool-failed" && event.error === "original post-tool failure"), true);
  assert.equal(emitted.some((event) => /effectiveCall is not defined/.test(event.error || "")), false);
});

test("equivalent tool failures block while unrelated failures remain independent", () => {
  const guard = new ToolFailureLoopGuard();
  const first = new Error("missing");
  first.code = "ENOENT";
  assert.equal(guard.recordFailure("read_file", { path: "one.md" }, first), null);
  assert.equal(guard.recordFailure("read_file", { path: "two.md" }, first), null);
  assert.equal(guard.recordFailure("read_file", { path: "one.md" }, first), null);
  const blocker = guard.recordFailure("read_file", { path: "one.md" }, first);
  assert.equal(blocker.count, 3);
  assert.equal(blocker.target, "path:one.md");
  assert.equal(new ToolFailureLoopGuard(guard.snapshot()).blocker().count, 3);
});

test("capability names resolve only canonical names and explicit aliases", () => {
  const definition = { type: "function", function: { name: "request_user_choice", description: "Ask", parameters: { type: "object", properties: {} } } };
  const catalog = new CapabilityCatalog({
    policy: {}, fabric: {}, mcp: {},
    registrations: [{ definition, aliases: ["ask_user"], alwaysLoad: true }],
    knownToolNames: ["request_user_choice"]
  });
  assert.equal(catalog.canonicalName("ask_user"), "request_user_choice");
  assert.equal(catalog.assertCallable("ask_user").name, "request_user_choice");
  assert.throws(
    () => catalog.assertCallable("interaction:request_user_choice"),
    (error) => error.code === "TOOL_SCHEMA_UNKNOWN" && error.suggestedTool === "request_user_choice"
  );
});

test("workspace context keeps process cwd separate from workspace authority", () => {
  const context = describeWorkspaceContext({ workspaceRoot: "" });
  assert.equal(context.workspaceAvailable, false);
  assert.equal(context.workspaceRoot, "");
  assert.ok(path.isAbsolute(context.runtimeCwd));
  assert.throws(
    () => requireWorkspaceForTool({ workspaceRoot: "" }, "list_files"),
    (error) => error.code === "WORKSPACE_REQUIRED" && error.recoveryTool === "request_user_choice"
  );
});

test("goal completion evaluation is strict, bounded, and evidence-based", async () => {
  assert.equal(parseDecision("not json"), null);
  const provider = { completeMessage: async () => ({ content: JSON.stringify({ status: "complete", confidence: 0.9, reason: "Observed verification passed.", next_instruction: "" }) }) };
  const evaluator = new GoalCompletionEvaluator({ goal: "Verify the requested result." });
  const decision = await evaluator.evaluate({ provider, content: "Done.", evidence: { mutations: { changedFiles: [] } } });
  assert.equal(decision.status, "success");
  assert.equal(decision.verified, true);
});

test("three equivalent runtime tool failures publish a blocked outcome", async () => {
  let calls = 0;
  const events = [];
  const provider = { async completeMessage() {
    calls += 1;
    return {
      content: "",
      toolCalls: [{ id: `missing-${calls}`, function: { name: "missing_tool", arguments: JSON.stringify({ path: "same-target.md" }) } }]
    };
  } };
  const result = await new AutonomousOrchestrator().run(request({ autonomousMaxRounds: 5 }), { provider }, (event) => events.push(event));
  assert.equal(calls, 3);
  assert.equal(result.status, "blocked");
  assert.equal(events.some((event) => event.type === "tool-failure-loop-tripped"), true);
  assert.equal(events.some((event) => event.type === "run-blocked"), true);
  assert.equal(events.find((event) => event.type === "agent-summary")?.status, "blocked");
});

test("an explicit goal evaluator can promote completion to verified success", async () => {
  let calls = 0;
  const provider = { async completeMessage(messages) {
    calls += 1;
    if (/Evaluate whether the explicit goal/.test(messages[0]?.content || "")) {
      return { content: JSON.stringify({ status: "complete", confidence: 0.95, reason: "The observed answer satisfies the goal.", next_instruction: "" }), toolCalls: [] };
    }
    return { content: "The reviewed result is ready.", toolCalls: [] };
  } };
  const events = [];
  const result = await new AutonomousOrchestrator().run(request({ completionGoal: "Review and report the result." }), { provider }, (event) => events.push(event));
  assert.equal(calls, 2);
  assert.equal(result.status, "success");
  assert.equal(events.find((event) => event.type === "agent-summary")?.status, "success");
});
