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
      this.contextMenu = new namespace.ImageEditorLayerContextMenu();
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
      this.list.addEventListener("contextmenu", (event) => this.openContextMenu(event));
    }

    /** Resolve selected hierarchy targets, retaining objects that have no containing layer. */
    selectedTargets() {
      const targets = [];
      [...this.store.selectedIds].forEach((id) => {
        const node = namespace.findDocumentNode(this.store.document, id)?.node;
        const object = namespace.findDocumentObject(this.store.document, id);
        const target = node || object?.layer || object?.object;
        if (target && !namespace.isCanvasBackgroundLayer(target) && !targets.some((item) => item.id === target.id)) targets.push(target);
      });
      return targets;
    }

    selectedLayers() { return this.selectedTargets().filter((item) => item.kind === "layer"); }

    /** Open the layer action menu while preserving an existing multi-selection. */
    openContextMenu(event) {
      event.preventDefault();
      const row = event.target.closest("[data-layer-item]");
      if (row) {
        const objectResult = namespace.findDocumentObject(this.store.document, row.dataset.layerItem);
        const targetId = objectResult?.layer?.id || row.dataset.layerItem;
        const selectedTargets = this.selectedTargets();
        const clickedSelectedTarget = selectedTargets.some((target) => target.id === targetId);
        if (!clickedSelectedTarget || (objectResult?.layer && selectedTargets.length === 1)) this.store.select(targetId);
      }
      const targets = this.selectedTargets();
      const layers = this.selectedLayers();
      const selectedNodes = targets.filter((item) => ["layer", "group", "object"].includes(item.kind));
      const singleLayer = layers.length === 1 ? layers[0] : null;
      const mergeLocation = singleLayer ? namespace.findDocumentNode(this.store.document, singleLayer.id) : null;
      const below = mergeLocation?.collection?.[mergeLocation.index + 1];
      const allLocked = targets.length > 0 && targets.every((item) => item.locked);
      const allHidden = targets.length > 0 && targets.every((item) => item.visible === false);
      const otherLayers = [];
      const selectedTargetIds = new Set(targets.map((item) => item.id));
      namespace.walkDocumentNodes(this.store.document, (node) => {
        if (node.kind === "layer" && !namespace.isCanvasBackgroundLayer(node) && !selectedTargetIds.has(node.id)) otherLayers.push(node);
      });
      const hideOthers = otherLayers.some((layer) => layer.visible !== false);
      const canCreateTextOutlines = namespace.ImageEditorTextOutlineConverter?.canConvert(this.store) === true;
      const styleLayers = layers.filter((layer) => !namespace.isCanvasBackgroundLayer(layer));
      const canStyle = styleLayers.length > 0 && styleLayers.every((layer) => !layer.locked);
      const hasDropShadow = styleLayers.some((layer) => namespace.ImageEditorDropShadowEffect?.get(layer));
      const hasInnerShadow = styleLayers.some((layer) => namespace.ImageEditorInnerShadowEffect?.get(layer));
      const hasInnerGlow = styleLayers.some((layer) => namespace.ImageEditorInnerGlowEffect?.get(layer));
      const hasOuterGlow = styleLayers.some((layer) => namespace.ImageEditorOuterGlowEffect?.get(layer));
      const hasColorOverlay = styleLayers.some((layer) => namespace.ImageEditorColorOverlayEffect?.get(layer));
      const hasGradientOverlay = styleLayers.some((layer) => namespace.ImageEditorGradientOverlayEffect?.get(layer));
      const hasPatternOverlay = styleLayers.some((layer) => namespace.ImageEditorPatternOverlayEffect?.get(layer));
      const hasBevelEmboss = styleLayers.some((layer) => namespace.ImageEditorBevelEmbossEffect?.get(layer));
      const hasGrayscale = styleLayers.some((layer) => namespace.ImageEditorGrayscaleEffect?.get(layer));
      const maskState = namespace.ImageEditorMaskOperations?.getState(this.store) || {};
      const canCreateMask = maskState.canCreate === true;
      const canSetMaskType = maskState.canChangeType === true;
      const canRemoveMask = maskState.canRemove === true;
      this.contextMenu.show(event.clientX, event.clientY, [
        { id: "new-layer", label: "New layer", icon: "bi-plus-square" },
        { id: "new-group", label: "New group", icon: "bi-folder-plus" },
        { id: "group", label: "New group from selected layers", icon: "bi-collection", disabled: selectedNodes.length === 0 },
        { separator: true },
        { id: "duplicate", label: "Duplicate layer", icon: "bi-copy", disabled: selectedNodes.length === 0 },
        { id: "delete", label: "Delete layer", icon: "bi-trash", danger: true, disabled: selectedNodes.length === 0 },
        { separator: true },
        { id: "export-layer-png", label: "Export layer as PNG", icon: "bi-filetype-png", disabled: !singleLayer },
        { id: "export-layer-as", label: "Export as…", icon: "bi-box-arrow-up", disabled: !singleLayer },
        { separator: true },
        { id: "merge-down", label: "Merge down", icon: "bi-layers-half", disabled: !singleLayer || singleLayer.locked || !below || below.kind !== "layer" || below.locked || namespace.isCanvasBackgroundLayer(below) },
        { id: "merge-visible", label: "Merge visible", icon: "bi-layers", disabled: [...layers, ...otherLayers].filter((layer) => layer.visible !== false).length < 2 },
        { id: "flatten", label: "Flatten layers", icon: "bi-layers-fill", disabled: !this.store.document.nodes.some((node) => !namespace.isCanvasBackgroundLayer(node)) },
        { separator: true },
        { id: "use-as-mask", label: "Use as mask", icon: "bi-layers-half", disabled: !canCreateMask },
        { id: "set-mask-type", label: "Set mask type", icon: "bi-sliders", disabled: !canSetMaskType, children: [
          { id: "set-mask-type-alpha", label: "Alpha", icon: "bi-circle", disabled: !canSetMaskType },
          { id: "set-mask-type-vector", label: "Vector", icon: "bi-vector-pen", disabled: !canSetMaskType },
          { id: "set-mask-type-luminance", label: "Luminance", icon: "bi-brightness-high", disabled: !canSetMaskType }
        ] },
        { id: "remove-mask", label: "Remove mask", icon: "bi-x-square", disabled: !canRemoveMask },
        { separator: true },
        { label: "Style", icon: "bi-stars", disabled: !canStyle, children: [
          { id: "edit-blending-options", label: "Blending Options…", icon: "bi-layers", disabled: !canStyle },
          { id: "edit-bevel-emboss", label: "Bevel & Emboss…", icon: "bi-badge-3d", disabled: !canStyle },
          { separator: true },
          { id: "edit-drop-shadow", label: "Drop Shadow…", icon: "bi-square-fill", disabled: !canStyle },
          { id: "edit-inner-shadow", label: "Inner Shadow…", icon: "bi-square", disabled: !canStyle },
          { separator: true },
          { id: "edit-inner-glow", label: "Inner Glow…", icon: "bi-brightness-high", disabled: !canStyle },
          { id: "edit-outer-glow", label: "Outer Glow…", icon: "bi-brightness-high-fill", disabled: !canStyle },
          { separator: true },
          { id: "edit-color-overlay", label: "Color Overlay…", icon: "bi-palette-fill", disabled: !canStyle },
          { id: "edit-gradient-overlay", label: "Gradient Overlay…", icon: "bi-circle-half", disabled: !canStyle },
          { id: "edit-pattern-overlay", label: "Pattern Overlay…", icon: "bi-grid-3x3-gap", disabled: !canStyle },
          { id: "apply-grayscale", label: "Grayscale", icon: "bi-circle-half", disabled: !canStyle },
          { separator: true },
          { label: "Remove", icon: "bi-x-square", disabled: !canStyle, children: [
            { id: "remove-bevel-emboss", label: "Bevel & Emboss", icon: "bi-badge-3d", disabled: !canStyle || !hasBevelEmboss },
            { id: "remove-drop-shadow", label: "Drop Shadow", icon: "bi-square-fill", disabled: !canStyle || !hasDropShadow },
            { id: "remove-inner-shadow", label: "Inner Shadow", icon: "bi-square", disabled: !canStyle || !hasInnerShadow },
            { id: "remove-inner-glow", label: "Inner Glow", icon: "bi-brightness-high", disabled: !canStyle || !hasInnerGlow },
            { id: "remove-outer-glow", label: "Outer Glow", icon: "bi-brightness-high-fill", disabled: !canStyle || !hasOuterGlow },
            { id: "remove-color-overlay", label: "Color Overlay", icon: "bi-palette-fill", disabled: !canStyle || !hasColorOverlay },
            { id: "remove-gradient-overlay", label: "Gradient Overlay", icon: "bi-circle-half", disabled: !canStyle || !hasGradientOverlay },
            { id: "remove-pattern-overlay", label: "Pattern Overlay", icon: "bi-grid-3x3-gap", disabled: !canStyle || !hasPatternOverlay },
            { id: "remove-grayscale", label: "Grayscale", icon: "bi-circle-half", disabled: !canStyle || !hasGrayscale }
          ] }
        ] },
        { separator: true },
        { id: "toggle-lock", label: allLocked ? "Unlock layer" : "Lock layer", icon: allLocked ? "bi-unlock" : "bi-lock", disabled: targets.length === 0 },
        { id: "rename", label: "Rename layer", icon: "bi-pencil", disabled: targets.length !== 1 },
        { id: "create-text-outlines", label: "Create Outline from Text", icon: "bi-vector-pen", disabled: !canCreateTextOutlines },
        { separator: true },
        { id: "toggle-visibility", label: allHidden ? "Show layer" : "Hide layer", icon: allHidden ? "bi-eye" : "bi-eye-slash", disabled: targets.length === 0 },
        { id: "toggle-other-visibility", label: hideOthers ? "Hide other layers" : "Show other layers", icon: hideOthers ? "bi-eye-slash" : "bi-eye", disabled: targets.length === 0 || otherLayers.length === 0 }
      ], (action) => this.runContextMenuAction(action, targets));
    }

    /** Run hierarchy context actions against each distinct selected layer or group. */
    runContextMenuAction(action, targets) {
      if (["duplicate", "group", "delete"].includes(action)) this.store.select(targets.map((target) => target.id));
      this.runAction(action);
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
      const targetObject = namespace.findDocumentObject(this.store.document, targetId);
      const draggedObjects = this.draggedIds.every((id) => namespace.findDocumentObject(this.store.document, id));
      const bounds = row.getBoundingClientRect();
      const verticalRatio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
      let placement = verticalRatio < 0.35 ? "before" : "after";
      if (verticalRatio >= 0.35 && verticalRatio <= 0.65 && (targetNode?.kind === "group" || (draggedObjects && targetNode?.kind === "layer"))) placement = "inside";
      if (!targetNode && !targetObject) return null;
      if (!draggedObjects && targetObject) return null;
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
      if (namespace.isCanvasBackgroundLayer(targetNode) && placement !== "before") return null;
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
      }).filter((item) => item && !namespace.isCanvasBackgroundLayer(item));
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
      const targets = this.selectedTargets();
      const layers = targets.filter((item) => item.kind === "layer");
      if (action === "rename" && targets.length === 1) { void this.renameItem(targets[0].id, targets[0].name); return; }
      if (action === "create-text-outlines") { this.onMutate(action, null); return; }
      if (["use-as-mask", "set-mask-type-alpha", "set-mask-type-vector", "set-mask-type-luminance", "remove-mask"].includes(action)) { this.onMutate(action, null); return; }
      if (["edit-blending-options", "edit-bevel-emboss", "remove-bevel-emboss", "edit-drop-shadow", "remove-drop-shadow", "edit-inner-shadow", "remove-inner-shadow", "edit-inner-glow", "remove-inner-glow", "edit-outer-glow", "remove-outer-glow", "edit-color-overlay", "remove-color-overlay", "edit-gradient-overlay", "remove-gradient-overlay", "edit-pattern-overlay", "remove-pattern-overlay", "apply-grayscale", "remove-grayscale"].includes(action)) { this.onMutate(action, { layerIds: layers.map((layer) => layer.id) }); return; }
      if (action === "export-layer-png" || action === "export-layer-as") { this.onMutate(action, { layerIds: layers.map((layer) => layer.id) }); return; }
      const operations = {
        "new-layer": () => this.store.addLayer("Layer", [...this.store.selectedIds][0]),
        "new-group": () => this.store.addGroup("Group", [...this.store.selectedIds][0] || null),
        duplicate: () => this.store.duplicateSelected(),
        group: () => this.store.groupSelected(),
        ungroup: () => this.store.ungroupSelected(),
        "toggle-lock": () => targets.map((item) => this.store.updateItem(item.id, { locked: !targets.every((target) => target.locked) })).some(Boolean),
        "toggle-visibility": () => targets.map((item) => this.store.updateItem(item.id, { visible: targets.every((target) => target.visible === false) })).some(Boolean),
        "toggle-other-visibility": () => {
          const selectedIds = new Set(targets.map((item) => item.id));
          const others = [];
          namespace.walkDocumentNodes(this.store.document, (node) => { if (node.kind === "layer" && !namespace.isCanvasBackgroundLayer(node) && !selectedIds.has(node.id)) others.push(node); });
          const visible = !others.some((layer) => layer.visible !== false);
          return others.map((layer) => this.store.updateItem(layer.id, { visible })).some(Boolean);
        }
      };
      if (operations[action]) this.mutate(action, operations[action]);
      else this.onMutate(action, null);
    }

    reveal() { this.state.mode = "expanded"; this.applyState(); this.reportState(); }
    toggle() { if (this.state.mode === "hidden") this.reveal(); else { this.state.mode = "hidden"; this.applyState(); this.reportState(); } }
    applyState() { this.element.hidden = this.state.mode === "hidden"; this.element.classList.toggle("minimized", this.state.mode === "minimized"); this.element.style.height = `${this.state.height}px`; }
    reportState() { this.onStateChanged({ ...this.state, expandedIds: [...this.expandedIds], selectedIds: [...this.store.selectedIds] }); }

    /** Include a selected object's containing layer in the panel's visual selection. */
    rowReflectsObjectSelection(item) {
      if (item.kind !== 'layer') return false;
      return [...this.store.selectedIds].some((id) => namespace.findDocumentObject(this.store.document, id)?.layer?.id === item.id);
    }
    toggleExpanded(id) { if (this.expandedIds.has(id)) this.expandedIds.delete(id); else this.expandedIds.add(id); this.render(); this.reportState(); }

    render() {
      this.list.innerHTML = "";
      const renderNode = (node, depth) => {
        if (namespace.isCanvasBackgroundLayer(node)) return;
        if (node.kind === "object") {
          const location = namespace.findDocumentObject(this.store.document, node.id);
          this.list.appendChild(this.createRow(node, depth, false, false, location?.parent?.id));
          return;
        }
        const parent = namespace.findDocumentNode(this.store.document, node.id)?.parent;
        this.list.appendChild(this.createRow(node, depth, true, true, parent?.id));
        if (!this.expandedIds.has(node.id)) return;
        if (node.kind === "group") (node.children || []).forEach((child) => renderNode(child, depth + 1));
        else (node.objects || []).forEach((object) => this.list.appendChild(this.createRow(object, depth + 1, false, false, node.id)));
      };
      (this.store.document.nodes || []).forEach((node) => renderNode(node, 0));
      this.list.appendChild(this.dropIndicator);
      const currentId = [...this.store.selectedIds][0];
      const item = namespace.findDocumentNode(this.store.document, currentId)?.node || namespace.findDocumentObject(this.store.document, currentId)?.object;
      const value = Math.round(Number(item?.opacity ?? 1) * 100);
      const opacity = this.element.querySelector(".image-editor-layer-opacity input");
      opacity.value = value;
      opacity.disabled = !item || namespace.isCanvasBackgroundLayer(item);
      this.element.querySelector(".image-editor-layer-opacity output").textContent = `${value}%`;
    }

    createRow(item, depth, isNode, expandable, parentId = "") {
      const row = document.createElement("div");
      row.className = `image-editor-layer-row ${this.store.selectedIds.has(item.id) ? "selected" : ""}`;
      if (this.rowReflectsObjectSelection(item)) row.classList.add('selected');
      row.dataset.layerItem = item.id;
      if (isNode) row.dataset.layerNode = "true";
      row.dataset.layerDepth = depth;
      row.dataset.layerParent = parentId;
      row.draggable = !namespace.isCanvasBackgroundLayer(item);
      row.setAttribute("role", "treeitem");
      row.style.setProperty("--layer-depth", depth);
      const safeName = String(item.name || "Item").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
      const hasEffect = item.kind === "layer" && (namespace.ImageEditorDropShadowEffect?.get(item) || namespace.ImageEditorInnerShadowEffect?.get(item) || namespace.ImageEditorInnerGlowEffect?.get(item) || namespace.ImageEditorOuterGlowEffect?.get(item) || namespace.ImageEditorColorOverlayEffect?.get(item) || namespace.ImageEditorGradientOverlayEffect?.get(item) || namespace.ImageEditorPatternOverlayEffect?.get(item));
      row.innerHTML = `${expandable ? `<button data-layer-expand="${item.id}" aria-label="Expand"><i class="bi bi-chevron-${this.expandedIds.has(item.id) ? "down" : "right"}"></i></button>` : "<span></span>"}<button data-layer-visibility="${item.id}" data-visible="${item.visible !== false}" aria-label="Toggle visibility"><i class="bi bi-eye${item.visible === false ? "-slash" : ""}"></i></button><span class="image-editor-layer-thumbnail"><i class="bi ${item.kind === "group" ? "bi-folder" : item.kind === "layer" ? "bi-layers" : item.type === "text" ? "bi-fonts" : "bi-image"}"></i></span><span class="image-editor-layer-name">${safeName}</span>${hasEffect ? '<i class="bi bi-fx image-editor-layer-effect-indicator" title="Layer effects" aria-label="Layer effects"></i>' : ""}<button data-layer-lock="${item.id}" data-locked="${item.locked === true}" aria-label="Toggle lock"><i class="bi bi-${item.locked ? "lock-fill" : "unlock"}"></i></button>`;
      return row;
    }

    destroy() { this.unsubscribe?.(); this.contextMenu?.destroy(); this.element.remove(); }
  }

  namespace.ImageEditorLayerPanel = ImageEditorLayerPanel;
})(typeof window !== "undefined" ? window : globalThis);
