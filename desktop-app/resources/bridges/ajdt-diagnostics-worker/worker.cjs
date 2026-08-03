#!/usr/bin/env node

"use strict";

/* Long-lived NDJSON sidecar that produces atomic AJDT diagnostic snapshots. */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { buildDiagnosticsBundle } = require("./bundle-builder.cjs");
const { runAjdtDiagnostics } = require("./equinox-diagnostics-runner.cjs");
const { exportGradleModels } = require("./gradle-model-exporter.cjs");
const { ensureAjdtRuntime } = require("./runtime-provisioner.cjs");
const { mergeKotlinAbiClasspaths, fileUriToPath } = require("./kotlin-abi-classpath.cjs");

let configuration = null;
let runtime = null;
let bundleReady = false;
let running = false;
let refreshPending = false;
let refreshPendingGenerationId = 0;
let stopping = false;
let activeGenerationId = 0;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendStatus(message, generationId = activeGenerationId) {
  send({ type: "status", generationId, message });
}

/** Queue one complete Gradle-model and AJDT-build transaction. */
async function requestRefresh(generationId = activeGenerationId) {
  if (!configuration || stopping) return;
  if (running) {
    refreshPending = true;
    refreshPendingGenerationId = Number(generationId) || activeGenerationId;
    return;
  }
  const requestedGenerationId = Number(generationId) || activeGenerationId;
  const reportStatus = (message) => sendStatus(message, requestedGenerationId);
  running = true;
  try {
    if (!runtime) runtime = await ensureAjdtRuntime({
      toolingJdkHome: configuration.toolingJdkHome,
      workRoot: configuration.workRoot,
      onStatus: reportStatus
    });
    if (!bundleReady) {
      reportStatus("Preparing the headless AJDT diagnostics application...");
      await buildDiagnosticsBundle({
        eclipseHome: runtime.eclipseHome,
        toolingJdkHome: configuration.toolingJdkHome,
        workRoot: configuration.workRoot
      });
      bundleReady = true;
    }
    reportStatus("Resolving Gradle AspectJ compilation models...");
    const models = mergeKotlinAbiClasspaths(await exportGradleModels(configuration), configuration.kotlinAbiSnapshot);
    const publications = await runAjdtDiagnostics({
      eclipseHome: runtime.eclipseHome,
      toolingJdkHome: configuration.toolingJdkHome,
      workRoot: configuration.workRoot,
      models,
      onStatus: reportStatus
    });
    send({ type: "snapshot", generationId: requestedGenerationId, publications });
  } catch (error) {
    send({ type: "error", generationId: requestedGenerationId, error: error?.message || String(error) });
  } finally {
    running = false;
    if (stopping) process.exit(0);
    if (refreshPending) {
      refreshPending = false;
      const pendingGenerationId = refreshPendingGenerationId;
      refreshPendingGenerationId = 0;
      void requestRefresh(pendingGenerationId);
    }
  }
}

/** Validate the immutable workspace inputs supplied by the JDT proxy. */
function initialize(message) {
  activeGenerationId = Number(message.generationId) || 0;
  const workspaceRoot = path.resolve(String(message.workspaceRoot || ""));
  const projectJdkHome = path.resolve(String(message.projectJdkHome || ""));
  const toolingJdkHome = path.resolve(String(message.toolingJdkHome || ""));
  if (!fs.existsSync(path.join(projectJdkHome, "bin", process.platform === "win32" ? "java.exe" : "java"))) {
    throw new Error("The AJDT worker requires the valid Project JDK selected in Java Build Path.");
  }
  if (!fs.existsSync(path.join(toolingJdkHome, "bin", process.platform === "win32" ? "javac.exe" : "javac"))) {
    throw new Error("The AJDT worker requires the bundled MD-Editor tooling JDK.");
  }
  const scopePaths = (message.scopeUris || []).map(fileUriToPath).filter(Boolean);
  if (!scopePaths.length) throw new Error("The AJDT worker did not receive any detected AspectJ module scopes.");
  const workRoot = path.join(workspaceRoot, ".md-editor", "ajdt-diagnostics");
  fs.mkdirSync(workRoot, { recursive: true });
  configuration = {
    workspaceRoot,
    projectJdkHome,
    toolingJdkHome,
    scopePaths,
    scopeUris: message.scopeUris || [],
    gradle: message.gradle || {},
    kotlinAbiSnapshot: message.kotlinAbiSnapshot || null,
    workRoot
  };
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  try {
    const message = JSON.parse(String(line || "{}"));
    if (message.type === "initialize") {
      initialize(message);
      void requestRefresh(activeGenerationId);
    } else if (message.type === "update-kotlin-abi") {
      if (configuration) configuration.kotlinAbiSnapshot = message.snapshot || null;
    } else if (message.type === "refresh") {
      activeGenerationId = Number(message.generationId) || activeGenerationId;
      void requestRefresh(activeGenerationId);
    } else if (message.type === "stop") {
      stopping = true;
      if (!running) process.exit(0);
    }
  } catch (error) {
    send({ type: "error", error: error?.message || String(error) });
  }
});

process.stdin.on("end", () => {
  stopping = true;
  if (!running) process.exit(0);
});
