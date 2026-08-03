(function(global, document) {
  "use strict";

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent !== undefined) element.textContent = textContent;
    return element;
  }

  function getShortUrl(url) {
    const text = String(url || "");
    try {
      const parsed = new URL(text);
      return `${parsed.host}${parsed.pathname || "/"}`;
    } catch (_error) {
      return text || "No URL";
    }
  }

  function getHistoryStatus(entry) {
    if (entry?.error) return "Error";
    const statusCode = Number(entry?.result?.response?.statusCode || entry?.statusCode || 0);
    return statusCode ? String(statusCode) : "No status";
  }

  function applyMethodChip(chip, method) {
    const normalizedMethod = String(method || "GET").trim().toUpperCase();
    chip.textContent = normalizedMethod === "OPTIONS" ? "OPTS" : normalizedMethod;
    chip.classList.add(`api-client-method-${normalizedMethod.toLowerCase()}`);
  }

  /**
   * Render and manage the API Client sidebar tree and compact history list.
   */
  function registerMarkdownViewerApiClientSidebar(app, deps = {}) {
    const panel = deps.panel || document.getElementById("api-client-sidebar-panel");
    const savedTree = deps.savedTree || document.getElementById("api-client-saved-tree");
    const historyList = deps.historyList || document.getElementById("api-client-sidebar-history");
    const importButton = deps.importButton || panel?.querySelector?.(".api-client-sidebar-import-postman");
    const exportButton = deps.exportButton || panel?.querySelector?.(".api-client-sidebar-export-postman");
    const toggleFoldersButton = deps.toggleFoldersButton || panel?.querySelector?.(".api-client-sidebar-toggle-folders");
    const newFolderButton = deps.newFolderButton || panel?.querySelector?.(".api-client-sidebar-new-folder");
    const filterInput = deps.filterInput || panel?.querySelector?.(".api-client-sidebar-filter-input");
    const savedTabButton = deps.savedTabButton || panel?.querySelector?.(".api-client-sidebar-tab-saved");
    const historyTabButton = deps.historyTabButton || panel?.querySelector?.(".api-client-sidebar-tab-history");
    const environmentTabButton = deps.environmentTabButton || panel?.querySelector?.(".api-client-sidebar-tab-environments");
    const savedSection = deps.savedSection || panel?.querySelector?.(".api-client-saved-section");
    const historySection = deps.historySection || panel?.querySelector?.(".api-client-history-section");
    const historyDeleteButton = deps.historyDeleteButton || historySection?.querySelector?.(".api-client-history-delete-selected");
    const environmentSection = deps.environmentSection || panel?.querySelector?.(".api-client-environments-section");
    const environmentList = deps.environmentList || panel?.querySelector?.(".api-client-environment-list");
    const globalVariables = deps.globalVariables || panel?.querySelector?.(".api-client-global-variables");
    const environmentVariables = deps.environmentVariables || panel?.querySelector?.(".api-client-environment-variables");
    const newEnvironmentButton = deps.newEnvironmentButton || panel?.querySelector?.(".api-client-sidebar-new-environment");
    const handlers = {
      onNewFolder: null,
      onImportCollection: null,
      onExportCollection: null,
      onNewRequest: null,
      onSelectRequest: null,
      onOpenRequest: null,
      onOpenHistory: null,
      onSelectHistory: null,
      onDeleteHistoryEntry: null,
      onClearHistory: null,
      onRenameNode: null,
      onDeleteNode: null,
      onMoveRequest: null,
      onNewEnvironment: null,
      onRenameEnvironment: null,
      onDeleteEnvironment: null,
      onSelectEnvironment: null,
      onChangeGlobals: null,
      onChangeEnvironmentVariables: null,
      onConfirmDeleteVariable: null
    };
    const collapsedFolderIds = new Set();
    const knownFolderIds = new Set();
    let filterText = String(filterInput?.value || "").trim().toLowerCase();
    let lastRenderState = {};
    let draggingRequestId = "";
    let pointerDragState = null;
    let suppressTreeClickNodeId = "";
    let selectedSavedNodeIds = new Set();
    let savedSelectionAnchorId = "";
    let selectedHistoryEntryKeys = new Set();
    let historySelectionAnchorKey = "";
    let visibleHistoryEntries = [];
    let allHistoryEntries = [];

    function bind(nextHandlers = {}) {
      Object.assign(handlers, nextHandlers);
    }

    function renderEmpty(target, message) {
      if (!target) return;
      target.textContent = "";
      target.appendChild(createElement("div", "api-client-sidebar-empty", message));
    }

    function isTreeActionEvent(event) {
      return Boolean(event.target?.closest?.(".api-client-tree-action"));
    }

    function setRowSelectionState(row, selected) {
      row?.classList?.toggle?.("selected", selected);
      if (selected) row?.setAttribute?.("aria-selected", "true");
      else row?.removeAttribute?.("aria-selected");
    }

    function renderSavedSelectionState() {
      savedTree?.querySelectorAll?.(".api-client-tree-row")?.forEach?.((row) => {
        setRowSelectionState(row, selectedSavedNodeIds.has(row.dataset?.nodeId || ""));
      });
    }

    function getSelectedSavedNodes() {
      const selectedNodes = [];
      const collect = (nodes) => (nodes || []).forEach((node) => {
        if (selectedSavedNodeIds.has(node.id)) selectedNodes.push(node);
        if (node.type === "folder") collect(node.children);
      });
      collect(lastRenderState.collection?.root?.children);
      return selectedNodes;
    }

    function getVisibleSavedNodes() {
      const nodes = [];
      const visit = (element) => {
        if (!element || element.hidden) return;
        if (element._apiClientNode) nodes.push(element._apiClientNode);
        (element.children || []).forEach(visit);
      };
      (savedTree?.children || []).forEach(visit);
      return nodes;
    }

    function notifySavedSelection(primaryNode) {
      lastRenderState = { ...lastRenderState, selectedNodeId: primaryNode?.id || "", selectedNodeIds: Array.from(selectedSavedNodeIds) };
      handlers.onSelectRequest?.(primaryNode || null, getSelectedSavedNodes());
    }

    function selectSavedNode(event, node) {
      if (!node?.id) return;
      const isRangeSelection = event?.shiftKey === true;
      const isToggleSelection = event?.ctrlKey === true || event?.metaKey === true;
      const visibleNodes = getVisibleSavedNodes();
      const targetIndex = visibleNodes.findIndex((candidate) => candidate.id === node.id);
      const anchorIndex = visibleNodes.findIndex((candidate) => candidate.id === savedSelectionAnchorId);
      if (isRangeSelection && anchorIndex >= 0 && targetIndex >= 0) {
        selectedSavedNodeIds = new Set(visibleNodes.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1).map((candidate) => candidate.id));
      } else if (isToggleSelection) {
        if (selectedSavedNodeIds.has(node.id)) selectedSavedNodeIds.delete(node.id);
        else selectedSavedNodeIds.add(node.id);
        savedSelectionAnchorId = node.id;
      } else {
        selectedSavedNodeIds = new Set([node.id]);
        savedSelectionAnchorId = node.id;
      }
      renderSavedSelectionState();
      const selectedNodes = getSelectedSavedNodes();
      const primaryNode = selectedSavedNodeIds.has(node.id) ? node : selectedNodes[selectedNodes.length - 1] || null;
      notifySavedSelection(primaryNode);
    }

    function selectOnlySavedNode(node) {
      selectedSavedNodeIds = new Set(node?.id ? [node.id] : []);
      savedSelectionAnchorId = node?.id || "";
      renderSavedSelectionState();
      notifySavedSelection(node || null);
    }

    function getSelectedHistoryEntries() {
      return allHistoryEntries.filter((item) => selectedHistoryEntryKeys.has(item.key));
    }

    function updateHistoryDeleteButton() {
      if (!historyDeleteButton) return;
      const selectedCount = getSelectedHistoryEntries().length;
      historyDeleteButton.disabled = selectedCount === 0;
      historyDeleteButton.title = selectedCount > 1 ? `Delete ${selectedCount} selected history entries` : "Delete selected history entry";
      historyDeleteButton.setAttribute?.("aria-label", historyDeleteButton.title);
    }

    function renderHistorySelectionState() {
      historyList?.querySelectorAll?.(".api-client-sidebar-history-row")?.forEach?.((row) => {
        setRowSelectionState(row, selectedHistoryEntryKeys.has(row.dataset?.historyEntryKey || ""));
      });
      updateHistoryDeleteButton();
    }

    function selectHistoryEntry(event, item) {
      const targetIndex = visibleHistoryEntries.findIndex((candidate) => candidate.key === item.key);
      const anchorIndex = visibleHistoryEntries.findIndex((candidate) => candidate.key === historySelectionAnchorKey);
      if (event?.shiftKey === true && anchorIndex >= 0 && targetIndex >= 0) {
        selectedHistoryEntryKeys = new Set(visibleHistoryEntries.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1).map((candidate) => candidate.key));
      } else if (event?.ctrlKey === true || event?.metaKey === true) {
        if (selectedHistoryEntryKeys.has(item.key)) selectedHistoryEntryKeys.delete(item.key);
        else selectedHistoryEntryKeys.add(item.key);
        historySelectionAnchorKey = item.key;
      } else {
        selectedHistoryEntryKeys = new Set([item.key]);
        historySelectionAnchorKey = item.key;
      }
      renderHistorySelectionState();
      lastRenderState = { ...lastRenderState, selectedHistoryEntryKeys: Array.from(selectedHistoryEntryKeys) };
      handlers.onSelectHistory?.(getSelectedHistoryEntries());
    }

    function clearDropTargets() {
      savedTree?.classList?.remove?.("api-client-saved-drop-target");
      savedTree?.querySelectorAll?.(".api-client-drop-target")?.forEach?.((target) => target.classList?.remove?.("api-client-drop-target"));
    }

    function findSavedRowByNodeId(nodeId) {
      return Array.from(savedTree?.querySelectorAll?.(".api-client-tree-row") || []).find((row) => row.dataset?.nodeId === nodeId) || null;
    }

    function getRootDropTarget() {
      return { folderId: "root", target: savedTree?.querySelector?.(".api-client-root-drop-target") || savedTree };
    }

    function getParentDropTarget(parentId) {
      const folderId = parentId || "root";
      if (folderId === "root") return getRootDropTarget();
      return { folderId, target: findSavedRowByNodeId(folderId) || savedTree };
    }

    function getPointerDropTarget(event) {
      const element = document.elementFromPoint?.(event.clientX, event.clientY) || event.target;
      const rootDropTarget = element?.closest?.(".api-client-root-drop-target");
      if (rootDropTarget) return { folderId: "root", target: rootDropTarget };
      const folderRow = element?.closest?.(".api-client-folder-row");
      if (selectedSavedNodeIds.has(folderRow?.dataset?.nodeId || "")) return null;
      if (folderRow?.dataset?.nodeId) return { folderId: folderRow.dataset.nodeId, target: folderRow };
      const requestRow = element?.closest?.(".api-client-request-row");
      if (requestRow?.dataset?.parentId) return getParentDropTarget(requestRow.dataset.parentId);
      const folderChildren = element?.closest?.(".api-client-tree-folder-children");
      if (folderChildren?.dataset?.parentId) return getParentDropTarget(folderChildren.dataset.parentId);
      if (savedTree && (element === savedTree || savedTree.contains?.(element))) return { folderId: "root", target: savedTree };
      return null;
    }

    function updatePointerDropTarget(event) {
      clearDropTargets();
      const target = getPointerDropTarget(event);
      if (target?.folderId === "root" && target.target === savedTree) savedTree?.classList?.add?.("api-client-saved-drop-target");
      else target?.target?.classList?.add?.("api-client-drop-target");
      return target;
    }

    function getNodeDragLabel(node) {
      if (node?.type === "folder") return node.name || "Folder";
      const method = String(node?.method || "").toUpperCase();
      const name = node?.name || getShortUrl(node?.url);
      return method ? `${method} ${name}` : name;
    }

    function updateDragPreview(event) {
      const preview = pointerDragState?.preview;
      if (!preview) return;
      preview.style.left = `${Number(event.clientX || 0) + 12}px`;
      preview.style.top = `${Number(event.clientY || 0) + 12}px`;
    }

    function ensureDragPreview(event) {
      if (pointerDragState?.preview || !document.body) return;
      const nodeTypeClass = pointerDragState.node?.type === "folder" ? "api-client-folder-row" : "api-client-request-row";
      const dragLabel = pointerDragState.nodes.length > 1 ? `${pointerDragState.nodes.length} selected items` : getNodeDragLabel(pointerDragState.node);
      const preview = createElement("div", `api-client-drag-preview api-client-tree-row ${nodeTypeClass}`, dragLabel);
      const rowWidth = pointerDragState.row?.getBoundingClientRect?.().width;
      if (rowWidth) preview.style.width = `${Math.min(Math.max(rowWidth, 160), 320)}px`;
      preview.setAttribute?.("aria-hidden", "true");
      document.body.appendChild(preview);
      pointerDragState.preview = preview;
      updateDragPreview(event);
    }

    function removeDragPreview() {
      const preview = pointerDragState?.preview;
      if (!preview) return;
      preview.parentNode?.removeChild?.(preview);
      pointerDragState.preview = null;
    }
    function finishPointerDrag(event) {
      if (!pointerDragState) return;
      const state = pointerDragState;
      const target = state.dragging ? updatePointerDropTarget(event) : null;
      removeDragPreview();
      pointerDragState = null;
      document.removeEventListener?.("pointermove", handlePointerMove);
      document.removeEventListener?.("pointerup", finishPointerDrag);
      document.removeEventListener?.("pointercancel", finishPointerDrag);
      state.row.classList.remove("api-client-request-dragging");
      clearDropTargets();
      draggingRequestId = "";
      if (state.dragging) suppressTreeClickNodeId = state.node.id;
      if (target?.folderId) handlers.onMoveRequest?.(state.nodes, target.folderId);
    }

    function handlePointerMove(event) {
      if (!pointerDragState) return;
      const deltaX = Number(event.clientX || 0) - pointerDragState.startX;
      const deltaY = Number(event.clientY || 0) - pointerDragState.startY;
      if (!pointerDragState.dragging && Math.hypot(deltaX, deltaY) < 4) return;
      if (!pointerDragState.dragging) {
        if (!selectedSavedNodeIds.has(pointerDragState.node.id)) selectOnlySavedNode(pointerDragState.node);
        pointerDragState.nodes = getSelectedSavedNodes();
      }
      pointerDragState.dragging = true;
      draggingRequestId = pointerDragState.node.id;
      pointerDragState.row.classList.add("api-client-request-dragging");
      ensureDragPreview(event);
      updateDragPreview(event);
      event.preventDefault?.();
      event.stopPropagation?.();
      updatePointerDropTarget(event);
    }

    function startNodePointerDrag(event, node, row) {
      if (isTreeActionEvent(event) || event.button > 0) return;
      pointerDragState = { node, nodes: [], row, startX: Number(event.clientX || 0), startY: Number(event.clientY || 0), dragging: false, preview: null };
      document.addEventListener?.("pointermove", handlePointerMove);
      document.addEventListener?.("pointerup", finishPointerDrag);
      document.addEventListener?.("pointercancel", finishPointerDrag);
    }

    function preventNativeRequestDrag(event) {
      event.preventDefault?.();
    }

    function setSidebarTab(tabName) {
      const activeTab = tabName === "history" || tabName === "environments" ? tabName : "saved";
      if (savedSection) savedSection.hidden = activeTab !== "saved";
      if (historySection) historySection.hidden = activeTab !== "history";
      if (environmentSection) environmentSection.hidden = activeTab !== "environments";
      savedTabButton?.classList?.toggle?.("active", activeTab === "saved");
      historyTabButton?.classList?.toggle?.("active", activeTab === "history");
      environmentTabButton?.classList?.toggle?.("active", activeTab === "environments");
      savedTabButton?.setAttribute?.("aria-selected", String(activeTab === "saved"));
      historyTabButton?.setAttribute?.("aria-selected", String(activeTab === "history"));
      environmentTabButton?.setAttribute?.("aria-selected", String(activeTab === "environments"));
    }

    function matchesFilterText(value) {
      return !filterText || String(value || "").toLowerCase().includes(filterText);
    }

    function requestMatchesFilter(request) {
      return matchesFilterText(`${request?.method || ""} ${request?.name || ""} ${request?.url || ""}`);
    }

    function filterSavedNode(node) {
      if (!filterText) return node;
      if (node?.type !== "folder") return requestMatchesFilter(node) ? node : null;
      const children = (node.children || []).map(filterSavedNode).filter(Boolean);
      if (matchesFilterText(node.name)) return node;
      return children.length ? { ...node, children } : null;
    }

    function getDisplaySavedNodes(nodes) {
      return [...(nodes || [])].sort((left, right) => {
        const leftIsFolder = left?.type === "folder";
        const rightIsFolder = right?.type === "folder";
        if (leftIsFolder === rightIsFolder) return 0;
        return leftIsFolder ? -1 : 1;
      });
    }

    function registerCollapsedFoldersByDefault(node) {
      if (!node || node.type !== "folder") return;
      if (!knownFolderIds.has(node.id)) {
        knownFolderIds.add(node.id);
        collapsedFolderIds.add(node.id);
      }
      (node.children || []).forEach(registerCollapsedFoldersByDefault);
    }

    function collectFolderIds(nodes, folderIds = []) {
      (nodes || []).forEach((node) => {
        if (node?.type !== "folder") return;
        folderIds.push(node.id);
        collectFolderIds(node.children || [], folderIds);
      });
      return folderIds;
    }

    function getCurrentFolderIds() {
      return collectFolderIds(lastRenderState.collection?.root?.children || []);
    }

    function expandSelectedFolderAncestors(nodes, selectedId) {
      if (!selectedId) return false;
      let containsSelected = false;
      (nodes || []).forEach((node) => {
        if (!node) return;
        if (node.id === selectedId) containsSelected = true;
        if (node.type === "folder") {
          const childContainsSelected = expandSelectedFolderAncestors(node.children || [], selectedId);
          if (childContainsSelected) {
            collapsedFolderIds.delete(node.id);
            containsSelected = true;
          }
        }
      });
      return containsSelected;
    }

    function updateToggleFoldersButton() {
      if (!toggleFoldersButton) return;
      const folderIds = getCurrentFolderIds();
      const hasFolders = folderIds.length > 0;
      const allCollapsed = hasFolders && folderIds.every((id) => collapsedFolderIds.has(id));
      const label = allCollapsed ? "Expand all folders" : "Collapse all folders";
      toggleFoldersButton.disabled = !hasFolders;
      toggleFoldersButton.title = label;
      toggleFoldersButton.setAttribute("aria-label", label);
      toggleFoldersButton.setAttribute("aria-disabled", String(!hasFolders));
      const icon = toggleFoldersButton.querySelector?.("i");
      if (icon) icon.className = `bi ${allCollapsed ? "bi-arrows-expand" : "bi-arrows-collapse"}`;
    }

    function toggleAllFolders() {
      const folderIds = getCurrentFolderIds();
      if (!folderIds.length) return;
      const allCollapsed = folderIds.every((id) => collapsedFolderIds.has(id));
      folderIds.forEach((id) => {
        if (allCollapsed) collapsedFolderIds.delete(id);
        else collapsedFolderIds.add(id);
      });
      render(lastRenderState);
    }
    function historyEntryMatchesFilter(entry) {
      const elapsedMs = entry?.result?.elapsedMs ?? entry?.elapsedMs;
      const request = entry?.request || entry || {};
      return matchesFilterText(`${request.method || ""} ${request.url || ""} ${getHistoryStatus(entry)} ${elapsedMs != null ? `${elapsedMs} ms` : ""}`);
    }

    function environmentMatchesFilter(environment) {
      const variables = (environment?.variables || []).map((variable) => `${variable.key || ""} ${variable.initialValue || ""} ${variable.currentValue || ""}`).join(" ");
      return matchesFilterText(`${environment?.name || ""} ${variables}`);
    }

    function readVariableRow(row) {
      return {
        enabled: row.querySelector?.(".api-client-variable-enabled")?.checked !== false,
        key: row.querySelector?.(".api-client-variable-key")?.value || "",
        type: row.querySelector?.(".api-client-variable-type")?.value || "default",
        initialValue: row.querySelector?.(".api-client-variable-initial")?.value || "",
        currentValue: row.querySelector?.(".api-client-variable-current")?.value || ""
      };
    }

    function collectVariableRows(table) {
      return Array.from(table?.querySelectorAll?.(".api-client-variable-row") || []).map(readVariableRow).filter((row) => row.key || row.initialValue || row.currentValue);
    }

    function renderVariableTable(target, variables, onChange, options = {}) {
      if (!target) return;
      target.textContent = "";
      const toolbar = createElement("div", "api-client-variable-toolbar");
      const addVariableButton = createElement("button", "api-client-variable-add", "+ Variable");
      addVariableButton.type = "button";
      const addSecretButton = createElement("button", "api-client-variable-add", "+ Secret");
      addSecretButton.type = "button";
      toolbar.append(addVariableButton, addSecretButton);
      target.appendChild(toolbar);

      const table = createElement("table", "api-client-variable-table");
      table.innerHTML = `<thead><tr><th></th><th>Variable</th><th>Type</th><th>Initial value</th><th>Current value</th><th></th></tr></thead>`;
      const tbody = createElement("tbody");
      const notifyChange = () => onChange?.(collectVariableRows(table));
      const addVariableRow = (variable, rowOptions = {}) => {
        const row = createElement("tr", "api-client-variable-row");
        const enabledCell = createElement("td", "api-client-variable-check-cell");
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "api-client-variable-enabled";
        enabled.checked = variable.enabled !== false;
        enabledCell.appendChild(enabled);

        const keyCell = createElement("td");
        const keyInput = document.createElement("input");
        keyInput.className = "api-client-variable-key";
        keyInput.placeholder = "name";
        keyInput.value = variable.key || "";
        keyCell.appendChild(keyInput);

        const typeCell = createElement("td");
        const typeSelect = document.createElement("select");
        typeSelect.className = "api-client-variable-type";
        ["default", "secret"].forEach((type) => {
          const option = document.createElement("option");
          option.value = type;
          option.textContent = type === "secret" ? "Secret" : "Default";
          typeSelect.appendChild(option);
        });
        typeSelect.value = variable.type === "secret" ? "secret" : "default";
        typeCell.appendChild(typeSelect);

        const initialCell = createElement("td");
        const initialInput = document.createElement("input");
        initialInput.className = "api-client-variable-initial";
        initialInput.value = variable.initialValue || "";
        initialInput.placeholder = "Initial";
        initialCell.appendChild(initialInput);

        const currentCell = createElement("td");
        const currentInput = document.createElement("input");
        currentInput.className = "api-client-variable-current";
        currentInput.value = variable.currentValue || "";
        currentInput.placeholder = "Current";
        currentInput.type = typeSelect.value === "secret" ? "password" : "text";
        currentCell.appendChild(currentInput);

        const actionCell = createElement("td", "api-client-variable-action-cell");
        const revealButton = createElement("button", "api-client-variable-action", "");
        revealButton.type = "button";
        revealButton.title = "Reveal value";
        revealButton.setAttribute("aria-label", "Reveal value");
        revealButton.innerHTML = `<i class="bi bi-eye" aria-hidden="true"></i>`;
        revealButton.hidden = typeSelect.value !== "secret";
        revealButton.addEventListener("click", (event) => {
          event.stopPropagation();
          currentInput.type = currentInput.type === "password" ? "text" : "password";
        });
        const deleteButton = createElement("button", "api-client-variable-action", "");
        deleteButton.type = "button";
        deleteButton.title = "Delete variable";
        deleteButton.setAttribute("aria-label", "Delete variable");
        deleteButton.innerHTML = `<i class="bi bi-trash" aria-hidden="true"></i>`;
        deleteButton.addEventListener("click", async (event) => {
          event.stopPropagation();
          const shouldDelete = typeof options.onConfirmDelete === "function"
            ? await options.onConfirmDelete(readVariableRow(row))
            : true;
          if (!shouldDelete) return;
          row.parentNode?.removeChild?.(row);
          notifyChange();
        });
        actionCell.append(revealButton, deleteButton);

        [enabled, keyInput, typeSelect, initialInput, currentInput].forEach((input) => {
          input.addEventListener("input", notifyChange);
          input.addEventListener("change", () => {
            currentInput.type = typeSelect.value === "secret" ? "password" : "text";
            revealButton.hidden = typeSelect.value !== "secret";
            notifyChange();
          });
        });

        row.append(enabledCell, keyCell, typeCell, initialCell, currentCell, actionCell);
        tbody.appendChild(row);
        if (rowOptions.focusKey) keyInput.focus?.();
      };
      (variables || []).forEach((variable) => addVariableRow(variable));
      addVariableButton.addEventListener("click", () => addVariableRow({ enabled: true, key: "", type: "default", initialValue: "", currentValue: "" }, { focusKey: true }));
      addSecretButton.addEventListener("click", () => addVariableRow({ enabled: true, key: "", type: "secret", initialValue: "", currentValue: "" }, { focusKey: true }));
      table.appendChild(tbody);
      target.appendChild(table);
    }

    function renderFolder(folder, depth, selectedId, parentId = "root") {
      const wrapper = createElement("div", "api-client-tree-folder");
      const row = createElement("div", "api-client-tree-row api-client-folder-row");
      const childrenWrapper = createElement("div", "api-client-tree-folder-children");
      const isCollapsed = !filterText && collapsedFolderIds.has(folder.id);
      row.style.setProperty("--api-client-depth", String(depth));
      row.dataset.nodeId = folder.id;
      row.dataset.nodeType = "folder";
      row.dataset.parentId = parentId;
      childrenWrapper.dataset.parentId = folder.id;
      row.classList.toggle("collapsed", isCollapsed);
      row._apiClientNode = folder;
      setRowSelectionState(row, selectedSavedNodeIds.has(folder.id) || (!selectedSavedNodeIds.size && folder.id === selectedId));
      childrenWrapper.hidden = isCollapsed;

      const button = createElement("button", "api-client-tree-main", "");
      button.type = "button";
      button.title = folder.name;
      button.setAttribute("aria-expanded", String(!isCollapsed));
      button.innerHTML = `<i class="bi ${isCollapsed ? "bi-folder" : "bi-folder2-open"} api-client-folder-toggle" aria-hidden="true"></i><span></span>`;
      const folderIcon = button.querySelector(".api-client-folder-toggle");
      button.querySelector("span").textContent = folder.name;
      folderIcon.title = isCollapsed ? "Expand folder" : "Collapse folder";
      const toggleFolder = () => {
        const shouldCollapse = !collapsedFolderIds.has(folder.id);
        if (shouldCollapse) collapsedFolderIds.add(folder.id);
        else collapsedFolderIds.delete(folder.id);
        childrenWrapper.hidden = shouldCollapse;
        row.classList.toggle("collapsed", shouldCollapse);
        button.setAttribute("aria-expanded", String(!shouldCollapse));
        folderIcon.title = shouldCollapse ? "Expand folder" : "Collapse folder";
        folderIcon.className = `bi ${shouldCollapse ? "bi-folder" : "bi-folder2-open"} api-client-folder-toggle`;
      };
      folderIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFolder();
      });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectSavedNode(event, folder);
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) toggleFolder();
      });

      const newRequestButton = createElement("button", "api-client-tree-action", "");
      newRequestButton.type = "button";
      newRequestButton.title = "New request";
      newRequestButton.setAttribute("aria-label", "New request in folder");
      newRequestButton.innerHTML = `<i class="bi bi-plus-lg" aria-hidden="true"></i>`;
      newRequestButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onNewRequest?.(folder);
      });

      const renameButton = createElement("button", "api-client-tree-action", "");
      renameButton.type = "button";
      renameButton.title = "Rename";
      renameButton.setAttribute("aria-label", "Rename folder");
      renameButton.innerHTML = `<i class="bi bi-pencil" aria-hidden="true"></i>`;
      renameButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onRenameNode?.(folder);
      });

      const deleteButton = createElement("button", "api-client-tree-action", "");
      deleteButton.type = "button";
      deleteButton.title = "Delete";
      deleteButton.setAttribute("aria-label", "Delete folder");
      deleteButton.innerHTML = `<i class="bi bi-trash" aria-hidden="true"></i>`;
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!selectedSavedNodeIds.has(folder.id)) selectOnlySavedNode(folder);
        handlers.onDeleteNode?.(getSelectedSavedNodes());
      });

      row.addEventListener("click", (event) => {
        if (isTreeActionEvent(event)) return;
        if (suppressTreeClickNodeId === folder.id) {
          suppressTreeClickNodeId = "";
          return;
        }
        selectSavedNode(event, folder);
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) toggleFolder();
      });

      row.addEventListener("pointerdown", (event) => startNodePointerDrag(event, folder, row));
      button.addEventListener("pointerdown", (event) => startNodePointerDrag(event, folder, row));
      button.addEventListener("dragstart", preventNativeRequestDrag);
      row.addEventListener("dragstart", preventNativeRequestDrag);

      row.append(button, newRequestButton, renameButton, deleteButton);
      wrapper.appendChild(row);
      getDisplaySavedNodes(folder.children).forEach((child) => childrenWrapper.appendChild(renderNode(child, depth + 1, selectedId, folder.id)));
      wrapper.appendChild(childrenWrapper);
      return wrapper;
    }

    function renderRequest(request, depth, selectedId, parentId = "root") {
      const row = createElement("div", "api-client-tree-row api-client-request-row");
      row.style.setProperty("--api-client-depth", String(depth));
      row.dataset.nodeId = request.id;
      row.dataset.nodeType = "request";
      row.dataset.parentId = parentId;
      row._apiClientNode = request;
      setRowSelectionState(row, selectedSavedNodeIds.has(request.id) || (!selectedSavedNodeIds.size && request.id === selectedId));

      const button = createElement("button", "api-client-tree-main", "");
      button.type = "button";
      button.title = `${request.method} ${request.url}`;
      button.innerHTML = `<span class="api-client-method-chip"></span><span class="api-client-request-name"></span>`;
      applyMethodChip(button.querySelector(".api-client-method-chip"), request.method);
      button.querySelector(".api-client-request-name").textContent = request.name || getShortUrl(request.url);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectSavedNode(event, request);
      });
      button.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        handlers.onOpenRequest?.(request);
      });


      const renameButton = createElement("button", "api-client-tree-action", "");
      renameButton.type = "button";
      renameButton.title = "Rename";
      renameButton.setAttribute("aria-label", "Rename request");
      renameButton.innerHTML = `<i class="bi bi-pencil" aria-hidden="true"></i>`;
      renameButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onRenameNode?.(request);
      });

      const deleteButton = createElement("button", "api-client-tree-action", "");
      deleteButton.type = "button";
      deleteButton.title = "Delete";
      deleteButton.setAttribute("aria-label", "Delete request");
      deleteButton.innerHTML = `<i class="bi bi-trash" aria-hidden="true"></i>`;
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!selectedSavedNodeIds.has(request.id)) selectOnlySavedNode(request);
        handlers.onDeleteNode?.(getSelectedSavedNodes());
      });

      row.addEventListener("click", (event) => {
        if (isTreeActionEvent(event)) return;
        if (suppressTreeClickNodeId === request.id) {
          suppressTreeClickNodeId = "";
          return;
        }
        selectSavedNode(event, request);
      });
      row.addEventListener("pointerdown", (event) => startNodePointerDrag(event, request, row));
      button.addEventListener("pointerdown", (event) => startNodePointerDrag(event, request, row));
      button.addEventListener("dragstart", preventNativeRequestDrag);
      row.addEventListener("dragstart", preventNativeRequestDrag);
      row.addEventListener("dblclick", (event) => {
        if (isTreeActionEvent(event)) return;
        handlers.onOpenRequest?.(request);
      });

      row.append(button, renameButton, deleteButton);
      return row;
    }

    function renderNode(node, depth, selectedId, parentId = "root") {
      if (node?.type === "folder") return renderFolder(node, depth, selectedId, parentId);
      return renderRequest(node || {}, depth, selectedId, parentId);
    }

    function renderCollections(collection, selectedId) {
      if (!savedTree) return;
      savedTree.textContent = "";
      (collection?.root?.children || []).forEach(registerCollapsedFoldersByDefault);
      expandSelectedFolderAncestors(collection?.root?.children || [], selectedId);
      const children = collection?.root?.children || [];
      if (!children.length) {
        renderEmpty(savedTree, "No saved requests yet.");
        updateToggleFoldersButton();
        return;
      }
      const visibleChildren = filterText ? children.map(filterSavedNode).filter(Boolean) : children;
      if (!visibleChildren.length) {
        renderEmpty(savedTree, "No matching saved requests.");
        updateToggleFoldersButton();
        return;
      }
      const rootDropTarget = createElement("div", "api-client-root-drop-target", "\\");
      rootDropTarget.dataset.parentId = "root";
      savedTree.appendChild(rootDropTarget);
      getDisplaySavedNodes(visibleChildren).forEach((node) => savedTree.appendChild(renderNode(node, 0, selectedId, "root")));
      updateToggleFoldersButton();
    }

    function renderHistory(history, historyEntryKeys = []) {
      if (!historyList) return;
      historyList.textContent = "";
      allHistoryEntries = [];
      visibleHistoryEntries = [];
      if (!history?.length) {
        renderEmpty(historyList, "No calls yet.");
        updateHistoryDeleteButton();
        return;
      }
      const toolbar = createElement("div", "api-client-history-toolbar");
      const clearButton = createElement("button", "api-client-history-clear", "");
      clearButton.type = "button";
      clearButton.title = "Clear history";
      clearButton.setAttribute("aria-label", "Clear history");
      clearButton.innerHTML = `<i class="bi bi-trash" aria-hidden="true"></i>`;
      clearButton.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers.onClearHistory?.();
      });
      toolbar.appendChild(clearButton);
      historyList.appendChild(toolbar);
      allHistoryEntries = history.map((entry, index) => ({ entry, index, key: String(historyEntryKeys[index] || entry?.historyEntryKey || index) }));
      const visibleHistory = allHistoryEntries.filter(({ entry }) => !filterText || historyEntryMatchesFilter(entry));
      visibleHistoryEntries = visibleHistory;
      if (!visibleHistory.length) {
        renderEmpty(historyList, "No matching calls.");
        updateHistoryDeleteButton();
        return;
      }
      visibleHistory.forEach((historyItem) => {
        const { entry, index, key } = historyItem;
        const row = createElement("div", "api-client-sidebar-history-row");
        row.dataset.historyEntryKey = key;
        setRowSelectionState(row, selectedHistoryEntryKeys.has(key));
        const item = createElement("button", "api-client-sidebar-history-item");
        item.type = "button";
        item.title = entry?.request?.url || entry?.url || "";
        item.innerHTML = `<span class="api-client-method-chip"></span><span class="api-client-history-url"></span><small></small>`;
        applyMethodChip(item.querySelector(".api-client-method-chip"), entry?.request?.method || entry?.method);
        item.querySelector(".api-client-history-url").textContent = getShortUrl(entry?.request?.url || entry?.url);
        const elapsedMs = entry?.result?.elapsedMs ?? entry?.elapsedMs;
        item.querySelector("small").textContent = `${getHistoryStatus(entry)}${elapsedMs != null ? ` ֲ· ${elapsedMs} ms` : ""}`;
        item.addEventListener("click", (event) => selectHistoryEntry(event, historyItem));
        item.addEventListener("dblclick", () => handlers.onOpenHistory?.(entry, index));
        row.append(item);
        historyList.appendChild(row);
      });
      updateHistoryDeleteButton();
    }

    function renderEnvironmentSelector(environmentsDocument) {
      if (!environmentList) return;
      environmentList.textContent = "";
      const environments = environmentsDocument?.environments || [];
      const activeEnvironment = environments.find((environment) => environment.id === environmentsDocument?.activeEnvironmentId) || null;
      const toolbar = createElement("div", "api-client-environment-toolbar");
      const select = createElement("select", "api-client-sidebar-environment-select");
      const getSelectedEnvironment = () => environments.find((environment) => environment.id === select.value) || null;
      select.setAttribute("aria-label", "Environment to edit");
      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "No Environment";
      select.appendChild(noneOption);
      environments.forEach((environment) => {
        const option = document.createElement("option");
        option.value = environment.id;
        option.textContent = environment.name;
        select.appendChild(option);
      });
      select.value = activeEnvironment ? activeEnvironment.id : "";
      select.addEventListener("change", () => {
        renameButton.disabled = !getSelectedEnvironment();
        deleteButton.disabled = !getSelectedEnvironment();
        handlers.onSelectEnvironment?.(select.value);
      });
      const actions = createElement("div", "api-client-environment-actions");
      const createButton = createElement("button", "folder-tree-tool-button api-client-sidebar-new-environment", "");
      createButton.type = "button";
      createButton.title = "New environment";
      createButton.setAttribute("aria-label", "New environment");
      createButton.innerHTML = `<i class="bi bi-plus-lg" aria-hidden="true"></i>`;
      createButton.addEventListener("click", () => handlers.onNewEnvironment?.());
      const renameButton = createElement("button", "folder-tree-tool-button api-client-sidebar-rename-environment", "");
      renameButton.type = "button";
      renameButton.title = "Rename environment";
      renameButton.setAttribute("aria-label", "Rename environment");
      renameButton.disabled = !activeEnvironment;
      renameButton.innerHTML = `<i class="bi bi-pencil" aria-hidden="true"></i>`;
      renameButton.addEventListener("click", () => {
        const selectedEnvironment = getSelectedEnvironment();
        if (selectedEnvironment) handlers.onRenameEnvironment?.(selectedEnvironment);
      });
      const deleteButton = createElement("button", "folder-tree-tool-button api-client-sidebar-delete-environment", "");
      deleteButton.type = "button";
      deleteButton.title = "Delete environment";
      deleteButton.setAttribute("aria-label", "Delete environment");
      deleteButton.disabled = !activeEnvironment;
      deleteButton.innerHTML = `<i class="bi bi-trash" aria-hidden="true"></i>`;
      deleteButton.addEventListener("click", () => {
        const selectedEnvironment = getSelectedEnvironment();
        if (selectedEnvironment) handlers.onDeleteEnvironment?.(selectedEnvironment);
      });
      actions.append(createButton, renameButton, deleteButton);
      toolbar.append(select, actions);
      environmentList.appendChild(toolbar);
    }

    function renderEnvironments(environmentsDocument) {
      const documentState = environmentsDocument || { activeEnvironmentId: "", globals: [], environments: [] };
      const activeEnvironment = (documentState.environments || []).find((environment) => environment.id === documentState.activeEnvironmentId) || null;
      renderVariableTable(globalVariables, documentState.globals || [], handlers.onChangeGlobals, { onConfirmDelete: handlers.onConfirmDeleteVariable });
      renderEnvironmentSelector(documentState);
      if (environmentVariables) {
        if (activeEnvironment) renderVariableTable(environmentVariables, activeEnvironment.variables || [], (variables) => handlers.onChangeEnvironmentVariables?.(activeEnvironment.id, variables), { onConfirmDelete: handlers.onConfirmDeleteVariable });
        else renderEmpty(environmentVariables, "Select or create an environment to edit variables.");
      }
    }

    function render(state = {}) {
      lastRenderState = state;
      selectedSavedNodeIds = new Set((state.selectedNodeIds || (state.selectedNodeId ? [state.selectedNodeId] : [])).map(String));
      selectedHistoryEntryKeys = new Set((state.selectedHistoryEntryKeys || []).map(String));
      renderCollections(state.collection, state.selectedNodeId || "");
      renderHistory(state.history || [], state.historyEntryKeys || []);
      renderEnvironments(state.environments);
    }

    importButton?.addEventListener("click", () => handlers.onImportCollection?.());
    exportButton?.addEventListener("click", () => handlers.onExportCollection?.());
    toggleFoldersButton?.addEventListener("click", toggleAllFolders);
    newFolderButton?.addEventListener("click", () => handlers.onNewFolder?.());
    newEnvironmentButton?.addEventListener("click", () => handlers.onNewEnvironment?.());
    historyDeleteButton?.addEventListener("click", () => handlers.onDeleteHistoryEntry?.(getSelectedHistoryEntries()));
    filterInput?.addEventListener("input", () => {
      filterText = String(filterInput.value || "").trim().toLowerCase();
      render(lastRenderState);
    });
    savedTabButton?.addEventListener("click", () => setSidebarTab("saved"));
    historyTabButton?.addEventListener("click", () => setSidebarTab("history"));
    environmentTabButton?.addEventListener("click", () => setSidebarTab("environments"));
    setSidebarTab("saved");

    const api = { bind, render, getShortUrl, getHistoryStatus };
    app?.registerModule?.("apiClientSidebar", api);
    return api;
  }

  global.registerMarkdownViewerApiClientSidebar = registerMarkdownViewerApiClientSidebar;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerApiClientSidebar };
  }
})(typeof window !== "undefined" ? window : globalThis, document);
