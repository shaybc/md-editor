// Chunked binary searching for the built-in hex editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerHexEditor = global.MarkdownViewerHexEditor || {};
  const SEARCH_CHUNK_BYTES = 1024 * 1024;

  function parseHexQuery(query) {
    const compact = String(query || "").replace(/0x/gi, "").replace(/[\s,;:_-]+/g, "");
    if (!compact || compact.length % 2 || /[^0-9a-f]/i.test(compact)) {
      throw new Error("Enter complete hexadecimal byte pairs, for example: 4D 5A 90 00.");
    }
    const bytes = new Uint8Array(compact.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  function parseTextQuery(query, caseSensitive) {
    const value = String(query || "");
    if (!value) throw new Error("Enter text to find.");
    return new TextEncoder().encode(caseSensitive ? value : value.toLocaleLowerCase());
  }

  function findBytes(haystack, needle, start = 0, caseInsensitiveAscii = false) {
    const limit = haystack.length - needle.length;
    for (let index = Math.max(0, start); index <= limit; index += 1) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
        let value = haystack[index + needleIndex];
        if (caseInsensitiveAscii && value >= 65 && value <= 90) value += 32;
        if (value !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }

  function findBytesReverse(haystack, needle, start = haystack.length - needle.length, caseInsensitiveAscii = false) {
    const first = Math.min(start, haystack.length - needle.length);
    for (let index = first; index >= 0; index -= 1) {
      let matched = true;
      for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
        let value = haystack[index + needleIndex];
        if (caseInsensitiveAscii && value >= 65 && value <= 90) value += 32;
        if (value !== needle[needleIndex]) {
          matched = false;
          break;
        }
      }
      if (matched) return index;
    }
    return -1;
  }

  async function searchSource(source, options = {}) {
    const metadata = source.getMetadata();
    const mode = options.mode === "text" ? "text" : "hex";
    const needle = mode === "hex"
      ? parseHexQuery(options.query)
      : parseTextQuery(options.query, options.caseSensitive === true);
    const caseInsensitiveAscii = mode === "text" && options.caseSensitive !== true;
    const startOffset = Math.max(0, Number(options.startOffset || 0));
    const overlap = Math.max(0, needle.length - 1);
    if (options.direction === "backward") {
      let endExclusive = Math.min(metadata.size, startOffset + needle.length);
      while (endExclusive > 0) {
        if (options.signal?.aborted) throw new DOMException("Search cancelled.", "AbortError");
        const readStart = Math.max(0, endExclusive - SEARCH_CHUNK_BYTES - overlap);
        const bytes = await source.readRange(readStart, endExclusive - readStart);
        const localStart = Math.min(startOffset - readStart, bytes.length - needle.length);
        const found = findBytesReverse(bytes, needle, localStart, caseInsensitiveAscii);
        if (found >= 0) return { offset: readStart + found, length: needle.length };
        if (readStart === 0) break;
        endExclusive = readStart + overlap;
      }
      return null;
    }
    let offset = startOffset;
    while (offset < metadata.size) {
      if (options.signal?.aborted) throw new DOMException("Search cancelled.", "AbortError");
      const readStart = Math.max(0, offset - (offset === startOffset ? 0 : overlap));
      const bytes = await source.readRange(readStart, Math.min(SEARCH_CHUNK_BYTES + overlap, metadata.size - readStart));
      const localStart = Math.max(0, offset - readStart);
      const found = findBytes(bytes, needle, localStart, caseInsensitiveAscii);
      if (found >= 0) return { offset: readStart + found, length: needle.length };
      offset += SEARCH_CHUNK_BYTES;
    }
    return null;
  }

  namespace.parseHexQuery = parseHexQuery;
  namespace.parseTextQuery = parseTextQuery;
  namespace.findBytes = findBytes;
  namespace.findBytesReverse = findBytesReverse;
  namespace.searchSource = searchSource;
})(typeof window !== "undefined" ? window : globalThis);
