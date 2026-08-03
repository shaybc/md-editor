/**
 * TLS certificate inspection and AI Companion trust-list helpers.
 */

"use strict";

const crypto = require("node:crypto");
const tls = require("node:tls");

const DEFAULT_INSPECTION_TIMEOUT_MS = 10000;

function normalizeCertificateName(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${Array.isArray(entry) ? entry.join(",") : entry}`)
    .join(", ");
}

function formatPemFromDer(raw) {
  const base64 = Buffer.from(raw).toString("base64");
  const lines = base64.match(/.{1,64}/g) || [];
  return ["-----BEGIN CERTIFICATE-----", ...lines, "-----END CERTIFICATE-----"].join("\n");
}

function formatFingerprint(raw) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(raw))
    .digest("hex")
    .match(/.{1,2}/g)
    .join(":")
    .toUpperCase();
}

function normalizeCertificateRecord(certificate, fallback = {}) {
  const raw = certificate?.raw;
  const pem = typeof certificate?.pem === "string" ? certificate.pem : (raw ? formatPemFromDer(raw) : String(fallback.pem || ""));
  const fingerprint256 = raw ? formatFingerprint(raw) : String(certificate?.fingerprint256 || fallback.fingerprint256 || "").trim();
  if (!pem || !fingerprint256) return null;
  return {
    host: String(certificate?.host || fallback.host || "").trim().toLowerCase(),
    port: String(certificate?.port || fallback.port || "").trim(),
    subject: normalizeCertificateName(certificate?.subject || fallback.subject),
    issuer: normalizeCertificateName(certificate?.issuer || fallback.issuer),
    validFrom: String(certificate?.valid_from || certificate?.validFrom || fallback.validFrom || ""),
    validTo: String(certificate?.valid_to || certificate?.validTo || fallback.validTo || ""),
    fingerprint256,
    pem,
    trustedAt: String(certificate?.trustedAt || fallback.trustedAt || "")
  };
}

function normalizeTrustedCertificates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeCertificateRecord(entry))
    .filter((entry) => entry && entry.host && entry.pem && entry.fingerprint256);
}

function collectCertificateChain(peerCertificate, host, port) {
  const certificates = [];
  const seen = new Set();
  let current = peerCertificate;
  while (current && current.raw) {
    const fingerprint256 = formatFingerprint(current.raw);
    if (seen.has(fingerprint256)) break;
    seen.add(fingerprint256);
    const record = normalizeCertificateRecord(current, { host, port, fingerprint256 });
    if (record) certificates.push(record);
    if (!current.issuerCertificate || current.issuerCertificate === current) break;
    current = current.issuerCertificate;
  }
  return certificates;
}

function parseCertificateUrl(targetUrl) {
  const parsed = new URL(String(targetUrl || ""));
  if (parsed.protocol !== "https:") throw new Error("Certificate inspection requires an HTTPS URL.");
  return {
    host: parsed.hostname.toLowerCase(),
    port: String(parsed.port || "443"),
    servername: parsed.hostname
  };
}

function getTrustedCertificatesForUrl(trustedCertificates, targetUrl) {
  let parsed;
  try {
    parsed = parseCertificateUrl(targetUrl);
  } catch (_error) {
    return [];
  }
  return normalizeTrustedCertificates(trustedCertificates).filter((entry) => {
    if (entry.host !== parsed.host) return false;
    return !entry.port || entry.port === parsed.port;
  });
}

function inspectServerCertificate(targetUrl, options = {}) {
  const target = parseCertificateUrl(targetUrl);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : DEFAULT_INSPECTION_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = tls.connect({
      host: target.host,
      port: Number(target.port),
      servername: target.servername,
      rejectUnauthorized: false
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      callback(value);
    };

    const abort = () => finish(reject, new Error("Certificate inspection cancelled."));
    options.signal?.addEventListener?.("abort", abort, { once: true });
    socket.setTimeout(timeoutMs, () => finish(reject, new Error("Certificate inspection timed out.")));
    socket.once("error", (error) => finish(reject, error));
    socket.once("secureConnect", () => {
      const peerCertificate = socket.getPeerCertificate(true);
      const certificates = collectCertificateChain(peerCertificate, target.host, target.port);
      finish(resolve, {
        host: target.host,
        port: target.port,
        authorized: socket.authorized === true,
        authorizationError: socket.authorizationError || "",
        certificates,
        pemChain: certificates.map((certificate) => certificate.pem).join("\n")
      });
    });
  });
}

module.exports = {
  getTrustedCertificatesForUrl,
  inspectServerCertificate,
  normalizeTrustedCertificates
};