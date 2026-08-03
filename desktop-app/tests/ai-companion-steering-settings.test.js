"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backend = require("../resources/ai-companion/config/defaults");
const { STEERING_ACTIONS, STEERING_REASONS } = require("../resources/ai-companion/core/completion-steering");

// Load the browser settings module (an IIFE bound to window) in a vm sandbox and grab its
// { defaults, normalize } api, the same way the app wires it up.
function loadBrowserSettings() {
  const webRoot = path.join(__dirname, "..", "resources");
  const context = { window: {} };
  context.window.MarkdownViewerIntentExperiment = { ALL_ON: {}, resolveIntentExperiment: () => ({}) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "settings.js"), "utf8"), context);
  let api;
  context.window.registerMarkdownViewerAiCompanionSettings({ registerModule: (_name, value) => { api = value; } });
  return api;
}

test("backend defaults carry the steering settings", () => {
  const d = backend.normalizeAiCompanionSettings({});
  assert.equal(d.intentCompletionSteeringEnabled, true);
  assert.equal(d.intentMaxCompletionRevisions, 3);
  assert.equal(d.intentPerCriterionAssessment, true);
});

test("backend clamps and coerces the revision budget", () => {
  assert.equal(backend.normalizeAiCompanionSettings({ intentMaxCompletionRevisions: "99" }).intentMaxCompletionRevisions, 10);
  assert.equal(backend.normalizeAiCompanionSettings({ intentMaxCompletionRevisions: -5 }).intentMaxCompletionRevisions, 0);
  assert.equal(backend.normalizeAiCompanionSettings({ intentCompletionSteeringEnabled: false }).intentCompletionSteeringEnabled, false);
});

test("browser and backend normalizers agree on the steering settings (parity)", () => {
  const browser = loadBrowserSettings();
  for (const input of [{}, { intentCompletionSteeringEnabled: false, intentMaxCompletionRevisions: "99" }, { intentMaxCompletionRevisions: 2 }]) {
    const be = backend.normalizeAiCompanionSettings(input);
    const fe = browser.normalize(input);
    assert.equal(fe.intentCompletionSteeringEnabled, be.intentCompletionSteeringEnabled, "steering flag parity");
    assert.equal(fe.intentMaxCompletionRevisions, be.intentMaxCompletionRevisions, "revision budget parity");
    assert.equal(fe.intentPerCriterionAssessment, be.intentPerCriterionAssessment, "per-criterion flag parity");
  }
});

test("steering vocabulary is defined for Phase 1", () => {
  assert.deepEqual(STEERING_ACTIONS, ["continue", "revise-contract", "stop"]);
  for (const reason of ["unsatisfied", "blocked", "ambiguity", "spec-gap", "converged", "budget-exhausted"]) {
    assert.ok(STEERING_REASONS.includes(reason));
  }
});
