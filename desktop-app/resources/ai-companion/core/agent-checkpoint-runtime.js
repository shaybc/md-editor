/**
 * Agent-mode checkpoint store setup, compatibility fingerprints, load, and commit barriers.
 */

"use strict";

const approvalCapabilities = require("./approval-capability-registry");
const approvalPolicy = require("./agent-approval-policy");
const { ApprovalGrantStore } = require("./approval-grant-store");
const { RECOVERY_POLICY_VERSION, observeWorkspacePath } = require("./agent-action-recovery-policy");
const { createCompanionCheckpointStore } = require("./companion-checkpoint-store");
const {
  CONTROLLER_POLICY_VERSION,
  createWorkspaceIdentity,
  fingerprint
} = require("./companion-checkpoint-schema");

/** Create policy fingerprints whose drift changes continuation strategy, not checkpoint readability. */
async function createCompatibilityFingerprint(options = {}) {
  const approvalDocuments = await approvalPolicy.loadApprovalPolicies(options.workspaceRoot).catch(() => []);
  const workspaceGrants = options.profileRoot && options.workspaceRoot
    ? await new ApprovalGrantStore(options.profileRoot, options.workspaceRoot).list().catch(() => ({ rules: [] }))
    : { rules: [] };
  return {
    toolRegistryFingerprint: fingerprint({ definitions: options.toolDefinitions || [], recoveryPolicyVersion: RECOVERY_POLICY_VERSION }),
    securityPolicyFingerprint: fingerprint({ policy: options.securityContext?.policy || {}, policyError: options.securityContext?.policyError || "" }),
    approvalPolicyFingerprint: fingerprint({
      version: approvalPolicy.APPROVAL_POLICY_VERSION || 1,
      capabilities: approvalCapabilities.CAPABILITIES,
      documents: approvalDocuments,
      workspaceGrants: workspaceGrants.rules || []
    }),
    controllerPolicyVersion: CONTROLLER_POLICY_VERSION,
    systemPromptFingerprint: fingerprint(options.systemPrompt || ""),
    appVersion: String(options.appVersion || "")
  };
}

async function createWorkspaceObservationManifest(workspaceRoot, state = {}) {
  const actions = [...(state.activeActions || []), ...(state.recentActions || [])];
  const paths = new Map();
  for (const action of actions) {
    if (!action?.workspacePath) continue;
    paths.set(action.workspacePath, action);
  }
  const manifest = [];
  for (const [workspacePath, action] of paths) {
    const observation = await observeWorkspacePath(workspaceRoot, workspacePath);
    manifest.push({
      path: workspacePath,
      actionId: action.actionId || "",
      exists: observation.exists === true,
      type: observation.type || "unknown",
      valid: observation.valid === true,
      reason: observation.reason || "",
      currentRealPath: observation.realPath || "",
      nearestParentRealPath: observation.nearestParentRealPath || "",
      contentDigest: observation.contentFingerprint || "",
      expectedPrecondition: action.preconditionFingerprint || "",
      expectedPostcondition: action.expectedPostcondition || ""
    });
  }
  return manifest;
}

/** Create one Agent task checkpoint runtime when durable recovery is enabled. */
async function createAgentCheckpointRuntime(options = {}) {
  if (!options.enabled) return null;
  if (!options.profileRoot || !options.chatId || !options.taskId || !options.chatCreatedAt) {
    throw new Error("Durable Agent recovery requires profile, chat, task, and chat creation identities.");
  }
  const workspaceIdentity = await createWorkspaceIdentity(options.workspaceRoot);
  const compatibility = await createCompatibilityFingerprint(options);
  const identity = {
    mode: "agent",
    workspaceIdentityFingerprint: workspaceIdentity.workspaceIdentityFingerprint,
    chatId: String(options.chatId),
    taskId: String(options.taskId),
    runId: String(options.runId),
    executionGeneration: Math.max(1, Number(options.executionGeneration) || 1)
  };
  const store = createCompanionCheckpointStore({
    profileRoot: options.profileRoot,
    chatId: options.chatId,
    taskId: options.taskId,
    chatCreatedAt: options.chatCreatedAt
  });

  async function load() {
    return store.load(identity);
  }

  async function commit(input = {}) {
    const startedAt = Date.now();
    const result = await store.commit({
      ...input,
      checkpointKind: input.phase === "terminal" ? "terminal" : "recoverable",
      identity,
      compatibility,
      expectedIdentity: identity,
      workspaceObservationManifest: input.workspaceObservationManifest
        || await createWorkspaceObservationManifest(options.workspaceRoot, input.state),
      sourceManifest: input.sourceManifest || {}
    });
    options.emit?.({
      type: "agent-checkpoint",
      checkpointId: result.checkpoint.checkpointId,
      checkpointKind: result.checkpoint.checkpointKind,
      phase: result.checkpoint.phase,
      checkpointRevision: result.checkpoint.cursor.checkpointRevision,
      stateVersion: result.checkpoint.cursor.stateVersion,
      artifactCount: result.artifactManifest.refs.length,
      artifactBytes: result.artifactManifest.totalBytes,
      checkpointBytes: Buffer.byteLength(JSON.stringify(result.checkpoint), "utf8"),
      durationMs: Date.now() - startedAt
    });
    return result;
  }

  return { compatibility, identity, load, commit, location: store.location, remove: store.remove };
}

module.exports = {
  createAgentCheckpointRuntime,
  createCompatibilityFingerprint
};
