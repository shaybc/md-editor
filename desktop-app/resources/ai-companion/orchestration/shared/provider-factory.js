/** Provider construction shared by legacy and autonomous orchestrators. */

"use strict";

const { createOpenAiCompatibleProvider } = require("../../providers/openai-compatible");
const { createLiteLlmProvider } = require("../../providers/litellm");
const { createGeminiConnectorProvider } = require("../../providers/gemini-connector");
const { withProviderRateLimitGuard } = require("../../providers/provider-rate-limit-guard");

/**
 * Create the configured provider with connector-independent rate-limit recovery.
 * @param {object} settings Normalized provider settings.
 * @param {{onDebug?: function(object): void}} options Default provider diagnostics callback.
 * @returns {object} Provider used by either orchestration runtime.
 */
function createProvider(settings, options = {}) {
  let provider;
  if (settings.providerMode === "gemini-connector" || settings.providerMode === "gemini-connector-raw"
    || settings.providerMode === "google-gemini-native") provider = createGeminiConnectorProvider(settings);
  else provider = settings.providerMode === "litellm" ? createLiteLlmProvider(settings) : createOpenAiCompatibleProvider(settings);
  return withProviderRateLimitGuard(provider, { onDebug: options.onDebug });
}

module.exports = { createProvider };
