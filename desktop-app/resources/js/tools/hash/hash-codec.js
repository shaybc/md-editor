// Hash and checksum calculations for the DevToys-style Hash / Checksum Generator.
(function(root) {
  "use strict";

  const ALGORITHMS = {
    MD5: { label: "MD5", subtle: null, node: "md5", blockSize: 64 },
    SHA1: { label: "SHA1", subtle: "SHA-1", node: "sha1", blockSize: 64 },
    SHA256: { label: "SHA256", subtle: "SHA-256", node: "sha256", blockSize: 64 },
    SHA384: { label: "SHA384", subtle: "SHA-384", node: "sha384", blockSize: 128 },
    SHA512: { label: "SHA512", subtle: "SHA-512", node: "sha512", blockSize: 128 }
  };

  function normalizeAlgorithm(algorithm) {
    const normalized = String(algorithm || "MD5").replace(/[-_\s]/g, "").toUpperCase();
    if (!ALGORITHMS[normalized]) throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    return normalized;
  }

  function getUtf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(text || ""));
    return Uint8Array.from(Buffer.from(String(text || ""), "utf8"));
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return getUtf8Bytes(value);
  }

  function concatBytes(left, right) {
    const output = new Uint8Array(left.length + right.length);
    output.set(left, 0);
    output.set(right, left.length);
    return output;
  }

  function bytesToHex(bytes, uppercase) {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return uppercase ? hex.toUpperCase() : hex;
  }

  function rotateLeft(value, amount) {
    return (value << amount) | (value >>> (32 - amount));
  }

  function add32() {
    let total = 0;
    for (let index = 0; index < arguments.length; index += 1) {
      total = (total + arguments[index]) >>> 0;
    }
    return total;
  }

  function md5Bytes(input) {
    const bytes = toUint8Array(input);
    const bitLength = bytes.length * 8;
    const paddedLength = (((bytes.length + 8) >>> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    for (let index = 0; index < 8; index += 1) {
      padded[paddedLength - 8 + index] = Math.floor(bitLength / (2 ** (8 * index))) & 0xff;
    }

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);

    for (let offset = 0; offset < padded.length; offset += 64) {
      const words = new Array(16);
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words[index] = padded[base] | (padded[base + 1] << 8) | (padded[base + 2] << 16) | (padded[base + 3] << 24);
      }
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let index = 0; index < 64; index += 1) {
        let f;
        let g;
        if (index < 16) {
          f = (b & c) | ((~b) & d);
          g = index;
        } else if (index < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * index + 1) % 16;
        } else if (index < 48) {
          f = b ^ c ^ d;
          g = (3 * index + 5) % 16;
        } else {
          f = c ^ (b | (~d));
          g = (7 * index) % 16;
        }
        const nextD = c;
        c = b;
        b = add32(b, rotateLeft(add32(a, f, constants[index], words[g]), shifts[index]));
        a = d;
        d = nextD;
      }

      a0 = add32(a0, a);
      b0 = add32(b0, b);
      c0 = add32(c0, c);
      d0 = add32(d0, d);
    }

    const output = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((word, index) => {
      output[index * 4] = word & 0xff;
      output[index * 4 + 1] = (word >>> 8) & 0xff;
      output[index * 4 + 2] = (word >>> 16) & 0xff;
      output[index * 4 + 3] = (word >>> 24) & 0xff;
    });
    return output;
  }

  async function subtleDigest(spec, bytes) {
    if (root.crypto?.subtle?.digest && spec.subtle) {
      const digest = await root.crypto.subtle.digest(spec.subtle, bytes);
      return new Uint8Array(digest);
    }
    if (typeof require === "function") {
      const crypto = require("crypto");
      return Uint8Array.from(crypto.createHash(spec.node).update(Buffer.from(bytes)).digest());
    }
    throw new Error(`${spec.label} hashing is not available in this runtime.`);
  }

  async function digestBytes(algorithm, bytes) {
    const selected = normalizeAlgorithm(algorithm);
    if (selected === "MD5") return md5Bytes(bytes);
    return subtleDigest(ALGORITHMS[selected], toUint8Array(bytes));
  }

  async function hmacBytes(algorithm, bytes, secret) {
    const selected = normalizeAlgorithm(algorithm);
    const spec = ALGORITHMS[selected];
    let key = toUint8Array(secret);
    if (key.length > spec.blockSize) key = await digestBytes(selected, key);
    const paddedKey = new Uint8Array(spec.blockSize);
    paddedKey.set(key);
    const outerKey = new Uint8Array(spec.blockSize);
    const innerKey = new Uint8Array(spec.blockSize);
    for (let index = 0; index < spec.blockSize; index += 1) {
      outerKey[index] = paddedKey[index] ^ 0x5c;
      innerKey[index] = paddedKey[index] ^ 0x36;
    }
    const innerHash = await digestBytes(selected, concatBytes(innerKey, toUint8Array(bytes)));
    return digestBytes(selected, concatBytes(outerKey, innerHash));
  }

  async function hashBytes(bytes, options = {}) {
    const algorithm = normalizeAlgorithm(options.algorithm);
    const sourceBytes = toUint8Array(bytes);
    const digest = options.secret ? await hmacBytes(algorithm, sourceBytes, options.secret) : await digestBytes(algorithm, sourceBytes);
    return bytesToHex(digest, options.uppercase === true);
  }

  async function hashText(text, options = {}) {
    return hashBytes(getUtf8Bytes(text), options);
  }

  function normalizeChecksum(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function verifyChecksum(hash, checksum) {
    const expected = normalizeChecksum(checksum);
    if (!expected) return { status: "empty", matches: false };
    const actual = normalizeChecksum(hash);
    return { status: actual === expected ? "match" : "mismatch", matches: actual === expected };
  }

  function registerMarkdownViewerHashCodec(app) {
    const api = { ALGORITHMS, hashBytes, hashText, verifyChecksum, normalizeAlgorithm };
    app?.registerModule?.("hashCodec", api);
    return api;
  }

  root.registerMarkdownViewerHashCodec = registerMarkdownViewerHashCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ALGORITHMS, hashBytes, hashText, verifyChecksum, normalizeAlgorithm, _test: { md5Bytes, getUtf8Bytes } };
  }
})(typeof window !== "undefined" ? window : globalThis);
