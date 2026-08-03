(function(global) {
  "use strict";

  /** Resolve the Maven module, parent chain, wrapper, report, and governing RAT declaration. */
  function registerMarkdownViewerRatProjectContext(app, deps = {}) {
    const filesystem = () => (deps.Neutralino || global.Neutralino)?.filesystem;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function parentPath(path) {
      const value = normalizePath(path);
      return value.slice(0, value.lastIndexOf("/"));
    }

    function joinPath(root, child) {
      const combined = `${normalizePath(root)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
      const drive = combined.match(/^[A-Za-z]:/)?.[0] || "";
      const absolute = combined.startsWith("/") || Boolean(drive);
      const segments = combined.replace(/^[A-Za-z]:/, "").split("/");
      const resolved = [];
      for (const segment of segments) {
        if (!segment || segment === ".") continue;
        if (segment === "..") resolved.pop();
        else resolved.push(segment);
      }
      const prefix = drive ? `${drive}/` : absolute ? "/" : "";
      return `${prefix}${resolved.join("/")}`;
    }

    async function isFile(path) {
      try {
        return (await filesystem().getStats(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    async function findWrapper(modulePath, workspacePath, osName) {
      const windows = String(osName || "").toLowerCase() === "windows";
      const name = windows ? "mvnw.cmd" : "mvnw";
      let cursor = normalizePath(modulePath);
      const boundary = normalizePath(workspacePath).toLowerCase();
      while (cursor && (cursor.toLowerCase() === boundary || cursor.toLowerCase().startsWith(`${boundary}/`))) {
        const candidate = joinPath(cursor, name);
        if (await isFile(candidate)) {
          return { runner: windows ? ".\\mvnw.cmd" : "./mvnw", runnerPath: candidate, cwd: cursor, usesWrapper: true };
        }
        if (cursor.toLowerCase() === boundary) break;
        cursor = parentPath(cursor);
      }
      return { runner: "mvn", runnerPath: "", cwd: modulePath, usesWrapper: false };
    }

    async function readParentChain(modulePom, workspacePath) {
      const chain = [modulePom];
      const seen = new Set([normalizePath(modulePom.path).toLowerCase()]);
      let current = modulePom;
      while (current.parentRelativePath) {
        const candidate = normalizePath(joinPath(parentPath(current.path), current.parentRelativePath));
        const key = candidate.toLowerCase();
        if (seen.has(key) || !key.startsWith(normalizePath(workspacePath).toLowerCase()) || !await isFile(candidate)) break;
        const parent = await deps.configurationReader.readPom(candidate);
        chain.push(parent);
        seen.add(key);
        current = parent;
      }
      return chain;
    }

    async function analyze(request = {}) {
      const finding = request.finding || deps.findingParser?.parseDiagnostic?.(request.diagnostic || {}, request) || {};
      const projectPath = normalizePath(request.projectPath || finding.projectPath || deps.getWorkspaceRoot?.());
      if (!projectPath) throw new Error("Open a project before using Apache RAT License Audit.");
      const targetPath = normalizePath(request.targetPath || finding.filePath || projectPath);
      const detected = await deps.mavenDetection.detectProjectForTarget(projectPath, targetPath, deps.osName || "Windows");
      if (!detected?.hasPom) throw new Error("No Maven pom.xml was found for this RAT finding.");
      const modulePom = await deps.configurationReader.readPom(detected.pomPath);
      const pomChain = await readParentChain(modulePom, projectPath);
      const declarations = pomChain.flatMap((pom, pomIndex) => pom.ratPlugins.map((plugin) => ({
        ...plugin,
        pomPath: pom.path,
        modulePath: parentPath(pom.path),
        inherited: pomIndex > 0,
        active: !plugin.inPluginManagement
      })));
      const governing = declarations.find((entry) => entry.active) || declarations[0] || null;
      const wrapper = await findWrapper(detected.projectRoot, projectPath, deps.osName || "Windows");
      const reportCandidates = pomChain.map((pom) => joinPath(parentPath(pom.path), "target/rat.txt"));
      let reportPath = finding.reportPath || "";
      if (!reportPath) {
        for (const candidate of reportCandidates) {
          if (await isFile(candidate)) {
            reportPath = candidate;
            break;
          }
        }
      }
      return {
        request,
        finding: { ...finding, projectPath, modulePath: detected.projectRoot, reportPath },
        projectPath,
        targetPath,
        module: detected,
        pomChain,
        declarations,
        governing,
        reportPath,
        wrapper,
        configurationConfidence: governing && !governing.inProfile ? "static" : governing ? "ambiguous" : "missing"
      };
    }

    const api = { analyze };
    app?.registerModule?.("ratProjectContext", api);
    return api;
  }

  global.registerMarkdownViewerRatProjectContext = registerMarkdownViewerRatProjectContext;
})(typeof window !== "undefined" ? window : globalThis);
