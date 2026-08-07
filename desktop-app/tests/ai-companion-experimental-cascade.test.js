"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCascade() {
  const src = fs.readFileSync(path.join(__dirname, "..", "resources", "js", "ai-companion", "experimental-settings.js"), "utf8");
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "experimental-settings.js" });
  return ctx.MarkdownViewerAiCompanionExperimentalCascade;
}

const { buildCascadePatch } = loadCascade();

test("turning on progress control enables its full prerequisite chain", () => {
  const patch = buildCascadePatch("agentProgressControlEnabled", true);
  assert.equal(patch.agentProgressControlEnabled, true);
  assert.equal(patch.agentProgressEvaluationEnabled, true);
  assert.equal(patch.agentVerifierCompletionEnabled, true);
  assert.equal(patch.agentDecisionControllerEnabled, true);
  assert.equal(patch.intentContractsEnabled, true);
});

test("turning on task-profile routing enables the decision controller", () => {
  const patch = buildCascadePatch("taskProfileRoutingEnabled", true);
  assert.equal(patch.taskProfileRoutingEnabled, true);
  assert.equal(patch.agentDecisionControllerEnabled, true);
});

test("turning on the intent provenance boundary enables intent contracts", () => {
  const patch = buildCascadePatch("intentProvenanceBoundaryEnabled", true);
  assert.equal(patch.intentContractsEnabled, true);
});

test("turning OFF the decision controller disables everything that depends on it", () => {
  const patch = buildCascadePatch("agentDecisionControllerEnabled", false);
  assert.equal(patch.agentDecisionControllerEnabled, false);
  assert.equal(patch.agentVerifierCompletionEnabled, false);
  assert.equal(patch.agentProgressEvaluationEnabled, false);
  assert.equal(patch.agentProgressControlEnabled, false);
  assert.equal(patch.agentDurableRecoveryEnabled, false);
  assert.equal(patch.taskProfileRoutingEnabled, false);
});

test("turning OFF intent contracts disables verifier/progress/provenance dependents", () => {
  const patch = buildCascadePatch("intentContractsEnabled", false);
  assert.equal(patch.intentContractsEnabled, false);
  assert.equal(patch.agentVerifierCompletionEnabled, false);
  assert.equal(patch.agentProgressEvaluationEnabled, false);
  assert.equal(patch.agentProgressControlEnabled, false);
  assert.equal(patch.intentProvenanceBoundaryEnabled, false);
  assert.equal(patch.chatVerifierCompletionEnabled, false);
});

test("a root flag with no prerequisites only toggles itself when enabled", () => {
  const patch = buildCascadePatch("planStatefulControllerEnabled", true);
  assert.deepEqual(Object.keys(patch), ["planStatefulControllerEnabled"]);
  assert.equal(patch.planStatefulControllerEnabled, true);
});

test("chat progress control cascades chat controller + intent contracts", () => {
  const patch = buildCascadePatch("chatProgressControlEnabled", true);
  assert.equal(patch.chatProgressEvaluationEnabled, true);
  assert.equal(patch.chatVerifierCompletionEnabled, true);
  assert.equal(patch.chatStatefulControllerEnabled, true);
  assert.equal(patch.intentContractsEnabled, true);
});
