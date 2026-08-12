// Transaction history for layered documents with shared immutable raster assets.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const DEFAULT_MAX_ENTRIES = 50;
  const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

  function retainedBytes(transactions) {
    const assets = new Map();
    let bytes = 0;
    transactions.forEach((transaction) => {
      [transaction.before, transaction.after].forEach((snapshot) => {
        bytes += JSON.stringify(snapshot?.document || {}).length * 2;
        (snapshot?.assets || new Map()).forEach((imageData, id) => {
          if (!assets.has(id)) assets.set(id, Number(imageData?.data?.byteLength || 0));
        });
      });
    });
    assets.forEach((size) => { bytes += size; });
    return bytes;
  }

  class ImageEditorDocumentHistory {
    /** Retain bounded document transactions while sharing immutable asset objects. */
    constructor(options = {}) {
      this.maxEntries = Math.max(1, Number(options.maxEntries || DEFAULT_MAX_ENTRIES));
      this.maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_MAX_BYTES));
      this.undoStack = [];
      this.redoStack = [];
      this.nextToken = 1;
      this.currentToken = 0;
      this.savedToken = 0;
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
    get isAtSavedState() { return this.currentToken === this.savedToken; }

    push(before, after, label = "Edit") {
      if (!before || !after) return false;
      this.undoStack.push({ before, after, label, beforeToken: this.currentToken, afterToken: this.nextToken++ });
      this.currentToken = this.undoStack[this.undoStack.length - 1].afterToken;
      this.redoStack = [];
      this.trim();
      return true;
    }

    trim() {
      while (this.undoStack.length > this.maxEntries || (this.undoStack.length > 1 && retainedBytes(this.undoStack) > this.maxBytes)) this.undoStack.shift();
    }

    undo() {
      const transaction = this.undoStack.pop();
      if (!transaction) return null;
      this.redoStack.push(transaction);
      this.currentToken = transaction.beforeToken;
      return transaction.before;
    }

    redo() {
      const transaction = this.redoStack.pop();
      if (!transaction) return null;
      this.undoStack.push(transaction);
      this.currentToken = transaction.afterToken;
      return transaction.after;
    }

    clear() { this.undoStack = []; this.redoStack = []; this.nextToken = 1; this.currentToken = 0; this.savedToken = 0; }
    markSaved() { this.savedToken = this.currentToken; }
  }

  namespace.ImageEditorDocumentHistory = ImageEditorDocumentHistory;
})(typeof window !== "undefined" ? window : globalThis);
