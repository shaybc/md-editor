"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const experiment = require("../resources/js/ai-companion/intent-experiment");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");

test("intent experiment master switch disables every dimension", () => {
  assert.deepEqual(experiment.resolveIntentExperiment(experiment.ALL_ON, false), experiment.ALL_OFF);
  assert.deepEqual(normalizeAiCompanionSettings({ intentContractsEnabled: false }).intentExperiment, experiment.ALL_OFF);
});

test("intent experiment rejects incoherent dependent dimensions", () => {
  assert.throws(() => experiment.resolveIntentExperiment({
    intentExtraction: false,
    intentClarification: false,
    intentRevision: true,
    intentCompletionAssessment: false
  }, true, { rejectInvalid: true }), /intent-revision-requires-extraction/);
  assert.throws(() => experiment.resolveIntentExperiment({
    intentExtraction: false,
    intentClarification: false,
    intentRevision: false,
    intentCompletionAssessment: true
  }, true, { rejectInvalid: true }), /completion-assessment-requires-extraction/);
});

test("intent experiment assignment is deterministic for a chat", () => {
  const variants = [experiment.ALL_OFF, experiment.ALL_ON];
  assert.deepEqual(experiment.assignIntentExperiment("chat-42", variants), experiment.assignIntentExperiment("chat-42", variants));
});

test("browser and headless settings apply identical intent experiment normalization", () => {
  const context = { console, window: null, globalThis: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/intent-experiment.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/settings.js"), "utf8"), context);
  let browserApi;
  context.registerMarkdownViewerAiCompanionSettings({ registerModule(_name, api) { browserApi = api; } });
  const input = {
    intentContractsEnabled: true,
    intentExperiment: { intentExtraction: true, intentClarification: false, intentRevision: true, intentCompletionAssessment: false }
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(browserApi.normalize(input).intentExperiment)),
    normalizeAiCompanionSettings(input).intentExperiment
  );
});

test("M4 settings surface exposes and persists the user master switch", () => {
  const index = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const script = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");
  assert.match(index, /id="settings-ai-intent-contracts-enabled"/);
  assert.match(script, /settingsAiIntentContractsEnabledInput\.checked = aiSettings\.intentContractsEnabled === true/);
  assert.match(script, /intentContractsEnabled: !!settingsAiIntentContractsEnabledInput\?\.checked/);
});
