"use strict";

const readline = require("node:readline");
const { spawn } = require("node:child_process");
const path = require("node:path");

/** Own the optional AJDT sidecar and publish only complete, validated snapshots. */
class AjdtDiagnosticsController {
  constructor(options = {}) {
    this.launch = options.launch || {};
    this.diagnosticWorker = options.diagnosticWorker;
    this.send = options.send || (() => {});
    this.onTerminal = options.onTerminal || (() => {});
    this.eligible = this.launch.aspectjDiagnostics?.eligible === true;
    this.enabled = this.launch.aspectjDiagnostics?.enabled === true;
    this.scopeUris = (this.launch.aspectjDiagnostics?.scopeUris || []).map(normalizeUri).filter(Boolean);
    const bundledWorker = path.join(__dirname, "..", "ajdt-diagnostics-worker", "worker.cjs");
    this.command = String(this.launch.aspectjDiagnostics?.command || process.env.MD_EDITOR_AJDT_DIAGNOSTICS_COMMAND || `node "${bundledWorker}"`).trim();
    this.child = null;
    this.currentGenerationId = Number(this.launch.generationId) || 0;
    this.requiredGenerationId = 0;
    this.receivedSnapshot = false;
    this.failureReported = false;
    this.stopping = false;
    this.kotlinAbiSnapshot = null;
  }

  /** Supersede any AJDT result still running for an older analysis generation. */
  beginGeneration(generationId) {
    this.currentGenerationId = Number(generationId) || 0;
    this.requiredGenerationId = 0;
    this.receivedSnapshot = false;
    this.failureReported = false;
  }

  configure(enabled) {
    const nextEnabled = enabled === true && this.eligible;
    if (nextEnabled === this.enabled) return;
    this.enabled = nextEnabled;
    if (!this.enabled) {
      this.stop();
      this.clearAuthority(this.currentGenerationId);
      this.send({ type: "aspectj-diagnostics-cleared", generationId: this.currentGenerationId, workspaceRoot: this.launch.workspaceRoot });
      if (this.requiredGenerationId === this.currentGenerationId) {
        this.fail("AJDT diagnostics were disabled before the generation completed.", this.currentGenerationId);
      }
      return;
    }
    this.send({ type: "aspectj-diagnostics-cleared", generationId: this.currentGenerationId, workspaceRoot: this.launch.workspaceRoot });
    this.send({ type: "status", generationId: this.currentGenerationId, workspaceRoot: this.launch.workspaceRoot, phase: "ajdt-diagnostics-waiting", message: "Waiting for the final JDT build..." });
  }

  /** Update the analysis-only Kotlin ABI classpath and refresh an active AJDT worker. */
  updateKotlinAbiSnapshot(snapshot) {
    this.kotlinAbiSnapshot = snapshot || null;
    if (this.child?.stdin?.writable) {
      this.child.stdin.write(`${JSON.stringify({ type: "update-kotlin-abi", snapshot: this.kotlinAbiSnapshot })}\n`);
    }
  }

  reset() {
    this.stop();
    this.currentGenerationId = 0;
    this.clearAuthority(0);
  }

  /** Run or skip the authoritative AJDT pass for the finalized JDT generation. */
  finalizeGeneration(generationId, required = false, scopeUris = []) {
    if (Number(generationId) !== this.currentGenerationId) return false;
    this.scopeUris = (Array.isArray(scopeUris) ? scopeUris : []).map(normalizeUri).filter(Boolean);
    this.requiredGenerationId = required === true ? this.currentGenerationId : 0;
    if (!this.enabled || !this.eligible) {
      if (required === true) {
        this.fail("AJDT diagnostics are required for this generation but are unavailable.", generationId);
        return false;
      }
      this.onTerminal({ generationId: this.currentGenerationId, outcome: "skipped" });
      return true;
    }
    if (!this.scopeUris.length) {
      this.fail("AJDT received no projects from the validated JDT inventory.", generationId);
      return false;
    }
    this.refresh(this.currentGenerationId);
    return true;
  }

  refresh(generationId) {
    if (!this.enabled || !this.eligible || Number(generationId) !== this.currentGenerationId) return;
    if (!this.command) {
      this.fail("The AJDT diagnostics worker command is not installed.", generationId);
      return;
    }
    if (this.child?.stdin?.writable) {
      this.send({ type: "status", generationId, workspaceRoot: this.launch.workspaceRoot, phase: "ajdt-diagnostics-started", message: "Refreshing diagnostics..." });
      this.child.stdin.write(`${JSON.stringify({ type: "refresh", generationId })}\n`);
      return;
    }
    this.start(generationId);
  }

  start(generationId) {
    this.stopping = false;
    this.receivedSnapshot = false;
    this.failureReported = false;
    const child = spawn(this.command, {
      cwd: String(this.launch.workspaceRoot || this.launch.cwd || process.cwd()),
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => this.acceptWorkerLine(line));
    child.stderr.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (message) this.send({ type: "status", phase: "ajdt-diagnostics-log", level: "warning", message: message.slice(0, 500) });
    });
    child.on("spawn", () => {
      child.stdin.write(`${JSON.stringify({
        type: "initialize",
        workspaceRoot: this.launch.workspaceRoot,
        scopeUris: this.scopeUris,
        projectJdkHome: this.launch.aspectjDiagnostics?.projectJdkHome || "",
        toolingJdkHome: this.launch.aspectjDiagnostics?.toolingJdkHome || "",
        gradle: this.launch.aspectjDiagnostics?.gradle || {},
        kotlinAbiSnapshot: this.kotlinAbiSnapshot,
        generationId
      })}\n`);
      this.send({ type: "status", generationId, workspaceRoot: this.launch.workspaceRoot, phase: "ajdt-diagnostics-started", message: "Starting diagnostics..." });
    });
    child.on("error", (error) => this.fail(error?.message || String(error), generationId));
    child.on("close", (code) => {
      if (this.child === child) this.child = null;
      if (!this.stopping && code !== 0) this.fail(`The AJDT diagnostics worker exited with code ${code}.`, generationId);
      else if (!this.stopping && !this.receivedSnapshot) this.fail("The AJDT diagnostics worker exited without publishing a snapshot.", generationId);
    });
  }

  acceptWorkerLine(line) {
    let message;
    try { message = JSON.parse(String(line || "")); }
    catch (_error) {
      this.send({ type: "status", phase: "ajdt-diagnostics-log", level: "warning", message: String(line || "").slice(0, 500) });
      return;
    }
    const generationId = Number(message.generationId) || 0;
    if (generationId !== this.currentGenerationId) return;
    if (message.type === "snapshot") {
      const publications = (message.publications || []).filter((publication) => this.isInScope(publication?.uri));
      this.receivedSnapshot = true;
      this.failureReported = false;
      this.diagnosticWorker.postMessage({
        type: "replace-authoritative-snapshot",
        generationId,
        workspaceRoot: this.launch.workspaceRoot,
        snapshot: { scopeUris: this.scopeUris, publications }
      });
      this.send({ type: "aspectj-diagnostics-ready", generationId, workspaceRoot: this.launch.workspaceRoot, diagnosticCount: publications.reduce((total, publication) => total + (publication.diagnostics || []).length, 0) });
      this.onTerminal({ generationId, outcome: "ready" });
    } else if (message.type === "error") {
      this.fail(message.error || "The AJDT diagnostics worker failed.", generationId);
    } else if (message.type === "status") {
      this.send({ type: "status", generationId, workspaceRoot: this.launch.workspaceRoot, phase: "ajdt-diagnostics-status", message: String(message.message || "") });
    }
  }

  isInScope(uri) {
    const normalized = normalizeUri(uri);
    return this.scopeUris.some((scopeUri) => normalized === scopeUri || normalized.startsWith(`${scopeUri}/`));
  }

  clearAuthority(generationId = this.currentGenerationId) {
    this.diagnosticWorker.postMessage({ type: "clear-authoritative-snapshot", generationId, workspaceRoot: this.launch.workspaceRoot });
  }

  fail(reason, generationId = this.currentGenerationId) {
    if (Number(generationId) !== this.currentGenerationId) return;
    if (this.failureReported) return;
    this.failureReported = true;
    this.clearAuthority(generationId);
    this.send({
      type: "aspectj-diagnostics-failed",
      generationId,
      workspaceRoot: this.launch.workspaceRoot,
      failure: {
        code: "ajdt-diagnostics-failed",
        summary: "AJDT could not analyze the detected Gradle AspectJ modules.",
        reason: String(reason || "Unknown AJDT diagnostics failure"),
        fatal: false
      }
    });
    this.onTerminal({ generationId, outcome: "failed" });
  }

  stop() {
    this.stopping = true;
    if (this.child?.stdin?.writable) this.child.stdin.write(`${JSON.stringify({ type: "stop" })}\n`);
    if (this.child?.pid && process.platform === "win32") {
      spawn("taskkill", ["/PID", String(this.child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else if (this.child?.pid) {
      this.child.kill();
    }
    this.child = null;
  }
}

function normalizeUri(value) {
  const uri = String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? uri.toLowerCase() : uri;
}

module.exports = { AjdtDiagnosticsController };
