(function(global) {
  global.registerMarkdownViewerTabs = function registerMarkdownViewerTabs(app, deps) {
    const api = {};

    with (deps) {
  function nextUntitledTitle() {
    untitledCounter += 1;
    saveUntitledCounter(untitledCounter);
    return 'Untitled ' + untitledCounter;
  }

  function createTab(content, title, viewMode) {
    if (content === undefined) content = '';
    content = normalizeEditorContent(content);
    if (title === undefined) title = null;
    if (viewMode === undefined) viewMode = loadGlobalState().viewMode || 'split';
    return {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      title: title || 'Untitled',
      content: content,
      scrollPos: 0,
      viewMode: viewMode,
      createdAt: Date.now(),
      isTemporary: false,
      sourceFileName: null,
      sourceFileHandle: null,
      sourceFilePath: null,
      savedContent: content,
      type: "markdown",
      folderName: null,
      isUnsupportedFile: false
    };
  }

  function createGraphTab(folderName, options) {
    if (options === undefined) options = {};
    const graphDocument = normalizeGraphDocument({
      ...(options.graphDocument || {}),
      folderName: folderName || options.folderName || "Graph View",
      snapshot: options.graphSnapshot !== undefined ? options.graphSnapshot : options.graphDocument?.snapshot,
      viewConfig: options.graphViewConfig !== undefined ? options.graphViewConfig : options.graphDocument?.viewConfig,
      graphLayout: options.graphLayout !== undefined ? options.graphLayout : (options.graphDocument?.graphLayout !== undefined ? options.graphDocument.graphLayout : options.graphDocument?.layout)
    });
    const graphData = deserializeGraphDocument(graphDocument);
    const tab = createTab("", graphData.folderName, "preview");
    tab.type = "graph";
    tab.folderName = graphData.folderName;
    tab.graphViewConfig = graphData.graphViewConfig;
    tab.graphSnapshot = graphData.graphSnapshot;
    tab.graphDocument = graphData.graphDocument;
    if (options.graphScopeKey) tab.graphScopeKey = options.graphScopeKey;
    if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
    return tab;
  }

  function normalizeGraphScopePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/+$|^\s+|\s+$/g, "")
      .toLowerCase();
  }

  function createFolderGraphScopeKey(scope, value) {
    const normalizedPath = normalizeGraphScopePath(value);
    return normalizedPath ? `${scope}:${normalizedPath}` : "";
  }

  function getRootFolderGraphScopeKey() {
    return createFolderGraphScopeKey("root-folder", activeFolderPath || activeFolderName || "Graph View");
  }

  function findExistingFolderGraphTab(scopeKey, fallbackTitle) {
    if (!scopeKey && !fallbackTitle) return null;
    return tabs.find((tab) => {
      if (!tab || tab.type !== "graph" || isFileBackedGraphTab(tab)) return false;
      if (scopeKey && tab.graphScopeKey === scopeKey) return true;
      return !!(fallbackTitle && !tab.graphScopeKey && getGraphTabTitle(tab) === fallbackTitle);
    }) || null;
  }

  function focusExistingFolderGraphTab(scopeKey, fallbackTitle) {
    const existingGraphTab = findExistingFolderGraphTab(scopeKey, fallbackTitle);
    if (!existingGraphTab) return false;
    switchTab(existingGraphTab.id);
    saveActiveTabId(existingGraphTab.id);
    return true;
  }

  function getGraphTitleFromFileName(fileName) {
    return (fileName || "Saved Graph")
      .replace(/\.mdviewer-graph\.json$/i, "")
      .replace(/\.mdgraph\.json$/i, "")
      .replace(/\.json$/i, "");
  }

  function getGraphTabTitle(tab) {
    if (!tab || tab.type !== "graph") return tab?.title || 'Untitled';
    if (tab.sourceFileName) return getGraphTitleFromFileName(tab.sourceFileName) || "Saved Graph";
    if (tab.sourceFilePath) return getGraphTitleFromFileName(getFileName(tab.sourceFilePath)) || "Saved Graph";
    return tab.title || tab.folderName || "Graph View";
  }

  function getTabDisplayName(tab) {
    const baseName = tab && tab.type === "graph" ? getGraphTabTitle(tab) : (tab.title || 'Untitled');
    return tabHasUnsavedChanges(tab) ? baseName + ' *' : baseName;
  }

  function getTabTooltipText(tab) {
    if (!tab) return 'Untitled';
    return tab.sourceFilePath || tab.sourceFileName || tab.title || tab.folderName || 'Untitled';
  }

  function updateTabScrollControls() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const hasOverflow = tabList.scrollWidth > tabList.clientWidth + 1;
    scrollLeftBtn.classList.toggle('visible', hasOverflow);
    scrollRightBtn.classList.toggle('visible', hasOverflow);

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    scrollLeftBtn.disabled = !hasOverflow || tabList.scrollLeft <= 1;
    scrollRightBtn.disabled = !hasOverflow || tabList.scrollLeft >= maxScrollLeft - 1;
  }

  function scrollTabsBy(delta) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;

    tabList.scrollBy({ left: delta, behavior: 'smooth' });
    window.setTimeout(updateTabScrollControls, 180);
  }

  function setupTabScrolling() {
    const tabList = document.getElementById('tab-list');
    const scrollLeftBtn = document.getElementById('tab-scroll-left');
    const scrollRightBtn = document.getElementById('tab-scroll-right');
    if (!tabList || !scrollLeftBtn || !scrollRightBtn) return;

    const getScrollAmount = function() {
      return Math.max(160, Math.floor(tabList.clientWidth * 0.75));
    };

    scrollLeftBtn.addEventListener('click', function() {
      scrollTabsBy(-getScrollAmount());
    });

    scrollRightBtn.addEventListener('click', function() {
      scrollTabsBy(getScrollAmount());
    });

    tabList.addEventListener('wheel', function(e) {
      if (tabList.scrollWidth <= tabList.clientWidth) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      e.preventDefault();
      tabList.scrollLeft += delta;
      updateTabScrollControls();
    }, { passive: false });

    tabList.addEventListener('scroll', updateTabScrollControls);
    window.addEventListener('resize', updateTabScrollControls);
    updateTabScrollControls();
  }

  setupTabScrolling();

  function renderTabBar(tabsArr, currentActiveTabId) {
    const tabList = document.getElementById('tab-list');
    if (!tabList) return;
    tabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('data-tab-id', tab.id);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('draggable', 'true');

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        const tabIcon = document.createElement("i");
        tabIcon.className = `bi ${getFileIconClass(tab.sourceFileName || tab.sourceFilePath || tab.title)} me-1`;
        titleSpan.appendChild(tabIcon);
        titleSpan.append(document.createTextNode(displayName));
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTab(tab.id, { promptForUnsaved: true });
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab);
      });

      item.addEventListener('dblclick', function() {
        pinTemporaryTab(tab.id);
      });

      item.addEventListener('dragstart', function() {
        draggedTabId = tab.id;
        setTimeout(function() { item.classList.add('dragging'); }, 0);
      });

      item.addEventListener('dragend', function() {
        item.classList.remove('dragging');
        draggedTabId = null;
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!draggedTabId || draggedTabId === tab.id) return;
        const fromIdx = tabs.findIndex(function(t) { return t.id === draggedTabId; });
        const toIdx = tabs.findIndex(function(t) { return t.id === tab.id; });
        if (fromIdx === -1 || toIdx === -1) return;
        const moved = tabs.splice(fromIdx, 1)[0];
        tabs.splice(toIdx, 0, moved);
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      });

      tabList.appendChild(item);
    });

    // "+ Create" button at end of tab list
    const newBtn = document.createElement('button');
    newBtn.className = 'tab-new-btn';
    newBtn.title = 'New Tab (Ctrl+T)';
    newBtn.setAttribute('aria-label', 'Open new tab');
    newBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    newBtn.addEventListener('click', function() { newTab(); });
    tabList.appendChild(newBtn);

    // Auto-scroll active tab into view
    const activeItem = tabList.querySelector('.tab-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    updateTabScrollControls();
    requestAnimationFrame(updateTabScrollControls);

    renderMobileTabList(tabsArr, currentActiveTabId);
    updateSaveCurrentFileButtons();
  }

  function renderMobileTabList(tabsArr, currentActiveTabId) {
    const mobileTabList = document.getElementById('mobile-tab-list');
    if (!mobileTabList) return;
    mobileTabList.innerHTML = '';
    tabsArr.forEach(function(tab) {
      const item = document.createElement('div');
      item.className = 'mobile-tab-item' + (tab.id === currentActiveTabId ? ' active' : '') + (tabHasUnsavedChanges(tab) ? ' unsaved' : '');
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', tab.id === currentActiveTabId ? 'true' : 'false');
      item.setAttribute('data-tab-id', tab.id);

      const displayName = getTabDisplayName(tab);
      const tooltipText = getTabTooltipText(tab);
      item.title = tooltipText;
      item.setAttribute('aria-label', tooltipText);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'mobile-tab-title' + (tab.isTemporary ? ' temporary' : '');
      titleSpan.title = tooltipText;
      if (tab.type === "graph") {
        const graphIcon = document.createElement("i");
        graphIcon.className = "bi bi-diagram-3 me-1";
        titleSpan.appendChild(graphIcon);
        titleSpan.append(document.createTextNode(displayName));
      } else {
        titleSpan.textContent = displayName;
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.title = 'Close tab';
      closeBtn.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeTab(tab.id, { promptForUnsaved: true });
        closeMobileMenu();
      });

      item.appendChild(titleSpan);
      item.appendChild(closeBtn);

      item.addEventListener('click', function() {
        switchTab(tab.id);
        closeMobileMenu();
      });

      item.addEventListener('contextmenu', function(e) {
        showTabContextMenu(e, tab, { closeMobileMenuOnAction: true });
      });

      mobileTabList.appendChild(item);
    });
  }

  let tabContextMenu = null;
  let tabContextTargetId = null;
  let tabContextCloseMobileMenuOnAction = false;

  function ensureTabContextMenu() {
    if (tabContextMenu) return tabContextMenu;

    tabContextMenu = document.createElement('div');
    tabContextMenu.className = 'graph-context-menu tab-context-menu hidden';
    tabContextMenu.setAttribute('role', 'menu');
    tabContextMenu.innerHTML =
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="rename"><i class="bi bi-pencil" aria-hidden="true"></i><span class="graph-context-menu-item-label">Rename</span></button>' +
      '<button class="graph-context-menu-item tab-context-menu-action" type="button" role="menuitem" data-action="duplicate"><i class="bi bi-files" aria-hidden="true"></i><span class="graph-context-menu-item-label">Duplicate</span></button>' +
      '<div class="graph-context-menu-separator" aria-hidden="true"></div>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-others"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close others</span></button>' +
      '<button class="graph-context-menu-item graph-context-menu-item-danger tab-context-menu-action" type="button" role="menuitem" data-action="close-all"><i class="bi bi-x-lg" aria-hidden="true"></i><span class="graph-context-menu-item-label">Close all</span></button>';

    tabContextMenu.addEventListener('click', function(e) {
      e.stopPropagation();
      const actionBtn = e.target.closest('.tab-context-menu-action');
      if (!actionBtn || !tabContextTargetId) return;
      if (actionBtn.disabled) return;
      const action = actionBtn.getAttribute('data-action');
      const targetTab = tabs.find(function(tab) { return tab.id === tabContextTargetId; });
      const shouldCloseMobileMenu = tabContextCloseMobileMenuOnAction;
      hideTabContextMenu();
      if (!targetTab) return;
      if (action === 'rename') renameTab(targetTab.id);
      else if (action === 'duplicate') duplicateTab(targetTab.id);
      else if (action === 'close') closeTab(targetTab.id, { promptForUnsaved: true });
      else if (action === 'close-others') closeOtherTabs(targetTab.id);
      else if (action === 'close-all') closeAllTabs();
      if (shouldCloseMobileMenu) closeMobileMenu();
    });

    document.body.appendChild(tabContextMenu);
    return tabContextMenu;
  }

  function positionTabContextMenu(menu, event) {
    const margin = 8;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, event.clientX),
      Math.max(margin, window.innerWidth - rect.width - margin)
    );
    const top = Math.min(
      Math.max(margin, event.clientY),
      Math.max(margin, window.innerHeight - rect.height - margin)
    );
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function setTabContextMenuActionEnabled(menu, action, enabled) {
    const button = menu.querySelector('[data-action="' + action + '"]');
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.classList.toggle('disabled', !enabled);
  }

  function updateTabContextMenuActionStates(menu, tab) {
    const hasTargetTab = !!tab && tabs.some(function(openTab) { return openTab.id === tab.id; });
    setTabContextMenuActionEnabled(menu, 'close', hasTargetTab);
    setTabContextMenuActionEnabled(menu, 'close-others', hasTargetTab && tabs.length > 1);
    setTabContextMenuActionEnabled(menu, 'close-all', tabs.length > 0);
  }

  function showTabContextMenu(event, tab, options) {
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarContextMenus();
    hideTabContextMenu();

    tabContextTargetId = tab.id;
    tabContextCloseMobileMenuOnAction = !!(options && options.closeMobileMenuOnAction);
    const menu = ensureTabContextMenu();
    const isGraphTab = tab.type === 'graph';
    menu.querySelectorAll('[data-action="rename"], [data-action="duplicate"]').forEach(function(button) {
      button.classList.toggle('hidden', isGraphTab);
    });
    const separator = menu.querySelector('.graph-context-menu-separator');
    if (separator) separator.classList.toggle('hidden', isGraphTab);
    updateTabContextMenuActionStates(menu, tab);
    menu.classList.remove('hidden');
    positionTabContextMenu(menu, event);
  }

  function hideTabContextMenu() {
    if (tabContextMenu) tabContextMenu.classList.add('hidden');
    tabContextTargetId = null;
    tabContextCloseMobileMenuOnAction = false;
  }

  // Close any open tab context menu when clicking elsewhere in the document
  document.addEventListener('click', function() {
    hideTabContextMenu();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideTabContextMenu();
  });

  window.addEventListener('blur', hideTabContextMenu);

  function saveCurrentTabState() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) return;
    if (tab.type === "graph") return;
    tab.content = markdownEditor.value;
    tab.scrollPos = markdownEditor.scrollTop;
    tab.viewMode = isUnsupportedFileTab(tab) ? 'editor' : (currentViewMode || 'split');
    saveTabsToStorage(tabs);
  }

  function getActiveMarkdownTab() {
    const tab = tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab || tab.type === "graph") return null;
    return tab;
  }

  function activeTabHasUnsavedChanges() {
    const tab = getActiveMarkdownTab();
    return tabHasUnsavedChanges(tab, markdownEditor.value);
  }

  function getUnsavedTabs() {
    return tabs.filter(function(tab) {
      if (!tab) return false;
      if (tab.type === "graph") return tabHasUnsavedChanges(tab);
      const currentContent = tab.id === activeTabId ? markdownEditor.value : tab.content;
      return tabHasUnsavedChanges(tab, currentContent);
    });
  }

  const confirmDiscardUnsavedChangesBeforeExit = unsavedChanges.bindWindowExitGuards({
    getUnsavedTabs
  });

  function updateSaveCurrentFileButtons() {
    const graphTab = getActiveGraphTab();
    const tab = getActiveMarkdownTab();
    const hasUnsavedChanges = activeTabHasUnsavedChanges();
    const graphHasUnsavedChanges = tabHasUnsavedChanges(graphTab);
    const graphNeedsSave = !!(graphTab && (!isFileBackedGraphTab(graphTab) || graphHasUnsavedChanges));
    const hasWritableSource = !!(tab && (tab.sourceFileHandle || (isNeutralinoRuntime() && tab.sourceFilePath)));
    const title = graphTab
      ? "Save layout, groups, filters, hidden points, tags, and connections. File contents are not included."
      : (hasUnsavedChanges
        ? (hasWritableSource ? "Save changes to current file" : "Save changes as Markdown")
        : "No changes to save");
    const label = graphTab ? "Save Graph View" : "Save Changes";

    document.querySelectorAll(".save-current-file-button").forEach(function(button) {
      button.disabled = graphTab ? !graphNeedsSave : !hasUnsavedChanges;
      button.title = graphTab && !graphNeedsSave ? "No graph changes to save" : title;
      button.setAttribute("aria-label", title);
      const icon = button.querySelector("i");
      button.textContent = "";
      if (icon) button.append(icon, document.createTextNode(` ${label}`));
      else button.textContent = label;
    });

    const unsavedCount = getUnsavedTabs().length;
    const saveAllTitle = unsavedCount
      ? `Save all unsaved changes in ${unsavedCount} tab${unsavedCount === 1 ? "" : "s"}`
      : "No changes to save";
    document.querySelectorAll(".save-all-files-button").forEach(function(button) {
      button.disabled = unsavedCount === 0;
      button.title = saveAllTitle;
      button.setAttribute("aria-label", saveAllTitle);
    });
  }

  async function saveChangedTab(tab) {
    if (!tab) return false;
    if (tab.type === "graph") {
      if (!tabHasUnsavedChanges(tab)) return true;
      return (await saveGraphTabToSource(tab)) || (await saveGraphTabWithSaveDialog(tab));
    }

    const content = getMarkdownTabContentForSave(tab);
    if (!tabHasUnsavedChanges(tab, content)) return true;
    return (await saveMarkdownTabToSource(tab)) || (await saveMarkdownTabWithSaveDialog(tab));
  }

  async function saveAllChangedTabs() {
    saveCurrentTabState();
    const changedTabs = getUnsavedTabs();
    if (!changedTabs.length) {
      updateSaveCurrentFileButtons();
      return;
    }

    const failedTabs = [];
    let wasCanceled = false;

    for (const tab of changedTabs) {
      try {
        const saved = await saveChangedTab(tab);
        if (!saved) {
          wasCanceled = true;
          break;
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          wasCanceled = true;
          break;
        }
        console.error("Failed to save changed tab:", error);
        failedTabs.push(getTabDisplayName(tab));
      }
    }

    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    updateSaveCurrentFileButtons();

    if (failedTabs.length) {
      alert("Unable to save: " + failedTabs.join(", "));
    } else if (wasCanceled && getUnsavedTabs().length) {
      console.info("Save All canceled before all changed tabs were saved.");
    }
  }

  async function saveCurrentFileIfChanged() {
    const activeGraphTab = getActiveGraphTab();
    if (activeGraphTab) {
      if (isFileBackedGraphTab(activeGraphTab) && !tabHasUnsavedChanges(activeGraphTab)) {
        updateSaveCurrentFileButtons();
        return;
      }
      if (!(await saveActiveGraphToSource())) {
        await saveActiveGraphWithSaveDialog();
      }
      updateSaveCurrentFileButtons();
      return;
    }

    if (!activeTabHasUnsavedChanges()) {
      updateSaveCurrentFileButtons();
      return;
    }

    const tab = getActiveMarkdownTab();
    if (!tab) return;
    if (!(await saveMarkdownTabToSource(tab))) {
      await saveMarkdownTabWithSaveDialog(tab);
    }
    updateSaveCurrentFileButtons();
  }

  function restoreViewMode(mode) {
    currentViewMode = null;
    setViewMode(getAllowedViewModeForActiveTab(mode || loadGlobalState().viewMode || 'split'), false);
  }

  function setNoOpenTabsMode(enabled) {
    const container = document.querySelector(".content-container");
    if (container) container.classList.toggle("no-open-tabs", !!enabled);
    if (markdownEditor) {
      markdownEditor.disabled = !!enabled;
      markdownEditor.setAttribute("aria-disabled", enabled ? "true" : "false");
    }
  }

  function switchTab(tabId) {
    if (tabId === activeTabId) return;
    setNoOpenTabsMode(false);
    suspendActiveGraphRender();
    saveCurrentTabState();
    activeTabId = tabId;
    saveActiveTabId(activeTabId);
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tab.type === "graph") {
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      syncFolderTreeSelectionToActiveTab();
      renderGraphView();
      return;
    }
    setGraphViewMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
  }



  function pinTemporaryTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab || !tab.isTemporary) return;
    tab.isTemporary = false;
    // Promote preview tab to a normal tab without marking it dirty.
    tab.savedContent = tab.content;
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function findTemporaryTab() {
    return tabs.find(function(t) { return !!t.isTemporary; }) || null;
  }

  function applySidebarFileMetadata(tab, sourceFile) {
    tab.sourceFileName = sourceFile && sourceFile.name ? sourceFile.name : null;
    tab.sourceFileHandle = sourceFile && sourceFile.handle ? sourceFile.handle : null;
    tab.sourceFilePath = sourceFile && sourceFile.path ? sourceFile.path : null;
    tab.isUnsupportedFile = isUnsupportedSourceFile(sourceFile);
    if (tab.isUnsupportedFile) tab.viewMode = 'editor';
  }

  function isUnsupportedSourceFile(sourceFile) {
    if (!sourceFile) return false;
    if (sourceFile.isUnsupportedFile === true) return true;
    const path = sourceFile.path || sourceFile.name || sourceFile.file?.name || sourceFile.handle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function isUnsupportedFileTab(tab) {
    if (!tab || tab.type === "graph") return false;
    if (tab.isUnsupportedFile === true) return true;
    const path = tab.sourceFilePath || tab.sourceFileName || tab.sourceFileHandle?.name || "";
    return !!path && isTextDocumentPath(path) && !isSupportedFolderTreeDocumentPath(path);
  }

  function getActiveTab() {
    return tabs.find(function(tab) { return tab.id === activeTabId; }) || null;
  }

  function getAllowedViewModeForActiveTab(mode) {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.type === "graph") return 'preview';
    return isUnsupportedFileTab(activeTab) ? 'editor' : (mode || 'split');
  }

  function getDefaultViewModeForOpenedFile(sourceFile) {
    return isUnsupportedSourceFile(sourceFile) ? 'editor' : 'split';
  }

  function activateSidebarTab(tab) {
    activeTabId = tab.id;
    saveActiveTabId(activeTabId);
    setGraphViewMode(false);
    setNoOpenTabsMode(false);
    markdownEditor.value = tab.content;
    restoreViewMode(tab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = tab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
    syncFolderTreeSelectionToActiveTab();
    markdownEditor.focus();
  }

  function openSidebarFileInTab(content, title, sourceFile, options) {
    options = options || {};
    const isTemporary = options.temporary !== false;
    saveCurrentTabState();

    if (!isTemporary) {
      const existingTab = findTabForSourceFile(sourceFile);
      if (existingTab) {
        switchTab(existingTab.id);
        pinTemporaryTab(existingTab.id);
        return existingTab;
      }
    }

    let tab = isTemporary ? findTemporaryTab() : null;
    if (!tab && tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return null;
    }

    if (!tab) {
      const normalizedContent = normalizeEditorContent(content);
      const requestedViewMode = getDefaultViewModeForOpenedFile(sourceFile);
      tab = createTab(normalizedContent, title || 'Untitled', requestedViewMode);
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
      tabs.push(tab);
    } else {
      const normalizedContent = normalizeEditorContent(content);
      tab.title = title || 'Untitled';
      tab.content = normalizedContent;
      tab.scrollPos = 0;
      tab.viewMode = getDefaultViewModeForOpenedFile(sourceFile);
      tab.isTemporary = isTemporary;
      applySidebarFileMetadata(tab, sourceFile);
      tab.savedContent = normalizedContent;
    }

    activateSidebarTab(tab);
    return tab;
  }

  function openSidebarFileInTemporaryTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: true });
  }

  function openSidebarFileInPermanentTab(content, title, sourceFile) {
    return openSidebarFileInTab(content, title, sourceFile, { temporary: false });
  }

  function findTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type !== "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getMarkdownTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type !== "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function findGraphTabForSourceFile(sourceFile) {
    if (!sourceFile) return null;

    if (sourceFile.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFileHandle === sourceFile.handle;
      });
      if (handleMatch) return handleMatch;
    }

    if (sourceFile.path) {
      const pathMatch = tabs.find(function(tab) {
        return tab.type === "graph" && tab.sourceFilePath === sourceFile.path;
      });
      if (pathMatch) return pathMatch;
    }

    const title = sourceFile.name ? getGraphTitleFromFileName(sourceFile.name) : null;
    return tabs.find(function(tab) {
      return tab.type === "graph" && ((sourceFile.name && tab.sourceFileName === sourceFile.name) || (title && tab.title === title));
    }) || null;
  }

  function showSavedGraphMissingPathDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "saved-graph-missing-file-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "saved-graph-missing-file-title");
      overlay.innerHTML = `
        <div class="saved-graph-missing-file-dialog">
          <p id="saved-graph-missing-file-title" class="saved-graph-missing-file-message">This file no longer exists at the saved path.</p>
          <div class="saved-graph-missing-file-actions">
            <button class="tool-button saved-graph-locate-file" type="button">Locate file</button>
            <button class="tool-button saved-graph-remove-file" type="button">Remove from graph</button>
            <button class="tool-button saved-graph-cancel-file" type="button">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = (action) => {
        overlay.remove();
        resolve(action);
      };

      overlay.querySelector(".saved-graph-locate-file")?.addEventListener("click", () => cleanup("locate"));
      overlay.querySelector(".saved-graph-remove-file")?.addEventListener("click", () => cleanup("remove"));
      overlay.querySelector(".saved-graph-cancel-file")?.addEventListener("click", () => cleanup("cancel"));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup("cancel");
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cleanup("cancel");
      });

      document.body.appendChild(overlay);
      overlay.querySelector(".saved-graph-locate-file")?.focus({ preventScroll: true });
    });
  }

  async function locateReplacementMarkdownFileForSavedGraphNode() {
    if (isNeutralinoRuntime() && Neutralino.os?.showOpenDialog) {
      const selected = await Neutralino.os.showOpenDialog("Locate Markdown file", {
        multiSelections: false,
        filters: [{ name: "Markdown files", extensions: ["md", "markdown"] }]
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return {
        name: getFileName(selectedPath),
        path: selectedPath,
        content: await Neutralino.filesystem.readFile(selectedPath)
      };
    }

    if (typeof window.showOpenFilePicker === "function") {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".md", ".markdown"] }
          }
        ]
      });
      const handle = handles && handles[0];
      if (!handle) return null;
      const file = await handle.getFile();
      return {
        name: file.name || handle.name || "document.md",
        handle,
        content: await file.text()
      };
    }

    alert("Locate file is available in browsers that support the file picker or in the desktop app.");
    return null;
  }

  async function openLocatedSavedGraphFile(graphNode) {
    try {
      const locatedFile = await locateReplacementMarkdownFileForSavedGraphNode();
      if (!locatedFile) return null;
      return openSidebarFileInPermanentTab(
        normalizeEditorContent(locatedFile.content || ""),
        getMarkdownTitleFromFileName(locatedFile.name || graphNode?.label || "document.md"),
        { name: locatedFile.name, handle: locatedFile.handle || null, path: locatedFile.path || null }
      );
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      console.error("Failed to locate saved graph file:", error);
      alert("Unable to open the located file.");
      return null;
    }
  }

  function removeSavedGraphNodeFromActiveTab(nodeId) {
    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    if (!activeGraphTab?.graphSnapshot || !nodeId) return;
    activeGraphTab.graphSnapshot = {
      ...activeGraphTab.graphSnapshot,
      nodes: (activeGraphTab.graphSnapshot.nodes || []).filter((node) => node.id !== nodeId),
      links: (activeGraphTab.graphSnapshot.links || []).filter((link) => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        return sourceId !== nodeId && targetId !== nodeId;
      }),
      files: (activeGraphTab.graphSnapshot.files || []).filter((file) => file.id !== nodeId)
    };
    activeGraphTab.graphDocument = serializeGraphTab(activeGraphTab, { documentType: GRAPH_DOCUMENT_TYPE_VIEW });
    markGraphTabAsChanged(activeGraphTab);
    saveTabsToStorage(tabs);
    graphRenderCache.delete(activeGraphTab.id);
    renderGraphView();
  }

  async function handleMissingSavedGraphNodePath(graphNode) {
    const action = await showSavedGraphMissingPathDialog();
    if (action === "locate") return openLocatedSavedGraphFile(graphNode);
    if (action === "remove") removeSavedGraphNodeFromActiveTab(graphNode?.id);
    return null;
  }

  async function openGraphNodeFileInPermanentTab(graphNode) {
    if (!graphNode) return null;

    const activeGraphTab = tabs.find((tab) => tab.id === activeTabId && tab.type === "graph");
    const keepSavedMode = isKeepSavedGraphMode(activeGraphTab);
    const snapshotFile = activeGraphTab?.graphSnapshot?.files?.find((file) => file.id === graphNode.id);
    const folderEntry = keepSavedMode ? null : (folderMarkdownFiles || []).find(function(entry) {
      return getGraphFileEntryNodeId(entry) === graphNode.id;
    });
    const fileEntry = snapshotFile || folderEntry;
    const readableFileEntry = keepSavedMode
      ? snapshotFile
      : ((fileEntry && typeof fileEntry.content === "string") ? fileEntry : (folderEntry || fileEntry));

    if (!fileEntry) {
      alert("Unable to find the selected file in this graph snapshot.");
      return null;
    }

    if (keepSavedMode && readableFileEntry?.content === undefined && !readableFileEntry?.handle && !(isNeutralinoRuntime() && readableFileEntry?.fullPath)) {
      return handleMissingSavedGraphNodePath(graphNode);
    }

    const path = fileEntry.path || fileEntry.file?.webkitRelativePath || fileEntry.file?.name || graphNode.fullPath || null;
    const name = fileEntry.name || getFileName(path || graphNode.fullPath || graphNode.label || "document.md");
    const sourceFile = {
      name,
      handle: fileEntry.handle || readableFileEntry?.handle || null,
      path: fileEntry.fullPath || readableFileEntry?.fullPath || path
    };

    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      return existingTab;
    }

    try {
      const content = await readFolderMarkdownFileContent(readableFileEntry);
      if (content === undefined || content === null) throw new Error("No readable Markdown file was provided.");
      if (!sourceFile.handle && readableFileEntry?.handle) sourceFile.handle = readableFileEntry.handle;
      if (readableFileEntry?.fullPath) sourceFile.path = readableFileEntry.fullPath;

      return openSidebarFileInPermanentTab(content, getMarkdownTitleFromFileName(name), sourceFile);
    } catch (error) {
      console.error("Failed to open graph node file:", error);
      if (keepSavedMode) return handleMissingSavedGraphNodePath(graphNode);
      alert("Unable to open selected file.");
      return null;
    }
  }

  function newTab(content, title, options) {
    if (options === undefined) options = {};
    if (content === undefined) content = '';
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    if (!title) title = nextUntitledTitle();
    const tab = createTab(content, title, options.viewMode || 'split');
    tabs.push(tab);
    const wasEmptyWorkspace = !activeTabId;
    if (wasEmptyWorkspace) {
      activeTabId = tab.id;
      saveActiveTabId(activeTabId);
      setGraphViewMode(false);
      setNoOpenTabsMode(false);
      markdownEditor.value = tab.content;
      restoreViewMode(tab.viewMode);
      renderEditorSyntaxHighlights();
      renderMarkdown();
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
    } else {
      switchTab(tab.id);
    }
    markdownEditor.focus();
  }

  function closeTab(tabId, options) {
    if (options === undefined) options = {};
    const tabToClose = tabs.find(function(t) { return t.id === tabId; });
    if (!tabToClose) return;
    const hasUnsavedChanges = tabHasUnsavedChanges(tabToClose);
    if (options.promptForUnsaved && hasUnsavedChanges) {
      const shouldClose = window.confirm('You have unsaved changes. Are you sure you want to close this tab?');
      if (!shouldClose) return;
    }

    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx === -1) return;
    const cachedGraphRender = graphRenderCache.get(tabId);
    if (cachedGraphRender) {
      if (cachedGraphRender.simulation) cachedGraphRender.simulation.stop();
      if (cachedGraphRender.wrapper) cachedGraphRender.wrapper.remove();
      graphRenderCache.delete(tabId);
    }
    tabs.splice(idx, 1);
    if (tabs.length === 0) {
      activeTabId = null;
      saveActiveTabId(activeTabId);
      setGraphViewMode(false);
      setNoOpenTabsMode(true);
      markdownEditor.value = '';
      restoreViewMode('split');
      renderEditorSyntaxHighlights();
      renderMarkdown();
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      return;
    } else if (activeTabId === tabId) {
      const newIdx = Math.max(0, idx - 1);
      activeTabId = tabs[newIdx].id;
      saveActiveTabId(activeTabId);
      const newActiveTab = tabs[newIdx];
      if (newActiveTab.type === 'graph') {
        setViewMode('preview');
        setGraphViewMode(true);
        renderTabBar(tabs, activeTabId);
        syncFolderTreeSelectionToActiveTab();
        renderGraphView();
        saveTabsToStorage(tabs);
        return;
      }
      setGraphViewMode(false);
      markdownEditor.value = newActiveTab.content;
      restoreViewMode(newActiveTab.viewMode);
      renderEditorSyntaxHighlights();
      renderMarkdown();
      requestAnimationFrame(function() {
        markdownEditor.scrollTop = newActiveTab.scrollPos || 0;
        syncEditorSyntaxHighlightScroll();
      });
    }
    saveTabsToStorage(tabs);
    renderTabBar(tabs, activeTabId);
  }

  function renameUnsourcedTabTitle(tab) {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-modal-input');
    const confirmBtn = document.getElementById('rename-modal-confirm');
    const cancelBtn = document.getElementById('rename-modal-cancel');
    const title = document.getElementById('rename-modal-title');
    if (!modal || !input || !confirmBtn || !cancelBtn) return;
    if (title) title.textContent = 'Rename tab';
    input.placeholder = 'Tab name';
    input.value = tab.title;
    confirmBtn.textContent = 'Rename';
    modal.style.display = 'flex';
    input.focus();
    input.select();

    function doRename() {
      const newName = input.value.trim();
      if (newName) {
        tab.title = newName;
        saveTabsToStorage(tabs);
        renderTabBar(tabs, activeTabId);
      }
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doRename);
      cancelBtn.removeEventListener('click', doCancel);
      input.removeEventListener('keydown', onKey);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function onKey(e) {
      if (e.key === 'Enter') doRename();
      else if (e.key === 'Escape') doCancel();
    }

    confirmBtn.addEventListener('click', doRename);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', onKey);
  }

  async function renameTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;

    const sourceName = tab.sourceFileName || (tab.sourceFilePath ? getFileName(tab.sourceFilePath) : tab.sourceFileHandle?.name);
    if (!sourceName || (!tab.sourceFileHandle && !tab.sourceFilePath)) {
      renameUnsourcedTabTitle(tab);
      return;
    }

    try {
      await renameSidebarNodeOnDisk({
        kind: "file",
        name: sourceName,
        handle: tab.sourceFileHandle || null,
        fullPath: isNeutralinoRuntime() ? tab.sourceFilePath : null,
        path: tab.sourceFilePath || null
      }, "file");
    } catch (error) {
      console.error("Failed to rename tab source file:", error);
      alert("Unable to rename this file.");
    }
  }

  function duplicateTab(tabId) {
    const tab = tabs.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }
    saveCurrentTabState();
    const dupTitle = tab.title + ' (copy)';
    const dup = createTab(tab.content, dupTitle, isUnsupportedFileTab(tab) ? 'editor' : tab.viewMode);
    dup.savedContent = tab.savedContent;
    dup.isUnsupportedFile = isUnsupportedFileTab(tab);
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    tabs.splice(idx + 1, 0, dup);
    switchTab(dup.id);
  }

  function confirmCloseTabsIfNeeded(tabsToClose) {
    const unsavedTabsToClose = tabsToClose.filter(function(tab) {
      return tabHasUnsavedChanges(tab);
    });
    if (unsavedTabsToClose.length === 0) return true;
    if (unsavedTabsToClose.length === 1) {
      return window.confirm('You have unsaved changes. Are you sure you want to close this tab?');
    }
    return window.confirm('You have unsaved changes in ' + unsavedTabsToClose.length + ' tabs. Are you sure you want to close them?');
  }

  function closeTabsByIds(tabIds, options) {
    if (options === undefined) options = {};
    saveCurrentTabState();
    const idsToClose = Array.from(new Set(tabIds));
    const tabsToClose = idsToClose
      .map(function(tabId) { return tabs.find(function(tab) { return tab.id === tabId; }); })
      .filter(Boolean);
    if (tabsToClose.length === 0 || (options.promptForUnsaved !== false && !confirmCloseTabsIfNeeded(tabsToClose))) return;
    idsToClose.forEach(function(tabId) {
      closeTab(tabId, { promptForUnsaved: false, allowEmpty: options.allowEmpty });
    });
  }

  function closeOtherTabs(tabId) {
    const targetTab = tabs.find(function(tab) { return tab.id === tabId; });
    if (!targetTab || tabs.length <= 1) return;
    closeTabsByIds(tabs
      .filter(function(tab) { return tab.id !== tabId; })
      .map(function(tab) { return tab.id; }));
    if (tabs.some(function(tab) { return tab.id === tabId; }) && activeTabId !== tabId) {
      switchTab(tabId);
    }
  }

  function closeAllTabs(options) {
    if (options === undefined) options = {};
    if (tabs.length === 0) return;
    closeTabsByIds(tabs.map(function(tab) { return tab.id; }), { allowEmpty: true, promptForUnsaved: options.promptForUnsaved });
  }

  function resetAllTabs() {
    const modal = document.getElementById('reset-confirm-modal');
    const confirmBtn = document.getElementById('reset-modal-confirm');
    const cancelBtn = document.getElementById('reset-modal-cancel');
    if (!modal) return;
    modal.style.display = 'flex';

    function doReset() {
      modal.style.display = 'none';
      cleanup();
      closeAllTabs({ promptForUnsaved: false });
      untitledCounter = 0;
      saveUntitledCounter(0);
    }

    function doCancel() {
      modal.style.display = 'none';
      cleanup();
    }

    function cleanup() {
      confirmBtn.removeEventListener('click', doReset);
      cancelBtn.removeEventListener('click', doCancel);
    }

    confirmBtn.addEventListener('click', doReset);
    cancelBtn.addEventListener('click', doCancel);
  }

  function initTabs() {
    untitledCounter = loadUntitledCounter();
    tabs = loadTabsFromStorage();
    tabs.forEach(function(tab) {
      tab.content = normalizeEditorContent(tab.content);
      if (typeof tab.savedContent !== 'string') tab.savedContent = tab.content || '';
      tab.savedContent = normalizeEditorContent(tab.savedContent);
      if (!tab.type) tab.type = 'markdown';
      if (tab.type === 'graph') {
        const graphData = deserializeGraphDocument({
          ...(tab.graphDocument || tab),
          graphLayout: tab.graphLayout !== undefined
            ? tab.graphLayout
            : (tab.graphDocument?.graphLayout !== undefined ? tab.graphDocument.graphLayout : tab.graphDocument?.layout)
        });
        tab.folderName = graphData.folderName;
        tab.graphSnapshot = graphData.graphSnapshot;
        tab.graphViewConfig = graphData.graphViewConfig;
        tab.graphDocument = graphData.graphDocument;
        if (Object.prototype.hasOwnProperty.call(graphData, "graphLayout")) tab.graphLayout = graphData.graphLayout;
      }
    });
    activeTabId = loadActiveTabId();
    if (tabs.length === 0) {
      const tab = createTab(sampleMarkdown, 'Welcome to Markdown Viewer');
      tabs.push(tab);
      activeTabId = tab.id;
      saveTabsToStorage(tabs);
      saveActiveTabId(activeTabId);
    } else if (!tabs.find(function(t) { return t.id === activeTabId; })) {
      activeTabId = tabs[0].id;
      saveActiveTabId(activeTabId);
    }
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab.type === 'graph') {
      setNoOpenTabsMode(false);
      setViewMode('preview');
      setGraphViewMode(true);
      renderTabBar(tabs, activeTabId);
      renderGraphView();
      return;
    }
    setNoOpenTabsMode(false);
    setGraphViewMode(false);
    markdownEditor.value = activeTab.content;
    restoreViewMode(activeTab.viewMode);
    renderEditorSyntaxHighlights();
    renderMarkdown();
    requestAnimationFrame(function() {
      markdownEditor.scrollTop = activeTab.scrollPos || 0;
      syncEditorSyntaxHighlightScroll();
    });
    renderTabBar(tabs, activeTabId);
  }


    Object.assign(api, {
      nextUntitledTitle,
      createTab,
      createGraphTab,
      normalizeGraphScopePath,
      createFolderGraphScopeKey,
      getRootFolderGraphScopeKey,
      findExistingFolderGraphTab,
      focusExistingFolderGraphTab,
      getGraphTitleFromFileName,
      getGraphTabTitle,
      getTabDisplayName,
      getTabTooltipText,
      updateTabScrollControls,
      scrollTabsBy,
      setupTabScrolling,
      renderTabBar,
      renderMobileTabList,
      ensureTabContextMenu,
      positionTabContextMenu,
      setTabContextMenuActionEnabled,
      updateTabContextMenuActionStates,
      showTabContextMenu,
      hideTabContextMenu,
      saveCurrentTabState,
      getActiveMarkdownTab,
      activeTabHasUnsavedChanges,
      getUnsavedTabs,
      updateSaveCurrentFileButtons,
      saveChangedTab,
      saveAllChangedTabs,
      saveCurrentFileIfChanged,
      restoreViewMode,
      setNoOpenTabsMode,
      switchTab,
      pinTemporaryTab,
      findTemporaryTab,
      applySidebarFileMetadata,
      isUnsupportedSourceFile,
      isUnsupportedFileTab,
      getActiveTab,
      getAllowedViewModeForActiveTab,
      getDefaultViewModeForOpenedFile,
      activateSidebarTab,
      openSidebarFileInTab,
      openSidebarFileInTemporaryTab,
      openSidebarFileInPermanentTab,
      findTabForSourceFile,
      findGraphTabForSourceFile,
      showSavedGraphMissingPathDialog,
      locateReplacementMarkdownFileForSavedGraphNode,
      openLocatedSavedGraphFile,
      removeSavedGraphNodeFromActiveTab,
      handleMissingSavedGraphNodePath,
      openGraphNodeFileInPermanentTab,
      newTab,
      closeTab,
      renameUnsourcedTabTitle,
      renameTab,
      duplicateTab,
      confirmCloseTabsIfNeeded,
      closeTabsByIds,
      closeOtherTabs,
      closeAllTabs,
      resetAllTabs,
      initTabs,
    });
    }

    app.services.tabs = api;
    app.registerModule("tabs", api);
    return api;
  };
})(window);
