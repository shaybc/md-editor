(function(global) {
  "use strict";

  /** Parse Maven help:effective-pom output into plugin certainty metadata. */
  function registerMarkdownViewerMavenEffectivePomParser(app, deps = {}) {
    const DOMParserConstructor = deps.DOMParser || global.DOMParser;
    const SUPPORTED_PLUGINS = {
      "org.apache.rat:apache-rat-plugin": { id: "apache-rat", displayName: "Apache RAT", skipArgument: "-Drat.skip=true" },
      "org.apache.maven.plugins:maven-checkstyle-plugin": { id: "checkstyle", displayName: "Checkstyle", skipArgument: "-Dcheckstyle.skip=true" },
      "com.github.spotbugs:spotbugs-maven-plugin": { id: "spotbugs", displayName: "SpotBugs", skipArgument: "-Dspotbugs.skip=true" },
      "org.apache.maven.plugins:maven-pmd-plugin": { id: "pmd", displayName: "PMD", skipArgument: "-Dpmd.skip=true" },
      "org.jacoco:jacoco-maven-plugin": { id: "jacoco", displayName: "JaCoCo", skipArgument: "-Djacoco.skip=true" },
      "org.owasp:dependency-check-maven": { id: "dependency-check", displayName: "OWASP Dependency Check", skipArgument: "-Ddependency-check.skip=true" }
    };
    const DECLARATION_RANK = { "active-plugin": 2, "plugin-management": 1 };

    function findOpeningTag(text, tagName) {
      const match = new RegExp(`<${tagName}(?:\\s|>)`).exec(text);
      return match ? match.index : -1;
    }

    function findMavenProjectRootStarts(text) {
      return Array.from(text.matchAll(/<project\s[^>]*xmlns=/g)).map((match) => match.index);
    }

    function extractProjectXml(output) {
      const text = String(output || "");
      const projectsStart = findOpeningTag(text, "projects");
      const projectsEnd = text.lastIndexOf("</projects>");
      if (projectsStart >= 0 && projectsEnd > projectsStart) return text.slice(projectsStart, projectsEnd + "</projects>".length);
      const mavenProjectStarts = findMavenProjectRootStarts(text);
      if (mavenProjectStarts.length) {
        const start = mavenProjectStarts[0];
        const end = text.lastIndexOf("</project>");
        if (end < start) throw new Error("Maven output did not contain a complete effective <project> XML document.");
        const fragment = text.slice(start, end + "</project>".length);
        return mavenProjectStarts.length > 1 ? `<projects>${fragment}</projects>` : fragment;
      }
      const start = findOpeningTag(text, "project");
      const end = text.lastIndexOf("</project>");
      if (start < 0 || end < start) throw new Error("Maven output did not contain an effective <project> XML document.");
      return text.slice(start, end + "</project>".length);
    }

    function childrenByName(parent, localName) {
      return Array.from(parent?.children || []).filter((child) => child.localName === localName || child.nodeName === localName);
    }

    function firstChild(parent, localName) {
      return childrenByName(parent, localName)[0] || null;
    }

    function textOf(parent, localName) {
      return (firstChild(parent, localName)?.textContent || "").trim();
    }

    function textFromXmlBlock(block, localName) {
      const match = new RegExp(`<${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</${localName}>`).exec(block);
      return (match?.[1] || "").trim();
    }

    function pluginFromXmlBlock(block, declarationKind) {
      const artifactMatch = /<artifactId(?:\s[^>]*)?>([\s\S]*?)<\/artifactId>/.exec(block);
      const artifactId = (artifactMatch?.[1] || "").trim();
      const beforeArtifactId = artifactMatch ? block.slice(0, artifactMatch.index) : block;
      const groupId = textFromXmlBlock(beforeArtifactId, "groupId") || "org.apache.maven.plugins";
      const supported = SUPPORTED_PLUGINS[`${groupId}:${artifactId}`];
      if (!supported) return null;
      return Object.assign({}, supported, {
        groupId,
        artifactId,
        sourcePom: "effective-pom",
        declarationKind,
        inProfile: false,
        confidence: declarationKind === "active-plugin" ? "effective" : "available-only"
      });
    }

    function declarationKindAt(xml, index) {
      const managementOpen = xml.lastIndexOf("<pluginManagement", index);
      const managementClose = xml.lastIndexOf("</pluginManagement>", index);
      return managementOpen > managementClose ? "plugin-management" : "active-plugin";
    }

    function parseWithScanner(xml, warning) {
      const byId = new Map();
      const warnings = warning ? [warning] : [];
      for (const match of xml.matchAll(/<plugin(?:\s[^>]*)?>[\s\S]*?<\/plugin>/g)) {
        const plugin = pluginFromXmlBlock(match[0], declarationKindAt(xml, match.index || 0));
        if (plugin) putBestPlugin(byId, plugin);
      }
      if (!byId.size) warnings.push("The effective POM does not contain supported Build Options plugins.");
      return { plugins: Array.from(byId.values()), warnings, source: "effective-pom" };
    }

    function pluginFromElement(element, declarationKind) {
      const groupId = textOf(element, "groupId") || "org.apache.maven.plugins";
      const artifactId = textOf(element, "artifactId");
      const supported = SUPPORTED_PLUGINS[`${groupId}:${artifactId}`];
      if (!supported) return null;
      return Object.assign({}, supported, {
        groupId,
        artifactId,
        sourcePom: "effective-pom",
        declarationKind,
        inProfile: false,
        confidence: declarationKind === "active-plugin" ? "effective" : "available-only"
      });
    }

    function collectPlugins(build, declarationKind) {
      const pluginsParent = firstChild(build, declarationKind === "plugin-management" ? "pluginManagement" : "plugins");
      const plugins = declarationKind === "plugin-management" ? firstChild(pluginsParent, "plugins") : pluginsParent;
      return childrenByName(plugins, "plugin").map((plugin) => pluginFromElement(plugin, declarationKind)).filter(Boolean);
    }

    function putBestPlugin(byId, plugin) {
      const existing = byId.get(plugin.id);
      if (!existing || DECLARATION_RANK[plugin.declarationKind] > DECLARATION_RANK[existing.declarationKind]) byId.set(plugin.id, plugin);
    }

    function projectElements(root) {
      if (root.localName === "projects" || root.nodeName === "projects") return childrenByName(root, "project");
      return [root];
    }

    /** Parse command output from Maven help:effective-pom. */
    function parse(output) {
      const xml = extractProjectXml(output);
      if (typeof DOMParserConstructor !== "function") return parseWithScanner(xml, "XML parsing is unavailable; plugin certainty was extracted with a lightweight scanner.");
      const doc = new DOMParserConstructor().parseFromString(xml, "application/xml");
      const parseError = doc.getElementsByTagName?.("parsererror")?.[0];
      if (parseError) return parseWithScanner(xml, "Maven effective POM XML could not be parsed completely; plugin certainty was extracted with a lightweight scanner.");
      const byId = new Map();
      const warnings = [];
      projectElements(doc.documentElement).forEach((project) => {
        const build = firstChild(project, "build");
        if (!build) return;
        collectPlugins(build, "plugin-management").forEach((plugin) => putBestPlugin(byId, plugin));
        collectPlugins(build, "active-plugin").forEach((plugin) => putBestPlugin(byId, plugin));
      });
      if (!byId.size) warnings.push("The effective POM does not contain supported Build Options plugins.");
      return { plugins: Array.from(byId.values()), warnings, source: "effective-pom" };
    }

    const api = { parse, extractProjectXml };
    app.registerModule?.("mavenEffectivePomParser", api);
    return api;
  }

  global.registerMarkdownViewerMavenEffectivePomParser = registerMarkdownViewerMavenEffectivePomParser;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenEffectivePomParser };
})(typeof window !== "undefined" ? window : globalThis);