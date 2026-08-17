// Properties inspector and document operations for selected image-editor objects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function selectedLocations(store) {
    const locations = [];
    const seen = new Set();
    store.selectedIds.forEach((id) => {
      const location = namespace.findDocumentObject(store.document, id);
      if (!location || seen.has(location.object.id)) return;
      seen.add(location.object.id);
      locations.push(location);
    });
    return locations;
  }

  function displayBounds(object) {
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    return {
      x: Number(transform.x ?? bounds.x) || 0,
      y: Number(transform.y ?? bounds.y) || 0,
      width: Math.max(1, Math.abs((Number(bounds.width) || 1) * (Number(transform.scaleX) || 1))),
      height: Math.max(1, Math.abs((Number(bounds.height) || 1) * (Number(transform.scaleY) || 1)))
    };
  }

  function combinedBounds(locations) {
    if (!locations.length) return null;
    const rectangles = locations.map((location) => displayBounds(location.object));
    const left = Math.min(...rectangles.map((rect) => rect.x));
    const top = Math.min(...rectangles.map((rect) => rect.y));
    const right = Math.max(...rectangles.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function editable(locations) {
    return locations.length > 0 && locations.every((location) => location.visible && !location.locked && location.object.visible !== false && !location.object.locked);
  }

  function moveBy(locations, deltaX, deltaY) {
    if (!deltaX && !deltaY) return false;
    locations.forEach(({ object }) => {
      object.transform = { ...(object.transform || {}) };
      object.transform.x = (Number(object.transform.x ?? object.bounds?.x) || 0) + deltaX;
      object.transform.y = (Number(object.transform.y ?? object.bounds?.y) || 0) + deltaY;
    });
    return true;
  }

  function resize(locations, bounds, width, height) {
    const scaleX = width / Math.max(1, bounds.width);
    const scaleY = height / Math.max(1, bounds.height);
    if (Math.abs(scaleX - 1) < .000001 && Math.abs(scaleY - 1) < .000001) return false;
    locations.forEach(({ object }) => {
      const original = displayBounds(object);
      object.transform = { ...(object.transform || {}) };
      object.transform.x = bounds.x + (original.x - bounds.x) * scaleX;
      object.transform.y = bounds.y + (original.y - bounds.y) * scaleY;
      object.transform.scaleX = (Number(object.transform.scaleX) || 1) * scaleX;
      object.transform.scaleY = (Number(object.transform.scaleY) || 1) * scaleY;
    });
    return true;
  }

  function rotate(locations, bounds, degrees) {
    const rotations = locations.map(({ object }) => Number(object.transform?.rotation) || 0);
    const common = rotations.every((value) => Math.abs(value - rotations[0]) < .000001) ? rotations[0] : 0;
    const target = degrees * Math.PI / 180;
    const delta = target - common;
    if (Math.abs(delta) < .000001) return false;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    locations.forEach(({ object }) => {
      const rect = displayBounds(object);
      const objectCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const offsetX = objectCenter.x - center.x;
      const offsetY = objectCenter.y - center.y;
      const rotatedCenter = {
        x: center.x + offsetX * Math.cos(delta) - offsetY * Math.sin(delta),
        y: center.y + offsetX * Math.sin(delta) + offsetY * Math.cos(delta)
      };
      object.transform = { ...(object.transform || {}) };
      object.transform.x = rotatedCenter.x - rect.width / 2;
      object.transform.y = rotatedCenter.y - rect.height / 2;
      object.transform.rotation = (Number(object.transform.rotation) || 0) + delta;
    });
    return true;
  }

  function reorder(locations, action) {
    const groups = new Map();
    locations.forEach((location) => {
      if (!groups.has(location.collection)) groups.set(location.collection, []);
      groups.get(location.collection).push(location.object);
    });
    let changed = false;
    groups.forEach((objects, collection) => {
      const selected = new Set(objects.map((object) => object.id));
      const before = collection.map((item) => item.id);
      const block = collection.filter((item) => selected.has(item.id));
      const remaining = collection.filter((item) => !selected.has(item.id));
      const firstIndex = Math.min(...collection.map((item, index) => selected.has(item.id) ? index : collection.length));
      let insertionIndex = 0;
      if (action === "to-back") insertionIndex = remaining.length;
      else if (action === "forward") insertionIndex = Math.max(0, firstIndex - 1);
      else if (action === "backward") insertionIndex = Math.min(remaining.length, firstIndex + 1);
      remaining.splice(insertionIndex, 0, ...block);
      if (before.some((id, index) => id !== remaining[index]?.id)) {
        collection.splice(0, collection.length, ...remaining);
        changed = true;
      }
    });
    return changed;
  }

  const Operations = {
    selectedLocations,
    displayBounds,
    combinedBounds,
    state(store) {
      const locations = selectedLocations(store);
      const bounds = combinedBounds(locations);
      const rotations = locations.map(({ object }) => Number(object.transform?.rotation) || 0);
      return {
        locations,
        bounds,
        editable: editable(locations),
        rotation: rotations.length && rotations.every((value) => Math.abs(value - rotations[0]) < .000001) ? rotations[0] * 180 / Math.PI : null
      };
    },
    apply(store, action, value, options = {}) {
      const state = this.state(store);
      if (!state.editable || !state.bounds) return false;
      const { locations, bounds } = state;
      if (["forward", "backward", "to-front", "to-back"].includes(action)) return reorder(locations, action);
      if (action === "align-top") return moveBy(locations, 0, -bounds.y);
      if (action === "align-middle") return moveBy(locations, 0, (store.document.canvas.height - bounds.height) / 2 - bounds.y);
      if (action === "align-bottom") return moveBy(locations, 0, store.document.canvas.height - bounds.height - bounds.y);
      if (action === "align-left") return moveBy(locations, -bounds.x, 0);
      if (action === "align-center") return moveBy(locations, (store.document.canvas.width - bounds.width) / 2 - bounds.x, 0);
      if (action === "align-right") return moveBy(locations, store.document.canvas.width - bounds.width - bounds.x, 0);
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      if (action === "x") return moveBy(locations, number - bounds.x, 0);
      if (action === "y") return moveBy(locations, 0, number - bounds.y);
      if (action === "width") {
        const width = Math.max(1, number);
        return resize(locations, bounds, width, options.ratioLocked ? bounds.height * width / bounds.width : bounds.height);
      }
      if (action === "height") {
        const height = Math.max(1, number);
        return resize(locations, bounds, options.ratioLocked ? bounds.width * height / bounds.height : bounds.width, height);
      }
      if (action === "rotation") return rotate(locations, bounds, number);
      return false;
    }
  };

  function actionButton(action, icon, label) {
    return '<button type="button" data-object-property-action="' + action + '"><i class="bi ' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
  }

  function field(name, label, value, suffix) {
    return '<label class="image-editor-object-property-field"><span>' + label + '</span><div><input type="number" step="0.1" data-object-property-field="' + name + '" value="' + value + '"><small>' + suffix + '</small></div></label>';
  }

  function format(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Object.is(rounded, -0) ? "0" : String(rounded);
  }

  class ImageEditorObjectProperties {
    /** Render and bind Properties-tab controls for explicitly selected content objects. */
    constructor(store, options = {}) {
      this.store = store;
      this.onMutate = options.onMutate || (() => false);
      this.ratioLocked = true;
    }

    hasSelection() { return Operations.selectedLocations(this.store).length > 0; }

    render(container) {
      const state = Operations.state(this.store);
      if (!state.bounds) return false;
      const rotation = state.rotation == null ? "" : format(state.rotation);
      container.innerHTML = '<section class="image-editor-object-properties">' +
        '<div class="image-editor-object-stacking">' +
        actionButton("forward", "bi-chevron-up", "Forward") + actionButton("backward", "bi-chevron-down", "Backward") +
        actionButton("to-front", "bi-chevron-bar-up", "To front") + actionButton("to-back", "bi-chevron-bar-down", "To back") + '</div>' +
        '<h3>Align to page</h3><div class="image-editor-object-alignment">' +
        actionButton("align-top", "bi-align-top", "Top") + actionButton("align-left", "bi-align-start", "Left") +
        actionButton("align-middle", "bi-align-middle", "Middle") + actionButton("align-center", "bi-align-center", "Center") +
        actionButton("align-bottom", "bi-align-bottom", "Bottom") + actionButton("align-right", "bi-align-end", "Right") + '</div>' +
        '<h3>Advanced</h3><div class="image-editor-object-transform-grid">' +
        field("width", "Width", format(state.bounds.width), "px") + field("height", "Height", format(state.bounds.height), "px") +
        '<label class="image-editor-object-property-field"><span>Ratio</span><button type="button" data-object-ratio-lock="true" aria-pressed="' + String(this.ratioLocked) + '" title="Keep proportions"><i class="bi ' + (this.ratioLocked ? "bi-lock-fill" : "bi-unlock") + '" aria-hidden="true"></i></button></label>' +
        field("x", "X", format(state.bounds.x), "px") + field("y", "Y", format(state.bounds.y), "px") + field("rotation", "Rotate", rotation, "deg") +
        '</div>' + (!state.editable ? '<p class="image-editor-object-properties-locked"><i class="bi bi-lock-fill"></i> Unlock and show every selected object to edit it.</p>' : '') + '</section>';
      container.querySelectorAll("[data-object-property-action]").forEach((button) => {
        button.disabled = !state.editable;
        button.addEventListener("click", () => this.mutate(button.dataset.objectPropertyAction));
      });
      container.querySelectorAll("[data-object-property-field]").forEach((input) => {
        input.disabled = !state.editable || (input.dataset.objectPropertyField === "rotation" && state.rotation == null);
        if (state.rotation == null && input.dataset.objectPropertyField === "rotation") input.placeholder = "Mixed";
        input.addEventListener("change", () => this.mutate(input.dataset.objectPropertyField, input.value));
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") input.blur();
          if (event.key === "Escape") { event.preventDefault(); this.render(container); }
        });
      });
      const ratio = container.querySelector("[data-object-ratio-lock]");
      ratio.disabled = !state.editable;
      ratio.addEventListener("click", () => { this.ratioLocked = !this.ratioLocked; this.render(container); });
      return true;
    }

    mutate(action, value) {
      const labels = {
        forward: "Move objects forward", backward: "Move objects backward", "to-front": "Move objects to front", "to-back": "Move objects to back",
        "align-top": "Align objects to page top", "align-middle": "Align objects to page middle", "align-bottom": "Align objects to page bottom",
        "align-left": "Align objects to page left", "align-center": "Align objects to page center", "align-right": "Align objects to page right",
        width: "Resize object width", height: "Resize object height", x: "Move object horizontally", y: "Move object vertically", rotation: "Rotate object"
      };
      return this.onMutate(labels[action] || "Change object properties", () => Operations.apply(this.store, action, value, { ratioLocked: this.ratioLocked }));
    }
  }

  Object.assign(namespace, { ImageEditorObjectPropertyOperations: Operations, ImageEditorObjectProperties });
})(typeof window !== "undefined" ? window : globalThis);

