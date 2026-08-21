// Project-local Java library discovery for the Java Build Path dialog.
(function(global) {
  "use strict";

  /** Detect project archives and conventional compiled-class roots without changing settings. */
  function registerMarkdownViewerJavaLibraryDetection(app, deps = {}) {
    const MAX_SCANNED_DIRECTORIES = 5000;
    const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".gradle", ".idea", ".md-editor", "node_modules"]);
    const GENERATED_ARCHIVE_DIRECTORY_NAMES = new Set(["bin", "build", "out", "target"]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getProjectRelativeSegments(projectPath, candidatePath) {
      const project = normalizePath(projectPath);
      const candidate = normalizePath(candidatePath);
      const relative = candidate.toLowerCase().startsWith(`${project.toLowerCase()}/`)
        ? candidate.slice(project.length + 1)
        : candidate;
      return relative.split("/").filter(Boolean);
    }

    function isGeneratedArchive(projectPath, archivePath) {
      return getProjectRelativeSegments(projectPath, archivePath)
        .slice(0, -1)
        .some((segment) => GENERATED_ARCHIVE_DIRECTORY_NAMES.has(segment.toLowerCase()));
    }

    function resolveCompiledClassRoot(directoryPath) {
      const normalized = normalizePath(directoryPath);
      const patterns = [
        /^(.*\/target\/(?:test-classes|classes))(?:\/|$)/i,
        /^(.*\/build\/classes\/(?:java|kotlin)\/(?:main|test))(?:\/|$)/i,
        /^(.*\/out\/(?:production|test)\/[^/]+)(?:\/|$)/i,
        /^(.*\/(?:bin|classes))(?:\/|$)/i
      ];
      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) return normalizePath(match[1]);
      }
      return "";
    }

    function uniqueSorted(paths) {
      const values = new Map();
      for (const path of paths) {
        const normalized = normalizePath(path);
        if (normalized && !values.has(normalized.toLowerCase())) values.set(normalized.toLowerCase(), normalized);
      }
      return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
    }

    /**
     * Detect class folders and Java archives contained by an opened project.
     * @param {string} projectPath - Absolute opened-project path.
     * @returns {Promise<{classpathFolders: string[], jarFiles: string[], scannedDirectories: number, truncated: boolean}>} Detected absolute paths and scan metadata.
     */
    async function detect(projectPath) {
      const normalizedProjectPath = normalizePath(projectPath);
      if (!normalizedProjectPath || typeof deps.readDirectory !== "function") {
        return { classpathFolders: [], jarFiles: [], scannedDirectories: 0, truncated: false };
      }

      const queue = [normalizedProjectPath];
      const classpathFolders = [];
      const jarFiles = [];
      let scannedDirectories = 0;
      while (queue.length && scannedDirectories < MAX_SCANNED_DIRECTORIES) {
        const directoryPath = queue.shift();
        let entries;
        try {
          entries = await deps.readDirectory(directoryPath);
        } catch (_error) {
          continue;
        }
        scannedDirectories += 1;
        const entryNames = entries.map((entry) => String(entry?.entry || "")).filter(Boolean);
        if (entryNames.some((name) => /\.class$/i.test(name))) {
          const classRoot = resolveCompiledClassRoot(directoryPath);
          if (classRoot) classpathFolders.push(classRoot);
        }
        entries.forEach((entry) => {
          const name = String(entry?.entry || "");
          if (!name) return;
          const path = joinPath(directoryPath, name);
          if (entry?.type === "DIRECTORY") {
            if (!SKIPPED_DIRECTORY_NAMES.has(name.toLowerCase())) queue.push(path);
            return;
          }
          if (/\.(?:jar|zip)$/i.test(name) && !isGeneratedArchive(normalizedProjectPath, path)) jarFiles.push(path);
        });
        if (scannedDirectories % 50 === 0) await new Promise((resolve) => global.setTimeout(resolve, 0));
      }

      return {
        classpathFolders: uniqueSorted(classpathFolders),
        jarFiles: uniqueSorted(jarFiles),
        scannedDirectories,
        truncated: queue.length > 0
      };
    }

    const api = { detect };
    app?.registerModule?.("javaLibraryDetection", api);
    return api;
  }

  global.registerMarkdownViewerJavaLibraryDetection = registerMarkdownViewerJavaLibraryDetection;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaLibraryDetection };
  }
})(typeof window !== "undefined" ? window : globalThis);
