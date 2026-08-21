(function(global) {
  "use strict";

  /** Detects Java source roots from an existing project file inventory. */
  function registerMarkdownViewerJavaSourceFolderDetection(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      return normalizePath(normalized.slice(0, normalized.lastIndexOf("/")));
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === project || candidate.startsWith(`${project}/`);
    }

    function getConventionalSourceRoot(javaFilePath) {
      const normalized = normalizePath(javaFilePath);
      const sourceSetMatch = normalized.match(/^(.*\/src\/[^/]+\/java)(?:\/|$)/i);
      return sourceSetMatch ? normalizePath(sourceSetMatch[1]) : "";
    }

    function getPackageName(sourceText) {
      const match = String(sourceText || "").match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/m);
      return match ? match[1].replace(/\s+/g, "") : "";
    }

    function inferPackageSourceRoot(javaFilePath, packageName) {
      const directoryPath = getParentPath(javaFilePath);
      const packagePath = String(packageName || "").replace(/\./g, "/");
      if (!packagePath) return directoryPath;
      const suffix = `/${packagePath}`;
      return directoryPath.toLowerCase().endsWith(suffix.toLowerCase())
        ? normalizePath(directoryPath.slice(0, -suffix.length))
        : directoryPath;
    }

    function keepNonOverlappingRoots(projectPath, values) {
      const roots = Array.from(new Set(values.map(normalizePath).filter((path) => isInsideProject(projectPath, path))))
        .sort((left, right) => left.length - right.length || left.localeCompare(right));
      return roots.filter((candidate, index) => !roots.slice(0, index).some((parent) => (
        candidate.toLowerCase().startsWith(`${parent.toLowerCase()}/`)
      )));
    }

    async function inferSourceRoot(javaFilePath) {
      const conventional = getConventionalSourceRoot(javaFilePath);
      if (conventional) return conventional;
      try {
        const sourceText = await deps.readFile?.(javaFilePath);
        return inferPackageSourceRoot(javaFilePath, getPackageName(sourceText));
      } catch (_) {
        return getParentPath(javaFilePath);
      }
    }

    /**
     * Detect project-local Java source folders without changing project settings.
     * @param {string} projectPath Opened project root.
     * @param {object} workspaceModel Existing Java workspace discovery result.
     * @returns {Promise<string[]>} Absolute, non-overlapping Java source folder paths.
     */
    async function detect(projectPath, workspaceModel = {}) {
      const normalizedProjectPath = normalizePath(projectPath);
      if (!normalizedProjectPath) return [];
      const standardRoots = Array.isArray(workspaceModel.standardJavaSourceRoots)
        ? workspaceModel.standardJavaSourceRoots.map(normalizePath)
        : [];
      const representativeFiles = new Map();
      for (const javaFilePath of Array.isArray(workspaceModel.javaSourceFiles) ? workspaceModel.javaSourceFiles : []) {
        const normalizedFilePath = normalizePath(javaFilePath);
        const directoryKey = getParentPath(normalizedFilePath).toLowerCase();
        if (normalizedFilePath && !representativeFiles.has(directoryKey)) representativeFiles.set(directoryKey, normalizedFilePath);
      }
      const inferredRoots = await Promise.all(Array.from(representativeFiles.values()).map(inferSourceRoot));
      return keepNonOverlappingRoots(normalizedProjectPath, [...standardRoots, ...inferredRoots]);
    }

    const api = { detect };
    app?.registerModule?.("javaSourceFolderDetection", api);
    return api;
  }

  global.registerMarkdownViewerJavaSourceFolderDetection = registerMarkdownViewerJavaSourceFolderDetection;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaSourceFolderDetection };
  }
})(typeof window !== "undefined" ? window : globalThis);
