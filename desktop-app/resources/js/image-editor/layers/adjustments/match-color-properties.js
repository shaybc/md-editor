// Match Color source-layer selection and tonal-transfer property controls.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorMatchColorProperties {
    constructor(options = {}) {
      this.getSources = options.getSources || (() => []);
      this.getStatistics = options.getStatistics || (() => null);
      this.onMutate = options.onMutate || (() => {});
    }

    /** Return Match Color source and image-option controls. */
    controls(adjustment, disabled, propertyControl) {
      const sources = this.getSources();
      const sourceOptions = ['<option value="">None</option>'].concat(sources.map((source) =>
        '<option value="' + source.id + '"' + (adjustment.sourceNodeId === source.id ? " selected" : "") + '>' + source.name + '</option>'
      )).join("");
      return '<div class="image-editor-match-color-properties"><p class="image-editor-match-color-target">Destination: visible content beneath this adjustment</p>' +
        propertyControl("Luminance", "luminance", 1, 200, adjustment.luminance, disabled) +
        propertyControl("Color Intensity", "colorIntensity", 1, 200, adjustment.colorIntensity, disabled) +
        propertyControl("Fade", "fade", 0, 100, adjustment.fade, disabled) +
        '<label class="image-editor-match-color-neutralize"><input type="checkbox" data-match-color-neutralize' + (adjustment.neutralize ? " checked" : "") + disabled + '> Neutralize</label>' +
        '<label class="image-editor-match-color-source"><span>Source layer</span><select data-match-color-source' + disabled + '>' + sourceOptions + '</select></label>' +
        '<p class="image-editor-match-color-help">The source layer statistics are stored with this adjustment. A current pixel selection becomes its adjustment mask.</p></div>';
    }

    /** Bind source selection and neutralization after the Properties panel renders. */
    bind(container, node) {
      const source = container.querySelector("[data-match-color-source]");
      source?.addEventListener("change", () => {
        const selected = this.getSources().find((candidate) => candidate.id === source.value);
        const statistics = selected ? this.getStatistics(selected.id) : null;
        const patch = namespace.ImageEditorMatchColorAdjustment.sourcePatch(selected?.id, selected?.name, statistics);
        this.onMutate("Change Palette Match source", node.id, { type: "properties", patch });
      });
      const neutralize = container.querySelector("[data-match-color-neutralize]");
      neutralize?.addEventListener("change", () => this.onMutate("Toggle Palette Match neutralization", node.id, { type: "properties", patch: { neutralize: neutralize.checked } }));
    }
  }

  namespace.ImageEditorMatchColorProperties = ImageEditorMatchColorProperties;
})(typeof window !== "undefined" ? window : globalThis);
