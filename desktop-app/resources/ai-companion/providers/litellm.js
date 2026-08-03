/**
 * LiteLLM proxy provider adapter.
 */

"use strict";

const { createOpenAiCompatibleProvider } = require("./openai-compatible");

function parseLiteLlmRoutingConfig(value) {
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LiteLLM routing config must be a JSON object.");
    return parsed;
  } catch (error) {
    throw new Error(`Invalid LiteLLM routing config: ${error?.message || String(error)}`);
  }
}

function createLiteLlmProvider(settings) {
  return createOpenAiCompatibleProvider({
    ...settings,
    model: settings.litellmModelAlias || settings.model,
    extraBody: parseLiteLlmRoutingConfig(settings.litellmRoutingConfig)
  });
}

module.exports = {
  createLiteLlmProvider,
  parseLiteLlmRoutingConfig
};