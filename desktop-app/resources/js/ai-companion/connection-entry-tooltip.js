/** Viewport-safe explanation popups for AI connection entry fields. */
(function(window, document) {
  "use strict";

  /**
   * Create a tooltip layer that positions explanations outside scrollable dialogs.
   * @returns {{ bind: Function, hide: Function }} Tooltip binding and dismissal controls.
   */
  function createConnectionEntryTooltip() {
    let tooltip = null;

    function ensureTooltip() {
      if (tooltip) return tooltip;
      tooltip = document.createElement("div");
      tooltip.className = "settings-ai-entry-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
      return tooltip;
    }

    function hide() {
      if (tooltip) tooltip.hidden = true;
    }

    function show(anchor, description) {
      if (!anchor || !description) return;
      const popup = ensureTooltip();
      popup.textContent = description;
      popup.style.visibility = "hidden";
      popup.hidden = false;

      const anchorBounds = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const margin = 8;
      let left = anchorBounds.left + (anchorBounds.width / 2) - (popup.offsetWidth / 2);
      let top = anchorBounds.bottom + margin;

      left = Math.max(margin, Math.min(left, viewportWidth - popup.offsetWidth - margin));
      if (top + popup.offsetHeight > viewportHeight - margin) top = anchorBounds.top - popup.offsetHeight - margin;
      top = Math.max(margin, Math.min(top, viewportHeight - popup.offsetHeight - margin));

      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
      popup.style.visibility = "visible";
    }

    function bind(button, description) {
      button.addEventListener("mouseenter", () => show(button, description));
      button.addEventListener("mouseleave", hide);
      button.addEventListener("focus", () => show(button, description));
      button.addEventListener("blur", hide);
    }

    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return Object.freeze({ bind, hide });
  }

  window.MarkdownViewerAiConnectionEntryTooltip = Object.freeze({ create: createConnectionEntryTooltip });
})(window, document);
