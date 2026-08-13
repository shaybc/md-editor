// Floating layer hierarchy panel for the image editor canvas.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function iconButton(icon, label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.layerAction = action;
    button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    return button;
  }

  class ImageEditorLayerPanel {
    /** Render and coordinate the per-tab floating layer hierarchy. */
    constructor(stage, store, options = {}) {
      this.store = store;
      this.onMutate = options.onMutate || ((_label, callback) => callback?.());
      this.onStateChanged = options.onStateChanged || (() => {});
      this.requestRename = options.requestRename || (() => Promise.resolve(null));
      this.requestDeleteConfirmation = options.requestDeleteConfirmation || (() => Promise.resolve(true));
      this.shouldConfirmDelete = options.shouldConfirmDelete || (() => true);
      this.expandedIds = new Set(options.state?.expandedIds || []);
      this.state = { mode: options.state?.mode || "expanded", height: Number(options.state?.height || 360), placementMode: options.state?.placementMode === "active" ? "active" : "new" };
      this.element = document.createElement("aside");
      this.element.className = "image-editor-layers-panel";
      this.element.setAttribute("aria-label", "Layers");
      this.element.innerHTML = `<header><strong><i class="bi bi-layers"></i> Layers</strong><span class="image-editor-layer-panel-actions"></span></header><div class="image-editor-layer-opacity"><label>Opacity <input type="range" min="0" max="100" value="100"></label><output>100%</output></div><div class="image-editor-layer-list" role="tree"></div><footer><div class="image-editor-layer-footer-actions"></div><label class="image-editor-layer-placement">Place new content <select><option value="new">New layer</option><option value="active">Active layer</option></select></label></footer><div class="image-editor-layer-panel-resize" title="Resize layers panel"></div>`;
      stage.appendChild(this.element);
      this.list = this.element.querySelector(".image-editor-layer-list");
      this.dropIndicator = document.createElement("div");
      this.dropIndicator.className = "image-editor-layer-drop-indicator";
      this.dropIndicator.hidden = true;
      this.element.querySelector(".image-editor-layer-panel-actions").append(iconButton("bi-dash-lg", "Minimize Layers", "minimize"), iconButton("bi-x-lg", "Hide Layers", "hide"));
      [["bi-plus-square", "New layer", "new-layer"], ["bi-folder-plus", "New group", "new-group"], ["bi-copy", "Duplicate", "duplicate"], ["bi-collection", "Group", "group"], ["bi-box-arrow-up", "Ungroup", "ungroup"], ["bi-layers-half", "Merge down", "merge-down"], ["bi-layers-fill", "Flatten document", "flatten"], ["bi-download", "Export flattened image", "export"], ["bi-trash", "Delete", "delete"]].forEach(([icon, label, action]) => this.element.querySelector(".image-editor-layer-footer-actions").append(iconButton(icon, label, action)));
      this.bind();
      this.applyState();
      this.render();
      this.unsubscribe = store.subscribe(() => this.render());
    }

    bind() {
      this.element.addEventListener("click", (event) => {
        const action = event.target.closest("[data-layer-action]")?.dataset.layerAction;
        if (action) { this.runAction(action); return; }
        const visibility = event.target.closest("[data-layer-visibility]");
        if (visibility) { event.stopPropagation(); this.mutate("Toggle visibility", () => this.store.updateItem(visibility.dataset.layerVisibility, { visible: visibility.dataset.visible !== "true" })); return; }
        const lock = event.target.closest("[data-layer-lock]");
        if (lock) { event.stopPropagation(); this.mutate("Toggle lock", () => this.store.updateItem(lock.dataset.layerLock, { locked: lock.dataset.locked !== "true" })); return; }
        const disclosure = event.target.closest("[data-layer-expand]");
        if (disclosure) { event.stopPropagation(); this.toggleExpanded(disclosure.dataset.layerExpand); return; }
        const row = event.target.closest("[data-layer-item]");
        if (row) {
          const id = row.dataset.layerItem;
          const name = event.target.closest(".image-editor-layer-name");
          if (name && event.detail >= 2) { event.preventDefault(); void this.renameItem(id, name.textContent); return; }
          if (event.shiftKey && this.lastSelectedId) {
            const ids = [...this.list.querySelectorAll("[data-layer-item]")].map((item) => item.dataset.layerItem);
            const start = ids.indexOf(this.lastSelectedId);
            const end = ids.indexOf(id);
            this.store.select(start >= 0 && end >= 0 ? ids.slice(Math.min(start, end), Math.max(start, end) + 1) : id, { additive: event.ctrlKey || event.metaKey });
          } else if (event.ctrlKey || event.metaKey || this.store.selectedIds.size !== 1 || !this.store.selectedIds.has(id)) {
            this.store.select(id, { additive: event.ctrlKey || event.metaKey });
          } else this.store.select(id);
          this.lastSelectedId = id;
        }
      });
      this.element.addEventListener("dragstart", (event) => {
        this.draggedId = event.target.closest("[data-layer-item]")?.dataset.layerItem || "";
        this.draggedIds = this.store.selectedIds.has(this.draggedId) ? [...this.store.selectedIds] : [this.draggedId].filter(Boolean);
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", this.draggedId); }
      });
      this.element.addEventListener("dragover", (event) => {
        const intent = this.resolveDropIntent(event);
        if (!intent) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        this.dropIntent = intent;
        this.showDropIndicator(intent);
      });
      this.element.addEventListener("drop", (event) => {
        const intent = this.resolveDropIntent(event) || this.dropIntent;
        if (this.draggedIds?.length && intent) this.mutate("Reorder layers", () => this.store.moveItems(this.draggedIds, intent.targetId, intent.placement));
        this.clearDropIndicator();
      });
      this.element.addEventListener("dragend", () => this.clearDropIndicator());
      this.list.addEventListener("dragleave", (event) => {
        if (this.list.contains(event.relatedTarget)) return;
        this.dropIntent = null;
        this.dropIndicator.hidden = true;
      });
      const opacity = this.element.querySelector(".image-editor-layer-opacity input");
      opacity.addEventListener("input", () => { this.element.querySelector(".image-editor-layer-opacity output").textContent = `${opacity.value}%`; });
      opacity.addEventListener("change", () => this.mutate("Change opacity", () => [...this.store.selectedIds].some((id) => this.store.updateItem(id, { opacity: Number(opacity.value) / 100 }))));
      const placement = this.element.querySelector(".image-editor-layer-placement select");
      placement.value = this.state.placementMode;
      placement.addEventListener("change", () => { this.state.placementMode = placement.value; this.reportState(); });
      this.bindResize();
    }

    bindResize() {
      const handle = this.element.querySelector(".image-editor-layer-panel-resize");
      let drag = null;
      handle.addEventListener("pointerdown", (event) => { drag = { y: event.clientY, height: this.state.height }; handle.setPointerCapture?.(event.pointerId); });
      handle.addEventListener("pointermove", (event) => { if (!drag) return; this.state.height = Math.max(180, Math.min(720, drag.height + event.clientY - drag.y)); this.applyState(); });
      handle.addEventListener("pointerup", () => { drag = null; this.reportState(); });
    }

    /** Resolve the semantic hierarchy destination represented by the current pointer position. */
    resolveDropIntent(event) {
      if (!this.draggedIds?.length) return null;
      let row = event.target.closest?.("[data-layer-item]");
      if (!row) row = [...this.list.querySelectorAll('[data-layer-depth="0"]')].at(-1);
      if (!row) return null;
      let targetId = row.dataset.layerItem;
      const targetNode = namespace.findDocumentNode(this.store.document, targetId)?.node;
      const draggedObjects = this.draggedIds.every((id) => namespace.findDocumentObject(this.store.document, id));
      const bounds = row.getBoundingClientRect();
      const verticalRatio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
      let placement = verticalRatio < 0.35 ? "before" : "after";
      if ((targetNode?.kind === "group" && verticalRatio >= 0.35 && verticalRatio <= 0.65) || (draggedObjects && targetNode?.kind === "layer")) placement = "inside";
      if (!targetNode && !draggedObjects) {
        const owningLayer = namespace.findDocumentObject(this.store.document, targetId)?.layer;
        if (!owningLayer) return null;
        targetId = owningLayer.id;
        row = this.list.querySelector(`[data-layer-item="${targetId}"]`) || row;
      }
      if (placement !== "inside") {
        const listLeft = this.list.getBoundingClientRect().left;
        const desiredDepth = Math.max(0, Math.floor((event.clientX - listLeft - 3) / 15));
        let depth = Number(row.dataset.layerDepth) || 0;
        let parentId = row.dataset.layerParent;
        while (parentId && desiredDepth < depth) {
          targetId = parentId;
          row = this.list.querySelector(`[data-layer-item="${parentId}"]`) || row;
          parentId = row.dataset.layerParent;
          depth = Number(row.dataset.layerDepth) || 0;
        }
      }
      if (this.draggedIds.includes(targetId)) return null;
      return { targetId, placement, row, depth: Number(row.dataset.layerDepth) || 0 };
    }

    /** Draw the insertion line at the exact hierarchy depth represented by a drop intent. */
    showDropIndicator(intent) {
      const depth = intent.depth + (intent.placement === "inside" ? 1 : 0);
      const top = intent.row.offsetTop + (intent.placement === "before" ? 0 : intent.row.offsetHeight);
      this.dropIndicator.style.setProperty("--drop-depth", depth);
      this.dropIndicator.style.top = `${top}px`;
      this.dropIndicator.dataset.placement = intent.placement;
      this.dropIndicator.hidden = false;
    }

    /** Clear transient drag state and insertion feedback. */
    clearDropIndicator() {
      this.draggedId = "";
      this.draggedIds = [];
      this.dropIntent = null;
      this.dropIndicator.hidden = true;
    }

    mutate(label, callback) { return this.onMutate(label, callback); }

    /** Request and apply a layer or object name through the application dialog service. */
    async renameItem(itemId, currentName) {
      const next = await this.requestRename({
        title: "Rename layer or object",
        message: "Enter a new name.",
        value: currentName,
        confirmLabel: "Rename"
      });
      if (next?.trim()) this.mutate("Rename", () => this.store.updateItem(itemId, { name: next.trim() }));
    }

    /** Confirm and delete the selected layer-panel items. */
    async deleteSelected() {
      const selectedItems = [...this.store.selectedIds].map((id) => {
        return namespace.findDocumentNode(this.store.document, id)?.node
          || namespace.findDocumentObject(this.store.document, id)?.object;
      }).filter(Boolean);
      if (!selectedItems.length) return;
      if (this.shouldConfirmDelete()) {
        const item = selectedItems[0];
        const isNonemptyGroup = selectedItems.length === 1 && item.kind === "group" && item.children?.length;
        const itemType = item.kind === "group" ? "group" : item.kind === "layer" ? "layer" : "object";
        const confirmed = await this.requestDeleteConfirmation({
          title: selectedItems.length === 1 ? `Delete ${itemType}?` : "Delete selected items?",
          message: isNonemptyGroup
            ? "Delete the selected nonempty group and all of its contents?"
            : selectedItems.length === 1
              ? `Delete “${item.name || itemType}”?`
              : `Delete the ${selectedItems.length} selected layers or objects?`,
          confirmLabel: "Delete",
          confirmVariant: "danger"
        });
        if (!confirmed) return;
      }
      this.mutate("delete", () => this.store.deleteSelected());
    }

    runAction(action) {
      if (action === "minimize") { this.state.mode = this.state.mode === "minimized" ? "expanded" : "minimized"; this.applyState(); this.reportState(); return; }
      if (action === "hide") { this.state.mode = "hidden"; this.applyState(); this.reportState(); return; }
      if (action === "delete") { void this.deleteSelected(); return; }
      const operations = {
        "new-layer": () => this.store.addLayer("Layer", [...this.store.selectedIds][0]),
        "new-group": () => this.store.addGroup("Group", [...this.store.selectedIds][0] || null),
        duplicate: () => this.store.duplicateSelected(),
        group: () => this.store.groupSelected(),
        ungroup: () => this.store.ungroupSelected()
      };
      if (operations[action]) this.mutate(action, operations[action]);
      else this.onMutate(action, null);
    }

    reveal() { this.state.mode = "expanded"; this.applyState(); this.reportState(); }
    toggle() { if (this.state.mode === "hidden") this.reveal(); else { this.state.mode = "hidden"; this.applyState(); this.reportState(); } }
    applyState() { this.element.hidden = this.state.mode === "hidden"; this.element.classList.toggle("minimized", this.state.mode === "minimized"); this.element.style.height = `${this.state.height}px`; }
    reportState() { this.onStateChanged({ ...this.state, expandedIds: [...this.expandedIds], selectedIds: [...this.store.selectedIds] }); }
    toggleExpanded(id) { if (this.expandedIds.has(id)) this.expandedIds.delete(id); else this.expandedIds.add(id); this.render(); this.reportState(); }

    render() {
      this.list.innerHTML = "";
      const renderNode = (node, depth) => {
        const parent = namespace.findDocumentNode(this.store.document, node.id)?.parent;
        this.list.appendChild(this.createRow(node, depth, true, node.kind === "group" || (node.objects || []).length > 0, parent?.id));
        if (!this.expandedIds.has(node.id)) return;
        if (node.kind === "group") (node.children || []).forEach((child) => renderNode(child, depth + 1));
        else (node.objects || []).forEach((object) => this.list.appendChild(this.createRow(object, depth + 1, false, false, node.id)));
      };
      (this.store.document.nodes || []).forEach((node) => renderNode(node, 0));
      this.list.appendChild(this.dropIndicator);
      const currentId = [...this.store.selectedIds][0];
      const item = namespace.findDocumentNode(this.store.document, currentId)?.node || namespace.findDocumentObject(this.store.document, currentId)?.object;
      const value = Math.round(Number(item?.opacity ?? 1) * 100);
      this.element.querySelector(".image-editor-layer-opacity input").value = value;
      this.element.querySelector(".image-editor-layer-opacity output").textContent = `${value}%`;
    }

    createRow(item, depth, isNode, expandable, parentId = "") {
      const row = document.createElement("div");
      row.className = `image-editor-layer-row ${this.store.selectedIds.has(item.id) ? "selected" : ""}`;
      row.dataset.layerItem = item.id;
      if (isNode) row.dataset.layerNode = "true";
      row.dataset.layerDepth = depth;
      row.dataset.layerParent = parentId;
      row.draggable = true;
      row.setAttribute("role", "treeitem");
      row.style.setProperty("--layer-depth", depth);
      const safeName = String(item.name || "Item").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
      row.innerHTML = `${expandable ? `<button data-layer-expand="${item.id}" aria-label="Expand"><i class="bi bi-chevron-${this.expandedIds.has(item.id) ? "down" : "right"}"></i></button>` : "<span></span>"}<button data-layer-visibility="${item.id}" data-visible="${item.visible !== false}" aria-label="Toggle visibility"><i class="bi bi-eye${item.visible === false ? "-slash" : ""}"></i></button><span class="image-editor-layer-thumbnail"><i class="bi ${item.kind === "group" ? "bi-folder" : item.kind === "layer" ? "bi-layers" : item.type === "text" ? "bi-fonts" : "bi-image"}"></i></span><span class="image-editor-layer-name">${safeName}</span><button data-layer-lock="${item.id}" data-locked="${item.locked === true}" aria-label="Toggle lock"><i class="bi bi-${item.locked ? "lock-fill" : "unlock"}"></i></button>`;
      return row;
    }

    destroy() { this.unsubscribe?.(); this.element.remove(); }
  }

  namespace.ImageEditorLayerPanel = ImageEditorLayerPanel;
})(typeof window !== "undefined" ? window : globalThis);
