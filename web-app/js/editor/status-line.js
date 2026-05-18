(function(window, document) {
  "use strict";

  function registerMarkdownViewerStatusLine(app, deps) {
    const markdownEditor = deps.markdownEditor;
    const readingTimeElement = deps.readingTimeElement;
    const wordCountElement = deps.wordCountElement;
    const charCountElement = deps.charCountElement;
    const mobileReadingTime = deps.mobileReadingTime;
    const mobileWordCount = deps.mobileWordCount;
    const mobileCharCount = deps.mobileCharCount;
    const statusTipElement = deps.statusTipElement;
    const graphZoomStatusElement = deps.graphZoomStatusElement;
    const graphZoomPercentElement = deps.graphZoomPercentElement;
    const graphPointsStatusElement = deps.graphPointsStatusElement;
    const graphPointsCountElement = deps.graphPointsCountElement;
    const graphCollapsedNodesStatusElement = deps.graphCollapsedNodesStatusElement;
    const graphClustersCountElement = deps.graphClustersCountElement;
    const graphClustersLabelElement = deps.graphClustersLabelElement;
    const graphCollapsedNodesCountElement = deps.graphCollapsedNodesCountElement;
    const graphSelectedNodesStatusElement = deps.graphSelectedNodesStatusElement;
    const graphSelectedNodesCountElement = deps.graphSelectedNodesCountElement;
    const editorTextpadStatusElement = deps.editorTextpadStatusElement;
    const editorTotalLengthElement = deps.editorTotalLengthElement;
    const editorTotalLinesElement = deps.editorTotalLinesElement;
    const editorCursorLineElement = deps.editorCursorLineElement;
    const editorCursorColumnElement = deps.editorCursorColumnElement;
    const editorPositionLabelElement = deps.editorPositionLabelElement;
    const editorPositionValueElement = deps.editorPositionValueElement;
    const formatGraphZoomPercent = deps.formatGraphZoomPercent;
    const getActiveTab = deps.getActiveTab;
    const getGraphZoomScaleFromLayout = deps.getGraphZoomScaleFromLayout;
    const getPreviewHoveredLinkUrl = deps.getPreviewHoveredLinkUrl;

    function getEditorLineColumn(text, position) {
      const safePosition = Math.max(0, Math.min(position, text.length));
      const beforeCursor = text.slice(0, safePosition);
      const line = beforeCursor.split("\n").length;
      const lastLineBreak = beforeCursor.lastIndexOf("\n");
      const column = safePosition - lastLineBreak;

      return { line, column };
    }

    function getSelectionLineCount(text, selectionStart, selectionEnd) {
      if (selectionStart === selectionEnd) return 0;
      return text.slice(selectionStart, selectionEnd).split("\n").length;
    }

    function updateEditorTextpadStatus(activeTab) {
      if (!editorTextpadStatusElement) return;

      const shouldShowEditorStatus = !!activeTab && activeTab.type !== "graph" && document.activeElement === markdownEditor;
      editorTextpadStatusElement.classList.toggle("hidden", !shouldShowEditorStatus);
      if (!shouldShowEditorStatus) return;

      const text = markdownEditor.value;
      const selectionStart = Math.min(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
      const selectionEnd = Math.max(markdownEditor.selectionStart || 0, markdownEditor.selectionEnd || 0);
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

      if (statusTipElement) {
        statusTipElement.textContent = getPreviewHoveredLinkUrl() || (activeGraphTab
          ? "Tip: hold ctrl / shift to see out / back links"
          : "Tip: drag in text files, use split preview, or open a folder to build a graph.");
      }

      if (graphZoomStatusElement && graphZoomPercentElement) {
        graphZoomPercentElement.textContent = formatGraphZoomPercent(graphZoomScale);
        graphZoomStatusElement.classList.toggle("hidden", !activeGraphTab);
      }

      if (graphPointsStatusElement && graphPointsCountElement) {
        graphPointsCountElement.textContent = visiblePointCount.toLocaleString();
        graphPointsStatusElement.classList.toggle("hidden", !activeGraphTab);
      }

      if (graphCollapsedNodesStatusElement && graphClustersCountElement && graphCollapsedNodesCountElement) {
        graphClustersCountElement.textContent = graphClusterCount.toLocaleString();
        if (graphClustersLabelElement) graphClustersLabelElement.textContent = graphClusterCount === 1 ? "cluster" : "clusters";
        graphCollapsedNodesCountElement.textContent = graphCollapsedNodeCount.toLocaleString();
        graphCollapsedNodesStatusElement.classList.toggle("hidden", !activeGraphTab || graphClusterCount <= 0 || graphCollapsedNodeCount <= 0);
      }

      if (graphSelectedNodesStatusElement && graphSelectedNodesCountElement) {
        graphSelectedNodesCountElement.textContent = selectedGraphNodeCount.toLocaleString();
        graphSelectedNodesStatusElement.classList.toggle("hidden", !activeGraphTab || selectedGraphNodeCount <= 0);
      }

      updateEditorTextpadStatus(activeTab);
    }

    function updateMobileStats() {
      if (mobileCharCount && charCountElement) mobileCharCount.textContent = charCountElement.textContent;
      if (mobileWordCount && wordCountElement) mobileWordCount.textContent = wordCountElement.textContent;
      if (mobileReadingTime && readingTimeElement) mobileReadingTime.textContent = readingTimeElement.textContent;
    }

    function updateDocumentStats() {
      const text = markdownEditor.value;
      const charCount = text.length;
      const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
      const readingTimeMinutes = Math.ceil(wordCount / 200);

      if (charCountElement) charCountElement.textContent = charCount.toLocaleString();
      if (wordCountElement) wordCountElement.textContent = wordCount.toLocaleString();
      if (readingTimeElement) readingTimeElement.textContent = readingTimeMinutes;

      updateMobileStats();
      updateStatusLine();
    }

    const api = {
      getEditorLineColumn,
      getSelectionLineCount,
      updateDocumentStats,
      updateEditorTextpadStatus,
      updateMobileStats,
      updateStatusLine
    };

    app.registerModule("statusLine", api);
    return api;
  }

  window.registerMarkdownViewerStatusLine = registerMarkdownViewerStatusLine;
})(window, document);
