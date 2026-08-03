"use strict";

const fs = require("fs");
const path = require("path");
const { spawnCommand } = require("../lsp-proxy-common/process-launcher.cjs");
const { createDiagnosticSnapshotCore } = require("../lsp-proxy-common/diagnostic-snapshot-core.cjs");
const { createLspFrameParser, encodeLspFrame } = require("../lsp-proxy-common/lsp-frame-codec.cjs");
const { createKotlinAbiController } = require("./kotlin-abi-controller.cjs");
const { resolveKotlinJvmModel } = require("./kotlin-model-resolver.cjs");

/** Supervises Kotlin LSP traffic and owns project-wide Kotlin model/ABI analysis. */
function startKotlinAdapter(argv = process.argv.slice(2), io = process) {
  const args = parseArgs(argv);
  const workspaceRoot = path.resolve(args.workspace || process.cwd());
  const cacheRoot = path.resolve(args.cache || path.join(workspaceRoot, ".md-editor", "language-server-workspaces", "kotlin"));
  fs.mkdirSync(cacheRoot, { recursive: true });
  const logStream = fs.createWriteStream(path.join(cacheRoot, "kotlin-adapter.log"), { flags: "a" });
  const diagnostics = createDiagnosticSnapshotCore({ maximumProblems: Number(args.maximumProblems) || 5000 });
  const queuedClientFrames = [];
  let child = null;
  let shuttingDown = false;
  let restartCount = 0;
  let model = null;
  let analysisPromise = null;
  let analysisTimer = null;
  let progressLogTimer = null;
  let pendingProgress = "";

  const abi = createKotlinAbiController({
    cacheRoot,
    compilerExecutable: args.compiler,
    abiPlugin: args.abiPlugin,
    environment: createJavaEnvironment(args.toolingJdk),
    stallTimeoutMs: Number(args.stallTimeoutMs) || 300000,
    onProgress(message) {
      pendingProgress = String(message || "").trim();
      if (progressLogTimer) return;
      progressLogTimer = setTimeout(() => {
        progressLogTimer = null;
        if (pendingProgress) log("compiler", pendingProgress);
        pendingProgress = "";
      }, 250);
    },
    onStatus(status) { notify("mdEditor/kotlin/status", status); },
    onLifecycle(event) { log("abi-lifecycle", JSON.stringify(event)); }
  });

  const clientParser = createLspFrameParser(handleClientMessage, (warning) => log("protocol", JSON.stringify(warning)));
  io.stdin.on("data", clientParser.push);
  io.stdin.on("end", shutdown);

  function handleClientMessage(message) {
    if (String(message.method || "").startsWith("mdEditor/kotlin/")) {
      handleAdapterRequest(message);
      return;
    }
    const frame = encodeLspFrame(message);
    if (shouldRefreshAnalysis(message)) scheduleAnalysis();
    if (child?.stdin?.writable) child.stdin.write(frame);
    else queuedClientFrames.push(frame);
  }

  function scheduleAnalysis() {
    if (analysisTimer) clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => {
      analysisTimer = null;
      void runAnalysis({ force: true }).catch((error) => log("analysis", error.stack || error.message));
    }, 500);
  }

  function shouldRefreshAnalysis(message) {
    if (message.method === "textDocument/didSave") return /\.kts?$/i.test(String(message.params?.textDocument?.uri || ""));
    if (message.method !== "workspace/didChangeWatchedFiles") return false;
    return (message.params?.changes || []).some((change) => /\.(?:kt|kts|java|gradle|gradle\.kts)$|\/pom\.xml$/i.test(String(change.uri || "")));
  }

  function handleAdapterRequest(request) {
    Promise.resolve().then(async () => {
      if (request.method === "mdEditor/kotlin/getProblems") return diagnostics.getProblems(request.params || {});
      if (request.method === "mdEditor/kotlin/getAbiSnapshot") return sanitizeAbiSnapshot(abi.getLastValidSnapshot());
      if (request.method === "mdEditor/kotlin/refreshModel") {
        if (analysisPromise) return runAnalysis(request.params || {});
        const cached = abi.getLastValidSnapshot();
        if (request.params?.force !== true && cached && model) return sanitizeAbiSnapshot(cached);
        return runAnalysis(request.params || {});
      }
      if (request.method === "mdEditor/kotlin/confirmAbiApplied") return abi.confirmApplied(request.params?.workspaceRevision);
      throw new Error(`Unsupported Kotlin adapter method: ${request.method}`);
    }).then(
      (result) => respond(request.id, result),
      (error) => respondError(request.id, error)
    );
  }

  async function runAnalysis(request = {}) {
    if (analysisPromise) {
      if (request.force === true) return analysisPromise.catch(() => null).then(() => runAnalysis({ force: false }));
      return analysisPromise;
    }
    analysisPromise = (async () => {
      notify("mdEditor/kotlin/status", { phase: "importing-model", message: "Kotlin: Importing project model" });
      try {
        model = await resolveKotlinJvmModel({
          workspaceRoot,
          cacheRoot,
          gradleInitScript: path.join(__dirname, "gradle", "export-kotlin-jvm-models.gradle"),
          gradleExecutable: args.gradle,
          mavenExecutable: args.maven,
          analysisRoots: parseAnalysisRoots(args.analysisRoots),
          environment: createJavaEnvironment(args.projectJdk),
          stallTimeoutMs: Number(args.stallTimeoutMs) || 300000,
          onProgress(message) { log("model", String(message || "").trim()); }
        });
        persistModel(cacheRoot, model);
        if (model.unsupported) {
          const problem = projectProblem("Android and Kotlin Multiplatform analysis are not supported in this release.", "unsupported-kotlin-target");
          diagnostics.publish([problem]);
          notifyProblemsChanged();
          throw Object.assign(new Error(problem.message), { code: "unsupported-kotlin-target" });
        }
        const snapshot = await abi.refresh({ model, generationId: Number(request.generationId) || 0 });
        diagnostics.publish(snapshot.diagnostics || []);
        notifyProblemsChanged();
        if (snapshot.abiChanged) notify("mdEditor/kotlin/abiChanged", sanitizeAbiSnapshot(snapshot));
        notify("mdEditor/kotlin/status", { phase: "ready", message: "Kotlin: Ready", workspaceRevision: snapshot.workspaceRevision });
        return sanitizeAbiSnapshot(snapshot);
      } catch (error) {
        const previous = error.lastValidSnapshot || abi.getLastValidSnapshot();
        const compilerProblems = Array.isArray(error.diagnostics) ? error.diagnostics : [];
        const failure = projectProblem(
          previous
            ? `Kotlin project analysis failed; the previous ABI remains active. Reason: ${firstLine(error.message)}`
            : `Mixed Java/Kotlin analysis is unavailable. Reason: ${firstLine(error.message)}`,
          previous ? "kotlin-analysis-stale" : "kotlin-analysis-unavailable"
        );
        diagnostics.publish([...compilerProblems, failure]);
        notifyProblemsChanged();
        notify("mdEditor/kotlin/status", { phase: previous ? "stale" : "failed", message: failure.message });
        throw error;
      } finally {
        analysisPromise = null;
      }
    })();
    return analysisPromise;
  }

  function startLanguageServer() {
    if (child || shuttingDown) return;
    child = spawnCommand(args.server, [], {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const parser = createLspFrameParser((message) => io.stdout.write(encodeLspFrame(message)), (warning) => log("lsp-protocol", JSON.stringify(warning)));
    child.stdout.on("data", parser.push);
    child.stderr.on("data", (chunk) => log("lsp", String(chunk).trim()));
    child.on("error", (error) => log("lsp", error.stack || error.message));
    child.on("exit", (code) => {
      child = null;
      if (shuttingDown) return;
      log("lsp", `Kotlin LSP exited with ${code}.`);
      notify("mdEditor/kotlin/status", { phase: "lsp-failed", message: "Kotlin editor features are unavailable; project diagnostics remain active." });
      if (restartCount < 1) {
        restartCount += 1;
        setTimeout(startLanguageServer, 2000);
      }
    });
    while (queuedClientFrames.length) child.stdin.write(queuedClientFrames.shift());
  }

  function notifyProblemsChanged() {
    notify("mdEditor/kotlin/problemsChanged", diagnostics.getSummary());
  }

  function notify(method, params) {
    io.stdout.write(encodeLspFrame({ jsonrpc: "2.0", method, params }));
  }

  function respond(id, result) {
    if (id !== undefined && id !== null) io.stdout.write(encodeLspFrame({ jsonrpc: "2.0", id, result }));
  }

  function respondError(id, error) {
    if (id !== undefined && id !== null) io.stdout.write(encodeLspFrame({ jsonrpc: "2.0", id, error: { code: -32001, message: error.message, data: { code: error.code || "kotlin-adapter-error" } } }));
  }

  function log(source, message) {
    if (message) logStream.write(`${new Date().toISOString()} [${source}] ${message}\n`);
  }

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    if (progressLogTimer) clearTimeout(progressLogTimer);
    if (analysisTimer) clearTimeout(analysisTimer);
    if (child) child.kill();
    logStream.end();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  void runAnalysis().catch((error) => log("analysis", error.stack || error.message)).finally(startLanguageServer);
  return { runAnalysis, shutdown, getModel: () => model, diagnostics, abi };
}

function sanitizeAbiSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    metadataVersion: Number(snapshot.metadataVersion) || 0,
    workspaceRevision: snapshot.workspaceRevision,
    modelSignature: snapshot.modelSignature,
    diagnosticRevision: snapshot.workspaceRevision,
    snapshotUri: snapshot.snapshotUri || "",
    abiChanged: snapshot.abiChanged === true,
    changedProjectUris: Array.isArray(snapshot.changedProjectUris) ? snapshot.changedProjectUris : [],
    removedProjectUris: Array.isArray(snapshot.removedProjectUris) ? snapshot.removedProjectUris : [],
    stale: snapshot.stale === true,
    entries: (snapshot.entries || []).map((entry) => ({
      moduleId: entry.moduleId,
      sourceSetId: entry.sourceSetId,
      projectUri: entry.projectUri,
      jarUri: entry.jarUri,
      contentHash: entry.contentHash,
      expectedFqns: Array.isArray(entry.expectedFqns) ? entry.expectedFqns : [],
      diagnosticRevision: entry.diagnosticRevision,
      test: entry.test === true,
      modulePath: entry.modulePath === true,
      patchModule: entry.patchModule || ""
    }))
  };
}

function projectProblem(message, code) {
  return { severity: "error", source: "Kotlin Project Analysis", file: "Project", filePath: "", line: 0, column: 0, code, message };
}

function persistModel(cacheRoot, model) {
  const file = path.join(cacheRoot, "models", "current.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(model, null, 2), "utf8");
}

function firstLine(value) {
  return String(value || "Unknown Kotlin analysis failure.").split(/\r?\n/, 1)[0].slice(0, 1000);
}

function createJavaEnvironment(jdkHome) {
  const home = String(jdkHome || "").trim();
  if (!home) return process.env;
  return {
    ...process.env,
    JAVA_HOME: home,
    PATH: `${path.join(home, "bin")}${path.delimiter}${process.env.PATH || ""}`
  };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) result[String(values[index] || "").replace(/^--/, "")] = values[index + 1];
  return result;
}

/** Decode Java's canonical analysis roots from the desktop launch command. */
function parseAnalysisRoots(value) {
  try {
    const roots = JSON.parse(decodeURIComponent(String(value || "")));
    return Array.isArray(roots) ? roots.map(String).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

if (require.main === module) startKotlinAdapter();

module.exports = { startKotlinAdapter, sanitizeAbiSnapshot, projectProblem, parseArgs };
