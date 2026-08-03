"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const { JdtDiagnosticStore } = require("./jdt-diagnostic-store.cjs");

let maximumProblems = workerData?.maximumProblems;
const summarySettleDelayMs = Math.max(0, Number(workerData?.summarySettleDelayMs ?? 500));
let store = new JdtDiagnosticStore({ maximumProblems });
let pendingSummary = null;
let summaryTimer = null;
let generationSettleTimer = null;
let activeGenerationId = Number(workerData?.generationId) || 0;
let workspaceRoot = String(workerData?.workspaceRoot || "");
let generationFinalizing = false;
let generationSettled = false;

function decorateSummary(summary) {
  return { ...summary, generationId: activeGenerationId, workspaceRoot };
}

function scheduleSummary(summary) {
  pendingSummary = summary;
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    summaryTimer = null;
    parentPort.postMessage({
      type: "diagnostic-summary",
      generationId: activeGenerationId,
      workspaceRoot,
      summary: decorateSummary(pendingSummary)
    });
    pendingSummary = null;
  }, summarySettleDelayMs);
}

function clearGenerationSettleTimer() {
  if (generationSettleTimer) clearTimeout(generationSettleTimer);
  generationSettleTimer = null;
}

/** Restart the final quiet window whenever current-generation diagnostics change. */
function scheduleGenerationSettle() {
  if (!generationFinalizing || !activeGenerationId) return;
  clearGenerationSettleTimer();
  if (generationSettled) {
    generationSettled = false;
    parentPort.postMessage({
      type: "diagnostic-generation-unsettled",
      generationId: activeGenerationId,
      workspaceRoot
    });
  }
  generationSettleTimer = setTimeout(() => {
    generationSettleTimer = null;
    const summary = store.freezeGenerationSnapshot(activeGenerationId);
    generationSettled = true;
    parentPort.postMessage({
      type: "diagnostic-generation-settled",
      generationId: activeGenerationId,
      workspaceRoot,
      snapshotId: summary.snapshotId,
      summary: decorateSummary(summary)
    });
  }, summarySettleDelayMs);
}

function acceptsGeneration(message) {
  return message.generationId === undefined || Number(message.generationId) === activeGenerationId;
}

parentPort.on("message", (message = {}) => {
  try {
    if (message.type === "publish-diagnostics") {
      if (!acceptsGeneration(message)) return;
      const publication = JSON.parse(String(message.payload || "{}"));
      const result = store.updatePublication(publication.params);
      scheduleSummary(result.summary);
      scheduleGenerationSettle();
      if (result.activeDiagnostics) parentPort.postMessage({ type: "active-diagnostics", generationId: activeGenerationId, workspaceRoot, ...result.activeDiagnostics });
    } else if (message.type === "replace-authoritative-snapshot") {
      if (!acceptsGeneration(message)) return;
      const result = store.replaceAuthoritativeSnapshot(message.snapshot);
      scheduleSummary(result.summary);
      scheduleGenerationSettle();
      if (result.activeDiagnostics) parentPort.postMessage({ type: "active-diagnostics", generationId: activeGenerationId, workspaceRoot, ...result.activeDiagnostics });
    } else if (message.type === "clear-authoritative-snapshot") {
      if (!acceptsGeneration(message)) return;
      const result = store.clearAuthoritativeSnapshot();
      scheduleSummary(result.summary);
      scheduleGenerationSettle();
      if (result.activeDiagnostics) parentPort.postMessage({ type: "active-diagnostics", generationId: activeGenerationId, workspaceRoot, ...result.activeDiagnostics });
    } else if (message.type === "begin-analysis-generation") {
      activeGenerationId = Number(message.generationId) || 0;
      workspaceRoot = String(message.workspaceRoot || workspaceRoot || "");
      generationFinalizing = false;
      generationSettled = false;
      clearGenerationSettleTimer();
      pendingSummary = null;
      if (summaryTimer) clearTimeout(summaryTimer);
      summaryTimer = null;
    } else if (message.type === "finalize-analysis-generation") {
      if (!acceptsGeneration(message)) return;
      generationFinalizing = true;
      scheduleGenerationSettle();
    } else if (message.type === "set-active-document") {
      const active = store.setActiveDocument(message.uri);
      if (active) parentPort.postMessage({ type: "active-diagnostics", ...active });
    } else if (message.type === "get-problems") {
      parentPort.postMessage({
        type: "problems-result",
        requestId: String(message.requestId || ""),
        generationId: activeGenerationId,
        workspaceRoot,
        ...store.getProblems(message.offset, message.limit, message.snapshotId)
      });
    } else if (message.type === "get-tasks") {
      if (!acceptsGeneration(message)) return;
      parentPort.postMessage({
        type: "tasks-result",
        requestId: String(message.requestId || ""),
        generationId: activeGenerationId,
        workspaceRoot,
        ...store.getTasks(message.offset, message.limit, message.snapshotId)
      });
    } else if (message.type === "set-project-analysis-failure") {
      const result = store.failProjectAnalysis(message.failure);
      pendingSummary = null;
      if (summaryTimer) clearTimeout(summaryTimer);
      summaryTimer = null;
      parentPort.postMessage({ type: "diagnostic-summary", generationId: activeGenerationId, workspaceRoot, summary: decorateSummary(result.summary) });
      if (result.activeDiagnostics) parentPort.postMessage({ type: "active-diagnostics", generationId: activeGenerationId, workspaceRoot, ...result.activeDiagnostics });
      parentPort.postMessage({ type: "project-analysis-failed", generationId: activeGenerationId, workspaceRoot, failure: message.failure });
    } else if (message.type === "configure") {
      maximumProblems = message.maximumProblems;
      parentPort.postMessage({ type: "diagnostic-summary", generationId: activeGenerationId, workspaceRoot, summary: decorateSummary(store.setMaximumProblems(maximumProblems)) });
    } else if (message.type === "reset") {
      store = new JdtDiagnosticStore({ maximumProblems });
      pendingSummary = null;
      if (summaryTimer) clearTimeout(summaryTimer);
      summaryTimer = null;
      generationFinalizing = false;
      generationSettled = false;
      clearGenerationSettleTimer();
      parentPort.postMessage({ type: "diagnostic-summary", generationId: activeGenerationId, workspaceRoot, summary: decorateSummary(store.getSummary()) });
    }
  } catch (error) {
    parentPort.postMessage({ type: "error", error: error?.message || String(error) });
  }
});
