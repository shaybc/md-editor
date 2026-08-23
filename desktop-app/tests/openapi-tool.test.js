const assert = require("node:assert/strict");
const test = require("node:test");
const yaml = require("yaml");

const detector = require("../resources/js/tools/openapi/detector.js");
const requestMapper = require("../resources/js/tools/openapi/request-mapper.js");
const endpointScanner = require("../resources/js/tools/openapi/endpoint-scanner.js");
const generator = require("../resources/js/tools/openapi/generator.js");
const explorer = require("../resources/js/tools/openapi/explorer.js");

const yamlLibrary = {
  load(source) {
    return yaml.parse(source);
  }
};

test("OpenAPI detection accepts valid OpenAPI YAML and Swagger JSON", () => {
  const openapi = detector.detectOpenApiDocument([
    "openapi: 3.1.0",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n"), "openapi.yaml", { yamlLibrary });

  const swagger = detector.detectOpenApiDocument(JSON.stringify({
    swagger: "2.0",
    info: { title: "Pets", version: "1.0.0" },
    paths: {}
  }), "swagger.json", { yamlLibrary });

  assert.equal(openapi.openapi, true);
  assert.equal(swagger.openapi, true);
});

test("OpenAPI detection rejects Kubernetes, package JSON, schema-only, and malformed YAML", () => {
  const kubernetes = detector.detectOpenApiDocument("apiVersion: v1\nkind: Service\nmetadata:\n  name: app\n", "service.yaml", { yamlLibrary });
  const packageJson = detector.detectOpenApiDocument(JSON.stringify({ name: "app", version: "1.0.0" }), "package.json", { yamlLibrary });
  const schemaOnly = detector.detectOpenApiDocument("type: object\nproperties:\n  id:\n    type: string\n", "schema.yaml", { yamlLibrary });
  const malformed = detector.detectOpenApiDocument("openapi: 3.0.0\ninfo: [", "openapi.yaml", { yamlLibrary });

  assert.equal(kubernetes.openapi, false);
  assert.equal(packageJson.openapi, false);
  assert.equal(schemaOnly.openapi, false);
  assert.equal(malformed.openapi, false);
  assert.equal(malformed.reason, "parse-error");
});

test("OpenAPI explorer represents parameters, responses, and operation tags", () => {
  const tree = explorer.buildOpenApiExplorer({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1.0.0" },
    tags: [{ name: "pets" }],
    paths: {
      "/pets/{id}": {
        parameters: [{ name: "id", in: "path", required: true }],
        get: {
          summary: "Get pet",
          tags: ["pets"],
          parameters: [{ name: "verbose", in: "query" }],
          responses: {
            "200": { description: "OK" },
            "404": { description: "Missing" }
          }
        }
      }
    }
  });
  const paths = tree.children.find((node) => node.id === "paths");
  const pathNode = paths.children.find((node) => node.id === "path:/pets/{id}");
  const pathParameters = pathNode.children.find((node) => node.id === "path:/pets/{id}:parameters");
  const operation = pathNode.children.find((node) => node.id === "operation:get:/pets/{id}");
  const operationParameters = operation.children.find((node) => node.label === "Parameters");
  const responses = operation.children.find((node) => node.label === "Responses");
  const tags = operation.children.find((node) => node.label === "Tags");

  assert.equal(pathParameters.children[0].label, "path id");
  assert.equal(operationParameters.children[0].label, "query verbose");
  assert.deepEqual(responses.children.map((node) => node.label), ["200", "404"]);
  assert.equal(tags.children[0].label, "pets");
  assert.equal(responses.children[0].pointer, "/paths/~1pets~1{id}/get/responses/200");
});
test("OpenAPI explorer represents all standard components submaps", () => {
  const tree = explorer.buildOpenApiExplorer({
    openapi: "3.1.0",
    info: { title: "Museum", version: "1.0.0" },
    paths: {},
    components: {
      schemas: { Ticket: { type: "object" } },
      responses: { BadRequest: { description: "Bad request" } },
      parameters: { StartDate: { name: "startDate", in: "query" } },
      examples: { TicketExample: { value: { id: "T1" } } },
      requestBodies: { TicketBody: { content: {} } },
      headers: { RateLimit: { schema: { type: "integer" } } },
      securitySchemes: { ApiKey: { type: "apiKey" } },
      links: { TicketLink: { operationId: "getTicket" } },
      callbacks: { TicketCallback: {} },
      pathItems: { TicketPath: { get: {} } }
    }
  });
  const components = tree.children.find((node) => node.id === "components");
  const groups = components.children.map((node) => node.label);

  assert.deepEqual(groups, ["schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links", "callbacks", "pathItems"]);
  assert.equal(components.children.find((node) => node.label === "responses").children[0].pointer, "/components/responses/BadRequest");
  assert.equal(components.children.find((node) => node.label === "requestBodies").children[0].kind, "requestBody");
  assert.equal(components.children.find((node) => node.label === "pathItems").children[0].pointer, "/components/pathItems/TicketPath");
});
test("OpenAPI explorer follows document order for represented elements", () => {
  const tree = explorer.buildOpenApiExplorer({
    openapi: "3.1.0",
    info: { title: "Ordered API", version: "1.0.0" },
    servers: [{ url: "https://example.test" }],
    paths: {
      "/z-last": {
        post: { responses: { "201": { description: "Created" } } },
        parameters: [{ name: "trace", in: "header" }],
        get: {
          responses: { "200": { description: "OK" } },
          tags: ["ordered"],
          parameters: [{ name: "verbose", in: "query" }]
        }
      },
      "/a-first": {
        delete: { responses: { "204": { description: "Done" } } }
      }
    },
    components: {
      responses: { Second: { description: "Second" }, First: { description: "First" } },
      schemas: { Beta: { type: "object" }, Alpha: { type: "object" } },
      parameters: { Later: { name: "later", in: "query" } }
    },
    tags: [{ name: "ordered" }],
    security: [{ ApiKey: [] }]
  });

  assert.deepEqual(tree.children.map((node) => node.id), ["general", "servers", "paths", "components", "tags", "security"]);
  const paths = tree.children.find((node) => node.id === "paths");
  assert.deepEqual(paths.children.map((node) => node.label), ["/z-last", "/a-first"]);
  const pathNode = paths.children[0];
  assert.deepEqual(pathNode.children.map((node) => node.label), ["POST", "Parameters", "GET"]);
  assert.deepEqual(pathNode.children[2].children.map((node) => node.label), ["Responses", "Tags", "Parameters"]);
  const components = tree.children.find((node) => node.id === "components");
  assert.deepEqual(components.children.map((node) => node.label), ["responses", "schemas", "parameters"]);
  assert.deepEqual(components.children[0].children.map((node) => node.label), ["Second", "First"]);
});
test("operation mapping creates an API Client request with server, params, headers, and body", () => {
  const document = {
    openapi: "3.0.3",
    info: { title: "Pets", version: "1.0.0" },
    servers: [{ url: "http://localhost:8080" }],
    paths: {
      "/pets/{id}": {
        post: {
          summary: "Update pet",
          parameters: [
            { name: "id", in: "path", schema: { type: "integer", example: 42 } },
            { $ref: "#/components/parameters/Verbose" },
            { $ref: "#/components/parameters/TraceHeader" }
          ],
          requestBody: { $ref: "#/components/requestBodies/PetUpdate" }
        }
      }
    },
    components: {
      parameters: {
        Verbose: { name: "verbose", in: "query", schema: { type: "boolean", example: true } },
        TraceHeader: { name: "X-Trace", in: "header", schema: { type: "string", example: "abc" } }
      },
      requestBodies: {
        PetUpdate: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PetUpdate" }
            }
          }
        }
      },
      schemas: {
        PetUpdate: {
          type: "object",
          properties: {
            name: { type: "string", example: "Fido" }
          }
        }
      }
    }
  };

  const request = requestMapper.createOpenApiClientRequest(document, {
    method: "POST",
    path: "/pets/{id}"
  });

  assert.equal(request.method, "POST");
  assert.equal(request.url, "http://localhost:8080/pets/42?verbose=true");
  assert.equal(request.paramsText, "verbose: true");
  assert.match(request.headersText, /X-Trace: abc/);
  assert.equal(request.bodyMode, "json");
  assert.match(request.bodyText, /"name": "Fido"/);
});
test("Java endpoint scanner extracts Spring and JAX-RS endpoints", () => {
  const source = `
    @RestController
    @RequestMapping("/api")
    class UserController {
      @GetMapping("/users/{id}")
      public User getUser(@PathVariable String id) { return null; }
    }

    @Path("/admin")
    class AdminResource {
      @POST
      @Path("/jobs")
      public Job createJob() { return null; }
    }
  `;

  const endpoints = endpointScanner.scanJavaEndpoints(source, "src/UserController.java");

  assert.deepEqual(endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`), [
    "GET /api/users/{id}",
    "POST /admin/jobs"
  ]);
  assert.equal(endpoints[0].operationId, "getUser");
  assert.equal(endpoints[1].operationId, "createJob");
});

test("OpenAPI merge removes stale operation paths when an endpoint operationId moves", () => {
  const document = {
    openapi: "3.0.3",
    info: { title: "Users", version: "1.0.0" },
    paths: {
      "/api/users/{userId}/{userEmail}": {
        get: {
          operationId: "getUser",
          tags: ["UserController"],
          responses: { "200": { description: "Successful response" } }
        }
      }
    }
  };

  const merged = generator.mergeEndpointsIntoOpenApi(document, [
    { method: "GET", path: "/api/users/{userId}", operationId: "getUser", sourcePath: "UserController.java" }
  ]);

  assert.equal(merged.paths["/api/users/{userId}/{userEmail}"], undefined);
  assert.equal(merged.paths["/api/users/{userId}"].get.operationId, "getUser");
});

test("OpenAPI merge preserves manual operation fields and components", () => {
  const document = {
    openapi: "3.0.3",
    info: { title: "Pets", version: "1.0.0" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          description: "Manual description",
          "x-owner": "api-team",
          responses: {
            "200": { description: "Manual response" }
          }
        }
      }
    },
    components: {
      schemas: {
        Pet: { type: "object" }
      }
    }
  };

  const merged = generator.mergeEndpointsIntoOpenApi(document, [
    { method: "GET", path: "/pets", operationId: "generatedListPets", sourcePath: "PetsController.java" },
    { method: "POST", path: "/pets", operationId: "createPet", sourcePath: "PetsController.java" }
  ]);

  assert.equal(merged.paths["/pets"].get.description, "Manual description");
  assert.equal(merged.paths["/pets"].get["x-owner"], "api-team");
  assert.equal(merged.paths["/pets"].get.responses["200"].description, "Manual response");
  assert.equal(merged.paths["/pets"].post.operationId, "createPet");
  assert.deepEqual(merged.components.schemas.Pet, { type: "object" });
});

class TestClassList {
  constructor(element) { this.element = element; }
  _set() { return new Set(String(this.element.className || "").split(/\s+/).filter(Boolean)); }
  add(...names) { const set = this._set(); names.forEach((name) => set.add(name)); this.element.className = Array.from(set).join(" "); }
  remove(...names) { const set = this._set(); names.forEach((name) => set.delete(name)); this.element.className = Array.from(set).join(" "); }
  contains(name) { return this._set().has(name); }
  toggle(name, force) {
    const set = this._set();
    const shouldAdd = force === undefined ? !set.has(name) : !!force;
    if (shouldAdd) set.add(name); else set.delete(name);
    this.element.className = Array.from(set).join(" ");
    return shouldAdd;
  }
}

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.className = "";
    this.value = "";
    this.type = "";
    this.title = "";
    this.spellcheck = true;
    this.classList = new TestClassList(this);
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  scrollIntoView(options) { this.scrollIntoViewOptions = options; }
  contains(node) {
    if (node === this) return true;
    return (this.children || []).some((child) => child.contains?.(node));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (selector.startsWith(".") && child.classList?.contains(selector.slice(1))) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set textContent(value) { this._textContent = String(value || ""); if (this._textContent === "") this.children = []; }
  get textContent() { return this._textContent || this.children.map((child) => child.textContent || "").join(""); }
  set innerHTML(value) { this._innerHTML = String(value || ""); this._textContent = this._innerHTML.replace(/<[^>]+>/g, ""); }
  get innerHTML() { return this._innerHTML || ""; }
}

function createOpenApiEditorHarness(content, options = {}) {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const source = fs.readFileSync(require.resolve("../resources/js/tools/openapi/openapi-editor.js"), "utf8");
  const body = new TestElement("body");
  const document = {
    head: new TestElement("head"),
    body,
    documentElement: { clientWidth: 1200, clientHeight: 800 },
    createElement: (tagName) => new TestElement(tagName),
    getElementById: () => null,
    addEventListener() {}
  };
  const problemsCalls = [];
  const previewTabCalls = [];
  const apiClientCalls = [];
  const writeFileCalls = [];
  const openEditorCalls = [];
  const swaggerCalls = [];
  const quickFixDialogCalls = [];
  const promptCalls = [];
  const confirmCalls = [];
  const showCalls = [];
  const showBodies = [];
  const findReplaceCalls = [];
  const activeEditorOverrideCalls = [];
  const codegenCalls = [];
  const codeMirrorOptions = [];
  const codeMirrorDispatches = [];
  const codeMirrorScrollDOM = { clientHeight: 200, scrollTop: 0 };
  const codeMirrorDom = new TestElement("div");
  let codeMirrorClickPosition = 0;
  let codeMirrorDestroyed = false;
  let mountedOpenApiTab = null;
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  app.modules.quickFixDialog = {
    async open(dialogOptions) {
      quickFixDialogCalls.push(dialogOptions);
      const action = dialogOptions.actions.find((item) => !item.disabled) || dialogOptions.actions[0];
      const preview = await dialogOptions.resolvePreview(action);
      return dialogOptions.applyPreview(preview);
    }
  };
  const context = {
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {},
      markdownViewerOpenApiDetector: detector,
      markdownViewerOpenApiExplorer: require("../resources/js/tools/openapi/explorer.js"),
      markdownViewerOpenApiRequestMapper: requestMapper,
      markdownViewerOpenApiEndpointScanner: endpointScanner,
      markdownViewerOpenApiGenerator: generator,
      SwaggerUIBundle(config) {
        swaggerCalls.push(config);
        (options.swaggerOperationRows || []).forEach((row) => {
          const opblock = new TestElement("div");
          opblock.className = "opblock";
          const summary = new TestElement("div");
          summary.className = "opblock-summary";
          const method = new TestElement("span");
          method.className = "opblock-summary-method";
          method.textContent = row.method;
          const path = new TestElement("span");
          path.className = "opblock-summary-path";
          path.textContent = row.path;
          summary.append(method, path);
          opblock.appendChild(summary);
          config.domNode.appendChild(opblock);
        });
        return {};
      }
    },
    document,
    module: { exports: {} },
    console
  };
  context.window.SwaggerUIBundle.presets = { apis: "apis" };
  if (options.enableCodeMirror) context.window.MarkdownViewerCodeMirror = {};
  vm.runInNewContext(source, context, { filename: "openapi-editor.js" });
  const api = context.window.registerMarkdownViewerOpenApiEditor(app, {
    yamlLibrary,
    codegenTool: options.codegenTool || {
      generateFromSource(source, codegenOptions) { codegenCalls.push({ source, options: codegenOptions }); return Promise.resolve(options.codegenResult || { status: "applied" }); }
    },
    getProblemsPanel: () => ({
      setDiagnosticCollection(owner, diagnostics, options) { problemsCalls.push({ type: "set", owner, diagnostics, options }); },
      clearDiagnosticCollection(owner, options) { problemsCalls.push({ type: "clear", owner, options }); }
    }),
    openSwaggerUiPreviewInTab(options) {
      previewTabCalls.push(options);
      return { id: "preview-tab" };
    },
    openApiClientInTab(options) {
      apiClientCalls.push(options);
      return { id: "api-client-tab" };
    },
    notify: {
      prompt(promptOptions) { promptCalls.push(promptOptions); return Promise.resolve(options.promptResult ?? null); },
      confirm(confirmOptions) { confirmCalls.push(confirmOptions); return Promise.resolve(options.confirmResult ?? true); },
      show(showOptions) {
        showCalls.push(showOptions);
        const body = new TestElement("div");
        showOptions.renderBody?.(body);
        showBodies.push({ title: showOptions.title, body });
        if (typeof options.notifyShowHandler === "function") return Promise.resolve(options.notifyShowHandler(showOptions, body));
        if (showOptions.title === "Generate From Endpoints") return Promise.resolve(showOptions.buttons.find((button) => button.id === "scan")?.action?.());
        if (showOptions.title === "Choose OpenAPI Document") return Promise.resolve(showOptions.buttons.find((button) => button.id === "use")?.action?.());
        if (["Create OpenAPI document?", "Update OpenAPI document?", "Remove endpoints from OpenAPI document?"].includes(showOptions.title)) return Promise.resolve("apply");
        return Promise.resolve(options.showResult ?? showOptions.dismissValue ?? null);
      }
    },
    openEditorFindReplace(findOptions) { findReplaceCalls.push(findOptions); },
    getActiveFolderPath: () => options.workspaceRoot || "",
    getWorkspaceRoot: () => options.workspaceRoot || "",
    getActiveEditorPath: () => options.activeEditorPath || "C:/Project/openapi.yaml",
    getActiveEditorValue: () => options.activeEditorValue || content,
    readDirectory(path) { return Promise.resolve((options.directories || {})[String(path).replace(/\\/g, "/").replace(/\/+$/, "")] || []); },
    readFile(path) { return Promise.resolve((options.files || {})[String(path).replace(/\\/g, "/").replace(/\/+$/, "")] || ""); },
    writeFile(path, content) { writeFileCalls.push({ path: String(path).replace(/\\/g, "/"), content }); return Promise.resolve(); },
    openOpenApiEditorInTab(source, tabOptions) {
      openEditorCalls.push({ source, options: tabOptions });
      if (options.returnMountedOpenApiTab && mountedOpenApiTab) return mountedOpenApiTab;
      return { id: "opened-openapi", type: "openapi-editor" };
    },
    showFolderDialog() { return Promise.resolve(options.folderDialogResult || null); },
    activeEditorCommands: {
      setActiveEditorOverride(editor, overrideOptions) { activeEditorOverrideCalls.push({ type: "set", editor, options: overrideOptions }); return true; },
      clearActiveEditorOverride(owner) { activeEditorOverrideCalls.push({ type: "clear", owner }); }
    },
    createCodeMirrorEditorInstance(_app, editorOptions) {
      if (!options.enableCodeMirror) return null;
      codeMirrorOptions.push(editorOptions);
      editorOptions.markdownEditor.parentElement?.classList?.add("codemirror-enabled");
      const text = String(editorOptions.markdownEditor.value || "");
      const lines = text.split(/\r?\n/);
      const starts = [];
      let offset = 0;
      lines.forEach((line) => {
        starts.push(offset);
        offset += line.length + 1;
      });
      const doc = {
        lines: lines.length,
        line(lineNumber) {
          const number = Math.max(1, Math.min(Number(lineNumber) || 1, lines.length));
          const from = starts[number - 1] || 0;
          return { number, from, to: from + (lines[number - 1] || "").length };
        }
      };
      const cmView = {
        state: { doc },
        dom: codeMirrorDom,
        scrollDOM: codeMirrorScrollDOM,
        dispatch(transaction) { codeMirrorDispatches.push(transaction); },
        posAtCoords() { return codeMirrorClickPosition; },
        lineBlockAt(position) {
          const lineIndex = starts.findIndex((start, index) => position >= start && position <= start + (lines[index] || "").length);
          const number = Math.max(1, lineIndex + 1);
          return { top: (number - 1) * 20, height: 20 };
        }
      };
      return {
        isEnabled: () => true,
        flushPendingSync() {},
        getView: () => cmView,
        destroy() { codeMirrorDestroyed = true; }
      };
    },
    languageRegistry: { languages: [{ id: "yaml", codeMirrorLanguage: "yaml" }], resolveLanguageForPath: () => ({ id: "yaml", codeMirrorLanguage: "yaml" }) },
    getSnippetDefinitions: () => []
  });
  const root = new TestElement("div");
  const tab = { id: "tab-openapi", title: "openapi.yaml", sourceFilePath: "C:/Project/openapi.yaml", content, savedContent: content };
  mountedOpenApiTab = tab;
  api.mountOpenApiEditorTab(tab, root);
  const clickToolbar = (title) => {
    const button = root.querySelectorAll(".openapi-toolbar-button").find((item) => item.title === title);
    assert.ok(button, `missing ${title} button`);
    button.listeners.click();
  };
  const openContextMenu = (nodeId) => {
    const node = root.querySelectorAll(".openapi-tree-node").find((item) => item.dataset.nodeId === nodeId);
    assert.ok(node, `missing ${nodeId} node`);
    node.listeners.contextmenu({ preventDefault() {}, stopPropagation() {}, clientX: 12, clientY: 16 });
    return body.querySelectorAll(".graph-context-menu-item");
  };
  const clickContextMenuItem = (labelText) => {
    const item = body.querySelectorAll(".graph-context-menu-item").find((button) => button.textContent.includes(labelText));
    assert.ok(item, `missing ${labelText} context menu item`);
    item.listeners.click();
  };
  const styleText = document.head.children.map((child) => child.textContent || "").join("\n");
  return { api, root, tab, body, problemsCalls, previewTabCalls, apiClientCalls, writeFileCalls, openEditorCalls, swaggerCalls, quickFixDialogCalls, promptCalls, confirmCalls, showCalls, showBodies, findReplaceCalls, activeEditorOverrideCalls, codegenCalls, codeMirrorOptions, codeMirrorDispatches, codeMirrorDom, codeMirrorScrollDOM, setCodeMirrorClickPosition(position) { codeMirrorClickPosition = position; }, styleText, get codeMirrorDestroyed() { return codeMirrorDestroyed; }, clickToolbar, openContextMenu, clickContextMenuItem };
}

test("OpenAPI source editor mounts CodeMirror with YAML language", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n"), { enableCodeMirror: true });

  assert.equal(harness.codeMirrorOptions.length, 1);
  assert.equal(harness.codeMirrorOptions[0].getLanguageOverride().id || harness.codeMirrorOptions[0].getLanguageOverride(), "yaml");
  assert.equal(harness.codeMirrorOptions[0].getActiveEditorPath(), "C:/Project/openapi.yaml");
  assert.equal(harness.root.querySelector(".openapi-center").classList.contains("codemirror-enabled"), true);
  harness.api.destroyOpenApiEditorTab(harness.tab.id);
  assert.equal(harness.codeMirrorDestroyed, true);
});

test("OpenAPI CodeMirror Find targets the OpenAPI YAML source editor", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"), { enableCodeMirror: true });

  harness.codeMirrorOptions[0].openEditorFindReplace({ replace: false });

  assert.equal(harness.activeEditorOverrideCalls.at(-1).type, "set");
  assert.equal(harness.activeEditorOverrideCalls.at(-1).editor, harness.root.querySelector(".openapi-source-editor"));
  assert.equal(harness.activeEditorOverrideCalls.at(-1).options.owner, "openapi:tab-openapi");
  assert.equal(harness.findReplaceCalls.length, 1);
  assert.deepEqual(harness.findReplaceCalls[0], { replace: false });
});
test("OpenAPI YAML hover shows a focusable local $ref value preview", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      responses:",
    "        '400':",
    "          $ref: '#/components/responses/BadRequest'",
    "components:",
    "  responses:",
    "    BadRequest:",
    "      description: Bad request",
    "      headers:",
    "        X-Trace:",
    "          schema:",
    "            type: string"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const event = { clientX: 24, clientY: 32 };

  harness.setCodeMirrorClickPosition(content.indexOf("BadRequest'"));
  harness.codeMirrorDom.listeners.mousemove(event);

  const hover = harness.body.querySelector(".openapi-ref-hover");
  assert.ok(hover);
  assert.equal(hover.classList.contains("hidden"), false);
  assert.equal(hover.tabIndex, 0);
  assert.match(hover.textContent, /#\/components\/responses\/BadRequest/);
  assert.match(hover.textContent, /Bad request/);
  assert.match(hover.textContent, /X-Trace/);

  hover.listeners.focusin();
  harness.codeMirrorDom.listeners.mouseleave({});
  assert.equal(hover.classList.contains("hidden"), false);
  hover.listeners.focusout();
  assert.equal(hover.classList.contains("hidden"), true);
});
test("OpenAPI YAML Ctrl-click navigates local $ref pointer segments", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      responses:",
    "        '400':",
    "          $ref: '#/components/responses/BadRequest'",
    "components:",
    "  responses:",
    "    BadRequest:",
    "      description: Bad request"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const clickRefAt = (token) => {
    const event = { button: 0, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, clientX: 10, clientY: 20, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    harness.setCodeMirrorClickPosition(content.indexOf(token));
    harness.codeMirrorDom.listeners.mousedown(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  };

  clickRefAt("components/responses");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.indexOf("components:"));

  clickRefAt("responses/BadRequest");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.lastIndexOf("  responses:"));

  clickRefAt("BadRequest'");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.indexOf("    BadRequest:"));
});
test("OpenAPI CodeMirror source editor is contained inside the center panel", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n"), { enableCodeMirror: true });

  assert.match(harness.styleText, /\.openapi-center \{ position: relative;/);
  assert.match(harness.styleText, /\.openapi-center\.codemirror-enabled \.openapi-source-editor \{ display: none; \}/);
  assert.match(harness.styleText, /\.openapi-center \.codemirror-editor \{ position: relative; inset: auto; width: 100%; max-width: 100%;/);
  assert.match(harness.styleText, /\.openapi-center \.cm-scroller \{ width: 100%; max-width: 100%; min-width: 0; min-height: 0; overflow: auto;/);
});

test("OpenAPI Swagger UI preview keeps model schemas on the light Swagger palette", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}",
    "components:",
    "  schemas:",
    "    Pet:",
    "      type: object"
  ].join("\n"));

  assert.match(harness.styleText, /html\.dark-mode \.openapi-swagger-ui-host \.swagger-ui section\.models/);
  assert.match(harness.styleText, /\.openapi-swagger-ui-host \.swagger-ui \.models-control,[\s\S]*\.openapi-swagger-ui-host \.swagger-ui \.model-box-control/);
  assert.match(harness.styleText, /\.openapi-swagger-ui-host \.swagger-ui \.model-box-control \{[\s\S]*all: inherit;[\s\S]*cursor: pointer;[\s\S]*flex: 1;/);
  assert.match(harness.styleText, /\.openapi-swagger-ui-host \.swagger-ui \.model-box-control \{[\s\S]*background: transparent !important/);
  assert.match(harness.styleText, /\.openapi-swagger-ui-host \.swagger-ui \.json-schema-2020-12 button,[\s\S]*box-shadow: none !important/);
  assert.match(harness.styleText, /html\.dark-mode \.openapi-swagger-ui-host \.swagger-ui \.model-box \{ background: rgba\(0, 0, 0, 0\.1\) !important; \}/);
  assert.match(harness.styleText, /html\.dark-mode \.openapi-swagger-ui-host \.swagger-ui \.json-schema-2020-12__title/);
});
test("OpenAPI response codes keep a fixed visible column in the explorer", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"));

  assert.match(harness.styleText, /\.openapi-tree-node-response \.openapi-tree-node-label \{ flex: 0 0 56px; min-width: 56px; max-width: 56px;/);
  assert.match(harness.styleText, /\.openapi-tree-node-response \.openapi-tree-node-value \{ flex: 1 1 auto; max-width: none; margin-left: 8px; text-align: left;/);
});
test("OpenAPI explorer uses folder-tree-like chevrons and icons", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "servers:",
    "  - url: http://localhost:8080",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"));

  assert.ok(harness.root.querySelector(".bi-chevron-down"));
  assert.ok(harness.root.querySelector(".openapi-tree-icon-symbol"));
  assert.ok(harness.root.querySelector(".bi-folder"));
  assert.ok(harness.root.querySelector(".openapi-tree-icon-method"));
});

test("OpenAPI left panel renders standard components folders and items", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.1.0",
    "info:",
    "  title: Museum",
    "  version: 1.0.0",
    "paths: {}",
    "components:",
    "  schemas:",
    "    Ticket:",
    "      type: object",
    "  responses:",
    "    BadRequest:",
    "      description: Bad request",
    "  parameters:",
    "    StartDate:",
    "      name: startDate",
    "      in: query",
    "  examples:",
    "    TicketExample:",
    "      value:",
    "        id: T1",
    "  requestBodies:",
    "    TicketBody:",
    "      content: {}",
    "  headers:",
    "    RateLimit:",
    "      schema:",
    "        type: integer",
    "  securitySchemes:",
    "    ApiKey:",
    "      type: apiKey",
    "  links:",
    "    TicketLink:",
    "      operationId: getTicket",
    "  callbacks:",
    "    TicketCallback: {}",
    "  pathItems:",
    "    TicketPath:",
    "      get: {}"
  ].join("\n"));
  const labels = harness.root.querySelectorAll(".openapi-tree-node-label").map((node) => node.textContent);

  ["schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links", "callbacks", "pathItems", "Ticket", "BadRequest", "StartDate", "TicketBody", "RateLimit", "ApiKey", "TicketLink", "TicketCallback", "TicketPath"].forEach((label) => {
    assert.ok(labels.includes(label), `missing ${label}`);
  });
});
test("OpenAPI left panel renders operation parameters, responses, and tags", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets/{id}:",
    "    parameters:",
    "      - name: id",
    "        in: path",
    "        required: true",
    "    get:",
    "      summary: Get pet",
    "      tags:",
    "        - pets",
    "      parameters:",
    "        - name: verbose",
    "          in: query",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"));
  const labels = harness.root.querySelectorAll(".openapi-tree-node-label").map((node) => node.textContent);

  assert.ok(labels.includes("Parameters"));
  assert.ok(labels.includes("Responses"));
  assert.ok(labels.includes("Tags"));
  assert.ok(labels.includes("path id"));
  assert.ok(labels.includes("query verbose"));
  assert.ok(labels.includes("200"));
  assert.ok(labels.includes("pets"));
});
test("OpenAPI explorer context menu exposes node-specific OpenAPI actions", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      parameters:",
    "        - name: limit",
    "          in: query",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"));

  assert.ok(harness.openContextMenu("paths").some((item) => item.textContent.includes("Add Path")));
  const pathActions = harness.openContextMenu("path:/pets");
  assert.ok(pathActions.some((item) => item.textContent.includes("Add Operation")));
  assert.ok(harness.body.querySelectorAll(".graph-context-menu-submenu").some((item) => item.textContent.includes("Add Operation")));
  assert.ok(harness.body.querySelectorAll(".graph-context-menu-item").some((item) => item.textContent.includes("Post")));
  assert.equal(harness.body.querySelectorAll(".graph-context-menu-item").find((item) => item.textContent.includes("Get")).disabled, true);
  assert.ok(harness.openContextMenu("operation:get:/pets").some((item) => item.textContent.includes("Add Parameter")));
  assert.ok(harness.openContextMenu("operation:get:/pets:parameters").some((item) => item.textContent.includes("Add Parameter")));
  assert.ok(harness.openContextMenu("operation:get:/pets:responses").some((item) => item.textContent.includes("Add Response Code")));
  assert.ok(harness.body.querySelectorAll(".graph-context-menu-item").some((item) => item.textContent.includes("Rename Responses...")));
  assert.ok(harness.body.querySelectorAll(".graph-context-menu-item").some((item) => item.textContent.includes("Delete Responses...")));
});

test("OpenAPI explorer copy and paste response codes into operations and paths", async () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '400':",
    "          description: Bad request",
    "  /orders:",
    "    get:",
    "      summary: List orders",
    "    post:",
    "      summary: Create order",
    "      responses:",
    "        '201':",
    "          description: Created",
    "    delete:",
    "      summary: Delete order"
  ].join("\n"));

  const pasteBeforeCopy = harness.openContextMenu("operation:get:/orders").find((item) => item.textContent.includes("Paste"));
  assert.equal(pasteBeforeCopy.disabled, true);

  harness.openContextMenu("operation:get:/pets:response:400");
  harness.clickContextMenuItem("Copy 400");
  assert.match(harness.root.querySelector(".openapi-status").textContent, /Copied response 400/);

  const pasteAfterCopy = harness.openContextMenu("operation:get:/orders").find((item) => item.textContent.includes("Paste"));
  assert.equal(pasteAfterCopy.disabled, false);
  harness.clickContextMenuItem("Paste");
  await new Promise((resolve) => setImmediate(resolve));

  let documentModel = harness.api.parseTabDocument(harness.tab);
  assert.equal(documentModel.paths["/orders"].get.responses["400"].description, "Bad request");
  assert.equal(harness.confirmCalls.length, 0);

  harness.openContextMenu("operation:get:/pets:responses");
  harness.clickContextMenuItem("Copy Responses");
  harness.openContextMenu("operation:delete:/orders");
  harness.clickContextMenuItem("Paste");
  await new Promise((resolve) => setImmediate(resolve));

  documentModel = harness.api.parseTabDocument(harness.tab);
  assert.equal(documentModel.paths["/orders"].delete.responses["400"].description, "Bad request");
  assert.equal(harness.confirmCalls.length, 0);

  harness.openContextMenu("path:/orders");
  harness.clickContextMenuItem("Paste");
  await new Promise((resolve) => setImmediate(resolve));

  documentModel = harness.api.parseTabDocument(harness.tab);
  assert.equal(documentModel.paths["/orders"].post.responses["400"].description, "Bad request");
  assert.equal(harness.confirmCalls.length, 1);
  assert.match(harness.confirmCalls[0].message, /already exists/);
});
test("OpenAPI explorer add menu items insert editable templates into the YAML document", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"));

  harness.openContextMenu("paths");
  harness.clickContextMenuItem("Add Path");
  assert.ok(harness.api.parseTabDocument(harness.tab).paths["/new-path"]);

  harness.openContextMenu("path:/pets");
  harness.clickContextMenuItem("Post");
  assert.ok(harness.api.parseTabDocument(harness.tab).paths["/pets"].post);

  harness.openContextMenu("operation:get:/pets:responses");
  harness.clickContextMenuItem("Add Response Code");
  assert.ok(harness.api.parseTabDocument(harness.tab).paths["/pets"].get.responses["201"]);

  harness.openContextMenu("operation:get:/pets");
  harness.clickContextMenuItem("Add Parameter");
  const parameters = harness.api.parseTabDocument(harness.tab).paths["/pets"].get.parameters;
  assert.equal(parameters.at(-1).name, "newParameter");
  assert.equal(parameters.at(-1).schema.type, "string");
});

test("OpenAPI explorer rename and delete actions use dialogs before editing YAML", async () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"), { promptResult: "/animals", confirmResult: true });

  harness.openContextMenu("path:/pets");
  harness.clickContextMenuItem("Rename /pets...");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.promptCalls.length, 1);
  assert.ok(harness.api.parseTabDocument(harness.tab).paths["/animals"]);

  harness.openContextMenu("path:/animals");
  harness.clickContextMenuItem("Delete /animals...");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.confirmCalls.length, 1);
  assert.equal(harness.api.parseTabDocument(harness.tab).paths["/animals"], undefined);
});
test("OpenAPI explorer click centers the source editor on the selected YAML section", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '200':",
    "          description: OK",
    "          content:",
    "            application/json:",
    "              schema:",
    "                $ref: '#/components/schemas/Pet'",
    "components:",
    "  schemas:",
    "    Pet:",
    "      type: object",
    "      properties:",
    "        id:",
    "          type: string"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const operationButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "operation:get:/pets");

  assert.ok(operationButton);
  operationButton.listeners.click();

  const expectedOffset = content.indexOf("    get:");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, expectedOffset);
  assert.equal(harness.codeMirrorScrollDOM.scrollTop, 30);
});
test("OpenAPI preview operation click scrolls explorer and source editor", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /early:",
    "    get:",
    "      summary: Early",
    "      responses:",
    "        '200':",
    "          description: OK",
    "  /late:",
    "    post:",
    "      summary: Late",
    "      responses:",
    "        '201':",
    "          description: Created"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const lateCard = harness.root.querySelectorAll(".openapi-operation-card")
    .find((item) => item.textContent.includes("/late"));

  assert.ok(lateCard);
  lateCard.querySelector(".openapi-operation-header").listeners.click();

  const selectedNode = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "operation:post:/late");
  assert.ok(selectedNode);
  assert.equal(selectedNode.classList.contains("is-selected"), true);
  assert.equal(selectedNode.scrollIntoViewOptions.block, "center");
  assert.equal(selectedNode.scrollIntoViewOptions.inline, "nearest");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.indexOf("    post:"));
});
test("OpenAPI explorer click centers numeric response-code YAML keys", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      responses:",
    "        '200':",
    "          description: OK",
    "        \"400\":",
    "          description: Bad request"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const responseButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "operation:get:/pets:response:400");

  assert.ok(responseButton);
  responseButton.listeners.click();

  const expectedOffset = content.indexOf("        \"400\":");
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, expectedOffset);
});
test("OpenAPI explorer click selects the correct repeated YAML key", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      summary: List pets",
    "      tags:",
    "        - pets",
    "      responses:",
    "        '200':",
    "          description: OK",
    "tags:",
    "  - name: pets"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const tagsButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "tags");

  assert.ok(tagsButton);
  tagsButton.listeners.click();

  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.lastIndexOf("tags:"));
});
test("OpenAPI explorer click selects top-level security instead of securitySchemes", () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Museum",
    "  version: 1.0.0",
    "paths: {}",
    "components:",
    "  securitySchemes:",
    "    MuseumPlaceholderAuth:",
    "      type: http",
    "      scheme: basic",
    "security:",
    "  - MuseumPlaceholderAuth: []"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content, { enableCodeMirror: true });
  const securityButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "security");

  assert.ok(securityButton);
  securityButton.listeners.click();
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.lastIndexOf("security:"));

  const collapsedSecurityButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "security");
  collapsedSecurityButton.listeners.click();
  const requirementButton = harness.root.querySelectorAll(".openapi-tree-node")
    .find((item) => item.dataset.nodeId === "security:0:MuseumPlaceholderAuth");
  assert.ok(requirementButton);
  requirementButton.listeners.click();
  assert.equal(harness.codeMirrorDispatches.at(-1).selection.anchor, content.indexOf("  - MuseumPlaceholderAuth: []"));
});
test("OpenAPI validation diagnostics map to Problems panel shape", () => {
  const result = detector.validateOpenApiText([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "paths:",
    "  /pets:",
    "    get:",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n"), "C:/Project/openapi.yaml", { yamlLibrary });

  assert.equal(result.status, "warnings");
  assert.equal(result.diagnostics[0].source, "openapi");
  assert.equal(result.diagnostics[0].filePath, "C:/Project/openapi.yaml");
  assert.equal(Number.isInteger(result.diagnostics[0].line), true);
  assert.equal(Number.isInteger(result.diagnostics[0].column), true);
});

test("OpenAPI Quick Fix adds a missing paths object from Problems diagnostics", async () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Generated API",
    "  version: 1.0.0"
  ].join("\n"));

  harness.clickToolbar("Validate");
  const diagnostic = harness.problemsCalls.at(-1).diagnostics.find((item) => item.code === "openapi.missingPaths");

  assert.ok(diagnostic);
  assert.equal(diagnostic.openApiPointer, "/paths");
  assert.equal(harness.api.canOpenQuickFix(diagnostic), true);

  await harness.api.openQuickFix(diagnostic);

  assert.equal(harness.quickFixDialogCalls.length, 1);
  assert.equal(harness.quickFixDialogCalls[0].actions[0].title, "Add empty paths object");
  assert.match(harness.root.querySelector(".openapi-source-editor").value, /["']?paths["']?\s*:\s*\{\}/);
  assert.equal(harness.problemsCalls.at(-1).type, "clear");
});

test("OpenAPI Quick Fix adds default operation responses", async () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths:",
    "  /pets:",
    "    get:",
    "      operationId: listPets"
  ].join("\n"));

  harness.clickToolbar("Validate");
  const diagnostic = harness.problemsCalls.at(-1).diagnostics.find((item) => item.code === "openapi.missingOperationResponses");

  assert.ok(diagnostic);
  assert.equal(diagnostic.openApiPointer, "/paths/~1pets/get/responses");
  assert.equal(harness.api.canOpenQuickFix(diagnostic), true);

  await harness.api.openQuickFix(diagnostic);

  const source = harness.root.querySelector(".openapi-source-editor").value;
  assert.match(source, /["']?responses["']?\s*:/);
  assert.match(source, /["']?200["']?\s*:/);
  assert.match(source, /["']?description["']?\s*:\s*["']?Successful response/);
  assert.equal(harness.problemsCalls.at(-1).type, "clear");
});
test("Open in API Client maps selected OpenAPI operation fields into the request tab", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Museum",
    "  version: 1.0.0",
    "servers:",
    "  - url: https://example.test",
    "paths:",
    "  /events/{eventId}:",
    "    post:",
    "      summary: Update event",
    "      parameters:",
    "        - name: eventId",
    "          in: path",
    "          schema:",
    "            type: string",
    "            example: ev-123",
    "        - $ref: '#/components/parameters/IncludeDrafts'",
    "      requestBody:",
    "        $ref: '#/components/requestBodies/EventUpdate'",
    "      responses:",
    "        '200':",
    "          description: OK",
    "components:",
    "  parameters:",
    "    IncludeDrafts:",
    "      name: includeDrafts",
    "      in: query",
    "      schema:",
    "        type: boolean",
    "        example: true",
    "  requestBodies:",
    "    EventUpdate:",
    "      content:",
    "        application/json:",
    "          schema:",
    "            type: object",
    "            properties:",
    "              title:",
    "                type: string",
    "                example: Night tour"
  ].join("\n"));

  const operationHeader = harness.root.querySelectorAll(".openapi-operation-header").find((item) => item.textContent.includes("/events/{eventId}"));
  assert.ok(operationHeader, "missing operation card");
  operationHeader.listeners.click();
  harness.clickToolbar("Open in API Client");

  const request = harness.apiClientCalls[0].request;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://example.test/events/ev-123?includeDrafts=true");
  assert.equal(request.paramsText, "includeDrafts: true");
  assert.equal(request.bodyMode, "json");
  assert.match(request.bodyText, /"title": "Night tour"/);
});

async function waitForOpenApiAsyncActions() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("Generate From Endpoints scans the selected workspace Java scope", async () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Generated Sample API",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n");
  const userControllerPath = "C:/Project/src/main/java/com/example/samples/spring/UserController.java";
  const harness = createOpenApiEditorHarness(content, {
    workspaceRoot: "C:/Project",
    directories: {
      "C:/Project/src/main/java": [{ entry: "com", type: "DIRECTORY" }],
      "C:/Project/src/main/java/com": [{ entry: "example", type: "DIRECTORY" }],
      "C:/Project/src/main/java/com/example": [{ entry: "samples", type: "DIRECTORY" }],
      "C:/Project/src/main/java/com/example/samples": [{ entry: "spring", type: "DIRECTORY" }],
      "C:/Project/src/main/java/com/example/samples/spring": [{ entry: "UserController.java", type: "FILE" }]
    },
    files: {
      [userControllerPath]: [
        "package com.example.samples.spring;",
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.PathVariable;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "import org.springframework.web.bind.annotation.RestController;",
        "@RestController",
        "@RequestMapping(\"/api/users\")",
        "class UserController {",
        "  @GetMapping(\"/{userId}\")",
        "  public String getUser(@PathVariable String userId) { return userId; }",
        "}"
      ].join("\n")
    }
  });

  harness.clickToolbar("Generate From Endpoints");
  await waitForOpenApiAsyncActions();

  assert.equal(harness.showCalls[0].title, "Generate From Endpoints");
  const scopeDialog = harness.showBodies.find((item) => item.title === "Generate From Endpoints")?.body;
  assert.ok(scopeDialog.classList.contains("openapi-generation-scope-dialog"));
  assert.match(harness.styleText, /openapi-generation-scope-modal,[^}]*max-width: min\(1180px/);
  assert.match(scopeDialog.querySelector(".openapi-generation-scope-intro-title").textContent, /Choose the Java scope/);
  assert.equal(scopeDialog.querySelectorAll(".openapi-generation-scope-option").length, 3);
  assert.ok(scopeDialog.querySelector(".openapi-generation-scope-icon"));
  assert.equal(harness.showCalls.at(-1).title, "Update OpenAPI document?");
  const previewDialog = harness.showBodies.find((item) => item.title === "Update OpenAPI document?")?.body;
  assert.ok(previewDialog.classList.contains("openapi-update-preview-dialog"));
  const previewTextArea = previewDialog.querySelector(".openapi-update-preview");
  assert.equal(previewTextArea.tagName, "TEXTAREA");
  assert.ok(previewTextArea.readOnly);
  assert.ok(harness.tab.content.includes("/api/users/{userId}"));
  assert.ok(harness.tab.content.includes("get"));
  assert.equal(harness.root.querySelector(".openapi-status").dataset.tone, "success");
});
test("OpenAPI source action creates a new document when no project OpenAPI YAML exists", async () => {
  const javaPath = "C:/Project/src/main/java/com/example/UserController.java";
  const harness = createOpenApiEditorHarness("openapi: 3.0.3\ninfo:\n  title: Existing\n  version: 1.0.0\npaths: {}\n", {
    workspaceRoot: "C:/Project",
    directories: { "C:/Project": [] },
    files: {
      [javaPath]: [
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "@RequestMapping(\"/api/users\")",
        "class UserController {",
        "  @GetMapping(\"/{userId}\")",
        "  public String getUser() { return \"ok\"; }",
        "}"
      ].join("\n")
    }
  });

  const result = await harness.api.runOpenApiSourceAction("generate", { type: "file", path: javaPath, label: "UserController.java" });

  assert.equal(result.status, "written");
  assert.equal(harness.writeFileCalls.length, 1);
  assert.equal(harness.writeFileCalls[0].path, "C:/Project/openapi.yaml");
  assert.match(harness.writeFileCalls[0].content, /\/api\/users\/\{userId\}/);
  assert.equal(harness.openEditorCalls[0].source.path, "C:/Project/openapi.yaml");
  const createCall = harness.showCalls.find((call) => call.title === "Create OpenAPI document?");
  assert.equal(createCall?.dialogClassName, "openapi-update-preview-modal");
  assert.match(harness.styleText, /openapi-update-preview-modal \{ width: min\(770px/);
  assert.match(harness.styleText, /openapi-update-preview-modal \{[^}]*max-width: min\(770px/);
  assert.match(harness.styleText, /openapi-update-preview \{[^}]*min-height: min\(62vh, 640px\)/);
  const createDialog = harness.showBodies.find((item) => item.title === "Create OpenAPI document?")?.body;
  const yamlPreview = createDialog.querySelector(".openapi-update-preview");
  assert.equal(yamlPreview.tagName, "TEXTAREA");
  assert.ok(yamlPreview.readOnly);
  assert.match(yamlPreview.value, /\/api\/users\/\{userId\}/);
});

test("OpenAPI source action refreshes an already open generated document tab", async () => {
  const javaPath = "C:/Project/src/main/java/com/example/UserController.java";
  const harness = createOpenApiEditorHarness("openapi: 3.0.3\ninfo:\n  title: Existing\n  version: 1.0.0\npaths: {}\n", {
    workspaceRoot: "C:/Project",
    returnMountedOpenApiTab: true,
    directories: { "C:/Project": [] },
    files: {
      [javaPath]: [
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "@RequestMapping(\"/api/users\")",
        "class UserController {",
        "  @GetMapping(\"/{userId}\")",
        "  public String getUser() { return \"ok\"; }",
        "}"
      ].join("\n")
    }
  });

  const result = await harness.api.runOpenApiSourceAction("generate", { type: "file", path: javaPath, label: "UserController.java" });

  assert.equal(result.status, "written");
  assert.match(harness.root.querySelector(".openapi-source-editor").value, /\/api\/users\/\{userId\}/);
  assert.ok(harness.root.querySelectorAll(".openapi-tree-node").some((node) => node.dataset.nodeId === "path:/api/users/{userId}"));
});

test("OpenAPI source action chooses an existing document and removes matching operations", async () => {
  const javaPath = "C:/Project/src/main/java/com/example/UserController.java";
  const openApiPath = "C:/Project/openapi.yaml";
  const otherOpenApiPath = "C:/Project/admin-api.yaml";
  const existingOpenApi = [
    "openapi: 3.0.3",
    "info:",
    "  title: Users",
    "  version: 1.0.0",
    "paths:",
    "  /api/users/{userId}:",
    "    get:",
    "      operationId: getUser",
    "      responses:",
    "        '200':",
    "          description: OK",
    "  /api/users:",
    "    post:",
    "      operationId: createUser",
    "      responses:",
    "        '200':",
    "          description: OK"
  ].join("\n");
  const harness = createOpenApiEditorHarness(existingOpenApi, {
    workspaceRoot: "C:/Project",
    directories: {
      "C:/Project": [
        { entry: "openapi.yaml", type: "FILE" },
        { entry: "admin-api.yaml", type: "FILE" }
      ]
    },
    files: {
      [openApiPath]: existingOpenApi,
      [otherOpenApiPath]: "openapi: 3.0.3\ninfo:\n  title: Admin\n  version: 1.0.0\npaths: {}\n",
      [javaPath]: [
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "@RequestMapping(\"/api/users\")",
        "class UserController {",
        "  @GetMapping(\"/{userId}\")",
        "  public String getUser() { return \"ok\"; }",
        "}"
      ].join("\n")
    },
    notifyShowHandler(showOptions) {
      if (showOptions.title === "Choose OpenAPI Document") return openApiPath;
      if (showOptions.title === "Remove endpoints from OpenAPI document?") return "apply";
      return showOptions.dismissValue ?? null;
    }
  });

  const result = await harness.api.runOpenApiSourceAction("remove", { type: "file", path: javaPath, label: "UserController.java" });

  assert.equal(result.status, "written");
  assert.equal(harness.showCalls.some((call) => call.title === "Choose OpenAPI Document"), true);
  assert.equal(harness.writeFileCalls[0].path, openApiPath);
  assert.doesNotMatch(harness.writeFileCalls[0].content, /\/api\/users\/\{userId\}/);
  assert.match(harness.writeFileCalls[0].content, /\/api\/users/);
});
test("Validate refreshes panels and publishes or clears OpenAPI Problems", () => {
  const validContent = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n");
  const harness = createOpenApiEditorHarness(validContent);

  harness.clickToolbar("Validate");

  assert.equal(harness.problemsCalls.at(-1).type, "clear");
  assert.equal(harness.root.querySelector(".openapi-status").textContent, "Validation complete: no issues found.");

  harness.root.querySelector(".openapi-source-editor").value = "openapi: 3.0.3\ninfo: [";
  harness.clickToolbar("Validate");

  const last = harness.problemsCalls.at(-1);
  assert.equal(last.type, "set");
  assert.equal(last.owner, "openapi:c:/project/openapi.yaml");
  assert.equal(last.options.revealErrors, true);
  assert.equal(last.diagnostics[0].source, "openapi");
  assert.equal(harness.root.querySelector(".openapi-status").textContent, "Validation failed: unable to parse document.");
});

test("OpenAPI toolbar omits file-only codegen and save actions", () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n"));

  const titles = harness.root.querySelectorAll(".openapi-toolbar-button").map((item) => item.title);

  assert.equal(titles.includes("Generate Code"), false);
  assert.equal(titles.includes("Save"), false);
});

test("OpenAPI Generate Code from file uses provided OpenAPI content", async () => {
  const content = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n");
  const harness = createOpenApiEditorHarness(content);

  await harness.api.generateCodeFromFile("C:/Project/openapi.yaml", content.replace("Pets", "Sidebar Pets"));

  assert.equal(harness.codegenCalls.length, 1);
  assert.match(harness.codegenCalls[0].source.specText, /Sidebar Pets/);
  assert.equal(harness.codegenCalls[0].source.filePath, "C:/Project/openapi.yaml");
});

test("OpenAPI Generate Code from file validates before invoking codegen", async () => {
  const harness = createOpenApiEditorHarness([
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "paths: {}"
  ].join("\n"));

  await harness.api.generateCodeFromFile("C:/Project/openapi.yaml", [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0"
  ].join("\n"));

  assert.equal(harness.codegenCalls.length, 0);
});

test("Preview validates and opens Swagger UI preview tab only for valid OpenAPI", () => {
  const validContent = [
    "openapi: 3.0.3",
    "info:",
    "  title: Pets",
    "  version: 1.0.0",
    "servers:",
    "  - url: https://api.example.test",
    "paths:",
    "  /pets:",
    "    get:",
    "      operationId: listPets",
    "      parameters:",
    "        - name: limit",
    "          in: query",
    "          schema:",
    "            type: integer",
    "            example: 5",
    "      responses:",
    "        '200':",
    "          description: OK",
    "          content:",
    "            application/json:",
    "              schema:",
    "                $ref: '#/components/schemas/Pet'",
    "components:",
    "  schemas:",
    "    Pet:",
    "      type: object",
    "      properties:",
    "        id:",
    "          type: string"
  ].join("\n");
  const harness = createOpenApiEditorHarness(validContent, { swaggerOperationRows: [{ method: "GET", path: "/pets" }] });

  harness.clickToolbar("Preview");

  assert.equal(harness.previewTabCalls.length, 1);
  assert.equal(harness.previewTabCalls[0].spec.info.title, "Pets");
  assert.equal(harness.previewTabCalls[0].sourceFilePath, "C:/Project/openapi.yaml");
  assert.equal(harness.previewTabCalls[0].requestSpec.paths["/pets"].get.parameters[0].name, "limit");
  const previewSchema = harness.previewTabCalls[0].spec.paths["/pets"].get.responses["200"].content["application/json"].schema;
  assert.equal(previewSchema.$ref, undefined);
  assert.equal(previewSchema.properties.id.type, "string");

  const previewRoot = new TestElement("div");
  harness.api.mountOpenApiPreviewTab({ openapiPreview: harness.previewTabCalls[0] }, previewRoot);
  assert.ok(previewRoot.querySelector(".openapi-preview-tab-shell"));
  assert.ok(previewRoot.querySelector(".openapi-swagger-ui-host"));
  assert.equal(harness.swaggerCalls.length, 1);
  assert.deepEqual(Array.from(harness.swaggerCalls[0].supportedSubmitMethods), []);
  assert.equal(harness.swaggerCalls[0].spec.paths["/pets"].get.responses["200"].content["application/json"].schema.properties.id.type, "string");
  const tryButton = previewRoot.querySelector(".openapi-swagger-ui-try-button");
  assert.ok(tryButton);
  tryButton.listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(harness.apiClientCalls.at(-1).request.method, "GET");
  assert.equal(harness.apiClientCalls.at(-1).request.url, "https://api.example.test/pets?limit=5");
  assert.equal(harness.apiClientCalls.at(-1).request.paramsText, "limit: 5");

  harness.root.querySelector(".openapi-source-editor").value = "openapi: 3.0.3\ninfo: [";
  harness.clickToolbar("Preview");

  assert.equal(harness.previewTabCalls.length, 1);
  assert.equal(harness.problemsCalls.at(-1).type, "set");
});



