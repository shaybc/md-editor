"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { AutonomousOrchestrator } = require("../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { CompanionOrchestrator } = require("../resources/ai-companion/orchestration");

function request(overrides = {}) {
  return {
    action: "agent", prompt: "hi", workspaceRoot: process.cwd(), profileRoot: "",
    settings: { enabled: true, agentEnabled: true, agentMaxResponseTokens: 0 },
    ...overrides
  };
}

test("natural text completes without a tool or verifier call", async () => {
  let calls = 0;
  const provider = { async completeMessage() { calls += 1; return { role: "assistant", content: "Hello!", toolCalls: [] }; } };
  const events = [];
  const result = await new AutonomousOrchestrator().run(request(), { provider }, (event) => events.push(event));
  assert.equal(result.content, "Hello!");
  assert.equal(calls, 1);
  assert.deepEqual(events.filter((event) => event.type === "assistant-final").map((event) => event.content), ["Hello!"]);
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
      if (calls === 1) return { role: "assistant", content: "", toolCalls: [{ id: "one", function: { name: "work_create", arguments: JSON.stringify({ subject: "Inspect", description: "Inspect the relevant files" }) } }] };
      return { role: "assistant", content: "Done.", toolCalls: [] };
    }
  };
  const events = [];
  await new AutonomousOrchestrator().run(request(), { provider }, (event) => events.push(event));
  assert.equal(calls, 2);
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
