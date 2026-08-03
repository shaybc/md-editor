(function(window, document) {
  "use strict";

  /**
   * Render the AI autocomplete Accept/Reject action pill.
   *
   * The ghost *text* itself is rendered by real CodeMirror decorations (see
   * aiGhostSuggestionField / AiGhostInlineWidget / AiGhostBlockWidget in
   * codemirror-bundle-source.js), not by this module. A floating, pixel-positioned DOM
   * overlay can only ever sit visually *on top of* whatever already occupies the rows below
   * the cursor — fine for a single-line suggestion, but it made multiline suggestions
   * overlap and garble the real code underneath instead of pushing it down like a real
   * insertion would. Using genuine CodeMirror widget decorations means the editor lays out
   * the suggested lines as real (non-editable) rows and reflows everything below them, the
   * same way it would for any other content change. This module now only owns the small
   * floating Accept/Reject pill, which still makes sense as a simple positioned DOM element
   * since it needs to float near, but not inside, the text flow.
   * @param {{onAccept: function(): void, onReject: function(): void}} callbacks User action callbacks.
   * @returns {object} Overlay controls.
   */
  function createAiCompanionAutocompleteGhostOverlay(callbacks) {
    const layer = document.createElement("div");
    layer.className = "ai-ghost-completion hidden";
    layer.innerHTML = '<span class="ai-ghost-actions"><button type="button" data-ai-ghost-accept>Accept</button><button type="button" data-ai-ghost-reject>Reject</button></span>';
    document.body.appendChild(layer);

    // hide()/reposition() don't receive the suggestion themselves, so remember which
    // editor's ghost decoration is currently showing (there's only ever one at a time).
    let activeEditor = null;

    function positionLayer(view, position) {
      const coords = view.coordsAtPos(position);
      if (!coords) return;
      layer.style.left = `${Math.max(8, coords.left)}px`;
      layer.style.top = `${Math.max(8, coords.top - 34)}px`;
    }

    function hide() {
      layer.classList.add("hidden");
      // Also cleared automatically the moment any document change happens (see the
      // StateField's own docChanged handling), but an explicit clear here covers the
      // "suggestion dismissed without any document edit" paths (reject, scroll away,
      // scope/settings change) where that automatic clear never fires.
      if (activeEditor && typeof activeEditor.clearAiGhostSuggestion === "function") {
        activeEditor.clearAiGhostSuggestion();
      }
      activeEditor = null;
    }

    function show(view, suggestion) {
      activeEditor = suggestion.editor || null;
      if (activeEditor && typeof activeEditor.setAiGhostSuggestion === "function") {
        activeEditor.setAiGhostSuggestion({ position: suggestion.position, completion: suggestion.completion });
      }
      layer.classList.remove("hidden");
      positionLayer(view, suggestion.position);
    }

    layer.querySelector("[data-ai-ghost-accept]").addEventListener("mousedown", (event) => {
      event.preventDefault();
      callbacks.onAccept();
    });
    layer.querySelector("[data-ai-ghost-reject]").addEventListener("mousedown", (event) => {
      event.preventDefault();
      callbacks.onReject();
    });

    return {
      hide,
      show,
      reposition: function(view, suggestion) {
        // The ghost text reflows itself as part of the document's normal layout, so only
        // the pill (a separate floating element) needs manual repositioning here.
        positionLayer(view, suggestion.position);
      }
    };
  }

  window.createAiCompanionAutocompleteGhostOverlay = createAiCompanionAutocompleteGhostOverlay;
})(window, document);
