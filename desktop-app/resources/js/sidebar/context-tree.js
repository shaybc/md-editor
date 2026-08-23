(function(global) {
  global.registerMarkdownViewerSidebarContextTree = function registerMarkdownViewerSidebarContextTree(app, deps) {
    const api = {};
    let sidebarContextTarget = null;
    let sidebarContextSelection = [];
    let sidebarSelectionAnchorKey = "";
    let sidebarSelectionFolderScope = "";
    const sidebarSelectedItems = new Map();
    let mavenModulePaths = new Set();
    let gradleModulePaths = new Set();
    let javaSourceRootPaths = new Set();
    let javaProjectMarkerMode = "none";
    const emptyFolderPathSet = new Set();
    const javaProjectMarkerModes = new Set(["maven", "gradle", "java"]);
  const FOLDER_TREE_DRAG_MIME = "application/x-md-editor-folder-tree-node";
  const FOLDER_TREE_HOVER_EXPAND_DELAY_MS = 1000;
  let folderTreeDragState = null;
  let folderTreeDragTargetElement = null;
  let folderTreeHoverExpandTimer = null;
  let folderTreeHoverExpandElement = null;
    let folderTreeRootDragListenersBound = false;
    let folderTreeKeyboardListenersBound = false;

    with (deps) {
  function getOpenTabLimit() {
    return typeof getMaxOpenTabs === "function" ? getMaxOpenTabs() : 40;
  }

  function getOpenTabLimitMessage(actionText) {
    return `Maximum of ${getOpenTabLimit()} tabs reached. Please close an existing tab to ${actionText}.`;
  }

  function createFileContextMenuButton(labelText, iconClass, tooltipText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-context-menu-item";
    if (tooltipText) {
      button.classList.add("graph-context-menu-tooltip");
      button.dataset.tooltip = tooltipText;
    }
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "graph-context-menu-item-label";
    label.textContent = labelText;
    button.dataset.defaultLabel = labelText || "";
    if (tooltipText) button.dataset.defaultTooltip = tooltipText;
    button.appendChild(icon);
    button.appendChild(label);
    return button;
  }

  function disableContextMenuTooltip(button) {
    button.classList.remove("graph-context-menu-tooltip", "tooltip-visible");
    delete button.dataset.tooltip;
  }

  function createTagsContextSubmenu(tooltipText) {
    const submenu = document.createElement("div");
    submenu.className = "graph-context-menu-submenu tags-context-submenu";
    const submenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.tags.label,
      CONTEXT_MENU_ACTIONS.tags.icon,
      tooltipText || "Add or remove frontmatter tags for this file."
    );
    submenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(submenuBtn);
    const submenuArrow = document.createElement("span");
    submenuArrow.className = "graph-context-menu-submenu-arrow";
    submenuArrow.textContent = "›";
    submenuBtn.appendChild(submenuArrow);
    const submenuPanel = document.createElement("div");
    submenuPanel.className = "graph-context-menu-submenu-panel tags-context-submenu-panel";
    submenu.appendChild(submenuBtn);
    submenu.appendChild(submenuPanel);
    return { submenu, submenuBtn, submenuPanel };
  }


  function createOpenApiContextSubmenu(className, tooltipText) {
    const submenu = document.createElement("div");
    submenu.className = `graph-context-menu-submenu ${className}`;
    const submenuBtn = createFileContextMenuButton(
      "OpenAPI / Swagger",
      "bi bi-diagram-3",
      tooltipText || "Open OpenAPI / Swagger actions."
    );
    submenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(submenuBtn);
    const submenuArrow = document.createElement("span");
    submenuArrow.className = "graph-context-menu-submenu-arrow";
    submenuArrow.textContent = String.fromCharCode(8250);
    submenuBtn.appendChild(submenuArrow);
    const submenuPanel = document.createElement("div");
    submenuPanel.className = "graph-context-menu-submenu-panel";
    submenu.appendChild(submenuBtn);
    submenu.appendChild(submenuPanel);
    return { submenu, submenuPanel };
  }

  function getSidebarLogErrorDetails(error) {
    return {
      name: error?.name || "Error",
      message: error?.message || String(error || "Unknown error")
    };
  }

  function logSidebarLargeFileOpen(level, message, details) {
    if (typeof appDebugLog === "function") {
      void appDebugLog(level, `[large-file-open][sidebar] ${message}`, details);
    }
  }

  function getActiveEditorContent() {
    return activeEditorCommands?.getActiveEditorValue ? activeEditorCommands.getActiveEditorValue() : markdownEditor.value;
  }

  function setActiveEditorContent(content) {
    if (activeEditorCommands?.setActiveEditorValue) {
      activeEditorCommands.setActiveEditorValue(content);
    } else {
      markdownEditor.value = content;
    }
  }

  function getSidebarSelectionFolderScope() {
    return activeFolderPath || activeFolderName || "";
  }

  function clearSidebarTreeSelection(options = {}) {
    sidebarSelectedItems.clear();
    sidebarSelectionAnchorKey = "";
    if (options.clearContext !== false) sidebarContextSelection = [];
    renderSidebarTreeSelectionState();
  }

  function syncSidebarSelectionFolderScope() {
    const nextScope = getSidebarSelectionFolderScope();
    if (sidebarSelectionFolderScope === nextScope) return;
    sidebarSelectionFolderScope = nextScope;
    clearSidebarTreeSelection();
  }

  function getSidebarSelectionKind(node) {
    return node?.kind === "directory" ? "folder" : "file";
  }

  function getSidebarSelectionKey(node) {
    if (!node) return "";
    const kind = getSidebarSelectionKind(node);
    const path = node.fullPath || node.path || node.file?.webkitRelativePath || node.file?.name || node.name || "";
    const pathKey = getComparableFilePath(path);
    return pathKey ? `${kind}:${pathKey}` : "";
  }

  function createSidebarSelectionItem(node) {
    const key = getSidebarSelectionKey(node);
    if (!key) return null;
    return { key, kind: getSidebarSelectionKind(node), node };
  }

  function setSidebarSelectionElementState(element, selected) {
    if (!element) return;
    element.classList.toggle("multi-selected", selected);
    if (selected) element.setAttribute("aria-selected", "true");
    else element.removeAttribute("aria-selected");
  }

  function applySidebarSelectionStateToElement(element, node) {
    if (!element || !node) return;
    const item = createSidebarSelectionItem(node);
    if (!item) return;
    element.dataset.sidebarSelectionKey = item.key;
    element.dataset.sidebarSelectionKind = item.kind;
    element._sidebarSelectionNode = node;
    setSidebarSelectionElementState(element, sidebarSelectedItems.has(item.key));
  }

  function getVisibleSidebarSelectionElements() {
    if (!folderTreeRoot) return [];
    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-label[data-sidebar-selection-key], .folder-tree-file[data-sidebar-selection-key]"))
      .filter((element) => {
        let ancestor = element;
        while (ancestor && ancestor !== folderTreeRoot) {
          if (ancestor.hidden) return false;
          if (ancestor.tagName === "DETAILS" && !ancestor.open) {
            const summary = ancestor.querySelector(":scope > summary");
            if (!summary?.contains(element)) return false;
          }
          ancestor = ancestor.parentElement;
        }
        return true;
      });
  }

  function renderSidebarTreeSelectionState() {
    getVisibleSidebarSelectionElements().forEach((element) => {
      setSidebarSelectionElementState(element, sidebarSelectedItems.has(element.dataset.sidebarSelectionKey || ""));
    });
  }

  function selectSidebarVisibleRange(anchorKey, targetKey) {
    const visibleElements = getVisibleSidebarSelectionElements();
    const anchorIndex = visibleElements.findIndex((element) => element.dataset.sidebarSelectionKey === anchorKey);
    const targetIndex = visibleElements.findIndex((element) => element.dataset.sidebarSelectionKey === targetKey);
    if (anchorIndex < 0 || targetIndex < 0) return false;
    sidebarSelectedItems.clear();
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    visibleElements.slice(start, end + 1).forEach((element) => {
      const item = createSidebarSelectionItem(element._sidebarSelectionNode);
      if (item) sidebarSelectedItems.set(item.key, item);
    });
    return true;
  }

  function handleSidebarSelectionClick(event, node) {
    const item = createSidebarSelectionItem(node);
    if (!item) return false;
    syncSidebarSelectionFolderScope();
    const isRangeSelection = event?.shiftKey === true;
    const isToggleSelection = event?.ctrlKey === true || event?.metaKey === true;

    if (isRangeSelection && sidebarSelectionAnchorKey && selectSidebarVisibleRange(sidebarSelectionAnchorKey, item.key)) {
      renderSidebarTreeSelectionState();
      return true;
    }

    if (isToggleSelection) {
      if (sidebarSelectedItems.has(item.key)) sidebarSelectedItems.delete(item.key);
      else sidebarSelectedItems.set(item.key, item);
      sidebarSelectionAnchorKey = item.key;
      renderSidebarTreeSelectionState();
      return true;
    }

    app.modules?.tabs?.clearTabSelection?.({ render: true });
    sidebarSelectedItems.clear();
    sidebarSelectedItems.set(item.key, item);
    sidebarSelectionAnchorKey = item.key;
    renderSidebarTreeSelectionState();
    return false;
  }

  function getSidebarKeyboardItemElement(target) {
    const targetElement = target instanceof Element ? target : target?.parentElement;
    const targetItem = targetElement?.closest(".folder-tree-label[data-sidebar-selection-key], .folder-tree-file[data-sidebar-selection-key]");
    if (targetItem && folderTreeRoot?.contains(targetItem)) return targetItem;
    const activeElement = document.activeElement;
    const activeItem = activeElement instanceof Element
      ? activeElement.closest(".folder-tree-label[data-sidebar-selection-key], .folder-tree-file[data-sidebar-selection-key]")
      : null;
    if (activeItem && folderTreeRoot?.contains(activeItem)) return activeItem;
    if (!sidebarSelectionAnchorKey) return null;
    return getVisibleSidebarSelectionElements()
      .find((element) => element.dataset.sidebarSelectionKey === sidebarSelectionAnchorKey) || null;
  }

  function focusSidebarKeyboardItem(element) {
    if (!element) return;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
    element.scrollIntoView?.({ block: "nearest" });
  }

  function selectSidebarKeyboardItem(element) {
    const node = element?._sidebarSelectionNode;
    if (!node) return;
    handleSidebarSelectionClick({ shiftKey: false, ctrlKey: false, metaKey: false }, node);
    focusSidebarKeyboardItem(element);
  }

  async function handleFolderTreeKeyDown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const supportedKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Spacebar", "Delete"]);
    if (!supportedKeys.has(event.key)) return;

    const visibleElements = getVisibleSidebarSelectionElements();
    const currentElement = getSidebarKeyboardItemElement(event.target);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!visibleElements.length) return;
      const currentIndex = visibleElements.indexOf(currentElement);
      const nextIndex = currentIndex < 0
        ? (event.key === "ArrowDown" ? 0 : visibleElements.length - 1)
        : Math.max(0, Math.min(visibleElements.length - 1, currentIndex + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      selectSidebarKeyboardItem(visibleElements[nextIndex]);
      return;
    }

    if (!currentElement) return;
    const node = currentElement._sidebarSelectionNode;
    if (!node) return;
    const isFolder = currentElement.dataset.sidebarSelectionKind === "folder";
    const details = isFolder ? currentElement.closest("details") : null;
    event.preventDefault();

    if (event.key === "ArrowRight") {
      if (details && !details.open) await toggleFolderTreeDetails(details);
      return;
    }
    if (event.key === "ArrowLeft") {
      if (details?.open) await toggleFolderTreeDetails(details);
      return;
    }
    if (event.key === "Enter") {
      if (details) await toggleFolderTreeDetails(details);
      else await openSidebarTreeFile(node, { temporary: false, focusElement: currentElement });
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      if (!isFolder) await openSidebarTreeFile(node, { temporary: true, focusElement: currentElement });
      return;
    }
    if (event.key === "Delete") {
      await deleteSidebarSelection(node);
      if (currentElement.isConnected) focusSidebarKeyboardItem(currentElement);
    }
  }

  function bindFolderTreeKeyboardListeners() {
    if (!folderTreeRoot || folderTreeKeyboardListenersBound) return;
    folderTreeKeyboardListenersBound = true;
    folderTreeRoot.tabIndex = 0;
    folderTreeRoot.addEventListener("click", (event) => {
      const item = getSidebarKeyboardItemElement(event.target);
      if (item && item.contains(event.target)) focusSidebarKeyboardItem(item);
      else {
        const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
        const interactiveTarget = targetElement?.closest("button, input, select, textarea, a, [contenteditable='true']");
        if (!interactiveTarget) folderTreeRoot.focus();
      }
    });
    folderTreeRoot.addEventListener("keydown", (event) => {
      void handleFolderTreeKeyDown(event);
    });
    document.addEventListener("pointerdown", (event) => {
      if (folderTreeRoot.contains(event.target)) return;
      const activeElement = document.activeElement;
      if (activeElement === folderTreeRoot || folderTreeRoot.contains(activeElement)) activeElement.blur?.();
    }, true);
  }

  function prepareSidebarContextSelection(node) {
    const item = createSidebarSelectionItem(node);
    if (!item) {
      sidebarContextSelection = [];
      return [];
    }
    syncSidebarSelectionFolderScope();
    if (!sidebarSelectedItems.has(item.key)) {
      sidebarSelectedItems.clear();
      sidebarSelectedItems.set(item.key, item);
      sidebarSelectionAnchorKey = item.key;
      renderSidebarTreeSelectionState();
    }
    sidebarContextSelection = sidebarSelectedItems.size > 1 ? Array.from(sidebarSelectedItems.values()) : [];
    return sidebarContextSelection;
  }

  function getSidebarContextSelection() {
    return sidebarContextSelection.length > 1 ? sidebarContextSelection.slice() : [];
  }

  function getSidebarContextFileNodes(target) {
    const selectedFileNodes = getSidebarContextSelection()
      .filter((item) => item.kind === "file" && item.node)
      .map((item) => item.node);
    return selectedFileNodes.length ? selectedFileNodes : (target?.kind === "file" ? [target] : []);
  }

  function getSidebarSelectionClipboardPath(item) {
    if (!item?.node) return "";
    return item.kind === "folder" ? getSidebarFolderClipboardPath(item.node) : getSidebarNodeClipboardPath(item.node);
  }

  function getSidebarSelectionFilesystemPath(item) {
    if (!item?.node) return "";
    return item.kind === "folder" ? getSidebarFolderFilesystemPath(item.node) : getSidebarNodeFilesystemPath(item.node);
  }
  function getSidebarDragKind(node) {
    return node?.kind === "directory" ? "folder" : "file";
  }

  function getSidebarDragFilesystemPath(node) {
    if (!node) return "";
    return getSidebarDragKind(node) === "folder" ? getSidebarFolderFilesystemPath(node) : getSidebarNodeFilesystemPath(node);
  }

  function getSidebarDragItems(node) {
    const draggedItem = createSidebarSelectionItem(node);
    if (!draggedItem) return [];
    syncSidebarSelectionFolderScope();
    if (!sidebarSelectedItems.has(draggedItem.key)) {
      sidebarSelectedItems.clear();
      sidebarSelectedItems.set(draggedItem.key, draggedItem);
      sidebarSelectionAnchorKey = draggedItem.key;
      renderSidebarTreeSelectionState();
    }
    const selectedItems = Array.from(sidebarSelectedItems.values()).map((item) => ({
      ...item,
      path: getSidebarSelectionFilesystemPath(item)
    })).filter((item) => item.path);
    return selectedItems.filter((item) => !selectedItems.some((candidate) => (
      candidate !== item
      && candidate.kind === "folder"
      && getComparableFilePath(candidate.path) !== getComparableFilePath(item.path)
      && isPathInsideFolder(item.path, candidate.path)
    )));
  }

  function clearFolderTreeHoverExpandTimer(element) {
    if (element && folderTreeHoverExpandElement !== element) return;
    if (folderTreeHoverExpandTimer) window.clearTimeout(folderTreeHoverExpandTimer);
    folderTreeHoverExpandTimer = null;
    folderTreeHoverExpandElement = null;
  }

  function getFolderTreeDropTargetDetails(element) {
    return element?.closest?.("details") || null;
  }

  function scheduleFolderTreeHoverExpand(element) {
    const details = getFolderTreeDropTargetDetails(element);
    if (!details || details.open) {
      clearFolderTreeHoverExpandTimer(element);
      return;
    }
    if (folderTreeHoverExpandElement === element && folderTreeHoverExpandTimer) return;
    clearFolderTreeHoverExpandTimer();
    folderTreeHoverExpandElement = element;
    folderTreeHoverExpandTimer = window.setTimeout(async () => {
      const targetElement = folderTreeHoverExpandElement;
      clearFolderTreeHoverExpandTimer();
      if (folderTreeDragTargetElement !== targetElement) return;
      const targetDetails = getFolderTreeDropTargetDetails(targetElement);
      if (!targetDetails || targetDetails.open) return;
      resetFolderTreeAnimation(targetDetails, getFolderTreeChildrenContainer(targetDetails));
      await renderFolderTreeLazyChildren(targetDetails);
      targetDetails.open = true;
      notifyFolderTreeExpandToggleButtons();
    }, FOLDER_TREE_HOVER_EXPAND_DELAY_MS);
  }

  function setFolderTreeDropTarget(element) {
    if (folderTreeDragTargetElement === element) return;
    clearFolderTreeHoverExpandTimer();
    if (folderTreeDragTargetElement) folderTreeDragTargetElement.classList.remove("folder-tree-drop-target");
    folderTreeDragTargetElement = element || null;
    if (folderTreeDragTargetElement) folderTreeDragTargetElement.classList.add("folder-tree-drop-target");
  }

  function updateFolderTreeDropTarget(element) {
    setFolderTreeDropTarget(element);
    scheduleFolderTreeHoverExpand(element);
  }

  function clearFolderTreeDragState() {
    if (folderTreeDragState?.element) folderTreeDragState.element.classList.remove("folder-tree-dragging");
    clearFolderTreeHoverExpandTimer();
    setFolderTreeDropTarget(null);
    folderTreeRoot?.classList.remove("folder-tree-root-drop-target");
    folderTreeDragState = null;
  }

  function getSidebarDropOperation(event) {
    return event?.ctrlKey === true ? "copy" : "move";
  }

  function getSidebarDropPlan(targetNode, operation) {
    const dragItems = folderTreeDragState?.items || [];
    const filesystemOperation = Neutralino.filesystem?.[operation];
    if (!dragItems.length || !isFolderOpen || !isNeutralinoRuntime() || typeof filesystemOperation !== "function") return null;
    const targetPath = targetNode ? getSidebarFolderFilesystemPath(targetNode) : activeFolderPath;
    if (!targetPath) return null;
    if (targetNode && (targetNode.kind !== "directory" || targetNode.isParentNavigation)) return null;
    if (dragItems.some((item) => item.kind === "folder" && isPathInsideFolder(targetPath, item.path))) return null;
    const items = dragItems.map((item) => {
      const name = item.node.name || getFileName(item.path);
      const newPath = name ? joinPath(targetPath, name) : "";
      return { dragNode: item.node, kind: item.kind, oldPath: item.path, newPath, oldName: name, newName: name };
    }).filter((item) => item.newPath && getComparableFilePath(item.oldPath) !== getComparableFilePath(item.newPath));
    if (!items.length) return null;
    return {
      operation,
      items,
      selectedCount: folderTreeDragState?.selectedCount || items.length,
      destinationName: targetNode?.name || activeFolderName || getFileName(targetPath) || "the selected folder"
    };
  }

  function canDropSidebarNode(targetNode, operation) {
    return !!getSidebarDropPlan(targetNode, operation);
  }


  function setSidebarDropEffect(event, operation) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = operation;
  }

  async function confirmSidebarDropPlan(plan) {
    if (typeof shouldConfirmMoveFiles === "function" && !shouldConfirmMoveFiles()) return true;
    const action = plan.operation === "copy" ? "Copy" : "Move";
    const message = plan.selectedCount === 1
      ? `${action} “${plan.items[0].newName}” to “${plan.destinationName}”?`
      : `${action} ${plan.selectedCount} selected items to “${plan.destinationName}”?`;
    return typeof app?.services?.confirm === "function"
      ? app.services.confirm({ message, confirmLabel: action })
      : window.confirm(message);
  }

  async function sidebarTransferDestinationExists(path) {
    if (!path || !isNeutralinoRuntime() || !Neutralino.filesystem?.getStats) return false;
    try {
      await Neutralino.filesystem.getStats(path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function findSidebarDropPlanConflicts(plan) {
    const destinationCounts = new Map();
    plan.items.forEach((item) => {
      const key = getComparableFilePath(item.newPath);
      if (key) destinationCounts.set(key, (destinationCounts.get(key) || 0) + 1);
    });
    const conflicts = [];
    for (const item of plan.items) {
      const key = getComparableFilePath(item.newPath);
      const duplicateDestination = key && destinationCounts.get(key) > 1;
      if (duplicateDestination || await sidebarTransferDestinationExists(item.newPath)) conflicts.push(item);
    }
    return conflicts;
  }

  async function confirmSidebarDropOverwrite(plan, conflicts) {
    if (!conflicts.length) return "proceed";
    const action = plan.operation === "copy" ? "copy" : "move";
    const actionTitle = plan.operation === "copy" ? "Copy" : "Move";
    const message = conflicts.length === 1
      ? `“${conflicts[0].newName}” already exists in “${plan.destinationName}”. Overwrite it?`
      : `${conflicts.length} selected items already exist in “${plan.destinationName}” or share the same destination name. Overwrite them?`;
    if (typeof app?.services?.notify?.show === "function") {
      return app.services.notify.show({
        title: `${actionTitle} conflict`,
        message,
        dismissValue: "cancel",
        buttons: [
          { id: "cancel", label: `Cancel ${action}`, value: "cancel", variant: "cancel" },
          { id: "overwrite", label: "Overwrite", value: "overwrite", variant: "danger", autoFocus: true }
        ]
      });
    }
    return window.confirm(message) ? "overwrite" : "cancel";
  }

  async function removeSidebarDropDestinationIfNeeded(dropDetails, overwrite) {
    if (!overwrite || !await sidebarTransferDestinationExists(dropDetails.newPath)) return;
    await Neutralino.filesystem.remove(dropDetails.newPath);
    removeDeletedPathFromFolderTree(dropDetails.newPath, { kind: dropDetails.kind });
  }

  function sidebarDropParentChanged(dropDetails) {
    return getComparableFilePath(getPathDirectory(dropDetails?.oldPath || "")) !== getComparableFilePath(getPathDirectory(dropDetails?.newPath || ""));
  }

  async function upsertSidebarDropDestinationFromDisk(dropDetails) {
    const createdNode = await createFilesystemTreeNode(dropDetails.newPath, { scanDirectory: dropDetails.kind === "folder" });
    if (!createdNode) return false;
    return upsertCreatedPathInFolderTree(createdNode);
  }

  function removeSidebarDropSourceFromTree(dropDetails) {
    return removeDeletedPathFromFolderTree(dropDetails.oldPath, { kind: dropDetails.kind });
  }

  async function moveSidebarDropItem(dropDetails, options = {}) {
    await removeSidebarDropDestinationIfNeeded(dropDetails, options.overwrite === true);
    await Neutralino.filesystem.move(dropDetails.oldPath, dropDetails.newPath);
    let updatedTree = false;
    if (dropDetails.kind === "file") updatedTree = await updateRenamedPathInFolderTree(dropDetails);
    try {
      await updateOpenFolderLinksAfterSidebarRename(dropDetails.oldPath, dropDetails.newPath, dropDetails.kind);
    } catch (error) {
      console.warn(`Moved ${dropDetails.kind}, but failed to update Markdown links:`, error);
    }
    if (dropDetails.kind === "folder") updateTabsAfterSidebarFolderRename(dropDetails.oldPath, dropDetails.newPath);
    else updateTabsAfterSidebarFileRename(dropDetails.dragNode, dropDetails.oldPath, dropDetails.newPath, dropDetails.newName);
    if (dropDetails.kind !== "file") updatedTree = await updateRenamedPathInFolderTree(dropDetails);
    if (dropDetails.kind === "file" && sidebarDropParentChanged(dropDetails)) {
      updatedTree = removeSidebarDropSourceFromTree(dropDetails) || updatedTree;
      updatedTree = await upsertSidebarDropDestinationFromDisk(dropDetails) || updatedTree;
    }
    if (!updatedTree) {
      await reconcileFolderTreeParentFromDisk(getPathDirectory(dropDetails.oldPath));
      await reconcileFolderTreeParentFromDisk(getPathDirectory(dropDetails.newPath));
    }
  }

  async function copySidebarDropItem(dropDetails, options = {}) {
    await removeSidebarDropDestinationIfNeeded(dropDetails, options.overwrite === true);
    await Neutralino.filesystem.copy(dropDetails.oldPath, dropDetails.newPath);
    await upsertSidebarDropDestinationFromDisk(dropDetails);
  }

  async function reconcileSidebarDropPlan(plan) {
    const parentPaths = new Set();
    plan.items.forEach((item) => {
      if (plan.operation === "move") parentPaths.add(getPathDirectory(item.oldPath));
      parentPaths.add(getPathDirectory(item.newPath));
    });
    for (const parentPath of parentPaths) {
      try {
        await reconcileFolderTreeParentFromDisk(parentPath);
      } catch (error) {
        console.warn("Failed to reconcile a folder after transferring sidebar items:", error);
      }
    }
  }

  async function transferSidebarDraggedNodes(targetNode, operation) {
    const plan = getSidebarDropPlan(targetNode, operation);
    if (!plan) return false;
    clearFolderTreeDragState();
    if (!await confirmSidebarDropPlan(plan)) return false;
    const conflicts = await findSidebarDropPlanConflicts(plan);
    const overwriteDecision = await confirmSidebarDropOverwrite(plan, conflicts);
    if (overwriteDecision !== "proceed" && overwriteDecision !== "overwrite") return false;
    const overwrite = overwriteDecision === "overwrite";
    try {
      app.modules?.folderWatcher?.suppress?.(1000);
      for (const dropDetails of plan.items) {
        if (plan.operation === "copy") await copySidebarDropItem(dropDetails, { overwrite });
        else await moveSidebarDropItem(dropDetails, { overwrite });
      }
      if (plan.operation === "move") clearSidebarTreeSelection();
      return true;
    } catch (error) {
      console.error(`Failed to ${plan.operation} sidebar item:`, error);
      await reconcileSidebarDropPlan(plan);
      const action = plan.operation === "copy" ? "copy" : "move";
      alert(plan.selectedCount === 1 ? `Unable to ${action} this ${plan.items[0].kind}.` : `Unable to ${action} all selected items.`);
      return false;
    } finally {
      clearFolderTreeDragState();
    }
  }

  function configureFolderTreeDragSource(element, node) {
    if (!element || !node || node.isParentNavigation) return;
    element.draggable = true;
    element.addEventListener("dragstart", (event) => {
      const path = getSidebarDragFilesystemPath(node);
      if (!event.dataTransfer || !path || !isNeutralinoRuntime() || !Neutralino.filesystem?.move) {
        event.preventDefault();
        return;
      }
      const items = getSidebarDragItems(node);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      folderTreeDragState = { node, element, items, selectedCount: sidebarSelectedItems.size };
      element.classList.add("folder-tree-dragging");
      event.dataTransfer.effectAllowed = "copyMove";
      try {
        event.dataTransfer.setData(FOLDER_TREE_DRAG_MIME, path);
        event.dataTransfer.setData("text/plain", path);
      } catch (_) {
        // Some test shims expose partial DataTransfer implementations.
      }
    });
    element.addEventListener("dragend", clearFolderTreeDragState);
  }

  function configureFolderTreeDropTarget(element, node) {
    if (!element || !node || node.isParentNavigation) return;
    element.addEventListener("dragenter", (event) => {
      const operation = getSidebarDropOperation(event);
      if (!canDropSidebarNode(node, operation)) return;
      event.preventDefault();
      event.stopPropagation();
      setSidebarDropEffect(event, operation);
      updateFolderTreeDropTarget(element);
    });
    element.addEventListener("dragover", (event) => {
      const operation = getSidebarDropOperation(event);
      if (!canDropSidebarNode(node, operation)) return;
      event.preventDefault();
      event.stopPropagation();
      setSidebarDropEffect(event, operation);
      updateFolderTreeDropTarget(element);
    });
    element.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && element.contains(event.relatedTarget)) return;
      if (folderTreeDragTargetElement === element) setFolderTreeDropTarget(null);
    });
    element.addEventListener("drop", (event) => {
      const operation = getSidebarDropOperation(event);
      if (!canDropSidebarNode(node, operation)) return;
      event.preventDefault();
      event.stopPropagation();
      void transferSidebarDraggedNodes(node, operation);
    });
  }

  function isFolderTreeRowDragTarget(event) {
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    return !!targetElement?.closest(".folder-tree-label, .folder-tree-file");
  }

  function bindFolderTreeRootDragListeners() {
    if (!folderTreeRoot || folderTreeRootDragListenersBound) return;
    folderTreeRootDragListenersBound = true;
    folderTreeRoot.addEventListener("dragover", (event) => {
      const operation = getSidebarDropOperation(event);
      if (isFolderTreeRowDragTarget(event) || !canDropSidebarNode(null, operation)) return;
      event.preventDefault();
      setSidebarDropEffect(event, operation);
      folderTreeRoot.classList.add("folder-tree-root-drop-target");
      setFolderTreeDropTarget(null);
    });
    folderTreeRoot.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && folderTreeRoot.contains(event.relatedTarget)) return;
      folderTreeRoot.classList.remove("folder-tree-root-drop-target");
    });
    folderTreeRoot.addEventListener("drop", (event) => {
      const operation = getSidebarDropOperation(event);
      if (isFolderTreeRowDragTarget(event) || !canDropSidebarNode(null, operation)) return;
      event.preventDefault();
      void transferSidebarDraggedNodes(null, operation);
    });
  }

  function setContextMenuControlDisabled(control, disabled) {
    if (!control) return;
    control.disabled = !!disabled;
    control.classList.toggle("disabled", !!disabled);
    control.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function setContextMenuButtonLabel(button, labelText) {
    const label = button?.querySelector(".graph-context-menu-item-label");
    if (label) label.textContent = labelText || button.dataset.defaultLabel || "";
  }

  function updateSidebarBulkContextMenuState(menu, isBulk) {
    if (!menu) return;
    menu.classList.toggle("sidebar-bulk-context-menu", isBulk);
    menu.querySelectorAll(".graph-context-menu-item").forEach((button) => {
      setContextMenuControlDisabled(button, isBulk && !button.dataset.sidebarBulkAction);
    });
    menu.querySelectorAll(".graph-context-menu-submenu").forEach((submenu) => {
      const hasBulkAction = !!submenu.querySelector("[data-sidebar-bulk-action]");
      submenu.classList.toggle("disabled", isBulk && !hasBulkAction);
      setContextMenuControlDisabled(submenu.querySelector(":scope > .graph-context-menu-item"), isBulk && !hasBulkAction);
    });
  }

  async function copySidebarSelectedPaths() {
    const paths = getSidebarContextSelection().map(getSidebarSelectionClipboardPath).filter(Boolean);
    if (!paths.length) return false;
    await copySidebarContextText(paths.join("\n"));
    return true;
  }

  async function confirmSidebarBulkDelete(items) {
    if (typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()) return true;
    const count = items.length;
    const message = `Delete ${count} selected item${count === 1 ? "" : "s"} from disk? This action cannot be undone.`;
    return typeof app?.services?.confirm === "function"
      ? app.services.confirm({ message, confirmLabel: "Delete", confirmVariant: "danger" })
      : window.confirm(message);
  }

  async function deleteSidebarSelectedItems() {
    const selectedItems = getSidebarContextSelection();
    if (!selectedItems.length) return false;
    if (!isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting selected items is available only in the desktop app for items opened from disk.");
      return true;
    }
    const itemsWithPaths = selectedItems.map((item) => ({ ...item, path: getSidebarSelectionFilesystemPath(item) }));
    if (itemsWithPaths.some((item) => !item.path)) {
      alert("Deleting selected items is available only for items opened from disk.");
      return true;
    }
    const confirmed = await confirmSidebarBulkDelete(itemsWithPaths);
    if (!confirmed) return true;
    try {
      const sortedItems = itemsWithPaths.slice().sort((left, right) => String(right.path).length - String(left.path).length);
      app.modules?.folderWatcher?.suppress?.(1000);
      for (const item of sortedItems) {
        await Neutralino.filesystem.remove(item.path);
        if (item.kind === "file") closeTabsForDeletedPath(item.path, { kind: "file", targetHandle: item.node.handle || null });
        else closeTabsForDeletedPath(item.path, { kind: "folder" });
        removeDeletedPathFromFolderTree(item.path, { kind: item.kind });
      }
      clearSidebarTreeSelection();
    } catch (error) {
      console.error("Failed to delete selected sidebar items:", error);
      alert("Unable to delete the selected items.");
    }
    return true;
  }

  async function deleteSidebarFile(node) {
    const filePath = getSidebarNodeFilesystemPath(node);
    if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting files is available only in the desktop app for files opened from disk.");
      return;
    }
    const confirmed = typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()
      ? true
      : (typeof app?.services?.confirm === "function"
        ? await app.services.confirm({
            message: `Delete "${node.name}" from disk? This action cannot be undone.`,
            confirmLabel: "Delete",
            confirmVariant: "danger"
          })
        : window.confirm(`Delete "${node.name}" from disk? This action cannot be undone.`));
    if (!confirmed) return;
    try {
      app.modules?.folderWatcher?.suppress?.(1000);
      await Neutralino.filesystem.remove(filePath);
      closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: node.handle || null });
      removeDeletedPathFromFolderTree(filePath, { kind: "file" });
    } catch (error) {
      console.error("Failed to delete sidebar file:", error);
      alert("Unable to delete this file.");
    }
  }

  async function deleteSidebarSelection(node) {
    if (!node) return;
    prepareSidebarContextSelection(node);
    if (await deleteSidebarSelectedItems()) return;
    if (node.kind !== "directory") {
      await deleteSidebarFile(node);
      return;
    }
    try {
      await deleteSidebarFolder(node);
    } catch (error) {
      console.error("Failed to delete sidebar folder:", error);
      alert("Unable to delete this folder.");
    }
  }

  function renderTagsContextSubmenu(submenuPanel, currentTags, onToggleTag, options = {}) {
    if (!submenuPanel) return;
    const fileTags = new Set(normalizeFileTagList(currentTags || []));
    const tags = Array.from(new Set([...getAvailableTags(), ...fileTags])).sort((a, b) => a.localeCompare(b));
    submenuPanel.innerHTML = "";

    if (!tags.length) {
      const empty = document.createElement("div");
      empty.className = "graph-context-menu-empty";
      empty.textContent = "No available tags";
      submenuPanel.appendChild(empty);
    } else {
      tags.forEach((tag) => {
        const isChecked = fileTags.has(tag);
        const button = createFileContextMenuButton(
          `#${tag}`,
          isChecked ? "bi bi-check-lg" : "bi",
          isChecked ? `Remove #${tag} from this file.` : `Add #${tag} to this file.`
        );
        button.classList.add("tags-context-menu-item");
        button.dataset.tagName = tag;
        button.setAttribute("aria-checked", isChecked ? "true" : "false");
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await onToggleTag(tag, !isChecked);
        });
        submenuPanel.appendChild(button);
      });
    }

    let needsActionSeparator = Boolean(tags.length);
    const hasGraphTagActions = typeof options.onTagLocalGraph === "function"
      || typeof options.onTagFullLocalGraph === "function"
      || typeof options.onTagFullNetwork === "function";
    if (hasGraphTagActions) {
      const separator = document.createElement("div");
      separator.className = "graph-context-menu-separator";
      submenuPanel.appendChild(separator);
      needsActionSeparator = false;

      const graphTagsSubmenu = document.createElement("div");
      graphTagsSubmenu.className = "graph-context-menu-submenu tags-graph-context-submenu";
      const graphTagsSubmenuBtn = createFileContextMenuButton(
        options.tagGraphActionsLabel || "Tag graph",
        options.tagGraphActionsIcon || CONTEXT_MENU_ACTIONS.tagLocalGraph?.icon || "bi bi-tags",
        options.tagGraphActionsTooltip || "Open graph tagging actions for this file."
      );
      graphTagsSubmenuBtn.setAttribute("aria-haspopup", "true");
      disableContextMenuTooltip(graphTagsSubmenuBtn);
      const graphTagsSubmenuArrow = document.createElement("span");
      graphTagsSubmenuArrow.className = "graph-context-menu-submenu-arrow";
      graphTagsSubmenuArrow.textContent = "›";
      graphTagsSubmenuBtn.appendChild(graphTagsSubmenuArrow);
      const graphTagsSubmenuPanel = document.createElement("div");
      graphTagsSubmenuPanel.className = "graph-context-menu-submenu-panel tags-graph-context-submenu-panel";

      if (typeof options.onTagLocalGraph === "function") {
        const button = createFileContextMenuButton(
          options.tagLocalGraphLabel || CONTEXT_MENU_ACTIONS.tagLocalGraph?.label || "Tag Local Graph",
          options.tagLocalGraphIcon || CONTEXT_MENU_ACTIONS.tagLocalGraph?.icon || "bi bi-tags",
          options.tagLocalGraphTooltip || "Add a tag to this file and its direct outgoing linked files."
        );
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          options.onTagLocalGraph();
        });
        graphTagsSubmenuPanel.appendChild(button);
      }

      if (typeof options.onTagFullLocalGraph === "function") {
        const button = createFileContextMenuButton(
          options.tagFullLocalGraphLabel || CONTEXT_MENU_ACTIONS.tagFullLocalGraph?.label || "Tag full Local Graph",
          options.tagFullLocalGraphIcon || CONTEXT_MENU_ACTIONS.tagFullLocalGraph?.icon || "bi bi-tags-fill",
          options.tagFullLocalGraphTooltip || "Add a tag to this file and every reachable outgoing linked file."
        );
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          options.onTagFullLocalGraph();
        });
        graphTagsSubmenuPanel.appendChild(button);
      }

      if (typeof options.onTagFullNetwork === "function") {
        const button = createFileContextMenuButton(
          options.tagFullNetworkLabel || CONTEXT_MENU_ACTIONS.tagFullNetwork?.label || "Tag full Network",
          options.tagFullNetworkIcon || CONTEXT_MENU_ACTIONS.tagFullNetwork?.icon || "bi bi-diagram-3-fill",
          options.tagFullNetworkTooltip || "Add a tag to every connected file in this visible graph network."
        );
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          options.onTagFullNetwork();
        });
        graphTagsSubmenuPanel.appendChild(button);
      }

      graphTagsSubmenu.appendChild(graphTagsSubmenuBtn);
      graphTagsSubmenu.appendChild(graphTagsSubmenuPanel);
      submenuPanel.appendChild(graphTagsSubmenu);
      needsActionSeparator = true;
    }

    if (typeof options.onCreateTag === "function") {
      if (needsActionSeparator) {
        const separator = document.createElement("div");
        separator.className = "graph-context-menu-separator";
        submenuPanel.appendChild(separator);
      }

      const button = createFileContextMenuButton(
        options.createTagLabel || "New tag ...",
        options.createTagIcon || "bi bi-tag",
        options.createTagTooltip || "Create a tag and add it to this file."
      );
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tagName = await promptForNewTag({
          title: "New tag",
          message: "Enter a tag name.",
          confirmLabel: "Create"
        });
        const normalizedTag = normalizeTagName(tagName);
        if (!normalizedTag) return;
        if (typeof createTag === "function" && createTag(normalizedTag) === false) return;
        await options.onCreateTag(normalizedTag);
      });
      submenuPanel.appendChild(button);
    }
  }

  function getSidebarNodeSource(node) {
    if (!node) return null;
    return {
      name: node.name,
      file: node.file || null,
      handle: node.handle || null,
      path: node.fullPath || node.path || null,
      fullPath: node.fullPath || null,
      size: Number(node.size || node.file?.size || 0)
    };
  }

  function getSidebarTreeFileSource(node) {
    if (!node) return null;
    const sourceFile = {
      name: node.name,
      file: node.file || null,
      handle: node.handle || null,
      path: getSidebarNodeFilesystemPath(node) || node.fullPath || node.path || null,
      fullPath: node.fullPath || null,
      size: Number(node.size || node.file?.size || 0)
    };
    if (!isSupportedFolderTreeDocumentNode(node)) sourceFile.isUnsupportedFile = true;
    return sourceFile;
  }

  async function openSidebarTreeFile(node, options = {}) {
    const sourceFile = getSidebarTreeFileSource(node);
    if (!sourceFile) return;
    const temporary = options.temporary !== false;
    try {
      logSidebarLargeFileOpen("info", "tree open requested", {
        name: sourceFile.name || "",
        path: sourceFile.path || "",
        fullPath: sourceFile.fullPath || "",
        size: Number(sourceFile.size || 0),
        temporary
      });
      await openDocumentSourceFile(sourceFile, { temporary: !(options && options.temporary === false) });
      if (options.focusElement?.isConnected) focusSidebarKeyboardItem(options.focusElement);
    } catch (error) {
      logSidebarLargeFileOpen("error", "tree open failed", {
        name: node.name || "",
        path: node.path || "",
        fullPath: node.fullPath || "",
        size: Number(node.size || 0),
        error: getSidebarLogErrorDetails(error)
      });
      console.error("Failed to open sidebar file:", error);
      alert("Unable to open selected file.");
    }
  }

  function getSidebarNodeClipboardPath(node) {
    if (!node) return "";
    return node.fullPath || node.path || node.name || "";
  }

  async function readSidebarNodeContent(node) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime()) {
      const readPath = getSidebarNodeFilesystemPath(node);
      if (!readPath || !Neutralino.filesystem?.readFile) throw new Error("No readable filesystem path is available.");
      return Neutralino.filesystem.readFile(readPath);
    }
    if (node.file) return node.file.text();
    if (node.handle) {
      const file = await node.handle.getFile();
      return file.text();
    }
    throw new Error("No readable file was provided.");
  }

  async function inspectSidebarJavaMainClass(node, targetPath) {
    const mainClassFinder = app.modules?.javaMainClassFinder;
    if (typeof mainClassFinder?.inspectSource !== "function") throw new Error("Java main-class detection is unavailable.");
    const source = await readSidebarNodeContent(node);
    return mainClassFinder.inspectSource(source, targetPath);
  }

  async function writeSidebarNodeContent(node, content) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime()) {
      const writePath = getSidebarNodeFilesystemPath(node);
      if (!writePath || !Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(writePath, content);
      return;
    }
    if (node.handle?.createWritable) {
      const writable = await node.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }
    throw new Error("No writable file handle is available.");
  }

  function sidebarNodeMatchesSnapshotFile(node, snapshotFile) {
    if (!node || !snapshotFile) return false;
    if (node.handle && snapshotFile.handle && node.handle === snapshotFile.handle) return true;
    const nodePaths = [node.fullPath, node.path, node.file?.webkitRelativePath, node.file?.name, node.name]
      .filter(Boolean)
      .map(getComparableFilePath);
    const snapshotPaths = [snapshotFile.fullPath, snapshotFile.path, snapshotFile.file?.webkitRelativePath, snapshotFile.file?.name, snapshotFile.name]
      .filter(Boolean)
      .map(getComparableFilePath);
    return nodePaths.some((nodePath) => snapshotPaths.some((snapshotPath) => nodePath === snapshotPath || nodePath.endsWith(`/${snapshotPath}`) || snapshotPath.endsWith(`/${nodePath}`)));
  }

  async function updateGraphSnapshotsForSidebarFileTagChange(node, content) {
    const changedGraphTabs = applyGraphSnapshotTagChanges([{ node, content }]);
    for (const tab of changedGraphTabs) {
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
    }
    return changedGraphTabs;
  }

  function getSnapshotFileNodeIds(snapshotFile) {
    return Array.from(new Set([
      snapshotFile?.id,
      snapshotFile?.path ? normalizeGraphNodeName(snapshotFile.path) : "",
      snapshotFile?.fullPath ? normalizeGraphNodeName(snapshotFile.fullPath) : "",
      snapshotFile?.file?.webkitRelativePath ? normalizeGraphNodeName(snapshotFile.file.webkitRelativePath) : "",
      snapshotFile?.file?.name ? normalizeGraphNodeName(snapshotFile.file.name) : "",
      snapshotFile?.name ? normalizeGraphNodeName(snapshotFile.name) : ""
    ].filter(Boolean)));
  }

  function graphNodeMatchesSnapshotFile(nodeData, snapshotFile) {
    if (!nodeData || !snapshotFile) return false;
    const snapshotNodeIds = new Set(getSnapshotFileNodeIds(snapshotFile));
    if (snapshotNodeIds.has(nodeData.id)) return true;
    const nodePaths = [nodeData.fullPath, nodeData.path, nodeData.label, nodeData.id]
      .filter(Boolean)
      .map(getComparableFilePath);
    const snapshotPaths = [snapshotFile.fullPath, snapshotFile.path, snapshotFile.file?.webkitRelativePath, snapshotFile.file?.name, snapshotFile.name, snapshotFile.id]
      .filter(Boolean)
      .map(getComparableFilePath);
    return nodePaths.some((nodePath) => snapshotPaths.some((snapshotPath) => nodePath === snapshotPath || nodePath.endsWith(`/${snapshotPath}`) || snapshotPath.endsWith(`/${nodePath}`)));
  }

  function applyGraphSnapshotTagChanges(changes) {
    const normalizedChanges = (Array.isArray(changes) ? changes : [])
      .filter((change) => change?.node && typeof change.content === "string")
      .map((change) => ({
        node: change.node,
        content: change.content,
        tags: getFileTagsFromContent(change.content)
      }));
    if (!normalizedChanges.length) return [];

    const changedGraphTabs = [];
    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files) continue;
      let changed = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        const matchingChange = normalizedChanges.find((change) => sidebarNodeMatchesSnapshotFile(change.node, snapshotFile));
        if (!matchingChange) return;
        snapshotFile.content = matchingChange.content;
        snapshotFile.tags = matchingChange.tags;
        (tab.graphSnapshot.nodes || []).forEach((nodeData) => {
          if (!graphNodeMatchesSnapshotFile(nodeData, snapshotFile)) return;
          nodeData.tags = matchingChange.tags;
          if (nodeData.content !== undefined) nodeData.content = matchingChange.content;
        });
        changed = true;
      });
      if (!changed) continue;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedGraphTabs.push(tab);
    }
    return changedGraphTabs;
  }

  function queueGraphSnapshotRefresh(changedGraphTabs) {
    const graphTabsToRefresh = Array.from(new Set((changedGraphTabs || []).filter((tab) => tab?.type === "graph")));
    if (!graphTabsToRefresh.length) return;
    setTimeout(async () => {
      for (const tab of graphTabsToRefresh) {
        if (!tabs.includes(tab) || !tab.graphSnapshot?.files) continue;
        try {
          const currentSnapshot = tab.graphSnapshot;
          tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
          if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
          graphRenderCache.delete(tab.id);
          markGraphTabAsChanged(tab);
        } catch (error) {
          console.warn("Failed to refresh graph snapshot after folder tag update:", error);
        }
      }
      saveTabsToStorage(tabs);
    }, 250);
  }

  function updateOpenMarkdownTabsForSidebarNode(node, content) {
    const normalizedContent = normalizeEditorContent(content);
    let changed = false;
    tabs.forEach((tab) => {
      if (!tab || tab.type === "graph") return;
      const matchesHandle = node.handle && tab.sourceFileHandle === node.handle;
      const nodePathKey = getComparableFilePath(node.fullPath || node.path || "");
      const tabPathKey = getComparableFilePath(tab.sourceFilePath || "");
      const matchesPath = nodePathKey && tabPathKey && nodePathKey === tabPathKey;
      const matchesName = node.name && tab.sourceFileName === node.name;
      if (!matchesHandle && !matchesPath && !matchesName) return;
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        setActiveEditorContent(normalizedContent);
        renderEditorSyntaxHighlights();
        updateEditorLineNumbers();
        renderMarkdown();
      }
      changed = true;
    });
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
  }

  async function setSidebarNodeTags(node, nextTags) {
    const currentContent = await readSidebarNodeContent(node);
    const nextContent = setFileTagsInContent(currentContent, nextTags);
    if (nextContent === currentContent) return;

    await writeSidebarNodeContent(node, nextContent);
    node.tags = getFileTagsFromContent(nextContent);

    const folderEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      const nodePathKey = getFolderTreeNodePathKey(node);
      return entry.handle === node.handle || (entryPathKey && nodePathKey && entryPathKey === nodePathKey);
    });
    if (folderEntry) {
      folderEntry.content = nextContent;
      folderEntry.tags = node.tags;
    }
    updateFolderTreeNodeTagsForEntry(folderEntry || node, node.tags);
    updateOpenMarkdownTabsForSidebarNode(node, nextContent);
    saveKnownTags([...getKnownTags(), ...node.tags]);
    await updateGraphSnapshotsForSidebarFileTagChange(node, nextContent);
    await refreshFolderTagCounts();
    renderFilteredFolderTree();
    renderTagManagementList();
    renderLinkAutocomplete();
    saveTabsToStorage(tabs);
    if (getActiveGraphTab()) renderGraphView();
  }

  async function setSidebarFolderTag(node, tag, shouldAdd) {
    const normalizedTag = normalizeTagName(tag);
    if (!node || node.kind !== "directory" || !normalizedTag) return;

    const folderFiles = isOpenFolderRootContextNode(node)
      ? await getOpenFolderMarkdownFilesForGraph()
      : await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to tag.");
      return;
    }

    const changedEntries = [];
    const graphTagChanges = [];
    const failedEntries = [];
    for (const entry of folderFiles) {
      try {
        const currentContent = await getEntryContent(entry);
        const currentTags = getFileTagsFromContent(currentContent);
        if (shouldAdd && currentTags.includes(normalizedTag)) continue;
        if (!shouldAdd && !currentTags.includes(normalizedTag)) continue;

        const nextTags = shouldAdd
          ? [...currentTags, normalizedTag]
          : currentTags.filter((existingTag) => existingTag !== normalizedTag);
        const nextContent = setFileTagsInContent(currentContent, nextTags);
        if (nextContent === currentContent) continue;

        await writeFolderMarkdownEntryContent(entry, nextContent);
        entry.content = nextContent;
        entry.tags = getFileTagsFromContent(nextContent);
        const folderEntry = getSidebarMarkdownFileEntry(entry);
        if (folderEntry && folderEntry !== entry) {
          folderEntry.content = nextContent;
          folderEntry.tags = entry.tags;
        }
        updateFolderTreeNodeTagsForEntry(entry, entry.tags);
        updateOpenMarkdownTabsForSidebarNode(entry, nextContent);
        graphTagChanges.push({ node: entry, content: nextContent });
        changedEntries.push(entry);
      } catch (error) {
        failedEntries.push(entry);
        console.error("Failed to update folder file tags:", entry.path || entry.fullPath || entry.name, error);
      }
    }

    const changedGroups = shouldAdd ? ensureActiveGraphTagGroup(normalizedTag) : false;
    const changedGraphTabs = applyGraphSnapshotTagChanges(graphTagChanges);
    if (shouldAdd) saveKnownTags([...getKnownTags(), normalizedTag]);
    await refreshFolderTagCounts();
    renderFilteredFolderTree();
    renderTagManagementList();
    renderLinkAutocomplete();
    const activeGraphTab = getActiveGraphTab();
    if (changedGroups && activeGraphTab) updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
    saveTabsToStorage(tabs);
    if (getActiveGraphTab() || changedEntries.length) renderGraphView();
    queueGraphSnapshotRefresh(changedGraphTabs);

    if (failedEntries.length) {
      alert(`Unable to update tags for ${failedEntries.length} file${failedEntries.length === 1 ? "" : "s"} in this folder.`);
    }
  }

  function ensureActiveGraphTagGroup(tag) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return false;
    const normalizedTag = normalizeTagName(tag);
    if (!normalizedTag) return false;

    const tagQuery = `tag:${normalizedTag}`;
    const currentConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    let changed = false;
    const groups = currentConfig.groups.map((group) => {
      if (String(group.query || "").trim().toLowerCase() !== tagQuery.toLowerCase()) return group;
      if (group.enabled !== false && group.hidden !== true) return group;
      changed = true;
      return { ...group, enabled: true, hidden: false };
    });

    if (!groups.some((group) => String(group.query || "").trim().toLowerCase() === tagQuery.toLowerCase())) {
      groups.push(normalizeGraphGroups([{
        id: createGraphGroupId(`${tagQuery}:${Date.now()}`),
        query: tagQuery,
        color: getNextDefaultGraphGroupColor(groups),
        enabled: true,
        hidden: false
      }])[0]);
      changed = true;
    }

    if (!changed) return false;
    activeGraphTab.graphViewConfig = normalizeGraphViewConfig({
      ...currentConfig,
      groups
    });
    markGraphTabAsChanged(activeGraphTab);
    return true;
  }

  async function getSidebarFolderTagsAppliedToAll(node) {
    const folderFiles = isOpenFolderRootContextNode(node)
      ? await getOpenFolderMarkdownFilesForGraph()
      : await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) return [];

    let appliedToAllTags = null;
    for (const entry of folderFiles) {
      const tags = getFileTagsFromContent(await getEntryContent(entry));
      const tagSet = new Set(tags);
      if (appliedToAllTags === null) {
        appliedToAllTags = tagSet;
      } else {
        appliedToAllTags = new Set(Array.from(appliedToAllTags).filter((tag) => tagSet.has(tag)));
      }
      if (!appliedToAllTags.size) break;
    }
    return Array.from(appliedToAllTags || []).sort((a, b) => a.localeCompare(b));
  }

  function runWithTemporaryEditorContent(content, action) {
    const previousValue = getActiveEditorContent();
    setActiveEditorContent(content || "");
    try {
      action();
    } finally {
      setActiveEditorContent(previousValue);
      renderEditorSyntaxHighlights();
      updateEditorLineNumbers();
    }
  }

  function exportMarkdownContent(content, name) {
    const suggestedName = sanitizeMarkdownFileName(name || "document");
    saveAs(new Blob([content || ""], { type: "text/markdown;charset=utf-8" }), suggestedName);
  }

  function exportHtmlContent(content) {
    runWithTemporaryEditorContent(content, () => exportHtml.click());
  }

  function exportPdfContent(content) {
    runWithTemporaryEditorContent(content, () => exportPdf.click());
  }

  function getSidebarNodeFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (node.fullPath) {
      if (activeFolderPath && node.path && !isPathInsideFolder(node.fullPath, activeFolderPath)) {
        return joinPath(activeFolderPath, node.path);
      }
      return node.fullPath;
    }
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  async function copySidebarContextText(text) {
    if (isNeutralinoRuntime() && Neutralino.clipboard?.writeText) {
      await Neutralino.clipboard.writeText(text || "");
      showCopiedMessage();
      return;
    }
    await copyToClipboard(text || "");
  }

  function getMarkdownFrontmatterText(markdown) {
    const match = String(markdown || "").match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    return match ? match[0].trimEnd() : "";
  }

  function hideSidebarFileContextMenu() {
    if (!sidebarFileContextMenu) return;
    sidebarFileContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
    sidebarContextSelection = [];
  }

  function hideSidebarFolderContextMenu() {
    if (!sidebarFolderContextMenu) return;
    sidebarFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
    sidebarContextSelection = [];
  }

  function hideSidebarClosedFolderContextMenu() {
    if (!sidebarClosedFolderContextMenu) return;
    sidebarClosedFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
    sidebarContextSelection = [];
  }

  function hideSidebarContextMenus() {
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    hideSidebarClosedFolderContextMenu();
  }

  function positionSidebarContextMenu(menu, event, fallbackHeight) {
    if (!menu) return;
    menu.querySelectorAll(".graph-context-menu-submenu").forEach((submenu) => {
      submenu.classList.remove("open-left", "open-up");
    });
    const menuWidth = menu.offsetWidth || 230;
    const menuHeight = menu.offsetHeight || fallbackHeight || 280;
    const left = Math.max(8, Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8)));
    const top = Math.max(8, Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    positionContextSubmenus(menu);
  }

  function positionContextSubmenus(menu) {
    if (!menu) return;
    menu.querySelectorAll(".graph-context-menu-submenu").forEach((submenu) => {
      const panel = submenu.querySelector(".graph-context-menu-submenu-panel");
      if (!panel) return;
      submenu.classList.remove("open-left", "open-up");
      const previousDisplay = panel.style.display;
      const previousVisibility = panel.style.visibility;
      panel.style.display = "inline-flex";
      panel.style.visibility = "hidden";
      const submenuRect = submenu.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (submenuRect.right + panelRect.width + 4 > window.innerWidth) submenu.classList.add("open-left");
      if (submenuRect.top + panelRect.height > window.innerHeight - 8) submenu.classList.add("open-up");
      panel.style.display = previousDisplay;
      panel.style.visibility = previousVisibility;
    });
  }

  function positionSidebarFileContextMenu(event) {
    positionSidebarContextMenu(sidebarFileContextMenu, event, 320);
  }

  function positionSidebarFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarFolderContextMenu, event, 360);
  }

  function positionSidebarClosedFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarClosedFolderContextMenu, event, 80);
  }

  function getOpenFolderMainMenuButton() {
    return document.querySelector("#import-from-folder");
  }

  function getOpenFolderActionLabel() {
    const button = getOpenFolderMainMenuButton();
    const buttonLabel = button ? button.textContent.replace(/\s+/g, " ").trim() : "";
    return buttonLabel ? buttonLabel.replace(/\s*\.\.\.$/, "") : CONTEXT_MENU_ACTIONS.openFolder.label;
  }

  function getOpenFolderActionTitle() {
    const button = getOpenFolderMainMenuButton();
    return (button && button.title) || "Open a folder to browse text and graph files.";
  }

  function getPathDirectory(path) {
    if (!path) return "";
    const normalized = String(path);
    const lastSlash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  }

  function getRenamedSiblingPath(path, newName) {
    const directory = getPathDirectory(path);
    return directory ? joinPath(directory, newName) : newName;
  }

  function validateSidebarRenameName(name, kind) {
    const value = String(name || "").trim();
    if (!value) return `Enter a name before ${kind === "new-file" ? "creating the file" : "renaming"}.`;
    if (/[\\/]/.test(value)) return "Enter a name only, without folder separators.";
    if (/^\.+$/.test(value)) return "Enter a name that is not only dots.";
    return "";
  }

  function promptSidebarRename(node, kind) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = kind === "folder" ? "Rename folder" : "Rename file";
      input.value = node?.name || "";
      input.placeholder = kind === "folder" ? "Folder name" : "File name";
      confirmBtn.textContent = "Rename";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        resolve(result);
      }

      function onConfirm() {
        const newName = input.value.trim();
        const validationMessage = validateSidebarRenameName(newName, kind);
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(newName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFileName(parentNode, options = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = options.title || `New file in ${parentNode?.name || "folder"}`;
      input.value = "Untitled.md";
      input.placeholder = "File name (for example, notes.md)";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();
      input.select();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const fileName = input.value.trim();
        const validationMessage = validateSidebarRenameName(fileName, "new-file");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        cleanup(fileName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function promptSidebarNewFolderName(parentNode) {
    return new Promise((resolve) => {
      const modal = document.getElementById('rename-modal');
      const title = document.getElementById('rename-modal-title');
      const input = document.getElementById('rename-modal-input');
      const confirmBtn = document.getElementById('rename-modal-confirm');
      const cancelBtn = document.getElementById('rename-modal-cancel');
      if (!modal || !input || !confirmBtn || !cancelBtn) {
        resolve(null);
        return;
      }

      if (title) title.textContent = `New folder in ${parentNode?.name || "folder"}`;
      input.value = "";
      input.placeholder = "Folder name";
      confirmBtn.textContent = "Create";
      modal.style.display = 'flex';
      input.focus();

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.style.display = 'none';
        confirmBtn.textContent = "Rename";
        resolve(result);
      }

      function onConfirm() {
        const folderName = input.value.trim();
        const validationMessage = validateSidebarRenameName(folderName, "folder");
        if (validationMessage) {
          alert(validationMessage);
          input.focus();
          return;
        }
        if ((parentNode?.children || []).some((child) => child.kind === "directory" && child.name.toLowerCase() === folderName.toLowerCase())) {
          alert("A folder with this name already exists here.");
          input.focus();
          return;
        }
        cleanup(folderName);
      }

      function onCancel() {
        cleanup(null);
      }

      function onKey(event) {
        if (event.key === 'Enter') onConfirm();
        else if (event.key === 'Escape') onCancel();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  }

  function updateTabsAfterSidebarFileRename(target, oldPath, newPath, newName) {
    let changed = false;
    tabs.forEach((tab) => {
      const matchesPath = oldPath && tab.sourceFilePath === oldPath;
      const matchesHandle = target?.handle && tab.sourceFileHandle === target.handle;
      if (!matchesPath && !matchesHandle) return;
      tab.sourceFileName = newName;
      if (newPath) tab.sourceFilePath = newPath;
      if (newPath && tab.openedSource) {
        tab.openedSource = Object.assign({}, tab.openedSource, { path: newPath, name: newName });
      }
      if (tab.type !== "graph") {
        tab.title = isGraphFilePath(newName) ? getGraphTitleFromFileName(newName) : getMarkdownTitleFromFileName(newName);
      }
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath || target?.path, newPath, "file")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  function stripMarkdownExtension(path) {
    return String(path || "").replace(/\.(md|markdown)$/i, "");
  }

  function splitMarkdownLinkSuffix(reference) {
    const value = String(reference || "");
    let suffixIndex = -1;
    ["#", "?"].forEach((marker) => {
      const index = value.indexOf(marker);
      if (index >= 0 && (suffixIndex < 0 || index < suffixIndex)) suffixIndex = index;
    });
    if (suffixIndex < 0) return { target: value, suffix: "" };
    return {
      target: value.slice(0, suffixIndex),
      suffix: value.slice(suffixIndex)
    };
  }

  function getRelativePathBetweenFiles(sourcePath, targetPath) {
    const sourceParts = String(sourcePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    const targetParts = String(targetPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    sourceParts.pop();
    while (sourceParts.length && targetParts.length && sourceParts[0].toLowerCase() === targetParts[0].toLowerCase()) {
      sourceParts.shift();
      targetParts.shift();
    }
    return [...sourceParts.map(() => ".."), ...targetParts].join("/");
  }

  function getRenameReferenceTargetPath(referenceTarget, sourcePath, oldPath, newPath, kind, resolvedTargetPath) {
    const normalizedTarget = String(referenceTarget || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    const targetHasMarkdownExtension = /\.(md|markdown)$/i.test(normalizedTarget);
    const useExtension = targetHasMarkdownExtension;
    const isBareReference = !normalizedTarget.includes("/");
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const newRelativePath = activeFolderPath ? getPathRelativeToFolder(newPath, activeFolderPath) : newPath;
    const normalizedOldRelativePath = String(oldRelativePath || oldPath || "").replace(/\\/g, "/");
    const normalizedNewRelativePath = String(newRelativePath || newPath || "").replace(/\\/g, "/");
    if (!normalizedOldRelativePath || !normalizedNewRelativePath) return null;

    const renamedPath = kind === "folder"
      ? stripMarkdownExtension(replacePathPrefix(resolvedTargetPath, normalizedOldRelativePath, normalizedNewRelativePath))
      : stripMarkdownExtension(normalizedNewRelativePath);

    if (!renamedPath || renamedPath === normalizedTarget) return null;

    const sourceAfterRename = kind === "folder"
      ? replacePathPrefix(sourcePath, normalizedOldRelativePath, normalizedNewRelativePath)
      : sourcePath;
    let replacement = isBareReference
      ? (renamedPath.split("/").pop() || renamedPath)
      : getRelativePathBetweenFiles(sourceAfterRename, useExtension ? `${renamedPath}.md` : renamedPath);
    if (!useExtension) replacement = stripMarkdownExtension(replacement);
    if (useExtension && !/\.(md|markdown)$/i.test(replacement)) replacement += ".md";
    if (String(referenceTarget || "").startsWith("./") && !replacement.startsWith(".") && !replacement.startsWith("/")) {
      replacement = `./${replacement}`;
    }
    if (String(referenceTarget || "").startsWith("/") && !replacement.startsWith("/")) {
      replacement = `/${useExtension ? `${renamedPath}.md` : stripMarkdownExtension(renamedPath)}`;
    }
    return replacement;
  }

  function updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind) {
    if (!content || !oldPath || !newPath) return content;
    const oldRelativePath = activeFolderPath ? getPathRelativeToFolder(oldPath, activeFolderPath) : oldPath;
    const oldTargetId = normalizeGraphNodeName(oldRelativePath || oldPath);
    const getResolvedRenameTarget = (reference) => {
      const target = resolveGraphTargetId(reference, sourcePath, nodeIndex);
      if (!target) return null;
      const isMatch = kind === "folder" ? (target === oldTargetId || target.startsWith(oldTargetId + "/")) : target === oldTargetId;
      return isMatch ? { id: target, path: nodeIndex.get(target) || target } : null;
    };
    const renameReference = (reference) => {
      const { target, suffix } = splitMarkdownLinkSuffix(reference);
      const resolvedTarget = getResolvedRenameTarget(target);
      if (!resolvedTarget) return reference;
      const renamedTarget = getRenameReferenceTargetPath(target, sourcePath, oldPath, newPath, kind, resolvedTarget.path);
      return renamedTarget ? `${renamedTarget}${suffix}` : reference;
    };

    return String(content)
      .replace(/\[\[([^\]]+)\]\]/g, (fullMatch, inner) => {
        const pipeIndex = String(inner).indexOf("|");
        const target = pipeIndex >= 0 ? String(inner).slice(0, pipeIndex) : String(inner);
        const alias = pipeIndex >= 0 ? String(inner).slice(pipeIndex) : "";
        const renamedTarget = renameReference(target.trim());
        return renamedTarget === target.trim() ? fullMatch : `[[${renamedTarget}${alias}]]`;
      })
      .replace(/(\[[^\]]*?\]\()([^\s)]+)(\))/g, (fullMatch, prefix, url, suffix) => {
        if (/^(https?:|mailto:|tel:|#)/i.test(url)) return fullMatch;
        const renamedUrl = renameReference(url);
        return renamedUrl === url ? fullMatch : `${prefix}${renamedUrl}${suffix}`;
      });
  }

  async function writeFolderMarkdownEntryContent(entry, content, oldPath, newPath, kind) {
    const entryFullPath = entry.fullPath || null;
    let writePath = entryFullPath;
    if (kind === "folder") writePath = replacePathPrefix(entryFullPath, oldPath, newPath);
    if (kind === "file" && entryFullPath === oldPath) writePath = newPath;

    if (isNeutralinoRuntime()) {
      if (!writePath || !Neutralino.filesystem?.writeFile) throw new Error("No writable filesystem path is available.");
      await Neutralino.filesystem.writeFile(writePath, content);
      return writePath;
    }

    if (entry.handle?.createWritable) {
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return entry.path;
    }

    throw new Error("No writable file handle is available.");
  }

  function getEntryContent(entry) {
    if (entry.content !== undefined) return Promise.resolve(entry.content);
    if (entry.file) return entry.file.text();
    if (entry.handle) return entry.handle.getFile().then((file) => file.text());
    if (isNeutralinoRuntime() && entry.fullPath) return Neutralino.filesystem.readFile(entry.fullPath);
    return Promise.reject(new Error("No readable Markdown file is available."));
  }

  function updateOpenTabsAfterMarkdownLinkRename(changedFiles) {
    if (!changedFiles || !changedFiles.size) return;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type === "graph") return;
      const pathKey = tab.sourceFilePath || "";
      const handleEntry = Array.from(changedFiles.values()).find((item) => item.handle && item.handle === tab.sourceFileHandle);
      const changedEntry = changedFiles.get(pathKey) || handleEntry;
      if (!changedEntry) return;
      const normalizedContent = normalizeEditorContent(changedEntry.content);
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        setActiveEditorContent(normalizedContent);
        renderEditorSyntaxHighlights();
        renderMarkdown();
      }
      changed = true;
    });
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
    }
  }

  async function updateOpenFolderLinksAfterSidebarRename(oldPath, newPath, kind) {
    if (!oldPath || !newPath || !folderMarkdownFiles.length) return 0;
    const files = folderMarkdownFiles.slice();
    const nodeIndex = new Map();
    files.forEach((entry) => {
      const path = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      const id = normalizeGraphNodeName(path);
      if (id) nodeIndex.set(id, path);
    });

    const changedFiles = new Map();
    for (const entry of files) {
      const sourcePath = entry.path || entry.file?.webkitRelativePath || entry.file?.name || "";
      if (!sourcePath) continue;
      try {
        const content = await getEntryContent(entry);
        const updatedContent = updateMarkdownRenameLinks(content, sourcePath, nodeIndex, oldPath, newPath, kind);
        if (updatedContent === content) continue;
        const writePath = await writeFolderMarkdownEntryContent(entry, updatedContent, oldPath, newPath, kind);
        const changedEntry = {
          content: updatedContent,
          handle: entry.handle || null
        };
        [writePath, entry.fullPath, entry.path, sourcePath]
          .filter(Boolean)
          .forEach((pathKey) => changedFiles.set(pathKey, changedEntry));
      } catch (error) {
        console.warn(`Failed to update Markdown links in ${sourcePath}:`, error);
      }
    }
    updateOpenTabsAfterMarkdownLinkRename(changedFiles);
    return changedFiles.size;
  }

  function replacePathPrefix(path, oldPrefix, newPrefix) {
    if (!path || !oldPrefix || !newPrefix) return path;
    const originalPath = String(path);
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = originalPath.replace(/\\/g, "/");
    const normalizedOldPrefix = normalize(oldPrefix);
    if (normalizedPath !== normalizedOldPrefix && !normalizedPath.startsWith(normalizedOldPrefix + "/")) {
      return path;
    }
    return String(newPrefix).replace(/\/+$/, "") + normalizedPath.slice(normalizedOldPrefix.length);
  }

  function getPathRelativeToFolder(path, folderPath) {
    if (!path || !folderPath || !isPathInsideFolder(path, folderPath)) return "";
    const normalize = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedFolder = normalize(folderPath);
    const normalizedPath = String(path).replace(/\\/g, "/");
    return normalizedPath === normalizedFolder ? "" : normalizedPath.slice(normalizedFolder.length + 1);
  }

  function renameGraphSnapshotPathReferences(snapshot, pathMappings) {
    if (!snapshot || !Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    const idMappings = new Map();
    const getRenamedPath = (path) => {
      for (const mapping of pathMappings) {
        const renamed = mapping.isPrefix
          ? replacePathPrefix(path, mapping.oldPath, mapping.newPath)
          : (path === mapping.oldPath ? mapping.newPath : path);
        if (renamed !== path) return renamed;
      }
      return path;
    };

    (snapshot.nodes || []).forEach((node) => {
      const oldId = node.id;
      const oldPath = node.fullPath || oldId;
      const newPath = getRenamedPath(oldPath);
      if (newPath === oldPath) return;
      const newId = normalizeGraphNodeName(newPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      node.id = newId || oldId;
      node.label = getGraphDisplayLabel(newPath);
      node.fullPath = newPath;
      changed = true;
    });

    (snapshot.files || []).forEach((file) => {
      const oldId = file.id;
      const oldPath = file.path || oldId;
      const oldFullPath = file.fullPath || "";
      const newPath = getRenamedPath(oldPath);
      const newFullPath = getRenamedPath(oldFullPath);
      if (newPath === oldPath && newFullPath === oldFullPath) return;
      const idPath = newPath !== oldPath ? newPath : (newFullPath || oldPath);
      const newId = normalizeGraphNodeName(idPath);
      if (oldId && newId && oldId !== newId) idMappings.set(oldId, newId);
      file.id = newId || oldId;
      file.path = newPath;
      file.name = getFileName(newPath || newFullPath || file.name);
      if (file.fullPath !== undefined) file.fullPath = newFullPath || file.fullPath;
      changed = true;
    });

    if (idMappings.size) {
      (snapshot.links || []).forEach((link) => {
        const newSource = idMappings.get(link.source);
        const newTarget = idMappings.get(link.target);
        if (newSource) {
          link.source = newSource;
          changed = true;
        }
        if (newTarget) {
          link.target = newTarget;
          changed = true;
        }
      });
    }

    return { changed, idMappings };
  }

  function updateGraphTabConfigAfterNodeRename(tab, idMappings) {
    if (!tab || !idMappings || !idMappings.size) return false;
    let changed = false;
    const renameId = (id) => idMappings.get(id) || id;
    const renameIds = (ids) => Array.isArray(ids) ? ids.map(renameId) : ids;

    if (tab.graphViewConfig) {
      if (tab.graphViewConfig.focusNodeId && idMappings.has(tab.graphViewConfig.focusNodeId)) {
        tab.graphViewConfig.focusNodeId = renameId(tab.graphViewConfig.focusNodeId);
        changed = true;
      }
      ["allowedNodeIds", "hiddenNodeIds"].forEach((key) => {
        const renamedIds = renameIds(tab.graphViewConfig[key]);
        if (renamedIds && renamedIds !== tab.graphViewConfig[key]) {
          tab.graphViewConfig[key] = renamedIds;
          changed = true;
        }
      });
    }

    if (tab.graphLayout?.nodes && typeof tab.graphLayout.nodes === "object") {
      idMappings.forEach((newId, oldId) => {
        if (!Object.prototype.hasOwnProperty.call(tab.graphLayout.nodes, oldId)) return;
        tab.graphLayout.nodes[newId] = tab.graphLayout.nodes[oldId];
        delete tab.graphLayout.nodes[oldId];
        changed = true;
      });
    }

    return changed;
  }

  function updateGraphTabsAfterPathRename(pathMappings) {
    if (!Array.isArray(pathMappings) || !pathMappings.length) return false;
    let changed = false;
    tabs.forEach((tab) => {
      if (tab.type !== "graph" || !tab.graphSnapshot) return;
      const result = renameGraphSnapshotPathReferences(tab.graphSnapshot, pathMappings);
      if (!result?.changed) return;
      updateGraphTabConfigAfterNodeRename(tab, result.idMappings);
      const cachedRender = graphRenderCache.get(tab.id);
      if (cachedRender?.simulation) cachedRender.simulation.stop();
      if (cachedRender?.wrapper) cachedRender.wrapper.remove();
      graphRenderCache.delete(tab.id);
      changed = true;
    });
    return changed;
  }

  function getSidebarRenamePathMappings(oldPath, newPath, kind) {
    const mappings = [];
    if (oldPath && newPath) {
      mappings.push({ oldPath, newPath, isPrefix: kind === "folder" });
    }
    if (activeFolderPath && oldPath && newPath) {
      const oldRelativePath = getPathRelativeToFolder(oldPath, activeFolderPath);
      const newRelativePath = getPathRelativeToFolder(newPath, activeFolderPath);
      if (oldRelativePath && newRelativePath) {
        mappings.push({ oldPath: oldRelativePath, newPath: newRelativePath, isPrefix: kind === "folder" });
      }
    }
    return mappings;
  }

  function updateTabsAfterSidebarFolderRename(oldPath, newPath) {
    if (!oldPath || !newPath) return;
    let changed = false;
    tabs.forEach((tab) => {
      const renamedPath = replacePathPrefix(tab.sourceFilePath, oldPath, newPath);
      if (renamedPath === tab.sourceFilePath) return;
      tab.sourceFilePath = renamedPath;
      changed = true;
    });
    changed = updateGraphTabsAfterPathRename(getSidebarRenamePathMappings(oldPath, newPath, "folder")) || changed;
    if (changed) {
      saveTabsToStorage(tabs);
      renderTabBar(tabs, activeTabId);
      updateSaveCurrentFileButtons();
      if (getActiveGraphTab()) renderGraphView();
    }
  }

  async function sidebarFileExists(parentNode, fileName) {
    if (!parentNode || !fileName) return false;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(parentNode);
      if (!parentPath || !Neutralino.filesystem?.readDirectory) return false;
      const entries = await Neutralino.filesystem.readDirectory(parentPath);
      return entries.some((entry) => entry.entry.toLowerCase() === fileName.toLowerCase());
    }

    if (parentNode.handle && typeof parentNode.handle.getFileHandle === "function") {
      try {
        await parentNode.handle.getFileHandle(fileName, { create: false });
        return true;
      } catch (error) {
        if (error && (error.name === "NotFoundError" || error.code === 8)) return false;
        throw error;
      }
    }

    return (parentNode.children || []).some((child) => child.kind === "file" && child.name.toLowerCase() === fileName.toLowerCase());
  }

  async function createSidebarFileOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const fileName = await promptSidebarNewFileName(node);
    if (!fileName) return;

    if (await sidebarFileExists(node, fileName)) {
      alert("A file with this name already exists here.");
      return;
    }

    let createdNode = null;
    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.writeFile) {
        alert("Creating files is available only in the desktop app for folders opened from disk.");
        return;
      }
      const filePath = joinPath(parentPath, fileName);
      app.modules?.folderWatcher?.suppress?.(1000);
      await Neutralino.filesystem.writeFile(filePath, "");
      createdNode = createCreatedFolderTreeNode("file", fileName, node, { fullPath: filePath });
      app.modules?.folderWatcher?.suppress?.(500);
    } else if (node.handle && typeof node.handle.getFileHandle === "function") {
      const fileHandle = await node.handle.getFileHandle(fileName, { create: true });
      if (!fileHandle || typeof fileHandle.createWritable !== "function") {
        alert("Creating files from the folder tree requires write access to the opened folder.");
        return;
      }
      const writable = await fileHandle.createWritable();
      await writable.write("");
      await writable.close();
      createdNode = createCreatedFolderTreeNode("file", fileName, node, { handle: fileHandle });
    } else {
      alert("Creating files from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    upsertCreatedPathInFolderTree(createdNode);
  }

  async function createSidebarFolderOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const folderName = await promptSidebarNewFolderName(node);
    if (!folderName) return;

    let createdNode = null;
    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.createDirectory) {
        alert("Creating folders is available only in the desktop app for folders opened from disk.");
        return;
      }
      const folderPath = joinPath(parentPath, folderName);
      await Neutralino.filesystem.createDirectory(folderPath);
      createdNode = createCreatedFolderTreeNode("directory", folderName, node, { fullPath: folderPath });
    } else if (node.handle && typeof node.handle.getDirectoryHandle === "function") {
      const folderHandle = await node.handle.getDirectoryHandle(folderName, { create: true });
      createdNode = createCreatedFolderTreeNode("directory", folderName, node, { handle: folderHandle });
    } else {
      alert("Creating folders from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    upsertCreatedPathInFolderTree(createdNode);
  }

  function updateOpenFolderAfterRootRename(node, newName, newPath, oldPath) {
    if (!isOpenFolderRootContextNode(node)) return;
    activeFolderName = newName;
    node.name = newName;
    if (oldPath) {
      activeFolderPath = newPath;
      node.fullPath = newPath;
      saveGlobalState({ lastOpenFolderPath: newPath });
    }
  }

  async function renameSidebarNodeOnDisk(node, kind) {
    if (!node) return;
    const oldName = node.name || "";
    const newName = await promptSidebarRename(node, kind);
    if (!newName || newName === oldName) return;

    const oldPath = kind === "folder" ? getSidebarFolderFilesystemPath(node) : getSidebarNodeFilesystemPath(node);
    const newPath = oldPath ? getRenamedSiblingPath(oldPath, newName) : (node.path ? getRenamedSiblingPath(node.path, newName) : newName);

    if (isNeutralinoRuntime()) {
      if (!oldPath || !Neutralino.filesystem?.move) {
        alert(`Renaming ${kind}s requires filesystem.move permission in the desktop app for ${kind}s opened from disk.`);
        return;
      }
      await Neutralino.filesystem.move(oldPath, newPath);
    } else if (node.handle && typeof node.handle.move === "function") {
      await node.handle.move(newName);
    } else {
      alert(`Renaming ${kind}s from the folder tree is available in the desktop app for ${kind}s opened from disk.`);
      return;
    }

    updateOpenFolderAfterRootRename(node, newName, newPath, oldPath);

    const renameTreeDetails = {
      oldName,
      newName,
      oldPath: oldPath || node.path,
      newPath,
      kind
    };
    let updatedTree = false;
    if (kind === "file") {
      updatedTree = await updateRenamedPathInFolderTree(renameTreeDetails);
    }

    try {
      await updateOpenFolderLinksAfterSidebarRename(oldPath || node.path, newPath, kind);
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to update Markdown links:`, error);
    }

    if (kind === "folder") {
      updateTabsAfterSidebarFolderRename(oldPath || node.path, newPath);
    } else {
      updateTabsAfterSidebarFileRename(node, oldPath || node.path, newPath, newName);
    }

    if (kind !== "file") {
      updatedTree = await updateRenamedPathInFolderTree(renameTreeDetails);
    }
    if (!updatedTree) {
      try {
        await reloadOpenFolderTree();
      } catch (error) {
        console.warn(`Renamed ${kind}, but failed to refresh the folder tree:`, error);
      }
    }
  }

  function ensureSidebarFileContextMenu() {
    if (sidebarFileContextMenu) return sidebarFileContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-file-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const openFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInNewTab.label,
      CONTEXT_MENU_ACTIONS.openInNewTab.icon,
      "Open this file in a dedicated tab from the sidebar tree."
    );
    const openDefaultAppBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.label,
      CONTEXT_MENU_ACTIONS.openWithDefaultApp.icon,
      "Ask the operating system to open this file with its configured default application."
    );
    const openHexEditorBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openInHexEditor?.label || "Open in Hex Editor",
      CONTEXT_MENU_ACTIONS.openInHexEditor?.icon || "bi bi-file-binary",
      "Open this file in MD-Editor's built-in hexadecimal editor."
    );
    openFileBtn.dataset.sidebarBulkAction = "open-in-new-tab";
    openDefaultAppBtn.dataset.sidebarBulkAction = "open-in-default-app";
    const compareFilesBtn = createFileContextMenuButton(
      "Compare with each other",
      "bi bi-file-diff",
      "Compare the two selected files in a compare tab."
    );
    compareFilesBtn.classList.add("sidebar-compare-selected-files");
    compareFilesBtn.dataset.sidebarBulkAction = "compare-files";
    const revealFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    const openOriginalInNewTabBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openOriginalInNewTab?.label || "Open original in a new tab",
      CONTEXT_MENU_ACTIONS.openOriginalInNewTab?.icon || "bi bi-box-arrow-up-right",
      "Open the original source file referenced by this Markdown node in a new editor tab."
    );
    const openOriginalDefaultAppBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.openOriginalWithDefaultApp?.label || "Open original in default app",
      CONTEXT_MENU_ACTIONS.openOriginalWithDefaultApp?.icon || "bi bi-window",
      "Open the original source file referenced by this Markdown node with the default system application."
    );
    const revealOriginalFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealOriginalInFileExplorer?.label || "Reveal original in file explorer",
      CONTEXT_MENU_ACTIONS.revealOriginalInFileExplorer?.icon || "bi bi-folder2-open",
      "Open the original source file's folder in the system file explorer and select it when supported."
    );
    const originalSourceSubmenu = document.createElement("div");
    originalSourceSubmenu.className = "graph-context-menu-submenu sidebar-original-source-submenu";
    const originalSourceSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.originalSource?.label || "Original Source",
      CONTEXT_MENU_ACTIONS.originalSource?.icon || "bi bi-file-earmark-code",
      "Open original source file actions."
    );
    originalSourceSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(originalSourceSubmenuBtn);
    const originalSourceSubmenuArrow = document.createElement("span");
    originalSourceSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    originalSourceSubmenuArrow.textContent = "›";
    originalSourceSubmenuBtn.appendChild(originalSourceSubmenuArrow);
    const originalSourceSubmenuPanel = document.createElement("div");
    originalSourceSubmenuPanel.className = "graph-context-menu-submenu-panel";
    [openOriginalInNewTabBtn, openOriginalDefaultAppBtn, revealOriginalFileBtn].forEach((button) => originalSourceSubmenuPanel.appendChild(button));
    originalSourceSubmenu.appendChild(originalSourceSubmenuBtn);
    originalSourceSubmenu.appendChild(originalSourceSubmenuPanel);
    const showLocalGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showLocalGraph?.label || "Show local graph",
      CONTEXT_MENU_ACTIONS.showLocalGraph?.icon || "bi bi-diagram-2",
      "Open a graph focused on this file and the files it directly links to."
    );
    showLocalGraphBtn.classList.add("sidebar-file-graph-action");
    const showFullLocalGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullLocalGraph?.label || "Show full local graph",
      CONTEXT_MENU_ACTIONS.showFullLocalGraph?.icon || CONTEXT_MENU_ACTIONS.showFullNetwork?.icon || "bi bi-diagram-3",
      "Open a graph that follows every outgoing dependency reachable from this file."
    );
    showFullLocalGraphBtn.classList.add("sidebar-file-graph-action");
    const showFullNetworkBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullNetwork?.label || "Show full network",
      CONTEXT_MENU_ACTIONS.showFullNetwork?.icon || "bi bi-diagram-3",
      "Open a graph containing every recursive backlink and outgoing dependency reachable from this file."
    );
    showFullNetworkBtn.classList.add("sidebar-file-graph-action");
    const showGraphSubmenu = document.createElement("div");
    showGraphSubmenu.className = "graph-context-menu-submenu sidebar-file-graph-submenu";
    const showGraphSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showGraph?.label || "Show graph",
      CONTEXT_MENU_ACTIONS.showGraph?.icon || "bi bi-diagram-3",
      "Open graph views for this file."
    );
    showGraphSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(showGraphSubmenuBtn);
    const showGraphSubmenuArrow = document.createElement("span");
    showGraphSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    showGraphSubmenuArrow.textContent = "›";
    showGraphSubmenuBtn.appendChild(showGraphSubmenuArrow);
    const showGraphSubmenuPanel = document.createElement("div");
    showGraphSubmenuPanel.className = "graph-context-menu-submenu-panel";
    [showLocalGraphBtn, showFullLocalGraphBtn, showFullNetworkBtn].forEach((button) => showGraphSubmenuPanel.appendChild(button));
    showGraphSubmenu.appendChild(showGraphSubmenuBtn);
    showGraphSubmenu.appendChild(showGraphSubmenuPanel);
    const compileJavaFileBtn = createFileContextMenuButton(
      "Compile File",
      "bi bi-file-earmark-code",
      "Compile this Java source file with the active project provider."
    );
    compileJavaFileBtn.classList.add("sidebar-project-command");
    compileJavaFileBtn.dataset.projectCommand = "compile-file";
    const runJavaMainBtn = createFileContextMenuButton(
      "Java Application",
      "bi bi-play-fill",
      "Run this Java source file's public static void main method."
    );
    runJavaMainBtn.classList.add("sidebar-run-java-main");
    const configureJavaRunBtn = createFileContextMenuButton(
      "Config new Run ...",
      "bi bi-sliders",
      "Prepare a new Java Application Run configuration without running it."
    );
    configureJavaRunBtn.classList.add("sidebar-configure-java-run");
    const runSubmenu = document.createElement("div");
    runSubmenu.className = "graph-context-menu-submenu sidebar-file-run-submenu hidden";
    const runSubmenuBtn = createFileContextMenuButton(
      "Run As",
      "bi bi-play-fill",
      "Choose how to run this Java file."
    );
    runSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(runSubmenuBtn);
    const runSubmenuArrow = document.createElement("span");
    runSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    runSubmenuArrow.textContent = "›";
    runSubmenuBtn.appendChild(runSubmenuArrow);
    const runSubmenuPanel = document.createElement("div");
    runSubmenuPanel.className = "graph-context-menu-submenu-panel";
    runSubmenuPanel.appendChild(runJavaMainBtn);
    runSubmenuPanel.appendChild(configureJavaRunBtn);
    runSubmenu.appendChild(runSubmenuBtn);
    runSubmenu.appendChild(runSubmenuPanel);
    const documentJavaFileBtn = createFileContextMenuButton(
      "Generate Documentation...",
      "bi bi-journal-code",
      "Generate documentation for this Java source file."
    );
    documentJavaFileBtn.classList.add("sidebar-project-command");
    documentJavaFileBtn.dataset.projectCommand = "generate-documentation";
    const formatJavaSourceBtn = createFileContextMenuButton(
      "Format Files",
      "bi bi-magic",
      "Open this Java file in a new tab and format it."
    );
    const organizeJavaImportsBtn = createFileContextMenuButton(
      "Organize Imports",
      "bi bi-diagram-3",
      "Open this Java file in a new tab and organize its imports."
    );
    const sourceSubmenu = document.createElement("div");
    sourceSubmenu.className = "graph-context-menu-submenu sidebar-file-source-submenu";
    const sourceSubmenuBtn = createFileContextMenuButton(
      "Source",
      "bi bi-code-slash",
      "Open source actions for this Java file."
    );
    sourceSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(sourceSubmenuBtn);
    const sourceSubmenuArrow = document.createElement("span");
    sourceSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    sourceSubmenuArrow.textContent = "›";
    sourceSubmenuBtn.appendChild(sourceSubmenuArrow);
    const sourceSubmenuPanel = document.createElement("div");
    sourceSubmenuPanel.className = "graph-context-menu-submenu-panel";
    [compileJavaFileBtn, documentJavaFileBtn, formatJavaSourceBtn, organizeJavaImportsBtn].forEach((button) => sourceSubmenuPanel.appendChild(button));
    sourceSubmenu.appendChild(sourceSubmenuBtn);
    sourceSubmenu.appendChild(sourceSubmenuPanel);
    const { submenu: openApiSubmenu, submenuPanel: openApiSubmenuPanel } = createOpenApiContextSubmenu(
      "sidebar-file-openapi-submenu",
      "Generate, update, remove, or generate code from OpenAPI / Swagger assets."
    );
    const generateOpenApiFileBtn = createFileContextMenuButton(
      "Generate OpenAPI doc",
      "bi bi-file-earmark-plus",
      "Generate OpenAPI entries from this Java source file."
    );
    generateOpenApiFileBtn.classList.add("sidebar-openapi-source-action");
    const updateOpenApiFileBtn = createFileContextMenuButton(
      "Update OpenAPI doc",
      "bi bi-arrow-repeat",
      "Update an OpenAPI document from this Java source file."
    );
    updateOpenApiFileBtn.classList.add("sidebar-openapi-source-action");
    const removeOpenApiFileBtn = createFileContextMenuButton(
      "Remove from OpenAPI Doc",
      "bi bi-file-earmark-minus",
      "Remove this Java source file's endpoints from an OpenAPI document."
    );
    removeOpenApiFileBtn.classList.add("sidebar-openapi-source-action");
    const generateOpenApiCodeBtn = createFileContextMenuButton(
      "Generate Code...",
      "bi bi-braces",
      "Generate source code from this OpenAPI document."
    );
    generateOpenApiCodeBtn.classList.add("sidebar-openapi-codegen-action");
    openApiSubmenuPanel.append(generateOpenApiFileBtn, updateOpenApiFileBtn, removeOpenApiFileBtn, generateOpenApiCodeBtn);
    const renameFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this file on disk and refresh the folder tree."
    );

    const { submenu: tagsSubmenu, submenuPanel: tagsSubmenuPanel } = createTagsContextSubmenu(
      "Add or remove YAML frontmatter tags for this file."
    );

    const copySubmenu = document.createElement("div");
    copySubmenu.className = "graph-context-menu-submenu";
    const copySubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copy.label,
      CONTEXT_MENU_ACTIONS.copy.icon,
      "Open copy actions for this file, including its path and content."
    );
    copySubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(copySubmenuBtn);
    const copySubmenuArrow = document.createElement("span");
    copySubmenuArrow.className = "graph-context-menu-submenu-arrow";
    copySubmenuArrow.textContent = "›";
    copySubmenuBtn.appendChild(copySubmenuArrow);
    const copySubmenuPanel = document.createElement("div");
    copySubmenuPanel.className = "graph-context-menu-submenu-panel";
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this file's path and file name to the clipboard."
    );
    copyPathBtn.dataset.sidebarBulkAction = "copy-path";
    const copyContentBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire content of this file to the clipboard."
    );
    const copyFrontmatterBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyFrontmatter.label,
      CONTEXT_MENU_ACTIONS.copyFrontmatter.icon,
      "Copy this file's YAML frontmatter block to the clipboard."
    );
    const copyTagsBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyTags.label,
      CONTEXT_MENU_ACTIONS.copyTags.icon,
      "Copy this file's frontmatter tags, one tag per line."
    );
    copySubmenuPanel.appendChild(copyPathBtn);
    copySubmenuPanel.appendChild(copyContentBtn);
    copySubmenuPanel.appendChild(copyFrontmatterBtn);
    copySubmenuPanel.appendChild(copyTagsBtn);
    copySubmenu.appendChild(copySubmenuBtn);
    copySubmenu.appendChild(copySubmenuPanel);

    const shareFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.share.label,
      CONTEXT_MENU_ACTIONS.share.icon,
      "Copy a shareable URL containing this file's Markdown content."
    );

    const deleteFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFile.label,
      CONTEXT_MENU_ACTIONS.deleteFile.icon,
      "Delete this file from disk after confirmation."
    );
    deleteFileBtn.dataset.sidebarBulkAction = "delete";
    deleteFileBtn.classList.add("graph-context-menu-item-danger");

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu";
    const exportSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this file."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    disableContextMenuTooltip(exportSubmenuBtn);
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this file as Markdown.");
    const exportHtmlBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this file as HTML.");
    const exportPdfBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this file as PDF.");
    const exportOriginalNodeBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportOriginalNode?.label || "Export original node",
      CONTEXT_MENU_ACTIONS.exportOriginalNode?.icon || "bi bi-file-earmark-arrow-down",
      "Copy the original source file referenced by this Markdown node into a selected folder."
    );
    exportOriginalNodeBtn.classList.add("sidebar-export-original-node");
    [shareFileBtn, exportMarkdownBtn, exportHtmlBtn, exportPdfBtn, exportOriginalNodeBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
    exportSubmenu.appendChild(exportSubmenuBtn);
    exportSubmenu.appendChild(exportSubmenuPanel);

    const deleteFileTopSeparator = document.createElement("div");
    deleteFileTopSeparator.className = "graph-context-menu-separator";
    const deleteFileBottomSeparator = document.createElement("div");
    deleteFileBottomSeparator.className = "graph-context-menu-separator";

    [
      title,
      separator,
      openFileBtn,
      openHexEditorBtn,
      openDefaultAppBtn,
      compareFilesBtn,
      revealFileBtn,
      originalSourceSubmenu,
      showGraphSubmenu,
      runSubmenu,
      sourceSubmenu,
      openApiSubmenu,
      renameFileBtn,
      tagsSubmenu,
      copySubmenu,
      deleteFileTopSeparator,
      deleteFileBtn,
      deleteFileBottomSeparator,
      exportSubmenu
    ].forEach((item) => {
      menu.appendChild(item);
    });
    document.body.appendChild(menu);

    openFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const fileNodes = getSidebarContextFileNodes(target);
      hideSidebarFileContextMenu();
      for (const fileNode of fileNodes) {
        try {
          const source = getSidebarNodeSource(fileNode);
          logSidebarLargeFileOpen("info", "context open requested", {
            name: source?.name || "",
            path: source?.path || "",
            fullPath: source?.fullPath || "",
            size: Number(source?.size || 0)
          });
          await openDocumentSourceFile(source, { temporary: false });
        } catch (error) {
          logSidebarLargeFileOpen("error", "context open failed", {
            name: fileNode.name || "",
            path: fileNode.path || "",
            fullPath: fileNode.fullPath || "",
            size: Number(fileNode.size || 0),
            error: getSidebarLogErrorDetails(error)
          });
          console.error("Failed to open sidebar context file:", error);
          alert("Unable to open selected file.");
          return;
        }
      }
    });

    openHexEditorBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openDocumentSourceFile(getSidebarNodeSource(target), {
          temporary: false,
          forceHex: true,
          skipExistingSourceTab: true
        });
      } catch (error) {
        console.error("Failed to open sidebar file in hex editor:", error);
        alert("Unable to open this file in the hex editor.");
      }
    });

    compareFilesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const fileNodes = getSidebarContextFileNodes(sidebarContextTarget);
      hideSidebarFileContextMenu();
      if (fileNodes.length !== 2) return;
      const compareFiles = app.modules?.fileCompare?.openCompareFiles;
      if (typeof compareFiles !== "function") {
        alert("File comparison is unavailable.");
        return;
      }
      await compareFiles(getSidebarNodeSource(fileNodes[0]), getSidebarNodeSource(fileNodes[1]));
    });

    async function runSidebarJavaSourceAction(actionName) {
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openDocumentSourceFile(getSidebarNodeSource(target), { temporary: false });
        const editorActions = app.modules?.editorContextMenu;
        if (actionName === "format") {
          await editorActions?.formatEditorDocument?.({ restoreSelection: false });
        } else if (actionName === "organize-imports") {
          await editorActions?.organizeJavaImports?.({ restoreSelection: false });
        }
      } catch (error) {
        console.error("Failed to run sidebar Java source action:", error);
        alert("Unable to run this Java source action.");
      }
    }

    formatJavaSourceBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await runSidebarJavaSourceAction("format");
    });

    organizeJavaImportsBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await runSidebarJavaSourceAction("organize-imports");
    });

    runJavaMainBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const targetPath = getSidebarNodeFilesystemPath(target) || target?.fullPath || target?.path || "";
      hideSidebarFileContextMenu();
      if (!targetPath) return;
      try {
        await app.modules?.runLauncher?.runJavaFile?.(targetPath);
      } catch (error) {
        alert(error?.message || "This Java class could not be run.");
      }
    });

    configureJavaRunBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const targetPath = getSidebarNodeFilesystemPath(target) || target?.fullPath || target?.path || "";
      hideSidebarFileContextMenu();
      if (!target || !targetPath) return;
      try {
        const mainClass = await inspectSidebarJavaMainClass(target, targetPath);
        if (!mainClass) {
          alert("This saved Java file does not declare a public static void main method.");
          return;
        }
        const runConfigurationDialog = app.modules?.runConfigurationDialog;
        if (typeof runConfigurationDialog?.openNewJavaConfiguration !== "function") throw new Error("Run Configurations are unavailable.");
        await runConfigurationDialog.openNewJavaConfiguration({
          className: mainClass.className,
          simpleName: mainClass.simpleName,
          filePath: targetPath
        });
      } catch (error) {
        alert(error?.message || "A new Java Run configuration could not be prepared.");
      }
    });

    async function runSidebarOpenApiFileAction(actionName) {
      const target = sidebarContextTarget;
      const targetPath = getSidebarNodeFilesystemPath(target) || target?.fullPath || target?.path || "";
      hideSidebarFileContextMenu();
      if (!targetPath) return;
      try {
        await app.modules?.openApiEditor?.runOpenApiSourceAction?.(actionName, {
          type: "file",
          path: targetPath,
          label: target?.name || getFileName(targetPath) || "Java source file"
        });
        await refreshOpenFolderTreeFromContextMenu({ notify: false, preserveExpandedFolders: true });
      } catch (error) {
        console.error("Failed to run sidebar OpenAPI source action:", error);
        alert(error?.message || "Unable to update the OpenAPI document.");
      }
    }

    async function runSidebarOpenApiCodegenAction() {
      const target = sidebarContextTarget;
      const targetPath = getSidebarNodeFilesystemPath(target) || target?.fullPath || target?.path || "";
      hideSidebarFileContextMenu();
      if (!targetPath) return;
      try {
        const content = await readSidebarNodeContent(target);
        await app.modules?.openApiEditor?.generateCodeFromFile?.(targetPath, content);
        await refreshOpenFolderTreeFromContextMenu({ notify: false, preserveExpandedFolders: true });
      } catch (error) {
        console.error("Failed to run sidebar OpenAPI code generation:", error);
        await app.services?.notify?.show?.({
          title: "Generate Code From OpenAPI",
          message: error?.message || "Unable to generate code from this OpenAPI document.",
          dismissValue: "ok",
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
    }

    generateOpenApiCodeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await runSidebarOpenApiCodegenAction();
    });
    [
      [generateOpenApiFileBtn, "generate"],
      [updateOpenApiFileBtn, "update"],
      [removeOpenApiFileBtn, "remove"]
    ].forEach(([button, actionName]) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runSidebarOpenApiFileAction(actionName);
      });
    });



    [compileJavaFileBtn, documentJavaFileBtn].forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const target = sidebarContextTarget;
        const targetPath = getSidebarNodeFilesystemPath(target) || target?.fullPath || target?.path || "";
        hideSidebarFileContextMenu();
        if (!target) return;
        await app.modules?.projectCommands?.execute?.(button.dataset.projectCommand, {
          filePath: targetPath,
          targetPath,
          targetKind: "file",
          scope: button.dataset.projectCommand === "generate-documentation" ? "file" : undefined
        });
      });
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePaths = getSidebarContextFileNodes(target).map(getSidebarNodeFilesystemPath);
      hideSidebarFileContextMenu();
      if (!filePaths.length || filePaths.some((filePath) => !filePath) || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        for (const filePath of filePaths) await Neutralino.os.open(filePath);
      } catch (error) {
        console.error("Failed to open sidebar file with default app:", error);
        alert("Unable to open this file with the default app.");
      }
    });

    revealFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime()) {
        alert("Revealing files is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await revealFilesystemPathInExplorer(filePath);
      } catch (error) {
        console.error("Failed to reveal sidebar file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    openOriginalInNewTabBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openSidebarOriginalFileInNewTab(target);
      } catch (error) {
        console.error("Failed to open original sidebar file in a new tab:", error);
        alert("Unable to open this node's original file in a new tab.");
      }
    });

    openOriginalDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openSidebarOriginalFileWithDefaultApp(target);
      } catch (error) {
        console.error("Failed to open original sidebar file with default app:", error);
        alert("Unable to open this node's original file with the default app.");
      }
    });

    revealOriginalFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await revealSidebarOriginalFile(target);
      } catch (error) {
        console.error("Failed to reveal original sidebar file:", error);
        alert("Unable to reveal this node's original file.");
      }
    });

    showLocalGraphBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await openSidebarFileGraphView(target, "local", "Local Graph", "sidebar-file-local-graph");
      } catch (error) {
        console.error("Failed to open sidebar file local graph:", error);
        alert("Unable to open a local graph for this file.");
      }
    });

    showFullLocalGraphBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await openSidebarFileGraphView(target, "full-local", "Full Local Graph", "sidebar-file-full-local-graph");
      } catch (error) {
        console.error("Failed to open sidebar file full local graph:", error);
        alert("Unable to open a full local graph for this file.");
      }
    });

    showFullNetworkBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await openSidebarFileGraphView(target, "full-network", "Full Network", "sidebar-file-full-network");
      } catch (error) {
        console.error("Failed to open sidebar file full network:", error);
        alert("Unable to open a full network for this file.");
      }
    });

    renameFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "file");
      } catch (error) {
        console.error("Failed to rename sidebar file:", error);
        alert("Unable to rename this file.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (await copySidebarSelectedPaths()) {
        hideSidebarFileContextMenu();
        return;
      }
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarNodeClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar file path:", error);
        alert("Unable to copy this file path.");
      }
    });

    copyContentBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to copy sidebar file content:", error);
        alert("Unable to copy this file content.");
      }
    });

    copyFrontmatterBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getMarkdownFrontmatterText(await readSidebarNodeContent(target)));
      } catch (error) {
        console.error("Failed to copy sidebar file frontmatter:", error);
        alert("Unable to copy this file's frontmatter.");
      }
    });

    copyTagsBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(normalizeFileTagList(getFileTagsFromContent(await readSidebarNodeContent(target))).join("\n"));
      } catch (error) {
        console.error("Failed to copy sidebar file tags:", error);
        alert("Unable to copy this file's tags.");
      }
    });

    shareFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        copyShareUrlFromText(await readSidebarNodeContent(target), shareFileBtn);
      } catch (error) {
        console.error("Failed to share sidebar file:", error);
        alert("Unable to share this file.");
      }
    });

    exportMarkdownBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportMarkdownContent(await readSidebarNodeContent(target), target.name);
      } catch (error) {
        console.error("Failed to export sidebar file as Markdown:", error);
        alert("Unable to export this file as Markdown.");
      }
    });

    exportHtmlBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportHtmlContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as HTML:", error);
        alert("Unable to export this file as HTML.");
      }
    });

    exportPdfBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        exportPdfContent(await readSidebarNodeContent(target));
      } catch (error) {
        console.error("Failed to export sidebar file as PDF:", error);
        alert("Unable to export this file as PDF.");
      }
    });

    exportOriginalNodeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await exportSidebarFileOriginalNode(target);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Failed to export original sidebar file node:", error);
        alert("Unable to export the original file for this node.");
      }
    });

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      await deleteSidebarSelection(target);
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFileContextMenu = menu;
    return sidebarFileContextMenu;
  }

  function isOpenFolderRootContextNode(node) {
    return !!(node && node.isOpenFolderRootContext === true);
  }

  function getOpenFolderRootContextNode() {
    return {
      kind: "directory",
      name: activeFolderName || "Folder",
      path: "",
      fullPath: activeFolderPath || "",
      handle: activeFolderHandle || null,
      isOpenFolderRootContext: true
    };
  }

  function getSidebarFolderClipboardPath(node) {
    if (!node) return "";
    if (isOpenFolderRootContextNode(node)) {
      return activeFolderPath || activeFolderName || "";
    }
    return node.fullPath || node.path || node.name || "";
  }

  function getSidebarFolderFilesystemPath(node) {
    if (!node || !isNeutralinoRuntime()) return null;
    if (isOpenFolderRootContextNode(node)) return activeFolderPath || null;
    if (node.fullPath) return node.fullPath;
    if (activeFolderPath && node.path) return joinPath(activeFolderPath, node.path);
    return null;
  }

  function getSidebarFolderWorkspaceSearchInclude(node) {
    if (!node || isOpenFolderRootContextNode(node)) return "";
    let folderPath = node.path || "";
    if (!folderPath && activeFolderPath && node.fullPath) folderPath = getPathRelativeToFolder(node.fullPath, activeFolderPath);
    if (!folderPath) folderPath = node.name || "";
    const normalizedPath = String(folderPath).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    return normalizedPath ? `./${normalizedPath}/**` : "";
  }

  function getSidebarFolderGraphTitle(node) {
    const folderPath = getSidebarFolderClipboardPath(node);
    return folderPath ? `Graph View: ${folderPath}` : `Graph View: ${node?.name || "Folder"}`;
  }

  function getSidebarMarkdownFileEntry(node, files = folderMarkdownFiles) {
    if (!node) return null;
    const nodePathKey = getFolderTreeNodePathKey(node);
    return (files || []).find((entry) => {
      if (entry?.handle && node.handle && entry.handle === node.handle) return true;
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      return entryPathKey && nodePathKey && entryPathKey === nodePathKey;
    }) || null;
  }

  async function getOpenFolderMarkdownFilesForGraph() {
    if (isNeutralinoRuntime() && (currentFolderTreeNodes || []).length) {
      folderMarkdownFiles = await collectMarkdownFilesFromTreeNeutralino(
        currentFolderTreeNodes,
        "",
        { resolveLazyDirectories: true }
      );
      return folderMarkdownFiles;
    }
    if ((folderMarkdownFiles || []).length) return folderMarkdownFiles;
    if (!(currentFolderTreeNodes || []).length) return [];
    folderMarkdownFiles = await collectMarkdownFilesFromTree(currentFolderTreeNodes);
    return folderMarkdownFiles;
  }

  function getSidebarFileGraphNodeId(node, files) {
    const matchingEntry = getSidebarMarkdownFileEntry(node, files);
    if (matchingEntry) {
      return matchingEntry.id || normalizeGraphNodeName(matchingEntry.path || matchingEntry.fullPath || matchingEntry.file?.webkitRelativePath || matchingEntry.file?.name || matchingEntry.name || "");
    }
    return normalizeGraphNodeName(node?.path || node?.file?.webkitRelativePath || node?.fullPath || node?.name || "");
  }

  function logSidebarFileGraph(message, details = {}) {
    console.info("[Sidebar file graph]", message, details);
  }

  function failSidebarFileGraph(message, details = {}) {
    console.warn("[Sidebar file graph]", message, details);
    alert(message);
  }

  function logSidebarFullGraph(message, details = {}) {
    logSidebarFileGraph(message, details);
  }

  function failSidebarFullGraph(message, details = {}) {
    failSidebarFileGraph(message, details);
  }

  async function openSidebarFileGraphView(node, mode, titlePrefix, scopePrefix) {
    logSidebarFileGraph("Requested graph from tree context menu.", {
      mode,
      titlePrefix,
      nodeName: node?.name || "",
      nodePath: node?.path || "",
      nodeFullPath: node?.fullPath || "",
      nodeKind: node?.kind || "",
      activeFolderName,
      activeFolderPath
    });

    if (!node || node.kind !== "file") {
      failSidebarFileGraph("Unable to open a graph because no sidebar file is selected.", {
        nodeKind: node?.kind || "",
        nodeName: node?.name || ""
      });
      return;
    }

    const nodeGraphPath = node.name || node.path || node.fullPath || "";
    if (!isMarkdownPath(nodeGraphPath)) {
      failSidebarFileGraph("Show graph is available only for Markdown files.", {
        nodeGraphPath
      });
      return;
    }

    const files = await getOpenFolderMarkdownFilesForGraph();
    if (!files.length) {
      failSidebarFileGraph("Open a folder first to build a graph for this file.", {
        currentFolderTreeNodeCount: (currentFolderTreeNodes || []).length,
        folderMarkdownFileCount: (folderMarkdownFiles || []).length
      });
      return;
    }

    const focusNodeId = getSidebarFileGraphNodeId(node, files);
    if (!focusNodeId) {
      failSidebarFileGraph("Unable to match this file to a graph point.", {
        nodeName: node.name || "",
        nodePath: node.path || "",
        nodeFullPath: node.fullPath || "",
        markdownFileCount: files.length
      });
      return;
    }

    const graphTitle = `${titlePrefix}: ${node.name || focusNodeId}`;
    const scopeSeed = `${activeFolderPath || activeFolderName || "folder"}:${getSidebarNodeClipboardPath(node) || focusNodeId}`;
    const graphScopeKey = createFolderGraphScopeKey(scopePrefix, scopeSeed);
    if (focusExistingFolderGraphTab(graphScopeKey, graphTitle)) {
      logSidebarFileGraph("Focused an existing graph tab.", {
        mode,
        graphScopeKey,
        graphTitle,
        focusNodeId
      });
      return;
    }

    if (tabs.length >= getOpenTabLimit()) {
      failSidebarFileGraph(getOpenTabLimitMessage('open a new one'), {
        tabCount: tabs.length
      });
      return;
    }

    const graphSnapshot = await createGraphSnapshot(files, activeFolderName || "Graph View");
    const snapshotNodeIds = new Set((graphSnapshot.nodes || []).map((graphNode) => graphNode.id));
    if (!snapshotNodeIds.has(focusNodeId)) {
      failSidebarFileGraph("Unable to find this file in the current folder graph.", {
        focusNodeId,
        snapshotNodeCount: snapshotNodeIds.size,
        markdownFileCount: files.length
      });
      return;
    }

    const graphTab = await createGraphTab(graphTitle, {
      graphSnapshot,
      graphScopeKey,
      graphViewConfig: {
        mode,
        focusNodeId,
        hiddenNodeIds: []
      },
      openedSource: typeof createOpenedSource === "function"
        ? createOpenedSource(
          getSidebarNodeFilesystemPath(node) || getSidebarNodeClipboardPath(node) || focusNodeId,
          node.name || focusNodeId,
          "file-graph"
        )
        : null
    });
    if (!graphTab) {
      failSidebarFileGraph("Unable to create the graph tab.", {
        mode,
        graphTitle,
        graphScopeKey,
        focusNodeId,
        snapshotNodeCount: snapshotNodeIds.size
      });
      return;
    }
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
    logSidebarFileGraph("Opened graph tab.", {
      mode,
      graphTitle,
      graphScopeKey,
      focusNodeId,
      snapshotNodeCount: snapshotNodeIds.size,
      markdownFileCount: files.length
    });
  }

  async function openSidebarFileFullGraphView(node) {
    return openSidebarFileGraphView(node, "full-network", "Full Network", "sidebar-file-full-network");
  }

  async function collectMarkdownFilesForSidebarFolder(node) {
    if (!node || node.kind !== "directory") return [];
    const parentPath = node.path || node.name || "";
    if (isNeutralinoRuntime()) {
      if (node.childrenLazy === true && node.fullPath && typeof collectMarkdownFilesFromNeutralinoDirectory === "function") {
        return collectMarkdownFilesFromNeutralinoDirectory(node.fullPath, parentPath);
      }
      return collectMarkdownFilesFromTreeNeutralino(node.children || [], parentPath, { resolveLazyDirectories: true });
    }
    return collectMarkdownFilesFromTree(node.children || [], parentPath);
  }

  async function openSidebarFolderGraphView(node) {
    if (!node || node.kind !== "directory") return;
    if (isOpenFolderRootContextNode(node)) {
      await openGraphView();
      return;
    }

    const folderName = getSidebarFolderGraphTitle(node);
    const graphScopeKey = createFolderGraphScopeKey("sidebar-folder", getSidebarFolderClipboardPath(node) || folderName);
    if (focusExistingFolderGraphTab(graphScopeKey, folderName)) return;

    if (tabs.length >= getOpenTabLimit()) {
      alert(getOpenTabLimitMessage('open a new one'));
      return;
    }

    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to graph.");
      return;
    }

    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName);
    const graphTab = await createGraphTab(folderName, {
      graphSnapshot,
      graphScopeKey,
      openedSource: typeof createOpenedSource === "function"
        ? createOpenedSource(
          getSidebarFolderFilesystemPath(node) || getSidebarFolderClipboardPath(node) || folderName,
          node.name || folderName,
          "folder-graph"
        )
        : null
    });
    if (!graphTab) return;
    tabs.push(graphTab);
    switchTab(graphTab.id);
    saveTabsToStorage(tabs);
  }

  async function exportSidebarFolderToGraph(node) {
    if (!node || node.kind !== "directory") return false;
    if (isOpenFolderRootContextNode(node)) {
      return exportActiveFolderToGraph();
    }

    const folderName = getSidebarFolderGraphTitle(node);
    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    return exportFolderFilesToGraph(folderFiles, folderName);
  }

  function getSourceFilePathFromMarkdown(markdown) {
    const frontmatterMatch = String(markdown || "").match(/(?:^|\r?\n)---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) return "";
    const frontmatter = frontmatterMatch[1];
    const inlineSourceFileMatch = frontmatter.match(/^[ \t]*source_file[ \t]*:[ \t]*(.+?)[ \t]*$/im);
    if (inlineSourceFileMatch && inlineSourceFileMatch[1].trim()) {
      return inlineSourceFileMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }
    return "";
  }

  const normalizeOriginalSourcePath = (path) => String(path || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^['"]|['"]$/g, "");

  const stripMarkdownExportExtension = (path) => normalizeOriginalSourcePath(path)
    .replace(/^\/+/, "")
    .replace(/\.(md|markdown)$/i, "");

  function getOriginalExportActiveFolderRelativePath(fileEntry) {
    if (!activeFolderPath || !fileEntry?.fullPath) return "";
    const rootPath = normalizeOriginalSourcePath(activeFolderPath).replace(/\/+$/, "");
    const fullPath = normalizeOriginalSourcePath(fileEntry.fullPath);
    if (!rootPath || fullPath.toLowerCase() === rootPath.toLowerCase()) return "";
    const rootPrefix = `${rootPath}/`;
    if (!fullPath.toLowerCase().startsWith(rootPrefix.toLowerCase())) return "";
    return fullPath.slice(rootPrefix.length);
  }

  function getOriginalExportFilePathCandidates(fileEntry) {
    return [
      fileEntry?.path,
      fileEntry?.id,
      fileEntry?.name,
      fileEntry?.fullPath,
      getOriginalExportActiveFolderRelativePath(fileEntry),
      fileEntry?.file?.webkitRelativePath,
      fileEntry?.file?.name
    ]
      .map(stripMarkdownExportExtension)
      .filter(Boolean)
      .sort((left, right) => right.split("/").filter(Boolean).length - left.split("/").filter(Boolean).length);
  }

  function getOriginalExportRelativePath(sourcePath, fileEntry) {
    const normalizedSourcePath = normalizeOriginalSourcePath(sourcePath).replace(/^\/+/, "");
    const sourceSegments = normalizedSourcePath.split("/").filter(Boolean);
    const sourcePathKey = sourceSegments.join("/").toLowerCase();
    if (!sourceSegments.length) return "";

    const candidates = getOriginalExportFilePathCandidates(fileEntry)
      .map((candidate) => candidate.split("/").filter(Boolean))
      .filter((segments) => segments.length);

    for (const candidateSegments of candidates) {
      const candidateKey = candidateSegments.join("/").toLowerCase();
      if (!candidateKey || sourcePathKey !== candidateKey && !sourcePathKey.endsWith(`/${candidateKey}`)) continue;
      const suffixLength = candidateSegments.length;
      const projectName = sourceSegments[sourceSegments.length - suffixLength - 1];
      if (!projectName) continue;
      return [projectName, ...sourceSegments.slice(sourceSegments.length - suffixLength)].join("/");
    }

    const srcIndex = sourceSegments.findIndex((segment) => segment.toLowerCase() === "src");
    if (srcIndex > 0) return sourceSegments.slice(srcIndex - 1).join("/");
    return sourceSegments.slice(-2).join("/");
  }

  function getSourceParentFolderPath(sourcePath) {
    const normalizedSourcePath = normalizeOriginalSourcePath(sourcePath);
    const separatorIndex = normalizedSourcePath.lastIndexOf("/");
    return separatorIndex > 0 ? normalizedSourcePath.slice(0, separatorIndex) : "";
  }

  function getOriginalFolderPathCandidates(node) {
    const candidates = [
      node?.path,
      node?.fullPath,
      getOriginalExportActiveFolderRelativePath(node),
      node?.name
    ];
    return candidates
      .map((candidate) => normalizeOriginalSourcePath(candidate).replace(/^\/+/, "").replace(/\/+$/, ""))
      .filter(Boolean)
      .sort((left, right) => right.split("/").filter(Boolean).length - left.split("/").filter(Boolean).length);
  }

  function getOriginalFolderPathFromSource(sourcePath, node) {
    const sourceSegments = normalizeOriginalSourcePath(sourcePath).replace(/^\/+/, "").split("/").filter(Boolean);
    if (!sourceSegments.length) return "";
    const sourceKeySegments = sourceSegments.map((segment) => segment.toLowerCase());
    const candidates = getOriginalFolderPathCandidates(node)
      .map((candidate) => candidate.split("/").filter(Boolean))
      .filter((segments) => segments.length);

    for (const candidateSegments of candidates) {
      const candidateKeySegments = candidateSegments.map((segment) => segment.toLowerCase());
      for (let startIndex = 0; startIndex <= sourceKeySegments.length - candidateKeySegments.length; startIndex += 1) {
        const matchesCandidate = candidateKeySegments.every((segment, offset) => sourceKeySegments[startIndex + offset] === segment);
        if (matchesCandidate) {
          return sourceSegments.slice(0, startIndex + candidateSegments.length).join("/");
        }
      }
    }

    return getSourceParentFolderPath(sourcePath);
  }

  function getOriginalExportParentDirectories(path) {
    const segments = normalizeOriginalSourcePath(path).split("/").filter(Boolean);
    segments.pop();
    const directories = [];
    const startIndex = /^[a-z]:$/i.test(segments[0] || "") ? 2 : 1;
    for (let index = startIndex; index <= segments.length; index += 1) {
      directories.push(segments.slice(0, index).join("/"));
    }
    return directories;
  }

  async function createOriginalExportDirectory(directoryPath) {
    if (!directoryPath || !Neutralino.filesystem?.createDirectory) return;
    if (Neutralino.filesystem?.getStats) {
      try {
        await Neutralino.filesystem.getStats(directoryPath);
        return;
      } catch (_error) {
        // Missing folders are created below; existing folders should not be recreated.
      }
    }
    try {
      await Neutralino.filesystem.createDirectory(directoryPath);
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();
      if (!message.includes("exist") && !message.includes("already")) throw error;
    }
  }

  async function ensureOriginalExportDirectories(destinationPath, createdDirectories) {
    const directories = getOriginalExportParentDirectories(destinationPath);
    for (const directory of directories) {
      if (createdDirectories.has(directory)) continue;
      await createOriginalExportDirectory(directory);
      createdDirectories.add(directory);
    }
  }

  const showOriginalExportCompleteDialog = (message, destinationFolder) => new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "reset-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "original-export-complete-title");
    overlay.style.display = "flex";

    const box = document.createElement("div");
    box.className = "reset-modal-box original-export-complete-box";

    const title = document.createElement("p");
    title.id = "original-export-complete-title";
    title.className = "reset-modal-message";
    title.textContent = message;
    title.style.whiteSpace = "pre-line";

    const actions = document.createElement("div");
    actions.className = "reset-modal-actions original-export-complete-actions";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "reset-modal-btn reset-modal-cancel";
    closeButton.textContent = "OK";

    const openFolderButton = document.createElement("button");
    openFolderButton.type = "button";
    openFolderButton.className = "reset-modal-btn original-export-open-folder-btn";
    openFolderButton.textContent = "Open Folder";

    const showFolderButton = document.createElement("button");
    showFolderButton.type = "button";
    showFolderButton.className = "reset-modal-btn original-export-show-folder-btn";
    showFolderButton.textContent = "Show Folder";

    const closeDialog = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDialog();
    };

    closeButton.addEventListener("click", closeDialog);
    openFolderButton.addEventListener("click", async () => {
      try {
        if (typeof openFolderTreeFromNeutralinoPath !== "function") throw new Error("No supported MD-Editor folder opener is available.");
        await openFolderTreeFromNeutralinoPath(destinationFolder);
        closeDialog();
      } catch (error) {
        console.error("Failed to open exported original nodes folder in MD-Editor:", error);
        alert("Unable to open the destination folder in MD-Editor.");
      }
    });
    showFolderButton.addEventListener("click", async () => {
      try {
        if (!Neutralino.os?.open) throw new Error("No supported folder opener is available.");
        await Neutralino.os.open(destinationFolder);
        closeDialog();
      } catch (error) {
        console.error("Failed to show exported original nodes folder:", error);
        alert("Unable to show the destination folder.");
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeDialog();
    });
    document.addEventListener("keydown", onKeyDown);

    actions.append(closeButton, openFolderButton, showFolderButton);
    box.append(title, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    openFolderButton.focus();
  });

  async function exportSidebarFolderOriginalNodes(node) {
    if (!node || node.kind !== "directory") return;
    if (!isNeutralinoRuntime() || !Neutralino.os?.showFolderDialog || !Neutralino.filesystem?.readFile || !Neutralino.filesystem?.writeFile || !Neutralino.filesystem?.createDirectory || !Neutralino.filesystem?.getStats) {
      alert("Exporting original nodes is available only in the desktop app.");
      return;
    }

    const folderFiles = isOpenFolderRootContextNode(node)
      ? await getOpenFolderMarkdownFilesForGraph()
      : await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to export.");
      return;
    }

    const destinationFolder = await Neutralino.os.showFolderDialog("Select destination folder");
    if (!destinationFolder) return;

    const createdDirectories = new Set();
    const exportedPaths = [];
    const failedItems = [];
    for (const fileEntry of folderFiles) {
      try {
        const markdown = await readFolderMarkdownFileContent(fileEntry);
        const sourcePath = getSourceFilePathFromMarkdown(markdown);
        if (!sourcePath) {
          failedItems.push(`${fileEntry.name || getFileName(fileEntry.path || "")}: missing source_file`);
          continue;
        }

        const relativeExportPath = getOriginalExportRelativePath(sourcePath, fileEntry);
        if (!relativeExportPath) {
          failedItems.push(`${fileEntry.name || getFileName(fileEntry.path || "")}: unable to derive export path`);
          continue;
        }

        const resolvedSource = await resolveOriginalSourcePath(sourcePath);
        if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) {
          failedItems.push(`${fileEntry.name || getFileName(fileEntry.path || "")}: original source root not set`);
          continue;
        }

        const sourceContent = await Neutralino.filesystem.readFile(resolvedSource.resolvedPath);
        const destinationPath = joinPath(destinationFolder, relativeExportPath);
        await ensureOriginalExportDirectories(destinationPath, createdDirectories);
        await Neutralino.filesystem.writeFile(destinationPath, sourceContent);
        exportedPaths.push(destinationPath);
      } catch (error) {
        console.error("Failed to export original folder node:", error);
        failedItems.push(`${fileEntry.name || getFileName(fileEntry.path || "")}: ${error?.message || "export failed"}`);
      }
    }

    if (!exportedPaths.length && failedItems.length) {
      alert(`Unable to export original nodes.\n${failedItems.slice(0, 10).join("\n")}`);
      return;
    }

    const message = [`Exported ${exportedPaths.length} original file${exportedPaths.length === 1 ? "" : "s"}.`];
    if (failedItems.length) message.push(`Skipped ${failedItems.length} file${failedItems.length === 1 ? "" : "s"}:\n${failedItems.slice(0, 10).join("\n")}`);
    await showOriginalExportCompleteDialog(message.join("\n\n"), destinationFolder);
  }

  async function exportSidebarFileOriginalNode(node) {
    if (!node || node.kind !== "file") return;
    if (!isNeutralinoRuntime() || !Neutralino.os?.showFolderDialog || !Neutralino.filesystem?.readFile || !Neutralino.filesystem?.writeFile || !Neutralino.filesystem?.createDirectory || !Neutralino.filesystem?.getStats) {
      alert("Exporting original nodes is available only in the desktop app.");
      return;
    }

    const markdown = await readSidebarNodeContent(node);
    const sourcePath = getSourceFilePathFromMarkdown(markdown);
    if (!sourcePath) {
      alert("This file does not have a source_file frontmatter field.");
      return;
    }

    const relativeExportPath = getOriginalExportRelativePath(sourcePath, node);
    if (!relativeExportPath) {
      alert("Unable to derive an export path for this original file.");
      return;
    }

    const destinationFolder = await Neutralino.os.showFolderDialog("Select destination folder");
    if (!destinationFolder) return;

    const resolvedSource = await resolveOriginalSourcePath(sourcePath);
    if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) return;
    const sourceContent = await Neutralino.filesystem.readFile(resolvedSource.resolvedPath);
    const destinationPath = joinPath(destinationFolder, relativeExportPath);
    await ensureOriginalExportDirectories(destinationPath, new Set());
    await Neutralino.filesystem.writeFile(destinationPath, sourceContent);
    await showOriginalExportCompleteDialog("Exported 1 original file.", destinationFolder);
  }

  async function getSidebarOriginalSourcePath(node) {
    if (!node || node.kind !== "file") return;
    const markdown = await readSidebarNodeContent(node);
    const sourcePath = getSourceFilePathFromMarkdown(markdown);
    if (!sourcePath) {
      alert("This file does not have a source_file frontmatter field.");
      return;
    }
    return sourcePath;
  }

  async function openSidebarOriginalFileInNewTab(node) {
    if (!node || node.kind !== "file") return;
    if (!isNeutralinoRuntime() || !Neutralino.filesystem?.readFile) {
      alert("Opening original files is available only in the desktop app.");
      return;
    }

    const sourcePath = await getSidebarOriginalSourcePath(node);
    if (!sourcePath) return;
    const resolvedSource = await resolveOriginalSourcePath(sourcePath);
    if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) return;
    const sourceFile = {
      name: getFileName(resolvedSource.resolvedPath),
      path: resolvedSource.resolvedPath,
      rawPath: sourcePath
    };
    return openDocumentSourceFile(sourceFile, { temporary: false, title: getFileName(resolvedSource.resolvedPath) });
  }

  async function openSidebarOriginalFileWithDefaultApp(node) {
    if (!node || node.kind !== "file") return;
    if (!isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Opening original files is available only in the desktop app.");
      return;
    }

    const sourcePath = await getSidebarOriginalSourcePath(node);
    if (!sourcePath) return;
    const resolvedSource = await resolveOriginalSourcePath(sourcePath);
    if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) return;
    await Neutralino.os.open(resolvedSource.resolvedPath);
  }

  async function revealSidebarOriginalFile(node) {
    if (!node || node.kind !== "file") return;
    if (!isNeutralinoRuntime()) {
      alert("Revealing original files is available only in the desktop app.");
      return;
    }

    const sourcePath = await getSidebarOriginalSourcePath(node);
    if (!sourcePath) return;
    const resolvedSource = await resolveOriginalSourcePath(sourcePath);
    if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) return;
    await revealFilesystemPathInExplorer(resolvedSource.resolvedPath);
  }

  async function revealFilesystemPathInExplorer(filePath) {
    if (!filePath || !isNeutralinoRuntime()) {
      throw new Error("No file path is available to reveal.");
    }
    const osName = typeof NL_OS !== "undefined" ? String(NL_OS).toLowerCase() : "";
    if (osName.includes("windows") && Neutralino.os?.execCommand) {
      const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
      await Neutralino.os.execCommand(`cmd /c start "" explorer.exe /select,"${windowsPath}"`);
      return;
    }
    if (Neutralino.os?.open) {
      const normalized = filePath.replace(/\\/g, "/");
      const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
      await Neutralino.os.open(folderPath);
      return;
    }
    throw new Error("No supported reveal command is available.");
  }

  async function revealSidebarOriginalFolder(node) {
    if (!node || node.kind !== "directory") return;
    if (!isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Revealing original folders is available only in the desktop app.");
      return;
    }

    const folderFiles = isOpenFolderRootContextNode(node)
      ? await getOpenFolderMarkdownFilesForGraph()
      : await collectMarkdownFilesForSidebarFolder(node);
    for (const fileEntry of folderFiles) {
      const markdown = await readFolderMarkdownFileContent(fileEntry);
      const sourcePath = getSourceFilePathFromMarkdown(markdown);
      if (!sourcePath) continue;
      const resolvedSource = await resolveOriginalSourcePath(sourcePath);
      if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) return;
      const originalFolderPath = getOriginalFolderPathFromSource(resolvedSource.resolvedPath, node);
      if (originalFolderPath) {
        await Neutralino.os.open(originalFolderPath);
        return;
      }
    }

    alert("This folder does not contain Markdown nodes with a source_file frontmatter field.");
  }

  async function revealSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Revealing folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    await Neutralino.os.open(folderPath);
  }

  function findFolderTreeFileButtonByPath(filePath, options = {}) {
    if (!folderTreeRoot || !filePath) return null;
    const normalizedPath = String(filePath).replace(/\\/g, "/");
    const pathCandidates = [normalizedPath];
    if (activeFolderPath && isPathInsideFolder(normalizedPath, activeFolderPath)) {
      pathCandidates.push(getPathRelativeToFolder(normalizedPath, activeFolderPath));
    }
    const candidateKeys = pathCandidates.filter(Boolean).map(getComparableFilePath);
    const fileNameKey = getComparableFilePath(getFileName(normalizedPath));
    const allowFileNameOnlyMatch = options.allowFileNameOnlyMatch === true && normalizedPath && !normalizedPath.includes("/");
    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find((button) => {
      const buttonPathKeys = [button.dataset.fullPath, button.dataset.path]
        .filter(Boolean)
        .map(getComparableFilePath);
      const buttonNameKey = getComparableFilePath(button.dataset.name || "");
      return candidateKeys.some((key) => buttonPathKeys.includes(key))
        || (allowFileNameOnlyMatch && fileNameKey && buttonNameKey === fileNameKey);
    }) || null;
  }

  function findFolderTreeDetailsByPath(path) {
    if (!folderTreeRoot || !path) return null;
    const pathKey = getComparableFilePath(path);
    return Array.from(folderTreeRoot.querySelectorAll("details")).find((details) => {
      const detailKeys = [details.dataset.fullPath, details.dataset.path]
        .filter(Boolean)
        .map(getComparableFilePath);
      return detailKeys.includes(pathKey);
    }) || null;
  }

  async function revealFolderTreeFileByPath(filePath, options = {}) {
    if (!folderTreeRoot || !filePath || !activeFolderPath) return null;
    let button = findFolderTreeFileButtonByPath(filePath, options);
    if (button) return button;

    const normalizedFilePath = String(filePath).replace(/\\/g, "/");
    const fullFilePath = isPathInsideFolder(normalizedFilePath, activeFolderPath)
      ? normalizedFilePath
      : joinPath(activeFolderPath, normalizedFilePath);
    if (!isPathInsideFolder(fullFilePath, activeFolderPath)) return null;

    const relativePath = getPathRelativeToFolder(fullFilePath, activeFolderPath);
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length <= 1) return findFolderTreeFileButtonByPath(fullFilePath, options);

    let currentFullPath = String(activeFolderPath).replace(/\\/g, "/").replace(/\/+$/, "");
    let currentRelativePath = "";
    for (const segment of segments.slice(0, -1)) {
      currentFullPath = joinPath(currentFullPath, segment);
      currentRelativePath = currentRelativePath ? `${currentRelativePath}/${segment}` : segment;
      const details = findFolderTreeDetailsByPath(currentFullPath) || findFolderTreeDetailsByPath(currentRelativePath);
      if (!details) return null;
      await renderFolderTreeLazyChildren(details);
      details.open = true;
    }

    return findFolderTreeFileButtonByPath(fullFilePath, options) || findFolderTreeFileButtonByPath(relativePath, options);
  }

  function openSidebarFolderCodeConverter(node) {
    if (typeof showCodeConverterDialog !== "function") return;
    const sourceRoot = getSidebarFolderFilesystemPath(node);
    showCodeConverterDialog({
      sourceRoot: sourceRoot || "",
      useSavedDestination: true,
      selectAllOptions: true,
      statusMessage: sourceRoot ? "" : "Code conversion requires the desktop app so folders can be selected from disk."
    });
  }

  async function deleteSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    const confirmed = typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()
      ? true
      : (typeof app?.services?.confirm === "function"
        ? await app.services.confirm({
            message: `Delete folder "${node.name}" and its contents from disk? This action cannot be undone.`,
            confirmLabel: "Delete",
            confirmVariant: "danger"
          })
        : window.confirm(`Delete folder "${node.name}" and its contents from disk? This action cannot be undone.`));
    if (!confirmed) return;
    await Neutralino.filesystem.remove(folderPath);
    closeTabsForDeletedPath(folderPath, { kind: "folder" });
    if (isOpenFolderRootContextNode(node)) {
      closeFolderTree();
    } else {
      removeDeletedPathFromFolderTree(folderPath, { kind: "folder" });
    }
  }

  let folderTreeBranchExpansion = null;
  const folderTreeViewModesByPath = new Map();

  function getFolderViewModeKey(node) {
    return getComparableFilePath(node?.fullPath || node?.path || node?.name || '');
  }

  function getSidebarFolderViewMode(node) {
    if (node?._sidebarFolderViewMode === 'flat') return 'flat';
    const key = getFolderViewModeKey(node);
    return key && folderTreeViewModesByPath.get(key) === 'flat' ? 'flat' : 'hierarchical';
  }

  function isSidebarFolderFlatView(node) {
    return getSidebarFolderViewMode(node) === 'flat';
  }

  function setSidebarFolderViewMode(node, mode) {
    const key = getFolderViewModeKey(node);
    if (!key) return;
    const details = findFolderTreeDetailsForNode(node);
    const renderedNode = details?._folderTreeNode || node;
    if (mode === 'flat') {
      folderTreeViewModesByPath.set(key, 'flat');
      node._sidebarFolderViewMode = 'flat';
      renderedNode._sidebarFolderViewMode = 'flat';
    } else {
      folderTreeViewModesByPath.delete(key);
      delete node._sidebarFolderViewMode;
      delete renderedNode._sidebarFolderViewMode;
    }
  }

  function renderFlatFolderTreeChildren(details, list, node) {
    const renderFlatFolderScope = app.modules?.flatFolderView?.renderFlatFolderScope;
    if (typeof renderFlatFolderScope !== 'function') return false;
    return renderFlatFolderScope({ details, list, node, scrollRoot: folderTreeRoot });
  }

  async function rerenderSidebarFolderViewMode(node) {
    const details = findFolderTreeDetailsForNode(node);
    if (!details) return;
    const list = details.querySelector(':scope > .folder-tree-children > .folder-tree-list');
    if (list) list.innerHTML = '';
    details.dataset.childrenRendered = 'false';
    if (details.open) await renderFolderTreeLazyChildren(details);
  }

  function isGitFolderTreePath(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    return normalizedPath.split("/").pop()?.toLowerCase() === ".git";
  }

  function isGitFolderTreeNode(node) {
    return node?.kind === "directory" && (
      String(node.name || "").toLowerCase() === ".git"
      || isGitFolderTreePath(node.path)
      || isGitFolderTreePath(node.fullPath)
    );
  }

  function shouldSkipFolderTreeBranchExpansion(details) {
    if (!details) return true;
    if (!isGitFolderTreeNode(details._folderTreeNode) && !isGitFolderTreePath(details.dataset?.path) && !isGitFolderTreePath(details.dataset?.fullPath)) return false;
    return !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder());
  }



  function findFolderTreeDetailsForNode(node) {
    return findFolderTreeElementForNode(node)?.querySelector(":scope > details") || null;
  }

  function cancelFolderTreeBranchExpansion() {
    if (folderTreeBranchExpansion) folderTreeBranchExpansion.cancelled = true;
  }

  async function expandFolderTreeBranchDetails(details, state) {
    if (!details || state.cancelled || shouldSkipFolderTreeBranchExpansion(details)) return;
    resetFolderTreeAnimation(details, getFolderTreeChildrenContainer(details));
    if (state.cancelled) return;
    await renderFolderTreeLazyChildren(details);
    if (state.cancelled) return;
    details.open = true;
    notifyFolderTreeExpandToggleButtons();
    const childDetailsList = Array.from(details.querySelectorAll(":scope > .folder-tree-children > .folder-tree-list > .folder-tree-item > details"));
    for (const childDetails of childDetailsList) {
      if (state.cancelled) return;
      await expandFolderTreeBranchDetails(childDetails, state);
    }
  }

  async function expandSidebarFolderBranch(node) {
    if (!node || node.kind !== "directory") return;
    if (folderTreeBranchExpansion && !folderTreeBranchExpansion.cancelled) {
      cancelFolderTreeBranchExpansion();
      return;
    }
    const details = findFolderTreeDetailsForNode(node);
    if (!details) return;
    const state = {
      cancelled: false
    };
    folderTreeBranchExpansion = state;
    try {
      await expandFolderTreeBranchDetails(details, state);
    } finally {
      if (folderTreeBranchExpansion === state) folderTreeBranchExpansion = null;
      notifyFolderTreeExpandToggleButtons();
    }
  }
  async function refreshOpenFolderTreeFromContextMenu(options = {}) {
    try {
      const refreshed = await reloadOpenFolderTree({ preserveExpandedFolders: options.preserveExpandedFolders === true });
      if (!refreshed && options.notify !== false) {
        alert("Unable to refresh the folder tree because no reusable folder source is available. Please reopen the folder.");
      }
      return refreshed;
    } catch (error) {
      console.error("Failed to refresh folder tree:", error);
      if (options.notify !== false) {
        alert("Unable to refresh the folder tree.");
      }
      return false;
    }
  }

  function ensureSidebarFolderContextMenu() {
    if (sidebarFolderContextMenu) return sidebarFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-folder-context-menu hidden";

    const title = document.createElement("div");
    title.className = "graph-context-menu-title";
    const separator = document.createElement("div");
    separator.className = "graph-context-menu-separator";

    const showGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showGraphView.label,
      CONTEXT_MENU_ACTIONS.showGraphView.icon,
      "Open a graph view containing only Markdown files in this folder and its sub-folders."
    );
    const exportFolderToGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportFolderToGraph.label,
      CONTEXT_MENU_ACTIONS.exportFolderToGraph.icon,
      "Create a portable graph archive that includes Markdown file contents."
    );
    const exportOriginalNodesBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.exportOriginalNodes?.label || "Export original nodes",
      CONTEXT_MENU_ACTIONS.exportOriginalNodes?.icon || "bi bi-files",
      "Copy the original source files referenced by this folder's Markdown nodes into a selected folder."
    );
    const convertCodeToMdBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.convertCodeToMd?.label || "Convert Code to MD",
      CONTEXT_MENU_ACTIONS.convertCodeToMd?.icon || "bi bi-filetype-md",
      "Open the code converter with this folder selected as the source root."
    );
    const updateProjectBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.updateProject?.label || "Update project",
      CONTEXT_MENU_ACTIONS.updateProject?.icon || "bi bi-arrow-repeat",
      "Apply pending dependency recovery updates to this generated Markdown project."
    );
    const configureJavaBuildPathBtn = createFileContextMenuButton(
      "Java Build Path...",
      "bi bi-diagram-3",
      "Configure Java sources, libraries, and the build system for this folder."
    );
    configureJavaBuildPathBtn.dataset.sidebarFolderProjectCommand = "java-build-path";
    const rebuildProjectBtn = createFileContextMenuButton(
      "Rebuild Project",
      "bi bi-hammer",
      "Delete generated class files and compile the active project."
    );
    rebuildProjectBtn.dataset.sidebarFolderProjectCommand = "rebuild-project";
    const compileFolderBtn = createFileContextMenuButton(
      "Compile Folder",
      "bi bi-folder-check",
      "Compile Java source files in this folder and its sub-folders."
    );
    compileFolderBtn.dataset.sidebarFolderProjectCommand = "compile-folder";
    const documentFolderBtn = createFileContextMenuButton(
      "Generate Documentation...",
      "bi bi-journal-code",
      "Generate documentation for this folder and its sub-folders."
    );
    documentFolderBtn.dataset.sidebarFolderProjectCommand = "generate-documentation";
    const { submenu: folderOpenApiSubmenu, submenuPanel: folderOpenApiSubmenuPanel } = createOpenApiContextSubmenu(
      "sidebar-folder-openapi-submenu",
      "Generate, update, or remove OpenAPI entries for Java sources in this folder."
    );
    const generateOpenApiFolderBtn = createFileContextMenuButton(
      "Generate OpenAPI doc",
      "bi bi-file-earmark-plus",
      "Generate OpenAPI entries from Java sources in this folder."
    );
    const updateOpenApiFolderBtn = createFileContextMenuButton(
      "Update OpenAPI doc",
      "bi bi-arrow-repeat",
      "Update an OpenAPI document from Java sources in this folder."
    );
    const removeOpenApiFolderBtn = createFileContextMenuButton(
      "Remove from OpenAPI Doc",
      "bi bi-file-earmark-minus",
      "Remove this folder's Java endpoints from an OpenAPI document."
    );
    folderOpenApiSubmenuPanel.append(generateOpenApiFolderBtn, updateOpenApiFolderBtn, removeOpenApiFolderBtn);
    const refreshFolderTreeBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.refresh.label,
      CONTEXT_MENU_ACTIONS.refresh.icon,
      "Reload the open folder tree from disk to show file system changes."
    );
    const expandFolderBranchBtn = createFileContextMenuButton(
      "Expand this folder recursively",
      "bi bi-arrows-expand",
      "Open nested folders under this folder only."
    );
    const viewSubmenu = document.createElement('div');
    viewSubmenu.className = 'graph-context-menu-submenu sidebar-folder-view-submenu';
    viewSubmenu.dataset.sidebarFolderAction = 'view-submenu';
    const viewSubmenuBtn = createFileContextMenuButton(
      'View',
      'bi bi-eye',
      'Choose how this folder expands in the sidebar.'
    );
    viewSubmenuBtn.setAttribute('aria-haspopup', 'true');
    disableContextMenuTooltip(viewSubmenuBtn);
    const viewSubmenuArrow = document.createElement('span');
    viewSubmenuArrow.className = 'graph-context-menu-submenu-arrow';
    viewSubmenuArrow.textContent = '›';
    viewSubmenuBtn.appendChild(viewSubmenuArrow);
    const viewSubmenuPanel = document.createElement('div');
    viewSubmenuPanel.className = 'graph-context-menu-submenu-panel';
    const flatViewBtn = createFileContextMenuButton(
      'Flat View',
      'bi bi-list-ul',
      'Show this folder as compressed flat folder groups.'
    );
    flatViewBtn.classList.add('sidebar-folder-view-mode-item');
    flatViewBtn.dataset.sidebarFolderViewMode = 'flat';
    const hierarchicalViewBtn = createFileContextMenuButton(
      'Hierarchical View',
      'bi bi-diagram-2',
      'Show this folder as a normal tree.'
    );
    hierarchicalViewBtn.classList.add('sidebar-folder-view-mode-item');
    hierarchicalViewBtn.dataset.sidebarFolderViewMode = 'hierarchical';
    viewSubmenuPanel.append(flatViewBtn, hierarchicalViewBtn);
    viewSubmenu.append(viewSubmenuBtn, viewSubmenuPanel);
    expandFolderBranchBtn.dataset.sidebarFolderAction = "expand-branch";
    const revealFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open this folder in the system file explorer."
    );
    const revealOriginalFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealOriginalFolder?.label || "Reveal original folder",
      CONTEXT_MENU_ACTIONS.revealOriginalFolder?.icon || "bi bi-folder-symlink",
      "Open the original source folder represented by this converted Markdown folder."
    );
    const setOriginalSourceRootBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.setOriginalSourceRoot?.label || "Set original source root",
      CONTEXT_MENU_ACTIONS.setOriginalSourceRoot?.icon || "bi bi-folder-symlink",
      "Set or replace the original source folder used by relative source_file values."
    );
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this folder path to the clipboard."
    );
    copyPathBtn.dataset.sidebarBulkAction = "copy-path";
    const findInFolderBtn = createFileContextMenuButton(
      "Find in Folder ...",
      "bi bi-search",
      "Open workspace search scoped to this folder."
    );
    const newFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFile.label,
      CONTEXT_MENU_ACTIONS.newFile.icon,
      "Create a new empty text file under this folder."
    );
    const newFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.newFolder.label,
      CONTEXT_MENU_ACTIONS.newFolder.icon,
      "Create a new folder under this folder."
    );
    const renameFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.rename.label,
      CONTEXT_MENU_ACTIONS.rename.icon,
      "Rename this folder on disk and refresh the folder tree."
    );
    const { submenu: tagsSubmenu, submenuPanel: tagsSubmenuPanel } = createTagsContextSubmenu(
      "Add or remove YAML frontmatter tags for every Markdown file in this folder and its sub-folders."
    );
    const deleteFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFolder.label,
      CONTEXT_MENU_ACTIONS.deleteFolder.icon,
      "Delete this folder and its contents from disk after confirmation."
    );
    const revealFolderSeparator = document.createElement("div");
    revealFolderSeparator.className = "graph-context-menu-separator";
    const folderSearchSeparator = document.createElement("div");
    folderSearchSeparator.className = "graph-context-menu-separator";
    const projectActionsSeparator = document.createElement("div");
    projectActionsSeparator.className = "graph-context-menu-separator";
    const exportActionsSeparator = document.createElement("div");
    exportActionsSeparator.className = "graph-context-menu-separator";
    const deleteFolderSeparator = document.createElement("div");
    deleteFolderSeparator.className = "graph-context-menu-separator";
    renameFolderBtn.dataset.sidebarFolderAction = "rename";
    deleteFolderBtn.dataset.sidebarFolderAction = "delete";
    deleteFolderSeparator.dataset.sidebarFolderAction = "delete";
    deleteFolderBtn.dataset.sidebarBulkAction = "delete";
    deleteFolderBtn.classList.add("graph-context-menu-item-danger");

    [
      title,
      separator,
      newFileBtn,
      newFolderBtn,
      revealFolderBtn,
      revealOriginalFolderBtn,
      revealFolderSeparator,
      renameFolderBtn,
      tagsSubmenu,
      findInFolderBtn,
      folderSearchSeparator,
      showGraphBtn,
      convertCodeToMdBtn,
      updateProjectBtn,
      configureJavaBuildPathBtn,
      rebuildProjectBtn,
      compileFolderBtn,
      documentFolderBtn,
      folderOpenApiSubmenu,
      setOriginalSourceRootBtn,
      projectActionsSeparator,
      copyPathBtn,
      exportFolderToGraphBtn,
      exportOriginalNodesBtn,
      exportActionsSeparator,
      expandFolderBranchBtn,
      viewSubmenu,
      refreshFolderTreeBtn,
      deleteFolderSeparator,
      deleteFolderBtn
    ].forEach((item) => menu.appendChild(item));
    document.body.appendChild(menu);

    expandFolderBranchBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await expandSidebarFolderBranch(target);
      } catch (error) {
        console.error("Failed to expand sidebar folder branch:", error);
        alert("Unable to expand this folder.");
      }
    });
    menu.querySelectorAll('[data-sidebar-folder-view-mode]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = sidebarContextTarget || menu._sidebarContextTarget;
        const mode = button.dataset.sidebarFolderViewMode === 'flat' ? 'flat' : 'hierarchical';
        hideSidebarFolderContextMenu();
        setSidebarFolderViewMode(target, mode);
        await rerenderSidebarFolderViewMode(target);
      });
    });
    refreshFolderTreeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideSidebarFolderContextMenu();
      await refreshOpenFolderTreeFromContextMenu();
    });

    updateProjectBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        const seedPath = getSidebarFolderFilesystemPath(target) || activeFolderPath || "";
        await handleUpdateProject?.(seedPath);
      } catch (error) {
        console.error("Failed to update sidebar folder project:", error);
        alert("Unable to update this project.");
      }
    });

    configureJavaBuildPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      await app.modules?.projectCommands?.execute?.("java-build-path", {
        targetPath: getSidebarFolderFilesystemPath(target) || activeFolderPath || "",
        targetKind: "directory"
      });
    });

    rebuildProjectBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      await app.modules?.projectCommands?.execute?.("rebuild-project", {
        targetPath: getSidebarFolderFilesystemPath(target) || activeFolderPath || "",
        targetKind: "directory"
      });
    });


    compileFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      await app.modules?.projectCommands?.execute?.("compile-folder", {
        targetPath: getSidebarFolderFilesystemPath(target) || activeFolderPath || "",
        targetKind: "directory"
      });
    });
    documentFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      await app.modules?.projectCommands?.execute?.("generate-documentation", {
        targetPath: getSidebarFolderFilesystemPath(target) || activeFolderPath || "",
        targetKind: "directory",
        scope: isOpenFolderRootContextNode(target) ? "project" : "folder"
      });
    });

    async function runSidebarOpenApiFolderAction(actionName) {
      const target = sidebarContextTarget;
      const targetPath = getSidebarFolderFilesystemPath(target) || activeFolderPath || "";
      hideSidebarFolderContextMenu();
      if (!targetPath) return;
      try {
        await app.modules?.openApiEditor?.runOpenApiSourceAction?.(actionName, {
          type: "folder",
          path: targetPath,
          label: target?.name || getFileName(targetPath) || "Java source folder"
        });
        await refreshOpenFolderTreeFromContextMenu({ notify: false, preserveExpandedFolders: true });
      } catch (error) {
        console.error("Failed to run sidebar folder OpenAPI action:", error);
        alert(error?.message || "Unable to update the OpenAPI document.");
      }
    }

    [
      [generateOpenApiFolderBtn, "generate"],
      [updateOpenApiFolderBtn, "update"],
      [removeOpenApiFolderBtn, "remove"]
    ].forEach(([button, actionName]) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runSidebarOpenApiFolderAction(actionName);
      });
    });

    showGraphBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await openSidebarFolderGraphView(target);
      } catch (error) {
        console.error("Failed to open sidebar folder graph view:", error);
        alert("Unable to open a graph view for this folder.");
      }
    });

    exportFolderToGraphBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await exportSidebarFolderToGraph(target);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Failed to export sidebar folder to graph:", error);
        alert("Unable to export this folder to a graph archive.");
      }
    });

    exportOriginalNodesBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await exportSidebarFolderOriginalNodes(target);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Failed to export original sidebar folder nodes:", error);
        alert("Unable to export original nodes for this folder.");
      }
    });

    convertCodeToMdBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      openSidebarFolderCodeConverter(target);
    });

    newFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFileOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar file:", error);
        alert("Unable to create a new file here.");
      }
    });

    newFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await createSidebarFolderOnDisk(target);
      } catch (error) {
        console.error("Failed to create sidebar folder:", error);
        alert("Unable to create a new folder here.");
      }
    });

    revealFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await revealSidebarFolder(target);
      } catch (error) {
        console.error("Failed to reveal sidebar folder:", error);
        alert("Unable to reveal this folder in the file explorer.");
      }
    });

    revealOriginalFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await revealSidebarOriginalFolder(target);
      } catch (error) {
        console.error("Failed to reveal original sidebar folder:", error);
        alert("Unable to reveal this folder's original source folder.");
      }
    });

    setOriginalSourceRootBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideSidebarFolderContextMenu();
      try {
        await promptForSourceRoot?.({ reason: "sidebar-folder-menu" });
      } catch (error) {
        console.error("Failed to set original source root:", error);
        alert("Unable to set the original source root.");
      }
    });

    renameFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await renameSidebarNodeOnDisk(target, "folder");
      } catch (error) {
        console.error("Failed to rename sidebar folder:", error);
        alert("Unable to rename this folder.");
      }
    });

    copyPathBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (await copySidebarSelectedPaths()) {
        hideSidebarFolderContextMenu();
        return;
      }
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      if (!target) return;
      try {
        await copySidebarContextText(getSidebarFolderClipboardPath(target));
      } catch (error) {
        console.error("Failed to copy sidebar folder path:", error);
        alert("Unable to copy this folder path.");
      }
    });

    findInFolderBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const include = getSidebarFolderWorkspaceSearchInclude(target);
      hideSidebarFolderContextMenu();
      const workspaceSearchModule = app.modules?.workspaceSearch;
      if (!workspaceSearchModule?.openWorkspaceSearchModal) {
        alert("Workspace search is not available.");
        return;
      }
      workspaceSearchModule.openWorkspaceSearchModal({ include });
    });

    tagsSubmenuPanel.dataset.sidebarFolderTagsPanel = "true";

    deleteFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      await deleteSidebarSelection(target);
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarFolderContextMenu = menu;
    return sidebarFolderContextMenu;
  }

  function showSidebarFileContextMenu(event, node) {
    if (!node || node.kind !== "file") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFolderContextMenu();
    sidebarContextTarget = node;
    const selectedContextItems = prepareSidebarContextSelection(node);
    const isBulkContext = selectedContextItems.length > 1;
    const menu = ensureSidebarFileContextMenu();
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = isBulkContext ? `${selectedContextItems.length} selected items` : (node.name || "File");
    const tagsSubmenu = menu.querySelector(".tags-context-submenu");
    const tagsSubmenuPanel = menu.querySelector(".tags-context-submenu-panel");
    const graphActionBtns = menu.querySelectorAll(".sidebar-file-graph-action");
    const showGraphSubmenu = menu.querySelector(".sidebar-file-graph-submenu");
    const originalSourceSubmenu = menu.querySelector(".sidebar-original-source-submenu");
    const sourceSubmenu = menu.querySelector(".sidebar-file-source-submenu");
    const openApiSubmenu = menu.querySelector(".sidebar-file-openapi-submenu");
    const openApiSourceActionBtns = menu.querySelectorAll(".sidebar-openapi-source-action");
    const generateOpenApiCodeBtn = menu.querySelector(".sidebar-openapi-codegen-action");
    const runSubmenu = menu.querySelector(".sidebar-file-run-submenu");
    const runJavaMainBtn = menu.querySelector(".sidebar-run-java-main");
    const configureJavaRunBtn = menu.querySelector(".sidebar-configure-java-run");
    const exportOriginalNodeBtn = menu.querySelector(".sidebar-export-original-node");
    const compareFilesBtn = menu.querySelector(".sidebar-compare-selected-files");
    const nodePath = node.name || node.path || node.fullPath || "";
    const canManageTags = isMarkdownPath(nodePath);
    const canCompareSelection = selectedContextItems.length === 2
      && selectedContextItems.every((item) => item.kind === "file");
    const canRunJavaSourceActions = !isBulkContext && /\.java$/i.test(nodePath);
    const canCheckOpenApiCodegenAction = !isBulkContext && /\.ya?ml$/i.test(nodePath);
    const hasStrongOpenApiYamlName = canCheckOpenApiCodegenAction && /(^|[\/])(?:openapi|swagger|api-docs)(?:[-_.].*)?\.ya?ml$/i.test(nodePath);
    let canRunOpenApiCodegenAction = hasStrongOpenApiYamlName;
    const targetPath = getSidebarNodeFilesystemPath(node) || node.fullPath || node.path || "";
    const projectState = app.modules?.projectCommands?.updateAvailability?.({
      filePath: targetPath,
      targetPath,
      targetKind: "file"
    });
    menu.querySelectorAll(".sidebar-project-command").forEach((button) => {
      const enabled = button.dataset.projectCommand === "compile-file"
        ? projectState?.provider?.canCompileFile?.(projectState.context) === true
        : projectState?.provider?.canGenerateDocumentation?.(Object.assign({}, projectState.context, { scope: "file" })) === true;
      button.classList.toggle("hidden", !enabled);
    });
    updateSidebarBulkContextMenuState(menu, isBulkContext);
    if (runSubmenu && runJavaMainBtn && configureJavaRunBtn) {
      runSubmenu.classList.toggle("hidden", !canRunJavaSourceActions);
      runJavaMainBtn.dataset.mainClass = "";
      runJavaMainBtn.dataset.tooltip = "Run the saved Java source file as a Java application.";
      configureJavaRunBtn.dataset.tooltip = "Prepare a new Run configuration from the saved Java source file.";
      [runJavaMainBtn, configureJavaRunBtn].forEach((button) => setContextMenuControlDisabled(button, false));
      const contextTarget = targetPath;
      const mainClassFinder = app.modules?.javaMainClassFinder;
      if (canRunJavaSourceActions && typeof mainClassFinder?.inspectSource === "function") {
        inspectSidebarJavaMainClass(node, targetPath)
          .then((mainClass) => {
            const currentPath = getSidebarNodeFilesystemPath(sidebarContextTarget) || sidebarContextTarget?.fullPath || sidebarContextTarget?.path || "";
            if (normalizeLocalPath(currentPath).toLowerCase() !== normalizeLocalPath(contextTarget).toLowerCase()) return;
            if (!mainClass) {
              [runJavaMainBtn, configureJavaRunBtn].forEach((button) => {
                button.dataset.tooltip = "This saved Java file does not declare a public static void main method.";
                setContextMenuControlDisabled(button, true);
              });
              return;
            }
            runJavaMainBtn.dataset.mainClass = mainClass.className;
            runJavaMainBtn.dataset.tooltip = `Run ${mainClass.className} as a Java application.`;
            configureJavaRunBtn.dataset.tooltip = `Prepare a new Run configuration for ${mainClass.className}.`;
          })
          .catch(() => {
            // Keep the action available; the launcher performs the authoritative disk check.
            runJavaMainBtn.dataset.tooltip = "The saved file will be validated before the Java application starts.";
            configureJavaRunBtn.dataset.tooltip = "The saved file will be validated before the Run configuration opens.";
          });
      }
    }
    graphActionBtns.forEach((button) => button.classList.toggle("hidden", !canManageTags));
    if (showGraphSubmenu) showGraphSubmenu.classList.toggle("hidden", !Array.from(graphActionBtns).some((button) => !button.classList.contains("hidden")));
    if (originalSourceSubmenu) originalSourceSubmenu.classList.toggle("hidden", !canManageTags);
    if (sourceSubmenu) sourceSubmenu.classList.toggle("hidden", !canRunJavaSourceActions);
    openApiSourceActionBtns.forEach((button) => button.classList.toggle("hidden", !canRunJavaSourceActions));
    if (generateOpenApiCodeBtn) {
      generateOpenApiCodeBtn.classList.toggle("hidden", !canRunOpenApiCodegenAction);
      setContextMenuControlDisabled(generateOpenApiCodeBtn, !canRunOpenApiCodegenAction);
    }
    if (openApiSubmenu) openApiSubmenu.classList.toggle("hidden", !(canRunJavaSourceActions || canRunOpenApiCodegenAction));
    if (canCheckOpenApiCodegenAction && generateOpenApiCodeBtn) {
      const contextTargetPath = targetPath;
      readSidebarNodeContent(node)
        .then((content) => {
          const currentPath = getSidebarNodeFilesystemPath(sidebarContextTarget) || sidebarContextTarget?.fullPath || sidebarContextTarget?.path || "";
          if (normalizeLocalPath(currentPath).toLowerCase() !== normalizeLocalPath(contextTargetPath).toLowerCase()) return;
          canRunOpenApiCodegenAction = hasStrongOpenApiYamlName || app.modules?.openApiEditor?.isOpenApiFileContent?.(content, contextTargetPath) === true;
          generateOpenApiCodeBtn.classList.toggle("hidden", !canRunOpenApiCodegenAction);
          setContextMenuControlDisabled(generateOpenApiCodeBtn, !canRunOpenApiCodegenAction);
          if (openApiSubmenu) openApiSubmenu.classList.toggle("hidden", !(canRunJavaSourceActions || canRunOpenApiCodegenAction));
        })
        .catch(() => {
          generateOpenApiCodeBtn.classList.toggle("hidden", !hasStrongOpenApiYamlName);
          setContextMenuControlDisabled(generateOpenApiCodeBtn, !hasStrongOpenApiYamlName);
          if (openApiSubmenu) openApiSubmenu.classList.toggle("hidden", !(canRunJavaSourceActions || hasStrongOpenApiYamlName));
        });
    }
    if (exportOriginalNodeBtn) exportOriginalNodeBtn.classList.toggle("hidden", !canManageTags);
    if (compareFilesBtn) compareFilesBtn.classList.toggle("hidden", !canCompareSelection);
    if (tagsSubmenu) tagsSubmenu.classList.toggle("hidden", !canManageTags);
    if (isBulkContext && tagsSubmenuPanel) tagsSubmenuPanel.innerHTML = "";
    if (canManageTags && !isBulkContext) {
      const renderSidebarTags = (currentTags) => {
        const applySidebarTag = async (tag, shouldAdd) => {
          const latestContent = await readSidebarNodeContent(node);
          const latestTags = getFileTagsFromContent(latestContent);
          const nextTags = shouldAdd
            ? [...latestTags, tag]
            : latestTags.filter((existingTag) => existingTag !== tag);
          hideSidebarFileContextMenu();
          try {
            await setSidebarNodeTags(node, nextTags);
          } catch (error) {
            console.error("Failed to update sidebar file tags:", error);
            alert("Unable to update this file's tags.");
          }
        };
        renderTagsContextSubmenu(tagsSubmenuPanel, currentTags, applySidebarTag, {
          onCreateTag: (tag) => applySidebarTag(tag, true)
        });
      };
      renderSidebarTags(getFolderTreeNodeTags(node));
      readSidebarNodeContent(node)
        .then((content) => renderSidebarTags(getFileTagsFromContent(content)))
        .catch((error) => console.warn("Failed to refresh sidebar context tag checks:", error));
    }
    const copyPathAction = menu.querySelector('[data-sidebar-bulk-action="copy-path"]');
    const deleteAction = menu.querySelector('[data-sidebar-bulk-action="delete"]');
    setContextMenuButtonLabel(copyPathAction, isBulkContext ? "Copy selected paths" : (copyPathAction?.dataset.defaultLabel || "Copy path"));
    setContextMenuButtonLabel(deleteAction, isBulkContext ? "Delete selected items" : (deleteAction?.dataset.defaultLabel || "Delete file"));
    menu.classList.remove("hidden");
    positionSidebarFileContextMenu(event);
  }

  function showSidebarFolderContextMenu(event, node) {
    if (!node || node.kind !== "directory") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    sidebarContextTarget = node;
    const selectedContextItems = prepareSidebarContextSelection(node);
    const isBulkContext = selectedContextItems.length > 1;
    const menu = ensureSidebarFolderContextMenu();
    const isRootContext = isOpenFolderRootContextNode(node);
    const folderProjectState = app.modules?.projectCommands?.updateAvailability?.({
      targetPath: getSidebarFolderFilesystemPath(node) || activeFolderPath || "",
      targetKind: "directory"
    });
    menu.querySelectorAll("[data-sidebar-folder-project-command]").forEach((button) => {
      const commandName = button.dataset.sidebarFolderProjectCommand;
      const enabled = commandName === "rebuild-project"
        ? isRootContext && folderProjectState?.provider?.canRebuildProject?.(folderProjectState.context) === true
        : commandName === "java-build-path"
          ? folderProjectState?.provider?.canConfigureBuildPath?.(folderProjectState.context) === true
        : commandName === "compile-folder"
          ? folderProjectState?.provider?.canCompileTarget?.(folderProjectState.context) === true
          : folderProjectState?.provider?.canGenerateDocumentation?.(Object.assign({}, folderProjectState.context, {
              scope: isRootContext ? "project" : "folder"
            })) === true;
      button.classList.toggle("hidden", !enabled);
    });
    const title = menu.querySelector(".graph-context-menu-title");
    const tagsSubmenuPanel = menu.querySelector('[data-sidebar-folder-tags-panel="true"]');
    const expandBranchBtn = menu.querySelector('[data-sidebar-folder-action="expand-branch"]');
    const viewSubmenu = menu.querySelector('[data-sidebar-folder-action="view-submenu"]');
    const folderOpenApiSubmenu = menu.querySelector(".sidebar-folder-openapi-submenu");
    if (title) title.textContent = isBulkContext ? `${selectedContextItems.length} selected items` : (isRootContext ? (activeFolderName || "Folder") : (node.name || "Folder"));
    menu.querySelector('[data-sidebar-folder-action="rename"]')?.classList.remove("hidden");
    menu.querySelectorAll('[data-sidebar-folder-action="delete"]').forEach((item) => {
      item.classList.toggle("hidden", isRootContext);
    });
    if (viewSubmenu) {
      viewSubmenu.classList.remove('hidden');
      const currentMode = getSidebarFolderViewMode(node);
      viewSubmenu.querySelectorAll('[data-sidebar-folder-view-mode]').forEach((button) => {
        const isActive = button.dataset.sidebarFolderViewMode === currentMode;
        button.setAttribute('aria-checked', String(isActive));
        const icon = button.querySelector('i');
        if (icon) icon.className = isActive ? 'bi bi-check-lg' : 'bi';
      });
    }
    if (expandBranchBtn) {
      const isExpanding = !!(folderTreeBranchExpansion && !folderTreeBranchExpansion.cancelled);
      const label = expandBranchBtn.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = isExpanding ? "Cancel folder expansion" : "Expand this folder recursively";
      expandBranchBtn.dataset.tooltip = isExpanding ? "Stop the current folder expansion." : "Open nested folders under this folder only.";
      expandBranchBtn.classList.remove("hidden");
    }
    const folderOpenApiTargetPath = getSidebarFolderFilesystemPath(node) || activeFolderPath || "";
    if (folderOpenApiSubmenu) folderOpenApiSubmenu.classList.toggle("hidden", isBulkContext || !folderOpenApiTargetPath);

    const renderFolderTags = (currentTags) => renderTagsContextSubmenu(tagsSubmenuPanel, currentTags, async (tag, shouldAdd) => {
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await setSidebarFolderTag(target, tag, shouldAdd);
      } catch (error) {
        console.error("Failed to update sidebar folder tags:", error);
        alert("Unable to update this folder's tags.");
      }
    }, {
      onCreateTag: async (tag) => {
        const target = sidebarContextTarget;
        hideSidebarFolderContextMenu();
        try {
          await setSidebarFolderTag(target, tag, true);
        } catch (error) {
          console.error("Failed to update sidebar folder tags:", error);
          alert("Unable to update this folder's tags.");
        }
      }
    });
    if (isBulkContext) {
      if (tagsSubmenuPanel) tagsSubmenuPanel.innerHTML = "";
    } else {
      renderFolderTags([]);
      getSidebarFolderTagsAppliedToAll(node)
        .then((currentTags) => renderFolderTags(currentTags))
        .catch((error) => console.warn("Failed to refresh sidebar folder context tag checks:", error));
    }
    const copyPathAction = menu.querySelector('[data-sidebar-bulk-action="copy-path"]');
    const deleteAction = menu.querySelector('[data-sidebar-bulk-action="delete"]');
    setContextMenuButtonLabel(copyPathAction, isBulkContext ? "Copy selected paths" : (copyPathAction?.dataset.defaultLabel || "Copy path"));
    setContextMenuButtonLabel(deleteAction, isBulkContext ? "Delete selected items" : (deleteAction?.dataset.defaultLabel || "Delete folder"));
    updateSidebarBulkContextMenuState(menu, isBulkContext);
    menu.classList.remove("hidden");
    positionSidebarFolderContextMenu(event);
  }

  function ensureSidebarClosedFolderContextMenu() {
    if (sidebarClosedFolderContextMenu) return sidebarClosedFolderContextMenu;

    const menu = document.createElement("div");
    menu.className = "graph-context-menu sidebar-closed-folder-context-menu hidden";

    const openFolderBtn = createFileContextMenuButton(
      getOpenFolderActionLabel(),
      CONTEXT_MENU_ACTIONS.openFolder.icon,
      getOpenFolderActionTitle()
    );
    openFolderBtn.dataset.sidebarClosedFolderAction = "open-folder";

    menu.appendChild(openFolderBtn);
    document.body.appendChild(menu);

    openFolderBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideSidebarClosedFolderContextMenu();
      await openFolderTree(event);
    });

    document.addEventListener("click", hideSidebarContextMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSidebarContextMenus();
    });
    window.addEventListener("blur", hideSidebarContextMenus);

    sidebarClosedFolderContextMenu = menu;
    return sidebarClosedFolderContextMenu;
  }

  function showSidebarClosedFolderContextMenu(event) {
    if (isFolderOpen) return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    const menu = ensureSidebarClosedFolderContextMenu();
    const openFolderBtn = menu.querySelector('[data-sidebar-closed-folder-action="open-folder"]');
    if (openFolderBtn) {
      const label = openFolderBtn.querySelector(".graph-context-menu-item-label");
      if (label) label.textContent = getOpenFolderActionLabel();
      openFolderBtn.dataset.tooltip = getOpenFolderActionTitle();
    }
    menu.classList.remove("hidden");
    positionSidebarClosedFolderContextMenu(event);
  }

  function handleFolderTreeRootContextMenu(event) {
    if (!folderTreeRoot) return;
    if (!isFolderOpen) {
      hideSidebarClosedFolderContextMenu();
      return;
    }
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (targetElement?.closest(".folder-tree-label, .folder-tree-file")) return;
    showSidebarFolderContextMenu(event, getOpenFolderRootContextNode());
  }

  async function handleFolderTreeRootClick(event) {
    const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    const cloneRepositoryButton = targetElement?.closest(".folder-tree-clone-repository-link");
    if (cloneRepositoryButton && !isFolderOpen) {
      event.preventDefault();
      await cloneGitRepositoryFromEmptyFolderView?.();
      return;
    }
    const openFolderButton = targetElement?.closest(".folder-tree-open-folder-button");
    if (!openFolderButton || isFolderOpen) {
      if (!targetElement?.closest(".folder-tree-label, .folder-tree-file, .graph-context-menu")) clearSidebarTreeSelection();
      return;
    }
    event.preventDefault();
    await openFolderTree(event);
  }
  const folderTreeAnimationTimers = new WeakMap();

  function getFolderTreeChildrenContainer(details) {
    return details.querySelector(":scope > .folder-tree-children");
  }

  function resetFolderTreeAnimation(details, childrenContainer) {
    const existingTimer = folderTreeAnimationTimers.get(details);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      folderTreeAnimationTimers.delete(details);
    }

    details.classList.remove("is-expanding", "is-collapsing");
    if (childrenContainer) {
      childrenContainer.style.height = "";
      childrenContainer.style.opacity = "";
    }
  }

  function finishFolderTreeAnimation(details, childrenContainer, shouldOpen) {
    details.open = shouldOpen;
    resetFolderTreeAnimation(details, childrenContainer);
    if (!shouldOpen && folderTreeDragTargetElement && getFolderTreeDropTargetDetails(folderTreeDragTargetElement) === details) {
      scheduleFolderTreeHoverExpand(folderTreeDragTargetElement);
    }
  }

  function prefersReducedFolderTreeMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function notifyFolderTreeExpandToggleButtons() {
    if (typeof updateFolderTreeExpandToggleButtons === "function") {
      updateFolderTreeExpandToggleButtons();
    }
  }

  async function renderFolderTreeLazyChildren(details) {
    if (!details || details.dataset.childrenRendered === "true" || details.dataset.loadingChildren === "true") return;
    const list = details.querySelector(":scope > .folder-tree-children > .folder-tree-list");
    if (!list) return;
    let children = Array.isArray(details._folderTreeChildren) ? details._folderTreeChildren : [];
    const node = details._folderTreeNode || null;
    if (node?.childrenLazy === true && node.fullPath && typeof readFolderTreeDirectChildrenFromDisk === "function") {
      details.dataset.loadingChildren = "true";
      list.innerHTML = '<li class="folder-tree-item folder-tree-loading-child">Loading...</li>';
      try {
        children = await readFolderTreeDirectChildrenFromDisk(node.fullPath, children) || [];
        node.children = children;
        node.childrenLazy = false;
        details._folderTreeChildren = children;
        delete details.dataset.derivedDirty;
        details.classList.remove("folder-tree-derived-dirty");
        if (details.firstElementChild) details.firstElementChild.removeAttribute("title");
        list.innerHTML = "";
      } catch (error) {
        console.warn("Failed to load folder children:", node.fullPath, error);
        list.innerHTML = '<li class="folder-tree-item folder-tree-loading-child">Unable to load this folder.</li>';
        return;
      } finally {
        delete details.dataset.loadingChildren;
      }
    }
    if (isSidebarFolderFlatView(node)) {
      if (renderFlatFolderTreeChildren(details, list, node)) {
        details.dataset.childrenRendered = 'true';
        return;
      }
    }
    const parentPath = details.dataset.path || "";
    const fragment = document.createDocumentFragment();
    getRenderableFolderTreeChildren(children).forEach((child) => {
      fragment.appendChild(renderFolderTreeNode(child, parentPath));
    });
    list.appendChild(fragment);
    details.dataset.childrenRendered = "true";
  }

  async function toggleFolderTreeDetails(details) {
    const childrenContainer = getFolderTreeChildrenContainer(details);
    if (!childrenContainer || prefersReducedFolderTreeMotion()) {
      resetFolderTreeAnimation(details, childrenContainer);
      if (!details.open) await renderFolderTreeLazyChildren(details);
      details.open = !details.open;
      notifyFolderTreeExpandToggleButtons();
      return;
    }

    const shouldExpand = !details.open || details.classList.contains("is-collapsing");
    resetFolderTreeAnimation(details, childrenContainer);

    if (shouldExpand) {
      await renderFolderTreeLazyChildren(details);
      details.open = true;
      details.classList.add("is-expanding");
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";

      window.requestAnimationFrame(() => {
        childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
        childrenContainer.style.opacity = "1";
      });

      const timer = window.setTimeout(() => {
        finishFolderTreeAnimation(details, childrenContainer, true);
        notifyFolderTreeExpandToggleButtons();
      }, 220);
      folderTreeAnimationTimers.set(details, timer);
      return;
    }

    details.classList.add("is-collapsing");
    childrenContainer.style.height = `${childrenContainer.scrollHeight}px`;
    childrenContainer.style.opacity = "1";

    window.requestAnimationFrame(() => {
      childrenContainer.style.height = "0px";
      childrenContainer.style.opacity = "0";
    });

    const timer = window.setTimeout(() => {
      finishFolderTreeAnimation(details, childrenContainer, false);
      notifyFolderTreeExpandToggleButtons();
    }, 220);
    folderTreeAnimationTimers.set(details, timer);
  }

  function getFileIconClass(fileName, options = {}) {
    if (options.isUnsupportedFile) return "bi-file-earmark-x";
    if (options.isGraphFile || isGraphFilePath(fileName)) return "bi-diagram-3";
    const language = languageRegistry?.resolveLanguageForPath(fileName);
    if (language?.icon) return language.icon;
    const extension = getFileExtension(fileName);
    const iconByExtension = {
      json: "bi-filetype-json",
      js: "bi-filetype-js",
      mjs: "bi-filetype-js",
      cjs: "bi-filetype-js",
      ts: "bi-filetype-tsx",
      tsx: "bi-filetype-tsx",
      jsx: "bi-filetype-jsx",
      css: "bi-filetype-css",
      html: "bi-filetype-html",
      htm: "bi-filetype-html",
      java: "bi-filetype-java",
      py: "bi-filetype-py",
      php: "bi-filetype-php",
      rb: "bi-filetype-rb",
      sql: "bi-filetype-sql",
      xml: "bi-filetype-xml",
      yaml: "bi-filetype-yml",
      yml: "bi-filetype-yml",
      csv: "bi-filetype-csv",
      txt: "bi-filetype-txt",
      text: "bi-filetype-txt"
    };
    if (iconByExtension[extension]) return iconByExtension[extension];
    return isMarkdownPath(fileName) ? "bi-file-earmark-text" : "bi-file-text";
  }

  function getFileLanguageClass(fileName) {
    const language = languageRegistry?.resolveLanguageForPath(fileName);
    return language?.colorClass || "";
  }

  function getFolderTreeFileTooltip(node) {
    if (!node) return "";
    return node.fullPath || node.path || node.file?.webkitRelativePath || node.file?.name || node.name || "";
  }

  function getMavenModulePathKey(path) {
    return String(path || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function applyFolderPathDecoration(summary, node, decoratedPaths, decorationClass, badgeClass) {
    if (!summary || !node || node.kind !== "directory") return;
    const isDecoratedPath = !node.isParentNavigation
      && decoratedPaths.has(getMavenModulePathKey(node.fullPath));
    summary.classList.toggle(decorationClass, isDecoratedPath);
    const icon = summary.firstElementChild;
    const existingBadge = icon?.querySelector?.(`.${badgeClass}`);
    if (!isDecoratedPath) {
      existingBadge?.remove();
      return;
    }
    if (!icon || existingBadge) return;
    const badge = document.createElement("span");
    badge.className = `bi bi-box ${badgeClass}`;
    badge.setAttribute("aria-hidden", "true");
    icon.appendChild(badge);
  }

  function applyFolderPathDecorations(summary, node) {
    const visibleMavenModulePaths = javaProjectMarkerMode === "maven" ? mavenModulePaths : emptyFolderPathSet;
    const visibleGradleModulePaths = javaProjectMarkerMode === "gradle" ? gradleModulePaths : emptyFolderPathSet;
    const visibleJavaSourceRootPaths = javaProjectMarkerMode === "java" ? javaSourceRootPaths : emptyFolderPathSet;
    applyFolderPathDecoration(
      summary,
      node,
      visibleMavenModulePaths,
      "folder-tree-maven-module",
      "folder-tree-maven-module-badge"
    );
    applyFolderPathDecoration(
      summary,
      node,
      visibleGradleModulePaths,
      "folder-tree-gradle-module",
      "folder-tree-gradle-module-badge"
    );
    applyFolderPathDecoration(
      summary,
      node,
      visibleJavaSourceRootPaths,
      "folder-tree-java-source-root",
      "folder-tree-java-source-root-badge"
    );
  }

  function refreshFolderPathDecorations() {
    folderTreeRoot?.querySelectorAll("details").forEach((details) => {
      applyFolderPathDecorations(details.firstElementChild, details._folderTreeNode);
    });
  }

  /** Select the one Java project marker family that may appear in the folder tree. */
  function setJavaProjectMarkerMode(mode) {
    javaProjectMarkerMode = javaProjectMarkerModes.has(mode) ? mode : "none";
    refreshFolderPathDecorations();
  }

  /** Replace the Maven module paths used to decorate directory nodes in the folder tree. */
  function setMavenModulePaths(paths) {
    mavenModulePaths = new Set((paths || []).map(getMavenModulePathKey).filter(Boolean));
    refreshFolderPathDecorations();
  }

  /** Replace the Gradle module paths used to decorate directory nodes in the folder tree. */
  function setGradleModulePaths(paths) {
    gradleModulePaths = new Set((paths || []).map(getMavenModulePathKey).filter(Boolean));
    refreshFolderPathDecorations();
  }

  /** Replace the standard Java source-root paths used to decorate directory nodes in the folder tree. */
  function setJavaSourceRootPaths(paths) {
    javaSourceRootPaths = new Set((paths || []).map(getMavenModulePathKey).filter(Boolean));
    refreshFolderPathDecorations();
  }

  function renderFolderTreeNode(node, parentPath = "") {
    syncSidebarSelectionFolderScope();
    const li = document.createElement("li");
    li.className = "folder-tree-item";
    if (node.kind === "directory") {
      const currentPath = isOpenFolderRootContextNode(node)
        ? ""
        : (node.path || (parentPath ? `${parentPath}/${node.name}` : node.name));
      node.path = currentPath;
      const details = document.createElement("details");
      const shouldRenderChildren = node.renderChildrenImmediately === true || isOpenFolderRootContextNode(node)
        ? true
        : node.childrenLazy === true
          ? false
          : (typeof isFolderTreeDefaultExpanded === "function" ? isFolderTreeDefaultExpanded() : true);
      details.open = shouldRenderChildren;
      details.dataset.path = currentPath;
      details.dataset.fullPath = node.fullPath || "";
      details.dataset.childrenRendered = shouldRenderChildren ? "true" : "false";
      if (node.childrenLazy === true) details.dataset.childrenLazy = "true";
      details._folderTreeNode = node;
      details._folderTreeChildren = node.children || [];
      const summary = document.createElement("summary");
      summary.className = "folder-tree-label";
      const icon = document.createElement("i");
      icon.className = node.isParentNavigation ? "bi bi-arrow-90deg-up" : "bi bi-folder";
      const label = document.createElement("span");
      label.textContent = node.name;
      summary.appendChild(icon);
      summary.appendChild(label);
      applyFolderPathDecorations(summary, node);
      applySidebarSelectionStateToElement(summary, node);
      configureFolderTreeDragSource(summary, node);
      configureFolderTreeDropTarget(summary, node);
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        if (node.isParentNavigation && node.fullPath && typeof openFolderTreeFromNeutralinoPath === "function") {
          void openFolderTreeFromNeutralinoPath(node.fullPath, { includeParentNavigation: true });
          return;
        }
        if (handleSidebarSelectionClick(event, node)) return;
        toggleFolderTreeDetails(details);
      });
      summary.addEventListener("contextmenu", (event) => {
        if (node.isParentNavigation) {
          event.preventDefault();
          return;
        }
        showSidebarFolderContextMenu(event, node);
      });
      details.appendChild(summary);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-tree-children";
      const ul = document.createElement("ul");
      ul.className = "folder-tree-list";
      if (shouldRenderChildren) {
        getRenderableFolderTreeChildren(node.children || []).forEach((child) => ul.appendChild(renderFolderTreeNode(child, currentPath)));
      }
      childrenContainer.appendChild(ul);
      details.appendChild(childrenContainer);
      li.appendChild(details);
      return li;
    }

    const button = document.createElement("button");
    const isGraphFile = isGraphFilePath(node.name) || node.isGraphDocumentFile === true;
    const isJsonFile = isJsonPath(node.name);
    const isUnsupportedFile = !isSupportedFolderTreeDocumentNode(node);
    const canOpenAsFile = node.kind === "file";
    const fileLanguageClass = isUnsupportedFile ? "" : getFileLanguageClass(node.name || node.path || node.fullPath);
    button.type = "button";
    button.className = "folder-tree-file"
      + (isGraphFile ? " folder-tree-graph-file" : "")
      + (fileLanguageClass ? ` folder-tree-language-file ${fileLanguageClass}` : "")
      + (isUnsupportedFile ? " folder-tree-unsupported-file" : "");
    button.title = getFolderTreeFileTooltip(node);
    button.dataset.name = node.name || "";
    button.dataset.path = node.path || "";
    button.dataset.fullPath = node.fullPath || "";
    applySidebarSelectionStateToElement(button, node);
    configureFolderTreeDragSource(button, node);
    const fileIconClass = getFileIconClass(node.name, { isGraphFile, isJsonFile, isUnsupportedFile });
    button.innerHTML = `<i class="bi ${fileIconClass}"></i><span>${node.name}</span>`;

    async function readSidebarFileContent() {
      const desktopPath = getSidebarNodeFilesystemPath(node);
      if (typeof NL_VERSION !== "undefined" && desktopPath) {
        // Desktop: read file via Neutralino filesystem
        return Neutralino.filesystem.readFile(desktopPath);
      }

      // Browser: read file via File System Access API or upload fallback
      const nodePathKey = getComparableFilePath(node.fullPath || node.path || node.name || "");
      const folderEntry = (folderMarkdownFiles || []).find((entry) => {
        const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
        return entryPathKey && nodePathKey && entryPathKey === nodePathKey;
      });
      if (folderEntry) return readFolderMarkdownFileContent(folderEntry);

      if (node.file) return node.file.text();
      if (!node.handle?.getFile) throw new Error("No readable file handle is available.");
      const file = await node.handle.getFile();
      return file.text();
    }

    if (canOpenAsFile) {
      button.addEventListener("click", (event) => {
        if (handleSidebarSelectionClick(event, node)) return;
        void openSidebarTreeFile(node, { temporary: true, focusElement: button });
      });

      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        void openSidebarTreeFile(node, { temporary: false, focusElement: button });
      });
    }

    button.addEventListener("contextmenu", (event) => {
      showSidebarFileContextMenu(event, node);
    });

    li.appendChild(button);
    return li;
  }

  function getSavedGraphTreePathFromMetadata(metadata) {
    if (!metadata) return "";
    if (metadata.path && activeFolderPath && isPathInsideFolder(metadata.path, activeFolderPath)) {
      return getPathRelativeToFolder(metadata.path, activeFolderPath);
    }
    return metadata.name || "";
  }

  function createSavedGraphTreeNode(metadata) {
    const relativePath = getSavedGraphTreePathFromMetadata(metadata);
    const name = metadata?.name || getFileName(relativePath || metadata?.path || "graph.mdviewer-graph.json");
    if (!name || !isGraphFilePath(name)) return null;
    const node = {
      kind: "file",
      name,
      path: relativePath || name,
      fullPath: metadata?.path || "",
      handle: metadata?.handle || null,
      createdAt: 0,
      modifiedAt: 0,
      size: 0,
      isGraphDocumentFile: true
    };
    if (!node.fullPath && activeFolderPath && node.path) {
      node.fullPath = joinPath(activeFolderPath, node.path);
    }
    return node;
  }

  function getSavedDocumentTreePathFromMetadata(metadata) {
    if (!metadata) return "";
    if (metadata.path && activeFolderPath && isPathInsideFolder(metadata.path, activeFolderPath)) {
      return getPathRelativeToFolder(metadata.path, activeFolderPath);
    }
    return metadata.name || "";
  }

  function createSavedDocumentTreeNode(metadata) {
    const relativePath = getSavedDocumentTreePathFromMetadata(metadata);
    const name = metadata?.name || getFileName(relativePath || metadata?.path || "document.md");
    if (!name) return null;
    const path = relativePath || name;
    return {
      kind: "file",
      name,
      path,
      fullPath: metadata?.path || (activeFolderPath && path ? joinPath(activeFolderPath, path) : ""),
      handle: metadata?.handle || null,
      createdAt: 0,
      modifiedAt: 0,
      size: 0,
      isGraphDocumentFile: isGraphFilePath(name)
    };
  }

  function splitTreePath(path) {
    return String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
  }

  function upsertFolderTreeNode(nodes, treeNode) {
    if (!treeNode) return { updated: false, parentPath: "" };
    const pathParts = splitTreePath(treeNode.path || treeNode.name);
    const nodeName = pathParts.pop() || treeNode.name;
    if (!nodeName) return { updated: false, parentPath: "" };
    let siblings = Array.isArray(nodes) ? nodes : [];
    let parentPath = "";

    pathParts.forEach((folderName) => {
      let folderNode = siblings.find((node) => node?.kind === "directory" && node.name === folderName);
      if (!folderNode) {
        parentPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        folderNode = { kind: "directory", name: folderName, path: parentPath, children: [] };
        siblings.push(folderNode);
      } else {
        parentPath = folderNode.path || (parentPath ? `${parentPath}/${folderName}` : folderName);
      }
      if (!Array.isArray(folderNode.children)) folderNode.children = [];
      siblings = folderNode.children;
    });

    const nextNode = {
      ...treeNode,
      name: nodeName,
      path: treeNode.path || (parentPath ? `${parentPath}/${nodeName}` : nodeName)
    };
    const savedPath = getComparableFilePath(nextNode.fullPath || nextNode.path || nextNode.name || "");
    const existingIndex = siblings.findIndex((node) => {
      if (!node || node.kind !== nextNode.kind) return false;
      const existingPath = getComparableFilePath(node.fullPath || node.path || node.name || "");
      return existingPath && savedPath && existingPath === savedPath;
    });
    if (existingIndex >= 0) {
      const existingNode = siblings[existingIndex];
      siblings[existingIndex] = nextNode.kind === "directory"
        ? { ...existingNode, ...nextNode, children: existingNode.children || nextNode.children || [] }
        : { ...existingNode, ...nextNode };
    }
    else siblings.push(nextNode);
    sortFolderTreeNodes(siblings);
    const storedNode = siblings.find((node) => {
      if (!node || node.kind !== nextNode.kind) return false;
      const existingPath = getComparableFilePath(node.fullPath || node.path || node.name || "");
      return existingPath && savedPath && existingPath === savedPath;
    }) || nextNode;
    return { updated: true, node: storedNode, parentPath };
  }

  function upsertSavedGraphNodeInTree(nodes, savedNode) {
    return upsertFolderTreeNode(nodes, savedNode);
  }

  function findFolderTreeFileButtonForNode(node) {
    if (!folderTreeRoot || !node) return null;
    const candidates = [node.fullPath, node.path, node.name]
      .filter(Boolean)
      .map(getComparableFilePath);
    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find((button) => {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path, button.dataset.name]
        .filter(Boolean)
        .map(getComparableFilePath);
      return candidates.some((candidate) => buttonCandidates.includes(candidate));
    }) || null;
  }

  function findFolderTreeParentList(parentPath) {
    if (!folderTreeRoot) return null;
    if (!parentPath) {
      const rootDetails = folderTreeRoot.querySelector(":scope > .folder-tree-list > .folder-tree-item > details");
      return rootDetails?.querySelector(":scope > .folder-tree-children > .folder-tree-list") || null;
    }
    const normalizedParentPath = getComparableFilePath(parentPath);
    const parentDetails = Array.from(folderTreeRoot.querySelectorAll("details")).find((details) => {
      const path = getComparableFilePath(details.dataset.path || "");
      const fullPath = getComparableFilePath(details.dataset.fullPath || "");
      return path === normalizedParentPath || fullPath === normalizedParentPath;
    });
    return parentDetails?.querySelector(":scope > .folder-tree-children > .folder-tree-list") || null;
  }

  function findFolderTreeElementForNode(node) {
    if (!folderTreeRoot || !node) return null;
    if (node.kind === "directory") {
      const candidates = [node.fullPath, node.path, node.name]
        .filter(Boolean)
        .map(getComparableFilePath);
      const details = Array.from(folderTreeRoot.querySelectorAll("details")).find((candidate) => {
        const candidatePaths = [candidate.dataset.fullPath, candidate.dataset.path]
          .filter(Boolean)
          .map(getComparableFilePath);
        return candidates.some((path) => candidatePaths.includes(path));
      });
      return details?.closest(".folder-tree-item") || null;
    }
    const existingButton = findFolderTreeFileButtonForNode(node);
    return existingButton?.closest(".folder-tree-item") || null;
  }

  function getFolderTreeElementSortInfo(item) {
    const details = item.querySelector(":scope > details");
    if (details) {
      return {
        kind: "directory",
        name: details.querySelector(":scope > summary .folder-tree-label, :scope > summary span")?.textContent || ""
      };
    }
    const button = item.querySelector(":scope > .folder-tree-file");
    return {
      kind: "file",
      name: button?.dataset.name || button?.textContent || ""
    };
  }

  function shouldInsertTreeElementBefore(newNode, item) {
    const current = getFolderTreeElementSortInfo(item);
    if (newNode.kind === "directory" && current.kind !== "directory") return true;
    if (newNode.kind !== "directory" && current.kind === "directory") return false;
    return String(newNode.name || "").localeCompare(current.name || "") < 0;
  }

  function replaceOrInsertFolderTreeElement(node, parentPath) {
    const nextElement = renderFolderTreeNode(node, parentPath);
    const existingItem = findFolderTreeElementForNode(node);
    if (existingItem) {
      existingItem.replaceWith(nextElement);
      return true;
    }

    const parentList = findFolderTreeParentList(parentPath);
    if (!parentList) return false;
    const insertBefore = Array.from(parentList.children).find((item) => shouldInsertTreeElementBefore(node, item));
    parentList.insertBefore(nextElement, insertBefore || null);
    return true;
  }

  function findFolderTreeElementForNodeInParent(node, parentPath) {
    if (!node) return null;
    const nodeKeys = [node.fullPath, node.path]
      .filter(Boolean)
      .map(getComparableFilePath);
    if (!nodeKeys.length) return null;
    const parentList = findFolderTreeParentList(parentPath);
    const parentMatches = parentList ? Array.from(parentList.children) : [];
    const renderedMatches = parentPath ? [] : Array.from(folderTreeRoot?.querySelectorAll(".folder-tree-item") || []);
    return [...parentMatches, ...renderedMatches].find((item) => {
      const details = item.querySelector(":scope > details");
      const fileButton = item.querySelector(":scope > .folder-tree-file");
      const itemKeys = details
        ? [details.dataset.fullPath, details.dataset.path]
        : [fileButton?.dataset.fullPath, fileButton?.dataset.path];
      return itemKeys.filter(Boolean).map(getComparableFilePath).some((key) => nodeKeys.includes(key));
    }) || null;
  }

  function replaceOrInsertFolderTreeElementInParent(node, parentPath) {
    const parentList = findFolderTreeParentList(parentPath);
    if (!parentList) return false;
    const nextElement = renderFolderTreeNode(node, parentPath);
    const existingItem = findFolderTreeElementForNodeInParent(node, parentPath);
    if (existingItem) {
      if (node.kind === "directory") {
        const currentDetails = existingItem.querySelector(":scope > details");
        const currentTreePath = currentDetails?.dataset.path || node.path || "";
        const currentFullPath = currentDetails?.dataset.fullPath || node.fullPath || "";
        const openStates = captureFolderTreeOpenStates(existingItem, currentTreePath, currentFullPath);
        applyFolderTreeOpenStates(nextElement, node.path || currentTreePath, node.fullPath || currentFullPath, openStates);
      }
      existingItem.replaceWith(nextElement);
      return true;
    }

    const insertBefore = Array.from(parentList.children).find((item) => shouldInsertTreeElementBefore(node, item));
    parentList.insertBefore(nextElement, insertBefore || null);
    return true;
  }

  function replaceOrInsertSavedGraphTreeElement(savedNode, parentPath) {
    return replaceOrInsertFolderTreeElement(savedNode, parentPath);
  }

  function updateSavedGraphFileInFolderTree(metadata) {
    const savedNode = createSavedGraphTreeNode(metadata);
    if (!savedNode || !isFolderOpen) return false;
    const result = upsertSavedGraphNodeInTree(currentFolderTreeNodes, savedNode);
    if (!result.updated) return false;
    replaceOrInsertSavedGraphTreeElement(result.node, result.parentPath);
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    return true;
  }

  function updateSavedDocumentFileInFolderTree(metadata) {
    const savedNode = createSavedDocumentTreeNode(metadata);
    if (!savedNode || !isFolderOpen) return false;
    const result = upsertFolderTreeNode(currentFolderTreeNodes, savedNode);
    if (!result.updated) return false;
    replaceOrInsertFolderTreeElement(result.node, result.parentPath);
    addCreatedFileToFolderMarkdownFiles(result.node);
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    renderLinkAutocomplete?.();
    return true;
  }

  function getCreatedChildTreePath(parentNode, childName, fullPath) {
    if (fullPath && activeFolderPath && isPathInsideFolder(fullPath, activeFolderPath)) {
      return getPathRelativeToFolder(fullPath, activeFolderPath);
    }
    const parentPath = isOpenFolderRootContextNode(parentNode) ? "" : (parentNode?.path || "");
    return parentPath ? `${parentPath}/${childName}` : childName;
  }

  function createCreatedFolderTreeNode(kind, name, parentNode, options = {}) {
    const fullPath = options.fullPath || "";
    const path = getCreatedChildTreePath(parentNode, name, fullPath);
    return {
      kind,
      name,
      path,
      fullPath,
      handle: options.handle || null,
      createdAt: 0,
      modifiedAt: 0,
      size: 0,
      children: kind === "directory" ? [] : undefined,
      isGraphDocumentFile: kind === "file" && isGraphFilePath(name)
    };
  }

  function getFilesystemNodeMetadata(stats = {}) {
    return {
      createdAt: Number(stats.createdAt || 0) || 0,
      modifiedAt: Number(stats.modifiedAt || 0) || 0,
      size: Number(stats.size || 0) || 0
    };
  }

  async function createFilesystemTreeNode(fullPath, options = {}) {
    if (!fullPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.getStats) return null;
    let stats = null;
    try {
      stats = await Neutralino.filesystem.getStats(fullPath);
    } catch (error) {
      if (!options.allowMissing) return null;
      stats = {};
    }

    const kind = options.kind === "folder" || stats?.isDirectory ? "directory" : "file";
    const name = options.name || getFileName(fullPath);
    const path = activeFolderPath && isPathInsideFolder(fullPath, activeFolderPath)
      ? getPathRelativeToFolder(fullPath, activeFolderPath)
      : String(fullPath).replace(/\\/g, "/");
    const metadata = getFilesystemNodeMetadata(stats || {});
    const node = {
      kind,
      name,
      path,
      fullPath,
      handle: null,
      ...metadata
    };

    if (kind === "directory") {
      node.children = options.children || [];
      if (options.scanDirectory && typeof listMarkdownTreeNeutralino === "function") {
        node.children = await listMarkdownTreeNeutralino(fullPath);
      }
    } else {
      node.isGraphDocumentFile = isGraphFilePath(name);
    }
    return node;
  }

  function getRenderableFolderTreeChildren(children) {
    return (children || []).filter((child) => child?.kind === "directory" || child?.kind === "file");
  }

  function renderFolderTreeChildrenIntoList(parentPath, children) {
    const parentList = findFolderTreeParentList(parentPath);
    if (!parentList) return false;
    const parentDetails = parentList.closest('details');
    if (parentDetails && isSidebarFolderFlatView(parentDetails._folderTreeNode)) {
      parentList.innerHTML = "";
      renderFlatFolderTreeChildren(parentDetails, parentList, parentDetails._folderTreeNode);
      return true;
    }
    const fragment = document.createDocumentFragment();
    getRenderableFolderTreeChildren(children).forEach((child) => {
      const existingItem = findFolderTreeElementForNodeInParent(child, parentPath);
      if (!existingItem) {
        fragment.appendChild(renderFolderTreeNode(child, parentPath));
        return;
      }
      const existingDetails = existingItem.querySelector(":scope > details");
      if (existingDetails && child.kind === "directory") {
        existingDetails._folderTreeNode = child;
        existingDetails._folderTreeChildren = child.children || [];
      }
      fragment.appendChild(existingItem);
    });
    parentList.replaceChildren(fragment);
    return true;
  }

  /** Mark generated output snapshots stale without reconciling their descendants. */
  function markDerivedRootsDirty(paths) {
    const dirtyKeys = new Set((paths || []).map(getComparableFilePath).filter(Boolean));
    if (!dirtyKeys.size || !folderTreeRoot) return 0;
    let marked = 0;
    folderTreeRoot.querySelectorAll("details").forEach((details) => {
      const pathKey = getComparableFilePath(details.dataset.fullPath || details.dataset.path || "");
      if (!dirtyKeys.has(pathKey)) return;
      details.dataset.derivedDirty = "true";
      details.dataset.childrenRendered = "false";
      details.classList.add("folder-tree-derived-dirty");
      if (details._folderTreeNode) details._folderTreeNode.childrenLazy = true;
      if (details.firstElementChild) details.firstElementChild.title = "Generated output changed. Collapse and expand to refresh.";
      marked += 1;
    });
    return marked;
  }

  function getFolderTreeNodeRelativePath(node, parentPath = "") {
    return node?.path || (parentPath ? `${parentPath}/${node?.name || ""}` : node?.name || "");
  }

  function findFolderTreeDirectoryByPath(nodes, pathKeys, parentPath = "") {
    if (!Array.isArray(nodes) || !pathKeys?.size) return null;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node || node.kind !== "directory") continue;
      const nodePath = getFolderTreeNodeRelativePath(node, parentPath);
      const nodeKeys = [node.fullPath, nodePath, node.name]
        .filter(Boolean)
        .map(getComparableFilePath);
      if (nodeKeys.some((key) => pathKeys.has(key))) return { node, siblings: nodes, index, parentPath };
      const nested = findFolderTreeDirectoryByPath(node.children || [], pathKeys, nodePath);
      if (nested) return nested;
    }
    return null;
  }

  async function collectMarkdownFilesForTreeNodes(nodes, parentPath = "") {
    if (typeof collectMarkdownFilesFromTreeNeutralino === "function") {
      return collectMarkdownFilesFromTreeNeutralino(nodes || [], parentPath);
    }
    return [];
  }

  async function replaceFolderMarkdownFilesForSubtree(parentTreePath, children) {
    const nextFiles = await collectMarkdownFilesForTreeNodes(children || [], parentTreePath || "");
    if (!parentTreePath) {
      folderMarkdownFiles = nextFiles;
      return;
    }
    const parentKey = getComparableFilePath(parentTreePath);
    folderMarkdownFiles = [
      ...(folderMarkdownFiles || []).filter((entry) => {
        const entryPathKey = getComparableFilePath(entry.path || entry.fullPath || entry.name || "");
        return entryPathKey !== parentKey && !entryPathKey.startsWith(`${parentKey}/`);
      }),
      ...nextFiles
    ];
    sortFolderMarkdownFilesFromTreeOrder();
  }

  function sortFolderMarkdownFilesFromTreeOrder() {
    const order = new Map();
    let index = 0;
    const visit = (nodes) => {
      (nodes || []).forEach((node) => {
        if (node.kind === "directory") {
          visit(node.children || []);
          return;
        }
        order.set(getComparableFilePath(node.fullPath || node.path || node.name || ""), index);
        order.set(getComparableFilePath(node.path || node.name || ""), index);
        index += 1;
      });
    };
    visit(currentFolderTreeNodes || []);
    folderMarkdownFiles = (folderMarkdownFiles || []).slice().sort((a, b) => {
      const aKey = getComparableFilePath(a.fullPath || a.path || a.name || "");
      const bKey = getComparableFilePath(b.fullPath || b.path || b.name || "");
      return (order.get(aKey) ?? Number.MAX_SAFE_INTEGER) - (order.get(bKey) ?? Number.MAX_SAFE_INTEGER);
    });
  }

  function findExistingDirectoryChild(children, childPath, childName) {
    const childPathKey = getComparableFilePath(childPath);
    const childNameKey = getComparableFilePath(childName);
    return (children || []).find((child) => {
      if (child?.kind !== "directory") return false;
      const keys = [child.fullPath, child.path, child.name].filter(Boolean).map(getComparableFilePath);
      return keys.includes(childPathKey) || keys.includes(childNameKey);
    }) || null;
  }

  async function readFolderTreeDirectChildrenFromDisk(parentPath, existingChildren = []) {
    if (!parentPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.readDirectory) return null;
    const entries = await Neutralino.filesystem.readDirectory(parentPath);
    const children = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || entry.entry === "." || entry.entry === ".." || (entry.entry === ".git" && !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder())) || (entry.entry === ".md-editor" && !(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder())) || (entry.type === "DIRECTORY" && typeof shouldSkipCustomHiddenFolder === "function" && shouldSkipCustomHiddenFolder(entry.entry))) continue;
      const fullPath = joinPath(parentPath, entry.entry);
      if (entry.type === "DIRECTORY") {
        const existing = findExistingDirectoryChild(existingChildren, fullPath, entry.entry);
        const node = await createFilesystemTreeNode(fullPath, {
          kind: "folder",
          children: existing?.children || []
        });
        if (node) node.childrenLazy = true;
        if (node) children.push(node);
      } else if (entry.type === "FILE") {
        const node = await createFilesystemTreeNode(fullPath, { kind: "file" });
        if (node) children.push(node);
      }
      if (index > 0 && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return sortFolderTreeNodes(children);
  }

  /**
   * Reads all folder entries in one native operation for wildcard filtering.
   * @param {string} rootPath - Absolute path of the open workspace.
   * @returns {Promise<Array|null>} Recursive directory entries, or null outside Neutralino.
   */
  async function readFolderTreeRecursiveEntriesFromDisk(rootPath) {
    if (!rootPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.readDirectory) return null;
    const recursiveEntries = await Neutralino.filesystem.readDirectory(rootPath, { recursive: true });
    const normalizedRootPath = String(rootPath).replace(/\\/g, "/").replace(/\/+$/, "");
    const hasNestedEntries = (recursiveEntries || []).some((entry) => {
      const normalizedEntryPath = String(entry?.path || "").replace(/\\/g, "/");
      const relativePath = normalizedEntryPath.toLowerCase().startsWith(`${normalizedRootPath.toLowerCase()}/`)
        ? normalizedEntryPath.slice(normalizedRootPath.length + 1)
        : "";
      return relativePath.includes("/");
    });
    if (hasNestedEntries || !(recursiveEntries || []).some((entry) => entry?.type === "DIRECTORY")) {
      return recursiveEntries;
    }

    const entries = [];
    let folderPaths = [rootPath];
    while (folderPaths.length) {
      const nextFolderPaths = [];
      for (let index = 0; index < folderPaths.length; index += 8) {
        const folderBatch = folderPaths.slice(index, index + 8);
        const batchEntries = await Promise.all(folderBatch.map((folderPath) => Neutralino.filesystem.readDirectory(folderPath)));
        batchEntries.forEach((folderEntries, batchIndex) => {
          const parentPath = folderBatch[batchIndex];
          (folderEntries || []).forEach((entry) => {
            if (!entry || entry.entry === "." || entry.entry === "..") return;
            const fullPath = joinPath(parentPath, entry.entry);
            entries.push({ ...entry, path: fullPath });
            if (entry.type === "DIRECTORY" && !shouldHideFolderTreeDirectory(entry.entry)) {
              nextFolderPaths.push(fullPath);
            }
          });
        });
      }
      folderPaths = nextFolderPaths;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return entries;
  }

  async function reconcileFolderTreeParentFromDisk(parentPath) {
    if (!parentPath || !activeFolderPath || !isPathInsideFolder(parentPath, activeFolderPath)) return false;
    const parentTreePath = getPathRelativeToFolder(parentPath, activeFolderPath);
    const parentKeys = getDeletedPathKeys(parentPath);
    parentKeys.add(getComparableFilePath(parentTreePath));
    let existingChildren = currentFolderTreeNodes;
    let targetNode = null;
    if (parentTreePath) {
      const match = findFolderTreeDirectoryByPath(currentFolderTreeNodes, parentKeys);
      if (!match) return false;
      targetNode = match.node;
      existingChildren = targetNode.children || [];
    }

    const nextChildren = await readFolderTreeDirectChildrenFromDisk(parentPath, existingChildren);
    if (!nextChildren) return false;
    if (targetNode) targetNode.children = nextChildren;
    else currentFolderTreeNodes = nextChildren;
    await replaceFolderMarkdownFilesForSubtree(parentTreePath, nextChildren);
    renderFolderTreeChildrenIntoList(parentTreePath, nextChildren);
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    renderLinkAutocomplete?.();
    return true;
  }

  async function updateModifiedPathInFolderTree(modifiedPath) {
    if (!modifiedPath || !isFolderOpen || !isNeutralinoRuntime() || !Neutralino.filesystem?.getStats) return false;
    const modifiedKeys = getDeletedPathKeys(modifiedPath);
    const fileMatch = findFolderTreeNodeByPath(currentFolderTreeNodes, modifiedKeys, "file");
    const folderMatch = fileMatch ? null : findFolderTreeDirectoryByPath(currentFolderTreeNodes, modifiedKeys);
    const match = fileMatch || folderMatch;
    if (!match?.node) return false;
    let stats = null;
    try {
      stats = await Neutralino.filesystem.getStats(modifiedPath);
    } catch (_) {
      return false;
    }
    Object.assign(match.node, getFilesystemNodeMetadata(stats || {}));
    if (match.node.kind === "file") {
      const entryKey = getComparableFilePath(match.node.fullPath || match.node.path || match.node.name || "");
      (folderMarkdownFiles || []).forEach((entry) => {
        const pathKey = getComparableFilePath(entry.fullPath || entry.path || entry.name || "");
        if (entryKey && pathKey === entryKey) {
          entry.size = match.node.size;
          entry.modifiedAt = match.node.modifiedAt;
          entry.createdAt = match.node.createdAt;
          delete entry.content;
        }
      });
    }
    const existingItem = findFolderTreeElementForNode(match.node);
    if (existingItem) {
      const nextElement = renderFolderTreeNode(match.node, match.parentPath || getParentTreePath(match.node.path || ""));
      if (match.node.kind === "directory") {
        const openStates = captureFolderTreeOpenStates(existingItem, match.node.path || "", match.node.fullPath || "");
        applyFolderTreeOpenStates(nextElement, match.node.path || "", match.node.fullPath || "", openStates);
      }
      existingItem.replaceWith(nextElement);
    }
    renderLinkAutocomplete?.();
    return true;
  }

  function addCreatedFileToFolderMarkdownFiles(node) {
    if (!node || node.kind !== "file" || !isMarkdownPath(node.name || node.path || node.fullPath)) return;
    const nodePathKey = getComparableFilePath(node.fullPath || node.path || node.name || "");
    if (!nodePathKey) return;
    const exists = (folderMarkdownFiles || []).some((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      return entryPathKey === nodePathKey;
    });
    if (exists) return;
    folderMarkdownFiles = [
      ...(folderMarkdownFiles || []),
      {
        path: node.path || node.name,
        name: node.name,
        fullPath: node.fullPath || null,
        handle: node.handle || null,
        tags: []
      }
    ];
  }

  function shouldHideFolderTreeDirectory(name) {
    if (name === ".git" && !(typeof shouldShowGitProjectFolder === "function" && shouldShowGitProjectFolder())) return true;
    if (name === ".md-editor" && !(typeof shouldShowMdEditorProjectFolder === "function" && shouldShowMdEditorProjectFolder())) return true;
    return typeof shouldSkipCustomHiddenFolder === "function" && shouldSkipCustomHiddenFolder(name);
  }

  function upsertCreatedPathInFolderTree(createdNode) {
    if (!createdNode || !isFolderOpen) return false;
    if (createdNode.kind === "directory" && shouldHideFolderTreeDirectory(createdNode.name)) return false;
    const result = upsertFolderTreeNode(currentFolderTreeNodes, createdNode);
    if (!result.updated) return false;
    replaceOrInsertFolderTreeElementInParent(result.node, result.parentPath);
    addCreatedFileToFolderMarkdownFiles(result.node);
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    renderLinkAutocomplete?.();
    return true;
  }

  function getDeletedTreePath(deletedPath) {
    if (!deletedPath) return "";
    if (activeFolderPath && isPathInsideFolder(deletedPath, activeFolderPath)) {
      return getPathRelativeToFolder(deletedPath, activeFolderPath);
    }
    return deletedPath;
  }

  function getDeletedPathKeys(deletedPath) {
    const keys = new Set();
    const addKey = (value) => {
      const key = getComparableFilePath(value);
      if (key) keys.add(key);
    };
    addKey(deletedPath);
    addKey(getDeletedTreePath(deletedPath));
    return keys;
  }

  function pathKeyMatchesDeletedPath(pathKey, deletedPathKeys, kind) {
    if (!pathKey || !deletedPathKeys?.size) return false;
    for (const deletedPathKey of deletedPathKeys) {
      if (pathKey === deletedPathKey) return true;
      if (kind === "folder" && pathKey.startsWith(`${deletedPathKey}/`)) return true;
    }
    return false;
  }

  function treeNodeMatchesDeletedPath(node, deletedPathKeys, kind) {
    if (!node || !deletedPathKeys?.size) return false;
    const nodePathKey = getComparableFilePath(node.fullPath || node.path || node.name || "");
    if (!nodePathKey) return false;
    if (kind === "folder") {
      return node.kind === "directory" && pathKeyMatchesDeletedPath(nodePathKey, deletedPathKeys, kind);
    }
    return node.kind === "file" && pathKeyMatchesDeletedPath(nodePathKey, deletedPathKeys, kind);
  }

  function removeDeletedNodeFromTree(nodes, deletedPathKeys, kind) {
    if (!Array.isArray(nodes) || !deletedPathKeys?.size) return false;
    let changed = false;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (treeNodeMatchesDeletedPath(node, deletedPathKeys, kind)) {
        nodes.splice(index, 1);
        changed = true;
        continue;
      }
      if (node?.kind === "directory" && removeDeletedNodeFromTree(node.children || [], deletedPathKeys, kind)) {
        changed = true;
      }
    }
    return changed;
  }

  function removeDeletedPathFromFolderMarkdownFiles(deletedPathKeys, kind) {
    if (!deletedPathKeys?.size) return;
    folderMarkdownFiles = (folderMarkdownFiles || []).filter((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      if (!entryPathKey) return true;
      return !pathKeyMatchesDeletedPath(entryPathKey, deletedPathKeys, kind);
    });
  }

  function removeDeletedFolderTreeElement(deletedPathKeys, kind) {
    if (!folderTreeRoot || !deletedPathKeys?.size) return false;
    if (kind === "folder") {
      const details = Array.from(folderTreeRoot.querySelectorAll("details")).find((candidate) => {
        const path = getComparableFilePath(candidate.dataset.path || "");
        const fullPath = getComparableFilePath(candidate.dataset.fullPath || "");
        return pathKeyMatchesDeletedPath(path, deletedPathKeys, kind) || pathKeyMatchesDeletedPath(fullPath, deletedPathKeys, kind);
      });
      const item = details?.closest(".folder-tree-item");
      if (item) {
        item.remove();
        return true;
      }
      return false;
    }

    const button = Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find((candidate) => {
      const path = getComparableFilePath(candidate.dataset.path || "");
      const fullPath = getComparableFilePath(candidate.dataset.fullPath || "");
      return pathKeyMatchesDeletedPath(path, deletedPathKeys, kind) || pathKeyMatchesDeletedPath(fullPath, deletedPathKeys, kind);
    });
    const item = button?.closest(".folder-tree-item");
    if (item) {
      item.remove();
      return true;
    }
    return false;
  }

  function removeDeletedPathFromFolderTree(deletedPath, options = {}) {
    const kind = options.kind === "folder" ? "folder" : "file";
    const deletedPathKeys = getDeletedPathKeys(deletedPath);
    if (!deletedPathKeys.size || !isFolderOpen) return false;
    const changed = removeDeletedNodeFromTree(currentFolderTreeNodes, deletedPathKeys, kind);
    removeDeletedPathFromFolderMarkdownFiles(deletedPathKeys, kind);
    removeDeletedFolderTreeElement(deletedPathKeys, kind);
    if (!changed) return false;
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    renderLinkAutocomplete?.();
    return true;
  }

  function getTreePathFromRenamePath(path) {
    if (!path) return "";
    if (activeFolderPath && isPathInsideFolder(path, activeFolderPath)) {
      return getPathRelativeToFolder(path, activeFolderPath);
    }
    return String(path).replace(/\\/g, "/");
  }

  function getParentTreePath(path) {
    const parts = splitTreePath(path);
    parts.pop();
    return parts.join("/");
  }

  function findFolderTreeNodeByPath(nodes, pathKeys, kind, parentPath = "") {
    if (!Array.isArray(nodes) || !pathKeys?.size) return null;
    const nodeKind = kind === "folder" ? "directory" : "file";
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodePath = node?.path || (parentPath ? `${parentPath}/${node?.name || ""}` : node?.name || "");
      const nodeKeys = [node?.fullPath, nodePath, node?.name]
        .filter(Boolean)
        .map(getComparableFilePath);
      if (node?.kind === nodeKind && nodeKeys.some((key) => pathKeys.has(key))) {
        return { node, siblings: nodes, index, parentPath };
      }
      if (node?.kind === "directory") {
        const match = findFolderTreeNodeByPath(node.children || [], pathKeys, kind, nodePath);
        if (match) return match;
      }
    }
    return null;
  }

  function findFolderTreeChildrenForParentPath(parentPath) {
    if (!parentPath) return { node: null, children: currentFolderTreeNodes };
    const parentKeys = new Set([getComparableFilePath(parentPath)].filter(Boolean));
    const parentMatch = findFolderTreeDirectoryByPath(currentFolderTreeNodes, parentKeys);
    if (!parentMatch?.node) return null;
    if (!Array.isArray(parentMatch.node.children)) parentMatch.node.children = [];
    return { node: parentMatch.node, children: parentMatch.node.children };
  }
  function updateRenamedTreeNodePaths(node, oldTreePath, newTreePath, oldFullPath, newFullPath, parentPath = "") {
    if (!node) return;
    const fallbackPath = parentPath ? `${parentPath}/${node.name || ""}` : (node.name || "");
    if (node.path) node.path = replacePathPrefix(node.path, oldTreePath, newTreePath);
    else node.path = fallbackPath;
    if (node.fullPath) node.fullPath = replacePathPrefix(node.fullPath, oldFullPath, newFullPath);
    if (node.kind === "directory") {
      (node.children || []).forEach((child) => {
        updateRenamedTreeNodePaths(child, oldTreePath, newTreePath, oldFullPath, newFullPath, node.path || fallbackPath);
      });
    }
  }

  function getPathSuffix(path, prefix) {
    const normalizedPath = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPrefix = String(prefix || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalizedPath || !normalizedPrefix) return "";
    if (normalizedPath === normalizedPrefix) return "";
    if (!normalizedPath.startsWith(`${normalizedPrefix}/`)) return "";
    return normalizedPath.slice(normalizedPrefix.length + 1);
  }

  function captureFolderTreeOpenStates(item, oldTreePath, oldFullPath) {
    const states = new Map();
    if (!item) return states;
    item.querySelectorAll("details").forEach((details) => {
      const suffix = getPathSuffix(details.dataset.path || "", oldTreePath)
        || getPathSuffix(details.dataset.fullPath || "", oldFullPath);
      states.set(suffix, details.open);
    });
    return states;
  }

  function applyFolderTreeOpenStates(item, newTreePath, newFullPath, states) {
    if (!item || !states?.size) return;
    item.querySelectorAll("details").forEach((details) => {
      const suffix = getPathSuffix(details.dataset.path || "", newTreePath)
        || getPathSuffix(details.dataset.fullPath || "", newFullPath);
      if (states.has(suffix)) details.open = states.get(suffix);
    });
  }

  function repositionFolderTreeElement(item, node, parentPath) {
    const parentList = findFolderTreeParentList(parentPath);
    if (!parentList || !item) return false;
    const insertBefore = Array.from(parentList.children).find((candidate) => (
      candidate !== item && shouldInsertTreeElementBefore(node, candidate)
    ));
    parentList.insertBefore(item, insertBefore || null);
    return true;
  }

  function renameFolderMarkdownFileEntryPath(entry, oldTreePath, newTreePath, oldFullPath, newFullPath, kind) {
    const nextEntry = { ...entry };
    if (nextEntry.path) {
      const renamedPath = kind === "folder"
        ? replacePathPrefix(nextEntry.path, oldTreePath, newTreePath)
        : (getComparableFilePath(nextEntry.path) === getComparableFilePath(oldTreePath) ? newTreePath : nextEntry.path);
      nextEntry.path = renamedPath;
      nextEntry.name = getFileName(renamedPath);
    }
    if (nextEntry.fullPath) {
      const renamedFullPath = kind === "folder"
        ? replacePathPrefix(nextEntry.fullPath, oldFullPath, newFullPath)
        : (getComparableFilePath(nextEntry.fullPath) === getComparableFilePath(oldFullPath) ? newFullPath : nextEntry.fullPath);
      nextEntry.fullPath = renamedFullPath;
      if (!nextEntry.name) nextEntry.name = getFileName(renamedFullPath);
    }
    return nextEntry;
  }

  function updateRenamedPathInFolderMarkdownFiles(node, oldTreePath, newTreePath, oldFullPath, newFullPath, kind) {
    if (!Array.isArray(folderMarkdownFiles) || !folderMarkdownFiles.length) {
      if (kind === "file" && isMarkdownPath(newTreePath || newFullPath || node?.name)) {
        addCreatedFileToFolderMarkdownFiles(node);
      }
      return;
    }

    if (kind === "folder") {
      const oldTreeKey = getComparableFilePath(oldTreePath);
      const oldFullKey = getComparableFilePath(oldFullPath);
      folderMarkdownFiles = folderMarkdownFiles.map((entry) => {
        const entryPathKey = getComparableFilePath(entry.path || "");
        const entryFullPathKey = getComparableFilePath(entry.fullPath || "");
        if (
          pathKeyMatchesDeletedPath(entryPathKey, new Set([oldTreeKey]), "folder")
          || pathKeyMatchesDeletedPath(entryFullPathKey, new Set([oldFullKey]), "folder")
        ) {
          return renameFolderMarkdownFileEntryPath(entry, oldTreePath, newTreePath, oldFullPath, newFullPath, kind);
        }
        return entry;
      });
      return;
    }

    const oldKeys = new Set([oldTreePath, oldFullPath].map(getComparableFilePath).filter(Boolean));
    const existingIndex = folderMarkdownFiles.findIndex((entry) => {
      const entryKeys = [entry.fullPath, entry.path, entry.file?.webkitRelativePath, entry.file?.name, entry.name]
        .filter(Boolean)
        .map(getComparableFilePath);
      return entryKeys.some((key) => oldKeys.has(key));
    });
    const renamedIsMarkdown = isMarkdownPath(newTreePath || newFullPath || node?.name);

    if (existingIndex >= 0 && renamedIsMarkdown) {
      folderMarkdownFiles[existingIndex] = renameFolderMarkdownFileEntryPath(
        folderMarkdownFiles[existingIndex],
        oldTreePath,
        newTreePath,
        oldFullPath,
        newFullPath,
        kind
      );
    } else if (existingIndex >= 0) {
      folderMarkdownFiles.splice(existingIndex, 1);
    } else if (renamedIsMarkdown) {
      addCreatedFileToFolderMarkdownFiles(node);
    }
  }

  async function updateRenamedPathInFolderTree(options = {}) {
    const kind = options.kind === "folder" ? "folder" : "file";
    const oldTreePath = getTreePathFromRenamePath(options.oldPath);
    const newTreePath = getTreePathFromRenamePath(options.newPath);
    if (!oldTreePath || !newTreePath || !isFolderOpen) return false;

    const oldPathKeys = getDeletedPathKeys(options.oldPath || oldTreePath);
    oldPathKeys.add(getComparableFilePath(oldTreePath));
    const match = findFolderTreeNodeByPath(currentFolderTreeNodes, oldPathKeys, kind);
    if (!match) {
      const newPathKeys = getDeletedPathKeys(options.newPath || newTreePath);
      newPathKeys.add(getComparableFilePath(newTreePath));
      return findFolderTreeNodeByPath(currentFolderTreeNodes, newPathKeys, kind) ? true : false;
    }

    if (kind === "folder" && shouldHideFolderTreeDirectory(options.newName || getFileName(newTreePath))) {
      return removeDeletedPathFromFolderTree(options.oldPath || oldTreePath, { kind: "folder" });
    }

    const oldFullPath = match.node.fullPath || options.oldPath || oldTreePath;
    const newFullPath = oldFullPath === oldTreePath ? newTreePath : replacePathPrefix(oldFullPath, options.oldPath || oldFullPath, options.newPath || newTreePath);
    const existingItem = findFolderTreeElementForNode({
      kind: kind === "folder" ? "directory" : "file",
      name: options.oldName,
      path: oldTreePath,
      fullPath: oldFullPath
    });

    const parentPath = getParentTreePath(newTreePath);
    const parentChanged = getComparableFilePath(match.parentPath || "") !== getComparableFilePath(parentPath || "");
    const targetChildren = parentChanged ? findFolderTreeChildrenForParentPath(parentPath) : null;
    if (parentChanged && !targetChildren) return false;

    match.node.name = options.newName || getFileName(newTreePath);
    updateRenamedTreeNodePaths(match.node, oldTreePath, newTreePath, oldFullPath, newFullPath);
    if (parentChanged) {
      match.siblings.splice(match.index, 1);
      targetChildren.children.push(match.node);
      sortFolderTreeNodes(targetChildren.children);
    } else {
      sortFolderTreeNodes(match.siblings);
    }

    let renderedTree = true;
    if (parentChanged && existingItem) {
      const openStates = kind === "folder" ? captureFolderTreeOpenStates(existingItem, oldTreePath, oldFullPath) : null;
      existingItem.remove();
      renderedTree = replaceOrInsertFolderTreeElementInParent(match.node, parentPath);
      if (openStates) {
        const insertedItem = findFolderTreeElementForNodeInParent(match.node, parentPath);
        applyFolderTreeOpenStates(insertedItem, newTreePath, newFullPath, openStates);
      }
    } else if (kind === "folder" && existingItem) {
      const openStates = captureFolderTreeOpenStates(existingItem, oldTreePath, oldFullPath);
      const nextElement = renderFolderTreeNode(match.node, parentPath);
      applyFolderTreeOpenStates(nextElement, newTreePath, newFullPath, openStates);
      existingItem.replaceWith(nextElement);
      repositionFolderTreeElement(nextElement, match.node, parentPath);
    } else if (existingItem) {
      const nextElement = renderFolderTreeNode(match.node, parentPath);
      existingItem.replaceWith(nextElement);
      repositionFolderTreeElement(nextElement, match.node, parentPath);
    } else {
      renderedTree = replaceOrInsertFolderTreeElement(match.node, parentPath);
    }

    if (renderedTree && parentChanged) {
      renderedTree = !!findFolderTreeElementForNodeInParent(match.node, parentPath);
    }

    if (!renderedTree) return false;

    updateRenamedPathInFolderMarkdownFiles(match.node, oldTreePath, newTreePath, oldFullPath, newFullPath, kind);
    updateFolderStatusLine?.();
    updateFolderTreeToolbarState();
    renderLinkAutocomplete?.();
    return true;
  }

  function findTabForSidebarFile(node) {
    if (!node || node.kind !== "file") return null;
    const isGraphDocumentNode = isGraphFilePath(node.name) || node.isGraphDocumentFile === true;
    const matchesSidebarNodeTabType = function(tab) {
      return isGraphDocumentNode ? tab.type === "graph" : tab.type !== "graph";
    };

    if (node.handle) {
      const handleMatch = tabs.find(function(tab) {
        return matchesSidebarNodeTabType(tab) && tab.sourceFileHandle === node.handle;
      });
      if (handleMatch) return handleMatch;
    }

    const nodePath = node.fullPath || node.path || null;
    if (nodePath) {
      const nodePathKey = getComparableFilePath(nodePath);
      const pathMatch = tabs.find(function(tab) {
        return matchesSidebarNodeTabType(tab) && getComparableFilePath(tab.sourceFilePath || "") === nodePathKey;
      });
      if (pathMatch) return pathMatch;
      return null;
    }

    return tabs.find(function(tab) {
      return matchesSidebarNodeTabType(tab) && tab.sourceFileName === node.name;
    }) || null;
  }

  async function buildTreeFromFileList(fileList) {
    const root = [];
    const ensureDir = (nodes, name) => {
      let dir = nodes.find((n) => n.kind === "directory" && n.name === name);
      if (!dir) {
        dir = { kind: "directory", name, children: [] };
        nodes.push(dir);
      }
      return dir;
    };

    const files = Array.from(fileList);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (index > 0 && index % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const relPath = (file.webkitRelativePath || file.name).split("/");
      const fileName = relPath.pop();
      let cursor = root;
      relPath.forEach((segment) => {
        cursor = ensureDir(cursor, segment).children;
      });
      const modifiedAt = Number(file?.lastModified || 0) || 0;
      const isGraphDocumentFile = await fileContainsGraphDocument(file);
      cursor.push({ kind: "file", name: fileName, file, path: (file.webkitRelativePath || file.name), modifiedAt, createdAt: modifiedAt, isGraphDocumentFile });
    }

    return sortFolderTreeNodes(root);
  }
  async function openFolderTree(event) {
    if (folderPicker.supportsDesktopFolderPicker?.()) {
      let selectedPath = "";
      try {
        selectedPath = await Neutralino.os.showFolderDialog("Select a folder");
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Neutralino folder picker error:", error);
        alert("Unable to open the desktop folder picker. Restart the desktop app and try again.");
        return;
      }
      try {
        await openFolderTreeFromNeutralinoPath(selectedPath);
      } catch (error) {
        console.error("Neutralino folder open error:", error);
        alert("Unable to load this folder: " + (error?.message || error || "Unknown error"));
      }
      return;
    }

    if (folderPicker.shouldUseNativeDirectoryPicker(event)) {
      let showedFolderLoadingState = false;
      try {
        const dirHandle = await window.showDirectoryPicker();
        activeFolderName = dirHandle && dirHandle.name ? dirHandle.name : "Graph View";
        activeFolderHandle = dirHandle || null;
        activeFolderPath = null;
        renderFolderLoadingState?.(`Loading ${activeFolderName}...`);
        showedFolderLoadingState = true;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const nodes = await listMarkdownTree(dirHandle);
        folderMarkdownFiles = await collectMarkdownFilesFromTree(nodes);
        renderFolderTree(nodes);
        rememberRecentFolder({ name: activeFolderName, label: activeFolderName, handle: dirHandle });
        await promptActiveSavedGraphForCurrentFolder?.();
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (showedFolderLoadingState) renderFolderLoadingError?.("Unable to load this folder.");
        console.warn("Directory picker unavailable, using browser folder input.", error);
      }
    }

    if (folderInput) {
      if (!shownFolderInputFallbackNotice) {
        console.info(folderPicker.getFolderPickerFallbackMessage());
        shownFolderInputFallbackNotice = true;
      }
      folderInput.click();
    } else {
      alert("Folder selection is not supported in this environment.");
    }
  }



      bindFolderTreeRootDragListeners();
      bindFolderTreeKeyboardListeners();

      Object.assign(api, {
        createFileContextMenuButton,
        createTagsContextSubmenu,
        renderTagsContextSubmenu,
        getSidebarNodeSource,
        getSidebarNodeClipboardPath,
        readSidebarNodeContent,
        writeSidebarNodeContent,
        sidebarNodeMatchesSnapshotFile,
        updateGraphSnapshotsForSidebarFileTagChange,
        updateOpenMarkdownTabsForSidebarNode,
        setSidebarNodeTags,
        setSidebarFolderTag,
        ensureActiveGraphTagGroup,
        getSidebarFolderTagsAppliedToAll,
        runWithTemporaryEditorContent,
        exportMarkdownContent,
        exportHtmlContent,
        exportPdfContent,
        getSidebarNodeFilesystemPath,
        copySidebarContextText,
        hideSidebarFileContextMenu,
        hideSidebarFolderContextMenu,
        hideSidebarClosedFolderContextMenu,
        hideSidebarContextMenus,
        positionSidebarContextMenu,
        positionSidebarFileContextMenu,
        positionSidebarFolderContextMenu,
        positionSidebarClosedFolderContextMenu,
        getOpenFolderMainMenuButton,
        getOpenFolderActionLabel,
        getOpenFolderActionTitle,
        getPathDirectory,
        getRenamedSiblingPath,
        validateSidebarRenameName,
        promptSidebarRename,
        promptSidebarNewFileName,
        promptSidebarNewFolderName,
        updateTabsAfterSidebarFileRename,
        stripMarkdownExtension,
        splitMarkdownLinkSuffix,
        getRelativePathBetweenFiles,
        getRenameReferenceTargetPath,
        updateMarkdownRenameLinks,
        writeFolderMarkdownEntryContent,
        getEntryContent,
        updateOpenTabsAfterMarkdownLinkRename,
        updateOpenFolderLinksAfterSidebarRename,
        replacePathPrefix,
        getPathRelativeToFolder,
        renameGraphSnapshotPathReferences,
        updateGraphTabConfigAfterNodeRename,
        updateGraphTabsAfterPathRename,
        getSidebarRenamePathMappings,
        updateTabsAfterSidebarFolderRename,
        sidebarFileExists,
        createSidebarFileOnDisk,
        createSidebarFolderOnDisk,
        renameSidebarNodeOnDisk,
        ensureSidebarFileContextMenu,
        isOpenFolderRootContextNode,
        getOpenFolderRootContextNode,
        getSidebarFolderClipboardPath,
        getSidebarFolderFilesystemPath,
        getSidebarFolderGraphTitle,
        getSidebarMarkdownFileEntry,
        getOpenFolderMarkdownFilesForGraph,
        getSidebarFileGraphNodeId,
        logSidebarFileGraph,
        failSidebarFileGraph,
        openSidebarFileGraphView,
        logSidebarFullGraph,
        failSidebarFullGraph,
        openSidebarFileFullGraphView,
        collectMarkdownFilesForSidebarFolder,
        openSidebarFolderGraphView,
        exportSidebarFolderToGraph,
        revealSidebarFolder,
        openSidebarFolderCodeConverter,
        deleteSidebarFolder,
        refreshOpenFolderTreeFromContextMenu,
        expandSidebarFolderBranch,
        cancelFolderTreeBranchExpansion,
        ensureSidebarFolderContextMenu,
        showSidebarFileContextMenu,
        showSidebarFolderContextMenu,
        ensureSidebarClosedFolderContextMenu,
        showSidebarClosedFolderContextMenu,
        handleFolderTreeRootContextMenu,
        handleFolderTreeRootClick,
        clearSidebarTreeSelection,
        handleSidebarSelectionClick,
        applySidebarSelectionStateToElement,
        getFolderTreeChildrenContainer,
        renderFolderTreeLazyChildren,
        resetFolderTreeAnimation,
        finishFolderTreeAnimation,
        prefersReducedFolderTreeMotion,
        toggleFolderTreeDetails,
        getFileIconClass,
        getFileLanguageClass,
        setJavaProjectMarkerMode,
        setMavenModulePaths,
        setGradleModulePaths,
        setJavaSourceRootPaths,
        renderFolderTreeNode,
        updateSavedGraphFileInFolderTree,
        updateSavedDocumentFileInFolderTree,
        createFilesystemTreeNode,
        readFolderTreeDirectChildrenFromDisk,
        readFolderTreeRecursiveEntriesFromDisk,
        revealFolderTreeFileByPath,
        upsertCreatedPathInFolderTree,
        reconcileFolderTreeParentFromDisk,
        markDerivedRootsDirty,
        updateModifiedPathInFolderTree,
        removeDeletedPathFromFolderTree,
        updateRenamedPathInFolderTree,
        findTabForSidebarFile,
        buildTreeFromFileList,
        openFolderTree
      });
    }

    app.registerModule?.("sidebarContextTree", api);
    return api;
  };
})(window);
