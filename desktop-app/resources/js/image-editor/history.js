// Bounded pixel snapshot history for raster image-editor documents.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const DEFAULT_MAX_ENTRIES = 50;
  const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

  class ImageEditorHistory {
    /**
     * Track complete canvas snapshots at user transaction boundaries.
     * @param {object} options - Entry and byte limits for retained undo history.
     */
    constructor(options = {}) {
      this.maxEntries = Math.max(1, Number(options.maxEntries || DEFAULT_MAX_ENTRIES));
      this.maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_MAX_BYTES));
      this.undoStack = [];
      this.redoStack = [];
      this.bytes = 0;
      this.nextToken = 1;
      this.currentToken = 0;
      this.savedToken = 0;
    }

    get canUndo() {
      return this.undoStack.length > 0;
    }

    get canRedo() {
      return this.redoStack.length > 0;
    }

    get isAtSavedState() {
      return this.currentToken === this.savedToken;
    }

    static cloneSnapshot(snapshot) {
      if (!snapshot) return null;
      const data = snapshot.data instanceof Uint8ClampedArray
        ? new Uint8ClampedArray(snapshot.data)
        : new Uint8ClampedArray(snapshot.data || 0);
      return { width: Number(snapshot.width || 0), height: Number(snapshot.height || 0), data };
    }

    static snapshotBytes(snapshot) {
      return Number(snapshot?.data?.byteLength || 0);
    }

    push(before, after) {
      const transaction = {
        before: ImageEditorHistory.cloneSnapshot(before),
        after: ImageEditorHistory.cloneSnapshot(after),
        beforeToken: this.currentToken,
        afterToken: this.nextToken++
      };
      const transactionBytes = ImageEditorHistory.snapshotBytes(transaction.before) +
        ImageEditorHistory.snapshotBytes(transaction.after);
      if (!transaction.before || !transaction.after || transactionBytes === 0) return false;
      this.undoStack.push(transaction);
      this.redoStack = [];
      this.currentToken = transaction.afterToken;
      this.bytes += transactionBytes;
      while (this.undoStack.length > this.maxEntries || (this.bytes > this.maxBytes && this.undoStack.length > 1)) {
        const removed = this.undoStack.shift();
        this.bytes -= ImageEditorHistory.snapshotBytes(removed.before) + ImageEditorHistory.snapshotBytes(removed.after);
      }
      return true;
    }

    undo() {
      const transaction = this.undoStack.pop();
      if (!transaction) return null;
      this.redoStack.push(transaction);
      this.currentToken = transaction.beforeToken;
      this.bytes -= ImageEditorHistory.snapshotBytes(transaction.before) + ImageEditorHistory.snapshotBytes(transaction.after);
      return ImageEditorHistory.cloneSnapshot(transaction.before);
    }

    redo() {
      const transaction = this.redoStack.pop();
      if (!transaction) return null;
      this.undoStack.push(transaction);
      this.currentToken = transaction.afterToken;
      this.bytes += ImageEditorHistory.snapshotBytes(transaction.before) + ImageEditorHistory.snapshotBytes(transaction.after);
      return ImageEditorHistory.cloneSnapshot(transaction.after);
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
      this.bytes = 0;
      this.nextToken = 1;
      this.currentToken = 0;
      this.savedToken = 0;
    }

    markSaved() {
      this.savedToken = this.currentToken;
    }
  }

  namespace.ImageEditorHistory = ImageEditorHistory;
  namespace.historyLimits = Object.freeze({ entries: DEFAULT_MAX_ENTRIES, bytes: DEFAULT_MAX_BYTES });
})(typeof window !== "undefined" ? window : globalThis);
