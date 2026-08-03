"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Resolve the JDT workspace log from an explicit path or the launcher `-data` argument. */
function resolveJdtWorkspaceLogPath(launch = {}) {
  const explicitPath = String(launch.jdtLogPath || "").trim();
  if (explicitPath) return explicitPath;
  const command = String(launch.command || "");
  const match = command.match(/(?:^|\s)-data\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  const workspacePath = String(match?.[1] || match?.[2] || match?.[3] || "").trim();
  return workspacePath ? path.join(workspacePath, ".metadata", ".log") : "";
}

/** Translate one JDT workspace-log line into a project build lifecycle event. */
function classifyJdtWorkspaceLogLine(line) {
  const message = String(line || "").trim();
  if (message === "!MESSAGE >> initialization job finished") {
    return { phase: "build-started", message: "Java workspace build started." };
  }
  if (message === "!MESSAGE >> build jobs finished") {
    return { phase: "build-complete", message: "Java workspace build finished." };
  }
  if (message === "!MESSAGE Error occured while building workspace. Details:") {
    return {
      phase: "build-complete",
      outcome: "completed-with-errors",
      message: "Java workspace build finished with diagnostics."
    };
  }
  return null;
}

/**
 * Follow newly appended JDT workspace-log content and publish build lifecycle events.
 * Existing log content is deliberately skipped so an earlier session cannot release a new build.
 */
function createJdtWorkspaceLogMonitor(options = {}) {
  const logPath = String(options.logPath || "");
  const onLifecycle = options.onLifecycle || (() => {});
  const onWarning = options.onWarning || (() => {});
  const pollIntervalMs = Math.max(20, Number(options.pollIntervalMs) || 250);
  let offset = 0;
  let remainder = "";
  let started = false;
  let reading = false;
  let scanQueued = false;
  let scanTimer = null;

  function publishLines(content) {
    const lines = `${remainder}${content}`.split(/\r?\n/);
    remainder = lines.pop() || "";
    lines.forEach((line) => {
      const lifecycle = classifyJdtWorkspaceLogLine(line);
      if (lifecycle) onLifecycle(lifecycle);
    });
  }

  async function scanAppendedContent() {
    if (!started || !logPath) return;
    if (reading) {
      scanQueued = true;
      return;
    }
    reading = true;
    try {
      const stats = await fs.promises.stat(logPath);
      if (stats.size < offset) {
        offset = 0;
        remainder = "";
      }
      if (stats.size > offset) {
        const length = stats.size - offset;
        const handle = await fs.promises.open(logPath, "r");
        try {
          const buffer = Buffer.alloc(length);
          const result = await handle.read(buffer, 0, length, offset);
          offset += result.bytesRead;
          publishLines(buffer.subarray(0, result.bytesRead).toString("utf8"));
        } finally {
          await handle.close();
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") onWarning(error);
    } finally {
      reading = false;
      if (scanQueued) {
        scanQueued = false;
        void scanAppendedContent();
      }
    }
  }

  function start() {
    if (started || !logPath) return false;
    started = true;
    try { offset = fs.statSync(logPath).size; }
    catch (error) { if (error?.code !== "ENOENT") onWarning(error); }
    scanTimer = setInterval(() => void scanAppendedContent(), pollIntervalMs);
    scanTimer.unref?.();
    return true;
  }

  function stop() {
    if (!started) return;
    started = false;
    clearInterval(scanTimer);
    scanTimer = null;
  }

  return { start, stop, scanAppendedContent };
}

module.exports = { classifyJdtWorkspaceLogLine, createJdtWorkspaceLogMonitor, resolveJdtWorkspaceLogPath };
