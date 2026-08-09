/** Versioned autonomous transcript checkpoints, independent of legacy state. */

"use strict";

const { getRunIdentity } = require("./work/run-identity");
const { RunChronicle, SCHEMA_VERSION } = require("./recovery/run-chronicle");
const { companionProfilePath } = require("./profile-storage");

function checkpointPath(request) {
  if (!request.profileRoot) return "";
  const name = getRunIdentity(request);
  return companionProfilePath(request.profileRoot, "autonomous-runs", name, "current.json");
}

async function saveCheckpoint(request, state) {
  return new RunChronicle(request).saveSnapshot(state);
}

async function loadCheckpoint(request) {
  return new RunChronicle(request).loadRecovery();
}

module.exports = { SCHEMA_VERSION, checkpointPath, loadCheckpoint, saveCheckpoint };
