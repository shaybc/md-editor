#!/usr/bin/env node

/**
 * Desktop AI Companion bridge.
 *
 * Receives a launch request from a temp file or legacy base64 argument, then relays
 * AI Companion requests over a newline-delimited JSON stdio protocol.
 */

"use strict";

const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");

function requireAiCompanionModule(relativePath) {
  return require(path.resolve(__dirname, "../../ai-companion", relativePath));

}

const { normalizeAiCompanionSettings, testConnection } = requireAiCompanionModule("orchestration/shared/runtime-support");
const { createProviderDebugEmitter } = requireAiCompanionModule("core/provider-debug");
const { inspectServerCertificate } = requireAiCompanionModule("core/tls-certificate");
const companionOrchestration = requireAiCompanionModule("orchestration");
const { runAutocompleteMode } = requireAiCompanionModule("modes/autocomplete");
const { runGitSummaryMode } = requireAiCompanionModule("modes/git-summary");
const planRepositoryTools = requireAiCompanionModule("tools/plan-repository-tools");
const promptProfile = requireAiCompanionModule("config/prompts");
const { createSecurityContext } = requireAiCompanionModule("security/security-context");
const { ApprovalGrantStore } = requireAiCompanionModule("core/approval-grant-store");
const approvalPolicy = requireAiCompanionModule("core/agent-approval-policy");
const approvalCapabilities = requireAiCompanionModule("core/approval-capability-registry");
const extensionService = requireAiCompanionModule("orchestration/autonomous/extensions/extension-service");
const { inspectRunRecovery } = requireAiCompanionModule("orchestration/autonomous/recovery/recovery-inspector");
const { RunScheduler } = requireAiCompanionModule("orchestration/autonomous/scheduling/run-scheduler");
const activeRequests = new Map();
const pendingApprovals = new Map();
const pendingAppActions = new Map();
const pendingUserInputs = new Map();
let nextApprovalId = 1;
let nextAppActionId = 1;
let nextUserInputId = 1;

function validatePersistentGrantCapabilities(rules, effectivePolicy) {
  const knownCapabilities = new Set(["workspace.file.write", ...Object.values(approvalCapabilities.CAPABILITIES).map((entry) => entry.id)]);
  const allowedCapabilities = effectivePolicy?.approvals?.allowedCapabilities || ["*"];
  const maximumLifetimes = effectivePolicy?.approvals?.maximumGrantLifetime || {};
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!knownCapabilities.has(rule.capability)) throw new Error(`Unknown approval capability: ${rule.capability}`);
    if (!allowedCapabilities.includes("*") && !allowedCapabilities.includes(rule.capability)) throw new Error(`Enterprise policy does not permit grants for ${rule.capability}.`);
    const maximum = maximumLifetimes[rule.capability] || maximumLifetimes.default || "action";
    if (maximum !== "workspace") throw new Error(`Workspace grants are not permitted for ${rule.capability} by the effective policy.`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function decodeRequest(value) {
  const raw = Buffer.from(String(value || ""), "base64").toString("utf8");
  const request = JSON.parse(raw || "{}");
  return normalizeLaunchRequest(request);
}

function normalizeLaunchRequest(request) {
  return {
    workspaceRoot: String(request.workspaceRoot || ""),
    profileRoot: String(request.profileRoot || ""),
    settings: normalizeAiCompanionSettings(request.settings)
  };
}

function decodeRequestFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    fs.unlinkSync(filePath);
  } catch (_error) {
    // Best-effort cleanup only; a stale temp file should not block startup.
  }
  return normalizeLaunchRequest(JSON.parse(raw || "{}"));
}

function loadLaunchRequest(argv) {
  if (argv[2] === "--request-file") return decodeRequestFile(argv[3]);
  return decodeRequest(argv[2]);
}

function isAbortError(error, signal) {
  return signal?.aborted === true || error?.name === "AbortError" || /aborted|cancelled/i.test(error?.message || "");
}

function rejectApprovalsForRequest(requestId) {
  for (const [approvalId, approval] of pendingApprovals) {
    if (approval.requestId !== requestId) continue;
    pendingApprovals.delete(approvalId);
    approval.reject(new Error("AI Companion request cancelled."));
  }
}

function rejectAppActionsForRequest(requestId) {
  for (const [appActionId, action] of pendingAppActions) {
    if (action.requestId !== requestId) continue;
    pendingAppActions.delete(appActionId);
    action.reject(new Error("AI Companion request cancelled."));
  }
}

function rejectUserInputsForRequest(requestId) {
  for (const [interactionId, interaction] of pendingUserInputs) {
    if (interaction.requestId !== requestId) continue;
    pendingUserInputs.delete(interactionId);
    interaction.reject(new Error("AI Companion request cancelled."));
  }
}

function requestAppAction(requestId, signal, details = {}) {
  if (signal?.aborted) return Promise.reject(new Error("AI Companion request cancelled."));
  const appActionId = `app-action-${requestId}-${nextAppActionId++}`;
  send({ id: requestId, type: "app-action", actionId: appActionId, ...details });
  return new Promise((resolve, reject) => {
    const abort = () => {
      pendingAppActions.delete(appActionId);
      reject(new Error("AI Companion request cancelled."));
    };
    pendingAppActions.set(appActionId, { requestId, resolve, reject, abort });
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}

function requestUserInput(requestId, signal, details = {}) {
  if (signal?.aborted) return Promise.reject(new Error("AI Companion request cancelled."));
  const interactionId = String(details.id || `user-input-${requestId}-${nextUserInputId++}`);
  return new Promise((resolve, reject) => {
    const abort = () => {
      pendingUserInputs.delete(interactionId);
      reject(new Error("AI Companion request cancelled."));
    };
    pendingUserInputs.set(interactionId, { requestId, resolve, reject, abort, signal });
    signal?.addEventListener?.("abort", abort, { once: true });
    send({ ...details, id: requestId, type: "user-input", interactionId });
  });
}

function handleUserInput(message) {
  const interactionId = String(message.interactionId || "");
  const interaction = pendingUserInputs.get(interactionId);
  if (!interaction) {
    if (message.id) send({ id: String(message.id), type: "done", action: "userInput", result: { accepted: false, interactionId } });
    return;
  }
  pendingUserInputs.delete(interactionId);
  interaction.signal?.removeEventListener?.("abort", interaction.abort);
  interaction.resolve({ answers: message.answers && typeof message.answers === "object" ? message.answers : {}, declined: message.declined === true });
  if (message.id) send({ id: String(message.id), type: "done", action: "userInput", result: { accepted: true, interactionId } });
}

function handleAppActionResult(message) {
  const appActionId = String(message.appActionId || message.actionId || "");
  const action = pendingAppActions.get(appActionId);
  if (!action) {
    if (message.id) send({ id: String(message.id), type: "done", action: "appActionResult", result: { accepted: false, appActionId } });
    return;
  }
  pendingAppActions.delete(appActionId);
  if (message.ok === false) action.reject(new Error(message.error || "AI Companion editor action failed."));
  else action.resolve(message.result || {});
  if (message.id) send({ id: String(message.id), type: "done", action: "appActionResult", result: { accepted: true, appActionId } });
}
function requestApproval(requestId, signal, details = {}, context = {}) {
  if (signal?.aborted) return Promise.reject(new Error("AI Companion request cancelled."));
  const approvalId = `approval-${requestId}-${nextApprovalId++}`;
  send({ id: requestId, type: "approval", approvalId, ...details });
  return new Promise((resolve, reject) => {
    const abort = () => {
      pendingApprovals.delete(approvalId);
      reject(new Error("AI Companion request cancelled."));
    };
    pendingApprovals.set(approvalId, {
      requestId,
      resolve,
      reject,
      abort,
      capability: String(details.capability || ""),
      resource: details.resource || null,
      maximumGrantLifetime: String(details.maximumGrantLifetime || "action"),
      effectiveSecurityPolicy: context.effectiveSecurityPolicy || {},
      auditLogger: context.auditLogger || null,
      profileRoot: String(context.profileRoot || ""),
      workspaceRoot: String(context.workspaceRoot || ""),
      grantOptions: Array.isArray(details.grantOptions) ? details.grantOptions.map((option) => ({ ...option })) : []
    });
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}

function normalizeApprovalDecision(message) {
  if (message.approved === true) return { decision: "approve", approved: true, instructions: "", grantOptionId: String(message.grantOptionId || "") };
  if (message.approved === false && !message.decision) return { decision: "reject", approved: false, instructions: "" };
  const decision = ["approve", "reject", "instruct"].includes(message.decision) ? message.decision : "reject";
  return {
    decision,
    approved: decision === "approve",
    instructions: String(message.instructions || message.prompt || "").trim(),
    grantOptionId: String(message.grantOptionId || "")
  };
}

async function handleApproval(message) {
  const approvalId = String(message.approvalId || "");
  const approval = pendingApprovals.get(approvalId);
  if (!approval) {
    if (message.id) send({ id: String(message.id), type: "done", action: "approval", result: { accepted: false, approvalId } });
    return;
  }
  const decision = normalizeApprovalDecision(message);
  let selectedOption = null;
  if (decision.grantOptionId) {
    selectedOption = approvalPolicy.validateGrantOption({
      capability: approval.capability,
      resource: approval.resource,
      maximumGrantLifetime: approval.maximumGrantLifetime,
      grantOptions: approval.grantOptions
    }, decision.grantOptionId, approval.effectiveSecurityPolicy);
    if (!selectedOption) {
      if (message.id) send({ id: String(message.id), type: "done", action: "approval", result: { accepted: false, approvalId, error: "The selected approval option is stale, unknown, or disabled by policy." } });
      return;
    }
    if (selectedOption.lifetime === "workspace") {
      try {
        const store = new ApprovalGrantStore(approval.profileRoot, approval.workspaceRoot);
        await store.add({ capability: approval.capability, matcher: selectedOption.matcher, lifetime: "workspace", enabled: true });
      } catch (error) {
        await approval.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: approval.requestId, workspace: approval.workspaceRoot, tool: "approvalGrantPersist", capability: approval.capability, decision: "persistence-error", error: error?.message || String(error) });
        if (message.id) send({ id: String(message.id), type: "done", action: "approval", result: { accepted: false, approvalId, error: `The workspace approval could not be saved: ${error?.message || String(error)}` } });
        return;
      }
    }
  }
  pendingApprovals.delete(approvalId);
  approval.resolve(decision);
  if (message.id) send({ id: String(message.id), type: "done", action: "approval", result: { accepted: true, approvalId, decision: decision.decision } });
}

function handleCancel(message) {
  const targetId = String(message.targetId || "");
  const controller = activeRequests.get(targetId);
  if (controller) controller.abort();
  rejectApprovalsForRequest(targetId);
  rejectAppActionsForRequest(targetId);
  rejectUserInputsForRequest(targetId);
  if (message.id) send({ id: String(message.id), type: "done", action: "cancel", result: { cancelled: Boolean(controller), targetId } });
}

async function handleRequest(session, message) {
  if (message.action === "approval") {
    await handleApproval(message);
    return;
  }
  if (message.action === "appActionResult") {
    handleAppActionResult(message);
    return;
  }
  if (message.action === "userInput") {
    handleUserInput(message);
    return;
  }
  if (message.action === "cancel") {
    handleCancel(message);
    return;
  }

  const id = String(message.id || "");
  const startedAt = Date.now();
  const controller = new AbortController();
  const emit = (event) => send({ id, ...event });
  activeRequests.set(id, controller);
  try {
    emit({ type: "start", action: message.action, startedAt });
    let result;
    const requestSettings = message.settings ? normalizeAiCompanionSettings(message.settings) : session.settings;
    const requestWorkspaceRoot = message.workspaceRoot || session.workspaceRoot;
    const requestProfileRoot = message.profileRoot || session.profileRoot || "";
    const securityContext = await createSecurityContext({
      workspaceRoot: requestWorkspaceRoot,
      profileRoot: requestProfileRoot,
      userPolicy: requestSettings.aiSecurityPolicy
    });
    const request = {
      ...message,
      requestId: id,
      appVersion: String(message.appVersion || process.env.NL_APPVERSION || ""),
      workspaceRoot: requestWorkspaceRoot,
      profileRoot: requestProfileRoot,
      settings: requestSettings,
      securityContext,
      signal: controller.signal,
      requestApproval: (details) => requestApproval(id, controller.signal, details, { profileRoot: requestProfileRoot, workspaceRoot: requestWorkspaceRoot, effectiveSecurityPolicy: securityContext.policy, auditLogger: securityContext.auditLogger }),
      requestUserInput: (details) => requestUserInput(id, controller.signal, details),
      requestAppAction: (details) => requestAppAction(id, controller.signal, details)
    };
    if (message.action === "testConnection") {
      result = await testConnection(requestSettings, { signal: controller.signal, onDebug: createProviderDebugEmitter(emit) });
    } else if (message.action === "inspectCertificate") {
      result = await inspectServerCertificate(message.url, { signal: controller.signal });
    } else if (message.action === "chat") {
      result = await companionOrchestration.run(request, {}, emit);
    } else if (message.action === "autocomplete") {
      result = await runAutocompleteMode(request, emit);
    } else if (message.action === "agent") {
      result = await companionOrchestration.run(request, {}, emit);
    } else if (message.action === "plan") {
      result = await companionOrchestration.run(request, {}, emit);
    } else if (message.action === "runRecoveryInspect") {
      result = await inspectRunRecovery(request);
    } else if (message.action === "schedulesClaimDue") {
      const scheduler = new RunScheduler(request);
      await scheduler.load();
      result = { schedules: await scheduler.claimDue() };
    } else if (message.action === "scheduleComplete") {
      const scheduler = new RunScheduler(request);
      await scheduler.load();
      result = { schedule: await scheduler.complete(message.scheduleId, message.error) };
    } else if (message.action === "plansList") {
      result = await planRepositoryTools.planList(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "planRead") {
      result = await planRepositoryTools.planRead(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "planUpdate") {
      result = await planRepositoryTools.planUpdate(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "planDelete") {
      result = await planRepositoryTools.planDelete(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "planUpdateStatus") {
      result = await planRepositoryTools.planUpdateStatus(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "planRebuildIndex") {
      result = await planRepositoryTools.planRebuildIndex(request.workspaceRoot, message, { signal: controller.signal });
    } else if (message.action === "gitSummary") {
      result = await runGitSummaryMode(request, emit);
    } else if (message.action === "promptsGet") {
      result = { entries: await promptProfile.listProfilePromptEntries({ profileRoot: request.profileRoot }) };
    } else if (message.action === "promptUpdate") {
      result = { entries: await promptProfile.updateProfilePromptEntry({ profileRoot: request.profileRoot }, message.keyPath, message.value) };
    } else if (message.action === "promptsUpgradeCheck") {
      result = await promptProfile.checkPromptProfileUpgrade({ profileRoot: request.profileRoot });
    } else if (message.action === "promptsUpgradeConflicts") {
      result = await promptProfile.getPromptProfileUpgradeConflicts({ profileRoot: request.profileRoot }, message.upgradeToken);
    } else if (message.action === "promptsUpgradeResolve") {
      result = await promptProfile.resolvePromptProfileUpgrade({ profileRoot: request.profileRoot }, {
        upgradeToken: message.upgradeToken, strategy: message.strategy, resolutions: message.resolutions
      });
    } else if (message.action === "securityPolicyGet") {
      const describePolicySource = (source) => ({
        found: source?.found === true,
        valid: source?.valid !== false,
        source: source?.source || "",
        path: source?.path || "",
        error: source?.error || ""
      });
      result = {
        effectivePolicy: securityContext.policy,
        error: securityContext.policyError,
        managed: describePolicySource(securityContext.managedSource),
        workspace: describePolicySource(securityContext.workspaceSource),
        auditLocation: securityContext.auditLocation
      };
    } else if (message.action === "extensionsList") {
      result = await extensionService.listExtensions(request);
    } else if (message.action === "lifecycleList") {
      result = await extensionService.listLifecycleAutomation(request);
    } else if (message.action === "extensionConfigure") {
      result = await extensionService.configureExtension(request, message);
    } else if (message.action === "extensionRead") {
      result = await extensionService.readExtension(request, message);
    } else if (message.action === "extensionValidate") {
      result = await extensionService.validateExtension(request, message);
    } else if (message.action === "extensionSave") {
      result = await extensionService.saveExtension(request, message);
    } else if (message.action === "extensionRename") {
      result = await extensionService.renameExtension(request, message);
    } else if (message.action === "extensionDuplicate") {
      result = await extensionService.duplicateExtension(request, message);
    } else if (message.action === "extensionExport") {
      result = await extensionService.exportExtension(request, message);
    } else if (message.action === "extensionTrash") {
      result = await extensionService.trashExtension(request, message);
    } else if (message.action === "extensionTrashList") {
      result = await extensionService.listTrashedExtensions(request, message);
    } else if (message.action === "extensionRestore") {
      result = await extensionService.restoreExtension(request, message);
    } else if (message.action === "approvalGrantsList") {
      const store = new ApprovalGrantStore(request.profileRoot, request.workspaceRoot);
      const grants = await store.list();
      const legacy = (await approvalPolicy.loadApprovalPolicies(request.workspaceRoot)).map((entry) => ({
        scope: entry.scope,
        path: entry.path,
        writeRuleCount: Array.isArray(entry.policy?.allow?.write) ? entry.policy.allow.write.length : 0
      }));
      result = { ...grants, legacy };
    } else if (message.action === "approvalGrantRevoke") {
      const store = new ApprovalGrantStore(request.profileRoot, request.workspaceRoot);
      result = await store.revoke(message.ruleId);
      await securityContext.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: id, workspace: request.workspaceRoot, tool: "approvalGrantRevoke", decision: result.revoked ? "revoked" : "not-found", ruleId: String(message.ruleId || "") });
    } else if (message.action === "approvalGrantsReplace") {
      validatePersistentGrantCapabilities(message.document?.rules, securityContext.policy);
      const store = new ApprovalGrantStore(request.profileRoot, request.workspaceRoot);
      result = await store.replace(message.document);
      await securityContext.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: id, workspace: request.workspaceRoot, tool: "approvalGrantsReplace", decision: "updated", count: result.rules.length });
    } else if (message.action === "approvalLegacyImport") {
      const selectedScope = String(message.scope || "");
      const legacy = (await approvalPolicy.loadApprovalPolicies(request.workspaceRoot)).find((entry) => entry.scope === selectedScope);
      if (!legacy) throw new Error("The selected legacy approval policy was not found.");
      validatePersistentGrantCapabilities([{ capability: "workspace.file.write" }], securityContext.policy);
      const store = new ApprovalGrantStore(request.profileRoot, request.workspaceRoot);
      result = await store.importLegacy(legacy.policy);
      await securityContext.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: id, workspace: request.workspaceRoot, tool: "approvalLegacyImport", decision: "imported", source: legacy.path, count: result.imported });
    } else {
      throw new Error("AI Companion action is not supported.");
    }
    send({ id, type: "done", action: message.action, elapsedMs: Date.now() - startedAt, result });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (isAbortError(error, controller.signal)) {
      send({ id, type: "cancelled", action: message.action, elapsedMs });
    } else {
      send({ id, type: "error", action: message.action, elapsedMs, error: error?.message || String(error) });
    }
  } finally {
    activeRequests.delete(id);
    rejectApprovalsForRequest(id);
    rejectAppActionsForRequest(id);
    rejectUserInputsForRequest(id);
  }
}

function bindInput(session) {
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line || "{}");
    } catch (error) {
      send({ type: "error", error: error?.message || String(error) });
      return;
    }
    void handleRequest(session, message);
  });
  reader.on("close", () => process.exit(0));
}

try {
  const session = loadLaunchRequest(process.argv);
  send({ type: "ready", title: "AI Companion", workspaceRoot: session.workspaceRoot });
  bindInput(session);
} catch (error) {
  send({ type: "error", error: error?.message || String(error) });
  process.exitCode = 1;
}
