"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backend = require("../resources/ai-companion/config/defaults");

function loadBrowserSettings() {
  const context = { window: {} };
  context.window.MarkdownViewerIntentExperiment = { ALL_ON: {}, resolveIntentExperiment: () => ({}) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "resources", "js", "ai-companion", "settings.js"), "utf8"), context);
  let api;
  context.window.registerMarkdownViewerAiCompanionSettings({ registerModule: (_name, value) => { api = value; } });
  return api;
}

test("M6 flags remain hidden default-off and progress budgets are normalized", () => {
  const defaults = backend.DEFAULT_AI_COMPANION_SETTINGS;
  assert.equal(defaults.agentProgressEvaluationEnabled, false);
  assert.equal(defaults.agentProgressControlEnabled, false);
  assert.equal(defaults.agentNoProgressActionLimit, 3);
  assert.equal(defaults.agentMaxStrategyReplans, 2);
  const normalized = backend.normalizeAiCompanionSettings({
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    agentNoProgressActionLimit: 99,
    agentMaxStrategyReplans: -4
  });
  assert.equal(normalized.agentProgressEvaluationEnabled, true);
  assert.equal(normalized.agentProgressControlEnabled, true);
  assert.equal(normalized.agentNoProgressActionLimit, 10);
  assert.equal(normalized.agentMaxStrategyReplans, 0);
});

test("browser and backend M6 normalization remain identical", () => {
  const browser = loadBrowserSettings();
  for (const input of [{}, {
    agentProgressEvaluationEnabled: true,
    agentProgressControlEnabled: true,
    agentNoProgressActionLimit: 7,
    agentMaxStrategyReplans: 4
  }]) {
    const frontend = browser.normalize(input);
    const headless = backend.normalizeAiCompanionSettings(input);
    for (const key of ["agentProgressEvaluationEnabled", "agentProgressControlEnabled", "agentNoProgressActionLimit", "agentMaxStrategyReplans"]) {
      assert.equal(frontend[key], headless[key], key);
    }
  }
});
