/**
 * AI Companion provider preset catalog and settings-field helpers.
 */

(function(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.markdownViewerAiProviderPresets = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const PROVIDER_PRESETS = Object.freeze({
    openai: Object.freeze({
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-5.5",
      registryProviders: Object.freeze(["openai"])
    }),
    "google-gemini": Object.freeze({
      id: "google-gemini",
      label: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-3.6-flash",
      recommendedRequestDelayMs: 4500,
      registryProviders: Object.freeze(["google", "google-gemini"])
    }),
    "google-gemini-native": Object.freeze({
      id: "google-gemini-native",
      label: "Google Gemini (native)",
      // Native public Generative Language API — supports forced tool calls, unlike the
      // OpenAI-compat endpoint. Base URL is the API root (no /v1beta/openai suffix).
      baseUrl: "https://generativelanguage.googleapis.com",
      defaultModel: "gemini-3.6-flash",
      recommendedRequestDelayMs: 4500,
      registryProviders: Object.freeze(["google", "google-gemini"])
    }),
    anthropic: Object.freeze({
      id: "anthropic",
      label: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      defaultModel: "",
      registryProviders: Object.freeze(["anthropic"])
    }),
    xai: Object.freeze({
      id: "xai",
      label: "xAI Grok",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-4.5",
      registryProviders: Object.freeze(["xai"])
    }),
    ollama: Object.freeze({
      id: "ollama",
      label: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "qwen3.5",
      registryProviders: Object.freeze(["ollama", "meta (local)", "alibaba (local)", "deepseek (local)"])
    })
  });

  /**
   * Resolve a bundled provider preset.
   * @param {string} providerMode Selected AI Companion provider mode.
   * @returns {object|null} Immutable preset data, or null for custom and connector modes.
   */
  function getProviderPreset(providerMode) {
    return PROVIDER_PRESETS[String(providerMode || "")] || null;
  }

  /**
   * Replace a model datalist with suggestions for one bundled provider.
   * @param {string} providerMode Selected AI Companion provider mode.
   * @param {HTMLDataListElement|null} modelOptionsList Model suggestion datalist.
   * @param {object[]} registryModels Current rows from the AI Companion model registry.
   * @returns {string[]} Model identifiers added to the datalist.
   */
  function populateProviderModelSuggestions(providerMode, modelOptionsList, registryModels = []) {
    const preset = getProviderPreset(providerMode);
    const matchingProviders = new Set(
      preset ? Array.from(preset.registryProviders, (provider) => String(provider || "").trim().toLowerCase()) : []
    );
    const seenModelIds = new Set();
    const models = (Array.isArray(registryModels) ? registryModels : []).reduce((modelIds, model) => {
      const modelId = String(model?.id || "").trim();
      const provider = String(model?.provider || "").trim().toLowerCase();
      if (!modelId || !matchingProviders.has(provider) || seenModelIds.has(modelId)) return modelIds;
      seenModelIds.add(modelId);
      modelIds.push(modelId);
      return modelIds;
    }, []);
    if (!modelOptionsList) return models;
    const documentRef = modelOptionsList.ownerDocument || (typeof document !== "undefined" ? document : null);
    const options = documentRef
      ? models.map((model) => {
        const option = documentRef.createElement("option");
        option.value = model;
        return option;
      })
      : [];
    modelOptionsList.replaceChildren(...options);
    return models;
  }

  /**
   * Apply a bundled provider selection to the editable connection fields.
   * @param {string} providerMode Selected AI Companion provider mode.
   * @param {{baseUrlInput?: HTMLInputElement|null, modelInput?: HTMLInputElement|null, apiKeyInput?: HTMLInputElement|null, modelOptionsList?: HTMLDataListElement|null, requestDelayInput?: HTMLInputElement|null, registryModels?: object[]}} fields Settings controls to update.
   * @returns {object|null} Applied preset data, or null when the mode has no bundled preset.
   */
  function applyProviderPresetSelection(providerMode, fields = {}) {
    const preset = getProviderPreset(providerMode);
    populateProviderModelSuggestions(providerMode, fields.modelOptionsList, fields.registryModels);
    if (fields.apiKeyInput) fields.apiKeyInput.value = "";
    if (!preset) return null;
    if (fields.baseUrlInput) fields.baseUrlInput.value = preset.baseUrl;
    if (fields.modelInput) fields.modelInput.value = preset.defaultModel;
    if (fields.requestDelayInput && Number.isFinite(preset.recommendedRequestDelayMs)) {
      fields.requestDelayInput.value = String(preset.recommendedRequestDelayMs);
    }
    return preset;
  }

  return Object.freeze({
    presets: PROVIDER_PRESETS,
    getProviderPreset,
    populateProviderModelSuggestions,
    applyProviderPresetSelection
  });
});
