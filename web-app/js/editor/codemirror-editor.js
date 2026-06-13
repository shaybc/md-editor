(function(window, document) {
  "use strict";

  function registerMarkdownViewerCodeMirrorEditor(app, deps) {
    const textarea = deps.markdownEditor;
    const languageRegistry = deps.languageRegistry;
    const getActiveEditorPath = deps.getActiveEditorPath || function() { return ""; };
    const CodeMirror = window.MarkdownViewerCodeMirror;

    if (!textarea || !textarea.parentElement || !CodeMirror) {
      const fallbackApi = {
        isEnabled: function() { return false; },
        isFocused: function() { return document.activeElement === textarea; },
        canFormatActiveDocument: function() { return false; },
        collapseTopLevelFolds: function() { return false; },
        expandTopLevelFolds: function() { return false; },
        getActiveLanguage: function() { return null; },
        formatActiveDocument: async function() { return false; },
        setLanguageForActivePath: function() {},
        syncFromTextarea: function() {}
      };
      app.registerModule("codeMirrorEditor", fallbackApi);
      return fallbackApi;
    }

    let backingValue = textarea.value || "";
    let selectionStart = textarea.selectionStart || 0;
    let selectionEnd = textarea.selectionEnd || selectionStart;
    let syncingFromCodeMirror = false;
    let syncingToCodeMirror = false;
    let lastLanguageId = "";

    const host = document.createElement("div");
    host.id = "codemirror-editor";
    host.className = "codemirror-editor";
    textarea.parentElement.insertBefore(host, textarea);
    textarea.parentElement.classList.add("codemirror-enabled");
    textarea.classList.add("markdown-editor-compat");
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;

    function getActiveLanguageInfo() {
      const path = getActiveEditorPath();
      return languageRegistry?.resolveLanguageForPath(path, { content: backingValue }) || languageRegistry?.resolveLanguageForPath("document.md") || null;
    }

    function dispatchTextareaEvent(type, sourceEvent) {
      const eventOptions = { bubbles: true, cancelable: true };
      let event;
      if (sourceEvent instanceof MouseEvent) {
        event = new MouseEvent(type, {
          ...eventOptions,
          clientX: sourceEvent.clientX,
          clientY: sourceEvent.clientY,
          screenX: sourceEvent.screenX,
          screenY: sourceEvent.screenY,
          button: sourceEvent.button,
          buttons: sourceEvent.buttons,
          ctrlKey: sourceEvent.ctrlKey,
          shiftKey: sourceEvent.shiftKey,
          altKey: sourceEvent.altKey,
          metaKey: sourceEvent.metaKey
        });
      } else if (sourceEvent instanceof KeyboardEvent) {
        event = new KeyboardEvent(type, {
          ...eventOptions,
          key: sourceEvent.key,
          code: sourceEvent.code,
          ctrlKey: sourceEvent.ctrlKey,
          shiftKey: sourceEvent.shiftKey,
          altKey: sourceEvent.altKey,
          metaKey: sourceEvent.metaKey
        });
      } else {
        event = new Event(type, eventOptions);
      }
      textarea.dispatchEvent(event);
      return event;
    }

    const codeMirror = CodeMirror.createEditor({
      parent: host,
      doc: backingValue,
      language: getActiveLanguageInfo()?.codeMirrorLanguage || "markdown",
      onUpdate: function(update) {
        if (syncingToCodeMirror) return;
        const selection = codeMirror.getSelection();
        selectionStart = selection.start;
        selectionEnd = selection.end;
        if (update.docChanged) {
          syncingFromCodeMirror = true;
          backingValue = codeMirror.getValue();
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          syncingFromCodeMirror = false;
        }
        if (update.selectionSet) {
          dispatchTextareaEvent("select");
          document.dispatchEvent(new Event("selectionchange"));
        }
      }
    });

    function setLanguageForActivePath() {
      const language = getActiveLanguageInfo();
      const nextLanguageId = language?.codeMirrorLanguage || "text";
      if (nextLanguageId === lastLanguageId) return;
      lastLanguageId = nextLanguageId;
      codeMirror.setLanguage(nextLanguageId);
      host.dataset.language = language?.id || "text";
    }

    async function formatActiveDocument() {
      const language = getActiveLanguageInfo();
      if (!language || typeof CodeMirror.formatCode !== "function") return false;
      const formatted = await CodeMirror.formatCode(backingValue, language.id);
      if (formatted === backingValue) return true;
      const currentSelection = codeMirror.getSelection();
      setCodeMirrorValue(formatted);
      selectionStart = Math.min(currentSelection.start, formatted.length);
      selectionEnd = Math.min(currentSelection.end, formatted.length);
      codeMirror.setSelection(selectionStart, selectionEnd);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    function canFormatActiveDocument() {
      const language = getActiveLanguageInfo();
      return !!(language && typeof CodeMirror.canFormatCode === "function" && CodeMirror.canFormatCode(language.id));
    }

    function collapseTopLevelFolds() {
      return typeof CodeMirror.collapseTopLevelFolds === "function"
        ? CodeMirror.collapseTopLevelFolds(codeMirror.view)
        : false;
    }

    function expandTopLevelFolds() {
      return typeof CodeMirror.expandTopLevelFolds === "function"
        ? CodeMirror.expandTopLevelFolds(codeMirror.view)
        : false;
    }

    function setCodeMirrorValue(value) {
      const nextValue = String(value || "");
      backingValue = nextValue;
      if (syncingFromCodeMirror) return;
      syncingToCodeMirror = true;
      codeMirror.setValue(nextValue);
      syncingToCodeMirror = false;
      const selection = codeMirror.getSelection();
      selectionStart = selection.start;
      selectionEnd = selection.end;
      setLanguageForActivePath();
    }

    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    Object.defineProperty(textarea, "value", {
      configurable: true,
      get: function() {
        return backingValue;
      },
      set: function(value) {
        if (valueDescriptor && valueDescriptor.set) valueDescriptor.set.call(textarea, String(value || ""));
        setCodeMirrorValue(value);
      }
    });

    Object.defineProperty(textarea, "selectionStart", {
      configurable: true,
      get: function() {
        return selectionStart;
      },
      set: function(value) {
        selectionStart = Math.max(0, Number(value) || 0);
        codeMirror.setSelection(selectionStart, selectionEnd);
      }
    });

    Object.defineProperty(textarea, "selectionEnd", {
      configurable: true,
      get: function() {
        return selectionEnd;
      },
      set: function(value) {
        selectionEnd = Math.max(0, Number(value) || 0);
        codeMirror.setSelection(selectionStart, selectionEnd);
      }
    });

    Object.defineProperty(textarea, "scrollTop", {
      configurable: true,
      get: function() {
        return codeMirror.view.scrollDOM.scrollTop;
      },
      set: function(value) {
        codeMirror.view.scrollDOM.scrollTop = Number(value) || 0;
      }
    });

    Object.defineProperty(textarea, "scrollLeft", {
      configurable: true,
      get: function() {
        return codeMirror.view.scrollDOM.scrollLeft;
      },
      set: function(value) {
        codeMirror.view.scrollDOM.scrollLeft = Number(value) || 0;
      }
    });

    textarea.focus = function() {
      codeMirror.view.focus();
    };

    textarea.getBoundingClientRect = function() {
      return host.getBoundingClientRect();
    };

    ["clientWidth", "clientHeight", "offsetWidth", "offsetHeight", "scrollHeight", "scrollWidth"].forEach(function(property) {
      Object.defineProperty(textarea, property, {
        configurable: true,
        get: function() {
          return codeMirror.view.scrollDOM[property] || host[property] || 0;
        }
      });
    });

    codeMirror.view.dom.addEventListener("contextmenu", function(event) {
      const forwarded = dispatchTextareaEvent("contextmenu", event);
      if (forwarded.defaultPrevented) event.preventDefault();
    });
    codeMirror.view.dom.addEventListener("focusin", function() {
      dispatchTextareaEvent("focus");
    });
    codeMirror.view.dom.addEventListener("focusout", function() {
      dispatchTextareaEvent("blur");
    });
    codeMirror.view.dom.addEventListener("click", function(event) {
      dispatchTextareaEvent("click", event);
    });
    codeMirror.view.dom.addEventListener("keyup", function(event) {
      dispatchTextareaEvent("keyup", event);
    });
    codeMirror.view.dom.addEventListener("mousemove", function(event) {
      dispatchTextareaEvent("mousemove", event);
    });
    codeMirror.view.dom.addEventListener("mouseleave", function(event) {
      dispatchTextareaEvent("mouseleave", event);
    });
    codeMirror.view.scrollDOM.addEventListener("scroll", function() {
      textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    setLanguageForActivePath();

    const api = {
      isEnabled: function() { return true; },
      isFocused: function() { return codeMirror.view.hasFocus; },
      canFormatActiveDocument,
      collapseTopLevelFolds,
      expandTopLevelFolds,
      getActiveLanguage: getActiveLanguageInfo,
      formatActiveDocument,
      setLanguageForActivePath,
      syncFromTextarea: function() { setCodeMirrorValue(textarea.value); },
      getView: function() { return codeMirror.view; }
    };

    app.registerModule("codeMirrorEditor", api);
    return api;
  }

  window.registerMarkdownViewerCodeMirrorEditor = registerMarkdownViewerCodeMirrorEditor;
})(window, document);
