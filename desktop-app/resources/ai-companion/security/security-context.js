/**
 * Loads user, workspace, and machine policy layers for one AI request.
 */

"use strict";

const path = require("node:path");
const { CommandAuditLogger } = require("./audit-log");
const effectivePolicy = require("./effective-policy");
const { FileAiSecurityPolicyProvider, readPolicyFile } = require("./managed-policy-provider");
const { PRODUCT_DEFAULT_POLICY, clone, validatePolicy } = require("./policy-schema");

function createFailClosedPolicy(error, source) {
  const policy = clone(PRODUCT_DEFAULT_POLICY);
  policy.shell.mode = "deny-and-audit";
  policy.execution.allowedExecutables = [];
  policy.execution.networkAccess = false;
  policy.packages.rules = [];
  policy.packageBinaries = { npx: false, yarnDlx: false, pnpmDlx: false };
  policy.approvals.allowedCapabilities = [];
  policy.approvals.maximumGrantLifetime = { default: "action" };
  policy.approvals.allowWorkspaceWideFileWrites = false;
  policy.metadata = {
    source: source || "machine-managed",
    lockedFields: ["shell.mode", "execution", "packages", "packageBinaries", "approvals"],
    error: String(error || "The managed AI security policy is invalid.")
  };
  return policy;
}

async function createSecurityContext(options = {}) {
  const workspaceRoot = path.resolve(String(options.workspaceRoot || ""));
  const provider = options.managedProvider || new FileAiSecurityPolicyProvider();
  const managedSource = await provider.load();
  const workspacePath = path.join(workspaceRoot, ".md-editor", "ai-security-policy.json");
  const workspaceSource = await readPolicyFile(workspacePath, "workspace", { optional: true });
  const userValidation = options.userPolicy ? validatePolicy(options.userPolicy) : { valid: true, errors: [] };
  let policy;
  let policyError = "";
  if (managedSource.found && !managedSource.valid) {
    policyError = managedSource.error;
    policy = createFailClosedPolicy(policyError, "machine-managed");
  } else if (workspaceSource.found && !workspaceSource.valid) {
    policyError = workspaceSource.error;
    policy = createFailClosedPolicy(policyError, "workspace");
  } else if (!userValidation.valid) {
    policyError = userValidation.errors.join(" ");
    policy = createFailClosedPolicy(policyError, "user");
  } else {
    policy = effectivePolicy.resolve({
      managed: managedSource.policy,
      workspace: workspaceSource.policy,
      user: options.userPolicy,
      defaults: PRODUCT_DEFAULT_POLICY
    });
  }
  const auditLogger = new CommandAuditLogger(options.profileRoot, policy.audit);
  return {
    policy,
    policyError,
    managedSource,
    workspaceSource,
    auditLogger,
    auditLocation: auditLogger.getLocation()
  };
}

module.exports = {
  createFailClosedPolicy,
  createSecurityContext
};
