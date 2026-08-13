// Right-click action menu for the image editor layer hierarchy.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorLayerContextMenu {
    /** Create one viewport-positioned menu that can be reused by a layers panel. */
    constructor() {
      this.element = document.createElement("div");
      this.element.className = "graph-context-menu image-editor-layer-context-menu hidden";
      this.element.setAttribute("role", "menu");
      document.body.appendChild(this.element);
      this.handleDocumentPointerDown = (event) => {
        if (!this.element.contains(event.target)) this.hide();
      };
      this.handleKeyDown = (event) => {
        if (event.key === "Escape") this.hide();
      };
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.addEventListener("keydown", this.handleKeyDown, true);
    }

    /** Show semantic layer actions at a pointer position. */
    show(x, y, items, onAction) {
      this.element.replaceChildren();
      items.forEach((item) => {
        if (item.separator) {
          const separator = document.createElement("div");
          separator.className = "graph-context-menu-separator";
          separator.setAttribute("role", "separator");
          this.element.appendChild(separator);
          return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = `graph-context-menu-item${item.danger ? " graph-context-menu-item-danger" : ""}`;
        button.dataset.layerContextAction = item.id;
        button.disabled = item.disabled === true;
        button.setAttribute("role", "menuitem");
        button.innerHTML = `<i class="bi ${item.icon}" aria-hidden="true"></i><span class="graph-context-menu-item-label"></span>`;
        button.querySelector("span").textContent = item.label;
        button.addEventListener("click", () => {
          if (button.disabled) return;
          this.hide();
          onAction(item.id);
        });
        this.element.appendChild(button);
      });
      this.element.classList.remove("hidden");
      const bounds = this.element.getBoundingClientRect();
      const viewportWidth = Math.max(document.documentElement?.clientWidth || 0, global.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement?.clientHeight || 0, global.innerHeight || 0);
      this.element.style.left = `${Math.max(4, Math.min(x, viewportWidth - bounds.width - 4))}px`;
      this.element.style.top = `${Math.max(4, Math.min(y, viewportHeight - bounds.height - 4))}px`;
      this.element.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    }

    /** Hide the active menu without changing layer selection. */
    hide() { this.element.classList.add("hidden"); }

    /** Remove global listeners and menu markup owned by this panel. */
    destroy() {
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.removeEventListener("keydown", this.handleKeyDown, true);
      this.element.remove();
    }
  }

  namespace.ImageEditorLayerContextMenu = ImageEditorLayerContextMenu;
})(typeof window !== "undefined" ? window : globalThis);
