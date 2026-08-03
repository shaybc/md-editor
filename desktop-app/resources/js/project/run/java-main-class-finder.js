// Java source discovery for classes that declare executable main methods.
(function(global) {
  "use strict";

  /**
   * Register Java main-class discovery.
   * @param {object} app Application module registry.
   * @param {object} deps Java compiler and filesystem dependencies.
   * @returns {object} Java main-class finder API.
   */
  function registerMarkdownViewerJavaMainClassFinder(app, deps = {}) {
    const MAIN_PATTERN = /\bpublic\s+static\s+void\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]\s*[\w$]+|[\w$]+\s*\[\s*\]|\.\.\.\s*[\w$]+)\s*\)/;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function maskCommentsAndLiterals(source) {
      return String(source || "").replace(
        /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/g,
        (value) => value.startsWith("/") ? " ".repeat(value.length) : value[0] + " ".repeat(Math.max(0, value.length - 2)) + value.slice(-1)
      );
    }

    function findPackageName(source) {
      return maskCommentsAndLiterals(source).match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] || "";
    }

    function findTypeName(source, filePath) {
      const clean = maskCommentsAndLiterals(source);
      const publicType = clean.match(/\bpublic\s+(?:final\s+|abstract\s+)?(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/);
      if (publicType) return publicType[1];
      const fileName = normalizePath(filePath).split("/").pop() || "";
      return fileName.replace(/\.java$/i, "");
    }

    /**
     * Inspect one Java source string for an executable top-level class.
     * @param {string} source Java source text.
     * @param {string} filePath Source file path.
     * @param {string} sourceRoot Owning source root.
     * @returns {object|null} Main-class descriptor, or null when no main method exists.
     */
    function inspectSource(source, filePath, sourceRoot = "") {
      const clean = maskCommentsAndLiterals(source);
      if (!MAIN_PATTERN.test(clean)) return null;
      const simpleName = findTypeName(source, filePath);
      if (!simpleName) return null;
      const packageName = findPackageName(source);
      return {
        className: packageName ? `${packageName}.${simpleName}` : simpleName,
        simpleName,
        packageName,
        filePath: normalizePath(filePath),
        sourceRoot: normalizePath(sourceRoot)
      };
    }

    async function inspectFile(filePath, sourceRoot = "") {
      try {
        const source = await (deps.Neutralino || global.Neutralino)?.filesystem?.readFile?.(filePath);
        return inspectSource(source, filePath, sourceRoot);
      } catch (_error) {
        return null;
      }
    }

    /**
     * Scan source roots for Java main classes.
     * @param {string[]} sourceRoots Absolute source roots.
     * @returns {Promise<object[]>} Sorted main-class descriptors.
     */
    async function findAll(sourceRoots) {
      const results = [];
      for (const sourceRoot of sourceRoots || []) {
        const files = await deps.compiler?.collectJavaFiles?.(sourceRoot) || [];
        for (const filePath of files) {
          const match = await inspectFile(filePath, sourceRoot);
          if (match) results.push(match);
        }
      }
      return results.sort((left, right) => left.className.localeCompare(right.className));
    }

    const api = { findAll, inspectFile, inspectSource, maskCommentsAndLiterals };
    app.registerModule?.("javaMainClassFinder", api);
    return api;
  }

  global.registerMarkdownViewerJavaMainClassFinder = registerMarkdownViewerJavaMainClassFinder;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerJavaMainClassFinder };
  }
})(typeof window !== "undefined" ? window : globalThis);
