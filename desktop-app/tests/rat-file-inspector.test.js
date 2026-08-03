const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadInspector(bytes) {
  const sourcePath = path.resolve(__dirname, "../resources/js/rat/file-inspector.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerRatFileInspector({ registerModule() {} }, {
    Neutralino: { filesystem: {
      async getStats() { return { isFile: true, size: bytes.length }; },
      async readBinaryFile() { return Uint8Array.from(bytes).buffer; }
    } }
  });
}

test("RAT file inspector classifies unknown NUL-containing snapshots as binary", async () => {
  const result = await loadInspector([0x50, 0x4b, 0, 0xff]).inspect("C:/Project/fixture.snapshot");
  assert.equal(result.classification, "binary");
  assert.match(result.signatureHex, /^50 4b 00 ff/);
});

test("RAT file inspector treats known source extensions as text", async () => {
  const result = await loadInspector([0x63, 0x6c, 0x61, 0x73, 0x73]).inspect("C:/Project/Demo.java");
  assert.equal(result.classification, "text");
});
