(function(root) {
  "use strict";

  const HMAC_ALGORITHMS = {
    HS256: { hash: "SHA-256", node: "sha256" },
    HS384: { hash: "SHA-384", node: "sha384" },
    HS512: { hash: "SHA-512", node: "sha512" }
  };

  const DATE_CLAIMS = new Set(["exp", "nbf", "iat", "auth_time", "updated_at"]);

  function createTextEncoder() {
    if (typeof TextEncoder !== "undefined") return new TextEncoder();
    const util = require("util");
    return new util.TextEncoder();
  }

  function createTextDecoder() {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: false });
    const util = require("util");
    return new util.TextDecoder("utf-8", { fatal: false });
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const normalized = String(base64 || "").replace(/\s+/g, "");
    if (!normalized) return new Uint8Array();
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(normalized, "base64"));
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function base64UrlEncodeBytes(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecodeBytes(value) {
    let base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    return base64ToBytes(base64);
  }

  function encodeUtf8(value) {
    return createTextEncoder().encode(String(value || ""));
  }

  function decodeUtf8(bytes) {
    return createTextDecoder().decode(bytes);
  }

  function base64UrlEncodeJson(value) {
    return base64UrlEncodeBytes(encodeUtf8(JSON.stringify(value)));
  }

  function parseJson(text, label) {
    try {
      return JSON.parse(String(text || ""));
    } catch (error) {
      throw new Error(`${label} is not valid JSON.`);
    }
  }

  function formatJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function normalizeToken(rawToken) {
    return String(rawToken || "")
      .trim()
      .replace(/^Authorization:\s*/i, "")
      .replace(/^Bearer\s+/i, "")
      .trim();
  }

  function decodeToken(token) {
    const normalized = normalizeToken(token);
    const parts = normalized.split(".");
    if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
      throw new Error("JWT must contain header and payload sections.");
    }
    const header = parseJson(decodeUtf8(base64UrlDecodeBytes(parts[0])), "Header");
    const payload = parseJson(decodeUtf8(base64UrlDecodeBytes(parts[1])), "Payload");
    return {
      token: normalized,
      header,
      payload,
      signature: parts[2] || "",
      signingInput: `${parts[0]}.${parts[1]}`
    };
  }

  async function signHmac(signingInput, secret, algorithm, options = {}) {
    const selected = HMAC_ALGORITHMS[algorithm];
    if (!selected) throw new Error(`${algorithm || "Algorithm"} is not supported for local signing.`);
    if (!secret) throw new Error("Signature key is required.");
    const keyBytes = options.secretIsBase64 ? base64ToBytes(secret) : encodeUtf8(secret);
    const data = encodeUtf8(signingInput);
    if (root.crypto?.subtle) {
      const key = await root.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: selected.hash }, false, ["sign"]);
      const signature = await root.crypto.subtle.sign("HMAC", key, data);
      return base64UrlEncodeBytes(new Uint8Array(signature));
    }
    if (typeof require === "function") {
      const crypto = require("crypto");
      return crypto.createHmac(selected.node, Buffer.from(keyBytes)).update(Buffer.from(data)).digest("base64url");
    }
    throw new Error("HMAC signing is not available in this runtime.");
  }

  async function encodeToken(headerText, payloadText, options = {}) {
    const header = parseJson(headerText, "Header");
    const payload = parseJson(payloadText, "Payload");
    const algorithm = options.algorithm || header.alg || "HS256";
    header.alg = algorithm;
    if (!header.typ) header.typ = "JWT";
    const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
    if (algorithm === "none") return `${signingInput}.`;
    const signature = await signHmac(signingInput, options.secret || "", algorithm, options);
    return `${signingInput}.${signature}`;
  }

  function normalizeList(value) {
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  }

  function getPayloadAudiences(payload) {
    if (Array.isArray(payload.aud)) return payload.aud.map(String);
    if (typeof payload.aud === "string") return [payload.aud];
    return [];
  }

  function formatUnixDate(value) {
    if (!Number.isFinite(value)) return "";
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.toLocaleString()} (${Math.trunc(value)})`;
  }

  function describeClaims(payload) {
    return Object.keys(payload || {}).map((name) => {
      const value = payload[name];
      const scalar = Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value);
      return {
        name,
        value: scalar,
        formatted: DATE_CLAIMS.has(name) && typeof value === "number" ? formatUnixDate(value) : ""
      };
    });
  }

  async function validateToken(token, options = {}) {
    const decoded = decodeToken(token);
    const messages = [];
    const headerAlgorithm = decoded.header.alg || "none";
    if (options.validateSignature) {
      if (headerAlgorithm === "none") {
        messages.push({ type: "error", text: "Token uses alg none and has no signature to validate." });
      } else if (!HMAC_ALGORITHMS[headerAlgorithm]) {
        messages.push({ type: "warning", text: `${headerAlgorithm} signature validation is not supported locally. HS256, HS384 and HS512 are supported.` });
      } else {
        const expected = await signHmac(decoded.signingInput, options.secret || "", headerAlgorithm, options);
        messages.push(expected === decoded.signature
          ? { type: "success", text: "Signature is valid." }
          : { type: "error", text: "Signature is invalid." });
      }
    }
    if (options.validateIssuer) {
      const issuers = normalizeList(options.issuers);
      if (!issuers.length) messages.push({ type: "error", text: "Issuer validation is on, but no issuers were provided." });
      else if (!issuers.includes(String(decoded.payload.iss || ""))) messages.push({ type: "error", text: "Issuer does not match the allowed issuers." });
      else messages.push({ type: "success", text: "Issuer is valid." });
    }
    if (options.validateAudience) {
      const audiences = normalizeList(options.audiences);
      const tokenAudiences = getPayloadAudiences(decoded.payload);
      if (!audiences.length) messages.push({ type: "error", text: "Audience validation is on, but no audiences were provided." });
      else if (!tokenAudiences.some((audience) => audiences.includes(audience))) messages.push({ type: "error", text: "Audience does not match the allowed audiences." });
      else messages.push({ type: "success", text: "Audience is valid." });
    }
    if (options.validateLifetime) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof decoded.payload.nbf === "number" && now < decoded.payload.nbf) messages.push({ type: "error", text: "Token is not valid yet." });
      if (typeof decoded.payload.exp === "number" && now >= decoded.payload.exp) messages.push({ type: "error", text: "Token has expired." });
      if (typeof decoded.payload.exp !== "number" && typeof decoded.payload.nbf !== "number") messages.push({ type: "warning", text: "Lifetime validation is on, but exp/nbf claims are missing." });
      if (!messages.some((message) => message.type === "error" && /expired|not valid yet/.test(message.text))) messages.push({ type: "success", text: "Lifetime is valid." });
    }
    if (!messages.length) messages.push({ type: "info", text: "Token decoded. Validation is off." });
    return { decoded, messages, claims: describeClaims(decoded.payload) };
  }

  root.registerMarkdownViewerJwtCodec = function registerMarkdownViewerJwtCodec(app) {
    const api = { HMAC_ALGORITHMS, normalizeToken, decodeToken, encodeToken, validateToken, formatJson, describeClaims };
    app?.registerModule?.("jwtCodec", api);
    return api;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { HMAC_ALGORITHMS, normalizeToken, decodeToken, encodeToken, validateToken, formatJson, describeClaims };
  }
})(typeof window !== "undefined" ? window : globalThis);