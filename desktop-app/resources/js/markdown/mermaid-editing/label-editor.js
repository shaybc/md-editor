/* Fullscreen Mermaid edit controls and positioned plain-text label input. */
(function(global, document) {
  "use strict";

  /** Connect the fullscreen viewer to draft sessions; dependencies retain ownership of SVG transforms and file saving. */
  global.createMarkdownViewerMermaidLabelEditor = function(deps) {
    const byId = id => document.getElementById("mermaid-modal-" + id);
    const diagramArea = byId("diagram");
    const editButton = byId("edit");
    const saveButton = byId("save");
    const cancelButton = byId("cancel-edit");
    const selectionButton = byId("select-text");
    const form = byId("label-editor");
    const input = byId("label-text");
    const status = byId("edit-status");
    let diagram = null;
    let originalSvg = null;
    let components = [];
    let session = null;
    let selected = null;
    let busy = false;
    let generation = 0;
    let confirming = false;

    function setStatus(message) { status.textContent = message; }

    function refreshControls() {
      const editing = !!session;
      diagramArea.classList.toggle("editing", editing);
      editButton.hidden = editing;
      editButton.disabled = !diagram || diagram.readOnly || !components.some(c => c.editable);
      editButton.title = diagram?.readOnly ? "This document is read-only." : editButton.disabled
        ? (diagram?.reason || "This diagram has no supported editable node labels.") : "Edit node labels";
      saveButton.hidden = cancelButton.hidden = !editing;
      saveButton.disabled = busy;
      cancelButton.disabled = busy;
      selectionButton.disabled = editing;
      input.disabled = busy;
      byId("apply-label").disabled = busy;
    }

    function mapSvg() {
      components = diagram && deps.getSvg() ? global.MarkdownViewerMermaidSvgMap.attach(deps.getSvg(), diagram) : [];
    }

    /** Keep the editor inside the viewport while anchoring it to the transformed label. */
    function reposition() {
      if (form.hidden || !selected) return;
      const rect = global.MarkdownViewerMermaidSvgMap.screenBounds(selected);
      const width = Math.min(Math.max(rect.width + 24, 300), global.innerWidth - 32);
      form.style.width = width + "px";
      form.style.left = Math.max(16, Math.min(rect.x, global.innerWidth - width - 16)) + "px";
      form.style.top = Math.max(16, Math.min(rect.y, global.innerHeight - form.offsetHeight - 16)) + "px";
    }

    function hideInput() {
      selected = null;
      form.hidden = true;
    }

    async function renderDraft() {
      const ticket = ++generation;
      const svg = await deps.render(session.draftSource());
      if (ticket !== generation || !session) return;
      deps.replaceSvg(svg);
      mapSvg();
    }

    async function applyLabel() {
      if (!session || !selected || busy) return;
      session.setLabel(selected.nodeId, input.value);
      hideInput();
      busy = true;
      refreshControls();
      try {
        setStatus("Updating draft...");
        await renderDraft();
        setStatus("Draft updated. Save writes changes to the document and file.");
      } catch (error) { setStatus(error.message || String(error)); }
      finally { busy = false; refreshControls(); }
    }

    function inputChanged() {
      return selected && input.value.replace(/\r\n?/g, "\n") !== session.getLabel(selected.nodeId);
    }

    async function confirmDiscard() {
      if (!session || (!session.hasChanges() && !inputChanged())) return true;
      if (confirming || busy) return false;
      confirming = true;
      try {
        const applied = session.isApplied();
        return await deps.confirm(applied
          ? "The document contains these edits, but the file has not been saved. Leave diagram editing? The document will remain unsaved."
          : "Discard the unsaved diagram label edits?", applied);
      } finally { confirming = false; }
    }

    function finish() {
      generation++;
      hideInput();
      session = null;
      setStatus("");
      refreshControls();
    }

    editButton.addEventListener("click", () => {
      if (editButton.disabled || session) return;
      try {
        session = global.createMarkdownViewerMermaidEditSession(diagram, deps);
        session.assertCurrent();
        deps.setPanMode();
        setStatus("Click a highlighted node to edit its text. Changes remain a draft until Save.");
        refreshControls();
      } catch (error) { session = null; setStatus(error.message); refreshControls(); }
    });

    diagramArea.addEventListener("click", event => {
      if (!session) return;
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      if (session.isApplied()) {
        setStatus("These edits are already in the document. Retry Save or leave editing before making more changes.");
        return;
      }
      if (selected) { input.focus(); return; }
      const node = event.target.closest("[data-mermaid-component]");
      const component = components.find(item => item.svgElement === node);
      if (!component?.editable) {
        setStatus(component?.reason || "Select a highlighted flowchart node. Only node labels can be edited.");
        return;
      }
      selected = component;
      input.value = session.getLabel(component.nodeId);
      form.hidden = false;
      reposition();
      input.focus();
      input.select();
    }, true);

    form.addEventListener("submit", event => { event.preventDefault(); void applyLabel(); });
    byId("cancel-label").addEventListener("click", hideInput);
    form.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); hideInput(); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); void applyLabel();
      }
    });

    saveButton.addEventListener("click", async () => {
      if (!session || busy) return;
      if (selected) session.setLabel(selected.nodeId, input.value);
      hideInput();
      busy = true;
      refreshControls();
      try {
        setStatus("Saving diagram...");
        await renderDraft();
        if (await session.save()) {
          const source = session.draftSource();
          diagram = { ...diagram, source, documentSource: deps.getDocument().source,
            end: diagram.start + source.length, ...global.MarkdownViewerMermaidSourceMap.scanNodes(source) };
          mapSvg();
          originalSvg = deps.getSvg().cloneNode(true);
          finish();
          setStatus("Diagram saved.");
        }
      } catch (error) { setStatus(error.message || String(error)); }
      finally { busy = false; refreshControls(); }
    });

    cancelButton.addEventListener("click", async () => {
      if (!await confirmDiscard()) return;
      const applied = session?.isApplied();
      finish();
      if (!applied && originalSvg) { deps.replaceSvg(originalSvg.cloneNode(true)); mapSvg(); }
      if (applied) { diagram = null; refreshControls(); }
    });

    diagramArea.addEventListener("scroll", reposition);
    global.addEventListener("resize", reposition);
    diagramArea.addEventListener("transitionend", reposition);

    return {
      /** Capture the exact source context belonging to the opened SVG. */
      open(container) {
        finish();
        diagram = global.MarkdownViewerMermaidSourceMap.get(container);
        originalSvg = deps.getSvg()?.cloneNode(true);
        mapSvg();
        refreshControls();
      },
      isEditing: () => !!session,
      reposition,
      /** Ask through the application dialog service before discarding a pending draft. */
      async requestClose() {
        if (busy || !await confirmDiscard()) return false;
        finish();
        diagram = null;
        originalSvg = null;
        components = [];
        return true;
      }
    };
  };
})(window, document);
