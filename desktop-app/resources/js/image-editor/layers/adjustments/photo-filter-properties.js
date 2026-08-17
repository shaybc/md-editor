// Photo Filter preset, custom color, density, and luminosity property controls.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorPhotoFilterProperties {
    constructor(options = {}) {
      this.onMutate = options.onMutate || (() => {});
    }

    /** Return the Photo Filter controls for a persistent adjustment descriptor. */
    controls(adjustment, disabled, propertyControl) {
      const custom = adjustment.filterMode === "color";
      const presetOptions = namespace.ImageEditorPhotoFilterAdjustment.PRESETS.map((preset) =>
        '<option value="' + preset.id + '"' + (adjustment.filter === preset.id ? " selected" : "") + '>' + preset.name + '</option>'
      ).join("");
      return '<div class="image-editor-photo-filter-options">' +
        '<label><input type="radio" name="image-editor-photo-filter-mode" value="filter" data-photo-filter-mode' + (!custom ? " checked" : "") + disabled + '> Filter</label>' +
        '<select data-photo-filter-preset' + (custom ? " disabled" : disabled) + '>' + presetOptions + '</select>' +
        '<label><input type="radio" name="image-editor-photo-filter-mode" value="color" data-photo-filter-mode' + (custom ? " checked" : "") + disabled + '> Color</label>' +
        '<input type="color" value="' + adjustment.color + '" data-photo-filter-color title="Custom filter color" aria-label="Custom filter color"' + (!custom ? " disabled" : disabled) + '></div>' +
        propertyControl("Density", "density", 1, 100, adjustment.density, disabled) +
        '<label class="image-editor-photo-filter-preserve"><input type="checkbox" data-photo-filter-preserve' + (adjustment.preserveLuminosity ? " checked" : "") + disabled + '> Preserve Luminosity</label>';
    }

    /** Bind discrete Photo Filter controls after the Properties panel renders. */
    bind(container, node) {
      container.querySelectorAll("[data-photo-filter-mode]").forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.checked) this.onMutate("Change Lens Tint source", node.id, { type: "properties", patch: { filterMode: radio.value } });
        });
      });
      const preset = container.querySelector("[data-photo-filter-preset]");
      preset?.addEventListener("change", () => this.onMutate("Change Lens Tint preset", node.id, { type: "properties", patch: { filterMode: "filter", filter: preset.value } }));
      const color = container.querySelector("[data-photo-filter-color]");
      color?.addEventListener("change", () => this.onMutate("Change Lens Tint color", node.id, { type: "properties", patch: { filterMode: "color", color: color.value } }));
      const preserve = container.querySelector("[data-photo-filter-preserve]");
      preserve?.addEventListener("change", () => this.onMutate("Toggle Lens Tint luminosity preservation", node.id, { type: "properties", patch: { preserveLuminosity: preserve.checked } }));
    }
  }

  namespace.ImageEditorPhotoFilterProperties = ImageEditorPhotoFilterProperties;
})(typeof window !== "undefined" ? window : globalThis);
