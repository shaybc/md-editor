/** Persists explicit extension enablement and workspace trust decisions. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const STATE_VERSION = 1;

function statePath(profileRoot) { return profileRoot ? path.join(profileRoot, "companion", "extensions-state.json") : ""; }
function workspaceId(workspaceRoot) { return crypto.createHash("sha256").update(path.resolve(String(workspaceRoot || ""))).digest("hex").slice(0, 24); }

async function loadExtensionState(profileRoot) {
  const filePath = statePath(profileRoot);
  if (!filePath) return { version: STATE_VERSION, enabled: {}, trustedWorkspaces: {} };
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return value?.version === STATE_VERSION ? value : { version: STATE_VERSION, enabled: {}, trustedWorkspaces: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { version: STATE_VERSION, enabled: {}, trustedWorkspaces: {} };
    throw error;
  }
}

async function saveExtensionState(profileRoot, state) {
  const filePath = statePath(profileRoot);
  if (!filePath) throw new Error("A profile root is required to save extension state.");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ ...state, version: STATE_VERSION }, null, 2), "utf8");
}

function isExtensionEnabled(state, bundle) {
  if (bundle.scope === "bundled") return state.enabled?.[bundle.id] !== false;
  return state.enabled?.[bundle.id] === true;
}

function isExtensionTrusted(state, workspaceRoot, bundle) {
  if (bundle.scope === "bundled") return true;
  if (bundle.scope === "user") return state.enabled?.[bundle.id] === true;
  return state.trustedWorkspaces?.[workspaceId(workspaceRoot)]?.[bundle.id] === bundle.digest;
}

async function updateExtensionState(profileRoot, workspaceRoot, change) {
  const state = await loadExtensionState(profileRoot);
  state.enabled ||= {};
  state.trustedWorkspaces ||= {};
  if (typeof change.enabled === "boolean") state.enabled[change.id] = change.enabled;
  if (change.trusted === true) {
    const key = workspaceId(workspaceRoot);
    state.trustedWorkspaces[key] ||= {};
    state.trustedWorkspaces[key][change.id] = change.digest;
  }
  if (change.trusted === false) delete state.trustedWorkspaces?.[workspaceId(workspaceRoot)]?.[change.id];
  await saveExtensionState(profileRoot, state);
  return state;
}

module.exports = { isExtensionEnabled, isExtensionTrusted, loadExtensionState, saveExtensionState, updateExtensionState, workspaceId };
