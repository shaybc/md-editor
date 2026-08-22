// String and byte array conversion helpers for the DevToys-style String to Bytes Converter tool.
(function(root) {
  "use strict";

  const FORMAT_DECIMAL_ARRAY = "decimal-array";
  const FORMAT_HEX_ARRAY = "hex-array";
  const FORMAT_RAW_HEX = "raw-hex";

  /**
   * Encode user text as UTF-8 bytes.
   * @param {string} text - Plain text to encode.
   * @returns {Uint8Array} UTF-8 bytes.
   */
  function stringToUtf8Bytes(text) {
    const value = String(text || "");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value);
    return Uint8Array.from(Buffer.from(value, "utf8"));
  }

  /**
   * Decode UTF-8 bytes into user text.
   * @param {Uint8Array|number[]} bytes - Bytes to decode.
   * @returns {string} Decoded text.
   * @throws {Error} When the byte sequence is not valid UTF-8.
   */
  function utf8BytesToString(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
    try {
      if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: true }).decode(source);
      return Buffer.from(source).toString("utf8");
    } catch (error) {
      throw new Error("Invalid UTF-8 byte sequence.");
    }
  }

  function assertByte(value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error("Byte values must be between 0 and 255.");
    }
    return value;
  }

  function formatHexByte(value) {
    return value.toString(16).padStart(2, "0");
  }

  /**
   * Format bytes in the selected byte array representation.
   * @param {Uint8Array|number[]} bytes - Bytes to format.
   * @param {object} options - Formatting options.
   * @param {string} options.format - Byte output format.
   * @returns {string} Formatted byte text.
   */
  function formatBytes(bytes, options = {}) {
    const source = Array.from(bytes || [], assertByte);
    switch (options.format) {
      case FORMAT_HEX_ARRAY:
        return "[" + source.map(function(value) { return "0x" + formatHexByte(value); }).join(", ") + "]";
      case FORMAT_RAW_HEX:
        return source.map(formatHexByte).join("");
      case FORMAT_DECIMAL_ARRAY:
      default:
        return "[" + source.join(", ") + "]";
    }
  }

  function parseDecimalArray(text) {
    const value = String(text || "").trim();
    if (!value) return new Uint8Array();
    if (!/^[\s,\[\]0-9]+$/.test(value)) throw new Error("Invalid decimal byte array.");
    const matches = value.match(/[0-9]+/g) || [];
    return Uint8Array.from(matches.map(function(item) { return assertByte(Number(item)); }));
  }

  function parseHexArray(text) {
    const value = String(text || "").trim();
    if (!value) return new Uint8Array();
    if (!/^[\s,\[\],xXa-fA-F0-9]+$/.test(value)) throw new Error("Invalid hexadecimal byte array.");
    const matches = value.match(/(?:0x)?[0-9a-fA-F]{1,2}/g) || [];
    if (!matches.length) throw new Error("Invalid hexadecimal byte array.");
    return Uint8Array.from(matches.map(function(item) {
      return assertByte(Number.parseInt(item.replace(/^0x/i, ""), 16));
    }));
  }

  function parseRawHex(text) {
    const compact = String(text || "").replace(/\s+/g, "").replace(/^0x/i, "");
    if (!compact) return new Uint8Array();
    if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) {
      throw new Error("Raw hexadecimal text must contain complete byte pairs.");
    }
    const bytes = [];
    for (let index = 0; index < compact.length; index += 2) {
      bytes.push(assertByte(Number.parseInt(compact.slice(index, index + 2), 16)));
    }
    return Uint8Array.from(bytes);
  }

  /**
   * Parse user-entered byte text in the selected representation.
   * @param {string} text - Byte array text.
   * @param {object} options - Parsing options.
   * @param {string} options.format - Byte input format.
   * @returns {Uint8Array} Parsed bytes.
   * @throws {Error} When bytes are malformed or outside the byte range.
   */
  function parseBytes(text, options = {}) {
    switch (options.format) {
      case FORMAT_HEX_ARRAY:
        return parseHexArray(text);
      case FORMAT_RAW_HEX:
        return parseRawHex(text);
      case FORMAT_DECIMAL_ARRAY:
      default:
        return parseDecimalArray(text);
    }
  }

  /**
   * Convert text according to the selected direction and byte format.
   * @param {string} text - Input from the tool text area.
   * @param {object} options - Conversion options.
   * @param {string} options.mode - Either string-to-bytes or bytes-to-string.
   * @param {string} options.format - Byte representation.
   * @returns {string} Converted text.
   */
  function convertStringBytes(text, options = {}) {
    if (options.mode === "bytes-to-string") {
      return utf8BytesToString(parseBytes(text, options));
    }
    return formatBytes(stringToUtf8Bytes(text), options);
  }

  /**
   * Register string/bytes codec helpers with the app module registry.
   * @param {object} app - MD-Editor application service container.
   * @returns {object} Public codec API.
   */
  function registerMarkdownViewerStringBytesCodec(app) {
    const api = {
      FORMAT_DECIMAL_ARRAY,
      FORMAT_HEX_ARRAY,
      FORMAT_RAW_HEX,
      stringToUtf8Bytes,
      utf8BytesToString,
      formatBytes,
      parseBytes,
      convertStringBytes
    };
    app?.registerModule?.("stringBytesCodec", api);
    return api;
  }

  root.registerMarkdownViewerStringBytesCodec = registerMarkdownViewerStringBytesCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      FORMAT_DECIMAL_ARRAY,
      FORMAT_HEX_ARRAY,
      FORMAT_RAW_HEX,
      stringToUtf8Bytes,
      utf8BytesToString,
      formatBytes,
      parseBytes,
      convertStringBytes,
      registerMarkdownViewerStringBytesCodec
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
