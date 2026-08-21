(function(window) {
  "use strict";

  /**
   * Bridges CodeMirror's JSON transport to Neutralino stdio language servers.
   */
  function registerMarkdownViewerNeutralinoLspBridge(app, deps) {
    const registry = deps.registry;
    const sessionsByWorkspace = new Map();
    const stoppingSessionsByWorkspace = new Map();
    const pendingSessionsByWorkspace = new Map();
    const serverMessageSubscribers = new Set();
    const shutdownTimeoutMs = Number.isFinite(Number(deps.shutdownTimeoutMs)) ? Math.max(0, Number(deps.shutdownTimeoutMs)) : 5000;
    const killTimeoutMs = Number.isFinite(Number(deps.killTimeoutMs)) ? Math.max(0, Number(deps.killTimeoutMs)) : 2000;

    function log(level, message, details) {
      try {
        deps.appDebugLog?.(level, message, details);
      } catch (_error) {
        // LSP bridge logging should never interfere with server transport.
      }
    }

    function truncateLogValue(value, maxLength = 1600) {
      if (value === null || value === undefined || value === "") return "";
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    }

    function summarizeLspMessage(message) {
      try {
        const value = JSON.parse(String(message || ""));
        const summary = {
          id: value.id ?? "",
          method: value.method || "",
          kind: value.method ? ("id" in value ? "request" : "notification") : ("id" in value ? "response" : "message"),
          error: value.error?.message || ""
        };
        if (value.error) {
          summary.errorCode = value.error.code ?? "";
          summary.errorData = truncateLogValue(value.error.data);
        }
        if (value.method === "window/logMessage" || value.method === "window/showMessage") {
          summary.messageType = value.params?.type ?? "";
          summary.message = truncateLogValue(value.params?.message || "");
        }
        if (value.method === "textDocument/didOpen") {
          summary.uri = value.params?.textDocument?.uri || "";
          summary.languageId = value.params?.textDocument?.languageId || "";
          summary.version = value.params?.textDocument?.version ?? "";
        }
        if (value.method === "textDocument/hover" || value.method === "textDocument/completion") {
          summary.uri = value.params?.textDocument?.uri || "";
          summary.position = value.params?.position || null;
          if (value.params?.context) summary.context = value.params.context;
        }
        if (value.method === "textDocument/publishDiagnostics") {
          const diagnostics = Array.isArray(value.params?.diagnostics) ? value.params.diagnostics : [];
          summary.diagnosticCount = diagnostics.length;
          summary.diagnosticMessages = diagnostics.slice(0, 3).map((diagnostic) => diagnostic?.message || "");
        }
        return summary;
      } catch (error) {
        return {
          id: "",
          method: "",
          kind: "invalid-json",
          error: error?.message || String(error)
        };
      }
    }

    function summarizeDefinitionResult(message) {
      try {
        const value = JSON.parse(String(message || ""));
        if (!("result" in value)) return null;
        const location = Array.isArray(value.result) ? value.result[0] : value.result;
        if (!location) return { targetUri: "", line: "", character: "", empty: true };
        const range = location.targetSelectionRange || location.targetRange || location.range || null;
        return {
          targetUri: location.targetUri || location.uri || "",
          line: range?.start?.line ?? "",
          character: range?.start?.character ?? "",
          empty: false
        };
      } catch (_error) {
        return null;
      }
    }

    function summarizeHoverResult(message) {
      try {
        const value = JSON.parse(String(message || ""));
        if (!("result" in value)) return null;
        if (!value.result) return { empty: true, contentsKind: "", preview: "" };
        const contents = value.result.contents;
        if (typeof contents === "string") {
          return { empty: !contents, contentsKind: "string", preview: truncateLogValue(contents, 400) };
        }
        if (Array.isArray(contents)) {
          const preview = contents.map((entry) => typeof entry === "string" ? entry : entry?.value || entry?.language || "").filter(Boolean).join(" | ");
          return { empty: !contents.length, contentsKind: "array", preview: truncateLogValue(preview, 400) };
        }
        if (contents && typeof contents === "object") {
          const preview = contents.value || contents.language || JSON.stringify(contents);
          return { empty: !preview, contentsKind: contents.kind || contents.language || "object", preview: truncateLogValue(preview, 400) };
        }
        return { empty: true, contentsKind: typeof contents, preview: "" };
      } catch (_error) {
        return null;
      }
    }
    /**
     * Convert a string to UTF-8 bytes for LSP Content-Length framing.
     * @param {string} value - Message payload.
     * @returns {number} Byte length.
     */
    function getUtf8ByteLength(value) {
      return new TextEncoder().encode(String(value || "")).byteLength;
    }

    /**
     * Wrap a JSON message in LSP stdio headers.
     * @param {string} message - JSON message string.
     * @returns {string} LSP-framed message.
     */
    function frameMessage(message) {
      const payload = String(message || "");
      return `Content-Length: ${getUtf8ByteLength(payload)}\r\n\r\n${payload}`;
    }

    /**
     * Create a parser for LSP Content-Length framed stdout chunks.
     * @param {Function} emit - Receives decoded JSON message strings.
     * @returns {Function} Chunk parser.
     */
    function createMessageParser(emit, options = {}) {
      if (window.MarkdownViewerLspFrameParser?.createLspFrameParser) {
        return window.MarkdownViewerLspFrameParser.createLspFrameParser(emit, options);
      }
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = new Uint8Array(8192);
      let bufferStart = 0;
      let bufferEnd = 0;
      let headerSearchStart = 0;
      let messageStart = -1;
      let messageLength = 0;
      let pendingHighSurrogate = "";
      function ensureBufferCapacity(additionalLength) {
        if (bufferEnd + additionalLength <= buffer.length) return;
        const unreadLength = bufferEnd - bufferStart;
        const requiredLength = unreadLength + additionalLength;
        if (requiredLength <= buffer.length) {
          buffer.copyWithin(0, bufferStart, bufferEnd);
        } else {
          let nextCapacity = buffer.length;
          while (nextCapacity < requiredLength) nextCapacity *= 2;
          const next = new Uint8Array(nextCapacity);
          next.set(buffer.subarray(bufferStart, bufferEnd), 0);
          buffer = next;
        }
        if (messageStart >= 0) messageStart -= bufferStart;
        headerSearchStart = Math.max(0, headerSearchStart - bufferStart);
        bufferEnd = unreadLength;
        bufferStart = 0;
      }
      function appendBytes(bytes) {
        ensureBufferCapacity(bytes.length);
        buffer.set(bytes, bufferEnd);
        bufferEnd += bytes.length;
      }
      function findHeaderEnd() {
        for (let index = headerSearchStart; index <= bufferEnd - 4; index += 1) {
          if (buffer[index] === 13 && buffer[index + 1] === 10 && buffer[index + 2] === 13 && buffer[index + 3] === 10) return index;
        }
        headerSearchStart = Math.max(bufferStart, bufferEnd - 3);
        return -1;
      }
      return function parseChunk(chunk) {
        let chunkText = pendingHighSurrogate + String(chunk || "");
        pendingHighSurrogate = "";
        if (!chunkText) return;
        const trailingCodeUnit = chunkText.charCodeAt(chunkText.length - 1);
        if (trailingCodeUnit >= 0xd800 && trailingCodeUnit <= 0xdbff) {
          pendingHighSurrogate = chunkText.slice(-1);
          chunkText = chunkText.slice(0, -1);
        }
        if (chunkText) appendBytes(encoder.encode(chunkText));
        while (bufferStart < bufferEnd) {
          if (messageStart < 0) {
            const headerEnd = findHeaderEnd();
            if (headerEnd < 0) return;
            const header = decoder.decode(buffer.subarray(bufferStart, headerEnd));
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
              options.onParseWarning?.({ reason: "missing-content-length", header });
              bufferStart = headerEnd + 4;
              headerSearchStart = bufferStart;
              continue;
            }
            messageLength = Number(match[1]);
            messageStart = headerEnd + 4;
          }
          const messageEnd = messageStart + messageLength;
          if (bufferEnd < messageEnd) return;
          emit(decoder.decode(buffer.subarray(messageStart, messageEnd)));
          bufferStart = messageEnd;
          headerSearchStart = bufferStart;
          messageStart = -1;
          messageLength = 0;
          if (bufferStart === bufferEnd) {
            bufferStart = 0;
            bufferEnd = 0;
            headerSearchStart = 0;
          }
        }
      };
    }

    /**
     * Create a CodeMirror transport backed by a Neutralino spawned process.
     * @param {object} processHandle - Neutralino spawned process descriptor.
     * @returns {object} CodeMirror LSP transport.
     */
    function createTransport(processHandle, sessionInfo = {}) {
      const processId = processHandle?.id ?? processHandle;
      const subscribers = new Set();
      const pendingMethodsById = new Map();
      let stdinWriteQueue = null;
      const hasProcessId = processId !== null && processId !== undefined && processId !== "";
      return {
        getRequestTimeoutMs(method) {
          return Number(sessionInfo.getRequestTimeoutMs?.(method)) || 0;
        },
        send(message) {
          const Neutralino = deps.Neutralino || window.Neutralino;
          if (!hasProcessId || !Neutralino?.os?.updateSpawnedProcess) throw new Error("Language server process is unavailable.");
          const summary = summarizeLspMessage(message);
          log("debug", "[lsp] client -> server", {
            serverId: sessionInfo.serverId || "",
            key: sessionInfo.key || "",
            processId,
            ...summary
          });
          if (summary.kind === "request" && summary.id !== "") pendingMethodsById.set(String(summary.id), summary.method);
          const framedMessage = frameMessage(message);
          // Keep complete protocol frames ordered and atomic at the spawned-process stdin boundary.
          const writeFrame = () => Neutralino.os.updateSpawnedProcess(processId, "stdIn", framedMessage);
          const logWriteFailure = (error) => {
              log("error", "[lsp] Failed to write language server stdin", {
                serverId: sessionInfo.serverId || "",
                key: sessionInfo.key || "",
                processId,
                method: summary.method,
                id: summary.id,
                message: error?.message || String(error)
              });
          };
          if (stdinWriteQueue) {
            stdinWriteQueue = stdinWriteQueue.then(writeFrame).catch(logWriteFailure);
          } else {
            try {
              stdinWriteQueue = Promise.resolve(writeFrame()).catch(logWriteFailure);
            } catch (error) {
              logWriteFailure(error);
            }
          }
        },
        subscribe(handler) {
          subscribers.add(handler);
        },
        unsubscribe(handler) {
          subscribers.delete(handler);
        },
        takePendingMethod(id) {
          const key = String(id ?? "");
          const method = pendingMethodsById.get(key) || "";
          pendingMethodsById.delete(key);
          return method;
        },
        emit(message) {
          subscribers.forEach((handler) => handler(message));
        }
      };
    }

    /**
     * Build the workspace key used to track a server session.
     * @param {object} server - Supported server definition.
     * @param {string} filePath - Open editor file path.
     * @returns {Promise<object>} Workspace root and session key for the file.
     */
    async function resolveSessionKey(server, filePath) {
      const standalone = registry.isStandaloneJavaFile?.(server.id, filePath) === true;
      const workspaceRoot = standalone ? "" : await registry.resolveWorkspaceRoot(filePath, server);
      return {
        standalone,
        workspaceRoot,
        key: `${server.id}:${standalone ? filePath : workspaceRoot || filePath}`
      };
    }

    /**
     * Start or reuse a language-server session for the given workspace.
     * @param {object} options - Session options.
     * @returns {Promise<object|null>} Session object or null.
     */
    async function ensureSession(options) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!registry.isDesktopLspRuntime() || !Neutralino?.os?.spawnProcess) {
        log("debug", "[lsp] Skipping language server session outside desktop runtime", {
          serverId: options?.server?.id || "",
          filePath: options?.filePath || ""
        });
        return null;
      }
      const server = options.server;
      if (server?.id === "java") {
        const controller = deps.getJavaWorkspaceController?.();
        const standaloneJava = registry.isStandaloneJavaFile?.("java", options.filePath) === true;
        if (controller?.getState?.()?.phase === "degraded") {
          log("debug", "[lsp] Java session gated while project analysis is degraded", { filePath: options.filePath || "" });
          return null;
        }
        if (!standaloneJava && (!controller?.getRuntime?.()?.ok || !controller?.getRuntime?.()?.launcherJdk)) {
          log("debug", "[lsp] Java session gated until the project runtime is configured", { filePath: options.filePath || "" });
          return null;
        }
      }
      const { standalone, workspaceRoot, key } = await resolveSessionKey(server, options.filePath);
      if (sessionsByWorkspace.has(key)) {
        const existingSession = sessionsByWorkspace.get(key);
        if (existingSession.jdtProxySession && options.filePath) {
          deps.jdtProxyClient?.setActiveDocument?.(key, registry.toFileUri(options.filePath));
        }
        if (existingSession.usesActivityWorker && options.filePath) {
          const fileUri = registry.toFileUri(options.filePath);
          deps.workspaceActivityClient?.setTrackedDocuments?.(key, fileUri, [fileUri]);
        }
        log("debug", "[lsp] Reusing language server session", {
          serverId: server.id,
          key,
          workspaceRoot,
          processId: existingSession.processId,
          processPid: existingSession.processPid ?? ""
        });
        return existingSession;
      }
      if (pendingSessionsByWorkspace.has(key)) {
        log("debug", "[lsp] Waiting for pending language server session", {
          serverId: server.id,
          key,
          workspaceRoot
        });
        return pendingSessionsByWorkspace.get(key);
      }

      const sessionPromise = startSession({ server, standalone, workspaceRoot, key, filePath: options.filePath });
      pendingSessionsByWorkspace.set(key, sessionPromise);
      try {
        return await sessionPromise;
      } finally {
        pendingSessionsByWorkspace.delete(key);
      }
    }

    function handleJavaProxyStatus(value) {
      if (value.phase !== "restarting") return;
      deps.getJavaWorkspaceController?.()?.markInitializing?.("Java: Restarting language server in 4 seconds...");
    }

    function createJavaProxyActivityTracker(options, getSession) {
      let serviceReady = false;
      let importComplete = false;
      let buildComplete = false;
      let autobuildEnabled = false;
      return window.MarkdownViewerJdtActivityTracker?.createJdtActivityTracker?.({
        onLifecycle(phase, message) {
          const analysisGeneration = deps.getAnalysisGenerationCoordinator?.()?.getState?.();
          deps.getAnalysisGenerationCoordinator?.()?.acceptJdtLifecycle?.({
            generationId: analysisGeneration?.generationId,
            workspaceRoot: options.workspaceRoot,
            phase,
            message
          });
          const milestone = {
            "service-ready": "jdt-service-ready",
            importing: "jdt-import-started",
            "import-complete": "jdt-import-completed",
            "build-started": "jdt-build-started",
            "build-complete": "jdt-build-completed"
          }[phase];
          if (milestone) {
            deps.diagnosticLifecycleTrace?.mark?.(milestone, {
              workspaceRoot: options.workspaceRoot,
              message: String(message || "")
            });
          }
          const controller = deps.getJavaWorkspaceController?.();
          if (phase === "service-ready") {
            serviceReady = true;
          }
          if (phase === "import-complete") importComplete = true;
          if (phase === "build-complete") {
            buildComplete = true;
            importComplete = true;
          }
          if (phase === "importing" || phase === "build-started") {
            buildComplete = false;
            controller?.markImporting?.(phase === "build-started" ? "Java: Building workspace..." : message ? `Java: ${message}` : "Java: Importing project...");
          }
          const importers = controller?.getModel?.()?.importers || {};
          const importReady = !importers.maven && !importers.gradle || importComplete;
          if (!serviceReady || !importReady) {
            if (serviceReady) {
              controller?.markImporting?.(
                buildComplete ? "Java: Finalizing project import..." : "Java: Waiting for project import..."
              );
            }
            return;
          }
          const session = getSession();
          if (session && !autobuildEnabled) {
            const settings = registry.getServerWorkspaceConfiguration("java", {
              workspaceRoot: options.workspaceRoot,
              filePath: options.filePath,
              javaAutobuildEnabled: true
            });
            session.transport.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings } }));
            autobuildEnabled = true;
          }
          if (!buildComplete) {
            controller?.markImporting?.("Java: Building workspace...");
            return;
          }
          controller?.markImporting?.("Java: Validating imported projects...");
        }
      }) || { acceptLifecycle() {}, acceptMessage() {} };
    }

    function updateJavaProxyProcess(session, value) {
      if (!session) return;
      session.processId = value.processId;
      session.processPid = value.processPid;
      session.processHandle = value.processHandle;
    }

    function deliverJavaProxyMessage(session, tracker, options, message) {
      try {
        const protocolMessage = JSON.parse(message);
        tracker.acceptMessage(protocolMessage);
        if (protocolMessage.method === "language/status" && String(protocolMessage.params?.type) === "Error") {
          deps.onJavaAnalysisFailure?.({
            key: options.key,
            workspaceRoot: options.workspaceRoot,
            sessionId: options.key,
            code: "jdt-initialization-failed",
            fatal: true,
            summary: String(protocolMessage.params?.message || "JDT project initialization failed."),
            count: 1,
            timestamp: Date.now()
          });
        }
      } catch (_error) {}
      serverMessageSubscribers.forEach(function(listener) {
        try {
          listener({ message, serverId: "java", key: options.key, workspaceRoot: options.workspaceRoot });
        } catch (_error) {}
      });
    }

    function createJavaProxyOptions(options, launch, getSession) {
      const tracker = createJavaProxyActivityTracker(options, getSession);
      return {
        key: options.key,
        workspaceRoot: options.workspaceRoot,
        jdtLogPath: options.jdtLogPath,
        jdtExtensionBundles: options.jdtExtensionBundles || [],
        launch,
        onLspMessage(message) { deliverJavaProxyMessage(getSession(), tracker, options, message); },
        onStatus(value) {
          if (["build-started", "build-complete"].includes(value.phase)) tracker.acceptLifecycle?.(value.phase, value.message);
          handleJavaProxyStatus(value);
        },
        onProjectAnalysisFailure(value) { deps.onJavaAnalysisFailure?.(value); },
        onUnavailable(value, detail) { deps.onJdtUnavailable?.(value, detail); },
        onProcessChanged(value) { updateJavaProxyProcess(getSession(), value); }
      };
    }

    function createJavaProxySession(options, launch, proxy) {
      return {
        key: options.key,
        server: options.server,
        workspaceRoot: options.workspaceRoot,
        rootUri: registry.toFileUri(options.workspaceRoot),
        processId: proxy.processId,
        processPid: proxy.processPid,
        processCommand: launch.command,
        processHandle: proxy.processHandle,
        transport: proxy.transport,
        jdtProxySession: proxy,
        usesActivityWorker: false,
        closed: false
      };
    }

    async function startJavaProxySession(options, launch) {
      let session = null;
      const workspaceDir = await registry.getServerWorkspaceDir("java", options.workspaceRoot || "", options.filePath || "");
      const jdtLogPath = registry.joinPath(registry.joinPath(workspaceDir, ".metadata"), ".log");
      deps.getJavaWorkspaceController?.()?.setLogPath?.(jdtLogPath);
      const jdtExtensionBundles = await registry.getJdtExtensionBundlePaths?.() || [];
      const proxyOptions = Object.assign({}, options, { jdtLogPath, jdtExtensionBundles });
      const proxy = await deps.jdtProxyClient.startSession(createJavaProxyOptions(proxyOptions, launch, function() { return session; }));
      session = createJavaProxySession(proxyOptions, launch, proxy);
      sessionsByWorkspace.set(options.key, session);
      deps.jdtProxyClient.setActiveDocument(options.key, registry.toFileUri(options.filePath));
      deps.getJavaWorkspaceController?.()?.markInitializing?.();
      return session;
    }

    async function startSession(options) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      const server = options.server;
      const workspaceRoot = options.workspaceRoot;
      const key = options.key;
      const status = await registry.getServerStatus(server.id);
      const launch = await registry.getLaunchDescriptor(server.id, { workspaceRoot, filePath: options.filePath, key });
      if (!launch) {
        log("warning", "[lsp] No launch descriptor available for language server", {
          serverId: server.id,
          installed: status.installed,
          bundled: status.bundled,
          installDir: status.installDir,
          variantId: status.variant?.id || "",
          missingFiles: status.missingFiles || []
        });
        return null;
      }
      log("info", "[lsp] Launching language server", {
        serverId: server.id,
        key,
        workspaceRoot,
        source: status.bundled ? "bundled" : "profile",
        installDir: status.installDir,
        variantId: status.variant?.id || "",
        variantLabel: status.metadata?.variantLabel || status.variant?.label || "",
        command: launch.command,
        cwd: launch.cwd
      });
      if (server.id === "java" && deps.jdtProxyClient) {
        return startJavaProxySession(options, launch);
      }
      let processHandle = null;
      try {
        processHandle = await Neutralino.os.spawnProcess(launch.command, { cwd: launch.cwd });
      } catch (error) {
        log("error", "[lsp] Failed to launch language server", {
          serverId: server.id,
          command: launch.command,
          cwd: launch.cwd,
          message: error?.message || String(error)
        });
        throw error;
      }
      const processId = processHandle?.id ?? processHandle;
      const processPid = processHandle?.pid ?? "";
      const transport = createTransport(processHandle, { serverId: server.id, key });
      let javaAutobuildEnabled = false;
      let javaServiceReady = false;
      let javaImportCompleted = false;
      function enableJavaAutobuild() {
        if (javaAutobuildEnabled) return;
        const settings = registry.getServerWorkspaceConfiguration("java", {
          workspaceRoot,
          filePath: options.filePath,
          javaAutobuildEnabled: true
        });
        transport.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings } }));
        javaAutobuildEnabled = true;
      }
      function handleJavaLifecycle(phase, message = "") {
        const controller = deps.getJavaWorkspaceController?.();
        const analysisGeneration = deps.getAnalysisGenerationCoordinator?.()?.getState?.();
        deps.getAnalysisGenerationCoordinator?.()?.acceptJdtLifecycle?.({
          generationId: analysisGeneration?.generationId,
          workspaceRoot,
          phase,
          message
        });
        if (phase === "service-ready") {
          javaServiceReady = true;
          const importers = controller?.getModel?.()?.importers || {};
          if (importers.maven || importers.gradle) {
            if (javaImportCompleted) {
              enableJavaAutobuild();
              controller?.markImporting?.("Java: Validating imported projects...");
            } else {
              controller?.markImporting?.("Java: Waiting for project import...");
            }
          } else {
            controller?.markImporting?.("Java: Validating imported projects...");
          }
        } else if (phase === "import-complete") {
          javaImportCompleted = true;
          if (javaServiceReady) {
            enableJavaAutobuild();
            controller?.markImporting?.("Java: Validating imported projects...");
          }
        } else if (phase === "build-complete") {
          javaImportCompleted = true;
          if (javaServiceReady) {
            enableJavaAutobuild();
            controller?.markImporting?.("Java: Validating imported projects...");
          }
        } else if (phase === "importing") {
          controller?.markImporting?.(message ? `Java: ${message}` : "Java: Importing project...");
        }
      }
      const javaActivityTracker = window.MarkdownViewerJdtActivityTracker?.createJdtActivityTracker?.({
        onLifecycle: handleJavaLifecycle
      }) || {
        acceptLifecycle: handleJavaLifecycle,
        acceptMessage() { return false; }
      };
      const deliverServerMessage = (message) => {
        if (server.id === "java") {
          try {
            const protocolMessage = JSON.parse(message);
            javaActivityTracker.acceptMessage(protocolMessage);
            if (protocolMessage.method === "language/status") {
              const statusType = String(protocolMessage.params?.type || "");
              const statusMessage = String(protocolMessage.params?.message || "");
              if (statusType === "Error") {
                deps.onJavaAnalysisFailure?.({
                  key,
                  workspaceRoot,
                  sessionId: key,
                  code: "jdt-initialization-failed",
                  fatal: true,
                  summary: statusMessage || "JDT project initialization failed.",
                  count: 1,
                  timestamp: Date.now()
                });
              }
            }
          } catch (_error) {
            // Protocol parsing for lifecycle status must never interrupt delivery.
          }
        }
        const summary = summarizeLspMessage(message);
        const responseMethod = summary.kind === "response" ? transport.takePendingMethod(summary.id) : "";
        const definitionResult = responseMethod === "textDocument/definition" ? summarizeDefinitionResult(message) : null;
        const hoverResult = responseMethod === "textDocument/hover" ? summarizeHoverResult(message) : null;
        log("debug", "[lsp] server -> client", {
          serverId: server.id,
          key,
          processId,
          processPid,
          ...summary,
          responseMethod,
          definitionResult,
          hoverResult
        });
        serverMessageSubscribers.forEach((listener) => {
          try {
            listener({ message, serverId: server.id, key, workspaceRoot, processId, processPid });
          } catch (_error) {
            // Feature observers must never interrupt the editor's LSP transport.
          }
        });
        transport.emit(message);
      };
      const localParser = createMessageParser(deliverServerMessage, {
        onParseWarning(details) {
          log("warning", "[lsp] Dropped malformed language server output", {
            serverId: server.id,
            key,
            processId,
            processPid,
            ...details
          });
        }
      });
      const activityClient = server.id === "java" ? deps.workspaceActivityClient : null;
      const usesActivityWorker = activityClient?.registerLspSession?.(key, (workerMessage) => {
        if (workerMessage.type === "lsp-batch") {
          (workerMessage.messages || []).forEach(deliverServerMessage);
        } else if (workerMessage.type === "jdt-lifecycle-status") {
          javaActivityTracker.acceptLifecycle(workerMessage.phase, workerMessage.message);
        } else if (workerMessage.type === "jdt-log-summary") {
          const workspaceController = deps.getJavaWorkspaceController?.();
          const projectJdk = workspaceController?.getRuntime?.()?.projectJdk || null;
          log("warning", "[lsp] JDT project analysis message", {
            key,
            projectPath: workspaceRoot,
            projectJdk: projectJdk ? { id: projectJdk.id, name: projectJdk.name, feature: projectJdk.feature, path: projectJdk.path } : null,
            code: workerMessage.code || "",
            fingerprint: workerMessage.fingerprint || "",
            summary: workerMessage.summary || "",
            count: workerMessage.count || 1,
            final: workerMessage.final === true,
            logPath: workspaceController?.getState?.()?.logPath || ""
          });
        } else if (workerMessage.type === "jdt-analysis-failure") {
          deps.onJavaAnalysisFailure?.(Object.assign({ key, workspaceRoot }, workerMessage));
        } else if (workerMessage.type === "lsp-parse-warning") {
          log("warning", "[lsp] Dropped malformed language server output", workerMessage.warning || {});
        } else if (workerMessage.type === "worker-error") {
          log("error", "[lsp] Workspace activity worker failed", { key, message: workerMessage.message || "" });
        }
      }) === true;
      const parser = usesActivityWorker
        ? (chunk) => activityClient.pushLspChunk(key, chunk)
        : localParser;
      const session = {
        key,
        server,
        workspaceRoot,
        rootUri: options.standalone ? null : registry.toFileUri(workspaceRoot || options.filePath),
        processId,
        processPid,
        processCommand: launch.command || "",
        processHandle,
        transport,
        parser,
        usesActivityWorker,
        closed: false
      };
      sessionsByWorkspace.set(key, session);
      if (server.id === "java") {
        const workspaceDir = await registry.getServerWorkspaceDir("java", workspaceRoot || "", options.filePath || "");
        deps.getJavaWorkspaceController?.()?.setLogPath?.(registry.joinPath(registry.joinPath(workspaceDir, ".metadata"), ".log"));
      }
      if (usesActivityWorker && options.filePath) {
        const fileUri = registry.toFileUri(options.filePath);
        activityClient.setTrackedDocuments(key, fileUri, [fileUri]);
      }
      if (server.id === "java") deps.getJavaWorkspaceController?.()?.markInitializing?.();
      let javaStderrReported = false;
      session.unregisterProcessOwner = deps.processRouter?.registerProcess?.(processHandle, {
        onStdout(data) { session.parser(data); },
        onStderr(data) {
          if (session.server.id !== "java") {
            deps.appDebugLog?.("debug", "[lsp] language server stderr", { serverId: session.server.id, data });
          } else if (!javaStderrReported) {
            javaStderrReported = true;
            log("warning", "[lsp] JDT wrote to stderr; see the native JDT log for full details", {
              key,
              summary: String(data || "").split(/\r?\n/, 1)[0].slice(0, 300),
              logPath: deps.getJavaWorkspaceController?.()?.getState?.()?.logPath || ""
            });
          }
        },
        onExit(detail) { handleSessionExit(session, detail); }
      });
      log("info", "[lsp] Language server process started", {
        serverId: server.id,
        key,
        processId,
        processPid,
        source: status.bundled ? "bundled" : "profile",
        variantId: status.variant?.id || ""
      });
      return session;
    }

    /**
     * Return whether a server has a running session for the given file.
     * @param {object} options - Session lookup options.
     * @returns {Promise<boolean>} True when an existing session matches the file workspace.
     */
    async function hasRunningSessionForFile(options = {}) {
      if (!options.server || !options.filePath) return false;
      const { key } = await resolveSessionKey(options.server, options.filePath);
      return sessionsByWorkspace.has(key);
    }

    /**
     * Return runtime status for a language server.
     * @param {string} serverId - Supported server id.
     * @returns {object} Runtime status and matching session summaries.
     */
    function getServerRuntimeStatus(serverId) {
      const normalizedServerId = String(serverId || "");
      const sessions = Array.from(sessionsByWorkspace.values())
        .filter((session) => session.server?.id === normalizedServerId && session.closed !== true)
        .map((session) => ({
          key: session.key,
          workspaceRoot: session.workspaceRoot,
          processId: session.processId,
          processPid: session.processPid ?? "",
          processCommand: session.processCommand || ""
        }));
      const stoppingSessions = Array.from(stoppingSessionsByWorkspace.values())
        .filter((session) => session.server?.id === normalizedServerId)
        .map((session) => ({
          key: session.key,
          workspaceRoot: session.workspaceRoot,
          processId: session.processId,
          processPid: session.processPid ?? "",
          processCommand: session.processCommand || ""
        }));
      return {
        serverId: normalizedServerId,
        running: sessions.length > 0,
        sessionCount: sessions.length,
        sessions,
        stoppingSessionCount: stoppingSessions.length,
        stoppingSessions
      };
    }


    function getSetTimeout() {
      return deps.setTimeout || window.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
    }

    function getClearTimeout() {
      return deps.clearTimeout || window.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);
    }

    function startShutdownTimer(callback, delayMs) {
      const timer = getSetTimeout();
      if (!timer) return null;
      return timer(callback, delayMs);
    }

    function clearShutdownTimer(timerId) {
      const clearTimer = getClearTimeout();
      if (timerId !== null && timerId !== undefined && clearTimer) clearTimer(timerId);
    }

    function isSessionTracked(session) {
      return !!session && (sessionsByWorkspace.get(session.key) === session || stoppingSessionsByWorkspace.get(session.key) === session);
    }

    function notifySessionExited(session) {
      const waiters = session?.exitWaiters;
      if (!waiters) return;
      session.exitWaiters = null;
      Array.from(waiters).forEach((resolve) => resolve(true));
    }

    function clearSessionTracking(session) {
      if (!session) return;
      session.closed = true;
      session.unregisterProcessOwner?.();
      if (session.usesActivityWorker) deps.workspaceActivityClient?.disposeLspSession?.(session.key);
      sessionsByWorkspace.delete(session.key);
      stoppingSessionsByWorkspace.delete(session.key);
      notifySessionExited(session);
    }

    function markSessionStopping(session) {
      if (!session) return;
      session.closed = true;
      sessionsByWorkspace.delete(session.key);
      stoppingSessionsByWorkspace.set(session.key, session);
    }

    function waitForSessionExit(session, timeoutMs) {
      if (!isSessionTracked(session)) return Promise.resolve(true);
      if (!session.exitWaiters) session.exitWaiters = new Set();
      return new Promise((resolve) => {
        let settled = false;
        let timerId = null;
        function finish(exited) {
          if (settled) return;
          settled = true;
          clearShutdownTimer(timerId);
          if (session.exitWaiters) session.exitWaiters.delete(finish);
          resolve(exited);
        }
        session.exitWaiters.add(finish);
        timerId = startShutdownTimer(() => finish(false), timeoutMs);
        if (timerId === null && timeoutMs > 0) finish(false);
      });
    }

    function getWindowsTaskKillCommand(processPid) {
      const pid = String(processPid || "").trim();
      return /^\d+$/.test(pid) ? "cmd /c taskkill /PID " + pid + " /T /F" : "";
    }

    async function requestSessionExit(session, Neutralino) {
      if (session.exitRequested) return true;
      if (session.processId === null || session.processId === undefined || session.processId === "" || !Neutralino?.os?.updateSpawnedProcess) return false;
      session.exitRequested = true;
      log("info", "[lsp] Stopping language server session", {
        serverId: session.server.id,
        key: session.key,
        processId: session.processId,
        processPid: session.processPid ?? ""
      });
      try {
        await Neutralino.os.updateSpawnedProcess(session.processId, "exit");
        return true;
      } catch (error) {
        log("warning", "[lsp] Failed to request language server shutdown", {
          serverId: session.server.id,
          key: session.key,
          processId: session.processId,
          processPid: session.processPid ?? "",
          message: error?.message || String(error)
        });
        return false;
      }
    }

    async function killSessionProcess(session, Neutralino) {
      const command = getWindowsTaskKillCommand(session.processPid);
      if (!command || !Neutralino?.os?.execCommand) {
        throw new Error(`Unable to kill language server process ${session.processPid || session.processId || ""}.`);
      }
      log("warning", "[lsp] Killing unresponsive language server process", {
        serverId: session.server.id,
        key: session.key,
        processId: session.processId,
        processPid: session.processPid ?? "",
        command
      });
      await Neutralino.os.execCommand(command);
    }

    async function stopSessionProcess(session, Neutralino, options = {}) {
      markSessionStopping(session);
      if (session.jdtProxySession) {
        await deps.jdtProxyClient.stopSession(session.jdtProxySession, options);
        clearSessionTracking(session);
        return;
      }
      if (options.force === true) {
        await killSessionProcess(session, Neutralino);
        clearSessionTracking(session);
        return;
      }
      const exitRequested = await requestSessionExit(session, Neutralino);
      if (exitRequested && await waitForSessionExit(session, shutdownTimeoutMs)) return;
      log("warning", "[lsp] Language server shutdown timed out", {
        serverId: session.server.id,
        key: session.key,
        processId: session.processId,
        processPid: session.processPid ?? "",
        timeoutMs: shutdownTimeoutMs
      });
      await killSessionProcess(session, Neutralino);
      if (await waitForSessionExit(session, killTimeoutMs)) return;
      log("warning", "[lsp] Language server kill completed without exit event", {
        serverId: session.server.id,
        key: session.key,
        processId: session.processId,
        processPid: session.processPid ?? "",
        timeoutMs: killTimeoutMs
      });
      clearSessionTracking(session);
    }

    /**
     * Handle Neutralino output events from spawned language-server processes.
     * @param {Event} event - Neutralino spawnedProcess event.
     * @returns {void}
     */
    function handleSessionExit(session, detail = {}) {
      const wasStopping = stoppingSessionsByWorkspace.get(session.key) === session;
      clearSessionTracking(session);
      if (session.server?.id === "java" && !wasStopping) {
        deps.onJavaAnalysisFailure?.({
          key: session.key,
          sessionId: session.key,
          workspaceRoot: session.workspaceRoot,
          code: "unexpected-jdt-exit",
          fatal: true,
          fingerprint: `unexpected-jdt-exit:${String(detail?.exitCode ?? detail?.code ?? "unknown")}`,
          summary: "Java language server exited before project analysis completed.",
          count: 1,
          timestamp: Date.now()
        });
      }
      log("info", "[lsp] Language server process exited", {
        serverId: session.server.id,
        key: session.key,
        processId: session.processId,
        processPid: session.processPid ?? "",
        data: detail.data || ""
      });
    }

    function handleSpawnedProcessEvent(event) {
      const detail = event?.detail || {};
      const session = Array.from(sessionsByWorkspace.values()).find((candidate) => candidate.processId === detail.id)
        || Array.from(stoppingSessionsByWorkspace.values()).find((candidate) => candidate.processId === detail.id);
      if (!session) {
        return;
      }
      if (detail.action === "stdOut") {
        session.parser(detail.data || "");
      } else if (detail.action === "stdErr") {
        deps.appDebugLog?.("debug", "[lsp] language server stderr", { serverId: session.server.id, data: detail.data || "" });
      } else if (detail.action === "exit") {
        handleSessionExit(session, detail);
      } else {
        log("debug", "[lsp] Ignoring unhandled language server process event", {
          serverId: session.server.id,
          key: session.key,
          processId: session.processId,
          action: detail.action || "",
          data: detail.data || ""
        });
      }
    }

    /**
     * Stop matching spawned language-server sessions.
     * @param {Function} matchesSession - Predicate for sessions that should stop.
     * @param {{force?: boolean}} [options] - Stop behavior.
     * @returns {Promise<void>}
     */
    async function stopSessions(matchesSession, options = {}) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      const sessionsByKey = new Map();
      Array.from(sessionsByWorkspace.values()).filter(matchesSession).forEach((session) => sessionsByKey.set(session.key, session));
      Array.from(stoppingSessionsByWorkspace.values()).filter(matchesSession).forEach((session) => sessionsByKey.set(session.key, session));
      await Promise.all(Array.from(sessionsByKey.values()).map((session) => stopSessionProcess(session, Neutralino, options)));
    }

    /**
     * Stop all spawned sessions for one language server.
     * @param {string} serverId - Supported server id.
     * @param {{force?: boolean}} [options] - Stop behavior.
     * @returns {Promise<void>}
     */
    async function stopServerSessions(serverId, options = {}) {
      const normalizedServerId = String(serverId || "");
      await stopSessions((session) => session.server?.id === normalizedServerId, options);
    }

    /**
     * Stop all spawned language-server sessions.
     * @returns {Promise<void>}
     */
    async function stopAllSessions() {
      await stopSessions(() => true);
    }

    /**
     * Observe decoded server messages without replacing transport subscribers.
     * @param {Function} listener Receives message and session metadata.
     * @returns {Function} Unsubscribe callback.
     */
    function subscribeServerMessages(listener) {
      if (typeof listener !== "function") return function() {};
      serverMessageSubscribers.add(listener);
      return function unsubscribe() {
        serverMessageSubscribers.delete(listener);
      };
    }

    if (!deps.processRouter && (deps.Neutralino || window.Neutralino)?.events?.on) {
      (deps.Neutralino || window.Neutralino).events.on("spawnedProcess", handleSpawnedProcessEvent);
    }
    if ((deps.Neutralino || window.Neutralino)?.events?.on) {
      window.addEventListener("beforeunload", function() {
        void stopAllSessions();
      });
    }

    const api = {
      ensureSession,
      frameMessage,
      createMessageParser,
      getServerRuntimeStatus,
      hasRunningSessionForFile,
      subscribeServerMessages,
      stopServerSessions,
      stopAllSessions
    };

    app.registerModule("neutralinoLspBridge", api);
    return api;
  }

  window.registerMarkdownViewerNeutralinoLspBridge = registerMarkdownViewerNeutralinoLspBridge;
})(window);
