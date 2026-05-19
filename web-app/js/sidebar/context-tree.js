(function(global) {
  global.registerMarkdownViewerSidebarContextTree = function registerMarkdownViewerSidebarContextTree(app, deps) {
    const api = {};

    with (deps) {
  function createFileContextMenuButton(labelText, iconClass, tooltipText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "graph-context-menu-item graph-context-menu-tooltip";
    button.dataset.tooltip = tooltipText;
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "graph-context-menu-item-label";
    label.textContent = labelText;
    button.appendChild(icon);
    button.appendChild(label);
    return button;
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

    if (typeof options.onTagLocalGraph === "function") {
      const separator = document.createElement("div");
      separator.className = "graph-context-menu-separator";
      submenuPanel.appendChild(separator);

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
      submenuPanel.appendChild(button);
    }
  }

  function getSidebarNodeSource(node) {
    if (!node) return null;
    return {
      name: node.name,
      file: node.file || null,
      handle: node.handle || null,
      path: node.fullPath || node.path || null
    };
  }

  function getSidebarNodeClipboardPath(node) {
    if (!node) return "";
    return node.fullPath || node.path || node.name || "";
  }

  async function readSidebarNodeContent(node) {
    if (!node) throw new Error("No sidebar file was selected.");
    if (isNeutralinoRuntime() && node.fullPath) {
      return Neutralino.filesystem.readFile(node.fullPath);
    }
    if (node.file) return node.file.text();
    if (node.handle) {
      const file = await node.handle.getFile();
      return file.text();
    }
    throw new Error("No readable file was provided.");
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
    const changedGraphTabs = [];
    for (const tab of tabs) {
      if (tab?.type !== "graph" || !tab.graphSnapshot?.files) continue;
      let changed = false;
      tab.graphSnapshot.files.forEach((snapshotFile) => {
        if (!sidebarNodeMatchesSnapshotFile(node, snapshotFile)) return;
        snapshotFile.content = content;
        snapshotFile.tags = getFileTagsFromContent(content);
        changed = true;
      });
      if (!changed) continue;
      const currentSnapshot = tab.graphSnapshot;
      tab.graphSnapshot = await createGraphSnapshot(currentSnapshot.files || [], currentSnapshot.folderName || tab.folderName || tab.title);
      if (currentSnapshot.createdAt) tab.graphSnapshot.createdAt = currentSnapshot.createdAt;
      graphRenderCache.delete(tab.id);
      markGraphTabAsChanged(tab);
      changedGraphTabs.push(tab);
    }
    return changedGraphTabs;
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
      const matchesName = node.name && (tab.sourceFileName === node.name || tab.title === getMarkdownTitleFromFileName(node.name));
      if (!matchesHandle && !matchesPath && !matchesName) return;
      tab.content = normalizedContent;
      tab.savedContent = normalizedContent;
      if (tab.id === activeTabId) {
        markdownEditor.value = normalizedContent;
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

  function runWithTemporaryEditorContent(content, action) {
    const previousValue = markdownEditor.value;
    markdownEditor.value = content || "";
    try {
      action();
    } finally {
      markdownEditor.value = previousValue;
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
    if (node.fullPath) return node.fullPath;
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

  function hideSidebarFileContextMenu() {
    if (!sidebarFileContextMenu) return;
    sidebarFileContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarFolderContextMenu() {
    if (!sidebarFolderContextMenu) return;
    sidebarFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarClosedFolderContextMenu() {
    if (!sidebarClosedFolderContextMenu) return;
    sidebarClosedFolderContextMenu.classList.add("hidden");
    sidebarContextTarget = null;
  }

  function hideSidebarContextMenus() {
    hideSidebarFileContextMenu();
    hideSidebarFolderContextMenu();
    hideSidebarClosedFolderContextMenu();
  }

  function positionSidebarContextMenu(menu, event, fallbackHeight) {
    if (!menu) return;
    const menuWidth = menu.offsetWidth || 230;
    const menuHeight = menu.offsetHeight || fallbackHeight || 280;
    const left = Math.max(0, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const top = Math.max(0, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function positionSidebarFileContextMenu(event) {
    positionSidebarContextMenu(sidebarFileContextMenu, event, 320);
  }

  function positionSidebarFolderContextMenu(event) {
    positionSidebarContextMenu(sidebarFolderContextMenu, event, 250);
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
    if (kind === "file" && !isSidebarDocumentPath(value)) {
      return "File names must end in .md, .markdown, .mdviewer-graph.json, .mdgraph.json, or .json.";
    }
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

  function promptSidebarNewFileName(parentNode) {
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

      if (title) title.textContent = `New file in ${parentNode?.name || "folder"}`;
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
        markdownEditor.value = normalizedContent;
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

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.writeFile) {
        alert("Creating files is available only in the desktop app for folders opened from disk.");
        return;
      }
      const filePath = joinPath(parentPath, fileName);
      await Neutralino.filesystem.writeFile(filePath, "");
    } else if (node.handle && typeof node.handle.getFileHandle === "function") {
      const fileHandle = await node.handle.getFileHandle(fileName, { create: true });
      if (!fileHandle || typeof fileHandle.createWritable !== "function") {
        alert("Creating files from the folder tree requires write access to the opened folder.");
        return;
      }
      const writable = await fileHandle.createWritable();
      await writable.write("");
      await writable.close();
    } else {
      alert("Creating files from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
  }

  async function createSidebarFolderOnDisk(node) {
    if (!node || node.kind !== "directory") return;
    const folderName = await promptSidebarNewFolderName(node);
    if (!folderName) return;

    if (isNeutralinoRuntime()) {
      const parentPath = getSidebarFolderFilesystemPath(node);
      if (!parentPath || !Neutralino.filesystem?.createDirectory) {
        alert("Creating folders is available only in the desktop app for folders opened from disk.");
        return;
      }
      await Neutralino.filesystem.createDirectory(joinPath(parentPath, folderName));
    } else if (node.handle && typeof node.handle.getDirectoryHandle === "function") {
      await node.handle.getDirectoryHandle(folderName, { create: true });
    } else {
      alert("Creating folders from the folder tree is available in the desktop app or in browsers when the folder was opened with write access.");
      return;
    }

    await reloadOpenFolderTree();
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

    try {
      await reloadOpenFolderTree();
    } catch (error) {
      console.warn(`Renamed ${kind}, but failed to refresh the folder tree:`, error);
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
    const revealFileBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open the file's folder in the system file explorer and select this file when supported."
    );
    const showFullGraphBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.showFullGraph?.label || "Show full graph",
      CONTEXT_MENU_ACTIONS.showFullGraph?.icon || CONTEXT_MENU_ACTIONS.showFullNetwork?.icon || "bi bi-diagram-3",
      "Open a graph view with every recursive incoming and outgoing Markdown connection for this file."
    );
    showFullGraphBtn.classList.add("sidebar-show-full-graph");
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
    const copyContentBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyContent.label,
      CONTEXT_MENU_ACTIONS.copyContent.icon,
      "Copy the entire content of this file to the clipboard."
    );
    copySubmenuPanel.appendChild(copyPathBtn);
    copySubmenuPanel.appendChild(copyContentBtn);
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
    deleteFileBtn.classList.add("graph-context-menu-item-danger");

    const exportSubmenu = document.createElement("div");
    exportSubmenu.className = "graph-context-menu-submenu";
    const exportSubmenuBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.export.label,
      CONTEXT_MENU_ACTIONS.export.icon,
      "Open export actions for this file."
    );
    exportSubmenuBtn.setAttribute("aria-haspopup", "true");
    const exportSubmenuArrow = document.createElement("span");
    exportSubmenuArrow.className = "graph-context-menu-submenu-arrow";
    exportSubmenuArrow.textContent = "›";
    exportSubmenuBtn.appendChild(exportSubmenuArrow);
    const exportSubmenuPanel = document.createElement("div");
    exportSubmenuPanel.className = "graph-context-menu-submenu-panel";
    const exportMarkdownBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportMarkdown.label, CONTEXT_MENU_ACTIONS.exportMarkdown.icon, "Download this file as Markdown.");
    const exportHtmlBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportHtml.label, CONTEXT_MENU_ACTIONS.exportHtml.icon, "Download this file as HTML.");
    const exportPdfBtn = createFileContextMenuButton(CONTEXT_MENU_ACTIONS.exportPdf.label, CONTEXT_MENU_ACTIONS.exportPdf.icon, "Download this file as PDF.");
    [exportMarkdownBtn, exportHtmlBtn, exportPdfBtn].forEach((button) => exportSubmenuPanel.appendChild(button));
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
      openDefaultAppBtn,
      revealFileBtn,
      showFullGraphBtn,
      renameFileBtn,
      tagsSubmenu,
      copySubmenu,
      shareFileBtn,
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
      hideSidebarFileContextMenu();
      if (!target) return;
      try {
        await openDocumentSourceFile({ ...getSidebarNodeSource(target), content: await readSidebarNodeContent(target) });
        rememberRecentFile(getSidebarNodeSource(target));
      } catch (error) {
        console.error("Failed to open sidebar context file:", error);
        alert("Unable to open selected file.");
      }
    });

    openDefaultAppBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
        alert("Opening with the default app is available only in the desktop app for files opened from disk.");
        return;
      }
      try {
        await Neutralino.os.open(filePath);
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
        if (typeof NL_OS !== "undefined" && NL_OS === "Windows" && Neutralino.os?.execCommand) {
          const windowsPath = filePath.replace(/"/g, "").replace(/\//g, "\\");
          await Neutralino.os.execCommand(`explorer.exe /select,"${windowsPath}"`);
        } else if (Neutralino.os?.open) {
          const normalized = filePath.replace(/\\/g, "/");
          const folderPath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : normalized;
          await Neutralino.os.open(folderPath);
        } else {
          throw new Error("No supported reveal command is available.");
        }
      } catch (error) {
        console.error("Failed to reveal sidebar file:", error);
        alert("Unable to reveal this file in the file explorer.");
      }
    });

    showFullGraphBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFileContextMenu();
      try {
        await openSidebarFileFullGraphView(target);
      } catch (error) {
        console.error("Failed to open sidebar file full graph:", error);
        alert("Unable to open a full graph for this file.");
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

    deleteFileBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      const filePath = getSidebarNodeFilesystemPath(target);
      hideSidebarFileContextMenu();
      if (!filePath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
        alert("Deleting files is available only in the desktop app for files opened from disk.");
        return;
      }
      const confirmed = typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()
        ? true
        : window.confirm(`Delete "${target.name}" from disk? This action cannot be undone.`);
      if (!confirmed) return;
      try {
        await Neutralino.filesystem.remove(filePath);
        closeTabsForDeletedPath(filePath, { kind: "file", targetHandle: target.handle || null });
        await refreshOpenFolderTreeAfterFileDelete(filePath);
      } catch (error) {
        console.error("Failed to delete sidebar file:", error);
        alert("Unable to delete this file.");
      }
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
    if ((folderMarkdownFiles || []).length) return folderMarkdownFiles;
    if (!(currentFolderTreeNodes || []).length) return [];
    folderMarkdownFiles = isNeutralinoRuntime()
      ? await collectMarkdownFilesFromTreeNeutralino(currentFolderTreeNodes)
      : await collectMarkdownFilesFromTree(currentFolderTreeNodes);
    return folderMarkdownFiles;
  }

  function getSidebarFileGraphNodeId(node, files) {
    const matchingEntry = getSidebarMarkdownFileEntry(node, files);
    if (matchingEntry) {
      return matchingEntry.id || normalizeGraphNodeName(matchingEntry.path || matchingEntry.fullPath || matchingEntry.file?.webkitRelativePath || matchingEntry.file?.name || matchingEntry.name || "");
    }
    return normalizeGraphNodeName(node?.path || node?.file?.webkitRelativePath || node?.fullPath || node?.name || "");
  }

  function logSidebarFullGraph(message, details = {}) {
    console.info("[Sidebar full graph]", message, details);
  }

  function failSidebarFullGraph(message, details = {}) {
    console.warn("[Sidebar full graph]", message, details);
    alert(message);
  }

  async function openSidebarFileFullGraphView(node) {
    logSidebarFullGraph("Requested full graph from tree context menu.", {
      nodeName: node?.name || "",
      nodePath: node?.path || "",
      nodeFullPath: node?.fullPath || "",
      nodeKind: node?.kind || "",
      activeFolderName,
      activeFolderPath
    });

    if (!node || node.kind !== "file") {
      failSidebarFullGraph("Unable to open a full graph because no sidebar file is selected.", {
        nodeKind: node?.kind || "",
        nodeName: node?.name || ""
      });
      return;
    }

    const nodeGraphPath = node.name || node.path || node.fullPath || "";
    if (!isMarkdownPath(nodeGraphPath)) {
      failSidebarFullGraph("Show full graph is available only for Markdown files.", {
        nodeGraphPath
      });
      return;
    }

    const files = await getOpenFolderMarkdownFilesForGraph();
    if (!files.length) {
      failSidebarFullGraph("Open a folder first to build a full graph for this file.", {
        currentFolderTreeNodeCount: (currentFolderTreeNodes || []).length,
        folderMarkdownFileCount: (folderMarkdownFiles || []).length
      });
      return;
    }

    const focusNodeId = getSidebarFileGraphNodeId(node, files);
    if (!focusNodeId) {
      failSidebarFullGraph("Unable to match this file to a graph point.", {
        nodeName: node.name || "",
        nodePath: node.path || "",
        nodeFullPath: node.fullPath || "",
        markdownFileCount: files.length
      });
      return;
    }

    const graphTitle = `Full Graph: ${node.name || focusNodeId}`;
    const scopeSeed = `${activeFolderPath || activeFolderName || "folder"}:${getSidebarNodeClipboardPath(node) || focusNodeId}`;
    const graphScopeKey = createFolderGraphScopeKey("sidebar-file-full-graph", scopeSeed);
    if (focusExistingFolderGraphTab(graphScopeKey, graphTitle)) {
      logSidebarFullGraph("Focused an existing full graph tab.", {
        graphScopeKey,
        graphTitle,
        focusNodeId
      });
      return;
    }

    if (tabs.length >= 20) {
      failSidebarFullGraph("Maximum of 20 tabs reached. Please close an existing tab to open a new one.", {
        tabCount: tabs.length
      });
      return;
    }

    const graphSnapshot = await createGraphSnapshot(files, activeFolderName || "Graph View");
    const snapshotNodeIds = new Set((graphSnapshot.nodes || []).map((graphNode) => graphNode.id));
    if (!snapshotNodeIds.has(focusNodeId)) {
      failSidebarFullGraph("Unable to find this file in the current folder graph.", {
        focusNodeId,
        snapshotNodeCount: snapshotNodeIds.size,
        markdownFileCount: files.length
      });
      return;
    }

    const graphTab = createGraphTab(graphTitle, {
      graphSnapshot,
      graphScopeKey,
      graphViewConfig: {
        mode: "full-network",
        focusNodeId,
        hiddenNodeIds: []
      }
    });
    if (!graphTab) {
      failSidebarFullGraph("Unable to create the full graph tab.", {
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
    logSidebarFullGraph("Opened full graph tab.", {
      graphTitle,
      graphScopeKey,
      focusNodeId,
      snapshotNodeCount: snapshotNodeIds.size,
      markdownFileCount: files.length
    });
  }

  async function collectMarkdownFilesForSidebarFolder(node) {
    if (!node || node.kind !== "directory") return [];
    const parentPath = node.path || node.name || "";
    if (isNeutralinoRuntime()) {
      return collectMarkdownFilesFromTreeNeutralino(node.children || [], parentPath);
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

    if (tabs.length >= 20) {
      alert('Maximum of 20 tabs reached. Please close an existing tab to open a new one.');
      return;
    }

    const folderFiles = await collectMarkdownFilesForSidebarFolder(node);
    if (!folderFiles.length) {
      alert("This folder does not contain Markdown files to graph.");
      return;
    }

    const graphSnapshot = await createGraphSnapshot(folderFiles, folderName);
    const graphTab = createGraphTab(folderName, { graphSnapshot, graphScopeKey });
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

  async function revealSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.os?.open) {
      alert("Revealing folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    await Neutralino.os.open(folderPath);
  }

  async function deleteSidebarFolder(node) {
    const folderPath = getSidebarFolderFilesystemPath(node);
    if (!folderPath || !isNeutralinoRuntime() || !Neutralino.filesystem?.remove) {
      alert("Deleting folders is available only in the desktop app for folders opened from disk.");
      return;
    }
    const confirmed = typeof shouldConfirmDeleteFiles === "function" && !shouldConfirmDeleteFiles()
      ? true
      : window.confirm(`Delete folder "${node.name}" and its contents from disk? This action cannot be undone.`);
    if (!confirmed) return;
    await Neutralino.filesystem.remove(folderPath);
    closeTabsForDeletedPath(folderPath, { kind: "folder" });
    if (isOpenFolderRootContextNode(node)) {
      closeFolderTree();
    } else {
      await reloadOpenFolderTree();
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
    const refreshFolderTreeBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.refresh.label,
      CONTEXT_MENU_ACTIONS.refresh.icon,
      "Reload the open folder tree from disk to show file system changes."
    );
    const revealFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.label,
      CONTEXT_MENU_ACTIONS.revealInFileExplorer.icon,
      "Open this folder in the system file explorer."
    );
    const copyPathBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.copyPath.label,
      CONTEXT_MENU_ACTIONS.copyPath.icon,
      "Copy this folder path to the clipboard."
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
    const deleteFolderBtn = createFileContextMenuButton(
      CONTEXT_MENU_ACTIONS.deleteFolder.label,
      CONTEXT_MENU_ACTIONS.deleteFolder.icon,
      "Delete this folder and its contents from disk after confirmation."
    );
    const deleteFolderSeparator = document.createElement("div");
    deleteFolderSeparator.className = "graph-context-menu-separator";
    renameFolderBtn.dataset.sidebarFolderAction = "rename";
    deleteFolderBtn.dataset.sidebarFolderAction = "delete";
    deleteFolderSeparator.dataset.sidebarFolderAction = "delete";
    deleteFolderBtn.classList.add("graph-context-menu-item-danger");

    [
      title,
      separator,
      revealFolderBtn,
      renameFolderBtn,
      copyPathBtn,
      newFileBtn,
      newFolderBtn,
      showGraphBtn,
      exportFolderToGraphBtn,
      refreshFolderTreeBtn,
      deleteFolderSeparator,
      deleteFolderBtn
    ].forEach((item) => menu.appendChild(item));
    document.body.appendChild(menu);

    refreshFolderTreeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      hideSidebarFolderContextMenu();
      try {
        const refreshed = await reloadOpenFolderTree();
        if (!refreshed) {
          alert("Unable to refresh the folder tree because no reusable folder source is available. Please reopen the folder.");
        }
      } catch (error) {
        console.error("Failed to refresh folder tree:", error);
        alert("Unable to refresh the folder tree.");
      }
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

    deleteFolderBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const target = sidebarContextTarget;
      hideSidebarFolderContextMenu();
      try {
        await deleteSidebarFolder(target);
      } catch (error) {
        console.error("Failed to delete sidebar folder:", error);
        alert("Unable to delete this folder.");
      }
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
    const menu = ensureSidebarFileContextMenu();
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = node.name || "File";
    const tagsSubmenu = menu.querySelector(".tags-context-submenu");
    const tagsSubmenuPanel = menu.querySelector(".tags-context-submenu-panel");
    const showFullGraphBtn = menu.querySelector(".sidebar-show-full-graph");
    const canManageTags = isMarkdownPath(node.name || node.path || node.fullPath || "");
    if (showFullGraphBtn) showFullGraphBtn.classList.toggle("hidden", !canManageTags);
    if (tagsSubmenu) tagsSubmenu.classList.toggle("hidden", !canManageTags);
    if (canManageTags) {
      const renderSidebarTags = (currentTags) => {
        renderTagsContextSubmenu(tagsSubmenuPanel, currentTags, async (tag, shouldAdd) => {
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
        });
      };
      renderSidebarTags(getFolderTreeNodeTags(node));
      readSidebarNodeContent(node)
        .then((content) => renderSidebarTags(getFileTagsFromContent(content)))
        .catch((error) => console.warn("Failed to refresh sidebar context tag checks:", error));
    }
    menu.classList.remove("hidden");
    positionSidebarFileContextMenu(event);
  }

  function showSidebarFolderContextMenu(event, node) {
    if (!node || node.kind !== "directory") return;
    event.preventDefault();
    event.stopPropagation();
    hideSidebarFileContextMenu();
    sidebarContextTarget = node;
    const menu = ensureSidebarFolderContextMenu();
    const isRootContext = isOpenFolderRootContextNode(node);
    const title = menu.querySelector(".graph-context-menu-title");
    if (title) title.textContent = isRootContext ? (activeFolderName || "Folder") : (node.name || "Folder");
    menu.querySelectorAll('[data-sidebar-folder-action="rename"], [data-sidebar-folder-action="delete"]').forEach((item) => {
      item.classList.toggle("hidden", isRootContext);
    });
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
    const openFolderButton = targetElement?.closest(".folder-tree-open-folder-button");
    if (!openFolderButton || isFolderOpen) return;
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
  }

  function prefersReducedFolderTreeMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function toggleFolderTreeDetails(details) {
    const childrenContainer = getFolderTreeChildrenContainer(details);
    if (!childrenContainer || prefersReducedFolderTreeMotion()) {
      resetFolderTreeAnimation(details, childrenContainer);
      details.open = !details.open;
      updateFolderTreeExpandToggleButtons();
      return;
    }

    const shouldExpand = !details.open || details.classList.contains("is-collapsing");
    resetFolderTreeAnimation(details, childrenContainer);

    if (shouldExpand) {
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
        updateFolderTreeExpandToggleButtons();
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
      updateFolderTreeExpandToggleButtons();
    }, 220);
    folderTreeAnimationTimers.set(details, timer);
  }

  function getFileIconClass(fileName, options = {}) {
    if (options.isUnsupportedFile) return "bi-file-earmark-x";
    if (options.isGraphFile || isGraphFilePath(fileName)) return "bi-diagram-3";
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

  function renderFolderTreeNode(node, parentPath = "") {
    const li = document.createElement("li");
    li.className = "folder-tree-item";
    if (node.kind === "directory") {
      const currentPath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
      node.path = currentPath;
      const details = document.createElement("details");
      details.open = true;
      const summary = document.createElement("summary");
      summary.className = "folder-tree-label";
      const icon = document.createElement("i");
      icon.className = "bi bi-folder";
      const label = document.createElement("span");
      label.textContent = node.name;
      summary.appendChild(icon);
      summary.appendChild(label);
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFolderTreeDetails(details);
      });
      summary.addEventListener("contextmenu", (event) => showSidebarFolderContextMenu(event, node));
      details.appendChild(summary);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-tree-children";
      const ul = document.createElement("ul");
      ul.className = "folder-tree-list";
      node.children.forEach((child) => ul.appendChild(renderFolderTreeNode(child, currentPath)));
      childrenContainer.appendChild(ul);
      details.appendChild(childrenContainer);
      li.appendChild(details);
      return li;
    }

    const button = document.createElement("button");
    let sidebarOpenClickTimer = null;
    const isGraphFile = isGraphFilePath(node.name) || node.isGraphDocumentFile === true;
    const isJsonFile = isJsonPath(node.name);
    const isUnsupportedFile = !isSupportedFolderTreeDocumentNode(node);
    const canOpenAsTextFile = isSidebarDocumentNode(node);
    button.type = "button";
    button.className = "folder-tree-file"
      + (isGraphFile ? " folder-tree-graph-file" : "")
      + (isUnsupportedFile ? " folder-tree-unsupported-file" : "");
    button.title = isUnsupportedFile
      ? (canOpenAsTextFile
        ? "Click to preview this text file; double-click to keep open"
        : "Unsupported files are hidden by default and shown here only because unsupported files are enabled")
      : (isGraphFile ? "Click to open graph" : "Click to preview in the text editor; double-click to keep open");
    button.dataset.name = node.name || "";
    button.dataset.path = node.path || "";
    button.dataset.fullPath = node.fullPath || "";
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

      if (!node.handle?.getFile) throw new Error("No readable file handle is available.");
      const file = node.file ? node.file : await node.handle.getFile();
      return file.text();
    }

    function getSidebarFileSource() {
      return {
        name: node.name,
        file: node.file || null,
        handle: node.handle || null,
        path: getSidebarNodeFilesystemPath(node) || node.fullPath || node.path || null
      };
    }

    async function openSidebarFile(options) {
      try {
        const existingTab = findTabForSidebarFile(node);
        if (existingTab) {
          switchTab(existingTab.id);
          if (options && options.temporary === false) {
            pinTemporaryTab(existingTab.id);
          }
          rememberRecentFile(getSidebarFileSource());
          return;
        }

        const content = await readSidebarFileContent();
        const sourceFile = getSidebarFileSource();
        if (isGraphFile || isJsonFile) {
          const openedTab = await openDocumentSourceFile({ ...sourceFile, content });
          if (openedTab && options && options.temporary === false) {
            pinTemporaryTab(openedTab.id);
          }
        } else {
          const title = getMarkdownTitleFromFileName(node.name);
          if (options && options.temporary === false) {
            openSidebarFileInPermanentTab(content, title, sourceFile);
          } else {
            openSidebarFileInTemporaryTab(content, title, sourceFile);
          }
        }
        rememberRecentFile(sourceFile);
      } catch (error) {
        console.error("Failed to open sidebar file:", error);
        alert("Unable to open selected file.");
      }
    }

    if (canOpenAsTextFile) {
      button.addEventListener("click", () => {
        window.clearTimeout(sidebarOpenClickTimer);
        sidebarOpenClickTimer = window.setTimeout(() => {
          openSidebarFile({ temporary: true });
        }, 200);
      });

      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        window.clearTimeout(sidebarOpenClickTimer);
        openSidebarFile({ temporary: false });
      });
    }

    button.addEventListener("contextmenu", (event) => {
      window.clearTimeout(sidebarOpenClickTimer);
      showSidebarFileContextMenu(event, node);
    });

    li.appendChild(button);
    return li;
  }

  function findTabForSidebarFile(node) {
    if (!node || node.kind !== "file") return null;

    if (node.handle) {
      const handleMatch = tabs.find(function(tab) {
        return tab.sourceFileHandle === node.handle;
      });
      if (handleMatch) return handleMatch;
    }

    const nodePath = node.fullPath || node.path || null;
    if (nodePath) {
      const pathMatch = tabs.find(function(tab) {
        return tab.sourceFilePath === nodePath;
      });
      if (pathMatch) return pathMatch;
    }

    const title = isGraphFilePath(node.name) ? getGraphTitleFromFileName(node.name) : getMarkdownTitleFromFileName(node.name);
    return tabs.find(function(tab) {
      return tab.sourceFileName === node.name || tab.title === title;
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
      try {
        const selectedPath = await Neutralino.os.showFolderDialog("Select a folder");
        await openFolderTreeFromNeutralinoPath(selectedPath);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        console.error("Neutralino folder picker error:", error);
        alert("Unable to open the desktop folder picker. Restart the desktop app and try again.");
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
        logSidebarFullGraph,
        failSidebarFullGraph,
        openSidebarFileFullGraphView,
        collectMarkdownFilesForSidebarFolder,
        openSidebarFolderGraphView,
        exportSidebarFolderToGraph,
        revealSidebarFolder,
        deleteSidebarFolder,
        ensureSidebarFolderContextMenu,
        showSidebarFileContextMenu,
        showSidebarFolderContextMenu,
        ensureSidebarClosedFolderContextMenu,
        showSidebarClosedFolderContextMenu,
        handleFolderTreeRootContextMenu,
        handleFolderTreeRootClick,
        getFolderTreeChildrenContainer,
        resetFolderTreeAnimation,
        finishFolderTreeAnimation,
        prefersReducedFolderTreeMotion,
        toggleFolderTreeDetails,
        getFileIconClass,
        renderFolderTreeNode,
        findTabForSidebarFile,
        buildTreeFromFileList,
        openFolderTree
      });
    }

    app.registerModule?.("sidebarContextTree", api);
    return api;
  };
})(window);
