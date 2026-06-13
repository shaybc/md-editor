(function(global) {
  global.registerMarkdownViewerViewLayout = function registerMarkdownViewerViewLayout(app, deps) {
    const api = {};

    with (deps) {
  // View Mode Functions - Story 1.1 & 1.2
  function updateViewModeButtons(mode) {
    const activeTab = getActiveTab();
    const graphActiveTab = !!(activeTab && activeTab.type === "graph");
    const previewableActiveTab = isPreviewableDocumentTab(activeTab);
    const editorOnlyActiveTab = !!(activeTab && activeTab.type !== "graph" && !previewableActiveTab);

    if (contentContainer) {
      contentContainer.classList.toggle("markdown-tab-active", previewableActiveTab);
      contentContainer.classList.toggle("editor-only-tab-active", editorOnlyActiveTab);
    }

    function updateButton(btn) {
      const btnMode = btn.getAttribute('data-mode');
      const isActive = btnMode === mode;
      const isDisabled = graphActiveTab ? btnMode !== 'preview' : (editorOnlyActiveTab && btnMode !== 'editor');
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.disabled = isDisabled;
      btn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
      if (isDisabled) {
        if (graphActiveTab) {
          btn.title = `${btnMode === 'editor' ? 'Editor only' : 'Split view'} is unavailable for graph tabs`;
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

  function setViewMode(mode, shouldPersist = true) {
    mode = getAllowedViewModeForActiveTab(mode);
    if (mode === currentViewMode) {
      updateViewModeButtons(mode);
      updateSyncToggleVisibility(mode);
      return;
    }

    const previousMode = currentViewMode;
    currentViewMode = mode;
    if (shouldPersist) {
      saveGlobalState({ viewMode: mode });
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
    if (mode === 'split' || mode === 'preview') {
      renderMarkdown();
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
  function initResizer() {
    if (!resizeDivider) return;

    resizeDivider.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('resize', function() {
      clampSidebarWidthToViewport();
      applyPaneWidths();
    });

    // Touch support for tablets (though disabled via CSS, keeping for future)
    resizeDivider.addEventListener('touchstart', startResizeTouch);
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
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.clientX);
    resizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function startResizeTouch(e) {
    if (currentViewMode !== 'split' || !e.touches[0]) return;
    e.preventDefault();
    isResizing = true;
    resizePointerOffset = getResizePointerOffset(e.touches[0].clientX);
    resizeDivider.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function getResizePointerOffset(clientX) {
    const dividerRect = resizeDivider.getBoundingClientRect();
    return clientX - dividerRect.left;
  }

  function getSplitResizeMetrics() {
    const editorRect = editorPaneElement.getBoundingClientRect();
    const containerRect = contentContainer.getBoundingClientRect();
    const dividerWidth = resizeDivider.getBoundingClientRect().width;

    return {
      left: editorRect.left,
      width: containerRect.right - editorRect.left,
      dividerWidth,
      dividerMidpoint: dividerWidth / 2,
    };
  }

  function getClampedEditorWidthPercent(percent) {
    const numericPercent = Number.parseFloat(percent);
    const fallbackPercent = Number.isFinite(numericPercent) ? numericPercent : 50;
    return Math.max(MIN_PANE_PERCENT, Math.min(100 - MIN_PANE_PERCENT, fallbackPercent));
  }

  function updateResizePosition(clientX) {
    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= 0) return;

    const dividerLeft = clientX - resizePointerOffset - resizeMetrics.left;
    const newEditorPercent = ((dividerLeft + resizeMetrics.dividerMidpoint) / resizeMetrics.width) * 100;

    editorWidthPercent = getClampedEditorWidthPercent(newEditorPercent);
    applyPaneWidths();
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
    resizeDivider.classList.remove('dragging');
    document.body.classList.remove('resizing');
    saveGlobalState({ editorWidthPercent });
  }

  function applyPaneWidths() {
    if (currentViewMode !== 'split') return;

    const resizeMetrics = getSplitResizeMetrics();
    if (resizeMetrics.width <= resizeMetrics.dividerWidth) return;

    const editorBasis = (resizeMetrics.width * editorWidthPercent / 100) - resizeMetrics.dividerMidpoint;
    const previewBasis = resizeMetrics.width - resizeMetrics.dividerWidth - editorBasis;

    editorPaneElement.style.flex = `0 0 ${editorBasis}px`;
    previewPaneElement.style.flex = `0 0 ${previewBasis}px`;
    scheduleEditorLineNumbersUpdate();
  }

  function resetPaneWidths() {
    editorPaneElement.style.flex = '';
    previewPaneElement.style.flex = '';
    scheduleEditorLineNumbersUpdate();
  }


      api.updateViewModeButtons = updateViewModeButtons;
      api.setViewMode = setViewMode;
      api.updateSyncToggleVisibility = updateSyncToggleVisibility;
      api.initResizer = initResizer;
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
