const assert = require("node:assert/strict");
const test = require("node:test");

const { createUuidGenerator } = require("../resources/js/tools/uuid/uuid-codec.js");

function createDeterministicRandom() {
  let next = 0;
  return function randomBytes(length) {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = next & 0xff;
      next += 1;
    }
    return bytes;
  };
}

test("generates RFC-shaped version 4 UUIDs", function() {
  const generator = createUuidGenerator({ randomBytes: createDeterministicRandom() });
  const uuid = generator.generateUuid({ version: "4" });

  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("supports uppercase hyphenless formatting", function() {
  const generator = createUuidGenerator({ randomBytes: createDeterministicRandom() });
  const uuid = generator.generateUuid({ version: "4", hyphens: false, uppercase: true });

  assert.match(uuid, /^[0-9A-F]{32}$/);
  assert.equal(uuid[12], "4");
  assert.match(uuid[16], /^[89AB]$/);
});

test("generates version 7 UUIDs with timestamp prefix", function() {
  const generator = createUuidGenerator({ randomBytes: createDeterministicRandom() });
  const uuid = generator.generateUuid({ version: "7", nowMs: 0x01890abcdef0 });

  assert.match(uuid, /^01890abc-def0-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("generates version 1 UUIDs and requested counts", function() {
  const generator = createUuidGenerator({ randomBytes: createDeterministicRandom() });
  const uuids = generator.generateUuids({ version: "1", count: 3, nowMs: 1700000000000 });

  assert.equal(uuids.length, 3);
  assert.match(uuids[0], /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(uuids[0], uuids[1]);
});
