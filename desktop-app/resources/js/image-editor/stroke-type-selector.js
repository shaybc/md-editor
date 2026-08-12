// Visual dropdown control for choosing the image editor's global line pattern.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const STROKE_LABELS = Object.freeze({
    solid: "Solid line",
    dash: "Dash line",
    center: "Center line",
    dotted: "Dotted line",
    "dash-dot": "Dash-dot line",
    "dash-double-dot": "Dash-double-dot line"
  });

  /** Synchronize the visual selector with the active global stroke type. */
  function syncStrokeTypeSelector(selector, strokeType) {
    if (!selector) return;
    const value = namespace.normalizeStrokeType(strokeType);
    selector.dataset.value = value;
    const trigger = selector.querySelector(".image-editor-stroke-type-trigger");
    trigger?.setAttribute("aria-label", `Line type: ${STROKE_LABELS[value]}`);
    const sample = trigger?.querySelector(".image-editor-line-pattern");
    if (sample) sample.dataset.strokeType = value;
    selector.querySelectorAll(".image-editor-stroke-type-option").forEach((option) => {
      const selected = option.dataset.value === value;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-selected", String(selected));
    });
  }

  /** Bind selection and keyboard behavior to one visual stroke-type dropdown. */
  function bindStrokeTypeSelector(selector, onChange) {
    if (!selector) return;
    const trigger = selector.querySelector(".image-editor-stroke-type-trigger");
    const menu = selector.querySelector(".image-editor-stroke-type-menu");
    const options = Array.from(selector.querySelectorAll(".image-editor-stroke-type-option"));

    function setOpen(open) {
      selector.open = open;
      trigger.setAttribute("aria-expanded", String(open));
    }

    function selectOption(option) {
      const value = namespace.normalizeStrokeType(option.dataset.value);
      syncStrokeTypeSelector(selector, value);
      setOpen(false);
      trigger.focus();
      onChange(value);
    }

    selector.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(selector.open)));
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".image-editor-stroke-type-option");
      if (option) selectOption(option);
    });
    selector.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      if (!selector.open) setOpen(true);
      const current = Math.max(0, options.indexOf(global.document.activeElement));
      const offset = event.key === "ArrowDown" ? 1 : -1;
      options[(current + offset + options.length) % options.length].focus();
    });
    selector.addEventListener("focusout", () => {
      global.setTimeout(() => {
        if (!selector.contains(global.document.activeElement)) setOpen(false);
      }, 0);
    });
  }

  Object.assign(namespace, { bindStrokeTypeSelector, syncStrokeTypeSelector });
})(typeof window !== "undefined" ? window : globalThis);
