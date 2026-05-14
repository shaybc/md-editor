(function(global) {
  global.registerMarkdownViewerGraphToolbar = function registerMarkdownViewerGraphToolbar(app, deps) {
    const api = {};

    with (deps) {
  function setGraphFilterPanelCollapsed(collapsed) {
    if (!graphViewToolbar || !graphFilterPanelToggle) return;
    graphViewToolbar.classList.toggle("collapsed", collapsed);
    graphFilterPanelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    graphFilterPanelToggle.setAttribute("aria-label", collapsed ? "Expand graph filters" : "Collapse graph filters");
    graphFilterPanelToggle.setAttribute("title", collapsed ? "Expand filters" : "Collapse filters");
  }

  function setGraphViewMode(enabled) {
    const contentContainer = document.querySelector(".content-container");
    if (!contentContainer || !graphViewCanvas) return;
    const previewPane = document.querySelector(".preview-pane");
    const graphViewHeader = document.querySelector("#graph-view-modal .graph-view-header");
    const graphViewContent = document.querySelector("#graph-view-modal .graph-view-content");
    if (enabled) {
      contentContainer.classList.add("graph-view-active");
      if (previewPane) {
        if (graphViewToolbar && graphViewToolbar.parentElement !== previewPane) {
          previewPane.insertBefore(graphViewToolbar, previewPane.firstChild);
        }
        if (!graphViewCanvas.parentElement || !graphViewCanvas.closest(".preview-pane")) {
          previewPane.appendChild(graphViewCanvas);
        } else if (graphViewToolbar && graphViewCanvas.previousElementSibling !== graphViewToolbar) {
          previewPane.insertBefore(graphViewToolbar, graphViewCanvas);
        }
      }
      if (graphViewToolbar) graphViewToolbar.classList.add("graph-tab-toolbar");
      graphViewCanvas.classList.add("tab-graph-canvas");
    } else {
      contentContainer.classList.remove("graph-view-active");
      if (graphViewToolbar) {
        graphViewToolbar.classList.remove("graph-tab-toolbar");
        if (graphViewHeader && graphViewToolbar.parentElement !== graphViewHeader) {
          graphViewHeader.appendChild(graphViewToolbar);
        }
      }
      graphViewCanvas.classList.remove("tab-graph-canvas");
      if (graphViewContent && graphViewCanvas.parentElement !== graphViewContent) {
        graphViewContent.appendChild(graphViewCanvas);
      }
    }
  }

  function getGraphSnapshotTagNodeIds(graphSnapshot) {
    return (graphSnapshot?.nodes || [])
      .filter((node) => (node?.type || "file") === "tag")
      .map((node) => normalizeGraphTagNodeId(node.id || node.tag || node.label))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function getGraphFilterTagNodeIds(graphSnapshot) {
    return getGraphSnapshotTagNodeIds(graphSnapshot);
  }

  function getGraphTagLabelFromId(tagNodeId) {
    return `#${String(tagNodeId || "").replace(/^tag:/, "")}`;
  }

  function parseGraphGroupQuery(query) {
    const rawQuery = String(query || "").trim();
    const prefixMatch = rawQuery.match(/^([a-z]+)\s*:\s*(.*)$/i);
    const supportedPrefixes = new Set(["path", "file", "name", "tag", "link", "links", "text", "line"]);
    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
    const type = supportedPrefixes.has(prefix) ? prefix : "";
    const value = (type ? prefixMatch[2] : rawQuery).trim();
    const terms = value
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    return {
      type,
      value,
      terms
    };
  }

  function graphQueryRequiresFileContent(query) {
    const parsedQuery = parseGraphGroupQuery(query);
    return parsedQuery.type === "text" || parsedQuery.type === "line";
  }

  function isLightweightSavedGraphView(tab, graphSnapshot) {
    return !!(isKeepSavedGraphMode(tab) && !graphSnapshotHasEmbeddedFileContent(graphSnapshot || tab?.graphSnapshot));
  }

  function showLightweightSavedGraphTextSearchUnavailable() {
    showGraphBanner(LIGHTWEIGHT_SAVED_GRAPH_TEXT_SEARCH_MESSAGE);
  }

  function getGraphSnapshotFileCachedContent(snapshotFile) {
    if (typeof snapshotFile?.content === "string") return snapshotFile.content;
    const folderEntry = findFolderMarkdownEntryForGraphFile(snapshotFile);
    return typeof folderEntry?.content === "string" ? folderEntry.content : "";
  }

  function getGraphFilterFileData(nodeData, snapshotFile, options = {}) {
    const status = nodeData?.status || snapshotFile?.status || "current";
    const canUseCurrentFolder = options.useCurrentFolderData && status !== "saved-only";
    const currentEntry = canUseCurrentFolder ? findFolderMarkdownEntryForGraphFile({
      ...(snapshotFile || {}),
      id: snapshotFile?.id || nodeData?.id,
      path: snapshotFile?.path || nodeData?.path || nodeData?.fullPath || nodeData?.id,
      fullPath: snapshotFile?.fullPath || nodeData?.fullPath || nodeData?.path || null,
      name: snapshotFile?.name || nodeData?.name || getFileName(nodeData?.path || nodeData?.fullPath || nodeData?.id || "")
    }) : null;
    const metadataSource = currentEntry || snapshotFile || nodeData || {};
    const path = metadataSource.path || nodeData?.path || nodeData?.fullPath || nodeData?.id || "";
    const name = metadataSource.name || nodeData?.name || getFileName(path || nodeData?.id || "");
    const fullPath = metadataSource.fullPath || nodeData?.fullPath || path;
    const rawContent = typeof currentEntry?.content === "string"
      ? currentEntry.content
      : (typeof snapshotFile?.content === "string" ? snapshotFile.content : "");
    const content = options.allowContentSearch ? rawContent : "";
    const sourceTags = Array.isArray(metadataSource.tags) ? metadataSource.tags : [];
    const tags = sourceTags.length ? sourceTags : (content ? getFileTagsFromContent(content) : []);

    return {
      id: metadataSource.id || nodeData?.id || "",
      path,
      name,
      fullPath,
      content,
      tags,
      linkText: String(options.linkText || "")
    };
  }

  function graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, options = {}) {
    if ((nodeData?.type || "file") !== "file") return false;
    if (!parsedQuery || !parsedQuery.terms?.length) return false;
    if (parsedQuery.type === "links") {
      return options.linkMetricMatchIds instanceof Set && options.linkMetricMatchIds.has(nodeData.id);
    }
    if (!snapshotFile) return false;

    const fileData = getGraphFilterFileData(nodeData, snapshotFile, options);
    const path = String(fileData.path || "").toLowerCase();
    const name = String(fileData.name || "").toLowerCase();
    const fullPath = String(fileData.fullPath || "").toLowerCase();
    const content = String(fileData.content || "").toLowerCase();
    const tagText = (Array.isArray(fileData.tags) ? fileData.tags : [])
      .map((tag) => String(tag || "").toLowerCase())
      .filter(Boolean)
      .join(" ");
    const linkText = String(fileData.linkText || "").toLowerCase();
    const terms = parsedQuery.terms;
    const allTermsMatchText = (text) => terms.every((term) => text.includes(term));

    switch (parsedQuery.type) {
      case "path":
        return allTermsMatchText([path, fullPath].filter(Boolean).join(" "));
      case "file":
        return allTermsMatchText([name, path, fullPath].filter(Boolean).join(" "));
      case "name":
        return allTermsMatchText(name);
      case "tag":
        return allTermsMatchText(tagText);
      case "link":
        return allTermsMatchText(linkText);
      case "text":
        return options.allowContentSearch && allTermsMatchText(content);
      case "line":
        return options.allowContentSearch && content
          .split(/\r?\n/)
          .some((line) => terms.every((term) => line.includes(term)));
      default:
        return allTermsMatchText([path, name, fullPath, tagText, linkText, options.allowContentSearch ? content : ""].filter(Boolean).join(" "));
    }
  }

  function getGraphGroupMatch(nodeData, snapshotFile, graphViewConfig, options = {}) {
    const groups = Array.isArray(graphViewConfig?.groups) ? graphViewConfig.groups : [];
    for (const group of groups) {
      if (!group || group.enabled === false) continue;
      const parsedQuery = parseGraphGroupQuery(group.query);
      if (graphFileMatchesGroupQuery(nodeData, snapshotFile, parsedQuery, options)) return group;
    }
    return null;
  }

  function updateGraphGroup(groupId, patch, options = {}) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    const groups = graphViewConfig.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
    updateActiveGraphViewConfig({ groups }, options);
  }

  function deleteGraphGroup(groupId) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    updateActiveGraphViewConfig({ groups: graphViewConfig.groups.filter((group) => group.id !== groupId) });
  }

  function reorderGraphGroup(groupId, targetIndex) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    const currentIndex = graphViewConfig.groups.findIndex((group) => group.id === groupId);
    if (currentIndex === -1) return;
    const nextIndex = Math.max(0, Math.min(targetIndex, graphViewConfig.groups.length - 1));
    if (nextIndex === currentIndex) return;
    const groups = graphViewConfig.groups.slice();
    const [group] = groups.splice(currentIndex, 1);
    groups.splice(nextIndex, 0, group);
    updateActiveGraphViewConfig({ groups });
  }

  function moveGraphGroup(groupId, direction) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const graphViewConfig = normalizeGraphViewConfig(activeGraphTab.graphViewConfig);
    const currentIndex = graphViewConfig.groups.findIndex((group) => group.id === groupId);
    if (currentIndex === -1) return;
    reorderGraphGroup(groupId, currentIndex + direction);
  }

  const GRAPH_GROUP_QUERY_PREFIX_HELP = [
    { prefix: "path", label: "path:", description: "Match folders, path segments, or full paths." },
    { prefix: "file", label: "file:", description: "Match Markdown file names." },
    { prefix: "tag", label: "tag:", description: "Match normalized frontmatter tags." },
    { prefix: "link", label: "link:", description: "Match linked file paths and names." },
    { prefix: "links", label: "links:", description: "Rank by direct link counts: max-in, min-in, max-out, or min-out." },
    { prefix: "text", label: "text:", description: "Match file contents." },
    { prefix: "line", label: "line:", description: "Match individual Markdown lines." }
  ];
  let activeGraphGroupSuggestionClose = null;

  function getGraphGroupQueryContext(input) {
    const value = String(input?.value || "");
    const cursor = typeof input?.selectionStart === "number" ? input.selectionStart : value.length;
    const tokenStart = Math.max(value.lastIndexOf(" ", cursor - 1), value.lastIndexOf("\t", cursor - 1), value.lastIndexOf("\n", cursor - 1)) + 1;
    const tokenEndMatch = value.slice(cursor).match(/\s/);
    const tokenEnd = tokenEndMatch ? cursor + tokenEndMatch.index : value.length;
    const token = value.slice(tokenStart, tokenEnd);
    const tokenBeforeCursor = value.slice(tokenStart, cursor);
    const prefixMatch = token.match(/^([a-z]+):(.*)$/i);
    const supportedPrefixes = new Set(GRAPH_GROUP_QUERY_PREFIX_HELP.map((item) => item.prefix));

    if (!prefixMatch || !supportedPrefixes.has(prefixMatch[1].toLowerCase())) {
      return {
        prefix: "",
        query: tokenBeforeCursor,
        replaceStart: tokenStart,
        replaceEnd: tokenEnd
      };
    }

    const prefix = prefixMatch[1].toLowerCase();
    const valueStart = tokenStart + prefixMatch[1].length + 1;
    return {
      prefix,
      query: value.slice(valueStart, tokenEnd),
      replaceStart: valueStart,
      replaceEnd: tokenEnd
    };
  }

  function isGraphGroupAbsolutePathSuggestion(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/");
    return /^([a-z]:\/|\/|~\/|\/\/)/i.test(normalizedPath);
  }

  function getGraphGroupRelativeFilePath(snapshotFile) {
    const relativePath = String(snapshotFile?.path || snapshotFile?.file?.webkitRelativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (relativePath && !isGraphGroupAbsolutePathSuggestion(relativePath)) return relativePath;

    const fullPath = String(snapshotFile?.fullPath || "").replace(/\\/g, "/");
    if (fullPath && activeFolderPath) {
      const relativeFullPath = getPathRelativeToFolder(fullPath, activeFolderPath);
      if (relativeFullPath) return relativeFullPath.replace(/\\/g, "/").replace(/^\/+/, "");
    }

    return "";
  }

  function addGraphGroupPathFolderSuggestions(snapshotFile, addEntry) {
    const relativePath = getGraphGroupRelativeFilePath(snapshotFile);
    if (!relativePath) return;

    const segments = relativePath.split("/").filter(Boolean);
    segments.pop();
    let folderPath = "";
    segments.forEach((segment) => {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      addEntry(folderPath, "path", "Folder");
    });
  }

  function getGraphGroupSuggestionEntries(graphSnapshot, prefix, query, options = {}) {
    const normalizedQuery = String(query || "").toLowerCase();
    const entryMap = new Map();
    const addEntry = (value, type, detail) => {
      const normalizedValue = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      if (!normalizedValue || isGraphGroupAbsolutePathSuggestion(normalizedValue)) return;
      if (normalizedQuery && !normalizedValue.toLowerCase().includes(normalizedQuery)) return;
      const key = `${type}:${normalizedValue.toLowerCase()}`;
      if (!entryMap.has(key)) entryMap.set(key, { value: normalizedValue, type, detail: detail || "" });
    };

    if (prefix === "path") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        addGraphGroupPathFolderSuggestions(snapshotFile, addEntry);
      });
    } else if (prefix === "file") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        const path = String(snapshotFile.fullPath || snapshotFile.path || "");
        addEntry(snapshotFile.name || getFileName(path), "file", path || "File name");
      });
    } else if (prefix === "tag") {
      (graphSnapshot?.files || []).forEach((snapshotFile) => {
        normalizeFileTagList(snapshotFile.tags || []).forEach((tag) => addEntry(tag, "tag", "File tag"));
        if (!options.savedMetadataOnly) extractMarkdownTags(getGraphSnapshotFileCachedContent(snapshotFile)).forEach((tag) => addEntry(tag, "tag", "Markdown tag"));
      });
      (graphSnapshot?.nodes || []).forEach((node) => {
        if ((node?.type || "file") !== "tag") return;
        const tag = normalizeTagName(node.tag || node.label || String(node.id || "").replace(/^tag:/, ""));
        addEntry(tag, "tag", "Tag node");
      });
      if (!options.savedMetadataOnly) getAllKnownAndReferencedTags().forEach((tag) => addEntry(tag, "tag", "Known tag"));
    } else if (prefix === "link") {
      const filesById = new Map((graphSnapshot?.files || []).map((file) => [file.id, file]));
      (graphSnapshot?.links || []).forEach((link) => {
        if ((link?.type || "link") === "tag") return;
        const sourceId = getGraphLinkEndpointKey(link.source);
        const targetId = getGraphLinkEndpointKey(link.target);
        [sourceId, targetId].forEach((nodeId) => {
          const file = filesById.get(nodeId);
          if (!file) return;
          addEntry(file.path || file.fullPath || file.name || nodeId, "link", "Linked file");
          addEntry(file.name || getFileName(file.path || file.fullPath || nodeId), "link", "Linked file name");
        });
      });
    } else if (prefix === "links") {
      [
        ["max-in", "Top 5 by incoming links"],
        ["min-in", "Bottom 5 by incoming links"],
        ["max-out", "Top 5 by outgoing links"],
        ["min-out", "Bottom 5 by outgoing links"]
      ].forEach(([value, detail]) => addEntry(value, "links", detail));
    }

    return Array.from(entryMap.values())
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: "base" }));
  }

  function attachGraphGroupQuerySuggestions(row, queryInput, group, sourceTab) {
    const popover = document.createElement("div");
    popover.className = "graph-group-query-suggestions hidden";
    popover.setAttribute("role", "listbox");
    popover.setAttribute("aria-label", "Graph group query suggestions");
    row.appendChild(popover);

    let selectedIndex = 0;
    let isPointerSelectingSuggestion = false;

    const closePopover = () => {
      popover.classList.add("hidden");
      popover.innerHTML = "";
      queryInput.removeAttribute("aria-activedescendant");
      if (activeGraphGroupSuggestionClose === closePopover) activeGraphGroupSuggestionClose = null;
      document.removeEventListener("mousedown", handleOutsideMouseDown, true);
    };

    function handleOutsideMouseDown(event) {
      if (row.contains(event.target)) return;
      closePopover();
    }

    const insertSuggestion = (suggestion) => {
      if (!suggestion) return;
      const context = getGraphGroupQueryContext(queryInput);
      const replacement = context.prefix ? suggestion.value : `${suggestion.prefix}:`;
      const shouldShowNextSuggestions = !context.prefix && !!suggestion.prefix;
      const value = String(queryInput.value || "");
      const nextValue = `${value.slice(0, context.replaceStart)}${replacement}${value.slice(context.replaceEnd)}`;
      const cursor = context.replaceStart + replacement.length;
      const activeGraphTab = getActiveGraphTab();
      if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(nextValue)) {
        closePopover();
        showLightweightSavedGraphTextSearchUnavailable();
        return;
      }
      queryInput.value = nextValue;
      queryInput.focus();
      queryInput.setSelectionRange(cursor, cursor);
      closePopover();
      updateGraphGroup(group.id, { query: nextValue }, { skipToolbar: true });
      if (shouldShowNextSuggestions) window.setTimeout(renderPopover, 0);
    };

    const scrollSelectedSuggestionIntoView = () => {
      const selectedOption = popover.querySelector(".graph-group-query-suggestion.active");
      if (!selectedOption) return;
      selectedOption.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const renderPopover = () => {
      if (queryInput.disabled) return;
      const context = getGraphGroupQueryContext(queryInput);
      const activeGraphTab = getActiveGraphTab();
      const graphSnapshot = activeGraphTab?.graphSnapshot || sourceTab?.graphSnapshot || null;
      let suggestions = [];

      if (context.prefix) {
        suggestions = getGraphGroupSuggestionEntries(graphSnapshot, context.prefix, context.query, { savedMetadataOnly: isKeepSavedGraphMode(activeGraphTab) });
      } else {
        const query = String(context.query || "").toLowerCase();
        suggestions = GRAPH_GROUP_QUERY_PREFIX_HELP
          .filter((item) => !query || item.prefix.includes(query) || item.label.toLowerCase().includes(query))
          .map((item) => ({ ...item, value: item.label }));
      }

      popover.innerHTML = "";
      selectedIndex = Math.min(selectedIndex, Math.max(suggestions.length - 1, 0));

      if (!suggestions.length) {
        const empty = document.createElement("div");
        empty.className = "graph-group-query-suggestion-empty";
        empty.textContent = context.prefix ? `No ${context.prefix}: suggestions.` : "No group type suggestions.";
        popover.appendChild(empty);
      } else {
        suggestions.forEach((suggestion, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.id = `graph-group-query-suggestion-${group.id}-${index}`;
          button.className = `graph-group-query-suggestion${index === selectedIndex ? " active" : ""}`;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");
          button.dataset.index = String(index);
          const title = document.createElement("span");
          title.className = "graph-group-query-suggestion-title";
          title.textContent = context.prefix ? suggestion.value : suggestion.label;
          const detail = document.createElement("span");
          detail.className = "graph-group-query-suggestion-detail";
          detail.textContent = context.prefix ? suggestion.detail : suggestion.description;
          button.append(title, detail);
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            isPointerSelectingSuggestion = true;
            insertSuggestion(suggestion);
          });
          button.addEventListener("mouseenter", () => {
            selectedIndex = index;
            Array.from(popover.querySelectorAll(".graph-group-query-suggestion")).forEach((option, optionIndex) => {
              const isSelected = optionIndex === selectedIndex;
              option.classList.toggle("active", isSelected);
              option.setAttribute("aria-selected", isSelected ? "true" : "false");
            });
            queryInput.setAttribute("aria-activedescendant", `graph-group-query-suggestion-${group.id}-${selectedIndex}`);
          });
          popover.appendChild(button);
        });
        queryInput.setAttribute("aria-activedescendant", `graph-group-query-suggestion-${group.id}-${selectedIndex}`);
      }

      if (activeGraphGroupSuggestionClose && activeGraphGroupSuggestionClose !== closePopover) activeGraphGroupSuggestionClose();
      activeGraphGroupSuggestionClose = closePopover;
      popover.classList.remove("hidden");
      scrollSelectedSuggestionIntoView();
      document.addEventListener("mousedown", handleOutsideMouseDown, true);
    };

    queryInput.addEventListener("focus", renderPopover);
    queryInput.addEventListener("click", renderPopover);
    queryInput.addEventListener("keyup", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
      renderPopover();
    });
    queryInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!isPointerSelectingSuggestion) closePopover();
        isPointerSelectingSuggestion = false;
      }, 120);
    });
    queryInput.addEventListener("keydown", (event) => {
      if (popover.classList.contains("hidden")) {
        if (event.key !== "Escape") renderPopover();
        return;
      }

      const options = Array.from(popover.querySelectorAll(".graph-group-query-suggestion"));
      if (event.key === "Escape") {
        event.preventDefault();
        closePopover();
      } else if (event.key === "ArrowDown" && options.length) {
        event.preventDefault();
        selectedIndex = (selectedIndex + 1) % options.length;
        renderPopover();
      } else if (event.key === "ArrowUp" && options.length) {
        event.preventDefault();
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        renderPopover();
      } else if (event.key === "Enter" && options.length) {
        event.preventDefault();
        const context = getGraphGroupQueryContext(queryInput);
        const activeGraphTab = getActiveGraphTab();
        const graphSnapshot = activeGraphTab?.graphSnapshot || sourceTab?.graphSnapshot || null;
        const suggestions = context.prefix
          ? getGraphGroupSuggestionEntries(graphSnapshot, context.prefix, context.query, { savedMetadataOnly: isKeepSavedGraphMode(activeGraphTab) })
          : GRAPH_GROUP_QUERY_PREFIX_HELP
            .filter((item) => !context.query || item.prefix.includes(String(context.query).toLowerCase()) || item.label.toLowerCase().includes(String(context.query).toLowerCase()))
            .map((item) => ({ ...item, value: item.label }));
        insertSuggestion(suggestions[selectedIndex]);
      }
    });
  }

  function renderGraphGroupsToolbar(tab) {
    if (!graphGroupsList) return;
    const graphViewConfig = normalizeGraphViewConfig(tab?.graphViewConfig);
    const isGraphTab = !!(tab && tab.type === "graph");
    graphGroupsList.innerHTML = "";

    if (!graphViewConfig.groups.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "graph-groups-empty";
      emptyMessage.textContent = "No groups yet.";
      graphGroupsList.appendChild(emptyMessage);
    }

    graphViewConfig.groups.forEach((group, index) => {
      const row = document.createElement("div");
      row.className = "graph-group-row";
      row.dataset.groupId = group.id;
      row.addEventListener("dragover", (event) => {
        if (!isGraphTab) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        row.classList.add("graph-group-row-drag-over");
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("graph-group-row-drag-over");
      });
      row.addEventListener("drop", (event) => {
        if (!isGraphTab) return;
        event.preventDefault();
        row.classList.remove("graph-group-row-drag-over");
        const sourceGroupId = event.dataTransfer.getData("text/plain");
        if (!sourceGroupId || sourceGroupId === group.id) return;
        reorderGraphGroup(sourceGroupId, index);
      });

      const enabledRow = document.createElement("div");
      enabledRow.className = "graph-group-enabled graph-toggle-row";

      const moveHandle = document.createElement("button");
      moveHandle.className = "tool-button graph-group-drag-handle";
      moveHandle.type = "button";
      moveHandle.title = "Drag to reorder graph group";
      moveHandle.draggable = isGraphTab;
      moveHandle.disabled = !isGraphTab;
      moveHandle.setAttribute("aria-label", `Drag or use arrow keys to reorder graph group ${index + 1}`);
      moveHandle.innerHTML = '<i class="bi bi-list" aria-hidden="true"></i>';
      moveHandle.addEventListener("dragstart", (event) => {
        if (!isGraphTab) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", group.id);
        row.classList.add("graph-group-row-dragging");
      });
      moveHandle.addEventListener("dragend", () => {
        row.classList.remove("graph-group-row-dragging");
        graphGroupsList.querySelectorAll(".graph-group-row-drag-over").forEach((item) => item.classList.remove("graph-group-row-drag-over"));
      });
      moveHandle.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveGraphGroup(group.id, -1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveGraphGroup(group.id, 1);
        }
      });

      const enabledText = document.createElement("span");
      enabledText.className = "graph-group-label-text";
      enabledText.textContent = `Group ${index + 1}`;
      const enabledInput = document.createElement("input");
      enabledInput.className = "graph-switch-input";
      enabledInput.type = "checkbox";
      enabledInput.checked = group.enabled !== false;
      enabledInput.disabled = !isGraphTab;
      enabledInput.setAttribute("aria-label", `Enable graph group ${index + 1}`);
      enabledInput.addEventListener("change", () => updateGraphGroup(group.id, { enabled: enabledInput.checked }));
      const enabledSwitch = document.createElement("span");
      enabledSwitch.className = "graph-switch";
      enabledSwitch.setAttribute("aria-hidden", "true");
      const enabledLabel = document.createElement("label");
      enabledLabel.className = "graph-group-switch-label";
      enabledLabel.title = "Enable or disable this graph group";
      enabledLabel.append(enabledInput, enabledSwitch);

      const hideGroupButton = document.createElement("button");
      hideGroupButton.className = "tool-button graph-group-hide-button";
      hideGroupButton.type = "button";
      hideGroupButton.disabled = !isGraphTab;
      hideGroupButton.classList.toggle("active", group.hidden === true);
      hideGroupButton.title = group.hidden === true ? "Show matching group points" : "Hide matching group points";
      hideGroupButton.setAttribute("aria-label", `${group.hidden === true ? "Show" : "Hide"} graph group ${index + 1} points`);
      hideGroupButton.setAttribute("aria-pressed", group.hidden === true ? "true" : "false");
      hideGroupButton.innerHTML = `<i class="bi ${group.hidden === true ? "bi-eye" : "bi-eye-slash"}" aria-hidden="true"></i>`;
      hideGroupButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateGraphGroup(group.id, { hidden: group.hidden !== true });
      });

      enabledRow.append(moveHandle, enabledText, hideGroupButton, enabledLabel);

      const queryInput = document.createElement("input");
      queryInput.className = "graph-group-query-input";
      queryInput.type = "text";
      queryInput.placeholder = "tag:project or path:docs";
      queryInput.value = group.query || "";
      queryInput.disabled = !isGraphTab;
      queryInput.autocomplete = "off";
      queryInput.setAttribute("aria-label", `Graph group ${index + 1} query`);
      queryInput.setAttribute("aria-haspopup", "listbox");
      let queryUpdateTimeout = null;
      const updateGroupQuery = () => {
        window.clearTimeout(queryUpdateTimeout);
        queryUpdateTimeout = null;
        const activeGraphTab = getActiveGraphTab();
        if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(queryInput.value)) {
          queryInput.value = group.query || "";
          showLightweightSavedGraphTextSearchUnavailable();
          return;
        }
        updateGraphGroup(group.id, { query: queryInput.value }, { skipToolbar: true });
      };
      queryInput.addEventListener("input", () => {
        window.clearTimeout(queryUpdateTimeout);
        queryUpdateTimeout = window.setTimeout(updateGroupQuery, GRAPH_GROUP_QUERY_UPDATE_DELAY);
      });
      queryInput.addEventListener("change", updateGroupQuery);
      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !queryInput.getAttribute("aria-activedescendant")) {
          event.preventDefault();
          queryInput.blur();
        }
      });

      const colorInput = document.createElement("input");
      colorInput.className = "graph-group-color-input";
      colorInput.type = "color";
      colorInput.value = getGraphColorInputValue(group.color);
      colorInput.disabled = !isGraphTab;
      colorInput.setAttribute("aria-label", `Graph group ${index + 1} color`);
      colorInput.addEventListener("change", () => updateGraphGroup(group.id, { color: colorInput.value }));

      const deleteButton = document.createElement("button");
      deleteButton.className = "tool-button graph-group-delete-button";
      deleteButton.type = "button";
      deleteButton.title = "Delete graph group";
      deleteButton.disabled = !isGraphTab;
      deleteButton.setAttribute("aria-label", `Delete graph group ${index + 1}`);
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", () => deleteGraphGroup(group.id));

      row.append(enabledRow, queryInput, colorInput, deleteButton);
      attachGraphGroupQuerySuggestions(row, queryInput, group, tab);
      graphGroupsList.appendChild(row);
    });

    if (graphAddGroupButton) graphAddGroupButton.disabled = !isGraphTab;
  }

  function updateGraphTagToolbar(tab, graphSnapshot) {
    const graphViewConfig = normalizeGraphViewConfig(tab?.graphViewConfig);
    const isGraphTab = !!(tab && tab.type === "graph");
    updateSavedGraphModePill(tab);
    renderGraphGroupsToolbar(tab);
    if (graphShowTagsButton) {
      graphShowTagsButton.disabled = !isGraphTab;
      graphShowTagsButton.classList.toggle("active", isGraphTab && graphViewConfig.showTags);
      graphShowTagsButton.setAttribute("aria-pressed", isGraphTab && graphViewConfig.showTags ? "true" : "false");
    }
    if (graphHideTagsButton) {
      graphHideTagsButton.disabled = !isGraphTab;
      graphHideTagsButton.classList.toggle("active", isGraphTab && !graphViewConfig.showTags);
      graphHideTagsButton.setAttribute("aria-pressed", isGraphTab && !graphViewConfig.showTags ? "true" : "false");
    }
    if (graphFileSearchFilter) {
      graphFileSearchFilter.disabled = !isGraphTab;
      if (document.activeElement !== graphFileSearchFilter) {
        graphFileSearchFilter.value = graphViewConfig.searchQuery || "";
      }
    }
    if (graphSelectedTagFilter) {
      const selectedTagId = graphViewConfig.selectedTagIds[0] || "";
      const tagIds = isKeepSavedGraphMode(tab) ? getGraphSnapshotTagNodeIds(graphSnapshot) : getGraphFilterTagNodeIds(graphSnapshot);
      graphSelectedTagFilter.innerHTML = '<option value="">All files</option>';
      tagIds.forEach((tagId) => {
        const option = document.createElement("option");
        option.value = tagId;
        option.textContent = getGraphTagLabelFromId(tagId);
        graphSelectedTagFilter.appendChild(option);
      });
      graphSelectedTagFilter.value = tagIds.includes(selectedTagId) ? selectedTagId : "";
      graphSelectedTagFilter.disabled = !isGraphTab || !tagIds.length;
    }
    if (graphOnlySelectedTagButton) {
      graphOnlySelectedTagButton.disabled = !isGraphTab;
      graphOnlySelectedTagButton.classList.toggle("active", isGraphTab && graphViewConfig.selectedTagIds.length > 0);
      graphOnlySelectedTagButton.setAttribute("aria-pressed", isGraphTab && graphViewConfig.selectedTagIds.length > 0 ? "true" : "false");
    }
    const graphControlInputs = [
      graphDisplayArrows,
      graphDisplayOrphans,
      graphTextFadeThreshold,
      graphNodeSize,
      graphLinkThickness,
      graphCenterForce,
      graphRepelForce,
      graphLinkForce,
      graphLinkDistance
    ].filter(Boolean);
    graphControlInputs.forEach((input) => { input.disabled = !isGraphTab; });
    if (graphDisplayArrows) graphDisplayArrows.checked = graphViewConfig.showArrows;
    if (graphDisplayOrphans) graphDisplayOrphans.checked = graphViewConfig.showOrphans;
    if (graphTextFadeThreshold) graphTextFadeThreshold.value = graphViewConfig.textFadeThreshold;
    if (graphNodeSize) graphNodeSize.value = graphViewConfig.nodeSize;
    if (graphLinkThickness) graphLinkThickness.value = graphViewConfig.linkThickness;
    if (graphCenterForce) graphCenterForce.value = graphViewConfig.centerForce;
    if (graphRepelForce) graphRepelForce.value = graphViewConfig.repelForce;
    if (graphLinkForce) graphLinkForce.value = graphViewConfig.linkForce;
    if (graphLinkDistance) graphLinkDistance.value = graphViewConfig.linkDistance;
    if (graphResetDefaultsButton) graphResetDefaultsButton.disabled = !isGraphTab;
  }

  function resetActiveGraphViewToDefaults() {
    const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
    updateActiveGraphViewConfig({
      showTags: DEFAULT_GRAPH_VIEW_CONFIG.showTags,
      selectedTagIds: [],
      searchQuery: DEFAULT_GRAPH_VIEW_CONFIG.searchQuery,
      groups: currentConfig.groups.map((group) => ({ ...group, enabled: false, hidden: false })),
      showArrows: DEFAULT_GRAPH_VIEW_CONFIG.showArrows,
      showOrphans: DEFAULT_GRAPH_VIEW_CONFIG.showOrphans,
      textFadeThreshold: DEFAULT_GRAPH_VIEW_CONFIG.textFadeThreshold,
      nodeSize: DEFAULT_GRAPH_VIEW_CONFIG.nodeSize,
      linkThickness: DEFAULT_GRAPH_VIEW_CONFIG.linkThickness,
      centerForce: DEFAULT_GRAPH_VIEW_CONFIG.centerForce,
      repelForce: DEFAULT_GRAPH_VIEW_CONFIG.repelForce,
      linkForce: DEFAULT_GRAPH_VIEW_CONFIG.linkForce,
      linkDistance: DEFAULT_GRAPH_VIEW_CONFIG.linkDistance
    });
  }

  function updateActiveGraphViewConfig(patch, options = {}) {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    activeGraphTab.graphViewConfig = normalizeGraphViewConfig({
      ...(activeGraphTab.graphViewConfig || {}),
      ...patch
    });
    if (activeGraphTab.graphDocument && typeof activeGraphTab.graphDocument === "object") {
      activeGraphTab.graphDocument.viewConfig = activeGraphTab.graphViewConfig;
      activeGraphTab.graphDocument.updatedAt = Date.now();
    }
    removeGraphRenderForTab(activeGraphTab.id);
    if (!options.skipToolbar) updateGraphTagToolbar(activeGraphTab, activeGraphTab.graphSnapshot || null);
    markGraphTabAsChanged(activeGraphTab);
    saveTabsToStorage(tabs);
    renderGraphView({ skipToolbar: options.skipToolbar });
  }

  function animateActiveGraphView() {
    const activeGraphTab = getActiveGraphTab();
    if (!activeGraphTab) return;
    const cachedRender = graphRenderCache.get(activeGraphTab.id);
    if (cachedRender?.simulation) {
      graphSettings.magneticEnabled = true;
      if (activeGraphTab.graphLayout) activeGraphTab.graphLayout.magneticEnabled = true;
      if (typeof cachedRender.animate === "function") cachedRender.animate();
      else cachedRender.simulation.alpha(0.9).restart();
      saveGlobalState({ graphMagneticEnabled: graphSettings.magneticEnabled });
      saveTabsToStorage(tabs);
    } else {
      renderGraphView();
    }
  }


  desktopOpenGraphButtons.forEach((button) => button.addEventListener("click", openGraphView));
  if (mobileOpenGraphView) mobileOpenGraphView.addEventListener("click", openGraphView);
  if (graphShowTagsButton) graphShowTagsButton.addEventListener("click", () => updateActiveGraphViewConfig({ showTags: true }));
  if (graphHideTagsButton) graphHideTagsButton.addEventListener("click", () => updateActiveGraphViewConfig({ showTags: false }));
  if (graphFileSearchFilter) {
    graphFileSearchFilter.addEventListener("input", () => {
      const activeGraphTab = getActiveGraphTab();
      if (isLightweightSavedGraphView(activeGraphTab, activeGraphTab?.graphSnapshot) && graphQueryRequiresFileContent(graphFileSearchFilter.value)) {
        graphFileSearchFilter.value = activeGraphTab?.graphViewConfig?.searchQuery || "";
        showLightweightSavedGraphTextSearchUnavailable();
        return;
      }
      updateActiveGraphViewConfig({ searchQuery: graphFileSearchFilter.value });
    });
  }
  if (graphSelectedTagFilter) {
    graphSelectedTagFilter.addEventListener("change", () => {
      const selectedTagId = normalizeGraphTagNodeId(graphSelectedTagFilter.value);
      updateActiveGraphViewConfig({ selectedTagIds: selectedTagId ? [selectedTagId] : [] });
    });
  }
  if (graphFilterPanelToggle) {
    graphFilterPanelToggle.addEventListener("click", () => {
      setGraphFilterPanelCollapsed(!graphViewToolbar?.classList.contains("collapsed"));
    });
  }
  if (graphOnlySelectedTagButton) {
    graphOnlySelectedTagButton.addEventListener("click", () => {
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      if (currentConfig.selectedTagIds.length) {
        updateActiveGraphViewConfig({ selectedTagIds: [] });
        return;
      }
      const selectedTagId = normalizeGraphTagNodeId(graphSelectedTagFilter?.value);
      if (!selectedTagId) {
        alert("Choose a tag before filtering the graph to selected-tag files.");
        return;
      }
      updateActiveGraphViewConfig({ selectedTagIds: [selectedTagId], showTags: true });
    });
  }
  if (graphAddGroupButton) {
    graphAddGroupButton.addEventListener("click", () => {
      const currentConfig = normalizeGraphViewConfig(getActiveGraphTab()?.graphViewConfig);
      const nextIndex = currentConfig.groups.length + 1;
      const nextDefaultColor = getNextDefaultGraphGroupColor(currentConfig.groups);
      const group = normalizeGraphGroups([{
        id: createGraphGroupId(`group:${Date.now()}:${nextIndex}`),
        query: "",
        color: nextDefaultColor,
        enabled: true
      }])[0];
      updateActiveGraphViewConfig({ groups: [...currentConfig.groups, group] });
    });
  }
  if (graphDisplayArrows) graphDisplayArrows.addEventListener("change", () => updateActiveGraphViewConfig({ showArrows: graphDisplayArrows.checked }));
  if (graphDisplayOrphans) graphDisplayOrphans.addEventListener("change", () => updateActiveGraphViewConfig({ showOrphans: graphDisplayOrphans.checked }));
  const bindGraphRangeControl = (input, configKey) => {
    if (!input) return;
    input.addEventListener("input", () => updateActiveGraphViewConfig({ [configKey]: Number(input.value) }));
  };
  bindGraphRangeControl(graphTextFadeThreshold, "textFadeThreshold");
  bindGraphRangeControl(graphNodeSize, "nodeSize");
  bindGraphRangeControl(graphLinkThickness, "linkThickness");
  bindGraphRangeControl(graphCenterForce, "centerForce");
  bindGraphRangeControl(graphRepelForce, "repelForce");
  bindGraphRangeControl(graphLinkForce, "linkForce");
  bindGraphRangeControl(graphLinkDistance, "linkDistance");
  if (graphResetDefaultsButton) graphResetDefaultsButton.addEventListener("click", resetActiveGraphViewToDefaults);
  graphStaleCloseButton?.addEventListener("click", keepSavedGraphFromStaleModal);
  graphStaleKeepButton?.addEventListener("click", keepSavedGraphFromStaleModal);
  graphStaleUpdateButton?.addEventListener("click", updateGraphFromStaleModal);
  graphStaleViewDetailsButton?.addEventListener("click", openGraphStaleComparisonDetailsModal);
  graphStaleCompareButton?.addEventListener("click", loadGraphComparisonFromStaleModal);
  graphStaleModal?.addEventListener("click", (event) => {
    if (event.target === graphStaleModal) hideGraphStaleModal();
  });
  graphComparisonDetailsCloseButton?.addEventListener("click", closeGraphComparisonDetailsModal);
  graphComparisonDetailsDoneButton?.addEventListener("click", closeGraphComparisonDetailsModal);
  graphComparisonDetailsModal?.addEventListener("click", (event) => {
    if (event.target === graphComparisonDetailsModal) closeGraphComparisonDetailsModal();
  });

  function initializeGraphFilterTooltips() {
    if (!graphViewToolbar) return;
    const tooltipTextBySelector = [
      ["#graph-file-search-filter", "Filter graph points by file name, path, tag, or text without changing the files on disk."],
      ["#graph-show-tags", "Show tag points and the connections between tags and files."],
      ["#graph-hide-tags", "Hide tag points so only file points and Markdown links are drawn."],
      ["#graph-selected-tag-filter", "Choose a tag to focus the graph on files that contain that tag."],
      ["#graph-only-selected-tag", "Limit the graph to files with the selected tag and their connected tag points."],
      ["#graph-add-group", "Add a color group. Groups use queries like path:, file:, tag:, links:, text:, and line: to color matching files."],
      ["#graph-display-arrows", "Toggle arrowheads on Markdown links to show link direction."],
      ["#graph-display-orphans", "Toggle graph points that do not have any visible connections."],
      ["#graph-text-fade-threshold", "Control how aggressively labels disappear while zooming out. At the default, labels are gone near 45% zoom and only larger points keep faded labels around 65%."],
      ["#graph-node-size", "Scale every graph point. Larger points are easier to hit and keep labels visible slightly longer while zoomed out."],
      ["#graph-link-thickness", "Adjust the stroke width of Markdown links between file points."],
      ["#graph-center-force", "Pull points toward the middle of the graph. Higher values make the layout cluster closer to center."],
      ["#graph-repel-force", "Push points away from each other. Higher values spread the graph out more."],
      ["#graph-link-force", "Control how strongly linked points pull toward their target link distance."],
      ["#graph-link-distance", "Set the preferred distance between connected points."],
      ["#graph-reset-defaults", "Reset search, selected tag, group toggles, display options, and force settings to defaults."],
      ["#graph-view-close", "Close graph view and return to the document view."],
      [".graph-collapsible-summary", "Expand or collapse this section of graph filters."],
      [".graph-group-query-input", "Type a group query. Use prefixes such as path:, file:, tag:, links:, text:, or line:."],
      [".graph-group-enabled-input", "Enable or disable this group color without deleting it."],
      [".graph-group-color-input", "Pick the color used for files that match this group query."],
      [".graph-group-drag-handle", "Drag this handle to reorder groups. Earlier groups take priority when multiple groups match the same file."],
      [".graph-group-delete-button", "Delete this color group from the graph filter settings."]
    ];

    tooltipTextBySelector.forEach(([selector, text]) => {
      graphViewToolbar.querySelectorAll(selector).forEach((element) => {
        const target = element.closest("label, button, summary, p, div") || element;
        if (!target.dataset.graphTooltip) target.dataset.graphTooltip = text;
      });
    });

    const tooltip = document.createElement("div");
    tooltip.className = "graph-filter-tooltip hidden";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);

    let tooltipTimer = null;
    let tooltipTarget = null;

    const hideTooltip = () => {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
      tooltipTarget = null;
      tooltip.classList.add("hidden");
    };

    const positionTooltip = (target) => {
      const rect = target.getBoundingClientRect();
      tooltip.style.left = `${Math.min(window.innerWidth - tooltip.offsetWidth - 12, Math.max(12, rect.left))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - tooltip.offsetHeight - 12, rect.bottom + 8)}px`;
    };

    const getTooltipTarget = (source) => {
      const directTarget = source?.closest?.("[data-graph-tooltip]");
      if (directTarget && graphViewToolbar.contains(directTarget)) return directTarget;
      const controlTarget = source?.closest?.("label, button, summary, input, select, p, div");
      if (!controlTarget || !graphViewToolbar.contains(controlTarget)) return null;
      const matchedTooltip = tooltipTextBySelector.find(([selector]) => {
        if (controlTarget.matches(selector)) return true;
        return !!controlTarget.querySelector?.(selector);
      });
      if (!matchedTooltip) return null;
      controlTarget.dataset.graphTooltip = matchedTooltip[1];
      return controlTarget;
    };

    const scheduleTooltip = (target) => {
      const tooltipText = target?.dataset?.graphTooltip;
      if (!tooltipText) return;
      hideTooltip();
      tooltipTarget = target;
      tooltipTimer = window.setTimeout(() => {
        if (tooltipTarget !== target) return;
        tooltip.textContent = tooltipText;
        tooltip.classList.remove("hidden");
        positionTooltip(target);
      }, 3000);
    };

    graphViewToolbar.addEventListener("mouseover", (event) => {
      const target = getTooltipTarget(event.target);
      if (target) scheduleTooltip(target);
    });
    graphViewToolbar.addEventListener("focusin", (event) => {
      const target = getTooltipTarget(event.target);
      if (target) scheduleTooltip(target);
    });
    graphViewToolbar.addEventListener("mouseout", (event) => {
      if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip();
    });
    graphViewToolbar.addEventListener("focusout", hideTooltip);
    graphViewToolbar.addEventListener("input", hideTooltip);
    graphViewToolbar.addEventListener("click", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
  }

  initializeGraphFilterTooltips();



      Object.assign(api, {
        setGraphFilterPanelCollapsed,
        setGraphViewMode,
        getGraphSnapshotTagNodeIds,
        getGraphFilterTagNodeIds,
        getGraphTagLabelFromId,
        parseGraphGroupQuery,
        graphQueryRequiresFileContent,
        isLightweightSavedGraphView,
        showLightweightSavedGraphTextSearchUnavailable,
        getGraphSnapshotFileCachedContent,
        getGraphFilterFileData,
        graphFileMatchesGroupQuery,
        getGraphGroupMatch,
        updateGraphGroup,
        deleteGraphGroup,
        getGraphGroupQueryContext,
        isGraphGroupAbsolutePathSuggestion,
        getGraphGroupRelativeFilePath,
        addGraphGroupPathFolderSuggestions,
        getGraphGroupSuggestionEntries,
        attachGraphGroupQuerySuggestions,
        renderGraphGroupsToolbar,
        updateGraphTagToolbar,
        resetActiveGraphViewToDefaults,
        updateActiveGraphViewConfig,
        animateActiveGraphView,
        initializeGraphFilterTooltips
      });
    }

    return api;
  };
})(window);
