#!/usr/bin/env node
"use strict";

/** Java project discovery sidecar that keeps filesystem and Maven work off the Neutralino core. */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const MAX_SCANNED_DIRECTORIES = 5000;
const STREAM_BATCH_SIZE = 200;
const STANDARD_JAVA_SOURCE_ROOT_PATTERN = /\/src\/(?:main|test)\/java$/i;
const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".md-editor", "node_modules", "target", "build", "bin", "out", ".gradle"]);

let activeChild = null;
let cancellationRequested = false;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** Decode and validate the bridge request passed by the renderer. */
function decodeRequest(value) {
  const raw = Buffer.from(String(value || ""), "base64").toString("utf8");
  const request = JSON.parse(raw || "{}");
  const mode = String(request.mode || "");
  const requestedRoot = String(request.workspaceRoot || "").trim();
  if (!["scan-workspace", "resolve-maven-reactor"].includes(mode)) throw new Error("Unsupported Java project detection request.");
  if (!requestedRoot) throw new Error("A Java workspace root is required.");
  const workspaceRoot = path.resolve(requestedRoot);
  return { ...request, mode, workspaceRoot };
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function joinPath(parent, child) {
  return normalizePath(path.join(parent, child));
}

function stableModuleId(directoryPath) {
  const normalized = normalizePath(directoryPath).toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) hash = Math.imul(hash ^ normalized.charCodeAt(index), 16777619);
  return `jvm-${(hash >>> 0).toString(16)}`;
}

function classifyDirectory(directoryPath, entryNames) {
  const names = new Set(entryNames.map((name) => name.toLowerCase()));
  const kinds = [];
  if (names.has("pom.xml")) kinds.push("maven");
  if (names.has("settings.gradle") || names.has("settings.gradle.kts") || names.has("build.gradle") || names.has("build.gradle.kts")) kinds.push("gradle");
  if (names.has(".project") || names.has(".classpath")) kinds.push("eclipse");
  if (!kinds.length) return null;
  const descriptorPaths = entryNames
    .filter((name) => /^(pom\.xml|settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|\.project|\.classpath)$/i.test(name))
    .map((name) => joinPath(directoryPath, name));
  const outputRoots = [];
  if (kinds.includes("maven")) outputRoots.push(joinPath(directoryPath, "target"));
  if (kinds.includes("gradle")) outputRoots.push(joinPath(directoryPath, "build"), joinPath(directoryPath, ".gradle"));
  if (kinds.includes("eclipse")) outputRoots.push(joinPath(directoryPath, "bin"));
  return {
    id: stableModuleId(directoryPath),
    root: normalizePath(directoryPath),
    kind: kinds.length > 1 ? "mixed" : kinds[0],
    kinds,
    descriptorPaths,
    sourceRoots: [],
    generatedSourceRoots: [],
    outputRoots
  };
}

function createEmptyBatch() {
  return {
    modules: [],
    aspectjSourceDirectories: [],
    kotlinSourceDirectories: [],
    kotlinSourceFiles: [],
    javaSourceFiles: [],
    standardJavaSourceRoots: []
  };
}

function getBatchEntryCount(batch) {
  return Object.values(batch).reduce((count, entries) => count + entries.length, 0);
}

function flushScanBatch(batch) {
  let output = createEmptyBatch();
  let outputSize = 0;
  for (const [key, entries] of Object.entries(batch)) {
    for (const entry of entries) {
      output[key].push(entry);
      outputSize += 1;
      if (outputSize < STREAM_BATCH_SIZE) continue;
      send({ type: "scan-batch", batch: output });
      output = createEmptyBatch();
      outputSize = 0;
    }
  }
  if (outputSize) send({ type: "scan-batch", batch: output });
  return createEmptyBatch();
}

/** Scan one workspace while excluding generated and dependency directories. */
async function scanWorkspace(request) {
  const queue = [request.workspaceRoot];
  let batch = createEmptyBatch();
  let scannedDirectories = 0;
  let hasJavaContent = false;
  let hasKotlinContent = false;

  while (queue.length && scannedDirectories < MAX_SCANNED_DIRECTORIES) {
    if (cancellationRequested) throw Object.assign(new Error("Java project detection was cancelled."), { cancelled: true });
    const directoryPath = queue.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    scannedDirectories += 1;
    const normalizedDirectory = normalizePath(directoryPath);
    const entryNames = entries.map((entry) => entry.name).filter(Boolean);
    if (STANDARD_JAVA_SOURCE_ROOT_PATTERN.test(normalizedDirectory)) batch.standardJavaSourceRoots.push(normalizedDirectory);
    const javaNames = entryNames.filter((name) => /\.java$/i.test(name));
    if (javaNames.length) hasJavaContent = true;
    javaNames.forEach((name) => batch.javaSourceFiles.push(joinPath(directoryPath, name)));
    if (entryNames.some((name) => /\.aj$/i.test(name))) batch.aspectjSourceDirectories.push(normalizedDirectory);
    const kotlinNames = entryNames.filter((name) => (
      /\.kt$/i.test(name)
      || (/\.kts$/i.test(name) && !/^(build|settings)\.gradle\.kts$/i.test(name) && /\/src\//i.test(normalizedDirectory))
    ));
    if (kotlinNames.length) {
      hasKotlinContent = true;
      batch.kotlinSourceDirectories.push(normalizedDirectory);
      kotlinNames.forEach((name) => batch.kotlinSourceFiles.push(joinPath(directoryPath, name)));
    }
    const module = classifyDirectory(normalizedDirectory, entryNames);
    if (module) batch.modules.push(module);
    entries.forEach((entry) => {
      if (!entry.isDirectory() || SKIPPED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) return;
      queue.push(path.join(directoryPath, entry.name));
    });
    if (getBatchEntryCount(batch) >= STREAM_BATCH_SIZE) batch = flushScanBatch(batch);
  }

  batch = flushScanBatch(batch);
  send({
    type: "result",
    result: {
      hasJavaContent,
      hasKotlinContent,
      scannedDirectories,
      truncated: queue.length > 0
    }
  });
}

function resolveMavenExecutable(workspaceRoot) {
  const wrapper = path.join(workspaceRoot, process.platform === "win32" ? "mvnw.cmd" : "mvnw");
  return fs.existsSync(wrapper) ? wrapper : (process.platform === "win32" ? "mvn.cmd" : "mvn");
}

function spawnPortable(executable, argumentsList, options) {
  if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(executable)) {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", executable, ...argumentsList], options);
  }
  return spawn(executable, argumentsList, options);
}

function createMavenArguments(pomPath, configuration = {}) {
  const commonArguments = [];
  if (configuration.settingsFilePath) commonArguments.push("--settings", String(configuration.settingsFilePath));
  if (configuration.offline === true) commonArguments.push("--offline");
  if (configuration.localRepositoryPath) commonArguments.push("-Dmaven.repo.local=" + String(configuration.localRepositoryPath));
  return [...commonArguments, "--no-transfer-progress", "-f", pomPath, "help:effective-pom"];
}

/** Run Maven's aggregator effective-POM goal once for the complete reactor. */
function resolveMavenReactor(request) {
  return new Promise((resolve, reject) => {
    const executable = String(request.mavenExecutable || "").trim() || resolveMavenExecutable(request.workspaceRoot);
    const pomPath = path.resolve(String(request.pomPath || path.join(request.workspaceRoot, "pom.xml")));
    const child = spawnPortable(executable, createMavenArguments(pomPath, request.mavenConfiguration), {
      cwd: request.workspaceRoot,
      windowsHide: true
    });
    activeChild = child;
    child.stdout?.on("data", (chunk) => send({ type: "maven-output", stream: "stdout", text: String(chunk || "") }));
    child.stderr?.on("data", (chunk) => send({ type: "maven-output", stream: "stderr", text: String(chunk || "") }));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      activeChild = null;
      if (cancellationRequested || signal) {
        reject(Object.assign(new Error("Java project detection was cancelled."), { cancelled: true }));
        return;
      }
      const exitCode = Number.isFinite(Number(code)) ? Number(code) : 1;
      send({ type: "result", result: { exitCode } });
      resolve();
    });
  });
}

function terminateActiveChild() {
  const child = activeChild;
  if (!child) return;
  if (process.platform === "win32" && child.pid) {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch (_error) {
      // Direct termination below remains the fallback.
    }
  }
  try {
    child.kill();
  } catch (_error) {
    // The child may already have exited.
  }
}

async function executeRequest(request) {
  if (request.mode === "scan-workspace") await scanWorkspace(request);
  else await resolveMavenReactor(request);
}

function bindControlInput(request) {
  let started = false;
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line || "{}");
    } catch (error) {
      send({ type: "error", code: "java-project-detection-bridge-invalid-control", message: error.message });
      return;
    }
    if (message.type === "close") {
      cancellationRequested = true;
      terminateActiveChild();
      return;
    }
    if (message.type !== "start" || started) return;
    started = true;
    void executeRequest(request).then(() => {
      reader.close();
      setTimeout(() => process.exit(0), 0);
    }).catch((error) => {
      send({
        type: error?.cancelled ? "cancelled" : "error",
        code: error?.cancelled
          ? "java-project-detection-cancelled"
          : request.mode === "resolve-maven-reactor"
            ? "maven-reactor-model-failed"
            : "java-project-detection-bridge-failed",
        message: error?.message || String(error)
      });
      reader.close();
      setTimeout(() => process.exit(error?.cancelled ? 0 : 1), 0);
    });
  });
}

if (require.main === module) {
  try {
    bindControlInput(decodeRequest(process.argv[2]));
  } catch (error) {
    send({ type: "error", code: "java-project-detection-bridge-launch-failed", message: error?.message || String(error) });
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  cancellationRequested = true;
  terminateActiveChild();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cancellationRequested = true;
  terminateActiveChild();
  process.exit(143);
});
process.once("exit", terminateActiveChild);

module.exports = {
  MAX_SCANNED_DIRECTORIES,
  SKIPPED_DIRECTORY_NAMES,
  classifyDirectory,
  createMavenArguments,
  decodeRequest,
  scanWorkspace
};
