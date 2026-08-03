(function(window) {
  "use strict";

  /**
   * Shape raw prefix/suffix text into line-bounded windows for autocomplete context.
   * Continue-inspired: always include file content around the cursor, but trim to a
   * budget on whole-line boundaries instead of an arbitrary character slice so context
   * doesn't get cut mid-token.
   * @param {{prefixLines?: number, suffixLines?: number}=} options Line budgets.
   * @returns {{shapeWindow: function(object): object}} Window shaping helpers.
   */
  function createAiCompanionAutocompleteContextWindow(options) {
    const prefixLineBudget = Math.max(1, options?.prefixLines || 60);
    const suffixLineBudget = Math.max(1, options?.suffixLines || 20);

    function takeLastLines(text, lineBudget) {
      const lines = String(text || "").split(/\r?\n/);
      if (lines.length <= lineBudget) return text;
      return lines.slice(lines.length - lineBudget).join("\n");
    }

    function takeFirstLines(text, lineBudget) {
      const lines = String(text || "").split(/\r?\n/);
      if (lines.length <= lineBudget) return text;
      return lines.slice(0, lineBudget).join("\n");
    }

    /**
     * Shape a context's prefix/suffix to the configured line budgets.
     * @param {{prefix: string, suffix: string}} context Raw context with full-document prefix/suffix.
     * @returns {{prefix: string, suffix: string}} Shaped prefix/suffix.
     */
    function shapeWindow(context) {
      return {
        prefix: takeLastLines(context?.prefix || "", prefixLineBudget),
        suffix: takeFirstLines(context?.suffix || "", suffixLineBudget)
      };
    }

    /**
     * Read only the configured context window around a CodeMirror cursor.
     * @param {object} documentText CodeMirror Text document.
     * @param {number} position Cursor offset within the document.
     * @returns {{prefix: string, suffix: string}} Bounded context surrounding the cursor.
     */
    function shapeDocumentWindow(documentText, position) {
      const cursorLine = documentText.lineAt(position);
      const prefixStartLine = Math.max(1, cursorLine.number - prefixLineBudget + 1);
      const suffixEndLine = Math.min(documentText.lines, cursorLine.number + suffixLineBudget - 1);
      return {
        prefix: documentText.sliceString(documentText.line(prefixStartLine).from, position),
        suffix: documentText.sliceString(position, documentText.line(suffixEndLine).to)
      };
    }

    return { shapeWindow, shapeDocumentWindow };
  }

  window.createAiCompanionAutocompleteContextWindow = createAiCompanionAutocompleteContextWindow;
})(window);
