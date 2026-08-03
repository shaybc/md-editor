(function(global, document) {
  "use strict";

  const API_CLIENT_BRIDGE_PATH = "resources/bridges/api-client-bridge/api-client-bridge.cjs";
  const REQUEST_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
  const DEFAULT_HEADERS_TEXT = "Content-Type: application/json";
  const DEFAULT_RECENT_HISTORY_LIMIT = 50;
  const RESPONSE_RENDER_MODES = new Set(["auto", "json", "text", "html", "xml", "binary"]);
  const DEFAULT_REQUEST_SETTINGS = Object.freeze({
    autoFollowRedirects: true,
    maxRedirects: 10,
    preserveMethodOnRedirect: false,
    redirectAuthHeaderPolicy: "same-origin",
    redirectCustomHeaderPolicy: "same-origin",
    timeoutMs: 60000,
    sslCertificateVerification: true,
    trustedCertificates: [],
    cookieJarEnabled: true,
    sendNoCacheHeader: false,
    maxResponseSizeBytes: 52428800,
    responseRenderMode: "auto",
    decompressResponses: true,
    proxyMode: "system",
    proxyUrl: "",
    httpVersion: "auto"
  });
  const REDIRECT_HEADER_POLICIES = new Set(["same-origin", "always", "never"]);
  const PROXY_MODES = new Set(["system", "custom"]);
  const HTTP_VERSIONS = new Set(["auto", "http1.1"]);
  const ROOT_ID = "root";

  /**
   * Owns the API Client tab UI, request validation, saved collections, and desktop bridge calls.
   */
  function registerMarkdownViewerApiClient(app, deps = {}) {
    const apiClientViews = new Map();
    const alertUser = deps.alert || function(message) { global.alert?.(message); };
    const storage = global.registerMarkdownViewerApiClientStorage
      ? global.registerMarkdownViewerApiClientStorage(app, {
        getProfileDataFilePath: deps.getProfileDataFilePath,
        get Neutralino() { return getNeutralino(); },
        localStorage: deps.localStorage || global.localStorage
      })
      : null;
    const sidebar = global.registerMarkdownViewerApiClientSidebar ? global.registerMarkdownViewerApiClientSidebar(app) : null;
    const codeSnippets = global.registerMarkdownViewerApiClientCodeSnippets ? global.registerMarkdownViewerApiClientCodeSnippets(app) : null;
    const splitPane = global.registerMarkdownViewerApiClientSplitPane ? global.registerMarkdownViewerApiClientSplitPane(app, { document }) : null;
    let savedCollection = storage?.createDefaultCollection?.() || { version: 1, root: { id: ROOT_ID, type: "folder", name: "Saved Requests", children: [] } };
    let selectedNodeId = ROOT_ID;
    let selectedNodeIds = new Set();
    let selectedHistoryEntryKeys = new Set();
    let historyEntryKeySequence = 0;
    let activeApiClientTabId = null;
    let previousSidebarView = null;
    let collectionsLoaded = false;
    let environmentsLoaded = false;
    let recentHistoryLoaded = false;
    let recentHistory = [];
    let environmentsDocument = storage?.createDefaultEnvironments?.() || { version: 1, activeEnvironmentId: "", globals: [], environments: [] };
    let cookiesDocument = storage?.createDefaultCookies?.() || { version: 1, domains: [] };
    let cookiesLoaded = false;

    function selectOnlySavedNode(nodeId) {
      selectedNodeId = String(nodeId || ROOT_ID);
      selectedNodeIds = new Set(selectedNodeId === ROOT_ID ? [] : [selectedNodeId]);
    }

    function ensureHistoryEntryKeys(entries, retainedKeys = []) {
      (entries || []).forEach((entry, index) => {
        if (!entry || entry.historyEntryKey) return;
        historyEntryKeySequence += 1;
        entry.historyEntryKey = retainedKeys[index] || `history-${Date.now()}-${historyEntryKeySequence}`;
      });
      return entries;
    }

    function createElement(tagName, className, textContent) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (textContent !== undefined) element.textContent = textContent;
      return element;
    }

    function getRecentHistoryLimit() {
      const configuredLimit = Number(typeof deps.getRecentHistoryLimit === "function" ? deps.getRecentHistoryLimit() : DEFAULT_RECENT_HISTORY_LIMIT);
      if (!Number.isFinite(configuredLimit)) return DEFAULT_RECENT_HISTORY_LIMIT;
      return Math.max(0, Math.min(500, Math.floor(configuredLimit)));
    }

    function normalizeRedirectHeaderPolicy(value) {
      const policy = String(value || "").toLowerCase();
      return REDIRECT_HEADER_POLICIES.has(policy) ? policy : DEFAULT_REQUEST_SETTINGS.redirectAuthHeaderPolicy;
    }

    function normalizeEnum(value, allowedValues, fallback) {
      const normalized = String(value || "").trim().toLowerCase();
      return allowedValues.has(normalized) ? normalized : fallback;
    }

    function normalizeRequestSettings(value) {
      const settings = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const maxRedirects = Number(settings.maxRedirects);
      const timeoutMs = Number(settings.timeoutMs);
      const maxResponseSizeBytes = Number(settings.maxResponseSizeBytes);
      return {
        autoFollowRedirects: settings.autoFollowRedirects !== false,
        maxRedirects: Number.isFinite(maxRedirects) ? Math.max(0, Math.min(50, Math.floor(maxRedirects))) : DEFAULT_REQUEST_SETTINGS.maxRedirects,
        preserveMethodOnRedirect: settings.preserveMethodOnRedirect === true,
        redirectAuthHeaderPolicy: normalizeRedirectHeaderPolicy(settings.redirectAuthHeaderPolicy),
        redirectCustomHeaderPolicy: normalizeRedirectHeaderPolicy(settings.redirectCustomHeaderPolicy),
        timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(300000, Math.floor(timeoutMs))) : DEFAULT_REQUEST_SETTINGS.timeoutMs,
        sslCertificateVerification: settings.sslCertificateVerification !== false,
        trustedCertificates: normalizeTrustedCertificates(settings.trustedCertificates),
        cookieJarEnabled: settings.cookieJarEnabled !== false,
        sendNoCacheHeader: settings.sendNoCacheHeader === true,
        maxResponseSizeBytes: Number.isFinite(maxResponseSizeBytes) ? Math.max(1024, Math.min(1073741824, Math.floor(maxResponseSizeBytes))) : DEFAULT_REQUEST_SETTINGS.maxResponseSizeBytes,
        responseRenderMode: normalizeEnum(settings.responseRenderMode, RESPONSE_RENDER_MODES, DEFAULT_REQUEST_SETTINGS.responseRenderMode),
        decompressResponses: settings.decompressResponses !== false,
        proxyMode: normalizeEnum(settings.proxyMode, PROXY_MODES, DEFAULT_REQUEST_SETTINGS.proxyMode),
        proxyUrl: String(settings.proxyUrl || "").trim(),
        httpVersion: normalizeEnum(settings.httpVersion, HTTP_VERSIONS, DEFAULT_REQUEST_SETTINGS.httpVersion)
      };
    }

    function getRequestSettings() {
      return normalizeRequestSettings(typeof deps.getRequestSettings === "function" ? deps.getRequestSettings() : DEFAULT_REQUEST_SETTINGS);
    }

    function normalizeTrustedCertificates(value) {
      return (Array.isArray(value) ? value : [])
        .map((certificate) => ({
          host: String(certificate?.host || "").trim().toLowerCase(),
          port: String(certificate?.port || "443").trim() || "443",
          fingerprint256: String(certificate?.fingerprint256 || "").trim(),
          subject: certificate?.subject || null,
          issuer: certificate?.issuer || null,
          validFrom: String(certificate?.validFrom || ""),
          validTo: String(certificate?.validTo || ""),
          serialNumber: String(certificate?.serialNumber || ""),
          pem: String(certificate?.pem || "").trim()
        }))
        .filter((certificate) => certificate.host && certificate.fingerprint256 && certificate.pem);
    }

    function mergeTrustedCertificates(existingCertificates, inspection) {
      const certificates = new Map();
      normalizeTrustedCertificates(existingCertificates).forEach((certificate) => {
        certificates.set(`${certificate.host}:${certificate.port}:${certificate.fingerprint256}`, certificate);
      });
      const host = String(inspection?.host || "").trim().toLowerCase();
      const port = String(inspection?.port || "443").trim() || "443";
      (Array.isArray(inspection?.certificates) ? inspection.certificates : []).forEach((certificate) => {
        const normalized = normalizeTrustedCertificates([{ ...certificate, host, port }])[0];
        if (normalized) certificates.set(`${normalized.host}:${normalized.port}:${normalized.fingerprint256}`, normalized);
      });
      return Array.from(certificates.values());
    }

    const TLS_CERTIFICATE_ERROR_CODES = new Set([
      "SELF_SIGNED_CERT_IN_CHAIN",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "CERT_UNTRUSTED",
      "CERT_HAS_EXPIRED"
    ]);

    function isCertificateTrustError(error) {
      const code = String(error?.code || error?.cause?.code || "");
      if (TLS_CERTIFICATE_ERROR_CODES.has(code)) return true;
      const message = `${error?.message || ""} ${error?.cause?.message || ""}`;
      return /SELF_SIGNED_CERT|self-signed certificate|unable to verify|certificate has expired|unable to get local issuer certificate/i.test(message);
    }

    function getApiClientCertificateUrl(payload) {
      try {
        const parsedUrl = new URL(String(payload?.url || ""));
        return parsedUrl.protocol === "https:" ? parsedUrl.toString() : "";
      } catch (_error) {
        return "";
      }
    }

    function appendCertificateDetailRow(parent, label, value) {
      const row = createElement("div");
      const labelElement = createElement("strong");
      labelElement.textContent = `${label}: `;
      row.append(labelElement, document.createTextNode(String(value || "")));
      parent.appendChild(row);
    }

    function applyCertificateTrustDialogLayout(body) {
      const dialog = body?.closest?.(".app-notification-box");
      if (dialog) dialog.style.width = "min(760px, calc(100vw - 32px))";
    }

    function renderCertificateTrustBody(body, inspection) {
      applyCertificateTrustDialogLayout(body);
      const certificates = Array.isArray(inspection?.certificates) ? inspection.certificates : [];
      const summary = createElement("div", "settings-help-text", "Only trust this certificate if you recognize the host and fingerprint. The certificate will be trusted only by MD-Editor API Client requests for this host.");
      body.appendChild(summary);
      certificates.forEach((certificate, index) => {
        const section = createElement("div", "settings-certificate-section");
        appendCertificateDetailRow(section, index === 0 ? "Certificate" : `Chain certificate ${index + 1}`, `${inspection?.host || ""}:${inspection?.port || "443"}`);
        appendCertificateDetailRow(section, "Subject", certificate.subject?.CN || certificate.subject?.O || JSON.stringify(certificate.subject || {}));
        appendCertificateDetailRow(section, "Issuer", certificate.issuer?.CN || certificate.issuer?.O || JSON.stringify(certificate.issuer || {}));
        appendCertificateDetailRow(section, "Valid", `${certificate.validFrom || ""} - ${certificate.validTo || ""}`);
        appendCertificateDetailRow(section, "SHA-256", certificate.fingerprint256 || "");
        body.appendChild(section);
      });
      const pem = createElement("textarea", "settings-textarea");
      pem.readOnly = true;
      pem.rows = 8;
      pem.style.width = "95%";
      pem.style.maxWidth = "95%";
      pem.style.boxSizing = "border-box";
      pem.value = certificates.map((certificate) => certificate.pem).join("\n");
      body.appendChild(pem);
    }

    async function inspectApiClientCertificate(url, view) {
      if (typeof deps.inspectCertificate === "function") return deps.inspectCertificate({ url });
      const result = await runBridgeRequest({ action: "inspectCertificate", url }, view);
      return result?.certificate || result;
    }

    async function promptTrustApiClientCertificate(payload, error, view) {
      if (!payload?.requestSettings?.sslCertificateVerification || !isCertificateTrustError(error)) return null;
      const url = getApiClientCertificateUrl(payload);
      if (!url) return null;
      const notify = deps.notify || app.services?.notify;
      if (!notify?.show) return null;
      let inspection;
      try {
        inspection = await inspectApiClientCertificate(url, view);
      } catch (_inspectError) {
        return null;
      }
      if (!Array.isArray(inspection?.certificates) || !inspection.certificates.length) return null;
      const decision = await notify.show({
        title: "Trust API Client certificate?",
        message: `The API Client received a certificate that Node does not currently trust. Trust it for ${inspection.host}:${inspection.port}?`,
        dismissValue: "cancel",
        renderBody: (body) => renderCertificateTrustBody(body, inspection),
        buttons: [
          { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
          { id: "trust", label: "Trust and retry", value: "trust", variant: "primary", autoFocus: true }
        ]
      });
      if (decision !== "trust") return null;
      const trustedCertificates = mergeTrustedCertificates(payload.requestSettings.trustedCertificates, inspection);
      const updatedSettings = normalizeRequestSettings({ ...payload.requestSettings, trustedCertificates });
      if (typeof deps.saveRequestSettings === "function") await deps.saveRequestSettings(updatedSettings);
      return updatedSettings;
    }

    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function isDesktopRuntime() {
      return Boolean(deps.isNeutralinoRuntime?.() && getNeutralino()?.os?.spawnProcess);
    }

    function methodAllowsBody(method) {
      return METHODS_WITH_BODY.has(String(method || "GET").toUpperCase());
    }

    /**
     * Parse one-header-per-line text into a plain request header object.
     */
    function parseHeaderLines(headerText) {
      const headers = {};
      const lines = String(headerText || "").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const separatorIndex = trimmed.indexOf(":");
        if (separatorIndex <= 0) throw new Error(`Invalid header line: ${trimmed}`);
        const name = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        if (!name) throw new Error(`Invalid header line: ${trimmed}`);
        headers[name] = value;
      }
      return headers;
    }


    function createCookieJarId(prefix) {
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeCookieManagerDocument(document) {
      if (storage?.normalizeCookiesDocument) return storage.normalizeCookiesDocument(document);
      return {
        version: 1,
        domains: (Array.isArray(document?.domains) ? document.domains : []).map((domain) => ({
          id: String(domain?.id || createCookieJarId("cookie_domain")),
          domain: normalizeCookieDomainName(domain?.domain || domain?.name),
          cookies: (Array.isArray(domain?.cookies) ? domain.cookies : []).map((cookie) => ({
            id: String(cookie?.id || createCookieJarId("cookie")),
            name: String(cookie?.name || "").trim(),
            value: String(cookie?.value ?? ""),
            path: String(cookie?.path || "/") || "/",
            expires: String(cookie?.expires || ""),
            secure: cookie?.secure === true,
            httpOnly: cookie?.httpOnly === true,
            sameSite: ["lax", "strict", "none"].includes(String(cookie?.sameSite || "").toLowerCase()) ? String(cookie.sameSite).toLowerCase() : "",
            enabled: cookie?.enabled !== false
          })).filter((cookie) => cookie.name)
        })).filter((domain) => domain.domain)
      };
    }

    function normalizeCookieDomainName(value) {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      try {
        return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^\.+|\.+$/g, "");
      } catch (_error) {
        return raw.split("/")[0].split(":")[0].replace(/^\.+|\.+$/g, "");
      }
    }

    function cookieDomainMatches(hostname, cookieDomain) {
      const host = String(hostname || "").toLowerCase();
      const domain = normalizeCookieDomainName(cookieDomain);
      return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
    }

    function cookiePathMatches(pathname, cookiePath) {
      const requestPath = String(pathname || "/") || "/";
      const path = String(cookiePath || "/") || "/";
      return path === "/" || requestPath === path || requestPath.startsWith(path.endsWith("/") ? path : `${path}/`);
    }

    function isCookieExpired(cookie, now = Date.now()) {
      if (!cookie?.expires) return false;
      const expiresAt = Date.parse(cookie.expires);
      return Number.isFinite(expiresAt) && expiresAt <= now;
    }

    function parseCookieHeaderNames(value) {
      const names = new Set();
      String(value || "").split(";").forEach((part) => {
        const separatorIndex = part.indexOf("=");
        const name = (separatorIndex >= 0 ? part.slice(0, separatorIndex) : part).trim();
        if (name) names.add(name);
      });
      return names;
    }

    function findHeaderKey(headers, headerName) {
      const expected = String(headerName || "").toLowerCase();
      return Object.keys(headers || {}).find((key) => key.toLowerCase() === expected) || "";
    }

    function getMatchingCookiePairs(url, document) {
      const parsedUrl = new URL(url);
      const cookieDocument = normalizeCookieManagerDocument(document || cookiesDocument);
      const pairs = [];
      for (const domain of cookieDocument.domains || []) {
        if (!cookieDomainMatches(parsedUrl.hostname, domain.domain)) continue;
        for (const cookie of domain.cookies || []) {
          if (cookie.enabled === false || !cookie.name) continue;
          if (cookie.secure === true && parsedUrl.protocol !== "https:") continue;
          if (isCookieExpired(cookie)) continue;
          if (!cookiePathMatches(parsedUrl.pathname || "/", cookie.path)) continue;
          pairs.push({ name: cookie.name, value: cookie.value || "" });
        }
      }
      return pairs;
    }

    function applyNoCacheHeaders(headers) {
      const nextHeaders = { ...(headers || {}) };
      if (!findHeaderKey(nextHeaders, "Cache-Control")) nextHeaders["Cache-Control"] = "no-cache";
      if (!findHeaderKey(nextHeaders, "Pragma")) nextHeaders.Pragma = "no-cache";
      return nextHeaders;
    }

    function applyCookieJarToHeaders(headers, url, document) {
      const nextHeaders = { ...(headers || {}) };
      const cookieHeaderKey = findHeaderKey(nextHeaders, "Cookie");
      const existingCookieHeader = cookieHeaderKey ? String(nextHeaders[cookieHeaderKey] || "") : "";
      const existingNames = parseCookieHeaderNames(existingCookieHeader);
      const jarPairs = getMatchingCookiePairs(url, document)
        .filter((cookie) => !existingNames.has(cookie.name))
        .map((cookie) => `${cookie.name}=${cookie.value}`);
      if (!jarPairs.length) return nextHeaders;
      const key = cookieHeaderKey || "Cookie";
      nextHeaders[key] = existingCookieHeader ? `${existingCookieHeader}; ${jarPairs.join("; ")}` : jarPairs.join("; ");
      return nextHeaders;
    }

    function getCookieJarHeaderValue(url, headers, document) {
      try {
        const cookieHeaderKey = findHeaderKey(headers || {}, "Cookie");
        const existingCookieHeader = cookieHeaderKey ? String(headers[cookieHeaderKey] || "") : "";
        const existingNames = parseCookieHeaderNames(existingCookieHeader);
        return getMatchingCookiePairs(url, document)
          .filter((cookie) => !existingNames.has(cookie.name))
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; ");
      } catch (_error) {
        return "";
      }
    }

    function getGeneratedCookieHeaderRow(view) {
      try {
        const snapshot = resolveRequestSnapshot(createRequestSnapshot(view), view?.environmentsDocument || environmentsDocument);
        const url = String(snapshot.url || "").trim();
        if (!url) return null;
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return null;
        const headers = parseHeaderLines(snapshot.headersText);
        if (!getRequestSettings().cookieJarEnabled) return null;
        const value = getCookieJarHeaderValue(url, headers, view?.cookiesDocument || cookiesDocument);
        return value ? { enabled: false, key: "Cookie", value, generated: true } : null;
      } catch (_error) {
        return null;
      }
    }

    function refreshGeneratedHeaderRows(view) {
      if (view?.headersTable && view?.headersInput && view.headersTable.hidden !== true) renderEditableKeyValueTable(view, "headers");
    }
    function parseKeyValueLines(text, options = {}) {
      const separators = options.separators || [":", "="];
      const rows = [];
      String(text || "").split(/\r?\n/).forEach((line) => {
        const original = String(line || "");
        const trimmed = original.trim();
        if (!trimmed) return;
        const enabled = !trimmed.startsWith("//");
        const content = enabled ? trimmed : trimmed.slice(2).trim();
        let separatorIndex = -1;
        for (const separator of separators) {
          const index = content.indexOf(separator);
          if (index > 0 && (separatorIndex < 0 || index < separatorIndex)) separatorIndex = index;
        }
        if (separatorIndex < 0) {
          rows.push({ enabled, key: content, value: "" });
          return;
        }
        rows.push({
          enabled,
          key: content.slice(0, separatorIndex).trim(),
          value: content.slice(separatorIndex + 1).trim()
        });
      });
      return rows.filter((row) => row.key || row.value);
    }

    function serializeKeyValueRows(rows, separator = ": ") {
      return (rows || [])
        .filter((row) => row?.key || row?.value)
        .map((row) => `${row.enabled === false ? "//" : ""}${String(row.key || "").trim()}${separator}${String(row.value || "").trim()}`)
        .join("\n");
    }

    function getParamsTextFromUrl(url) {
      try {
        const parsedUrl = new URL(String(url || ""));
        return Array.from(parsedUrl.searchParams.entries()).map(([key, value]) => `${key}:${value}`).join("\n");
      } catch (_error) {
        return "";
      }
    }

    function applyParamsTextToUrl(url, paramsText) {
      const text = String(url || "").trim();
      const parsedUrl = new URL(text || "http://placeholder.local");
      parsedUrl.search = "";
      parseKeyValueLines(paramsText).forEach((row) => {
        if (row.enabled !== false && row.key) parsedUrl.searchParams.append(row.key, row.value || "");
      });
      if (text) return parsedUrl.toString();
      return "";
    }

    function normalizeBodyMode(method, bodyMode, bodyText, formDataText) {
      if (!methodAllowsBody(method)) return "none";
      const requestedMode = String(bodyMode || "").trim().toLowerCase();
      if (["none", "form-data", "raw", "json"].includes(requestedMode)) return requestedMode;
      if (String(formDataText || "").trim()) return "form-data";
      if (String(bodyText || "").trim()) return "raw";
      return "none";
    }

    function getResponseSizeBytes(body) {
      const text = String(body || "");
      if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
      return unescape(encodeURIComponent(text)).length;
    }

    function formatByteSize(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(size >= 10 * 1024 ? 0 : 1)} KB`;
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }

    function getHeaderEntries(headers) {
      return Object.entries(headers || {}).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value ?? "")]);
    }

    function getHeaderValue(headers, headerName) {
      const expectedName = String(headerName || "").toLowerCase();
      const match = Object.entries(headers || {}).find(([name]) => String(name).toLowerCase() === expectedName);
      return match ? match[1] : null;
    }

    function parseCookies(headers) {
      const value = getHeaderValue(headers, "set-cookie");
      const values = Array.isArray(value) ? value : value ? [value] : [];
      return values.map((cookieText) => {
        const [pair, ...attributes] = String(cookieText || "").split(";");
        const separatorIndex = pair.indexOf("=");
        return {
          name: separatorIndex >= 0 ? pair.slice(0, separatorIndex).trim() : pair.trim(),
          value: separatorIndex >= 0 ? pair.slice(separatorIndex + 1).trim() : "",
          attributes: attributes.map((part) => part.trim()).filter(Boolean).join("; ")
        };
      }).filter((cookie) => cookie.name);
    }
    /**
     * Format a response body for display, pretty-printing JSON when possible.
     */
    function formatResponseBody(body, contentType) {
      const text = String(body || "");
      const type = String(contentType || "").toLowerCase();
      if (!text) return "";
      if (type.includes("json") || /^[\s\r\n]*[{[]/.test(text)) {
        try {
          return JSON.stringify(JSON.parse(text), null, 2);
        } catch (_error) {
          return text;
        }
      }
      return text;
    }

    function normalizeResponseRenderMode(value, contentType) {
      const requestedMode = String(value || "").trim().toLowerCase();
      const type = String(contentType || "").toLowerCase();
      if (requestedMode && requestedMode !== "auto" && RESPONSE_RENDER_MODES.has(requestedMode)) return requestedMode;
      if (type.includes("json")) return "json";
      if (type.includes("html")) return "html";
      if (type.includes("xml")) return "xml";
      if (type.includes("octet-stream") || type.includes("application/pdf") || type.includes("image/") || type.includes("audio/") || type.includes("video/")) return "binary";
      return "text";
    }

    function formatXmlResponseBody(body) {
      const text = String(body || "");
      if (!text.trim()) return "";
      try {
        const parser = typeof global.DOMParser === "function" ? new global.DOMParser() : null;
        const serializer = typeof global.XMLSerializer === "function" ? new global.XMLSerializer() : null;
        if (parser && serializer) {
          const parsedDocument = parser.parseFromString(text, "application/xml");
          if (!parsedDocument.querySelector?.("parsererror")) return prettyPrintXmlText(serializer.serializeToString(parsedDocument));
        }
      } catch (_error) {
      }
      return prettyPrintXmlText(text);
    }

    function prettyPrintXmlText(text) {
      const source = String(text || "").replace(/>\s*</g, "><").replace(/(>)(<)(\/*)/g, "$1\n$2$3");
      let depth = 0;
      return source.split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (/^<\//.test(trimmed)) depth = Math.max(0, depth - 1);
        const formatted = `${"  ".repeat(depth)}${trimmed}`;
        if (/^<[^!?/][^>]*[^/]>\s*$/.test(trimmed) && !/^<([^>\s]+)[^>]*>.*<\/\1>$/.test(trimmed)) depth += 1;
        return formatted;
      }).filter(Boolean).join("\n");
    }

    function formatBinaryResponseBody(body) {
      const text = String(body || "");
      if (!text) return "";
      const bytes = typeof TextEncoder !== "undefined"
        ? Array.from(new TextEncoder().encode(text))
        : Array.from(unescape(encodeURIComponent(text))).map((character) => character.charCodeAt(0));
      const lines = [];
      for (let index = 0; index < bytes.length; index += 16) {
        const chunk = bytes.slice(index, index + 16);
        const offset = index.toString(16).padStart(8, "0");
        const hex = chunk.map((byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
        const ascii = chunk.map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".").join("");
        lines.push(`${offset}  ${hex}  ${ascii}`);
        if (lines.length >= 256 && bytes.length > index + 16) {
          lines.push(`... ${bytes.length - index - 16} more bytes`);
          break;
        }
      }
      return lines.join("\n");
    }

    function formatResponsePreviewBody(body, contentType, mode) {
      const renderMode = normalizeResponseRenderMode(mode, contentType);
      if (renderMode === "json") return formatResponseBody(body, "application/json");
      if (renderMode === "xml") return formatXmlResponseBody(body);
      if (renderMode === "binary") return formatBinaryResponseBody(body);
      return String(body || "");
    }
    function normalizeRequestSnapshot(source) {
      const method = String(source?.method || "GET").toUpperCase();
      const allowsBody = methodAllowsBody(method);
      const bodyText = allowsBody ? String(source?.bodyText || "") : "";
      const formDataText = allowsBody ? String(source?.formDataText || "") : "";
      const bodyMode = normalizeBodyMode(method, source?.bodyMode, bodyText, formDataText);
      return {
        method,
        url: String(source?.url || ""),
        paramsText: String(source?.paramsText ?? getParamsTextFromUrl(source?.url || "")),
        headersText: String(source?.headersText || ""),
        bodyMode,
        bodyText,
        formDataText
      };
    }

    function getSelectedBodyMode(view) {
      const checked = Array.from(view.bodyModeInputs || []).find((input) => input.checked);
      return checked?.value || normalizeBodyMode(view.methodSelect?.value, view.bodyMode, view.bodyInput?.value || "", view.formDataInput?.value || "");
    }

    function createRequestSnapshot(view) {
      return normalizeRequestSnapshot({
        method: view.methodSelect.value,
        url: view.urlInput.value,
        paramsText: view.paramsInput?.value || "",
        headersText: view.headersInput.value,
        bodyMode: getSelectedBodyMode(view),
        bodyText: view.bodyInput.value,
        formDataText: view.formDataInput?.value || ""
      });
    }

    function getVariableValue(variable) {
      const currentValue = String(variable?.currentValue ?? "");
      if (currentValue) return currentValue;
      return String(variable?.initialValue ?? "");
    }

    function addVariablesToMap(map, variables) {
      (variables || []).forEach((variable) => {
        if (variable?.enabled === false) return;
        const key = String(variable?.key || "").trim();
        if (!key) return;
        map.set(key, getVariableValue(variable));
      });
    }

    function createVariableMap(documentState) {
      const map = new Map();
      const state = documentState || environmentsDocument;
      addVariablesToMap(map, state?.globals || []);
      const activeEnvironment = (state?.environments || []).find((environment) => environment.id === state?.activeEnvironmentId);
      addVariablesToMap(map, activeEnvironment?.variables || []);
      return map;
    }

    function resolveEnvironmentVariables(text, documentState) {
      const source = String(text || "");
      if (!source.includes("{{")) return source;
      const variables = createVariableMap(documentState);
      return source.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, name) => {
        const key = String(name || "").trim();
        if (!variables.has(key) || variables.get(key) === "") throw new Error("Unresolved variable: " + key);
        return variables.get(key);
      });
    }

    function resolveRequestSnapshot(snapshot, documentState) {
      return {
        ...snapshot,
        url: resolveEnvironmentVariables(snapshot.url, documentState),
        paramsText: resolveEnvironmentVariables(snapshot.paramsText, documentState),
        headersText: resolveEnvironmentVariables(snapshot.headersText, documentState),
        bodyText: resolveEnvironmentVariables(snapshot.bodyText, documentState),
        formDataText: resolveEnvironmentVariables(snapshot.formDataText, documentState)
      };
    }
    function syncViewToTabState(view) {
      if (!view?.tab) return;
      view.tab.apiClient = {
        ...(view.tab.apiClient || {}),
        ...createRequestSnapshot(view),
        history: recentHistoryLoaded ? recentHistory : view.history || view.tab.apiClient?.history || [],
        savedRequestId: view.tab.apiClient?.savedRequestId || null,
        historyEntry: view.tab.apiClient?.historyEntry || null
      };
    }

    function rememberSavedRequestForView(view, request) {
      if (!view?.tab || !request) return;
      view.tab.apiClient = {
        ...(view.tab.apiClient || {}),
        ...normalizeRequestSnapshot(request),
        history: recentHistoryLoaded ? recentHistory : view.history || view.tab.apiClient?.history || [],
        savedRequestId: request.id || null,
        historyEntry: null,
        historyEntryKey: null
      };
      view.tab.title = request.name || getRequestTabTitle(request);
      deps.refreshTabs?.();
    }

    /**
     * Validate the request form and return the bridge request payload.
     */
    function buildRequestPayload(view) {
      const snapshot = resolveRequestSnapshot(createRequestSnapshot(view), view.environmentsDocument || environmentsDocument);
      const method = snapshot.method;
      if (!REQUEST_METHODS.includes(method)) throw new Error(`Unsupported method: ${method}`);
      const url = String(snapshot.url || "").trim();
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
      } catch (error) {
        throw new Error(error?.message || "Enter a valid HTTP or HTTPS URL.");
      }
      const bodyMode = methodAllowsBody(method) ? snapshot.bodyMode : "none";
      const transportBodyMode = bodyMode === "json" ? "raw" : bodyMode;
      const requestSettings = getRequestSettings();
      let headers = parseHeaderLines(snapshot.headersText);
      if (requestSettings.sendNoCacheHeader) headers = applyNoCacheHeaders(headers);
      const payload = {
        method,
        url,
        headers: requestSettings.cookieJarEnabled ? applyCookieJarToHeaders(headers, url, view?.cookiesDocument || cookiesDocument) : headers,
        bodyMode: transportBodyMode,
        body: bodyMode === "raw" || bodyMode === "json" ? snapshot.bodyText || "" : "",
        timeoutMs: requestSettings.timeoutMs,
        requestSettings
      };
      if (bodyMode === "form-data") {
        payload.formData = parseKeyValueLines(snapshot.formDataText, { separators: [":", "="] })
          .filter((row) => row.enabled !== false && row.key)
          .map((row) => ({ key: row.key, value: row.value || "" }));
      }
      return payload;
    }
    function encodeJsonRequest(request) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(request || {}))));
    }

    function quoteCommandArg(value) {
      const text = String(value || "");
      if (typeof global.NL_OS !== "undefined" && global.NL_OS !== "Windows") return `'${text.replace(/'/g, "'\\''")}'`;
      return `"${text.replace(/"/g, '\\"')}"`;
    }

    function getResponseContentType(headers) {
      const entries = Object.entries(headers || {});
      const match = entries.find(([name]) => String(name).toLowerCase() === "content-type");
      return match ? match[1] : "";
    }

    function renderHeaders(headers) {
      return Object.entries(headers || {})
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`)
        .join("\n");
    }


    async function writeTextToClipboard(text) {
      const value = String(text || "");
      if (getNeutralino()?.clipboard?.writeText) {
        await getNeutralino().clipboard.writeText(value);
        return;
      }
      if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(value);
        return;
      }
      const body = document.body;
      if (!body?.appendChild || !document.execCommand) throw new Error("Clipboard is unavailable.");
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      body.appendChild(textArea);
      textArea.focus?.();
      textArea.select?.();
      const copied = document.execCommand("copy");
      body.removeChild(textArea);
      if (!copied) throw new Error("Copy command was unsuccessful.");
    }

    function getVisibleResponseBodyText(view) {
      if (view.responseRawBody && view.responseRawBody.hidden === false) return view.responseRawBody.textContent || "";
      if (view.responseJsonBody && view.responseJsonBody.hidden === false) return view.responseJsonBody.textContent || "";
      if (view.responsePreviewFrame && view.responsePreviewFrame.hidden === false) return view.lastResponseBodyText || "";
      return view.responseBody?.textContent || "";
    }
    async function copyResponseBody(view) {
      try {
        await writeTextToClipboard(getVisibleResponseBodyText(view));
        const icon = view.responseCopyButton?.querySelector?.("i");
        if (icon) {
          icon.className = "bi bi-check-lg";
          const resetIcon = () => { icon.className = "bi bi-copy"; };
          if (typeof global.setTimeout === "function") global.setTimeout(resetIcon, 1500);
          else if (typeof setTimeout === "function") setTimeout(resetIcon, 1500);
        }
      } catch (error) {
      }
    }

    async function copyResponseHeaders(view) {
      try {
        await writeTextToClipboard(view.responseHeaders?.textContent || "");
        const icon = view.responseHeadersCopyButton?.querySelector?.("i");
        if (icon) {
          icon.className = "bi bi-check-lg";
          const resetIcon = () => { icon.className = "bi bi-copy"; };
          if (typeof global.setTimeout === "function") global.setTimeout(resetIcon, 1500);
          else if (typeof setTimeout === "function") setTimeout(resetIcon, 1500);
        }
      } catch (error) {
      }
    }
    function ensurePostmanCollectionFileName(fileName) {
      const text = String(fileName || "Saved Requests.postman_collection.json").trim() || "Saved Requests.postman_collection.json";
      return /\.postman_collection\.json$/i.test(text) ? text : text.replace(/\.json$/i, "") + ".postman_collection.json";
    }

    function sanitizePostmanCollectionFileName(name) {
      const cleaned = String(name || "Saved Requests").replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim();
      return ensurePostmanCollectionFileName(cleaned || "Saved Requests");
    }

    async function writePostmanCollectionFile(content, fileName) {
      const Neutralino = getNeutralino();
      if (isDesktopRuntime() && Neutralino?.os?.showSaveDialog && Neutralino?.filesystem?.writeFile) {
        const selectedPath = await Neutralino.os.showSaveDialog("Export Postman collection", {
          defaultPath: fileName,
          filters: [{ name: "Postman collection", extensions: ["json"] }]
        });
        if (!selectedPath) return false;
        await Neutralino.filesystem.writeFile(ensurePostmanCollectionFileName(selectedPath), content);
        return true;
      }
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const saveAs = deps.saveAs || global.saveAs;
      if (typeof saveAs === "function") {
        saveAs(blob, fileName);
        return true;
      }
      throw new Error("Exporting Postman collections is unavailable in this browser.");
    }

    function readBrowserTextFile(file) {
      return new Promise((resolve, reject) => {
        if (typeof FileReader !== "function") {
          reject(new Error("Importing Postman collections is unavailable in this browser."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Unable to read the selected file."));
        reader.readAsText(file);
      });
    }

    function chooseBrowserTextFile() {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.postman_collection.json,application/json";
        input.className = "file-input";
        input.addEventListener("change", async () => {
          try {
            const file = Array.from(input.files || [])[0];
            resolve(file ? await readBrowserTextFile(file) : "");
          } catch (error) {
            reject(error);
          } finally {
            input.parentNode?.removeChild?.(input);
          }
        });
        document.body?.appendChild?.(input);
        input.click?.();
      });
    }

    async function readPostmanCollectionFile() {
      const Neutralino = getNeutralino();
      if (isDesktopRuntime() && Neutralino?.os?.showOpenDialog && Neutralino?.filesystem?.readFile) {
        const selected = await Neutralino.os.showOpenDialog("Import Postman collection", {
          multiSelections: false,
          filters: [{ name: "Postman collection", extensions: ["json"] }]
        });
        const selectedPath = Array.isArray(selected) ? selected[0] : selected;
        return selectedPath ? Neutralino.filesystem.readFile(selectedPath) : "";
      }
      return chooseBrowserTextFile();
    }
    async function promptTextInput(options = {}) {
      const title = options.title || "API Client";
      const message = options.message || "";
      const defaultValue = String(options.defaultValue || "");
      const confirmLabel = options.confirmLabel || "OK";
      const notify = deps.notify || app.services?.notify;
      if (notify?.show) {
        let input = null;
        const result = await notify.show({
          title,
          message,
          dismissValue: null,
          buttons: [
            { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
            { id: "confirm", label: confirmLabel, variant: "primary", autoFocus: true, action: () => String(input?.value || "").trim() }
          ],
          renderBody(body) {
            input = document.createElement("input");
            input.className = "rename-modal-input api-client-dialog-input";
            input.type = "text";
            input.value = defaultValue;
            input.setAttribute("aria-label", options.inputLabel || message || title);
            body.appendChild(input);
            setTimeout(() => {
              input.focus?.();
              input.select?.();
            }, 0);
          }
        });
        return typeof result === "string" ? result.trim() : "";
      }
      return String(global.prompt?.(message || title, defaultValue) || "").trim();
    }

    async function confirmAction(message, options = {}) {
      if (typeof app.services?.confirm === "function") {
        return app.services.confirm(Object.assign({ message }, options));
      }
      return typeof global.confirm === "function" ? global.confirm(message) : false;
    }

    function setActivePanel(buttons, panels, activeName) {
      Object.entries(buttons || {}).forEach(([name, button]) => button?.classList?.toggle?.("active", name === activeName));
      Object.entries(panels || {}).forEach(([name, panel]) => {
        if (panel) panel.hidden = name !== activeName;
      });
    }

    function setText(element, text) {
      if (element) element.textContent = text || "";
    }

    function getEditorConfig(view, name) {
      if (name === "params") return { input: view.paramsInput, table: view.paramsTable, separator: ": ", onChange: () => syncParamsToUrl(view) };
      if (name === "headers") return { input: view.headersInput, table: view.headersTable, separator: ": ", onChange: () => syncViewToTabState(view) };
      return { input: view.formDataInput, table: view.formDataTable, separator: ": ", onChange: () => syncViewToTabState(view) };
    }

    function collectKeyValueTableRows(table) {
      return Array.from(table?.querySelectorAll?.(".api-client-kv-row") || []).filter((row) => row?.dataset?.generated !== "true").map((row) => ({
        enabled: row.querySelector?.(".api-client-kv-enabled")?.checked !== false,
        key: row.querySelector?.(".api-client-kv-key")?.value || "",
        value: row.querySelector?.(".api-client-kv-value")?.value || ""
      })).filter((row) => row.key || row.value);
    }

    function renderEditableKeyValueTable(view, name) {
      const config = getEditorConfig(view, name);
      if (!config.table || !config.input) return;
      const rows = parseKeyValueLines(config.input.value, { separators: [":", "="] });
      const generatedRow = name === "headers" ? getGeneratedCookieHeaderRow(view) : null;
      if (generatedRow) rows.push(generatedRow);
      if (!rows.some((row) => !row.key && !row.value)) rows.push({ enabled: true, key: "", value: "" });
      config.table.textContent = "";
      const table = createElement("table", "api-client-kv-table");
      table.innerHTML = `<thead><tr><th></th><th>Key</th><th>Value</th></tr></thead>`;
      const tbody = createElement("tbody");
      rows.forEach((row) => {
        const tr = createElement("tr", row.generated ? "api-client-kv-row api-client-kv-generated" : "api-client-kv-row");
        if (row.generated) tr.dataset.generated = "true";
        const enabledCell = createElement("td", "api-client-kv-check-cell");
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "api-client-kv-enabled";
        enabled.checked = row.enabled !== false;
        if (row.generated) { enabled.disabled = true; enabled.title = "Generated from cookie jar"; }
        enabledCell.appendChild(enabled);
        const keyCell = createElement("td");
        const keyInput = document.createElement("input");
        keyInput.className = "api-client-kv-key";
        keyInput.value = row.key || "";
        keyInput.placeholder = "Key";
        if (row.generated) { keyInput.readOnly = true; keyInput.disabled = true; keyInput.title = "Generated from cookie jar"; }
        keyCell.appendChild(keyInput);
        const valueCell = createElement("td");
        const valueInput = document.createElement("input");
        valueInput.className = "api-client-kv-value";
        valueInput.value = row.value || "";
        valueInput.placeholder = "Value";
        if (row.generated) { valueInput.readOnly = true; valueInput.disabled = true; valueInput.title = "Generated from cookie jar"; }
        valueCell.appendChild(valueInput);
        [enabled, keyInput, valueInput].forEach((input) => input.addEventListener("input", () => {
          config.input.value = serializeKeyValueRows(collectKeyValueTableRows(config.table), config.separator);
          config.onChange?.();
        }));
        enabled.addEventListener("change", () => {
          config.input.value = serializeKeyValueRows(collectKeyValueTableRows(config.table), config.separator);
          config.onChange?.();
        });
        tr.append(enabledCell, keyCell, valueCell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      config.table.appendChild(table);
    }

    function renderStaticKeyValueTable(container, rows, emptyMessage) {
      if (!container) return;
      container.textContent = "";
      if (!rows.length) {
        container.textContent = emptyMessage || "No data.";
        return;
      }
      const table = createElement("table", "api-client-kv-table api-client-response-table");
      table.innerHTML = `<thead><tr><th>Key</th><th>Value</th></tr></thead>`;
      const tbody = createElement("tbody");
      rows.forEach(([key, value]) => {
        const tr = createElement("tr");
        const keyCell = createElement("td", "", key);
        const valueCell = createElement("td", "", value);
        tr.append(keyCell, valueCell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    }

    function syncParamsToUrl(view) {
      if (view.syncingParams) return;
      try {
        view.syncingParams = true;
        view.urlInput.value = applyParamsTextToUrl(view.urlInput.value, view.paramsInput.value);
      } catch (_error) {
        // Leave an invalid in-progress URL untouched while the user is typing.
      } finally {
        view.syncingParams = false;
      }
      syncViewToTabState(view);
    }

    function syncParamsFromUrl(view) {
      if (view.syncingParams) return;
      view.syncingParams = true;
      view.paramsInput.value = getParamsTextFromUrl(view.urlInput.value);
      view.syncingParams = false;
      if (view.paramsInput) renderEditableKeyValueTable(view, "params");
      refreshGeneratedHeaderRows(view);
      syncViewToTabState(view);
    }

    function setBodyMode(view, bodyMode) {
      view.bodyMode = normalizeBodyMode(view.methodSelect.value, bodyMode, view.bodyInput.value, view.formDataInput?.value || "");
      if (view.bodyMode === "json") view.bodyInput.value = formatResponseBody(view.bodyInput.value, "application/json");
      Array.from(view.bodyModeInputs || []).forEach((input) => {
        input.checked = input.value === view.bodyMode;
      });
      const visibleBodyPanel = view.bodyMode === "json" ? "raw" : view.bodyMode;
      Object.entries(view.bodyPanels || {}).forEach(([name, panel]) => { if (panel) panel.hidden = name !== visibleBodyPanel; });
      syncViewToTabState(view);
    }

    function updateBodyVisibility(view) {
      const allowsBody = methodAllowsBody(view.methodSelect.value);
      if (!allowsBody) {
        view.bodyInput.value = "";
        if (view.formDataInput) view.formDataInput.value = "";
        view.bodyMode = "none";
      }
      if (view.bodyGroup) view.bodyGroup.hidden = !allowsBody;
      Array.from(view.bodyModeInputs || []).forEach((input) => {
        input.disabled = !allowsBody;
      });
      setBodyMode(view, allowsBody ? getSelectedBodyMode(view) : "none");
    }

    function renderDesktopOnly(view) {
      setText(view.responseBody, "API Client requests are available in the desktop app. Browser mode cannot send requests in this version.");
      setText(view.responseRawBody, "API Client requests are available in the desktop app. Browser mode cannot send requests in this version.");
      setText(view.responseJsonBody, "API Client requests are available in the desktop app. Browser mode cannot send requests in this version.");
      view.sendButton.disabled = true;
    }


    function renderConsoleHeaders(headers) {
      return Object.entries(headers || {})
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`)
        .join("\n");
    }

    function formatConsoleRequest(payload) {
      if (!payload) return "No request sent yet.";
      const parsedUrl = new URL(payload.url);
      const path = `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
      const lines = [`${payload.method || "GET"} ${path} HTTP/1.1`, `Host: ${parsedUrl.host}`];
      const headerText = renderConsoleHeaders(payload.headers);
      if (headerText) lines.push(headerText);
      if (payload.bodyMode === "form-data") {
        lines.push("", "[form-data]", JSON.stringify(payload.formData || [], null, 2));
      } else if (payload.body) {
        lines.push("", String(payload.body));
      }
      return lines.join("\n");
    }

    function formatConsoleResponse(result) {
      if (!result) return "No response received yet.";
      const response = result.response || {};
      const statusCode = Number(response.statusCode || 0);
      const statusText = response.statusMessage || "";
      const lines = [];
      const redirects = Array.isArray(result.redirects) ? result.redirects : [];
      if (redirects.length) {
        lines.push("Redirects");
        redirects.forEach((redirect, index) => {
          const location = redirect.location ? ` -> ${redirect.location}` : "";
          lines.push(`${index + 1}. ${redirect.method || "GET"} ${redirect.url || ""} - ${redirect.statusCode || ""}${redirect.statusMessage ? ` ${redirect.statusMessage}` : ""}${location}`);
        });
        if (result.finalUrl) lines.push(`Final URL: ${result.finalUrl}`);
        lines.push("");
      }
      lines.push(`HTTP ${statusCode || "No status"}${statusText ? ` ${statusText}` : ""}`);
      const headerText = renderConsoleHeaders(response.headers);
      if (headerText) lines.push(headerText);
      lines.push("", String(response.body || ""));
      return lines.join("\n");
    }

    function renderConsoleRequest(view, payload) {
      view.lastConsoleRequestPayload = payload || null;
      setText(view.responseConsoleRequest, formatConsoleRequest(payload));
      if (view.responseConsoleResponse && !view.responseConsoleResponse.textContent) setText(view.responseConsoleResponse, "No response received yet.");
    }

    function renderConsoleResponse(view, result) {
      setText(view.responseConsoleResponse, formatConsoleResponse(result));
    }

    function renderConsoleError(view, error) {
      setText(view.responseConsoleResponse, `Error\n\n${error?.message || "Request failed."}`);
    }
    function renderResponsePreview(view, body, contentType, requestedMode) {
      const rawBody = String(body || "");
      const renderMode = normalizeResponseRenderMode(requestedMode, contentType);
      view.lastResponseBodyText = rawBody;
      view.lastResponseContentType = contentType || "";
      if (view.responseRenderSelect) view.responseRenderSelect.value = renderMode;
      if (view.responsePreviewFrame) {
        view.responsePreviewFrame.hidden = renderMode !== "html";
        if (renderMode === "html") {
          view.responsePreviewFrame.setAttribute?.("sandbox", "");
          view.responsePreviewFrame.srcdoc = rawBody;
        } else {
          view.responsePreviewFrame.srcdoc = "";
          view.responsePreviewFrame.removeAttribute?.("srcdoc");
        }
      }
      if (view.responseBody) {
        view.responseBody.hidden = renderMode === "html";
        setText(view.responseBody, renderMode === "html" ? "" : formatResponsePreviewBody(rawBody, contentType, renderMode));
      }
      setText(view.responseJsonBody, formatResponseBody(rawBody, "application/json"));
    }
    function renderResponse(view, result) {
      const response = result?.response || {};
      const statusCode = Number(response.statusCode || 0);
      const statusText = response.statusMessage || "";
      const elapsedMs = Number(result?.elapsedMs || 0);
      const sizeBytes = Number(response.sizeBytes ?? getResponseSizeBytes(response.body));
      const contentType = getResponseContentType(response.headers);
      const rawBody = String(response.body || "");
      setText(view.responseMeta, `${statusCode || "No status"} ${statusText} - ${elapsedMs} ms`);
      setText(view.responseInfoStatus, statusCode ? `Status: ${statusCode} ${statusText}` : "Status: No status");
      setText(view.responseInfoTime, `Time: ${elapsedMs} ms`);
      setText(view.responseInfoSize, `Size: ${formatByteSize(sizeBytes)}`);
      setText(view.responseHeaders, renderHeaders(response.headers));
      renderResponsePreview(view, rawBody, contentType, view.responseRenderSelect?.value);
      setText(view.responseRawBody, rawBody);
      renderStaticKeyValueTable(view.responseHeadersTable, getHeaderEntries(response.headers), "No response headers.");
      const cookies = parseCookies(response.headers).map((cookie) => [cookie.name, [cookie.value, cookie.attributes].filter(Boolean).join("; ")]);
      renderStaticKeyValueTable(view.responseCookies, cookies, "No cookies returned.");
      renderConsoleResponse(view, result);
    }

    function renderError(view, error) {
      setText(view.responseMeta, "");
      setText(view.responseInfoStatus, "Status: Error");
      setText(view.responseInfoTime, "Time: --");
      setText(view.responseInfoSize, "Size: --");
      setText(view.responseHeaders, "");
      const errorText = error?.message || "Request failed.";
      renderResponsePreview(view, errorText, "text/plain", "text");
      setText(view.responseRawBody, errorText);
      renderStaticKeyValueTable(view.responseHeadersTable, [], "No response headers.");
      renderStaticKeyValueTable(view.responseCookies, [], "No cookies returned.");
      renderConsoleError(view, error);
    }

    function loadRequestIntoView(view, request) {
      const snapshot = normalizeRequestSnapshot(request);
      view.methodSelect.value = REQUEST_METHODS.includes(snapshot.method) ? snapshot.method : "GET";
      view.urlInput.value = snapshot.url;
      if (view.paramsInput) view.paramsInput.value = snapshot.paramsText;
      view.headersInput.value = snapshot.headersText;
      view.bodyInput.value = snapshot.bodyText;
      if (view.formDataInput) view.formDataInput.value = snapshot.formDataText;
      view.bodyMode = snapshot.bodyMode;
      if (view.paramsInput) renderEditableKeyValueTable(view, "params");
      renderEditableKeyValueTable(view, "headers");
      renderEditableKeyValueTable(view, "form-data");
      updateBodyVisibility(view);
    }
    function renderStoredHistoryResult(view, entry) {
      if (entry?.result) renderResponse(view, entry.result);
      else if (entry?.error) renderError(view, entry.error);
    }

    function syncRecentHistoryToViews() {
      apiClientViews.forEach((mountedView) => {
        mountedView.history = recentHistory;
        mountedView.tab.apiClient = { ...(mountedView.tab.apiClient || {}), history: recentHistory };
      });
    }

    async function loadRecentHistoryOnce(options = {}) {
      if (recentHistoryLoaded && options.forceReload !== true) return recentHistory;
      recentHistory = ensureHistoryEntryKeys(storage?.loadRecentHistory ? await storage.loadRecentHistory(getRecentHistoryLimit(), { forceReload: options.forceReload === true }) : []);
      recentHistoryLoaded = true;
      syncRecentHistoryToViews();
      return recentHistory;
    }

    async function persistRecentHistory() {
      if (!storage?.saveRecentHistory) return recentHistory;
      const retainedKeys = recentHistory.map((entry) => entry.historyEntryKey || "");
      recentHistory = ensureHistoryEntryKeys(await storage.saveRecentHistory(recentHistory, getRecentHistoryLimit()), retainedKeys);
      syncRecentHistoryToViews();
      return recentHistory;
    }

    async function trimRecentHistoryToLimit() {
      await loadRecentHistoryOnce();
      recentHistory = recentHistory.slice(0, getRecentHistoryLimit());
      syncRecentHistoryToViews();
      await persistRecentHistory();
      renderSidebarForActiveView();
      return recentHistory;
    }

    function addHistoryEntry(view, request, result, error) {
      const entry = ensureHistoryEntryKeys([{ request: normalizeRequestSnapshot(request), result: result || null, error: error ? { message: error.message || String(error) } : null }])[0];
      recentHistory = ensureHistoryEntryKeys([entry].concat(recentHistoryLoaded ? recentHistory : view.history || []).slice(0, getRecentHistoryLimit()));
      recentHistoryLoaded = true;
      view.history = recentHistory;
      view.tab.apiClient = { ...(view.tab.apiClient || {}), history: recentHistory };
      syncRecentHistoryToViews();
      void persistRecentHistory().then(renderSidebarForActiveView);
      renderSidebarForView(view);
    }

    function runBridgeRequest(payload, view) {
      if (typeof deps.runBridgeRequest === "function") return deps.runBridgeRequest(payload);
      const Neutralino = getNeutralino();
      return new Promise(async (resolve, reject) => {
        if (!isDesktopRuntime()) {
          reject(new Error("Desktop request bridge is unavailable."));
          return;
        }
        const command = `node ${quoteCommandArg(API_CLIENT_BRIDGE_PATH)} ${encodeJsonRequest(payload)}`;
        let processId = null;
        let output = "";
        let errorOutput = "";
        const cleanup = () => {
          if (view) view.activeProcessId = null;
          if (typeof unsubscribe === "function") unsubscribe();
        };
        const finish = () => {
          cleanup();
          if (view?.cancelRequested) {
            view.cancelRequested = false;
            reject(new Error("Request cancelled."));
            return;
          }
          try {
            const result = JSON.parse(output || "{}");
            if (result.ok === false) {
              const bridgeError = new Error(result.error?.message || "Request failed.");
              bridgeError.code = result.error?.code || "";
              bridgeError.cause = result.error?.cause || null;
              reject(bridgeError);
            } else resolve(result);
          } catch (_error) {
            reject(new Error(errorOutput.trim() || "Request bridge returned an invalid response."));
          }
        };
        const unsubscribe = await Neutralino.events.on("spawnedProcess", (event) => {
          const detail = event?.detail || {};
          if (processId == null || detail.id !== processId) return;
          if (detail.action === "stdOut") output += detail.data || "";
          else if (detail.action === "stdErr") errorOutput += detail.data || "";
          else if (detail.action === "exit") finish();
        });
        try {
          const processHandle = await Neutralino.os.spawnProcess(command);
          processId = processHandle?.id ?? processHandle;
          if (view) view.activeProcessId = processId;
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    }

    function setSending(view, sending) {
      view.isSending = sending === true;
      const icon = view.sendButton.querySelector?.("i");
      const label = view.sendButton.querySelector?.("span");
      if (icon) icon.className = view.isSending ? "bi bi-stop-circle" : "bi bi-send";
      if (label) label.textContent = view.isSending ? "Cancel" : "Send";
      view.sendButton.disabled = !view.isSending && !isDesktopRuntime();
      view.methodSelect.disabled = view.isSending;
      view.urlInput.disabled = view.isSending;
      if (view.environmentSelect) view.environmentSelect.disabled = view.isSending;
      if (view.paramsInput) view.paramsInput.disabled = view.isSending;
      if (view.headersInput) view.headersInput.disabled = view.isSending;
      if (view.bodyInput) view.bodyInput.disabled = view.isSending;
      if (view.formDataInput) view.formDataInput.disabled = view.isSending;
      Array.from(view.bodyModeInputs || []).forEach((input) => {
        input.disabled = view.isSending || !methodAllowsBody(view.methodSelect.value);
      });
    }

    function cancelRequest(view) {
      if (!view.isSending || view.activeProcessId == null) return;
      view.cancelRequested = true;
      view.sendButton.disabled = true;
      getNeutralino()?.os?.updateSpawnedProcess?.(view.activeProcessId, "exit");
    }
    async function sendRequest(view) {
      let payload = null;
      const requestSnapshot = createRequestSnapshot(view);
      try {
        await loadEnvironmentsOnce();
        await loadCookiesOnce();
        view.environmentsDocument = environmentsDocument;
        view.cookiesDocument = cookiesDocument;
        payload = buildRequestPayload(view);
        renderConsoleRequest(view, payload);
        setSending(view, true);
        setText(view.responseMeta, "");
        setText(view.responseInfoStatus, "Status: --");
        setText(view.responseInfoTime, "Time: --");
        setText(view.responseInfoSize, "Size: --");
        setText(view.responseHeaders, "");
        setText(view.responseBody, "");
        setText(view.responseRawBody, "");
        setText(view.responseJsonBody, "");
        renderStaticKeyValueTable(view.responseHeadersTable, [], "No response headers.");
        renderStaticKeyValueTable(view.responseCookies, [], "No cookies returned.");
        const result = await runBridgeRequest(payload, view);
        renderResponse(view, result);
        addHistoryEntry(view, requestSnapshot, result, null);
      } catch (error) {
        const trustedSettings = payload ? await promptTrustApiClientCertificate(payload, error, view) : null;
        if (trustedSettings) {
          try {
            payload = { ...buildRequestPayload(view), requestSettings: trustedSettings };
            renderConsoleRequest(view, payload);
            const result = await runBridgeRequest(payload, view);
            renderResponse(view, result);
            addHistoryEntry(view, requestSnapshot, result, null);
            return;
          } catch (retryError) {
            error = retryError;
          }
        }
        renderError(view, error);
        if (payload) addHistoryEntry(view, requestSnapshot, null, error);
      } finally {
        setSending(view, false);
      }
    }

    async function loadCollectionsOnce(options = {}) {
      if ((collectionsLoaded && options.forceReload !== true) || !storage?.loadCollections) return savedCollection;
      savedCollection = await storage.loadCollections({ forceReload: options.forceReload === true });
      collectionsLoaded = true;
      return savedCollection;
    }

    async function loadEnvironmentsOnce(options = {}) {
      if ((environmentsLoaded && options.forceReload !== true) || !storage?.loadEnvironments) return environmentsDocument;
      environmentsDocument = await storage.loadEnvironments({ forceReload: options.forceReload === true });
      environmentsLoaded = true;
      syncEnvironmentsToViews();
      return environmentsDocument;
    }


    async function loadCookiesOnce(options = {}) {
      if ((cookiesLoaded && options.forceReload !== true) || !storage?.loadCookies) return cookiesDocument;
      cookiesDocument = await storage.loadCookies({ forceReload: options.forceReload === true });
      cookiesLoaded = true;
      syncCookiesToViews();
      apiClientViews.forEach((view) => refreshGeneratedHeaderRows(view));
      return cookiesDocument;
    }

    async function persistCookies(nextDocument) {
      cookiesDocument = normalizeCookieManagerDocument(nextDocument);
      cookiesLoaded = true;
      if (storage?.saveCookies) cookiesDocument = await storage.saveCookies(cookiesDocument);
      syncCookiesToViews();
      apiClientViews.forEach((view) => refreshGeneratedHeaderRows(view));
      for (const view of apiClientViews.values()) renderCookieManager(view);
      return cookiesDocument;
    }

    function syncCookiesToViews() {
      for (const view of apiClientViews.values()) view.cookiesDocument = cookiesDocument;
    }
    async function persistEnvironments(nextDocument, options = {}) {
      environmentsDocument = nextDocument;
      environmentsLoaded = true;
      if (storage?.saveEnvironments) environmentsDocument = await storage.saveEnvironments(nextDocument);
      syncEnvironmentsToViews();
      if (options.render !== false) renderSidebarForActiveView();
      return environmentsDocument;
    }

    async function persistCollections(collection) {
      savedCollection = collection;
      if (storage?.saveCollections) savedCollection = await storage.saveCollections(collection);
      renderSidebarForActiveView();
    }

    function getActiveView() {
      return apiClientViews.get(activeApiClientTabId) || null;
    }

    function renderEnvironmentSelector(view) {
      if (!view?.environmentSelect) return;
      const selectedValue = environmentsDocument?.activeEnvironmentId || "";
      view.environmentSelect.textContent = "";
      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "No Environment";
      view.environmentSelect.appendChild(noneOption);
      (environmentsDocument?.environments || []).forEach((environment) => {
        const option = document.createElement("option");
        option.value = environment.id;
        option.textContent = environment.name;
        view.environmentSelect.appendChild(option);
      });
      view.environmentSelect.value = selectedValue;
    }

    function syncEnvironmentsToViews() {
      apiClientViews.forEach((view) => {
        view.environmentsDocument = environmentsDocument;
        renderEnvironmentSelector(view);
      });
    }

    function getSelectedNode() {
      return storage?.findNodeById?.(savedCollection.root, selectedNodeId)?.node || savedCollection.root;
    }

    function getSelectedParentId() {
      const selected = getSelectedNode();
      return selected?.type === "folder" ? selected.id : ROOT_ID;
    }

    function getSaveTargetRequestId(view, options = {}) {
      if (options.forceNew === true) return "";
      const linkedRequestId = String(view?.tab?.apiClient?.savedRequestId || "").trim();
      if (linkedRequestId) return linkedRequestId;
      if (options.updateSelectedRequest === true) {
        const selected = getSelectedNode();
        if (selected?.type === "request") return selected.id;
      }
      return "";
    }

    function getSaveAsParentId(view) {
      const linkedRequestId = String(view?.tab?.apiClient?.savedRequestId || "").trim();
      const linkedMatch = linkedRequestId ? storage?.findNodeById?.(savedCollection.root, linkedRequestId) : null;
      if (linkedMatch?.parent?.type === "folder") return linkedMatch.parent.id;
      return getSelectedParentId();
    }

    async function saveCurrentRequest(options = {}) {
      const view = getActiveView();
      if (!view || !storage?.upsertRequest) return false;
      await loadCollectionsOnce();
      const existingRequestId = getSaveTargetRequestId(view, options);
      const existing = existingRequestId ? storage.findNodeById(savedCollection.root, existingRequestId)?.node : null;
      const current = createRequestSnapshot(view);
      const name = existing?.type === "request"
        ? existing.name
        : await promptTextInput({ title: options.forceNew === true ? "Save Request As" : "Save Request", message: "Request name", defaultValue: current.url || view.tab?.title || "Untitled Request", confirmLabel: "Save" });
      if (!name) return false;
      const parentId = options.forceNew === true ? getSaveAsParentId(view) : getSelectedParentId();
      const next = storage.upsertRequest(savedCollection, existing?.type === "request" ? ROOT_ID : parentId, { ...current, name }, existing?.type === "request" ? existing.id : null);
      selectOnlySavedNode(next.request.id);
      rememberSavedRequestForView(view, next.request);
      await persistCollections(next.collection);
      flashSaveButton(view, options.forceNew === true ? "Saved As" : "Saved");
      return true;
    }

    function collectPostmanExportNodeIds(folder, ids = []) {
      (folder?.children || []).forEach((node) => {
        ids.push(String(node.id || ""));
        if (node.type === "folder") collectPostmanExportNodeIds(node, ids);
      });
      return ids.filter(Boolean);
    }

    function getPostmanExportNodeLabel(node) {
      if (node?.type === "folder") return node.name || "Folder";
      const method = String(node?.method || "GET").toUpperCase();
      const name = String(node?.name || "Untitled Request").trim();
      return `${method} ${name || "Untitled Request"}`;
    }

    async function choosePostmanExportNodeIds(collection) {
      const allNodeIds = collectPostmanExportNodeIds(collection?.root);
      if (!allNodeIds.length) return [];
      const notify = deps.notify || app.services?.notify;
      if (!notify?.show) return allNodeIds;
      const inputsById = new Map();
      const childrenById = new Map();
      let selectAllInput = null;

      const setDescendantsChecked = (nodeId, checked) => {
        (childrenById.get(nodeId) || []).forEach((childId) => {
          const input = inputsById.get(childId);
          if (input) input.checked = checked;
          setDescendantsChecked(childId, checked);
        });
      };
      const syncAncestors = () => {
        Array.from(inputsById.entries()).reverse().forEach(([nodeId, input]) => {
          const childIds = childrenById.get(nodeId) || [];
          if (!childIds.length) return;
          const childInputs = childIds.map((childId) => inputsById.get(childId)).filter(Boolean);
          const checkedCount = childInputs.filter((childInput) => childInput.checked).length;
          input.checked = checkedCount === childInputs.length;
          input.indeterminate = checkedCount > 0 && checkedCount < childInputs.length;
        });
        if (selectAllInput) {
          const inputs = Array.from(inputsById.values());
          const checkedCount = inputs.filter((input) => input.checked).length;
          selectAllInput.checked = checkedCount === inputs.length;
          selectAllInput.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
        }
      };
      const renderNode = (parent, node, depth) => {
        const row = createElement("label", "api-client-export-node");
        row.style.setProperty("--api-client-export-depth", String(depth));
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.dataset.nodeId = node.id;
        input.className = "api-client-export-node-check";
        inputsById.set(node.id, input);
        const childIds = (node.children || []).map((child) => child.id).filter(Boolean);
        if (childIds.length) childrenById.set(node.id, childIds);
        const icon = createElement("i", `bi ${node.type === "folder" ? "bi-folder" : "bi-file-earmark-text"}`);
        icon.setAttribute("aria-hidden", "true");
        const text = createElement("span", "api-client-export-node-label", getPostmanExportNodeLabel(node));
        input.addEventListener("change", () => {
          setDescendantsChecked(node.id, input.checked);
          syncAncestors();
        });
        row.append(input, icon, text);
        parent.appendChild(row);
        (node.children || []).forEach((child) => renderNode(parent, child, depth + 1));
      };

      const selectedIds = await notify.show({
        title: "Export Postman Collection",
        message: "Choose saved folders and requests to export.",
        dismissValue: null,
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          {
            id: "export",
            label: "Export",
            variant: "primary",
            autoFocus: true,
            action: () => Array.from(inputsById.entries()).filter(([_id, input]) => input.checked).map(([id]) => id)
          }
        ],
        renderBody(body) {
          const controls = createElement("label", "api-client-export-select-all");
          selectAllInput = document.createElement("input");
          selectAllInput.type = "checkbox";
          selectAllInput.checked = true;
          const selectAllText = createElement("span", "", "Select all");
          controls.append(selectAllInput, selectAllText);
          const tree = createElement("div", "api-client-export-tree");
          (collection?.root?.children || []).forEach((node) => renderNode(tree, node, 0));
          selectAllInput.addEventListener("change", () => {
            inputsById.forEach((input) => {
              input.checked = selectAllInput.checked;
              input.indeterminate = false;
            });
            syncAncestors();
          });
          body.append(controls, tree);
          syncAncestors();
        }
      });
      return Array.isArray(selectedIds) ? selectedIds : null;
    }
    async function exportPostmanCollection() {
      if (!storage?.exportCollectionToPostman) return false;
      await loadCollectionsOnce();
      const selectedIds = await choosePostmanExportNodeIds(savedCollection);
      if (!selectedIds) return false;
      const postmanCollection = storage.exportCollectionToPostman(savedCollection, { selectedIds });
      const content = JSON.stringify(postmanCollection, null, 2);
      const fileName = sanitizePostmanCollectionFileName(postmanCollection.info?.name || savedCollection.root?.name || "Saved Requests");
      const written = await writePostmanCollectionFile(content, fileName);
      if (written) alertUser("Exported saved requests as a Postman collection.");
      return written;
    }

    async function importPostmanCollection() {
      if (!storage?.importCollectionFromPostman) return false;
      await loadCollectionsOnce();
      const text = await readPostmanCollectionFile();
      if (!text) return false;
      let postmanCollection = null;
      try {
        postmanCollection = JSON.parse(text);
      } catch (_error) {
        throw new Error("The selected file is not valid JSON.");
      }
      const result = storage.importCollectionFromPostman(savedCollection, postmanCollection);
      await persistCollections(result.collection);
      alertUser(`Imported ${result.importedCount} item${result.importedCount === 1 ? "" : "s"} from the Postman collection.`);
      return true;
    }
    async function createFolder() {
      const name = await promptTextInput({ title: "New Folder", message: "Folder name", defaultValue: "New Folder", confirmLabel: "Create" });
      if (!name) return;
      const next = storage.addFolder(savedCollection, getSelectedParentId(), name);
      selectOnlySavedNode(next.folder.id);
      await persistCollections(next.collection);
    }

    async function createEnvironment() {
      if (!storage?.addEnvironment) return;
      await loadEnvironmentsOnce();
      const name = await promptTextInput({ title: "New Environment", message: "Environment name", defaultValue: "New Environment", confirmLabel: "Create" });
      if (!name) return;
      const next = storage.addEnvironment(environmentsDocument, name);
      await persistEnvironments(next.environments);
    }

    async function renameEnvironment(environment) {
      if (!environment || !storage?.renameEnvironment) return;
      await loadEnvironmentsOnce();
      const name = await promptTextInput({ title: "Rename Environment", message: "Environment name", defaultValue: environment.name, confirmLabel: "Rename" });
      if (!name) return;
      await persistEnvironments(storage.renameEnvironment(environmentsDocument, environment.id, name));
    }

    async function deleteEnvironment(environment) {
      if (!environment || !storage?.deleteEnvironment) return;
      const confirmed = await confirmAction("Delete environment \"" + environment.name + "\"?", { title: "Delete Environment", confirmLabel: "Delete", confirmVariant: "danger" });
      if (!confirmed) return;
      await loadEnvironmentsOnce();
      await persistEnvironments(storage.deleteEnvironment(environmentsDocument, environment.id));
    }

    async function confirmDeleteVariable(variable) {
      const key = String(variable?.key || "").trim();
      const message = key ? "Delete variable \"" + key + "\"?" : "Delete this variable?";
      return confirmAction(message, { title: "Delete Variable", confirmLabel: "Delete", confirmVariant: "danger" });
    }

    async function selectEnvironment(environmentId) {
      if (!storage?.setActiveEnvironment) return;
      await loadEnvironmentsOnce();
      await persistEnvironments(storage.setActiveEnvironment(environmentsDocument, environmentId));
    }

    async function changeGlobalVariables(variables) {
      if (!storage?.setGlobalVariables) return;
      await loadEnvironmentsOnce();
      await persistEnvironments(storage.setGlobalVariables(environmentsDocument, variables), { render: false });
    }

    async function changeEnvironmentVariables(environmentId, variables) {
      if (!storage?.setEnvironmentVariables) return;
      await loadEnvironmentsOnce();
      await persistEnvironments(storage.setEnvironmentVariables(environmentsDocument, environmentId, variables), { render: false });
    }

    async function createRequestInFolder(folder) {
      if (!folder || folder.type !== "folder" || !storage?.upsertRequest) return;
      await loadCollectionsOnce();
      const name = await promptTextInput({ title: "New Request", message: "Request name", defaultValue: "New Request", confirmLabel: "Create" });
      if (!name) return;
      const request = { name, method: "GET", url: "", paramsText: "", headersText: DEFAULT_HEADERS_TEXT, bodyMode: "none", bodyText: "", formDataText: "" };
      const next = storage.upsertRequest(savedCollection, folder.id, request);
      selectOnlySavedNode(next.request.id);
      await persistCollections(next.collection);
      openRequestInNewTab(next.request, null);
    }

    function getTopLevelSavedSelection(nodes) {
      const selectedIds = new Set((Array.isArray(nodes) ? nodes : [nodes]).map((node) => String(node?.id || node || "")).filter((id) => id && id !== ROOT_ID));
      const selectedNodes = [];
      const collect = (children) => (children || []).forEach((node) => {
        if (selectedIds.has(node.id)) selectedNodes.push(node);
        else if (node.type === "folder") collect(node.children);
      });
      collect(savedCollection.root?.children);
      return selectedNodes;
    }

    function folderContainsSavedNode(folder, nodeId) {
      return folder?.type === "folder" && (folder.children || []).some((child) => child.id === nodeId || folderContainsSavedNode(child, nodeId));
    }

    async function moveSavedNode(nodes, targetFolderId) {
      if (!nodes || !storage?.moveNode) return;
      await loadCollectionsOnce();
      const selectedNodes = getTopLevelSavedSelection(nodes);
      const targetId = String(targetFolderId || ROOT_ID);
      const target = targetId === ROOT_ID ? savedCollection.root : storage.findNodeById(savedCollection.root, targetId)?.node;
      if (!selectedNodes.length || target?.type !== "folder") return;
      if (selectedNodes.some((node) => node.id === targetId || folderContainsSavedNode(node, targetId))) return;
      let nextCollection = savedCollection;
      let moved = false;
      selectedNodes.forEach((node) => {
        const next = storage.moveNode(nextCollection, node.id, targetId);
        nextCollection = next.collection;
        moved = next.moved || moved;
      });
      if (!moved) return;
      selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
      selectedNodeId = selectedNodes[0]?.id || ROOT_ID;
      await persistCollections(nextCollection);
    }

    async function renameNode(node) {
      if (!node || node.id === ROOT_ID) return;
      const name = await promptTextInput({ title: "Rename", message: "Name", defaultValue: node.name || "", confirmLabel: "Rename" });
      if (!name) return;
      await persistCollections(storage.renameNode(savedCollection, node.id, name));
    }

    async function deleteNode(nodes) {
      await loadCollectionsOnce();
      const requestedNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : nodes ? [nodes] : [];
      const selectedNodes = getTopLevelSavedSelection(requestedNodes);
      if (!selectedNodes.length) return;
      const message = requestedNodes.length === 1 ? `Delete ${requestedNodes[0].name || "item"}?` : `Delete ${requestedNodes.length} selected saved items?`;
      if (!await confirmAction(message, { title: "Delete Saved Request", confirmLabel: "Delete", confirmVariant: "danger" })) return;
      let nextCollection = savedCollection;
      selectedNodes.forEach((node) => { nextCollection = storage.deleteNode(nextCollection, node.id); });
      selectOnlySavedNode(ROOT_ID);
      await persistCollections(nextCollection);
    }

    function handleSelectSavedNode(node, nodes = []) {
      selectedNodeIds = new Set(nodes.map((selectedNode) => selectedNode.id));
      selectedNodeId = node?.id || ROOT_ID;
    }

    async function revealSavedRequest(savedRequestId) {
      const requestId = String(savedRequestId || "").trim();
      if (!requestId || !storage?.findNodeById) return false;
      await loadCollectionsOnce();
      const match = storage.findNodeById(savedCollection.root, requestId);
      if (match?.node?.type !== "request") return false;
      selectOnlySavedNode(requestId);
      deps.setSidebarVisible?.(true, false, false);
      const currentView = deps.getSidebarView?.();
      if (currentView && currentView !== "api-client") previousSidebarView = currentView;
      deps.setSidebarView?.("api-client");
      renderSidebarForActiveView();
      return true;
    }
    function getHistoryEntryKey(entry, index) {
      if (!entry) return "";
      if (entry.historyEntryKey) return String(entry.historyEntryKey);
      const request = normalizeRequestSnapshot(entry.request || entry);
      const result = entry.result || null;
      const error = entry.error || null;
      const response = result?.response || null;
      return [
        index != null ? String(index) : "",
        request.method,
        request.url,
        request.paramsText,
        request.headersText,
        request.bodyMode,
        request.bodyText,
        request.formDataText,
        result?.elapsedMs != null ? String(result.elapsedMs) : "",
        response?.statusCode != null ? String(response.statusCode) : "",
        response?.statusMessage || "",
        response?.body || "",
        error?.message || ""
      ].join("\u001f");
    }
function getRequestTabTitle(request) {
      const name = String(request?.name || "").trim();
      if (name) return name;
      const method = String(request?.method || "GET").toUpperCase();
      const url = String(request?.url || "").trim();
      if (!url) return "API Client";
      try {
        const parsed = new URL(url);
        return `${method} ${parsed.pathname || parsed.host}`;
      } catch (_error) {
        return `${method} ${url}`;
      }
    }

    function openRequestInNewTab(request, historyEntry, historyIndex) {
      const snapshot = normalizeRequestSnapshot(request);
      const historyEntryKey = historyEntry ? getHistoryEntryKey(historyEntry, historyIndex) : "";
      const savedRequestId = historyEntry ? "" : String(request?.id || "").trim();
      return deps.openApiClientInTab?.({
        forceNew: false,
        title: getRequestTabTitle(request),
        request: snapshot,
        savedRequestId,
        historyEntry: historyEntry || null,
        historyEntryKey
      }) || null;
    }

    function handleOpenSavedRequest(request) {
      if (!request || request.type !== "request") return;
      openRequestInNewTab(request, null);
    }

    function handleOpenHistory(entry, index) {
      if (!entry?.request) return;
      openRequestInNewTab(entry.request, entry, index);
    }

    function handleSelectHistory(entries = []) {
      selectedHistoryEntryKeys = new Set(entries.map((item) => item.key));
    }

    async function deleteHistoryEntry(entries, index) {
      await loadRecentHistoryOnce();
      const requestedEntries = Array.isArray(entries) ? entries : entries ? [{ entry: entries, index, key: getHistoryEntryKey(entries, index) }] : [];
      const keysToDelete = new Set(requestedEntries.map((item) => item.key).filter(Boolean));
      if (!keysToDelete.size) return;
      const message = keysToDelete.size === 1 ? "Delete this history entry?" : `Delete ${keysToDelete.size} selected history entries?`;
      const confirmed = await confirmAction(message, { title: "Delete History Entry", confirmLabel: "Delete", confirmVariant: "danger" });
      if (!confirmed) return;
      recentHistory = recentHistory.filter((historyEntry, index) => !keysToDelete.has(getHistoryEntryKey(historyEntry, index)));
      selectedHistoryEntryKeys.clear();
      syncRecentHistoryToViews();
      await persistRecentHistory();
      renderSidebarForActiveView();
    }

    async function clearHistory() {
      await loadRecentHistoryOnce();
      if (!recentHistory.length) return;
      const confirmed = await confirmAction("Clear all API Client history?", { title: "Clear History", confirmLabel: "Clear", confirmVariant: "danger" });
      if (!confirmed) return;
      recentHistory = [];
      selectedHistoryEntryKeys.clear();
      syncRecentHistoryToViews();
      await persistRecentHistory();
      renderSidebarForActiveView();
    }

    function renderSidebarForView(view) {
      const history = ensureHistoryEntryKeys(recentHistoryLoaded ? recentHistory : view?.history || []);
      sidebar?.render?.({ collection: savedCollection, selectedNodeId, selectedNodeIds: Array.from(selectedNodeIds), history, historyEntryKeys: history.map(getHistoryEntryKey), selectedHistoryEntryKeys: Array.from(selectedHistoryEntryKeys), environments: environmentsDocument });
    }

    function renderSidebarForActiveView() {
      renderSidebarForView(getActiveView());
    }

    function setSaveButtonMode(view, mode) {
      const action = mode === "save-as" ? "save-as" : "save";
      view.saveAction = action;
      const label = action === "save-as" ? "Save As" : "Save";
      view.saveButton.querySelector("span").textContent = label;
      view.saveButton.title = label;
      view.saveButton.setAttribute("aria-label", label);
      view.saveAsButton.querySelector("span").textContent = action === "save-as" ? "Save" : "Save As";
    }

    function flashSaveButton(view, label) {
      if (!view?.saveButton) return;
      const clearTimer = deps.clearTimeout || global.clearTimeout;
      const setTimer = deps.setTimeout || global.setTimeout;
      if (view.saveFeedbackTimer && typeof clearTimer === "function") clearTimer(view.saveFeedbackTimer);
      const textLabel = String(label || "Saved");
      const labelElement = view.saveButton.querySelector?.("span");
      if (labelElement) labelElement.textContent = textLabel;
      view.saveButton.title = textLabel;
      view.saveButton.setAttribute?.("aria-label", textLabel);
      view.saveButton.classList?.add?.("api-client-save-success");
      const restore = () => {
        view.saveButton.classList?.remove?.("api-client-save-success");
        setSaveButtonMode(view, view.saveAction);
        view.saveFeedbackTimer = null;
      };
      view.saveFeedbackTimer = typeof setTimer === "function" ? setTimer(restore, 1400) : null;
    }

    function closeSaveMenu(view) {
      if (!view?.saveMenu) return;
      view.saveMenu.hidden = true;
      view.saveMenu.classList?.remove?.("show");
      view.saveToggleButton?.setAttribute?.("aria-expanded", "false");
    }

    function toggleSaveMenu(view) {
      if (!view?.saveMenu) return;
      const willOpen = view.saveMenu.hidden;
      view.saveMenu.hidden = !willOpen;
      view.saveMenu.classList?.toggle?.("show", willOpen);
      view.saveToggleButton?.setAttribute?.("aria-expanded", willOpen ? "true" : "false");
    }

    async function runSelectedSaveAction(view) {
      if (view?.saveAction === "save-as") return saveCurrentRequest({ forceNew: true });
      return saveCurrentRequest();
    }

    function getCodeSnippetLanguageId(view) {
      return view?.codeLanguageSelect?.value || codeSnippets?.getDefaultSnippetLanguageId?.() || "curl";
    }

    function populateCodeSnippetLanguages(view) {
      if (!view?.codeLanguageSelect || !codeSnippets?.getSnippetLanguages) return;
      view.codeLanguageSelect.textContent = "";
      codeSnippets.getSnippetLanguages().forEach((language) => {
        const option = document.createElement("option");
        option.value = language.id;
        option.textContent = language.label;
        view.codeLanguageSelect.appendChild(option);
      });
      view.codeLanguageSelect.value = codeSnippets.getDefaultSnippetLanguageId?.() || "curl";
    }

    function escapeCodeHtml(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function stashSnippetHighlight(source, placeholders, regex, className) {
      return source.replace(regex, (value) => {
        const index = placeholders.length;
        placeholders.push("<span class=\"" + className + "\">" + escapeCodeHtml(value) + "</span>");
        return "\uE000TOKEN" + index + "TOKEN\uE000";
      });
    }

    function getSnippetHighlightPattern(syntaxLanguage) {
      if (syntaxLanguage === "bash") return "curl|wget";
      if (syntaxLanguage === "python") return "as|def|False|for|if|import|in|None|print|raise|return|True|with";
      if (syntaxLanguage === "powershell") return "function|param|if|else|foreach|return|throw";
      if (syntaxLanguage === "kotlin") return "as|class|false|fun|if|import|null|return|true|val|var";
      if (syntaxLanguage === "swift") return "as|class|false|for|func|if|import|let|nil|return|true|var";
      if (syntaxLanguage === "csharp") return "await|class|false|if|new|null|return|true|using|var";
      return "async|await|break|catch|class|const|continue|else|false|for|function|if|import|let|new|null|return|throw|true|try|var|while";
    }

    function restoreSnippetHighlightPlaceholders(markup, placeholders) {
      return markup.replace(/\uE000TOKEN(\d+)TOKEN\uE000/g, (_match, index) => placeholders[Number(index)] || "");
    }

    function buildFallbackHighlightedSnippet(snippet, syntaxLanguage) {
      const placeholders = [];
      let source = String(snippet || "");
      source = stashSnippetHighlight(source, placeholders, /"(?:\\.|[^"\\])*"/g, "hljs-string");
      source = stashSnippetHighlight(source, placeholders, /#[^\r\n]*/g, "hljs-comment");
      if (syntaxLanguage !== "bash" && syntaxLanguage !== "python" && syntaxLanguage !== "powershell") source = stashSnippetHighlight(source, placeholders, /\/\/[^\r\n]*/g, "hljs-comment");
      let markup = escapeCodeHtml(source);
      markup = markup.replace(/(--[A-Za-z][\w-]*|-\w\b)/g, "<span class=\"hljs-attribute\">$1</span>");
      markup = markup.replace(/\b\d+(?:\.\d+)?\b/g, "<span class=\"hljs-number\">$&</span>");
      markup = markup.replace(/\b(fetch|console|XMLHttpRequest|Headers|FormData|requests|request|Invoke-RestMethod|HttpClient|URLSession|OkHttpClient|Request|Response|curl|wget)\b/g, "<span class=\"hljs-built_in\">$1</span>");
      markup = markup.replace(new RegExp("\\b(" + getSnippetHighlightPattern(syntaxLanguage) + ")\\b", "g"), "<span class=\"hljs-keyword\">$1</span>");
      return restoreSnippetHighlightPlaceholders(markup, placeholders);
    }


    function escapeCookieHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => {
        if (char === "&") return "&amp;";
        if (char === "<") return "&lt;";
        if (char === ">") return "&gt;";
        if (char === "\"") return "&quot;";
        return "&#39;";
      });
    }

    function formatCookiePreview(cookie) {
      const parts = [`${cookie.name || "name"}=${cookie.value || ""}`];
      if (cookie.path) parts.push(`Path=${cookie.path}`);
      if (cookie.expires) parts.push(`Expires=${cookie.expires}`);
      if (cookie.secure) parts.push("Secure");
      if (cookie.httpOnly) parts.push("HttpOnly");
      if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite.charAt(0).toUpperCase()}${cookie.sameSite.slice(1)}`);
      return parts.join("; ");
    }

    function findCookieDomain(document, domainId) {
      return (document?.domains || []).find((domain) => domain.id === domainId) || null;
    }

    function findCookieInDomain(domain, cookieId) {
      return (domain?.cookies || []).find((cookie) => cookie.id === cookieId) || null;
    }

    function renderCookieEditor(view, domain, cookie) {
      const editingCookie = cookie || { id: "", name: "", value: "", path: "/", expires: "", secure: false, httpOnly: false, sameSite: "", enabled: true };
      return `
        <div class="api-client-cookie-editor" data-cookie-domain-id="${escapeCookieHtml(domain.id)}" data-cookie-id="${escapeCookieHtml(editingCookie.id)}">
          <div class="api-client-cookie-editor-grid">
            <label>Name<input class="api-client-cookie-name" value="${escapeCookieHtml(editingCookie.name)}" placeholder="Cookie name"></label>
            <label>Value<input class="api-client-cookie-value" value="${escapeCookieHtml(editingCookie.value)}" placeholder="Cookie value"></label>
            <label>Path<input class="api-client-cookie-path" value="${escapeCookieHtml(editingCookie.path || "/")}" placeholder="/"></label>
            <label>Expires<input class="api-client-cookie-expires" value="${escapeCookieHtml(editingCookie.expires)}" placeholder="Tue, 06 Jul 2027 04:42:52 GMT"></label>
            <label>SameSite<select class="api-client-cookie-same-site">
              <option value=""${editingCookie.sameSite ? "" : " selected"}>Unspecified</option>
              <option value="lax"${editingCookie.sameSite === "lax" ? " selected" : ""}>Lax</option>
              <option value="strict"${editingCookie.sameSite === "strict" ? " selected" : ""}>Strict</option>
              <option value="none"${editingCookie.sameSite === "none" ? " selected" : ""}>None</option>
            </select></label>
          </div>
          <div class="api-client-cookie-flags">
            <label><input class="api-client-cookie-enabled" type="checkbox"${editingCookie.enabled !== false ? " checked" : ""}> Enabled</label>
            <label><input class="api-client-cookie-secure" type="checkbox"${editingCookie.secure ? " checked" : ""}> Secure</label>
            <label><input class="api-client-cookie-http-only" type="checkbox"${editingCookie.httpOnly ? " checked" : ""}> HttpOnly</label>
          </div>
          <textarea class="api-client-cookie-preview" readonly>${escapeCookieHtml(formatCookiePreview(editingCookie))}</textarea>
          <div class="api-client-cookie-editor-actions">
            ${editingCookie.id ? '<button class="tool-button danger api-client-cookie-delete-editor" type="button" data-cookie-action="delete-cookie">Delete</button>' : ""}
            <button class="tool-button api-client-cookie-cancel" type="button" data-cookie-action="cancel-cookie">Cancel</button>
            <button class="tool-button primary api-client-cookie-save" type="button" data-cookie-action="save-cookie">Save</button>
          </div>
        </div>`;
    }

    function renderCookieManager(view) {
      if (!view?.cookieLayer || !view.cookieContent) return;
      const document = normalizeCookieManagerDocument(view.cookiesDocument || cookiesDocument);
      const editing = view.editingCookie || null;
      if (!document.domains.length) {
        view.cookieContent.innerHTML = `
          <div class="api-client-cookie-empty">
            <i class="bi bi-cookie" aria-hidden="true"></i>
            <strong>No cookies available</strong>
            <span>Add a domain, then add cookies for requests to that domain.</span>
          </div>`;
        return;
      }
      view.cookieContent.innerHTML = document.domains.map((domain) => {
        const cookieCount = domain.cookies.length === 1 ? "1 cookie" : `${domain.cookies.length} cookies`;
        const editorCookie = editing?.domainId === domain.id ? findCookieInDomain(domain, editing.cookieId) : null;
        const shouldRenderEditor = editing?.domainId === domain.id;
        return `
          <section class="api-client-cookie-domain" data-cookie-domain-id="${escapeCookieHtml(domain.id)}">
            <div class="api-client-cookie-domain-header">
              <div><strong>${escapeCookieHtml(domain.domain)}</strong><span>${escapeCookieHtml(cookieCount)}</span></div>
              <button class="tool-button icon-button" type="button" title="Delete domain" aria-label="Delete domain" data-cookie-action="delete-domain"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            </div>
            <div class="api-client-cookie-list">
              ${domain.cookies.map((cookie) => `<button class="api-client-cookie-chip" type="button" data-cookie-action="edit-cookie" data-cookie-id="${escapeCookieHtml(cookie.id)}"><span>${escapeCookieHtml(cookie.name)}</span><i class="bi bi-x" aria-hidden="true" data-cookie-action="delete-cookie" data-cookie-id="${escapeCookieHtml(cookie.id)}"></i></button>`).join("")}
              <button class="tool-button primary api-client-cookie-add-cookie" type="button" data-cookie-action="add-cookie">+ Add Cookie</button>
            </div>
            ${shouldRenderEditor ? renderCookieEditor(view, domain, editorCookie) : ""}
          </section>`;
      }).join("");
    }

    async function openCookieManagerLayer(view) {
      if (!view?.cookieLayer) return;
      await loadCookiesOnce();
      view.cookiesDocument = cookiesDocument;
      renderCookieManager(view);
      view.cookieLayer.hidden = false;
      view.cookieLayer.classList?.add?.("open");
      view.cookieButton?.setAttribute?.("aria-expanded", "true");
      view.cookieDomainInput?.focus?.();
    }

    function closeCookieManagerLayer(view) {
      if (!view?.cookieLayer) return;
      view.cookieLayer.hidden = true;
      view.cookieLayer.classList?.remove?.("open");
      view.cookieButton?.setAttribute?.("aria-expanded", "false");
      view.editingCookie = null;
    }

    function readCookieEditor(view) {
      const editor = view.cookieLayer?.querySelector?.(".api-client-cookie-editor");
      if (!editor) return null;
      return {
        id: editor.dataset.cookieId || createCookieJarId("cookie"),
        name: editor.querySelector(".api-client-cookie-name")?.value?.trim() || "",
        value: editor.querySelector(".api-client-cookie-value")?.value || "",
        path: editor.querySelector(".api-client-cookie-path")?.value || "/",
        expires: editor.querySelector(".api-client-cookie-expires")?.value || "",
        secure: editor.querySelector(".api-client-cookie-secure")?.checked === true,
        httpOnly: editor.querySelector(".api-client-cookie-http-only")?.checked === true,
        sameSite: editor.querySelector(".api-client-cookie-same-site")?.value || "",
        enabled: editor.querySelector(".api-client-cookie-enabled")?.checked !== false
      };
    }

    function updateCookiePreview(view) {
      const editor = view.cookieLayer?.querySelector?.(".api-client-cookie-editor");
      const preview = editor?.querySelector?.(".api-client-cookie-preview");
      const cookie = readCookieEditor(view);
      if (preview && cookie) preview.value = formatCookiePreview(cookie);
    }

    async function handleCookieAction(view, actionElement) {
      const action = actionElement?.dataset?.cookieAction;
      const document = normalizeCookieManagerDocument(view.cookiesDocument || cookiesDocument);
      const domainElement = actionElement?.closest?.(".api-client-cookie-domain");
      const domainId = domainElement?.dataset?.cookieDomainId || view.editingCookie?.domainId || "";
      const domain = findCookieDomain(document, domainId);
      if (action === "add-domain") {
        const domainName = normalizeCookieDomainName(view.cookieDomainInput?.value || "");
        if (!domainName) return alertUser("Enter a domain name or URL.");
        let nextDomain = document.domains.find((item) => item.domain === domainName);
        if (!nextDomain) {
          nextDomain = { id: createCookieJarId("cookie_domain"), domain: domainName, cookies: [] };
          document.domains.push(nextDomain);
        }
        view.cookieDomainInput.value = "";
        await persistCookies(document);
        view.cookiesDocument = cookiesDocument;
        view.editingCookie = { domainId: nextDomain.id, cookieId: "" };
        renderCookieManager(view);
        return;
      }
      if (!domain) return;
      if (action === "delete-domain") {
        document.domains = document.domains.filter((item) => item.id !== domain.id);
        view.editingCookie = null;
        await persistCookies(document);
        return;
      }
      if (action === "add-cookie") {
        view.editingCookie = { domainId: domain.id, cookieId: "" };
        renderCookieManager(view);
        return;
      }
      if (action === "edit-cookie") {
        const cookieId = actionElement.dataset.cookieId;
        view.editingCookie = { domainId: domain.id, cookieId };
        renderCookieManager(view);
        return;
      }
      if (action === "delete-cookie") {
        const cookieId = actionElement.dataset.cookieId || view.editingCookie?.cookieId;
        domain.cookies = domain.cookies.filter((cookie) => cookie.id !== cookieId);
        view.editingCookie = null;
        await persistCookies(document);
        return;
      }
      if (action === "cancel-cookie") {
        view.editingCookie = null;
        renderCookieManager(view);
        return;
      }
      if (action === "save-cookie") {
        const cookie = readCookieEditor(view);
        if (!cookie?.name) return alertUser("Enter a cookie name.");
        const index = domain.cookies.findIndex((item) => item.id === cookie.id);
        if (index >= 0) domain.cookies[index] = cookie;
        else domain.cookies.push(cookie);
        view.editingCookie = null;
        await persistCookies(document);
      }
    }
    function renderHighlightedCodeSnippet(view, snippet) {
      if (!view?.codeSnippetCode) return;
      const syntaxLanguage = codeSnippets?.getSnippetSyntaxLanguage?.(getCodeSnippetLanguageId(view)) || "";
      view.codeSnippetCode.className = syntaxLanguage ? `hljs language-${syntaxLanguage}` : "";
      if (syntaxLanguage && global.hljs?.highlight) {
        try {
          view.codeSnippetCode.innerHTML = global.hljs.highlight(snippet, { language: syntaxLanguage, ignoreIllegals: true }).value;
          return;
        } catch (_error) {
        }
      }
      view.codeSnippetCode.innerHTML = syntaxLanguage ? buildFallbackHighlightedSnippet(snippet, syntaxLanguage) : escapeCodeHtml(snippet);
    }

    function renderCodeSnippet(view) {
      if (!codeSnippets?.buildSnippet) return "";
      const snippet = codeSnippets.buildSnippet(getCodeSnippetLanguageId(view), buildRequestPayload(view));
      view.currentCodeSnippet = snippet;
      renderHighlightedCodeSnippet(view, snippet);
      return snippet;
    }

    function openCodeSnippetLayer(view) {
      if (!view?.codeLayer) return;
      try {
        renderCodeSnippet(view);
      } catch (error) {
        alertUser(error?.message || "Unable to generate code snippet.");
        return;
      }
      view.codeLayer.hidden = false;
      view.codeLayer.classList?.add?.("open");
      view.codeButton?.setAttribute?.("aria-expanded", "true");
      view.codeLanguageSelect?.focus?.();
    }

    function closeCodeSnippetLayer(view) {
      if (!view?.codeLayer) return;
      view.codeLayer.hidden = true;
      view.codeLayer.classList?.remove?.("open");
      view.codeButton?.setAttribute?.("aria-expanded", "false");
    }

    function flashCodeCopyButton(view) {
      const icon = view?.codeCopyButton?.querySelector?.("i");
      if (!icon) return;
      icon.className = "bi bi-check-lg";
      const resetIcon = () => { icon.className = "bi bi-copy"; };
      if (typeof global.setTimeout === "function") global.setTimeout(resetIcon, 1500);
      else if (typeof setTimeout === "function") setTimeout(resetIcon, 1500);
    }

    async function copyCodeSnippet(view) {
      try {
        const snippet = view?.currentCodeSnippet || renderCodeSnippet(view);
        const copy = deps.copyTextToClipboard || writeTextToClipboard;
        await copy(snippet);
        flashCodeCopyButton(view);
      } catch (error) {
        alertUser(error?.message || "Unable to copy code snippet.");
      }
    }

    function createApiClientShell() {
      const shell = createElement("div", "api-client-viewer");
      shell.innerHTML = `
        <div class="api-client-toolbar">
          <select class="api-client-method" aria-label="HTTP method"></select>
          <input class="api-client-url" type="url" placeholder="https://api.example.com/resource" aria-label="Request URL">
          <select class="api-client-environment-select" aria-label="API Client environment"><option value="">No Environment</option></select>
          <button class="tool-button api-client-send" type="button"><i class="bi bi-send"></i><span>Send</span></button>
          <div class="api-client-save-menu">
            <button class="tool-button api-client-save" type="button"><i class="bi bi-save"></i><span>Save</span></button>
            <button class="tool-button api-client-save-toggle" type="button" title="Choose save action" aria-label="Choose save action" aria-expanded="false"><i class="bi bi-caret-down-fill"></i></button>
            <div class="dropdown-menu action-menu api-client-save-options" hidden>
              <button class="dropdown-item action-menu-item api-client-save-as" type="button"><i class="bi bi-save me-2" aria-hidden="true"></i><span>Save As</span></button>
            </div>
          </div>
        </div>
        <div class="api-client-workspace">
          <section class="api-client-section api-client-request-section">
            <div class="api-client-tabbar api-client-request-tabbar">
              <div class="api-client-request-tabs" role="tablist" aria-label="Request editor">
                <button class="api-client-tab active" type="button" data-api-tab="params">Params</button>
                <button class="api-client-tab" type="button" data-api-tab="headers">Headers</button>
                <button class="api-client-tab" type="button" data-api-tab="body">Body</button>
              </div>
              <button class="tool-button icon-button api-client-cookie-button" type="button" title="Manage cookies" aria-label="Manage cookies" aria-expanded="false"><i class="bi bi-cookie" aria-hidden="true"></i></button>
              <button class="tool-button icon-button api-client-code-button" type="button" title="Code snippet" aria-label="Code snippet" aria-expanded="false"><i class="bi bi-code-slash" aria-hidden="true"></i></button>
            </div>
            <div class="api-client-section-content api-client-request-content">
              <div class="api-client-tab-panel api-client-params-panel" data-api-panel="params">
                <div class="api-client-editor-modebar">
                  <button class="api-client-mode active" type="button" data-editor="params" data-mode="table">Form edit</button>
                  <button class="api-client-mode" type="button" data-editor="params" data-mode="bulk">Raw edit</button>
                </div>
                <div class="api-client-kv-host api-client-params-table"></div>
                <textarea class="api-client-params api-client-bulk-editor" spellcheck="false" hidden></textarea>
              </div>
              <div class="api-client-tab-panel api-client-headers-panel" data-api-panel="headers" hidden>
                <div class="api-client-editor-modebar">
                  <button class="api-client-mode active" type="button" data-editor="headers" data-mode="table">Form edit</button>
                  <button class="api-client-mode" type="button" data-editor="headers" data-mode="bulk">Raw edit</button>
                </div>
                <div class="api-client-kv-host api-client-headers-table"></div>
                <textarea class="api-client-headers api-client-bulk-editor" spellcheck="false" hidden></textarea>
              </div>
              <div class="api-client-tab-panel api-client-body-panel" data-api-panel="body" hidden>
                <div class="api-client-body-group">
                  <div class="api-client-body-options" role="radiogroup" aria-label="Request body type">
                    <label><input type="radio" name="api-client-body-mode" value="none"> none</label>
                    <label><input type="radio" name="api-client-body-mode" value="form-data"> form-data</label>
                    <label><input type="radio" name="api-client-body-mode" value="raw"> raw</label>
                    <label><input type="radio" name="api-client-body-mode" value="json"> Json</label>
                  </div>
                  <div class="api-client-body-mode-panel" data-body-panel="none">No request body will be sent.</div>
                  <div class="api-client-body-mode-panel" data-body-panel="form-data" hidden>
                    <div class="api-client-editor-modebar">
                      <button class="api-client-mode active" type="button" data-editor="form-data" data-mode="table">Form edit</button>
                      <button class="api-client-mode" type="button" data-editor="form-data" data-mode="bulk">Raw edit</button>
                    </div>
                    <div class="api-client-kv-host api-client-form-data-table"></div>
                    <textarea class="api-client-form-data api-client-bulk-editor" spellcheck="false" hidden></textarea>
                  </div>
                  <div class="api-client-body-mode-panel" data-body-panel="raw" hidden>
                    <textarea class="api-client-body" spellcheck="false"></textarea>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <div class="api-client-split-pane-divider" role="separator" aria-orientation="horizontal" aria-label="Resize request and response panes" tabindex="0"></div>
          <section class="api-client-section api-client-response-section">
            <div class="api-client-response-header">
              <div class="api-client-tabbar" role="tablist" aria-label="Response viewer">
                <button class="api-client-tab active" type="button" data-response-tab="body">Body</button>
                <button class="api-client-tab" type="button" data-response-tab="cookies">Cookies</button>
                <button class="api-client-tab" type="button" data-response-tab="headers">Headers</button>
                <button class="api-client-tab" type="button" data-response-tab="console">Console</button>
              </div>
              <div class="api-client-response-info">
                <span class="api-client-response-info-status">Status: --</span>
                <span class="api-client-response-info-time">Time: --</span>
                <span class="api-client-response-info-size">Size: --</span>
              </div>
            </div>
            <div class="api-client-response-meta" hidden></div>
            <div class="api-client-section-content api-client-response-content">
              <div class="api-client-tab-panel api-client-response-body-panel" data-response-panel="body">
                <div class="api-client-editor-modebar api-client-response-body-modebar">
                  <div class="api-client-response-view-tabs">
                    <button class="api-client-mode active" type="button" data-response-body-mode="preview">Preview</button>
                    <button class="api-client-mode" type="button" data-response-body-mode="raw">Raw</button>
                    <button class="api-client-mode" type="button" data-response-body-mode="json">Json</button>
                  </div>
                  <label class="api-client-response-render-label">Render
                    <select class="api-client-response-render-select" aria-label="Response preview render format">
                      <option value="auto">Auto</option>
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="html">HTML</option>
                      <option value="xml">XML</option>
                      <option value="binary">Binary</option>
                    </select>
                  </label>
                </div>
                <div class="api-client-response-body-shell">
                  <button class="tool-button icon-button api-client-response-copy" type="button" title="Copy response body" aria-label="Copy response body"><i class="bi bi-copy" aria-hidden="true"></i></button>
                  <div class="api-client-response-preview" data-response-body-panel="preview">
                    <pre class="api-client-response-body"></pre>
                    <iframe class="api-client-response-preview-frame" title="Response HTML preview" sandbox="" hidden></iframe>
                  </div>
                  <pre class="api-client-response-body-raw" data-response-body-panel="raw" hidden></pre>
                  <pre class="api-client-response-body-json" data-response-body-panel="json" hidden></pre>
                </div>
              </div>
              <div class="api-client-tab-panel api-client-response-cookies" data-response-panel="cookies" hidden>No cookies returned.</div>
              <div class="api-client-tab-panel api-client-response-headers-panel" data-response-panel="headers" hidden>
                <div class="api-client-response-headers-shell">
                  <button class="tool-button icon-button api-client-response-copy api-client-response-headers-copy" type="button" title="Copy response headers" aria-label="Copy response headers"><i class="bi bi-copy" aria-hidden="true"></i></button>
                  <pre class="api-client-response-headers" hidden></pre>
                  <div class="api-client-response-headers-table">No response headers.</div>
                </div>
              </div>
              <div class="api-client-tab-panel api-client-response-console-panel" data-response-panel="console" hidden>
                <div class="api-client-console-grid">
                  <section class="api-client-console-section">
                    <h4>Raw request sent</h4>
                    <pre class="api-client-console-request">No request sent yet.</pre>
                  </section>
                  <section class="api-client-console-section">
                    <h4>Raw response returned</h4>
                    <pre class="api-client-console-response">No response received yet.</pre>
                  </section>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div class="api-client-cookie-layer" hidden>
          <aside class="api-client-cookie-drawer" role="dialog" aria-modal="false" aria-labelledby="api-client-cookie-title">
            <div class="api-client-cookie-header">
              <div class="api-client-cookie-title-row">
                <i class="bi bi-cookie" aria-hidden="true"></i>
                <h3 id="api-client-cookie-title">Manage Cookies</h3>
              </div>
              <button class="tool-button icon-button api-client-cookie-close" type="button" title="Close cookies" aria-label="Close cookies"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            </div>
            <div class="api-client-cookie-add-domain">
              <input class="api-client-cookie-domain-input" type="text" placeholder="Type a domain name or URL" aria-label="Cookie domain name or URL">
              <button class="tool-button primary api-client-cookie-add-domain-button" type="button" data-cookie-action="add-domain">Add</button>
            </div>
            <div class="api-client-cookie-note">Cookie jar values are sent as Cookie headers for matching API Client request domains.</div>
            <div class="api-client-cookie-content"></div>
            <div class="api-client-cookie-footer">Cookies are stored in the current MD-Editor profile and applied only to API Client requests. Browser interceptor, cookie capture, whitelist domains, and browser cookie syncing are not included.</div>
          </aside>
        </div>        <div class="api-client-code-layer" hidden>
          <aside class="api-client-code-drawer" role="dialog" aria-modal="false" aria-labelledby="api-client-code-title">
            <div class="api-client-code-header">
              <div class="api-client-code-title-row">
                <i class="bi bi-code-slash" aria-hidden="true"></i>
                <h3 id="api-client-code-title">Code snippet</h3>
              </div>
              <button class="tool-button icon-button api-client-code-close" type="button" title="Close code snippet" aria-label="Close code snippet"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
            </div>
            <div class="api-client-code-controls">
              <select class="api-client-code-language" aria-label="Code snippet language"></select>
              <button class="tool-button icon-button api-client-code-copy" type="button" title="Copy code snippet" aria-label="Copy code snippet"><i class="bi bi-copy" aria-hidden="true"></i></button>
            </div>
            <pre class="api-client-code-snippet"><code></code></pre>
          </aside>
        </div>
      `;
      return shell;
    }
    /**
     * Mount the API Client UI for an api-client tab.
     */
    function mountApiClientTab(tab, root) {
      if (!tab?.id || !root) return null;
      const existingView = apiClientViews.get(tab.id);
      if (existingView?.root?.isConnected) {
        activeApiClientTabId = tab.id;
        renderSidebarForView(existingView);
        return existingView;
      }
      root.textContent = "";
      const shell = createApiClientShell();
      root.appendChild(shell);
      const view = {
        tab,
        root,
        shell,
        workspace: shell.querySelector(".api-client-workspace"),
        splitPaneDivider: shell.querySelector(".api-client-split-pane-divider"),
        history: recentHistoryLoaded ? recentHistory : tab.apiClient?.history || [],
        methodSelect: shell.querySelector(".api-client-method"),
        urlInput: shell.querySelector(".api-client-url"),
        environmentSelect: shell.querySelector(".api-client-environment-select"),
        paramsInput: shell.querySelector(".api-client-params"),
        paramsTable: shell.querySelector(".api-client-params-table"),
        headersInput: shell.querySelector(".api-client-headers"),
        headersTable: shell.querySelector(".api-client-headers-table"),
        bodyGroup: shell.querySelector(".api-client-body-group"),
        bodyInput: shell.querySelector(".api-client-body"),
        formDataInput: shell.querySelector(".api-client-form-data"),
        formDataTable: shell.querySelector(".api-client-form-data-table"),
        saveMenuWrapper: shell.querySelector(".api-client-save-menu"),
        saveButton: shell.querySelector(".api-client-save"),
        saveToggleButton: shell.querySelector(".api-client-save-toggle"),
        saveMenu: shell.querySelector(".api-client-save-options"),
        saveAsButton: shell.querySelector(".api-client-save-as"),
        sendButton: shell.querySelector(".api-client-send"),
        cookieButton: shell.querySelector(".api-client-cookie-button"),
        cookieLayer: shell.querySelector(".api-client-cookie-layer"),
        cookieCloseButton: shell.querySelector(".api-client-cookie-close"),
        cookieDomainInput: shell.querySelector(".api-client-cookie-domain-input"),
        cookieContent: shell.querySelector(".api-client-cookie-content"),
        codeButton: shell.querySelector(".api-client-code-button"),
        codeLayer: shell.querySelector(".api-client-code-layer"),
        codeCloseButton: shell.querySelector(".api-client-code-close"),
        codeLanguageSelect: shell.querySelector(".api-client-code-language"),
        codeCopyButton: shell.querySelector(".api-client-code-copy"),
        codeSnippetCode: shell.querySelector(".api-client-code-snippet code"),
        responseMeta: shell.querySelector(".api-client-response-meta"),
        responseHeaders: shell.querySelector(".api-client-response-headers"),
        responseHeadersTable: shell.querySelector(".api-client-response-headers-table"),
        responseHeadersCopyButton: shell.querySelector(".api-client-response-headers-copy"),
        responseCookies: shell.querySelector(".api-client-response-cookies"),
        responseBody: shell.querySelector(".api-client-response-body"),
        responseRawBody: shell.querySelector(".api-client-response-body-raw"),
        responseJsonBody: shell.querySelector(".api-client-response-body-json"),
        responsePreviewFrame: shell.querySelector(".api-client-response-preview-frame"),
        responseRenderSelect: shell.querySelector(".api-client-response-render-select"),
        responseConsoleRequest: shell.querySelector(".api-client-console-request"),
        responseConsoleResponse: shell.querySelector(".api-client-console-response"),
        responseCopyButton: shell.querySelector(".api-client-response-copy"),
        responseInfoStatus: shell.querySelector(".api-client-response-info-status"),
        responseInfoTime: shell.querySelector(".api-client-response-info-time"),
        responseInfoSize: shell.querySelector(".api-client-response-info-size"),
        requestTabButtons: Object.fromEntries(Array.from(shell.querySelectorAll("[data-api-tab]")).map((button) => [button.dataset.apiTab, button])),
        requestPanels: Object.fromEntries(Array.from(shell.querySelectorAll("[data-api-panel]")).map((panel) => [panel.dataset.apiPanel, panel])),
        bodyModeInputs: Array.from(shell.querySelectorAll("input[name='api-client-body-mode']")),
        bodyPanels: Object.fromEntries(Array.from(shell.querySelectorAll("[data-body-panel]")).map((panel) => [panel.dataset.bodyPanel, panel])),
        responseTabButtons: Object.fromEntries(Array.from(shell.querySelectorAll("[data-response-tab]")).map((button) => [button.dataset.responseTab, button])),
        responsePanels: Object.fromEntries(Array.from(shell.querySelectorAll("[data-response-panel]")).map((panel) => [panel.dataset.responsePanel, panel])),
        responseBodyModeButtons: Object.fromEntries(Array.from(shell.querySelectorAll("[data-response-body-mode]")).map((button) => [button.dataset.responseBodyMode, button])),
        responseBodyPanels: Object.fromEntries(Array.from(shell.querySelectorAll("[data-response-body-panel]")).map((panel) => [panel.dataset.responseBodyPanel, panel]))
      };
      view.splitPaneController = splitPane?.bindResizableSplitPane?.({
        workspace: view.workspace,
        separator: view.splitPaneDivider,
        initialRatio: tab.apiClient?.splitRatio,
        onRatioChange(splitRatio) {
          view.tab.apiClient = { ...(view.tab.apiClient || {}), splitRatio };
        }
      });
      if (view.responseRenderSelect) view.responseRenderSelect.value = getRequestSettings().responseRenderMode;
      REQUEST_METHODS.forEach((method) => {
        const option = document.createElement("option");
        option.value = method;
        option.textContent = method;
        view.methodSelect.appendChild(option);
      });
      loadRequestIntoView(view, {
        method: tab.apiClient?.method || "GET",
        url: tab.apiClient?.url || "",
        paramsText: tab.apiClient?.paramsText,
        headersText: tab.apiClient?.headersText || DEFAULT_HEADERS_TEXT,
        bodyMode: tab.apiClient?.bodyMode,
        bodyText: tab.apiClient?.bodyText || "",
        formDataText: tab.apiClient?.formDataText || ""
      });
      view.methodSelect.addEventListener("change", () => {
        updateBodyVisibility(view);
        syncViewToTabState(view);
      });
      view.urlInput.addEventListener("input", () => syncParamsFromUrl(view));
      view.environmentSelect?.addEventListener?.("change", () => { void selectEnvironment(view.environmentSelect.value).then(() => refreshGeneratedHeaderRows(view)); });
      view.paramsInput.addEventListener("input", () => syncParamsToUrl(view));
      view.headersInput.addEventListener("input", () => {
        renderEditableKeyValueTable(view, "headers");
        syncViewToTabState(view);
      });
      view.bodyInput.addEventListener("input", () => syncViewToTabState(view));
      view.formDataInput.addEventListener("input", () => {
        renderEditableKeyValueTable(view, "form-data");
        syncViewToTabState(view);
      });
      Object.entries(view.requestTabButtons).forEach(([name, button]) => {
        button.addEventListener("click", () => setActivePanel(view.requestTabButtons, view.requestPanels, name));
      });
      Object.entries(view.responseTabButtons).forEach(([name, button]) => {
        button.addEventListener("click", () => setActivePanel(view.responseTabButtons, view.responsePanels, name));
      });
      Object.entries(view.responseBodyModeButtons).forEach(([name, button]) => {
        button.addEventListener("click", () => setActivePanel(view.responseBodyModeButtons, view.responseBodyPanels, name));
      });
      view.responseRenderSelect?.addEventListener?.("change", () => renderResponsePreview(view, view.lastResponseBodyText || "", view.lastResponseContentType || "", view.responseRenderSelect.value));
      view.responseCopyButton?.addEventListener?.("click", () => { void copyResponseBody(view); });
      view.responseHeadersCopyButton?.addEventListener?.("click", () => { void copyResponseHeaders(view); });
      Array.from(shell.querySelectorAll("[data-editor][data-mode]")).forEach((button) => {
        button.addEventListener("click", () => {
          const editor = button.dataset.editor;
          const mode = button.dataset.mode;
          const config = getEditorConfig(view, editor);
          const modeButtons = Array.from(shell.querySelectorAll(`[data-editor='${editor}']`));
          modeButtons.forEach((modeButton) => modeButton.classList.toggle("active", modeButton === button));
          if (config.table) config.table.hidden = mode === "bulk";
          if (config.input) config.input.hidden = mode !== "bulk";
          if (mode === "table") renderEditableKeyValueTable(view, editor);
        });
      });
      view.bodyModeInputs.forEach((input) => input.addEventListener("change", () => {
        if (input.checked) setBodyMode(view, input.value);
      }));
      setSaveButtonMode(view, "save");
      populateCodeSnippetLanguages(view);
      view.saveButton.addEventListener("click", () => { void runSelectedSaveAction(view); });
      view.saveToggleButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSaveMenu(view);
      });
      view.saveAsButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextMode = view.saveAction === "save-as" ? "save" : "save-as";
        setSaveButtonMode(view, nextMode);
        closeSaveMenu(view);
        void runSelectedSaveAction(view);
      });
      view.saveMenuDocumentHandler = (event) => {
        if (!view.saveMenuWrapper?.contains?.(event.target)) closeSaveMenu(view);
      };
      document.addEventListener("click", view.saveMenuDocumentHandler);
      view.cookieButton?.addEventListener?.("click", () => { void openCookieManagerLayer(view); });
      view.cookieCloseButton?.addEventListener?.("click", () => closeCookieManagerLayer(view));
      view.cookieLayer?.addEventListener?.("click", (event) => { const actionElement = event.target?.closest?.("[data-cookie-action]"); if (actionElement) void handleCookieAction(view, actionElement); });
      view.cookieLayer?.addEventListener?.("input", () => updateCookiePreview(view));
      view.cookieLayer?.addEventListener?.("change", () => updateCookiePreview(view));
      view.cookieDomainInput?.addEventListener?.("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void handleCookieAction(view, view.cookieLayer.querySelector("[data-cookie-action='add-domain']")); } });
      view.codeButton?.addEventListener?.("click", () => openCodeSnippetLayer(view));
      view.codeCloseButton?.addEventListener?.("click", () => closeCodeSnippetLayer(view));
      view.codeLanguageSelect?.addEventListener?.("change", () => {
        try {
          renderCodeSnippet(view);
        } catch (error) {
          alertUser(error?.message || "Unable to generate code snippet.");
        }
      });
      view.codeCopyButton?.addEventListener?.("click", () => { void copyCodeSnippet(view); });
      view.codeLayerKeydownHandler = (event) => {
        if (event.key === "Escape" && view.codeLayer?.hidden === false) closeCodeSnippetLayer(view);
      };
      document.addEventListener("keydown", view.codeLayerKeydownHandler);
      view.cookieLayerKeydownHandler = (event) => {
        if (event.key === "Escape" && view.cookieLayer?.hidden === false) closeCookieManagerLayer(view);
      };
      document.addEventListener("keydown", view.cookieLayerKeydownHandler);
      view.sendButton.addEventListener("click", () => {
        if (view.isSending) cancelRequest(view);
        else void sendRequest(view);
      });
      view.urlInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (view.isSending) cancelRequest(view);
          else void sendRequest(view);
        }
      });
      apiClientViews.set(tab.id, view);
      activeApiClientTabId = tab.id;
      view.environmentsDocument = environmentsDocument;
      renderEnvironmentSelector(view);
      renderSidebarForView(view);
      void loadEnvironmentsOnce().then(() => renderSidebarForView(view));
      void loadRecentHistoryOnce().then(() => renderSidebarForView(view));
      if (tab.apiClient?.historyEntry) renderStoredHistoryResult(view, tab.apiClient.historyEntry);
      if (!isDesktopRuntime() && !tab.apiClient?.historyEntry) renderDesktopOnly(view);
      else if (!isDesktopRuntime()) {
        view.sendButton.disabled = true;
      }
      return view;
    }

    function activateApiClientSidebar(tab) {
      activeApiClientTabId = tab?.id || activeApiClientTabId;
      if (tab?.apiClient?.savedRequestId) selectOnlySavedNode(tab.apiClient.savedRequestId);
      const currentView = deps.getSidebarView?.();
      if (currentView && currentView !== "api-client") previousSidebarView = currentView;
      deps.setSidebarView?.("api-client");
      void Promise.all([loadCollectionsOnce(), loadEnvironmentsOnce(), loadRecentHistoryOnce(), loadCookiesOnce()]).then(renderSidebarForActiveView);
    }

    function deactivateApiClientSidebar() {
      if (deps.getSidebarView?.() === "api-client") deps.setSidebarView?.(previousSidebarView || "files");
      activeApiClientTabId = null;
    }

    /**
     * Destroy a mounted API Client tab.
     */
    function destroyApiClientTab(tabId) {
      const view = apiClientViews.get(tabId);
      if (view?.saveMenuDocumentHandler) document.removeEventListener("click", view.saveMenuDocumentHandler);
      if (view?.codeLayerKeydownHandler) document.removeEventListener("keydown", view.codeLayerKeydownHandler);
      view?.splitPaneController?.destroy?.();
      apiClientViews.delete(tabId);
      if (activeApiClientTabId === tabId) activeApiClientTabId = null;
      renderSidebarForActiveView();
    }

    /**
     * Reload profile-backed API Client data after another process changes it.
     */
    async function refreshFromStorage(options = {}) {
      await Promise.all([
        loadCollectionsOnce({ forceReload: true }),
        loadEnvironmentsOnce({ forceReload: true }),
        loadRecentHistoryOnce({ forceReload: true }),
        loadCookiesOnce({ forceReload: true })
      ]);
      renderSidebarForActiveView();
      return { collection: savedCollection, environments: environmentsDocument, history: recentHistory, cookies: cookiesDocument };
    }

    /**
     * Launch an API Client tab through the tab service.
     */
    function openApiClient() {
      const tab = deps.openApiClientInTab?.();
      if (!tab) alertUser("Unable to open API Client.");
      return tab || null;
    }

    sidebar?.bind?.({
      onNewFolder: createFolder,
      onImportCollection: () => { void importPostmanCollection().catch((error) => alertUser(error?.message || "Unable to import Postman collection.")); },
      onExportCollection: () => { void exportPostmanCollection().catch((error) => alertUser(error?.message || "Unable to export Postman collection.")); },
      onNewRequest: createRequestInFolder,
      onSelectRequest: handleSelectSavedNode,
      onOpenRequest: handleOpenSavedRequest,
      onOpenHistory: handleOpenHistory,
      onSelectHistory: handleSelectHistory,
      onDeleteHistoryEntry: deleteHistoryEntry,
      onClearHistory: clearHistory,
      onRenameNode: renameNode,
      onDeleteNode: deleteNode,
      onMoveRequest: moveSavedNode,
      onNewEnvironment: createEnvironment,
      onRenameEnvironment: renameEnvironment,
      onDeleteEnvironment: deleteEnvironment,
      onSelectEnvironment: selectEnvironment,
      onChangeGlobals: (variables) => { void changeGlobalVariables(variables); },
      onChangeEnvironmentVariables: (environmentId, variables) => { void changeEnvironmentVariables(environmentId, variables); },
      onConfirmDeleteVariable: confirmDeleteVariable
    });
    void Promise.all([loadCollectionsOnce(), loadEnvironmentsOnce(), loadRecentHistoryOnce(), loadCookiesOnce()]).then(renderSidebarForActiveView);

    const api = {
      parseHeaderLines,
      applyCookieJarToHeaders,
      getMatchingCookiePairs,
      normalizeCookieManagerDocument,
      parseKeyValueLines,
      serializeKeyValueRows,
      getParamsTextFromUrl,
      applyParamsTextToUrl,
      formatByteSize,
      formatResponseBody,
      formatResponsePreviewBody,
      normalizeResponseRenderMode,
      buildRequestPayload,
      methodAllowsBody,
      resolveEnvironmentVariables,
      resolveRequestSnapshot,
      createVariableMap,
      normalizeRequestSnapshot,
      loadRequestIntoView,
      mountApiClientTab,
      activateApiClientSidebar,
      deactivateApiClientSidebar,
      destroyApiClientTab,
      openApiClient,
      openRequestInNewTab,
      refreshFromStorage,
      revealSavedRequest,
      saveActiveRequest: saveCurrentRequest,
      trimRecentHistoryToLimit,
      exportPostmanCollection,
      importPostmanCollection,
      getMountedApiClientCount() {
        return apiClientViews.size;
      },
      _test: { renderResponse, renderError, renderResponsePreview, addHistoryEntry, renderStoredHistoryResult, getRequestTabTitle, syncViewToTabState, setBodyMode, setSaveButtonMode, flashSaveButton, setSending, toggleSaveMenu, closeSaveMenu, renderCodeSnippet, openCodeSnippetLayer, closeCodeSnippetLayer, copyCodeSnippet, copyResponseBody, copyResponseHeaders, renderConsoleRequest, renderConsoleResponse, renderConsoleError, getGeneratedCookieHeaderRow, renderCookieManager, openCookieManagerLayer, closeCookieManagerLayer, handleCookieAction, updateCookiePreview, loadCollectionsOnce, loadRecentHistoryOnce, loadEnvironmentsOnce, loadCookiesOnce, persistEnvironments, persistCookies, refreshFromStorage, revealSavedRequest, trimRecentHistoryToLimit, exportPostmanCollection, importPostmanCollection }
    };

    app.registerModule?.("apiClient", api);
    if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerApiClient };
    return api;
  }

  global.registerMarkdownViewerApiClient = registerMarkdownViewerApiClient;
})(typeof window !== "undefined" ? window : globalThis, document);
