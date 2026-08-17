// Selective Color family, CMYK correction, and calculation-method property controls.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const LABELS = Object.freeze({
    reds: "Reds", yellows: "Yellows", greens: "Greens", cyans: "Cyans", blues: "Blues",
    magentas: "Magentas", whites: "Whites", neutrals: "Neutrals", blacks: "Blacks"
  });

  class ImageEditorSelectiveColorProperties {
    constructor(options = {}) {
      this.onMutate = options.onMutate || (() => {});
    }

    /** Return controls for one selected color family without discarding other families. */
    controls(adjustment, disabled, propertyControl) {
      const ranges = namespace.ImageEditorAdjustmentModel.SELECTIVE_COLOR_RANGES;
      const selected = ranges.includes(adjustment.selectedColor) ? adjustment.selectedColor : "reds";
      const options = ranges.map((range) => '<option value="' + range + '"' + (selected === range ? " selected" : "") + '>' + LABELS[range] + '</option>').join("");
      return '<div class="image-editor-selective-color-properties"><label class="image-editor-selective-color-row"><span>Preset</span><select disabled><option>Default</option></select></label>' +
        '<label class="image-editor-selective-color-row"><span>Colors</span><select data-selective-color-range' + disabled + '>' + options + '</select></label>' +
        propertyControl("Cyan", selected + "Cyan", -100, 100, adjustment[selected + "Cyan"], disabled) +
        propertyControl("Magenta", selected + "Magenta", -100, 100, adjustment[selected + "Magenta"], disabled) +
        propertyControl("Yellow", selected + "Yellow", -100, 100, adjustment[selected + "Yellow"], disabled) +
        propertyControl("Black", selected + "Black", -100, 100, adjustment[selected + "Black"], disabled) +
        '<div class="image-editor-selective-color-method"><label><input type="radio" name="image-editor-selective-color-method" value="relative" data-selective-color-method' + (adjustment.relative ? " checked" : "") + disabled + '> Relative</label>' +
        '<label><input type="radio" name="image-editor-selective-color-method" value="absolute" data-selective-color-method' + (!adjustment.relative ? " checked" : "") + disabled + '> Absolute</label></div></div>';
    }

    /** Bind family and Relative/Absolute selection after the Properties panel renders. */
    bind(container, node) {
      const range = container.querySelector("[data-selective-color-range]");
      range?.addEventListener("change", () => this.onMutate("Change Color Components family", node.id, { type: "properties", patch: { selectedColor: range.value } }));
      container.querySelectorAll("[data-selective-color-method]").forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.checked) this.onMutate("Change Color Components method", node.id, { type: "properties", patch: { relative: radio.value === "relative" } });
        });
      });
    }
  }

  namespace.ImageEditorSelectiveColorProperties = ImageEditorSelectiveColorProperties;
})(typeof window !== "undefined" ? window : globalThis);
