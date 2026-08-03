(function() {
  "use strict";

  /** Register the scope and confirmation workflow for line-delimiter conversion. */
  window.registerMarkdownViewerLineDelimiterDialog = function registerMarkdownViewerLineDelimiterDialog(app, deps) {
    const scopeModal = document.getElementById("line-delimiter-scope-modal");
    const confirmModal = document.getElementById("line-delimiter-confirm-modal");
    const scopeStatus = document.getElementById("line-delimiter-scope-status");
    const scopeCurrent = document.getElementById("line-delimiter-scope-current");
    const scopeFolder = document.getElementById("line-delimiter-scope-folder");
    const folderTree = document.getElementById("line-delimiter-folder-tree");
    const folderSelected = document.getElementById("line-delimiter-folder-selected");
    const includeSubfolders = document.getElementById("line-delimiter-include-subfolders");
    const extensionsInput = document.getElementById("line-delimiter-extensions");
    const reviewButton = document.getElementById("line-delimiter-review");
    const tree = document.getElementById("line-delimiter-confirm-tree");
    const selectedCount = document.getElementById("line-delimiter-selected-count");
    const applyButton = document.getElementById("line-delimiter-apply");
    let requestedDelimiter = "\n";
    let currentPlan = null;
    let currentWorkspacePath = "";
    let selectedFolderPath = "";

    function setModalVisible(modal, visible) {
      modal.style.display = visible ? "flex" : "none";
      modal.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function comparablePath(path) {
      return normalizePath(path).toLowerCase();
    }

    function findOpenTab(path) {
      const key = comparablePath(path);
      return (deps.getTabs?.() || []).find((tab) => comparablePath(tab.sourceFilePath) === key) || null;
    }

    function getOpenFileContent(path) {
      const tab = findOpenTab(path);
      if (!tab) return null;
      return tab.id === deps.getActiveTabId?.() ? deps.activeEditorCommands.getActiveEditorValue() : tab.content;
    }

    function updateScopeAvailability() {
      const folderMode = scopeFolder.checked;
      folderTree.setAttribute("aria-disabled", folderMode ? "false" : "true");
      includeSubfolders.disabled = !folderMode;
    }

    function getFolderLabel(path) {
      const normalizedWorkspacePath = normalizePath(currentWorkspacePath);
      const normalizedPath = normalizePath(path);
      return normalizedPath === normalizedWorkspacePath ? ". (Workspace root)" : normalizedPath.slice(normalizedWorkspacePath.length + 1);
    }

    function updateSelectedFolder(path) {
      selectedFolderPath = normalizePath(path);
      folderSelected.textContent = getFolderLabel(selectedFolderPath);
      folderTree.querySelectorAll(".line-delimiter-folder-row").forEach((row) => {
        const selected = normalizePath(row.dataset.path) === selectedFolderPath;
        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    function makeFolderRow(path, depth, expanded) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "line-delimiter-folder-row";
      row.dataset.path = normalizePath(path);
      row.dataset.depth = String(depth);
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-expanded", expanded ? "true" : "false");
      row.style.setProperty("--folder-depth", depth);
      const toggle = document.createElement("span");
      toggle.className = "line-delimiter-folder-toggle";
      toggle.textContent = expanded ? "-" : "+";
      const icon = document.createElement("i");
      icon.className = expanded ? "bi bi-folder2-open" : "bi bi-folder2";
      const label = document.createElement("span");
      label.textContent = getFolderLabel(path).split("/").pop() || getFolderLabel(path);
      row.append(toggle, icon, label);
      row.addEventListener("click", async () => {
        updateSelectedFolder(path);
        if (row.dataset.loaded === "true") {
          toggleFolderRow(row);
          return;
        }
        await loadChildFolders(row);
      });
      return row;
    }

    function setFolderRowExpanded(row, expanded) {
      row.setAttribute("aria-expanded", expanded ? "true" : "false");
      row.querySelector(".line-delimiter-folder-toggle").textContent = expanded ? "-" : "+";
      row.querySelector("i").className = expanded ? "bi bi-folder2-open" : "bi bi-folder2";
    }

    function refreshFolderRowVisibility() {
      const collapsedDepths = [];
      folderTree.querySelectorAll(".line-delimiter-folder-row").forEach((row) => {
        const depth = Number(row.dataset.depth || 0);
        while (collapsedDepths.length && collapsedDepths[collapsedDepths.length - 1] >= depth) collapsedDepths.pop();
        row.hidden = collapsedDepths.length > 0;
        if (row.dataset.loaded === "true" && row.getAttribute("aria-expanded") === "false") collapsedDepths.push(depth);
      });
    }

    function toggleFolderRow(row) {
      const expanded = row.getAttribute("aria-expanded") !== "true";
      setFolderRowExpanded(row, expanded);
      refreshFolderRowVisibility();
    }

    async function loadChildFolders(row) {
      const folderPath = normalizePath(row.dataset.path);
      const depth = Number(row.dataset.depth || 0);
      row.dataset.loaded = "true";
      setFolderRowExpanded(row, true);
      const children = await deps.conversion.collectChildFolderPaths(folderPath);
      const fragment = document.createDocumentFragment();
      children.forEach((childPath) => fragment.appendChild(makeFolderRow(childPath, depth + 1, false)));
      row.after(fragment);
      refreshFolderRowVisibility();
      updateSelectedFolder(selectedFolderPath);
    }

    async function initializeFolderTree(workspacePath) {
      currentWorkspacePath = normalizePath(workspacePath);
      selectedFolderPath = currentWorkspacePath;
      folderTree.replaceChildren();
      if (!currentWorkspacePath) {
        folderSelected.textContent = ". (Workspace root)";
        return;
      }
      const rootRow = makeFolderRow(currentWorkspacePath, 0, true);
      folderTree.appendChild(rootRow);
      updateSelectedFolder(currentWorkspacePath);
      await loadChildFolders(rootRow);
    }

    async function open(delimiter) {
      requestedDelimiter = delimiter === "\r\n" ? "\r\n" : "\n";
      const workspacePath = deps.getWorkspacePath?.();
      const activeTab = deps.getActiveTab?.();
      const currentPath = activeTab?.sourceFilePath || "";
      scopeCurrent.disabled = !currentPath;
      scopeCurrent.checked = !!currentPath;
      scopeFolder.checked = !currentPath;
      scopeStatus.textContent = "Choose which files to review.";
      extensionsInput.value = deps.getDefaultExtensions?.() || "md, markdown, txt";
      updateScopeAvailability();
      try {
        await initializeFolderTree(workspacePath || "");
      } catch (error) {
        scopeStatus.textContent = "Unable to read workspace folders: " + (error.message || error);
      }
      setModalVisible(scopeModal, true);
      (scopeCurrent.checked ? scopeCurrent : scopeFolder).focus();
    }

    function buildTree(entries) {
      tree.replaceChildren();
      const root = {};
      entries.forEach((entry) => {
        const parts = entry.relativePath.split("/");
        let node = root;
        parts.forEach((part, index) => {
          node[part] ||= index === parts.length - 1 ? { __entry: entry } : {};
          node = node[part];
        });
      });

      function appendNodes(container, node, depth) {
        Object.keys(node).filter((key) => key !== "__entry").forEach((name) => {
          const value = node[name];
          const isFile = !!value.__entry;
          const row = document.createElement("label");
          row.className = `line-delimiter-tree-row ${isFile ? "is-file" : "is-folder"}`;
          row.style.setProperty("--tree-depth", depth);
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = true;
          checkbox.dataset.kind = isFile ? "file" : "folder";
          if (isFile) checkbox.dataset.path = value.__entry.absolutePath;
          const icon = document.createElement("i");
          icon.className = isFile ? "bi bi-file-earmark-text" : "bi bi-folder2";
          const text = document.createElement("span");
          text.textContent = name;
          row.append(checkbox, icon, text);
          container.appendChild(row);
          if (!isFile) {
            const children = document.createElement("div");
            children.className = "line-delimiter-tree-children";
            container.appendChild(children);
            appendNodes(children, value, depth + 1);
            checkbox.addEventListener("change", () => {
              children.querySelectorAll('input[type="checkbox"]').forEach((child) => {
                child.checked = checkbox.checked;
                child.indeterminate = false;
              });
              updateSelectionState();
            });
          }
          checkbox.addEventListener("change", updateSelectionState);
        });
      }
      appendNodes(tree, root, 0);
      updateSelectionState();
    }

    function updateSelectionState() {
      Array.from(tree.querySelectorAll('.line-delimiter-tree-row.is-folder input[data-kind="folder"]')).reverse().forEach((folderCheckbox) => {
        const children = folderCheckbox.closest("label").nextElementSibling;
        const descendants = Array.from(children?.querySelectorAll('input[data-kind="file"]') || []);
        const checkedCount = descendants.filter((checkbox) => checkbox.checked).length;
        folderCheckbox.checked = descendants.length > 0 && checkedCount === descendants.length;
        folderCheckbox.indeterminate = checkedCount > 0 && checkedCount < descendants.length;
      });
      const selected = tree.querySelectorAll('input[data-kind="file"]:checked').length;
      selectedCount.textContent = `${selected} file${selected === 1 ? "" : "s"} selected`;
      applyButton.disabled = selected === 0;
    }

    async function review() {
      const workspacePath = deps.getWorkspacePath?.();
      const activeTab = deps.getActiveTab?.();
      const currentFilePath = scopeCurrent.checked ? activeTab?.sourceFilePath : null;
      if (!workspacePath) {
        scopeStatus.textContent = "Open a workspace folder first.";
        return;
      }
      if (scopeCurrent.checked && !currentFilePath) {
        scopeStatus.textContent = "The focused editor is not backed by a workspace file.";
        return;
      }
      reviewButton.disabled = true;
      scopeStatus.textContent = "Inspecting files…";
      try {
        currentPlan = await deps.conversion.collectPlan({
          workspacePath,
          folderPath: scopeCurrent.checked ? workspacePath : selectedFolderPath,
          currentFilePath,
          includeSubfolders: includeSubfolders.checked,
          extensions: extensionsInput.value,
          delimiter: requestedDelimiter,
          getOpenFileContent
        });
        if (!currentPlan.entries.length) {
          scopeStatus.textContent = "No matching files need line-delimiter changes.";
          return;
        }
        buildTree(currentPlan.entries);
        setModalVisible(scopeModal, false);
        setModalVisible(confirmModal, true);
        applyButton.focus();
      } catch (error) {
        scopeStatus.textContent = error.message || String(error);
      } finally {
        reviewButton.disabled = false;
      }
    }

    function selectedPaths() {
      return Array.from(tree.querySelectorAll('input[data-kind="file"]:checked')).map((checkbox) => checkbox.dataset.path);
    }

    function showUnsavedPrompt(affectedCount) {
      const modal = document.getElementById("line-delimiter-unsaved-modal");
      const message = document.getElementById("line-delimiter-unsaved-message");
      message.textContent = `${affectedCount} selected open file${affectedCount === 1 ? " has" : "s have"} unsaved changes. Choose what to save before conversion.`;
      setModalVisible(modal, true);
      return new Promise((resolve) => {
        function finish(choice) {
          setModalVisible(modal, false);
          resolve(choice);
        }
        document.getElementById("line-delimiter-unsaved-cancel").onclick = () => finish("cancel");
        document.getElementById("line-delimiter-save-all").onclick = () => finish("save-all");
        document.getElementById("line-delimiter-save-affected").onclick = () => finish("save-affected");
        document.getElementById("line-delimiter-save-affected").focus();
      });
    }

    async function saveUnsavedAffectedTabs(paths) {
      const selected = new Set(paths.map(comparablePath));
      const affected = deps.getUnsavedTabs?.().filter((tab) => selected.has(comparablePath(tab.sourceFilePath))) || [];
      if (!affected.length) return true;
      const choice = await showUnsavedPrompt(affected.length);
      if (choice === "cancel") return false;
      if (choice === "save-all") {
        await deps.saveAllChangedTabs();
        return (deps.getUnsavedTabs?.() || []).length === 0;
      }
      for (const tab of affected) {
        if (!await deps.saveChangedTab(tab, { activateSaveDialog: true })) return false;
      }
      return !deps.getUnsavedTabs().some((tab) => selected.has(comparablePath(tab.sourceFilePath)));
    }

    function updateOpenTabs(entries) {
      entries.forEach((entry) => {
        const tab = findOpenTab(entry.absolutePath);
        if (!tab) return;
        tab.content = entry.convertedContent;
        tab.savedContent = entry.convertedContent;
        if (tab.id === deps.getActiveTabId?.()) deps.activeEditorCommands.setActiveEditorValue(entry.convertedContent);
      });
      deps.persistTabs?.();
    }

    async function apply() {
      const paths = selectedPaths();
      applyButton.disabled = true;
      if (!await saveUnsavedAffectedTabs(paths)) {
        applyButton.disabled = false;
        return;
      }
      deps.beforeApply?.();
      const result = await deps.conversion.applyPlan(currentPlan, paths);
      updateOpenTabs(result.converted);
      setModalVisible(confirmModal, false);
      deps.onApplied?.();
      const message = `Converted ${result.converted.length} file${result.converted.length === 1 ? "" : "s"}. ` +
        `Skipped ${result.skipped.length}. Failed ${result.failed.length}.`;
      deps.showResult?.(message);
      applyButton.disabled = false;
    }

    scopeCurrent.addEventListener("change", updateScopeAvailability);
    scopeFolder.addEventListener("change", updateScopeAvailability);
    reviewButton.addEventListener("click", review);
    applyButton.addEventListener("click", () => apply().catch((error) => {
      applyButton.disabled = false;
      deps.showResult?.("Line-delimiter conversion failed: " + (error.message || error));
    }));
    document.getElementById("line-delimiter-scope-cancel").addEventListener("click", () => setModalVisible(scopeModal, false));
    document.getElementById("line-delimiter-confirm-cancel").addEventListener("click", () => setModalVisible(confirmModal, false));
    document.querySelectorAll(".convert-line-delimiter").forEach((button) => {
      button.addEventListener("click", () => open(button.dataset.lineDelimiter === "crlf" ? "\r\n" : "\n"));
    });

    const api = { open };
    app.services.lineDelimiterDialog = api;
    app.registerModule?.("lineDelimiterDialog", api);
    return api;
  };
})();
