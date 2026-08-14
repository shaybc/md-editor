// Object-level hit testing and selection for layered image documents.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function pointInObject(point, object) {
    const transform = object.transform || {};
    const bounds = object.bounds || {};
    const width = Math.max(1, bounds.width * (Number(transform.scaleX) || 1));
    const height = Math.max(1, bounds.height * (Number(transform.scaleY) || 1));
    const centerX = (Number(transform.x ?? bounds.x) || 0) + width / 2;
    const centerY = (Number(transform.y ?? bounds.y) || 0) + height / 2;
    const rotation = -(Number(transform.rotation) || 0);
    const deltaX = point.x - centerX;
    const deltaY = point.y - centerY;
    const localX = deltaX * Math.cos(rotation) - deltaY * Math.sin(rotation) + width / 2;
    const localY = deltaX * Math.sin(rotation) + deltaY * Math.cos(rotation) + height / 2;
    return localX >= 0 && localY >= 0 && localX <= width && localY <= height;
  }

  function collectHits(document, point) {
    const hits = [];
    function visit(nodes, inheritedVisible = true, inheritedLocked = false) {
      nodes.forEach((node) => {
        const visible = inheritedVisible && node.visible !== false;
        const locked = inheritedLocked || node.locked === true;
        if (!visible) return;
        if (node.kind === "object") {
          if (!locked && pointInObject(point, node)) hits.push(node.id);
          return;
        }
        if (node.kind === "group") { visit(node.children || [], visible, locked); return; }
        (node.objects || []).forEach((object) => {
          if (object.visible !== false && !locked && !object.locked && pointInObject(point, object)) hits.push(object.id);
        });
      });
    }
    visit(document.nodes || []);
    return hits;
  }

  class ImageEditorObjectSelection {
    /** Coordinate topmost, additive, cycling, and marquee object selection. */
    constructor(store) {
      this.store = store;
      this.lastPointKey = "";
      this.cycleIndex = 0;
    }

    hitTest(point, options = {}) {
      const hits = collectHits(this.store.document, point);
      if (!hits.length) return null;
      const key = `${Math.round(point.x)}:${Math.round(point.y)}:${hits.join(",")}`;
      if (options.cycle) {
        this.cycleIndex = key === this.lastPointKey ? (this.cycleIndex + 1) % hits.length : 0;
        this.lastPointKey = key;
      } else this.cycleIndex = 0;
      return hits[this.cycleIndex];
    }

    selectPoint(point, options = {}) {
      const id = this.hitTest(point, { cycle: options.cycle });
      if (!id) { if (!options.additive) this.store.select([]); return null; }
      if (options.additive && this.store.selectedIds.has(id)) {
        this.store.selectedIds.delete(id);
        this.store.notify({ type: "selection" });
      } else this.store.select(id, { additive: options.additive });
      return id;
    }

    selectMarquee(rect, additive = false) {
      const ids = [];
      namespace.walkDocumentObjects(this.store.document, (object, location) => {
        if (location.visible && !location.locked) {
          const bounds = object.bounds || {};
          const x = Number(object.transform?.x ?? bounds.x) || 0;
          const y = Number(object.transform?.y ?? bounds.y) || 0;
          if (object.visible && !object.locked && x < rect.x + rect.width && x + bounds.width > rect.x && y < rect.y + rect.height && y + bounds.height > rect.y) ids.push(object.id);
        }
      });
      this.store.select(ids, { additive });
      return ids;
    }
  }

  namespace.ImageEditorObjectSelection = ImageEditorObjectSelection;
})(typeof window !== "undefined" ? window : globalThis);
