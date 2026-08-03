(function(global) {
  "use strict";

  /** Owns the application-wide catalog of user-configured JDK installations. */
  function registerMarkdownViewerJdkRegistry(app, deps = {}) {
    const MINIMUM_JDT_FEATURE = 21;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function getRuntimeId(path) {
      return `jdk:${normalizePath(path).toLowerCase()}`;
    }

    function normalize(entry) {
      const source = entry && typeof entry === "object" ? entry : {};
      const path = normalizePath(source.path);
      if (!path) return null;
      const feature = Number(source.feature);
      const detectedName = String(source.detectedName || "").trim();
      return {
        id: String(source.id || getRuntimeId(path)),
        name: String(source.name || detectedName || (feature > 0 ? `JDK ${feature}` : "JDK")).trim(),
        path,
        feature: Number.isFinite(feature) && feature > 0 ? Math.floor(feature) : 0,
        detectedName
      };
    }

    function normalizeEntries(entries) {
      const seen = new Set();
      return (Array.isArray(entries) ? entries : [])
        .map(normalize)
        .filter(Boolean)
        .filter((entry) => {
          const key = entry.path.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    /** Return normalized configured JDKs without performing filesystem IO. */
    function list() {
      return normalizeEntries(deps.getEntries?.() || []);
    }

    /** Resolve a configured JDK by its stable identifier. */
    function resolve(id) {
      const key = String(id || "");
      return list().find((entry) => entry.id === key) || null;
    }

    function getExecutablePath(runtime, executableName) {
      if (!runtime?.path) return "";
      const suffix = deps.getOsName?.() === "Windows" ? ".exe" : "";
      return `${runtime.path}/bin/${executableName}${suffix}`;
    }

    /** Validate that an entry is a complete JDK suitable for project compilation. */
    async function validate(entry) {
      const runtime = normalize(entry);
      if (!runtime) return { valid: false, reason: "missing-home", runtime: null };
      if (!await deps.pathExists?.(runtime.path)) return { valid: false, reason: "missing-home", runtime };
      const javaExecutable = getExecutablePath(runtime, "java");
      const javacExecutable = getExecutablePath(runtime, "javac");
      if (!await deps.pathExists?.(javaExecutable)) return { valid: false, reason: "missing-java", runtime };
      if (!await deps.pathExists?.(javacExecutable)) return { valid: false, reason: "missing-javac", runtime };
      const feature = runtime.feature || await deps.detectFeature?.(runtime.path) || 0;
      if (!feature) return { valid: false, reason: "unknown-version", runtime };
      return {
        valid: true,
        reason: "",
        runtime: Object.assign({}, runtime, { feature }),
        javaExecutable,
        javacExecutable,
        javadocExecutable: getExecutablePath(runtime, "javadoc")
      };
    }

    /** Return every configured JDK that still validates on disk. */
    async function listValidated() {
      const results = await Promise.all(list().map(validate));
      return results.filter((result) => result.valid).map((result) => result.runtime);
    }

    /** Choose a JDK capable of launching JDT without changing project compilation semantics. */
    async function getCompatibleJdtLauncher(projectJdk) {
      const selected = await validate(projectJdk);
      if (selected.valid && selected.runtime.feature >= MINIMUM_JDT_FEATURE) return selected.runtime;
      const candidates = await listValidated();
      return candidates
        .filter((entry) => entry.feature >= MINIMUM_JDT_FEATURE)
        .sort((left, right) => right.feature - left.feature)[0] || null;
    }

    const api = {
      MINIMUM_JDT_FEATURE,
      getCompatibleJdtLauncher,
      getExecutablePath,
      getRuntimeId,
      list,
      listValidated,
      normalize,
      normalizeEntries,
      resolve,
      validate
    };
    app?.registerModule?.("jdkRegistry", api);
    return api;
  }

  global.registerMarkdownViewerJdkRegistry = registerMarkdownViewerJdkRegistry;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJdkRegistry };
  }
})(typeof window !== "undefined" ? window : globalThis);
