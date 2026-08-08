/** Provider and cancellation helpers shared by retained companion entry points. */

"use strict";

const { normalizeAiCompanionSettings } = require("../../config/defaults");
const { createProvider } = require("./provider-factory");

function estimateTokens(value) {
  return Math.ceil(String(value || "").length / 4);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

async function testConnection(settings, options = {}) {
  return createProvider(settings).testConnection({ signal: options.signal, onDebug: options.onDebug });
}

module.exports = {
  createProvider,
  estimateTokens,
  normalizeAiCompanionSettings,
  testConnection,
  throwIfAborted
};
