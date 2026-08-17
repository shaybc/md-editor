// Properties-panel controls for editable text effects.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clampCurve(value) {
    return Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
  }

  class ImageEditorTextEffectProperties {
    /**
     * Bind Curve effect controls to document preview and transaction callbacks.
     * @param {object} options - Preview, commit, and discrete mutation callbacks.
     */
    constructor(options = {}) {
      this.onBeginEdit = options.onBeginEdit || (() => null);
      this.onPreview = options.onPreview || (() => false);
      this.onCommitEdit = options.onCommitEdit || (() => {});
      this.onMutate = options.onMutate || (() => false);
      this.editSnapshot = null;
      this.editChanged = false;
    }

    /**
     * Render controls when the exact selected object owns an effect with editable curvature.
     * @param {HTMLElement} container - Properties panel content element.
     * @param {object|null} target - Exact selected text-object lookup result.
     * @returns {boolean} Whether Curve properties were rendered.
     */
    render(container, target) {
      const descriptor = namespace.ImageEditorTextEffectCatalog.normalize(target?.object?.payload?.textEffect || {});
      if (!target || !Number.isFinite(Number(descriptor?.curve))) return false;
      const preset = namespace.ImageEditorTextEffectCatalog.get(descriptor.id);
      const value = clampCurve(descriptor.curve);
      const disabled = target.locked ? " disabled" : "";
      container.innerHTML =
        '<section class="image-editor-text-effect-properties">' +
          '<header><span class="image-editor-text-effect-properties-icon" aria-hidden="true">ABC</span><strong>' + (preset?.label || "Text") + ' curve</strong></header>' +
          '<label for="image-editor-text-curve-range">Curve</label>' +
          '<div class="image-editor-text-curve-control">' +
            '<input id="image-editor-text-curve-range" type="range" min="-100" max="100" step="1" value="' + value + '" data-text-curve-range aria-label="Text curve"' + disabled + '>' +
            '<div class="image-editor-text-curve-stepper">' +
              '<button type="button" data-text-curve-step="-1" title="Decrease curve" aria-label="Decrease curve"' + disabled + '>&minus;</button>' +
              '<input type="number" min="-100" max="100" step="1" value="' + value + '" data-text-curve-value aria-label="Text curve value"' + disabled + '>' +
              '<button type="button" data-text-curve-step="1" title="Increase curve" aria-label="Increase curve"' + disabled + '>+</button>' +
            '</div>' +
          '</div>' +
          '<p>Positive values arch the text upward. Negative values curve it downward.</p>' +
          (target.locked ? '<p class="image-editor-text-effect-properties-locked">Unlock the object to change this effect.</p>' : "") +
        '</section>';
      this.bind(container, target.object.id);
      return true;
    }

    bind(container, objectId) {
      const range = container.querySelector("[data-text-curve-range]");
      const number = container.querySelector("[data-text-curve-value]");
      if (!range || !number || range.disabled) return;
      const begin = () => {
        if (!this.editSnapshot) {
          this.editSnapshot = this.onBeginEdit();
          this.editChanged = false;
        }
      };
      const preview = (rawValue) => {
        begin();
        const value = clampCurve(rawValue);
        range.value = String(value);
        number.value = String(value);
        if (this.onPreview(objectId, { curve: value })) this.editChanged = true;
      };
      const commit = (cancel = false) => {
        if (!this.editSnapshot) return;
        const before = this.editSnapshot;
        const changed = this.editChanged;
        this.editSnapshot = null;
        this.editChanged = false;
        if (changed) this.onCommitEdit(before, "Change text curve", cancel, objectId);
      };
      range.addEventListener("pointerdown", begin);
      range.addEventListener("input", () => preview(range.value));
      range.addEventListener("change", () => commit(false));
      number.addEventListener("focus", begin);
      number.addEventListener("input", () => preview(number.value));
      number.addEventListener("change", () => commit(false));
      [range, number].forEach((control) => control.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        commit(true);
      }));
      container.querySelectorAll("[data-text-curve-step]").forEach((button) => {
        button.addEventListener("click", () => {
          const value = clampCurve(Number(number.value) + Number(button.dataset.textCurveStep));
          this.onMutate("Change text curve", objectId, { curve: value });
        });
      });
    }
  }

  namespace.ImageEditorTextEffectProperties = ImageEditorTextEffectProperties;
})(typeof window !== "undefined" ? window : globalThis);
