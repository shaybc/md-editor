(function(global) {
  global.registerMarkdownViewerFolderToolbar = function registerMarkdownViewerFolderToolbar(app, deps) {
    const api = {};

    with (deps) {
  function getComparableFilePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }

  if (createTagButton) {
    createTagButton.addEventListener("click", () => {
      const suggestedTag = tagManagementSearch?.value || "";
      const tag = window.prompt("Create tag:", suggestedTag);
      createTag(tag);
    });
  }

  if (deleteTagButton) {
    deleteTagButton.addEventListener("click", () => {
      const suggestedTag = tagManagementSearch?.value || "";
      const tag = window.prompt("Delete tag:", suggestedTag);
      deleteTag(tag);
    });
  }

  if (tagManagementSearch) {
    tagManagementSearch.addEventListener("input", () => renderTagManagementList());
    tagManagementSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      createTag(tagManagementSearch.value);
    });
  }

  function getTabTreeFileCandidates(tab) {
    if (!tab || tab.type === "graph") return [];
    return [tab.sourceFilePath, tab.sourceFileName, tab.title]
      .filter(Boolean)
      .map(getComparableFilePath);
  }

  function updateAutoSelectFileButtons() {
    const label = autoSelectFileEnabled ? "Auto select file Off" : "Auto select file On";
    const title = autoSelectFileEnabled ? "Disable Auto select file" : "Enable Auto select file";

    toggleAutoSelectFileButtons.forEach(function(button) {
      const labelElement = button.querySelector(".auto-select-file-label");
      if (labelElement) {
        labelElement.textContent = label;
      } else {
        button.textContent = label;
      }
      button.title = isFolderOpen ? title : "Open a folder to enable Auto select file";
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(autoSelectFileEnabled));
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !isFolderOpen;
        button.setAttribute("aria-disabled", isFolderOpen ? "false" : "true");
      }
    });
  }

  function hasCollapsedFolderTreeDetails() {
    return !!folderTreeRoot && Array.from(folderTreeRoot.querySelectorAll("details")).some(function(details) {
      return !details.open;
    });
  }

  function updateFolderTreeExpandToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const shouldExpand = hasCollapsedFolderTreeDetails();
    const title = !hasFolder
      ? "Open a folder to expand or collapse folders"
      : shouldExpand
        ? "Expand all folders"
        : "Collapse all folders";
    const iconClass = shouldExpand ? "bi bi-arrows-expand" : "bi bi-arrows-collapse";

    folderTreeExpandToggleButtons.forEach(function(button) {
      const icon = button.querySelector("i");
      if (icon) icon.className = iconClass;
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function setAllFolderTreeDetails(open) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll("details").forEach(function(details) {
      resetFolderTreeAnimation(details, getFolderTreeChildrenContainer(details));
      details.open = open;
    });
    updateFolderTreeExpandToggleButtons();
  }

  function getUnsupportedFileToggleButtons() {
    return document.querySelectorAll(".toggle-unsupported-files");
  }

  function getFolderTreeGraphViewButtons() {
    return document.querySelectorAll(".folder-tree-tool-button.open-graph-view");
  }

  function getFolderTreeGraphExportButtons() {
    return document.querySelectorAll(".export-folder-to-graph");
  }

  function getTagManagementMenuButtons() {
    return document.querySelectorAll(".tag-management-menu-button");
  }

  function getVisibleFolderTreeNodes(nodes) {
    return (nodes || []).reduce(function(visibleNodes, node) {
      if (node.kind === "directory") {
        const visibleChildren = getVisibleFolderTreeNodes(node.children || []);
        visibleNodes.push({ ...node, children: visibleChildren });
        return visibleNodes;
      }

      if (showUnsupportedFolderFiles || isSupportedFolderTreeDocumentNode(node)) {
        visibleNodes.push(node);
      }
      return visibleNodes;
    }, []);
  }

  function getFolderTreeNodePathKey(node) {
    return getComparableFilePath(node?.fullPath || node?.path || node?.file?.webkitRelativePath || node?.file?.name || node?.name || "");
  }

  function getFolderTreeNodeTags(node) {
    if (!node || node.kind !== "file") return [];
    if (Array.isArray(node.tags)) return normalizeFileTagList(node.tags);
    const nodePathKey = getFolderTreeNodePathKey(node);
    const matchingEntry = (folderMarkdownFiles || []).find((entry) => {
      const entryPathKey = getComparableFilePath(entry.fullPath || entry.path || entry.file?.webkitRelativePath || entry.file?.name || entry.name || "");
      return entryPathKey && nodePathKey && entryPathKey === nodePathKey;
    });
    return normalizeFileTagList(matchingEntry?.tags || []);
  }

  function getTagFilteredFolderTreeNodes(nodes) {
    const selectedTags = Array.from(selectedFolderTreeTags || []);
    if (!selectedTags.length) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      if (node.kind === "directory") {
        const filteredChildren = getTagFilteredFolderTreeNodes(node.children || []);
        if (filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      const nodeTags = getFolderTreeNodeTags(node);
      if (selectedTags.some((tag) => nodeTags.includes(tag))) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function toggleFolderTreeTagFilter(tagName) {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) return;
    selectedFolderTreeTags = new Set(selectedFolderTreeTags);
    if (selectedFolderTreeTags.has(normalizedTag)) {
      selectedFolderTreeTags.delete(normalizedTag);
    } else {
      selectedFolderTreeTags.add(normalizedTag);
    }
    renderTagManagementList();
    renderFilteredFolderTree();
  }

  function getFilteredFolderTreeNodes(nodes, filterText) {
    const normalizedFilter = String(filterText || "").trim().toLowerCase();
    if (!normalizedFilter) return nodes;

    return (nodes || []).reduce(function(matches, node) {
      const nameMatches = String(node.name || "").toLowerCase().includes(normalizedFilter);

      if (node.kind === "directory") {
        const filteredChildren = getFilteredFolderTreeNodes(node.children || [], normalizedFilter);
        if (nameMatches || filteredChildren.length) {
          matches.push({ ...node, children: filteredChildren });
        }
        return matches;
      }

      if (nameMatches) {
        matches.push(node);
      }
      return matches;
    }, []);
  }

  function renderFilteredFolderTree() {
    if (!folderTreeRoot || !isFolderOpen) return;
    const visibleNodes = getVisibleFolderTreeNodes(currentFolderTreeNodes);
    const tagFilteredNodes = getTagFilteredFolderTreeNodes(visibleNodes);
    const nodes = getFilteredFolderTreeNodes(tagFilteredNodes, folderTreeFilterText);
    renderFolderTree(nodes, { preserveNodes: true, skipTagRefresh: true });
    if (folderTreeFilterText || selectedFolderTreeTags.size) {
      setAllFolderTreeDetails(true);
    }
  }

  function updateFolderTreeFilterControls() {
    const hasFolder = !!isFolderOpen;
    const isVisible = !!(folderTreeFilterInput && !folderTreeFilterInput.hidden);
    folderTreeFilterToggleButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = hasFolder ? "Filter files and folders" : "Open a folder to filter files and folders";
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      button.setAttribute("aria-expanded", String(hasFolder && isVisible));
      button.setAttribute("aria-pressed", String(hasFolder && (isVisible || !!folderTreeFilterText)));
    });

    if (folderTreeFilterInput) {
      folderTreeFilterInput.disabled = !hasFolder;
      if (!hasFolder) {
        folderTreeFilterInput.value = "";
        folderTreeFilterInput.hidden = true;
      }
    }
  }

  function getFolderSortLabel(mode) {
    const labels = {
      "name-asc": "File name (A to Z)",
      "name-desc": "File name (Z to A)",
      "modified-desc": "Modified time (new to old)",
      "modified-asc": "Modified time (old to new)",
      "created-desc": "Created time (new to old)",
      "created-asc": "Created time (old to new)"
    };
    return labels[getValidFolderSortMode(mode)];
  }

  function updateFolderTreeSortControls() {
    const hasFolder = !!isFolderOpen;
    const activeLabel = getFolderSortLabel(currentFolderSortMode);
    const title = hasFolder ? `Sort files and folders: ${activeLabel}` : "Open a folder to sort files and folders";

    folderTreeSortMenuButtons.forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });

    folderTreeSortOptionButtons.forEach(function(button) {
      const isActive = button.dataset.folderSort === currentFolderSortMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
  }

  function updateUnsupportedFileToggleButtons() {
    const hasFolder = !!isFolderOpen;
    const label = showUnsupportedFolderFiles ? "Hide unsupported file types" : "Show unsupported file types";
    const title = hasFolder ? `${label} in the folder view` : "Open a folder to show unsupported file types";

    getUnsupportedFileToggleButtons().forEach(function(button) {
      const labelElement = button.querySelector(".unsupported-files-toggle-label");
      if (labelElement) {
        labelElement.textContent = label;
      }
      if (button.classList.contains("folder-tree-tool-button")) {
        button.disabled = !hasFolder;
        button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
      }
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-pressed", String(hasFolder && showUnsupportedFolderFiles));
    });
  }

  function updateFolderTreeGraphViewButtons() {
    const hasFolder = !!isFolderOpen;
    const title = hasFolder ? "Open Graph View" : "Open a folder to open Graph View";
    getFolderTreeGraphViewButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateFolderTreeGraphExportButtons() {
    const hasFolder = !!isFolderOpen;
    const label = "Export Folder to Graph";
    const description = "Create a portable graph archive that includes Markdown file contents.";
    const title = hasFolder ? description : "Create a portable graph archive that includes Markdown file contents.";
    getFolderTreeGraphExportButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function updateTagManagementMenuButtons() {
    const hasFolder = !!isFolderOpen;
    const title = hasFolder ? "Manage tags" : "Open a folder to manage tags";
    getTagManagementMenuButtons().forEach(function(button) {
      button.disabled = !hasFolder;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
    [createTagButton, deleteTagButton, tagManagementSearch].forEach(function(control) {
      if (!control) return;
      control.disabled = !hasFolder;
      control.setAttribute("aria-disabled", hasFolder ? "false" : "true");
    });
  }

  function setShowUnsupportedFolderFiles(enabled) {
    showUnsupportedFolderFiles = !!enabled;
    saveGlobalState({ showUnsupportedFolderFiles });
    updateUnsupportedFileToggleButtons();
    renderFilteredFolderTree();
  }

  function updateFolderTreeToolbarState() {
    updateAutoSelectFileButtons();
    updateFolderTreeGraphViewButtons();
    updateFolderTreeGraphExportButtons();
    updateTagManagementMenuButtons();
    updateUnsupportedFileToggleButtons();
    updateFolderTreeExpandToggleButtons();
    updateFolderTreeFilterControls();
    updateFolderTreeSortControls();
  }

  function setAutoSelectFileEnabled(enabled) {
    autoSelectFileEnabled = !!enabled;
    saveGlobalState({ autoSelectFileEnabled });
    updateAutoSelectFileButtons();
    syncFolderTreeSelectionToActiveTab({ scroll: autoSelectFileEnabled });
  }

  function findFolderTreeFileButtonForTab(tab) {
    if (!folderTreeRoot) return null;
    const candidates = getTabTreeFileCandidates(tab);
    if (!candidates.length) return null;

    return Array.from(folderTreeRoot.querySelectorAll(".folder-tree-file")).find(function(button) {
      const buttonCandidates = [button.dataset.fullPath, button.dataset.path, button.dataset.name, button.textContent]
        .filter(Boolean)
        .map(getComparableFilePath);

      return candidates.some(function(candidate) {
        return buttonCandidates.some(function(buttonCandidate) {
          return buttonCandidate === candidate || buttonCandidate.endsWith(`/${candidate}`) || candidate.endsWith(`/${buttonCandidate}`);
        });
      });
    }) || null;
  }

  function syncFolderTreeSelectionToActiveTab(options = {}) {
    if (!folderTreeRoot) return;
    folderTreeRoot.querySelectorAll(".folder-tree-file.auto-selected").forEach(function(button) {
      button.classList.remove("auto-selected");
      button.removeAttribute("aria-current");
    });

    if (!autoSelectFileEnabled) return;

    const activeTab = tabs.find(function(tab) { return tab.id === activeTabId; });
    const selectedButton = findFolderTreeFileButtonForTab(activeTab);
    if (!selectedButton) return;

    selectedButton.classList.add("auto-selected");
    selectedButton.setAttribute("aria-current", "page");

    if (options.scroll !== false) {
      selectedButton.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  const GITHUB_ALERT_META = {
    note: {
      label: "Note",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z",
    },
    tip: {
      label: "Tip",
      viewBox: "0 0 384 512",
      path: "M297.2 248.9C311.6 228.3 320 203.2 320 176c0-70.7-57.3-128-128-128S64 105.3 64 176c0 27.2 8.4 52.3 22.8 72.9c3.7 5.3 8.1 11.3 12.8 17.7c0 0 0 0 0 0c12.9 17.7 28.3 38.9 39.8 59.8c10.4 19 15.7 38.8 18.3 57.5L109 384c-2.2-12-5.9-23.7-11.8-34.5c-9.9-18-22.2-34.9-34.5-51.8c0 0 0 0 0 0s0 0 0 0c-5.2-7.1-10.4-14.2-15.4-21.4C27.6 247.9 16 213.3 16 176C16 78.8 94.8 0 192 0s176 78.8 176 176c0 37.3-11.6 71.9-31.4 100.3c-5 7.2-10.2 14.3-15.4 21.4c0 0 0 0 0 0s0 0 0 0c-12.3 16.8-24.6 33.7-34.5 51.8c-5.9 10.8-9.6 22.5-11.8 34.5l-48.6 0c2.6-18.7 7.9-38.6 18.3-57.5c11.5-20.9 26.9-42.1 39.8-59.8c0 0 0 0 0 0s0 0 0 0s0 0 0 0c4.7-6.4 9-12.4 12.7-17.7zM192 128c-26.5 0-48 21.5-48 48c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-44.2 35.8-80 80-80c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0 384c-44.2 0-80-35.8-80-80l0-16 160 0 0 16c0 44.2-35.8 80-80 80z",
    },
    important: {
      label: "Important",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z",
    },
    warning: {
      label: "Warning",
      viewBox: "0 0 512 512",
      path: "M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z",
    },
    caution: {
      label: "Caution",
      viewBox: "0 0 512 512",
      path: "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z",
    },
  };
  const GITHUB_ALERT_MARKER_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+|$)/i;

  function enhanceGitHubAlerts(container) {
    if (!container) return;

    const blockquotes = container.querySelectorAll("blockquote");
    blockquotes.forEach((blockquote) => {
      let firstParagraph = null;
      for (const child of blockquote.children) {
        if (child.tagName === "P") {
          firstParagraph = child;
          break;
        }
      }
      if (!firstParagraph) return;

      const firstParagraphHtml = firstParagraph.innerHTML.trim();
      const markerMatch = firstParagraphHtml.match(GITHUB_ALERT_MARKER_REGEX);
      if (!markerMatch) return;

      const alertType = markerMatch[1].toLowerCase();
      blockquote.classList.add("markdown-alert", `markdown-alert-${alertType}`);

      const title = document.createElement("p");
      title.className = "markdown-alert-title";
      const alertMeta = GITHUB_ALERT_META[alertType] || { label: markerMatch[1], path: "" };
      const icon = document.createElement("span");
      icon.className = "markdown-alert-icon";
      icon.setAttribute("aria-hidden", "true");

      if (alertMeta.path) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", alertMeta.viewBox || "0 0 512 512");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", alertMeta.path);
        svg.appendChild(path);
        icon.appendChild(svg);
      }

      const label = document.createElement("span");
      label.textContent = alertMeta.label;
      title.appendChild(icon);
      title.appendChild(label);

      blockquote.insertBefore(title, blockquote.firstChild);

      const remainingHtml = firstParagraphHtml
        .replace(GITHUB_ALERT_MARKER_REGEX, "")
        .trim();
      if (remainingHtml) {
        firstParagraph.innerHTML = remainingHtml;
      } else {
        firstParagraph.remove();
      }
    });
  }


    Object.assign(api, {
      getComparableFilePath,
      getTabTreeFileCandidates,
      updateAutoSelectFileButtons,
      hasCollapsedFolderTreeDetails,
      updateFolderTreeExpandToggleButtons,
      setAllFolderTreeDetails,
      getUnsupportedFileToggleButtons,
      getFolderTreeGraphViewButtons,
      getFolderTreeGraphExportButtons,
      getTagManagementMenuButtons,
      getVisibleFolderTreeNodes,
      getFolderTreeNodePathKey,
      getFolderTreeNodeTags,
      getTagFilteredFolderTreeNodes,
      toggleFolderTreeTagFilter,
      getFilteredFolderTreeNodes,
      renderFilteredFolderTree,
      updateFolderTreeFilterControls,
      getFolderSortLabel,
      updateFolderTreeSortControls,
      updateUnsupportedFileToggleButtons,
      updateFolderTreeGraphViewButtons,
      updateFolderTreeGraphExportButtons,
      updateTagManagementMenuButtons,
      setShowUnsupportedFolderFiles,
      updateFolderTreeToolbarState,
      setAutoSelectFileEnabled,
      findFolderTreeFileButtonForTab,
      syncFolderTreeSelectionToActiveTab,
      enhanceGitHubAlerts,
    });
    }

    app.services.folderToolbar = api;
    app.registerModule("folderToolbar", api);
    return api;
  };
})(window);
