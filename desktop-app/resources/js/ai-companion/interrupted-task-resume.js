/**
 * Browser-side recovery of interrupted AI task prompts, checkpoints, and history.
 */
(function(window) {
  "use strict";

  const RESUME_PREFIX = "Resume the previous task that was interrupted by an app restart: ";
  const RESUME_SUFFIX = " - Use the conversation context to see the progress already made, avoid repeating completed work, and finish the task.";

  function recoverRootPrompt(record = {}) {
    let prompt = String(record.rootPrompt || record.prompt || "").trim();
    while (prompt.startsWith(RESUME_PREFIX)) {
      prompt = prompt.slice(RESUME_PREFIX.length);
      if (prompt.endsWith(RESUME_SUFFIX)) prompt = prompt.slice(0, -RESUME_SUFFIX.length);
      prompt = prompt.trim();
    }
    return prompt;
  }

  function findLegacyPendingAction(record = {}, approvalEvent = {}) {
    const events = Array.isArray(record.events) ? record.events : [];
    const approvalIndex = events.indexOf(approvalEvent);
    for (let index = approvalIndex - 1; index >= 0; index--) {
      const event = events[index];
      if (event?.type !== "tool" || event.tool !== approvalEvent.tool) continue;
      if (String(event.input || "") !== String(approvalEvent.input || "")) continue;
      const args = event.activity?.raw?.args;
      if (!args || typeof args !== "object") break;
      return {
        version: 1,
        replayEligible: false,
        activityId: String(event.activity?.id || ""),
        tool: String(approvalEvent.tool || ""),
        args: JSON.parse(JSON.stringify(args)),
        capability: String(approvalEvent.capability || ""),
        resource: approvalEvent.resource || null,
        approvalReason: String(approvalEvent.approvalReason || "").trim(),
        precondition: null
      };
    }
    return null;
  }

  function buildResumeRequest(record = {}, approvalEvent = {}, workspaceRoot = "") {
    const rootPrompt = recoverRootPrompt(record);
    const pendingAction = approvalEvent.resumeAction || findLegacyPendingAction(record, approvalEvent);
    const rootTaskId = String(record.resume?.rootTaskId || record.id || "");
    return {
      prompt: rootPrompt,
      resume: { sourceTaskId: String(record.id || ""), rootTaskId },
      resumeCheckpoint: {
        version: 1,
        workspaceRoot: String(record.workspaceRoot || workspaceRoot || ""),
        sourceTaskId: String(record.id || ""),
        rootTaskId,
        rootPrompt,
        pendingAction,
        reason: pendingAction?.replayEligible === false ? "The saved approval predates restart-safe checkpoints and must be re-evaluated." : ""
      }
    };
  }

  /** Return the latest clarification that was still unanswered when the task stopped. */
  function findPendingClarification(record = {}) {
    const events = Array.isArray(record.events) ? record.events : [];
    const answered = new Set(events.filter((event) => event?.type === "clarification-resolved").map((event) => String(event.clarificationId || "")));
    return [...events].reverse().find((event) => event?.type === "clarification" && !answered.has(String(event.clarificationId || ""))) || null;
  }

  /** Build a fresh intent-analysis run using persisted clarification answers as authoritative context. */
  function buildClarificationResumeRequest(record = {}, clarificationEvent = {}, workspaceRoot = "") {
    const rootPrompt = recoverRootPrompt(record);
    const events = Array.isArray(record.events) ? record.events : [];
    const questions = new Map(events.filter((event) => event?.type === "clarification").map((event) => [String(event.clarificationId || ""), String(event.question || "")]));
    const answered = events.filter((event) => event?.type === "clarification-resolved" && String(event.answer || "").trim()).map((event) => ({
      clarificationId: String(event.clarificationId || ""),
      question: questions.get(String(event.clarificationId || "")) || "",
      answer: String(event.answer || "").trim()
    }));
    return {
      prompt: rootPrompt,
      resume: { sourceTaskId: String(record.id || ""), rootTaskId: String(record.resume?.rootTaskId || record.id || ""), kind: "intent-clarification" },
      resumeIntentContext: {
        interruptedClarificationId: String(clarificationEvent.clarificationId || ""),
        interruptedQuestion: String(clarificationEvent.question || ""),
        answeredClarifications: answered,
        workspaceRoot: String(record.workspaceRoot || workspaceRoot || "")
      }
    };
  }

  function getToolOutcome(event = {}) {
    const result = event.activity?.raw?.result || {};
    if (result.executed === false) return `Denied and not executed${result.code ? ` (${result.code})` : ""}`;
    if (event.type === "tool-error" || event.activity?.status === "failed") return `Failed: ${event.error || event.activity?.resultSummary || "unknown error"}`;
    if (event.activity?.status === "running" || /running/i.test(String(event.summary || ""))) return "Started but unfinished";
    return `Completed${event.summary ? `: ${event.summary}` : ""}`;
  }

  function summarizeProgress(record = {}) {
    const events = Array.isArray(record.events) ? record.events : [];
    const toolEvents = new Map();
    const order = [];
    for (const event of events) {
      if (event?.type !== "tool" && event?.type !== "tool-error") continue;
      const id = String(event.activity?.id || `${event.tool}:${event.input}:${order.length}`);
      if (!toolEvents.has(id)) order.push(id);
      toolEvents.set(id, event);
    }
    const lines = order.map((id) => {
      const event = toolEvents.get(id);
      const label = event.activity?.title || event.tool || "Tool activity";
      const resource = event.activity?.primaryText || event.input || "";
      return `- ${getToolOutcome(event)} — ${label}${resource ? `: ${resource}` : ""}`;
    });
    for (const event of events) {
      if (event?.type !== "approval") continue;
      const resource = event.input || event.resource?.value || "";
      const reason = event.approvalReason ? `; reason: ${event.approvalReason}` : "";
      if (event.autoApproved === true) lines.push(`- Auto-approved — ${event.tool || event.summary}${resource ? `: ${resource}` : ""}${reason}`);
      else if (event.response?.label) lines.push(`- ${event.response.label} — ${event.tool || event.summary}${resource ? `: ${resource}` : ""}${reason}`);
      else lines.push(`- Still awaiting approval — ${event.tool || event.summary}${resource ? `: ${resource}` : ""}${reason}`);
    }
    return [
      "[This task was interrupted by an app restart and is now closed. Do not resume or continue it unless the user explicitly asks.]",
      lines.length ? "Progress recorded before the interruption, for reference only:" : "It stopped before any progress was recorded.",
      ...lines.slice(-20),
      "[End of closed task record.]"
    ].join("\n");
  }

  window.createMarkdownViewerInterruptedTaskResume = function() {
    return { buildClarificationResumeRequest, buildResumeRequest, findPendingClarification, recoverRootPrompt, summarizeProgress };
  };
})(window);
