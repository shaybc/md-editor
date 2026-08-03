(function(global, document) {
  "use strict";

  function registerMarkdownViewerEditorViewManager(app, deps) {
    const api = {};
    const views = new Map();
    const delegatedListeners = [];
    const delegatedPreviewListeners = [];
    const primaryTextarea = deps.markdownEditor;
    const primaryPreview = deps.markdownPreview;
    const primaryLineNumbers = deps.editorLineNumbers;
    const primaryCurrentLine = deps.editorCurrentLine;
    const primarySelectionHighlights = deps.editorSelectionHighlights;
    const primarySyntaxHighlight = deps.editorSyntaxHighlight;
    const getCodeMirrorEditorFactory = deps.getCodeMirrorEditorFactory || function() {
      return deps.registerCodeMirrorEditorInstance;
    };
    const languageRegistry = deps.languageRegistry;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return "document.md"; };
    const getEditorPath = deps.getEditorPath || function() { return getActiveEditorPath(); };
    const getEditorLanguageOverride = deps.getEditorLanguageOverride || function() { return null; };
    const onEditorLanguageChange = deps.onEditorLanguageChange || function() {};
    const openEditorFindReplace = deps.openEditorFindReplace;
    const goToEditorLinePrompt = deps.goToEditorLinePrompt;
    const openLspDefinitionTarget = deps.openLspDefinitionTarget;
    const getEditorQuickFixSuggestions = deps.getEditorQuickFixSuggestions;
    const openEditorQuickFix = deps.openEditorQuickFix;
    const getWordWrapEnabled = deps.getWordWrapEnabled || function() { return false; };
    const getShowSymbolPreferences = deps.getShowSymbolPreferences || function() { return {}; };
    const getSnippetDefinitions = deps.getSnippetDefinitions || function() { return []; };
    const getLspSession = deps.getLspSession || function() { return null; };
    const getUnclosedBracketHighlightEnabled = deps.getUnclosedBracketHighlightEnabled || function() { return false; };
    const aiAutocomplete = deps.aiAutocomplete || null;
    const licenseSummaryHeader = deps.licenseSummaryHeader || null;
    const getAutocompletePreferences = deps.getAutocompletePreferences || function() {
      return {
        documentWords: deps.getDocumentWordAutocompleteEnabled?.() === true,
        language: deps.getLanguageAutocompleteEnabled?.() === true,
        languageServer: deps.getLanguageServerAutocompleteEnabled?.() === true,
        snippets: deps.getSnippetAutocompleteEnabled?.() === true
      };
    };
    const codeMirrorFactoryUnavailableMessage = "CodeMirror editor factory is unavailable";
    const LSP_TAB_ACTIVATION_DELAY_MS = Number.isFinite(deps.lspActivationDelayMs) ? deps.lspActivationDelayMs : 750;
    const scheduleTimeout = deps.setTimeout || global.setTimeout.bind(global);
    const cancelTimeout = deps.clearTimeout || global.clearTimeout.bind(global);
    let primaryTextareaNativeAddEventListener = null;
    let primaryPreviewNativeAddEventListener = null;
    let activeView = null;
    let pendingLspActivationTimer = null;

    function getTabId(tabOrId) {
      return typeof tabOrId === "string" ? tabOrId : tabOrId?.id;
    }

    /** Return whether this editor uses the Java language server dwell policy. */
    function shouldDelayJavaLspAttachment(view) {
      const overrideId = getEditorLanguageOverride(view?.tabId);
      const override = languageRegistry?.languages?.find?.((language) => language.id === overrideId);
      const language = override || languageRegistry?.resolveLanguageForPath?.(getEditorPath(view?.tabId), {
        content: view?.textarea?.value || ""
      });
      return language?.id === "java" || language?.codeMirrorLanguage === "java";
    }

    function getActiveTextarea() {
      return activeView?.textarea || primaryTextarea;
    }

    function getActivePreview() {
      return activeView?.preview || primaryPreview;
    }

    function getActiveEditorPane() {
      return activeView?.editorPane || primaryTextarea?.closest?.(".editor-pane") || null;
    }

    function getActivePreviewPane() {
      return activeView?.previewPane || primaryPreview?.closest?.(".preview-pane") || null;
    }

    function getActiveResizeDivider() {
      return activeView?.resizeDivider || getActiveEditorPane()?.parentElement?.querySelector?.(".resize-divider") || null;
    }

    function getActiveCodeMirrorEditor() {
      return activeView?.codeMirrorEditor || app.services?.codeMirrorEditor || null;
    }

    function getActiveOverlay(name) {
      return activeView?.[name] || deps[name] || null;
    }

    function bindDelegatedListener(target, entry) {
      if (!target || !entry || !target.addEventListener) return;
      if (target === primaryTextarea && primaryTextareaNativeAddEventListener) {
        primaryTextareaNativeAddEventListener(entry.type, entry.listener, entry.options);
        return;
      }
      target.addEventListener(entry.type, entry.listener, entry.options);
    }

    function bindDelegatedPreviewListener(target, entry) {
      if (!target || !entry || !target.addEventListener) return;
      if (target === primaryPreview && primaryPreviewNativeAddEventListener) {
        primaryPreviewNativeAddEventListener(entry.type, entry.listener, entry.options);
        return;
      }
      target.addEventListener(entry.type, entry.listener, entry.options);
    }

    function installTextareaFacade() {
      if (!primaryTextarea || primaryTextarea.__markdownViewerActiveFacade) return;
      primaryTextarea.__markdownViewerActiveFacade = true;
      const nativeAddEventListener = primaryTextarea.addEventListener.bind(primaryTextarea);
      const nativeRemoveEventListener = primaryTextarea.removeEventListener.bind(primaryTextarea);
      const nativeDispatchEvent = primaryTextarea.dispatchEvent.bind(primaryTextarea);
      const nativeSetSelectionRange = primaryTextarea.setSelectionRange.bind(primaryTextarea);
      const nativeFocus = primaryTextarea.focus.bind(primaryTextarea);
      const nativeBlur = primaryTextarea.blur.bind(primaryTextarea);
      primaryTextareaNativeAddEventListener = nativeAddEventListener;
      const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

      primaryTextarea.addEventListener = function(type, listener, options) {
        const entry = { type, listener, options };
        delegatedListeners.push(entry);
        bindDelegatedListener(getActiveTextarea(), entry);
      };

      primaryTextarea.removeEventListener = function(type, listener, options) {
        for (let index = delegatedListeners.length - 1; index >= 0; index -= 1) {
          const entry = delegatedListeners[index];
          if (entry.type === type && entry.listener === listener) delegatedListeners.splice(index, 1);
        }
        views.forEach((view) => view.textarea?.removeEventListener?.(type, listener, options));
        nativeRemoveEventListener(type, listener, options);
      };

      primaryTextarea.dispatchEvent = function(event) {
        const target = getActiveTextarea();
        return target && target !== primaryTextarea ? target.dispatchEvent(event) : nativeDispatchEvent(event);
      };

      Object.defineProperty(primaryTextarea, "value", {
        configurable: true,
        get: function() {
          const target = getActiveTextarea();
          if (target === primaryTextarea) return valueDescriptor?.get ? valueDescriptor.get.call(primaryTextarea) : "";
          return target?.value || "";
        },
        set: function(value) {
          const target = getActiveTextarea();
          if (target && target !== primaryTextarea) target.value = String(value || "");
          else if (valueDescriptor?.set) valueDescriptor.set.call(primaryTextarea, String(value || ""));
        }
      });

      ["selectionStart", "selectionEnd", "scrollTop", "scrollLeft"].forEach(function(property) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, property);
        Object.defineProperty(primaryTextarea, property, {
          configurable: true,
          get: function() {
            const target = getActiveTextarea();
            return target && target !== primaryTextarea ? target[property] : (descriptor?.get ? descriptor.get.call(primaryTextarea) : 0);
          },
          set: function(value) {
            const target = getActiveTextarea();
            if (target && target !== primaryTextarea) target[property] = value;
            else if (descriptor?.set) descriptor.set.call(primaryTextarea, value);
          }
        });
      });

      primaryTextarea.setSelectionRange = function() {
        const target = getActiveTextarea();
        if (target && target !== primaryTextarea) target.setSelectionRange?.apply(target, arguments);
        else nativeSetSelectionRange.apply(primaryTextarea, arguments);
      };
      primaryTextarea.focus = function(options) {
        const target = getActiveTextarea();
        if (target && target !== primaryTextarea) target.focus?.(options);
        else nativeFocus(options);
      };
      primaryTextarea.blur = function() {
        const target = getActiveTextarea();
        if (target && target !== primaryTextarea) target.blur?.();
        else nativeBlur();
      };
      primaryTextarea.getBoundingClientRect = function() {
        return getActiveTextarea()?.getBoundingClientRect?.() || HTMLElement.prototype.getBoundingClientRect.call(primaryTextarea);
      };
    }

    function installPreviewFacade() {
      if (!primaryPreview || primaryPreview.__markdownViewerActiveFacade) return;
      primaryPreview.__markdownViewerActiveFacade = true;
      const nativeAddEventListener = primaryPreview.addEventListener.bind(primaryPreview);
      const nativeRemoveEventListener = primaryPreview.removeEventListener.bind(primaryPreview);
      primaryPreviewNativeAddEventListener = nativeAddEventListener;
      const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

      primaryPreview.addEventListener = function(type, listener, options) {
        const entry = { type, listener, options };
        delegatedPreviewListeners.push(entry);
        bindDelegatedPreviewListener(getActivePreview(), entry);
      };

      primaryPreview.removeEventListener = function(type, listener, options) {
        for (let index = delegatedPreviewListeners.length - 1; index >= 0; index -= 1) {
          const entry = delegatedPreviewListeners[index];
          if (entry.type === type && entry.listener === listener) delegatedPreviewListeners.splice(index, 1);
        }
        views.forEach((view) => view.preview?.removeEventListener?.(type, listener, options));
        nativeRemoveEventListener(type, listener, options);
      };

      Object.defineProperty(primaryPreview, "innerHTML", {
        configurable: true,
        get: function() {
          const target = getActivePreview();
          return target && target !== primaryPreview ? target.innerHTML : (htmlDescriptor?.get ? htmlDescriptor.get.call(primaryPreview) : "");
        },
        set: function(value) {
          const target = getActivePreview();
          if (target && target !== primaryPreview) target.innerHTML = value;
          else if (htmlDescriptor?.set) htmlDescriptor.set.call(primaryPreview, value);
        }
      });

      ["querySelector", "querySelectorAll", "closest", "contains", "appendChild", "removeChild"].forEach(function(methodName) {
        const original = primaryPreview[methodName]?.bind(primaryPreview);
        primaryPreview[methodName] = function() {
          const target = getActivePreview();
          return target && target !== primaryPreview && typeof target[methodName] === "function"
            ? target[methodName].apply(target, arguments)
            : original?.apply(primaryPreview, arguments);
        };
      });
    }

    function createElement(tagName, className) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      return element;
    }

    function createEditorMountFailure(root, error) {
      root.textContent = "";
      const failure = createElement("div", "editor-mount-failure");
      const title = createElement("h2");
      const message = createElement("p");
      title.textContent = "CodeMirror editor failed to load";
      message.textContent = error?.message || "Editable text tabs require CodeMirror 6.";
      failure.append(title, message);
      root.appendChild(failure);
    }

    function createEditorShell(tab) {
      const contentRow = createElement("div", "editor-content-row persistent-editor-view");
      const editorPane = createElement("div", "editor-pane");
      const editorShell = createElement("div", "editor-shell");
      const lineNumbers = createElement("div", "editor-line-numbers");
      lineNumbers.setAttribute("aria-hidden", "true");
      const inputWrap = createElement("div", "editor-input-wrap");
      const currentLine = createElement("div", "editor-current-line");
      currentLine.setAttribute("aria-hidden", "true");
      const syntaxHighlight = createElement("pre", "editor-syntax-highlight");
      syntaxHighlight.setAttribute("aria-hidden", "true");
      const selectionHighlights = createElement("div", "editor-selection-highlights");
      selectionHighlights.setAttribute("aria-hidden", "true");
      const textarea = createElement("textarea");
      textarea.className = primaryTextarea?.className || "";
      textarea.classList.add("markdown-editor");
      textarea.placeholder = primaryTextarea?.placeholder || "Type or paste your Markdown here...";
      textarea.spellcheck = false;
      textarea.value = tab?.content || "";
      inputWrap.append(currentLine, syntaxHighlight, selectionHighlights, textarea);
      editorShell.append(lineNumbers, inputWrap);
      editorPane.appendChild(editorShell);

      const divider = createElement("div", "resize-divider");
      divider.setAttribute("role", "separator");
      divider.setAttribute("aria-orientation", "vertical");
      divider.setAttribute("aria-label", "Resize panes");
      divider.tabIndex = 0;
      divider.innerHTML = '<i class="bi bi-grip-vertical"></i>';

      const previewPane = createElement("div", "preview-pane");
      const preview = createElement("div", "markdown-body");
      previewPane.appendChild(preview);
      contentRow.append(editorPane, divider, previewPane);
      return { contentRow, editorPane, editorShell, previewPane, divider, textarea, preview, lineNumbers, currentLine, selectionHighlights, syntaxHighlight };
    }

    function mountEditorTab(tab, root) {
      if (!tab?.id || !root) return null;
      let view = views.get(tab.id);
      if (view?.root?.isConnected) return view;
      const shell = createEditorShell(tab);
      root.textContent = "";
      root.appendChild(shell.contentRow);
      delegatedListeners.forEach((entry) => bindDelegatedListener(shell.textarea, entry));
      delegatedPreviewListeners.forEach((entry) => bindDelegatedPreviewListener(shell.preview, entry));
      view = {
        tabId: tab.id,
        root,
        initialized: false,
        contentRow: shell.contentRow,
        editorPane: shell.editorPane,
        editorShell: shell.editorShell,
        previewPane: shell.previewPane,
        resizeDivider: shell.divider,
        textarea: shell.textarea,
        preview: shell.preview,
        editorLineNumbers: shell.lineNumbers,
        editorCurrentLine: shell.currentLine,
        editorSelectionHighlights: shell.selectionHighlights,
        editorSyntaxHighlight: shell.syntaxHighlight,
        codeMirrorEditor: null
      };
      views.set(tab.id, view);
      licenseSummaryHeader?.mount?.({
        tabId: tab.id,
        getPath: function() { return getEditorPath(tab.id); },
        editorPane: shell.editorPane,
        editorShell: shell.editorShell,
        textarea: shell.textarea
      });
      upgradeViewToCodeMirror(view);
      return view;
    }

    function upgradeViewToCodeMirror(view) {
      if (!view || view.codeMirrorEditor?.isEnabled?.()) return false;
      const registerCodeMirrorEditorInstance = getCodeMirrorEditorFactory();
      if (!global.MarkdownViewerCodeMirror) {
        return false;
      }
      if (typeof registerCodeMirrorEditorInstance !== "function") {
        createEditorMountFailure(view.root, new Error(codeMirrorFactoryUnavailableMessage));
        return false;
      }
      const autocompletePreferences = getAutocompletePreferences();
      view.codeMirrorEditor = registerCodeMirrorEditorInstance(app, {
        markdownEditor: view.textarea,
        languageRegistry,
        getActiveEditorPath: function() { return getEditorPath(view.tabId); },
        getLanguageOverride: function() { return getEditorLanguageOverride(view.tabId); },
        onLanguageChange: function(language) { onEditorLanguageChange(view.tabId, language); },
        openEditorFindReplace,
        goToEditorLinePrompt,
        openLspDefinitionTarget,
        getEditorQuickFixSuggestions,
        openEditorQuickFix,
        getSnippetDefinitions,
        getLspSession,
        showSymbolPreferences: getShowSymbolPreferences(),
        documentWordAutocompleteEnabled: autocompletePreferences.documentWords === true,
        languageAutocompleteEnabled: autocompletePreferences.language === true,
        languageServerAutocompleteEnabled: autocompletePreferences.languageServer === true,
        snippetAutocompleteEnabled: autocompletePreferences.snippets === true,
        unclosedBracketHighlightEnabled: getUnclosedBracketHighlightEnabled() === true,
        lspActivationEnabled: !shouldDelayJavaLspAttachment(view),
        aiAutocomplete,
        wordWrap: getWordWrapEnabled() === true,
        registerModule: false
      });
      if (!view.codeMirrorEditor?.isEnabled?.()) {
        createEditorMountFailure(view.root, new Error("CodeMirror did not create an enabled editor instance."));
        view.codeMirrorEditor = null;
        return false;
      }
      return true;
    }

    function upgradeCodeMirrorEditors() {
      let upgraded = 0;
      views.forEach(function(view) {
        if (upgradeViewToCodeMirror(view)) upgraded += 1;
      });
      if (activeView?.codeMirrorEditor?.setLanguageForActivePath) {
        activeView.codeMirrorEditor.setLanguageForActivePath();
        scheduleActiveViewLspAttachment(activeView);
      }
      return upgraded;
    }

    /** Cancel a pending language-server attachment for a transient tab activation. */
    function cancelPendingLspAttachment() {
      if (pendingLspActivationTimer === null) return;
      cancelTimeout(pendingLspActivationTimer);
      pendingLspActivationTimer = null;
    }

    /** Attach language services only if the same editor remains active after the dwell delay. */
    function scheduleActiveViewLspAttachment(view) {
      cancelPendingLspAttachment();
      if (!shouldDelayJavaLspAttachment(view) || !view?.codeMirrorEditor?.setLspActivationEnabled) return;
      pendingLspActivationTimer = scheduleTimeout(function() {
        pendingLspActivationTimer = null;
        if (activeView !== view) return;
        deps.getJavaWorkspaceController?.()?.activateDocument?.({
          path: getEditorPath(view.tabId),
          tabId: view.tabId
        });
        void view.codeMirrorEditor.setLspActivationEnabled(true);
      }, LSP_TAB_ACTIVATION_DELAY_MS);
    }

    /**
     * Refresh the parser and language services for one mounted editor tab.
     * @param {string} tabId - Editor tab identifier.
     */
    function refreshLanguageForTab(tabId) {
      const view = views.get(tabId);
      view?.codeMirrorEditor?.setLanguageForActivePath?.();
      if (!view?.codeMirrorEditor?.setLspActivationEnabled) return;
      if (shouldDelayJavaLspAttachment(view)) {
        void view.codeMirrorEditor.setLspActivationEnabled(false);
        if (activeView === view) scheduleActiveViewLspAttachment(view);
      } else {
        void view.codeMirrorEditor.setLspActivationEnabled(true);
      }
    }

    function captureEditorTabState(tab) {
      const view = views.get(getTabId(tab));
      if (!tab || !view) return null;
      tab.content = view.textarea?.value || "";
      tab.scrollPos = view.textarea?.scrollTop || 0;
      tab.selectionStart = view.textarea?.selectionStart || 0;
      tab.selectionEnd = view.textarea?.selectionEnd || tab.selectionStart || 0;
      return {
        content: tab.content,
        scrollPos: tab.scrollPos,
        selectionStart: tab.selectionStart,
        selectionEnd: tab.selectionEnd
      };
    }

    function activateEditorTab(tab, root) {
      const view = mountEditorTab(tab, root);
      if (!view) return null;
      const wasAlreadyActive = activeView === view;
      activeView = view;
      const wasInitialized = view.initialized;
      if (!view.initialized) {
        view.textarea.value = tab.content || "";
        view.textarea.scrollTop = tab.scrollPos || 0;
        if (Number.isFinite(tab.selectionStart) && Number.isFinite(tab.selectionEnd)) {
          view.textarea.setSelectionRange(tab.selectionStart, tab.selectionEnd);
        }
        view.initialized = true;
      }
      view.activatedExisting = wasInitialized;
      app.services.activeEditor = api;
      view.codeMirrorEditor?.setLanguageForActivePath?.();
      if (!wasAlreadyActive && shouldDelayJavaLspAttachment(view)) {
        void view.codeMirrorEditor?.setLspActivationEnabled?.(false);
        scheduleActiveViewLspAttachment(view);
      }
      return view;
    }

    function destroyEditorTab(tabId) {
      const view = views.get(tabId);
      if (!view) return;
      if (activeView === view) cancelPendingLspAttachment();
      licenseSummaryHeader?.destroy?.(tabId);
      view.codeMirrorEditor?.destroy?.();
      if (activeView === view) activeView = null;
      views.delete(tabId);
    }

    function deactivateEditorView(tabId) {
      if (!activeView) return;
      if (!tabId || activeView.tabId === tabId) {
        const view = activeView;
        cancelPendingLspAttachment();
        activeView.codeMirrorEditor?.flushPendingSync?.();
        if (shouldDelayJavaLspAttachment(view)) void view.codeMirrorEditor?.setLspActivationEnabled?.(false);
        activeView = null;
      }
    }

    function getActiveEditorView() {
      return activeView;
    }

    function setWordWrapForEditorViews(enabled) {
      views.forEach(function(view) {
        view.codeMirrorEditor?.setWordWrap?.(enabled === true);
      });
    }

    function setShowSymbolPreferencesForEditorViews(preferences) {
      views.forEach(function(view) {
        view.codeMirrorEditor?.setShowSymbolPreferences?.(preferences || {});
      });
    }

    function setDocumentWordAutocompleteForEditorViews(enabled) {
      views.forEach(function(view) {
        view.codeMirrorEditor?.setDocumentWordAutocomplete?.(enabled === true);
      });
    }

    function setUnclosedBracketHighlightEnabledForEditorViews(enabled) {
      views.forEach(function(view) {
        view.codeMirrorEditor?.setUnclosedBracketHighlightEnabled?.(enabled === true);
      });
    }

    function setAutocompletePreferencesForEditorViews(preferences) {
      views.forEach(function(view) {
        view.codeMirrorEditor?.setAutocompletePreferences?.(preferences || {});
      });
    }

    function refreshSnippetDefinitionsForEditorViews() {
      views.forEach(function(view) {
        view.codeMirrorEditor?.refreshSnippetDefinitions?.();
      });
    }

    installTextareaFacade();
    installPreviewFacade();

    Object.assign(api, {
      mountEditorTab,
      activateEditorTab,
      captureEditorTabState,
      destroyEditorTab,
      deactivateEditorView,
      getActiveEditorView,
      getActiveMarkdownEditor: getActiveTextarea,
      getActiveMarkdownPreview: getActivePreview,
      getActiveEditorPane,
      getActivePreviewPane,
      getActiveResizeDivider,
      getActiveCodeMirrorEditor,
      refreshLanguageForTab,
      refreshLicenseHeaderForTab: function(tabId) {
        return licenseSummaryHeader?.refresh?.(tabId) || Promise.resolve(null);
      },
      getActiveOverlay,
      upgradeCodeMirrorEditors,
      refreshSnippetDefinitionsForEditorViews,
      setAutocompletePreferencesForEditorViews,
      setDocumentWordAutocompleteForEditorViews,
      setUnclosedBracketHighlightEnabledForEditorViews,
      setShowSymbolPreferencesForEditorViews,
      setWordWrapForEditorViews,
      getActiveEditorParts: function() {
        return {
          textarea: getActiveTextarea(),
          preview: getActivePreview(),
          editorPane: getActiveEditorPane(),
          previewPane: getActivePreviewPane(),
          lineNumbers: getActiveOverlay("editorLineNumbers"),
          currentLine: getActiveOverlay("editorCurrentLine"),
          selectionHighlights: getActiveOverlay("editorSelectionHighlights"),
          syntaxHighlight: getActiveOverlay("editorSyntaxHighlight"),
          resizeDivider: getActiveResizeDivider()
        };
      },
      getViewCount: function() { return views.size; }
    });

    app.services.editorViewManager = api;
    app.registerModule?.("editorViewManager", api);
    return api;
  }

  global.registerMarkdownViewerEditorViewManager = registerMarkdownViewerEditorViewManager;
})(typeof window !== "undefined" ? window : globalThis, document);
