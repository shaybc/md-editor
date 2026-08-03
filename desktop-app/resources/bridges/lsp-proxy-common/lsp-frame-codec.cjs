"use strict";

/** Parses and writes byte-correct Language Server Protocol frames. */
function createLspFrameParser(onMessage, onWarning = function() {}) {
  let buffer = Buffer.alloc(0);

  function push(chunk) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (true) {
      const boundary = buffer.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      const header = buffer.subarray(0, boundary).toString("ascii");
      const match = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      if (!match) {
        onWarning({ reason: "missing-content-length", header });
        buffer = buffer.subarray(boundary + 4);
        continue;
      }
      const length = Number(match[1]);
      const end = boundary + 4 + length;
      if (buffer.length < end) return;
      const body = buffer.subarray(boundary + 4, end).toString("utf8");
      buffer = buffer.subarray(end);
      try {
        onMessage(JSON.parse(body), body);
      } catch (error) {
        onWarning({ reason: "invalid-json", message: error.message });
      }
    }
  }

  return { push };
}

function encodeLspFrame(message) {
  const body = Buffer.from(typeof message === "string" ? message : JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

module.exports = { createLspFrameParser, encodeLspFrame };
