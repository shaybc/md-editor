(function(window) {
  "use strict";

  /**
   * Build the model-specific request payload for an autocomplete completion, Continue-inspired
   * per-model templating (FIM tokens for infill-trained models vs. an instruct/chat wrapper for
   * general chat models used as autocomplete).
   *
   * NOTE: the current ai-companion autocomplete server mode (ai-companion/modes/autocomplete)
   * always builds its own fixed chat-style prompt from {path, prefix, suffix} and does not yet
   * read the extra fields this module adds (mode/stopSequences/extraContext/fimTemplate). Those
   * fields are included in the request payload so a future server-side update can start using
   * them without another client change, but until that update lands they have no effect on the
   * actual model prompt. This module intentionally only changes what the client sends; it does
   * not touch server code.
   * @returns {{shapeRequest: function(object): object}} Request shaping helpers.
   */
  function createAiCompanionAutocompleteRequestShaper() {
    const FIM_TEMPLATES = {
      starcoder: { prefixToken: "<fim_prefix>", suffixToken: "<fim_suffix>", middleToken: "<fim_middle>" },
      "deepseek-coder": { prefixToken: "<｜fimSbegin｜>", suffixToken: "<｜fimShole｜>", middleToken: "<｜fimSend｜>" },
      codellama: { prefixToken: "<PRE> ", suffixToken: " <SUF>", middleToken: " <MID>" },
      codegemma: { prefixToken: "<|fim_prefix|>", suffixToken: "<|fim_suffix|>", middleToken: "<|fim_middle|>" }
    };

    function detectModelFamily(modelFamilySetting, modelName) {
      const explicit = String(modelFamilySetting || "").toLowerCase().trim();
      if (explicit && explicit !== "auto") return explicit;
      const name = String(modelName || "").toLowerCase();
      if (name.includes("starcoder")) return "starcoder";
      if (name.includes("deepseek")) return "deepseek-coder";
      if (name.includes("codellama") || name.includes("code-llama")) return "codellama";
      if (name.includes("codegemma")) return "codegemma";
      return "instruct";
    }

    function formatExtraContext(extraContext) {
      if (!Array.isArray(extraContext) || !extraContext.length) return "";
      return extraContext
        .map((item) => `// From ${item.path}\n${item.snippet}`)
        .join("\n\n");
    }

    /**
     * Shape the final request payload sent to the completion bridge.
     * @param {object} context Composed autocomplete context (already window-shaped, with an
     *   optional languageProfile and extraContext attached by buildContext).
     * @param {{model?: string, autocompleteModelFamily?: string}} settings AI companion settings.
     * @returns {object} Payload fields to merge into the bridge.autocomplete request.
     */
    function shapeRequest(context, settings) {
      const family = detectModelFamily(settings?.autocompleteModelFamily, settings?.model);
      const stopSequences = context?.languageProfile?.stopSequences || [];
      const extraContextText = formatExtraContext(context?.extraContext);
      const fimTemplate = FIM_TEMPLATES[family] || null;
      return {
        mode: fimTemplate ? "fim" : "instruct",
        modelFamily: family,
        fimTemplate,
        stopSequences,
        extraContext: extraContextText
      };
    }

    return { shapeRequest };
  }

  window.createAiCompanionAutocompleteRequestShaper = createAiCompanionAutocompleteRequestShaper;
})(window);
