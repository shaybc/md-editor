(function(global) {
  global.registerMarkdownViewerViewLayout = function registerMarkdownViewerViewLayout(app, deps) {
    const api = {};

    with (deps) {
  // View Mode Functions - Story 1.1 & 1.2
  function isMarkdownDocumentTab(tab) {
    if (!tab || tab.type === "graph" || tab.type === "large-file" || tab.type === "file-preview" || tab.type === "file-compare" || tab.type === "api-client") return false;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return path ? isMarkdownPath(path) : tab.type === "markdown";
  }

  function updateViewModeButtons(mode) {
    const activeTab = getActiveTab();
    const graphActiveTab = !!(activeTab && activeTab.type === "graph");
    const largeFileActiveTab = !!(activeTab && activeTab.type === "large-file");
    const previewableActiveTab = isPreviewableDocumentTab(activeTab);
    const editorOnlyActiveTab = !!(activeTab && activeTab.type !== "graph" && activeTab.type !== "large-file" && !previewableActiveTab);

    if (contentContainer) {
      contentContainer.classList.toggle("markdown-tab-active", isMarkdownDocumentTab(activeTab));
      contentContainer.classList.toggle("editor-only-tab-active", editorOnlyActiveTab);
    }

    function updateButton(btn) {
      const btnMode = btn.getAttribute('data-mode');
      const isActive = btnMode === mode;
      const isDisabled = (graphActiveTab || largeFileActiveTab) ? btnMode !== 'preview' : (editorOnlyActiveTab && btnMode !== 'editor');
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.disabled = isDisabled;
      btn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
      if (isDisabled) {
        if (graphActiveTab || largeFileActiveTab) {
          btn.title = `${btnMode === 'editor' ? 'Editor only' : 'Split view'} is unavailable for this tab`;
        } else {
          btn.title = `${btnMode === 'split' ? 'Split view' : 'Preview only'} is available only for Markdown and HTML files`;
        }
      } else if (btnMode === 'editor') {
        btn.title = editorOnlyActiveTab ? 'Editor only (required for this file type)' : 'Editor only';
      } else if (btnMode === 'split') {
        btn.title = 'Split view';
      } else if (btnMode === 'preview') {
        btn.title = 'Preview only';
      }
    }

    viewModeButtons.forEach(updateButton);
    mobileViewModeButtons.forEach(updateButton);
  }

  function setViewMode(mode, shouldPersist = true, options = {}) {
    mode = getAllowedViewModeForActiveTab(mode);
    if (mode === currentViewMode) {
      contentContainer.classList.remove('view-editor-only', 'view-preview-only', 'view-split');
      contentContainer.classList.add('view-' + (mode === 'editor' ? 'editor-only' : mode === 'preview' ? 'preview-only' : 'split'));
      updateViewModeButtons(mode);
      updateSyncToggleVisibility(mode);
      if (mode === 'split') {
        applyPaneWidths();
      } else {
        resetPaneWidths();
      }
      if (shouldPersist && typeof onViewModeChanged === "function") {
        onViewModeChanged(mode, { previousMode: currentViewMode, shouldPersist, unchanged: true });
      }
      return;
    }

    const previousMode = currentViewMode;
    currentViewMode = mode;
    if (shouldPersist) {
      saveGlobalState({ viewMode: mode });
    }
    if (shouldPersist && typeof onViewModeChanged === "function") {
      onViewModeChanged(mode, { previousMode, shouldPersist });
    }

    // Update content container class
    contentContainer.classList.remove('view-editor-only', 'view-preview-only', 'view-split');
    contentContainer.classList.add('view-' + (mode === 'editor' ? 'editor-only' : mode === 'preview' ? 'preview-only' : 'split'));

    updateViewModeButtons(mode);

    // Story 1.2: Show/hide sync toggle based on view mode
    updateSyncToggleVisibility(mode);

    // Story 1.3: Handle pane widths when switching modes
    if (mode === 'split') {
      // Restore preserved pane widths when entering split mode
      applyPaneWidths();
    } else {
      // Reset inline pane widths when not in split mode
      resetPaneWidths();
    }

    // Re-render markdown when switching to a view that includes preview
    if ((mode === 'split' || mode === 'preview') && options.skipRender !== true) {
      renderMarkdown({
        reason: "view-mode-change",
        reuseCache: previousMode !== "editor"
      });
    } else {
      scheduleEditorLineNumbersUpdate();
    }
  }

  // Story 1.2: Update sync toggle visibility
  function updateSyncToggleVisibility(mode) {
    const isSplitView = mode === 'split';

    syncToggleButtons.forEach((button) => {
      button.style.display = isSplitView ? '' : 'none';
      button.setAttribute('aria-hidden', !isSplitView);
    });
  }

  // Story 1.3: Resize Divider Functions
  let activeResizeDividerElement = null;
  let resizerInitialized = false;
  let editorWorkspaceResizeObserver = null;

  function getActiveLayoutTargets() {
    const activeEditorPane = typeof getActiveEditorPane === "function" ? getActiveEditorPane() : null;
    const activePreviewPane = typeof getActivePreviewPane === "function" ? getActivePreviewPane() : null;
    const activeResizeDivider = typeof getActiveResizeDivider === "function" ? getActiveResizeDivider() : null;
    const activeEditor = typeof getActiveMarkdownEditor === "function" ? getActiveMarkdownEditor() : null;
    return {
      editorPaneElement: activeEditorPane || editorPaneElement,
      previewPaneElement: activePreviewPane || previewPaneElement,
      resizeDivider: activeResizeDivider || resizeDivider,
      markdownEditor: activeEditor || deps.markdownEditor || null
    };
  }

  function refreshActiveResizeTarget() {
    const nextResizeDivider = getActiveLayoutTargets().resizeDivider;
    if (activeResizeDividerElement === nextResizeDivider) return activeResizeDividerElement;
    if (activeResizeDividerElement) {
      activeResizeDividerElement.removeEventListener('mousedown', startResize);
      activeResizeDividerElement.removeEventListener('touchstart', startResizeTouch);
      activeResizeDividerElement.classList.remove('dragging');
    }
    activeResizeDividerElement = nextResizeDivider || null;
    if (activeResizeDividerElement) {
      activeResizeDividerElement.addEventListener('mousedown', startResize);
      activeResizeDividerElement.addEventListener('touchstart', startResizeTouch);
    }
    return activeResizeDividerElement;
  }

  /** Reapply the saved split percentage whenever the available editor width changes. */
  function observeEditorWorkspaceWidth() {
    const workspace = typeof editorWorkspaceElement !== "undefined" ? editorWorkspaceElement : null;
    if (editorWorkspaceResizeObserver || typeof ResizeObserver !== "function" || !workspace) return;
    editorWorkspaceResizeObserver = new ResizeObserver(function() {
      if (currentViewMode === "split") applyPaneWidths();
    });
    editorWorkspaceResizeObserver.observe(workspace);
  }

  function initResizer() {
    refreshActiveResizeTarget();
    if (resizerInitialized) return;
    resizerInitialized = true;
    observeEditorWorkspaceWidth();

    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('resize', function() {
      clampSidebarWidthToViewport();
      clampAiCompanionPanelWidthToViewport();
      applyPaneWidths();
    });

    document.addEventListener('touchmove', handleResizeTouch);
    document.addEventListener('touchend', stopResize);

    if (sidebarDropzoneResizer) {
      sidebarDropzoneResizer.addEventListener('mousedown', startSidebarDropzoneResize);
      document.addEventListener('mousemove', handleSidebarDropzoneResize);
      document.addEventListener('mouseup', stopSidebarDropzoneResize);
    }

    if (sidebarWidthResizer) {
      sidebarWidthResizer.addEventListener('mousedown', startSidebarWidthResize);
      document.addEventListener('mousemove', handleSidebarWidthResize);
      document.addEventListener('mouseup', stopSidebarWidthResize);
      sidebarWidthResizer.addEventListener('touchstart', startSidebarWidthResizeTouch);
      document.addEventListener('touchmove', handleSidebarWidthResizeTouch);
      document.addEventListener('touchend', stopSidebarWidthResize);
      sidebarWidthResizer.addEventListener('keydown', handleSidebarWidthResizeKeydown);
    }

    const rightSidebarWidthResizers = [aiCompanionWidthResizer, typeof rightSidebarWidthResizer !== "undefined" ? rightSidebarWidthResizer : null].filter(Boolean);
    if (rightSidebarWidthResizers.length) {
      rightSidebarWidthResizers.forEach((resizer) => {
        resizer.addEventListener('mousedown', startAiCompanionWidthResize);
        resizer.addEventListener('touchstart', startAiCompanionWidthResizeTouch);
        resizer.addEventListener('keydown', handleAiCompanionWidthResizeKeydown);
      });
      document.addEventListener('mousemove', handleAiCompanionWidthResize);
      document.addEventListener('mouseup', stopAiCompanionWidthResize);
      document.addEventListener('touchmove', handleAiCompanionWidthResizeTouch);
      document.addEventListener('touchend', stopAiCompanionWidthResize);
    }
  }

  function startSidebarWidthResize(e) {
    if (!folderTreePane || !isSidebarVisible()) return;
    e.preventDefault();
    isSidebarWidthResizing = true;
    folderTreePane.classList.add('sidebar-width-resizing');
    document.body.classList.add('resizing');
  }

  function startSidebarWidthResizeTouch(e) {
    if (!e.touches[0]) return;
    startSidebarWidthResize(e);
  }

  function getMaxSidebarWidth() {
    const containerWidth = contentContainer ? contentContainer.getBoundingClientRect().width : window.innerWidth;
    return Math.max(MIN_SIDEBAR_WIDTH, containerWidth - MIN_EDITOR_WORKSPACE_WIDTH);
  }

  function getClampedSidebarWidth(width) {
    const numericWidth = Number.parseFloat(width);
    const fallbackWidth = Number.isFinite(numericWidth) ? numericWidth : DEFAULT_SIDEBAR_WIDTH;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(getMaxSidebarWidth(), fallbackWidth));
  }

  function getMaxSidebarDropzoneHeight() {
    if (!folderTreePane) return MIN_SIDEBAR_PANEL_HEIGHT;
    const resizerHeight = sidebarDropzoneResizer ? sidebarDropzoneResizer.offsetHeight : 0;
    return Math.max(MIN_SIDEBAR_PANEL_HEIGHT, folderTreePane.getBoundingClientRect().height - MIN_SIDEBAR_PANEL_HEIGHT - resizerHeight);
  }

  function getClampedSidebarDropzoneHeight(height) {
    const numericHeight = Number.parseFloat(height);
    if (!Number.isFinite(numericHeight)) return null;
    return Math.max(MIN_SIDEBAR_PANEL_HEIGHT, Math.min(getMaxSidebarDropzoneHeight(), numericHeight));
  }

  function applySidebarDropzoneHeight(height, shouldPersist = true) {
    if (!sidebarDropzonePanel) return;
    const sidebarDropzoneHeight = getClampedSidebarDropzoneHeight(height);
    if (sidebarDropzoneHeight === null) return;
    const flexValue = `0 0 ${sidebarDropzoneHeight}px`;
    sidebarDropzonePanel.style.flex = flexValue;
    sidebarDropzonePanel.dataset.previousFlex = flexValue;
    if (shouldPersist) {
      saveGlobalState({ sidebarDropzoneHeight });
      notifyPanelSizesChanged();
    }
  }

  function applySidebarWidth(width, shouldPersist = true) {
    if (!folderTreePane) return;
    const sidebarWidth = getClampedSidebarWidth(width);
    folderTreePane.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    if (appStatusLineElement) {
      appStatusLineElement.style.setProperty('--status-sidebar-width', `${sidebarWidth}px`);
    }
    updateSidebarWidthResizerAccessibility(sidebarWidth);
    if (shouldPersist) {
      saveGlobalState({ sidebarWidth });
      notifyPanelSizesChanged();
    }
    if (currentViewMode === 'split') {
      requestAnimationFrame(applyPaneWidths);
    }
  }

  function updateSidebarWidthResizerAccessibility(sidebarWidth) {
    if (!sidebarWidthResizer) return;
    sidebarWidthResizer.setAttribute('aria-valuemin', String(MIN_SIDEBAR_WIDTH));
    sidebarWidthResizer.setAttribute('aria-valuemax', String(Math.round(getMaxSidebarWidth())));
    sidebarWidthResizer.setAttribute('aria-valuenow', String(Math.round(sidebarWidth)));
  }

  function updateSidebarWidthFromClientX(clientX, shouldPersist = false) {
    if (!folderTreePane || !contentContainer) return;
    const containerRect = contentContainer.getBoundingClientRect();
    applySidebarWidth(clientX - containerRect.left, shouldPersist);
    scheduleEditorLineNumbersUpdate();
  }

  function handleSidebarWidthResizeKeydown(e) {
    if (!folderTreePane || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const currentWidth = folderTreePane.getBoundingClientRect().width;
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'Home') applySidebarWidth(MIN_SIDEBAR_WIDTH);
    if (e.key === 'End') applySidebarWidth(getMaxSidebarWidth());
    if (e.key === 'ArrowLeft') applySidebarWidth(currentWidth - step);
    if (e.key === 'ArrowRight') applySidebarWidth(currentWidth + step);
    scheduleEditorLineNumbersUpdate();
  }

  function handleSidebarWidthResize(e) {
    if (!isSidebarWidthResizing) return;
    updateSidebarWidthFromClientX(e.clientX);
  }

  function handleSidebarWidthResizeTouch(e) {
    if (!isSidebarWidthResizing || !e.touches[0]) return;
    updateSidebarWidthFromClientX(e.touches[0].clientX);
  }

  function stopSidebarWidthResize() {
    if (!isSidebarWidthResizing) return;
    isSidebarWidthResizing = false;
    folderTreePane.classList.remove('sidebar-width-resizing');
    document.body.classList.remove('resizing');
    applySidebarWidth(folderTreePane.getBoundingClientRect().width);
  }

  function clampSidebarWidthToViewport() {
    if (!folderTreePane) return;
    applySidebarWidth(folderTreePane.getBoundingClientRect().width);
  }

  function getAiCompanionResizeTarget() {
    const rightSidebar = typeof rightSidebarElement !== "undefined" ? rightSidebarElement : null;
    if (rightSidebar && rightSidebar.hidden !== true) return rightSidebar;
    return aiCompanionPanelElement || null;
  }

  function startAiCompanionWidthResize(e) {
    if (document.body.classList.contains('ai-companion-workspace-open')) return;
    const resizeTarget = getAiCompanionResizeTarget();
    if (!resizeTarget || (resizeTarget === aiCompanionPanelElement && !document.body.classList.contains('ai-companion-open'))) return;
    e.preventDefault();
    isAiCompanionWidthResizing = true;
    resizeTarget.classList.add('ai-companion-width-resizing');
    document.body.classList.add('resizing');
    document.body.classList.add('ai-companion-width-resizing');
  }

  function startAiCompanionWidthResizeTouch(e) {
    if (!e.touches[0]) return;
    startAiCompanionWidthResize(e);
  }

  function getMaxAiCompanionPanelWidth() {
    const containerWidth = contentContainer ? contentContainer.getBoundingClientRect().width : window.innerWidth;
    const maxWidth = containerWidth * AI_COMPANION_PANEL_MAX_WIDTH_PERCENT / 100;
    return Math.max(MIN_AI_COMPANION_PANEL_WIDTH, maxWidth);
  }

  function getClampedAiCompanionPanelWidth(width) {
    const numericWidth = Number.parseFloat(width);
    const fallbackWidth = Number.isFinite(numericWidth) ? numericWidth : DEFAULT_AI_COMPANION_PANEL_WIDTH;
    return Math.max(MIN_AI_COMPANION_PANEL_WIDTH, Math.min(getMaxAiCompanionPanelWidth(), fallbackWidth));
  }

  function applyAiCompanionPanelWidth(width, shouldPersist = true) {
    const resizeTarget = getAiCompanionResizeTarget();
    if (!resizeTarget) return;
    aiCompanionPanelWidth = getClampedAiCompanionPanelWidth(width);
    aiCompanionPanelElement?.style?.setProperty('--ai-companion-panel-width', aiCompanionPanelWidth + 'px');
    resizeTarget.style.setProperty('--ai-companion-panel-width', aiCompanionPanelWidth + 'px');
    updateAiCompanionWidthResizerAccessibility(aiCompanionPanelWidth);
    if (shouldPersist) {
      saveGlobalState({ aiCompanionPanelWidth });
      notifyPanelSizesChanged();
    }
  }

  function updateAiCompanionWidthResizerAccessibility(aiCompanionPanelWidth) {
    [aiCompanionWidthResizer, typeof rightSidebarWidthResizer !== "undefined" ? rightSidebarWidthResizer : null].filter(Boolean).forEach((resizer) => {
      resizer.setAttribute('aria-valuemin', String(MIN_AI_COMPANION_PANEL_WIDTH));
      resizer.setAttribute('aria-valuemax', String(Math.round(getMaxAiCompanionPanelWidth())));
      resizer.setAttribute('aria-valuenow', String(Math.round(aiCompanionPanelWidth)));
    });
  }

  function updateAiCompanionPanelWidthFromClientX(clientX, shouldPersist = false) {
    if (!getAiCompanionResizeTarget() || !contentContainer) return;
    const containerRect = contentContainer.getBoundingClientRect();
    applyAiCompanionPanelWidth(containerRect.right - clientX, shouldPersist);
  }

  function handleAiCompanionWidthResizeKeydown(e) {
    if (document.body.classList.contains('ai-companion-workspace-open')) return;
    const resizeTarget = getAiCompanionResizeTarget();
    if (!resizeTarget || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const currentWidth = resizeTarget.getBoundingClientRect().width;
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'Home') applyAiCompanionPanelWidth(MIN_AI_COMPANION_PANEL_WIDTH);
    if (e.key === 'End') applyAiCompanionPanelWidth(getMaxAiCompanionPanelWidth());
    if (e.key === 'ArrowLeft') applyAiCompanionPanelWidth(currentWidth + step);
    if (e.key === 'ArrowRight') applyAiCompanionPanelWidth(currentWidth - step);
  }

  function handleAiCompanionWidthResize(e) {
    if (!isAiCompanionWidthResizing) return;
    updateAiCompanionPanelWidthFromClientX(e.clientX);
  }

  function handleAiCompanionWidthResizeTouch(e) {
    if (!isAiCompanionWidthResizing || !e.touches[0]) return;
    updateAiCompanionPanelWidthFromClientX(e.touches[0].clientX);
  }

  function stopAiCompanionWidthResize() {
    if (!isAiCompanionWidthResizing) return;
    isAiCompanionWidthResizing = false;
    aiCompanionPanelElement?.classList?.remove('ai-companion-width-resizing');
    if (typeof rightSidebarElement !== "undefined") rightSidebarElement?.classList?.remove('ai-companion-width-resizing');
    document.body.classList.remove('resizing');
    document.body.classList.remove('ai-companion-width-resizing');
    const resizeTarget = getAiCompanionResizeTarget();
    if (resizeTarget) applyAiCompanionPanelWidth(resizeTarget.getBoundingClientRect().width);
  }

  function clampAiCompanionPanelWidthToViewport() {
    const resizeTarget = getAiCompanionResizeTarget();
    if (!resizeTarget) return;
    applyAiCompanionPanelWidth(resizeTarget.getBoundingClientRect().width, false);
  }

  function getCurrentPanelSizes() {
    const state = typeof loadGlobalState === "function" ? loadGlobalState() : {};
    const sidebarWidth = Number(folderTreePane?.getBoundingClientRect?.().width || state.sidebarWidth);
    const sidebarDropzoneHeight = Number(sidebarDropzonePanel?.getBoundingClientRect?.().height || state.sidebarDropzoneHeight);
    const rightSidebarWidth = Number(getAiCompanionResizeTarget()?.getBoundingClientRect?.().width || state.aiCompanionPanelWidth || aiCompanionPanelWidth);
    const bottomPanelHeight = Number(app.modules?.bottomPanelTabs?.getPanelHeight?.());
    const sizes = {};
    if (Number.isFinite(sidebarWidth) && sidebarWidth > 0) sizes.sidebarWidth = Math.round(getClampedSidebarWidth(sidebarWidth));
    if (Number.isFinite(sidebarDropzoneHeight) && sidebarDropzoneHeight > 0) {
      const clampedSidebarDropzoneHeight = getClampedSidebarDropzoneHeight(sidebarDropzoneHeight);
      if (clampedSidebarDropzoneHeight !== null) sizes.sidebarDropzoneHeight = Math.round(clampedSidebarDropzoneHeight);
    }
    if (Number.isFinite(rightSidebarWidth) && rightSidebarWidth > 0) sizes.rightSidebarWidth = Math.round(getClampedAiCompanionPanelWidth(rightSidebarWidth));
    if (Number.isFinite(bottomPanelHeight) && bottomPanelHeight >= MIN_SIDEBAR_PANEL_HEIGHT) sizes.bottomPanelHeight = Math.round(bottomPanelHeight);
    return sizes;
  }

  function getDefaultPanelSizes() {
    return {
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      sidebarDropzoneHeight: MIN_SIDEBAR_PANEL_HEIGHT,
      rightSidebarWidth: DEFAULT_AI_COMPANION_PANEL_WIDTH,
      bottomPanelHeight: 220
    };
  }

  function notifyPanelSizesChanged() {
    if (typeof onPanelSizesChanged === "function") onPanelSizesChanged(getCurrentPanelSizes());
  }

  function applyPanelSizes(sizes = {}) {
    if (!sizes || typeof sizes !== "object") return;
    if (Number.isFinite(Number(sizes.sidebarWidth))) applySidebarWidth(sizes.sidebarWidth, false);
    if (Number.isFinite(Number(sizes.sidebarDropzoneHeight))) applySidebarDropzoneHeight(sizes.sidebarDropzoneHeight, false);
    if (Number.isFinite(Number(sizes.rightSidebarWidth))) {
      const rightSidebarWidth = getClampedAiCompanionPanelWidth(sizes.rightSidebarWidth);
      aiCompanionPanelWidth = rightSidebarWidth;
      aiCompanionPanelElement?.style?.setProperty('--ai-companion-panel-width', rightSidebarWidth + 'px');
      if (typeof rightSidebarElement !== "undefined") rightSidebarElement?.style?.setProperty('--ai-companion-panel-width', rightSidebarWidth + 'px');
      getAiCompanionResizeTarget()?.style?.setProperty('--ai-companion-panel-width', rightSidebarWidth + 'px');
      updateAiCompanionWidthResizerAccessibility(rightSidebarWidth);
    }
    if (Number.isFinite(Number(sizes.bottomPanelHeight))) app.modules?.bottomPanelTabs?.setPanelHeight?.(sizes.bottomPanelHeight, { persist: false });
  }

  function startSidebarDropzoneResize(e) {
    if (!folderTreePane || !sidebarDropzonePanel) return;
    e.preventDefault();
    isSidebarDropzoneResizing = true;
    document.body.classList.add('resizing');
  }

  function handleSidebarDropzoneResize(e) {
    if (!isSidebarDropzoneResizing || !folderTreePane || !sidebarDropzonePanel) return;
    const paneRect = folderTreePane.getBoundingClientRect();
    const resizerHeight = sidebarDropzoneResizer ? sidebarDropzoneResizer.offsetHeight : 0;
    const newDropzoneHeight = paneRect.bottom - e.clientY;
    const maxDropzoneHeight = paneRect.height - MIN_SIDEBAR_PANEL_HEIGHT - resizerHeight;
    const clampedHeight = Math.max(MIN_SIDEBAR_PANEL_HEIGHT, Math.min(maxDropzoneHeight, newDropzoneHeight));
    applySidebarDropzoneHeight(clampedHeight, false);
  }

  function stopSidebarDropzoneResize() {
    if (!isSidebarDropzoneResizing) return;
    isSidebarDropzoneResizing = false;
    document.body.classList.remove('resizing');
    applySidebarDropzoneHeight(sidebarDropzonePanel.getBoundingClientRect().height);
  }

  function startResize(e) {
    if (currentViewMode !== 'split') return;
    const activeResizeDivider = refreshActiveResizeTarget();
    if (!activeResizeDivider) return;
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.clientX);
    activeResizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function startResizeTouch(e) {
    if (currentViewMode !== 'split' || !e.touches[0]) return;
    const activeResizeDivider = refreshActiveResizeTarget();
    if (!activeResizeDivider) return;
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.touches[0].clientX);
    activeResizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function getResizePointerOffset(clientX) {
    const activeResizeDivider = getActiveLayoutTargets().resizeDivider;
    if (!activeResizeDivider) return 0;
    const dividerRect = activeResizeDivider.getBoundingClientRect();
    return clientX - dividerRect.left;
  }

  function getSplitResizeMetrics() {
    const targets = getActiveLayoutTargets();
    if (!targets.editorPaneElement || !targets.resizeDivider || !contentContainer) {
      return { left: 0, width: 0, dividerWidth: 0, dividerMidpoint: 0 };
    }
    const editorRect = targets.editorPaneElement.getBoundingClientRect();
    const containerRect = contentContainer.getBoundingClientRect();
    const splitRow = targets.editorPaneElement.closest?.(".editor-content-row");
    const splitRowRect = splitRow?.getBoundingClientRect?.();
    const dividerWidth = targets.resizeDivider.getBoundingClientRect().width;
    const splitRight = Number.isFinite(splitRowRect?.right) ? splitRowRect.right : containerRect.right;

    return {
      left: editorRect.left,
      width: splitRight - editorRect.left,
      dividerWidth,
      dividerMidpoint: dividerWidth / 2,
    };
  }

  function getClampedEditorWidthPercent(percent) {
    const numericPercent = Number.parseFloat(percent);
    const fallbackPercent = Number.isFinite(numericPercent) ? numericPercent : 50;
    return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, fallbackPercent));
  }

  /** Return whether editor tabs keep independent split-view separator positions. */
  function isSplitViewSeparatorPerTabEnabled() {
    const state = typeof loadGlobalState === "function" ? loadGlobalState() : {};
    return state.splitViewSeparatorPerTab !== false;
  }

  /** Resolve the split-view separator position for the active editor tab. */
  function getActiveEditorWidthPercent() {
    if (!isSplitViewSeparatorPerTabEnabled()) return getClampedEditorWidthPercent(editorWidthPercent);
    const activeTab = getActiveTab();
    const state = typeof loadGlobalState === "function" ? loadGlobalState() : {};
    return getClampedEditorWidthPercent(activeTab?.splitViewEditorWidthPercent ?? state.editorWidthPercent ?? editorWidthPercent);
  }

  function updateResizePosition(clientX) {
    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= 0) return;

    const dividerLeft = clientX - resizePointerOffset - resizeMetrics.left;
    const newEditorPercent = ((dividerLeft + resizeMetrics.dividerMidpoint) / resizeMetrics.width) * 100;

    editorWidthPercent = getClampedEditorWidthPercent(newEditorPercent);
    applyPaneWidths(editorWidthPercent);
    scheduleEditorLineNumbersUpdate();
  }

  function handleResize(e) {
    if (!isResizing) return;
    updateResizePosition(e.clientX);
  }

  function handleResizeTouch(e) {
    if (!isResizing || !e.touches[0]) return;
    updateResizePosition(e.touches[0].clientX);
  }

  function stopResize() {
    if (!isResizing) return;
    isResizing = false;
    const activeResizeDivider = getActiveLayoutTargets().resizeDivider || activeResizeDividerElement;
    if (activeResizeDivider) activeResizeDivider.classList.remove('dragging');
    document.body.classList.remove('resizing');
    if (isSplitViewSeparatorPerTabEnabled()) {
      if (typeof onSplitViewSeparatorChanged === "function") onSplitViewSeparatorChanged(editorWidthPercent);
    } else {
      saveGlobalState({ editorWidthPercent });
    }
  }

  function applyPaneWidths(widthPercent = getActiveEditorWidthPercent()) {
    if (currentViewMode !== 'split') return;
    const targets = getActiveLayoutTargets();
    if (!targets.editorPaneElement || !targets.previewPaneElement) return;

    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= resizeMetrics.dividerWidth) return;

    const editorBasis = (resizeMetrics.width * getClampedEditorWidthPercent(widthPercent) / 100) - resizeMetrics.dividerMidpoint;
    const previewBasis = resizeMetrics.width - resizeMetrics.dividerWidth - editorBasis;

    targets.editorPaneElement.style.flex = `0 0 ${editorBasis}px`;
    targets.previewPaneElement.style.flex = `0 0 ${previewBasis}px`;
    scheduleEditorLineNumbersUpdate();
  }

  function resetPaneWidths() {
    const targets = getActiveLayoutTargets();
    if (targets.editorPaneElement) targets.editorPaneElement.style.flex = '';
    if (targets.previewPaneElement) targets.previewPaneElement.style.flex = '';
    scheduleEditorLineNumbersUpdate();
  }


      api.updateViewModeButtons = updateViewModeButtons;
      api.setViewMode = setViewMode;
      api.updateSyncToggleVisibility = updateSyncToggleVisibility;
      api.initResizer = initResizer;
      api.refreshActiveResizeTarget = refreshActiveResizeTarget;
      api.getActiveLayoutTargets = getActiveLayoutTargets;
      api.startSidebarWidthResize = startSidebarWidthResize;
      api.startSidebarWidthResizeTouch = startSidebarWidthResizeTouch;
      api.getMaxSidebarWidth = getMaxSidebarWidth;
      api.getClampedSidebarWidth = getClampedSidebarWidth;
      api.getMaxSidebarDropzoneHeight = getMaxSidebarDropzoneHeight;
      api.getClampedSidebarDropzoneHeight = getClampedSidebarDropzoneHeight;
      api.applySidebarDropzoneHeight = applySidebarDropzoneHeight;
      api.applySidebarWidth = applySidebarWidth;
      api.updateSidebarWidthResizerAccessibility = updateSidebarWidthResizerAccessibility;
      api.updateSidebarWidthFromClientX = updateSidebarWidthFromClientX;
      api.handleSidebarWidthResizeKeydown = handleSidebarWidthResizeKeydown;
      api.handleSidebarWidthResize = handleSidebarWidthResize;
      api.handleSidebarWidthResizeTouch = handleSidebarWidthResizeTouch;
      api.stopSidebarWidthResize = stopSidebarWidthResize;
      api.clampSidebarWidthToViewport = clampSidebarWidthToViewport;
      api.startAiCompanionWidthResize = startAiCompanionWidthResize;
      api.startAiCompanionWidthResizeTouch = startAiCompanionWidthResizeTouch;
      api.getMaxAiCompanionPanelWidth = getMaxAiCompanionPanelWidth;
      api.getClampedAiCompanionPanelWidth = getClampedAiCompanionPanelWidth;
      api.applyAiCompanionPanelWidth = applyAiCompanionPanelWidth;
      api.updateAiCompanionWidthResizerAccessibility = updateAiCompanionWidthResizerAccessibility;
      api.updateAiCompanionPanelWidthFromClientX = updateAiCompanionPanelWidthFromClientX;
      api.handleAiCompanionWidthResizeKeydown = handleAiCompanionWidthResizeKeydown;
      api.handleAiCompanionWidthResize = handleAiCompanionWidthResize;
      api.handleAiCompanionWidthResizeTouch = handleAiCompanionWidthResizeTouch;
      api.stopAiCompanionWidthResize = stopAiCompanionWidthResize;
      api.clampAiCompanionPanelWidthToViewport = clampAiCompanionPanelWidthToViewport;
      api.getCurrentPanelSizes = getCurrentPanelSizes;
      api.getDefaultPanelSizes = getDefaultPanelSizes;
      api.applyPanelSizes = applyPanelSizes;
      api.startSidebarDropzoneResize = startSidebarDropzoneResize;
      api.handleSidebarDropzoneResize = handleSidebarDropzoneResize;
      api.stopSidebarDropzoneResize = stopSidebarDropzoneResize;
      api.startResize = startResize;
      api.startResizeTouch = startResizeTouch;
      api.getResizePointerOffset = getResizePointerOffset;
      api.getSplitResizeMetrics = getSplitResizeMetrics;
      api.getClampedEditorWidthPercent = getClampedEditorWidthPercent;
      api.updateResizePosition = updateResizePosition;
      api.handleResize = handleResize;
      api.handleResizeTouch = handleResizeTouch;
      api.stopResize = stopResize;
      api.applyPaneWidths = applyPaneWidths;
      api.resetPaneWidths = resetPaneWidths;
    }

    return api;
  };
})(window);
