// Text escape and unescape transformations for the DevToys-style Text Escape / Unescape tool.
(function(root) {
  "use strict";

  function escapeText(text) {
    return JSON.stringify(String(text || "")).slice(1, -1);
  }

  function escapeRawQuotesForJsonString(text) {
    return String(text || "").replace(/"+/g, function(match, offset, value) {
      let slashCount = 0;
      for (let index = offset - 1; index >= 0 && value[index] === "\\"; index -= 1) {
        slashCount += 1;
      }
      return slashCount % 2 === 0 ? match.replace(/"/g, '\\"') : match;
    });
  }

  function unescapeText(text) {
    try {
      return JSON.parse(`"${escapeRawQuotesForJsonString(text)}"`);
    } catch (error) {
      throw new Error("Invalid escaped text.");
    }
  }

  function convertText(text, options = {}) {
    return options.mode === "unescape" ? unescapeText(text) : escapeText(text);
  }

  function registerMarkdownViewerTextEscapeCodec(app) {
    const api = { escapeText, unescapeText, convertText };
    app?.registerModule?.("textEscapeCodec", api);
    return api;
  }

  root.registerMarkdownViewerTextEscapeCodec = registerMarkdownViewerTextEscapeCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeText, unescapeText, convertText, registerMarkdownViewerTextEscapeCodec };
  }
})(typeof window !== "undefined" ? window : globalThis);
