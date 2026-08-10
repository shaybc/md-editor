(function(global) {
  "use strict";

  /** Resolves Maven reactor modules from one aggregator effective-POM execution. */
  function registerMarkdownViewerMavenModuleInventory(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const STANDARD_JAVA_SOURCE_ROOT_PATTERN = /\/src\/(?:main|test)\/java$/i;

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

    function isInsideWorkspace(workspaceRoot, candidatePath) {
      const root = normalizePath(workspaceRoot).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === root || candidate.startsWith(`${root}/`);
    }

    function extractEffectivePom(output) {
      const text = String(output || "");
      const projectsStart = text.indexOf("<projects");
      const projectStart = text.indexOf("<project");
      const rootStart = projectsStart >= 0 ? projectsStart : projectStart;
      const declarationStart = text.lastIndexOf("<?xml", rootStart);
      const start = declarationStart >= 0 ? declarationStart : rootStart;
      const projectsEnd = text.lastIndexOf("</projects>");
      const projectEnd = text.lastIndexOf("</project>");
      const end = projectsStart >= 0 && projectsEnd >= projectsStart
        ? projectsEnd + "</projects>".length
        : projectEnd >= projectStart ? projectEnd + "</project>".length : -1;
      if (start < 0 || end < start) {
        throw new Error("Maven completed without returning an effective project model.");
      }
      return text.slice(start, end);
    }

    function directChildren(node, name) {
      return Array.from(node?.children || []).filter((child) => child.localName === name);
    }

    function directChild(node, name) {
      return directChildren(node, name)[0] || null;
    }

    function directChildText(node, name) {
      return directChild(node, name)?.textContent?.trim() || "";
    }

    function parseProjectNode(project) {
      const parent = directChild(project, "parent");
      const build = directChild(project, "build");
      const dependenciesNode = directChild(project, "dependencies");
      return {
        artifactId: directChildText(project, "artifactId"),
        groupId: directChildText(project, "groupId") || directChildText(parent, "groupId"),
        packaging: directChildText(project, "packaging") || "jar",
        buildDirectory: directChildText(build, "directory"),
        sourceDirectories: [
          directChildText(build, "sourceDirectory"),
          directChildText(build, "testSourceDirectory")
        ].filter(Boolean),
        dependencies: directChildren(dependenciesNode, "dependency")
          .map((dependency) => ({
            groupId: directChildText(dependency, "groupId"),
            artifactId: directChildText(dependency, "artifactId")
          }))
          .filter((dependency) => dependency.artifactId)
      };
    }

    /** Parse every effective project emitted by Maven's aggregator goal. */
    function parseEffectiveProjects(output) {
      if (typeof global.DOMParser !== "function") {
        throw new Error("Maven project inventory requires XML parsing support.");
      }
      const text = extractEffectivePom(output);
      const document = new global.DOMParser().parseFromString(text, "application/xml");
      const root = document.documentElement;
      if (!root || document.querySelector("parsererror")) {
        throw new Error("Maven project inventory could not parse the effective POM.");
      }
      const projects = root.localName === "projects"
        ? directChildren(root, "project")
        : root.localName === "project" ? [root] : [];
      if (!projects.length) throw new Error("Maven effective-model output did not contain any reactor projects.");
      return projects.map(parseProjectNode);
    }

    function deriveRootFromBuildPath(workspaceRoot, value) {
      const candidate = normalizePath(value);
      if (!candidate || !isAbsolute(candidate) || !isInsideWorkspace(workspaceRoot, candidate)) return "";
      const sourceMatch = candidate.match(/^(.*)\/src\/(?:main|test)\/[^/]+$/i);
      if (sourceMatch) return normalizePath(sourceMatch[1]);
      if (/\/target$/i.test(candidate)) return normalizePath(candidate.slice(0, -"/target".length));
      return "";
    }

    function resolveProjectRoot(workspaceRoot, project) {
      const candidates = [
        ...project.sourceDirectories.map((sourcePath) => deriveRootFromBuildPath(workspaceRoot, sourcePath)),
        deriveRootFromBuildPath(workspaceRoot, project.buildDirectory)
      ].filter(Boolean);
      const distinct = Array.from(new Set(candidates.map(normalizePath)));
      if (distinct.length !== 1) {
        throw new Error(`Maven effective project ${project.groupId}:${project.artifactId} could not be mapped safely to one workspace module.`);
      }
      return distinct[0];
    }

    async function isDirectory(path) {
      try {
        return (await Neutralino.filesystem.getStats(path))?.isDirectory === true;
      } catch (_error) {
        return false;
      }
    }

    function throwIfAborted(signal) {
      if (!signal?.aborted) return;
      throw Object.assign(new Error("Java project detection was cancelled."), {
        name: "AbortError",
        code: "java-project-detection-cancelled"
      });
    }

    function relativePath(workspaceRoot, value) {
      const root = normalizePath(workspaceRoot);
      const path = normalizePath(value);
      if (path.toLowerCase() === root.toLowerCase()) return ".";
      return path.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? path.slice(root.length + 1) : path;
    }

    async function resolveSourceRoots(workspaceRoot, root, project, context) {
      const knownRoots = new Set((context.standardJavaSourceRoots || []).map((sourceRoot) => normalizePath(sourceRoot).toLowerCase()));
      const sourceRoots = [];
      for (const sourcePath of project.sourceDirectories) {
        throwIfAborted(context.signal);
        const absolutePath = isAbsolute(sourcePath) ? normalizePath(sourcePath) : joinPath(root, sourcePath);
        if (knownRoots.has(absolutePath.toLowerCase())) {
          sourceRoots.push(absolutePath);
        } else if (context.scanTruncated !== false || !STANDARD_JAVA_SOURCE_ROOT_PATTERN.test(absolutePath)) {
          if (await isDirectory(absolutePath)) sourceRoots.push(absolutePath);
        }
      }
      return sourceRoots;
    }

    /**
     * Resolve the canonical Maven reactor inventory without blocking the Neutralino runtime.
     * @param {object} context Workspace discovery context, including an optional AbortSignal.
     * @returns {Promise<{kind: string, label: string, entries: object[]}>} Canonical module inventory.
     */
    async function resolve(context = {}) {
      const workspaceRoot = normalizePath(context.workspaceRoot);
      throwIfAborted(context.signal);
      const mavenProject = deps.mavenDetection?.detectProject
        ? await deps.mavenDetection.detectProject(
          workspaceRoot,
          String(global.NL_OS || "Windows"),
          context.configuration?.sourceFolders || []
        )
        : {
          hasPom: true,
          projectRoot: workspaceRoot,
          pomPath: joinPath(workspaceRoot, "pom.xml")
        };
      if (!mavenProject?.hasPom) {
        throw Object.assign(new Error("The configured Maven project does not have a usable pom.xml."), {
          code: "maven-reactor-model-failed"
        });
      }
      if (mavenProject.runnerError) {
        throw Object.assign(new Error(mavenProject.runnerError), { code: "maven-reactor-model-failed" });
      }
      const mavenRoot = normalizePath(mavenProject.projectRoot);
      const pomPath = normalizePath(mavenProject.pomPath);
      if (!deps.bridge?.isAvailable?.()) {
        throw Object.assign(new Error("Maven reactor discovery bridge is unavailable."), {
          code: "maven-reactor-model-bridge-unavailable"
        });
      }
      const result = await deps.bridge.run({
        mode: "resolve-maven-reactor",
        workspaceRoot: mavenRoot,
        pomPath,
        mavenExecutable: mavenProject.runnerPath || mavenProject.runner,
        mavenConfiguration: deps.mavenRuntimeSettings?.getConfiguration?.() || {}
      }, { signal: context.signal });
      if (Number(result.exitCode) !== 0) {
        throw Object.assign(new Error(String(result.stderr || result.stdout || "Maven effective-model discovery failed.").trim()), {
          code: "maven-reactor-model-failed"
        });
      }
      let projects;
      try {
        projects = parseEffectiveProjects(result.stdout);
      } catch (error) {
        error.code = error.code || "maven-reactor-model-failed";
        throw error;
      }
      const records = [];
      const rootKeys = new Set();
      for (const project of projects) {
        throwIfAborted(context.signal);
        let root;
        try {
          root = resolveProjectRoot(workspaceRoot, project);
        } catch (error) {
          error.code = error.code || "maven-reactor-model-failed";
          throw error;
        }
        const rootKey = root.toLowerCase();
        if (rootKeys.has(rootKey)) {
          throw Object.assign(new Error(`Maven returned more than one effective project for ${relativePath(workspaceRoot, root)}.`), {
            code: "maven-reactor-model-failed"
          });
        }
        rootKeys.add(rootKey);
        records.push({
          root,
          project,
          sourceRoots: await resolveSourceRoots(workspaceRoot, root, project, context)
        });
      }
      const coordinates = new Map(records.map((record) => [
        `${record.project.groupId}:${record.project.artifactId}`.toLowerCase(),
        `maven:${relativePath(workspaceRoot, record.root).toLowerCase()}`
      ]));
      const entries = records
        .filter((record) => record.project.packaging !== "pom" || record.sourceRoots.length > 0)
        .map((record) => {
          const relative = relativePath(workspaceRoot, record.root);
          return {
            id: `maven:${relative.toLowerCase()}`,
            provider: "maven",
            kind: "module",
            name: record.project.artifactId || (relative === "." ? workspaceRoot.split("/").pop() : relative),
            relativePath: relative,
            absolutePath: record.root,
            sourceRoots: record.sourceRoots,
            dependencies: record.project.dependencies
              .map((dependency) => coordinates.get(`${dependency.groupId}:${dependency.artifactId}`.toLowerCase()))
              .filter(Boolean),
            aggregate: record.project.packaging === "pom",
            hasJavaSources: record.sourceRoots.length > 0
          };
        });
      if (!entries.length) {
        throw Object.assign(new Error("The Maven reactor does not contain a Java module that JDT can analyze."), {
          code: "maven-reactor-model-failed"
        });
      }
      return { kind: "maven-modules", label: "Maven reactor modules", entries };
    }

    const api = { extractEffectivePom, parseEffectiveProjects, resolve, resolveProjectRoot };
    app?.registerModule?.("mavenModuleInventory", api);
    return api;
  }

  global.registerMarkdownViewerMavenModuleInventory = registerMarkdownViewerMavenModuleInventory;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerMavenModuleInventory };
  }
})(typeof window !== "undefined" ? window : globalThis);
