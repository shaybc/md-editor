(function(global) {
  "use strict";

  const KIND_NAMES = Object.freeze({
    1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class", 6: "method",
    7: "property", 8: "field", 9: "constructor", 10: "enum", 11: "interface",
    12: "function", 13: "variable", 14: "constant", 15: "string", 16: "number",
    17: "boolean", 18: "array", 19: "object", 20: "key", 21: "null",
    22: "enum-member", 23: "record", 24: "event", 25: "operator", 26: "type"
  });

  /** Normalize language-server symbols into the node contract rendered by Outline. */
  function registerMarkdownViewerOutlineDocumentSymbols(app) {
    let counter = 0;

    function normalizeSymbol(symbol) {
      const range = symbol?.range || symbol?.location?.range || symbol?.selectionRange || {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 }
      };
      const selectionRange = symbol?.selectionRange || range;
      const kind = KIND_NAMES[Number(symbol?.kind)] || "symbol";
      const name = String(symbol?.name || "");
      const start = selectionRange?.start || range.start;
      return {
        id: `lsp:${counter++}:${kind}:${Number(start?.line) || 0}:${Number(start?.character) || 0}:${name}`,
        name,
        detail: String(symbol?.detail || symbol?.containerName || kind),
        kind,
        range,
        selectionRange,
        children: Array.isArray(symbol?.children) ? symbol.children.map(normalizeSymbol) : []
      };
    }

    function normalize(symbols) {
      counter = 0;
      return (Array.isArray(symbols) ? symbols : []).map(normalizeSymbol);
    }

    const api = { normalize };
    app.registerModule?.("outlineDocumentSymbols", api);
    return api;
  }

  global.registerMarkdownViewerOutlineDocumentSymbols = registerMarkdownViewerOutlineDocumentSymbols;
})(typeof window !== "undefined" ? window : globalThis);
