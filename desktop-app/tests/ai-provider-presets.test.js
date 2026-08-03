const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const providerPresets = require("../resources/js/ai-companion/provider-presets");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { testConnection } = require("../resources/ai-companion/core/agent-runtime");

function loadBrowserSettings() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/settings.js"), "utf8");
  const context = { window: {}, globalThis: null };
  context.globalThis = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/intent-experiment.js"), "utf8"), context);
  vm.runInContext(source, context);
  let registered = null;
  context.window.registerMarkdownViewerAiCompanionSettings({
    registerModule(_name, api) {
      registered = api;
    }
  });
  return registered;
}

function createModelOptionsList() {
  return {
    children: [],
    ownerDocument: {
      createElement() {
        return { value: "" };
      }
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

test("AI provider presets expose the bundled endpoints, defaults, and model lists", () => {
  const expected = {
    openai: ["https://api.openai.com/v1", "gpt-5.5", [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4"
    ]],
    "google-gemini": ["https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.6-flash", [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3.1-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro"
    ]],
    anthropic: ["https://api.anthropic.com/v1", "claude-sonnet-5", ["claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]],
    xai: ["https://api.x.ai/v1", "grok-4.5", [
      "grok-4.5",
      "grok-4.3",
      "grok-4.20-reasoning",
      "grok-4.20",
      "grok-4.1-fast-reasoning",
      "grok-4.1-fast"
    ]],
    ollama: ["http://localhost:11434/v1", "qwen3.5", ["qwen3.5", "gpt-oss:20b", "qwen3:8b", "llama3.2", "gemma3"]]
  };

  for (const [providerMode, [baseUrl, defaultModel, models]] of Object.entries(expected)) {
    const preset = providerPresets.getProviderPreset(providerMode);
    assert.equal(preset.baseUrl, baseUrl);
    assert.equal(preset.defaultModel, defaultModel);
    assert.deepEqual(Array.from(preset.models), models);
  }
  assert.equal(providerPresets.getProviderPreset("google-gemini").recommendedRequestDelayMs, 4500);
  assert.equal(providerPresets.getProviderPreset("openai").recommendedRequestDelayMs, undefined);
  assert.equal(providerPresets.getProviderPreset("openai-compatible"), null);
});

test("applying a provider preset replaces endpoint and model suggestions and clears the API key", () => {
  const baseUrlInput = { value: "https://old.example/v1" };
  const modelInput = { value: "old-model" };
  const apiKeyInput = { value: "old-secret" };
  const requestDelayInput = { value: "1000" };
  const modelOptionsList = createModelOptionsList();

  providerPresets.applyProviderPresetSelection("google-gemini", {
    baseUrlInput,
    modelInput,
    apiKeyInput,
    modelOptionsList,
    requestDelayInput
  });

  assert.equal(baseUrlInput.value, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(modelInput.value, "gemini-3.6-flash");
  assert.equal(apiKeyInput.value, "");
  assert.equal(requestDelayInput.value, "4500");
  assert.deepEqual(modelOptionsList.children.map((option) => option.value), [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro"
  ]);
});

test("refreshing suggestions preserves saved and custom connection values", () => {
  const modelOptionsList = createModelOptionsList();
  const baseUrlInput = { value: "https://custom.example/v1" };
  const modelInput = { value: "private-model" };
  const apiKeyInput = { value: "saved-secret" };

  providerPresets.populateProviderModelSuggestions("openai", modelOptionsList);

  assert.equal(baseUrlInput.value, "https://custom.example/v1");
  assert.equal(modelInput.value, "private-model");
  assert.equal(apiKeyInput.value, "saved-secret");
  assert.deepEqual(modelOptionsList.children.map((option) => option.value), [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4"
  ]);
});

test("changing to an advanced provider clears only the general API key", () => {
  const baseUrlInput = { value: "https://proxy.example/v1" };
  const modelInput = { value: "custom-model" };
  const apiKeyInput = { value: "old-secret" };
  const requestDelayInput = { value: "2750" };

  providerPresets.applyProviderPresetSelection("litellm", { baseUrlInput, modelInput, apiKeyInput, requestDelayInput });

  assert.equal(baseUrlInput.value, "https://proxy.example/v1");
  assert.equal(modelInput.value, "custom-model");
  assert.equal(apiKeyInput.value, "");
  assert.equal(requestDelayInput.value, "2750");
});

test("browser and bridge settings preserve provider presets and legacy modes", () => {
  const browserSettings = loadBrowserSettings();
  const supportedModes = ["openai", "google-gemini", "anthropic", "xai", "ollama", "openai-compatible", "litellm", "gemini-connector", "gemini-connector-raw"];

  for (const providerMode of supportedModes) {
    assert.equal(browserSettings.normalize({ providerMode }).providerMode, providerMode);
    assert.equal(normalizeAiCompanionSettings({ providerMode }).providerMode, providerMode);
  }
  assert.equal(browserSettings.normalize({ providerMode: "unknown" }).providerMode, "openai-compatible");
  assert.equal(normalizeAiCompanionSettings({ providerMode: "unknown" }).providerMode, "openai-compatible");
});

test("connection tests route provider presets through their OpenAI-compatible endpoints", async () => {
  const requestedUrls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requestedUrls.push({ url, authorization: options.headers.Authorization });
    return {
      ok: true,
      status: 200,
      body: null,
      text: async () => JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })
    };
  };

  try {
    for (const preset of Object.values(providerPresets.presets)) {
      await testConnection({
        providerMode: preset.id,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel,
        apiKey: "provider-key",
        providerRequestDelayMs: 0
      });
    }
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(requestedUrls, Object.values(providerPresets.presets).map((preset) => ({
    url: `${preset.baseUrl}/chat/completions`,
    authorization: "Bearer provider-key"
  })));
});
