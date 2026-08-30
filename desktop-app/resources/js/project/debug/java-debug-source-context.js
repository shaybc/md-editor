// Java source context helpers for debugger actions.
(function(global) {
  "use strict";

  function maskJavaNonCode(source) {
    let result = "";
    let state = "code";
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      const next = source[index + 1] || "";
      if (state === "line-comment") {
        result += char === "\n" ? "\n" : " ";
        if (char === "\n") state = "code";
      } else if (state === "block-comment") {
        result += char === "\n" ? "\n" : " ";
        if (char === "*" && next === "/") { result += " "; index++; state = "code"; }
      } else if (state === "string") {
        result += char === "\n" ? "\n" : " ";
        if (char === "\\") { result += next === "\n" ? "\n" : " "; index++; }
        else if (char === "\"") state = "code";
      } else if (state === "char") {
        result += char === "\n" ? "\n" : " ";
        if (char === "\\") { result += next === "\n" ? "\n" : " "; index++; }
        else if (char === "'") state = "code";
      } else if (char === "/" && next === "/") {
        result += "  ";
        index++;
        state = "line-comment";
      } else if (char === "/" && next === "*") {
        result += "  ";
        index++;
        state = "block-comment";
      } else if (char === "\"") {
        result += " ";
        state = "string";
      } else if (char === "'") {
        result += " ";
        state = "char";
      } else {
        result += char;
      }
    }
    return result;
  }

  function findMatchingBrace(source, openIndex) {
    let depth = 0;
    for (let index = openIndex; index < source.length; index++) {
      if (source[index] === "{") depth++;
      else if (source[index] === "}") {
        depth--;
        if (depth === 0) return index;
      }
    }
    return source.length;
  }

  function findJavaClassName(maskedSource, offset) {
    const packageName = maskedSource.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m)?.[1] || "";
    const classNames = [];
    const classPattern = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)\b[^{;]*\{/g;
    let match;
    while ((match = classPattern.exec(maskedSource))) {
      const openBrace = maskedSource.indexOf("{", match.index);
      if (openBrace < 0 || openBrace > offset) continue;
      if (findMatchingBrace(maskedSource, openBrace) >= offset) classNames.push(match[1]);
    }
    if (!classNames.length) return "";
    const localName = classNames.join("$");
    return packageName ? `${packageName}.${localName}` : localName;
  }

  /**
   * Resolve the Java class and method enclosing an editor offset.
   * @param {object} context Source text and cursor offset from an active Java editor.
   * @returns {{className: string, methodName: string}|null} The enclosing method, if one exists.
   */
  function findJavaMethodContext(context = {}) {
    const source = String(context.source || "");
    const offset = Math.max(0, Math.min(source.length, Number(context.offset ?? context.selection?.start ?? 0)));
    const maskedSource = maskJavaNonCode(source);
    const className = findJavaClassName(maskedSource, offset);
    if (!className) return null;
    const methodPattern = /(?:^|[;{}\n])\s*(?:@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|static|final|synchronized|native|abstract|default|strictfp)\s+)*(?:<[^;{}()]+>\s*)?(?:(?:[\w$.[\]<>?,]+\s+)+)?([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws[^{;]*)?\{/gm;
    const keywords = new Set(["if", "for", "while", "switch", "catch", "synchronized"]);
    let selected = null;
    let match;
    while ((match = methodPattern.exec(maskedSource))) {
      const methodName = match[1];
      if (keywords.has(methodName)) continue;
      const openBrace = maskedSource.indexOf("{", match.index);
      if (openBrace < 0 || openBrace > offset) continue;
      if (findMatchingBrace(maskedSource, openBrace) >= offset) selected = { className, methodName };
    }
    return selected;
  }

  /**
   * Return a compact source preview for a one-based Java source line.
   * @param {object} context Source text and line number from an editor-backed file.
   * @returns {string} Trimmed source line text suitable for debugger list previews.
   */
  function getJavaLinePreview(context = {}) {
    const line = Math.max(1, Number(context.line) || 1);
    return String(context.source || "").split(/\r?\n/)[line - 1]?.trim().replace(/\s+/g, " ") || "";
  }

  function getLineStartOffset(source, line) {
    let offset = 0;
    for (let current = 1; current < line && offset < source.length; current += 1) {
      const next = source.indexOf("\n", offset);
      offset = next < 0 ? source.length : next + 1;
    }
    return offset;
  }

  function hasExecutableTextAfterBlockOpen(text) {
    const openIndex = text.indexOf("{");
    if (openIndex < 0) return false;
    return text.slice(openIndex + 1).replace(/[{};]/g, "").trim().length > 0;
  }

  function isJavaTypeDeclarationLine(text) {
    return /^(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\b/.test(text);
  }

  function isJavaMethodDeclarationOnlyLine(text) {
    const match = text.match(/^(?:@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|static|final|synchronized|native|abstract|default|strictfp)\s+)*(?:<[^;{}()]+>\s*)?(?:(?:[\w$.[\]<>?,]+\s+)+)?([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws[^{;]*)?\{/);
    if (!match) return false;
    if (new Set(["if", "for", "while", "switch", "catch", "synchronized"]).has(match[1])) return false;
    return !hasExecutableTextAfterBlockOpen(text);
  }

  /**
   * Decide whether a Java source line is eligible for a line breakpoint.
   * @param {object} context Source text and one-based line number to inspect.
   * @returns {boolean} True when the line appears to contain executable Java code.
   */
  function isJavaBreakpointLine(context = {}) {
    const source = String(context.source || "");
    const lines = source.split(/\r?\n/);
    const line = Math.max(1, Number(context.line) || 1);
    if (!source || line < 1 || line > lines.length) return false;
    const maskedSource = maskJavaNonCode(source);
    const maskedLines = maskedSource.split(/\r?\n/);
    const text = String(maskedLines[line - 1] || "").trim();
    if (!text || /^[{};,]+$/.test(text)) return false;
    if (/^(?:package|import)\b/.test(text) || /^@/.test(text)) return false;
    if (isJavaTypeDeclarationLine(text)) return hasExecutableTextAfterBlockOpen(text);
    if (isJavaMethodDeclarationOnlyLine(text)) return false;

    const lineStart = getLineStartOffset(source, line);
    const tokenOffset = lineStart + Math.max(0, String(maskedLines[line - 1] || "").search(/\S/));
    if (findJavaMethodContext({ source, offset: tokenOffset })) return true;
    return /(?:=|\bnew\b|[A-Za-z_$][\w$]*\s*\()/.test(text) && !/^(?:public|protected|private)?\s*(?:static\s+)?\{?$/.test(text);
  }

  global.MarkdownViewerJavaDebugSourceContext = { findJavaMethodContext, getJavaLinePreview, isJavaBreakpointLine };
})(typeof window !== "undefined" ? window : globalThis);
