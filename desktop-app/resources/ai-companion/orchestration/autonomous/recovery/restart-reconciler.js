/** Compatibility classification and safe context rebuilding for restarted runs. */

"use strict";

const { getRunIdentity } = require("../work/run-identity");
const { resolveInteractionToolCallId } = require("../interaction/pending-interaction-recovery");
const { canonicalWorkspace } = require("./run-chronicle");

class RestartReconciler {
  /** Classify a recovery snapshot without mutating runtime state. */
  evaluate(request, snapshot, fingerprints = {}) {
    if (!snapshot) return { classification: "none", notices: [] };
    const identity = snapshot.identity || {};
    const incompatible = [];
    if (identity.architecture !== "autonomous") incompatible.push("architecture");
    if (identity.runId !== getRunIdentity(request)) incompatible.push("run identity");
    if (identity.action !== String(request.action || "agent")) incompatible.push("mode");
    if (identity.workspaceRoot !== canonicalWorkspace(request.workspaceRoot)) incompatible.push("workspace");
    if (incompatible.length) return { classification: "incompatible", reasons: incompatible, notices: [] };
    if (snapshot.status === "completed" && typeof snapshot.finalResponse === "string") return { classification: "completed", notices: [] };
    if (["running", "interrupted", "aborted"].includes(snapshot.status)) return { classification: "aborted", notices: [] };
    if (snapshot.status === "cancelled") return { classification: "cancelled", notices: [] };
    const notices = [];
    if (snapshot.provider !== String(request.settings?.provider || "") || snapshot.model !== String(request.settings?.model || "")) {
      notices.push("The provider or model changed since the saved run. Re-evaluate model-specific assumptions.");
    }
    if (snapshot.instructionFingerprint && snapshot.instructionFingerprint !== fingerprints.instructions) {
      notices.push("Active instructions changed since the saved run. Current instructions are authoritative.");
    }
    if (snapshot.extensionFingerprint && snapshot.extensionFingerprint !== fingerprints.extensions) {
      notices.push("Available extensions changed since the saved run. Re-discover capabilities before relying on them.");
    }
    if (snapshot.toolSchemaState?.inventoryFingerprint && snapshot.toolSchemaState.inventoryFingerprint !== fingerprints.tools) {
      notices.push("The permitted tool inventory changed since the saved run. Current definitions and permissions are authoritative.");
    }
    const pendingTools = Array.isArray(snapshot.pendingTools) ? snapshot.pendingTools : (snapshot.pendingTool ? [snapshot.pendingTool] : []);
    const interactionCallId = resolveInteractionToolCallId(snapshot.pendingInteraction, snapshot.messages, pendingTools);
    if (snapshot.pendingInteraction?.pending) {
      notices.push(interactionCallId ? "A saved user decision request will be restored before model execution continues." : "A user decision request was interrupted and could not be matched safely to its original tool call.");
    }
    for (const pendingTool of pendingTools) {
      if (interactionCallId && String(pendingTool?.id || "") === interactionCallId) continue;
      notices.push(`A tool call was interrupted with unknown outcome: ${pendingTool.name || "tool"}. Inspect current state before deciding whether to try anything again.`);
    }
    return { classification: "recoverable", notices };
  }

  /** Rebuild messages with recovery notices while restoring no approval authority. */
  rebuild(snapshot, decision) {
    const messages = Array.isArray(snapshot.messages) ? JSON.parse(JSON.stringify(snapshot.messages)) : [];
    const pendingTools = Array.isArray(snapshot.pendingTools) ? snapshot.pendingTools : (snapshot.pendingTool ? [snapshot.pendingTool] : []);
    const interactionCallId = resolveInteractionToolCallId(snapshot.pendingInteraction, messages, pendingTools);
    repairUnknownToolOutcomes(messages, { skipCallIds: interactionCallId ? [interactionCallId] : [] });
    if (decision.notices?.length) {
      messages.push({ role: "system", content: `Restart reconciliation:\n${decision.notices.map((notice) => `- ${notice}`).join("\n")}` });
    }
    return {
      messages,
      taskGrants: [],
      recoverySummary: decision.notices?.join(" ") || "The autonomous run resumed from its latest safe boundary."
    };
  }
}

function repairUnknownToolOutcomes(messages, options = {}) {
  const skipped = new Set((options.skipCallIds || []).map(String));
  const recordedResults = new Set(messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id));
  for (const message of messages) {
    for (const call of message?.tool_calls || []) {
      if (recordedResults.has(call.id) || skipped.has(String(call.id))) continue;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: "The previous process ended before this tool outcome was recorded. Outcome is unknown; inspect current state before acting." })
      });
      recordedResults.add(call.id);
    }
  }
}

module.exports = { RestartReconciler, repairUnknownToolOutcomes };
