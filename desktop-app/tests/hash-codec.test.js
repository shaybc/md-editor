const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const hashCodec = require("../resources/js/tools/hash/hash-codec.js");

test("hash codec calculates MD5 for text", async () => {
  const result = await hashCodec.hashText("hello", { algorithm: "MD5" });

  assert.equal(result, "5d41402abc4b2a76b9719d911017c592");
});

test("hash codec calculates SHA256 for bytes", async () => {
  const bytes = Uint8Array.from([104, 101, 108, 108, 111]);
  const result = await hashCodec.hashBytes(bytes, { algorithm: "SHA256" });

  assert.equal(result, crypto.createHash("sha256").update("hello").digest("hex"));
});

test("hash codec supports uppercase output", async () => {
  const result = await hashCodec.hashText("hello", { algorithm: "SHA1", uppercase: true });

  assert.equal(result, crypto.createHash("sha1").update("hello").digest("hex").toUpperCase());
});

test("hash codec supports HMAC hashing", async () => {
  const result = await hashCodec.hashText("hello", { algorithm: "SHA256", secret: "secret" });

  assert.equal(result, crypto.createHmac("sha256", "secret").update("hello").digest("hex"));
});

test("hash codec supports HMAC-MD5 hashing", async () => {
  const result = await hashCodec.hashText("hello", { algorithm: "MD5", secret: "secret" });

  assert.equal(result, crypto.createHmac("md5", "secret").update("hello").digest("hex"));
});

test("hash codec verifies checksum text", () => {
  assert.deepEqual(hashCodec.verifyChecksum("ABC123", "abc 123"), { status: "match", matches: true });
  assert.deepEqual(hashCodec.verifyChecksum("ABC123", "abc124"), { status: "mismatch", matches: false });
  assert.deepEqual(hashCodec.verifyChecksum("ABC123", ""), { status: "empty", matches: false });
});
