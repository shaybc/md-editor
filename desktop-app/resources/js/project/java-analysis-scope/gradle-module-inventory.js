(function(global) {
  "use strict";

  const OUTPUT_PREFIX = "MD_EDITOR_JAVA_PROJECT_INVENTORY=";

  /** Executes the read-only Gradle inventory task and normalizes its module model. */
  function registerMarkdownViewerGradleModuleInventory(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function quote(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    function relativePath(workspaceRoot, value) {
      const root = normalizePath(workspaceRoot);
      const path = normalizePath(value);
      if (path.toLowerCase() === root.toLowerCase()) return ".";
      return path.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? path.slice(root.length + 1) : path;
    }

    async function isFile(path) {
      try {
        return (await Neutralino.filesystem.getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    async function resolveRunner(workspaceRoot, configuration) {
      const isWindows = String(global.NL_OS || "Windows").toLowerCase() === "windows";
      const wrapper = joinPath(workspaceRoot, isWindows ? "gradlew.bat" : "gradlew");
      const installations = deps.getGradleInstallations?.() || [];
      const selected = installations.find((entry) => entry.id === configuration?.gradle?.installationId);
      if (configuration?.gradle?.mode === "wrapper") {
        if (!await isFile(wrapper)) throw new Error("The configured Gradle wrapper was not found.");
        return quote(wrapper);
      }
      if (configuration?.gradle?.mode === "installation") {
        if (!selected?.path) throw new Error("The configured Gradle installation was not found.");
        return quote(joinPath(selected.path, `bin/${isWindows ? "gradle.bat" : "gradle"}`));
      }
      if (configuration?.gradle?.mode !== "built-in" && await isFile(wrapper)) return quote(wrapper);
      if (selected?.path) return quote(joinPath(selected.path, `bin/${isWindows ? "gradle.bat" : "gradle"}`));
      return "gradle";
    }

    function parseOutput(output, workspaceRoot) {
      const line = String(output || "").split(/\r?\n/).find((value) => value.startsWith(OUTPUT_PREFIX));
      if (!line) throw new Error("Gradle completed without returning the MD-Editor Java project inventory.");
      const records = JSON.parse(line.slice(OUTPUT_PREFIX.length));
      const analyzableRecords = records.filter((record) => {
        const sourceRoots = record.sourceRoots || [];
        return record.javaCapable === true
          && record.javaPlatform !== true
          && !(record.buildRoot === true && sourceRoots.length === 0);
      });
      const analyzablePaths = new Set(analyzableRecords.map((record) => String(record.projectPath)));
      const entries = analyzableRecords
        .map((record) => {
          const absolutePath = normalizePath(record.projectDir);
          const normalizedWorkspaceRoot = normalizePath(workspaceRoot);
          if (absolutePath.toLowerCase() !== normalizedWorkspaceRoot.toLowerCase()
            && !absolutePath.toLowerCase().startsWith(`${normalizedWorkspaceRoot.toLowerCase()}/`)) return null;
          const relative = relativePath(workspaceRoot, absolutePath);
          return {
            id: `gradle:${String(record.projectPath).toLowerCase()}`,
            provider: "gradle",
            kind: "module",
            name: String(record.name || record.projectPath || relative),
            relativePath: relative,
            absolutePath,
            sourceRoots: (record.sourceRoots || []).map(normalizePath),
            dependencies: (record.projectDependencies || [])
              .filter((projectPath) => analyzablePaths.has(String(projectPath)))
              .map((projectPath) => `gradle:${String(projectPath).toLowerCase()}`),
            aggregate: false,
            hasJavaSources: (record.sourceRoots || []).length > 0
          };
        })
        .filter(Boolean);
      if (!entries.length) throw new Error("The Gradle build does not contain a Java-capable module that JDT can analyze.");
      return { kind: "gradle-modules", label: "Gradle modules", entries };
    }

    /**
     * Run Gradle's authoritative project model and return its Java-capable modules.
     * @param {object} context Workspace discovery context.
     * @returns {Promise<{kind: string, label: string, entries: object[]}>} Canonical module inventory.
     */
    async function resolve(context = {}) {
      if (!Neutralino?.os?.execCommand) throw new Error("Gradle module discovery requires the MD-Editor desktop runtime.");
      const workspaceRoot = normalizePath(context.workspaceRoot);
      const desktopRoot = normalizePath(await deps.getDesktopAppRootPath?.());
      const resourcesRoot = /(?:^|\/)resources$/i.test(desktopRoot) ? desktopRoot : joinPath(desktopRoot, "resources");
      const scriptPath = joinPath(resourcesRoot, "bridges/java-analysis-scope/gradle/export-java-project-inventory.gradle");
      const runner = await resolveRunner(workspaceRoot, context.configuration || {});
      const command = `${runner} --quiet --console=plain --no-daemon --init-script ${quote(scriptPath)} mdEditorJavaProjectInventory`;
      const result = await Neutralino.os.execCommand(command, { cwd: workspaceRoot, stdIn: "\n" });
      if (Number(result?.exitCode ?? result?.code ?? 0) !== 0) {
        throw new Error(String(result?.stdErr || result?.stderr || result?.stdOut || result?.stdout || "Gradle module discovery failed.").trim());
      }
      return parseOutput(result?.stdOut || result?.stdout || "", workspaceRoot);
    }

    const api = { OUTPUT_PREFIX, parseOutput, resolve };
    app?.registerModule?.("gradleModuleInventory", api);
    return api;
  }

  global.registerMarkdownViewerGradleModuleInventory = registerMarkdownViewerGradleModuleInventory;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerGradleModuleInventory };
  }
})(typeof window !== "undefined" ? window : globalThis);
