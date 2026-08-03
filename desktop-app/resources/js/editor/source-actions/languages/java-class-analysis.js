// Shared local Java class location and source-position analysis.
(function(global) {
  "use strict";

  /**
   * Create reusable local class analysis for Java source generators.
   * @param {{ getOutlineLanguage?: Function }} options Analysis dependencies.
   * @returns {object} Pure class and source-position helpers.
   */
  function createMarkdownViewerJavaClassAnalysis(options = {}) {
    const getOutlineLanguage = options.getOutlineLanguage || function() { return null; };

    function positionToOffset(source, position = {}) {
      const value = String(source || "");
      const targetLine = Math.max(0, Number(position.line) || 0);
      let offset = 0;
      for (let line = 0; line < targetLine && offset < value.length; line += 1) {
        const next = value.indexOf("\n", offset);
        offset = next < 0 ? value.length : next + 1;
      }
      return Math.min(value.length, offset + Math.max(0, Number(position.character) || 0));
    }

    function getTypeNodes(nodes) {
      const roots = Array.isArray(nodes) ? nodes : [];
      return roots.flatMap((node) => node?.kind === "package" ? getTypeNodes(node.children) : [node]);
    }

    function findActiveClass(source, cursorOffset = 0) {
      const language = getOutlineLanguage();
      if (typeof language?.parse !== "function") return null;
      const value = String(source || "");
      const candidates = [];
      function visit(node) {
        if (!node) return;
        if (node.kind === "class") {
          const from = positionToOffset(value, node.range?.start);
          const to = positionToOffset(value, node.range?.end);
          if (cursorOffset >= from && cursorOffset <= to) candidates.push({ node, from, to });
        }
        (node.children || []).forEach(visit);
      }
      const roots = getTypeNodes(language.parse(value, {}));
      roots.forEach(visit);
      candidates.sort((left, right) => (left.to - left.from) - (right.to - right.from));
      return candidates[0]?.node || roots.find((node) => node?.kind === "class") || null;
    }

    function getDeclarationPrefix(source, member) {
      const value = String(source || "");
      const offset = positionToOffset(value, member?.selectionRange?.start || member?.range?.start);
      const boundaries = [
        value.lastIndexOf(";", offset - 1),
        value.lastIndexOf("{", offset - 1),
        value.lastIndexOf("}", offset - 1)
      ];
      return value.slice(Math.max(...boundaries) + 1, offset);
    }

    function getLineIndent(source, position) {
      const offset = positionToOffset(source, position);
      const lineStart = String(source || "").lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      return String(source || "").slice(lineStart, offset).match(/^\s*/)?.[0] || "";
    }

    function findClosingBraceOffset(source, owner) {
      const value = String(source || "");
      const rangeEnd = positionToOffset(value, owner?.range?.end);
      return value.lastIndexOf("}", Math.min(value.length - 1, Math.max(0, rangeEnd)));
    }

    return { findActiveClass, findClosingBraceOffset, getDeclarationPrefix, getLineIndent, positionToOffset };
  }

  global.createMarkdownViewerJavaClassAnalysis = createMarkdownViewerJavaClassAnalysis;
})(window);
