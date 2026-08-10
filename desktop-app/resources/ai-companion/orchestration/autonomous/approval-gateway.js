/** Approval gateway retaining MD-Editor's capability and grant policies. */

"use strict";

const { ApprovalGrantStore } = require("../../core/approval-grant-store");
const approvalPolicy = require("../../core/agent-approval-policy");
const approvalCapabilities = require("../../core/approval-capability-registry");
const { commandApprovalAnalysis, publicCommandImpact } = require("../../security/command-impact/command-impact-view");
const { LIFETIME_RANK } = approvalCapabilities;

/** Request or resolve authorization for a mutating autonomous tool call. */
async function authorizeTool(request, name, args, taskGrants, controls) {
  controls = controls || request.authorizationControls || {};
  let descriptor = approvalCapabilities.describe(name, args, {
    effectiveSecurityPolicy: request.securityContext?.policy,
    commandAnalysis: controls.commandAnalysis,
    workspaceRoot: request.workspaceRoot
  });
  if (!descriptor) return { approved: true };
  descriptor = enforceAgentAuthority(request.agentAuthority, descriptor);
  const priorDenial = controls.denialLedger?.check?.(name, args, descriptor);
  if (priorDenial) {
    await notifyPermissionDenied(request, name, args, "prior-denial", priorDenial.instructions || priorDenial.reason, controls);
    return permissionResolved(request, name, args, {
      approved: false,
      doNotRetry: true,
      denialFingerprint: priorDenial.fingerprint,
      instructions: priorDenial.instructions || priorDenial.reason,
      source: "prior-denial"
    }, controls);
  }
  const store = request.profileRoot ? new ApprovalGrantStore(request.profileRoot, request.workspaceRoot) : null;
  const workspaceGrants = store ? (await store.list()).rules : [];
  const existing = approvalPolicy.resolveCapabilityApprovalDecision({ descriptor, taskGrants, workspaceGrants, effectiveSecurityPolicy: request.securityContext?.policy });
  if (existing.allowed) {
    if (existing.scope === "workspace") await store?.touch?.(existing.ruleId);
    controls.denialLedger?.recordSuccess?.();
    return permissionResolved(request, name, args, { approved: true, automatic: true, approvalSource: existing.scope || "grant" }, controls);
  }
  const modeDecision = existing.protected ? { decision: "prompt", reason: "Protected resources require action-specific confirmation." }
    : await controls.permissionPolicy?.resolve?.(descriptor, {
      riskAdvisor: controls.denialLedger?.tripped ? null : controls.riskAdvisor,
      tool: name,
      args,
      commandAnalysis: controls.commandAnalysis,
      autoRunCommands: controls.autoRunCommands === true
    });
  if (modeDecision?.decision === "allow") {
    controls.denialLedger?.recordSuccess?.();
    return permissionResolved(request, name, args, { approved: true, automatic: true, permissionMode: true, approvalSource: "permission-mode" }, controls);
  }
  if (modeDecision?.decision === "deny") {
    const denial = controls.denialLedger?.record?.(name, args, descriptor, { source: "mode", reason: modeDecision.reason });
    await notifyPermissionDenied(request, name, args, "mode", modeDecision.reason, controls);
    return permissionResolved(request, name, args, { approved: false, doNotRetry: true, denialFingerprint: denial?.fingerprint, instructions: modeDecision.reason, source: "mode" }, controls);
  }
  if (controls.skipLifecycleHooks !== true && request.lifecycleHooks?.run) {
    const hookDecision = await request.lifecycleHooks.run("permission-request", { tool: name, input: args, capability: descriptor.capability, resource: descriptor.resource });
    if (hookDecision?.permissionDecision === "deny" || hookDecision?.continue === false) {
      const reason = hookDecision.stopReason || "Lifecycle automation denied this permission request.";
      const denial = controls.denialLedger?.record?.(name, args, descriptor, { source: "hook", reason });
      await notifyPermissionDenied(request, name, args, "hook", reason, controls);
      return permissionResolved(request, name, args, { approved: false, doNotRetry: true, denialFingerprint: denial?.fingerprint, instructions: reason, source: "hook" }, controls);
    }
    if (hookDecision?.permissionDecision === "allow" && hookDecision.permissionTrusted === true && request.settings?.allowHookManagedApprovals === true) {
      controls.denialLedger?.recordSuccess?.();
      return permissionResolved(request, name, args, { approved: true, automatic: true, approvalSource: "trusted-lifecycle-hook" }, controls);
    }
  }
  if (typeof request.requestApproval !== "function") throw new Error("This action requires approval, but no approval channel is available.");
  const commandImpact = controls.commandAnalysis ? publicCommandImpact(controls.commandAnalysis) : undefined;
  const decision = await request.requestApproval({
    tool: name, input: controls.commandAnalysis?.preview || args.path || args.command || name, approvalReason: String(args.approvalReason || "").trim(),
    capability: descriptor.capability, resource: descriptor.resource, maximumGrantLifetime: descriptor.maximumGrantLifetime,
    grantOptions: descriptor.grantOptions, summary: descriptor.label, preview: controls.commandAnalysis?.preview || args.path || args.command || name,
    commandImpact,
    actionAnalysis: controls.commandAnalysis ? commandApprovalAnalysis(controls.commandAnalysis, args.approvalReason) : undefined
  });
  if (!decision?.approved) {
    const denial = controls.denialLedger?.record?.(name, args, descriptor, { source: "user", reason: "The user denied this action.", instructions: String(decision?.instructions || "") });
    await notifyPermissionDenied(request, name, args, "user", String(decision?.instructions || "The user denied this action."), controls);
    return permissionResolved(request, name, args, { approved: false, doNotRetry: true, denialFingerprint: denial?.fingerprint, instructions: String(decision?.instructions || ""), source: "user" }, controls);
  }
  const option = decision.grantOptionId ? approvalPolicy.validateGrantOption(descriptor, decision.grantOptionId, request.securityContext?.policy) : null;
  if (option?.lifetime === "task") taskGrants.push(approvalPolicy.createGrantRule(descriptor, option));
  controls.denialLedger?.recordSuccess?.();
  return permissionResolved(request, name, args, { approved: true, approvalSource: "user" }, controls);
}

async function permissionResolved(request, tool, input, result, controls) {
  if (controls.skipLifecycleHooks !== true && request.lifecycleHooks?.run) {
    await request.lifecycleHooks.run("permission-resolved", {
      tool,
      input,
      approved: result.approved === true,
      source: result.approvalSource || result.source || "policy",
      reason: String(result.instructions || result.reason || "")
    });
  }
  return result;
}

async function notifyPermissionDenied(request, tool, input, source, reason, controls) {
  if (controls.skipLifecycleHooks === true || !request.lifecycleHooks?.run) return;
  const payload = { tool, input, source, reason: String(reason || "") };
  await request.lifecycleHooks.run("permission-denied", payload);
  await request.lifecycleHooks.run("tool-denied", payload);
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
