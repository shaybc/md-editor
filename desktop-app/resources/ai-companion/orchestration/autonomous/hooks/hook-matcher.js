/** Safe matching for lifecycle automation definitions. */

"use strict";

/** Determine whether a hook matcher accepts an event payload. */
function matchesLifecycleHook(matcher = {}, payload = {}) {
  if (!matcher || typeof matcher !== "object") return true;
  if (!matchesPattern(matcher.tool, payload.tool || payload.call?.function?.name)) return false;
  if (!matchesPattern(matcher.mode, payload.mode)) return false;
  if (!matchesPattern(matcher.status, payload.status || payload.item?.status || payload.worker?.status)) return false;
  if (!matchesPattern(matcher.error, payload.error || payload.reason)) return false;
  if (!matchesPattern(matcher.path, payload.path)) return false;
  for (const [path, expected] of Object.entries(matcher.fields || {})) if (!matchesValue(expected, readPath(payload, path))) return false;
  return true;
}

function matchesPattern(pattern, value) {
  if (pattern == null || pattern === "") return true;
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((candidate) => wildcardMatch(String(candidate), String(value == null ? "" : value)));
}

function matchesValue(expected, actual) {
  if (Array.isArray(expected)) return expected.some((entry) => matchesValue(entry, actual));
  if (typeof expected === "string" && expected.includes("*")) return wildcardMatch(expected, String(actual == null ? "" : actual));
  return expected === actual || String(expected) === String(actual);
}

function wildcardMatch(pattern, value) {
  const expression = new RegExp(`^${String(pattern).split("*").map(escapeRegex).join(".*")}$`, "i");
  return expression.test(value);
}

function escapeRegex(value) { return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"); }
function readPath(value, path) { return String(path || "").split(".").filter(Boolean).reduce((current, key) => current?.[key], value); }

module.exports = { matchesLifecycleHook, readPath, wildcardMatch };
