#!/usr/bin/env node

/**
 * Lazy folder count bridge.
 *
 * Runs robocopy in list-only mode for one folder and emits newline-delimited JSON
 * so the desktop UI can update folder counts without blocking on process output.
 */

const { spawn } = require("node:child_process");
const readline = require("node:readline");

const ROBOCOPY_SUCCESS_EXIT_CODE_LIMIT = 8;
const ROBOCOPY_NULL_DESTINATION = "C:\\Null";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Decode a base64 JSON bridge request.
 * @param {string} value - Base64 encoded JSON request from the desktop app.
 * @returns {{folderPath: string}} Validated folder count request.
 * @throws If the request is missing a folder path.
 */
function decodeRequest(value) {
  const raw = Buffer.from(String(value || ""), "base64").toString("utf8");
  const request = JSON.parse(raw || "{}");
  const folderPath = String(request?.folderPath || "").trim();
  if (!folderPath) throw new Error("Folder path is required.");
  return { folderPath };
}

function parseRobocopySummaryNumber(text, label) {
  const pattern = new RegExp(`^\\s*${label}\\s*:\\s*([0-9,]+)`, "im");
  const match = String(text || "").match(pattern);
  if (!match) return null;
  const value = Number(String(match[1] || "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse robocopy's summary totals into status-bar folder counts.
 * @param {string} output - Combined robocopy stdout and stderr.
 * @returns {{files: number, folders: number}} File count and folder count excluding the root folder.
 * @throws If robocopy summary rows cannot be parsed.
 */
function parseRobocopyFolderCounts(output) {
  const dirs = parseRobocopySummaryNumber(output, "Dirs");
  const files = parseRobocopySummaryNumber(output, "Files");
  if (dirs === null || files === null) throw new Error("Unable to parse robocopy folder summary.");
  return {
    files: Math.max(0, files),
    folders: Math.max(0, dirs - 1)
  };
}

/**
 * Start a robocopy count process for one folder.
 * @param {{folderPath: string}} request - Validated folder count request.
 * @returns {import("node:child_process").ChildProcess} Running robocopy process.
 */
function startRobocopyCount(request) {
  const child = spawn("robocopy", [
    request.folderPath,
    ROBOCOPY_NULL_DESTINATION,
    "/E",
    "/L",
    "/NFL",
    "/NDL"
  ], {
    windowsHide: true
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk || "");
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk || "");
  });
  child.on("error", (error) => {
    send({ type: "error", message: error?.message || String(error) });
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 0);
  });
  child.on("exit", (code, signal) => {
    const exitCode = Number.isFinite(Number(code)) ? Number(code) : 0;
    if (signal) {
      send({ type: "exit", exitCode, signal });
      process.exitCode = exitCode;
      return;
    }
    if (exitCode >= ROBOCOPY_SUCCESS_EXIT_CODE_LIMIT) {
      send({ type: "error", message: `Robocopy failed with exit code ${exitCode}.`, exitCode });
    } else {
      try {
        send({ type: "result", ...parseRobocopyFolderCounts(output), exitCode });
      } catch (error) {
        send({ type: "error", message: error?.message || String(error), exitCode });
      }
    }
    send({ type: "exit", exitCode });
    process.exitCode = exitCode >= ROBOCOPY_SUCCESS_EXIT_CODE_LIMIT ? exitCode : 0;
  });

  send({ type: "ready" });
  return child;
}

function bindControlInput(startChild) {
  let child = null;
  let closing = false;
  let started = false;
  function closeChild() {
    if (closing) return;
    closing = true;
    try {
      child?.kill();
    } catch (_error) {
      // Bridge shutdown is best-effort when the parent app is closing.
    }
  }

  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    let message = null;
    try {
      message = JSON.parse(line || "{}");
    } catch (error) {
      send({ type: "error", message: error?.message || String(error) });
      return;
    }
    if (message.type === "start" && !started) {
      started = true;
      child = startChild();
      child.once("exit", () => {
        reader.close();
        setTimeout(() => process.exit(process.exitCode || 0), 0);
      });
    } else if (message.type === "close") {
      closeChild();
      reader.close();
    }
  });
  process.once("SIGINT", () => {
    closeChild();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    closeChild();
    process.exit(143);
  });
  process.once("exit", closeChild);
}

if (require.main === module) {
  try {
    const request = decodeRequest(process.argv[2]);
    bindControlInput(() => startRobocopyCount(request));
  } catch (error) {
    send({ type: "error", message: error?.message || String(error) });
    process.exitCode = 1;
  }
}

module.exports = {
  ROBOCOPY_SUCCESS_EXIT_CODE_LIMIT,
  parseRobocopyFolderCounts
};
