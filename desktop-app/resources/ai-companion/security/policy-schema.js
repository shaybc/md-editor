/**
 * Versioned AI execution security policy schema and defaults.
 */

"use strict";

const POLICY_VERSION = 1;
const SHELL_MODES = new Set(["deny-and-audit", "sandbox-shell"]);
const PACKAGE_ECOSYSTEMS = ["npm", "yarn", "pnpm", "maven", "gradle"];
const PACKAGE_ACTIONS = ["install", "update", "remove", "download"];
const APPROVAL_LIFETIMES = new Set(["action", "task", "workspace"]);
const TEN_MIB = 10 * 1024 * 1024;

const DEFAULT_PROTECTED_PATH_PATTERNS = [
  ".git/**", ".md-editor/ai-security-policy.json", ".md-editor/companion/**",
  "**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx",
  "**/credentials.*", "**/secrets.*", "**/*credential*", "**/*secret*",
  "**/id_rsa", "**/id_ed25519", "**/.npmrc", "**/.pypirc", "**/NuGet.Config"
];

const DEFAULT_PACKAGE_RULES = PACKAGE_ECOSYSTEMS.map((ecosystem) => ({
  ecosystem,
  packageId: "*",
  version: "*",
  action: "*",
  registry: "*"
}));

const PRODUCT_DEFAULT_POLICY = Object.freeze({
  version: POLICY_VERSION,
  shell: {
    mode: "deny-and-audit",
    approvalBehavior: "settings",
    timeoutMs: 120000,
    outputLimitBytes: 4 * 1024 * 1024,
    auditRequests: true,
    auditOutcomes: true
  },
  execution: {
    allowedWorkspaceRoots: ["${workspaceRoot}"],
    allowedExecutables: [
      "java", "java.exe", "javac", "javac.exe",
      "mvn", "mvn.cmd", "mvnw", "mvnw.cmd",
      "gradle", "gradle.bat", "gradlew", "gradlew.bat",
      "node", "node.exe", "npm", "npm.cmd",
      "npx", "npx.cmd", "yarn", "yarn.cmd", "pnpm", "pnpm.cmd"
    ],
    allowedEnvironmentVariables: ["PATH", "Path", "PATHEXT", "SystemRoot", "TEMP", "TMP", "JAVA_HOME", "M2_HOME", "CI"],
    networkAccess: true,
    concurrency: 2
  },
  packages: {
    rules: DEFAULT_PACKAGE_RULES,
    allowTransitiveDependencies: true
  },
  packageBinaries: {
    npx: false,
    yarnDlx: false,
    pnpmDlx: false
  },
  approvals: {
    allowedCapabilities: ["*"],
    maximumGrantLifetime: {
      default: "action",
      "workspace.file.write": "workspace",
      "git.index.change": "workspace",
      "git.commit.create": "workspace",
      "git.branch.local": "workspace",
      "conversion.start": "workspace",
      "export.document": "workspace",
      "export.graph": "workspace"
    },
    protectedPathPatterns: DEFAULT_PROTECTED_PATH_PATTERNS,
    allowWorkspaceWideFileWrites: true
  },
  audit: {
    enabled: true,
    capture: "full",
    maxFiles: 10,
    maxFileBytes: TEN_MIB,
    sink: "profile-jsonl"
  }
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return clone(fallback);
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function normalizePackageRule(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    ecosystem: PACKAGE_ECOSYSTEMS.includes(source.ecosystem) ? source.ecosystem : String(source.ecosystem || ""),
    packageId: String(source.packageId || "").trim(),
    version: String(source.version || "*").trim() || "*",
    action: PACKAGE_ACTIONS.includes(source.action) || source.action === "*" ? source.action : String(source.action || ""),
    registry: String(source.registry || "*").trim() || "*"
  };
}

function normalizePolicy(value, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const fallback = options.partial ? {} : PRODUCT_DEFAULT_POLICY;
  const shell = isPlainObject(source.shell) ? source.shell : {};
  const execution = isPlainObject(source.execution) ? source.execution : {};
  const packages = isPlainObject(source.packages) ? source.packages : {};
  const packageBinaries = isPlainObject(source.packageBinaries) ? source.packageBinaries : {};
  const approvals = isPlainObject(source.approvals) ? source.approvals : {};
  const audit = isPlainObject(source.audit) ? source.audit : {};
  const result = { version: Number(source.version || fallback.version || POLICY_VERSION) };

  if (!options.partial || isPlainObject(source.shell)) {
    result.shell = {};
    if (!options.partial || Object.hasOwn(shell, "mode")) result.shell.mode = SHELL_MODES.has(shell.mode) ? shell.mode : fallback.shell?.mode;
    if (!options.partial || Object.hasOwn(shell, "approvalBehavior")) result.shell.approvalBehavior = ["settings", "always-ask"].includes(shell.approvalBehavior) ? shell.approvalBehavior : fallback.shell?.approvalBehavior || "settings";
    if (!options.partial || Object.hasOwn(shell, "timeoutMs")) result.shell.timeoutMs = clampInteger(shell.timeoutMs, fallback.shell?.timeoutMs || 120000, 1000, 3600000);
    if (!options.partial || Object.hasOwn(shell, "outputLimitBytes")) result.shell.outputLimitBytes = clampInteger(shell.outputLimitBytes, fallback.shell?.outputLimitBytes || 4194304, 1024, 64 * 1024 * 1024);
    if (!options.partial || Object.hasOwn(shell, "auditRequests")) result.shell.auditRequests = shell.auditRequests !== false;
    if (!options.partial || Object.hasOwn(shell, "auditOutcomes")) result.shell.auditOutcomes = shell.auditOutcomes !== false;
  }

  if (!options.partial || isPlainObject(source.execution)) {
    result.execution = {};
    if (!options.partial || Object.hasOwn(execution, "allowedWorkspaceRoots")) result.execution.allowedWorkspaceRoots = normalizeStringList(execution.allowedWorkspaceRoots, fallback.execution?.allowedWorkspaceRoots || []);
    if (!options.partial || Object.hasOwn(execution, "allowedExecutables")) result.execution.allowedExecutables = normalizeStringList(execution.allowedExecutables, fallback.execution?.allowedExecutables || []);
    if (!options.partial || Object.hasOwn(execution, "allowedEnvironmentVariables")) result.execution.allowedEnvironmentVariables = normalizeStringList(execution.allowedEnvironmentVariables, fallback.execution?.allowedEnvironmentVariables || []);
    if (!options.partial || Object.hasOwn(execution, "networkAccess")) result.execution.networkAccess = execution.networkAccess !== false;
    if (!options.partial || Object.hasOwn(execution, "concurrency")) result.execution.concurrency = clampInteger(execution.concurrency, fallback.execution?.concurrency || 1, 1, 16);
  }

  if (!options.partial || isPlainObject(source.packages)) {
    result.packages = {};
    if (!options.partial || Object.hasOwn(packages, "rules")) {
      result.packages.rules = (Array.isArray(packages.rules) ? packages.rules : fallback.packages?.rules || [])
        .map(normalizePackageRule);
    }
    if (!options.partial || Object.hasOwn(packages, "allowTransitiveDependencies")) {
      result.packages.allowTransitiveDependencies = packages.allowTransitiveDependencies !== false;
    }
  }

  if (!options.partial || isPlainObject(source.packageBinaries)) {
    result.packageBinaries = {};
    for (const key of ["npx", "yarnDlx", "pnpmDlx"]) {
      if (!options.partial || Object.hasOwn(packageBinaries, key)) result.packageBinaries[key] = packageBinaries[key] === true;
    }
  }

  if (!options.partial || isPlainObject(source.approvals)) {
    result.approvals = {};
    if (!options.partial || Object.hasOwn(approvals, "allowedCapabilities")) result.approvals.allowedCapabilities = normalizeStringList(approvals.allowedCapabilities, fallback.approvals?.allowedCapabilities || []);
    if (!options.partial || Object.hasOwn(approvals, "maximumGrantLifetime")) {
      const lifetimes = isPlainObject(approvals.maximumGrantLifetime) ? approvals.maximumGrantLifetime : fallback.approvals?.maximumGrantLifetime || {};
      result.approvals.maximumGrantLifetime = Object.fromEntries(Object.entries(lifetimes).filter(([, lifetime]) => APPROVAL_LIFETIMES.has(lifetime)));
    }
    if (!options.partial || Object.hasOwn(approvals, "protectedPathPatterns")) result.approvals.protectedPathPatterns = normalizeStringList(approvals.protectedPathPatterns, fallback.approvals?.protectedPathPatterns || []);
    if (!options.partial || Object.hasOwn(approvals, "allowWorkspaceWideFileWrites")) result.approvals.allowWorkspaceWideFileWrites = approvals.allowWorkspaceWideFileWrites !== false;
  }

  if (!options.partial || isPlainObject(source.audit)) {
    result.audit = {};
    if (!options.partial || Object.hasOwn(audit, "enabled")) result.audit.enabled = audit.enabled !== false;
    if (!options.partial || Object.hasOwn(audit, "capture")) result.audit.capture = ["full", "hash-only", "redacted"].includes(audit.capture) ? audit.capture : fallback.audit?.capture || "full";
    if (!options.partial || Object.hasOwn(audit, "maxFiles")) result.audit.maxFiles = clampInteger(audit.maxFiles, fallback.audit?.maxFiles || 10, 1, 100);
    if (!options.partial || Object.hasOwn(audit, "maxFileBytes")) result.audit.maxFileBytes = clampInteger(audit.maxFileBytes, fallback.audit?.maxFileBytes || TEN_MIB, 1024, 1024 * 1024 * 1024);
    if (!options.partial || Object.hasOwn(audit, "sink")) result.audit.sink = String(audit.sink || fallback.audit?.sink || "profile-jsonl");
  }

  return result;
}

function validatePolicy(value) {
  const errors = [];
  if (!isPlainObject(value)) return { valid: false, errors: ["Policy must be a JSON object."] };
  if (Number(value.version) !== POLICY_VERSION) errors.push(`Policy version must be ${POLICY_VERSION}.`);
  if (value.shell?.mode != null && !SHELL_MODES.has(value.shell.mode)) errors.push("shell.mode must be deny-and-audit or sandbox-shell.");
  if (value.packages?.rules != null && !Array.isArray(value.packages.rules)) errors.push("packages.rules must be an array.");
  if (value.approvals?.allowedCapabilities != null && !Array.isArray(value.approvals.allowedCapabilities)) errors.push("approvals.allowedCapabilities must be an array.");
  if (value.approvals?.protectedPathPatterns != null && !Array.isArray(value.approvals.protectedPathPatterns)) errors.push("approvals.protectedPathPatterns must be an array.");
  for (const [capability, lifetime] of Object.entries(value.approvals?.maximumGrantLifetime || {})) {
    if (!APPROVAL_LIFETIMES.has(lifetime)) errors.push(`approvals.maximumGrantLifetime.${capability} must be action, task, or workspace.`);
  }
  for (const [index, rule] of (Array.isArray(value.packages?.rules) ? value.packages.rules : []).entries()) {
    const normalized = normalizePackageRule(rule);
    if (!PACKAGE_ECOSYSTEMS.includes(normalized.ecosystem)) errors.push(`packages.rules[${index}].ecosystem is not supported.`);
    if (!normalized.packageId) errors.push(`packages.rules[${index}].packageId is required.`);
    if (!PACKAGE_ACTIONS.includes(normalized.action) && normalized.action !== "*") errors.push(`packages.rules[${index}].action is not supported.`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  PACKAGE_ACTIONS,
  PACKAGE_ECOSYSTEMS,
  APPROVAL_LIFETIMES,
  DEFAULT_PROTECTED_PATH_PATTERNS,
  POLICY_VERSION,
  PRODUCT_DEFAULT_POLICY,
  clone,
  normalizePolicy,
  validatePolicy
};
