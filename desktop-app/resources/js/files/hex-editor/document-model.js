// Fixed-size binary document model for the built-in hex editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerHexEditor = global.MarkdownViewerHexEditor || {};
  const MAX_HISTORY_TRANSACTIONS = 1000;
  const MAX_HISTORY_BYTES = 8 * 1024 * 1024;

  class HexDocumentModel {
    /**
     * Own an editable fixed-length byte buffer and its transaction history.
     * @param {Uint8Array} bytes - Complete editable file contents.
     */
    constructor(bytes, options = {}) {
      this.bytes = new Uint8Array(bytes || 0);
      this.maxTransactions = Math.max(1, Number(options.maxTransactions || MAX_HISTORY_TRANSACTIONS));
      this.maxHistoryBytes = Math.max(1, Number(options.maxHistoryBytes || MAX_HISTORY_BYTES));
      this.cursor = this.bytes.length ? 0 : -1;
      this.selectionStart = this.cursor;
      this.selectionEnd = this.cursor;
      this.undoStack = [];
      this.redoStack = [];
      this.historyBytes = 0;
      this.savedRevision = 0;
      this.revision = 0;
    }

    get length() {
      return this.bytes.length;
    }

    get isDirty() {
      return this.revision !== this.savedRevision;
    }

    clampOffset(offset) {
      if (!this.bytes.length) return -1;
      return Math.max(0, Math.min(this.bytes.length - 1, Number(offset || 0)));
    }

    setCursor(offset, extendSelection = false) {
      const next = this.clampOffset(offset);
      this.cursor = next;
      if (extendSelection && this.selectionStart >= 0) {
        this.selectionEnd = next;
      } else {
        this.selectionStart = next;
        this.selectionEnd = next;
      }
      return next;
    }

    setSelection(start, end) {
      this.selectionStart = this.clampOffset(start);
      this.selectionEnd = this.clampOffset(end);
      this.cursor = this.selectionEnd;
    }

    getSelectionRange() {
      if (this.selectionStart < 0 || this.selectionEnd < 0) return { start: -1, end: -1, length: 0 };
      const start = Math.min(this.selectionStart, this.selectionEnd);
      const end = Math.max(this.selectionStart, this.selectionEnd);
      return { start, end, length: end - start + 1 };
    }

    overwrite(offset, values) {
      const start = Number(offset);
      const next = namespace.toUint8Array ? namespace.toUint8Array(values) : new Uint8Array(values || 0);
      if (!Number.isInteger(start) || start < 0 || !next.length || start + next.length > this.bytes.length) {
        throw new RangeError("The binary edit must remain within the existing file length.");
      }
      const previous = this.bytes.slice(start, start + next.length);
      if (previous.every((value, index) => value === next[index])) return false;
      this.bytes.set(next, start);
      this.pushHistory({ offset: start, before: previous, after: next.slice() });
      this.cursor = Math.min(this.bytes.length - 1, start + next.length - 1);
      this.selectionStart = start;
      this.selectionEnd = this.cursor;
      return true;
    }

    pushHistory(transaction) {
      this.undoStack.push(transaction);
      this.redoStack = [];
      this.historyBytes += transaction.before.length + transaction.after.length;
      this.revision += 1;
      while (this.undoStack.length > this.maxTransactions || this.historyBytes > this.maxHistoryBytes) {
        const removed = this.undoStack.shift();
        this.historyBytes -= removed.before.length + removed.after.length;
      }
    }

    undo() {
      const transaction = this.undoStack.pop();
      if (!transaction) return false;
      this.bytes.set(transaction.before, transaction.offset);
      this.redoStack.push(transaction);
      this.historyBytes -= transaction.before.length + transaction.after.length;
      this.revision -= 1;
      this.setSelection(transaction.offset, transaction.offset + transaction.before.length - 1);
      return true;
    }

    redo() {
      const transaction = this.redoStack.pop();
      if (!transaction) return false;
      this.bytes.set(transaction.after, transaction.offset);
      this.undoStack.push(transaction);
      this.historyBytes += transaction.before.length + transaction.after.length;
      this.revision += 1;
      this.setSelection(transaction.offset, transaction.offset + transaction.after.length - 1);
      return true;
    }

    markSaved() {
      this.savedRevision = this.revision;
    }
  }

  namespace.HexDocumentModel = HexDocumentModel;
  namespace.historyLimits = Object.freeze({
    transactions: MAX_HISTORY_TRANSACTIONS,
    bytes: MAX_HISTORY_BYTES
  });
})(typeof window !== "undefined" ? window : globalThis);
