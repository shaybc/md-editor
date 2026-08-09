/**
 * AI Companion approval policy loading and matching.
 */

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LIFETIME_RANK, normalizePath } = require("./approval-capability-registry");

const APPROVAL_POLICY_VERSION = 1;
const APP_APPROVAL_POLICY_PATH = path.join(os.homedir(), ".md-editor", "companion", "approvals.json");
const FOLDER_APPROVAL_POLICY_PATH = path.join(".md-editor", "companion", "approvals.local.json");
const EMPTY_APPROVAL_POLICY = Object.freeze({ version: APPROVAL_POLICY_VERSION, allow: Object.freeze({ write: Object.freeze([]), command: Object.freeze([]), test: Object.freeze([]) }) });

/**
 * Normalize a policy JSON value into the supported allowlist shape.
 * @param {object} policy - Parsed approval policy payload.
 * @returns {{version:number,allow:{write:string[],command:string[],test:string[]}}} Sanitized policy.
 */
function normalizeApprovalPolicy(policy = {}) {
  const source = policy && typeof policy === "object" && !Array.isArray(policy) ? policy : {};
  const allow = source.allow && typeof source.allow === "object" && !Array.isArray(source.allow) ? source.allow : {};
  return {
    version: APPROVAL_POLICY_VERSION,
    allow: {
      write: normalizeStringList(allow.write),
      command: normalizeStringList(allow.command),
      test: normalizeStringList(allow.test)
    }
  };
}

/**
 * Resolve the app-wide approval policy path.
 * @returns {string} Absolute path to the user profile policy file.
 */
function getAppApprovalPolicyPath() {
  return APP_APPROVAL_POLICY_PATH;
}

/**
 * Resolve the folder approval policy path for a workspace root.
 * @param {string} workspaceRoot - Opened folder path.
 * @returns {string} Absolute path to the workspace policy file, or an empty string.
 */
function getFolderApprovalPolicyPath(workspaceRoot) {
  const root = String(workspaceRoot || "").trim();
  return root ? path.join(root, FOLDER_APPROVAL_POLICY_PATH) : "";
}

/**
 * Load app and folder policies for a workspace.
 * @param {string} workspaceRoot - Opened folder path.
 * @returns {Promise<Array<{scope:string,path:string,policy:object}>>} Loaded policies, including empty defaults when files are absent.
 */
async function loadApprovalPolicies(workspaceRoot) {
  const appPath = getAppApprovalPolicyPath();
  const folderPath = getFolderApprovalPolicyPath(workspaceRoot);
  const entries = [
    { scope: "app", path: appPath },
    folderPath ? { scope: "folder", path: folderPath } : null
  ].filter(Boolean);
  const loaded = [];
  for (const entry of entries) {
    loaded.push({
      ...entry,
      policy: normalizeApprovalPolicy(await readPolicyFile(entry.path))
    });
  }
  return loaded;
}

/**
 * Decide whether a tool action is allowed by any loaded policy.
 * @param {Array<{scope:string,path:string,policy:object}>} policies - Policies from app and folder scopes.
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Tool arguments.
 * @returns {{allowed:boolean,scope?:string,pattern?:string,path?:string,kind?:string}} Matching decision.
 */
function getPolicyDecision(policies, toolName, args = {}) {
  const kind = getApprovalKind(toolName);
  if (!kind) return { allowed: false };
  const candidate = getApprovalCandidate(kind, args);
  if (!candidate) return { allowed: false, kind };
  for (const entry of Array.isArray(policies) ? policies : []) {
    const allowedPatterns = entry?.policy?.allow?.[kind] || [];
    for (const pattern of allowedPatterns) {
      if (matchesApprovalPattern(kind, pattern, candidate)) {
        return { allowed: true, kind, scope: entry.scope, pattern, path: entry.path };
      }
    }
  }
  return { allowed: false, kind };
}

/**
 * Load policies and decide whether a tool action is preapproved.
 * @param {string} workspaceRoot - Opened folder path.
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Tool arguments.
 * @returns {Promise<object>} Matching policy decision.
 */
async function resolveApprovalPolicyDecision(workspaceRoot, toolName, args = {}) {
  return getPolicyDecision(await loadApprovalPolicies(workspaceRoot), toolName, args);
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

async function readPolicyFile(filePath) {
  if (!filePath) return EMPTY_APPROVAL_POLICY;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8") || "{}");
  } catch (error) {
    if (error?.code === "ENOENT") return EMPTY_APPROVAL_POLICY;
    throw error;
  }
}

function getApprovalKind(toolName) {
  if (toolName === "apply_edit" || toolName === "write_file") return "write";
  if (
    toolName === "create_document_tab" ||
    toolName === "insert_at_cursor" ||
    toolName === "replace_selection" ||
    toolName === "replace_document_range" ||
    toolName === "extract_selection_to_note"
  ) return "write";
  if (toolName === "run_command") return "command";
  if (toolName === "run_test") return "test";
  return "";
}

function getApprovalCandidate(kind, args) {
  if (kind === "write") return normalizePolicyPath(args.path || args.expectedPath);
  if (kind === "command" || kind === "test") return normalizeCommand(args.command);
  return "";
}

function normalizePolicyPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function normalizeCommand(value) {
  return String(value || "").trim();
}

function matchesApprovalPattern(kind, pattern, candidate) {
  const normalizedPattern = kind === "write" ? normalizePolicyPath(pattern) : normalizeCommand(pattern);
  if (!normalizedPattern || !candidate) return false;
  return kind === "write"
    ? globPatternToRegExp(normalizedPattern).test(candidate)
    : normalizedPattern === candidate;
}

function escapeRegexCharacter(value) {
  return /[\\^$+?.()|{}[\]]/.test(value) ? `\\${value}` : value;
}

function globPatternToRegExp(pattern) {
  const source = String(pattern || "**/*").replace(/\\/g, "/").replace(/^\/+/, "");
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
      expression += escapeRegexCharacter(source[index]);
    }
  }
  return new RegExp(`${expression}$`, "i");
}

function isProtectedResource(descriptor, effectiveSecurityPolicy = {}) {
  const patterns = effectiveSecurityPolicy?.approvals?.protectedPathPatterns || [];
  const candidates = [descriptor?.resource?.type === "path-glob" ? descriptor.resource.value : "", ...(descriptor?.boundaryPaths || [])].filter(Boolean).map(normalizePolicyPath);
  return candidates.some((candidate) => patterns.some((pattern) => globPatternToRegExp(normalizePolicyPath(pattern)).test(candidate)));
}

function matchesGrantRule(rule, descriptor) {
  if (!rule?.enabled || rule.capability !== descriptor?.capability) return false;
  const matcher = rule.matcher || {};
  const candidate = String(descriptor?.resource?.value || "");
  if (!candidate || !matcher.value) return false;
  if (matcher.type === "path-glob") return globPatternToRegExp(normalizePath(matcher.value)).test(normalizePath(candidate));
  if (matcher.type === "command-exact") {
    return ["read-only", "workspace-write"].includes(descriptor.commandImpact)
      && String(matcher.value).toLowerCase() === String(descriptor.commandDigest || "").toLowerCase();
  }
  if (matcher.type === "command-prefix") {
    const command = String(descriptor.normalizedCommand || "").toLowerCase();
    const prefix = String(matcher.value || "").trim().toLowerCase();
    const provenPrefix = String(descriptor.commandPrefix || "").trim().toLowerCase();
    return descriptor.commandImpact === "read-only" && Boolean(prefix) && provenPrefix === prefix && (command === prefix || command.startsWith(prefix + " "));
  }
  return String(matcher.value).toLowerCase() === candidate.toLowerCase();
}

/**
 * Resolve an approval descriptor against protected resources and active typed grants.
 * @param {object} input Descriptor, task grants, workspace grants, and effective security policy.
 * @returns {object} Approval decision and matching rule metadata.
 */
function resolveCapabilityApprovalDecision(input = {}) {
  const descriptor = input.descriptor;
  if (!descriptor) return { allowed: false };
  if (isProtectedResource(descriptor, input.effectiveSecurityPolicy)) return { allowed: false, protected: true, capability: descriptor.capability };
  for (const [scope, rules] of [["task", input.taskGrants], ["workspace", input.workspaceGrants]]) {
    const rule = (Array.isArray(rules) ? rules : []).find((candidate) => {
      const lifetime = candidate?.lifetime === "task" ? "task" : "workspace";
      return LIFETIME_RANK[lifetime] <= LIFETIME_RANK[descriptor.maximumGrantLifetime] && matchesGrantRule(candidate, descriptor);
    });
    if (rule) return { allowed: true, scope, capability: descriptor.capability, pattern: rule.matcher?.value || "", ruleId: rule.id || "", rule };
  }
  return { allowed: false, capability: descriptor.capability };
}

function validateGrantOption(descriptor, optionId, effectiveSecurityPolicy = {}) {
  if (!descriptor || !optionId || isProtectedResource(descriptor, effectiveSecurityPolicy)) return null;
  const option = (descriptor.grantOptions || []).find((candidate) => candidate.id === optionId && candidate.disabled !== true);
  if (!option) return null;
  if (LIFETIME_RANK[option.lifetime] > LIFETIME_RANK[descriptor.maximumGrantLifetime]) return null;
  return option;
}

function createGrantRule(descriptor, option) {
  return {
    capability: descriptor.capability,
    matcher: { type: option.matcher.type, value: option.matcher.value },
    lifetime: option.lifetime,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: ""
  };
}

module.exports = {
  FOLDER_APPROVAL_POLICY_PATH,
  getAppApprovalPolicyPath,
  getFolderApprovalPolicyPath,
  getPolicyDecision,
  createGrantRule,
  globPatternToRegExp,
  isProtectedResource,
  loadApprovalPolicies,
  matchesGrantRule,
  normalizeApprovalPolicy,
  resolveCapabilityApprovalDecision,
  validateGrantOption,
  resolveApprovalPolicyDecision
};
