// Helm, Go template, and Sprig authoring metadata for completions and hovers.
(function(global) {
  "use strict";

  function registerMarkdownViewerHelmAuthoringDocs(app) {
    const FUNCTIONS = Object.freeze({
      include: { detail: "Helm template", signature: "include \"template.name\" .", description: "Render a named template with the supplied context." },
      tpl: { detail: "Helm template", signature: "tpl VALUE .", description: "Evaluate a string as a template using the supplied context." },
      toYaml: { detail: "Helm function", signature: "toYaml VALUE", description: "Convert a value to indented YAML text." },
      indent: { detail: "Helm function", signature: "indent WIDTH TEXT", description: "Indent every line by the requested number of spaces." },
      nindent: { detail: "Helm function", signature: "nindent WIDTH TEXT", description: "Add a leading newline and indent every line by the requested number of spaces." },
      default: { detail: "Sprig function", signature: "default DEFAULT VALUE", description: "Return the default value when the supplied value is empty." },
      required: { detail: "Helm function", signature: "required MESSAGE VALUE", description: "Fail template rendering when a required value is empty." },
      quote: { detail: "Sprig function", signature: "quote VALUE", description: "Wrap the value in double quotes." },
      printf: { detail: "Go template", signature: "printf FORMAT VALUE...", description: "Format values using Go printf formatting." },
      lookup: { detail: "Helm function", signature: "lookup API_VERSION KIND NAMESPACE NAME", description: "Look up a Kubernetes resource while rendering." },
      fail: { detail: "Sprig function", signature: "fail MESSAGE", description: "Stop template rendering with the supplied message." },
      dict: { detail: "Sprig function", signature: "dict KEY VALUE...", description: "Build a dictionary from key/value pairs." },
      list: { detail: "Sprig function", signature: "list VALUE...", description: "Build a list from the supplied values." },
      sha256sum: { detail: "Sprig function", signature: "sha256sum VALUE", description: "Return the SHA-256 hash of a value." },
      b64enc: { detail: "Sprig function", signature: "b64enc VALUE", description: "Base64 encode a value." },
      b64dec: { detail: "Sprig function", signature: "b64dec VALUE", description: "Base64 decode a value." },
      trim: { detail: "Sprig function", signature: "trim VALUE", description: "Remove leading and trailing whitespace." },
      upper: { detail: "Sprig function", signature: "upper VALUE", description: "Convert a string to uppercase." },
      lower: { detail: "Sprig function", signature: "lower VALUE", description: "Convert a string to lowercase." }
    });

    function getFunctionHover(functionName) {
      const entry = FUNCTIONS[String(functionName || "").trim()];
      if (!entry) return null;
      return `${entry.signature}\n\n${entry.description}`;
    }

    function getFunctionCompletionItems() {
      return Object.entries(FUNCTIONS).map(([label, entry]) => ({
        label,
        type: "function",
        detail: entry.detail,
        origin: "Language",
        info: getFunctionHover(label)
      }));
    }

    function getTemplateHover(context = {}) {
      const token = String(context.functionName || context.word || context.selectedText || "").replace(/[^A-Za-z0-9_]/g, "");
      return getFunctionHover(token);
    }

    const api = { getFunctionCompletionItems, getFunctionHover, getTemplateHover };
    app?.registerModule?.("helmAuthoringDocs", api);
    return api;
  }

  global.registerMarkdownViewerHelmAuthoringDocs = registerMarkdownViewerHelmAuthoringDocs;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerHelmAuthoringDocs };
  }
})(typeof window !== "undefined" ? window : globalThis);
