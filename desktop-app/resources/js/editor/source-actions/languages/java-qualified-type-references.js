// Java source scanner for exact fully qualified type references.
(function(global) {
  "use strict";

  function isJavaIdentifierStart(character) {
    if (!character) return false;
    const code = character.charCodeAt(0);
    return character === "_" || character === "$"
      || (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code > 127 && character.toLocaleUpperCase() !== character.toLocaleLowerCase());
  }

  function isJavaIdentifierPart(character) {
    if (isJavaIdentifierStart(character)) return true;
    const code = character?.charCodeAt?.(0) || 0;
    return code >= 48 && code <= 57;
  }

  function isValidQualifiedName(name) {
    const parts = name.split(".");
    return parts.length > 1 && parts.every((part) => {
      return isJavaIdentifierStart(part[0])
        && Array.from(part.slice(1)).every(isJavaIdentifierPart);
    });
  }

  function isJavaReferenceBoundaryCharacter(character) {
    return character === "." || isJavaIdentifierPart(character);
  }

  function isEscaped(source, offset) {
    let backslashCount = 0;
    for (let index = offset - 1; index >= 0 && source.charCodeAt(index) === 92; index -= 1) {
      backslashCount += 1;
    }
    return backslashCount % 2 === 1;
  }

  function isPackageOrImportLine(source, lineStart, offset) {
    const prefix = source.slice(lineStart, offset).trimStart();
    return prefix.startsWith("package ") || prefix.startsWith("package" + String.fromCharCode(9))
      || prefix.startsWith("import ") || prefix.startsWith("import" + String.fromCharCode(9));
  }

  /**
   * Find exact qualified type references in Java code.
   * @param {string} source Complete Java source text.
   * @param {string} qualifiedName Fully qualified type name to locate.
   * @returns {Array<{from: number, to: number}>} Code ranges excluding declarations, comments, and literals.
   */
  function findAll(source, qualifiedName) {
    const text = String(source || "");
    const name = String(qualifiedName || "");
    if (!isValidQualifiedName(name)) return [];

    const ranges = [];
    let state = "code";
    let lineStart = 0;
    let offset = 0;
    while (offset < text.length) {
      if (state === "line-comment") {
        if (text.charCodeAt(offset) === 10) {
          state = "code";
          lineStart = offset + 1;
        }
        offset += 1;
        continue;
      }
      if (state === "block-comment") {
        if (text.startsWith("*/", offset)) {
          state = "code";
          offset += 2;
          continue;
        }
        if (text.charCodeAt(offset) === 10) lineStart = offset + 1;
        offset += 1;
        continue;
      }
      if (state === "text-block") {
        if (text.startsWith('"""', offset) && !isEscaped(text, offset)) {
          state = "code";
          offset += 3;
          continue;
        }
        if (text.charCodeAt(offset) === 10) lineStart = offset + 1;
        offset += 1;
        continue;
      }
      if (state === "string" || state === "character") {
        const closingCharacter = state === "string" ? '"' : "'";
        if (text[offset] === closingCharacter && !isEscaped(text, offset)) state = "code";
        if (text.charCodeAt(offset) === 10) {
          state = "code";
          lineStart = offset + 1;
        }
        offset += 1;
        continue;
      }

      if (text.startsWith("//", offset)) {
        state = "line-comment";
        offset += 2;
        continue;
      }
      if (text.startsWith("/*", offset)) {
        state = "block-comment";
        offset += 2;
        continue;
      }
      if (text.startsWith('"""', offset)) {
        state = "text-block";
        offset += 3;
        continue;
      }
      if (text.charCodeAt(offset) === 34) {
        state = "string";
        offset += 1;
        continue;
      }
      if (text.charCodeAt(offset) === 39) {
        state = "character";
        offset += 1;
        continue;
      }
      if (text.charCodeAt(offset) === 10) {
        lineStart = offset + 1;
        offset += 1;
        continue;
      }

      if (text.startsWith(name, offset)) {
        const before = text[offset - 1] || "";
        const after = text[offset + name.length] || "";
        if (!isJavaReferenceBoundaryCharacter(before)
          && !isJavaReferenceBoundaryCharacter(after)
          && !isPackageOrImportLine(text, lineStart, offset)) {
          ranges.push({ from: offset, to: offset + name.length });
          offset += name.length;
          continue;
        }
      }
      offset += 1;
    }
    return ranges;
  }

  global.markdownViewerJavaQualifiedTypeReferences = Object.freeze({
    findAll
  });
})(window);
