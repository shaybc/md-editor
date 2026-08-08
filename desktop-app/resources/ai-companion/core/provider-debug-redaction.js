/** Credential redaction for provider diagnostics before they reach application logs. */

"use strict";

const SENSITIVE_KEY = /(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|credential|x-goog-api-key)$/i;

/** Return a log-safe copy while preserving non-sensitive diagnostic structure. */
function redactProviderDebugValue(value, key = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(String(key || ""))) return "[redacted]";
  if (typeof value === "string") return redactCredentialText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactProviderDebugValue(item, "", seen));
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactProviderDebugValue(entryValue, entryKey, seen)]));
}

function redactCredentialText(value) {
  return String(value)
    .replace(/(Bearer\s+)[^\s,;"']+/gi, "$1[redacted]")
    .replace(/("(?:authorization|proxy-authorization|api[-_]?key|token|secret|password|credential|x-goog-api-key)"\s*:\s*")[^"]*/gi, "$1[redacted]");
}

module.exports = { redactCredentialText, redactProviderDebugValue };
