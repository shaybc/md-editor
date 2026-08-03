(function(global) {
  "use strict";

  /** Detect standard Java source folders from Maven projects and declared modules. */
  function registerMarkdownViewerMavenSourceFolders(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const STANDARD_SOURCE_ROOTS = Object.freeze(["src/main/java", "src/test/java"]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === project || candidate.startsWith(`${project}/`);
    }

    function toStoredPath(projectPath, candidatePath) {
      const project = normalizePath(projectPath);
      const candidate = normalizePath(candidatePath);
      if (!isInsideProject(project, candidate)) return candidate;
      const relative = candidate.slice(project.length).replace(/^\/+/, "");
      return relative || ".";
    }

    async function isDirectory(path) {
      try {
        return (await Neutralino.filesystem.getStats(path))?.isDirectory === true;
      } catch (_error) {
        return false;
      }
    }

    async function readPom(path) {
      try {
        return await Neutralino.filesystem.readFile(path);
      } catch (_error) {
        return "";
      }
    }

    function parseModules(pomText) {
      try {
        const parser = new global.DOMParser();
        const document = parser.parseFromString(String(pomText || ""), "application/xml");
        return Array.from(document.getElementsByTagName("modules")).flatMap((modulesNode) => (
          Array.from(modulesNode.getElementsByTagName("module"))
            .map((node) => String(node.textContent || "").trim())
            .filter(Boolean)
        ));
      } catch (_error) {
        return [];
      }
    }

    async function scanModule(projectPath, modulePath, visited, detectedSourceFolders, detectedModules, signal) {
      const normalizedModulePath = normalizePath(modulePath);
      if (signal?.aborted) throw Object.assign(new Error("Maven module scan cancelled."), { name: "AbortError" });
      const visitKey = normalizedModulePath.toLowerCase();
      if (visited.has(visitKey) || !isInsideProject(projectPath, normalizedModulePath)) return;
      visited.add(visitKey);

      for (const sourceRoot of STANDARD_SOURCE_ROOTS) {
        const absolutePath = joinPath(normalizedModulePath, sourceRoot);
        if (signal?.aborted) throw Object.assign(new Error("Maven module scan cancelled."), { name: "AbortError" });
        if (!await isDirectory(absolutePath)) continue;
        const storedPath = toStoredPath(projectPath, absolutePath);
        detectedSourceFolders.set(storedPath.toLowerCase(), {
          path: storedPath,
          absolutePath,
          type: sourceRoot.includes("/test/") ? "Test source" : "Main source"
        });
      }

      const pomText = await readPom(joinPath(normalizedModulePath, "pom.xml"));
      if (!pomText) return;
      const storedModulePath = toStoredPath(projectPath, normalizedModulePath);
      detectedModules.set(visitKey, {
        path: storedModulePath,
        absolutePath: normalizedModulePath
      });
      for (const moduleName of parseModules(pomText)) {
        await scanModule(
          projectPath,
          joinPath(normalizedModulePath, moduleName),
          visited,
          detectedSourceFolders,
          detectedModules,
          signal
        );
      }
    }

    /** Scan a Maven project for its module directories and standard Java source roots. */
    async function scanProject(projectPath, options = {}) {
      const openedRoot = normalizePath(projectPath);
      const detectedSourceFolders = new Map();
      const detectedModules = new Map();
      await scanModule(openedRoot, openedRoot, new Set(), detectedSourceFolders, detectedModules, options.signal);
      return {
        sourceFolders: Array.from(detectedSourceFolders.values())
          .sort((left, right) => left.path.localeCompare(right.path)),
        modules: Array.from(detectedModules.values())
          .sort((left, right) => left.path.localeCompare(right.path))
      };
    }

    /** Scan the opened Maven project and its declared modules for standard Java source roots. */
    async function scan(projectPath, options = {}) {
      return (await scanProject(projectPath, options)).sourceFolders;
    }

    const api = { scan, scanProject };
    app.registerModule?.("mavenSourceFolders", api);
    return api;
  }

  global.registerMarkdownViewerMavenSourceFolders = registerMarkdownViewerMavenSourceFolders;
})(typeof window !== "undefined" ? window : globalThis);
