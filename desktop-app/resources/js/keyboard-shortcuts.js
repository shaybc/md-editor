(function (window, document) {
  "use strict";

  const COMMANDS = Object.freeze([
    define("toggle-find-results", "Show / Hide Find in Files Results", "Toggle the Find in Files results panel.", "F7", {}, ".toggle-find-in-files-results-panel"),
    define("toggle-problems", "Show / Hide Problems", "Toggle the Problems panel.", "F8", {}, '[data-project-command="show-problems"]'),
    define("toggle-tasks", "Show / Hide Tasks", "Toggle the Tasks panel tab.", "F9", {}, '[data-project-command="show-tasks"]'),
    define("rebuild-project", "Rebuild Project", "Delete generated class files and compile the supported project.", "F9", { primary: true }, '[data-project-command="rebuild-project"]'),
    define("toggle-fullscreen", "Toggle Full Screen", "Enter or leave full screen.", "F11", {}, ".toggle-fullscreen-button"),
    define("zoom-in", "Zoom In", "Increase the application zoom level.", "=", { primary: true, shift: true }, ".app-zoom-in-button"),
    define("zoom-out", "Zoom Out", "Decrease the application zoom level.", "-", { primary: true }, ".app-zoom-out-button"),
    define("zoom-reset", "Actual Size", "Reset the application zoom level.", "0", { primary: true }, ".app-zoom-reset-button"),
    define("workspace-search", "Find in Workspace", "Search across the current workspace.", "f", { primary: true, shift: true }, ".open-workspace-search-dialog"),
    define("open-file-by-name", "Open File by Name", "Open a workspace file by its name.", "n", { primary: true, shift: true }, ".open-file-by-name-dialog"),
    define("find-in-files", "Find in Files", "Search file contents with advanced options.", "f", { primary: true, alt: true }, ".open-find-in-files-dialog"),
    define("save-current-file", "Save Changes", "Save changes to the current file.", "s", { primary: true }, ".save-current-file-button"),
    define("new-document", "New Document", "Open a new document tab.", "t", { primary: true }, ".new-document-button"),
    define("close-tab", "Close Tab", "Close the active tab.", "w", { primary: true }),
    define("sync-scrolling", "Toggle Sync Scrolling", "Toggle synchronized scrolling in split view.", "s", { primary: true, shift: true }),
    define("find-replace", "Find / Replace", "Open find and replace in the active editor.", "h", { primary: true }, ".open-editor-find-replace-dialog"),
    define("go-to-line", "Go to Line", "Go to a line in the active editor.", "g", { primary: true }),
    define("reload-from-disk", "Reload from Disk", "Reload the active tab from disk.", "r", { primary: true }, ".reload-current-file-button"),
    define("graph-find", "Find in Graph", "Open find for the active graph.", "f", { primary: true })
  ]);

  function define(id, label, description, key, modifiers = {}, menuSelector = "") {
    return Object.freeze({ id, label, description, defaultBinding: Object.freeze(createBinding(key, modifiers)), menuSelector });
  }

  function normalizeKey(key) {
    const value = String(key || "");
    if (/^F([1-9]|1[0-2])$/i.test(value)) return value.toUpperCase();
    return ({ "+": "=", "_": "-", ")": "0" })[value] || (value.length === 1 ? value.toLowerCase() : value);
  }

  function createBinding(key, modifiers = {}) {
    return { key: normalizeKey(key), primary: modifiers.primary === true, alt: modifiers.alt === true, shift: modifiers.shift === true };
  }

  function bindingEquals(left, right) {
    return !!left && !!right && left.key === right.key && left.primary === right.primary && left.alt === right.alt && left.shift === right.shift;
  }

  function normalizeBinding(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const key = normalizeKey(value.key);
    if (!key || ["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
    const normalized = createBinding(key, value);
    if (!/^F([1-9]|1[0-2])$/.test(key) && !normalized.primary && !normalized.alt) return null;
    return normalized;
  }

  function normalizeOverrides(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return COMMANDS.reduce((result, definition) => {
      if (!Object.prototype.hasOwnProperty.call(value, definition.id)) return result;
      if (value[definition.id] === null) result[definition.id] = null;
      else {
        const normalized = normalizeBinding(value[definition.id]);
        if (normalized && !bindingEquals(normalized, definition.defaultBinding)) result[definition.id] = normalized;
      }
      return result;
    }, {});
  }

  function bindingFromEvent(event) {
    return normalizeBinding({ key: event.key, primary: event.ctrlKey === true || event.metaKey === true, alt: event.altKey === true, shift: event.shiftKey === true });
  }

  function eventMatchesBinding(event, configuredBinding) {
    return bindingEquals(bindingFromEvent(event), configuredBinding);
  }

  function formatBinding(configuredBinding, platform = window.navigator?.platform || "") {
    if (!configuredBinding) return "Unassigned";
    const parts = [];
    if (configuredBinding.primary) parts.push(/Mac|iPhone|iPad/i.test(platform) ? "Cmd" : "Ctrl");
    if (configuredBinding.alt) parts.push(/Mac|iPhone|iPad/i.test(platform) ? "Option" : "Alt");
    if (configuredBinding.shift) parts.push("Shift");
    parts.push(configuredBinding.key.length === 1 ? configuredBinding.key.toUpperCase() : configuredBinding.key);
    return parts.join("+");
  }

  function registerKeyboardShortcuts(app, deps) {
    let overrides = normalizeOverrides(deps.keyboardShortcutOverrides);
    const observedFrames = typeof WeakSet === "function" ? new WeakSet() : null;
    const frameDocuments = typeof WeakMap === "function" ? new WeakMap() : null;

    function getEffectiveBinding(commandId, source = overrides) {
      const definition = COMMANDS.find((item) => item.id === commandId);
      return definition ? (Object.prototype.hasOwnProperty.call(source, commandId) ? source[commandId] : definition.defaultBinding) : null;
    }

    function matches(event, commandId) {
      const effectiveBinding = getEffectiveBinding(commandId);
      if (!Object.prototype.hasOwnProperty.call(overrides, commandId) && ["zoom-in", "zoom-out", "zoom-reset"].includes(commandId)) {
        const eventBinding = bindingFromEvent(event);
        return !!eventBinding && eventBinding.key === effectiveBinding.key && eventBinding.primary === true && eventBinding.alt === false;
      }
      return eventMatchesBinding(event, effectiveBinding);
    }

    function getActiveEditorSelectedText() {
      const editorSelection = deps.activeEditorCommands?.getActiveEditorSelection?.();
      const editorValue = deps.activeEditorCommands?.getActiveEditorValue?.();
      if (editorSelection && typeof editorValue === "string") {
        return editorValue.slice(editorSelection.start, editorSelection.end);
      }
      const selectionStart = deps.markdownEditor?.selectionStart;
      const selectionEnd = deps.markdownEditor?.selectionEnd;
      return typeof deps.markdownEditor?.value === "string"
        ? deps.markdownEditor.value.slice(selectionStart, selectionEnd)
        : "";
    }

    function runCommand(commandId, event, appWideOnly) {
      if (commandId === "toggle-find-results" && deps.toggleFindInFilesResultsPanel) deps.toggleFindInFilesResultsPanel();
      else if (commandId === "toggle-problems" && deps.toggleProblemsPanel) deps.toggleProblemsPanel();
      else if (commandId === "toggle-tasks" && deps.toggleTasksPanel) deps.toggleTasksPanel();
      else if (commandId === "rebuild-project") {
        const command = document.querySelector?.('[data-project-command="rebuild-project"]');
        if (!command || command.disabled) return false;
        command.click();
      }
      else if (commandId === "toggle-fullscreen" && deps.toggleFullscreen) deps.toggleFullscreen();
      else if (commandId === "zoom-in") deps.zoomIn?.();
      else if (commandId === "zoom-out") deps.zoomOut?.();
      else if (commandId === "zoom-reset") deps.resetZoom?.();
      else if (commandId === "workspace-search" && deps.openWorkspaceSearchModal) deps.openWorkspaceSearchModal(getActiveEditorSelectedText() || undefined);
      else if (commandId === "open-file-by-name" && deps.openFileByNameModal) deps.openFileByNameModal();
      else if (commandId === "find-in-files" && deps.openFindInFilesModal) deps.openFindInFilesModal();
      else if (commandId === "save-current-file") deps.saveCurrentFileIfChanged();
      else if (commandId === "new-document") deps.newTab();
      else if (commandId === "close-tab") deps.closeTab(deps.getActiveTabId());
      else if (!appWideOnly && commandId === "sync-scrolling") {
        if (deps.getCurrentViewMode() === "split") deps.toggleSyncScrolling();
      } else if (!appWideOnly && commandId === "find-replace" && deps.openEditorFindReplaceModal) deps.openEditorFindReplaceModal({ replace: true, focusReplace: true });
      else if (!appWideOnly && commandId === "go-to-line" && deps.goToEditorLinePrompt) deps.goToEditorLinePrompt();
      else if (!appWideOnly && commandId === "reload-from-disk") {
        if (deps.canReloadActiveTabFromDisk?.()) deps.reloadActiveTabFromDisk?.();
      } else if (!appWideOnly && commandId === "graph-find" && deps.getActiveTabType?.() === "graph") deps.openGraphFindDialog?.();
      else return false;
      event.preventDefault();
      if (["find-replace", "go-to-line", "reload-from-disk"].includes(commandId)) event.stopPropagation?.();
      return true;
    }

    function handleAppWideKeydown(event) {
      for (const commandId of ["toggle-find-results", "toggle-problems", "toggle-tasks", "rebuild-project", "toggle-fullscreen", "zoom-in", "zoom-out", "zoom-reset", "workspace-search", "open-file-by-name", "find-in-files", "save-current-file", "new-document", "close-tab"]) {
        if (matches(event, commandId) && runCommand(commandId, event, true)) return true;
      }
      return false;
    }

    function handleDocumentKeydown(event) {
      if (document.documentElement?.dataset?.keyboardShortcutCapture === "true") return;
      if (handleAppWideKeydown(event)) return;
      const activeElement = document.activeElement;
      const isTextControl = activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT" || activeElement.isContentEditable);
      for (const commandId of ["sync-scrolling", "find-replace", "go-to-line", "reload-from-disk"]) {
        if (matches(event, commandId) && runCommand(commandId, event, false)) return;
      }
      if (!isTextControl && matches(event, "graph-find") && runCommand("graph-find", event, false)) return;
      if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "c") {
        const hasSelection = window.getSelection && window.getSelection().toString().trim().length > 0;
        const editorSelection = deps.activeEditorCommands?.getActiveEditorSelection?.();
        const editorHasSelection = editorSelection ? editorSelection.start !== editorSelection.end : deps.markdownEditor.selectionStart !== deps.markdownEditor.selectionEnd;
        if (!isTextControl && !hasSelection && !editorHasSelection) {
          event.preventDefault();
          deps.copyMarkdownButton.click();
        }
      }
      if (event.key === "Escape") {
        deps.closeMermaidModal();
        deps.closeGraphComparisonDetailsModal();
        deps.hideGraphStaleModal();
      }
    }

    function handleDocumentWheel(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !Number.isFinite(Number(event.deltaY)) || Number(event.deltaY) === 0) return;
      if (deps.handleContextualWheelZoom?.(event) === true) return;
      event.preventDefault();
      Number(event.deltaY) < 0 ? deps.zoomIn?.() : deps.zoomOut?.();
    }

    function updateMenuLabels() {
      COMMANDS.forEach((definition) => {
        if (!definition.menuSelector) return;
        document.querySelectorAll?.(`${definition.menuSelector} .menu-shortcut-label`).forEach((label) => {
          label.textContent = formatBinding(getEffectiveBinding(definition.id));
        });
      });
    }

    function attachFrameDocument(frame) {
      try {
        const frameDocument = frame.contentDocument;
        if (!frameDocument || frameDocuments?.get(frame) === frameDocument) return;
        frameDocument.addEventListener("keydown", handleAppWideKeydown, true);
        frameDocuments?.set(frame, frameDocument);
      } catch (_) {
        // Sandboxed cross-origin preview documents intentionally remain isolated.
      }
    }

    function observeFrame(frame) {
      if (!frame || String(frame.tagName || "").toLowerCase() !== "iframe") return;
      if (!observedFrames?.has(frame)) {
        frame.addEventListener?.("load", function() { attachFrameDocument(frame); });
        observedFrames?.add(frame);
      }
      attachFrameDocument(frame);
    }

    function observeFramesWithin(node) {
      observeFrame(node);
      node?.querySelectorAll?.("iframe").forEach(observeFrame);
    }

    document.addEventListener("keydown", handleDocumentKeydown, true);
    document.addEventListener("wheel", handleDocumentWheel, { capture: true, passive: false });
    document.querySelectorAll?.("iframe").forEach(observeFrame);
    if (window.MutationObserver && document.documentElement) {
      new window.MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes?.forEach(observeFramesWithin)))
        .observe(document.documentElement, { childList: true, subtree: true });
    }

    const api = {
      commands: COMMANDS,
      bindingFromEvent,
      eventMatchesBinding,
      formatBinding,
      getEffectiveBinding,
      handleDocumentKeydown,
      handleDocumentWheel,
      normalizeBinding,
      normalizeOverrides,
      setOverrides(value) {
        overrides = normalizeOverrides(value);
        updateMenuLabels();
        return overrides;
      },
      updateMenuLabels
    };
    updateMenuLabels();
    app.registerModule("keyboardShortcuts", api);
    return api;
  }

  window.registerMarkdownViewerKeyboardShortcuts = registerKeyboardShortcuts;
})(window, document);
