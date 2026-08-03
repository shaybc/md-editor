(function(global) {
  "use strict";

  /** Shared pure helpers for converting CodeMirror syntax nodes into Outline nodes. */
  function registerMarkdownViewerOutlineSyntaxTree(app) {
    function getRoot(tree) {
      return tree?.topNode || tree || null;
    }

    function getChildren(node) {
      const children = [];
      for (let child = node?.firstChild || null; child; child = child.nextSibling) children.push(child);
      return children;
    }

    function walk(node, visit) {
      if (!node) return;
      if (visit(node) === false) return;
      getChildren(node).forEach((child) => walk(child, visit));
    }

    function findDescendant(node, predicate) {
      let match = null;
      getChildren(node).some((child) => {
        if (predicate(child)) { match = child; return true; }
        match = findDescendant(child, predicate);
        return !!match;
      });
      return match;
    }

    function createContext(source) {
      const text = String(source || "");
      const lineStarts = [0];
      for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") lineStarts.push(index + 1);

      function positionAt(offset) {
        const target = Math.max(0, Math.min(text.length, Number(offset) || 0));
        let low = 0;
        let high = lineStarts.length - 1;
        while (low <= high) {
          const middle = (low + high) >> 1;
          if (lineStarts[middle] <= target) low = middle + 1;
          else high = middle - 1;
        }
        const line = Math.max(0, high);
        return { line, character: target - lineStarts[line] };
      }

      function nodeText(node) {
        return text.slice(Math.max(0, node?.from || 0), Math.max(0, node?.to || 0));
      }

      function createNode(kind, name, syntaxNode, options = {}) {
        const from = Math.max(0, Number(syntaxNode?.from) || 0);
        const to = Math.max(from, Number(syntaxNode?.to) || from);
        const selectionFrom = Math.max(from, Number(options.selectionFrom) || from);
        const selectionTo = Math.max(selectionFrom, Number(options.selectionTo) || selectionFrom + String(name || "").length);
        const start = positionAt(from);
        return {
          id: `${kind}:${start.line}:${start.character}:${String(name || "")}`,
          name: String(name || ""),
          detail: String(options.detail || ""),
          kind: String(kind || "symbol"),
          range: { start, end: positionAt(to) },
          selectionRange: { start: positionAt(selectionFrom), end: positionAt(Math.min(to, selectionTo)) },
          children: Array.isArray(options.children) ? options.children : []
        };
      }

      function findNameOffset(node, name) {
        const from = Math.max(0, Number(node?.from) || 0);
        const relative = nodeText(node).indexOf(String(name || ""));
        return relative < 0 ? from : from + relative;
      }

      return { createNode, findNameOffset, nodeText, positionAt, source: text };
    }

    function collectDirectMatches(node, predicate) {
      const matches = [];
      getChildren(node).forEach(function visit(child) {
        if (predicate(child)) { matches.push(child); return; }
        getChildren(child).forEach(visit);
      });
      return matches;
    }

    function extractMarkupElements(tree, source) {
      const context = createContext(source);
      const elementNames = new Set(["Element", "SelfClosingElement", "SelfClosingTag"]);
      const isElement = (node) => elementNames.has(String(node?.name || ""));

      function buildElement(node) {
        const raw = context.nodeText(node);
        const tag = /^\s*<\s*([A-Za-z_][\w:.-]*)/.exec(raw)?.[1] || "element";
        const openingTag = raw.slice(0, raw.indexOf(">") + 1);
        const detail = /\s(?:id|name)\s*=\s*["']([^"']+)["']/.exec(openingTag)?.[1] || "element";
        return context.createNode("element", tag, node, {
          detail,
          selectionFrom: context.findNameOffset(node, tag),
          children: collectDirectMatches(node, isElement).map(buildElement)
        });
      }

      return collectDirectMatches(getRoot(tree), isElement).map(buildElement);
    }

    function createLanguageAdapter(config, deps = {}) {
      const languageIds = new Set(config.languageIds || [config.id]);
      return {
        id: config.id,
        label: config.label,
        emptyMessage: config.emptyMessage,
        loadingMessage: `Loading ${config.label} outline…`,
        supports(path, tab) {
          const parsedLanguageId = String(tab?.parseAsLanguageId || "");
          return parsedLanguageId ? languageIds.has(parsedLanguageId) : config.extensions.test(String(path || ""));
        },
        async parse(source) {
          if (typeof config.parseSource === "function") return config.parseSource(source, api);
          const tree = await deps.getSyntaxTree?.();
          return tree ? config.extract(tree, source, api) : [];
        },
        normalizeDocumentSymbols(symbols, source, options) {
          return deps.normalizeDocumentSymbols?.(symbols, source, options) || [];
        }
      };
    }

    const api = { collectDirectMatches, createContext, createLanguageAdapter, extractMarkupElements, findDescendant, getChildren, getRoot, walk };
    app.registerModule?.("outlineSyntaxTree", api);
    return api;
  }

  global.registerMarkdownViewerOutlineSyntaxTree = registerMarkdownViewerOutlineSyntaxTree;
})(typeof window !== "undefined" ? window : globalThis);
