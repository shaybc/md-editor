#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { AjdtDiagnosticsController } = require("./ajdt-diagnostics-controller.cjs");
const { LspMessageRouter } = require("./lsp-message-router.cjs");
const { JdtProjectModelState } = require("./jdt-project-model-state.cjs");
const { createJdtWorkspaceLogMonitor, resolveJdtWorkspaceLogPath } = require("./jdt-workspace-log-monitor.cjs");
const { runEclipsePreferencesTask } = require("./eclipse-preferences-runner.cjs");

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function loadLaunchRequest(argv) {
  if (argv[2] !== "--request-file") throw new Error("The JDT proxy requires --request-file.");
  const requestPath = String(argv[3] || "");
  const request = JSON.parse(fs.readFileSync(requestPath, "utf8") || "{}");
  try { fs.unlinkSync(requestPath); } catch (_error) { /* Best-effort temp cleanup. */ }
  return request;
}

const launch = loadLaunchRequest(process.argv);
let activeGenerationId = Number(launch.generationId) || 0;
const diagnosticWorker = new Worker(path.join(__dirname, "jdt-diagnostic-worker.cjs"), {
  workerData: {
    maximumProblems: launch.maximumProblems,
    generationId: activeGenerationId,
    workspaceRoot: launch.workspaceRoot
  }
});
const ajdtDiagnostics = new AjdtDiagnosticsController({
  launch,
  diagnosticWorker,
  send,
  onTerminal(event) {
    if (Number(event.generationId) !== activeGenerationId || event.outcome === "failed") return;
    diagnosticWorker.postMessage({
      type: "finalize-analysis-generation",
      generationId: activeGenerationId,
      workspaceRoot: launch.workspaceRoot
    });
  }
});
let stopping = false;
let restartingChild = false;
let shutdownTimer = null;
let stderrReported = false;
let child = null;
const SHUTDOWN_REQUEST_ID = "md-editor-jdt-proxy-shutdown";
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15000;
const POST_EXIT_GRACE_TIMEOUT_MS = 10000;
const projectModelState = new JdtProjectModelState();

function reportProjectModelFailure(failure) {
  diagnosticWorker.postMessage({ type: "set-project-analysis-failure", failure });
}

const router = new LspMessageRouter({
  write(frame) { if (child?.stdin?.writable) child.stdin.write(frame); },
  onMessage(message) {
    if (String(message?.id) === SHUTDOWN_REQUEST_ID) {
      requestChildExit();
      return;
    }
    send({ type: "lsp-message", message });
  },
  onDiagnostics(payload) {
    diagnosticWorker.postMessage({
      type: "publish-diagnostics",
      generationId: activeGenerationId,
      workspaceRoot: launch.workspaceRoot,
      payload
    });
  },
  onStatus(status) {
    const { classificationMessage, ...publicStatus } = status;
    const failure = projectModelState.acceptStatus(Object.assign({}, publicStatus, {
      message: classificationMessage || publicStatus.message
    }));
    if (failure) reportProjectModelFailure(failure);
    send({ type: "status", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot, ...publicStatus });
  },
  onRequestCompleted(request) {
    if (request.method !== "java/buildWorkspace" || !request.succeeded) return;
    send({
      type: "status",
      generationId: request.generationId,
      workspaceRoot: request.workspaceRoot || launch.workspaceRoot,
      phase: "build-complete",
      requestId: request.requestId,
      explicitBuild: true,
      message: "Explicit Java workspace build finished."
    });
  },
  onWarning(warning) { send({ type: "error", recoverable: true, error: "Malformed JDT LSP output.", details: warning }); }
});

const jdtLogPath = resolveJdtWorkspaceLogPath(launch);
const workspaceLogMonitor = createJdtWorkspaceLogMonitor({
  logPath: jdtLogPath,
  onLifecycle(status) {
    send({ type: "status", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot, ...status });
  },
  onWarning(error) { send({ type: "error", recoverable: true, error: `Unable to monitor the JDT workspace log: ${error?.message || String(error)}` }); }
});

function killChildTree(targetChild = child) {
  if (!targetChild?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(targetChild.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  targetChild.kill("SIGKILL");
}

/** Give JDT a bounded period to persist its workspace after the LSP exit notification. */
function requestChildExit() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  router.send({ jsonrpc: "2.0", method: "exit", params: {} });
  shutdownTimer = setTimeout(killChildTree, POST_EXIT_GRACE_TIMEOUT_MS);
}

diagnosticWorker.on("message", (message) => send(message));
diagnosticWorker.on("error", (error) => send({ type: "error", recoverable: true, error: error?.message || String(error) }));

function startJdtProcess() {
  stderrReported = false;
  if (workspaceLogMonitor.start()) {
    send({ type: "status", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot, phase: "workspace-log-monitor-started", logPath: jdtLogPath });
  }
  const ownedChild = spawn(String(launch.command || ""), {
    cwd: String(launch.cwd || launch.workspaceRoot || process.cwd()),
    shell: true,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  child = ownedChild;
  ownedChild.stdout.on("data", (chunk) => router.acceptChunk(chunk));
  ownedChild.stderr.on("data", (chunk) => {
    if (stderrReported || child !== ownedChild) return;
    stderrReported = true;
    send({ type: "status", phase: "stderr", message: String(chunk || "").split(/\r?\n/, 1)[0].slice(0, 300) });
  });
  ownedChild.on("spawn", () => send({ type: "ready", pid: ownedChild.pid }));
  ownedChild.on("error", (error) => send({ type: "error", recoverable: false, error: error?.message || String(error) }));
  ownedChild.on("close", (code, signal) => {
    if (child !== ownedChild) return;
    child = null;
    if (shutdownTimer) clearTimeout(shutdownTimer);
    shutdownTimer = null;
    router.dispose();
    if (restartingChild && !stopping) {
      restartingChild = false;
      startJdtProcess();
      return;
    }
    workspaceLogMonitor.stop();
    ajdtDiagnostics.stop();
    void diagnosticWorker.terminate();
    send({ type: "exit", code, signal, expected: stopping });
    const exitCode = Number.isInteger(code) ? code : (stopping ? 0 : 1);
    setImmediate(() => process.exit(exitCode));
  });
}

startJdtProcess();

function stopJdtGracefully() {
  if (stopping) return;
  stopping = true;
  router.send({ jsonrpc: "2.0", id: SHUTDOWN_REQUEST_ID, method: "shutdown", params: null });
  shutdownTimer = setTimeout(() => {
    requestChildExit();
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line || "{}"); }
  catch (error) {
    send({ type: "error", recoverable: true, error: `Invalid proxy command: ${error?.message || String(error)}` });
    return;
  }
  if (message.type === "lsp-send") {
    router.send(message.message || {}, {
      expiresAt: message.expiresAt,
      generationId: message.generationId,
      workspaceRoot: message.workspaceRoot
    });
  } else if (message.type === "set-active-document") {
    diagnosticWorker.postMessage({ type: "set-active-document", uri: message.uri });
  } else if (message.type === "get-problems" || message.type === "get-tasks") {
    diagnosticWorker.postMessage(message);
  } else if (message.type === "kotlin-abi-snapshot") {
    ajdtDiagnostics.updateKotlinAbiSnapshot(message.snapshot);
  } else if (message.type === "begin-analysis-generation") {
    activeGenerationId = Number(message.generationId) || 0;
    diagnosticWorker.postMessage({
      type: "begin-analysis-generation",
      generationId: activeGenerationId,
      workspaceRoot: launch.workspaceRoot
    });
    ajdtDiagnostics.beginGeneration(activeGenerationId);
  } else if (message.type === "finalize-analysis-generation") {
    if (Number(message.generationId) !== activeGenerationId) return;
    ajdtDiagnostics.finalizeGeneration(activeGenerationId, message.ajdtRequired === true, message.scopeUris);
  } else if (message.type === "configure") {
    diagnosticWorker.postMessage({ type: "configure", maximumProblems: message.maximumProblems });
    ajdtDiagnostics.configure(message.aspectjDiagnosticsEnabled);
    send({ type: "status", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot, phase: "configured", interactiveRequestTimeoutMs: message.interactiveRequestTimeoutMs });
  } else if (message.type === "restart") {
    if (stopping || restartingChild) return;
    restartingChild = true;
    projectModelState.reset();
    ajdtDiagnostics.reset();
    diagnosticWorker.postMessage({ type: "reset", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot });
    send({ type: "status", generationId: activeGenerationId, workspaceRoot: launch.workspaceRoot, phase: "restarting" });
    if (child?.pid) killChildTree(child);
    else {
      restartingChild = false;
      startJdtProcess();
    }
  } else if (message.type === "run-eclipse-preferences") {
    // One generation at a time; the frontend serializes requests per session.
    void runEclipsePreferencesTask({
      workspaceRoot: launch.workspaceRoot,
      gradle: launch.gradleTooling?.gradle || {},
      projectJdkHome: launch.gradleTooling?.projectJdkHome || "",
      initScript: path.join(__dirname, "..", "lsp-proxy-common", "gradle", "disable-test-tasks.gradle")
    }).then(
      (result) => send({ type: "eclipse-preferences-result", requestId: message.requestId, ...result }),
      (error) => send({
        type: "eclipse-preferences-result",
        requestId: message.requestId,
        ok: false,
        description: error?.message || String(error),
        logPath: ""
      })
    );
  } else if (message.type === "stop") {
    stopJdtGracefully();
  }
});

function shutdown() {
  ajdtDiagnostics.stop();
  stopJdtGracefully();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
