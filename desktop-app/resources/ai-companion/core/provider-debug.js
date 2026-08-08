/**
 * Formats low-level provider request/response events (see providers/openai-compatible.js's
 * `onDebug` hook) into {level, message, details} shaped for the app's debug log, and wires
 * them onto a mode's `emit` callback as a `type: "debug"` bridge event.
 *
 * This exists because diagnosing "why did autocomplete/chat/agent produce nothing" from outside
 * the provider requires seeing the actual request/response cycle: which parameters a model
 * rejected, how many retries it took, and whether the final response came back empty (and why —
 * e.g. `finish_reason: "length"` on a reasoning model that spent its token budget on internal
 * reasoning before producing visible output).
 */

"use strict";

const { redactProviderDebugValue } = require("./provider-debug-redaction");

function formatProviderDebugEvent(event) {
  const kind = event?.kind || "";
  if (kind === "request") {
    const details = {
      provider: event.provider,
      pathname: event.pathname,
      url: event.url,
      method: event.method,
      mode: event.mode,
      model: event.model,
      trustedCertificateFingerprints: event.trustedCertificateFingerprints,
      bodyKeys: event.bodyKeys
    };
    if (typeof event.requestHeaders !== "undefined") details.requestHeaders = redactProviderDebugValue(event.requestHeaders);
    if (typeof event.requestBody !== "undefined") details.requestBody = redactProviderDebugValue(event.requestBody);
    return {
      level: "debug",
      message: `[ai-companion] Request sent (attempt ${(event.attempt || 0) + 1}) ${event.pathname || ""}`,
      details
    };
  }
  if (kind === "retry") {
    return {
      level: "info",
      message: `[ai-companion] Retrying after provider rejected a request field (fixup: ${event.fixup || "unknown"})`,
      details: { pathname: event.pathname, attempt: event.attempt, fixup: event.fixup }
    };
  }
  if (kind === "pace") {
    return {
      level: "debug",
      message: `[ai-companion] Waiting ${event.delayMs || 0}ms before next provider request`,
      details: redactProviderDebugValue(event)
    };
  }
  if (kind === "rate-limit-retry") {
    const source = event.delaySource ? `, source: ${event.delaySource}` : "";
    return {
      level: "warning",
      message: `[ai-companion] Rate limited; retrying after ${event.delayMs || 0}ms${source}`,
      details: redactProviderDebugValue(event)
    };
  }
  if (kind === "response") {
    const details = {
      provider: event.provider,
      pathname: event.pathname,
      url: event.url,
      mode: event.mode,
      status: event.status,
      error: event.error
    };
    if (typeof event.responseBody !== "undefined") details.responseBody = redactProviderDebugValue(event.responseBody);
    return {
      level: event.ok ? "debug" : "warning",
      message: `[ai-companion] Response ${event.ok ? "ok" : "error"} (attempt ${(event.attempt || 0) + 1}, status ${event.status})`,
      details
    };
  }
  if (kind === "result") {
    return {
      level: event.empty ? "warning" : "info",
      message: event.empty
        ? `[ai-companion] Completion came back EMPTY (finish_reason=${event.finishReason || "unknown"}) — likely truncated before producing visible output`
        : `[ai-companion] Completion received (${event.contentLength} chars, finish_reason=${event.finishReason || "unknown"})`,
      details: redactProviderDebugValue(event)
    };
  }
  if (kind === "error") {
    const details = {
      provider: event.provider,
      pathname: event.pathname,
      url: event.url,
      method: event.method,
      mode: event.mode,
      model: event.model,
      status: event.status,
      message: event.message,
      errorName: event.errorName,
      errorCode: event.errorCode,
      errorCause: event.errorCause,
      trustedCertificateFingerprints: event.trustedCertificateFingerprints,
      bodyKeys: event.bodyKeys
    };
    if (typeof event.requestHeaders !== "undefined") details.requestHeaders = redactProviderDebugValue(event.requestHeaders);
    if (typeof event.requestBody !== "undefined") details.requestBody = redactProviderDebugValue(event.requestBody);
    return {
      level: "error",
      message: `[ai-companion] Request failed: ${event.message || ""}`,
      details
    };
  }
  return { level: "debug", message: "[ai-companion] Provider event", details: redactProviderDebugValue(event) };
}

/**
 * Build an `onDebug(event)` callback that relays formatted provider events onto `emit` as
 * `type: "debug"` bridge messages. The client side (neutralino-ai-bridge.js) forwards these
 * straight to the app's debug log instead of treating them as request completion signals.
 * @param {function(object): void} emit Mode-handler emit function (from ai-companion-bridge.cjs).
 * @returns {function(object): void} Provider `onDebug` hook.
 */
function createProviderDebugEmitter(emit) {
  return function onDebug(event) {
    if (typeof emit !== "function") return;
    emit(Object.assign({ type: "debug" }, formatProviderDebugEvent(event)));
  };
}

module.exports = {
  formatProviderDebugEvent,
  createProviderDebugEmitter
};
