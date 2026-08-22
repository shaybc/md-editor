(function(global) {
  "use strict";

  function registerMarkdownViewerLessToCssConverter(app) {
    function splitSelectorList(value) {
      const selectors = [];
      let buffer = "";
      let quote = "";
      let depth = 0;
      for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        const previous = value[index - 1] || "";
        if (quote) {
          buffer += char;
          if (char === quote && previous !== "\\") quote = "";
          continue;
        }
        if (char === "\"" || char === "'") {
          quote = char;
          buffer += char;
          continue;
        }
        if (char === "(" || char === "[") depth += 1;
        if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
        if (char === "," && depth === 0) {
          if (buffer.trim()) selectors.push(buffer.trim());
          buffer = "";
          continue;
        }
        buffer += char;
      }
      if (buffer.trim()) selectors.push(buffer.trim());
      return selectors;
    }

    function stripLineComment(text, startIndex) {
      let index = startIndex;
      while (index < text.length && text[index] !== "\n") index += 1;
      return index;
    }

    function tokenizeLess(source) {
      const root = { prelude: "", statements: [], children: [] };
      const stack = [root];
      let buffer = "";
      let quote = "";
      let depth = 0;
      for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1] || "";
        const previous = source[index - 1] || "";
        if (quote) {
          buffer += char;
          if (char === quote && previous !== "\\") quote = "";
          continue;
        }
        if (char === "\"" || char === "'") {
          quote = char;
          buffer += char;
          continue;
        }
        if (char === "/" && next === "/") {
          index = stripLineComment(source, index);
          continue;
        }
        if (char === "/" && next === "*") {
          const commentEnd = source.indexOf("*/", index + 2);
          if (commentEnd < 0) throw new Error("LESS contains an unterminated block comment.");
          index = commentEnd + 1;
          continue;
        }
        if (char === "(" || char === "[") depth += 1;
        if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
        if (char === "{" && depth === 0) {
          const prelude = buffer.trim();
          if (!prelude) throw new Error("LESS contains an empty rule selector.");
          const block = { prelude, statements: [], children: [] };
          stack[stack.length - 1].children.push(block);
          stack.push(block);
          buffer = "";
          continue;
        }
        if (char === "}" && depth === 0) {
          const statement = buffer.trim();
          if (statement) stack[stack.length - 1].statements.push(statement);
          buffer = "";
          if (stack.length === 1) throw new Error("LESS contains an unexpected closing brace.");
          stack.pop();
          continue;
        }
        if (char === ";" && depth === 0) {
          const statement = buffer.trim();
          if (statement) stack[stack.length - 1].statements.push(statement);
          buffer = "";
          continue;
        }
        buffer += char;
      }
      if (quote) throw new Error("LESS contains an unterminated string.");
      if (stack.length !== 1) throw new Error("LESS contains an unclosed rule block.");
      const statement = buffer.trim();
      if (statement) root.statements.push(statement);
      return root;
    }

    function collectVariables(block, variables) {
      block.statements = block.statements.filter((statement) => {
        const match = statement.match(/^@([A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/);
        if (!match) return true;
        variables.set(match[1], match[2].trim());
        return false;
      });
      block.children.forEach((child) => collectVariables(child, variables));
    }

    function substituteVariables(value, variables) {
      return String(value || "").replace(/@([A-Za-z0-9_-]+)/g, (match, name) => (
        variables.has(name) ? variables.get(name) : match
      ));
    }

    function combineSelectors(parentSelectors, childSelectors) {
      const parents = parentSelectors.length ? parentSelectors : [""];
      const combined = [];
      parents.forEach((parent) => {
        childSelectors.forEach((child) => {
          if (child.includes("&")) {
            combined.push(child.replace(/&/g, parent).trim());
          } else {
            combined.push(parent ? `${parent} ${child}` : child);
          }
        });
      });
      return combined;
    }

    function indentLines(text, level) {
      const prefix = "  ".repeat(level);
      return text.split("\n").map((line) => (line ? prefix + line : line)).join("\n");
    }

    function renderDeclarations(selectorText, declarations, level) {
      if (!declarations.length) return "";
      const indent = "  ".repeat(level);
      const bodyIndent = "  ".repeat(level + 1);
      return [
        `${indent}${selectorText} {`,
        ...declarations.map((declaration) => `${bodyIndent}${declaration};`),
        `${indent}}`
      ].join("\n");
    }

    function renderBlock(block, parentSelectors, variables, level, insideAtRule) {
      const prelude = substituteVariables(block.prelude, variables);
      const declarations = block.statements.map((statement) => substituteVariables(statement, variables));
      if (/^@/.test(prelude)) {
        const nested = [
          declarations.map((declaration) => `${"  ".repeat(level + 1)}${declaration};`).join("\n"),
          block.children.map((child) => renderBlock(child, [], variables, level + 1, true)).filter(Boolean).join("\n\n")
        ].filter(Boolean).join("\n");
        return `${"  ".repeat(level)}${prelude} {\n${nested}\n${"  ".repeat(level)}}`;
      }
      const selectors = insideAtRule
        ? splitSelectorList(prelude)
        : combineSelectors(parentSelectors, splitSelectorList(prelude));
      const chunks = [];
      const declarationBlock = renderDeclarations(selectors.join(",\n" + "  ".repeat(level)), declarations, level);
      if (declarationBlock) chunks.push(declarationBlock);
      block.children.forEach((child) => {
        const rendered = renderBlock(child, selectors, variables, level, insideAtRule);
        if (rendered) chunks.push(rendered);
      });
      return chunks.join("\n\n");
    }

    function convertLessToCss(source) {
      const text = String(source || "");
      if (!text.trim()) return "";
      const root = tokenizeLess(text);
      const variables = new Map();
      collectVariables(root, variables);
      const topLevelStatements = root.statements
        .map((statement) => substituteVariables(statement, variables))
        .map((statement) => `${statement};`);
      const blocks = root.children.map((child) => renderBlock(child, [], variables, 0, false)).filter(Boolean);
      return topLevelStatements.concat(blocks).join("\n\n").trimEnd() + "\n";
    }

    const api = { convertLessToCss };
    app?.registerModule?.("lessToCssConverter", api);
    return api;
  }

  global.registerMarkdownViewerLessToCssConverter = registerMarkdownViewerLessToCssConverter;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerLessToCssConverter };
  }
})(typeof window !== "undefined" ? window : globalThis);
