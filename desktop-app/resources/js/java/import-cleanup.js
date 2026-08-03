(function(window) {
  "use strict";

    function splitLinesWithEndings(text) {
      const source = String(text || "");
      if (!source) return [];
      const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      return lines;
    }

    function getLineEnding(line) {
      const match = String(line || "").match(/(\r\n|\n|\r)$/);
      return match ? match[1] : "";
    }

    function parseImportLine(line) {
      const match = String(line || "").match(/^\s*import\s+(static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\.\*)?)\s*;\s*(?:(?:\/\/.*)|(?:\/\*.*\*\/\s*))?$/);
      if (!match) return null;
      const qualifiedName = match[2];
      const wildcard = qualifiedName.endsWith(".*");
      const importName = wildcard ? "*" : qualifiedName.slice(qualifiedName.lastIndexOf(".") + 1);
      return {
        line,
        static: !!match[1],
        qualifiedName,
        wildcard,
        importName
      };
    }

    function maskJavaCommentsAndLiterals(text) {
      const source = String(text || "");
      let result = "";
      let index = 0;
      let state = "code";

      while (index < source.length) {
        const char = source[index];
        const next = source[index + 1] || "";
        const third = source[index + 2] || "";

        if (state === "line-comment") {
          if (char === "\r" || char === "\n") {
            state = "code";
            result += char;
          } else {
            result += " ";
          }
          index += 1;
          continue;
        }

        if (state === "block-comment") {
          if (char === "*" && next === "/") {
            result += "  ";
            index += 2;
            state = "code";
          } else {
            result += char === "\r" || char === "\n" ? char : " ";
            index += 1;
          }
          continue;
        }

        if (state === "string") {
          if (char === "\\" && next) {
            result += next === "\r" || next === "\n" ? ` ${next}` : "  ";
            index += 2;
          } else if (char === "\"") {
            result += " ";
            index += 1;
            state = "code";
          } else {
            result += char === "\r" || char === "\n" ? char : " ";
            index += 1;
          }
          continue;
        }

        if (state === "char") {
          if (char === "\\" && next) {
            result += next === "\r" || next === "\n" ? ` ${next}` : "  ";
            index += 2;
          } else if (char === "'") {
            result += " ";
            index += 1;
            state = "code";
          } else {
            result += char === "\r" || char === "\n" ? char : " ";
            index += 1;
          }
          continue;
        }

        if (state === "text-block") {
          if (char === "\"" && next === "\"" && third === "\"") {
            result += "   ";
            index += 3;
            state = "code";
          } else {
            result += char === "\r" || char === "\n" ? char : " ";
            index += 1;
          }
          continue;
        }

        if (char === "/" && next === "/") {
          result += "  ";
          index += 2;
          state = "line-comment";
        } else if (char === "/" && next === "*") {
          result += "  ";
          index += 2;
          state = "block-comment";
        } else if (char === "\"" && next === "\"" && third === "\"") {
          result += "   ";
          index += 3;
          state = "text-block";
        } else if (char === "\"") {
          result += " ";
          index += 1;
          state = "string";
        } else if (char === "'") {
          result += " ";
          index += 1;
          state = "char";
        } else {
          result += char;
          index += 1;
        }
      }

      return result;
    }

    function maskImportAndPackageLines(text) {
      return splitLinesWithEndings(text).map((line) => {
        if (/^\s*(?:package|import)\b/.test(line)) {
          return line.replace(/[^\r\n]/g, " ");
        }
        return line;
      }).join("");
    }

    function cleanupJavaUnusedImports(text, options = {}) {
      const source = String(text || "");
      const lines = splitLinesWithEndings(source);
      const imports = [];
      let unsupportedImportLine = "";

      lines.forEach((line) => {
        if (!/^\s*import\b/.test(line)) return;
        const parsed = parseImportLine(line.replace(/(\r\n|\n|\r)$/, ""));
        if (!parsed) {
          unsupportedImportLine = line.trim();
          return;
        }
        imports.push(parsed);
      });

      if (unsupportedImportLine) {
        return {
          content: source,
          changed: false,
          importCount: imports.length,
          removedImportCount: 0,
          removedImports: [],
          skipped: true,
          reason: "unsupported-import",
          unsupportedImportLine
        };
      }

      if (!imports.length) {
        return {
          content: source,
          changed: false,
          importCount: 0,
          removedImportCount: 0,
          removedImports: [],
          skipped: false,
          reason: "no-imports"
        };
      }

      const searchableCode = maskImportAndPackageLines(maskJavaCommentsAndLiterals(source));
      const removedImports = [];
      const nextLines = lines.filter((line) => {
        if (!/^\s*import\b/.test(line)) return true;
        const lineWithoutEnding = line.replace(/(\r\n|\n|\r)$/, "");
        const parsed = parseImportLine(lineWithoutEnding);
        if (!parsed || parsed.wildcard) return true;
        const namePattern = new RegExp(`\\b${parsed.importName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        if (namePattern.test(searchableCode)) return true;
        removedImports.push(lineWithoutEnding.trim());
        return false;
      });

      return {
        content: nextLines.join(""),
        changed: removedImports.length > 0,
        importCount: imports.length,
        removedImportCount: removedImports.length,
        removedImports,
        skipped: false,
        reason: removedImports.length ? "removed-unused-imports" : "no-unused-imports"
      };
    }

  function registerMarkdownViewerJavaImportCleanup(app, deps = {}) {
    const api = {
      cleanupJavaUnusedImports
    };

    app?.registerModule?.("javaImportCleanup", api);
    return api;
  }

  registerMarkdownViewerJavaImportCleanup._test = {
    parseImportLine(line) {
      return parseImportLine(line);
    },
    maskJavaCommentsAndLiterals,
    cleanupJavaUnusedImports: function(text, options) {
      return cleanupJavaUnusedImports(text, options);
    }
  };

  window.registerMarkdownViewerJavaImportCleanup = registerMarkdownViewerJavaImportCleanup;
})(window);
