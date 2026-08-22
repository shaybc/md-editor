// UTF-8 text, byte, and image data URL encoding for standard Base64 conversions.
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

  function normalizeBase64Text(text) {
    return String(text == null ? "" : text).replace(/[ \t\r\n\f]/g, "");
  }

  function stripBase64DataUrl(text) {
    const value = String(text == null ? "" : text).trim();
    const match = value.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/is);
    return match ? { base64: match[2], mimeType: match[1] || "" } : { base64: value, mimeType: "" };
  }

  /** Encode arbitrary bytes as standard Base64. */
  function encodeBase64Bytes(bytes) {
    const normalizedBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    return btoa(bytesToBinaryString(normalizedBytes));
  }

  /** Decode standard Base64 into raw bytes without interpreting text encoding. */
  function decodeBase64ToBytes(text) {
    const normalized = normalizeBase64Text(stripBase64DataUrl(text).base64);
    if (!normalized || !STANDARD_BASE64_PATTERN.test(normalized)) {
      throw new Base64ConversionError("The input does not contain valid standard Base64.");
    }

    let binary;
    try {
      binary = atob(normalized);
    } catch (_error) {
      throw new Base64ConversionError("The input does not contain valid standard Base64.");
    }
    if (btoa(binary) !== normalized) {
      throw new Base64ConversionError("The input does not contain canonical standard Base64.");
    }
    return binaryStringToBytes(binary);
  }

  /** Build a browser data URL from bytes and a MIME type. */
  function createBase64DataUrl(bytes, mimeType) {
    const type = String(mimeType || "application/octet-stream").trim() || "application/octet-stream";
    return `data:${type};base64,${encodeBase64Bytes(bytes)}`;
  }

  /** Decode a Base64 image string or data URL into bytes and an image MIME type. */
  function decodeBase64Image(text, fallbackMimeType) {
    const parsed = stripBase64DataUrl(text);
    const bytes = decodeBase64ToBytes(parsed.base64);
    const mimeType = parsed.mimeType || fallbackMimeType || "image/png";
    return { bytes, mimeType, dataUrl: createBase64DataUrl(bytes, mimeType) };
  }

  /** Encode editor text as standard Base64 over its UTF-8 bytes. */
  function encodeBase64Text(text) {
    const bytes = new TextEncoder().encode(String(text == null ? "" : text));
    return encodeBase64Bytes(bytes);
  }

  /** Decode standard Base64 bytes as strict UTF-8 editor text. */
  function decodeBase64Text(text) {
    let bytes;
    try {
      bytes = decodeBase64ToBytes(text);
    } catch (_error) {
      throw new Base64ConversionError("The selected text does not contain valid standard Base64.");
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_error) {
      throw new Base64ConversionError("The selected Base64 does not decode to valid UTF-8 text.");
    }
  }

  /** Register the UTF-8 Base64 converter with the editor application. */
  function registerMarkdownViewerBase64Converter(app) {
    const api = {
      encode: encodeBase64Text,
      decode: decodeBase64Text,
      encodeBytes: encodeBase64Bytes,
      decodeBytes: decodeBase64ToBytes,
      createDataUrl: createBase64DataUrl,
      decodeImage: decodeBase64Image
    };
    app.services = app.services || {};
    app.services.base64Converter = api;
    app.registerModule?.("base64Converter", api);
    return api;
  }

  return {
    Base64ConversionError,
    registerMarkdownViewerBase64Converter,
    encodeBase64Text,
    decodeBase64Text,
    encodeBase64Bytes,
    decodeBase64ToBytes,
    createBase64DataUrl,
    decodeBase64Image
  };
});