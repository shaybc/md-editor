(function(global, document) {
  "use strict";

  const COMPARE_TEXT_FILE_EXTENSIONS = [
    "md", "markdown", "txt", "text", "java", "cs", "css", "js", "ts", "html", "xml",
    "csv", "yml", "yaml", "toml", "ini", "log", "json", "sql", "py", "php", "rs",
    "cpp", "c", "h", "hpp", "kt", "sh", "bat", "ps1"
  ];

  const COMPARE_TEXT_FILE_ACCEPT = {
    "text/markdown": [".md", ".markdown"],
    "text/plain": COMPARE_TEXT_FILE_EXTENSIONS
      .filter((extension) => extension !== "md" && extension !== "markdown" && extension !== "json")
      .map((extension) => `.${extension}`),
    "application/json": [".json"]
  };

  /**
   * Owns file selection, compare tab mounting, and explicit compare-side saves.
   */
  function registerMarkdownViewerFileCompare(app, deps) {
    const compareViews = new Map();
    const alertUser = deps.alert || function(message) { global.alert?.(message); };
    const normalizeEditorContent = deps.normalizeEditorContent || function(value) {
      return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    };

    function getFileName(path) {
      if (typeof deps.getFileName === "function") return deps.getFileName(path);
      return String(path || "").replace(/\\/g, "/").split("/").pop() || "";
    }

    function getSourceName(source) {
      const path = source?.path || source?.fullPath || "";
      return source?.name || source?.file?.name || source?.handle?.name || (path ? getFileName(path) : "file");
    }

    /**
     * Normalize a selected file into the compare source shape.
     */
    function normalizeCompareSource(source) {
      if (!source || typeof source !== "object") return null;
      const path = source.path || source.fullPath || null;
      const name = getSourceName(source);
      return {
        name,
        path,
        handle: source.handle || null,
        file: source.file || null,
        content: source.content
      };
    }

    function isBinaryText(content) {
      return /\u0000/.test(String(content || ""));
    }

    /**
     * Read a compare source as normalized text without opening an editor tab.
     */
    async function readCompareSourceContent(source) {
      if (!source) throw new Error("No compare file was provided.");
      if (source.content !== undefined) return normalizeEditorContent(source.content);
      const path = source.path || source.fullPath || null;
      if (deps.isNeutralinoRuntime?.() && path && deps.Neutralino?.filesystem?.readFile) {
        return normalizeEditorContent(await deps.Neutralino.filesystem.readFile(path));
      }
      let file = source.file || null;
      if (!file && source.handle?.getFile) file = await source.handle.getFile();
      if (!file?.text) throw new Error("The selected file cannot be read as text.");
      return normalizeEditorContent(await file.text());
    }

    /**
     * Load and validate one side of a file comparison.
     */
    async function loadCompareSource(source) {
      const normalizedSource = normalizeCompareSource(source);
      if (!normalizedSource) throw new Error("No compare file was provided.");
      const content = await readCompareSourceContent(normalizedSource);
      if (isBinaryText(content)) {
        throw new Error(`"${normalizedSource.name}" appears to be a binary file and cannot be compared as text.`);
      }
      return { ...normalizedSource, content };
    }

    function getComparePickerTitle(side) {
      return side === "left" ? "Select first file to compare" : "Select second file to compare";
    }

    /**
     * selects files ro compare using Neutralino
     */
    async function selectCompareSourceWithNeutralino(side) {
      const selected = await deps.Neutralino.os.showOpenDialog(getComparePickerTitle(side), {
        multiSelections: false,
        filters: [
          { name: "Text-based files", extensions: COMPARE_TEXT_FILE_EXTENSIONS },
          { name: "All files", extensions: ["*"] }
        ]
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return { name: getFileName(selectedPath), path: selectedPath };
    }

    async function selectCompareSourceWithFilePicker() {
      const handles = await global.showOpenFilePicker({
        multiple: false,
        types: [{ description: "Text-based files", accept: COMPARE_TEXT_FILE_ACCEPT }],
        excludeAcceptAllOption: false
      });
      if (!handles?.length) return null;
      const handle = handles[0];
      return { name: handle.name, handle };
    }

    function selectCompareSourceWithInput() {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".md,.markdown,.txt,.text,.java,.cs,.css,.js,.ts,.html,.xml,.csv,.yml,.yaml,.toml,.ini,.log,.json,.sql,.py,.php,.rs,.cpp,.c,.h,.hpp,.kt,.sh,.bat,.ps1,text/*,application/json";
        input.className = "file-input";
        input.addEventListener("change", () => {
          const files = Array.from(input.files || []);
          input.remove();
          if (!files.length) {
            resolve(null);
            return;
          }
          const file = files[0];
          resolve({ name: file.name, file });
        }, { once: true });
        input.addEventListener("cancel", () => {
          input.remove();
          resolve(null);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
      });
    }

    async function selectCompareSource(side) {
      if (deps.isNeutralinoRuntime?.() && deps.Neutralino?.os?.showOpenDialog) {
        return selectCompareSourceWithNeutralino(side);
      }
      if (typeof global.showOpenFilePicker === "function") {
        try {
          return await selectCompareSourceWithFilePicker(side);
        } catch (error) {
          if (error?.name === "AbortError") return null;
          console.warn("Compare file picker unavailable, using fallback input.", error);
        }
      }
      return selectCompareSourceWithInput(side);
    }

    async function selectCompareSources() {
      const leftSource = await selectCompareSource("left");
      if (!leftSource) return null;
      const rightSource = await selectCompareSource("right");
      if (!rightSource) return null;
      return [leftSource, rightSource];
    }

    function getCompareTabTitle(leftSource, rightSource) {
      return `${leftSource.name || "Left"} <-> ${rightSource.name || "Right"}`;
    }

    /**
     * Create the tab payload used by the compare tab view.
     */
    function createCompareTabDescriptor(leftSource, rightSource) {
      return {
        title: getCompareTabTitle(leftSource, rightSource),
        left: {
          name: leftSource.name,
          path: leftSource.path || null,
          handle: leftSource.handle || null,
          content: leftSource.content
        },
        right: {
          name: rightSource.name,
          path: rightSource.path || null,
          handle: rightSource.handle || null,
          content: rightSource.content
        },
        viewMode: "side-by-side"
      };
    }

    /**
     * Load two provided file sources and open them in a compare tab.
     */
    async function openCompareFiles(leftSource, rightSource) {
      try {
        const loadedLeftSource = await loadCompareSource(leftSource);
        const loadedRightSource = await loadCompareSource(rightSource);
        const descriptor = createCompareTabDescriptor(loadedLeftSource, loadedRightSource);
        const tab = deps.openFileCompareInTab?.(descriptor);
        if (!tab) alertUser("Unable to open the compare tab.");
        return tab || null;
      } catch (error) {
        if (error?.name === "AbortError") return null;
        console.error("Failed to compare files:", error);
        alertUser(error?.message || "Unable to compare the selected files.");
        return null;
      }
    }

    /**
     * Pick two files and open them in a compare tab.
     */
    async function openCompareFilesFromPicker() {
      try {
        const sources = await selectCompareSources();
        if (!sources) return null;
        return openCompareFiles(sources[0], sources[1]);
      } catch (error) {
        if (error?.name === "AbortError") return null;
        console.error("Failed to compare files:", error);
        alertUser(error?.message || "Unable to compare the selected files.");
        return null;
      }
    }

    function createElement(tagName, className, textContent) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (textContent !== undefined) element.textContent = textContent;
      return element;
    }

    function createToolbarButton(iconClass, label, title) {
      const button = createElement("button", "tool-button file-compare-button");
      button.type = "button";
      button.title = title || label;
      button.setAttribute("aria-label", title || label);
      const icon = createElement("i", `bi ${iconClass}`);
      icon.setAttribute("aria-hidden", "true");
      button.append(icon, document.createTextNode(label ? ` ${label}` : ""));
      return button;
    }

    function joinConflictLines(lines) {
      return (Array.isArray(lines) ? lines : []).join("\n");
    }

    function parseGitConflictDocument(content) {
      const lines = normalizeEditorContent(content).split("\n");
      const segments = [];
      const conflicts = [];
      for (let index = 0; index < lines.length; index += 1) {
        const marker = lines[index] || "";
        if (!marker.startsWith("<<<<<<<")) {
          segments.push({ type: "text", text: marker });
          continue;
        }
        const currentLines = [];
        const stashedLines = [];
        index += 1;
        while (index < lines.length && !(lines[index] || "").startsWith("=======")) {
          currentLines.push(lines[index]);
          index += 1;
        }
        if (index >= lines.length) {
          segments.push({ type: "text", text: marker });
          currentLines.forEach((line) => segments.push({ type: "text", text: line }));
          break;
        }
        index += 1;
        while (index < lines.length && !(lines[index] || "").startsWith(">>>>>>>")) {
          stashedLines.push(lines[index]);
          index += 1;
        }
        if (index >= lines.length) {
          segments.push({ type: "text", text: marker });
          currentLines.forEach((line) => segments.push({ type: "text", text: line }));
          segments.push({ type: "text", text: "=======" });
          stashedLines.forEach((line) => segments.push({ type: "text", text: line }));
          break;
        }
        const conflict = {
          index: conflicts.length,
          current: joinConflictLines(currentLines),
          stashed: joinConflictLines(stashedLines)
        };
        conflicts.push(conflict);
        segments.push({ type: "conflict", index: conflict.index });
      }
      return { conflicts, segments };
    }

    function getConflictChoiceContent(conflict, choice) {
      if (choice === "stashed") return conflict.stashed;
      if (choice === "both") return [conflict.current, conflict.stashed].filter((value) => value !== "").join("\n");
      return conflict.current;
    }

    function buildResolvedConflictContent(model, choices) {
      return (model?.segments || []).map((segment) => {
        if (segment.type !== "conflict") return segment.text;
        const conflict = model.conflicts[segment.index];
        return getConflictChoiceContent(conflict, choices[segment.index] || "current");
      }).join("\n");
    }

    function resolveCompareLanguage(tab) {
      const leftPath = tab?.fileCompare?.left?.path || tab?.fileCompare?.left?.name || "";
      const rightPath = tab?.fileCompare?.right?.path || tab?.fileCompare?.right?.name || leftPath;
      const language = deps.languageRegistry?.resolveLanguageForPath?.(leftPath || rightPath, {
        content: tab?.fileCompare?.left?.content || tab?.fileCompare?.right?.content || ""
      }) || deps.languageRegistry?.resolveLanguageForPath?.(rightPath);
      return language?.codeMirrorLanguage || "text";
    }

    function updateToolbarState(viewState) {
      const differenceCount = viewState.compareEditor?.getDifferenceCount?.() || 0;
      const isInlineMode = viewState.compareEditor?.getMode?.() === "inline";
      const isConflictResolver = !!viewState.tab?.fileCompare?.gitConflict?.filePath;
      const isReadOnly = viewState.tab?.fileCompare?.readOnly === true;
      viewState.status.textContent = isReadOnly
        ? `Approval preview · ${differenceCount === 1 ? "1 difference" : `${differenceCount} differences`}`
        : isConflictResolver
        ? "Resolve conflicts on the right, then save"
        : (differenceCount === 1 ? "1 difference" : `${differenceCount} differences`);
      viewState.previousButton.disabled = differenceCount === 0;
      viewState.nextButton.disabled = differenceCount === 0;
      viewState.applyLeftButton.disabled = isReadOnly || differenceCount === 0 || isInlineMode;
      viewState.applyRightButton.disabled = isReadOnly || differenceCount === 0;
      viewState.saveLeftButton.disabled = isReadOnly || !viewState.tab?.fileCompare?.left?.path || !viewState.compareEditor?.canSaveLeft?.();
      viewState.saveRightButton.disabled = isReadOnly || !viewState.tab?.fileCompare?.right?.path || !viewState.compareEditor?.canSaveRight?.();
    }

    async function ensureCompareEditorAvailable() {
      if (!global.MarkdownViewerCodeMirror?.createMergeEditor && typeof deps.loadCodeMirrorBundle === "function") {
        await deps.loadCodeMirrorBundle();
      }
      if (!global.MarkdownViewerCodeMirror?.createMergeEditor) {
        throw new Error("CodeMirror merge editor is unavailable.");
      }
    }

    function syncTabContentFromEditor(tab, compareEditor) {
      if (!tab?.fileCompare || !compareEditor) return;
      tab.fileCompare.left.content = compareEditor.getLeftValue();
      tab.fileCompare.right.content = compareEditor.getRightValue();
    }

    async function saveCompareSide(tab, compareEditor, side) {
      if (tab?.fileCompare?.readOnly === true) return false;
      syncTabContentFromEditor(tab, compareEditor);
      const source = side === "left" ? tab?.fileCompare?.left : tab?.fileCompare?.right;
      const content = side === "left" ? compareEditor.getLeftValue() : compareEditor.getRightValue();
      if (!source) throw new Error("No compare side is available to save.");
      if (deps.isNeutralinoRuntime?.() && source.path && deps.Neutralino?.filesystem?.writeFile) {
        deps.suppressFolderWatcher?.(1000);
        try {
          await deps.Neutralino.filesystem.writeFile(source.path, content);
        } finally {
          deps.suppressFolderWatcher?.(500);
        }
        source.savedContent = content;
        await deps.reloadOpenTabsFromDisk?.(source.path);
        if (side === "right" && tab?.fileCompare?.gitConflict?.filePath) {
          await deps.markWorkspaceGitConflictResolved?.(tab.fileCompare.gitConflict.filePath);
        }
        deps.refreshWorkspaceGitStatus?.();
        return true;
      }
      if (source.handle?.createWritable) {
        const writable = await source.handle.createWritable();
        await writable.write(content);
        await writable.close();
        source.savedContent = content;
        await deps.reloadOpenTabsFromDisk?.(source.path);
        if (side === "right" && tab?.fileCompare?.gitConflict?.filePath) {
          await deps.markWorkspaceGitConflictResolved?.(tab.fileCompare.gitConflict.filePath);
        }
        deps.refreshWorkspaceGitStatus?.();
        return true;
      }
      throw new Error(`"${source.name || "This file"}" cannot be saved from this runtime.`);
    }

    async function saveConflictResolution(tab, content) {
      const source = tab?.fileCompare?.right;
      if (!source) throw new Error("No conflict resolution target is available.");
      if (deps.isNeutralinoRuntime?.() && source.path && deps.Neutralino?.filesystem?.writeFile) {
        deps.suppressFolderWatcher?.(1000);
        try {
          await deps.Neutralino.filesystem.writeFile(source.path, content);
        } finally {
          deps.suppressFolderWatcher?.(500);
        }
        source.content = content;
        source.savedContent = content;
        await deps.reloadOpenTabsFromDisk?.(source.path);
        await deps.markWorkspaceGitConflictResolved?.(tab.fileCompare.gitConflict.filePath);
        deps.refreshWorkspaceGitStatus?.();
        return true;
      }
      if (source.handle?.createWritable) {
        const writable = await source.handle.createWritable();
        await writable.write(content);
        await writable.close();
        source.content = content;
        source.savedContent = content;
        await deps.reloadOpenTabsFromDisk?.(source.path);
        await deps.markWorkspaceGitConflictResolved?.(tab.fileCompare.gitConflict.filePath);
        deps.refreshWorkspaceGitStatus?.();
        return true;
      }
      throw new Error(`"${source.name || "This file"}" cannot be saved from this runtime.`);
    }

    function renderMountFailure(root, error) {
      root.textContent = "";
      const failure = createElement("div", "editor-mount-failure");
      const title = createElement("h2", "", "Compare editor failed to load");
      const body = createElement("p", "", error?.message || "The compare editor could not be created.");
      failure.append(title, body);
      root.appendChild(failure);
    }

    function renderConflictChoice(label, content, tone) {
      const section = createElement("div", `git-conflict-choice${tone ? ` is-${tone}` : ""}`);
      const title = createElement("div", "git-conflict-choice-title", label);
      const body = createElement("pre", "git-conflict-choice-content", content || "(empty)");
      section.append(title, body);
      return section;
    }

    function mountGitConflictResolverTab(tab, root) {
      root.textContent = "";
      const model = parseGitConflictDocument(tab.fileCompare?.right?.content || "");
      const choices = model.conflicts.map(() => "current");
      const shell = createElement("div", "file-compare-viewer git-conflict-resolver");
      const toolbar = createElement("div", "file-compare-toolbar git-conflict-toolbar");
      const saveButton = createToolbarButton("bi-check2-square", "Save Resolution", "Save the resolved file");
      const status = createElement("div", "file-compare-status", "");
      const banner = createElement("div", "git-conflict-banner");
      const layout = createElement("div", "git-conflict-layout");
      const choicesPanel = createElement("div", "git-conflict-choices-panel");
      const resultPanel = createElement("div", "git-conflict-result-panel");
      const resultTitle = createElement("div", "git-conflict-result-title", "Resolved Result");
      const resultEditor = createElement("textarea", "git-conflict-result-editor");
      resultEditor.spellcheck = false;
      resultEditor.value = buildResolvedConflictContent(model, choices);

      const conflictCount = model.conflicts.length;
      banner.textContent = conflictCount
        ? `${tab.fileCompare?.gitConflict?.filePath || "This file"} has ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}. Choose a resolution for each conflict, then save.`
        : "No conflict markers were found. Review the file and save the resolution when ready.";
      status.textContent = conflictCount ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} to resolve` : "Ready to save";
      toolbar.append(saveButton, status);

      function refreshResult() {
        resultEditor.value = buildResolvedConflictContent(model, choices);
        tab.fileCompare.right.content = resultEditor.value;
      }

      model.conflicts.forEach((conflict) => {
        const card = createElement("section", "git-conflict-card");
        const title = createElement("h3", "git-conflict-card-title", `Conflict ${conflict.index + 1}`);
        const actions = createElement("div", "git-conflict-card-actions");
        const currentButton = createElement("button", "workspace-git-text-button", "Use Current");
        const stashedButton = createElement("button", "workspace-git-text-button", "Use Stashed");
        const bothButton = createElement("button", "workspace-git-text-button", "Use Both");
        [currentButton, stashedButton, bothButton].forEach((button) => {
          button.type = "button";
        });
        currentButton.addEventListener("click", () => {
          choices[conflict.index] = "current";
          refreshResult();
        });
        stashedButton.addEventListener("click", () => {
          choices[conflict.index] = "stashed";
          refreshResult();
        });
        bothButton.addEventListener("click", () => {
          choices[conflict.index] = "both";
          refreshResult();
        });
        actions.append(currentButton, stashedButton, bothButton);
        card.append(
          title,
          renderConflictChoice("Current workspace", conflict.current, "current"),
          renderConflictChoice("Stashed changes", conflict.stashed, "stashed"),
          actions
        );
        choicesPanel.appendChild(card);
      });

      if (!model.conflicts.length) {
        choicesPanel.appendChild(createElement("div", "git-conflict-empty", "No structured conflict choices are available for this file."));
      }

      resultEditor.addEventListener("input", () => {
        tab.fileCompare.right.content = resultEditor.value;
      });
      saveButton.addEventListener("click", async () => {
        try {
          saveButton.disabled = true;
          await saveConflictResolution(tab, resultEditor.value);
          status.textContent = "Resolution saved and staged";
        } catch (error) {
          console.error("Failed to save conflict resolution:", error);
          alertUser(error?.message || "Unable to save the conflict resolution.");
        } finally {
          saveButton.disabled = false;
        }
      });

      resultPanel.append(resultTitle, resultEditor);
      layout.append(choicesPanel, resultPanel);
      shell.append(toolbar, banner, layout);
      root.appendChild(shell);
      const viewState = { tabId: tab.id, tab, root, shell, resultEditor };
      compareViews.set(tab.id, viewState);
      return viewState;
    }

    /**
     * Mount the compare editor UI for a file-compare tab.
     */
    async function mountFileCompareTab(tab, root) {
      if (!tab?.id || !root) return null;
      const existingView = compareViews.get(tab.id);
      if (existingView?.root?.isConnected) {
        if (existingView.compareEditor) updateToolbarState(existingView);
        return existingView;
      }
      if (tab?.fileCompare?.gitConflict?.filePath) return mountGitConflictResolverTab(tab, root);

      root.textContent = "";
      const shell = createElement("div", "file-compare-viewer");
      const toolbar = createElement("div", "file-compare-toolbar");
      const titleRow = createElement("div", "file-compare-title-row");
      const leftTitle = createElement("div", "file-compare-title");
      const rightTitle = createElement("div", "file-compare-title");
      const modeSelect = createElement("select", "file-compare-mode-select");
      const editorHost = createElement("div", "file-compare-editor-host");
      const status = createElement("div", "file-compare-status", "Loading compare editor...");
      const previousButton = createToolbarButton("bi-arrow-up", "", "Previous difference");
      const nextButton = createToolbarButton("bi-arrow-down", "", "Next difference");
      const applyLeftButton = createToolbarButton("bi-arrow-right", "", "Apply current left change to right");
      const applyRightButton = createToolbarButton("bi-arrow-left", "", "Apply current right change to left");
      const saveLeftButton = createToolbarButton("bi-save", "Save Left", "Save the left compare buffer");
      const saveRightButton = createToolbarButton("bi-save2", "Save Right", "Save the right compare buffer");

      leftTitle.innerHTML = '<i class="bi bi-file-earmark-text" aria-hidden="true"></i>';
      leftTitle.appendChild(createElement("span", "", tab.fileCompare?.left?.name || "Left file"));
      rightTitle.innerHTML = '<i class="bi bi-file-earmark-text" aria-hidden="true"></i>';
      rightTitle.appendChild(createElement("span", "", tab.fileCompare?.right?.name || "Right file"));
      modeSelect.setAttribute("aria-label", "Compare view mode");
      modeSelect.append(
        new Option("Side-by-side", "side-by-side"),
        new Option("Inline", "inline")
      );
      modeSelect.value = tab.fileCompare?.viewMode || "side-by-side";

      toolbar.append(
        modeSelect,
        previousButton,
        nextButton,
        applyLeftButton,
        applyRightButton,
        saveLeftButton,
        saveRightButton,
        status
      );
      titleRow.append(leftTitle, rightTitle);
      shell.append(toolbar, titleRow, editorHost);
      root.appendChild(shell);

      const viewState = {
        tabId: tab.id,
        tab,
        root,
        shell,
        toolbar,
        editorHost,
        modeSelect,
        status,
        previousButton,
        nextButton,
        applyLeftButton,
        applyRightButton,
        saveLeftButton,
        saveRightButton,
        compareEditor: null
      };
      compareViews.set(tab.id, viewState);

      try {
        await ensureCompareEditorAvailable();
        viewState.compareEditor = global.MarkdownViewerCodeMirror.createMergeEditor({
          parent: editorHost,
          leftDoc: tab.fileCompare?.left?.content || "",
          rightDoc: tab.fileCompare?.right?.content || "",
          language: resolveCompareLanguage(tab),
          mode: modeSelect.value,
          onUpdate: function() {
            syncTabContentFromEditor(tab, viewState.compareEditor);
            updateToolbarState(viewState);
          }
        });
        updateToolbarState(viewState);
      } catch (error) {
        console.error("Failed to mount compare editor:", error);
        renderMountFailure(root, error);
        return viewState;
      }

      modeSelect.addEventListener("change", function() {
        syncTabContentFromEditor(tab, viewState.compareEditor);
        tab.fileCompare.viewMode = modeSelect.value;
        viewState.compareEditor?.setMode?.(modeSelect.value);
        updateToolbarState(viewState);
      });
      previousButton.addEventListener("click", function() {
        viewState.compareEditor?.goToPreviousDifference?.();
      });
      nextButton.addEventListener("click", function() {
        viewState.compareEditor?.goToNextDifference?.();
      });
      applyLeftButton.addEventListener("click", function() {
        if (tab.fileCompare?.readOnly === true) return;
        viewState.compareEditor?.applyCurrentChunk?.("left-to-right");
        updateToolbarState(viewState);
      });
      applyRightButton.addEventListener("click", function() {
        if (tab.fileCompare?.readOnly === true) return;
        viewState.compareEditor?.applyCurrentChunk?.("right-to-left");
        updateToolbarState(viewState);
      });
      saveLeftButton.addEventListener("click", async function() {
        try {
          await saveCompareSide(tab, viewState.compareEditor, "left");
          updateToolbarState(viewState);
        } catch (error) {
          console.error("Failed to save left compare file:", error);
          alertUser(error?.message || "Unable to save the left file.");
        }
      });
      saveRightButton.addEventListener("click", async function() {
        try {
          await saveCompareSide(tab, viewState.compareEditor, "right");
          updateToolbarState(viewState);
        } catch (error) {
          console.error("Failed to save right compare file:", error);
          alertUser(error?.message || "Unable to save the right file.");
        }
      });

      return viewState;
    }

    /**
     * Destroy the mounted compare editor for a closed tab.
     */
    function destroyFileCompareTab(tabId) {
      const viewState = compareViews.get(tabId);
      if (!viewState) return;
      viewState.compareEditor?.destroy?.();
      compareViews.delete(tabId);
    }

    const api = {
      normalizeCompareSource,
      readCompareSourceContent,
      loadCompareSource,
      createCompareTabDescriptor,
      openCompareFiles,
      openCompareFilesFromPicker,
      mountFileCompareTab,
      destroyFileCompareTab,
      getMountedCompareCount() {
        return compareViews.size;
      }
    };

    app.registerModule?.("fileCompare", api);
    if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerFileCompare };
    return api;
  }

  global.registerMarkdownViewerFileCompare = registerMarkdownViewerFileCompare;
})(typeof window !== "undefined" ? window : globalThis, document);
