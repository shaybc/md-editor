(function(window, document) {
  "use strict";

  /**
   * Compose the md-editor AI autocomplete controller from replaceable autocomplete modules.
   * @param {object} app md-editor application module registry.
   * @param {object} deps AI companion dependencies provided by script startup. Phase 2 adds one
   *   optional collaborator: `getOpenDocuments()` — returns `{path, content}` for other
   *   currently-open tabs, used by the recent-files context provider. Everything else about the
   *   adapter contract (`attachEditor` / `handleEditorUpdate` / `hideSuggestion`) is unchanged.
   * @returns {object} Public autocomplete controller API.
   */
  function createAiCompanionAutocompleteController(app, deps) {
    const classifier = window.createAiCompanionAutocompleteChangeClassifier();
    const scopeClassifier = window.createAiCompanionAutocompleteScopeClassifier();
    const cache = window.createAiCompanionAutocompleteSuggestionCache({ limit: 50 });
    const postprocessor = window.createAiCompanionAutocompletePostprocessor();
    const languageProfiles = window.createAiCompanionAutocompleteLanguageProfiles();
    const suggestionHistory = window.createAiCompanionAutocompleteSuggestionHistory({ limit: 20 });
    const telemetry = window.createAiCompanionAutocompleteTelemetry({ history: suggestionHistory });
    const recentFilesProvider = window.createAiCompanionAutocompleteRecentFilesProvider({
      getOpenDocuments: deps.getOpenDocuments
    });
    const requestShaper = window.createAiCompanionAutocompleteRequestShaper();
    let activeSuggestion = null;

    function setPanelStatus(status) {
      app.modules?.aiCompanionPanel?.setStatus?.(status);
    }

    function resolveLanguageId(path, doc) {
      return app.modules?.languageRegistry?.resolveLanguageForPath?.(path, { content: doc })?.id || "";
    }

    function buildContext(editor) {
      const view = editor.getView();
      const position = view.state.selection.main.head;
      const settings = deps.getSettings();
      const path = deps.getActiveEditorPath?.() || "";
      const contextWindow = window.createAiCompanionAutocompleteContextWindow({
        prefixLines: settings.autocompletePrefixLines,
        suffixLines: settings.autocompleteSuffixLines
      });
      const shapedWindow = contextWindow.shapeDocumentWindow(view.state.doc, position);
      const languageProfile = languageProfiles.getProfile(resolveLanguageId(path, shapedWindow.prefix + shapedWindow.suffix));
      const context = {
        editor,
        view,
        position,
        path,
        prefix: shapedWindow.prefix,
        suffix: shapedWindow.suffix,
        settings,
        workspaceRoot: deps.getWorkspaceRoot?.() || "",
        languageProfile,
        extraContext: []
      };
      if (settings.autocompleteContextProvidersEnabled) {
        context.extraContext = recentFilesProvider.collect(context);
      }
      // Classified after extraContext so scope detection always runs against the same
      // shaped prefix/suffix the request itself will use. Consumed by request-policy (to
      // decide whether this scope is enabled and how long to debounce) and by
      // requestShaping (to tell the server which prompt/budget to use).
      context.scope = scopeClassifier.classifyScope(context);
      return context;
    }

    function clearVisibleSuggestion() {
      activeSuggestion = null;
      overlay.hide();
    }

    function acceptSuggestion() {
      if (!activeSuggestion) return false;
      const suggestion = activeSuggestion;
      suggestion.editor.replaceRange(suggestion.position, suggestion.position, suggestion.completion);
      policy.noteAccepted();
      telemetry.recordAccepted({
        contextKey: suggestion.contextKey,
        path: suggestion.path,
        position: suggestion.position,
        language: suggestion.languageProfile?.id
      });
      clearVisibleSuggestion();
      return true;
    }

    function rejectSuggestion() {
      if (!activeSuggestion) return false;
      const suggestion = activeSuggestion;
      policy.noteRejected();
      telemetry.recordRejected({
        contextKey: suggestion.contextKey,
        path: suggestion.path,
        position: suggestion.position,
        language: suggestion.languageProfile?.id
      });
      clearVisibleSuggestion();
      return true;
    }

    const overlay = window.createAiCompanionAutocompleteGhostOverlay({
      onAccept: acceptSuggestion,
      onReject: rejectSuggestion
    });

    const policy = window.createAiCompanionAutocompleteRequestPolicy({
      cache,
      history: suggestionHistory,
      telemetry,
      getSettings: deps.getSettings,
      hideSuggestion: clearVisibleSuggestion,
      postprocessCompletion: postprocessor.postprocessCompletion,
      shapeRequest: requestShaper.shapeRequest,
      requestCompletion: (context) => deps.bridge.autocomplete({
        path: context.path,
        prefix: context.prefix,
        suffix: context.suffix,
        settings: context.settings,
        workspaceRoot: context.workspaceRoot,
        scope: context.scope,
        mode: context.requestShaping?.mode,
        modelFamily: context.requestShaping?.modelFamily,
        fimTemplate: context.requestShaping?.fimTemplate,
        stopSequences: context.requestShaping?.stopSequences,
        extraContext: context.requestShaping?.extraContext
      }),
      setStatus: setPanelStatus,
      showSuggestion: function(suggestion) {
        activeSuggestion = suggestion;
        overlay.show(suggestion.view, suggestion);
      }
    });

    function hideSuggestion() {
      policy.cancelPending();
      clearVisibleSuggestion();
    }

    /**
     * Manual override for when the automatic debounce/suppression heuristics decide not to
     * fire (or the user doesn't want to wait one out): ask for a suggestion right now,
     * bypassing both. Bound to Alt+\ below, matching the shortcut convention used by other
     * inline-completion tools so it doesn't need to be learned from scratch.
     */
    function requestSuggestionNow(editor) {
      policy.requestNow(buildContext(editor));
    }

    function attachEditor(editor) {
      const view = editor.getView();
      const onScroll = function() {
        if (activeSuggestion?.view === view) overlay.reposition(view, activeSuggestion);
      };
      const onKeydown = function(event) {
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === "\\") {
          event.preventDefault();
          requestSuggestionNow(editor);
          return;
        }
        if (!activeSuggestion) return;
        if (event.key === "Tab") {
          event.preventDefault();
          acceptSuggestion();
        } else if (event.key === "Escape") {
          event.preventDefault();
          rejectSuggestion();
        }
      };
      view.dom.addEventListener("keydown", onKeydown, true);
      view.scrollDOM.addEventListener("scroll", onScroll);
      window.addEventListener("resize", onScroll);
      return function detach() {
        view.dom.removeEventListener("keydown", onKeydown, true);
        view.scrollDOM.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }

    function handleEditorUpdate(editor, update) {
      const change = classifier.classify(update);
      if (change.shouldHide) clearVisibleSuggestion();
      if (!change.shouldRequest) {
        if (change.shouldHide) policy.cancelPending();
        return;
      }
      policy.noteTypedChange(change.changedCharacters);
      const settings = deps.getSettings();
      if (!settings.enabled || !settings.autocompleteEnabled) {
        policy.cancelPending();
        return;
      }
      policy.schedule(buildContext(editor));
    }

    return { attachEditor, handleEditorUpdate, hideSuggestion, getTelemetrySummary: telemetry.getSummary };
  }

  window.createAiCompanionAutocompleteController = createAiCompanionAutocompleteController;
})(window, document);
