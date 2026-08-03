(function(window) {
  "use strict";

  /**
   * Store autocomplete results and pending requests by editor context.
   * @param {{limit?: number}=} options Cache configuration.
   * @returns {object} Cache helpers for context-key based completion reuse.
   */
  function createAiCompanionAutocompleteSuggestionCache(options) {
    const limit = Math.max(1, options?.limit || 50);
    const completions = new Map();
    const pending = new Set();

    function hashText(value) {
      let hash = 0;
      const text = String(value || "");
      for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
      }
      return String(hash);
    }

    function createContextKey(context) {
      const prefixTail = String(context.prefix || "").slice(-1200);
      const suffixHead = String(context.suffix || "").slice(0, 600);
      return [
        context.path || "",
        context.position || 0,
        hashText(prefixTail),
        hashText(suffixHead)
      ].join(":");
    }

    function remember(key, completion) {
      if (!key || !completion) return;
      completions.delete(key);
      completions.set(key, completion);
      while (completions.size > limit) {
        completions.delete(completions.keys().next().value);
      }
    }

    function recall(key) {
      if (!completions.has(key)) return "";
      const completion = completions.get(key);
      completions.delete(key);
      completions.set(key, completion);
      return completion;
    }

    return {
      createContextKey,
      recall,
      remember,
      isPending: (key) => pending.has(key),
      markPending: (key) => pending.add(key),
      clearPending: (key) => pending.delete(key)
    };
  }

  window.createAiCompanionAutocompleteSuggestionCache = createAiCompanionAutocompleteSuggestionCache;
})(window);
