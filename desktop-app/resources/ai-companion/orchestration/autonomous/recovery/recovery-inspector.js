/** Read-only recovery classification used by the desktop before offering resume. */

"use strict";

const { RunChronicle } = require("./run-chronicle");
const { RestartReconciler } = require("./restart-reconciler");

async function inspectRunRecovery(request) {
  const chronicle = new RunChronicle({ ...request, resumeRun: true });
  const snapshot = await chronicle.loadRecovery({ applicationRestart: true });
  const decision = new RestartReconciler().evaluate(request, snapshot, {
    instructions: snapshot?.instructionFingerprint || "",
    extensions: snapshot?.extensionFingerprint || ""
  });
  return {
    classification: decision.classification,
    reasons: decision.reasons || [],
    notices: decision.notices || [],
    runId: snapshot?.identity?.runId || "",
    status: snapshot?.status || "",
    savedAt: snapshot?.savedAt || "",
    canResume: decision.classification === "recoverable",
    canRestore: decision.classification === "completed",
    recoverySummary: snapshot?.recoverySummary || ""
  };
}

module.exports = { inspectRunRecovery };
