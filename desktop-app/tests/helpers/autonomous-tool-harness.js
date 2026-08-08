"use strict";

const { AutonomousOrchestrator } = require("../../resources/ai-companion/orchestration/autonomous/autonomous-orchestrator");
const { getToolDefinitions } = require("../../resources/ai-companion/orchestration/autonomous/tool-catalog");
const { resolveCapabilityPolicy } = require("../../resources/ai-companion/orchestration/shared/capability-policy");
const toolScopes = require("../../resources/ai-companion/core/tool-scope-registry");
const { PRODUCT_DEFAULT_POLICY } = require("../../resources/ai-companion/security/policy-schema");

function enabledTools() {
  return Object.fromEntries(toolScopes.listAllScopedTools().map((name) => [name, true]));
}

function getAgentToolDefinitions(mode) {
  return getToolDefinitions(resolveCapabilityPolicy(mode), { toolScopes: enabledTools() });
}

function translateEvent(event) {
  if (event.type === "tool-completed") {
    return { ...event, type: "tool", activity: { id: event.callId, status: "completed", title: event.tool, resultSummary: "completed" } };
  }
  if (event.type === "tool-failed") return { ...event, type: "tool-error" };
  return event;
}

async function runAgentToolLoop(provider, settings, workspaceRoot, prompt, mode, emit, _runtime, options = {}) {
  const requestApproval = typeof options.requestApproval === "function"
    ? async (details) => {
      const result = await options.requestApproval(details);
      if (result?.approved === true || result?.decision === "approve") return { ...result, approved: true };
      return { ...result, approved: false };
    }
    : undefined;
  return new AutonomousOrchestrator().run({
    action: mode,
    prompt,
    workspaceRoot,
    profileRoot: options.profileRoot || "",
    requestId: options.requestId || `test-${Date.now()}`,
    settings: {
      enabled: true,
      agentEnabled: true,
      agentMaxResponseTokens: 0,
      toolScopes: enabledTools(),
      ...settings
    },
    requestApproval,
    requestAppAction: options.requestAppAction,
    editorReadContext: options.editorReadContext,
    securityContext: options.securityContext || { policy: PRODUCT_DEFAULT_POLICY }
  }, { provider }, (event) => emit?.(translateEvent(event)));
}

module.exports = { getAgentToolDefinitions, runAgentToolLoop };
