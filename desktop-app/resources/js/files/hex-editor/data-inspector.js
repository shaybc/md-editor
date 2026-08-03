// Numeric interpretation helpers for the built-in hex editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerHexEditor = global.MarkdownViewerHexEditor || {};

  function safeRead(view, method, byteLength, littleEndian) {
    if (view.byteLength < byteLength) return null;
    return view[method](0, littleEndian);
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "—";
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : Number(value.toPrecision(10)).toString();
  }

  /**
   * Decode up to eight bytes at the active offset using the selected byte order.
   * @param {Uint8Array} bytes - Bytes beginning at the active offset.
   * @param {"little"|"big"} endianness - Multi-byte interpretation order.
   * @returns {object} Display-ready primitive values.
   */
  function inspectBytes(bytes, endianness = "little") {
    const data = namespace.toUint8Array ? namespace.toUint8Array(bytes) : new Uint8Array(bytes || 0);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const little = endianness !== "big";
    return {
      uint8: formatNumber(safeRead(view, "getUint8", 1, little)),
      int8: formatNumber(safeRead(view, "getInt8", 1, little)),
      uint16: formatNumber(safeRead(view, "getUint16", 2, little)),
      int16: formatNumber(safeRead(view, "getInt16", 2, little)),
      uint32: formatNumber(safeRead(view, "getUint32", 4, little)),
      int32: formatNumber(safeRead(view, "getInt32", 4, little)),
      float32: formatNumber(safeRead(view, "getFloat32", 4, little)),
      float64: formatNumber(safeRead(view, "getFloat64", 8, little))
    };
  }

  namespace.inspectBytes = inspectBytes;
})(typeof window !== "undefined" ? window : globalThis);
