(function(global) {
  "use strict";

  /** Detect the Maven descriptor and preferred Maven runner associated with an opened project. */
  function registerMarkdownViewerMavenProjectDetection(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const mavenRuntimeSettings = deps.mavenRuntimeSettings;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function isAbsolute(path) {
      const value = normalizePath(path);
      return /^[a-zA-Z]:\//.test(value) || value.startsWith("/");
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === project || candidate.startsWith(`${project}/`);
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      return normalizePath(normalized.slice(0, normalized.lastIndexOf("/")));
    }

    function toProjectRelativePath(projectPath, candidatePath) {
      const project = normalizePath(projectPath);
      const candidate = normalizePath(candidatePath);
      const relative = candidate.slice(project.length).replace(/^\/+/, "");
      return relative || "pom.xml";
    }

    async function isFile(path) {
      try {
        return (await Neutralino.filesystem.getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    async function findNearestPom(projectPath, sourcePath) {
      let candidate = normalizePath(sourcePath);
      while (candidate && isInsideProject(projectPath, candidate)) {
        const pomPath = joinPath(candidate, "pom.xml");
        if (await isFile(pomPath)) return { projectRoot: candidate, pomPath };
        if (candidate.toLowerCase() === normalizePath(projectPath).toLowerCase()) break;
        candidate = getParentPath(candidate);
      }
      return null;
    }

    /** Resolve the nearest Maven module containing one target file or folder. */
    async function detectProjectForTarget(projectPath, targetPath, osName = "Windows") {
      const match = await findNearestPom(projectPath, targetPath);
      if (!match) return detectProject(projectPath, osName, []);
      return detectProject(match.projectRoot, osName, [], projectPath);
    }


    /** Resolve one Maven project from the root or the ancestors of configured source folders. */
    async function detectProject(projectPath, osName = "Windows", sourceFolders = [], workspacePath = projectPath) {
      const openedRoot = normalizePath(projectPath);
      const rootPomPath = joinPath(openedRoot, "pom.xml");
      let detected = await isFile(rootPomPath) ? { projectRoot: openedRoot, pomPath: rootPomPath } : null;
      let ambiguous = false;

      if (!detected) {
        const matches = new Map();
        for (const sourceFolder of sourceFolders || []) {
          const sourcePath = isAbsolute(sourceFolder) ? normalizePath(sourceFolder) : joinPath(openedRoot, sourceFolder);
          const match = await findNearestPom(openedRoot, sourcePath);
          if (match) matches.set(match.projectRoot.toLowerCase(), match);
        }
        if (matches.size === 1) detected = Array.from(matches.values())[0];
        ambiguous = matches.size > 1;
      }

      const mavenRoot = detected?.projectRoot || openedRoot;
      const pomPath = detected?.pomPath || rootPomPath;
      const hasPom = Boolean(detected);
      const isWindows = String(osName || "").toLowerCase() === "windows";
      const wrapperName = isWindows ? "mvnw.cmd" : "mvnw";
      const wrapperPath = joinPath(mavenRoot, wrapperName);
      const hasWrapper = hasPom && await isFile(wrapperPath);
      const resolvedRunner = mavenRuntimeSettings?.resolveRunner
        ? await mavenRuntimeSettings.resolveRunner({ projectRoot: mavenRoot, workspaceRoot: workspacePath, osName })
        : {
            runner: hasWrapper ? (isWindows ? ".\\mvnw.cmd" : "./mvnw") : "mvn",
            runnerPath: hasWrapper ? wrapperPath : "",
            usesWrapper: hasWrapper,
            error: ""
          };
      return {
        ambiguous,
        hasPom,
        projectRoot: mavenRoot,
        pomPath,
        pomLabel: hasPom ? toProjectRelativePath(openedRoot, pomPath) : "pom.xml",
        runner: resolvedRunner.runner,
        runnerPath: resolvedRunner.runnerPath,
        runnerError: resolvedRunner.error,
        usesWrapper: resolvedRunner.usesWrapper
      };
    }

    const api = { detectProject, detectProjectForTarget };
    app.registerModule?.("mavenProjectDetection", api);
    return api;
  }

  global.registerMarkdownViewerMavenProjectDetection = registerMarkdownViewerMavenProjectDetection;
})(typeof window !== "undefined" ? window : globalThis);
