(function(root) {
  "use strict";

  const UUID_EPOCH_OFFSET = 122192928000000000n;
  const MAX_GENERATION_COUNT = 1000;

  function createRandomBytesProvider(deps) {
    if (typeof deps?.randomBytes === "function") {
      return deps.randomBytes;
    }
    const cryptoObject = deps?.crypto || root.crypto || null;
    if (cryptoObject?.getRandomValues) {
      return function randomBytes(length) {
        const bytes = new Uint8Array(length);
        cryptoObject.getRandomValues(bytes);
        return bytes;
      };
    }
    return function randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
      return bytes;
    };
  }

  function bytesToUuid(bytes, options) {
    const hex = Array.from(bytes, function(byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    const value = options?.hyphens === false
      ? hex
      : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return options?.uppercase ? value.toUpperCase() : value;
  }

  function normalizeVersion(version) {
    const normalized = String(version || "4").trim();
    return normalized === "1" || normalized === "7" ? normalized : "4";
  }

  function normalizeCount(count) {
    const numeric = Number.parseInt(String(count || "1"), 10);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(Math.max(numeric, 1), MAX_GENERATION_COUNT);
  }

  function createUuidGenerator(deps) {
    const randomBytes = createRandomBytesProvider(deps);
    let nodeId = null;
    let clockSequence = null;
    let lastTimestampMs = -1;
    let subMillisecondCounter = 0;

    function getNodeId() {
      if (!nodeId) {
        nodeId = randomBytes(6);
        nodeId[0] = nodeId[0] | 0x01;
      }
      return nodeId;
    }

    function getClockSequence() {
      if (clockSequence === null) {
        const bytes = randomBytes(2);
        clockSequence = ((bytes[0] << 8) | bytes[1]) & 0x3fff;
      }
      return clockSequence;
    }

    function createVersion1Bytes(nowMs) {
      const timestampMs = Number.isFinite(nowMs) ? nowMs : Date.now();
      if (timestampMs === lastTimestampMs) {
        subMillisecondCounter = (subMillisecondCounter + 1) % 10000;
        if (subMillisecondCounter === 0) {
          clockSequence = (getClockSequence() + 1) & 0x3fff;
        }
      } else {
        lastTimestampMs = timestampMs;
        subMillisecondCounter = 0;
      }

      const uuidTime = (BigInt(timestampMs) * 10000n) + UUID_EPOCH_OFFSET + BigInt(subMillisecondCounter);
      const bytes = new Uint8Array(16);
      const timeLow = Number(uuidTime & 0xffffffffn);
      const timeMid = Number((uuidTime >> 32n) & 0xffffn);
      const timeHigh = Number((uuidTime >> 48n) & 0x0fffn) | 0x1000;
      const sequence = getClockSequence();
      const node = getNodeId();

      bytes[0] = (timeLow >>> 24) & 0xff;
      bytes[1] = (timeLow >>> 16) & 0xff;
      bytes[2] = (timeLow >>> 8) & 0xff;
      bytes[3] = timeLow & 0xff;
      bytes[4] = (timeMid >>> 8) & 0xff;
      bytes[5] = timeMid & 0xff;
      bytes[6] = (timeHigh >>> 8) & 0xff;
      bytes[7] = timeHigh & 0xff;
      bytes[8] = ((sequence >>> 8) & 0x3f) | 0x80;
      bytes[9] = sequence & 0xff;
      bytes.set(node, 10);
      return bytes;
    }

    function createVersion4Bytes() {
      const bytes = randomBytes(16);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return bytes;
    }

    function createVersion7Bytes(nowMs) {
      const timestampMs = Number.isFinite(nowMs) ? nowMs : Date.now();
      const bytes = randomBytes(16);
      let timestamp = BigInt(timestampMs);
      for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = Number(timestamp & 0xffn);
        timestamp >>= 8n;
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x70;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return bytes;
    }

    function generateUuid(options) {
      const version = normalizeVersion(options?.version);
      const bytes = version === "1"
        ? createVersion1Bytes(options?.nowMs)
        : version === "7"
          ? createVersion7Bytes(options?.nowMs)
          : createVersion4Bytes();
      return bytesToUuid(bytes, options);
    }

    function generateUuids(options) {
      const count = normalizeCount(options?.count);
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(generateUuid(options));
      }
      return values;
    }

    return {
      generateUuid,
      generateUuids,
      normalizeCount,
      normalizeVersion
    };
  }

  function registerMarkdownViewerUuidCodec(app, deps) {
    const generator = createUuidGenerator(deps || {});
    const api = {
      generateUuid: generator.generateUuid,
      generateUuids: generator.generateUuids,
      normalizeCount: generator.normalizeCount,
      normalizeVersion: generator.normalizeVersion
    };
    app?.registerModule?.("uuidCodec", api);
    return api;
  }

  root.registerMarkdownViewerUuidCodec = registerMarkdownViewerUuidCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createUuidGenerator,
      registerMarkdownViewerUuidCodec
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
