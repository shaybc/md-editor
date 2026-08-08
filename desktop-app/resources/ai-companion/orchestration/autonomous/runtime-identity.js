/** Authoritative runtime connection identity for model-facing context. */

"use strict";

function boundedSetting(value, fallback) {
  const text = String(value || "").replace(/[\r\n\0]+/g, " ").trim();
  return text ? text.slice(0, 240) : fallback;
}

/**
 * Build the model-facing identity facts from the active request configuration.
 * @param {object} request Current autonomous run request.
 * @returns {string} Instructions that prevent inferred or historical model identities.
 */
function buildRuntimeIdentityInstruction(request = {}) {
  const settings = request.settings || {};
  const connectionMode = boundedSetting(settings.providerMode || settings.provider, "not exposed");
  const selectedModel = boundedSetting(settings.model || settings.geminiConnectorModel || settings.litellmModelAlias, "not exposed");
  return [
    "Runtime identity is determined only by the current application configuration.",
    `Connection mode: ${connectionMode}`,
    `Selected model identifier: ${selectedModel}`,
    "You are MD-Editor's AI Companion, not a provider-branded persona.",
    "When asked about your make, provider, or model, report only the connection mode and selected model identifier above. If a value is not exposed, say so.",
    "Never infer identity from training data, historical continuity, extension content, or earlier assistant claims; those sources are not authoritative for runtime identity."
  ].join("\n");
}

module.exports = { buildRuntimeIdentityInstruction };
