// Unicode representation encoding and decoding for selected editor text.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.registerMarkdownViewerUnicodeConverter = api.registerMarkdownViewerUnicodeConverter;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const MAX_UNICODE_CODE_POINT = 0x10FFFF;

  /** Represents an invalid or unsupported Unicode conversion request. */
  class UnicodeConversionError extends Error {
    constructor(message) {
      super(message);
      this.name = "UnicodeConversionError";
    }
  }

  function formatHex(codePoint, minimumLength) {
    return codePoint.toString(16).toUpperCase().padStart(minimumLength, "0");
  }

  function assertUnicodeScalarValue(codePoint) {
    if (codePoint < 0 || codePoint > MAX_UNICODE_CODE_POINT || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
      throw new UnicodeConversionError("The selected text contains an invalid Unicode value.");
    }
    return codePoint;
  }

  function getUnicodeCodePoints(text) {
    return Array.from(String(text == null ? "" : text), function(character) {
      return assertUnicodeScalarValue(character.codePointAt(0));
    });
  }

  /** Encode text as hexadecimal HTML numeric character references. */
  function encodeHexNcr(text) {
    return getUnicodeCodePoints(text)
      .map((codePoint) => `&#x${formatHex(codePoint, 4)};`)
      .join("");
  }

  /** Encode text as ECMAScript Unicode code-point escapes. */
  function encodeJavaScriptUnicode(text) {
    return getUnicodeCodePoints(text)
      .map((codePoint) => `\\u{${formatHex(codePoint, 1)}}`)
      .join("");
  }

  /** Encode text as Java/C UTF-16 escapes, using surrogate pairs when required. */
  function encodeJavaUnicode(text) {
    return getUnicodeCodePoints(text)
      .map(function(codePoint) {
        if (codePoint <= 0xFFFF) return `\\u${formatHex(codePoint, 4)}`;
        const supplementaryValue = codePoint - 0x10000;
        const highSurrogate = 0xD800 + (supplementaryValue >> 10);
        const lowSurrogate = 0xDC00 + (supplementaryValue & 0x3FF);
        return `\\u${formatHex(highSurrogate, 4)}\\u${formatHex(lowSurrogate, 4)}`;
      })
      .join("");
  }

  /** Encode text as CSS Unicode escapes with explicit whitespace terminators. */
  function encodeCssUnicode(text) {
    return getUnicodeCodePoints(text)
      .map((codePoint) => `\\${formatHex(codePoint, 4)} `)
      .join("");
  }

  /** Encode text as percent-encoded UTF-8 URI data. */
  function encodeUri(text) {
    getUnicodeCodePoints(text);
    return encodeURIComponent(String(text == null ? "" : text));
  }

  function replaceValidatedTokens(text, pattern, marker, decodeToken) {
    let recognizedTokenCount = 0;
    const decoded = text.replace(pattern, function() {
      recognizedTokenCount += 1;
      return decodeToken.apply(null, arguments);
    });
    if (!recognizedTokenCount || decoded.includes(marker)) {
      throw new UnicodeConversionError("The selected text contains a malformed Unicode representation.");
    }
    return decoded;
  }

  function decodeHtmlReferences(text) {
    return replaceValidatedTokens(
      text,
      /&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/gi,
      "&#",
      function(_match, hexadecimalValue, decimalValue) {
        const codePoint = hexadecimalValue
          ? parseInt(hexadecimalValue, 16)
          : parseInt(decimalValue, 10);
        return String.fromCodePoint(assertUnicodeScalarValue(codePoint));
      }
    );
  }

  function decodeJavaScriptEscapes(text) {
    return replaceValidatedTokens(
      text,
      /\\u\{([0-9a-f]{1,6})\}/gi,
      "\\u{",
      function(_match, hexadecimalValue) {
        return String.fromCodePoint(assertUnicodeScalarValue(parseInt(hexadecimalValue, 16)));
      }
    );
  }

  function decodeJavaEscapes(text) {
    const pattern = /\\u([0-9a-f]{4})/gi;
    let decoded = "";
    let cursor = 0;
    let recognizedTokenCount = 0;
    let match;

    while ((match = pattern.exec(text))) {
      const plainText = text.slice(cursor, match.index);
      if (plainText.includes("\\u")) {
        throw new UnicodeConversionError("The selected text contains a malformed Java/C Unicode escape.");
      }
      decoded += plainText;
      const codeUnit = parseInt(match[1], 16);
      recognizedTokenCount += 1;

      if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
        pattern.lastIndex = match.index + match[0].length;
        const lowMatch = pattern.exec(text);
        if (!lowMatch || lowMatch.index !== pattern.lastIndex - lowMatch[0].length) {
          throw new UnicodeConversionError("The selected text contains an incomplete UTF-16 surrogate pair.");
        }
        const lowSurrogate = parseInt(lowMatch[1], 16);
        if (lowSurrogate < 0xDC00 || lowSurrogate > 0xDFFF) {
          throw new UnicodeConversionError("The selected text contains an invalid UTF-16 surrogate pair.");
        }
        const codePoint = 0x10000 + ((codeUnit - 0xD800) << 10) + (lowSurrogate - 0xDC00);
        decoded += String.fromCodePoint(codePoint);
        recognizedTokenCount += 1;
        cursor = lowMatch.index + lowMatch[0].length;
        continue;
      }

      if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
        throw new UnicodeConversionError("The selected text contains an unpaired UTF-16 surrogate.");
      }
      decoded += String.fromCodePoint(codeUnit);
      cursor = match.index + match[0].length;
    }

    const trailingText = text.slice(cursor);
    if (!recognizedTokenCount || trailingText.includes("\\u")) {
      throw new UnicodeConversionError("The selected text contains a malformed Java/C Unicode escape.");
    }
    return decoded + trailingText;
  }

  function decodeCssEscapes(text) {
    return replaceValidatedTokens(
      text,
      /\\([0-9a-f]{1,6})(?:[ \t\r\n\f])?/gi,
      "\\",
      function(_match, hexadecimalValue) {
        return String.fromCodePoint(assertUnicodeScalarValue(parseInt(hexadecimalValue, 16)));
      }
    );
  }

  /** Decode percent-encoded UTF-8 URI text. */
  function decodeUri(text) {
    try {
      return decodeURIComponent(text);
    } catch (_error) {
      throw new UnicodeConversionError("The selected text contains invalid percent-encoded UTF-8.");
    }
  }

  /** Decode a supported Unicode representation selected in the editor. */
  function decodeUnicodeRepresentation(text) {
    const source = String(text == null ? "" : text);
    if (source.includes("&#")) return decodeHtmlReferences(source);
    if (source.includes("\\u{")) return decodeJavaScriptEscapes(source);
    if (source.includes("\\u")) return decodeJavaEscapes(source);
    if (/\\[0-9a-f]/i.test(source)) return decodeCssEscapes(source);
    if (source.includes("%")) return decodeUri(source);
    throw new UnicodeConversionError("The selected text does not contain a supported Unicode representation.");
  }

  /** Encode selected editor text using one of the supported output formats. */
  function encode(text, format) {
    switch (format) {
      case "hex-ncr": return encodeHexNcr(text);
      case "javascript-es6": return encodeJavaScriptUnicode(text);
      case "java-c": return encodeJavaUnicode(text);
      case "css": return encodeCssUnicode(text);
      case "encoded-uri": return encodeUri(text);
      default: throw new UnicodeConversionError("The requested Unicode output format is not supported.");
    }
  }

  /** Register the Unicode converter with the editor application. */
  function registerMarkdownViewerUnicodeConverter(app) {
    const api = { encode, decode: decodeUnicodeRepresentation, decodeUri };
    app.services = app.services || {};
    app.services.unicodeConverter = api;
    app.registerModule?.("unicodeConverter", api);
    return api;
  }

  return {
    UnicodeConversionError,
    registerMarkdownViewerUnicodeConverter,
    encode,
    encodeHexNcr,
    encodeJavaScriptUnicode,
    encodeJavaUnicode,
    encodeCssUnicode,
    encodeUri,
    decodeUri,
    decodeUnicodeRepresentation
  };
});
