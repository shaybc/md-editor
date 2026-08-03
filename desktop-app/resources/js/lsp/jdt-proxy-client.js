(function(global) {
  "use strict";

  const DEFAULT_INTERACTIVE_TIMEOUT_MS = 3000;
  const SEMANTIC_REFACTORING_TIMEOUT_MS = 60000;
  const PROBLEMS_QUERY_TIMEOUT_MS = 30000;
  const INITIALIZE_TIMEOUT_MS = 120000;
  const PROXY_SHUTDOWN_TIMEOUT_MS = 30000;
  // Generating Eclipse preference files runs a real Gradle invocation (wrapper
  // download, configuration, eclipseJdt) - allow the same order of time as imports.
  const ECLIPSE_PREFERENCES_TIMEOUT_MS = 900000;
  const RESTART_DELAY_MS = 4000;
  const DEFAULT_MAXIMUM_PROBLEMS = 5000;
  const INTERACTIVE_METHODS = new Set([
    "textDocument/completion",
    "completionItem/resolve",
    "textDocument/hover",
    "textDocument/definition",
    "textDocument/declaration",
    "textDocument/typeDefinition",
    "textDocument/implementation",
    "textDocument/documentSymbol",
    "workspace/symbol",
    "textDocument/references",
    "textDocument/codeAction",
    "codeAction/resolve",
    "textDocument/prepareRename",
    "textDocument/rename",
    "java/getRefactorEdit",
    "java/checkExtractInterfaceStatus"
  ]);

  /** Own stable renderer-side sessions for isolated JDT proxy processes. */
  function registerMarkdownViewerJdtProxyClient(app, deps = {}) {
    const sessions = new Map();
    const diagnosticSummaryListeners = new Set();
    const analysisGenerationsByWorkspace = new Map();
    let nextProblemsRequestId = 1;

    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function workspaceKey(value) {
      return normalizePath(value).toLowerCase();
    }

    function quoteCommandPart(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    function joinPath() {
      return Array.from(arguments).map(normalizePath).filter(Boolean).join("/");
    }

    function toFileUri(filePath) {
      const normalized = normalizePath(filePath);
      const pathname = /^[A-Za-z]:\//.test(normalized) ? `/${normalized}` : normalized;
      return `file://${encodeURI(pathname)}`;
    }

    function getAnalysisWorkspaceFolders() {
      const model = deps.getWorkspaceModel?.() || null;
      const buildSystem = model?.analysisInventory?.buildSystem;
      if (buildSystem !== "gradle" && buildSystem !== "maven") return [];
      const normalizedRoot = normalizePath(model.workspaceRoot);
      if (!normalizedRoot) return [];
      return [{
        uri: toFileUri(normalizedRoot),
        name: normalizedRoot.split("/").filter(Boolean).pop() || "Java Project",
        path: normalizedRoot
      }];
    }

    function getDesktopRootPath() {
      const value = normalizePath(deps.getDesktopAppRootPath?.() || "");
      return /(?:^|\/)resources$/i.test(value) ? value.replace(/\/resources$/i, "") : value;
    }

    function getInteractiveTimeoutMs() {
      const value = Number(deps.getInteractiveRequestTimeoutMs?.());
      return Number.isFinite(value) ? Math.min(60000, Math.max(500, Math.round(value / 500) * 500)) : DEFAULT_INTERACTIVE_TIMEOUT_MS;
    }

    function getMaximumProblems() {
      const value = Number(deps.getMaximumProblems?.());
      return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : DEFAULT_MAXIMUM_PROBLEMS;
    }

    function getRequestTimeoutMs(method) {
      const methodName = String(method || "");
      if (methodName === "initialize") return INITIALIZE_TIMEOUT_MS;
      // Refactoring metadata and reference searches can scan an entire imported workspace
      // and routinely outlive latency-oriented completion and hover requests.
      if (methodName === "java/getChangeSignatureInfo" || methodName === "textDocument/references") {
        return SEMANTIC_REFACTORING_TIMEOUT_MS;
      }
      return INTERACTIVE_METHODS.has(methodName) ? getInteractiveTimeoutMs() : 0;
    }

    async function writeLaunchFile(options) {
      const Neutralino = getNeutralino();
      const tempFolder = normalizePath(await Neutralino.os.getPath("temp"));
      const filePath = `${tempFolder}/md-editor-jdt-proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
      const workspaceModel = deps.getWorkspaceModel?.() || null;
      const workspaceRuntime = deps.getWorkspaceRuntime?.() || null;
      const aspectjEligible = workspaceModel?.importers?.gradle === true && workspaceModel?.hasAspectjContent === true;
      await Neutralino.filesystem.writeFile(filePath, JSON.stringify({
        command: options.launch.command,
        cwd: options.launch.cwd,
        key: options.key,
        workspaceRoot: options.workspaceRoot,
        generationId: Number(analysisGenerationsByWorkspace.get(workspaceKey(options.workspaceRoot))?.generationId) || 0,
        jdtLogPath: options.jdtLogPath,
        maximumProblems: getMaximumProblems(),
        aspectjDiagnostics: {
          enabled: deps.getAspectjDiagnosticsEnabled?.() === true && aspectjEligible,
          eligible: aspectjEligible,
          scopeUris: (workspaceModel?.aspectjModuleRoots || []).map(toFileUri),
          projectJdkHome: workspaceRuntime?.projectJdk?.path || "",
          toolingJdkHome: workspaceRuntime?.launcherJdk?.path || "",
          gradle: deps.getAspectjGradleSettings?.(workspaceModel?.projectConfiguration?.gradle || {}) || {}
        },
        // Generic Gradle tooling context for auxiliary analysis runs (for example
        // generating the project's Eclipse preference files with eclipseJdt).
        gradleTooling: {
          projectJdkHome: workspaceRuntime?.projectJdk?.path || "",
          gradle: deps.getAspectjGradleSettings?.(workspaceModel?.projectConfiguration?.gradle || {}) || {}
        }
      }));
      return filePath;
    }

    async function getProxyCommand(options) {
      const bridgePath = joinPath(getDesktopRootPath() || ".", "resources", "bridges", "jdt-proxy-bridge", "jdt-proxy-bridge.cjs");
      return `node ${quoteCommandPart(bridgePath)} --request-file ${quoteCommandPart(await writeLaunchFile(options))}`;
    }

    function notifySummary(session, summary) {
      session.latestSummary = { ...summary, key: session.key, workspaceRoot: session.workspaceRoot };
      diagnosticSummaryListeners.forEach((listener) => {
        try { listener(session.latestSummary); } catch (_error) { /* Observers cannot interrupt proxy control. */ }
      });
    }

    function createTransport(session) {
      const subscribers = new Set();
      const pendingMethodsById = new Map();
      return {
        getRequestTimeoutMs,
        send(payload) {
          const message = typeof payload === "string" ? JSON.parse(payload) : payload;
          const method = String(message?.method || "");
          let outboundMessage = message;
          if (method === "initialize") {
            const params = { ...(message.params || {}) };
            const analysisWorkspaceFolders = getAnalysisWorkspaceFolders();
            if (analysisWorkspaceFolders.length) {
              params.rootUri = analysisWorkspaceFolders[0].uri;
              params.rootPath = analysisWorkspaceFolders[0].path;
              params.workspaceFolders = analysisWorkspaceFolders.map(({ uri, name }) => ({ uri, name }));
            }
            const initializationOptions = { ...(params.initializationOptions || {}) };
            if (session.options.jdtExtensionBundles?.length) {
              initializationOptions.bundles = Array.from(new Set([
                ...(initializationOptions.bundles || []),
                ...session.options.jdtExtensionBundles
              ]));
            }
            outboundMessage = {
              ...message,
              params: { ...params, initializationOptions }
            };
          }
          if (message?.id !== undefined && method) pendingMethodsById.set(String(message.id), method);
          const timeoutMs = message?.id !== undefined ? getRequestTimeoutMs(method) : 0;
          session.send({
            type: "lsp-send",
            requestId: message?.id,
            method,
            generationId: session.activeGenerationId,
            workspaceRoot: session.workspaceRoot,
            expiresAt: timeoutMs ? Date.now() + timeoutMs : undefined,
            message: outboundMessage
          });
        },
        subscribe(handler) { subscribers.add(handler); },
        unsubscribe(handler) { subscribers.delete(handler); },
        takePendingMethod(id) {
          const key = String(id ?? "");
          const method = pendingMethodsById.get(key) || "";
          pendingMethodsById.delete(key);
          return method;
        },
        emit(payload) { subscribers.forEach((handler) => handler(payload)); }
      };
    }

    function createSession(options) {
      const session = {
        key: options.key,
        workspaceRoot: options.workspaceRoot,
        launch: options.launch,
        processId: "",
        processPid: "",
        processHandle: null,
        unregisterProcessOwner: null,
        outputBuffer: "",
        stdinQueue: Promise.resolve(),
        stopping: false,
        initialized: false,
        unavailable: false,
        consecutiveFailures: 0,
        restartTimer: null,
        latestSummary: null,
        activeUri: "",
        pendingProblems: new Map(),
        pendingTasks: new Map(),
        exitWaiters: new Set(),
        pendingOutbound: [],
        activeGenerationId: Number(analysisGenerationsByWorkspace.get(workspaceKey(options.workspaceRoot))?.generationId) || 0,
        options
      };
      session.transport = createTransport(session);
      session.send = (message) => {
        const Neutralino = getNeutralino();
        if (session.unavailable) return;
        if (session.processId === "" || !Neutralino?.os?.updateSpawnedProcess) {
          session.pendingOutbound.push(message);
          return;
        }
        const write = () => Neutralino.os.updateSpawnedProcess(session.processId, "stdIn", `${JSON.stringify(message)}\n`);
        session.stdinQueue = session.stdinQueue.then(write).catch((error) => options.onError?.(error));
      };
      return session;
    }

    function emitLspMessage(session, message) {
      const payload = JSON.stringify(message || {});
      session.options.onLspMessage?.(payload);
      session.transport.emit(payload);
    }

    function parseProxyOutput(session, chunk) {
      session.outputBuffer += String(chunk || "");
      let newlineIndex = session.outputBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = session.outputBuffer.slice(0, newlineIndex).trim();
        session.outputBuffer = session.outputBuffer.slice(newlineIndex + 1);
        if (line) {
          try { handleProxyMessage(session, JSON.parse(line)); }
          catch (error) { session.options.onError?.(error); }
        }
        newlineIndex = session.outputBuffer.indexOf("\n");
      }
    }

    function handleProxyMessage(session, message) {
      if (message.generationId !== undefined && Number(message.generationId) !== Number(session.activeGenerationId)) {
        deps.diagnosticLifecycleTrace?.mark?.("stale-proxy-generation-message-ignored", {
          generationId: session.activeGenerationId,
          workspaceRoot: session.workspaceRoot,
          eventGenerationId: Number(message.generationId) || 0,
          eventType: String(message.type || message.phase || "")
        });
        return;
      }
      if (["lsp-message", "diagnostic-summary", "status"].includes(message.type)) {
        deps.onJdtProgress?.({
          generationId: session.activeGenerationId,
          workspaceRoot: session.workspaceRoot,
          phase: String(message.phase || message.message?.method || message.type)
        });
      }
      if (message.type === "lsp-message") {
        emitLspMessage(session, message.message);
      } else if (message.type === "active-diagnostics") {
        emitLspMessage(session, {
          jsonrpc: "2.0",
          method: "textDocument/publishDiagnostics",
          params: { uri: message.uri, version: message.version, diagnostics: message.diagnostics || [] }
        });
      } else if (message.type === "diagnostic-summary") {
        deps.diagnosticLifecycleTrace?.markProviderSnapshot?.("jdt", {
          ...message.summary,
          workspaceRoot: session.workspaceRoot,
          sessionKey: session.key
        });
        notifySummary(session, message.summary || {});
      } else if (message.type === "diagnostic-generation-settled") {
        notifySummary(session, message.summary || {});
        deps.onJdtDiagnosticsSettled?.({
          ...message.summary,
          generationId: Number(message.generationId) || session.activeGenerationId,
          workspaceRoot: session.workspaceRoot,
          snapshotId: String(message.snapshotId || message.summary?.snapshotId || "")
        });
      } else if (message.type === "diagnostic-generation-unsettled") {
        deps.onJdtDiagnosticsUnsettled?.({
          generationId: Number(message.generationId) || session.activeGenerationId,
          workspaceRoot: session.workspaceRoot
        });
      } else if (message.type === "problems-result") {
        const pending = session.pendingProblems.get(String(message.requestId || ""));
        if (pending) {
          session.pendingProblems.delete(String(message.requestId || ""));
          global.clearTimeout(pending.timer);
          pending.resolve(message);
        }
      } else if (message.type === "tasks-result") {
        const pending = session.pendingTasks.get(String(message.requestId || ""));
        if (pending) {
          session.pendingTasks.delete(String(message.requestId || ""));
          global.clearTimeout(pending.timer);
          pending.resolve(message);
        }
      } else if (message.type === "eclipse-preferences-result") {
        const pending = session.pendingEclipsePreferences?.get(String(message.requestId || ""));
        if (pending) {
          session.pendingEclipsePreferences.delete(String(message.requestId || ""));
          global.clearTimeout(pending.timer);
          pending.resolve(message);
        }
      } else if (message.type === "project-analysis-failed") {
        session.options.onProjectAnalysisFailure?.(Object.assign({
          key: session.key,
          workspaceRoot: session.workspaceRoot,
          sessionId: session.key
        }, message.failure || {}));
      } else if (message.type === "aspectj-diagnostics-failed") {
        deps.diagnosticLifecycleTrace?.mark?.("ajdt-analysis-failed", {
          workspaceRoot: session.workspaceRoot,
          code: String(message.failure?.code || ""),
          reason: String(message.failure?.reason || "")
        });
        deps.onAspectjDiagnosticsFailure?.({
          ...(message.failure || {}),
          generationId: Number(message.generationId) || session.activeGenerationId,
          workspaceRoot: session.workspaceRoot
        });
      } else if (message.type === "aspectj-diagnostics-ready") {
        deps.diagnosticLifecycleTrace?.mark?.("ajdt-snapshot-installed", {
          workspaceRoot: session.workspaceRoot,
          diagnosticCount: Number(message.diagnosticCount) || 0,
          providerCounts: {
            ajdt: {
              totalCount: Number(message.diagnosticCount) || 0,
              availableCount: Number(message.diagnosticCount) || 0
            }
          }
        });
        deps.onAspectjDiagnosticsReady?.({ ...message, workspaceRoot: session.workspaceRoot });
      } else if (message.type === "aspectj-diagnostics-cleared") {
        deps.diagnosticLifecycleTrace?.mark?.("ajdt-snapshot-cleared", {
          workspaceRoot: session.workspaceRoot,
          providerCounts: { ajdt: { totalCount: 0, availableCount: 0 } }
        });
        deps.onAspectjDiagnosticsCleared?.();
      } else if (message.type === "status") {
        if (message.phase === "lifecycle" && message.message) emitLspMessage(session, message.message);
        if (["ajdt-diagnostics-waiting", "ajdt-diagnostics-started", "ajdt-diagnostics-status"].includes(message.phase)) {
          deps.diagnosticLifecycleTrace?.mark?.(message.phase, {
            workspaceRoot: session.workspaceRoot,
            message: String(message.message || "")
          });
          deps.onAspectjDiagnosticsStatus?.(message);
        }
        if (["log", "stderr"].includes(message.phase)) {
          deps.appDebugLog?.(message.level || "warning", "[lsp] JDT proxy status", { key: session.key, message: message.message || "" });
        }
        if (["workspace-log-monitor-started", "build-started", "build-complete"].includes(message.phase)) {
          deps.appDebugLog?.("info", "[lsp] JDT workspace lifecycle", {
            key: session.key,
            phase: message.phase,
            message: message.message || "",
            logPath: message.logPath || ""
          });
        }
        if (message.phase === "initialized") {
          session.initialized = true;
          session.consecutiveFailures = 0;
        }
        session.options.onStatus?.(message);
      } else if (message.type === "error") {
        session.options.onError?.(new Error(message.error || "JDT proxy error."), message);
      }
    }

    async function spawnProxy(session) {
      const Neutralino = getNeutralino();
      session.stopping = false;
      session.initialized = false;
      session.unavailable = false;
      const handle = await Neutralino.os.spawnProcess(await getProxyCommand(session), {
        cwd: getDesktopRootPath() || session.workspaceRoot || ""
      });
      session.processHandle = handle;
      session.processId = handle?.id ?? handle;
      session.processPid = handle?.pid ?? "";
      const registeredProcessId = String(session.processId);
      session.unregisterProcessOwner = deps.processRouter?.registerProcess?.(handle, {
        onStdout(data) { parseProxyOutput(session, data); },
        onStderr(data) { deps.appDebugLog?.("warning", "[lsp] JDT proxy stderr", { key: session.key, data: String(data || "").slice(0, 500) }); },
        onExit(detail) { handleProxyExit(session, detail, registeredProcessId); }
      });
      session.options.onProcessChanged?.(session);
      if (session.activeGenerationId) {
        session.send({
          type: "begin-analysis-generation",
          generationId: session.activeGenerationId,
          workspaceRoot: session.workspaceRoot
        });
      }
      session.send({ type: "configure", interactiveRequestTimeoutMs: getInteractiveTimeoutMs(), maximumProblems: getMaximumProblems(), aspectjDiagnosticsEnabled: deps.getAspectjDiagnosticsEnabled?.() === true });
      if (session.activeUri) session.send({ type: "set-active-document", uri: session.activeUri });
      if (session.kotlinAbiSnapshot) session.send({ type: "kotlin-abi-snapshot", snapshot: session.kotlinAbiSnapshot });
      const pendingOutbound = session.pendingOutbound.splice(0);
      pendingOutbound.forEach((message) => session.send(message));
      return session;
    }

    function handleProxyExit(session, detail = {}, registeredProcessId = String(session.processId)) {
      if (registeredProcessId !== String(session.processId)) return;
      session.unregisterProcessOwner?.();
      session.unregisterProcessOwner = null;
      session.processHandle = null;
      session.processId = "";
      session.processPid = "";
      session.pendingProblems.forEach((pending) => {
        global.clearTimeout(pending.timer);
        pending.reject(new Error("JDT proxy restarted before returning problems."));
      });
      session.pendingProblems.clear();
      session.pendingTasks.forEach((pending) => {
        global.clearTimeout(pending.timer);
        pending.reject(new Error("JDT proxy restarted before returning tasks."));
      });
      session.pendingTasks.clear();
      session.exitWaiters.forEach((waiter) => waiter(true));
      session.exitWaiters.clear();
      session.options.onProcessChanged?.(session);
      if (session.stopping) {
        session.options.onExit?.(detail);
        return;
      }
      session.consecutiveFailures += 1;
      if (session.consecutiveFailures <= 1) {
        deps.onRestartGeneration?.({ workspaceRoot: session.workspaceRoot, reason: "jdt-auto-restart", sessionKey: session.key });
        session.options.onStatus?.({ phase: "restarting", delayMs: RESTART_DELAY_MS });
        session.restartTimer = global.setTimeout(() => {
          session.restartTimer = null;
          void spawnProxy(session).catch((error) => handleStartFailure(session, error));
        }, RESTART_DELAY_MS);
        return;
      }
      session.unavailable = true;
      session.pendingOutbound.length = 0;
      session.options.onUnavailable?.(session, detail);
    }

    function handleStartFailure(session, error) {
      session.options.onError?.(error);
      handleProxyExit(session, { error: error?.message || String(error) });
    }

    async function startSession(options) {
      if (sessions.has(options.key)) return sessions.get(options.key);
      const session = createSession(options);
      sessions.set(options.key, session);
      try { await spawnProxy(session); }
      catch (error) { handleStartFailure(session, error); }
      return session;
    }

    async function forceKill(session) {
      const Neutralino = getNeutralino();
      const pid = String(session.processPid || "");
      if (!/^\d+$/.test(pid) || !Neutralino?.os?.execCommand) return false;
      await Neutralino.os.execCommand(`cmd /c taskkill /PID ${pid} /T /F`);
      return true;
    }

    /** Wait until Neutralino confirms that the owned proxy process has exited. */
    function waitForProxyExit(session) {
      if (session.processId === "" || session.processId === null || session.processId === undefined) return Promise.resolve(true);
      return new Promise((resolve) => {
        const finish = (exited) => {
          global.clearTimeout(timer);
          session.exitWaiters.delete(finish);
          resolve(exited);
        };
        const timer = global.setTimeout(() => finish(false), PROXY_SHUTDOWN_TIMEOUT_MS);
        session.exitWaiters.add(finish);
      });
    }

    async function stopSession(sessionOrKey, options = {}) {
      const session = typeof sessionOrKey === "string" ? sessions.get(sessionOrKey) : sessionOrKey;
      if (!session) return;
      session.stopping = true;
      if (session.restartTimer) global.clearTimeout(session.restartTimer);
      session.restartTimer = null;
      if (options.force === true) await forceKill(session);
      else {
        const exitPending = waitForProxyExit(session);
        session.send({ type: "stop" });
        if (!await exitPending) await forceKill(session);
      }
      session.pendingProblems.forEach((pending) => {
        global.clearTimeout(pending.timer);
        pending.reject(new Error("JDT proxy stopped."));
      });
      session.pendingProblems.clear();
      session.pendingTasks.forEach((pending) => {
        global.clearTimeout(pending.timer);
        pending.reject(new Error("JDT proxy stopped."));
      });
      session.pendingTasks.clear();
      session.pendingEclipsePreferences?.forEach((pending) => {
        global.clearTimeout(pending.timer);
        pending.reject(new Error("JDT proxy stopped."));
      });
      session.pendingEclipsePreferences?.clear();
      session.pendingOutbound.length = 0;
      sessions.delete(session.key);
    }

    /** Stop every spawned JDT proxy session. */
    async function stopAllSessions(options = {}) {
      await Promise.all(Array.from(sessions.values()).map((session) => stopSession(session, options)));
    }

    async function restartSession(sessionOrKey) {
      const session = typeof sessionOrKey === "string" ? sessions.get(sessionOrKey) : sessionOrKey;
      if (!session) return false;
      deps.onRestartGeneration?.({ workspaceRoot: session.workspaceRoot, reason: "jdt-manual-restart", sessionKey: session.key });
      session.consecutiveFailures = 0;
      session.unavailable = false;
      session.stopping = true;
      if (session.restartTimer) global.clearTimeout(session.restartTimer);
      session.restartTimer = null;
      await forceKill(session);
      session.stopping = false;
      await spawnProxy(session);
      return true;
    }

    function setActiveDocument(key, uri) {
      const session = sessions.get(String(key || ""));
      if (!session) return false;
      session.activeUri = String(uri || "");
      session.send({ type: "set-active-document", uri: session.activeUri });
      return true;
    }

    function clearActiveDocuments() {
      sessions.forEach((session) => {
        session.activeUri = "";
        session.send({ type: "set-active-document", uri: "" });
      });
    }

    function updateKotlinAbiSnapshot(key, snapshot) {
      const session = sessions.get(String(key || ""));
      if (!session) return false;
      session.kotlinAbiSnapshot = snapshot || null;
      session.send({ type: "kotlin-abi-snapshot", snapshot: session.kotlinAbiSnapshot });
      return true;
    }

    /** Assign the canonical renderer generation to the matching proxy session. */
    function beginAnalysisGeneration(value = {}) {
      const workspaceRoot = String(value.workspaceRoot || "");
      const generationId = Number(value.generationId) || 0;
      if (!workspaceRoot || !generationId) return false;
      analysisGenerationsByWorkspace.set(workspaceKey(workspaceRoot), { generationId, workspaceRoot });
      const session = Array.from(sessions.values()).find((candidate) => workspaceKey(candidate.workspaceRoot) === workspaceKey(workspaceRoot));
      if (!session) return true;
      session.activeGenerationId = generationId;
      session.send({ type: "begin-analysis-generation", generationId, workspaceRoot });
      return true;
    }

    /** Ask the proxy to seal diagnostics after the generation's explicit final build. */
    function finalizeAnalysisGeneration(value = {}) {
      const workspaceRoot = String(value.workspaceRoot || "");
      const generationId = Number(value.generationId) || 0;
      const session = Array.from(sessions.values()).find((candidate) => workspaceKey(candidate.workspaceRoot) === workspaceKey(workspaceRoot));
      if (!session || session.activeGenerationId !== generationId) return false;
      const validatedKeys = new Set((value.validatedProjectRoots || []).map(workspaceKey));
      const aspectjRoots = deps.getWorkspaceModel?.()?.aspectjModuleRoots || [];
      session.send({
        type: "finalize-analysis-generation",
        generationId,
        workspaceRoot,
        ajdtRequired: value.ajdtRequired === true,
        scopeUris: aspectjRoots.filter((root) => validatedKeys.has(workspaceKey(root))).map(toFileUri)
      });
      return true;
    }

    function configure() {
      const interactiveRequestTimeoutMs = getInteractiveTimeoutMs();
      const maximumProblems = getMaximumProblems();
      const aspectjDiagnosticsEnabled = deps.getAspectjDiagnosticsEnabled?.() === true;
      sessions.forEach((session) => session.send({ type: "configure", interactiveRequestTimeoutMs, maximumProblems, aspectjDiagnosticsEnabled }));
      return interactiveRequestTimeoutMs;
    }

    function getProblems(options = {}) {
      const session = options.key ? sessions.get(options.key) : Array.from(sessions.values()).find((candidate) => {
        return !options.workspaceRoot || normalizePath(candidate.workspaceRoot).toLowerCase() === normalizePath(options.workspaceRoot).toLowerCase();
      });
      if (!session || session.unavailable) {
        return Promise.resolve({
          revision: session?.latestSummary?.revision || 0,
          problems: [],
          totalCount: session?.latestSummary?.totalCount || 0,
          availableCount: session?.latestSummary?.availableCount || 0,
          maximumProblems: getMaximumProblems(),
          snapshotId: String(options.snapshotId || ""),
          generationId: Number(options.generationId) || session?.activeGenerationId || 0
        });
      }
      const requestId = `jdt-problems-${Date.now()}-${nextProblemsRequestId++}`;
      return new Promise((resolve, reject) => {
        const timer = global.setTimeout(() => {
          session.pendingProblems.delete(requestId);
          reject(new Error("JDT problem query timed out."));
        }, PROBLEMS_QUERY_TIMEOUT_MS);
        session.pendingProblems.set(requestId, { resolve, reject, timer });
        session.send({
          type: "get-problems",
          requestId,
          offset: options.offset || 0,
          limit: options.limit || 100,
          snapshotId: String(options.snapshotId || ""),
          generationId: Number(options.generationId) || session.activeGenerationId
        });
      });
    }

    /** Query Java task markers from one generation-pinned JDT snapshot. */
    function getTasks(options = {}) {
      const session = options.key ? sessions.get(options.key) : Array.from(sessions.values()).find((candidate) => {
        return !options.workspaceRoot || normalizePath(candidate.workspaceRoot).toLowerCase() === normalizePath(options.workspaceRoot).toLowerCase();
      });
      if (!session || session.unavailable) {
        return Promise.resolve({
          tasks: [],
          totalCount: 0,
          availableCount: 0,
          snapshotId: String(options.snapshotId || ""),
          generationId: Number(options.generationId) || session?.activeGenerationId || 0,
          workspaceRoot: String(options.workspaceRoot || session?.workspaceRoot || "")
        });
      }
      const requestId = `jdt-tasks-${Date.now()}-${nextProblemsRequestId++}`;
      return new Promise((resolve, reject) => {
        const timer = global.setTimeout(() => {
          session.pendingTasks.delete(requestId);
          reject(new Error("JDT task query timed out."));
        }, PROBLEMS_QUERY_TIMEOUT_MS);
        session.pendingTasks.set(requestId, { resolve, reject, timer });
        session.send({
          type: "get-tasks",
          requestId,
          offset: options.offset || 0,
          limit: options.limit || 5000,
          snapshotId: String(options.snapshotId || ""),
          generationId: Number(options.generationId) || session.activeGenerationId,
          workspaceRoot: session.workspaceRoot
        });
      });
    }

    /**
     * Run the project's Eclipse-preference-generating Gradle task (eclipseJdt)
     * through the proxy bridge and resolve with the run outcome.
     *
     * @param {object} session - An active JDT proxy session.
     * @returns {Promise<{ok: boolean, description: string, logPath: string}>}
     */
    function runEclipsePreferences(session) {
      if (!session || session.unavailable) {
        return Promise.resolve({ ok: false, description: "The JDT session is unavailable.", logPath: "" });
      }
      if (!session.pendingEclipsePreferences) session.pendingEclipsePreferences = new Map();
      const requestId = `eclipse-preferences-${Date.now()}-${nextProblemsRequestId++}`;
      return new Promise((resolve, reject) => {
        const timer = global.setTimeout(() => {
          session.pendingEclipsePreferences.delete(requestId);
          reject(new Error("Eclipse preference generation timed out."));
        }, ECLIPSE_PREFERENCES_TIMEOUT_MS);
        session.pendingEclipsePreferences.set(requestId, { resolve, reject, timer });
        session.send({ type: "run-eclipse-preferences", requestId });
      });
    }

    function subscribeDiagnosticSummary(listener) {
      if (typeof listener !== "function") return function() {};
      diagnosticSummaryListeners.add(listener);
      sessions.forEach((session) => { if (session.latestSummary) listener(session.latestSummary); });
      return () => diagnosticSummaryListeners.delete(listener);
    }

    const api = {
      startSession,
      stopSession,
      stopAllSessions,
      restartSession,
      setActiveDocument,
      clearActiveDocuments,
      updateKotlinAbiSnapshot,
      beginAnalysisGeneration,
      finalizeAnalysisGeneration,
      getProblems,
      getTasks,
      runEclipsePreferences,
      configure,
      getRequestTimeoutMs,
      subscribeDiagnosticSummary,
      getSession(key) { return sessions.get(String(key || "")) || null; },
      _test: { INTERACTIVE_METHODS, PROBLEMS_QUERY_TIMEOUT_MS, PROXY_SHUTDOWN_TIMEOUT_MS, parseProxyOutput, handleProxyMessage }
    };
    app.registerModule?.("jdtProxyClient", api);
    return api;
  }

  global.registerMarkdownViewerJdtProxyClient = registerMarkdownViewerJdtProxyClient;
})(typeof window !== "undefined" ? window : globalThis);
