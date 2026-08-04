(function(global) {
  "use strict";

  /* Discovers complete JDK installations from standard Windows installation sources. */
  function registerMarkdownViewerWindowsJdkDetector(app, deps = {}) {
    const ENVIRONMENT_JDK_HOME_NAMES = ["JAVA_HOME", "JDK_HOME"];
    const PROGRAM_FILES_ENVIRONMENT_NAMES = ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"];
    const PROGRAM_FILES_JDK_FOLDERS = [
      "Java",
      "Eclipse Adoptium",
      "AdoptOpenJDK",
      "Microsoft",
      "Amazon Corretto",
      "BellSoft",
      "RedHat",
      "Semeru",
      "Zulu"
    ];

    function normalizePath(value) {
      return String(value || "")
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/\\/g, "/")
        .replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      const normalizedParent = normalizePath(parent);
      const normalizedChild = String(child || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      return normalizedParent && normalizedChild ? `${normalizedParent}/${normalizedChild}` : normalizedParent || normalizedChild;
    }

    function addUniquePath(paths, seenPaths, value) {
      const path = normalizePath(value);
      const key = path.toLowerCase();
      if (!path || seenPaths.has(key)) return;
      seenPaths.add(key);
      paths.push(path);
    }

    async function readEnvironmentValue(name) {
      try {
        return normalizePath(await deps.getEnv?.(name));
      } catch (_) {
        return "";
      }
    }

    async function listChildDirectories(parentPath) {
      try {
        const entries = await deps.readDirectory?.(parentPath) || [];
        return entries
          .filter((entry) => entry?.type === "DIRECTORY" && entry.entry !== "." && entry.entry !== "..")
          .map((entry) => joinPath(parentPath, entry.entry));
      } catch (_) {
        return [];
      }
    }

    async function collectEnvironmentCandidates(paths, seenPaths) {
      const homes = await Promise.all(ENVIRONMENT_JDK_HOME_NAMES.map(readEnvironmentValue));
      homes.forEach((home) => addUniquePath(paths, seenPaths, home));
    }

    async function collectPathCandidates(paths, seenPaths) {
      try {
        const result = await deps.execCommand?.("where.exe javac");
        if (!result || Number(result.exitCode) !== 0) return;
        String(result.stdOut || "").split(/\r?\n/).forEach((executablePath) => {
          const normalizedExecutable = normalizePath(executablePath);
          const match = normalizedExecutable.match(/^(.*)\/bin\/javac\.exe$/i);
          if (match) addUniquePath(paths, seenPaths, match[1]);
        });
      } catch (_) {
        // PATH discovery is optional; standard installation folders are still inspected.
      }
    }

    async function collectStandardSearchRoots() {
      const roots = [];
      const seenRoots = new Set();
      const programFilesHomes = await Promise.all(PROGRAM_FILES_ENVIRONMENT_NAMES.map(readEnvironmentValue));
      programFilesHomes.forEach((programFilesHome) => {
        if (!programFilesHome) return;
        PROGRAM_FILES_JDK_FOLDERS.forEach((relativeFolder) => {
          addUniquePath(roots, seenRoots, joinPath(programFilesHome, relativeFolder));
        });
      });

      const [localAppData, userProfile] = await Promise.all([
        readEnvironmentValue("LOCALAPPDATA"),
        readEnvironmentValue("USERPROFILE")
      ]);
      if (localAppData) addUniquePath(roots, seenRoots, joinPath(localAppData, "Programs/Eclipse Adoptium"));
      if (localAppData) addUniquePath(roots, seenRoots, joinPath(localAppData, "Programs/Java"));
      if (userProfile) addUniquePath(roots, seenRoots, joinPath(userProfile, ".jdks"));
      return roots;
    }

    async function collectDirectoryCandidates(paths, seenPaths) {
      const roots = await collectStandardSearchRoots();
      await Promise.all(roots.map(async (root) => {
        addUniquePath(paths, seenPaths, root);
        const directChildren = await listChildDirectories(root);
        directChildren.forEach((child) => addUniquePath(paths, seenPaths, child));
        const nestedChildren = await Promise.all(directChildren.map(listChildDirectories));
        nestedChildren.flat().forEach((child) => addUniquePath(paths, seenPaths, child));
      }));
    }

    async function validateCandidate(path, bundledToolingJdkKey) {
      if (!path || path.toLowerCase() === bundledToolingJdkKey) return null;
      try {
        const validation = await deps.validateJdk?.({ path });
        if (!validation?.valid || !validation.runtime?.feature) return null;
        const feature = Math.floor(Number(validation.runtime.feature));
        const detectedName = `JDK ${feature}`;
        return Object.assign({}, validation.runtime, { name: detectedName, feature, detectedName });
      } catch (_) {
        return null;
      }
    }

    /** Return whether automatic discovery is available in the current desktop runtime. */
    function isSupported() {
      return deps.getOsName?.() === "Windows"
        && typeof deps.getEnv === "function"
        && typeof deps.readDirectory === "function"
        && typeof deps.execCommand === "function"
        && typeof deps.validateJdk === "function";
    }

    /**
     * Discover every valid Windows JDK without changing application settings.
     * @returns {Promise<Array<object>>} Valid JDK entries ordered by newest Java feature first.
     */
    async function detectInstalledJdks() {
      if (!isSupported()) return [];
      const candidatePaths = [];
      const seenCandidatePaths = new Set();
      await Promise.all([
        collectEnvironmentCandidates(candidatePaths, seenCandidatePaths),
        collectPathCandidates(candidatePaths, seenCandidatePaths),
        collectDirectoryCandidates(candidatePaths, seenCandidatePaths)
      ]);

      const bundledToolingJdkKey = normalizePath(deps.getBundledToolingJdkHome?.()).toLowerCase();
      const validated = await Promise.all(candidatePaths.map((path) => validateCandidate(path, bundledToolingJdkKey)));
      return validated
        .filter(Boolean)
        .sort((left, right) => right.feature - left.feature || left.path.localeCompare(right.path));
    }

    const api = { detectInstalledJdks, isSupported };
    app?.registerModule?.("windowsJdkDetector", api);
    return api;
  }

  global.registerMarkdownViewerWindowsJdkDetector = registerMarkdownViewerWindowsJdkDetector;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerWindowsJdkDetector };
  }
})(typeof window !== "undefined" ? window : globalThis);
