/**
 * Connector-independent retry guard for provider rate limits.
 */

"use strict";

const { createRateLimitRetryPlan } = require("./rate-limit-retry");

const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3;
const OPTION_ARGUMENT_INDEX = Object.freeze({ complete: 1, completeMessage: 1, completeRaw: 1, testConnection: 0 });

function createCancellationError() {
  return Object.assign(new Error("AI Companion request cancelled."), { name: "AbortError" });
}

/** Wait for a retry delay while remaining responsive to request cancellation. */
function waitForRetry(delayMs, signal) {
  const durationMs = Math.max(0, Math.floor(Number(delayMs) || 0));
  if (signal?.aborted) return Promise.reject(createCancellationError());
  if (!durationMs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", abort);
      resolve();
    }, durationMs);
    const abort = () => {
      clearTimeout(timer);
      reject(createCancellationError());
    };
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}

function optionsForOperation(operation, args) {
  const index = OPTION_ARGUMENT_INDEX[operation];
  const options = Number.isInteger(index) ? args[index] : null;
  return options && typeof options === "object" ? options : {};
}

function rateLimitStatus(error) {
  return Number(error?.providerStatus || error?.status || error?.statusCode || 0);
}

function normalizeRetryLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

/**
 * Add bounded 429 retry behavior to every model-request operation exposed by a connector.
 * @param {object} provider Connector implementation to protect.
 * @param {{onDebug?: function(object): void, maxRetries?: number, wait?: function(number, AbortSignal): Promise<void>}} options Retry dependencies.
 * @returns {object} Provider with the same public operations and connector-independent retry behavior.
 */
function withProviderRateLimitGuard(provider, options = {}) {
  if (!provider || typeof provider !== "object") return provider;
  const maxRetries = normalizeRetryLimit(options.maxRetries, DEFAULT_MAX_RATE_LIMIT_RETRIES);
  const defaultOnDebug = typeof options.onDebug === "function" ? options.onDebug : null;
  const wait = typeof options.wait === "function" ? options.wait : waitForRetry;
  let adaptivePaceMs = 0;
  let nextRequestAt = 0;
  let paceQueue = Promise.resolve();

  async function reserveAdaptiveRequest(signal, onDebug, operation) {
    if (!adaptivePaceMs) return;
    const previous = paceQueue.catch(() => {});
    const current = previous.then(async () => {
      const delayMs = Math.max(0, nextRequestAt - Date.now());
      if (delayMs) {
        onDebug?.({ kind: "pace", operation, delayMs, source: "rate-limit-quota" });
        await wait(delayMs, signal);
      }
      nextRequestAt = Date.now() + adaptivePaceMs;
    });
    paceQueue = current;
    await current;
  }

  function protectOperation(operation, invoke) {
    return async function protectedProviderOperation(...args) {
      const requestOptions = optionsForOperation(operation, args);
      const signal = requestOptions.signal;
      const onDebug = typeof requestOptions.onDebug === "function" ? requestOptions.onDebug : defaultOnDebug;
      const requestMaxRetries = normalizeRetryLimit(requestOptions.rateLimitMaxRetries, maxRetries);
      let retries = 0;
      while (true) {
        await reserveAdaptiveRequest(signal, onDebug, operation);
        try {
          return await invoke(...args);
        } catch (error) {
          if (rateLimitStatus(error) !== 429 || signal?.aborted) throw error;
          const retryPlan = createRateLimitRetryPlan({
            response: error.providerResponse,
            errorText: error.providerBody || error.message,
            retryNumber: retries + 1
          });
          if (!retryPlan.retryable) {
            onDebug?.({ kind: "rate-limit-stopped", operation, reason: retryPlan.retrySuppressedReason, quota: retryPlan.quota });
            throw error;
          }
          if (retries >= requestMaxRetries) throw error;
          retries += 1;
          if (retryPlan.adaptivePaceMs !== null) adaptivePaceMs = Math.max(adaptivePaceMs, retryPlan.adaptivePaceMs);
          onDebug?.({
            kind: "rate-limit-retry", operation,
            delayMs: retryPlan.delayMs, providerDelayMs: retryPlan.providerDelayMs,
            delaySource: retryPlan.delaySource, adaptivePaceMs: retryPlan.adaptivePaceMs,
            quota: retryPlan.quota, retry: retries, maxRetries: requestMaxRetries
          });
          await wait(retryPlan.delayMs, signal);
        }
      }
    };
  }

  const guarded = Object.create(Object.getPrototypeOf(provider));
  Object.assign(guarded, provider);
  for (const operation of Object.keys(OPTION_ARGUMENT_INDEX)) {
    if (typeof provider[operation] !== "function") continue;
    guarded[operation] = protectOperation(operation, provider[operation].bind(provider));
  }
  return guarded;
}

module.exports = { DEFAULT_MAX_RATE_LIMIT_RETRIES, waitForRetry, withProviderRateLimitGuard };
