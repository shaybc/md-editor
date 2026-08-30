// Process protocol client for the JDI Java debugger bridge.
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
  function nativeSlashForPath(path) {
    return String(path || "").includes("\\") ? "\\" : "/";
  }

  function joinNativePath(base, ...parts) {
    const slash = nativeSlashForPath(base);
    const root = String(base || "").replace(/[\\/]+$/, "");
    const suffix = parts
      .map((part) => String(part || "").replace(/^[\\/]+|[\\/]+$/g, ""))
      .filter(Boolean)
      .join(slash);
    return suffix ? `${root}${slash}${suffix}` : root;
  }
  function createLineParser(onLine) {
    let pending = "";
    return function parse(chunk) {
      pending += String(chunk || "");
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index).replace(/\r$/, "");
        pending = pending.slice(index + 1);
        if (line) onLine(line);
      }
    };
  }

  /** Register the low-level Java debugger process protocol client. */
  function registerMarkdownViewerJavaDebugProtocolClient(app, deps = {}) {
    /** Create an independent Java debugger bridge client for one debug session. */
    function createClient() {
      let processHandle = null;
      let unregisterProcess = null;
      let onEvent = null;
      let parseStdout = null;

      function getProcessId() {
        return processHandle?.id ?? processHandle;
      }

      function getLaunchPaths(javaExecutable) {
        const root = String(deps.getAppRoot?.() || global.NL_PATH || ".").replace(/[\\/]$/, "");
        const slash = root.includes("\\") ? "\\" : "/";
        return {
          root,
          java: javaExecutable || `${root}${slash}bin${slash}tooling-jdk${slash}bin${slash}java${slash === "\\" ? ".exe" : ""}`,
          bridge: `${root}${slash}resources${slash}bridges${slash}java-debugger${slash}JavaDebuggerBridge.java`,
          cwd: root
        };
      }

      async function localFileExists(path) {
        if (!path || !deps.Neutralino?.filesystem?.getStats) return false;
        try {
          const stats = await deps.Neutralino.filesystem.getStats(path);
          return stats?.isFile !== false;
        } catch (_error) {
          return false;
        }
      }

      async function createDirectoryIfMissing(path) {
        if (!path || !deps.Neutralino?.filesystem?.createDirectory) return false;
        try {
          await deps.Neutralino.filesystem.createDirectory(path);
          return true;
        } catch (_error) {
          return false;
        }
      }

      async function getBridgeExtractionDirectory(root) {
        let tempRoot = "";
        try { tempRoot = await deps.Neutralino?.os?.getPath?.("temp"); } catch (_error) {}
        const base = tempRoot || root || ".";
        const directory = joinNativePath(base, "md-editor-java-debugger");
        await createDirectoryIfMissing(directory);
        return directory;
      }

      async function extractBundledBridge(paths) {
        if (!deps.Neutralino?.resources?.extractFile) return "";
        const destination = joinNativePath(await getBridgeExtractionDirectory(paths.root), "JavaDebuggerBridge.java");
        const candidates = [
          "bridges/java-debugger/JavaDebuggerBridge.java",
          "/bridges/java-debugger/JavaDebuggerBridge.java",
          "resources/bridges/java-debugger/JavaDebuggerBridge.java",
          "/resources/bridges/java-debugger/JavaDebuggerBridge.java"
        ];
        for (const resourcePath of candidates) {
          try {
            await deps.Neutralino.resources.extractFile(resourcePath, destination);
            if (await localFileExists(destination)) return destination;
          } catch (_error) {}
        }
        return "";
      }

      async function resolveBridgePath(paths) {
        if (await localFileExists(paths.bridge)) return paths.bridge;
        const extracted = await extractBundledBridge(paths);
        if (extracted) return extracted;
        throw new Error("Java debugger bridge source could not be found. Reinstall or rebuild MD-Editor so the Java debugger bridge is available.");
      }

      async function resolveBridgeJavaExecutable(options, paths) {
        if (options.javaExecutable) return paths.java;
        return await localFileExists(paths.java) ? paths.java : "java";
      }

      function handleLine(line) {
        const fields = String(line || "").split("\t");
        if (fields[0] !== "EVT") return;
        try {
          onEvent?.(JSON.parse(decodeBase64(fields[1] || "")));
        } catch (error) {
          onEvent?.({ type: "error", body: { message: error?.message || "Invalid debugger bridge response." } });
        }
      }

      async function start(options = {}, listener) {
        if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.os?.spawnProcess || !deps.processRouter?.registerProcess) {
          throw new Error("Java debugging requires the desktop runtime.");
        }
        await stop();
        onEvent = listener;
        parseStdout = createLineParser(handleLine);
        const paths = getLaunchPaths(options.javaExecutable);
        const bridgePath = await resolveBridgePath(paths);
        const javaExecutable = await resolveBridgeJavaExecutable(options, paths);
        const command = `${quoteCommandArgument(javaExecutable)} --add-modules jdk.jdi ${quoteCommandArgument(bridgePath)}`;
        processHandle = await deps.Neutralino.os.spawnProcess(command, { cwd: paths.cwd });
        unregisterProcess = deps.processRouter.registerProcess(processHandle, {
          onStdout(data) { parseStdout(data); },
          onStderr(data) { onEvent?.({ type: "bridge-stderr", body: { text: String(data || "") } }); },
          onExit() { onEvent?.({ type: "terminated", body: { state: "terminated" } }); processHandle = null; unregisterProcess = null; }
        });
        return true;
      }

      function send(fields) {
        if (!processHandle) return Promise.reject(new Error("Java debugger bridge is not running."));
        return deps.Neutralino.os.updateSpawnedProcess(getProcessId(), "stdIn", `${fields.join("\t")}\n`).then(() => true);
      }

      async function stop() {
        const processId = getProcessId();
        unregisterProcess?.();
        unregisterProcess = null;
        processHandle = null;
        if (processId !== null && processId !== undefined && deps.Neutralino?.os?.updateSpawnedProcess) {
          try { await deps.Neutralino.os.updateSpawnedProcess(processId, "exit"); } catch (_error) {}
        }
        return true;
      }

      return { encodeBase64, start, stop, send, getLaunchPaths, isRunning: () => processHandle !== null };
    }

    const defaultClient = createClient();
    const api = {
      encodeBase64,
      createClient,
      start: (...args) => defaultClient.start(...args),
      stop: (...args) => defaultClient.stop(...args),
      send: (...args) => defaultClient.send(...args),
      getLaunchPaths: (...args) => defaultClient.getLaunchPaths(...args),
      isRunning: () => defaultClient.isRunning()
    };
    app.registerModule?.("javaDebugProtocolClient", api);
    return api;
  }
  global.registerMarkdownViewerJavaDebugProtocolClient = registerMarkdownViewerJavaDebugProtocolClient;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerJavaDebugProtocolClient, encodeBase64, decodeBase64 };
})(typeof window !== "undefined" ? window : globalThis);
