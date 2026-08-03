#!/usr/bin/env node
"use strict";

const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { inspectServerCertificate, getTrustedCertificatesForUrl, normalizeTrustedCertificates } = require("../../ai-companion/core/tls-certificate");

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const REDIRECT_HEADER_POLICIES = new Set(["same-origin", "always", "never"]);
const AUTH_HEADER_NAMES = new Set(["authorization", "proxy-authorization", "cookie"]);
const STANDARD_REDIRECT_HEADER_NAMES = new Set(["accept", "accept-encoding", "accept-language", "cache-control", "content-type", "pragma", "user-agent"]);
const DEFAULT_REQUEST_SETTINGS = Object.freeze({
  autoFollowRedirects: true,
  maxRedirects: 10,
  preserveMethodOnRedirect: false,
  redirectAuthHeaderPolicy: "same-origin",
  redirectCustomHeaderPolicy: "same-origin",
  timeoutMs: 60000,
  sslCertificateVerification: true,
  trustedCertificates: [],
  sendNoCacheHeader: false,
  maxResponseSizeBytes: 52428800,
  responseRenderMode: "auto",
  decompressResponses: true,
  proxyMode: "system",
  proxyUrl: "",
  httpVersion: "auto"
});
const RESPONSE_RENDER_MODES = new Set(["auto", "json", "text", "html", "xml", "binary"]);
const PROXY_MODES = new Set(["system", "custom"]);
const HTTP_VERSIONS = new Set(["auto", "http1.1"]);
const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

/**
 * Execute one API Client request from a base64-encoded JSON payload.
 */
function decodeRequest(encoded) {
  if (!encoded) throw new Error("Missing request payload.");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function writeResult(result) {
  process.stdout.write(JSON.stringify(result));
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (!String(name || "").trim()) continue;
    normalized[String(name).trim()] = String(value ?? "");
  }
  return normalized;
}

function setHeader(headers, name, value) {
  const existingName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());
  headers[existingName || name] = value;
}

function removeHeader(headers, name) {
  const existingName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());
  if (existingName) delete headers[existingName];
}

function normalizeFormData(formData) {
  return (Array.isArray(formData) ? formData : [])
    .map((row) => ({ key: String(row?.key || "").trim(), value: String(row?.value ?? "") }))
    .filter((row) => row.key);
}

function createMultipartBody(formData) {
  const boundary = `----md-editor-api-client-${crypto.randomBytes(12).toString("hex")}`;
  const chunks = [];
  normalizeFormData(formData).forEach((row) => {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${row.key.replace(/"/g, "\\\"")}"\r\n\r\n`));
    chunks.push(Buffer.from(row.value));
    chunks.push(Buffer.from("\r\n"));
  });
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(chunks) };
}

function normalizeRedirectHeaderPolicy(value) {
  const policy = String(value || "").toLowerCase();
  return REDIRECT_HEADER_POLICIES.has(policy) ? policy : "same-origin";
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeHttpProxyUrl(value) {
  try {
    const parsedUrl = new URL(String(value || "").trim());
    return parsedUrl.protocol === "http:" ? parsedUrl.toString() : "";
  } catch (_error) {
    return "";
  }
}

function normalizeRequestSettings(settings, timeoutMs) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const redirectLimit = Number(source.maxRedirects);
  const timeout = Number(source.timeoutMs ?? timeoutMs);
  const maxResponseSizeBytes = Number(source.maxResponseSizeBytes);
  const requestedProxyMode = normalizeEnum(source.proxyMode, PROXY_MODES, DEFAULT_REQUEST_SETTINGS.proxyMode);
  const proxyUrl = requestedProxyMode === "custom" ? normalizeHttpProxyUrl(source.proxyUrl) : "";
  return {
    autoFollowRedirects: source.autoFollowRedirects !== false,
    maxRedirects: Number.isFinite(redirectLimit) ? Math.max(0, Math.min(50, Math.floor(redirectLimit))) : DEFAULT_REQUEST_SETTINGS.maxRedirects,
    preserveMethodOnRedirect: source.preserveMethodOnRedirect === true,
    redirectAuthHeaderPolicy: normalizeRedirectHeaderPolicy(source.redirectAuthHeaderPolicy),
    redirectCustomHeaderPolicy: normalizeRedirectHeaderPolicy(source.redirectCustomHeaderPolicy),
    timeoutMs: Number.isFinite(timeout) ? Math.max(1000, Math.min(timeout, 300000)) : DEFAULT_REQUEST_SETTINGS.timeoutMs,
    sslCertificateVerification: source.sslCertificateVerification !== false,
    trustedCertificates: normalizeTrustedCertificates(source.trustedCertificates),
    sendNoCacheHeader: source.sendNoCacheHeader === true,
    maxResponseSizeBytes: Number.isFinite(maxResponseSizeBytes) ? Math.max(1024, Math.min(1073741824, Math.floor(maxResponseSizeBytes))) : DEFAULT_REQUEST_SETTINGS.maxResponseSizeBytes,
    responseRenderMode: normalizeEnum(source.responseRenderMode, RESPONSE_RENDER_MODES, DEFAULT_REQUEST_SETTINGS.responseRenderMode),
    decompressResponses: source.decompressResponses !== false,
    proxyMode: requestedProxyMode === "custom" && !proxyUrl ? DEFAULT_REQUEST_SETTINGS.proxyMode : requestedProxyMode,
    proxyUrl,
    httpVersion: normalizeEnum(source.httpVersion, HTTP_VERSIONS, DEFAULT_REQUEST_SETTINGS.httpVersion)
  };
}

function validateRequest(request) {
  const method = String(request.method || "GET").toUpperCase();
  const parsedUrl = new URL(String(request.url || ""));
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  const requestedBodyMode = String(request.bodyMode || "raw").toLowerCase();
  const bodyMode = ["none", "form-data", "raw"].includes(requestedBodyMode) ? requestedBodyMode : "raw";
  const requestSettings = normalizeRequestSettings(request.requestSettings, request.timeoutMs);
  return {
    method,
    url: parsedUrl,
    headers: normalizeHeaders(request.headers),
    bodyMode,
    body: String(request.body || ""),
    formData: normalizeFormData(request.formData),
    timeoutMs: requestSettings.timeoutMs,
    requestSettings
  };
}

function collectResponseBody(response, maxBytes = DEFAULT_REQUEST_SETTINGS.maxResponseSizeBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let failed = false;
    function fail(error) {
      if (failed) return;
      failed = true;
      reject(error);
    }
    response.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        fail(new Error("Response exceeded the configured maximum size."));
        response.destroy();
        return;
      }
      chunks.push(buffer);
    });
    response.on("error", fail);
    response.on("end", () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
  });
}

async function decodeResponseBody(buffer, headers, settings) {
  if (!settings.decompressResponses || !buffer?.length) return buffer;
  const encoding = String(getHeaderValue(headers, "content-encoding") || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean).pop();
  if (encoding === "gzip" || encoding === "x-gzip") return gunzip(buffer);
  if (encoding === "deflate") return inflate(buffer);
  if (encoding === "br") return brotliDecompress(buffer);
  return buffer;
}

function methodAllowsRequestBody(method) {
  return method !== "GET" && method !== "HEAD";
}

function createRequestBody(request, headers) {
  if (!methodAllowsRequestBody(request.method)) return null;
  if (request.bodyMode === "form-data") {
    const multipart = createMultipartBody(request.formData);
    setHeader(headers, "Content-Type", `multipart/form-data; boundary=${multipart.boundary}`);
    setHeader(headers, "Content-Length", String(multipart.body.length));
    return multipart.body;
  }
  if (request.bodyMode === "raw" && request.body) {
    const body = Buffer.from(request.body);
    setHeader(headers, "Content-Length", String(body.length));
    return body;
  }
  return null;
}

function getHeaderValue(headers, name) {
  const headerName = Object.keys(headers || {}).find((key) => key.toLowerCase() === name.toLowerCase());
  return headerName ? headers[headerName] : "";
}

function isSameOrigin(leftUrl, rightUrl) {
  return leftUrl.protocol === rightUrl.protocol && leftUrl.host === rightUrl.host;
}

function shouldStripHeader(policy, sameOrigin) {
  return policy === "never" || (policy === "same-origin" && !sameOrigin);
}

function filterRedirectHeaders(headers, fromUrl, toUrl, settings, nextMethod) {
  const sameOrigin = isSameOrigin(fromUrl, toUrl);
  const nextHeaders = { ...headers };
  removeHeader(nextHeaders, "Host");
  removeHeader(nextHeaders, "Content-Length");
  if (!methodAllowsRequestBody(nextMethod)) removeHeader(nextHeaders, "Content-Type");
  for (const name of Object.keys(nextHeaders)) {
    const lowerName = name.toLowerCase();
    if (AUTH_HEADER_NAMES.has(lowerName) && shouldStripHeader(settings.redirectAuthHeaderPolicy, sameOrigin)) {
      delete nextHeaders[name];
      continue;
    }
    if (!AUTH_HEADER_NAMES.has(lowerName) && !STANDARD_REDIRECT_HEADER_NAMES.has(lowerName) && shouldStripHeader(settings.redirectCustomHeaderPolicy, sameOrigin)) {
      delete nextHeaders[name];
    }
  }
  return nextHeaders;
}

function getRedirectMethod(statusCode, request) {
  if (statusCode === 303) return "GET";
  if ((statusCode === 301 || statusCode === 302) && !request.requestSettings.preserveMethodOnRedirect) return "GET";
  return request.method;
}

function createRedirectRequest(request, response) {
  const statusCode = Number(response.statusCode || 0);
  const location = String(getHeaderValue(response.headers, "location") || "").trim();
  const nextUrl = new URL(location, request.url);
  if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") throw new Error("Redirect target must use HTTP or HTTPS.");
  const nextMethod = getRedirectMethod(statusCode, request);
  return {
    ...request,
    method: nextMethod,
    url: nextUrl,
    headers: filterRedirectHeaders(request.headers, request.url, nextUrl, request.requestSettings, nextMethod),
    bodyMode: methodAllowsRequestBody(nextMethod) ? request.bodyMode : "none",
    body: methodAllowsRequestBody(nextMethod) ? request.body : "",
    formData: methodAllowsRequestBody(nextMethod) ? request.formData : []
  };
}

function isRedirectResponse(request, response) {
  if (!request.requestSettings.autoFollowRedirects) return false;
  if (!REDIRECT_STATUS_CODES.has(Number(response.statusCode || 0))) return false;
  return Boolean(String(getHeaderValue(response.headers, "location") || "").trim());
}

function createTransportRequestTarget(request, headers) {
  const useHttpProxy = request.requestSettings.proxyMode === "custom" && request.requestSettings.proxyUrl && request.url.protocol === "http:";
  if (useHttpProxy) {
    const proxyUrl = new URL(request.requestSettings.proxyUrl);
    if (!getHeaderValue(headers, "Host")) setHeader(headers, "Host", request.url.host);
    return {
      transport: http,
      url: proxyUrl,
      options: {
        method: request.method,
        path: request.url.toString(),
        headers,
        timeout: request.timeoutMs
      }
    };
  }
  const options = {
    method: request.method,
    headers,
    timeout: request.timeoutMs
  };
  if (request.url.protocol === "https:") {
    options.rejectUnauthorized = request.requestSettings.sslCertificateVerification !== false;
    if (options.rejectUnauthorized) {
      const trustedCertificates = getTrustedCertificatesForUrl(request.requestSettings.trustedCertificates, request.url);
      if (trustedCertificates.length) options.ca = trustedCertificates.map((certificate) => certificate.pem).filter(Boolean).join("\n");
    }
  }
  return {
    transport: request.url.protocol === "https:" ? https : http,
    url: request.url,
    options
  };
}

function sendRequestHop(request, startedAt) {
  const requestHeaders = { ...request.headers };
  if (request.requestSettings.sendNoCacheHeader) {
    if (!getHeaderValue(requestHeaders, "Cache-Control")) setHeader(requestHeaders, "Cache-Control", "no-cache");
    if (!getHeaderValue(requestHeaders, "Pragma")) setHeader(requestHeaders, "Pragma", "no-cache");
  }
  const requestBody = createRequestBody(request, requestHeaders);
  const target = createTransportRequestTarget(request, requestHeaders);
  return new Promise((resolve, reject) => {
    const clientRequest = target.transport.request(target.url, target.options, async (response) => {
      try {
        const rawBodyBuffer = await collectResponseBody(response, request.requestSettings.maxResponseSizeBytes);
        const bodyBuffer = await decodeResponseBody(rawBodyBuffer, response.headers || {}, request.requestSettings);
        resolve({
          ok: true,
          elapsedMs: Date.now() - startedAt,
          response: {
            statusCode: response.statusCode || 0,
            statusMessage: response.statusMessage || "",
            headers: response.headers || {},
            body: bodyBuffer.toString("utf8"),
            sizeBytes: bodyBuffer.length
          }
        });
      } catch (error) {
        reject(error);
      }
    });
    clientRequest.on("timeout", () => {
      clientRequest.destroy(new Error("Request timed out."));
    });
    clientRequest.on("error", reject);
    if (requestBody) clientRequest.write(requestBody);
    clientRequest.end();
  });
}

async function sendRequest(rawRequest) {
  let request = validateRequest(rawRequest);
  const startedAt = Date.now();
  const redirects = [];
  while (true) {
    const result = await sendRequestHop(request, startedAt);
    if (!isRedirectResponse(request, result.response) || redirects.length >= request.requestSettings.maxRedirects) {
      return { ...result, redirects, finalUrl: request.url.toString() };
    }
    const location = String(getHeaderValue(result.response.headers, "location") || "").trim();
    redirects.push({
      method: request.method,
      url: request.url.toString(),
      statusCode: result.response.statusCode || 0,
      statusMessage: result.response.statusMessage || "",
      location
    });
    request = createRedirectRequest(request, result.response);
  }
}

async function main() {
  try {
    const request = decodeRequest(process.argv[2]);
    if (request?.action === "inspectCertificate") {
      writeResult({ ok: true, certificate: await inspectServerCertificate(request.url) });
      return;
    }
    writeResult(await sendRequest(request));
  } catch (error) {
    writeResult({
      ok: false,
      error: {
        message: error?.message || String(error || "Request failed."),
        code: error?.code || "",
        cause: error?.cause ? {
          name: error.cause.name || "",
          message: error.cause.message || "",
          code: error.cause.code || ""
        } : null
      }
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = { normalizeHeaders, validateRequest, normalizeFormData, createMultipartBody, normalizeRequestSettings, sendRequest };