// Browser-side X.509 certificate parser for the Certificate Decoder tool.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.registerMarkdownViewerCertificateParser = api.registerMarkdownViewerCertificateParser;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const ATTRIBUTE_NAMES = {
    "2.5.4.3": "CN",
    "2.5.4.4": "SN",
    "2.5.4.5": "serialNumber",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.9": "street",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "2.5.4.12": "T",
    "2.5.4.42": "GN",
    "1.2.840.113549.1.9.1": "E"
  };

  const EXTENSION_NAMES = {
    "2.5.29.14": "Subject Key Identifier",
    "2.5.29.15": "Key Usage",
    "2.5.29.17": "Subject Alternative Name",
    "2.5.29.19": "Basic Constraints",
    "2.5.29.35": "Authority Key Identifier",
    "2.5.29.37": "Enhanced Key Usage",
    "1.3.6.1.5.5.7.1.1": "Authority Information Access"
  };

  const EXTENDED_KEY_USAGE_NAMES = {
    "1.3.6.1.5.5.7.3.1": "Server Authentication",
    "1.3.6.1.5.5.7.3.2": "Client Authentication",
    "1.3.6.1.5.5.7.3.3": "Code Signing",
    "1.3.6.1.5.5.7.3.4": "Email Protection",
    "1.3.6.1.5.5.7.3.8": "Time Stamping",
    "1.3.6.1.5.5.7.3.9": "OCSP Signing"
  };

  const ACCESS_METHOD_NAMES = {
    "1.3.6.1.5.5.7.48.1": "OCSP",
    "1.3.6.1.5.5.7.48.2": "Certification Authority Issuer"
  };

  class CertificateParseError extends Error {
    constructor(message) {
      super(message);
      this.name = "CertificateParseError";
    }
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new TextEncoder().encode(String(value || ""));
  }

  function normalizeBase64(value) {
    return String(value || "").replace(/[\s\r\n]+/g, "");
  }

  function bytesToHex(bytes, separator = "") {
    return Array.from(bytes || [], (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(separator);
  }

  function base64ToBytes(base64) {
    const binary = atob(normalizeBase64(base64));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function extractCertificateBytes(input) {
    if (input instanceof Uint8Array || input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return toUint8Array(input);
    const text = String(input || "").trim();
    const pemMatch = text.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/i);
    if (pemMatch) return base64ToBytes(pemMatch[1]);
    if (/-----BEGIN [^-]+-----/i.test(text)) throw new CertificateParseError("The input does not contain a PEM certificate block.");
    if (!text) throw new CertificateParseError("Enter or drop a certificate to decode.");
    try {
      return base64ToBytes(text);
    } catch (_error) {
      return new TextEncoder().encode(text);
    }
  }

  function readLength(bytes, offset) {
    if (offset >= bytes.length) throw new CertificateParseError("Unexpected end of ASN.1 length.");
    const first = bytes[offset];
    if (first < 0x80) return { length: first, offset: offset + 1 };
    const count = first & 0x7f;
    if (!count || count > 4 || offset + count >= bytes.length) throw new CertificateParseError("Unsupported ASN.1 length.");
    let length = 0;
    for (let index = 0; index < count; index += 1) length = (length << 8) | bytes[offset + 1 + index];
    return { length, offset: offset + 1 + count };
  }

  function parseElement(bytes, offset = 0) {
    if (offset >= bytes.length) throw new CertificateParseError("Unexpected end of ASN.1 element.");
    const start = offset;
    const identifier = bytes[offset++];
    const lengthInfo = readLength(bytes, offset);
    offset = lengthInfo.offset;
    const valueStart = offset;
    const valueEnd = valueStart + lengthInfo.length;
    if (valueEnd > bytes.length) throw new CertificateParseError("ASN.1 element length exceeds input size.");
    const node = {
      start,
      end: valueEnd,
      headerLength: valueStart - start,
      tagClass: identifier >> 6,
      constructed: (identifier & 0x20) !== 0,
      tag: identifier & 0x1f,
      valueStart,
      valueEnd,
      bytes,
      children: []
    };
    if (node.constructed) {
      let childOffset = valueStart;
      while (childOffset < valueEnd) {
        const child = parseElement(bytes, childOffset);
        node.children.push(child);
        childOffset = child.end;
      }
    }
    return node;
  }

  function parseDer(bytes) {
    const root = parseElement(bytes, 0);
    if (root.end !== bytes.length) throw new CertificateParseError("The input contains trailing data after the certificate.");
    return root;
  }

  function valueBytes(node) {
    return node.bytes.subarray(node.valueStart, node.valueEnd);
  }

  function fullBytes(node) {
    return node.bytes.subarray(node.start, node.end);
  }

  function unwrapExplicit(node) {
    return node?.children?.[0] || null;
  }

  function readIntegerHex(node) {
    const bytes = valueBytes(node);
    const start = bytes[0] === 0 ? 1 : 0;
    return bytesToHex(bytes.subarray(start)) || "00";
  }

  function readBoolean(node) {
    return valueBytes(node)[0] !== 0;
  }

  function readOid(node) {
    const bytes = valueBytes(node);
    if (!bytes.length) return "";
    const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
    let value = 0;
    for (let index = 1; index < bytes.length; index += 1) {
      value = (value << 7) | (bytes[index] & 0x7f);
      if ((bytes[index] & 0x80) === 0) {
        parts.push(value);
        value = 0;
      }
    }
    return parts.join(".");
  }

  function decodeBmpString(bytes) {
    let value = "";
    for (let index = 0; index + 1 < bytes.length; index += 2) value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return value;
  }

  function readString(node) {
    const bytes = valueBytes(node);
    if (node.tag === 30) return decodeBmpString(bytes);
    if (node.tag === 12) return new TextDecoder("utf-8").decode(bytes);
    return new TextDecoder("latin1").decode(bytes);
  }

  function parseTime(node) {
    const raw = readString(node);
    let year;
    let cursor;
    if (node.tag === 23) {
      const shortYear = Number(raw.slice(0, 2));
      year = shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear;
      cursor = 2;
    } else {
      year = Number(raw.slice(0, 4));
      cursor = 4;
    }
    const month = Number(raw.slice(cursor, cursor + 2));
    const day = Number(raw.slice(cursor + 2, cursor + 4));
    const hour = Number(raw.slice(cursor + 4, cursor + 6));
    const minute = Number(raw.slice(cursor + 6, cursor + 8));
    const second = Number(raw.slice(cursor + 8, cursor + 10) || "0");
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return { raw, iso: Number.isNaN(date.getTime()) ? raw : date.toISOString().replace("T", " ").replace(".000Z", " UTC") };
  }

  function parseName(node) {
    const entries = [];
    for (const rdnSet of node.children || []) {
      for (const attribute of rdnSet.children || []) {
        const oid = readOid(attribute.children?.[0]);
        const value = readString(attribute.children?.[1]);
        entries.push({ oid, name: ATTRIBUTE_NAMES[oid] || oid, value });
      }
    }
    return { entries, text: entries.map((entry) => `${entry.name}=${entry.value}`).join(", ") };
  }

  function parseAlgorithmIdentifier(node) {
    const oid = readOid(node.children?.[0]);
    return { oid, name: oid };
  }

  function parseBitString(node) {
    const bytes = valueBytes(node);
    return { unusedBits: bytes[0] || 0, bytes: bytes.subarray(1) };
  }

  function bitIsSet(bitString, bitIndex) {
    const byte = bitString.bytes[Math.floor(bitIndex / 8)];
    if (byte == null) return false;
    return (byte & (0x80 >> (bitIndex % 8))) !== 0;
  }

  function parseKeyUsage(node) {
    const bitString = parseBitString(node);
    const usages = [
      "Digital Signature",
      "Non Repudiation",
      "Key Encipherment",
      "Data Encipherment",
      "Key Agreement",
      "Certificate Sign",
      "CRL Sign",
      "Encipher Only",
      "Decipher Only"
    ];
    return usages.filter((_usage, index) => bitIsSet(bitString, index));
  }

  function parseGeneralName(node) {
    const text = new TextDecoder("latin1").decode(valueBytes(node));
    if (node.tagClass === 2 && node.tag === 1) return `Email=${text}`;
    if (node.tagClass === 2 && node.tag === 2) return `DNS Name=${text}`;
    if (node.tagClass === 2 && node.tag === 6) return `URL=${text}`;
    if (node.tagClass === 2 && node.tag === 7) {
      const bytes = valueBytes(node);
      if (bytes.length === 4) return `IP Address=${Array.from(bytes).join(".")}`;
      return `IP Address=${bytesToHex(bytes, ":")}`;
    }
    return `GeneralName[${node.tag}]=${bytesToHex(valueBytes(node))}`;
  }

  function parseSubjectAltName(node) {
    return (node.children || []).map(parseGeneralName);
  }

  function parseEnhancedKeyUsage(node) {
    return (node.children || []).map((child) => {
      const oid = readOid(child);
      return `${EXTENDED_KEY_USAGE_NAMES[oid] || oid} (${oid})`;
    });
  }

  function parseBasicConstraints(node) {
    let ca = false;
    let pathLength = "None";
    for (const child of node.children || []) {
      if (child.tag === 1) ca = readBoolean(child);
      if (child.tag === 2) pathLength = String(parseInt(readIntegerHex(child), 16));
    }
    return [`Subject Type=${ca ? "CA" : "End Entity"}`, `Path Length Constraint=${pathLength}`];
  }

  function parseAuthorityKeyIdentifier(node) {
    return (node.children || []).map((child) => {
      if (child.tagClass === 2 && child.tag === 0) return `KeyID=${bytesToHex(valueBytes(child)).toLowerCase()}`;
      return `Field[${child.tag}]=${bytesToHex(valueBytes(child))}`;
    });
  }

  function parseAuthorityInfoAccess(node) {
    return (node.children || []).map((description, index) => {
      const methodOid = readOid(description.children?.[0]);
      const location = parseGeneralName(description.children?.[1]);
      return `[${index + 1}]${ACCESS_METHOD_NAMES[methodOid] || methodOid}: ${location}`;
    });
  }

  function parseExtensionValue(oid, valueNode) {
    const inner = parseDer(valueBytes(valueNode));
    if (oid === "2.5.29.14") return [`${bytesToHex(valueBytes(inner)).toLowerCase()}`];
    if (oid === "2.5.29.15") return parseKeyUsage(inner);
    if (oid === "2.5.29.17") return parseSubjectAltName(inner);
    if (oid === "2.5.29.19") return parseBasicConstraints(inner);
    if (oid === "2.5.29.35") return parseAuthorityKeyIdentifier(inner);
    if (oid === "2.5.29.37") return parseEnhancedKeyUsage(inner);
    if (oid === "1.3.6.1.5.5.7.1.1") return parseAuthorityInfoAccess(inner);
    return [bytesToHex(valueBytes(inner)) || bytesToHex(valueBytes(valueNode))];
  }

  function parseExtensions(node) {
    const extensions = [];
    for (const extension of node.children || []) {
      const oid = readOid(extension.children?.[0]);
      let valueIndex = 1;
      let critical = false;
      if (extension.children?.[1]?.tag === 1) {
        critical = readBoolean(extension.children[1]);
        valueIndex = 2;
      }
      const values = parseExtensionValue(oid, extension.children?.[valueIndex]);
      extensions.push({ oid, name: EXTENSION_NAMES[oid] || oid, critical, values });
    }
    return extensions;
  }

  function looksLikePkcs12(root) {
    const contentInfo = root.children?.[1];
    const contentType = contentInfo?.children?.[0] ? readOid(contentInfo.children[0]) : "";
    return root.tag === 16 && readIntegerHex(root.children?.[0] || {}) === "03" && contentType.startsWith("1.2.840.113549.1.7.");
  }

  function parseCertificate(input) {
    const der = extractCertificateBytes(input);
    const certificate = parseDer(der);
    if (looksLikePkcs12(certificate)) {
      throw new CertificateParseError("PFX/PKCS#12 containers are detected, but encrypted PFX decoding is not available in this local tool yet. Export the certificate as PEM, CER, or CRT and decode that file.");
    }
    if (certificate.tag !== 16 || certificate.children.length < 3) throw new CertificateParseError("The input is not an X.509 certificate.");
    const tbs = certificate.children[0];
    let index = 0;
    let version = "v1";
    if (tbs.children[index]?.tagClass === 2 && tbs.children[index]?.tag === 0) {
      const versionNumber = parseInt(readIntegerHex(unwrapExplicit(tbs.children[index])), 16) + 1;
      version = `v${versionNumber}`;
      index += 1;
    }
    const serialNumber = readIntegerHex(tbs.children[index++]);
    const signatureAlgorithm = parseAlgorithmIdentifier(tbs.children[index++]);
    const issuer = parseName(tbs.children[index++]);
    const validity = tbs.children[index++];
    const notBefore = parseTime(validity.children[0]);
    const notAfter = parseTime(validity.children[1]);
    const subject = parseName(tbs.children[index++]);
    const publicKeyInfo = tbs.children[index++];
    const publicKeyAlgorithm = parseAlgorithmIdentifier(publicKeyInfo.children?.[0]);
    let extensions = [];
    for (; index < tbs.children.length; index += 1) {
      const child = tbs.children[index];
      if (child.tagClass === 2 && child.tag === 3) extensions = parseExtensions(unwrapExplicit(child));
    }
    return {
      version,
      serialNumber,
      subject,
      issuer,
      notBefore,
      notAfter,
      signatureAlgorithm,
      publicKeyAlgorithm,
      extensions,
      der,
      pem: `-----BEGIN CERTIFICATE-----\n${(bytesToBase64(der).match(/.{1,64}/g) || []).join("\n")}\n-----END CERTIFICATE-----`
    };
  }

  function registerMarkdownViewerCertificateParser(app) {
    const api = { parseCertificate, extractCertificateBytes, bytesToHex, CertificateParseError };
    app.services = app.services || {};
    app.services.certificateParser = api;
    app.registerModule?.("certificateParser", api);
    return api;
  }

  return { registerMarkdownViewerCertificateParser, parseCertificate, extractCertificateBytes, bytesToHex, CertificateParseError };
});