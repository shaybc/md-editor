const test = require("node:test");
const assert = require("node:assert/strict");

const codec = require("../resources/js/image-editor/palettes/ase-codec.js");

function uint16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function aseName(value) {
  const units = [...value, "\0"];
  return Buffer.concat([uint16(units.length), ...units.map((character) => uint16(character.charCodeAt(0)))]);
}

function block(type, payload) {
  return Buffer.concat([uint16(type), uint32(payload.length), payload]);
}

function colorBlock(name, model, components) {
  const floats = Buffer.alloc(components.length * 4);
  components.forEach((value, index) => floats.writeFloatBE(value, index * 4));
  return block(0x0001, Buffer.concat([aseName(name), Buffer.from(model, "ascii"), floats, uint16(2)]));
}

function ase(blocks) {
  return Buffer.concat([Buffer.from("ASEF"), uint16(1), uint16(0), uint32(blocks.length), ...blocks]);
}

test("ASE RGB export uses a big-endian 1.0 structure and round trips names", () => {
  const encoded = codec.encode({ name: "Café", colors: [
    { name: "Red", hex: "#FF0000" },
    { name: "Blue", hex: "#0000FF" }
  ] });
  assert.equal(Buffer.from(encoded.subarray(0, 4)).toString("ascii"), "ASEF");
  assert.equal(new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength).getUint32(8, false), 4);
  const decoded = codec.decode(encoded);
  assert.equal(decoded.groups[0].name, "Café");
  assert.deepEqual(decoded.groups[0].colors.map(({ name, hex }) => ({ name, hex })), [
    { name: "Red", hex: "#FF0000" },
    { name: "Blue", hex: "#0000FF" }
  ]);
});

test("ASE decoder converts RGB, CMYK, Lab, and Gray entries", () => {
  const bytes = ase([
    block(0xC001, aseName("Models")),
    colorBlock("RGB", "RGB ", [1, 0, 0]),
    colorBlock("CMYK", "CMYK", [1, 0, 0, 0]),
    colorBlock("Lab", "LAB ", [1, 0, 0]),
    colorBlock("Gray", "Gray", [0.5]),
    block(0xC002, Buffer.alloc(0))
  ]);
  const decoded = codec.decode(bytes);
  assert.deepEqual(decoded.groups[0].colors.map((color) => color.hex), ["#FF0000", "#00FFFF", "#FFFFFF", "#808080"]);
});

test("ASE decoder respects nested group boundaries and ungrouped colors", () => {
  const bytes = ase([
    block(0xC001, aseName("Outer")),
    colorBlock("Outer first", "RGB ", [1, 0, 0]),
    block(0xC001, aseName("Inner")),
    colorBlock("Inner color", "RGB ", [0, 1, 0]),
    block(0xC002, Buffer.alloc(0)),
    colorBlock("Outer last", "RGB ", [0, 0, 1]),
    block(0xC002, Buffer.alloc(0)),
    colorBlock("Loose", "Gray", [0])
  ]);
  const decoded = codec.decode(bytes);
  assert.deepEqual(decoded.groups.map((group) => [group.name, group.colors.map((color) => color.name)]), [
    ["Outer", ["Outer first", "Outer last"]],
    ["Inner", ["Inner color"]]
  ]);
  assert.equal(decoded.ungrouped[0].name, "Loose");
});

test("ASE decoder skips unsupported entries but rejects malformed files", () => {
  const bytes = ase([
    colorBlock("Unsupported", "XYZ ", [0, 0, 0]),
    colorBlock("Good", "RGB ", [0, 1, 0])
  ]);
  const decoded = codec.decode(bytes);
  assert.equal(decoded.warnings.length, 1);
  assert.equal(decoded.ungrouped[0].hex, "#00FF00");
  assert.throws(() => codec.decode(Buffer.from("wrong")), /truncated|not an Adobe ASE/i);
  assert.throws(() => codec.decode(Buffer.concat([Buffer.from("ASEF"), uint16(1), uint16(0), uint32(1)])), /truncated/i);
});
