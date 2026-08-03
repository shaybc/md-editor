(function (window) {
  "use strict";

  function registerScrollSync(app, deps) {
    var state = app.state;
    var delay = deps.delay;
    var activeEditorScrollTarget = null;
    var activePreviewScrollTarget = null;

    function getActiveEditorScrollTarget() {
      return deps.getActiveMarkdownEditor?.() || deps.editorPane || null;
    }

    function getActivePreviewScrollTarget() {
      return deps.getActivePreviewPane?.() || deps.previewPane || null;
    }

    function detachActiveScrollTargets() {
      if (activeEditorScrollTarget) activeEditorScrollTarget.removeEventListener("scroll", syncEditorToPreview);
      if (activePreviewScrollTarget) activePreviewScrollTarget.removeEventListener("scroll", syncPreviewToEditor);
      activeEditorScrollTarget = null;
      activePreviewScrollTarget = null;
    }

    function refreshActiveScrollTargets() {
      var nextEditorTarget = getActiveEditorScrollTarget();
      var nextPreviewTarget = getActivePreviewScrollTarget();
      if (nextEditorTarget === activeEditorScrollTarget && nextPreviewTarget === activePreviewScrollTarget) return;
      detachActiveScrollTargets();
      activeEditorScrollTarget = nextEditorTarget;
      activePreviewScrollTarget = nextPreviewTarget;
      if (activeEditorScrollTarget) activeEditorScrollTarget.addEventListener("scroll", syncEditorToPreview);
      if (activePreviewScrollTarget) activePreviewScrollTarget.addEventListener("scroll", syncPreviewToEditor);
    }

    function isActiveTabHtml() {
      const tab = typeof deps.getActiveTab === "function" ? deps.getActiveTab() : null;
      const path = tab?.sourceFilePath || tab?.sourceFileName || tab?.sourceFileHandle?.name || "";
      return /\.(html|htm)$/i.test(path);
    }

    function syncEditorToPreview() {
      if (!state.syncScrollingEnabled || state.isPreviewScrolling) return;
      if (isActiveTabHtml()) return; // iframe handles its own scroll
      var editorTarget = getActiveEditorScrollTarget();
      var previewTarget = getActivePreviewScrollTarget();
      if (!editorTarget || !previewTarget) return;

      state.isEditorScrolling = true;
      clearTimeout(state.scrollSyncTimeout);

      state.scrollSyncTimeout = setTimeout(function () {
        var editorScrollRatio =
          editorTarget.scrollTop /
          (editorTarget.scrollHeight - editorTarget.clientHeight);
        var previewScrollPosition =
          (previewTarget.scrollHeight - previewTarget.clientHeight) *
          editorScrollRatio;

        if (!isNaN(previewScrollPosition) && isFinite(previewScrollPosition)) {
          previewTarget.scrollTop = previewScrollPosition;
        }

        setTimeout(function () {
          state.isEditorScrolling = false;
        }, 50);
      }, delay);
    }

    function syncPreviewToEditor() {
      if (!state.syncScrollingEnabled || state.isEditorScrolling) return;
      if (isActiveTabHtml()) return; // iframe handles its own scroll
      var editorTarget = getActiveEditorScrollTarget();
      var previewTarget = getActivePreviewScrollTarget();
      if (!editorTarget || !previewTarget) return;

      state.isPreviewScrolling = true;
      clearTimeout(state.scrollSyncTimeout);

      state.scrollSyncTimeout = setTimeout(function () {
        var previewScrollRatio =
          previewTarget.scrollTop /
          (previewTarget.scrollHeight - previewTarget.clientHeight);
        var editorScrollPosition =
          (editorTarget.scrollHeight - editorTarget.clientHeight) *
          previewScrollRatio;

        if (!isNaN(editorScrollPosition) && isFinite(editorScrollPosition)) {
          editorTarget.scrollTop = editorScrollPosition;
        }

        setTimeout(function () {
          state.isPreviewScrolling = false;
        }, 50);
      }, delay);
    }

    function updateSyncToggleButtons() {
      deps.syncToggleButtons.forEach(function (button) {
        if (state.syncScrollingEnabled) {
          button.innerHTML = '<i class="bi bi-link-45deg"></i> <span>Sync Off</span>';
          button.classList.add("sync-disabled");
          button.classList.remove("sync-enabled");
          button.classList.add("border-primary");
          button.setAttribute("aria-label", "Turn sync scrolling off");
        } else {
          button.innerHTML = '<i class="bi bi-link"></i> <span>Sync On</span>';
          button.classList.add("sync-enabled");
          button.classList.remove("sync-disabled");
          button.classList.remove("border-primary");
          button.setAttribute("aria-label", "Turn sync scrolling on");
        }
      });
    }

    function toggleSyncScrolling() {
      state.syncScrollingEnabled = !state.syncScrollingEnabled;
      updateSyncToggleButtons();
      deps.saveGlobalState({ syncScrollingEnabled: state.syncScrollingEnabled });
    }

    function bindScrollSync() {
      refreshActiveScrollTargets();
      deps.syncToggleButtons.forEach(function (button) {
        button.addEventListener("click", toggleSyncScrolling);
      });
    }

    var api = {
      bindScrollSync: bindScrollSync,
      refreshActiveScrollTargets: refreshActiveScrollTargets,
      syncEditorToPreview: syncEditorToPreview,
      syncPreviewToEditor: syncPreviewToEditor,
      toggleSyncScrolling: toggleSyncScrolling,
      updateSyncToggleButtons: updateSyncToggleButtons,
    };

    app.services.scrollSync = api;
    app.registerModule("scrollSync", api);
    return api;
  }

  window.registerMarkdownViewerScrollSync = registerScrollSync;
})(window);
