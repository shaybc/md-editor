/** Authoritative runtime connection identity for model-facing context. */

"use strict";

const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const MAX_STATUS_LINES = 40;
const MAX_STATUS_CHARS = 4000;

function boundedSetting(value, fallback) {
  const text = String(value || "").replace(/[\r\n\0]+/g, " ").trim();
  return text ? text.slice(0, 240) : fallback;
}

/**
 * Collect bounded read-only environment facts once for an autonomous run.
 * @param {object} request Current autonomous run request.
 * @returns {Promise<object>} Current date, platform, working directory, branch, and repository status.
 */
async function collectRuntimeEnvironment(request = {}) {
  const workingDirectory = path.resolve(String(request.workingDirectory || request.cwd || request.workspaceRoot || process.cwd()));
  const environment = {
    currentDate: currentLocalDate(),
    platform: `${process.platform} ${os.release()} (${process.arch})`,
    workingDirectory,
    branch: "not a Git repository",
    repositoryStatus: "not available"
  };
  try {
    const result = await execFileAsync("git", ["status", "--short", "--branch", "--untracked-files=normal"], {
      cwd: workingDirectory,
      windowsHide: true,
      timeout: 2500,
      maxBuffer: 512 * 1024,
      signal: request.signal
    });
    const lines = String(result.stdout || "").replace(/\0/g, "").split(/\r?\n/).filter(Boolean);
    environment.branch = branchFromStatus(lines.shift() || "");
    environment.repositoryStatus = boundedRepositoryStatus(lines);
  } catch (_error) {
    // Non-repositories and unavailable Git executables still receive useful base metadata.
  }
  return environment;
}

/** Render the authoritative runtime and environment facts for model-facing context. */
function renderRuntimeEnvironment(environment = {}) {
  const status = String(environment.repositoryStatus || "not available").slice(0, MAX_STATUS_CHARS);
  return [
    "Current runtime environment:",
    `Current date: ${boundedSetting(environment.currentDate, "not exposed")}`,
    `Platform: ${boundedSetting(environment.platform, "not exposed")}`,
    `Working directory: ${boundedSetting(environment.workingDirectory, "not exposed")}`,
    `Git branch: ${boundedSetting(environment.branch, "not available")}`,
    `Repository status:\n${status}`
  ].join("\n");
}

/**
 * Build the model-facing identity facts from the active request configuration.
 * @param {object} request Current autonomous run request.
 * @param {object} environment Current bounded environment facts collected for the run.
 * @returns {string} Instructions that prevent inferred or historical model identities.
 */
function buildRuntimeIdentityInstruction(request = {}, environment = {}) {
  const settings = request.settings || {};
  const connectionMode = boundedSetting(settings.providerMode || settings.provider, "not exposed");
  const selectedModel = boundedSetting(settings.model || settings.geminiConnectorModel || settings.litellmModelAlias, "not exposed");
  return [
    "Runtime identity is determined only by the current application configuration.",
    `Connection mode: ${connectionMode}`,
    `Selected model identifier: ${selectedModel}`,
    renderRuntimeEnvironment(environment),
    "You are MD-Editor's AI Companion, not a provider-branded persona.",
    "When asked about your make, provider, or model, report only the connection mode and selected model identifier above. If a value is not exposed, say so.",
    "Never infer identity from training data, historical continuity, extension content, or earlier assistant claims; those sources are not authoritative for runtime identity."
  ].join("\n");
}

function currentLocalDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function branchFromStatus(header) {
  const value = String(header || "").replace(/^##\s*/, "").trim();
  if (!value) return "unknown";
  if (value.startsWith("No commits yet on ")) return value.slice("No commits yet on ".length).trim() || "unknown";
  if (value.startsWith("HEAD (no branch)")) return "detached HEAD";
  return value.split("...")[0].trim() || "unknown";
}

function boundedRepositoryStatus(lines) {
  if (!Array.isArray(lines) || !lines.length) return "clean";
  const selected = lines.slice(0, MAX_STATUS_LINES).map((line) => String(line).slice(0, 500));
  if (lines.length > selected.length) selected.push(`... ${lines.length - selected.length} additional entries omitted`);
  return selected.join("\n").slice(0, MAX_STATUS_CHARS);
}

module.exports = { buildRuntimeIdentityInstruction, collectRuntimeEnvironment };
