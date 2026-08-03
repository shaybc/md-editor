(function(global) {
  "use strict";

  /** Persist successful Java build baselines and calculate safe incremental source sets. */
  function registerMarkdownViewerJavaBuildState(app, deps = {}) {
    const FILE_NAME = "java-build-state.json";
    const Neutralino = deps.Neutralino || global.Neutralino;
    const normalizePath = (value) => String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const joinPath = (parent, child) => `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    const getPath = (projectPath) => joinPath(joinPath(projectPath, ".md-editor"), FILE_NAME);

    function stableStringify(value) {
      if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
      if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
      return JSON.stringify(value);
    }

    async function hashText(text) {
      if (!global.crypto?.subtle || typeof TextEncoder === "undefined") return "";
      const bytes = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text || "")));
      return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
    }

    /** Hash source contents from disk; an empty hash makes the baseline intentionally incomplete. */
    async function snapshotSources(sourceFiles) {
      const snapshots = {};
      for (const filePath of sourceFiles || []) {
        const path = normalizePath(filePath);
        try {
          snapshots[path] = { hash: await hashText(await Neutralino.filesystem.readFile(path)) };
        } catch (_error) {
          snapshots[path] = { hash: "" };
        }
      }
      return snapshots;
    }

    async function load(projectPath) {
      try {
        const value = JSON.parse(await Neutralino.filesystem.readFile(getPath(projectPath)));
        return value?.type === "md-editor-java-build-state" ? value : null;
      } catch (_error) {
        return null;
      }
    }

    async function save(projectPath, state) {
      try { await Neutralino.filesystem.createDirectory(joinPath(projectPath, ".md-editor")); } catch (_error) {}
      const value = Object.assign({ schemaVersion: 1, type: "md-editor-java-build-state", updatedAt: new Date().toISOString() }, state);
      await Neutralino.filesystem.writeFile(getPath(projectPath), JSON.stringify(value, null, 2) + "\n");
      return value;
    }

    async function invalidate(projectPath) {
      try { await Neutralino.filesystem.remove(getPath(projectPath)); } catch (_error) {}
    }

    function fingerprint(configuration, profile, buildSystem) {
      return stableStringify({ buildSystem, configuration, profile });
    }

    /** Decide whether a javac target can use the previous ownership/dependency baseline. */
    function planIncremental(state, snapshots, requestedFiles, expectedFingerprint) {
      if (!state || state.complete !== true) return { full: true, reason: "missing-or-incomplete-state", files: [] };
      if (state.fingerprint !== expectedFingerprint) return { full: true, reason: "settings-changed", files: [] };
      const previousFiles = Object.keys(state.sources || {});
      if (previousFiles.some((path) => !snapshots[path])) return { full: true, reason: "source-removed", files: [] };
      if (previousFiles.some((path) => !(state.ownership?.[path] || []).length)) return { full: true, reason: "ownership-missing", files: [] };
      const changed = new Set(requestedFiles || []);
      Object.keys(snapshots || {}).forEach((path) => {
        if (!state.sources?.[path] || !snapshots[path].hash || snapshots[path].hash !== state.sources[path].hash) changed.add(path);
      });
      const reverse = state.reverseDependencies || {};
      const queue = Array.from(changed);
      while (queue.length) {
        for (const dependent of reverse[queue.shift()] || []) {
          if (!changed.has(dependent)) { changed.add(dependent); queue.push(dependent); }
        }
      }
      return { full: false, reason: "baseline-valid", files: Array.from(changed).sort() };
    }

    const api = { FILE_NAME, fingerprint, getPath, invalidate, load, planIncremental, save, snapshotSources };
    app.registerModule?.("javaBuildState", api);
    return api;
  }

  global.registerMarkdownViewerJavaBuildState = registerMarkdownViewerJavaBuildState;
})(typeof window !== "undefined" ? window : globalThis);
