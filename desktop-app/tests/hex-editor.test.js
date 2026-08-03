const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const moduleRoot = path.resolve(__dirname, "..", "resources", "js", "files", "hex-editor");

function loadHexModules(files) {
  const context = {
    window: {},
    Uint8Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    DOMException
  };
  vm.createContext(context);
  for (const file of files) {
    const source = fs.readFileSync(path.join(moduleRoot, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  return context.window.MarkdownViewerHexEditor;
}

test("document model overwrites fixed-size bytes and tracks undo, redo, and dirty state", () => {
  const hex = loadHexModules(["document-model.js"]);
  const model = new hex.HexDocumentModel(Uint8Array.from([0, 1, 2, 3]));

  model.overwrite(1, Uint8Array.from([0xaa, 0xbb]));
  assert.deepEqual(Array.from(model.bytes), [0, 0xaa, 0xbb, 3]);
  assert.equal(model.isDirty, true);
  assert.throws(() => model.overwrite(3, Uint8Array.from([1, 2])), /existing file length/i);

  assert.equal(model.undo(), true);
  assert.deepEqual(Array.from(model.bytes), [0, 1, 2, 3]);
  assert.equal(model.redo(), true);
  assert.deepEqual(Array.from(model.bytes), [0, 0xaa, 0xbb, 3]);
  model.markSaved();
  assert.equal(model.isDirty, false);
});

test("document model enforces transaction count history limit", () => {
  const hex = loadHexModules(["document-model.js"]);
  const model = new hex.HexDocumentModel(new Uint8Array(2), { maxTransactions: 2, maxHistoryBytes: 1024 });
  model.overwrite(0, Uint8Array.of(1));
  model.overwrite(0, Uint8Array.of(2));
  model.overwrite(0, Uint8Array.of(3));

  assert.equal(model.undo(), true);
  assert.equal(model.undo(), true);
  assert.equal(model.undo(), false);
});

test("hex query parsing validates complete byte pairs", () => {
  const hex = loadHexModules(["search.js"]);
  assert.deepEqual(Array.from(hex.parseHexQuery("0x4d 5A,90")), [0x4d, 0x5a, 0x90]);
  assert.throws(() => hex.parseHexQuery("ABC"), /complete hexadecimal byte pairs/i);
  assert.throws(() => hex.parseHexQuery("GG"), /complete hexadecimal byte pairs/i);
});

test("chunked search finds matches across boundaries in both directions", async () => {
  const hex = loadHexModules(["search.js"]);
  const boundary = 1024 * 1024;
  const bytes = new Uint8Array(boundary + 8);
  bytes.set([0xde, 0xad, 0xbe, 0xef], boundary - 2);
  const source = {
    getMetadata: () => ({ size: bytes.length }),
    readRange: async (offset, length) => bytes.slice(offset, offset + length)
  };

  const forward = await hex.searchSource(source, { query: "DE AD BE EF", startOffset: 0 });
  const backward = await hex.searchSource(source, {
    query: "DE AD BE EF",
    startOffset: bytes.length - 1,
    direction: "backward"
  });
  assert.equal(forward.offset, boundary - 2);
  assert.equal(backward.offset, boundary - 2);
});

test("text search supports ASCII case sensitivity", async () => {
  const hex = loadHexModules(["search.js"]);
  const bytes = new TextEncoder().encode("Alpha alpha");
  const source = {
    getMetadata: () => ({ size: bytes.length }),
    readRange: async (offset, length) => bytes.slice(offset, offset + length)
  };

  assert.equal((await hex.searchSource(source, { mode: "text", query: "alpha" })).offset, 0);
  assert.equal((await hex.searchSource(source, {
    mode: "text",
    query: "alpha",
    caseSensitive: true
  })).offset, 6);
});

test("data inspector decodes little- and big-endian values", () => {
  const hex = loadHexModules(["data-inspector.js"]);
  const bytes = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0, 0, 0, 0]);

  assert.equal(Number(hex.inspectBytes(bytes, "little").uint16), 0x0201);
  assert.equal(Number(hex.inspectBytes(bytes, "big").uint16), 0x0102);
  assert.equal(Number(hex.inspectBytes(bytes, "little").uint32), 0x04030201);
  assert.equal(Number(hex.inspectBytes(bytes, "big").uint32), 0x01020304);
});

test("desktop binary source uses ranged reads and complete writes", async () => {
  const calls = [];
  const Neutralino = {
    filesystem: {
      getStats: async () => ({ size: 4, modifiedAt: 10 }),
      readBinaryFile: async (sourcePath, options) => {
        calls.push(["read", sourcePath, options]);
        return Uint8Array.from([1, 2]).buffer;
      },
      writeBinaryFile: async (sourcePath, bytes) => {
        calls.push(["write", sourcePath, Array.from(new Uint8Array(bytes))]);
      }
    }
  };
  const hex = loadHexModules(["binary-source.js"]);
  const source = hex.createBinarySource({ path: "C:/work/data.bin" }, { Neutralino });
  await source.refreshMetadata();
  assert.deepEqual(Array.from(await source.readRange(1, 2)), [1, 2]);
  await source.writeAll(Uint8Array.from([4, 5, 6, 7]));

  assert.equal(calls[0][0], "read");
  assert.equal(calls[0][1], "C:/work/data.bin");
  assert.deepEqual({ ...calls[0][2] }, { pos: 1, size: 2 });
  assert.deepEqual(calls[1], ["write", "C:/work/data.bin", [4, 5, 6, 7]]);
});
