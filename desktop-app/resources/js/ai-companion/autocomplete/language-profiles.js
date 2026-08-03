(function(window) {
  "use strict";

  /**
   * Per-language completion metadata (comment syntax, stop sequences), Continue-inspired
   * AutocompleteLanguageInfo. This is shallow metadata only — no AST/grammar parsing.
   * @returns {{getProfile: function(string): object}} Language profile lookup.
   */
  function createAiCompanionAutocompleteLanguageProfiles() {
    const DEFAULT_PROFILE = { id: "default", lineComment: "", blockComment: null, stopSequences: [], indentUnit: "  " };

    const profiles = {
      javascript: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "  " },
      typescript: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "  " },
      java: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      csharp: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      cpp: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      c: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      go: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "\t" },
      rust: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      swift: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      kotlin: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      scala: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "  " },
      groovy: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      gradle: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      dart: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "  " },
      php: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      objectivec: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      python: { lineComment: "#", blockComment: null, stopSequences: ["\n\n\n", "\ndef ", "\nclass "], indentUnit: "    " },
      ruby: { lineComment: "#", blockComment: ["=begin", "=end"], stopSequences: ["\n\n\n", "\ndef ", "\nend\n"], indentUnit: "  " },
      perl: { lineComment: "#", blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "    " },
      bash: { lineComment: "#", blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "  " },
      powershell: { lineComment: "#", blockComment: ["<#", "#>"], stopSequences: ["\n\n\n"], indentUnit: "    " },
      batch: { lineComment: "REM", blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "  " },
      yaml: { lineComment: "#", blockComment: null, stopSequences: ["\n\n"], indentUnit: "  " },
      toml: { lineComment: "#", blockComment: null, stopSequences: ["\n\n"], indentUnit: "  " },
      properties: { lineComment: "#", blockComment: null, stopSequences: ["\n\n"], indentUnit: "" },
      ini: { lineComment: ";", blockComment: null, stopSequences: ["\n\n"], indentUnit: "" },
      sql: { lineComment: "--", blockComment: ["/*", "*/"], stopSequences: ["\n\n\n", ";\n"], indentUnit: "  " },
      xml: { lineComment: null, blockComment: ["<!--", "-->"], stopSequences: ["\n\n"], indentUnit: "  " },
      html: { lineComment: null, blockComment: ["<!--", "-->"], stopSequences: ["\n\n"], indentUnit: "  " },
      css: { lineComment: null, blockComment: ["/*", "*/"], stopSequences: ["\n\n"], indentUnit: "  " },
      sass: { lineComment: "//", blockComment: ["/*", "*/"], stopSequences: ["\n\n"], indentUnit: "  " },
      json: { lineComment: null, blockComment: null, stopSequences: ["\n\n"], indentUnit: "  " },
      dockerfile: { lineComment: "#", blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "" },
      markdown: { lineComment: null, blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "" },
      text: { lineComment: null, blockComment: null, stopSequences: ["\n\n\n"], indentUnit: "" }
    };

    /**
     * Look up the completion profile for a language registry id.
     * @param {string} languageId Language registry id (e.g. "javascript", "python").
     * @returns {object} Profile with comment syntax, stop sequences, and indent unit.
     */
    function getProfile(languageId) {
      const profile = profiles[String(languageId || "").toLowerCase()];
      return profile ? Object.assign({ id: languageId }, DEFAULT_PROFILE, profile) : Object.assign({}, DEFAULT_PROFILE);
    }

    return { getProfile };
  }

  window.createAiCompanionAutocompleteLanguageProfiles = createAiCompanionAutocompleteLanguageProfiles;
})(window);
