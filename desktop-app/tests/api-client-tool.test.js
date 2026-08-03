const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createElement() {
  return {
    children: [],
    dataset: {},
    style: { setProperty() {} },
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    classList: {
      add(...classNames) {
        const existing = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
        classNames.forEach((className) => existing.add(className));
        element.className = Array.from(existing).join(" ");
      },
      remove(...classNames) {
        const removed = new Set(classNames);
        element.className = String(element.className || "").split(/\s+/).filter((className) => className && !removed.has(className)).join(" ");
      },
      toggle(className, force) {
        const hasClass = String(element.className || "").split(/\s+/).includes(className);
        const shouldAdd = force === undefined ? !hasClass : !!force;
        if (shouldAdd) this.add(className);
        else this.remove(className);
        return shouldAdd;
      }
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    setAttribute() {},
    addEventListener() {},
    querySelector() {
      return createElement();
    }
  };
}

function createVmContext() {
  return {
    window: {},
    document: { createElement, getElementById() { return null; } },
    module: { exports: {} },
    console,
    URL,
    URLSearchParams,
    JSON,
    Object,
    String,
    Number,
    Array,
    Error,
    RegExp,
    Set,
    Date,
    Math,
    Promise,
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    unescape,
    encodeURIComponent
  };
}


function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}function loadApiClient(extraDeps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/api-client.js"), "utf8");
  const codeSnippetSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/code-snippets.js"), "utf8");
  const splitPaneSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/split-pane.js"), "utf8");
  const modules = {};
  const context = createVmContext();
  const deps = { ...extraDeps };
  if (deps.hljs) {
    context.window.hljs = deps.hljs;
    delete deps.hljs;
  }
  if (deps.storageApi) {
    const storageApi = deps.storageApi;
    context.window.registerMarkdownViewerApiClientStorage = () => storageApi;
    delete deps.storageApi;
  }
  if (deps.sidebarApi) {
    const sidebarApi = deps.sidebarApi;
    context.window.registerMarkdownViewerApiClientSidebar = () => sidebarApi;
    delete deps.sidebarApi;
  }
  const appServices = deps.appServices || null;
  delete deps.appServices;
  vm.createContext(context);
  vm.runInContext(codeSnippetSource, context, { filename: "code-snippets.js" });
  vm.runInContext(splitPaneSource, context, { filename: "split-pane.js" });
  vm.runInContext(source, context, { filename: "api-client.js" });
  const app = {
    services: appServices || {},
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const api = context.window.registerMarkdownViewerApiClient(app, deps);
  return { api, modules };
}

function loadApiClientCodeSnippets() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/code-snippets.js"), "utf8");
  const modules = {};
  const context = createVmContext();
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "code-snippets.js" });
  const app = {
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const api = context.window.registerMarkdownViewerApiClientCodeSnippets(app);
  return { api, modules };
}

function loadApiClientStorage(extraDeps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/storage.js"), "utf8");
  const modules = {};
  const context = createVmContext();
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "storage.js" });
  const app = {
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const api = context.window.registerMarkdownViewerApiClientStorage(app, extraDeps);
  return { api, modules };
}

test("API Client parses header lines into request headers", () => {
  const { api } = loadApiClient();

  assert.deepEqual(JSON.parse(JSON.stringify(api.parseHeaderLines("Content-Type: application/json\nX-Test: yes"))), {
    "Content-Type": "application/json",
    "X-Test": "yes"
  });
});

test("API Client rejects invalid header lines", () => {
  const { api } = loadApiClient();

  assert.throws(() => api.parseHeaderLines("Broken header"), /Invalid header line/);
});

test("API Client builds a validated request payload", () => {
  const { api } = loadApiClient();
  const payload = api.buildRequestPayload({
    methodSelect: { value: "POST" },
    urlInput: { value: "https://example.com/api" },
    headersInput: { value: "Content-Type: application/json" },
    bodyInput: { value: '{"ok":true}' }
  });

  assert.equal(payload.method, "POST");
  assert.equal(payload.url, "https://example.com/api");
  assert.deepEqual(JSON.parse(JSON.stringify(payload.headers)), { "Content-Type": "application/json" });
  assert.equal(payload.body, '{"ok":true}');
});

test("API Client omits request body for GET and HEAD", () => {
  const { api } = loadApiClient();

  for (const method of ["GET", "HEAD"]) {
    const payload = api.buildRequestPayload({
      methodSelect: { value: method },
      urlInput: { value: "https://example.com/api" },
      headersInput: { value: "" },
      bodyInput: { value: "stale body" }
    });

    assert.equal(payload.body, "");
    assert.equal(api.methodAllowsBody(method), false);
  }
});

test("API Client keeps request bodies for supported body methods", () => {
  const { api } = loadApiClient();

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const payload = api.buildRequestPayload({
      methodSelect: { value: method },
      urlInput: { value: "https://example.com/api" },
      headersInput: { value: "" },
      bodyInput: { value: "raw body" }
    });

    assert.equal(payload.body, "raw body");
    assert.equal(api.methodAllowsBody(method), true);
  }
});

test("API Client clears body when normalizing GET and HEAD requests", () => {
  const { api } = loadApiClient();

  assert.deepEqual(JSON.parse(JSON.stringify(api.normalizeRequestSnapshot({ method: "GET", url: "https://example.com", bodyText: "stale" }))), {
    method: "GET",
    url: "https://example.com",
    paramsText: "",
    headersText: "",
    bodyMode: "none",
    bodyText: "",
    formDataText: ""
  });
});

test("API Client hides and clears body when loading GET requests", () => {
  const { api } = loadApiClient();
  const view = {
    methodSelect: { value: "POST" },
    urlInput: { value: "" },
    headersInput: { value: "" },
    bodyInput: { value: "stale body" },
    bodyGroup: { hidden: false }
  };

  api.loadRequestIntoView(view, { method: "GET", url: "https://example.com", headersText: "X-Test: yes", bodyText: "stale body" });

  assert.equal(view.methodSelect.value, "GET");
  assert.equal(view.bodyInput.value, "");
  assert.equal(view.bodyGroup.hidden, true);
});

test("API Client rejects non HTTP URLs", () => {
  const { api } = loadApiClient();

  assert.throws(() => api.buildRequestPayload({
    methodSelect: { value: "GET" },
    urlInput: { value: "file:///tmp/example" },
    headersInput: { value: "" },
    bodyInput: { value: "" }
  }), /Only HTTP and HTTPS/);
});

test("API Client pretty-prints JSON response bodies", () => {
  const { api } = loadApiClient();

  assert.equal(api.formatResponseBody('{"ok":true}', "application/json"), '{\n  "ok": true\n}');
});

test("API Client Json body mode pretty-prints with the existing formatter", () => {
  const { api } = loadApiClient();
  const bodyModeInputs = ["none", "form-data", "raw", "json"].map((value) => ({ value, checked: false }));
  const bodyPanels = {
    none: { hidden: false },
    "form-data": { hidden: true },
    raw: { hidden: true }
  };
  const view = {
    methodSelect: { value: "POST" },
    urlInput: { value: "https://example.com" },
    paramsInput: { value: "" },
    headersInput: { value: "Content-Type: application/json" },
    bodyInput: { value: '{"name":"Ada","active":true}' },
    formDataInput: { value: "" },
    bodyModeInputs,
    bodyPanels
  };

  api._test.setBodyMode(view, "json");

  assert.equal(view.bodyMode, "json");
  assert.equal(view.bodyInput.value, '{\n  "name": "Ada",\n  "active": true\n}');
  assert.equal(bodyModeInputs.find((input) => input.value === "json").checked, true);
  assert.equal(bodyPanels.raw.hidden, false);
  assert.equal(bodyPanels.none.hidden, true);

  const snapshot = api.normalizeRequestSnapshot({ method: "POST", bodyMode: "json", bodyText: view.bodyInput.value });
  assert.equal(snapshot.bodyMode, "json");
  const payload = api.buildRequestPayload(view);
  assert.equal(payload.bodyMode, "raw");
  assert.equal(payload.body, view.bodyInput.value);

  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/api-client.js"), "utf8");
  assert.match(source, /value="json"> Json<\/label>/);
});

test("API Client Json body mode leaves invalid JSON editable", () => {
  const { api } = loadApiClient();
  const view = {
    methodSelect: { value: "POST" },
    bodyInput: { value: "{invalid" },
    formDataInput: { value: "" },
    bodyModeInputs: [{ value: "json", checked: false }],
    bodyPanels: { raw: { hidden: true } }
  };

  api._test.setBodyMode(view, "json");

  assert.equal(view.bodyInput.value, "{invalid");
  assert.equal(view.bodyMode, "json");
});

test("API Client formats response previews by selected render mode", () => {
  const { api } = loadApiClient();

  assert.equal(api.normalizeResponseRenderMode("", "application/json"), "json");
  assert.equal(api.normalizeResponseRenderMode("", "text/html"), "html");
  assert.equal(api.formatResponsePreviewBody('{"ok":true}', "text/plain", "json"), '{\n  "ok": true\n}');
  assert.equal(api.formatResponsePreviewBody("<root><child>ok</child></root>", "application/xml", "xml"), "<root>\n  <child>ok</child>\n</root>");
  assert.match(api.formatResponsePreviewBody("A\u0000B", "application/octet-stream", "binary"), /^00000000\s+41 00 42/);
});
test("API Client renders response metadata, headers, and body", () => {
  const { api } = loadApiClient();
  const view = {
    responseMeta: { textContent: "" },
    responseHeaders: { textContent: "" },
    responseBody: { textContent: "" },
    responseJsonBody: { textContent: "" }
  };

  api._test.renderResponse(view, {
    elapsedMs: 42,
    response: {
      statusCode: 201,
      statusMessage: "Created",
      headers: { "content-type": "application/json" },
      body: '{"created":true}'
    }
  });

  assert.match(view.responseMeta.textContent, /^201 Created/);
  assert.match(view.responseMeta.textContent, /42 ms$/);
  assert.equal(view.responseHeaders.textContent, "content-type: application/json");
  assert.equal(view.responseBody.textContent, '{\n  "created": true\n}');
  assert.equal(view.responseJsonBody.textContent, '{\n  "created": true\n}');

  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/api-client.js"), "utf8");
  assert.match(source, /data-response-body-mode="json">Json<\/button>/);
  assert.match(source, /data-response-body-panel="json"/);
});

test("API Client replays stored history response snapshots", () => {
  const { api } = loadApiClient();
  const view = {
    responseMeta: { textContent: "" },
    responseHeaders: { textContent: "" },
    responseBody: { textContent: "" }
  };

  api._test.renderStoredHistoryResult(view, {
    result: {
      elapsedMs: 13,
      response: { statusCode: 200, statusMessage: "OK", headers: { "content-type": "application/json" }, body: '{"ok":true}' }
    }
  });

  assert.match(view.responseMeta.textContent, /^200 OK/);
  assert.equal(view.responseBody.textContent, '{\n  "ok": true\n}');
});

test("API Client storage creates folders and saved requests recursively", () => {
  const { api } = loadApiClientStorage();
  const base = api.createDefaultCollection();
  const folderResult = api.addFolder(base, "root", "YouTube Tester");
  const nestedResult = api.addFolder(folderResult.collection, folderResult.folder.id, "Channels");
  const requestResult = api.upsertRequest(nestedResult.collection, nestedResult.folder.id, {
    name: "Playlist Request",
    method: "GET",
    url: "https://www.googleapis.com/youtube/v3/playlists",
    headersText: "Authorization: Bearer token",
    bodyText: "stale"
  });

  const match = api.findNodeById(requestResult.collection.root, requestResult.request.id);
  assert.equal(match.node.name, "Playlist Request");
  assert.equal(match.node.method, "GET");
  assert.equal(match.node.bodyText, "stale");
  assert.equal(match.parent.id, nestedResult.folder.id);
});

test("API Client storage moves saved requests and folders", () => {
  const { api } = loadApiClientStorage();
  const firstFolder = api.addFolder(api.createDefaultCollection(), "root", "First");
  const secondFolder = api.addFolder(firstFolder.collection, "root", "Second");
  const nestedFolder = api.addFolder(secondFolder.collection, firstFolder.folder.id, "Nested");
  const requestResult = api.upsertRequest(nestedFolder.collection, firstFolder.folder.id, {
    name: "Move Me",
    method: "GET",
    url: "https://example.com/move"
  });

  const movedToSecond = api.moveRequest(requestResult.collection, requestResult.request.id, secondFolder.folder.id);
  assert.equal(movedToSecond.moved, true);
  assert.equal(api.findNodeById(movedToSecond.collection.root, requestResult.request.id).parent.id, secondFolder.folder.id);

  const movedToRoot = api.moveRequest(movedToSecond.collection, requestResult.request.id, "root");
  assert.equal(movedToRoot.moved, true);
  assert.equal(api.findNodeById(movedToRoot.collection.root, requestResult.request.id).parent.id, "root");

  const movedFolder = api.moveNode(movedToRoot.collection, firstFolder.folder.id, secondFolder.folder.id);
  assert.equal(movedFolder.moved, true);
  assert.equal(api.findNodeById(movedFolder.collection.root, firstFolder.folder.id).parent.id, secondFolder.folder.id);

  const movedIntoDescendant = api.moveNode(movedFolder.collection, secondFolder.folder.id, firstFolder.folder.id);
  assert.equal(movedIntoDescendant.moved, false);
  assert.equal(api.findNodeById(movedIntoDescendant.collection.root, secondFolder.folder.id).parent.id, "root");
});

test("API Client storage renames and deletes saved nodes", () => {
  const { api } = loadApiClientStorage();
  const folderResult = api.addFolder(api.createDefaultCollection(), "root", "Old");
  const renamed = api.renameNode(folderResult.collection, folderResult.folder.id, "New");
  assert.equal(api.findNodeById(renamed.root, folderResult.folder.id).node.name, "New");

  const deleted = api.deleteNode(renamed, folderResult.folder.id);
  assert.equal(api.findNodeById(deleted.root, folderResult.folder.id), null);
});

test("API Client storage exports nested saved requests as Postman v2.1 JSON", () => {
  const { api } = loadApiClientStorage();
  const folderResult = api.addFolder(api.createDefaultCollection(), "root", "Users");
  const rawResult = api.upsertRequest(folderResult.collection, folderResult.folder.id, {
    name: "Create User",
    method: "POST",
    url: "https://example.com/users",
    paramsText: "include: profile\n//debug: true",
    headersText: "Content-Type: application/json\n//X-Debug: off",
    bodyMode: "raw",
    bodyText: "{\"name\":\"Ada\"}"
  });
  const formResult = api.upsertRequest(rawResult.collection, "root", {
    name: "Upload Avatar",
    method: "POST",
    url: "https://example.com/avatar",
    headersText: "Authorization: Bearer {{token}}",
    bodyMode: "form-data",
    formDataText: "file: avatar.png\n//trace: yes"
  });

  const postman = api.exportCollectionToPostman(formResult.collection);

  assert.equal(postman.info.schema, "https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
  assert.equal(postman.item[0].name, "Users");
  assert.equal(postman.item[0].item[0].request.method, "POST");
  assert.deepEqual(JSON.parse(JSON.stringify(postman.item[0].item[0].request.header)), [
    { key: "Content-Type", value: "application/json", type: "text", disabled: false },
    { key: "X-Debug", value: "off", type: "text", disabled: true }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(postman.item[0].item[0].request.url.query)), [
    { key: "include", value: "profile", disabled: false },
    { key: "debug", value: "true", disabled: true }
  ]);
  assert.equal(postman.item[0].item[0].request.body.raw, "{\"name\":\"Ada\"}");
  assert.equal(postman.item[1].request.body.mode, "formdata");
  assert.deepEqual(JSON.parse(JSON.stringify(postman.item[1].request.body.formdata)), [
    { key: "file", value: "avatar.png", type: "text", disabled: false },
    { key: "trace", value: "yes", type: "text", disabled: true }
  ]);
});

test("API Client storage exports only selected saved requests and folders", () => {
  const { api } = loadApiClientStorage();
  const usersFolder = api.addFolder(api.createDefaultCollection(), "root", "Users");
  const nestedFolder = api.addFolder(usersFolder.collection, usersFolder.folder.id, "Nested");
  const nestedRequest = api.upsertRequest(nestedFolder.collection, nestedFolder.folder.id, {
    name: "Nested Request",
    method: "GET",
    url: "https://example.com/nested"
  });
  const rootRequest = api.upsertRequest(nestedRequest.collection, "root", {
    name: "Root Request",
    method: "GET",
    url: "https://example.com/root"
  });

  const requestOnly = api.exportCollectionToPostman(rootRequest.collection, { selectedIds: [nestedRequest.request.id] });
  assert.deepEqual(JSON.parse(JSON.stringify(requestOnly.item.map((item) => item.name))), ["Users"]);
  assert.deepEqual(JSON.parse(JSON.stringify(requestOnly.item[0].item.map((item) => item.name))), ["Nested"]);
  assert.deepEqual(JSON.parse(JSON.stringify(requestOnly.item[0].item[0].item.map((item) => item.name))), ["Nested Request"]);

  const folderSelected = api.exportCollectionToPostman(rootRequest.collection, { selectedIds: [usersFolder.folder.id] });
  assert.deepEqual(JSON.parse(JSON.stringify(folderSelected.item.map((item) => item.name))), ["Users"]);
  assert.deepEqual(JSON.parse(JSON.stringify(folderSelected.item[0].item[0].item.map((item) => item.name))), ["Nested Request"]);
});
test("API Client storage imports nested Postman v2.1 collections additively", () => {
  const { api } = loadApiClientStorage();
  const existing = api.upsertRequest(api.createDefaultCollection(), "root", {
    name: "Existing",
    method: "GET",
    url: "https://example.com/existing"
  });
  const imported = api.importCollectionFromPostman(existing.collection, {
    info: { name: "Imported", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        name: "Users",
        item: [
          {
            name: "List Users",
            request: {
              method: "GET",
              header: [{ key: "Accept", value: "application/json" }],
              url: {
                raw: "https://example.com/users?limit=10",
                query: [{ key: "limit", value: "10" }]
              }
            }
          },
          {
            name: "Upload Avatar",
            request: {
              method: "POST",
              body: { mode: "formdata", formdata: [{ key: "file", value: "avatar.png" }] },
              url: "https://example.com/avatar"
            }
          }
        ]
      }
    ]
  });

  assert.equal(imported.importedCount, 1);
  assert.equal(imported.collection.root.children[0].name, "Existing");
  const folder = imported.collection.root.children[1];
  assert.equal(folder.name, "Users");
  assert.equal(folder.children[0].name, "List Users");
  assert.equal(folder.children[0].paramsText, "limit: 10");
  assert.equal(folder.children[0].headersText, "Accept: application/json");
  assert.equal(folder.children[1].bodyMode, "form-data");
  assert.equal(folder.children[1].formDataText, "file: avatar.png");
  assert.notEqual(folder.children[0].id, "List Users");
});

test("API Client storage imports Postman raw body requests", () => {
  const { api } = loadApiClientStorage();
  const imported = api.importCollectionFromPostman(api.createDefaultCollection(), {
    info: { name: "Imported" },
    item: [
      {
        name: "Create User",
        request: {
          method: "POST",
          header: [{ key: "Content-Type", value: "application/json", disabled: true }],
          body: { mode: "raw", raw: "{\"name\":\"Ada\"}" },
          url: { protocol: "https", host: ["example", "com"], path: ["users"] }
        }
      }
    ]
  });

  const request = imported.collection.root.children[0];
  assert.equal(request.url, "https://example.com/users");
  assert.equal(request.headersText, "//Content-Type: application/json");
  assert.equal(request.bodyMode, "raw");
  assert.equal(request.bodyText, "{\"name\":\"Ada\"}");
});

test("API Client storage rejects non Postman collection imports", () => {
  const { api } = loadApiClientStorage();

  assert.throws(() => api.importCollectionFromPostman(api.createDefaultCollection(), { info: { name: "No Items" } }), /not a Postman collection/);
  assert.throws(() => api.importCollectionFromPostman(api.createDefaultCollection(), null), /not a Postman collection/);
});
test("API Client storage saves profile data and falls back to localStorage", async () => {
  const writes = [];
  const localWrites = [];
  const { api } = loadApiClientStorage({
    getProfileDataFilePath: async () => "profile/api-client/collections.json",
    Neutralino: { filesystem: { writeFile: async (file, content) => writes.push({ file, content }) } },
    localStorage: { setItem: (key, value) => localWrites.push({ key, value }) }
  });

  await api.saveCollections(api.createDefaultCollection());

  assert.equal(writes.length, 1);
  assert.equal(writes[0].file, "profile/api-client/collections.json");
  assert.equal(localWrites.length, 0);
});

test("API Client storage saves recent history in the profile folder", async () => {
  const writes = [];
  const { api } = loadApiClientStorage({
    getProfileDataFilePath: async (file) => `profile/${file}`,
    Neutralino: { filesystem: { writeFile: async (file, content) => writes.push({ file, content }) } },
    localStorage: { setItem() {} }
  });

  const saved = await api.saveRecentHistory([
    { request: { method: "GET", url: "https://example.com/one", headersText: "", bodyText: "" }, result: { elapsedMs: 1, response: { statusCode: 200 } } },
    { request: { method: "POST", url: "https://example.com/two", headersText: "", bodyText: "{}" }, error: { message: "Failed" } }
  ], 1);

  assert.equal(saved.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].file, "profile/api-client/recent-history.json");
  assert.equal(JSON.parse(writes[0].content).entries.length, 1);
});

test("API Client loads stored history before any API Client tab opens", async () => {
  const historyEntry = {
    request: { method: "GET", url: "https://example.com/history", headersText: "", bodyText: "" },
    result: { elapsedMs: 15, response: { statusCode: 200 } }
  };
  const renders = [];
  let historyLoadCount = 0;
  const sidebarApi = {
    bind() {},
    render(payload) { renders.push(payload.history); }
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => {
      historyLoadCount += 1;
      return [historyEntry];
    }
  };

  loadApiClient({ storageApi, sidebarApi });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(historyLoadCount, 1);
  assert.equal(renders.at(-1).length, 1);
  assert.equal(renders.at(-1)[0].request.url, "https://example.com/history");
});

test("API Client storage saves environments in the profile folder", async () => {
  const writes = [];
  const { api } = loadApiClientStorage({
    getProfileDataFilePath: async (file) => "profile/" + file,
    Neutralino: { filesystem: { writeFile: async (file, content) => writes.push({ file, content }) } },
    localStorage: { setItem() {} }
  });

  const saved = await api.saveEnvironments({
    activeEnvironmentId: "env-1",
    globals: [{ key: "globalToken", currentValue: "global", type: "secret" }],
    environments: [{ id: "env-1", name: "Local", variables: [{ key: "baseUrl", currentValue: "https://local.test" }] }]
  });

  assert.equal(saved.activeEnvironmentId, "env-1");
  assert.equal(saved.globals[0].type, "secret");
  assert.equal(writes[0].file, "profile/api-client/environments.json");
});

test("API Client storage force reload bypasses cached collections", async () => {
  const reads = [
    JSON.stringify({ root: { id: "root", type: "folder", name: "Saved Requests", children: [{ id: "request-1", type: "request", name: "Old" }] } }),
    JSON.stringify({ root: { id: "root", type: "folder", name: "Saved Requests", children: [{ id: "request-2", type: "request", name: "New" }] } })
  ];
  const { api } = loadApiClientStorage({
    getProfileDataFilePath: async () => "profile/api-client/collections.json",
    Neutralino: { filesystem: { readFile: async () => reads.shift() } },
    localStorage: { getItem: () => null }
  });

  assert.equal((await api.loadCollections()).root.children[0].name, "Old");
  assert.equal((await api.loadCollections()).root.children[0].name, "Old");
  assert.equal((await api.loadCollections({ forceReload: true })).root.children[0].name, "New");
});

test("API Client refreshFromStorage reloads saved requests after external agent changes", async () => {
  const renders = [];
  let collectionName = "Before Agent";
  const sidebarApi = {
    bind() {},
    render(payload) {
      renders.push(payload.collection.root.children.map((child) => child.name));
    }
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => ({ root: { id: "root", type: "folder", name: "Saved Requests", children: [{ id: "request-1", type: "request", name: collectionName }] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => []
  };
  const { api } = loadApiClient({ storageApi, sidebarApi });

  collectionName = "AI_Generated";
  await api.refreshFromStorage();

  assert.deepEqual(renders.at(-1), ["AI_Generated"]);
});
test("API Client reveals saved request tabs in the API Client tree", async () => {
  const renders = [];
  const sidebarViews = [];
  const visibilityChanges = [];
  const collection = {
    root: {
      id: "root",
      type: "folder",
      name: "Saved Requests",
      children: [
        { id: "folder-1", type: "folder", name: "Users", children: [{ id: "request-1", type: "request", name: "List Users", method: "GET", url: "https://example.com/users" }] }
      ]
    }
  };
  const findNodeById = (folder, nodeId) => {
    if (!folder || !nodeId) return null;
    if (folder.id === nodeId) return { node: folder, parent: null };
    for (const child of folder.children || []) {
      if (child.id === nodeId) return { node: child, parent: folder };
      if (child.type === "folder") {
        const match = findNodeById(child, nodeId);
        if (match) return match;
      }
    }
    return null;
  };
  const sidebarApi = {
    bind() {},
    render(payload) { renders.push(payload); }
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", type: "folder", name: "Saved Requests", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => collection,
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => [],
    findNodeById
  };
  const { api } = loadApiClient({
    sidebarApi,
    storageApi,
    getSidebarView: () => "files",
    setSidebarView: (view) => sidebarViews.push(view),
    setSidebarVisible: (...args) => visibilityChanges.push(args)
  });

  const revealed = await api.revealSavedRequest("request-1");

  assert.equal(revealed, true);
  assert.deepEqual(visibilityChanges.at(-1), [true, false, false]);
  assert.equal(sidebarViews.at(-1), "api-client");
  assert.equal(renders.at(-1).selectedNodeId, "request-1");
});
test("API Client storage manages environments and variables", () => {
  const { api } = loadApiClientStorage();
  const created = api.addEnvironment(api.createDefaultEnvironments(), "Local");
  const withVariables = api.setEnvironmentVariables(created.environments, created.environment.id, [
    { key: "baseUrl", initialValue: "https://initial.test", currentValue: "https://current.test" }
  ]);
  const renamed = api.renameEnvironment(withVariables, created.environment.id, "QA");

  assert.equal(renamed.activeEnvironmentId, created.environment.id);
  assert.equal(api.findEnvironmentById(renamed, created.environment.id).name, "QA");
  assert.equal(api.findEnvironmentById(renamed, created.environment.id).variables[0].currentValue, "https://current.test");

  const deleted = api.deleteEnvironment(renamed, created.environment.id);
  assert.equal(deleted.activeEnvironmentId, "");
  assert.equal(deleted.environments.length, 0);
});

test("API Client resolves environment variables with environment precedence", () => {
  const { api } = loadApiClient();
  const environmentsDocument = {
    activeEnvironmentId: "env-1",
    globals: [{ key: "baseUrl", currentValue: "https://global.test" }, { key: "token", initialValue: "global-token" }],
    environments: [{ id: "env-1", name: "Local", variables: [{ key: "baseUrl", currentValue: "https://local.test" }] }]
  };

  const payload = api.buildRequestPayload({
    environmentsDocument,
    methodSelect: { value: "POST" },
    urlInput: { value: "{{baseUrl}}/posts" },
    headersInput: { value: "Authorization: Bearer {{token}}" },
    bodyModeInputs: [{ checked: true, value: "raw" }],
    bodyInput: { value: "{\"url\":\"{{baseUrl}}\"}" },
    formDataInput: { value: "" }
  });

  assert.equal(payload.url, "https://local.test/posts");
  assert.deepEqual(JSON.parse(JSON.stringify(payload.headers)), { Authorization: "Bearer global-token" });
  assert.equal(payload.body, "{\"url\":\"https://local.test\"}");
});

test("API Client blocks unresolved environment variables", () => {
  const { api } = loadApiClient();

  assert.throws(() => api.buildRequestPayload({
    environmentsDocument: { activeEnvironmentId: "", globals: [], environments: [] },
    methodSelect: { value: "GET" },
    urlInput: { value: "https://example.com/{{missing}}" },
    headersInput: { value: "" },
    bodyInput: { value: "" }
  }), /Unresolved variable: missing/);
});

test("API Client resolves form-data variables before sending", () => {
  const { api } = loadApiClient();
  const payload = api.buildRequestPayload({
    environmentsDocument: { activeEnvironmentId: "", globals: [{ key: "title", currentValue: "Hello" }], environments: [] },
    methodSelect: { value: "POST" },
    urlInput: { value: "https://example.com/api" },
    headersInput: { value: "" },
    bodyModeInputs: [{ checked: true, value: "form-data" }],
    bodyInput: { value: "" },
    formDataInput: { value: "title: {{title}}" }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(payload.formData)), [{ key: "title", value: "Hello" }]);
});

test("API Client keeps unresolved variables in recent history snapshots", () => {
  const { api } = loadApiClient({ storageApi: { createDefaultCollection: () => ({ root: { id: "root", children: [] } }), createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }) } });
  const view = { history: [], tab: { apiClient: {} } };

  api._test.addHistoryEntry(view, { method: "GET", url: "{{baseUrl}}/users", headersText: "Authorization: Bearer {{token}}" }, { elapsedMs: 1, response: { statusCode: 200 } }, null);

  assert.equal(view.history[0].request.url, "{{baseUrl}}/users");
  assert.equal(view.history[0].request.headersText, "Authorization: Bearer {{token}}");
});


test("API Client confirms environment deletes with danger variant", async () => {
  const confirms = [];
  let boundHandlers = null;
  const sidebarApi = {
    bind(handlers) { boundHandlers = handlers; },
    render() {},
    activate() {},
    deactivate() {}
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "env-1", globals: [], environments: [{ id: "env-1", name: "Production", variables: [] }] }),
    loadCollections: async () => ({ root: { id: "root", children: [] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "env-1", globals: [], environments: [{ id: "env-1", name: "Production", variables: [] }] }),
    saveEnvironments: async (document) => document,
    deleteEnvironment: (document, id) => ({ ...document, activeEnvironmentId: document.activeEnvironmentId === id ? "" : document.activeEnvironmentId, environments: [] })
  };

  loadApiClient({
    sidebarApi,
    storageApi,
    appServices: {
      confirm(options) {
        confirms.push(options);
        return false;
      }
    }
  });

  await boundHandlers.onDeleteEnvironment({ id: "env-1", name: "Production" });

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].title, "Delete Environment");
  assert.equal(confirms[0].confirmLabel, "Delete");
  assert.equal(confirms[0].confirmVariant, "danger");
  assert.equal(confirms[0].message, 'Delete environment "Production"?');
});
test("API Client opens saved requests in a new tab", () => {
  const opened = [];
  const { api } = loadApiClient({
    openApiClientInTab(options) {
      opened.push(options);
      return { id: "api-tab" };
    }
  });

  const tab = api.openRequestInNewTab({
    id: "request-1",
    name: "Channels Request",
    method: "GET",
    url: "https://example.com/channels",
    headersText: "Accept: application/json",
    bodyText: "stale"
  });

  assert.equal(tab.id, "api-tab");
  assert.equal(opened.length, 1);
  assert.equal(opened[0].forceNew, false);
  assert.equal(opened[0].savedRequestId, "request-1");
  assert.equal(opened[0].title, "Channels Request");
  assert.equal(opened[0].request.method, "GET");
  assert.equal(opened[0].request.bodyText, "");
});

test("API Client sidebar activation does not force the sidebar open", () => {
  const sidebarViews = [];
  const visibilityChanges = [];
  const { api } = loadApiClient({
    getSidebarView() {
      return "files";
    },
    setSidebarView(view) {
      sidebarViews.push(view);
    },
    setSidebarVisible(...args) {
      visibilityChanges.push(args);
    }
  });

  api.activateApiClientSidebar({ id: "api-tab" });

  assert.deepEqual(sidebarViews, ["api-client"]);
  assert.deepEqual(visibilityChanges, []);
});

test("API Client opens history entries in a new tab with response snapshot", () => {
  const opened = [];
  const { api } = loadApiClient({
    openApiClientInTab(options) {
      opened.push(options);
      return { id: "api-history-tab" };
    }
  });
  const historyEntry = {
    request: { method: "POST", url: "https://example.com/posts", headersText: "", bodyText: "{}" },
    result: { elapsedMs: 12, response: { statusCode: 201, statusMessage: "Created", headers: {}, body: "" } }
  };

  api.openRequestInNewTab(historyEntry.request, historyEntry, 2);
  api.openRequestInNewTab(historyEntry.request, historyEntry, 2);

  assert.equal(opened[0].forceNew, false);
  assert.equal(opened[0].historyEntry, historyEntry);
  assert.equal(opened[0].request.bodyText, "{}");
  assert.ok(opened[0].historyEntryKey);
  assert.equal(opened[1].historyEntryKey, opened[0].historyEntryKey);
});

test("API Client deletes one recent history entry after confirmation", async () => {
  const confirms = [];
  let boundHandlers = null;
  let persisted = null;
  const history = [
    { request: { method: "GET", url: "https://example.com/one" }, result: { elapsedMs: 1, response: { statusCode: 200 } } },
    { request: { method: "POST", url: "https://example.com/two" }, result: { elapsedMs: 2, response: { statusCode: 201 } } }
  ];
  const sidebarApi = {
    bind(handlers) { boundHandlers = handlers; },
    render() {}
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => ({ root: { id: "root", children: [] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => history,
    saveRecentHistory: async (entries) => {
      persisted = entries;
      return entries;
    }
  };

  loadApiClient({
    sidebarApi,
    storageApi,
    appServices: {
      confirm(options) {
        confirms.push(options);
        return true;
      }
    }
  });

  await boundHandlers.onDeleteHistoryEntry(history[0], 0);

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].title, "Delete History Entry");
  assert.equal(confirms[0].confirmLabel, "Delete");
  assert.equal(confirms[0].confirmVariant, "danger");
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].request.url, "https://example.com/two");
});

test("API Client bulk deletes history entries by stable key with one persistence", async () => {
  let boundHandlers = null;
  let persisted = null;
  let saveCount = 0;
  const history = [
    { request: { method: "GET", url: "https://example.com/one" } },
    { request: { method: "GET", url: "https://example.com/two" } },
    { request: { method: "GET", url: "https://example.com/three" } }
  ];
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => ({ root: { id: "root", children: [] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => history,
    saveRecentHistory: async (entries) => {
      saveCount += 1;
      persisted = entries;
      return entries;
    }
  };
  const { api } = loadApiClient({
    storageApi,
    sidebarApi: { bind(handlers) { boundHandlers = handlers; }, render() {} },
    appServices: { confirm: () => true }
  });
  const loadedHistory = await api._test.loadRecentHistoryOnce();

  await boundHandlers.onDeleteHistoryEntry([
    { entry: loadedHistory[0], index: 0, key: loadedHistory[0].historyEntryKey },
    { entry: loadedHistory[2], index: 2, key: loadedHistory[2].historyEntryKey }
  ]);

  assert.equal(saveCount, 1);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].request.url, "https://example.com/two");
});

test("API Client keeps recent history when entry delete is cancelled", async () => {
  let boundHandlers = null;
  let persisted = null;
  const history = [
    { request: { method: "GET", url: "https://example.com/one" }, result: { elapsedMs: 1, response: { statusCode: 200 } } }
  ];
  const sidebarApi = {
    bind(handlers) { boundHandlers = handlers; },
    render() {}
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => ({ root: { id: "root", children: [] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => history,
    saveRecentHistory: async (entries) => {
      persisted = entries;
      return entries;
    }
  };

  loadApiClient({
    sidebarApi,
    storageApi,
    appServices: { confirm: () => false }
  });

  await boundHandlers.onDeleteHistoryEntry(history[0], 0);

  assert.equal(persisted, null);
});

test("API Client bulk deletes selected saved nodes once and normalizes descendants", async () => {
  const { api: storageApi } = loadApiClientStorage();
  let boundHandlers = null;
  let savedCollection = null;
  let saveCount = 0;
  const child = { id: "request-child", type: "request", name: "Child", method: "GET", url: "https://example.com/child" };
  const folder = { id: "folder-parent", type: "folder", name: "Parent", children: [child] };
  const sibling = { id: "request-sibling", type: "request", name: "Sibling", method: "GET", url: "https://example.com/sibling" };
  storageApi.loadCollections = async () => ({ version: 1, root: { id: "root", type: "folder", name: "Saved Requests", children: [folder, sibling] } });
  storageApi.saveCollections = async (collection) => {
    saveCount += 1;
    savedCollection = collection;
    return collection;
  };
  loadApiClient({
    storageApi,
    sidebarApi: { bind(handlers) { boundHandlers = handlers; }, render() {} },
    appServices: { confirm: () => true }
  });

  await boundHandlers.onDeleteNode([folder, child]);

  assert.equal(saveCount, 1);
  assert.deepEqual(savedCollection.root.children.map((node) => node.id), ["request-sibling"]);
});

test("API Client bulk moves selected saved nodes once and rejects descendant targets", async () => {
  const { api: storageApi } = loadApiClientStorage();
  let boundHandlers = null;
  let savedCollection = null;
  let saveCount = 0;
  const requestOne = { id: "request-1", type: "request", name: "One", method: "GET", url: "https://example.com/one" };
  const requestTwo = { id: "request-2", type: "request", name: "Two", method: "GET", url: "https://example.com/two" };
  const nested = { id: "folder-nested", type: "folder", name: "Nested", children: [] };
  const sourceFolder = { id: "folder-source", type: "folder", name: "Source", children: [nested] };
  const targetFolder = { id: "folder-target", type: "folder", name: "Target", children: [] };
  storageApi.loadCollections = async () => ({ version: 1, root: { id: "root", type: "folder", name: "Saved Requests", children: [requestOne, requestTwo, sourceFolder, targetFolder] } });
  storageApi.saveCollections = async (collection) => {
    saveCount += 1;
    savedCollection = collection;
    return collection;
  };
  loadApiClient({ storageApi, sidebarApi: { bind(handlers) { boundHandlers = handlers; }, render() {} } });

  await boundHandlers.onMoveRequest([requestOne, requestTwo], "folder-target");
  assert.equal(saveCount, 1);
  assert.deepEqual(Array.from(storageApi.findNodeById(savedCollection.root, "folder-target").node.children, (node) => node.id), ["request-1", "request-2"]);

  await boundHandlers.onMoveRequest([sourceFolder], "folder-nested");
  assert.equal(saveCount, 1);
});

test("API Client clears recent history after confirmation", async () => {
  const confirms = [];
  let boundHandlers = null;
  let persisted = null;
  const history = [
    { request: { method: "GET", url: "https://example.com/one" }, result: { elapsedMs: 1, response: { statusCode: 200 } } },
    { request: { method: "POST", url: "https://example.com/two" }, result: { elapsedMs: 2, response: { statusCode: 201 } } }
  ];
  const sidebarApi = {
    bind(handlers) { boundHandlers = handlers; },
    render() {}
  };
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    createDefaultEnvironments: () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadCollections: async () => ({ root: { id: "root", children: [] } }),
    loadEnvironments: async () => ({ activeEnvironmentId: "", globals: [], environments: [] }),
    loadRecentHistory: async () => history,
    saveRecentHistory: async (entries) => {
      persisted = entries;
      return entries;
    }
  };

  loadApiClient({
    sidebarApi,
    storageApi,
    appServices: {
      confirm(options) {
        confirms.push(options);
        return true;
      }
    }
  });

  await boundHandlers.onClearHistory();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].title, "Clear History");
  assert.equal(confirms[0].confirmLabel, "Clear");
  assert.equal(confirms[0].confirmVariant, "danger");
  assert.equal(persisted.length, 0);
});
test("API Client persists recent history using the configured limit", async () => {
  let persisted = [];
  const storageApi = {
    createDefaultCollection: () => ({ root: { id: "root", children: [] } }),
    loadRecentHistory: async () => [],
    saveRecentHistory: async (entries, limit) => {
      persisted = entries.slice(0, limit);
      return persisted;
    }
  };
  const { api } = loadApiClient({ storageApi, getRecentHistoryLimit: () => 2 });
  const view = { history: [], tab: { apiClient: {} } };

  api._test.addHistoryEntry(view, { method: "GET", url: "https://example.com/1" }, { elapsedMs: 1, response: { statusCode: 200 } }, null);
  api._test.addHistoryEntry(view, { method: "GET", url: "https://example.com/2" }, { elapsedMs: 2, response: { statusCode: 200 } }, null);
  api._test.addHistoryEntry(view, { method: "GET", url: "https://example.com/3" }, { elapsedMs: 3, response: { statusCode: 200 } }, null);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(view.history.length, 2);
  assert.equal(view.history[0].request.url, "https://example.com/3");
  assert.equal(persisted.length, 2);
  assert.equal(persisted[1].request.url, "https://example.com/2");
});

function createSidebarTestElement(tagName) {
  const element = {
    tagName,
    children: [],
    dataset: {},
    style: { setProperty() {} },
    textContent: "",
    innerHTML: "",
    type: "",
    value: "",
    title: "",
    className: "",
    listeners: {},
    classList: {
      add(...classNames) {
        const existing = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
        classNames.forEach((className) => existing.add(className));
        element.className = Array.from(existing).join(" ");
      },
      remove(...classNames) {
        const removed = new Set(classNames);
        element.className = String(element.className || "").split(/\s+/).filter((className) => className && !removed.has(className)).join(" ");
      },
      toggle(className, force) {
        const hasClass = String(element.className || "").split(/\s+/).includes(className);
        const shouldAdd = force === undefined ? !hasClass : !!force;
        if (shouldAdd) this.add(className);
        else this.remove(className);
        return shouldAdd;
      }
    },
appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...children) {
      children.forEach((child) => {
        child.parentNode = this;
        this.children.push(child);
      });
    },
    removeChild(child) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      this.attributes = this.attributes || {};
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      if (this.attributes) delete this.attributes[name];
    },
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    dispatch(type, eventOptions = {}) {
      const event = {
        target: eventOptions.target || this,
        dataTransfer: eventOptions.dataTransfer || null,
        relatedTarget: eventOptions.relatedTarget || null,
        button: eventOptions.button || 0,
        clientX: eventOptions.clientX || 0,
        clientY: eventOptions.clientY || 0,
        shiftKey: eventOptions.shiftKey === true,
        ctrlKey: eventOptions.ctrlKey === true,
        metaKey: eventOptions.metaKey === true,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; }
      };
      const results = (this.listeners[type] || []).map((handler) => handler(event));
      return Promise.all(results).then(() => event);
    },
    closest(selector) {
      const className = selector.slice(1);
      let current = this;
      while (current) {
        if (current.className?.split(/\s+/).includes(className)) return current;
        current = current.parentNode || null;
      }
      return null;
    },
    querySelector(selector) {
      const found = findSidebarTestElement(this, selector);
      if (found) return found;
      const child = createSidebarTestElement("span");
      if (selector.startsWith(".")) child.className = selector.slice(1);
      this.appendChild(child);
      return child;
    },
    querySelectorAll(selector) {
      return findAllSidebarTestElements(this, selector);
    },
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => child === node || child.contains?.(node));
    }
  };
  return element;
}

function findSidebarTestElement(root, selector) {
  if (!selector.startsWith(".")) return null;
  const className = selector.slice(1);
  const stack = [...root.children];
  while (stack.length) {
    const current = stack.shift();
    if (current.className?.split(/\s+/).includes(className)) return current;
    stack.push(...(current.children || []));
  }
  return null;
}

function findAllSidebarTestElements(root, selector) {
  if (!selector.startsWith(".")) return [];
  const className = selector.slice(1);
  const matches = [];
  const stack = [...root.children];
  while (stack.length) {
    const current = stack.shift();
    if (current.className?.split(/\s+/).includes(className)) matches.push(current);
    stack.push(...(current.children || []));
  }
  return matches;
}

function loadApiClientSidebarForTest() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/sidebar.js"), "utf8");
  const documentListeners = {};
  const testDocument = {
    pointerTarget: null,
    body: createSidebarTestElement("body"),
    createElement: createSidebarTestElement,
    getElementById() { return null; },
    addEventListener(type, handler) { documentListeners[type] = handler; },
    removeEventListener(type, handler) {
      if (documentListeners[type] === handler) delete documentListeners[type];
    },
    elementFromPoint() { return testDocument.pointerTarget; },
    dispatch(type, eventOptions = {}) {
      const event = {
        target: eventOptions.target || testDocument.pointerTarget,
        clientX: eventOptions.clientX || 0,
        clientY: eventOptions.clientY || 0,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; }
      };
      documentListeners[type]?.(event);
      return event;
    }
  };
  const context = {
    window: {},
    document: testDocument,
    module: { exports: {} },
    console,
    URL,
    Boolean,
    String,
    Number,
    Math
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "sidebar.js" });
  const registerSidebar = context.window.registerMarkdownViewerApiClientSidebar;
  registerSidebar._testDocument = testDocument;
  return registerSidebar;
}

function sidebarCollectionForTest() {
  return {
    root: {
      children: [
        { id: "request-1", type: "request", name: "One", method: "GET", url: "https://example.com/one" },
        { id: "request-2", type: "request", name: "Two", method: "GET", url: "https://example.com/two" }
      ]
    }
  };
}

test("API Client sidebar opens saved and history requests on double click", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const openedSaved = [];
  const openedHistory = [];
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, historyList });

  sidebar.bind({
    onOpenRequest: (request) => openedSaved.push(request),
    onOpenHistory: (entry) => openedHistory.push(entry)
  });
  sidebar.render({
    collection: {
      root: {
        children: [
          { id: "saved-1", type: "request", name: "Channels", method: "GET", url: "https://example.com/channels" }
        ]
      }
    },
    history: [
      { request: { method: "POST", url: "https://example.com/posts", headersText: "", bodyText: "{}" } }
    ]
  });

  const savedButton = findSidebarTestElement(savedTree, ".api-client-tree-main");
  const savedRow = findSidebarTestElement(savedTree, ".api-client-request-row");
  const historyItem = findSidebarTestElement(historyList, ".api-client-sidebar-history-item");
  savedButton.dispatch("dblclick");
  savedRow.dispatch("dblclick");
  historyItem.dispatch("dblclick");

  assert.equal(openedSaved.length, 2);
  assert.equal(openedSaved[0].name, "Channels");
  assert.equal(openedSaved[1].name, "Channels");
  assert.equal(openedHistory.length, 1);
  assert.equal(openedHistory[0].request.method, "POST");
});
test("API Client sidebar exposes history delete and clear actions", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const historyList = createSidebarTestElement("div");
  const historyDeleteButton = createSidebarTestElement("button");
  const deletedHistory = [];
  let clearCount = 0;
  const sidebar = registerSidebar({ registerModule() {} }, { historyList, historyDeleteButton });

  sidebar.bind({
    onDeleteHistoryEntry: (entries) => deletedHistory.push(...entries),
    onClearHistory: () => { clearCount += 1; }
  });
  sidebar.render({
    history: [
      { request: { method: "GET", url: "https://example.com/one", headersText: "", bodyText: "" } },
      { request: { method: "POST", url: "https://example.com/two", headersText: "", bodyText: "{}" } }
    ]
  });

  await findSidebarTestElement(historyList, ".api-client-history-clear").dispatch("click");
  assert.equal(historyDeleteButton.disabled, true);
  await findAllSidebarTestElements(historyList, ".api-client-sidebar-history-item")[1].dispatch("click");
  assert.equal(historyDeleteButton.disabled, false);
  await historyDeleteButton.dispatch("click");

  assert.equal(clearCount, 1);
  assert.equal(deletedHistory.length, 1);
  assert.equal(deletedHistory[0].index, 1);
  assert.equal(deletedHistory[0].entry.request.url, "https://example.com/two");
});
test("API Client sidebar applies method classes to chips", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, historyList });

  sidebar.render({
    collection: {
      root: {
        children: [
          { id: "saved-post", type: "request", name: "Create", method: "POST", url: "https://example.com/posts" }
        ]
      }
    },
    history: [
      { request: { method: "DELETE", url: "https://example.com/posts/1", headersText: "", bodyText: "" } }
    ]
  });

  assert.match(findSidebarTestElement(savedTree, ".api-client-method-chip").className, /api-client-method-post/);
  assert.match(findSidebarTestElement(historyList, ".api-client-method-chip").className, /api-client-method-delete/);
});
test("API Client sidebar shortens OPTIONS method chip label", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, historyList });

  sidebar.render({
    collection: { root: { children: [] } },
    history: [
      { request: { method: "OPTIONS", url: "https://example.com/posts", headersText: "", bodyText: "" } }
    ]
  });

  const chip = findSidebarTestElement(historyList, ".api-client-method-chip");
  assert.equal(chip.textContent, "OPTS");
  assert.match(chip.className, /api-client-method-options/);
});
test("API Client sidebar switches between saved and history tabs", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const savedTabButton = createSidebarTestElement("button");
  const historyTabButton = createSidebarTestElement("button");
  const savedSection = createSidebarTestElement("section");
  const historySection = createSidebarTestElement("section");
  registerSidebar({ registerModule() {} }, { savedTree, historyList, savedTabButton, historyTabButton, savedSection, historySection });

  assert.equal(savedSection.hidden, false);
  assert.equal(historySection.hidden, true);
  assert.match(savedTabButton.className, /active/);

  historyTabButton.dispatch("click");
  assert.equal(savedSection.hidden, true);
  assert.equal(historySection.hidden, false);
  assert.match(historyTabButton.className, /active/);

  savedTabButton.dispatch("click");
  assert.equal(savedSection.hidden, false);
  assert.equal(historySection.hidden, true);
});
test("API Client sidebar filters saved requests and history", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const filterInput = createSidebarTestElement("input");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, historyList, filterInput });

  sidebar.render({
    collection: {
      root: {
        children: [
          {
            id: "folder-1",
            type: "folder",
            name: "YouTube Tester",
            children: [
              { id: "request-1", type: "request", name: "Channels", method: "GET", url: "https://example.com/channels" },
              { id: "request-2", type: "request", name: "Posts", method: "POST", url: "https://example.com/posts" }
            ]
          }
        ]
      }
    },
    history: [
      { request: { method: "GET", url: "https://example.com/channels", headersText: "", bodyText: "" }, result: { elapsedMs: 12, response: { statusCode: 200 } } },
      { request: { method: "POST", url: "https://example.com/posts", headersText: "", bodyText: "{}" }, result: { elapsedMs: 24, response: { statusCode: 201 } } }
    ]
  });

  filterInput.value = "channels";
  savedTree.children = [];
  historyList.children = [];
  filterInput.dispatch("input");

  const requestNames = findAllSidebarTestElements(savedTree, ".api-client-request-name").map((element) => element.textContent);
  const historyUrls = findAllSidebarTestElements(historyList, ".api-client-history-url").map((element) => element.textContent);
  assert.deepEqual(requestNames, ["Channels"]);
  assert.deepEqual(historyUrls, ["example.com/channels"]);
});
test("API Client sidebar displays folders before requests", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });

  sidebar.render({
    collection: {
      root: {
        children: [
          { id: "request-root", type: "request", name: "Root Request", method: "GET", url: "https://example.com/root" },
          {
            id: "folder-1",
            type: "folder",
            name: "First",
            children: [
              { id: "request-child", type: "request", name: "Child Request", method: "GET", url: "https://example.com/child" },
              { id: "folder-child", type: "folder", name: "Nested", children: [] }
            ]
          },
          { id: "folder-2", type: "folder", name: "Second", children: [] }
        ]
      }
    }
  });

  const rootNodes = savedTree.children.slice(1).map((child) => child.className?.split(/\s+/).includes("api-client-tree-folder") ? child.children[0].dataset.nodeId : child.dataset.nodeId);
  const firstFolderChildren = savedTree.children[1].children[1].children.map((child) => child.className?.split(/\s+/).includes("api-client-tree-folder") ? child.children[0].dataset.nodeId : child.dataset.nodeId);

  assert.deepEqual(rootNodes, ["folder-1", "folder-2", "request-root"]);
  assert.deepEqual(firstFolderChildren, ["folder-child", "request-child"]);
});
test("API Client sidebar toggles folders from the folder icon, text, and row", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });

  sidebar.render({
    collection: {
      root: {
        children: [
          {
            id: "folder-1",
            type: "folder",
            name: "YouTube Tester",
            children: [
              { id: "request-1", type: "request", name: "Channels", method: "GET", url: "https://example.com/channels" }
            ]
          }
        ]
      }
    }
  });

  const folderIcon = findSidebarTestElement(savedTree, ".api-client-folder-toggle");
  const folderChildren = findSidebarTestElement(savedTree, ".api-client-tree-folder-children");
  assert.equal(folderChildren.hidden, true);

  folderIcon.dispatch("click");
  assert.equal(folderChildren.hidden, false);

  folderIcon.dispatch("click");
  assert.equal(folderChildren.hidden, true);
});
test("API Client sidebar expands and collapses all saved folders from the toolbar", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const toggleFoldersButton = createSidebarTestElement("button");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, toggleFoldersButton });

  sidebar.render({
    collection: {
      root: {
        children: [
          {
            id: "folder-1",
            type: "folder",
            name: "Users",
            children: [
              { id: "folder-2", type: "folder", name: "Nested", children: [] },
              { id: "request-1", type: "request", name: "List", method: "GET", url: "https://example.com/users" }
            ]
          }
        ]
      }
    }
  });

  const latestFolderHiddenStates = () => {
    const rootFolder = savedTree.children[savedTree.children.length - 1];
    const rootFolderChildren = rootFolder.children[1];
    const nestedFolder = rootFolderChildren.children.find((child) => child.className?.split(/\s+/).includes("api-client-tree-folder"));
    return [rootFolderChildren.hidden, nestedFolder.children[1].hidden];
  };

  assert.deepEqual(latestFolderHiddenStates(), [true, true]);
  assert.equal(toggleFoldersButton.title, "Expand all folders");

  await toggleFoldersButton.dispatch("click");
  assert.deepEqual(latestFolderHiddenStates(), [false, false]);
  assert.equal(toggleFoldersButton.title, "Collapse all folders");

  await toggleFoldersButton.dispatch("click");
  assert.deepEqual(latestFolderHiddenStates(), [true, true]);
  assert.equal(toggleFoldersButton.title, "Expand all folders");
});
test("API Client sidebar expands parent folders for the selected saved request", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });

  sidebar.render({
    selectedNodeId: "request-1",
    collection: {
      root: {
        children: [
          {
            id: "folder-1",
            type: "folder",
            name: "Users",
            children: [
              { id: "request-1", type: "request", name: "List", method: "GET", url: "https://example.com/users" }
            ]
          }
        ]
      }
    }
  });

  const folderChildren = findSidebarTestElement(savedTree, ".api-client-tree-folder-children");
  assert.equal(folderChildren.hidden, false);
  assert.match(findSidebarTestElement(savedTree, ".api-client-request-row").className, /selected/);
});
test("API Client sidebar creates requests from folder action", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const createdInFolders = [];
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });

  sidebar.bind({
    onNewRequest: (folder) => createdInFolders.push(folder)
  });
  sidebar.render({
    collection: {
      root: {
        children: [
          { id: "folder-1", type: "folder", name: "YouTube Tester", children: [] }
        ]
      }
    }
  });

  const newRequestButton = findSidebarTestElement(savedTree, ".api-client-tree-action");
  assert.match(newRequestButton.innerHTML, /bi-plus-lg/);
  newRequestButton.dispatch("click");

  assert.equal(createdInFolders.length, 1);
  assert.equal(createdInFolders[0].id, "folder-1");
});
test("API Client sidebar supports saved request toggle and visible range selection", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const testDocument = registerSidebar._testDocument;
  const savedTree = createSidebarTestElement("div");
  const selections = [];
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });
  sidebar.bind({
    onSelectRequest: (_primary, nodes) => selections.push(Array.from(nodes, (node) => node.id))
  });
  sidebar.render({
    collection: {
      root: {
        children: [
          { id: "folder-1", type: "folder", name: "Folder", children: [{ id: "request-child", type: "request", name: "Child", method: "GET", url: "https://example.com/child" }] },
          { id: "request-1", type: "request", name: "One", method: "GET", url: "https://example.com/one" },
          { id: "request-2", type: "request", name: "Two", method: "GET", url: "https://example.com/two" }
        ]
      }
    }
  });

  const rowById = (id) => findAllSidebarTestElements(savedTree, ".api-client-tree-row").find((row) => row.dataset.nodeId === id);
  const clickSavedRow = async (row, eventOptions = {}) => {
    await row.dispatch("pointerdown", { button: 0 });
    testDocument.dispatch("pointerup");
    await row.dispatch("click", eventOptions);
  };
  await clickSavedRow(rowById("folder-1"), { ctrlKey: true });
  await clickSavedRow(rowById("request-2"), { ctrlKey: true });
  assert.deepEqual(selections.at(-1), ["folder-1", "request-2"]);

  await clickSavedRow(rowById("request-1"));
  assert.deepEqual(selections.at(-1), ["request-1"]);
  await clickSavedRow(rowById("folder-1"), { shiftKey: true });
  assert.deepEqual(selections.at(-1), ["folder-1", "request-1"]);
  assert.equal(rowById("request-child").className.includes("selected"), false);
  assert.equal(rowById("folder-1").attributes["aria-selected"], "true");

  savedTree.children = [];
  sidebar.render({ collection: sidebarCollectionForTest(), selectedNodeIds: ["request-1", "request-2"] });
  const rerenderedRows = findAllSidebarTestElements(savedTree, ".api-client-tree-row");
  assert.equal(rerenderedRows.filter((row) => row.className.includes("selected")).length, 2);
});
test("API Client sidebar supports history range selection and bulk delete", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const historyList = createSidebarTestElement("div");
  const historyDeleteButton = createSidebarTestElement("button");
  const selections = [];
  const deletes = [];
  const sidebar = registerSidebar({ registerModule() {} }, { historyList, historyDeleteButton });
  sidebar.bind({
    onSelectHistory: (entries) => selections.push(Array.from(entries, (item) => item.key)),
    onDeleteHistoryEntry: (entries) => deletes.push(Array.from(entries, (item) => item.key))
  });
  const history = [
    { request: { method: "GET", url: "https://example.com/one" } },
    { request: { method: "GET", url: "https://example.com/two" } },
    { request: { method: "GET", url: "https://example.com/three" } }
  ];
  sidebar.render({ history, historyEntryKeys: ["history-1", "history-2", "history-3"] });

  const items = findAllSidebarTestElements(historyList, ".api-client-sidebar-history-item");
  await items[0].dispatch("click");
  await items[2].dispatch("click", { shiftKey: true });
  assert.deepEqual(selections.at(-1), ["history-1", "history-2", "history-3"]);
  await historyDeleteButton.dispatch("click");
  assert.deepEqual(deletes[0], ["history-1", "history-2", "history-3"]);
  assert.equal(findAllSidebarTestElements(historyList, ".api-client-sidebar-history-row").every((row) => row.attributes["aria-selected"] === "true"), true);
});
test("API Client sidebar range selection follows filtered saved request order", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const filterInput = createSidebarTestElement("input");
  const selections = [];
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, filterInput });
  sidebar.bind({ onSelectRequest: (_primary, nodes) => selections.push(Array.from(nodes, (node) => node.id)) });
  const collection = {
    root: {
      children: [
        { id: "request-1", type: "request", name: "Keep One", method: "GET", url: "https://example.com/keep-one" },
        { id: "request-hidden", type: "request", name: "Hidden", method: "GET", url: "https://example.com/hidden" },
        { id: "request-2", type: "request", name: "Keep Two", method: "GET", url: "https://example.com/keep-two" }
      ]
    }
  };
  sidebar.render({ collection });
  await findAllSidebarTestElements(savedTree, ".api-client-tree-row")[0].dispatch("click");
  filterInput.value = "keep";
  savedTree.children = [];
  await filterInput.dispatch("input");
  const filteredRows = findAllSidebarTestElements(savedTree, ".api-client-tree-row");
  await filteredRows[1].dispatch("click", { shiftKey: true });

  assert.deepEqual(selections.at(-1), ["request-1", "request-2"]);
});
test("API Client sidebar drags saved nodes between folders and root", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const testDocument = registerSidebar._testDocument;
  const savedTree = createSidebarTestElement("div");
  const moves = [];
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree });

  sidebar.bind({
    onMoveRequest: (nodes, folderId) => moves.push({ nodeIds: Array.from(nodes, (node) => node.id), folderId })
  });
  sidebar.render({
    collection: {
      root: {
        children: [
          {
            id: "folder-1",
            type: "folder",
            name: "First",
            children: [
              { id: "request-1", type: "request", name: "Move Me", method: "GET", url: "https://example.com/move" },
              { id: "folder-3", type: "folder", name: "Nested", children: [] }
            ]
          },
          { id: "folder-2", type: "folder", name: "Second", children: [] }
        ]
      }
    }
  });

  const requestRow = findSidebarTestElement(savedTree, ".api-client-request-row");
  const requestButton = findSidebarTestElement(requestRow, ".api-client-tree-main");
  const rootDropTarget = findSidebarTestElement(savedTree, ".api-client-root-drop-target");
  assert.equal(rootDropTarget.textContent, "\\");
  const folderRows = findAllSidebarTestElements(savedTree, ".api-client-folder-row");
  const targetFolderRow = folderRows.find((row) => row.dataset.nodeId === "folder-2");
  await requestButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = targetFolderRow;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  assert.match(targetFolderRow.className, /api-client-drop-target/);
  const requestPreview = findSidebarTestElement(testDocument.body, ".api-client-drag-preview");
  assert.match(requestPreview.className, /api-client-tree-row/);
  assert.match(requestPreview.className, /api-client-request-row/);
  assert.equal(requestPreview.textContent, "GET Move Me");
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[0], { nodeIds: ["request-1"], folderId: "folder-2" });
  assert.equal(findSidebarTestElement(testDocument.body, ".api-client-drag-preview"), null);

  await requestButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = requestRow;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  const sourceFolderRow = folderRows.find((row) => row.dataset.nodeId === "folder-1");
  assert.match(sourceFolderRow.className, /api-client-drop-target/);
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[1], { nodeIds: ["request-1"], folderId: "folder-1" });

  await requestButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = rootDropTarget;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  assert.match(rootDropTarget.className, /api-client-drop-target/);
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[2], { nodeIds: ["request-1"], folderId: "root" });

  const nestedFolderRow = folderRows.find((row) => row.dataset.nodeId === "folder-3");
  const nestedFolderButton = findSidebarTestElement(nestedFolderRow, ".api-client-tree-main");
  await nestedFolderButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = targetFolderRow;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  assert.equal(findSidebarTestElement(testDocument.body, ".api-client-drag-preview").textContent, "Nested");
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[3], { nodeIds: ["folder-3"], folderId: "folder-2" });

  await nestedFolderButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = rootDropTarget;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  assert.match(rootDropTarget.className, /api-client-drop-target/);
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[4], { nodeIds: ["folder-3"], folderId: "root" });

  await requestRow.dispatch("click");
  await nestedFolderRow.dispatch("click", { ctrlKey: true });
  await nestedFolderRow.dispatch("click", { ctrlKey: true });
  await requestButton.dispatch("pointerdown", { clientX: 0, clientY: 0, button: 0 });
  testDocument.pointerTarget = targetFolderRow;
  testDocument.dispatch("pointermove", { clientX: 12, clientY: 0 });
  assert.equal(findSidebarTestElement(testDocument.body, ".api-client-drag-preview").textContent, "2 selected items");
  testDocument.dispatch("pointerup", { clientX: 12, clientY: 0 });
  assert.deepEqual(moves[5], { nodeIds: ["request-1", "folder-3"], folderId: "folder-2" });
});
test("API Client sidebar switches to environments tab and masks secret values", () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const savedTree = createSidebarTestElement("div");
  const historyList = createSidebarTestElement("div");
  const environmentList = createSidebarTestElement("div");
  const globalVariables = createSidebarTestElement("div");
  const environmentVariables = createSidebarTestElement("div");
  const savedTabButton = createSidebarTestElement("button");
  const historyTabButton = createSidebarTestElement("button");
  const environmentTabButton = createSidebarTestElement("button");
  const savedSection = createSidebarTestElement("section");
  const historySection = createSidebarTestElement("section");
  const environmentSection = createSidebarTestElement("section");
  const sidebar = registerSidebar({ registerModule() {} }, { savedTree, historyList, environmentList, globalVariables, environmentVariables, savedTabButton, historyTabButton, environmentTabButton, savedSection, historySection, environmentSection });
  const globalVariableChanges = [];
  const selectedEnvironments = [];
  const renamedEnvironments = [];
  const deletedEnvironments = [];
  sidebar.bind({
    onChangeGlobals: (variables) => globalVariableChanges.push(variables),
    onSelectEnvironment: (environmentId) => selectedEnvironments.push(environmentId),
    onRenameEnvironment: (environment) => renamedEnvironments.push(environment),
    onDeleteEnvironment: (environment) => deletedEnvironments.push(environment)
  });

  environmentTabButton.dispatch("click");
  assert.equal(savedSection.hidden, true);
  assert.equal(historySection.hidden, true);
  assert.equal(environmentSection.hidden, false);

  sidebar.render({
    environments: {
      activeEnvironmentId: "env-1",
      globals: [{ key: "apiKey", type: "secret", currentValue: "secret-value" }],
      environments: [
        { id: "env-1", name: "Local", variables: [{ key: "baseUrl", currentValue: "https://local.test" }] },
        { id: "env-2", name: "QA", variables: [{ key: "baseUrl", currentValue: "https://qa.test" }] }
      ]
    }
  });

  const environmentSelect = findSidebarTestElement(environmentList, ".api-client-sidebar-environment-select");
  assert.equal(environmentSelect.value, "env-1");
  assert.deepEqual(environmentSelect.children.map((option) => option.textContent), ["No Environment", "Local", "QA"]);
  const environmentKeyInputs = findAllSidebarTestElements(environmentVariables, ".api-client-variable-key");
  assert.equal(environmentKeyInputs[0].value, "baseUrl");
  const environmentCurrentInputs = findAllSidebarTestElements(environmentVariables, ".api-client-variable-current");
  assert.equal(environmentCurrentInputs[0].value, "https://local.test");

  environmentSelect.value = "env-2";
  environmentSelect.dispatch("change");
  assert.equal(selectedEnvironments.at(-1), "env-2");
  findSidebarTestElement(environmentList, ".api-client-sidebar-rename-environment").dispatch("click");
  findSidebarTestElement(environmentList, ".api-client-sidebar-delete-environment").dispatch("click");
  assert.equal(renamedEnvironments[0].id, "env-2");
  assert.equal(deletedEnvironments[0].id, "env-2");
  assert.equal(findSidebarTestElement(globalVariables, ".api-client-variable-current").type, "password");

  const addButtons = findAllSidebarTestElements(globalVariables, ".api-client-variable-add");
  assert.equal(addButtons[0].textContent, "+ Variable");
  assert.equal(addButtons[1].textContent, "+ Secret");
  addButtons[1].dispatch("click");

  const currentInputs = findAllSidebarTestElements(globalVariables, ".api-client-variable-current");
  assert.equal(currentInputs[currentInputs.length - 1].type, "password");
  const keyInputs = findAllSidebarTestElements(globalVariables, ".api-client-variable-key");
  keyInputs[keyInputs.length - 1].value = "token";
  keyInputs[keyInputs.length - 1].dispatch("input");

  assert.equal(globalVariableChanges.at(-1).at(-1).key, "token");
  assert.equal(globalVariableChanges.at(-1).at(-1).type, "secret");
});


test("API Client sidebar confirms variable deletes before changing variables", async () => {
  const registerSidebar = loadApiClientSidebarForTest();
  const environmentList = createSidebarTestElement("div");
  const globalVariables = createSidebarTestElement("div");
  const environmentVariables = createSidebarTestElement("div");
  const sidebar = registerSidebar({ registerModule() {} }, { environmentList, globalVariables, environmentVariables });
  const confirmResults = [false, true, true];
  const confirmedVariables = [];
  const globalVariableChanges = [];
  const environmentVariableChanges = [];
  const getDeleteButtons = (root) => findAllSidebarTestElements(root, ".api-client-variable-action").filter((button) => button.title === "Delete variable");

  sidebar.bind({
    onConfirmDeleteVariable(variable) {
      confirmedVariables.push(variable);
      return confirmResults.shift();
    },
    onChangeGlobals: (variables) => globalVariableChanges.push(variables),
    onChangeEnvironmentVariables: (environmentId, variables) => environmentVariableChanges.push({ environmentId, variables })
  });
  sidebar.render({
    environments: {
      activeEnvironmentId: "env-1",
      globals: [{ key: "apiKey", type: "secret", currentValue: "secret-value" }],
      environments: [{ id: "env-1", name: "Local", variables: [{ key: "baseUrl", currentValue: "https://local.test" }] }]
    }
  });

  await getDeleteButtons(globalVariables)[0].dispatch("click");
  assert.equal(confirmedVariables[0].key, "apiKey");
  assert.equal(globalVariableChanges.length, 0);
  assert.equal(findAllSidebarTestElements(globalVariables, ".api-client-variable-row").length, 1);

  await getDeleteButtons(globalVariables)[0].dispatch("click");
  assert.equal(globalVariableChanges.at(-1).length, 0);
  assert.equal(findAllSidebarTestElements(globalVariables, ".api-client-variable-row").length, 0);

  await getDeleteButtons(environmentVariables)[0].dispatch("click");
  assert.equal(confirmedVariables.at(-1).key, "baseUrl");
  assert.equal(environmentVariableChanges.at(-1).environmentId, "env-1");
  assert.equal(environmentVariableChanges.at(-1).variables.length, 0);
});
test("API Client send button switches to Cancel while sending", () => {
  const { api } = loadApiClient({
    isNeutralinoRuntime: () => true,
    Neutralino: { os: { spawnProcess() {} } }
  });
  const icon = { className: "" };
  const label = { textContent: "" };
  const view = {
    sendButton: {
      disabled: false,
      querySelector(selector) {
        if (selector === "i") return icon;
        if (selector === "span") return label;
        return null;
      }
    },
    methodSelect: { value: "POST", disabled: false },
    urlInput: { disabled: false },
    paramsInput: { disabled: false },
    headersInput: { disabled: false },
    bodyInput: { disabled: false },
    formDataInput: { disabled: false },
    bodyModeInputs: []
  };

  api._test.setSending(view, true);
  assert.equal(label.textContent, "Cancel");
  assert.equal(icon.className, "bi bi-stop-circle");
  assert.equal(view.sendButton.disabled, false);

  api._test.setSending(view, false);
  assert.equal(label.textContent, "Send");
  assert.equal(icon.className, "bi bi-send");
  assert.equal(view.sendButton.disabled, false);
});
test("API Client syncs params text with URL query strings", () => {
  const { api } = loadApiClient();

  assert.equal(api.getParamsTextFromUrl("https://example.com/posts?key1=value1&key2=value2"), "key1:value1\nkey2:value2");
  assert.equal(api.applyParamsTextToUrl("https://example.com/posts?old=true", "key1:value1\n//key2:value2"), "https://example.com/posts?key1=value1");
});

test("API Client parses key-value bulk edit lines", () => {
  const { api } = loadApiClient();

  assert.deepEqual(JSON.parse(JSON.stringify(api.parseKeyValueLines("one: two\nthree=four\n//off: disabled"))), [
    { enabled: true, key: "one", value: "two" },
    { enabled: true, key: "three", value: "four" },
    { enabled: false, key: "off", value: "disabled" }
  ]);
});

test("API Client builds form-data request payloads", () => {
  const { api } = loadApiClient();
  const payload = api.buildRequestPayload({
    methodSelect: { value: "POST" },
    urlInput: { value: "https://example.com/api" },
    headersInput: { value: "" },
    bodyModeInputs: [{ checked: true, value: "form-data" }],
    bodyInput: { value: "raw should not send" },
    formDataInput: { value: "title: Hello\nbody=World" }
  });

  assert.equal(payload.bodyMode, "form-data");
  assert.equal(payload.body, "");
  assert.deepEqual(JSON.parse(JSON.stringify(payload.formData)), [
    { key: "title", value: "Hello" },
    { key: "body", value: "World" }
  ]);
});

test("API Client renders response info, raw body, headers, and cookies", () => {
  const { api } = loadApiClient();
  const view = {
    responseMeta: { textContent: "" },
    responseInfoStatus: { textContent: "" },
    responseInfoTime: { textContent: "" },
    responseInfoSize: { textContent: "" },
    responseHeaders: { textContent: "" },
    responseHeadersTable: createElement(),
    responseCookies: createElement(),
    responseBody: { textContent: "" },
    responseRawBody: { textContent: "" }
  };

  api._test.renderResponse(view, {
    elapsedMs: 15,
    response: {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "application/json", "set-cookie": ["sid=abc; Path=/"] },
      body: '{"ok":true}',
      sizeBytes: 11
    }
  });

  assert.equal(view.responseInfoStatus.textContent, "Status: 200 OK");
  assert.equal(view.responseInfoTime.textContent, "Time: 15 ms");
  assert.equal(view.responseInfoSize.textContent, "Size: 11 B");
  assert.equal(view.responseRawBody.textContent, '{"ok":true}');
  assert.ok(view.responseHeadersTable.children.length > 0);
  assert.ok(view.responseCookies.children.length > 0);
});

test("API Client renders HTML responses in the preview frame", () => {
  const { api } = loadApiClient();
  const attributes = {};
  const view = {
    responseMeta: { textContent: "" },
    responseInfoStatus: { textContent: "" },
    responseInfoTime: { textContent: "" },
    responseInfoSize: { textContent: "" },
    responseHeaders: { textContent: "" },
    responseHeadersTable: createElement(),
    responseCookies: createElement(),
    responseBody: { textContent: "", hidden: false },
    responseRawBody: { textContent: "" },
    responseRenderSelect: { value: "html" },
    responsePreviewFrame: {
      hidden: true,
      srcdoc: "",
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; }
    }
  };

  api._test.renderResponse(view, {
    elapsedMs: 7,
    response: {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "text/html" },
      body: "<h1>Hello</h1>"
    }
  });

  assert.equal(view.responseRenderSelect.value, "html");
  assert.equal(view.responsePreviewFrame.hidden, false);
  assert.equal(view.responsePreviewFrame.srcdoc, "<h1>Hello</h1>");
  assert.equal(attributes.sandbox, "");
  assert.equal(view.responseBody.hidden, true);
  assert.equal(view.responseRawBody.textContent, "<h1>Hello</h1>");
});
test("API Client copies the visible response body", async () => {
  const copied = [];
  const { api } = loadApiClient({
    Neutralino: { clipboard: { writeText: async (text) => copied.push(text) } }
  });
  const icon = { className: "bi bi-copy" };
  const view = {
    responseBody: { textContent: "pretty body", hidden: true },
    responseRawBody: { textContent: "raw body", hidden: false },
    responseCopyButton: {
      querySelector(selector) {
        return selector === "i" ? icon : null;
      }
    }
  };

  await api._test.copyResponseBody(view);

  assert.deepEqual(copied, ["raw body"]);
  assert.equal(icon.className, "bi bi-check-lg");
});
test("API Client copies raw response headers", async () => {
  const copied = [];
  const { api } = loadApiClient({
    Neutralino: { clipboard: { writeText: async (text) => copied.push(text) } }
  });
  const icon = { className: "bi bi-copy" };
  const view = {
    responseHeaders: { textContent: "content-type: application/json\ncache-control: no-cache" },
    responseHeadersCopyButton: {
      querySelector(selector) {
        return selector === "i" ? icon : null;
      }
    }
  };

  await api._test.copyResponseHeaders(view);

  assert.deepEqual(copied, ["content-type: application/json\ncache-control: no-cache"]);
  assert.equal(icon.className, "bi bi-check-lg");
});
test("API Client bridge creates multipart form-data bodies", () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const multipart = bridge.createMultipartBody([{ key: "title", value: "Hello" }]);
  const body = multipart.body.toString("utf8");

  assert.match(multipart.boundary, /^----md-editor-api-client-/);
  assert.match(body, /Content-Disposition: form-data; name="title"/);
  assert.match(body, /Hello/);
});
test("API Client bridge follows 301 redirects and reports final URL", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const server = http.createServer((request, response) => {
    if (request.url === "/start") {
      response.writeHead(301, { Location: "/final" });
      response.end("moved");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("final");
  });
  const baseUrl = await listen(server);
  try {
    const result = await bridge.sendRequest({ method: "GET", url: `${baseUrl}/start`, requestSettings: { autoFollowRedirects: true, maxRedirects: 10 } });
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.response.body, "final");
    assert.equal(result.redirects.length, 1);
    assert.equal(result.redirects[0].statusCode, 301);
    assert.equal(result.finalUrl, `${baseUrl}/final`);
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge stops at max redirects and returns the redirect response", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const server = http.createServer((_request, response) => {
    response.writeHead(302, { Location: "/final" });
    response.end("stop");
  });
  const baseUrl = await listen(server);
  try {
    const result = await bridge.sendRequest({ method: "GET", url: `${baseUrl}/start`, requestSettings: { autoFollowRedirects: true, maxRedirects: 0 } });
    assert.equal(result.response.statusCode, 302);
    assert.equal(result.response.body, "stop");
    assert.deepEqual(result.redirects, []);
    assert.equal(result.finalUrl, `${baseUrl}/start`);
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge converts or preserves redirect methods based on settings", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const received = [];
  const server = http.createServer((request, response) => {
    if (request.url === "/start") {
      response.writeHead(302, { Location: "/target" });
      response.end();
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ method: request.method, body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
  });
  const baseUrl = await listen(server);
  try {
    await bridge.sendRequest({ method: "POST", url: `${baseUrl}/start`, bodyMode: "raw", body: "abc", requestSettings: { autoFollowRedirects: true, preserveMethodOnRedirect: false } });
    await bridge.sendRequest({ method: "POST", url: `${baseUrl}/start`, bodyMode: "raw", body: "abc", requestSettings: { autoFollowRedirects: true, preserveMethodOnRedirect: true } });
    assert.deepEqual(received, [{ method: "GET", body: "" }, { method: "POST", body: "abc" }]);
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge strips auth and custom headers across origins by default", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  let targetHeaders = null;
  const targetServer = http.createServer((request, response) => {
    targetHeaders = request.headers;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  const targetUrl = await listen(targetServer);
  const redirectServer = http.createServer((_request, response) => {
    response.writeHead(301, { Location: `${targetUrl}/target` });
    response.end();
  });
  const redirectUrl = await listen(redirectServer);
  try {
    await bridge.sendRequest({
      method: "GET",
      url: `${redirectUrl}/start`,
      headers: { Authorization: "Bearer secret", "X-Trace": "debug", Accept: "application/json" },
      requestSettings: { autoFollowRedirects: true, redirectAuthHeaderPolicy: "same-origin", redirectCustomHeaderPolicy: "same-origin" }
    });
    assert.equal(targetHeaders.authorization, undefined);
    assert.equal(targetHeaders["x-trace"], undefined);
    assert.equal(targetHeaders.accept, "application/json");
  } finally {
    await closeServer(redirectServer);
    await closeServer(targetServer);
  }
});

test("API Client bridge normalizes SSL verification settings", () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const request = bridge.validateRequest({ method: "GET", url: "https://example.com", requestSettings: { sslCertificateVerification: false, timeoutMs: 2500, trustedCertificates: [{ host: "EXAMPLE.COM", fingerprint256: "AA:BB", pem: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----" }] } });

  assert.equal(request.requestSettings.sslCertificateVerification, false);
  assert.equal(request.requestSettings.trustedCertificates[0].host, "example.com");
  assert.equal(request.requestSettings.trustedCertificates[0].fingerprint256, "AA:BB");
  assert.equal(request.timeoutMs, 2500);
});


test("API Client bridge normalizes very useful request settings", () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const request = bridge.validateRequest({
    method: "GET",
    url: "http://example.com",
    requestSettings: {
      sendNoCacheHeader: true,
      maxResponseSizeBytes: 2048,
      responseRenderMode: "html",
      decompressResponses: false,
      proxyMode: "custom",
      proxyUrl: "http://127.0.0.1:8080",
      httpVersion: "http1.1"
    }
  });

  assert.equal(request.requestSettings.sendNoCacheHeader, true);
  assert.equal(request.requestSettings.maxResponseSizeBytes, 2048);
  assert.equal(request.requestSettings.responseRenderMode, "html");
  assert.equal(request.requestSettings.decompressResponses, false);
  assert.equal(request.requestSettings.proxyMode, "custom");
  assert.equal(request.requestSettings.proxyUrl, "http://127.0.0.1:8080/");
  assert.equal(request.requestSettings.httpVersion, "http1.1");
});

test("API Client bridge applies no-cache headers", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  let receivedHeaders = null;
  const server = http.createServer((request, response) => {
    receivedHeaders = request.headers;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  const baseUrl = await listen(server);
  try {
    await bridge.sendRequest({ method: "GET", url: baseUrl, requestSettings: { sendNoCacheHeader: true } });
    assert.equal(receivedHeaders["cache-control"], "no-cache");
    assert.equal(receivedHeaders.pragma, "no-cache");
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge enforces max response size", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("x".repeat(2048));
  });
  const baseUrl = await listen(server);
  try {
    await assert.rejects(
      bridge.sendRequest({ method: "GET", url: baseUrl, requestSettings: { maxResponseSizeBytes: 1024 } }),
      /maximum size/
    );
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge decompresses gzip responses by default", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  const zlib = require("node:zlib");
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
    response.end(zlib.gzipSync(Buffer.from('{"ok":true}')));
  });
  const baseUrl = await listen(server);
  try {
    const result = await bridge.sendRequest({ method: "GET", url: baseUrl });
    assert.equal(result.response.body, '{"ok":true}');
  } finally {
    await closeServer(server);
  }
});

test("API Client bridge uses custom HTTP proxy for HTTP targets", async () => {
  const bridge = require(path.resolve(__dirname, "../../desktop-app/resources/bridges/api-client-bridge/api-client-bridge.cjs"));
  let proxyRequestUrl = "";
  let proxyHostHeader = "";
  const targetServer = http.createServer((_request, response) => {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("target should not receive direct request");
  });
  const targetUrl = await listen(targetServer);
  const proxyServer = http.createServer((request, response) => {
    proxyRequestUrl = request.url;
    proxyHostHeader = request.headers.host;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("proxied");
  });
  const proxyUrl = await listen(proxyServer);
  try {
    const result = await bridge.sendRequest({ method: "GET", url: targetUrl + "/resource?x=1", requestSettings: { proxyMode: "custom", proxyUrl } });
    assert.equal(result.response.body, "proxied");
    assert.equal(proxyRequestUrl, targetUrl + "/resource?x=1");
    assert.equal(proxyHostHeader, new URL(targetUrl).host);
  } finally {
    await closeServer(proxyServer);
    await closeServer(targetServer);
  }
});

test("API Client storage normalizes legacy saved requests into new request fields", () => {
  const { api } = loadApiClientStorage();
  const saved = api.upsertRequest(api.createDefaultCollection(), "root", {
    name: "Legacy",
    method: "POST",
    url: "https://example.com/posts",
    headersText: "Content-Type: application/json",
    bodyText: "{}"
  });

  assert.equal(saved.request.bodyMode, "raw");
  assert.equal(saved.request.paramsText, "");
  assert.equal(saved.request.formDataText, "");
});

test("API Client storage preserves Json body mode and exports it as Postman raw", () => {
  const { api } = loadApiClientStorage();
  const saved = api.upsertRequest(api.createDefaultCollection(), "root", {
    name: "JSON Request",
    method: "POST",
    url: "https://example.com/posts",
    headersText: "Content-Type: application/json",
    bodyMode: "json",
    bodyText: '{\n  "ok": true\n}'
  });

  assert.equal(saved.request.bodyMode, "json");
  const postman = api.exportCollectionToPostman(saved.collection);
  assert.equal(postman.item[0].request.body.mode, "raw");
  assert.equal(postman.item[0].request.body.raw, '{\n  "ok": true\n}');
});

test("API Client save split button switches primary action labels", () => {
  const { api } = loadApiClient();
  const primaryLabel = { textContent: "" };
  const menuLabel = { textContent: "" };
  const attributes = {};
  const view = {
    saveButton: {
      title: "",
      querySelector: () => primaryLabel,
      setAttribute(name, value) { attributes[name] = value; }
    },
    saveAsButton: {
      querySelector: () => menuLabel
    }
  };

  api._test.setSaveButtonMode(view, "save-as");
  assert.equal(view.saveAction, "save-as");
  assert.equal(primaryLabel.textContent, "Save As");
  assert.equal(menuLabel.textContent, "Save");
  assert.equal(attributes["aria-label"], "Save As");

  api._test.setSaveButtonMode(view, "save");
  assert.equal(view.saveAction, "save");
  assert.equal(primaryLabel.textContent, "Save");
  assert.equal(menuLabel.textContent, "Save As");
});

test("API Client save button flashes saved feedback and restores", () => {
  let restoreCallback = null;
  const { api } = loadApiClient({
    setTimeout(callback) {
      restoreCallback = callback;
      return "timer-1";
    }
  });
  const label = { textContent: "Save" };
  const menuLabel = { textContent: "Save As" };
  const classes = new Set();
  const attributes = {};
  const view = {
    saveAction: "save",
    saveButton: {
      title: "Save",
      querySelector: () => label,
      setAttribute(name, value) { attributes[name] = value; },
      classList: {
        add(className) { classes.add(className); },
        remove(className) { classes.delete(className); }
      }
    },
    saveAsButton: {
      querySelector: () => menuLabel
    }
  };

  api._test.flashSaveButton(view, "Saved");
  assert.equal(label.textContent, "Saved");
  assert.equal(attributes["aria-label"], "Saved");
  assert.equal(classes.has("api-client-save-success"), true);

  restoreCallback();
  assert.equal(label.textContent, "Save");
  assert.equal(attributes["aria-label"], "Save");
  assert.equal(classes.has("api-client-save-success"), false);
});
test("API Client save dropdown shows Save As option when toggled", () => {
  const { api } = loadApiClient();
  const attributes = {};
  const saveMenu = {
    className: "",
    hidden: true,
    classList: {
      add(className) { saveMenu.className = `${saveMenu.className} ${className}`.trim(); },
      remove(className) { saveMenu.className = saveMenu.className.split(/\s+/).filter((name) => name && name !== className).join(" "); },
      toggle(className, force) { force === false ? this.remove(className) : this.add(className); }
    }
  };
  const view = {
    saveMenu,
    saveToggleButton: {
      setAttribute(name, value) { attributes[name] = value; }
    }
  };

  api._test.toggleSaveMenu(view);
  assert.equal(saveMenu.hidden, false);
  assert.match(saveMenu.className, /show/);
  assert.equal(attributes["aria-expanded"], "true");

  api._test.closeSaveMenu(view);
  assert.equal(saveMenu.hidden, true);
  assert.doesNotMatch(saveMenu.className, /show/);
  assert.equal(attributes["aria-expanded"], "false");
});
test("API Client code snippets expose the requested language order", () => {
  const { api } = loadApiClientCodeSnippets();

  assert.deepEqual(JSON.parse(JSON.stringify(api.getSnippetLanguages().map((language) => language.label))), [
    "cURL",
    "Shell - wget",
    "JavaScript - Fetch",
    "JavaScript - XHR",
    "Kotlin - Okhttp",
    "NodeJs - Request",
    "PowerShell - RestMethod",
    "Python - Requests",
    "Swift - URLSession",
    "C# - HttpClient"
  ]);
  assert.equal(api.getDefaultSnippetLanguageId(), "curl");
  assert.equal(api.getSnippetSyntaxLanguage("curl"), "bash");
  assert.equal(api.getSnippetSyntaxLanguage("javascript-fetch"), "javascript");
  assert.equal(api.getSnippetSyntaxLanguage("missing"), "bash");
});

test("API Client code snippets generate GET and POST snippets with headers", () => {
  const { api } = loadApiClientCodeSnippets();
  const getSnippet = api.buildSnippet("curl", {
    method: "GET",
    url: "https://example.com/posts?key=value",
    headers: { Accept: "application/json" },
    bodyMode: "none"
  });
  const postSnippet = api.buildSnippet("javascript-fetch", {
    method: "POST",
    url: "https://example.com/posts",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    bodyMode: "raw",
    body: "{\"title\":\"Hello\"}"
  });

  assert.match(getSnippet, /^curl/);
  assert.match(getSnippet, /--location/);
  assert.match(getSnippet, /--max-redirs 10/);
  assert.match(getSnippet, /--max-time 60/);
  assert.match(getSnippet, /--header 'Accept: application\/json'/);
  assert.doesNotMatch(getSnippet, /--data/);
  assert.match(postSnippet, /method: "POST"/);
  assert.match(postSnippet, /myHeaders\.append\("Content-Type", "application\/json"\)/);
  assert.match(postSnippet, /body: raw/);
});
test("API Client code snippets reflect request settings where supported", () => {
  const { api } = loadApiClientCodeSnippets();
  const curlSnippet = api.buildSnippet("curl", {
    method: "POST",
    url: "https://example.com/posts",
    headers: {},
    bodyMode: "raw",
    body: "{}",
    requestSettings: {
      autoFollowRedirects: true,
      maxRedirects: 2,
      preserveMethodOnRedirect: true,
      timeoutMs: 5000,
      sslCertificateVerification: false,
      sendNoCacheHeader: true,
      maxResponseSizeBytes: 1048576,
      decompressResponses: true,
      proxyMode: "custom",
      proxyUrl: "http://127.0.0.1:8080",
      httpVersion: "http1.1"
    }
  });
  const fetchSnippet = api.buildSnippet("javascript-fetch", {
    method: "GET",
    url: "https://example.com/posts",
    headers: {},
    requestSettings: { autoFollowRedirects: false, timeoutMs: 7000, sendNoCacheHeader: true }
  });
  const wgetSnippet = api.buildSnippet("shell-wget", {
    method: "GET",
    url: "https://example.com/posts",
    headers: {},
    requestSettings: { autoFollowRedirects: false, timeoutMs: 3000, sslCertificateVerification: false, sendNoCacheHeader: true, proxyMode: "custom", proxyUrl: "http://127.0.0.1:8080" }
  });

  assert.match(curlSnippet, /--max-redirs 2/);
  assert.match(curlSnippet, /--post301/);
  assert.match(curlSnippet, /--post302/);
  assert.match(curlSnippet, /--max-time 5/);
  assert.match(curlSnippet, /--insecure/);
  assert.match(curlSnippet, /--compressed/);
  assert.match(curlSnippet, /--max-filesize 1048576/);
  assert.match(curlSnippet, /--proxy 'http:\/\/127\.0\.0\.1:8080'/);
  assert.match(curlSnippet, /--http1\.1/);
  assert.match(curlSnippet, /--header 'Cache-Control: no-cache'/);
  assert.match(curlSnippet, /--header 'Pragma: no-cache'/);
  assert.match(fetchSnippet, /redirect: "manual"/);
  assert.match(fetchSnippet, /cache: "no-cache"/);
  assert.match(fetchSnippet, /AbortSignal\.timeout\(7000\)/);
  assert.match(wgetSnippet, /--max-redirect=0/);
  assert.match(wgetSnippet, /--timeout=3/);
  assert.match(wgetSnippet, /--no-check-certificate/);
  assert.match(wgetSnippet, /-e http_proxy='http:\/\/127\.0\.0\.1:8080'/);
  assert.match(wgetSnippet, /--header 'Cache-Control: no-cache'/);
  assert.match(wgetSnippet, /--header 'Pragma: no-cache'/);
});

test("API Client code snippets generate form-data and escaped raw bodies", () => {
  const { api } = loadApiClientCodeSnippets();
  const formSnippet = api.buildSnippet("python-requests", {
    method: "POST",
    url: "https://example.com/upload",
    headers: { Accept: "application/json" },
    bodyMode: "form-data",
    formData: [{ key: "title", value: "Hello" }]
  });
  const escapedSnippet = api.buildSnippet("nodejs-request", {
    method: "POST",
    url: "https://example.com/posts",
    headers: { "X-Note": "quote \"here\"" },
    bodyMode: "raw",
    body: "line one\nline \"two\""
  });

  assert.match(formSnippet, /payload = \{/);
  assert.match(formSnippet, /"title": "Hello"/);
  assert.match(escapedSnippet, /"X-Note": "quote \\"here\\""/);
  assert.match(escapedSnippet, /body: "line one\\nline \\"two\\""/);
});

test("API Client code snippet drawer opens, switches, copies, and closes", async () => {
  const copied = [];
  const { api } = loadApiClient({
    copyTextToClipboard: async (text) => copied.push(text)
  });
  const attributes = {};
  const copyIcon = { className: "bi bi-copy" };
  const view = {
    methodSelect: { value: "POST" },
    urlInput: { value: "https://example.com/posts" },
    paramsInput: { value: "" },
    headersInput: { value: "Content-Type: application/json" },
    bodyModeInputs: [{ checked: true, value: "raw" }],
    bodyInput: { value: "{\"title\":\"Hello\"}" },
    formDataInput: { value: "" },
    codeLayer: {
      hidden: true,
      className: "",
      classList: {
        add(className) { this.owner.className = className; },
        remove() { this.owner.className = ""; },
        owner: null
      }
    },
    codeButton: { setAttribute(name, value) { attributes[name] = value; } },
    codeLanguageSelect: { value: "curl", focus() { this.focused = true; } },
    codeCopyButton: { querySelector: () => copyIcon },
    codeSnippetCode: { textContent: "", innerHTML: "", className: "" }
  };
  view.codeLayer.classList.owner = view.codeLayer;

  api._test.openCodeSnippetLayer(view);
  assert.equal(view.codeLayer.hidden, false);
  assert.equal(attributes["aria-expanded"], "true");
  assert.match(view.codeSnippetCode.innerHTML, /curl/);

  view.codeLanguageSelect.value = "python-requests";
  api._test.renderCodeSnippet(view);
  assert.match(view.codeSnippetCode.innerHTML, /hljs-keyword">import/);
  assert.match(view.codeSnippetCode.innerHTML, /hljs-built_in">requests/);

  await api._test.copyCodeSnippet(view);
  assert.equal(copied.length, 1);
  assert.equal(copied[0], view.currentCodeSnippet);
  assert.equal(copyIcon.className, "bi bi-check-lg");

  api._test.closeCodeSnippetLayer(view);
  assert.equal(view.codeLayer.hidden, true);
  assert.equal(attributes["aria-expanded"], "false");
});

test("API Client code snippet drawer highlights snippet text when highlighter is available", () => {
  const highlightCalls = [];
  const { api } = loadApiClient({
    hljs: {
      highlight(code, options) {
        highlightCalls.push({ code, options });
        return { value: "<span class=\"hljs-built_in\">curl</span>" };
      }
    }
  });
  const view = {
    methodSelect: { value: "GET" },
    urlInput: { value: "https://example.com/posts" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    codeLanguageSelect: { value: "curl" },
    codeSnippetCode: { textContent: "", innerHTML: "", className: "" }
  };

  const snippet = api._test.renderCodeSnippet(view);

  assert.match(snippet, /^curl/);
  assert.match(snippet, /--location/);
  assert.equal(highlightCalls.length, 1);
  assert.equal(highlightCalls[0].options.language, "bash");
  assert.equal(highlightCalls[0].options.ignoreIllegals, true);
  assert.equal(view.codeSnippetCode.className, "hljs language-bash");
  assert.match(view.codeSnippetCode.innerHTML, /hljs-built_in/);
});

test("API Client code snippet drawer uses local fallback syntax highlighting", () => {
  const { api } = loadApiClient();
  const view = {
    methodSelect: { value: "GET" },
    urlInput: { value: "https://example.com/posts" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    codeLanguageSelect: { value: "javascript-xhr" },
    codeSnippetCode: { textContent: "", innerHTML: "", className: "" }
  };

  api._test.renderCodeSnippet(view);

  assert.equal(view.codeSnippetCode.className, "hljs language-javascript");
  assert.match(view.codeSnippetCode.innerHTML, /hljs-keyword/);
  assert.match(view.codeSnippetCode.innerHTML, /hljs-built_in/);
  assert.match(view.codeSnippetCode.innerHTML, /hljs-string/);
});
test("API Client cookie jar normalizes cookie documents", () => {
  const { api } = loadApiClientStorage();
  const normalized = api.normalizeCookiesDocument({
    domains: [
      {
        domain: "https://Example.com/path",
        cookies: [
          { name: "sid", value: "abc", path: "", sameSite: "Lax" },
          { name: "", value: "ignored" }
        ]
      },
      { domain: "", cookies: [{ name: "ignored" }] }
    ]
  });

  assert.equal(api.createDefaultCookies().version, 1);
  assert.equal(normalized.domains.length, 1);
  assert.equal(normalized.domains[0].domain, "example.com");
  assert.equal(normalized.domains[0].cookies.length, 1);
  assert.equal(normalized.domains[0].cookies[0].path, "/");
  assert.equal(normalized.domains[0].cookies[0].sameSite, "lax");
  assert.equal(normalized.domains[0].cookies[0].enabled, true);
});

test("API Client cookie jar persists profile data and falls back to localStorage", async () => {
  const writes = [];
  const localWrites = [];
  const { api } = loadApiClientStorage({
    getProfileDataFilePath: async (file) => `profile/${file}`,
    Neutralino: { filesystem: { writeFile: async (file, content) => writes.push({ file, content }) } },
    localStorage: { setItem: (key, value) => localWrites.push({ key, value }) }
  });

  await api.saveCookies({ domains: [{ domain: "example.com", cookies: [{ name: "sid", value: "abc" }] }] });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].file, "profile/api-client/cookies.json");
  assert.equal(JSON.parse(writes[0].content).domains[0].cookies[0].name, "sid");
  assert.equal(localWrites.length, 0);

  const fallbackWrites = [];
  const fallback = loadApiClientStorage({
    getProfileDataFilePath: async () => "profile/api-client/cookies.json",
    Neutralino: { filesystem: { writeFile: async () => { throw new Error("profile unavailable"); } } },
    localStorage: { setItem: (key, value) => fallbackWrites.push({ key, value }) }
  }).api;

  await fallback.saveCookies({ domains: [{ domain: "example.org", cookies: [{ name: "theme", value: "dark" }] }] });
  assert.equal(fallbackWrites.length, 1);
  assert.equal(fallbackWrites[0].key, "markdownViewerApiClientCookies");
});

test("API Client applies matching cookie jar values to request headers", () => {
  const { api } = loadApiClient();
  const cookiesDocument = {
    domains: [
      {
        domain: "example.com",
        cookies: [
          { name: "sid", value: "jar", path: "/app", enabled: true },
          { name: "theme", value: "dark", path: "/app", enabled: true },
          { name: "expired", value: "old", expires: "Tue, 06 Jul 2021 04:42:52 GMT", enabled: true },
          { name: "off", value: "no", enabled: false }
        ]
      },
      { domain: "other.com", cookies: [{ name: "other", value: "skip", enabled: true }] }
    ]
  };

  const payload = api.buildRequestPayload({
    methodSelect: { value: "GET" },
    urlInput: { value: "https://api.example.com/app/items" },
    paramsInput: { value: "" },
    headersInput: { value: "Cookie: sid=request" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    cookiesDocument
  });

  assert.equal(payload.headers.Cookie, "sid=request; theme=dark");
});

test("API Client skips secure cookies for HTTP requests", () => {
  const { api } = loadApiClient();
  const headers = api.applyCookieJarToHeaders({}, "http://example.com/app", {
    domains: [{ domain: "example.com", cookies: [{ name: "secureOnly", value: "yes", secure: true }, { name: "plain", value: "ok" }] }]
  });

  assert.equal(headers.Cookie, "plain=ok");
});
test("API Client request payload includes request settings and can disable cookie jar", () => {
  const { api } = loadApiClient({
    getRequestSettings: () => ({
      autoFollowRedirects: false,
      maxRedirects: 3,
      preserveMethodOnRedirect: true,
      redirectAuthHeaderPolicy: "never",
      redirectCustomHeaderPolicy: "always",
      timeoutMs: 12000,
      sslCertificateVerification: false,
      trustedCertificates: [{ host: "EXAMPLE.COM", fingerprint256: "AA:BB", pem: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----" }],
      cookieJarEnabled: false,
      sendNoCacheHeader: false,
      maxResponseSizeBytes: 1048576,
      responseRenderMode: "xml",
      decompressResponses: false,
      proxyMode: "custom",
      proxyUrl: "http://127.0.0.1:8080",
      httpVersion: "http1.1"
    })
  });

  const payload = api.buildRequestPayload({
    methodSelect: { value: "GET" },
    urlInput: { value: "https://example.com/app" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    cookiesDocument: { domains: [{ domain: "example.com", cookies: [{ name: "sid", value: "jar", path: "/", enabled: true }] }] }
  });

  assert.equal(payload.timeoutMs, 12000);
  assert.equal(payload.headers.Cookie, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.requestSettings)), {
    autoFollowRedirects: false,
    maxRedirects: 3,
    preserveMethodOnRedirect: true,
    redirectAuthHeaderPolicy: "never",
    redirectCustomHeaderPolicy: "always",
    timeoutMs: 12000,
    sslCertificateVerification: false,
    trustedCertificates: [{ host: "example.com", port: "443", fingerprint256: "AA:BB", subject: null, issuer: null, validFrom: "", validTo: "", serialNumber: "", pem: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----" }],
    cookieJarEnabled: false,
    sendNoCacheHeader: false,
    maxResponseSizeBytes: 1048576,
    responseRenderMode: "xml",
    decompressResponses: false,
    proxyMode: "custom",
    proxyUrl: "http://127.0.0.1:8080",
    httpVersion: "http1.1"
  });
});

test("API Client request payload adds no-cache headers when enabled", () => {
  const { api } = loadApiClient({
    getRequestSettings: () => ({ sendNoCacheHeader: true })
  });

  const payload = api.buildRequestPayload({
    methodSelect: { value: "GET" },
    urlInput: { value: "https://example.com/app" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json\nCache-Control: max-age=60" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" }
  });

  assert.equal(payload.headers["Cache-Control"], "max-age=60");
  assert.equal(payload.headers.Pragma, "no-cache");
});

test("API Client auto response render mode infers from content type", () => {
  const { api } = loadApiClient();
  const view = {
    responseBody: { textContent: "", hidden: false },
    responseRenderSelect: { value: "auto" },
    responsePreviewFrame: { hidden: true, srcdoc: "", setAttribute() {}, removeAttribute() {} }
  };

  api._test.renderResponsePreview(view, '{"ok":true}', "application/json", "auto");

  assert.equal(view.responseRenderSelect.value, "json");
  assert.equal(view.responseBody.textContent, '{\n  "ok": true\n}');
});

test("API Client cookie manager renders empty state and adds domains", async () => {
  const storageApi = loadApiClientStorage().api;
  let savedCookies = storageApi.createDefaultCookies();
  const { api } = loadApiClient({
    storageApi: {
      ...storageApi,
      loadCookies: async () => savedCookies,
      saveCookies: async (document) => {
        savedCookies = storageApi.normalizeCookiesDocument(document);
        return savedCookies;
      }
    }
  });
  const classNames = new Set();
  const attributes = {};
  const view = {
    cookieLayer: {
      hidden: true,
      classList: { add: (name) => classNames.add(name), remove: (name) => classNames.delete(name) },
      querySelector: () => null
    },
    cookieContent: { innerHTML: "" },
    cookieDomainInput: { value: "https://Example.com/users", focus() { this.focused = true; } },
    cookieButton: { setAttribute(name, value) { attributes[name] = value; } }
  };

  await api._test.openCookieManagerLayer(view);
  assert.equal(view.cookieLayer.hidden, false);
  assert.equal(attributes["aria-expanded"], "true");
  assert.match(view.cookieContent.innerHTML, /No cookies available/);

  await api._test.handleCookieAction(view, { dataset: { cookieAction: "add-domain" }, closest: () => null });
  assert.equal(savedCookies.domains[0].domain, "example.com");
  assert.match(view.cookieContent.innerHTML, /example.com/);

  api._test.closeCookieManagerLayer(view);
  assert.equal(view.cookieLayer.hidden, true);
  assert.equal(attributes["aria-expanded"], "false");
});
test("API Client console shows cookie-injected raw requests and raw responses", () => {
  const { api } = loadApiClient();
  const payload = api.buildRequestPayload({
    methodSelect: { value: "GET" },
    urlInput: { value: "https://google.com/search?q=test" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    cookiesDocument: {
      domains: [{ domain: "google.com", cookies: [{ name: "aaa", value: "bbb", path: "/", enabled: true }] }]
    }
  });
  const view = {
    responseConsoleRequest: { textContent: "" },
    responseConsoleResponse: { textContent: "" }
  };

  api._test.renderConsoleRequest(view, payload);
  api._test.renderConsoleResponse(view, {
    response: { statusCode: 301, statusMessage: "Moved Permanently", headers: { location: "https://www.google.com/" }, body: "redirect" }
  });

  assert.match(view.responseConsoleRequest.textContent, /^GET \/search\?q=test HTTP\/1\.1/);
  assert.match(view.responseConsoleRequest.textContent, /Host: google\.com/);
  assert.match(view.responseConsoleRequest.textContent, /Accept: application\/json/);
  assert.match(view.responseConsoleRequest.textContent, /Cookie: aaa=bbb/);
  assert.match(view.responseConsoleResponse.textContent, /^HTTP 301 Moved Permanently/);
  assert.match(view.responseConsoleResponse.textContent, /location: https:\/\/www\.google\.com\//);
  assert.match(view.responseConsoleResponse.textContent, /redirect/);
});
test("API Client console shows redirect history before the final response", () => {
  const { api } = loadApiClient();
  const view = {
    responseConsoleResponse: { textContent: "" }
  };

  api._test.renderConsoleResponse(view, {
    finalUrl: "https://example.com/final",
    redirects: [
      { method: "POST", url: "https://example.com/start", statusCode: 302, statusMessage: "Found", location: "https://example.com/final" }
    ],
    response: { statusCode: 200, statusMessage: "OK", headers: { "content-type": "text/plain" }, body: "done" }
  });

  assert.match(view.responseConsoleResponse.textContent, /^Redirects/);
  assert.match(view.responseConsoleResponse.textContent, /1\. POST https:\/\/example\.com\/start - 302 Found -> https:\/\/example\.com\/final/);
  assert.match(view.responseConsoleResponse.textContent, /Final URL: https:\/\/example\.com\/final/);
  assert.match(view.responseConsoleResponse.textContent, /HTTP 200 OK/);
  assert.match(view.responseConsoleResponse.textContent, /done/);
});
test("API Client exposes cookie jar cookies as a generated header row", () => {
  const { api } = loadApiClient();
  const row = api._test.getGeneratedCookieHeaderRow({
    methodSelect: { value: "GET" },
    urlInput: { value: "https://google.com/search" },
    paramsInput: { value: "" },
    headersInput: { value: "Accept: application/json" },
    bodyModeInputs: [],
    bodyInput: { value: "" },
    formDataInput: { value: "" },
    cookiesDocument: {
      domains: [{ domain: "google.com", cookies: [{ name: "aaa", value: "bbb", path: "/", enabled: true }] }]
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(row)), {
    enabled: false,
    key: "Cookie",
    value: "aaa=bbb",
    generated: true
  });
});
test("API Client response preview stretches to available panel height", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  const contentRule = css.match(/\.api-client-response-content,\s*\.api-client-response-body-panel\s*\{(?<body>[^}]+)\}/);
  const bodyRules = Array.from(css.matchAll(/\.api-client-response-body-panel\s*\{(?<body>[^}]+)\}/g));
  const shellRule = css.match(/\.api-client-response-body-shell,\s*\.api-client-response-preview\s*\{(?<body>[^}]+)\}/);
  const frameRule = css.match(/\.api-client-response-preview-frame\s*\{(?<body>[^}]+)\}/);

  assert.ok(contentRule, "response content flex rule exists");
  assert.match(contentRule.groups.body, /display:\s*flex;/);
  assert.match(contentRule.groups.body, /flex-direction:\s*column;/);
  assert.ok(bodyRules.some((match) => /flex:\s*1 1 auto;/.test(match.groups.body)), "response body panel flex growth rule exists");
  assert.ok(shellRule, "response body shell flex rule exists");
  assert.match(shellRule.groups.body, /flex:\s*1 1 auto;/);
  assert.ok(frameRule, "response iframe flex rule exists");
  assert.match(frameRule.groups.body, /flex:\s*1 1 auto;/);
});

test("API Client raw request body stretches to available panel height", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  const layoutRule = css.match(/\.api-client-request-content,\s*\.api-client-body-panel,\s*\.api-client-body-group,\s*\.api-client-body-mode-panel\[data-body-panel="raw"\]\s*\{(?<body>[^}]+)\}/);
  const growthRule = css.match(/\.api-client-request-content > \.api-client-tab-panel,\s*\.api-client-body-group,\s*\.api-client-body-mode-panel\[data-body-panel="raw"\],\s*\.api-client-body\s*\{(?<body>[^}]+)\}/);
  const bodyPanelRule = css.match(/\.api-client-body-panel\s*\{(?<body>[^}]+)\}/);

  assert.ok(layoutRule, "request body flex-column rule exists");
  assert.match(layoutRule.groups.body, /display:\s*flex;/);
  assert.match(layoutRule.groups.body, /min-height:\s*0;/);
  assert.match(layoutRule.groups.body, /flex-direction:\s*column;/);
  assert.ok(growthRule, "request body flex-growth rule exists");
  assert.match(growthRule.groups.body, /flex:\s*1 1 auto;/);
  assert.ok(bodyPanelRule, "request body overflow rule exists");
  assert.match(bodyPanelRule.groups.body, /overflow:\s*hidden;/);
});

test("API Client console stacks request above response", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  const match = css.match(/\.api-client-console-grid\s*\{(?<body>[^}]+)\}/);

  assert.ok(match, "console grid CSS rule exists");
  assert.match(match.groups.body, /grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(match.groups.body, /repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

function createSplitPaneEventTarget(rect = {}) {
  const listeners = new Map();
  const attributes = {};
  const classes = new Set();
  return {
    style: {},
    attributes,
    capturedPointerId: null,
    releasedPointerId: null,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    },
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) || new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      Array.from(listeners.get(type) || []).forEach((listener) => listener(event));
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 600, height: 0, ...rect };
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    setPointerCapture(pointerId) {
      this.capturedPointerId = pointerId;
    },
    releasePointerCapture(pointerId) {
      this.releasedPointerId = pointerId;
    }
  };
}

function loadApiClientSplitPane(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/split-pane.js"), "utf8");
  const documentTarget = createSplitPaneEventTarget();
  documentTarget.body = createSplitPaneEventTarget();
  const context = { window: {}, module: { exports: {} }, console };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "split-pane.js" });
  const api = context.window.registerMarkdownViewerApiClientSplitPane(null, { document: documentTarget });
  const workspace = createSplitPaneEventTarget({ height: options.height || 808 });
  const separator = createSplitPaneEventTarget({ height: options.separatorHeight || 8 });
  return { api, documentTarget, workspace, separator };
}

function assertRatio(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `expected ${actual} to equal ${expected}`);
}

test("API Client split pane starts at the accessible 45/55 default", () => {
  const { api, workspace, separator } = loadApiClientSplitPane();
  const changes = [];
  const controller = api.bindResizableSplitPane({ workspace, separator, onRatioChange: (ratio) => changes.push(ratio) });

  assertRatio(controller.getRatio(), 0.45);
  assert.match(workspace.style.gridTemplateRows, /0\.45fr.*0\.55fr/);
  assert.equal(separator.attributes["aria-valuenow"], "45");
  assert.equal(separator.attributes["aria-valuetext"], "45% request, 55% response");
  assert.deepEqual(changes, []);
});

test("API Client split pane drags in both directions and clamps pane heights", () => {
  const { api, documentTarget, workspace, separator } = loadApiClientSplitPane();
  const changes = [];
  const controller = api.bindResizableSplitPane({ workspace, separator, onRatioChange: (ratio) => changes.push(ratio) });
  const preventDefault = () => {};

  separator.dispatch("pointerdown", { button: 0, isPrimary: true, pointerId: 7, clientY: 360, preventDefault });
  assert.equal(separator.capturedPointerId, 7);
  assert.equal(documentTarget.body.classList.contains("api-client-split-resizing"), true);

  documentTarget.dispatch("pointermove", { pointerId: 7, clientY: 440, preventDefault });
  assertRatio(controller.getRatio(), 0.55);
  documentTarget.dispatch("pointermove", { pointerId: 7, clientY: -1000, preventDefault });
  assertRatio(controller.getRatio(), 0.225);
  documentTarget.dispatch("pointermove", { pointerId: 7, clientY: 2000, preventDefault });
  assertRatio(controller.getRatio(), 0.775);

  documentTarget.dispatch("pointerup", { pointerId: 7 });
  assert.equal(separator.releasedPointerId, 7);
  assert.equal(documentTarget.body.classList.contains("api-client-split-resizing"), false);
  assert.equal(documentTarget.listenerCount("pointermove"), 0);
  assert.ok(changes.length >= 3);
});

test("API Client split pane supports keyboard resizing and lifecycle cleanup", () => {
  const { api, documentTarget, workspace, separator } = loadApiClientSplitPane();
  const controller = api.bindResizableSplitPane({ workspace, separator, initialRatio: 0.45 });
  const preventDefault = () => {};

  separator.dispatch("keydown", { key: "ArrowDown", preventDefault });
  assertRatio(controller.getRatio(), 0.4625);
  separator.dispatch("keydown", { key: "ArrowUp", shiftKey: true, preventDefault });
  assertRatio(controller.getRatio(), 0.4125);
  separator.dispatch("keydown", { key: "Home", preventDefault });
  assertRatio(controller.getRatio(), 0.225);
  separator.dispatch("keydown", { key: "End", preventDefault });
  assertRatio(controller.getRatio(), 0.775);
  assert.equal(separator.attributes["aria-valuemin"], "23");
  assert.equal(separator.attributes["aria-valuemax"], "78");

  separator.dispatch("pointerdown", { button: 0, pointerId: 11, clientY: 400, preventDefault });
  controller.destroy();
  assert.equal(documentTarget.listenerCount("pointermove"), 0);
  assert.equal(separator.listenerCount("pointerdown"), 0);
  assert.equal(separator.listenerCount("keydown"), 0);
  assert.equal(documentTarget.body.classList.contains("api-client-split-resizing"), false);
});

test("API Client split ratios remain independent per tab and survive remounting", () => {
  const first = loadApiClientSplitPane();
  const second = loadApiClientSplitPane();
  const firstTab = { apiClient: { splitRatio: 0.35 } };
  const secondTab = { apiClient: { splitRatio: 0.65 } };
  const preventDefault = () => {};
  const firstController = first.api.bindResizableSplitPane({
    workspace: first.workspace,
    separator: first.separator,
    initialRatio: firstTab.apiClient.splitRatio,
    onRatioChange(splitRatio) { firstTab.apiClient.splitRatio = splitRatio; }
  });
  second.api.bindResizableSplitPane({
    workspace: second.workspace,
    separator: second.separator,
    initialRatio: secondTab.apiClient.splitRatio,
    onRatioChange(splitRatio) { secondTab.apiClient.splitRatio = splitRatio; }
  });

  first.separator.dispatch("keydown", { key: "ArrowDown", preventDefault });
  assert.ok(firstTab.apiClient.splitRatio > 0.35);
  assertRatio(secondTab.apiClient.splitRatio, 0.65);
  firstController.destroy();

  const remounted = loadApiClientSplitPane();
  const remountedController = remounted.api.bindResizableSplitPane({
    workspace: remounted.workspace,
    separator: remounted.separator,
    initialRatio: firstTab.apiClient.splitRatio
  });
  assertRatio(remountedController.getRatio(), firstTab.apiClient.splitRatio);
});

test("API Client mounts and destroys its per-tab split-pane controller", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/api-client/api-client.js"), "utf8");

  assert.match(source, /role="separator" aria-orientation="horizontal"/);
  assert.match(source, /initialRatio:\s*tab\.apiClient\?\.splitRatio/);
  assert.match(source, /view\.tab\.apiClient = \{ \.\.\.\(view\.tab\.apiClient \|\| \{\}\), splitRatio \}/);
  assert.match(source, /view\?\.splitPaneController\?\.destroy\?\.\(\)/);
});
