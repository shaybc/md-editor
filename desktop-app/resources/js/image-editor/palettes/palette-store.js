// Versioned app-wide palette preferences and change notifications for image-editor tabs.
(function(global, factory) {
  "use strict";

  const api = factory(global.MarkdownViewerImageEditor?.ImageEditorPaletteCatalog || (typeof require === "function" ? require("./palette-catalog.js") : null));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPaletteStore = api.ImageEditorPaletteStore;
})(typeof window !== "undefined" ? window : globalThis, function(catalog) {
  "use strict";

  const VERSION = 1;

  function normalizeSlots(slots) {
    return Array.from({ length: 12 }, (_, index) => catalog.normalizeHex(slots?.[index]) || null);
  }

  function normalizeCustomPalette(value) {
    if (!value || typeof value !== "object") return null;
    const slots = normalizeSlots(value.slots);
    if (!slots.some(Boolean)) return null;
    const id = String(value.id || "").trim();
    if (!id) return null;
    return {
      id,
      name: String(value.name || "Custom palette").trim() || "Custom palette",
      source: "custom",
      slots,
      colorNames: Array.from({ length: 12 }, (_, index) => String(value.colorNames?.[index] || "")),
      createdAt: Number(value.createdAt) || Date.now()
    };
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) return `custom-${globalThis.crypto.randomUUID()}`;
    return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Maintains global palette selection and persisted custom palette definitions. */
  class ImageEditorPaletteStore {
    /**
     * @param {{loadState?:function():object,saveState?:function(object):void}} dependencies - Global preference accessors.
     */
    constructor(dependencies = {}) {
      this.dependencies = dependencies;
      this.listeners = new Set();
      this.state = this.normalizePreferences(dependencies.loadState?.()?.imageEditorPalettes);
    }

    normalizePreferences(value) {
      const customPalettes = (Array.isArray(value?.customPalettes) ? value.customPalettes : []).map(normalizeCustomPalette).filter(Boolean);
      const knownIds = new Set(["default", ...catalog.BUILT_IN_PALETTES.map((palette) => palette.id), ...customPalettes.map((palette) => palette.id)]);
      return {
        version: VERSION,
        activePaletteId: knownIds.has(value?.activePaletteId) ? value.activePaletteId : "default",
        customPalettes
      };
    }

    list() {
      return [catalog.DEFAULT_PALETTE, ...this.state.customPalettes.slice().sort((left, right) => right.createdAt - left.createdAt), ...catalog.BUILT_IN_PALETTES];
    }

    get(id) {
      return this.list().find((palette) => palette.id === id) || null;
    }

    active() {
      return this.get(this.state.activePaletteId) || catalog.DEFAULT_PALETTE;
    }

    toolbarColors() {
      return catalog.toolbarColors(this.active());
    }

    select(id) {
      if (!this.get(id) || this.state.activePaletteId === id) return !!this.get(id);
      this.state.activePaletteId = id;
      this.persist("selection");
      return true;
    }

    createCustom({ name, slots, colorNames, createdAt } = {}) {
      const normalizedSlots = normalizeSlots(slots);
      if (!normalizedSlots.some(Boolean)) throw new Error("Add at least one color before saving the palette.");
      const number = this.state.customPalettes.length + 1;
      const palette = normalizeCustomPalette({
        id: createId(),
        name: String(name || "").trim() || `Custom palette ${number}`,
        slots: normalizedSlots,
        colorNames,
        createdAt: Number(createdAt) || Date.now()
      });
      this.state.customPalettes.push(palette);
      this.persist("custom-created");
      return palette;
    }

    importCustom(palettes) {
      const created = [];
      (palettes || []).forEach((palette, paletteIndex) => {
        const colors = Array.isArray(palette.colors) ? palette.colors : [];
        for (let offset = 0; offset < colors.length; offset += 12) {
          const part = colors.slice(offset, offset + 12);
          if (!part.length) continue;
          const suffix = colors.length > 12 ? ` ${Math.floor(offset / 12) + 1}` : "";
          created.push(this.createCustom({
            name: `${String(palette.name || `Imported palette ${paletteIndex + 1}`).trim()}${suffix}`,
            slots: part.map((color) => color.hex || color),
            colorNames: part.map((color) => color.name || ""),
            createdAt: Date.now() + created.length
          }));
        }
      });
      return created;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    persist(reason) {
      const value = {
        version: VERSION,
        activePaletteId: this.state.activePaletteId,
        customPalettes: this.state.customPalettes.map(({ id, name, slots, colorNames, createdAt }) => ({ id, name, slots: slots.slice(), colorNames: colorNames.slice(), createdAt }))
      };
      this.dependencies.saveState?.({ imageEditorPalettes: value });
      this.listeners.forEach((listener) => listener({ reason, activePalette: this.active(), toolbarColors: this.toolbarColors() }));
    }
  }

  return { ImageEditorPaletteStore, normalizeSlots, normalizeCustomPalette };
});
