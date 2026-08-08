/** Stable autonomous-run identity shared by work, workers, and checkpoints. */

"use strict";

const crypto = require("node:crypto");

/** Return a filesystem-safe identity for the logical autonomous run. */
function getRunIdentity(request) {
  const stableRunId = request.taskId || request.runId || request.requestId;
  const identity = [request.workspaceRoot, request.chatId, stableRunId].map((value) => String(value || "")).join("|");
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

module.exports = { getRunIdentity };
