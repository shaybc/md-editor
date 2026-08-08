/** Workspace path normalization and bounded glob matching for scoped rules. */

"use strict";

const path = require("node:path");

/** Normalize one candidate to a workspace-relative forward-slash path. */
function normalizeWorkspacePath(workspaceRoot, candidate) {
  const root = path.resolve(String(workspaceRoot || ""));
  if (!root || !candidate) return "";
  const absolute = path.resolve(root, String(candidate));
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return "";
  return relative.replace(/\\/g, "/");
}

/** Return whether one normalized workspace path activates a parsed rule. */
function matchesRule(rule, workspacePath, options = {}) {
  const candidate = String(workspacePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!candidate || !rule.paths?.length) return false;
  const insensitive = options.caseInsensitive ?? process.platform === "win32";
  if (!rule.paths.some((pattern) => globToRegExp(pattern, insensitive).test(candidate))) return false;
  return !(rule.exclude || []).some((pattern) => globToRegExp(pattern, insensitive).test(candidate));
}

/** Estimate ordering specificity without assigning semantic authority. */
function patternSpecificity(pattern) {
  const value = String(pattern || "");
  return value.split("/").length * 100 + value.replace(/[?*]/g, "").length - (value.match(/\*\*/g) || []).length * 20;
}

function globToRegExp(pattern, insensitive = false) {
  const source = String(pattern || "").replace(/\\/g, "/").replace(/^\.\//, "");
  let expression = "^";
  for (let index = 0; index < source.length; index++) {
    if (source.slice(index, index + 3) === "**/") {
      expression += "(?:.*/)?";
      index += 2;
    } else if (source.slice(index, index + 2) === "**") {
      expression += ".*";
      index += 1;
    } else if (source[index] === "*") {
      expression += "[^/]*";
    } else if (source[index] === "?") {
      expression += "[^/]";
    } else {
      expression += source[index].replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
    }
  }
  return new RegExp(expression + "$", insensitive ? "i" : "");
}

module.exports = { globToRegExp, matchesRule, normalizeWorkspacePath, patternSpecificity };
