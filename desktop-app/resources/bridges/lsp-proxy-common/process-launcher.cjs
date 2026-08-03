"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

/** Launches native commands and Windows batch wrappers without shell reparsing. */
function spawnCommand(command, args = [], options = {}) {
  if (!isWindowsBatch(command)) return spawn(command, args, options);
  const launch = createPowerShellBatchLaunch(command, args, options);
  return spawn(launch.command, launch.args, launch.options);
}

/** Synchronous counterpart used by build-time tooling. */
function spawnCommandSync(command, args = [], options = {}) {
  if (!isWindowsBatch(command)) return spawnSync(command, args, options);
  const launch = createPowerShellBatchLaunch(command, args, options);
  return spawnSync(launch.command, launch.args, launch.options);
}

function isWindowsBatch(command) {
  return process.platform === "win32" && /\.(?:bat|cmd)$/i.test(String(command || ""));
}

function createPowerShellBatchLaunch(command, args, options) {
  const environment = { ...process.env, ...(options.env || {}), MDEDITOR_BATCH_ARGUMENTS: JSON.stringify(args || []) };
  return {
    command: "powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "invoke-batch.ps1"), "-Executable", command],
    options: { ...options, env: environment }
  };
}

module.exports = { spawnCommand, spawnCommandSync, createPowerShellBatchLaunch };