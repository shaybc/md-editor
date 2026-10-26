/* Draft-only label edits, optimistic source validation and explicit persistence. */
(function(global) {
  "use strict";

  /** Create a draft tied to one document snapshot. Dependencies provide editor transactions and file persistence. */
  global.createMarkdownViewerMermaidEditSession = function(diagram, deps) {
    const changes = new Map();
    let expectedDocument = diagram.documentSource;
    let applied = false;
    let saving = false;

    function assertCurrent() {
      const current = deps.getDocument();
      if (!current || current.tabId !== diagram.tabId || current.source !== expectedDocument || current.readOnly) {
        throw new Error("The source document changed or is no longer active. Reopen the diagram before editing it.");
      }
    }

    /** Store a plain-text draft label; no document or file changes occur here. */
    function setLabel(id, text) {
      if (saving || applied) throw new Error("Finish saving this draft before editing more labels.");
      const node = diagram.nodes.get(id);
      if (!node?.editable) throw new Error("This node cannot be edited safely.");
      const value = String(text).replace(/\r\n?/g, "\n");
      if (value === node.originalText) changes.delete(id);
      else changes.set(id, value);
    }

    function draftSource() {
      return global.MarkdownViewerMermaidSourceMap.patchDiagram(diagram, changes);
    }

    /** Validate, commit one source transaction, then save. A failed file save remains retryable without a second transaction. */
    async function save() {
      if (saving) return false;
      saving = true;
      try {
        assertCurrent();
        const source = draftSource();
        if (!applied && changes.size) {
          const valid = await deps.validate(source);
          if (valid === false) throw new Error("The edited diagram is not valid Mermaid.");
          assertCurrent();
          if (!deps.applySource(diagram.start, diagram.end, source)) throw new Error("The document could not be updated.");
          expectedDocument = diagram.documentSource.slice(0, diagram.start) + source + diagram.documentSource.slice(diagram.end);
          applied = true;
        }
        if (!await deps.persist()) throw new Error("The file was not saved. Your changes remain in the document; retry Save or use the document's Save command.");
        return true;
      } finally { saving = false; }
    }

    return {
      setLabel, draftSource, save, assertCurrent,
      getLabel: id => changes.get(id) ?? diagram.nodes.get(id)?.originalText ?? "",
      hasChanges: () => changes.size > 0,
      isApplied: () => applied,
      isSaving: () => saving
    };
  };
})(window);
