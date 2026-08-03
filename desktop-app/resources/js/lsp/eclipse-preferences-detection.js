(function(global) {
  "use strict";

  // Keys Buildship always writes during sync; a prefs file with only these carries
  // no project-specific analysis configuration.
  const BUILDSHIP_BASELINE_KEYS = new Set([
    "eclipse.preferences.version",
    "org.eclipse.jdt.core.compiler.codegen.targetPlatform",
    "org.eclipse.jdt.core.compiler.compliance",
    "org.eclipse.jdt.core.compiler.source"
  ]);
  const MAXIMUM_BUILD_SCRIPT_READS = 12;

  /**
   * Detects whether a workspace defines its own Eclipse analysis preferences and
   * whether a Gradle build can generate them (`eclipse` plugin).
   *
   * Produced flags:
   *   present     - at least one module already carries a curated jdt.core.prefs
   *   generatable - the Gradle build applies the eclipse plugin (eclipseJdt exists)
   *   richness    - "none" | "minimal" | "curated" for the best prefs file found
   */
  function registerMarkdownViewerEclipsePreferencesDetection(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    async function readTextFile(path) {
      try { return String(await Neutralino.filesystem.readFile(path)); }
      catch (_error) { return ""; }
    }

    /**
     * Classify one org.eclipse.jdt.core.prefs body.
     *
     * @param {string} content - Raw preference file text.
     * @returns {"none"|"minimal"|"curated"} "curated" when it configures anything
     *   beyond the compliance keys Buildship writes on every sync.
     */
    function classifyPreferenceRichness(content) {
      const keys = String(content || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => line.slice(0, line.indexOf("=")).trim());
      if (!keys.length) return "none";
      return keys.some((key) => !BUILDSHIP_BASELINE_KEYS.has(key)) ? "curated" : "minimal";
    }

    /** Match Gradle eclipse-plugin usage in one build-script body. */
    function referencesEclipsePlugin(content) {
      return /apply\s+plugin\s*:\s*['"]eclipse['"]|id\s*\(?\s*['"]eclipse['"]|\beclipse\s*\.\s*(?:jdt|classpath|project)\b/.test(String(content || ""));
    }

    /** Collect root build scripts plus first-level `apply from:` includes. */
    async function collectBuildScriptContents(workspaceRoot) {
      const rootScripts = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]
        .map((name) => joinPath(workspaceRoot, name));
      const contents = [];
      const includedScripts = [];
      for (const script of rootScripts) {
        const body = await readTextFile(script);
        if (!body) continue;
        contents.push(body);
        for (const match of body.matchAll(/apply\s+from\s*:\s*["']([^"']+\.gradle(?:\.kts)?)["']/g)) {
          includedScripts.push(match[1]);
        }
        for (const match of body.matchAll(/apply\s*\(?\s*from\s*[:=]\s*["']\$\{?rootDir\}?\/([^"']+\.gradle(?:\.kts)?)["']/g)) {
          includedScripts.push(match[1]);
        }
      }
      for (const included of includedScripts.slice(0, MAXIMUM_BUILD_SCRIPT_READS)) {
        const resolved = /^[A-Za-z]:\//.test(normalizePath(included)) || normalizePath(included).startsWith("/")
          ? normalizePath(included)
          : joinPath(workspaceRoot, included.replace(/\$\{?rootDir\}?\//, ""));
        const body = await readTextFile(resolved);
        if (body) contents.push(body);
      }
      return contents;
    }

    /**
     * Detect the workspace's Eclipse-preference posture.
     *
     * @param {string} workspaceRoot - Workspace root path.
     * @param {object} model - Resolved Java workspace model (modules, importers).
     * @returns {Promise<{present: boolean, generatable: boolean, richness: string, taskName: string}>}
     *   Pure inspection - reads files, runs no build.
     */
    async function detect(workspaceRoot, model) {
      const result = { present: false, generatable: false, richness: "none", taskName: "eclipseJdt" };
      if (!Neutralino?.filesystem?.readFile || !model) return result;
      const analysisModuleRoots = (model.modules || [])
        .filter((module) => module.analysisIncluded !== false)
        .map((module) => module.root);
      const inspectedRoots = Array.from(new Set([normalizePath(workspaceRoot), ...analysisModuleRoots])).slice(0, 40);
      for (const root of inspectedRoots) {
        const richness = classifyPreferenceRichness(await readTextFile(joinPath(root, ".settings/org.eclipse.jdt.core.prefs")));
        if (richness === "curated") {
          result.present = true;
          result.richness = "curated";
          break;
        }
        if (richness === "minimal" && result.richness === "none") result.richness = "minimal";
      }
      if (model.importers?.gradle === true) {
        const contents = await collectBuildScriptContents(workspaceRoot);
        result.generatable = contents.some(referencesEclipsePlugin);
      }
      return result;
    }

    const api = { detect, classifyPreferenceRichness, referencesEclipsePlugin };
    app?.registerModule?.("eclipsePreferencesDetection", api);
    return api;
  }

  global.registerMarkdownViewerEclipsePreferencesDetection = registerMarkdownViewerEclipsePreferencesDetection;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerEclipsePreferencesDetection };
})(typeof window !== "undefined" ? window : globalThis);
