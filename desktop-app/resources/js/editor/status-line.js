(function(window, document) {
  "use strict";

  function registerMarkdownViewerStatusLine(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const readingTimeElement = deps.readingTimeElement;
    const wordCountElement = deps.wordCountElement;
    const lineCountElement = deps.lineCountElement;
    const charCountElement = deps.charCountElement;
    const mobileReadingTime = deps.mobileReadingTime;
    const mobileWordCount = deps.mobileWordCount;
    const mobileCharCount = deps.mobileCharCount;
    const statusTipElement = deps.statusTipElement;
    const imageEditorStatusElement = deps.imageEditorStatusElement;
    const imageEditorDimensionsElement = imageEditorStatusElement?.querySelector(".image-editor-status-dimensions");
    const imageEditorZoomPercentElement = imageEditorStatusElement?.querySelector(".image-editor-status-zoom-percent");
    const imageEditorZoomSliderElement = imageEditorStatusElement?.querySelector(".image-editor-status-zoom-slider");
    const imageEditorZoomOutElement = imageEditorStatusElement?.querySelector(".image-editor-status-zoom-out");
    const imageEditorZoomInElement = imageEditorStatusElement?.querySelector(".image-editor-status-zoom-in");
    const imageEditorUnsavedElement = imageEditorStatusElement?.querySelector(".image-editor-status-unsaved");
    const graphZoomStatusElement = deps.graphZoomStatusElement;
    const graphZoomPercentElement = deps.graphZoomPercentElement;
    const appZoomStatusElement = deps.appZoomStatusElement;
    const appZoomPercentElement = deps.appZoomPercentElement;
    const graphPointsStatusElement = deps.graphPointsStatusElement;
    const graphPointsCountElement = deps.graphPointsCountElement;
    const graphCollapsedNodesStatusElement = deps.graphCollapsedNodesStatusElement;
    const graphEdgesCountElement = deps.graphEdgesCountElement;
    const graphClustersCountElement = deps.graphClustersCountElement;
    const graphClustersLabelElement = deps.graphClustersLabelElement;
    const graphCollapsedNodesCountElement = deps.graphCollapsedNodesCountElement;
    const graphSelectedNodesStatusElement = deps.graphSelectedNodesStatusElement;
    const graphSelectedNodesCountElement = deps.graphSelectedNodesCountElement;
    const editorEngineStatusElement = deps.editorEngineStatusElement;
    const editorEngineLabelElement = deps.editorEngineLabelElement;
    const editorTextpadStatusElement = deps.editorTextpadStatusElement;
    const editorTotalLengthElement = deps.editorTotalLengthElement;
    const editorTotalLinesElement = deps.editorTotalLinesElement;
    const editorCursorLineElement = deps.editorCursorLineElement;
    const editorCursorColumnElement = deps.editorCursorColumnElement;
    const editorPositionLabelElement = deps.editorPositionLabelElement;
    const editorPositionValueElement = deps.editorPositionValueElement;
    const formatGraphZoomPercent = deps.formatGraphZoomPercent;
    const getActiveTab = deps.getActiveTab;
    const getAppZoomPercent = deps.getAppZoomPercent || function() { return 100; };
    const getGraphZoomScaleFromLayout = deps.getGraphZoomScaleFromLayout;
    const getPreviewHoveredLinkUrl = deps.getPreviewHoveredLinkUrl;
    const setImageEditorZoom = deps.setImageEditorZoom || function() { return false; };
    const getActiveCodeMirrorEditor = deps.getActiveCodeMirrorEditor || function() { return null; };
    const getLargeFileDocumentStats = deps.getLargeFileDocumentStats || function() { return null; };
    const activeEditorCommands = deps.activeEditorCommands || null;
    const isEditorFocused = deps.isEditorFocused || function() {
      return activeEditorCommands?.isActiveEditorFocused?.() || document.activeElement === markdownEditor;
    };

    function getEditorText() {
      return activeEditorCommands?.getActiveEditorValue?.() ?? markdownEditor.value;
    }

    function getEditorSelection() {
      return activeEditorCommands?.getActiveEditorSelection?.() || {
        start: Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0),
        end: Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0)
      };
    }

    function getEditorLineColumn(text, position) {
      const safePosition = Math.max(0, Math.min(position, text.length));
      const beforeCursor = text.slice(0, safePosition);
      const line = beforeCursor.split("\n").length;
      const lastLineBreak = beforeCursor.lastIndexOf("\n");
      const column = safePosition - lastLineBreak;

      return { line, column };
    }

    function getEditorEngineDescriptor(activeTab) {
      if (!activeTab) {
        return {
          label: "None",
          title: "No active tab"
        };
      }

      if (activeTab.type === "large-file") {
        return {
          label: "Viewer",
          title: "Read-only virtual large-file viewer"
        };
      }

      if (activeTab.type === "graph") {
        return activeTab.graphViewKind === "health-report"
          ? { label: "Health", title: "Graph health report tab" }
          : { label: "Graph", title: "Interactive graph tab" };
      }

      const activeCodeMirrorEditor = getActiveCodeMirrorEditor();
      if (activeCodeMirrorEditor?.isEnabled?.()) {
        return {
          label: "CM",
          title: "Editable CodeMirror editor"
        };
      }

      return {
        label: "Text",
        title: "Editable textarea fallback"
      };
    }

    function updateEditorEngineStatus(activeTab) {
      if (!editorEngineStatusElement) return;

      const descriptor = getEditorEngineDescriptor(activeTab);
      editorEngineStatusElement.classList.remove("hidden");

      const labelElement = editorEngineLabelElement || editorEngineStatusElement.querySelector("span");
      if (labelElement) labelElement.textContent = descriptor.label;
      editorEngineStatusElement.title = descriptor.title;
      editorEngineStatusElement.dataset.editorEngine = descriptor.label.toLowerCase();
    }

    function getSelectionLineCount(text, selectionStart, selectionEnd) {
      if (selectionStart === selectionEnd) return 0;
      return text.slice(selectionStart, selectionEnd).split("\n").length;
    }

    function updateEditorTextpadStatus(activeTab) {
      if (!editorTextpadStatusElement) return;

      const shouldShowEditorStatus = !!activeTab && activeTab.type !== "graph" && isEditorFocused();
      editorTextpadStatusElement.classList.toggle("hidden", !shouldShowEditorStatus);
      if (!shouldShowEditorStatus) return;

      const text = getEditorText();
      const { start: selectionStart, end: selectionEnd } = getEditorSelection();
      const hasSelection = selectionStart !== selectionEnd;
      const cursorPosition = hasSelection ? selectionEnd : selectionStart;
      const cursorLocation = getEditorLineColumn(text, cursorPosition);
      const totalLines = text.length ? text.split("\n").length : 1;

      if (editorTotalLengthElement) editorTotalLengthElement.textContent = text.length.toLocaleString();
      if (editorTotalLinesElement) editorTotalLinesElement.textContent = totalLines.toLocaleString();
      if (editorCursorLineElement) editorCursorLineElement.textContent = cursorLocation.line.toLocaleString();
      if (editorCursorColumnElement) editorCursorColumnElement.textContent = cursorLocation.column.toLocaleString();

      if (editorPositionLabelElement) editorPositionLabelElement.textContent = hasSelection ? "Sel" : "Pos";
      if (editorPositionValueElement) {
        editorPositionValueElement.textContent = hasSelection
          ? `${(selectionEnd - selectionStart).toLocaleString()} | ${getSelectionLineCount(text, selectionStart, selectionEnd).toLocaleString()}`
          : (cursorPosition + 1).toLocaleString();
      }
    }

    function getDefaultStatusLabel() {
      const activeTab = getActiveTab();
      const hoveredLinkUrl = getPreviewHoveredLinkUrl();
      if (hoveredLinkUrl) return hoveredLinkUrl;
      if (activeTab?.type === "kubernetes-topology") return "Tip: select a node or relationship to inspect it.";
      return activeTab?.type === "graph"
        ? "Tip: hold ctrl / shift to see out / back links"
        : "Tip: drag in text files, use split preview, or open a folder to build a graph.";
    }

    const statusManager = window.registerMarkdownViewerStatusManager(app, {
      statusElement: statusTipElement,
      backgroundProcesses: deps.backgroundProcesses,
      getDefaultLabel: getDefaultStatusLabel
    });

    function requestImageEditorZoom(zoom) {
      const activeTab = getActiveTab();
      if (activeTab?.type !== "image-editor") return;
      setImageEditorZoom(activeTab, zoom);
    }

    imageEditorZoomSliderElement?.addEventListener("input", function() {
      requestImageEditorZoom(Number(imageEditorZoomSliderElement.value) / 100);
    });
    imageEditorZoomOutElement?.addEventListener("click", function() {
      const activeTab = getActiveTab();
      requestImageEditorZoom((Number(activeTab?.imageEditorState?.zoom) || 1) * 0.8);
    });
    imageEditorZoomInElement?.addEventListener("click", function() {
      const activeTab = getActiveTab();
      requestImageEditorZoom((Number(activeTab?.imageEditorState?.zoom) || 1) * 1.25);
    });

    function updateImageEditorStatus(activeTab) {
      if (!imageEditorStatusElement) return;

      const shouldShowImageEditorStatus = activeTab?.type === "image-editor";
      imageEditorStatusElement.classList.toggle("hidden", !shouldShowImageEditorStatus);
      if (!shouldShowImageEditorStatus) return;

      const width = Math.round(Number(activeTab.imageEditorSource?.width) || 0);
      const height = Math.round(Number(activeTab.imageEditorSource?.height) || 0);
      const zoom = Math.round((Number(activeTab.imageEditorState?.zoom) || 1) * 100);
      if (imageEditorDimensionsElement) imageEditorDimensionsElement.textContent = `${width} \u00d7 ${height}px`;
      if (imageEditorZoomPercentElement) imageEditorZoomPercentElement.textContent = `${zoom}%`;
      if (imageEditorZoomSliderElement) imageEditorZoomSliderElement.value = String(zoom);
      if (imageEditorZoomOutElement) imageEditorZoomOutElement.disabled = zoom <= Number(imageEditorZoomSliderElement?.min || 25);
      if (imageEditorZoomInElement) imageEditorZoomInElement.disabled = zoom >= Number(imageEditorZoomSliderElement?.max || 800);
      imageEditorUnsavedElement?.classList.toggle("hidden", !activeTab.imageEditorDirty);
    }

    function updateStatusLine(options = {}) {
      const activeTab = getActiveTab();
      const activeGraphTab = activeTab && activeTab.type === "graph" ? activeTab : null;
      const visiblePointCount = typeof options.visiblePointCount === "number"
        ? options.visiblePointCount
        : (typeof activeGraphTab?.visiblePointCount === "number" ? activeGraphTab.visiblePointCount : 0);
      const graphZoomScale = typeof options.graphZoomScale === "number"
        ? options.graphZoomScale
        : (typeof activeGraphTab?.graphZoomScale === "number"
          ? activeGraphTab.graphZoomScale
          : getGraphZoomScaleFromLayout(activeGraphTab?.graphLayout));
      const selectedGraphNodeCount = typeof options.selectedGraphNodeCount === "number"
        ? options.selectedGraphNodeCount
        : (typeof activeGraphTab?.selectedGraphNodeCount === "number" ? activeGraphTab.selectedGraphNodeCount : 0);
      const graphClusterCount = typeof options.graphClusterCount === "number"
        ? options.graphClusterCount
        : (typeof activeGraphTab?.graphClusterCount === "number" ? activeGraphTab.graphClusterCount : 0);
      const graphCollapsedNodeCount = typeof options.graphCollapsedNodeCount === "number"
        ? options.graphCollapsedNodeCount
        : (typeof activeGraphTab?.graphCollapsedNodeCount === "number" ? activeGraphTab.graphCollapsedNodeCount : 0);
      const graphEdgeCount = typeof options.graphEdgeCount === "number"
        ? options.graphEdgeCount
        : (typeof activeGraphTab?.graphEdgeCount === "number" ? activeGraphTab.graphEdgeCount : 0);

      statusManager.refresh();

      if (graphZoomStatusElement && graphZoomPercentElement) {
        graphZoomPercentElement.textContent = formatGraphZoomPercent(graphZoomScale);
        graphZoomStatusElement.classList.toggle("hidden", !activeGraphTab);
      }

      if (appZoomStatusElement && appZoomPercentElement) {
        const appZoomPercent = Number(getAppZoomPercent());
        const safeAppZoomPercent = Number.isFinite(appZoomPercent) && appZoomPercent > 0 ? Math.round(appZoomPercent) : 100;
        appZoomPercentElement.textContent = `${safeAppZoomPercent}%`;
        appZoomStatusElement.classList.toggle("hidden", safeAppZoomPercent === 100);
      }

      if (graphPointsStatusElement && graphPointsCountElement) {
        graphPointsCountElement.textContent = visiblePointCount.toLocaleString();
        graphPointsStatusElement.classList.toggle("hidden", !activeGraphTab);
      }

      if (graphCollapsedNodesStatusElement && graphClustersCountElement && graphCollapsedNodesCountElement) {
        if (graphEdgesCountElement) graphEdgesCountElement.textContent = graphEdgeCount.toLocaleString();
        graphClustersCountElement.textContent = graphClusterCount.toLocaleString();
        if (graphClustersLabelElement) graphClustersLabelElement.textContent = graphClusterCount === 1 ? "cluster" : "clusters";
        graphCollapsedNodesCountElement.textContent = graphCollapsedNodeCount.toLocaleString();
        graphCollapsedNodesStatusElement.classList.toggle("hidden", !activeGraphTab);
      }

      if (graphSelectedNodesStatusElement && graphSelectedNodesCountElement) {
        graphSelectedNodesCountElement.textContent = selectedGraphNodeCount.toLocaleString();
        graphSelectedNodesStatusElement.classList.toggle("hidden", !activeGraphTab || selectedGraphNodeCount <= 0);
      }

      updateImageEditorStatus(activeTab);
      updateEditorTextpadStatus(activeTab);
      updateEditorEngineStatus(activeTab);
    }

    function updateMobileStats() {
      if (mobileCharCount && charCountElement) mobileCharCount.textContent = charCountElement.textContent;
      if (mobileWordCount && wordCountElement) mobileWordCount.textContent = wordCountElement.textContent;
      if (mobileReadingTime && readingTimeElement) mobileReadingTime.textContent = readingTimeElement.textContent;
    }

    function getFallbackLargeFileStats(activeTab) {
      const sourceSize = Number(activeTab?.largeFileSource?.size ?? activeTab?.sourceFileSize ?? 0);
      return {
        charCount: Number.isFinite(sourceSize) ? sourceSize : 0,
        lineCount: 0,
        wordCount: 0,
        readingTimeMinutes: 0
      };
    }

    function getActiveDocumentStats() {
      const activeTab = getActiveTab();
      if (activeTab?.type === "graph") {
        return { charCount: 0, lineCount: 0, wordCount: 0, readingTimeMinutes: 0 };
      }
      if (activeTab?.type === "large-file") {
        return getLargeFileDocumentStats(activeTab) || activeTab.largeFileDocumentStats || getFallbackLargeFileStats(activeTab);
      }

      const text = getEditorText();
      const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
      return {
        charCount: text.length,
        lineCount: text.length ? text.split("\n").length : 1,
        wordCount,
        readingTimeMinutes: Math.ceil(wordCount / 200)
      };
    }

    function updateDocumentStats() {
      const { charCount, lineCount, wordCount, readingTimeMinutes } = getActiveDocumentStats();

      if (charCountElement) charCountElement.textContent = charCount.toLocaleString();
      if (lineCountElement) lineCountElement.textContent = (Number.isFinite(lineCount) ? lineCount : 0).toLocaleString();
      if (wordCountElement) wordCountElement.textContent = wordCount.toLocaleString();
      if (readingTimeElement) readingTimeElement.textContent = readingTimeMinutes;

      updateMobileStats();
      updateStatusLine();
    }

    window.addEventListener("markdownViewerAppZoomChanged", function() {
      updateStatusLine();
    });

    const api = {
      getEditorLineColumn,
      getSelectionLineCount,
      getActiveDocumentStats,
      updateDocumentStats,
      updateEditorEngineStatus,
      updateEditorTextpadStatus,
      updateMobileStats,
      updateStatusLine
    };

    app.registerModule("statusLine", api);
    return api;
  }

  window.registerMarkdownViewerStatusLine = registerMarkdownViewerStatusLine;
})(window, document);
