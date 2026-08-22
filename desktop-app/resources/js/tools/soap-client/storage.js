// Profile storage for imported WSDLs and SOAP Client history.
(function(root) {
  "use strict";

  const WSDL_PROFILE_PATH = "soap-client/wsdls.json";
  const HISTORY_PROFILE_PATH = "soap-client/recent-history.json";
  const LOCAL_WSDLS_KEY = "md-editor.soap-client.wsdls";
  const LOCAL_HISTORY_KEY = "md-editor.soap-client.history";

  function normalizeWsdlDocument(document) {
    return {
      id: String(document?.id || ""),
      name: String(document?.name || "WSDL"),
      sourceLabel: String(document?.sourceLabel || ""),
      targetNamespace: String(document?.targetNamespace || ""),
      services: Array.isArray(document?.services) ? document.services : [],
      bindings: Array.isArray(document?.bindings) ? document.bindings : [],
      operations: Array.isArray(document?.operations) ? document.operations : [],
      diagnostics: Array.isArray(document?.diagnostics) ? document.diagnostics.map(String) : [],
      importedAt: Number(document?.importedAt || Date.now()) || Date.now()
    };
  }

  function normalizeHistoryEntry(entry) {
    return {
      id: String(entry?.id || `soap_${Date.now()}`),
      operationName: String(entry?.operationName || ""),
      endpointUrl: String(entry?.endpointUrl || ""),
      statusCode: Number(entry?.statusCode || 0) || 0,
      elapsedMs: Number(entry?.elapsedMs || 0) || 0,
      createdAt: Number(entry?.createdAt || Date.now()) || Date.now()
    };
  }

  function readLocalJson(key, fallback) {
    try {
      return JSON.parse(root.localStorage?.getItem(key) || "");
    } catch (_error) {
      return fallback;
    }
  }

  function writeLocalJson(key, value) {
    try {
      root.localStorage?.setItem(key, JSON.stringify(value));
    } catch (_error) {
      // Profile persistence is best effort in browser fallback mode.
    }
  }

  async function ensureProfileFolder(Neutralino, filePath) {
    const folder = String(filePath || "").replace(/[\\/][^\\/]*$/, "");
    if (!folder || !Neutralino?.filesystem?.createDirectory) return;
    try {
      await Neutralino.filesystem.createDirectory(folder);
    } catch (_error) {
      // Existing folders are acceptable.
    }
  }

  function createSoapClientStorage(deps = {}) {
    const Neutralino = deps.Neutralino || null;
    const getProfileDataFilePath = typeof deps.getProfileDataFilePath === "function" ? deps.getProfileDataFilePath : null;

    async function readJson(profilePath, localKey, fallback) {
      const path = await getProfileDataFilePath?.(profilePath);
      if (path && Neutralino?.filesystem?.readFile) {
        try {
          return JSON.parse(await Neutralino.filesystem.readFile(path));
        } catch (_error) {
          return fallback;
        }
      }
      return readLocalJson(localKey, fallback);
    }

    async function writeJson(profilePath, localKey, value) {
      const path = await getProfileDataFilePath?.(profilePath);
      if (path && Neutralino?.filesystem?.writeFile) {
        await ensureProfileFolder(Neutralino, path);
        await Neutralino.filesystem.writeFile(path, JSON.stringify(value, null, 2));
        return;
      }
      writeLocalJson(localKey, value);
    }

    return {
      async loadWsdls() {
        const payload = await readJson(WSDL_PROFILE_PATH, LOCAL_WSDLS_KEY, []);
        return (Array.isArray(payload) ? payload : []).map(normalizeWsdlDocument).filter((document) => document.id);
      },
      async saveWsdls(documents) {
        const normalized = (Array.isArray(documents) ? documents : []).map(normalizeWsdlDocument).filter((document) => document.id);
        await writeJson(WSDL_PROFILE_PATH, LOCAL_WSDLS_KEY, normalized);
        return normalized;
      },
      async loadHistory(limit = 50) {
        const payload = await readJson(HISTORY_PROFILE_PATH, LOCAL_HISTORY_KEY, []);
        return (Array.isArray(payload) ? payload : []).map(normalizeHistoryEntry).slice(0, limit);
      },
      async saveHistory(entries, limit = 50) {
        const normalized = (Array.isArray(entries) ? entries : []).map(normalizeHistoryEntry).slice(0, limit);
        await writeJson(HISTORY_PROFILE_PATH, LOCAL_HISTORY_KEY, normalized);
        return normalized;
      }
    };
  }

  const api = { createSoapClientStorage, normalizeWsdlDocument, normalizeHistoryEntry };
  root.markdownViewerSoapClientStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
