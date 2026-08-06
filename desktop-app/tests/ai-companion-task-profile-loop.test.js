"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runtime = require("../resources/ai-companion/core/agent-runtime");
const { createAgentStateShadow } = require("../resources/ai-companion/core/agent-state-shadow");

function toolCall(name, args, id = `call-${name}`) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}
function metadata(expectedObservation = "evidence") {
  return { intentId: "task", rationale: "next action", expectedObservation };
}

async function runLoop(root, provider, prompt, settingsOverride) {
  const session = createAgentStateShadow({ requestId: "tp", prompt, controlMode: "controller" });
  session.configureContextSources({ requestId: "tp", prompt, systemPrompt: "You are the Agent." });
  const events = [];
  const emit = session.wrapEmit((event) => events.push(event));
  const settings = runtime.normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    intentContractsEnabled: false,
    taskProfileRoutingEnabled: true,
    toolScopes: { preferences_update: true, preferences_search: true, preferences_get: true },
    ...settingsOverride
  });
  const content = await runtime.runAgentToolLoop(provider, settings, root, prompt, "agent", emit, runtime, {
    requestId: "tp",
    systemPrompt: "You are the Agent.",
    skipIntentPhase: true,
    observeToolEvidence: session.observeToolEvidence,
    observeDecisionContext: session.observeDecisionContext,
    agentStateSession: session
  });
  return { content, events, state: session.getState() };
}

test("a certain preferences task restricts the tool surface and seeds the slice end-to-end", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m11-loop-"));
  const prompt = "Set aiCompanionSettings.chatStatefulControllerEnabled and aiCompanionSettings.chatVerifierCompletionEnabled to true";
  let round = 0;
  const seenToolNames = [];
  const provider = {
    completeMessage: async (messages, options) => {
      round += 1;
      seenToolNames.push((options.tools || []).map((t) => t.function.name));
      // End immediately; we are asserting the exposed surface + seed, not execution.
      return { content: "", toolCalls: [toolCall("agent_propose_completion", { _decision: metadata(""), content: "Done.", evidenceIds: [] }, "c1")] };
    }
  };
  try {
    const result = await runLoop(root, provider, prompt);

    // The very first exposed tool surface is restricted to the profile allow-list.
    const first = seenToolNames[0];
    assert.ok(first.includes("preferences_update"), "profile mutation tool exposed");
    assert.ok(first.includes("preferences_search"));
    assert.ok(!first.includes("glob"), "discovery tools hidden");
    assert.ok(!first.includes("read_file"));
    assert.ok(!first.includes("search_text"));

    // The reducer slice was seeded with the two explicit keys.
    assert.equal(result.state.taskProfile.profileId, "preferences-update");
    assert.deepEqual(result.state.taskProfile.taskState.requestedKeys.sort(), [
      "aiCompanionSettings.chatStatefulControllerEnabled",
      "aiCompanionSettings.chatVerifierCompletionEnabled"
    ]);
    assert.equal(result.state.actionReadiness.status, "incomplete"); // nothing resolved yet
    assert.ok(result.events.some((e) => e.type === "task-profile" && e.stage === "engaged"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("the profile does not engage when the flag is off (legacy surface intact)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-m11-off-"));
  const prompt = "Set aiCompanionSettings.chatStatefulControllerEnabled to true";
  const seenToolNames = [];
  const provider = {
    completeMessage: async (messages, options) => {
      seenToolNames.push((options.tools || []).map((t) => t.function.name));
      return { content: "", toolCalls: [toolCall("agent_propose_completion", { _decision: metadata(""), content: "Done.", evidenceIds: [] }, "c1")] };
    }
  };
  try {
    const result = await runLoop(root, provider, prompt, { taskProfileRoutingEnabled: false });
    assert.ok(seenToolNames[0].includes("glob"), "legacy discovery surface intact when flag off");
    assert.equal(result.state.taskProfile, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
