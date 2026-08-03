/**
 * API Client request and response split-pane resizing.
 */
(function(global) {
  "use strict";

  const DEFAULT_SPLIT_RATIO = 0.45;
  const MINIMUM_PANE_HEIGHT = 180;
  const KEYBOARD_RESIZE_STEP = 10;
  const LARGE_KEYBOARD_RESIZE_STEP = 40;

  /**
   * Register the API Client split-pane behavior.
   * @param {object} app - Application module registry.
   * @param {object} deps - Optional browser dependencies used by tests.
   * @returns {{bindResizableSplitPane: Function}} Split-pane binding API.
   */
  function registerMarkdownViewerApiClientSplitPane(app, deps = {}) {
    const documentRef = deps.document || global.document;

    function normalizeRatio(value) {
      const ratio = Number(value);
      return Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : DEFAULT_SPLIT_RATIO;
    }

    function getLayoutBounds(workspace, separator) {
      const workspaceRect = workspace.getBoundingClientRect();
      const separatorHeight = Math.max(0, separator.getBoundingClientRect?.().height || separator.offsetHeight || 0);
      const availableHeight = Math.max(1, workspaceRect.height - separatorHeight);
      const minimumRatio = Math.min(0.5, MINIMUM_PANE_HEIGHT / availableHeight);
      return {
        availableHeight,
        minimumRatio,
        maximumRatio: 1 - minimumRatio
      };
    }

    function clampRatio(ratio, bounds) {
      const numericRatio = Number(ratio);
      const ratioToClamp = Number.isFinite(numericRatio) ? numericRatio : DEFAULT_SPLIT_RATIO;
      return Math.min(bounds.maximumRatio, Math.max(bounds.minimumRatio, ratioToClamp));
    }

    /**
     * Mount live request/response resizing and return its lifecycle controller.
     * @param {object} options - Workspace, separator, initial ratio, and persistence callback.
     * @returns {{destroy: Function, getRatio: Function}|null} Controller for cleanup and inspection.
     */
    function bindResizableSplitPane(options = {}) {
      const workspace = options.workspace;
      const separator = options.separator;
      if (!workspace || !separator || !documentRef) return null;

      let currentRatio = normalizeRatio(options.initialRatio);
      let dragState = null;

      function applyRatio(nextRatio, shouldNotify = true) {
        const bounds = getLayoutBounds(workspace, separator);
        currentRatio = clampRatio(nextRatio, bounds);
        workspace.style.gridTemplateRows = `minmax(${MINIMUM_PANE_HEIGHT}px, ${currentRatio}fr) auto minmax(${MINIMUM_PANE_HEIGHT}px, ${1 - currentRatio}fr)`;
        separator.setAttribute("aria-valuemin", String(Math.round(bounds.minimumRatio * 100)));
        separator.setAttribute("aria-valuemax", String(Math.round(bounds.maximumRatio * 100)));
        separator.setAttribute("aria-valuenow", String(Math.round(currentRatio * 100)));
        separator.setAttribute("aria-valuetext", `${Math.round(currentRatio * 100)}% request, ${Math.round((1 - currentRatio) * 100)}% response`);
        if (shouldNotify) options.onRatioChange?.(currentRatio);
        return currentRatio;
      }

      function stopDragging(event) {
        if (!dragState) return;
        if (event?.pointerId !== undefined && dragState.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
        separator.releasePointerCapture?.(dragState.pointerId);
        dragState = null;
        documentRef.body?.classList?.remove("api-client-split-resizing");
        documentRef.removeEventListener("pointermove", handlePointerMove);
        documentRef.removeEventListener("pointerup", stopDragging);
        documentRef.removeEventListener("pointercancel", stopDragging);
      }

      function handlePointerMove(event) {
        if (!dragState) return;
        event.preventDefault?.();
        const bounds = getLayoutBounds(workspace, separator);
        const nextRequestHeight = dragState.startRequestHeight + ((Number(event.clientY) || 0) - dragState.startY);
        applyRatio(nextRequestHeight / bounds.availableHeight);
      }

      function handlePointerDown(event) {
        if (event?.isPrimary === false || (event?.button !== undefined && event.button !== 0)) return;
        event.preventDefault?.();
        const bounds = getLayoutBounds(workspace, separator);
        dragState = {
          pointerId: event?.pointerId,
          startY: Number(event?.clientY) || 0,
          startRequestHeight: currentRatio * bounds.availableHeight
        };
        separator.setPointerCapture?.(event?.pointerId);
        documentRef.body?.classList?.add("api-client-split-resizing");
        documentRef.addEventListener("pointermove", handlePointerMove);
        documentRef.addEventListener("pointerup", stopDragging);
        documentRef.addEventListener("pointercancel", stopDragging);
      }

      function handleKeydown(event) {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event?.key)) return;
        event.preventDefault?.();
        const bounds = getLayoutBounds(workspace, separator);
        if (event.key === "Home") return applyRatio(bounds.minimumRatio);
        if (event.key === "End") return applyRatio(bounds.maximumRatio);
        const step = event.shiftKey ? LARGE_KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP;
        const direction = event.key === "ArrowDown" ? 1 : -1;
        applyRatio(currentRatio + ((direction * step) / bounds.availableHeight));
      }

      function destroy() {
        stopDragging();
        separator.removeEventListener("pointerdown", handlePointerDown);
        separator.removeEventListener("keydown", handleKeydown);
      }

      separator.addEventListener("pointerdown", handlePointerDown);
      separator.addEventListener("keydown", handleKeydown);
      applyRatio(currentRatio, false);

      return { destroy, getRatio: () => currentRatio };
    }

    const api = { bindResizableSplitPane };
    app?.registerModule?.("apiClientSplitPane", api);
    return api;
  }

  global.registerMarkdownViewerApiClientSplitPane = registerMarkdownViewerApiClientSplitPane;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerApiClientSplitPane };
  }
})(typeof window !== "undefined" ? window : globalThis);
