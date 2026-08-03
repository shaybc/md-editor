/**
 * Provider rate-limit retry metadata parsing and wait-policy calculations.
 */

"use strict";

const RETRY_SAFETY_BUFFER_MS = 1000;
const FALLBACK_RETRY_BASE_MS = 5000;
const MAX_RATE_LIMIT_RETRY_MS = 120000;
const REQUEST_PACE_SAFETY_MARGIN_MS = 500;
const ONE_MINUTE_MS = 60000;

function parseJsonErrorEntries(errorText) {
  try {
    const payload = JSON.parse(String(errorText || ""));
    const entries = Array.isArray(payload) ? payload : [payload];
    return entries.map((entry) => entry?.error || entry).filter((entry) => entry && typeof entry === "object");
  } catch (_error) {
    return [];
  }
}

function parseSecondsDurationMs(value) {
  const match = String(value || "").trim().match(/^([0-9]+(?:\.[0-9]+)?)s$/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds * 1000)) : null;
}

function parseRetryAfterHeaderMs(response) {
  const text = String(response?.headers?.get?.("retry-after") || "").trim();
  if (!text) return null;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const dateMs = Date.parse(text);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

function findStructuredRetryDelayMs(errorEntries) {
  const delays = [];
  for (const entry of errorEntries) {
    for (const detail of Array.isArray(entry.details) ? entry.details : []) {
      if (detail?.["@type"] !== "type.googleapis.com/google.rpc.RetryInfo") continue;
      const delayMs = parseSecondsDurationMs(detail.retryDelay);
      if (delayMs !== null) delays.push(delayMs);
    }
  }
  return delays.length ? Math.max(...delays) : null;
}

function findMessageRetryDelayMs(errorText, errorEntries) {
  const messages = [
    String(errorText || ""),
    ...errorEntries.map((entry) => String(entry.message || ""))
  ];
  const delays = [];
  for (const message of messages) {
    const pattern = /(?:please\s+retry|try\s+again)\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*s/ig;
    for (const match of message.matchAll(pattern)) {
      const delayMs = parseSecondsDurationMs(`${match[1]}s`);
      if (delayMs !== null) delays.push(delayMs);
    }
  }
  return delays.length ? Math.max(...delays) : null;
}

function findRequestQuota(errorEntries) {
  for (const entry of errorEntries) {
    for (const detail of Array.isArray(entry.details) ? entry.details : []) {
      if (detail?.["@type"] !== "type.googleapis.com/google.rpc.QuotaFailure") continue;
      for (const violation of Array.isArray(detail.violations) ? detail.violations : []) {
        const quotaValue = Number(violation?.quotaValue);
        return {
          metric: String(violation?.quotaMetric || ""),
          id: String(violation?.quotaId || ""),
          value: Number.isFinite(quotaValue) ? quotaValue : null,
          model: String(violation?.quotaDimensions?.model || ""),
          location: String(violation?.quotaDimensions?.location || "")
        };
      }
    }
  }
  return null;
}

/**
 * Calculate a conservative request interval from a requests-per-minute quota.
 * @param {object|null} quota Parsed provider quota violation.
 * @returns {number|null} Minimum request spacing in milliseconds, or null for unsupported quotas.
 */
function calculateAdaptiveRequestPaceMs(quota) {
  if (!quota || !/requestsperminute/i.test(String(quota.id || ""))) return null;
  const quotaValue = Number(quota.value);
  if (!Number.isFinite(quotaValue) || quotaValue <= 0) return null;
  return Math.ceil(ONE_MINUTE_MS / quotaValue) + REQUEST_PACE_SAFETY_MARGIN_MS;
}

/**
 * Resolve the provider-requested wait, fallback backoff, and quota-derived pacing for one 429.
 * @param {{response?: Response, errorText?: string, retryNumber?: number}} options Retry inputs.
 * @returns {{delayMs: number, providerDelayMs: number|null, delaySource: string, quota: object|null, adaptivePaceMs: number|null}}
 */
function createRateLimitRetryPlan(options = {}) {
  const errorEntries = parseJsonErrorEntries(options.errorText);
  const hints = [
    { source: "retry-after", delayMs: parseRetryAfterHeaderMs(options.response) },
    { source: "retry-info", delayMs: findStructuredRetryDelayMs(errorEntries) },
    { source: "error-message", delayMs: findMessageRetryDelayMs(options.errorText, errorEntries) }
  ].filter((hint) => hint.delayMs !== null);
  const providerHint = hints.reduce((longest, hint) => !longest || hint.delayMs > longest.delayMs ? hint : longest, null);
  const retryNumber = Math.max(1, Math.floor(Number(options.retryNumber) || 1));
  const fallbackDelayMs = Math.min(FALLBACK_RETRY_BASE_MS * (2 ** (retryNumber - 1)), MAX_RATE_LIMIT_RETRY_MS);
  const requestedDelayMs = providerHint?.delayMs ?? fallbackDelayMs;
  const quota = findRequestQuota(errorEntries);
  return {
    delayMs: Math.min(requestedDelayMs + RETRY_SAFETY_BUFFER_MS, MAX_RATE_LIMIT_RETRY_MS),
    providerDelayMs: providerHint?.delayMs ?? null,
    delaySource: providerHint?.source || "exponential-fallback",
    quota,
    adaptivePaceMs: calculateAdaptiveRequestPaceMs(quota)
  };
}

module.exports = {
  calculateAdaptiveRequestPaceMs,
  createRateLimitRetryPlan
};
