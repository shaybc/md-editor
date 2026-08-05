"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsPromises = require("node:fs/promises");
const test = require("node:test");

const {
  detectRequiredCapabilities,
  unreachableCapabilities,
  interpretCapabilityAnswer,
  evaluatePlanCapabilityGate
} = require("../resources/ai-companion/core/plan-capability-map");
const runtime = require("../resources/ai-companion/core/agent-runtime");
const planCapabilityMap = require("../resources/ai-companion/core/plan-capability-map");
const planRepositoryTools = require("../resources/ai-companion/tools/plan-repository-tools");
const planMode = require("../resources/ai-companion/modes/plan");

const PLAN_TOOLS_NO_GIT = ["read_file", "search_grep", "list_files", "glob"];
const PLAN_TOOLS_WITH_GIT = [...PLAN_TOOLS_NO_GIT, "git_panel_status", "git_panel_changes_digest"];

/* ------------------------------------------------------------- pure logic */

test("detects git-inspection intent from natural prompts", () => {
  assert.deepEqual(detectRequiredCapabilities("document the uncommitted git changes"), ["inspect_git"]);
  assert.deepEqual(detectRequiredCapabilities("go over the latest changes that were not pushed or committed"), ["inspect_git"]);
  assert.deepEqual(detectRequiredCapabilities("summarize the staged diff"), ["inspect_git"]);
  assert.deepEqual(detectRequiredCapabilities("write a haiku about spring"), []);
});

test("unreachable when git required but git tools absent; reachable when present", () => {
  const required = ["inspect_git"];
  const missing = unreachableCapabilities(required, PLAN_TOOLS_NO_GIT);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].capability, "inspect_git");
  assert.equal(missing[0].userResolvable, true);
  assert.equal(unreachableCapabilities(required, PLAN_TOOLS_WITH_GIT).length, 0);
});

test("interpretCapabilityAnswer maps replies to proceed/stop/files/data", () => {
  assert.deepEqual(interpretCapabilityAnswer(""), { proceed: false, fromFilesOnly: false, suppliedData: "" });
  assert.deepEqual(interpretCapabilityAnswer("stop"), { proceed: false, fromFilesOnly: false, suppliedData: "" });
  assert.deepEqual(interpretCapabilityAnswer("files"), { proceed: true, fromFilesOnly: true, suppliedData: "" });
  const data = interpretCapabilityAnswer("M src/a.js\nA new.txt");
  assert.equal(data.proceed, true);
  assert.equal(data.fromFilesOnly, false);
  assert.match(data.suppliedData, /new\.txt/);
});

test("gate: proceed when reachable, ask when resolvable+canAsk, block when cannot ask", () => {
  const gitPrompt = "document the uncommitted git changes in help files";
  assert.equal(evaluatePlanCapabilityGate({ prompt: gitPrompt, availableToolNames: PLAN_TOOLS_WITH_GIT, canAsk: true }).action, "proceed");
  assert.equal(evaluatePlanCapabilityGate({ prompt: gitPrompt, availableToolNames: PLAN_TOOLS_NO_GIT, canAsk: true }).action, "ask");
  assert.equal(evaluatePlanCapabilityGate({ prompt: gitPrompt, availableToolNames: PLAN_TOOLS_NO_GIT, canAsk: false }).action, "block");
  assert.equal(evaluatePlanCapabilityGate({ prompt: "unrelated task", availableToolNames: PLAN_TOOLS_NO_GIT, canAsk: true }).action, "proceed");
});

/* --------------------------------------------------------- wiring in plan mode */

// The block/ask WIRING is tested by stubbing the gate decision, so it stays
// valid regardless of which capabilities are reachable after Fix 3.
async function withMockedRuntime(gateResult, fn) {
  const profileRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-cap-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunLoop = runtime.runAgentToolLoop;
  const originalGate = planCapabilityMap.evaluatePlanCapabilityGate;
  const originalPlanCreate = planRepositoryTools.planCreate;
  let loopCalls = 0;
  let planCreateCalls = 0;
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async () => { loopCalls += 1; return "PLAN BODY"; };
  planRepositoryTools.planCreate = async () => { planCreateCalls += 1; return { plan: { id: "p1" } }; };
  if (gateResult) planCapabilityMap.evaluatePlanCapabilityGate = () => gateResult;
  try {
    return await fn({ profileRoot, loopCalls: () => loopCalls, planCreateCalls: () => planCreateCalls });
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunLoop;
    planCapabilityMap.evaluatePlanCapabilityGate = originalGate;
    planRepositoryTools.planCreate = originalPlanCreate;
    await fsPromises.rm(profileRoot, { recursive: true, force: true });
  }
}

test("Plan blocks (no loop, no save) when a required capability is unreachable and it cannot ask", async () => {
  const gate = { action: "block", unreachable: [{ description: "read git status/diff" }], question: null, reason: "cannot read git here" };
  await withMockedRuntime(gate, async ({ profileRoot, loopCalls, planCreateCalls }) => {
    const result = await planMode.runPlanMode({ settings: { enabled: true, planCapabilityGateEnabled: true }, prompt: "anything", workspaceRoot: profileRoot, profileRoot }, () => {});
    assert.equal(result.plan, null);
    assert.equal(result.blocked, true);
    assert.equal(loopCalls(), 0, "the model loop must not run when blocked");
    assert.equal(planCreateCalls(), 0, "nothing is saved when blocked");
  });
});

test("Plan asks and, on 'stop', cancels without running the loop or saving", async () => {
  const gate = { action: "ask", unreachable: [{ description: "read git status/diff" }], question: { ambiguityId: "plan-capability-gap", question: "Plan mode cannot read git status/diff directly. How should I proceed?" }, reason: "" };
  await withMockedRuntime(gate, async ({ profileRoot, loopCalls, planCreateCalls }) => {
    let asked = null;
    const result = await planMode.runPlanMode({
      settings: { enabled: true, planCapabilityGateEnabled: true },
      prompt: "anything",
      workspaceRoot: profileRoot,
      profileRoot,
      requestClarification: async (q) => { asked = q; return "stop"; }
    }, () => {});
    assert.ok(asked && /cannot/i.test(asked.question), "a capability question was asked");
    assert.equal(result.plan, null);
    assert.equal(result.blocked, true);
    assert.equal(loopCalls(), 0, "cancelling must not run the loop");
    assert.equal(planCreateCalls(), 0);
  });
});

test("with Fix 2 on but Fix 3 off, a git prompt is unreachable and the run asks", async () => {
  await withMockedRuntime(null, async ({ profileRoot, loopCalls }) => {
    let asked = null;
    const result = await planMode.runPlanMode({
      settings: { enabled: true, planCapabilityGateEnabled: true, planGitReadToolsEnabled: false },
      prompt: "document the uncommitted git changes",
      workspaceRoot: profileRoot,
      profileRoot,
      requestClarification: async (q) => { asked = q; return "stop"; }
    }, () => {});
    assert.ok(asked, "it asked because git is unreachable");
    assert.equal(result.blocked, true);
    assert.equal(loopCalls(), 0);
  });
});

test("with Fix 2 and Fix 3 both on, a git prompt is reachable and the run proceeds", async () => {
  await withMockedRuntime(null, async ({ profileRoot, loopCalls }) => {
    const result = await planMode.runPlanMode({
      settings: { enabled: true, planCapabilityGateEnabled: true, planGitReadToolsEnabled: true },
      prompt: "document the uncommitted git changes",
      workspaceRoot: profileRoot,
      profileRoot,
      requestClarification: async () => "stop"
    }, () => {});
    assert.notEqual(result.blocked, true, "git is reachable once Fix 3 is on");
    assert.equal(loopCalls(), 1, "the planning loop runs for a now-reachable task");
  });
});
