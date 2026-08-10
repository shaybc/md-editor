(function(global) {
  "use strict";

  /** Build command lines for Standard Doclet and Maven Javadoc execution. */
  function registerMarkdownViewerJavadocCommand(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function quote(value, osName = deps.osName || global.NL_OS) {
      const text = String(value || "");
      if (osName && osName !== "Windows") return `'${text.replace(/'/g, "'\\''")}'`;
      return `"${text.replace(/"/g, '\\"')}"`;
    }

    function isAbsolutePath(path) {
      const value = normalizePath(path);
      return /^[a-zA-Z]:\//.test(value) || value.startsWith("/");
    }

    function getParentPath(path) {
      const normalized = normalizePath(path);
      const slashIndex = normalized.lastIndexOf("/");
      return slashIndex > 0 ? normalized.slice(0, slashIndex) : "";
    }

    function getBaseName(path) {
      const normalized = normalizePath(path);
      const slashIndex = normalized.lastIndexOf("/");
      return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
    }

    /** Add Maven Javadoc output arguments without passing absolute paths as destDir. */
    function addMavenDestinationOptions(parts, destination) {
      const normalizedDestination = normalizePath(destination);
      if (!isAbsolutePath(normalizedDestination)) {
        parts.push(`-DdestDir=${quote(normalizedDestination)}`);
        return;
      }
      const parentPath = getParentPath(normalizedDestination);
      const folderName = getBaseName(normalizedDestination);
      if (parentPath) parts.push(`-DreportOutputDirectory=${quote(parentPath)}`);
      if (folderName) parts.push(`-DdestDir=${quote(folderName)}`);
    }
    function splitArguments(value) {
      const matches = String(value || "").match(/"[^"]*"|'[^']*'|\S+/g) || [];
      return matches.filter(Boolean);
    }

    function visibilityOption(value) {
      return ["private", "package", "protected", "public"].includes(value) ? `-${value}` : "-public";
    }

    function addStandardDocletOptions(parts, settings) {
      parts.push(visibilityOption(settings.visibility));
      if (settings.documentTitleEnabled && settings.documentTitle) parts.push("-doctitle", quote(settings.documentTitle));
      if (settings.usePage) parts.push("-use");
      if (!settings.hierarchyTree) parts.push("-notree");
      if (!settings.navigatorBar) parts.push("-nonavbar");
      if (!settings.index) parts.push("-noindex");
      if (settings.index && settings.splitIndex) parts.push("-splitindex");
      if (settings.author) parts.push("-author");
      if (settings.version) parts.push("-version");
      if (!settings.deprecated) parts.push("-nodeprecated");
      if (!settings.deprecatedList) parts.push("-nodeprecatedlist");
      for (const link of settings.links || []) parts.push("-link", quote(link));
      if (settings.stylesheetEnabled && settings.stylesheetPath) parts.push("-stylesheetfile", quote(settings.stylesheetPath));
      if (settings.overviewEnabled && settings.overviewPath) parts.push("-overview", quote(settings.overviewPath));
    }

    async function createSourceArgumentFile(sourceRoots) {
      const prepared = await deps.compiler.createSourceArgumentFiles(sourceRoots);
      return {
        tempPath: prepared.tempPath,
        argumentFiles: prepared.sourceRoots.map((entry) => entry.argumentFile)
      };
    }

    function buildJavacCommand(options = {}) {
      const settings = options.settings || {};
      const parts = [];
      for (const vmOption of splitArguments(settings.vmOptions)) parts.push(`-J${vmOption.replace(/^-J/, "")}`);
      parts.push(quote(settings.javadocCommand || "javadoc"), "-d", quote(settings.destination));
      if (settings.doclet === "custom") {
        if (settings.customDocletName) parts.push("-doclet", quote(settings.customDocletName));
        if (settings.customDocletClassPath) parts.push("-docletpath", quote(settings.customDocletClassPath));
      } else {
        addStandardDocletOptions(parts, settings);
      }
      if (settings.sourceCompatibility) parts.push("-source", quote(settings.sourceCompatibility));
      const classpath = (options.classpathEntries || []).map(normalizePath).filter(Boolean);
      if (classpath.length) parts.push("-classpath", quote(classpath.join((options.osName || deps.osName || global.NL_OS) === "Windows" ? ";" : ":")));
      for (const extra of splitArguments(settings.extraOptions)) parts.push(extra);
      for (const argumentFile of options.argumentFiles || []) parts.push(`@${quote(argumentFile)}`);
      return parts.join(" ");
    }

    function buildMavenCommand(options = {}) {
      const settings = options.settings || {};
      const runner = String(options.runner || "mvn");
      if (Object.prototype.hasOwnProperty.call(options, "runner") && !String(options.runner || "").trim()) {
        throw new Error(options.runnerError || "No Maven runner is available for Javadoc generation.");
      }
      const goal = options.goal === "javadoc:aggregate" ? "javadoc:aggregate" : "javadoc:javadoc";
      const parts = [runner, ...(deps.mavenRuntimeSettings?.getInvocationArguments?.({ offlineOverride: options.offlineOverride }) || []), goal];
      addMavenDestinationOptions(parts, settings.destination);
      if (settings.documentTitleEnabled && settings.documentTitle) parts.push(`-Ddoctitle=${quote(settings.documentTitle)}`);
      if (settings.author) parts.push("-Dauthor=true");
      if (settings.version) parts.push("-Dversion=true");
      if (settings.sourceCompatibility) parts.push(`-Dsource=${quote(settings.sourceCompatibility)}`);
      for (const argument of options.optionArguments || []) {
        const text = String(argument || "").trim();
        if (text) parts.push(text);
      }
      for (const extra of splitArguments(settings.extraOptions)) parts.push(extra);
      return parts.join(" ");
    }

    const api = { buildJavacCommand, buildMavenCommand, createSourceArgumentFile, quote, splitArguments };
    app.registerModule?.("javadocCommand", api);
    return api;
  }

  global.registerMarkdownViewerJavadocCommand = registerMarkdownViewerJavadocCommand;
})(typeof window !== "undefined" ? window : globalThis);
