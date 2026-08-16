// Shared pointer-drag behavior for app dialogs and notification modals.
(function(global) {
  "use strict";

  /** Keeps a dialog box fully inside the available viewport whenever possible. */
  function clampDialogPosition(left, top, width, height, viewportWidth, viewportHeight) {
    return {
      left: Math.min(Math.max(0, left), Math.max(0, viewportWidth - width)),
      top: Math.min(Math.max(0, top), Math.max(0, viewportHeight - height))
    };
  }

  /** Owns draggable title handles for every accessible modal dialog. */
  class DraggableDialogController {
    constructor(documentRef, windowRef) {
      this.document = documentRef;
      this.window = windowRef;
      this.activeDrag = null;
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.document.addEventListener("pointerdown", this.handlePointerDown, true);
      this.window.addEventListener("pointermove", this.handlePointerMove, true);
      this.window.addEventListener("pointerup", this.handlePointerUp, true);
      this.window.addEventListener("pointercancel", this.handlePointerUp, true);
      this.window.addEventListener("resize", this.handleResize);
      this.decorateDialogs(this.document);
      this.observer = typeof global.MutationObserver === "function"
        ? new global.MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => this.decorateDialogs(node))))
        : null;
      this.observer?.observe(this.document.documentElement || this.document.body, { childList: true, subtree: true });
    }

    decorateDialogs(root) {
      const dialogs = [];
      if (root?.matches?.('[role="dialog"][aria-modal="true"][aria-labelledby]')) dialogs.push(root);
      dialogs.push(...Array.from(root?.querySelectorAll?.('[role="dialog"][aria-modal="true"][aria-labelledby]') || []));
      dialogs.forEach((dialog) => {
        const title = this.document.getElementById(dialog.getAttribute("aria-labelledby"));
        if (!title || !dialog.contains(title)) return;
        const header = title.closest("header");
        const handle = header && dialog.contains(header) ? header : title;
        handle.classList.add("app-dialog-drag-handle");
      });
    }

    resolveDragTarget(eventTarget) {
      const handle = eventTarget?.closest?.(".app-dialog-drag-handle");
      if (!handle) return null;
      if (eventTarget.closest?.("button, a, input, select, textarea, [contenteditable='true'], [role='button']")) return null;
      const dialog = handle.closest('[role="dialog"][aria-modal="true"]');
      if (!dialog) return null;
      if (!dialog.classList.contains("reset-modal-overlay")) return { dialog, handle, box: dialog };
      let box = handle;
      while (box.parentElement && box.parentElement !== dialog) box = box.parentElement;
      return box.parentElement === dialog ? { dialog, handle, box } : null;
    }

    viewportSize() {
      return {
        width: this.window.innerWidth || this.document.documentElement?.clientWidth || 0,
        height: this.window.innerHeight || this.document.documentElement?.clientHeight || 0
      };
    }

    positionBox(box, left, top) {
      box.style.setProperty("--app-dialog-left", `${Math.round(left)}px`);
      box.style.setProperty("--app-dialog-top", `${Math.round(top)}px`);
      box.classList.add("app-dialog-drag-positioned");
    }

    handlePointerDown(event) {
      if (event.button !== 0) return;
      const target = this.resolveDragTarget(event.target);
      if (!target) return;
      const rect = target.box.getBoundingClientRect();
      this.activeDrag = {
        ...target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
      target.handle.classList.add("app-dialog-dragging");
      this.document.body?.classList.add("app-dialog-drag-active");
      this.window.getSelection?.()?.removeAllRanges?.();
      target.handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }

    handlePointerMove(event) {
      const drag = this.activeDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const viewport = this.viewportSize();
      const position = clampDialogPosition(
        drag.left + event.clientX - drag.startX,
        drag.top + event.clientY - drag.startY,
        drag.width,
        drag.height,
        viewport.width,
        viewport.height
      );
      this.positionBox(drag.box, position.left, position.top);
      event.preventDefault();
    }

    handlePointerUp(event) {
      const drag = this.activeDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.handle.classList.remove("app-dialog-dragging");
      this.document.body?.classList.remove("app-dialog-drag-active");
      drag.handle.releasePointerCapture?.(event.pointerId);
      this.activeDrag = null;
    }

    handleResize() {
      this.document.querySelectorAll(".app-dialog-drag-positioned").forEach((box) => {
        const rect = box.getBoundingClientRect();
        const viewport = this.viewportSize();
        const position = clampDialogPosition(rect.left, rect.top, rect.width, rect.height, viewport.width, viewport.height);
        this.positionBox(box, position.left, position.top);
      });
    }

    destroy() {
      this.observer?.disconnect();
      this.document.body?.classList.remove("app-dialog-drag-active");
      this.document.removeEventListener("pointerdown", this.handlePointerDown, true);
      this.window.removeEventListener("pointermove", this.handlePointerMove, true);
      this.window.removeEventListener("pointerup", this.handlePointerUp, true);
      this.window.removeEventListener("pointercancel", this.handlePointerUp, true);
      this.window.removeEventListener("resize", this.handleResize);
    }
  }

  function registerMarkdownViewerDraggableDialogs(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const windowRef = deps.window || global;
    if (!documentRef || !windowRef) return null;
    const controller = new DraggableDialogController(documentRef, windowRef);
    app?.registerModule?.("draggableDialogs", controller);
    return controller;
  }

  global.registerMarkdownViewerDraggableDialogs = registerMarkdownViewerDraggableDialogs;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { clampDialogPosition, DraggableDialogController, registerMarkdownViewerDraggableDialogs };
  }
})(typeof window !== "undefined" ? window : globalThis);
