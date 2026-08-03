// Floating zoom, pan, and edit controls for image file previews.
(function(global) {
  "use strict";

  global.registerMarkdownViewerImagePreviewControls = function registerMarkdownViewerImagePreviewControls(app, deps = {}) {
    const controlsByTabId = new Map();
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 8;

    function clampZoom(value) {
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value || 1)));
    }

    function createButton(icon, label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "image-preview-control";
      button.dataset.action = action;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
      return button;
    }

    function measureImage(element) {
      return {
        width: Math.max(1, Number(element.naturalWidth || element.videoWidth || element.clientWidth || 1)),
        height: Math.max(1, Number(element.naturalHeight || element.videoHeight || element.clientHeight || 1))
      };
    }

    function rememberViewportCenter(stage) {
      return {
        x: stage.scrollWidth > 0 ? (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth : 0.5,
        y: stage.scrollHeight > 0 ? (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight : 0.5
      };
    }

    function restoreViewportCenter(stage, center) {
      stage.scrollLeft = Math.max(0, center.x * stage.scrollWidth - stage.clientWidth / 2);
      stage.scrollTop = Math.max(0, center.y * stage.scrollHeight - stage.clientHeight / 2);
    }

    function applyImageZoom(state, next) {
      const { view, zoomLabel, zoomOut, zoomIn } = state;
      const center = rememberViewportCenter(view.stage);
      state.zoom = clampZoom(next);
      state.baseSize = measureImage(view.element);
      view.element.draggable = false;
      view.element.style.flex = "0 0 auto";
      view.element.style.width = `${Math.round(state.baseSize.width * state.zoom)}px`;
      view.element.style.height = `${Math.round(state.baseSize.height * state.zoom)}px`;
      view.element.style.maxWidth = "none";
      view.element.style.maxHeight = "none";
      view.element.style.objectFit = "contain";
      view.element.style.margin = "auto";
      zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
      zoomOut.disabled = state.zoom <= MIN_ZOOM;
      zoomIn.disabled = state.zoom >= MAX_ZOOM;
      requestAnimationFrame(() => restoreViewportCenter(view.stage, center));
    }

    function bindPan(state) {
      const stage = state.view.stage;
      let pan = null;
      const onPointerDown = (event) => {
        if (event.button !== 0 || state.toolbar.contains(event.target)) return;
        pan = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop
        };
        stage.classList.add("image-preview-stage-panning");
        stage.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      };
      const onPointerMove = (event) => {
        if (!pan || event.pointerId !== pan.pointerId) return;
        stage.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
        stage.scrollTop = pan.scrollTop - (event.clientY - pan.y);
        event.preventDefault();
      };
      const finishPan = (event) => {
        if (!pan || event.pointerId !== pan.pointerId) return;
        stage.releasePointerCapture?.(event.pointerId);
        stage.classList.remove("image-preview-stage-panning");
        pan = null;
      };
      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", finishPan);
      stage.addEventListener("pointercancel", finishPan);
      return () => {
        stage.removeEventListener("pointerdown", onPointerDown);
        stage.removeEventListener("pointermove", onPointerMove);
        stage.removeEventListener("pointerup", finishPan);
        stage.removeEventListener("pointercancel", finishPan);
        stage.classList.remove("image-preview-stage-panning");
      };
    }

    function mount(view, options = {}) {
      if (!view?.tabId || !view.stage || !view.element || !String(view.mimeType || "").startsWith("image/")) return null;
      destroy(view.tabId);
      const toolbar = document.createElement("div");
      toolbar.className = "image-preview-floating-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "Image preview controls");
      const zoomOut = createButton("bi-dash-lg", "Zoom out", "zoom-out");
      const zoomLabel = document.createElement("span");
      zoomLabel.className = "image-preview-zoom-label";
      zoomLabel.textContent = "100%";
      const zoomIn = createButton("bi-plus-lg", "Zoom in", "zoom-in");
      const edit = createButton("bi-pencil", "Edit image", "edit");
      const canEdit = options.canEdit === true;
      edit.disabled = !canEdit;
      if (!canEdit) edit.title = "Editing is available for PNG, JPEG, and WebP images.";
      toolbar.append(zoomOut, zoomLabel, zoomIn, edit);
      const toolbarHost = view.shell || view.stage;
      view.stage.classList.add("image-preview-stage-with-controls");
      toolbarHost.appendChild(toolbar);
      const state = { view, toolbar, zoomLabel, zoomOut, zoomIn, zoom: 1, baseSize: measureImage(view.element), cleanup: [] };
      controlsByTabId.set(view.tabId, state);
      state.cleanup.push(bindPan(state));

      toolbar.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "zoom-out") applyImageZoom(state, state.zoom / 1.25);
        else if (action === "zoom-in") applyImageZoom(state, state.zoom * 1.25);
        else if (action === "edit" && canEdit) options.onEdit?.();
      });
      if (!view.element.complete && view.element.addEventListener) {
        const onLoad = () => applyImageZoom(state, state.zoom);
        view.element.addEventListener("load", onLoad, { once: true });
        state.cleanup.push(() => view.element.removeEventListener("load", onLoad));
      }
      applyImageZoom(state, 1);
      return state;
    }

    function destroy(tabId) {
      const state = controlsByTabId.get(tabId);
      if (!state) return;
      state.cleanup?.forEach((cleanup) => cleanup());
      state.view?.stage?.classList.remove("image-preview-stage-with-controls");
      state.toolbar.remove();
      controlsByTabId.delete(tabId);
    }

    const api = { MIN_ZOOM, MAX_ZOOM, clampZoom, mount, destroy };
    app.services.imagePreviewControls = api;
    app.registerModule?.("imagePreviewControls", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
