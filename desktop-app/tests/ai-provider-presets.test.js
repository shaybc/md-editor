const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const providerPresets = require("../resources/js/ai-companion/provider-presets");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { BUILTIN_MODELS: bridgeBuiltinModels } = require("../resources/ai-companion/config/model-registry");
const { testConnection } = require("../resources/ai-companion/core/agent-runtime");

const formerPresetModels = {
  openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4"],
  "google-gemini": ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  anthropic: ["claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  xai: ["grok-4.5", "grok-4.3", "grok-4.20-reasoning", "grok-4.20", "grok-4.1-fast-reasoning", "grok-4.1-fast"],
  ollama: ["qwen3.5", "gpt-oss:20b", "qwen3:8b", "llama3.2", "gemma3"]
};

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

function loadBrowserModelRegistry() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/model-registry.js"), "utf8");
  const context = {
    window: {
      localStorage: {
        getItem() { return ""; },
        setItem() {}
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  let registered = null;
  context.window.registerMarkdownViewerAiCompanionModelRegistry({
    registerModule(_name, api) {
      registered = api;
    }
  });
  return registered;
}

const browserModelRegistry = loadBrowserModelRegistry();

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

test("AI provider presets expose bundled connection values and registry provider aliases", () => {
  const expected = {
    openai: ["https://api.openai.com/v1", "gpt-5.5", ["openai"]],
    "google-gemini": ["https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.6-flash", ["google", "google-gemini"]],
    anthropic: ["https://api.anthropic.com/v1", "claude-sonnet-5", ["anthropic"]],
    xai: ["https://api.x.ai/v1", "grok-4.5", ["xai"]],
    ollama: ["http://localhost:11434/v1", "qwen3.5", ["ollama", "meta (local)", "alibaba (local)", "deepseek (local)"]]
  };

  for (const [providerMode, [baseUrl, defaultModel, registryProviders]] of Object.entries(expected)) {
    const preset = providerPresets.getProviderPreset(providerMode);
    assert.equal(preset.baseUrl, baseUrl);
    assert.equal(preset.defaultModel, defaultModel);
    assert.deepEqual(Array.from(preset.registryProviders), registryProviders);
    assert.equal(preset.models, undefined);
  }
  assert.equal(providerPresets.getProviderPreset("google-gemini").recommendedRequestDelayMs, 4500);
  assert.equal(providerPresets.getProviderPreset("openai").recommendedRequestDelayMs, undefined);
  assert.equal(providerPresets.getProviderPreset("openai-compatible"), null);
});

test("former provider preset models are included in both builtin registries", () => {
  const browserIds = new Set(browserModelRegistry.builtinModels.map((model) => model.id));
  const bridgeIds = new Set(bridgeBuiltinModels.map((model) => model.id));
  for (const modelId of Object.values(formerPresetModels).flat()) {
    assert.equal(browserIds.has(modelId), true, `${modelId} missing from browser registry`);
    assert.equal(bridgeIds.has(modelId), true, `${modelId} missing from bridge registry`);
  }
  assert.deepEqual(
    Array.from(browserModelRegistry.builtinModels, (model) => ({ ...model })),
    bridgeBuiltinModels.map((model) => ({ ...model }))
  );
});

test("version 1 registries add missing connection provider models without replacing custom rows", () => {
  const normalized = browserModelRegistry.normalizeRegistryPayload({
    version: 1,
    models: [{ id: "private-model", provider: "openai" }]
  });
  const normalizedIds = normalized.models.map((model) => model.id);
  assert.equal(normalized.version, 2);
  assert.equal(normalizedIds[0], "private-model");
  for (const modelIds of Object.values(formerPresetModels)) {
    for (const modelId of modelIds) assert.ok(normalizedIds.includes(modelId), `${modelId} should be migrated`);
  }
});

test("version 2 registries preserve user deletions without reinjecting builtin models", () => {
  const normalized = browserModelRegistry.normalizeRegistryPayload({
    version: 2,
    models: [{ id: "private-model", provider: "openai" }]
  });
  assert.deepEqual(normalized.models.map((model) => model.id), ["private-model"]);
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
    requestDelayInput,
    registryModels: browserModelRegistry.builtinModels
  });

  assert.equal(baseUrlInput.value, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(modelInput.value, "gemini-3.6-flash");
  assert.equal(apiKeyInput.value, "");
  assert.equal(requestDelayInput.value, "4500");
  assert.deepEqual(
    modelOptionsList.children.map((option) => option.value),
    Array.from(browserModelRegistry.builtinModels).filter((model) => model.provider === "google").map((model) => model.id)
  );
});

test("refreshing suggestions preserves saved and custom connection values", () => {
  const modelOptionsList = createModelOptionsList();
  const baseUrlInput = { value: "https://custom.example/v1" };
  const modelInput = { value: "private-model" };
  const apiKeyInput = { value: "saved-secret" };

  providerPresets.populateProviderModelSuggestions("openai", modelOptionsList, [
    { id: "private-model", provider: " OpenAI " },
    { id: "private-model", provider: "openai" },
    { id: "", provider: "openai" },
    { id: "google-model", provider: "google" }
  ]);

  assert.equal(baseUrlInput.value, "https://custom.example/v1");
  assert.equal(modelInput.value, "private-model");
  assert.equal(apiKeyInput.value, "saved-secret");
  assert.deepEqual(modelOptionsList.children.map((option) => option.value), ["private-model"]);
});

test("provider aliases select Google and local Ollama registry rows", () => {
  const modelOptionsList = createModelOptionsList();
  const registryModels = [
    { id: "gemini-alias", provider: "Google-Gemini" },
    { id: "ollama-model", provider: "ollama" },
    { id: "meta-model", provider: "META (LOCAL)" },
    { id: "alibaba-model", provider: "alibaba (local)" },
    { id: "deepseek-model", provider: "deepseek (local)" }
  ];

  assert.deepEqual(providerPresets.populateProviderModelSuggestions("google-gemini", null, registryModels), ["gemini-alias"]);
  assert.deepEqual(providerPresets.populateProviderModelSuggestions("ollama", modelOptionsList, registryModels), [
    "ollama-model",
    "meta-model",
    "alibaba-model",
    "deepseek-model"
  ]);
});

test("changing to an advanced provider clears only the general API key", () => {
  const baseUrlInput = { value: "https://proxy.example/v1" };
  const modelInput = { value: "custom-model" };
  const apiKeyInput = { value: "old-secret" };
  const requestDelayInput = { value: "2750" };
  const modelOptionsList = createModelOptionsList();
  modelOptionsList.children = [{ value: "old-suggestion" }];

  providerPresets.applyProviderPresetSelection("litellm", { baseUrlInput, modelInput, apiKeyInput, modelOptionsList, requestDelayInput, registryModels: browserModelRegistry.builtinModels });

  assert.equal(baseUrlInput.value, "https://proxy.example/v1");
  assert.equal(modelInput.value, "custom-model");
  assert.equal(apiKeyInput.value, "");
  assert.equal(requestDelayInput.value, "2750");
  assert.deepEqual(modelOptionsList.children, []);
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

  // The native Gemini preset is not OpenAI-compat; it is asserted separately below.
  const openAiCompatPresets = Object.values(providerPresets.presets).filter((preset) => preset.id !== "google-gemini-native");
  try {
    for (const preset of openAiCompatPresets) {
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

  assert.deepEqual(requestedUrls, openAiCompatPresets.map((preset) => ({
    url: `${preset.baseUrl}/chat/completions`,
    authorization: "Bearer provider-key"
  })));
});

test("the native Gemini preset routes through generateContent with x-goog-api-key", async () => {
  const preset = providerPresets.presets["google-gemini-native"];
  assert.ok(preset, "native preset exists");
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, apiKey: options.headers["x-goog-api-key"], authorization: options.headers.Authorization });
    return { ok: true, status: 200, body: null, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) };
  };
  try {
    await testConnection({ providerMode: preset.id, baseUrl: preset.baseUrl, model: preset.defaultModel, apiKey: "provider-key", providerRequestDelayMs: 0 });
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1beta\/models\/.+:generateContent$/);
  assert.equal(calls[0].apiKey, "provider-key");
  assert.equal(calls[0].authorization, undefined);
});
