(function(window) {
  "use strict";

  /**
   * Classify CodeMirror updates into autocomplete request decisions.
   * @returns {{classify: function(object): object}} Pure classifier helpers.
   */
  function createAiCompanionAutocompleteChangeClassifier() {
    function hasUserEvent(update, eventName) {
      return Array.from(update.transactions || []).some((transaction) =>
        typeof transaction.isUserEvent === "function" && transaction.isUserEvent(eventName)
      );
    }

    function getChangedCharacterCount(update) {
      let changedCharacters = 0;
      if (update.changes?.iterChanges) {
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          changedCharacters += Math.max(inserted?.length || 0, Math.max(0, toA - fromA), Math.max(0, toB - fromB));
        });
        return changedCharacters;
      }
      return update.docChanged ? Math.max(1, String(update.changes || "").length) : 0;
    }

    function classify(update) {
      if (!update?.docChanged) {
        return { kind: "non-document", shouldHide: false, shouldRequest: false, changedCharacters: 0 };
      }

      const changedCharacters = getChangedCharacterCount(update);
      const isTypedInput = hasUserEvent(update, "input.type");
      const isPaste = hasUserEvent(update, "input.paste");
      const isDelete = hasUserEvent(update, "delete");
      const isUndo = hasUserEvent(update, "undo");
      const isRedo = hasUserEvent(update, "redo");
      const isCompletionAccept = hasUserEvent(update, "input.complete");

      if (isTypedInput) {
        return { kind: "typed-input", shouldHide: true, shouldRequest: changedCharacters > 0, changedCharacters };
      }
      if (isPaste) {
        return { kind: "paste", shouldHide: true, shouldRequest: false, changedCharacters };
      }
      if (isDelete) {
        return { kind: "delete", shouldHide: true, shouldRequest: false, changedCharacters };
      }
      if (isUndo || isRedo) {
        return { kind: isUndo ? "undo" : "redo", shouldHide: true, shouldRequest: false, changedCharacters };
      }
      if (isCompletionAccept) {
        return { kind: "completion-accept", shouldHide: true, shouldRequest: false, changedCharacters };
      }
      return { kind: "programmatic-change", shouldHide: true, shouldRequest: false, changedCharacters };
    }

    return { classify };
  }

  window.createAiCompanionAutocompleteChangeClassifier = createAiCompanionAutocompleteChangeClassifier;
})(window);
