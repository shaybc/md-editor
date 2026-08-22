(function(root) {
  "use strict";

  const DEFAULT_INDENT = 2;

  function getYamlLibrary(explicitLibrary) {
    const yamlLibrary = explicitLibrary || root.jsyaml || root.jsYaml || root.YAML || null;
    if (!yamlLibrary || typeof yamlLibrary.load !== "function" || typeof yamlLibrary.dump !== "function") {
      throw new Error("YAML converter is unavailable.");
    }
    return yamlLibrary;
  }

  function normalizeIndent(indent) {
    const value = Number(indent);
    return value === 4 ? 4 : DEFAULT_INDENT;
  }

  function parseJson(input) {
    try {
      return JSON.parse(String(input || ""));
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }

  function parseYaml(input, yamlLibrary) {
    try {
      return getYamlLibrary(yamlLibrary).load(String(input || ""));
    } catch (error) {
      throw new Error(`Invalid YAML: ${error.message}`);
    }
  }

  function convertJsonToYaml(input, options = {}) {
    const yamlLibrary = getYamlLibrary(options.yamlLibrary);
    const parsed = parseJson(input);
    return yamlLibrary.dump(parsed, {
      indent: normalizeIndent(options.indent),
      noRefs: true,
      lineWidth: -1,
      sortKeys: false
    });
  }

  function convertYamlToJson(input, options = {}) {
    const parsed = parseYaml(input, options.yamlLibrary);
    return JSON.stringify(parsed ?? null, null, normalizeIndent(options.indent));
  }

  function convert(input, options = {}) {
    const mode = options.mode === "json-to-yaml" ? "json-to-yaml" : "yaml-to-json";
    return mode === "json-to-yaml"
      ? convertJsonToYaml(input, options)
      : convertYamlToJson(input, options);
  }

  root.registerMarkdownViewerJsonYamlCodec = function registerMarkdownViewerJsonYamlCodec(app, deps = {}) {
    const yamlLibrary = deps.yamlLibrary || root.jsyaml || root.jsYaml || root.YAML || null;
    const api = {
      convert,
      convertJsonToYaml: (input, options = {}) => convertJsonToYaml(input, { ...options, yamlLibrary }),
      convertYamlToJson: (input, options = {}) => convertYamlToJson(input, { ...options, yamlLibrary })
    };
    app?.registerModule?.("jsonYamlCodec", api);
    return api;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { convert, convertJsonToYaml, convertYamlToJson, getYamlLibrary, normalizeIndent };
  }
})(typeof window !== "undefined" ? window : globalThis);