/** Approval gateway retaining MD-Editor's capability and grant policies. */

"use strict";

const { ApprovalGrantStore } = require("../../core/approval-grant-store");
const approvalPolicy = require("../../core/agent-approval-policy");
const approvalCapabilities = require("../../core/approval-capability-registry");
const { LIFETIME_RANK } = approvalCapabilities;

/** Request or resolve authorization for a mutating autonomous tool call. */
async function authorizeTool(request, name, args, taskGrants) {
  let descriptor = approvalCapabilities.describe(name, args, { effectiveSecurityPolicy: request.securityContext?.policy });
  if (!descriptor) return { approved: true };
  descriptor = enforceAgentAuthority(request.agentAuthority, descriptor);
  const store = request.profileRoot ? new ApprovalGrantStore(request.profileRoot, request.workspaceRoot) : null;
  const workspaceGrants = store ? (await store.list()).rules : [];
  const existing = approvalPolicy.resolveCapabilityApprovalDecision({ descriptor, taskGrants, workspaceGrants, effectiveSecurityPolicy: request.securityContext?.policy });
  if (existing.allowed) {
    if (existing.scope === "workspace") await store?.touch?.(existing.ruleId);
    return { approved: true, automatic: true };
  }
  if (typeof request.requestApproval !== "function") throw new Error("This action requires approval, but no approval channel is available.");
  const decision = await request.requestApproval({
    tool: name, input: args.path || args.command || name, approvalReason: String(args.approvalReason || "").trim(),
    capability: descriptor.capability, resource: descriptor.resource, maximumGrantLifetime: descriptor.maximumGrantLifetime,
    grantOptions: descriptor.grantOptions, summary: descriptor.label, preview: args.path || args.command || name
  });
  if (!decision?.approved) return { approved: false, instructions: String(decision?.instructions || "") };
  const option = decision.grantOptionId ? approvalPolicy.validateGrantOption(descriptor, decision.grantOptionId, request.securityContext?.policy) : null;
  if (option?.lifetime === "task") taskGrants.push(approvalPolicy.createGrantRule(descriptor, option));
  return { approved: true };
}

function enforceAgentAuthority(authority, descriptor) {
  if (!authority) return descriptor;
  const permitted = authority.approvalCapabilities || [];
  if (!permitted.includes("*") && !permitted.includes(descriptor.capability)) {
    const error = new Error(`The delegated agent is not permitted to request ${descriptor.capability}.`);
    error.code = "AGENT_APPROVAL_NOT_ALLOWED";
    error.retryable = false;
    error.doNotRetry = true;
    throw error;
  }
  const requestedRank = LIFETIME_RANK[authority.maximumGrantLifetime] ?? 0;
  const descriptorRank = LIFETIME_RANK[descriptor.maximumGrantLifetime] ?? 0;
  if (requestedRank >= descriptorRank) return descriptor;
  const maximumGrantLifetime = authority.maximumGrantLifetime;
  return {
    ...descriptor,
    maximumGrantLifetime,
    grantOptions: (descriptor.grantOptions || []).map((option) => LIFETIME_RANK[option.lifetime] <= requestedRank
      ? option
      : { ...option, disabled: true, disabledReason: "The delegated agent boundary permits a shorter approval lifetime." })
  };
}

module.exports = { authorizeTool, enforceAgentAuthority };
