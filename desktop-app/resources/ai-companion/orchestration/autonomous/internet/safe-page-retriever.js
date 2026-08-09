/** Security-bounded HTTP retrieval for model-selected public pages. */

"use strict";

const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;

class SafePageRetriever {
  constructor(options = {}) { this.fetch = typeof options.fetch === "function" ? options.fetch : null; }

  /** Retrieve one public HTTP(S) page after validating every destination and redirect. */
  async retrieve(rawUrl, options = {}) {
    const maximumBytes = Math.max(1024, Math.min(Number(options.maxBytes) || DEFAULT_MAX_BYTES, 8 * 1024 * 1024));
    const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 60000));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let target = await resolvePublicTarget(rawUrl);
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const response = await this.requestWithRetry(target.url, controller.signal, options, target.addresses);
        if (isRedirect(response.status)) {
          if (redirects === MAX_REDIRECTS) throw pageError("PAGE_REDIRECT_LIMIT", "The page exceeded the redirect limit.");
          const location = response.headers.get("location");
          if (!location) throw pageError("PAGE_REDIRECT_INVALID", "The page returned a redirect without a destination.");
          response.body?.resume?.();
          target = await resolvePublicTarget(new URL(location, target.url).toString());
          continue;
        }
        if (!response.ok) {
          response.body?.resume?.();
          throw pageError("PAGE_HTTP_ERROR", `The page returned HTTP ${response.status}.`);
        }
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!isSupportedContentType(contentType)) throw pageError("PAGE_CONTENT_TYPE", `Unsupported page content type: ${contentType || "unknown"}.`);
        const declaredBytes = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
          response.body?.destroy?.();
          throw pageError("PAGE_TOO_LARGE", `The page exceeds the ${maximumBytes}-byte limit.`);
        }
        const body = await readBoundedBody(response, maximumBytes);
        return { url: target.url.toString(), contentType, bytes: Buffer.byteLength(body), body };
      }
      throw pageError("PAGE_REDIRECT_LIMIT", "The page exceeded the redirect limit.");
    } catch (error) {
      if (controller.signal.aborted) throw pageError("PAGE_FETCH_ABORTED", options.signal?.aborted ? "Page retrieval was cancelled." : "Page retrieval timed out.");
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener?.("abort", onAbort);
    }
  }

  async requestWithRetry(url, signal, options, addresses) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const headers = { "user-agent": "MD-Editor Internet Research/1.0", accept: "text/html,text/plain,application/json,application/xml;q=0.8,*/*;q=0.2" };
      const response = this.fetch
        ? await this.fetch(url, { redirect: "manual", signal, headers })
        : await requestPinned(url, addresses, signal, headers, attempt);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === 2) return response;
      response.body?.resume?.();
      const delayMs = retryDelay(response.headers.get("retry-after"), attempt);
      options.onRateLimit?.({ delayMs, status: response.status, url: url.toString() });
      await wait(delayMs, signal);
    }
    throw pageError("PAGE_HTTP_ERROR", "The page could not be retrieved.");
  }
}

async function validatePublicUrl(value) {
  return (await resolvePublicTarget(value)).url;
}

async function resolvePublicTarget(value) {
  let url;
  try { url = new URL(String(value || "")); } catch (_error) { throw pageError("PAGE_URL_INVALID", "A valid page URL is required."); }
  if (!["http:", "https:"].includes(url.protocol)) throw pageError("PAGE_PROTOCOL_DENIED", "Only HTTP and HTTPS pages may be retrieved.");
  if (url.username || url.password) throw pageError("PAGE_CREDENTIALS_DENIED", "Credentials embedded in page URLs are not allowed.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw pageError("PAGE_PRIVATE_ADDRESS", "Local and private network pages are not allowed.");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw pageError("PAGE_PRIVATE_ADDRESS", "Local and private network pages are not allowed.");
  return { url, addresses };
}

function isPrivateAddress(address) {
  const value = String(address || "").toLowerCase();
  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (!net.isIPv6(value)) return true;
  if (value.startsWith("::ffff:")) {
    const mapped = mappedIpv4(value.slice(7));
    return !mapped || isPrivateAddress(mapped);
  }
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

function mappedIpv4(value) {
  if (net.isIPv4(value)) return value;
  const parts = String(value || "").split(":");
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return "";
  const high = parseInt(parts[0], 16);
  const low = parseInt(parts[1], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function requestPinned(url, addresses, signal, headers, attempt = 0) {
  if (!Array.isArray(addresses) || !addresses.length) return Promise.reject(pageError("PAGE_PRIVATE_ADDRESS", "The page address could not be validated."));
  const selected = addresses[attempt % addresses.length];
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: selected.address,
      family: selected.family || net.isIP(selected.address),
      port: url.port || undefined,
      path: `${url.pathname || "/"}${url.search || ""}`,
      method: "GET",
      headers: { ...headers, host: url.host },
      ...(url.protocol === "https:" && !net.isIP(url.hostname) ? { servername: url.hostname } : {})
    }, (response) => resolve({
      status: Number(response.statusCode) || 0,
      ok: Number(response.statusCode) >= 200 && Number(response.statusCode) < 300,
      headers: { get(name) { const value = response.headers[String(name || "").toLowerCase()]; return Array.isArray(value) ? value.join(", ") : (value == null ? null : String(value)); } },
      body: response
    }));
    const abort = () => request.destroy(pageError("PAGE_FETCH_ABORTED", "Page retrieval was cancelled."));
    signal?.addEventListener?.("abort", abort, { once: true });
    request.once("close", () => signal?.removeEventListener?.("abort", abort));
    request.once("error", reject);
    request.end();
  });
}

async function readBoundedBody(response, maximumBytes) {
  if (response.body?.[Symbol.asyncIterator]) {
    const chunks = [];
    let bytes = 0;
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        response.body.destroy?.();
        throw pageError("PAGE_TOO_LARGE", `The page exceeds the ${maximumBytes}-byte limit.`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maximumBytes) throw pageError("PAGE_TOO_LARGE", `The page exceeds the ${maximumBytes}-byte limit.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) { await reader.cancel(); throw pageError("PAGE_TOO_LARGE", `The page exceeds the ${maximumBytes}-byte limit.`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isRedirect(status) { return [301, 302, 303, 307, 308].includes(Number(status)); }
function isSupportedContentType(value) { return !value || /text\/(html|plain|markdown|xml)|application\/(json|xml|xhtml\+xml)/i.test(value); }
function retryDelay(value, attempt) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60000, Math.max(250, seconds * 1000));
  const date = Date.parse(String(value || ""));
  if (Number.isFinite(date)) return Math.min(60000, Math.max(250, date - Date.now()));
  return Math.min(10000, 1000 * (2 ** attempt));
}
function wait(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener?.("abort", () => { clearTimeout(timer); reject(pageError("PAGE_FETCH_ABORTED", "Page retrieval was cancelled.")); }, { once: true });
  });
}
function pageError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { SafePageRetriever, isPrivateAddress, requestPinned, resolvePublicTarget, validatePublicUrl };
