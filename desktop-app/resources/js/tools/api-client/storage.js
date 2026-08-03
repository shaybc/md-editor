(function(global) {
  "use strict";

  const COLLECTIONS_STORAGE_KEY = "markdownViewerApiClientCollections";
  const RECENT_HISTORY_STORAGE_KEY = "markdownViewerApiClientRecentHistory";
  const ENVIRONMENTS_STORAGE_KEY = "markdownViewerApiClientEnvironments";
  const COOKIES_STORAGE_KEY = "markdownViewerApiClientCookies";
  const COLLECTIONS_PROFILE_FILE = "api-client/collections.json";
  const RECENT_HISTORY_PROFILE_FILE = "api-client/recent-history.json";
  const ENVIRONMENTS_PROFILE_FILE = "api-client/environments.json";
  const COOKIES_PROFILE_FILE = "api-client/cookies.json";
  const POSTMAN_COLLECTION_SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
  const ROOT_ID = "root";

  function createId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function createDefaultCollection() {
    return {
      version: 1,
      root: {
        id: ROOT_ID,
        type: "folder",
        name: "Saved Requests",
        children: []
      }
    };
  }

  function createDefaultEnvironments() {
    return {
      version: 1,
      activeEnvironmentId: "",
      globals: [],
      environments: []
    };
  }

  function createDefaultCookies() {
    return {
      version: 1,
      domains: []
    };
  }

  function normalizeBodyMode(node) {
    const mode = String(node?.bodyMode || "").toLowerCase();
    if (["none", "form-data", "raw", "json"].includes(mode)) return mode;
    if (String(node?.formDataText || "").trim()) return "form-data";
    if (String(node?.bodyText || "").trim()) return "raw";
    return "none";
  }

  function normalizeRequestNode(node) {
    return {
      id: String(node?.id || createId("request")),
      type: "request",
      name: String(node?.name || "Untitled Request"),
      method: String(node?.method || "GET").toUpperCase(),
      url: String(node?.url || ""),
      paramsText: String(node?.paramsText || ""),
      headersText: String(node?.headersText || ""),
      bodyMode: normalizeBodyMode(node),
      bodyText: String(node?.bodyText || ""),
      formDataText: String(node?.formDataText || "")
    };
  }

  function normalizeRequestSnapshot(node) {
    const normalized = normalizeRequestNode({ ...node, id: "request", name: "Request" });
    return {
      method: normalized.method,
      url: normalized.url,
      paramsText: normalized.paramsText,
      headersText: normalized.headersText,
      bodyMode: normalized.bodyMode,
      bodyText: normalized.bodyText,
      formDataText: normalized.formDataText
    };
  }

  function normalizeFolderNode(node, fallbackName) {
    const children = Array.isArray(node?.children) ? node.children : [];
    return {
      id: String(node?.id || createId("folder")),
      type: "folder",
      name: String(node?.name || fallbackName || "Folder"),
      children: children.map(normalizeCollectionNode).filter(Boolean)
    };
  }

  function normalizeCollectionNode(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "request") return normalizeRequestNode(node);
    return normalizeFolderNode(node);
  }

  function normalizeCollectionDocument(document) {
    const normalized = createDefaultCollection();
    if (document?.root) {
      normalized.root = normalizeFolderNode(document.root, "Saved Requests");
      normalized.root.id = ROOT_ID;
      normalized.root.type = "folder";
    }
    return normalized;
  }

  function parseKeyValueText(text, separators = [":", "="]) {
    return String(text || "").split(/\r?\n/).map((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return null;
      const enabled = !trimmed.startsWith("//");
      const content = enabled ? trimmed : trimmed.slice(2).trim();
      let separatorIndex = -1;
      for (const separator of separators) {
        const index = content.indexOf(separator);
        if (index > 0 && (separatorIndex < 0 || index < separatorIndex)) separatorIndex = index;
      }
      if (separatorIndex < 0) return { enabled, key: content, value: "" };
      return {
        enabled,
        key: content.slice(0, separatorIndex).trim(),
        value: content.slice(separatorIndex + 1).trim()
      };
    }).filter((row) => row && (row.key || row.value));
  }

  function serializeKeyValueText(rows, separator = ": ") {
    return (rows || [])
      .filter((row) => row?.key || row?.value)
      .map((row) => `${row.enabled === false ? "//" : ""}${String(row.key || "").trim()}${separator}${String(row.value || "").trim()}`)
      .join("\n");
  }

  function getUrlQueryRows(url) {
    try {
      const parsedUrl = new URL(String(url || ""));
      return Array.from(parsedUrl.searchParams.entries()).map(([key, value]) => ({ enabled: true, key, value }));
    } catch (_error) {
      return [];
    }
  }

  function createPostmanUrl(request) {
    const rawUrl = String(request?.url || "");
    const paramsRows = parseKeyValueText(request?.paramsText);
    const queryRows = paramsRows.length ? paramsRows : getUrlQueryRows(rawUrl);
    const postmanUrl = { raw: rawUrl };
    try {
      const parsedUrl = new URL(rawUrl);
      postmanUrl.protocol = parsedUrl.protocol.replace(/:$/, "");
      postmanUrl.host = parsedUrl.hostname ? parsedUrl.hostname.split(".") : [];
      postmanUrl.path = parsedUrl.pathname.split("/").filter(Boolean);
    } catch (_error) {
      // Postman variables such as {{baseUrl}} are valid saved request text even when URL parsing fails.
    }
    if (queryRows.length) {
      postmanUrl.query = queryRows.map((row) => ({
        key: row.key,
        value: row.value || "",
        disabled: row.enabled === false
      }));
    }
    return postmanUrl;
  }

  function requestNodeToPostmanItem(node) {
    const request = normalizeRequestNode(node);
    const item = {
      name: request.name || "Untitled Request",
      request: {
        method: request.method,
        header: parseKeyValueText(request.headersText).map((row) => ({
          key: row.key,
          value: row.value || "",
          type: "text",
          disabled: row.enabled === false
        })),
        url: createPostmanUrl(request)
      }
    };
    if (request.bodyMode === "raw" || request.bodyMode === "json") {
      item.request.body = { mode: "raw", raw: request.bodyText || "" };
    } else if (request.bodyMode === "form-data") {
      item.request.body = {
        mode: "formdata",
        formdata: parseKeyValueText(request.formDataText).map((row) => ({
          key: row.key,
          value: row.value || "",
          type: "text",
          disabled: row.enabled === false
        }))
      };
    }
    return item;
  }

  function normalizeSelectedExportIds(options) {
    if (!options?.selectedIds) return null;
    if (options.selectedIds instanceof Set) return options.selectedIds;
    if (Array.isArray(options.selectedIds)) return new Set(options.selectedIds.map(String));
    return null;
  }

  function collectionNodeToPostmanItem(node, selectedIds, includeAll = false) {
    const isSelected = !selectedIds || includeAll || selectedIds.has(String(node?.id || ""));
    if (node?.type === "request") return isSelected ? requestNodeToPostmanItem(node) : null;
    const folder = normalizeFolderNode(node);
    const includeChildren = includeAll || !selectedIds || selectedIds.has(folder.id);
    const children = (folder.children || [])
      .map((child) => collectionNodeToPostmanItem(child, selectedIds, includeChildren))
      .filter(Boolean);
    if (!isSelected && !children.length) return null;
    return {
      name: folder.name || "Folder",
      item: children
    };
  }

  function exportCollectionToPostman(collection, options = {}) {
    const normalized = normalizeCollectionDocument(collection);
    const selectedIds = normalizeSelectedExportIds(options);
    const includeAll = !selectedIds || selectedIds.has(ROOT_ID);
    return {
      info: {
        name: normalized.root.name || "Saved Requests",
        schema: POSTMAN_COLLECTION_SCHEMA
      },
      item: (normalized.root.children || [])
        .map((node) => collectionNodeToPostmanItem(node, selectedIds, includeAll))
        .filter(Boolean)
    };
  }

  function isPostmanCollectionDocument(document) {
    return Boolean(document && typeof document === "object" && document.info && Array.isArray(document.item));
  }

  function postmanQueryToParamsText(url) {
    const query = Array.isArray(url?.query) ? url.query : [];
    return serializeKeyValueText(query.map((item) => ({
      enabled: item?.disabled !== true,
      key: String(item?.key || ""),
      value: String(item?.value ?? "")
    })));
  }

  function getPostmanUrlText(url) {
    if (typeof url === "string") return url;
    if (url?.raw) return String(url.raw);
    const protocol = String(url?.protocol || "").trim();
    const host = Array.isArray(url?.host) ? url.host.join(".") : String(url?.host || "");
    const path = Array.isArray(url?.path) ? url.path.join("/") : String(url?.path || "");
    const prefix = protocol ? `${protocol}://` : "";
    const base = host ? `${prefix}${host}${path ? `/${path}` : ""}` : path;
    const queryRows = parseKeyValueText(postmanQueryToParamsText(url)).filter((row) => row.enabled !== false && row.key);
    const queryString = queryRows.map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value || "")}`).join("&");
    return queryString ? `${base}?${queryString}` : base;
  }

  function postmanHeadersToText(headers) {
    const rows = (Array.isArray(headers) ? headers : []).map((header) => ({
      enabled: header?.disabled !== true,
      key: String(header?.key || header?.name || ""),
      value: String(header?.value ?? "")
    }));
    return serializeKeyValueText(rows);
  }

  function postmanBodyToRequestFields(body) {
    const mode = String(body?.mode || "").toLowerCase();
    if (mode === "raw") {
      return { bodyMode: "raw", bodyText: String(body?.raw || ""), formDataText: "" };
    }
    if (mode === "formdata") {
      const rows = (Array.isArray(body?.formdata) ? body.formdata : []).map((item) => ({
        enabled: item?.disabled !== true,
        key: String(item?.key || ""),
        value: String(item?.value ?? item?.src ?? "")
      }));
      return { bodyMode: "form-data", bodyText: "", formDataText: serializeKeyValueText(rows) };
    }
    return { bodyMode: "none", bodyText: "", formDataText: "" };
  }

  function postmanItemToCollectionNode(item) {
    if (!item || typeof item !== "object") return null;
    if (item.request) {
      const request = item.request || {};
      const bodyFields = postmanBodyToRequestFields(request.body);
      const url = request.url;
      return normalizeRequestNode({
        id: createId("request"),
        name: item.name || "Untitled Request",
        method: request.method || "GET",
        url: getPostmanUrlText(url),
        paramsText: postmanQueryToParamsText(typeof url === "object" ? url : null),
        headersText: postmanHeadersToText(request.header),
        ...bodyFields
      });
    }
    return normalizeFolderNode({
      id: createId("folder"),
      type: "folder",
      name: item.name || "Folder",
      children: (Array.isArray(item.item) ? item.item : []).map(postmanItemToCollectionNode).filter(Boolean)
    });
  }

  function importCollectionFromPostman(collection, postmanDocument) {
    if (!isPostmanCollectionDocument(postmanDocument)) throw new Error("The selected file is not a Postman collection.");
    const next = normalizeCollectionDocument(collection);
    const importedNodes = postmanDocument.item.map(postmanItemToCollectionNode).filter(Boolean);
    next.root.children.push(...importedNodes);
    return { collection: next, importedCount: importedNodes.length };
  }
  function normalizeRecentHistoryLimit(limit) {
    const value = Number(limit);
    if (!Number.isFinite(value)) return 50;
    return Math.max(0, Math.min(500, Math.floor(value)));
  }

  function normalizeRecentHistoryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    return {
      request: normalizeRequestSnapshot({
        method: entry.request?.method || entry.method || "GET",
        url: entry.request?.url || entry.url || "",
        paramsText: entry.request?.paramsText || entry.paramsText || "",
        headersText: entry.request?.headersText || entry.headersText || "",
        bodyMode: entry.request?.bodyMode || entry.bodyMode || "",
        bodyText: entry.request?.bodyText || entry.bodyText || "",
        formDataText: entry.request?.formDataText || entry.formDataText || ""
      }),
      result: entry.result && typeof entry.result === "object" ? clone(entry.result) : null,
      error: entry.error && typeof entry.error === "object" ? { message: String(entry.error.message || "Request failed.") } : null
    };
  }

  function normalizeRecentHistoryDocument(document, limit) {
    const entries = Array.isArray(document) ? document : Array.isArray(document?.entries) ? document.entries : [];
    return {
      version: 1,
      entries: entries.map(normalizeRecentHistoryEntry).filter(Boolean).slice(0, normalizeRecentHistoryLimit(limit))
    };
  }

  function normalizeEnvironmentVariable(variable) {
    const type = String(variable?.type || "").toLowerCase() === "secret" ? "secret" : "default";
    return {
      id: String(variable?.id || createId("variable")),
      key: String(variable?.key || variable?.name || ""),
      type,
      initialValue: String(variable?.initialValue ?? variable?.value ?? ""),
      currentValue: String(variable?.currentValue ?? ""),
      enabled: variable?.enabled !== false
    };
  }

  function normalizeEnvironmentVariables(variables) {
    return (Array.isArray(variables) ? variables : [])
      .map(normalizeEnvironmentVariable)
      .filter((variable) => variable.key || variable.initialValue || variable.currentValue);
  }

  function normalizeEnvironment(environment) {
    return {
      id: String(environment?.id || createId("environment")),
      name: String(environment?.name || "New Environment"),
      variables: normalizeEnvironmentVariables(environment?.variables)
    };
  }

  function normalizeEnvironmentsDocument(document) {
    const normalized = createDefaultEnvironments();
    normalized.globals = normalizeEnvironmentVariables(document?.globals);
    normalized.environments = (Array.isArray(document?.environments) ? document.environments : [])
      .map(normalizeEnvironment)
      .filter((environment) => environment.name);
    const activeEnvironmentId = String(document?.activeEnvironmentId || "");
    normalized.activeEnvironmentId = normalized.environments.some((environment) => environment.id === activeEnvironmentId) ? activeEnvironmentId : "";
    return normalized;
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

  function normalizeCookie(cookie) {
    const sameSite = String(cookie?.sameSite || "").toLowerCase();
    const normalizedSameSite = sameSite === "lax" || sameSite === "strict" || sameSite === "none" ? sameSite : "";
    return {
      id: String(cookie?.id || createId("cookie")),
      name: String(cookie?.name || "").trim(),
      value: String(cookie?.value ?? ""),
      path: String(cookie?.path || "/") || "/",
      expires: String(cookie?.expires || ""),
      secure: cookie?.secure === true,
      httpOnly: cookie?.httpOnly === true,
      sameSite: normalizedSameSite,
      enabled: cookie?.enabled !== false
    };
  }

  function normalizeCookieDomain(domain) {
    return {
      id: String(domain?.id || createId("cookie_domain")),
      domain: normalizeCookieDomainName(domain?.domain || domain?.name),
      cookies: (Array.isArray(domain?.cookies) ? domain.cookies : [])
        .map(normalizeCookie)
        .filter((cookie) => cookie.name)
    };
  }

  function normalizeCookiesDocument(document) {
    const normalized = createDefaultCookies();
    normalized.domains = (Array.isArray(document?.domains) ? document.domains : [])
      .map(normalizeCookieDomain)
      .filter((domain) => domain.domain);
    return normalized;
  }
  function findNodeById(folder, nodeId, parent = null) {
    if (!folder || !nodeId) return null;
    if (folder.id === nodeId) return { node: folder, parent };
    for (const child of folder.children || []) {
      if (child.id === nodeId) return { node: child, parent: folder };
      if (child.type === "folder") {
        const match = findNodeById(child, nodeId, child);
        if (match) return match;
      }
    }
    return null;
  }

  function addFolder(collection, parentId, name) {
    const next = normalizeCollectionDocument(collection);
    const parentMatch = findNodeById(next.root, parentId || ROOT_ID) || { node: next.root };
    const parent = parentMatch.node?.type === "folder" ? parentMatch.node : next.root;
    const folder = { id: createId("folder"), type: "folder", name: String(name || "New Folder"), children: [] };
    parent.children.push(folder);
    return { collection: next, folder };
  }

  function upsertRequest(collection, parentId, request, existingId) {
    const next = normalizeCollectionDocument(collection);
    const requestNode = normalizeRequestNode({ ...request, id: existingId || request?.id || createId("request") });
    if (existingId) {
      const existing = findNodeById(next.root, existingId);
      if (existing?.node?.type === "request") {
        Object.assign(existing.node, requestNode, { id: existingId, type: "request" });
        return { collection: next, request: existing.node };
      }
    }
    const parentMatch = findNodeById(next.root, parentId || ROOT_ID) || { node: next.root };
    const parent = parentMatch.node?.type === "folder" ? parentMatch.node : next.root;
    parent.children.push(requestNode);
    return { collection: next, request: requestNode };
  }

  function isDescendantFolder(folder, possibleDescendantId) {
    if (!folder || folder.type !== "folder") return false;
    for (const child of folder.children || []) {
      if (child.id === possibleDescendantId) return true;
      if (child.type === "folder" && isDescendantFolder(child, possibleDescendantId)) return true;
    }
    return false;
  }

  function moveNode(collection, nodeId, targetParentId) {
    const next = normalizeCollectionDocument(collection);
    const source = findNodeById(next.root, nodeId);
    const targetId = String(targetParentId || ROOT_ID);
    const target = targetId === ROOT_ID ? { node: next.root } : findNodeById(next.root, targetId);
    if (!source?.parent?.children || source.node?.id === ROOT_ID || !target?.node || target.node.type !== "folder") {
      return { collection: next, node: source?.node || null, moved: false };
    }
    if (source.parent.id === target.node.id || source.node.id === target.node.id) return { collection: next, node: source.node, moved: false };
    if (source.node.type === "folder" && isDescendantFolder(source.node, target.node.id)) return { collection: next, node: source.node, moved: false };
    source.parent.children = source.parent.children.filter((child) => child.id !== source.node.id);
    target.node.children.push(source.node);
    return { collection: next, node: source.node, moved: true };
  }

  function moveRequest(collection, requestId, targetParentId) {
    const result = moveNode(collection, requestId, targetParentId);
    return { collection: result.collection, request: result.node?.type === "request" ? result.node : null, moved: result.node?.type === "request" && result.moved };
  }

  function renameNode(collection, nodeId, name) {
    const next = normalizeCollectionDocument(collection);
    const match = findNodeById(next.root, nodeId);
    if (match?.node && match.node.id !== ROOT_ID) match.node.name = String(name || match.node.name);
    return next;
  }

  function deleteNode(collection, nodeId) {
    const next = normalizeCollectionDocument(collection);
    const match = findNodeById(next.root, nodeId);
    if (match?.parent?.children && match.node.id !== ROOT_ID) {
      match.parent.children = match.parent.children.filter((child) => child.id !== nodeId);
    }
    return next;
  }

  function findEnvironmentById(document, environmentId) {
    const normalized = normalizeEnvironmentsDocument(document);
    return normalized.environments.find((environment) => environment.id === environmentId) || null;
  }

  function addEnvironment(document, name) {
    const next = normalizeEnvironmentsDocument(document);
    const environment = { id: createId("environment"), name: String(name || "New Environment"), variables: [] };
    next.environments.push(environment);
    next.activeEnvironmentId = environment.id;
    return { environments: next, environment };
  }

  function renameEnvironment(document, environmentId, name) {
    const next = normalizeEnvironmentsDocument(document);
    const environment = next.environments.find((item) => item.id === environmentId);
    if (environment) environment.name = String(name || environment.name);
    return next;
  }

  function deleteEnvironment(document, environmentId) {
    const next = normalizeEnvironmentsDocument(document);
    next.environments = next.environments.filter((environment) => environment.id !== environmentId);
    if (next.activeEnvironmentId === environmentId) next.activeEnvironmentId = "";
    return next;
  }

  function setActiveEnvironment(document, environmentId) {
    const next = normalizeEnvironmentsDocument(document);
    const id = String(environmentId || "");
    next.activeEnvironmentId = id && next.environments.some((environment) => environment.id === id) ? id : "";
    return next;
  }

  function setEnvironmentVariables(document, environmentId, variables) {
    const next = normalizeEnvironmentsDocument(document);
    const environment = next.environments.find((item) => item.id === environmentId);
    if (environment) environment.variables = normalizeEnvironmentVariables(variables);
    return next;
  }

  function setGlobalVariables(document, variables) {
    const next = normalizeEnvironmentsDocument(document);
    next.globals = normalizeEnvironmentVariables(variables);
    return next;
  }

  function registerMarkdownViewerApiClientStorage(app, deps = {}) {
    let cachedCollection = null;
    let cachedRecentHistory = null;
    let cachedEnvironments = null;
    let cachedCookies = null;

    async function getProfilePath(profileFile) {
      return deps.getProfileDataFilePath ? deps.getProfileDataFilePath(profileFile) : null;
    }

    async function ensureParentDirectory(filePath) {
      const Neutralino = deps.Neutralino || global.Neutralino;
      if (!filePath || !Neutralino?.filesystem?.createDirectory) return;
      const normalized = String(filePath).replace(/\\/g, "/");
      const parentPath = normalized.slice(0, normalized.lastIndexOf("/"));
      if (!parentPath) return;
      try {
        await Neutralino.filesystem.createDirectory(parentPath);
      } catch (_error) {
        // Existing folders are fine; writeFile will surface real failures.
      }
    }

    async function loadCollections(options = {}) {
      if (cachedCollection && options.forceReload !== true) return clone(cachedCollection);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(COLLECTIONS_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.readFile) {
        try {
          cachedCollection = normalizeCollectionDocument(JSON.parse(await Neutralino.filesystem.readFile(profilePath)));
          return clone(cachedCollection);
        } catch (_error) {
          cachedCollection = createDefaultCollection();
          return clone(cachedCollection);
        }
      }
      try {
        cachedCollection = normalizeCollectionDocument(JSON.parse(deps.localStorage?.getItem(COLLECTIONS_STORAGE_KEY) || "null"));
      } catch (_error) {
        cachedCollection = createDefaultCollection();
      }
      return clone(cachedCollection);
    }

    async function saveCollections(collection) {
      cachedCollection = normalizeCollectionDocument(collection);
      const serialized = JSON.stringify(cachedCollection, null, 2);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(COLLECTIONS_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.writeFile) {
        try {
          await ensureParentDirectory(profilePath);
          await Neutralino.filesystem.writeFile(profilePath, serialized);
          return clone(cachedCollection);
        } catch (_error) {
          // Fall back to browser storage if the desktop profile is unavailable.
        }
      }
      deps.localStorage?.setItem?.(COLLECTIONS_STORAGE_KEY, serialized);
      return clone(cachedCollection);
    }


    async function loadRecentHistory(limit = 50, options = {}) {
      const normalizedLimit = normalizeRecentHistoryLimit(limit);
      if (cachedRecentHistory && options.forceReload !== true) return clone(cachedRecentHistory).slice(0, normalizedLimit);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(RECENT_HISTORY_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.readFile) {
        try {
          cachedRecentHistory = normalizeRecentHistoryDocument(JSON.parse(await Neutralino.filesystem.readFile(profilePath)), normalizedLimit).entries;
          return clone(cachedRecentHistory);
        } catch (_error) {
          cachedRecentHistory = [];
          return [];
        }
      }
      try {
        cachedRecentHistory = normalizeRecentHistoryDocument(JSON.parse(deps.localStorage?.getItem(RECENT_HISTORY_STORAGE_KEY) || "null"), normalizedLimit).entries;
      } catch (_error) {
        cachedRecentHistory = [];
      }
      return clone(cachedRecentHistory);
    }

    async function saveRecentHistory(entries, limit = 50) {
      cachedRecentHistory = normalizeRecentHistoryDocument({ entries }, limit).entries;
      const serialized = JSON.stringify({ version: 1, entries: cachedRecentHistory }, null, 2);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(RECENT_HISTORY_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.writeFile) {
        try {
          await ensureParentDirectory(profilePath);
          await Neutralino.filesystem.writeFile(profilePath, serialized);
          return clone(cachedRecentHistory);
        } catch (_error) {
          // Fall back to browser storage if the desktop profile is unavailable.
        }
      }
      deps.localStorage?.setItem?.(RECENT_HISTORY_STORAGE_KEY, serialized);
      return clone(cachedRecentHistory);
    }

    async function loadEnvironments(options = {}) {
      if (cachedEnvironments && options.forceReload !== true) return clone(cachedEnvironments);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(ENVIRONMENTS_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.readFile) {
        try {
          cachedEnvironments = normalizeEnvironmentsDocument(JSON.parse(await Neutralino.filesystem.readFile(profilePath)));
          return clone(cachedEnvironments);
        } catch (_error) {
          cachedEnvironments = createDefaultEnvironments();
          return clone(cachedEnvironments);
        }
      }
      try {
        cachedEnvironments = normalizeEnvironmentsDocument(JSON.parse(deps.localStorage?.getItem(ENVIRONMENTS_STORAGE_KEY) || "null"));
      } catch (_error) {
        cachedEnvironments = createDefaultEnvironments();
      }
      return clone(cachedEnvironments);
    }

    async function saveEnvironments(environments) {
      cachedEnvironments = normalizeEnvironmentsDocument(environments);
      const serialized = JSON.stringify(cachedEnvironments, null, 2);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(ENVIRONMENTS_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.writeFile) {
        try {
          await ensureParentDirectory(profilePath);
          await Neutralino.filesystem.writeFile(profilePath, serialized);
          return clone(cachedEnvironments);
        } catch (_error) {
          // Fall back to browser storage if the desktop profile is unavailable.
        }
      }
      deps.localStorage?.setItem?.(ENVIRONMENTS_STORAGE_KEY, serialized);
      return clone(cachedEnvironments);
    }

    async function loadCookies(options = {}) {
      if (cachedCookies && options.forceReload !== true) return clone(cachedCookies);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(COOKIES_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.readFile) {
        try {
          cachedCookies = normalizeCookiesDocument(JSON.parse(await Neutralino.filesystem.readFile(profilePath)));
          return clone(cachedCookies);
        } catch (_error) {
          cachedCookies = createDefaultCookies();
          return clone(cachedCookies);
        }
      }
      try {
        cachedCookies = normalizeCookiesDocument(JSON.parse(deps.localStorage?.getItem(COOKIES_STORAGE_KEY) || "null"));
      } catch (_error) {
        cachedCookies = createDefaultCookies();
      }
      return clone(cachedCookies);
    }

    async function saveCookies(cookies) {
      cachedCookies = normalizeCookiesDocument(cookies);
      const serialized = JSON.stringify(cachedCookies, null, 2);
      const Neutralino = deps.Neutralino || global.Neutralino;
      const profilePath = await getProfilePath(COOKIES_PROFILE_FILE);
      if (profilePath && Neutralino?.filesystem?.writeFile) {
        try {
          await ensureParentDirectory(profilePath);
          await Neutralino.filesystem.writeFile(profilePath, serialized);
          return clone(cachedCookies);
        } catch (_error) {
          // Fall back to browser storage if the desktop profile is unavailable.
        }
      }
      deps.localStorage?.setItem?.(COOKIES_STORAGE_KEY, serialized);
      return clone(cachedCookies);
    }
    const api = { loadCollections, saveCollections, loadRecentHistory, saveRecentHistory, loadEnvironments, saveEnvironments, loadCookies, saveCookies, createDefaultCollection, createDefaultEnvironments, createDefaultCookies, normalizeCollectionDocument, normalizeRecentHistoryDocument, normalizeEnvironmentsDocument, normalizeCookiesDocument, exportCollectionToPostman, importCollectionFromPostman, findNodeById, findEnvironmentById, addFolder, upsertRequest, moveNode, moveRequest, renameNode, deleteNode, addEnvironment, renameEnvironment, deleteEnvironment, setActiveEnvironment, setEnvironmentVariables, setGlobalVariables };
    app?.registerModule?.("apiClientStorage", api);
    return api;
  }

  global.registerMarkdownViewerApiClientStorage = registerMarkdownViewerApiClientStorage;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerApiClientStorage };
  }
})(typeof window !== "undefined" ? window : globalThis);
