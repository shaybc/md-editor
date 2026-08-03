(function(global) {
  "use strict";

  const SNIPPET_PREFERENCES_VERSION = 1;
  const SUPPORTED_SNIPPET_LANGUAGES = Object.freeze([
    Object.freeze({ id: "javascript", label: "JavaScript" }),
    Object.freeze({ id: "typescript", label: "TypeScript" }),
    Object.freeze({ id: "java", label: "Java" }),
    Object.freeze({ id: "python", label: "Python" }),
    Object.freeze({ id: "csharp", label: "C#" })
  ]);
  const SUPPORTED_LANGUAGE_IDS = new Set(SUPPORTED_SNIPPET_LANGUAGES.map((language) => language.id));
  const JAVASCRIPT_SNIPPETS = Object.freeze([
    Object.freeze({ id: "function-definition", label: "function", detail: "definition", type: "keyword", template: "function ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (let ${index} = 0; ${index} < ${bound}; ${index}++) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-of-loop", label: "for", detail: "of loop", type: "keyword", template: "for (let ${name} of ${collection}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "do-loop", label: "do", detail: "loop", type: "keyword", template: "do {\n\t${}\n} while (${})", enabled: true }),
    Object.freeze({ id: "while-loop", label: "while", detail: "loop", type: "keyword", template: "while (${}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try {\n\t${}\n} catch (${error}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-else-block", label: "if", detail: "/ else block", type: "keyword", template: "if (${}) {\n\t${}\n} else {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "class ${name} {\n\tconstructor(${params}) {\n\t\t${}\n\t}\n}", enabled: true }),
    Object.freeze({ id: "import-named", label: "import", detail: "named", type: "keyword", template: "import {${names}} from \"${module}\"\n${}", enabled: true }),
    Object.freeze({ id: "import-default", label: "import", detail: "default", type: "keyword", template: "import ${name} from \"${module}\"\n${}", enabled: true }),
    Object.freeze({ id: "node-require", label: "require", detail: "Node.js import", type: "function", template: "const ${name} = require(\"${module}\");\n${}", enabled: true }),
    Object.freeze({ id: "node-module-exports", label: "module.exports", detail: "Node.js export", type: "keyword", template: "module.exports = ${value};", enabled: true }),
    Object.freeze({ id: "node-async-function", label: "async function", detail: "Node.js", type: "function", template: "async function ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "node-fs-read-file", label: "fs.readFile", detail: "Node.js", type: "function", template: "const fs = require(\"fs/promises\");\n\nconst ${name} = await fs.readFile(${path}, \"utf8\");\n${}", enabled: true }),
    Object.freeze({ id: "node-process-env", label: "process.env", detail: "Node.js", type: "variable", template: "process.env.${NAME}", enabled: true }),
    Object.freeze({ id: "node-express-route", label: "express route", detail: "Node.js", type: "function", template: "app.${method}(\"${route}\", async (req, res) => {\n\t${}\n});", enabled: true })
  ]);
  const TYPESCRIPT_SNIPPETS = Object.freeze(JAVASCRIPT_SNIPPETS.concat([
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "interface ${name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "type-definition", label: "type", detail: "definition", type: "keyword", template: "type ${name} = ${type}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "enum ${name} {\n\t${}\n}", enabled: true })
  ]));
  const JAVA_SNIPPETS = Object.freeze([
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "public class ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "main-method", label: "main", detail: "method", type: "function", template: "public static void main(String[] args) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "public interface ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "public enum ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (int ${index} = 0; ${index} < ${bound}; ${index}++) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-each-loop", label: "for", detail: "each loop", type: "keyword", template: "for (${Type} ${item} : ${collection}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${condition}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try {\n\t${}\n} catch (${Exception} ${error}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "public-method", label: "public method", detail: "method", type: "function", template: "public ${ReturnType} ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "private-method", label: "private method", detail: "method", type: "function", template: "private ${ReturnType} ${name}(${params}) {\n\t${}\n}", enabled: true })
  ]);
  const PYTHON_SNIPPETS = Object.freeze([
    Object.freeze({ id: "function-definition", label: "def", detail: "function", type: "function", template: "def ${name}(${params}):\n\t${}", enabled: true }),
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "class ${Name}:\n\tdef __init__(self, ${params}):\n\t\t${}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if ${condition}:\n\t${}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for ${item} in ${collection}:\n\t${}", enabled: true }),
    Object.freeze({ id: "while-loop", label: "while", detail: "loop", type: "keyword", template: "while ${condition}:\n\t${}", enabled: true }),
    Object.freeze({ id: "try-except", label: "try", detail: "/ except block", type: "keyword", template: "try:\n\t${}\nexcept ${Exception} as ${error}:\n\t${}", enabled: true }),
    Object.freeze({ id: "with-block", label: "with", detail: "block", type: "keyword", template: "with ${expression} as ${name}:\n\t${}", enabled: true }),
    Object.freeze({ id: "main-guard", label: "main guard", detail: "entry point", type: "keyword", template: "if __name__ == \"__main__\":\n\t${}", enabled: true })
  ]);
  const CSHARP_SNIPPETS = Object.freeze([
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "public class ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "main-method", label: "main", detail: "method", type: "function", template: "public static void Main(string[] args)\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "public interface ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "public enum ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (int ${index} = 0; ${index} < ${bound}; ${index}++)\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-each-loop", label: "foreach", detail: "loop", type: "keyword", template: "foreach (${Type} ${item} in ${collection})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${condition})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try\n{\n\t${}\n}\ncatch (${Exception} ${error})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "public-method", label: "public method", detail: "method", type: "function", template: "public ${ReturnType} ${Name}(${params})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "private-method", label: "private method", detail: "method", type: "function", template: "private ${ReturnType} ${Name}(${params})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "property", label: "property", detail: "definition", type: "property", template: "public ${Type} ${Name} { get; set; }", enabled: true })
  ]);
  const DEFAULT_SNIPPETS_BY_LANGUAGE = Object.freeze({
    javascript: JAVASCRIPT_SNIPPETS,
    typescript: TYPESCRIPT_SNIPPETS,
    java: JAVA_SNIPPETS,
    python: PYTHON_SNIPPETS,
    csharp: CSHARP_SNIPPETS
  });

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isSupportedLanguage(languageId) {
    return SUPPORTED_LANGUAGE_IDS.has(String(languageId || ""));
  }

  function cloneSnippet(snippet, source) {
    return {
      id: String(snippet.id || "").trim(),
      label: String(snippet.label || "").trim(),
      detail: String(snippet.detail || "").trim(),
      type: String(snippet.type || "keyword").trim() || "keyword",
      template: String(snippet.template || ""),
      enabled: snippet.enabled !== false,
      source: source || snippet.source || "builtin"
    };
  }

  function normalizeSnippetDefinition(snippet, fallbackId) {
    const id = String(snippet?.id || fallbackId || "").trim();
    const label = String(snippet?.label || "").trim();
    const template = String(snippet?.template || "");
    if (!id) return null;
    return {
      id,
      label,
      detail: String(snippet?.detail || "").trim(),
      type: String(snippet?.type || "keyword").trim() || "keyword",
      template,
      enabled: snippet?.enabled !== false
    };
  }

  function normalizeSnippetPreferences(preferences) {
    const source = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    const overrides = {};
    const custom = {};
    SUPPORTED_SNIPPET_LANGUAGES.forEach((language) => {
      const languageOverrides = source.overrides?.[language.id];
      overrides[language.id] = {};
      if (languageOverrides && typeof languageOverrides === "object" && !Array.isArray(languageOverrides)) {
        Object.entries(languageOverrides).forEach(([snippetId, snippet]) => {
          const normalized = normalizeSnippetDefinition(snippet, snippetId);
          if (normalized) overrides[language.id][normalized.id] = normalized;
        });
      }
      const languageCustom = Array.isArray(source.custom?.[language.id]) ? source.custom[language.id] : [];
      custom[language.id] = languageCustom
        .map((snippet) => normalizeSnippetDefinition(snippet))
        .filter(Boolean);
    });
    return { version: SNIPPET_PREFERENCES_VERSION, overrides, custom };
  }

  function cloneSnippetPreferences(preferences) {
    return normalizeSnippetPreferences(cloneJson(normalizeSnippetPreferences(preferences)));
  }

  function getDefaultSnippets(languageId) {
    return (DEFAULT_SNIPPETS_BY_LANGUAGE[languageId] || []).map((snippet) => cloneSnippet(snippet, "builtin"));
  }

  function getSnippetRows(languageId, preferences) {
    if (!isSupportedLanguage(languageId)) return [];
    const normalizedPreferences = normalizeSnippetPreferences(preferences);
    const overrides = normalizedPreferences.overrides[languageId] || {};
    const builtins = getDefaultSnippets(languageId).map((snippet) => {
      const override = overrides[snippet.id];
      return {
        ...snippet,
        ...(override ? cloneSnippet(override, "builtin") : {}),
        id: snippet.id,
        source: "builtin",
        hasOverride: !!override
      };
    });
    const customSnippets = (normalizedPreferences.custom[languageId] || []).map((snippet) => ({
      ...cloneSnippet(snippet, "custom"),
      source: "custom",
      hasOverride: false
    }));
    return builtins.concat(customSnippets);
  }

  function getCompletionSnippets(languageId, preferences) {
    return getSnippetRows(languageId, preferences)
      .filter((snippet) => snippet.enabled !== false && snippet.label && snippet.template)
      .map((snippet) => ({
        id: snippet.id,
        label: snippet.label,
        detail: snippet.detail,
        type: snippet.type || "keyword",
        template: snippet.template
      }));
  }

  function generateCustomSnippetId() {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `custom-${Date.now()}-${randomSuffix}`;
  }

  function createCustomSnippet() {
    return {
      id: generateCustomSnippetId(),
      label: "newSnippet",
      detail: "custom",
      type: "keyword",
      template: "${}",
      enabled: true
    };
  }

  function saveSnippet(preferences, languageId, snippet) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (!isSupportedLanguage(languageId)) return nextPreferences;
    const normalized = normalizeSnippetDefinition(snippet);
    if (!normalized) return nextPreferences;
    const isBuiltin = getDefaultSnippets(languageId).some((defaultSnippet) => defaultSnippet.id === normalized.id);
    if (isBuiltin) {
      nextPreferences.overrides[languageId][normalized.id] = normalized;
      return nextPreferences;
    }
    const snippets = nextPreferences.custom[languageId] || [];
    const existingIndex = snippets.findIndex((customSnippet) => customSnippet.id === normalized.id);
    if (existingIndex >= 0) snippets[existingIndex] = normalized;
    else snippets.push(normalized);
    nextPreferences.custom[languageId] = snippets;
    return nextPreferences;
  }

  function resetBuiltinSnippet(preferences, languageId, snippetId) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (isSupportedLanguage(languageId) && nextPreferences.overrides[languageId]) {
      delete nextPreferences.overrides[languageId][snippetId];
    }
    return nextPreferences;
  }

  function deleteCustomSnippet(preferences, languageId, snippetId) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (isSupportedLanguage(languageId)) {
      nextPreferences.custom[languageId] = (nextPreferences.custom[languageId] || []).filter((snippet) => snippet.id !== snippetId);
    }
    return nextPreferences;
  }

  function registerMarkdownViewerSnippetRegistry(app) {
    const api = {
      version: SNIPPET_PREFERENCES_VERSION,
      getSupportedLanguages: function() { return cloneJson(SUPPORTED_SNIPPET_LANGUAGES); },
      getDefaultSnippets,
      getSnippetRows,
      getCompletionSnippets,
      normalizeSnippetPreferences,
      cloneSnippetPreferences,
      createCustomSnippet,
      saveSnippet,
      resetBuiltinSnippet,
      deleteCustomSnippet
    };
    if (app?.services) app.services.snippetRegistry = api;
    app?.registerModule?.("snippetRegistry", api);
    return api;
  }

  registerMarkdownViewerSnippetRegistry._test = {
    getSupportedLanguages: function() { return cloneJson(SUPPORTED_SNIPPET_LANGUAGES); },
    getCompletionSnippets,
    getDefaultSnippets,
    getSnippetRows,
    normalizeSnippetPreferences,
    createCustomSnippet,
    saveSnippet,
    resetBuiltinSnippet,
    deleteCustomSnippet
  };

  global.registerMarkdownViewerSnippetRegistry = registerMarkdownViewerSnippetRegistry;
})(typeof window !== "undefined" ? window : globalThis);
