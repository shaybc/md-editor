// Local Java string-literal discovery for the Externalize Strings action.
(function(global) {
  "use strict";

  function decodeJavaString(rawLiteral) {
    const value = String(rawLiteral || "").slice(1, -1);
    return value.replace(/\\u([0-9a-fA-F]{4})|\\([btnfr"'\\])|\\([0-7]{1,3})/g, (match, unicode, simple, octal) => {
      if (unicode) return String.fromCharCode(parseInt(unicode, 16));
      if (octal) return String.fromCharCode(parseInt(octal, 8));
      return ({ b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "'": "'", "\\": "\\" })[simple] ?? match;
    });
  }

  function getLineEnd(source, offset) {
    const end = String(source || "").indexOf("\n", offset);
    return end < 0 ? String(source || "").length : end;
  }

  function isExistingLookup(source, lineStart, literalStart) {
    const prefix = String(source || "").slice(Math.max(lineStart, literalStart - 100), literalStart);
    return /\b[A-Za-z_$][\w$]*\.getString\s*\(\s*$/.test(prefix);
  }

  /**
   * Create Java string-literal analysis.
   * @returns {object} Pure literal discovery and Java source metadata helpers.
   */
  function createMarkdownViewerJavaStringLiteralAnalysis() {
    /** Find ordinary Java string literals that are not already externalized or ignored. */
    function analyze(source) {
      const value = String(source || "");
      const literals = [];
      const lineCounts = new Map();
      let state = "code";
      let lineNumber = 0;
      let lineStart = 0;
      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const next = value[index + 1];
        const third = value[index + 2];
        if (character === "\n") {
          lineNumber += 1;
          lineStart = index + 1;
          if (state === "line") state = "code";
          continue;
        }
        if (state === "line") continue;
        if (state === "block") {
          if (character === "*" && next === "/") { state = "code"; index += 1; }
          continue;
        }
        if (state === "char") {
          if (character === "\\") index += 1;
          else if (character === "'") state = "code";
          continue;
        }
        if (state === "text") {
          if (character === '"' && next === '"' && third === '"') { state = "code"; index += 2; }
          continue;
        }
        if (character === "/" && next === "/") { state = "line"; index += 1; continue; }
        if (character === "/" && next === "*") { state = "block"; index += 1; continue; }
        if (character === "'") { state = "char"; continue; }
        if (character !== '"') continue;
        if (next === '"' && third === '"') { state = "text"; index += 2; continue; }
        const start = index;
        for (index += 1; index < value.length; index += 1) {
          if (value[index] === "\\") { index += 1; continue; }
          if (value[index] === '"') break;
          if (value[index] === "\n") break;
        }
        if (value[index] !== '"') continue;
        const lineLiteralIndex = (lineCounts.get(lineNumber) || 0) + 1;
        lineCounts.set(lineNumber, lineLiteralIndex);
        const rawLiteral = value.slice(start, index + 1);
        const lineEnd = getLineEnd(value, index + 1);
        const lineText = value.slice(lineStart, lineEnd);
        const ignored = lineText.includes("$NON-NLS-" + lineLiteralIndex + "$");
        if (ignored || isExistingLookup(value, lineStart, start)) continue;
        literals.push({
          id: "literal:" + start,
          start,
          end: index + 1,
          lineNumber,
          lineLiteralIndex,
          rawLiteral,
          value: decodeJavaString(rawLiteral),
          context: lineText.trim(),
          status: "externalize"
        });
      }
      return literals;
    }

    function getPackageName(source) {
      return String(source || "").match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/)?.[1] || "";
    }

    function getPrimaryClassName(source, filePath) {
      return String(source || "").match(/\b(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/)?.[1]
        || String(filePath || "").replace(/\\/g, "/").split("/").pop()?.replace(/\.java$/i, "")
        || "Messages";
    }

    /** Derive the current Java source root and package defaults without scanning the workspace. */
    function createDefaultConfiguration(source, filePath) {
      const normalizedPath = String(filePath || "").replace(/\\/g, "/");
      const directory = normalizedPath.slice(0, Math.max(0, normalizedPath.lastIndexOf("/")));
      const packageName = getPackageName(source);
      const packagePath = packageName.replace(/\./g, "/");
      const suffix = packagePath ? "/" + packagePath : "";
      const sourceRoot = suffix && directory.toLowerCase().endsWith(suffix.toLowerCase())
        ? directory.slice(0, directory.length - suffix.length)
        : directory;
      return {
        sourceRoot,
        packageName,
        sourcePackageName: packageName,
        accessorClassName: "Messages",
        propertyFileName: "messages.properties",
        keyPrefix: getPrimaryClassName(source, filePath) + "."
      };
    }

    return { analyze, createDefaultConfiguration, getPackageName, getPrimaryClassName };
  }

  global.createMarkdownViewerJavaStringLiteralAnalysis = createMarkdownViewerJavaStringLiteralAnalysis;
})(window);
