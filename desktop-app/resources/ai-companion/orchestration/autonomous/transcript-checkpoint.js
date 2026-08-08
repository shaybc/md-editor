/** Versioned autonomous transcript checkpoints, independent of legacy state. */

"use strict";

const path = require("node:path");
const { getRunIdentity } = require("./work/run-identity");
const { RunChronicle, SCHEMA_VERSION } = require("./recovery/run-chronicle");

function checkpointPath(request) {
  if (!request.profileRoot) return "";
  const name = getRunIdentity(request);
  return path.join(request.profileRoot, ".md-editor", "companion", "autonomous-runs", name, "current.json");
}

async function saveCheckpoint(request, state) {
  return new RunChronicle(request).saveSnapshot(state);
}

async function loadCheckpoint(request) {
  return new RunChronicle(request).loadRecovery();
}

module.exports = { SCHEMA_VERSION, checkpointPath, loadCheckpoint, saveCheckpoint };
