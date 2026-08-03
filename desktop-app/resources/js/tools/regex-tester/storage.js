(function(global) {
  "use strict";

  const STORAGE_KEY = "md-editor-regex-tester-last-session-v1";
  const PROFILE_FILE = "regex-tester/last-session.json";
  const VERSION = 1;

  function createDefaultState() {
    return {
      version: VERSION,
      engine: "javascript",
      mode: "match",
      pattern: "",
      testString: "",
      replacement: "",
      flagsByEngine: { javascript: "gm", java: "gm" }
    };
  }

  function normalizeFlags(value, allowed, fallback) {
    const input = String(value || fallback);
    return allowed.filter((flag) => input.includes(flag)).join("");
  }

  function normalizeState(value) {
    if (!value || value.version !== VERSION) return createDefaultState();
    const state = createDefaultState();
    state.engine = value.engine === "java" ? "java" : "javascript";
    state.mode = value.mode === "replace" ? "replace" : "match";
    state.pattern = String(value.pattern || "");
    state.testString = String(value.testString || "");
    state.replacement = String(value.replacement || "");
    state.flagsByEngine.javascript = normalizeFlags(value.flagsByEngine?.javascript, ["d", "g", "i", "m", "s", "u", "v", "y"], "gm");
    if (state.flagsByEngine.javascript.includes("u") && state.flagsByEngine.javascript.includes("v")) {
      state.flagsByEngine.javascript = state.flagsByEngine.javascript.replace("v", "");
    }
    state.flagsByEngine.java = normalizeFlags(value.flagsByEngine?.java, ["g", "i", "m", "s", "u", "U", "x", "d"], "gm");
    return state;
  }

  function registerMarkdownViewerRegexTesterStorage(app, deps = {}) {
    let cachedState = null;
    let pendingState = null;
    let timer = null;
    let writePromise = Promise.resolve();

    async function getProfilePath() {
      return deps.getProfileDataFilePath ? deps.getProfileDataFilePath(PROFILE_FILE) : null;
    }

    async function loadLastSession() {
      if (cachedState) return normalizeState(cachedState);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath();
      if (profilePath && Neutralino?.filesystem?.readFile) {
        try {
          cachedState = normalizeState(JSON.parse(await Neutralino.filesystem.readFile(profilePath)));
          return normalizeState(cachedState);
        } catch (_error) {
          // Fall through to local storage when profile storage is unavailable or malformed.
        }
      }
      try {
        cachedState = normalizeState(JSON.parse(deps.localStorage?.getItem?.(STORAGE_KEY) || "null"));
      } catch (_error) {
        cachedState = createDefaultState();
      }
      return normalizeState(cachedState);
    }

    async function writeState(state) {
      cachedState = normalizeState(state);
      const serialized = JSON.stringify(cachedState, null, 2);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath();
      if (profilePath && Neutralino?.filesystem?.writeFile) {
        const parentPath = String(profilePath).replace(/\\/g, "/").replace(/\/[^/]+$/, "");
        try {
          await Neutralino.filesystem.createDirectory?.(parentPath);
        } catch (_error) {
          // An existing profile directory is ready for the file write.
        }
        try {
          await Neutralino.filesystem.writeFile(profilePath, serialized);
          return cachedState;
        } catch (_error) {
          // Fall back to browser storage.
        }
      }
      deps.localStorage?.setItem?.(STORAGE_KEY, serialized);
      return cachedState;
    }

    function saveLastSession(state) {
      pendingState = normalizeState(state);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = pendingState;
        pendingState = null;
        writePromise = writePromise.then(() => writeState(next));
      }, 300);
      return pendingState;
    }

    async function flush() {
      clearTimeout(timer);
      timer = null;
      if (pendingState) {
        const next = pendingState;
        pendingState = null;
        writePromise = writePromise.then(() => writeState(next));
      }
      await writePromise;
    }

    const api = { loadLastSession, saveLastSession, flush, createDefaultState, normalizeState };
    app?.registerModule?.("regexTesterStorage", api);
    return api;
  }

  global.registerMarkdownViewerRegexTesterStorage = registerMarkdownViewerRegexTesterStorage;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRegexTesterStorage, createDefaultState, normalizeState, STORAGE_KEY, PROFILE_FILE };
  }
})(typeof window !== "undefined" ? window : globalThis);
