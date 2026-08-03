(function(global) {
  "use strict";

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return global.btoa(binary);
  }

  function decodeBase64(value) {
    const binary = global.atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function quoteCommandArgument(value) {
    return `"${String(value || "").replace(/"/g, '\\"')}"`;
  }

  function createUnavailableResult(request, message, type = "unavailable") {
    return {
      requestId: request.requestId,
      engine: "java",
      ok: false,
      elapsedMs: 0,
      matches: [],
      replacementOutput: "",
      replacementRanges: [],
      truncated: false,
      error: { type, message }
    };
  }

  function registerMarkdownViewerRegexTesterJavaEngine(app, deps = {}) {
    const timeoutMs = Number(deps.timeoutMs || 750);
    const startupTimeoutMs = Number(deps.startupTimeoutMs || 5000);
    let processHandle = null;
    let unregisterProcess = null;
    let stdoutBuffer = "";
    let readyPromise = null;
    let resolveReady = null;
    let pending = null;
    let javaVersion = "";

    function getProcessId() {
      return processHandle?.id ?? processHandle;
    }

    function getLaunchPaths() {
      const root = String(deps.getAppRoot?.() || global.NL_PATH || ".").replace(/[\\/]$/, "");
      const separator = root.includes("\\") ? "\\" : "/";
      return {
        java: `${root}${separator}bin${separator}tooling-jdk${separator}bin${separator}java${separator === "\\" ? ".exe" : ""}`,
        runner: `${root}${separator}resources${separator}bridges${separator}regex-tester-java${separator}RegexTesterRunner.java`,
        cwd: root
      };
    }

    function finishPending(result) {
      if (!pending) return;
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.resolve(result);
    }

    function handleLine(line) {
      const fields = line.split("\t");
      if (fields[0] === "READY") {
        javaVersion = decodeBase64(fields[1] || "");
        resolveReady?.(true);
        resolveReady = null;
        return;
      }
      if (!pending || fields[1] !== pending.requestId) return;
      if (fields[0] === "RES") {
        try {
          finishPending(JSON.parse(decodeBase64(fields[2] || "")));
        } catch (error) {
          finishPending(createUnavailableResult({ requestId: fields[1] }, error?.message || "Invalid Java helper response.", "protocol"));
        }
      } else if (fields[0] === "ERR") {
        finishPending(createUnavailableResult({ requestId: fields[1] }, decodeBase64(fields[2] || ""), "syntax"));
      }
    }

    function handleStdout(chunk) {
      stdoutBuffer += String(chunk || "");
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    }

    async function stopHelper() {
      const processId = getProcessId();
      unregisterProcess?.();
      unregisterProcess = null;
      processHandle = null;
      readyPromise = null;
      resolveReady = null;
      stdoutBuffer = "";
      if (processId !== null && processId !== undefined && deps.Neutralino?.os?.updateSpawnedProcess) {
        try { await deps.Neutralino.os.updateSpawnedProcess(processId, "exit"); } catch (_error) {}
      }
    }

    async function startHelper() {
      if (processHandle && readyPromise) return readyPromise;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.os?.spawnProcess || !deps.processRouter?.registerProcess) {
        throw new Error("Bundled tooling JDK unavailable.");
      }
      const paths = getLaunchPaths();
      readyPromise = new Promise((resolve) => { resolveReady = resolve; });
      const command = `${quoteCommandArgument(paths.java)} ${quoteCommandArgument(paths.runner)}`;
      processHandle = await deps.Neutralino.os.spawnProcess(command, { cwd: paths.cwd });
      unregisterProcess = deps.processRouter.registerProcess(processHandle, {
        onStdout: handleStdout,
        onStderr: function() {},
        onExit: function() {
          processHandle = null;
          readyPromise = null;
          resolveReady?.(false);
          resolveReady = null;
          if (pending) finishPending(createUnavailableResult({ requestId: pending.requestId }, "Java regular expression helper exited.", "helper"));
        }
      });
      const ready = await Promise.race([
        readyPromise,
        new Promise((resolve) => setTimeout(() => resolve(false), startupTimeoutMs))
      ]);
      if (!ready) {
        await stopHelper();
        throw new Error("Bundled tooling JDK unavailable.");
      }
      return true;
    }

    async function evaluate(request) {
      if (pending) finishPending(createUnavailableResult({ requestId: pending.requestId }, "Evaluation was superseded.", "cancelled"));
      try {
        await startHelper();
      } catch (error) {
        return createUnavailableResult(request, error?.message || "Bundled tooling JDK unavailable.");
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          finishPending(createUnavailableResult(request, "Evaluation exceeded the 750 ms timeout.", "timeout"));
          void stopHelper();
        }, timeoutMs);
        pending = { requestId: request.requestId, resolve, timer };
        const record = ["REQ", request.requestId, request.mode, request.flags, encodeBase64(request.pattern), encodeBase64(request.testString), encodeBase64(request.replacement), ""].join("\t");
        deps.Neutralino.os.updateSpawnedProcess(getProcessId(), "stdIn", `${record}\n`).catch((error) => {
          finishPending(createUnavailableResult(request, error?.message || "Unable to contact Java helper.", "helper"));
          void stopHelper();
        });
      });
    }

    function dispose() {
      if (pending) finishPending(createUnavailableResult({ requestId: pending.requestId }, "Evaluation was cancelled.", "cancelled"));
      return stopHelper();
    }

    const api = { evaluate, dispose, getJavaVersion: () => javaVersion, _test: { handleStdout, getLaunchPaths, encodeBase64, decodeBase64 } };
    app?.registerModule?.("regexTesterJavaEngine", api);
    return api;
  }

  global.registerMarkdownViewerRegexTesterJavaEngine = registerMarkdownViewerRegexTesterJavaEngine;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerRegexTesterJavaEngine, encodeBase64, decodeBase64 };
})(typeof window !== "undefined" ? window : globalThis);
