"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { runPlanStatefulController } = require("../resources/ai-companion/core/plan-stateful-controller");
const { PLAN_ARTIFACT_SCHEMA_VERSION } = require("../resources/ai-companion/core/plan-artifact-schema");

const ALLOWED = new Set(["read_file", "search_text"]);

function scriptedDecisions(list) {
  let i = 0;
  return async () => {
    const next = list[i] || { type: "report_blocked", blockerType: "external_failure", description: "script exhausted" };
    i += 1;
    return next;
  };
}

function readObservation(toolName, args) {
  return { tool: toolName, args, result: "content", evidenceEntry: { summary: `${toolName} ok`, files: [args.path || "x"], id: `ev-${toolName}-${args.path || "x"}` } };
}

function goodArtifact() {
  return {
    schemaVersion: PLAN_ARTIFACT_SCHEMA_VERSION,
    title: "Add logout",
    goal: "Sign out from navbar",
    requirements: [{ id: "R1", statement: "Add a logout button to the navbar.", source: "user", required: true }],
    steps: [{
      id: "S1", objective: "Add logout button", description: "Wire button to signOut()",
      requirementsCovered: ["R1"], affectedAreas: ["navbar"], filesOrComponents: ["src/nav.js"],
      actions: ["edit src/nav.js"], validations: ["click logout returns to login"], evidenceRefs: ["ev-read_file-src/nav.js"]
    }],
    sequencing: { orderedStepIds: ["S1"], parallelGroups: [] },
    unresolvedQuestions: []
  };
}

test("happy path: inspect, propose, verify, complete, and save once", async () => {
  const saved = [];
  const result = await runPlanStatefulController(
    { prompt: "Add a logout button to the navbar." },
    {
      allowedToolNames: ALLOWED,
      requestDecision: scriptedDecisions([
        { type: "tool_call", toolName: "read_file", args: { path: "src/nav.js" } },
        { type: "propose_plan_completion", artifact: goodArtifact() }
      ]),
      executeReadOnlyTool: async (toolName, args) => readObservation(toolName, args),
      savePlan: async (body) => { saved.push(body); return "plan-1"; }
    }
  );
  assert.equal(result.outcome, "succeeded");
  assert.match(result.content, /^# Add logout/);
  assert.equal(result.savedPlanRef, "plan-1");
  assert.equal(saved.length, 1, "plan is saved exactly once");
});

test("report_blocked terminates as blocked with no saved plan", async () => {
  const result = await runPlanStatefulController(
    { prompt: "Add a logout button." },
    {
      allowedToolNames: ALLOWED,
      requestDecision: scriptedDecisions([{ type: "report_blocked", blockerType: "missing_information", description: "no repo" }]),
      executeReadOnlyTool: async () => readObservation("read_file", {}),
      savePlan: async () => "should-not-happen"
    }
  );
  assert.equal(result.outcome, "blocked");
  assert.equal(result.savedPlanRef, null);
  assert.doesNotMatch(result.content, /succeeded/i);
});

test("a mutating tool result fails the run instead of entering plan state", async () => {
  const result = await runPlanStatefulController(
    { prompt: "Add a logout button." },
    {
      allowedToolNames: new Set(["read_file", "write_file"]),
      requestDecision: scriptedDecisions([{ type: "tool_call", toolName: "read_file", args: { path: "a" } }]),
      // The tool unexpectedly reports a workspace write — must be rejected.
      executeReadOnlyTool: async () => ({ tool: "write_file", args: { path: "a" }, result: "ok", evidenceEntry: { summary: "wrote" } })
    }
  );
  assert.equal(result.outcome, "failed");
});

test("provisional (complex) requirements need a clarification before success", async () => {
  const complexPrompt = "Add auth, then migrate the DB, and also maybe refactor the UI";
  // Without clarification, a proposal cannot succeed (provisional unconfirmed).
  const artifact = goodArtifact();
  // Cover the derived clauses generically by proposing a plan whose steps cover R1..Rn is hard;
  // instead assert the run does not falsely succeed when requirements are provisional.
  const noConfirm = await runPlanStatefulController(
    { prompt: complexPrompt },
    {
      allowedToolNames: ALLOWED,
      requestDecision: scriptedDecisions([
        { type: "propose_plan_completion", artifact },
        { type: "report_blocked", blockerType: "missing_information", description: "needs confirmation" }
      ]),
      executeReadOnlyTool: async (t, a) => readObservation(t, a)
    }
  );
  assert.notEqual(noConfirm.outcome, "succeeded");
});

test("budget exhaustion terminates honestly", async () => {
  const result = await runPlanStatefulController(
    { prompt: "Add a logout button." },
    {
      allowedToolNames: ALLOWED,
      budgets: { maxDecisions: 3, noProgressThreshold: 99 },
      // Endlessly repeat the same read — never proposes completion.
      requestDecision: async () => ({ type: "tool_call", toolName: "read_file", args: { path: "same.js" } }),
      executeReadOnlyTool: async (t, a) => readObservation(t, a)
    }
  );
  assert.equal(result.outcome, "budget_exhausted");
});

test("fails closed when required dependencies are missing", async () => {
  await assert.rejects(
    () => runPlanStatefulController({ prompt: "x" }, { executeReadOnlyTool: async () => ({}) }),
    /requires a requestDecision/
  );
});
