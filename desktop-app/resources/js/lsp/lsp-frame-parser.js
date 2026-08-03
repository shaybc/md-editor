(function(global) {
  "use strict";

  /** Owns byte-accurate parsing of Language Server Protocol Content-Length frames. */
  function createLspFrameParser(emit, options = {}) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = new Uint8Array(8192);
    let bufferStart = 0;
    let bufferEnd = 0;
    let headerSearchStart = 0;
    let messageStart = -1;
    let messageLength = 0;
    let pendingHighSurrogate = "";

    function ensureCapacity(additionalLength) {
      if (bufferEnd + additionalLength <= buffer.length) return;
      const unreadLength = bufferEnd - bufferStart;
      const requiredLength = unreadLength + additionalLength;
      if (requiredLength <= buffer.length) buffer.copyWithin(0, bufferStart, bufferEnd);
      else {
        let nextCapacity = buffer.length;
        while (nextCapacity < requiredLength) nextCapacity *= 2;
        const next = new Uint8Array(nextCapacity);
        next.set(buffer.subarray(bufferStart, bufferEnd));
        buffer = next;
      }
      if (messageStart >= 0) messageStart -= bufferStart;
      headerSearchStart = Math.max(0, headerSearchStart - bufferStart);
      bufferEnd = unreadLength;
      bufferStart = 0;
    }

    function append(bytes) {
      ensureCapacity(bytes.length);
      buffer.set(bytes, bufferEnd);
      bufferEnd += bytes.length;
    }

    function findHeaderEnd() {
      for (let index = headerSearchStart; index <= bufferEnd - 4; index += 1) {
        if (buffer[index] === 13 && buffer[index + 1] === 10 && buffer[index + 2] === 13 && buffer[index + 3] === 10) return index;
      }
      headerSearchStart = Math.max(bufferStart, bufferEnd - 3);
      return -1;
    }

    /** Accept one arbitrary stdout text chunk and emit every complete JSON payload. */
    return function parseLspChunk(chunk) {
      let chunkText = pendingHighSurrogate + String(chunk || "");
      pendingHighSurrogate = "";
      if (!chunkText) return;
      const trailingCodeUnit = chunkText.charCodeAt(chunkText.length - 1);
      if (trailingCodeUnit >= 0xd800 && trailingCodeUnit <= 0xdbff) {
        pendingHighSurrogate = chunkText.slice(-1);
        chunkText = chunkText.slice(0, -1);
      }
      if (chunkText) append(encoder.encode(chunkText));
      while (bufferStart < bufferEnd) {
        if (messageStart < 0) {
          const headerEnd = findHeaderEnd();
          if (headerEnd < 0) return;
          const header = decoder.decode(buffer.subarray(bufferStart, headerEnd));
          const match = header.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            options.onParseWarning?.({ reason: "missing-content-length", header });
            bufferStart = headerEnd + 4;
            headerSearchStart = bufferStart;
            continue;
          }
          messageLength = Number(match[1]);
          messageStart = headerEnd + 4;
        }
        const messageEnd = messageStart + messageLength;
        if (bufferEnd < messageEnd) return;
        emit(decoder.decode(buffer.subarray(messageStart, messageEnd)));
        bufferStart = messageEnd;
        headerSearchStart = bufferStart;
        messageStart = -1;
        messageLength = 0;
        if (bufferStart === bufferEnd) {
          bufferStart = 0;
          bufferEnd = 0;
          headerSearchStart = 0;
        }
      }
    };
  }

  global.MarkdownViewerLspFrameParser = { createLspFrameParser };
})(typeof self !== "undefined" ? self : globalThis);
