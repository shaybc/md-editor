const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "resources");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSettingsTransfer(overrides = {}) {
  const source = fs.readFileSync(path.join(repoRoot, "js", "ui", "settings-transfer.js"), "utf8");
  const app = {
    actions: {},
    services: {},
    registerModule(name, api) {
      this.modules = this.modules || {};
      this.modules[name] = api;
    }
  };
  const context = {
    Blob,
    console,
    document: overrides.document,
    window: Object.assign({}, overrides.window)
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerSettingsTransfer(app, Object.assign({
    getDefaultGlobalState: () => ({ theme: "light", maxRecentFiles: 10 }),
    loadGlobalState: () => ({}),
    localStorage: {
      setItem() {}
    },
    storageKey: "markdownViewerGlobalState"
  }, overrides.deps || {}));
}

test("settings export payload includes metadata and effective preferences", () => {
  const api = loadSettingsTransfer({
    deps: {
      getDefaultGlobalState: () => ({ theme: "light", maxRecentFiles: 10 }),
      loadGlobalState: () => ({ theme: "dark", extra: "ignored" })
    }
  });

  const payload = api.buildSettingsExportPayload();

  assert.equal(payload.documentType, "md-editor-settings");
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.app, "MD-Editor");
  assert.doesNotThrow(() => new Date(payload.exportedAt).toISOString());
  assert.deepEqual(plain(payload.settings), { theme: "dark", maxRecentFiles: 10 });
});

test("desktop settings export writes json and appends extension", async () => {
  const writes = [];
  const api = loadSettingsTransfer({
    deps: {
      NL_VERSION: "test",
      Neutralino: {
        os: {
          showSaveDialog: async () => "C:/exports/md-editor-settings"
        },
        filesystem: {
          writeFile: async (filePath, content) => writes.push([filePath, content])
        }
      }
    }
  });

  assert.equal(await api.exportSettingsFile(), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "C:/exports/md-editor-settings.json");
  assert.equal(JSON.parse(writes[0][1]).documentType, "md-editor-settings");
});

test("settings import rejects invalid or unsupported files", () => {
  const api = loadSettingsTransfer();

  assert.throws(() => api.parseSettingsImportText("{"), /valid MD-Editor settings JSON/);
  assert.throws(
    () => api.parseSettingsImportText(JSON.stringify({ documentType: "other", schemaVersion: 1, settings: {} })),
    /not an MD-Editor settings export/
  );
  assert.throws(
    () => api.parseSettingsImportText(JSON.stringify({ documentType: "md-editor-settings", schemaVersion: 2, settings: {} })),
    /version is not supported/
  );
  assert.throws(
    () => api.parseSettingsImportText(JSON.stringify({ documentType: "md-editor-settings", schemaVersion: 1 })),
    /does not contain preferences/
  );
});

test("settings import replaces preferences, fills defaults, drops unknown keys, and refreshes", async () => {
  const replacements = [];
  const refreshed = [];
  const api = loadSettingsTransfer({
    deps: {
      getDefaultGlobalState: () => ({ theme: "light", maxRecentFiles: 10, wordWrapEnabled: false }),
      NL_VERSION: "test",
      Neutralino: {
        os: {
          showOpenDialog: async () => ["C:/imports/settings.json"]
        },
        filesystem: {
          readFile: async () => JSON.stringify({
            documentType: "md-editor-settings",
            schemaVersion: 1,
            settings: {
              theme: "dark",
              unknownPreference: true
            }
          })
        }
      },
      refreshPreferences: async (settings) => refreshed.push(settings),
      replaceGlobalState: async (settings) => replacements.push(settings)
    }
  });

  assert.equal(await api.importSettingsFile(), true);
  assert.deepEqual(plain(replacements), [{ theme: "dark", maxRecentFiles: 10, wordWrapEnabled: false }]);
  assert.deepEqual(plain(refreshed), [{ theme: "dark", maxRecentFiles: 10, wordWrapEnabled: false }]);
});

test("settings transfer preserves API Client request settings", async () => {
  const replacements = [];
  const refreshed = [];
  const defaults = {
    apiClientRecentHistoryLimit: 50,
    apiClientRequestSettings: {
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
    }
  };
  const importedSettings = {
    apiClientRequestSettings: {
      autoFollowRedirects: false,
      maxRedirects: 2,
      preserveMethodOnRedirect: true,
      redirectAuthHeaderPolicy: "never",
      redirectCustomHeaderPolicy: "always",
      timeoutMs: 15000,
      sslCertificateVerification: false,
      trustedCertificates: [{ host: "connector.example.com", port: "443", fingerprint256: "AA:BB", pem: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----" }],
      cookieJarEnabled: false,
      sendNoCacheHeader: true,
      maxResponseSizeBytes: 1048576,
      responseRenderMode: "json",
      decompressResponses: false,
      proxyMode: "custom",
      proxyUrl: "http://127.0.0.1:8080",
      httpVersion: "http1.1"
    }
  };
  const api = loadSettingsTransfer({
    deps: {
      getDefaultGlobalState: () => defaults,
      NL_VERSION: "test",
      Neutralino: {
        os: { showOpenDialog: async () => ["C:/imports/settings.json"] },
        filesystem: {
          readFile: async () => JSON.stringify({ documentType: "md-editor-settings", schemaVersion: 1, settings: importedSettings })
        }
      },
      refreshPreferences: async (settings) => refreshed.push(settings),
      replaceGlobalState: async (settings) => replacements.push(settings)
    }
  });

  assert.equal(await api.importSettingsFile(), true);
  assert.deepEqual(plain(replacements[0].apiClientRequestSettings), importedSettings.apiClientRequestSettings);
  assert.deepEqual(plain(refreshed[0].apiClientRequestSettings), importedSettings.apiClientRequestSettings);
});

test("settings transfer strips AI credential values and references recursively", () => {
  const defaults = { aiCompanionSettings: { connectionProfiles: [] } };
  const api = loadSettingsTransfer({
    deps: {
      getDefaultGlobalState: () => defaults,
      loadGlobalState: () => ({ aiCompanionSettings: {
        apiKey: "plaintext",
        apiKeyCredentialId: "11111111-1111-4111-8111-111111111111",
        connectionProfiles: [{ id: "secondary", geminiConnectorApiKey: "plaintext", geminiConnectorApiKeyCredentialId: "22222222-2222-4222-8222-222222222222" }]
      } })
    }
  });

  const exported = api.buildSettingsExportPayload();
  const serialized = JSON.stringify(exported);
  assert.equal(serialized.includes("plaintext"), false);
  assert.equal(serialized.includes("CredentialId"), false);

  const imported = api.parseSettingsImportText(JSON.stringify({
    documentType: "md-editor-settings", schemaVersion: 1,
    settings: { aiCompanionSettings: { apiKeyCredentialId: "33333333-3333-4333-8333-333333333333", connectionProfiles: [] } }
  }));
  assert.equal(imported.aiCompanionSettings.apiKeyCredentialId, undefined);
});
