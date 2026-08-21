(function(global) {
  "use strict";

  /* Discovers complete Gradle installations from standard Windows installation sources. */
  function registerMarkdownViewerWindowsGradleDetector(app, deps = {}) {
    const PROGRAM_FILES_ENVIRONMENT_NAMES = ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"];

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

    function getParentPath(path) {
      const normalized = normalizePath(path);
      return normalizePath(normalized.slice(0, normalized.lastIndexOf("/")));
    }

    function getHomeForExecutable(executablePath) {
      const normalized = normalizePath(executablePath);
      const distributionMatch = normalized.match(/^(.*)\/bin\/gradle(?:\.bat|\.cmd|\.exe)?$/i);
      return distributionMatch ? normalizePath(distributionMatch[1]) : getParentPath(getParentPath(normalized));
    }

    function addCandidate(candidates, seenExecutables, homePath, executablePath = "") {
      const path = normalizePath(homePath);
      const executable = normalizePath(executablePath || joinPath(path, "bin/gradle.bat"));
      const key = executable.toLowerCase();
      if (!path || !executable || seenExecutables.has(key)) return;
      seenExecutables.add(key);
      candidates.push({ path, executablePath: executable });
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

    async function collectEnvironmentCandidates(candidates, seenExecutables) {
      const gradleHome = await readEnvironmentValue("GRADLE_HOME");
      addCandidate(candidates, seenExecutables, gradleHome);
    }

    async function collectPathCandidates(candidates, seenExecutables) {
      try {
        const result = await deps.execCommand?.("where.exe gradle.bat");
        if (!result || Number(result.exitCode) !== 0) return;
        String(result.stdOut || "").split(/\r?\n/).forEach((executablePath) => {
          const executable = normalizePath(executablePath);
          if (!executable) return;
          addCandidate(candidates, seenExecutables, getHomeForExecutable(executable), executable);
        });
      } catch (_) {
        // PATH discovery is optional; standard installation folders are still inspected.
      }
    }

    async function collectHomeRootCandidates(candidates, seenExecutables, root) {
      if (!root) return;
      addCandidate(candidates, seenExecutables, root);
      const directChildren = await listChildDirectories(root);
      directChildren.forEach((child) => addCandidate(candidates, seenExecutables, child));
    }

    async function collectWrapperDistributionCandidates(candidates, seenExecutables, userProfile) {
      if (!userProfile) return;
      const distributionsRoot = joinPath(userProfile, ".gradle/wrapper/dists");
      const distributions = await listChildDirectories(distributionsRoot);
      const checksumFolders = (await Promise.all(distributions.map(listChildDirectories))).flat();
      const extractedHomes = (await Promise.all(checksumFolders.map(listChildDirectories))).flat();
      extractedHomes.forEach((home) => addCandidate(candidates, seenExecutables, home));
    }

    async function collectDirectoryCandidates(candidates, seenExecutables) {
      const programFilesHomes = await Promise.all(PROGRAM_FILES_ENVIRONMENT_NAMES.map(readEnvironmentValue));
      const [localAppData, userProfile, chocolateyHome] = await Promise.all([
        readEnvironmentValue("LOCALAPPDATA"),
        readEnvironmentValue("USERPROFILE"),
        readEnvironmentValue("ChocolateyInstall")
      ]);
      const roots = [
        ...programFilesHomes.filter(Boolean).map((home) => joinPath(home, "Gradle")),
        localAppData ? joinPath(localAppData, "Programs/Gradle") : "",
        userProfile ? joinPath(userProfile, "scoop/apps/gradle") : "",
        chocolateyHome ? joinPath(chocolateyHome, "lib/gradle/tools") : ""
      ].filter(Boolean);
      await Promise.all([
        ...roots.map((root) => collectHomeRootCandidates(candidates, seenExecutables, root)),
        collectWrapperDistributionCandidates(candidates, seenExecutables, userProfile)
      ]);
    }

    async function validateCandidate(candidate) {
      try {
        if (!await deps.pathExists?.(candidate.executablePath)) return null;
        const version = String(await deps.detectVersion?.(candidate.executablePath) || "").trim();
        if (!version) return null;
        const detectedName = `Gradle ${version}`;
        return {
          id: candidate.path.toLowerCase(),
          name: detectedName,
          path: candidate.path,
          version,
          detectedName,
          executablePath: candidate.executablePath
        };
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
        && typeof deps.pathExists === "function"
        && typeof deps.detectVersion === "function";
    }

    /**
     * Discover every valid Windows Gradle installation without changing application settings.
     * @returns {Promise<Array<object>>} Valid Gradle entries ordered by newest version first.
     */
    async function detectInstalledGradle() {
      if (!isSupported()) return [];
      const candidates = [];
      const seenExecutables = new Set();
      await Promise.all([
        collectEnvironmentCandidates(candidates, seenExecutables),
        collectPathCandidates(candidates, seenExecutables),
        collectDirectoryCandidates(candidates, seenExecutables)
      ]);
      const detected = (await Promise.all(candidates.map(validateCandidate))).filter(Boolean);
      const seenPaths = new Set();
      return detected
        .filter((installation) => {
          const key = installation.path.toLowerCase();
          if (seenPaths.has(key)) return false;
          seenPaths.add(key);
          return true;
        })
        .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" }) || left.path.localeCompare(right.path));
    }

    const api = { detectInstalledGradle, isSupported };
    app?.registerModule?.("windowsGradleDetector", api);
    return api;
  }

  global.registerMarkdownViewerWindowsGradleDetector = registerMarkdownViewerWindowsGradleDetector;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerWindowsGradleDetector };
  }
})(typeof window !== "undefined" ? window : globalThis);
