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
      models: Object.freeze([
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
        "gpt-5.5-pro",
        "gpt-5.4"
      ])
    }),
    "google-gemini": Object.freeze({
      id: "google-gemini",
      label: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-3.6-flash",
      recommendedRequestDelayMs: 4500,
      models: Object.freeze([
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-3.1-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro"
      ])
    }),
    anthropic: Object.freeze({
      id: "anthropic",
      label: "Anthropic Claude",
      baseUrl: "https://api.anthropic.com/v1",
      defaultModel: "claude-sonnet-5",
      models: Object.freeze(["claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"])
    }),
    xai: Object.freeze({
      id: "xai",
      label: "xAI Grok",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-4.5",
      models: Object.freeze([
        "grok-4.5",
        "grok-4.3",
        "grok-4.20-reasoning",
        "grok-4.20",
        "grok-4.1-fast-reasoning",
        "grok-4.1-fast"
      ])
    }),
    ollama: Object.freeze({
      id: "ollama",
      label: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "qwen3.5",
      models: Object.freeze(["qwen3.5", "gpt-oss:20b", "qwen3:8b", "llama3.2", "gemma3"])
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
   * @returns {string[]} Model identifiers added to the datalist.
   */
  function populateProviderModelSuggestions(providerMode, modelOptionsList) {
    const preset = getProviderPreset(providerMode);
    const models = preset ? Array.from(preset.models) : [];
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
   * @param {{baseUrlInput?: HTMLInputElement|null, modelInput?: HTMLInputElement|null, apiKeyInput?: HTMLInputElement|null, modelOptionsList?: HTMLDataListElement|null, requestDelayInput?: HTMLInputElement|null}} fields Settings controls to update.
   * @returns {object|null} Applied preset data, or null when the mode has no bundled preset.
   */
  function applyProviderPresetSelection(providerMode, fields = {}) {
    const preset = getProviderPreset(providerMode);
    populateProviderModelSuggestions(providerMode, fields.modelOptionsList);
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
