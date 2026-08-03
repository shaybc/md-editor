/**
 * Resolves layered AI security policy without allowing a lower-priority source
 * to broaden a managed or workspace restriction.
 */

"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { PRODUCT_DEFAULT_POLICY, clone, normalizePolicy } = require("./policy-schema");

function mergeObject(base, override) {
  const result = clone(base || {});
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) result[key] = mergeObject(result[key], value);
    else result[key] = clone(value);
  }
  return result;
}

function intersectLists(current, restriction) {
  if (!Array.isArray(restriction)) return current;
  if (!Array.isArray(current)) return clone(restriction);
  if (restriction.includes("*")) return current;
  if (current.includes("*")) return clone(restriction);
  const allowed = new Set(restriction.map((entry) => String(entry).toLowerCase()));
  return current.filter((entry) => allowed.has(String(entry).toLowerCase()));
}

function intersectWorkspaceRoots(current, restriction) {
  if (!Array.isArray(restriction)) return current;
  if (!Array.isArray(current)) return clone(restriction);
  const intersections = [];
  for (const left of current) {
    for (const right of restriction) {
      if (left === "*" || left === "${workspaceRoot}") intersections.push(right);
      else if (right === "*" || right === "${workspaceRoot}") intersections.push(left);
      else {
        const leftPath = path.resolve(left);
        const rightPath = path.resolve(right);
        if (leftPath === rightPath || leftPath.startsWith(rightPath + path.sep)) intersections.push(left);
        else if (rightPath.startsWith(leftPath + path.sep)) intersections.push(right);
      }
    }
  }
  return Array.from(new Set(intersections));
}

function intersectExecutables(current, restriction) {
  if (!Array.isArray(restriction)) return current;
  if (!Array.isArray(current)) return clone(restriction);
  const intersections = [];
  for (const left of current) {
    for (const right of restriction) {
      if (left === "*") intersections.push(right);
      else if (right === "*") intersections.push(left);
      else if (String(left).toLowerCase() === String(right).toLowerCase()) intersections.push(left);
      else if (path.basename(left).toLowerCase() === path.basename(right).toLowerCase()) {
        if (path.isAbsolute(left)) intersections.push(left);
        else if (path.isAbsolute(right)) intersections.push(right);
      }
    }
  }
  return Array.from(new Set(intersections));
}

function applyRestriction(policy, restriction, sourceName, lockedFields) {
  if (!restriction) return policy;
  const next = clone(policy);
  if (restriction.shell) {
    if (restriction.shell.mode === "deny-and-audit" || next.shell.mode !== "deny-and-audit") next.shell.mode = restriction.shell.mode || next.shell.mode;
    for (const key of ["approvalBehavior", "auditRequests", "auditOutcomes"]) {
      if (restriction.shell[key] != null) next.shell[key] = restriction.shell[key];
    }
    if (restriction.shell.timeoutMs != null) next.shell.timeoutMs = Math.min(next.shell.timeoutMs, restriction.shell.timeoutMs);
    if (restriction.shell.outputLimitBytes != null) next.shell.outputLimitBytes = Math.min(next.shell.outputLimitBytes, restriction.shell.outputLimitBytes);
  }
  if (restriction.execution) {
    next.execution.allowedWorkspaceRoots = intersectWorkspaceRoots(next.execution.allowedWorkspaceRoots, restriction.execution.allowedWorkspaceRoots);
    next.execution.allowedExecutables = intersectExecutables(next.execution.allowedExecutables, restriction.execution.allowedExecutables);
    next.execution.allowedEnvironmentVariables = intersectLists(next.execution.allowedEnvironmentVariables, restriction.execution.allowedEnvironmentVariables);
    if (restriction.execution.networkAccess === false) next.execution.networkAccess = false;
    if (restriction.execution.concurrency != null) next.execution.concurrency = Math.min(next.execution.concurrency, restriction.execution.concurrency);
  }
  if (restriction.packages) {
    if (Array.isArray(restriction.packages.rules)) {
      next.packages.ruleSets = Array.isArray(next.packages.ruleSets) ? next.packages.ruleSets : [clone(next.packages.rules || [])];
      next.packages.ruleSets.push(clone(restriction.packages.rules));
      next.packages.rules = clone(restriction.packages.rules);
    }
    if (restriction.packages.allowTransitiveDependencies === false) next.packages.allowTransitiveDependencies = false;
  }
  if (restriction.packageBinaries) {
    for (const key of ["npx", "yarnDlx", "pnpmDlx"]) {
      if (restriction.packageBinaries[key] === false) next.packageBinaries[key] = false;
    }
  }
  if (restriction.approvals) {
    next.approvals = next.approvals || {};
    next.approvals.allowedCapabilities = intersectLists(next.approvals.allowedCapabilities, restriction.approvals.allowedCapabilities);
    const rank = { action: 0, task: 1, workspace: 2 };
    next.approvals.maximumGrantLifetime = { ...(next.approvals.maximumGrantLifetime || {}) };
    for (const [capability, lifetime] of Object.entries(restriction.approvals.maximumGrantLifetime || {})) {
      const current = next.approvals.maximumGrantLifetime[capability] || next.approvals.maximumGrantLifetime.default || "action";
      next.approvals.maximumGrantLifetime[capability] = sourceName === "machine-managed" || rank[lifetime] < rank[current] ? lifetime : current;
    }
    next.approvals.protectedPathPatterns = Array.from(new Set([...(next.approvals.protectedPathPatterns || []), ...(restriction.approvals.protectedPathPatterns || [])]));
    if (restriction.approvals.allowWorkspaceWideFileWrites === false) next.approvals.allowWorkspaceWideFileWrites = false;
  }
  if (restriction.audit) {
    if (restriction.audit.enabled === true) next.audit.enabled = true;
    if (restriction.audit.capture) next.audit.capture = restriction.audit.capture;
    if (restriction.audit.maxFiles != null) next.audit.maxFiles = Math.min(next.audit.maxFiles, restriction.audit.maxFiles);
    if (restriction.audit.maxFileBytes != null) next.audit.maxFileBytes = Math.min(next.audit.maxFileBytes, restriction.audit.maxFileBytes);
    if (restriction.audit.sink) next.audit.sink = restriction.audit.sink;
  }
  if (sourceName === "machine-managed") {
    function collect(value, prefix = "") {
      for (const [key, child] of Object.entries(value || {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === "object" && !Array.isArray(child)) collect(child, path);
        else lockedFields.push(path);
      }
    }
    collect(restriction);
  }
  return next;
}

function resolve({ managed, workspace, user, defaults = PRODUCT_DEFAULT_POLICY } = {}) {
  const normalizedDefaults = normalizePolicy(defaults);
  const normalizedUser = user ? normalizePolicy(user, { partial: true }) : null;
  const normalizedWorkspace = workspace ? normalizePolicy(workspace, { partial: true }) : null;
  const normalizedManaged = managed ? normalizePolicy(managed, { partial: true }) : null;
  let policy = mergeObject(normalizedDefaults, normalizedUser);
  policy.approvals = clone(normalizedDefaults.approvals || {});
  if (normalizedUser?.approvals) policy = applyRestriction(policy, { approvals: normalizedUser.approvals }, "user", []);
  policy.packages.ruleSets = [clone(policy.packages.rules || [])];
  const lockedFields = [];
  policy = applyRestriction(policy, normalizedWorkspace, "workspace", lockedFields);
  policy = applyRestriction(policy, normalizedManaged, "machine-managed", lockedFields);
  policy.metadata = {
    source: managed ? "machine-managed" : workspace ? "workspace" : user ? "user" : "product-defaults",
    lockedFields,
    hash: crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex")
  };
  return policy;
}

function wildcardMatches(pattern, value) {
  if (pattern === "*") return true;
  const escaped = String(pattern || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(String(value || ""));
}

function isPackageOperationAllowed(policy, operation) {
  const ruleSets = Array.isArray(policy?.packages?.ruleSets) && policy.packages.ruleSets.length
    ? policy.packages.ruleSets
    : [policy?.packages?.rules || []];
  return ruleSets.every((rules) => rules.some((rule) =>
    wildcardMatches(rule.ecosystem, operation.ecosystem)
      && wildcardMatches(rule.packageId, operation.packageId || "*")
      && wildcardMatches(rule.version, operation.version || "*")
      && wildcardMatches(rule.action, operation.action)
      && wildcardMatches(rule.registry, operation.registry || "*")));
}

module.exports = {
  isPackageOperationAllowed,
  resolve,
  wildcardMatches
};
