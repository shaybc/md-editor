(function(global) {
  "use strict";

  const BRIDGE_PATH = "resources/bridges/java-project-detection-bridge/java-project-detection-bridge.cjs";

  /** Runs cancellable Java project discovery requests through the desktop Node sidecar. */
  function registerMarkdownViewerJavaProjectDetectionBridgeClient(app, deps = {}) {
    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function isAvailable() {
      const Neutralino = getNeutralino();
      return Boolean(
        Neutralino?.os?.spawnProcess
        && Neutralino?.os?.updateSpawnedProcess
        && global.addEventListener
        && global.removeEventListener
      );
    }

    function quote(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    function encodeRequest(request) {
      const json = JSON.stringify(request || {});
      if (typeof global.btoa === "function") return global.btoa(unescape(encodeURIComponent(json)));
      if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
      throw new Error("Unable to encode the Java project detection request.");
    }

    function getEventOutput(detail) {
      const data = detail?.data;
      if (typeof data === "string") return data;
      if (data && typeof data === "object") {
        return data.stdOut || data.stdout || data.stdErr || data.stderr || data.output || data.data || "";
      }
      return detail?.stdOut || detail?.stdout || detail?.stdErr || detail?.stderr || detail?.output || "";
    }

    function isExitEvent(action) {
      return ["exit", "close", "exited", "terminated"].includes(String(action || "").toLowerCase());
    }

    function createLineParser(onLine) {
      let pending = "";
      return function parse(chunk, options = {}) {
        pending += String(chunk || "");
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || "";
        lines.filter(Boolean).forEach(onLine);
        if (options.flush && pending) {
          onLine(pending);
          pending = "";
        }
      };
    }

    function createAbortError() {
      return Object.assign(new Error("Java project detection was cancelled."), {
        name: "AbortError",
        code: "java-project-detection-cancelled"
      });
    }

    /**
     * Execute one sidecar request and return its accumulated discovery or Maven result.
     * @param {object} request Bridge request containing a supported mode and workspace root.
     * @param {object} options Optional AbortSignal owner.
     * @returns {Promise<object>} Completed bridge result.
     */
    function run(request, options = {}) {
      if (!isAvailable()) {
        return Promise.reject(Object.assign(new Error("Java project detection bridge is unavailable."), {
          code: "java-project-detection-bridge-unavailable"
        }));
      }
      const signal = options.signal;
      if (signal?.aborted) return Promise.reject(createAbortError());
      const Neutralino = getNeutralino();
      return new Promise((resolve, reject) => {
        let processId = null;
        let processPid = null;
        let settled = false;
        let terminalResult = null;
        let terminalError = null;
        const accumulated = {
          modules: [],
          aspectjSourceDirectories: [],
          kotlinSourceDirectories: [],
          kotlinSourceFiles: [],
          javaSourceFiles: [],
          standardJavaSourceRoots: []
        };
        const mavenOutputChunks = { stdout: [], stderr: [] };

        const cleanup = () => {
          global.removeEventListener("spawnedProcess", handleSpawnedProcessEvent);
          signal?.removeEventListener?.("abort", handleAbort);
        };
        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };
        const requestExit = () => {
          if (processId === null || processId === undefined) return;
          try {
            void Neutralino.os.updateSpawnedProcess(processId, "stdIn", `${JSON.stringify({ type: "close" })}\n`);
          } catch (_error) {
            // Forced process-tree cleanup below remains authoritative.
          }
          try {
            void Neutralino.os.updateSpawnedProcess(processId, "exit");
          } catch (_error) {
            // The bridge may already have exited.
          }
          if (Number.isFinite(Number(processPid)) && Neutralino?.os?.execCommand) {
            try {
              void Neutralino.os.execCommand(`cmd /c taskkill /PID ${Number(processPid)} /T /F`);
            } catch (_error) {
              // Process-tree cleanup is best-effort after the bridge exits.
            }
          }
        };
        const handleAbort = () => {
          requestExit();
          settle(reject, createAbortError());
        };
        const handleMessage = (line) => {
          let message;
          try {
            message = JSON.parse(line);
          } catch (_error) {
            terminalError = Object.assign(new Error("Java project detection bridge returned invalid output."), {
              code: "java-project-detection-bridge-invalid-output"
            });
            return;
          }
          if (message.type === "scan-batch") {
            Object.keys(accumulated).forEach((key) => {
              if (Array.isArray(accumulated[key]) && Array.isArray(message.batch?.[key])) accumulated[key].push(...message.batch[key]);
            });
          } else if (message.type === "maven-output") {
            const stream = message.stream === "stderr" ? "stderr" : "stdout";
            mavenOutputChunks[stream].push(String(message.text || ""));
          } else if (message.type === "result") {
            terminalResult = {
              ...accumulated,
              stdout: mavenOutputChunks.stdout.join(""),
              stderr: mavenOutputChunks.stderr.join(""),
              ...(message.result || {})
            };
          } else if (message.type === "cancelled") {
            terminalError = createAbortError();
          } else if (message.type === "error") {
            terminalError = Object.assign(new Error(message.message || "Java project detection bridge failed."), {
              code: message.code || "java-project-detection-bridge-failed"
            });
          }
        };
        const parseOutput = createLineParser(handleMessage);
        function matchesProcess(detail) {
          return (processId !== null && processId !== undefined && detail?.id === processId)
            || (processPid !== null && processPid !== undefined && detail?.pid === processPid);
        }
        function handleSpawnedProcessEvent(event) {
          const detail = event?.detail || {};
          if (!matchesProcess(detail)) return;
          const action = detail.action || detail.event || detail.type;
          if (action === "stdOut") {
            parseOutput(getEventOutput(detail));
            return;
          }
          if (action === "stdErr") return;
          if (!isExitEvent(action)) return;
          parseOutput("", { flush: true });
          if (terminalError) settle(reject, terminalError);
          else if (terminalResult) settle(resolve, terminalResult);
          else settle(reject, Object.assign(new Error("Java project detection bridge exited without a result."), {
            code: "java-project-detection-bridge-empty-result"
          }));
        }

        global.addEventListener("spawnedProcess", handleSpawnedProcessEvent);
        signal?.addEventListener?.("abort", handleAbort, { once: true });
        const command = `node ${quote(BRIDGE_PATH)} ${quote(encodeRequest(request))}`;
        void Neutralino.os.spawnProcess(command).then(async (handle) => {
          if (settled) {
            const lateId = handle?.id ?? handle;
            if (lateId !== null && lateId !== undefined) void Neutralino.os.updateSpawnedProcess(lateId, "exit");
            return;
          }
          processId = handle?.id ?? handle;
          processPid = handle?.pid ?? null;
          await Neutralino.os.updateSpawnedProcess(processId, "stdIn", `${JSON.stringify({ type: "start" })}\n`);
        }).catch((error) => {
          settle(reject, Object.assign(new Error(error?.message || "Unable to start Java project detection bridge."), {
            code: "java-project-detection-bridge-launch-failed"
          }));
        });
      });
    }

    const api = { isAvailable, run };
    app?.registerModule?.("javaProjectDetectionBridgeClient", api);
    return api;
  }

  global.registerMarkdownViewerJavaProjectDetectionBridgeClient = registerMarkdownViewerJavaProjectDetectionBridgeClient;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaProjectDetectionBridgeClient };
  }
})(typeof window !== "undefined" ? window : globalThis);
