// Sample color, result preview, and tonal controls for Replace Color adjustment layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorReplaceColorProperties {
    constructor(options = {}) { this.onMutate = options.onMutate || (() => {}); }

    /** Return sampled-color and replacement controls for the persistent descriptor. */
    controls(adjustment, disabled, propertyControl) {
      const samplerDisabled = disabled || typeof global.EyeDropper !== "function" ? " disabled" : "";
      const result = namespace.ImageEditorReplaceColorAdjustment.resultColor(adjustment);
      return '<div class="image-editor-replace-color-properties"><div class="image-editor-replace-color-samples">' +
        '<button type="button" data-replace-color-sample title="Sample color from screen" aria-label="Sample color from screen"' + samplerDisabled + '><i class="bi bi-eyedropper" aria-hidden="true"></i></button>' +
        '<label><span>Color</span><input type="color" value="' + adjustment.sourceColor + '" data-replace-color-source title="Color to replace" aria-label="Color to replace"' + disabled + '></label>' +
        '<label><span>Result</span><output data-replace-color-result style="--image-editor-replace-color:' + result + '"></output></label></div>' +
        propertyControl("Fuzziness", "fuzziness", 0, 200, adjustment.fuzziness, disabled) +
        propertyControl("Hue", "hue", -180, 180, adjustment.hue, disabled) +
        propertyControl("Saturation", "saturation", -100, 100, adjustment.saturation, disabled) +
        propertyControl("Lightness", "lightness", -100, 100, adjustment.lightness, disabled) +
        '<p class="image-editor-replace-color-help">Fuzziness controls how closely colors must match. A current pixel selection becomes the adjustment mask.</p></div>';
    }

    /** Bind source-color editing and screen sampling after Properties renders. */
    bind(container, node) {
      const color = container.querySelector("[data-replace-color-source]");
      color?.addEventListener("change", () => this.onMutate("Change Replace Color sample", node.id, { type: "properties", patch: { sourceColor: color.value } }));
      const refreshResult = () => {
        const preview = container.querySelector("[data-replace-color-result]");
        if (!preview) return;
        const values = { ...node.adjustment, sourceColor: color?.value || node.adjustment.sourceColor };
        container.querySelectorAll("[data-adjustment-property]").forEach((input) => { values[input.dataset.adjustmentProperty] = Number(input.value); });
        preview.style.setProperty("--image-editor-replace-color", namespace.ImageEditorReplaceColorAdjustment.resultColor(values));
      };
      container.querySelectorAll('[data-adjustment-property="hue"], [data-adjustment-property="saturation"], [data-adjustment-property="lightness"]').forEach((input) => input.addEventListener("input", refreshResult));
      container.querySelector("[data-replace-color-sample]")?.addEventListener("click", async () => {
        if (typeof global.EyeDropper !== "function") return;
        try {
          const sample = await new global.EyeDropper().open();
          if (sample?.sRGBHex) this.onMutate("Sample Replace Color", node.id, { type: "properties", patch: { sourceColor: sample.sRGBHex } });
        } catch (_error) {
          // Cancelling the operating-system eyedropper leaves the adjustment unchanged.
        }
      });
    }
  }

  namespace.ImageEditorReplaceColorProperties = ImageEditorReplaceColorProperties;
})(typeof window !== "undefined" ? window : globalThis);
