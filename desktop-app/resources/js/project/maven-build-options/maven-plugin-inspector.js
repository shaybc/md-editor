(function(global) {
  "use strict";

  /** Statically inspect Maven POM files for build plugins that expose safe one-run skip flags. */
  function registerMarkdownViewerMavenPluginInspector(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const filesystem = deps.filesystem || Neutralino?.filesystem;

    const KNOWN_PLUGINS = [
      { id: "apache-rat", groupId: "org.apache.rat", artifactId: "apache-rat-plugin", displayName: "Apache RAT", skipArgument: "-Drat.skip=true" },
      { id: "checkstyle", groupId: "org.apache.maven.plugins", artifactId: "maven-checkstyle-plugin", displayName: "Checkstyle", skipArgument: "-Dcheckstyle.skip=true" },
      { id: "spotless", groupId: "com.diffplug.spotless", artifactId: "spotless-maven-plugin", displayName: "Spotless", skipArgument: "-Dspotless.check.skip=true" },
      { id: "spotbugs", groupId: "com.github.spotbugs", artifactId: "spotbugs-maven-plugin", displayName: "SpotBugs", skipArgument: "-Dspotbugs.skip=true" },
      { id: "pmd", groupId: "org.apache.maven.plugins", artifactId: "maven-pmd-plugin", displayName: "PMD", skipArgument: "-Dpmd.skip=true" },
      { id: "jacoco", groupId: "org.jacoco", artifactId: "jacoco-maven-plugin", displayName: "JaCoCo", skipArgument: "-Djacoco.skip=true" },
      { id: "dependency-check", groupId: "org.owasp", artifactId: "dependency-check-maven", displayName: "OWASP Dependency Check", skipArgument: "-Ddependency-check.skip=true" }
    ];

    const byArtifact = new Map(KNOWN_PLUGINS.map((plugin) => [plugin.artifactId, plugin]));

    function normalizePath(value) {
      const raw = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
      const drive = /^[a-zA-Z]:/.test(raw) ? raw.slice(0, 2) : "";
      const absolute = raw.startsWith("/") || Boolean(drive);
      const body = drive ? raw.slice(2) : raw;
      const parts = [];
      body.split("/").forEach((part) => {
        if (!part || part === ".") return;
        if (part === ".." && parts.length && parts[parts.length - 1] !== "..") parts.pop();
        else if (part !== ".." || !absolute) parts.push(part);
      });
      return `${drive}${absolute ? "/" : ""}${parts.join("/")}`.replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      const index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : "";
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return Boolean(project) && (candidate === project || candidate.startsWith(`${project}/`));
    }

    async function readFile(path) {
      return filesystem?.readFile ? filesystem.readFile(path) : "";
    }

    async function isFile(path) {
      try {
        return (await filesystem?.getStats?.(path))?.isFile === true;
      } catch (_error) {
        return false;
      }
    }

    function readTag(text, name) {
      const match = String(text || "").match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
      return match ? match[1].trim() : "";
    }

    function readAllTags(text, name) {
      return Array.from(String(text || "").matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi")))
        .map((match) => match[1].trim());
    }

    function isInsideBlock(prefix, name) {
      return prefix.lastIndexOf(`<${name}`) > prefix.lastIndexOf(`</${name}>`);
    }

    function classifyDeclaration(fullText, pluginIndex, inherited) {
      const prefix = String(fullText || "").slice(0, pluginIndex);
      const inProfile = isInsideBlock(prefix, "profile");
      const inPluginManagement = isInsideBlock(prefix, "pluginManagement");
      if (inProfile) return { declarationKind: "profile", inProfile: true, confidence: "ambiguous" };
      if (inPluginManagement) return { declarationKind: "plugin-management", inProfile: false, confidence: "available-only" };
      if (inherited) return { declarationKind: "inherited-static", inProfile: false, confidence: "high" };
      return { declarationKind: "active-plugin", inProfile: false, confidence: "high" };
    }

    function collectPluginsFromPom(pom, inherited) {
      const entries = [];
      const pluginPattern = /<plugin(?:\s[^>]*)?>([\s\S]*?)<\/plugin>/gi;
      let match;
      while ((match = pluginPattern.exec(pom.text))) {
        const body = match[1];
        const artifactId = readTag(body, "artifactId");
        const known = byArtifact.get(artifactId);
        if (!known) continue;
        const groupId = readTag(body, "groupId") || known.groupId;
        const classification = classifyDeclaration(pom.text, match.index, inherited);
        entries.push(Object.assign({}, known, {
          groupId,
          sourcePom: pom.path,
          declarationKind: classification.declarationKind,
          inProfile: classification.inProfile,
          confidence: classification.confidence
        }));
      }
      return entries;
    }

    function readParentPomPath(pom) {
      const parent = readTag(pom.text, "parent");
      if (!parent) return "";
      const relativePath = readTag(parent, "relativePath") || "../pom.xml";
      if (relativePath === "") return "";
      return normalizePath(relativePath).endsWith("pom.xml")
        ? joinPath(getParentPath(pom.path), relativePath)
        : joinPath(joinPath(getParentPath(pom.path), relativePath), "pom.xml");
    }

    function readModulePomPaths(pom) {
      const modules = readTag(pom.text, "modules");
      return modules
        ? readAllTags(modules, "module").map((modulePath) => joinPath(joinPath(getParentPath(pom.path), modulePath), "pom.xml"))
        : [];
    }

    async function readPom(path, projectRoot, warnings) {
      const normalized = normalizePath(path);
      if (!isInsideProject(projectRoot, normalized)) {
        warnings.push(`Skipped Maven POM outside the opened workspace: ${normalized}`);
        return null;
      }
      if (!await isFile(normalized)) return null;
      try {
        return { path: normalized, text: await readFile(normalized) };
      } catch (error) {
        warnings.push(`Could not read Maven POM '${normalized}': ${error?.message || String(error)}`);
        return null;
      }
    }

    function mergePlugin(existing, next) {
      if (!existing) return next;
      const rank = { "active-plugin": 4, "inherited-static": 3, profile: 2, "plugin-management": 1 };
      return (rank[next.declarationKind] || 0) > (rank[existing.declarationKind] || 0) ? next : existing;
    }

    /** Inspect local POM files without running Maven or changing project state. */
    async function inspect(request = {}) {
      const projectRoot = normalizePath(request.projectRoot);
      const pomPath = normalizePath(request.pomPath);
      const warnings = [];
      const visited = new Set();
      const byId = new Map();

      async function visit(path, inherited) {
        const normalized = normalizePath(path);
        if (!normalized || visited.has(normalized.toLowerCase())) return;
        visited.add(normalized.toLowerCase());
        const pom = await readPom(normalized, projectRoot, warnings);
        if (!pom) return;
        for (const plugin of collectPluginsFromPom(pom, inherited)) {
          byId.set(plugin.id, mergePlugin(byId.get(plugin.id), plugin));
        }
        const parentPom = readParentPomPath(pom);
        if (parentPom) await visit(parentPom, true);
        if (!inherited) {
          for (const modulePom of readModulePomPaths(pom)) await visit(modulePom, false);
        }
      }

      if (projectRoot && pomPath) await visit(pomPath, false);
      else warnings.push("Maven plugin inspection requires a project root and POM path.");

      return {
        plugins: Array.from(byId.values()).sort((left, right) => left.displayName.localeCompare(right.displayName)),
        warnings
      };
    }

    const api = { inspect, knownPlugins: KNOWN_PLUGINS.slice() };
    app.registerModule?.("mavenPluginInspector", api);
    return api;
  }

  global.registerMarkdownViewerMavenPluginInspector = registerMarkdownViewerMavenPluginInspector;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenPluginInspector };
})(typeof window !== "undefined" ? window : globalThis);
