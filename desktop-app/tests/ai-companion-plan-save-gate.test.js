"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsPromises = require("node:fs/promises");
const test = require("node:test");

const runtime = require("../resources/ai-companion/core/agent-runtime");
const planRepositoryTools = require("../resources/ai-companion/tools/plan-repository-tools");
const planMode = require("../resources/ai-companion/modes/plan");

// A non-git prompt so the Fix 2 capability gate proceeds straight to the loop.
const SAFE_PROMPT = "write a documentation section explaining the login flow";

async function runWithAssessment(assessmentEvent, extraSettings = { planRequireSuccessToSaveEnabled: true }) {
  const profileRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "md-editor-save-gate-"));
  const originalCreateProvider = runtime.createProvider;
  const originalRunLoop = runtime.runAgentToolLoop;
  const originalPlanCreate = planRepositoryTools.planCreate;
  let planCreateCalls = 0;
  runtime.createProvider = () => ({});
  runtime.runAgentToolLoop = async (...args) => {
    const emitFn = args[5];
    if (assessmentEvent) emitFn(assessmentEvent);
    return "# Plan\n\nBody";
  };
  planRepositoryTools.planCreate = async () => { planCreateCalls += 1; return { plan: { id: "plan-1" } }; };
  try {
    const result = await planMode.runPlanMode({
      settings: { enabled: true, ...extraSettings },
      prompt: SAFE_PROMPT,
      workspaceRoot: profileRoot,
      profileRoot
    }, () => {});
    return { result, planCreateCalls: () => planCreateCalls };
  } finally {
    runtime.createProvider = originalCreateProvider;
    runtime.runAgentToolLoop = originalRunLoop;
    planRepositoryTools.planCreate = originalPlanCreate;
    await fsPromises.rm(profileRoot, { recursive: true, force: true });
  }
}

test("an incomplete assessment prevents the plan from being saved", async () => {
  const { result, planCreateCalls } = await runWithAssessment({
    type: "completion-assessment",
    assessment: { overallStatus: "incomplete" },
    evidenceLedger: []
  });
  assert.equal(result.plan, null, "no plan object is returned");
  assert.equal(result.completionStatus, "incomplete");
  assert.equal(planCreateCalls(), 0, "planCreate must not be called for incomplete runs");
});

test("a complete assessment saves the plan exactly once", async () => {
  const { result, planCreateCalls } = await runWithAssessment({
    type: "completion-assessment",
    assessment: { overallStatus: "complete" },
    evidenceLedger: [{ id: "EV1", tool: "read_file" }]
  });
  assert.ok(result.plan, "a plan object is returned");
  assert.equal(result.completionStatus, "complete");
  assert.equal(planCreateCalls(), 1);
});

test("with no assessment (intent contracts off) legacy save behavior is preserved", async () => {
  const { result, planCreateCalls } = await runWithAssessment(null);
  assert.ok(result.plan, "back-compat: still saves when there is no verdict to gate on");
  assert.equal(planCreateCalls(), 1);
});

test("Fix 1 flag off: an incomplete run still saves (legacy behavior)", async () => {
  const { result, planCreateCalls } = await runWithAssessment(
    { type: "completion-assessment", assessment: { overallStatus: "incomplete" }, evidenceLedger: [] },
    { planRequireSuccessToSaveEnabled: false }
  );
  assert.ok(result.plan, "with the fix disabled, the plan saves as before");
  assert.equal(planCreateCalls(), 1);
});
