// UTF-8 text encoding and decoding for standard Base64 editor conversions.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.registerMarkdownViewerBase64Converter = api.registerMarkdownViewerBase64Converter;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const BYTE_CHUNK_SIZE = 0x8000;
  const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  /** Represents invalid Base64 input or decoded bytes that are not UTF-8 text. */
  class Base64ConversionError extends Error {
    constructor(message) {
      super(message);
      this.name = "Base64ConversionError";
    }
  }

  function bytesToBinaryString(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + BYTE_CHUNK_SIZE));
    }
    return binary;
  }

  function binaryStringToBytes(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  /** Encode editor text as standard Base64 over its UTF-8 bytes. */
  function encodeBase64Text(text) {
    const bytes = new TextEncoder().encode(String(text == null ? "" : text));
    return btoa(bytesToBinaryString(bytes));
  }

  /** Decode standard Base64 bytes as strict UTF-8 editor text. */
  function decodeBase64Text(text) {
    const normalized = String(text == null ? "" : text).replace(/[ \t\r\n\f]/g, "");
    if (!normalized || !STANDARD_BASE64_PATTERN.test(normalized)) {
      throw new Base64ConversionError("The selected text does not contain valid standard Base64.");
    }

    let binary;
    try {
      binary = atob(normalized);
    } catch (_error) {
      throw new Base64ConversionError("The selected text does not contain valid standard Base64.");
    }
    if (btoa(binary) !== normalized) {
      throw new Base64ConversionError("The selected text does not contain canonical standard Base64.");
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(binaryStringToBytes(binary));
    } catch (_error) {
      throw new Base64ConversionError("The selected Base64 does not decode to valid UTF-8 text.");
    }
  }

  /** Register the UTF-8 Base64 converter with the editor application. */
  function registerMarkdownViewerBase64Converter(app) {
    const api = { encode: encodeBase64Text, decode: decodeBase64Text };
    app.services = app.services || {};
    app.services.base64Converter = api;
    app.registerModule?.("base64Converter", api);
    return api;
  }

  return {
    Base64ConversionError,
    registerMarkdownViewerBase64Converter,
    encodeBase64Text,
    decodeBase64Text
  };
});
