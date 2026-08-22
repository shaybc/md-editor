(function(global) {
  "use strict";

  function registerMarkdownViewerXmlOutlineLanguage(app, deps = {}) {
    const syntax = deps.syntaxTree;

    function getAttributeValue(text, name) {
      const pattern = new RegExp("\\s" + name + "\\s*=\\s*([\"'])(.*?)\\1", "i");
      return pattern.exec(text)?.[2] || "";
    }

    function createSourceOutline(source, helpers = syntax) {
      const text = String(source || "");
      const context = helpers.createContext(text);
      const roots = [];
      const stack = [];
      const matcher = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?\s*([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?\s*>/g;
      let match;
      while ((match = matcher.exec(text))) {
        const raw = match[0];
        const tag = match[1] || "";
        if (!tag || raw.startsWith("<!--") || raw.startsWith("<!") || raw.startsWith("<?")) continue;
        const isClosing = /^<\s*\//.test(raw);
        const isSelfClosing = /\/\s*>$/.test(raw);
        if (isClosing) {
          for (let index = stack.length - 1; index >= 0; index -= 1) {
            if (stack[index].name === tag) {
              stack[index].to = matcher.lastIndex;
              stack.length = index;
              break;
            }
          }
          continue;
        }
        const nameOffset = match.index + raw.indexOf(tag);
        const parent = stack[stack.length - 1] || null;
        const record = {
          name: tag,
          from: match.index,
          to: isSelfClosing ? matcher.lastIndex : text.length,
          selectionFrom: nameOffset,
          selectionTo: nameOffset + tag.length,
          detail: getAttributeValue(raw, "id") || getAttributeValue(raw, "name") || parent?.name || "element",
          children: []
        };
        if (parent) parent.children.push(record);
        else roots.push(record);
        if (!isSelfClosing) stack.push(record);
      }

      function toOutlineNode(record) {
        return context.createNode("element", record.name, { from: record.from, to: record.to }, {
          detail: record.detail,
          selectionFrom: record.selectionFrom,
          selectionTo: record.selectionTo,
          children: record.children.map(toOutlineNode)
        });
      }

      return roots.map(toOutlineNode);
    }

    function positionValue(position) {
      return ((Number(position?.line) || 0) * 1000000) + (Number(position?.character) || 0);
    }

    function rangeContains(parent, child) {
      const parentStart = positionValue(parent?.range?.start);
      const parentEnd = positionValue(parent?.range?.end);
      const childStart = positionValue(child?.range?.start);
      const childEnd = positionValue(child?.range?.end);
      return parentStart <= childStart && childEnd <= parentEnd && (parentStart < childStart || childEnd < parentEnd);
    }

    function rangeLength(node) {
      return positionValue(node?.range?.end) - positionValue(node?.range?.start);
    }

    function flattenNodes(nodes, target = []) {
      (Array.isArray(nodes) ? nodes : []).forEach(function(node) {
        target.push({ ...node, kind: "element", children: [] });
        flattenNodes(node.children, target);
      });
      return target;
    }

    function nestNodesByRange(nodes) {
      const flat = flattenNodes(nodes).sort(function(left, right) {
        const startDelta = positionValue(left?.range?.start) - positionValue(right?.range?.start);
        return startDelta || rangeLength(right) - rangeLength(left);
      });
      const roots = [];
      const stack = [];
      flat.forEach(function(node) {
        while (stack.length && !rangeContains(stack[stack.length - 1], node)) stack.pop();
        if (stack.length) stack[stack.length - 1].children.push(node);
        else roots.push(node);
        stack.push(node);
      });
      return roots;
    }

    const api = syntax.createLanguageAdapter({
      id: "xml",
      label: "XML",
      languageIds: ["xml", "maven"],
      extensions: /\.(?:xml|xsd|xsl|xslt|svg|pom)$/i,
      emptyMessage: "No XML elements found.",
      parseSource(source, helpers = syntax) { return createSourceOutline(source, helpers); },
      extract(tree, source, helpers = syntax) { return createSourceOutline(source, helpers); }
    }, deps);
    const baseNormalizeDocumentSymbols = api.normalizeDocumentSymbols;
    api.normalizeDocumentSymbols = function(symbols, source, options) {
      const sourceNodes = createSourceOutline(source, syntax);
      if (sourceNodes.length) return sourceNodes;
      return nestNodesByRange(baseNormalizeDocumentSymbols(symbols, source, options));
    };
    api._test = { createSourceOutline, nestNodesByRange };
    app.registerModule?.("xmlOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerXmlOutlineLanguage = registerMarkdownViewerXmlOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);