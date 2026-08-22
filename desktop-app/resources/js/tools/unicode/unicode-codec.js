// Unicode conversion helpers for the DevToys-style Unicode Encoder / Decoder tool.
(function(root) {
  "use strict";

  const FORMAT_HTML_DECIMAL = "html-decimal";
  const FORMAT_JAVASCRIPT_UNICODE = "javascript-unicode";
  const FORMAT_URL_PERCENT = "url-percent";

  /**
   * Convert plain text into decimal HTML character references.
   * @param {string} text - The user-entered text to encode.
   * @returns {string} The encoded text using &#number; entities.
   */
  function encodeHtmlDecimal(text) {
    return Array.from(String(text || ""))
      .map(function(character) {
        return "&#" + character.codePointAt(0) + ";";
      })
      .join("");
  }

  /**
   * Decode decimal HTML character references into plain text.
   * @param {string} text - Encoded input containing &#number; entities.
   * @returns {string} Decoded plain text.
   * @throws {Error} When the text contains unsupported or invalid HTML entities.
   */
  function decodeHtmlDecimal(text) {
    const value = String(text || "");
    const unsupportedEntity = value.match(/&(?:#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/i);
    if (unsupportedEntity && !/^&#[0-9]+;$/.test(unsupportedEntity[0])) {
      throw new Error("Invalid decimal HTML entity text.");
    }
    return value.replace(/&#([0-9]+);/g, function(match, codePointText) {
      const codePoint = Number(codePointText);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        throw new Error("Invalid decimal HTML entity text.");
      }
      return String.fromCodePoint(codePoint);
    });
  }

  function toHex4(codeUnit) {
    return codeUnit.toString(16).padStart(4, "0");
  }

  /**
   * Convert plain text into JavaScript-style Unicode escapes.
   * @param {string} text - The user-entered text to encode.
   * @returns {string} The encoded text using \uXXXX code-unit escapes.
   */
  function encodeJavascriptUnicode(text) {
    return Array.from(String(text || ""))
      .map(function(character) {
        if (character.length === 1) return "\\u" + toHex4(character.charCodeAt(0));
        return "\\u" + toHex4(character.charCodeAt(0)) + "\\u" + toHex4(character.charCodeAt(1));
      })
      .join("");
  }

  /**
   * Decode JavaScript-style Unicode escapes into plain text.
   * @param {string} text - Encoded input containing \uXXXX or \u{X} escapes.
   * @returns {string} Decoded plain text.
   * @throws {Error} When an invalid Unicode escape is present.
   */
  function decodeJavascriptUnicode(text) {
    const value = String(text || "");
    if (/\\u(?!\{[0-9a-fA-F]{1,6}\}|[0-9a-fA-F]{4})/.test(value)) {
      throw new Error("Invalid JavaScript Unicode escape text.");
    }
    return value
      .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, function(match, codePointText) {
        const codePoint = Number.parseInt(codePointText, 16);
        if (!Number.isInteger(codePoint) || codePoint > 0x10ffff) {
          throw new Error("Invalid JavaScript Unicode escape text.");
        }
        return String.fromCodePoint(codePoint);
      })
      .replace(/\\u([0-9a-fA-F]{4})/g, function(match, codeUnitText) {
        return String.fromCharCode(Number.parseInt(codeUnitText, 16));
      });
  }

  /**
   * Convert plain text into URL percent-encoded text.
   * @param {string} text - The user-entered text to encode.
   * @returns {string} The encoded text using UTF-8 percent escapes.
   */
  function encodeUrlPercent(text) {
    return encodeURIComponent(String(text || "")).replace(/%[0-9A-F]{2}/g, function(match) {
      return match.toLowerCase();
    });
  }

  /**
   * Decode URL percent-encoded text into plain text.
   * @param {string} text - Encoded input containing UTF-8 percent escapes.
   * @returns {string} Decoded plain text.
   * @throws {Error} When percent encoding is malformed.
   */
  function decodeUrlPercent(text) {
    try {
      return decodeURIComponent(String(text || ""));
    } catch (error) {
      throw new Error("Invalid URL percent-encoded text.");
    }
  }

  /**
   * Encode plain text using the requested Unicode representation.
   * @param {string} text - The plain text to encode.
   * @param {object} options - Conversion options.
   * @param {string} options.format - Target format identifier.
   * @returns {string} Encoded text.
   */
  function encodeUnicode(text, options = {}) {
    switch (options.format) {
      case FORMAT_HTML_DECIMAL:
        return encodeHtmlDecimal(text);
      case FORMAT_URL_PERCENT:
        return encodeUrlPercent(text);
      case FORMAT_JAVASCRIPT_UNICODE:
      default:
        return encodeJavascriptUnicode(text);
    }
  }

  /**
   * Decode text from the requested Unicode representation.
   * @param {string} text - The encoded text to decode.
   * @param {object} options - Conversion options.
   * @param {string} options.format - Source format identifier.
   * @returns {string} Decoded plain text.
   * @throws {Error} When encoded text is malformed for the selected format.
   */
  function decodeUnicode(text, options = {}) {
    switch (options.format) {
      case FORMAT_HTML_DECIMAL:
        return decodeHtmlDecimal(text);
      case FORMAT_URL_PERCENT:
        return decodeUrlPercent(text);
      case FORMAT_JAVASCRIPT_UNICODE:
      default:
        return decodeJavascriptUnicode(text);
    }
  }

  /**
   * Convert text according to the selected mode and format.
   * @param {string} text - Text from the tool input area.
   * @param {object} options - Conversion options.
   * @param {string} options.mode - Either encode or decode.
   * @param {string} options.format - Unicode format identifier.
   * @returns {string} Converted text.
   */
  function convertUnicode(text, options = {}) {
    return options.mode === "decode" ? decodeUnicode(text, options) : encodeUnicode(text, options);
  }

  /**
   * Register Unicode codec helpers with the app module registry.
   * @param {object} app - MD-Editor application service container.
   * @returns {object} Public codec API.
   */
  function registerMarkdownViewerUnicodeCodec(app) {
    const api = {
      FORMAT_HTML_DECIMAL,
      FORMAT_JAVASCRIPT_UNICODE,
      FORMAT_URL_PERCENT,
      encodeHtmlDecimal,
      decodeHtmlDecimal,
      encodeJavascriptUnicode,
      decodeJavascriptUnicode,
      encodeUrlPercent,
      decodeUrlPercent,
      encodeUnicode,
      decodeUnicode,
      convertUnicode
    };
    app?.registerModule?.("unicodeCodec", api);
    return api;
  }

  root.registerMarkdownViewerUnicodeCodec = registerMarkdownViewerUnicodeCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      FORMAT_HTML_DECIMAL,
      FORMAT_JAVASCRIPT_UNICODE,
      FORMAT_URL_PERCENT,
      encodeHtmlDecimal,
      decodeHtmlDecimal,
      encodeJavascriptUnicode,
      decodeJavascriptUnicode,
      encodeUrlPercent,
      decodeUrlPercent,
      encodeUnicode,
      decodeUnicode,
      convertUnicode,
      registerMarkdownViewerUnicodeCodec
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
