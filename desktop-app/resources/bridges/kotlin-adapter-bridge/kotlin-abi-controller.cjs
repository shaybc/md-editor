"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnCommand } = require("../lsp-proxy-common/process-launcher.cjs");
const { createKotlinAbiDependencyPlan } = require("./kotlin-abi-dependency-plan.cjs");
const { createKotlinAbiRevisionLeases } = require("./kotlin-abi-revision-leases.cjs");
const { collectExpectedKotlinExports } = require("./kotlin-source-exports.cjs");

const ABI_METADATA_VERSION = 2;

/** Serializes authoritative Kotlin analysis and preserves the last validated ABI snapshot. */
function createKotlinAbiController(options) {
  let active = null;
  let queued = null;
  let lastValidSnapshot = readCachedSnapshot(options.cacheRoot);
  let installedSnapshot = lastValidSnapshot;
  let pendingSnapshot = null;
  const revisionLeases = createKotlinAbiRevisionLeases({
    cacheRoot: options.cacheRoot,
    onLifecycle: options.onLifecycle
  });
  revisionLeases.hydrateVerifiedSnapshot(installedSnapshot);

  function refresh(request) {
    return new Promise((resolve, reject) => {
      if (queued) queued.reject(Object.assign(new Error("Superseded by a newer Kotlin analysis request."), { code: "superseded" }));
      queued = { request, resolve, reject };
      void drain();
    });
  }

  async function drain() {
    if (active || !queued) return;
    active = queued;
    queued = null;
    try {
      supersedePendingSnapshot();
      const candidate = await generate(active.request);
      if (installedSnapshot && candidate.abiChanged !== true) {
        revisionLeases.release(candidate.workspaceRevision, "generation");
        const unchangedSnapshot = {
          ...mergeSnapshotMetadata(installedSnapshot, candidate),
          diagnostics: candidate.diagnostics,
          abiChanged: false,
          changedProjectUris: [],
          removedProjectUris: [],
          stale: false
        };
        installedSnapshot = unchangedSnapshot;
        lastValidSnapshot = unchangedSnapshot;
        writeCachedSnapshot(options.cacheRoot, unchangedSnapshot);
        active.resolve(unchangedSnapshot);
      } else {
        const snapshot = {
          ...candidate,
          snapshotUri: toFileUri(path.join(options.cacheRoot, "abi", "current.json"))
        };
        pendingSnapshot = snapshot;
        active.resolve(snapshot);
      }
    } catch (error) {
      active.reject(Object.assign(error, { lastValidSnapshot }));
    } finally {
      active = null;
      if (queued) void drain();
    }
  }

  async function generate(request) {
    const revision = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const revisionRoot = path.join(options.cacheRoot, "abi", revision);
    fs.mkdirSync(revisionRoot, { recursive: true });
    const entries = [];
    const diagnostics = [];
    const compilationPlan = createKotlinAbiDependencyPlan(request.model);
    const entryByGroupId = new Map();
    revisionLeases.acquire(revision, revisionRoot, "generation");
    options.onLifecycle?.({
      operation: "create",
      generationId: Number(request.generationId) || 0,
      revision,
      revisionPath: revisionRoot,
      timestamp: new Date().toISOString()
    });
    let completed = 0;
    for (const group of compilationPlan) {
      const item = mergeCompilationGroup(group);
      const sourceSetLabel = group.items.map((member) => member.sourceSet.name).sort().join("+");
      const jar = path.join(revisionRoot, `${item.module.id}-${safeName(sourceSetLabel)}.jar`);
      options.onStatus?.({ phase: "generating-abi", message: `Kotlin: Generating ABI ${completed + 1}/${compilationPlan.length}`, completed, total: compilationPlan.length, moduleId: item.module.id, sourceSetId: sourceSetLabel });
      const dependencyAbiJars = group.dependencyGroupIds.map((groupId) => entryByGroupId.get(groupId)?.jarPath).filter(Boolean);
      const result = await runCompilerWithRetry({ ...request, ...item, jar, revisionRoot, dependencyAbiJars });
      diagnostics.push(...result.diagnostics);
      const entry = {
        moduleId: item.module.id,
        projectPath: item.module.projectPath || "",
        sourceSetId: sourceSetLabel,
        sourceSetKeys: group.items.map((member) => member.key),
        projectUri: toFileUri(item.module.root),
        jarUri: toFileUri(jar),
        jarPath: jar,
        contentHash: hashFile(jar),
        expectedFqns: collectExpectedKotlinExports(item.sourceSet.kotlin),
        diagnosticRevision: revision,
        test: group.items.every((member) => member.sourceSet.test === true),
        modulePath: group.items.some((member) => member.sourceSet.modulePath === true),
        patchModule: item.sourceSet.patchModule || ""
      };
      entries.push(entry);
      entryByGroupId.set(group.id, entry);
      options.onLifecycle?.({
        operation: "artifact-created",
        generationId: Number(request.generationId) || 0,
        revision,
        projectUri: entry.projectUri,
        jarPath: entry.jarPath,
        contentHash: entry.contentHash,
        expectedTypeCount: entry.expectedFqns.length,
        timestamp: new Date().toISOString()
      });
      completed += 1;
    }
    options.onStatus?.({ phase: "validating", completed, total: compilationPlan.length });
    entries.forEach((entry) => validateJar(entry.jarPath));
    const previousEntries = new Map((installedSnapshot?.entries || []).map((entry) => [`${entry.moduleId}:${entry.sourceSetId}`, entry]));
    const currentEntries = new Map(entries.map((entry) => [`${entry.moduleId}:${entry.sourceSetId}`, entry]));
    const changedProjectUris = Array.from(new Set(entries
      .filter((entry) => previousEntries.get(`${entry.moduleId}:${entry.sourceSetId}`)?.contentHash !== entry.contentHash)
      .map((entry) => entry.projectUri)));
    const removedProjectUris = Array.from(new Set(Array.from(previousEntries)
      .filter(([key]) => !currentEntries.has(key))
      .map(([, entry]) => entry.projectUri)));
    const abiChanged = changedProjectUris.length > 0 || removedProjectUris.length > 0;
    return {
      metadataVersion: ABI_METADATA_VERSION,
      workspaceRevision: revision,
      modelSignature: request.model.configurationSignature,
      entries,
      diagnostics,
      abiChanged,
      changedProjectUris,
      removedProjectUris,
      stale: false
    };
  }

  async function runCompilerWithRetry(request) {
    try {
      return await runCompiler(request);
    } catch (error) {
      if (!error.stalled) throw error;
      options.onStatus?.({ phase: "retrying-stalled-analysis", moduleId: request.module.id, sourceSetId: request.sourceSet.name });
      return runCompiler(request);
    }
  }

  function runCompiler(request) {
    const argumentFile = path.join(request.revisionRoot, `${path.basename(request.jar)}.args`);
    const ownJavaRoots = request.sourceSet.javaSourceRoots?.length
      ? request.sourceSet.javaSourceRoots
      : commonSourceRoots(request.sourceSet.java, "java");
    const localDependencyNames = new Set(request.sourceSet.localSourceSetDependencies || []);
    if (request.sourceSet.test === true || request.sourceSet.dependsOnMain === true) localDependencyNames.add("main");
    const localJavaRoots = request.module.sourceSets.filter((sourceSet) => localDependencyNames.has(sourceSet.name))
      .flatMap((sourceSet) => sourceSet.javaSourceRoots?.length ? sourceSet.javaSourceRoots : commonSourceRoots(sourceSet.java, "java"));
    const javaRoots = Array.from(new Set([...ownJavaRoots, ...localJavaRoots, ...(request.sourceSet.dependencyJavaSourceRoots || [])]));
    const classpath = Array.from(new Set([...(request.sourceSet.classpath || []), ...(request.dependencyAbiJars || [])]))
      .filter((entry) => fs.existsSync(entry));
    const fullJar = path.join(request.revisionRoot, `${path.basename(request.jar)}.full.jar`);
    const args = [
      ...request.sourceSet.kotlin,
      ...javaRoots.map((root) => `-Xjava-source-roots=${root}`),
      ...(classpath.length ? ["-classpath", classpath.join(path.delimiter)] : []),
      ...(request.sourceSet.compilerArguments || []).filter(isSafeCompilerArgument),
      ...resolveCompilerPluginPaths(request.sourceSet.compilerPluginClasspath, options.compilerExecutable).map((entry) => `-Xplugin=${entry}`),
      "-Xrender-internal-diagnostic-names",
      "-d", fullJar,
      `-Xplugin=${options.abiPlugin}`,
      "-P", `plugin:org.jetbrains.kotlin.jvm.abi:outputDir=${request.jar}`
    ];
    fs.writeFileSync(argumentFile, args.map(quoteArgumentFileValue).join("\n"), "utf8");
    return new Promise((resolve, reject) => {
      const child = spawnCommand(options.compilerExecutable, [`@${argumentFile}`], {
        cwd: request.model.workspaceRoot,
        windowsHide: true,
        env: options.environment || process.env
      });
      let output = "";
      let lastProgress = Date.now();
      let killedForStall = false;
      const accept = (chunk) => {
        const text = String(chunk);
        output += text;
        lastProgress = Date.now();
        options.onProgress?.(text);
      };
      child.stderr.on("data", accept);
      child.stdout.on("data", accept);
      const timer = setInterval(() => {
        if (Date.now() - lastProgress <= (options.stallTimeoutMs || 300000)) return;
        killedForStall = true;
        child.kill();
      }, 1000);
      child.on("error", (error) => { clearInterval(timer); reject(error); });
      child.on("exit", (code) => {
        clearInterval(timer);
        const diagnostics = parseCompilerDiagnostics(output, request.model.workspaceRoot);
        if (code === 0 && fs.existsSync(request.jar)) resolve({ diagnostics });
        else reject(Object.assign(new Error(output.trim() || `Kotlin ABI compiler exited with ${code}.`), { diagnostics, stalled: killedForStall }));
      });
    });
  }

  function supersedePendingSnapshot() {
    if (!pendingSnapshot) return;
    revisionLeases.release(pendingSnapshot.workspaceRevision, "generation");
    pendingSnapshot = null;
  }

  function confirmApplied(workspaceRevision) {
    const revision = String(workspaceRevision || "");
    if (pendingSnapshot && revision === String(pendingSnapshot.workspaceRevision || "")) {
      revisionLeases.replaceJdtRevision(installedSnapshot, pendingSnapshot);
      installedSnapshot = pendingSnapshot;
      lastValidSnapshot = pendingSnapshot;
      pendingSnapshot = null;
      writeCachedSnapshot(options.cacheRoot, installedSnapshot);
      return true;
    }
    return Boolean(installedSnapshot && revision === String(installedSnapshot.workspaceRevision || ""));
  }

  return {
    refresh,
    confirmApplied,
    getLastValidSnapshot: () => lastValidSnapshot,
    getRevisionLeaseState: revisionLeases.getState
  };
}

function orderSourceSets(model) {
  return createKotlinAbiDependencyPlan(model).flatMap((group) => group.items);
}

function mergeCompilationGroup(group) {
  const first = group.items[0];
  const sourceSets = group.items.map((item) => item.sourceSet);
  const distinctPatchModules = Array.from(new Set(sourceSets.map((sourceSet) => sourceSet.patchModule || "").filter(Boolean)));
  if (distinctPatchModules.length > 1) {
    throw Object.assign(new Error(`Kotlin ABI cycle has incompatible patch modules: ${distinctPatchModules.join(", ")}`), {
      code: "kotlin-abi-incompatible-cycle-options"
    });
  }
  return {
    module: first.module,
    sourceSet: {
      name: sourceSets.map((sourceSet) => sourceSet.name).sort().join("+"),
      kotlin: unique(sourceSets.flatMap((sourceSet) => sourceSet.kotlin || [])),
      java: unique(sourceSets.flatMap((sourceSet) => sourceSet.java || [])),
      javaSourceRoots: unique(sourceSets.flatMap((sourceSet) => sourceSet.javaSourceRoots || [])),
      dependencyJavaSourceRoots: unique(sourceSets.flatMap((sourceSet) => sourceSet.dependencyJavaSourceRoots || [])),
      classpath: unique(sourceSets.flatMap((sourceSet) => sourceSet.classpath || [])),
      compilerArguments: unique(sourceSets.flatMap((sourceSet) => sourceSet.compilerArguments || [])),
      compilerPluginClasspath: unique(sourceSets.flatMap((sourceSet) => sourceSet.compilerPluginClasspath || [])),
      localSourceSetDependencies: [],
      test: sourceSets.every((sourceSet) => sourceSet.test === true),
      modulePath: sourceSets.some((sourceSet) => sourceSet.modulePath === true),
      patchModule: distinctPatchModules[0] || ""
    }
  };
}

function unique(values) {
  return Array.from(new Set(values));
}

function parseCompilerDiagnostics(output, workspaceRoot = process.cwd()) {
  const diagnostics = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^(?:[ewi]:\s+)?(?:file:\/\/\/)?(.+?\.kts?):(?:(\d+):(\d+)|\s*\((\d+),\s*(\d+)\))\s*:?\s*(?:\[(.+?)\]\s*)?(.*)$/i);
    if (!match) continue;
    const prefix = line.trim().slice(0, 1).toLowerCase();
    const message = String(match[7] || "").trim();
    const textualSeverity = /^(error|warning|information):\s*/i.exec(message);
    const filePath = path.resolve(workspaceRoot, match[1]);
    diagnostics.push({
      severity: prefix === "e" ? "error" : prefix === "w" ? "warning" : textualSeverity?.[1]?.toLowerCase() || "information",
      source: "Kotlin Compiler",
      file: filePath,
      filePath,
      line: Number(match[2] || match[4]) || 1,
      column: Number(match[3] || match[5]) || 1,
      code: match[6] || "",
      message: message.replace(/^(?:error|warning|information):\s*/i, "") || "Kotlin compiler diagnostic"
    });
  }
  return diagnostics;
}
function commonSourceRoots(files, language) {
  const marker = `${path.sep}src${path.sep}`;
  return Array.from(new Set((files || []).map((file) => {
    const normalized = path.resolve(file);
    const index = normalized.toLowerCase().lastIndexOf(marker);
    if (index < 0) return path.dirname(file);
    const rest = normalized.slice(index + marker.length).split(path.sep);
    return path.join(normalized.slice(0, index + marker.length), rest[0], language);
  })));
}

function resolveCompilerPluginPaths(pluginClasspath, compilerExecutable) {
  const bundledLib = path.resolve(path.dirname(compilerExecutable), "..", "lib");
  return Array.from(new Set((pluginClasspath || []).filter((entry) => /-compiler-plugin/i.test(path.basename(entry))).map((entry) => {
    const bundledName = path.basename(entry).replace(/-embeddable(?=-\d)/i, "").replace(/-\d[^/\\]*\.jar$/i, ".jar");
    const bundled = path.join(bundledLib, bundledName);
    return fs.existsSync(bundled) ? bundled : entry;
  }).filter((entry) => fs.existsSync(entry))));
}

function isSafeCompilerArgument(argument) {
  return !/^(?:-d|-classpath|-cp|-Xplugin=|-P$)/.test(String(argument || ""));
}

function quoteArgumentFileValue(value) {
  const text = String(value || "");
  return /[\s"]/u.test(text) ? `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : text;
}

function validateJar(file) {
  const handle = fs.openSync(file, "r");
  const header = Buffer.alloc(2);
  fs.readSync(handle, header, 0, 2, 0);
  fs.closeSync(handle);
  if (header.toString("ascii") !== "PK") throw new Error(`Invalid Kotlin ABI JAR: ${file}`);
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function toFileUri(file) {
  return `file:///${path.resolve(file).replace(/\\/g, "/").replace(/^\//, "")}`;
}

function safeName(value) {
  return String(value || "main").replace(/[^a-z0-9._-]+/gi, "-");
}

function readCachedSnapshot(cacheRoot) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(path.join(cacheRoot, "abi", "current.json"), "utf8"));
    if (Number(snapshot.metadataVersion) !== ABI_METADATA_VERSION) return null;
    if (!snapshot.entries?.every((entry) => fs.existsSync(entry.jarPath)
        && typeof entry.contentHash === "string" && entry.contentHash.length > 0
        && Array.isArray(entry.expectedFqns))) return null;
    return { ...snapshot, snapshotUri: snapshot.snapshotUri || toFileUri(path.join(cacheRoot, "abi", "current.json")) };
  } catch (_error) {
    return null;
  }
}

function mergeSnapshotMetadata(installed, candidate) {
  const candidates = new Map((candidate.entries || [])
    .map((entry) => [`${entry.moduleId}:${entry.sourceSetId}`, entry]));
  return {
    ...installed,
    metadataVersion: ABI_METADATA_VERSION,
    modelSignature: candidate.modelSignature,
    entries: (installed.entries || []).map((entry) => {
      const candidateEntry = candidates.get(`${entry.moduleId}:${entry.sourceSetId}`);
      if (!candidateEntry) return entry;
      return {
        ...entry,
        contentHash: candidateEntry.contentHash,
        expectedFqns: candidateEntry.expectedFqns
      };
    })
  };
}

function writeCachedSnapshot(cacheRoot, snapshot) {
  const file = path.join(cacheRoot, "abi", "current.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2), "utf8");
  fs.renameSync(temporary, file);
}


module.exports = { createKotlinAbiController, parseCompilerDiagnostics, commonSourceRoots, orderSourceSets, resolveCompilerPluginPaths };
