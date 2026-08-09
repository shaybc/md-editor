/** Canonical filesystem location for user-scoped autonomous companion data. */

"use strict";

const path = require("node:path");

/**
 * Resolve the shared companion directory beneath an already resolved MD-Editor profile root.
 * @param {string} profileRoot Absolute MD-Editor profile directory.
 * @returns {string} Absolute companion directory, or an empty string when no profile exists.
 */
function companionProfileRoot(profileRoot) {
  return profileRoot ? path.join(String(profileRoot), "companion") : "";
}

/**
 * Resolve a user-scoped companion storage path.
 * @param {string} profileRoot Absolute MD-Editor profile directory.
 * @param {...string} segments Storage-specific child path segments.
 * @returns {string} Absolute child path, or an empty string when no profile exists.
 */
function companionProfilePath(profileRoot, ...segments) {
  const root = companionProfileRoot(profileRoot);
  return root ? path.join(root, ...segments) : "";
}

module.exports = { companionProfilePath, companionProfileRoot };
