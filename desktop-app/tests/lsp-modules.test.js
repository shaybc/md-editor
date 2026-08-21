const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function readWebFile(relativePath) {
  const resourcePath = relativePath === "script.js" ? path.join("js", "script.js") : relativePath;
  return fs.readFileSync(path.join(webRoot, resourcePath), "utf8");
}

function createContext() {
  const modules = {};
  const context = {
    console,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    window: {},
    app: {
      constants: { DESKTOP_PROFILE_DIR: ".md-editor" },
      registerModule(name, api) {
        modules[name] = api;
      }
    },
    modules
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

test("diagnostic lifecycle trace correlates generations, elapsed time, and provider counts", () => {
  const records = [];
  let clock = 1000;
  const { registerMarkdownViewerDiagnosticLifecycleTrace } = require("../resources/js/lsp/diagnostic-lifecycle-trace.js");
  const trace = registerMarkdownViewerDiagnosticLifecycleTrace({ registerModule() {} }, {
    now: () => clock,
    debugLog: (_level, _message, details) => records.push(details)
  });

  trace.startGeneration("workspace-opened", { workspaceRoot: "C:/Project" });
  clock = 1275;
  trace.markProviderSnapshot("jdt", {
    workspaceRoot: "C:/Project",
    sessionKey: "java:C:/Project",
    revision: 8,
    totalCount: 12,
    availableCount: 12,
    counts: { error: 2, warning: 3, info: 7 },
    lastPublication: { uri: "file:///C:/Project/App.java", sequence: 19, timestamp: 1250 }
  });

  assert.equal(records[0].milestone, "generation-started");
  assert.equal(records[1].generation, 1);
  assert.equal(records[1].elapsedMs, 275);
  assert.equal(records[1].providerId, "jdt");
  assert.deepEqual(records[1].counts, { error: 2, warning: 3, info: 7 });
  assert.deepEqual(records[1].providerCounts.jdt, {
    totalCount: 12,
    availableCount: 12,
    error: 2,
    warning: 3,
    info: 7
  });
  assert.equal(records[1].lastPublication.sequence, 19);
});

test("shared LSP request client correlates responses and removes its subscriber", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/request-client.js"), context);
  const subscribers = new Set();
  const sent = [];
  const client = context.window.registerMarkdownViewerLspRequestClient(context.app, { requestTimeoutMs: 50 });
  const transport = {
    subscribe(listener) {
      subscribers.add(listener);
    },
    unsubscribe(listener) {
      subscribers.delete(listener);
    },
    send(message) {
      const request = JSON.parse(message);
      sent.push(request);
      setTimeout(() => {
        subscribers.forEach((listener) => listener(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { ok: true }
        })));
      }, 0);
    }
  };

  const result = await client.request(transport, "example/request", { value: 1 });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true });
  assert.equal(sent[0].method, "example/request");
  assert.deepEqual(sent[0].params, { value: 1 });
  assert.equal(subscribers.size, 0);
});

test("shared LSP request client resets an opted-in inactivity timeout when the server remains active", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/request-client.js"), context);
  const subscribers = new Set();
  const client = context.window.registerMarkdownViewerLspRequestClient(context.app, { requestTimeoutMs: 40 });
  const transport = {
    subscribe(listener) {
      subscribers.add(listener);
    },
    unsubscribe(listener) {
      subscribers.delete(listener);
    },
    send(message) {
      const request = JSON.parse(message);
      setTimeout(() => {
        subscribers.forEach((listener) => listener(JSON.stringify({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: "jdt-build", value: { kind: "report" } }
        })));
      }, 25);
      setTimeout(() => {
        subscribers.forEach((listener) => listener(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { projects: [] }
        })));
      }, 60);
    }
  };

  const result = await client.request(transport, "workspace/executeCommand", {}, {
    timeoutMs: 40,
    maximumTimeoutMs: 200,
    resetTimeoutOnMessage: true
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { projects: [] });
  assert.equal(subscribers.size, 0);
});

test("shared LSP request client enforces the maximum deadline despite server activity", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/request-client.js"), context);
  const subscribers = new Set();
  let activityTimer = null;
  const client = context.window.registerMarkdownViewerLspRequestClient(context.app);
  const transport = {
    subscribe(listener) {
      subscribers.add(listener);
    },
    unsubscribe(listener) {
      subscribers.delete(listener);
    },
    send() {
      activityTimer = setInterval(() => {
        subscribers.forEach((listener) => listener(JSON.stringify({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: "jdt-build", value: { kind: "report" } }
        })));
      }, 10);
    }
  };

  try {
    await assert.rejects(client.request(transport, "workspace/executeCommand", {}, {
      timeoutMs: 30,
      maximumTimeoutMs: 80,
      resetTimeoutOnMessage: true,
      label: "the test request"
    }), /did not respond to the test request/);
  } finally {
    clearInterval(activityTimer);
  }
  assert.equal(subscribers.size, 0);
});

test("JDT project inventory uses activity-aware inactivity and maximum deadlines", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/jdt-project-inventory-client.js"), context);
  let requestOptions = null;
  const client = context.window.registerMarkdownViewerJdtProjectInventoryClient(context.app, {
    getJdtSession: () => ({ transport: {} }),
    requestClient: {
      async request(_transport, _method, _params, options) {
        requestOptions = options;
        return { generationId: 7, projects: [] };
      }
    }
  });

  await client.requestInventory({ workspaceRoot: "C:/Project", generationId: 7 });

  assert.equal(requestOptions.timeoutMs, 300000);
  assert.equal(requestOptions.maximumTimeoutMs, 1800000);
  assert.equal(requestOptions.resetTimeoutOnMessage, true);
});

test("LSP server registry exposes the TypeScript VSIX recipe", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });
  const server = registry.getServerForLanguage("typescript");
  const sourcegraphVariant = server.variants.find((variant) => variant.id === "sourcegraph-javascript-typescript");
  const typeScriptLanguageServerVariant = server.variants.find((variant) => variant.id === "typescript-language-server");

  assert.equal(server.id, "typescript");
  assert.equal(server.bundledVariantId, "typescript-language-server");
  assert.deepEqual(JSON.parse(JSON.stringify(server.workspaceConfiguration)), {
    completions: {
      completeFunctionCalls: true
    }
  });
  assert.deepEqual(Array.from(sourcegraphVariant.requiredFiles), [
    "node_modules/javascript-typescript-langserver/lib/language-server-stdio.js",
    "node_modules/typescript/package.json"
  ]);
  assert.equal(sourcegraphVariant.entryFile, "node_modules/javascript-typescript-langserver/lib/language-server-stdio.js");
  assert.deepEqual(Array.from(typeScriptLanguageServerVariant.requiredFiles), [
    "node_modules/typescript-language-server/lib/cli.mjs",
    "node_modules/typescript-language-server/package.json",
    "node_modules/typescript/package.json"
  ]);
  assert.equal(registry.getLspLanguageId(server, "typescript"), "typescript");
  assert.equal(registry.getLspLanguageId(server, "javascript"), "javascript");
  assert.equal(registry.toFileUri("C:/Projects/demo/src/app.ts"), "file:///C:/Projects/demo/src/app.ts");
  assert.equal(registry.fromFileUri("file:///C:/Projects/demo/src/app.ts"), "C:/Projects/demo/src/app.ts");
  assert.equal(registry.fromFileUri("file:///c%3A/Project/src/File%20Name.java"), "c:/Project/src/File Name.java");
  assert.equal(registry.fromFileUri("https://example.test/File.java"), "");
});
test("LSP server registry exposes the bundled Pyright recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/pyright/langserver.index.js",
    "C:/Desktop/node_modules/pyright/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const server = registry.getServerForLanguage("python");
  const pyrightVariant = server.variants.find((variant) => variant.id === "pyright");
  const status = await registry.getServerStatus("python");
  const descriptor = await registry.getLaunchDescriptor("python");

  assert.equal(server.id, "python");
  assert.equal(server.bundledVariantId, "pyright");
  assert.deepEqual(Array.from(pyrightVariant.requiredFiles), [
    "node_modules/pyright/langserver.index.js",
    "node_modules/pyright/package.json"
  ]);
  assert.equal(pyrightVariant.entryFile, "node_modules/pyright/langserver.index.js");
  assert.equal(registry.getLspLanguageId(server, "python"), "python");
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "pyright");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/node_modules/pyright/langserver.index.js" --stdio'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry exposes bundled VS Code HTML CSS and JSON recipes", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/vscode-langservers-extracted/package.json",
    "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-html-language-server",
    "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-css-language-server",
    "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-json-language-server"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });

  const htmlServer = registry.getServerForLanguage("html");
  const cssServer = registry.getServerForLanguage("css");
  const scssServer = registry.getServerForLanguage("scss");
  const jsonServer = registry.getServerForLanguage("json");
  const htmlDescriptor = await registry.getLaunchDescriptor("html");
  const cssDescriptor = await registry.getLaunchDescriptor("css");
  const jsonDescriptor = await registry.getLaunchDescriptor("json");

  assert.equal(htmlServer.id, "html");
  assert.equal(htmlServer.bundledVariantId, "vscode-html-language-server");
  assert.equal(cssServer.id, "css");
  assert.equal(scssServer.id, "css");
  assert.equal(jsonServer.id, "json");
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("html"))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("css"))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("json"))), {
    json: {
      validate: {
        enable: true
      },
      schemas: [{
        url: "https://json.schemastore.org/package.json",
        fileMatch: ["package.json"]
      }]
    }
  });
  assert.equal(registry.getLspLanguageId(cssServer, "sass"), "scss");
  assert.equal(
    htmlDescriptor.command,
    'node "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-html-language-server" --stdio'
  );
  assert.equal(
    cssDescriptor.command,
    'node "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-css-language-server" --stdio'
  );
  assert.equal(
    jsonDescriptor.command,
    'node "C:/Desktop/node_modules/vscode-langservers-extracted/bin/vscode-json-language-server" --stdio'
  );
  assert.equal(htmlDescriptor.cwd, "C:/Desktop");
  assert.equal(cssDescriptor.cwd, "C:/Desktop");
  assert.equal(jsonDescriptor.cwd, "C:/Desktop");
});

test("LSP server registry exposes the bundled YAML language server recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/yaml-language-server/bin/yaml-language-server",
    "C:/Desktop/node_modules/yaml-language-server/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const server = registry.getServerForLanguage("yaml");
  const variant = server.variants.find((candidate) => candidate.id === "yaml-language-server");
  const status = await registry.getServerStatus("yaml");
  const descriptor = await registry.getLaunchDescriptor("yaml");

  assert.equal(server.id, "yaml");
  assert.equal(server.bundledVariantId, "yaml-language-server");
  assert.deepEqual(Array.from(variant.requiredFiles), [
    "node_modules/yaml-language-server/bin/yaml-language-server",
    "node_modules/yaml-language-server/package.json"
  ]);
  assert.equal(variant.entryFile, "node_modules/yaml-language-server/bin/yaml-language-server");
  assert.equal(registry.getLspLanguageId(server, "yaml"), "yaml");
  const genericYaml = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/settings.yaml",
    content: "name: app\nservices:\n  web: true\n"
  })));
  assert.deepEqual(genericYaml, {
    yaml: {
      validate: true,
      hover: true,
      completion: true,
      schemaStore: {
        enable: false
      }
    }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(genericYaml.yaml, "schemas"), false);

  const composeYaml = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/docker-compose.yml",
    content: "services:\n  web:\n    image: nginx\n"
  })));
  assert.deepEqual(composeYaml.yaml.schemas, {
    "https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json": [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml"
    ]
  });
  assert.equal(Object.prototype.hasOwnProperty.call(composeYaml.yaml.schemas, "kubernetes"), false);

  const kubernetesYaml = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/deployment.yaml",
    content: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n"
  })));
  assert.deepEqual(kubernetesYaml.yaml.schemas, {
    kubernetes: ["C:/Project/deployment.yaml"]
  });

  const hintedKubernetesYaml = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/k8s/service.yaml",
    content: "metadata:\n  name: app\n"
  })));
  assert.deepEqual(hintedKubernetesYaml.yaml.schemas, {
    kubernetes: ["C:/Project/k8s/service.yaml"]
  });
  const nonComposeServicesYaml = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/services.yaml",
    content: "services:\n  web:\n    image: nginx\n"
  })));
  assert.equal(Object.prototype.hasOwnProperty.call(nonComposeServicesYaml.yaml, "schemas"), false);
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "yaml-language-server");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/node_modules/yaml-language-server/bin/yaml-language-server" --stdio'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry disables YAML language server for Helm template YAML", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });

  assert.equal(registry.shouldEnableLanguageServerForDocument("yaml", {
    filePath: "C:/Project/charts/hello-world/templates/serviceaccount.yaml",
    content: "{{- if .Values.serviceAccount.create -}}\napiVersion: v1\nkind: ServiceAccount\n{{- end }}\n"
  }), false);
  assert.equal(registry.shouldEnableLanguageServerForDocument("yaml", {
    filePath: "C:/Project/charts/hello-world/values.yaml",
    content: "serviceAccount:\n  create: true\n"
  }), true);
  assert.equal(registry.shouldEnableLanguageServerForDocument("yaml", {
    filePath: "C:/Project/manifests/serviceaccount.yaml",
    content: "apiVersion: v1\nkind: ServiceAccount\nmetadata:\n  name: app\n"
  }), true);
});

test("LSP server registry exposes the bundled Bash language server recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/bash-language-server/out/cli.js",
    "C:/Desktop/node_modules/bash-language-server/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const server = registry.getServerForLanguage("bash");
  const variant = server.variants.find((candidate) => candidate.id === "bash-language-server");
  const status = await registry.getServerStatus("bash");
  const descriptor = await registry.getLaunchDescriptor("bash");

  assert.equal(server.id, "bash");
  assert.equal(server.bundledVariantId, "bash-language-server");
  assert.deepEqual(Array.from(variant.requiredFiles), [
    "node_modules/bash-language-server/out/cli.js",
    "node_modules/bash-language-server/package.json"
  ]);
  assert.equal(variant.entryFile, "node_modules/bash-language-server/out/cli.js");
  assert.equal(registry.getLspLanguageId(server, "bash"), "shellscript");
  assert.equal(registry.getLspLanguageId(server, "shell"), "shellscript");
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("bash"))), {});
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "bash-language-server");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/node_modules/bash-language-server/out/cli.js" start'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry exposes the bundled Dockerfile language server recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/dockerfile-language-server-nodejs/bin/docker-langserver",
    "C:/Desktop/node_modules/dockerfile-language-server-nodejs/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const server = registry.getServerForLanguage("dockerfile");
  const variant = server.variants.find((candidate) => candidate.id === "dockerfile-language-server-nodejs");
  const status = await registry.getServerStatus("dockerfile");
  const descriptor = await registry.getLaunchDescriptor("dockerfile");

  assert.equal(server.id, "dockerfile");
  assert.equal(server.bundledVariantId, "dockerfile-language-server-nodejs");
  assert.deepEqual(Array.from(variant.requiredFiles), [
    "node_modules/dockerfile-language-server-nodejs/bin/docker-langserver",
    "node_modules/dockerfile-language-server-nodejs/package.json"
  ]);
  assert.equal(variant.entryFile, "node_modules/dockerfile-language-server-nodejs/bin/docker-langserver");
  assert.equal(registry.getLspLanguageId(server, "dockerfile"), "dockerfile");
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("dockerfile"))), {
    docker: {
      languageserver: {
        diagnostics: {
          deprecatedMaintainer: "warning",
          directiveCasing: "warning",
          emptyContinuationLine: "warning",
          instructionCasing: "warning",
          instructionCmdMultiple: "warning",
          instructionEntrypointMultiple: "warning",
          instructionHealthcheckMultiple: "warning",
          instructionJSONInSingleQuotes: "warning",
          instructionWorkdirRelative: "warning"
        },
        formatter: {
          ignoreMultilineInstructions: false
        }
      }
    }
  });
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "dockerfile-language-server-nodejs");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/node_modules/dockerfile-language-server-nodejs/bin/docker-langserver" --stdio'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry exposes the bundled Windows Scripting language server recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/resources/windows-scripting-lsp/server.cjs",
    "C:/Desktop/node_modules/vscode-languageserver/package.json",
    "C:/Desktop/node_modules/vscode-languageserver-textdocument/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error(`Missing ${path}`);
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const batchServer = registry.getServerForLanguage("batch");
  const cmdServer = registry.getServerForLanguage("cmd");
  const powershellServer = registry.getServerForLanguage("powershell");
  const registryServer = registry.getServerForLanguage("registry");
  const variant = batchServer.variants.find((candidate) => candidate.id === "windows-scripting-lsp");
  const status = await registry.getServerStatus("windows-scripting");
  const descriptor = await registry.getLaunchDescriptor("windows-scripting");

  assert.equal(batchServer.id, "windows-scripting");
  assert.equal(cmdServer.id, "windows-scripting");
  assert.equal(powershellServer.id, "windows-scripting");
  assert.equal(registryServer.id, "windows-scripting");
  assert.equal(batchServer.bundledVariantId, "windows-scripting-lsp");
  assert.deepEqual(Array.from(variant.requiredFiles), [
    "resources/windows-scripting-lsp/server.cjs",
    "node_modules/vscode-languageserver/package.json",
    "node_modules/vscode-languageserver-textdocument/package.json"
  ]);
  assert.equal(variant.entryFile, "resources/windows-scripting-lsp/server.cjs");
  assert.equal(registry.getLspLanguageId(batchServer, "batch"), "batch");
  assert.equal(registry.getLspLanguageId(batchServer, "cmd"), "cmd");
  assert.equal(registry.getLspLanguageId(batchServer, "powershell"), "powershell");
  assert.equal(registry.getLspLanguageId(batchServer, "registry"), "registry");
  assert.deepEqual(JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("windows-scripting"))), {});
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "windows-scripting-lsp");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/resources/windows-scripting-lsp/server.cjs" --stdio'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});
test("LSP server registry exposes the installed Eclipse JDT LS Java recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Profile/language-servers/java/config_win",
    "C:/Profile/language-servers/java/features",
    "C:/Profile/language-servers/java/plugins"
  ]);
  const createdDirectories = [];
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getJavaLanguageServerExecutable: async () => "C:/JDK/bin/java.exe",
    getJavaWorkspaceRuntime: () => ({
      ok: true,
      projectJdk: { id: "jdk:project", name: "JDK 25", path: "C:/JDK", feature: 25 },
      launcherJdk: { id: "jdk:project", name: "JDK 25", path: "C:/JDK", feature: 25 }
    }),
    getJavaExecutableForJdkHome: () => "C:/JDK/bin/java.exe",
    getConfiguredJdks: () => [{ id: "jdk:project", name: "JDK 25", path: "C:/JDK", feature: 25 }],
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Profile/language-servers/java/plugins") {
            return [{ entry: "org.eclipse.equinox.launcher_1.7.0.v20250519-0528.jar", type: "FILE" }];
          }
          return [];
        },
        async readFile() {
          throw new Error("missing");
        },
        async createDirectory(path) {
          createdDirectories.push(path);
        }
      }
    }
  });
  const server = registry.getServerForLanguage("java");
  const variant = server.variants.find((candidate) => candidate.id === "eclipse-jdt-ls");
  const status = await registry.getServerStatus("java");
  const descriptor = await registry.getLaunchDescriptor("java", { workspaceRoot: "C:/Project", filePath: "C:/Project/src/App.java" });

  assert.equal(server.id, "java");
  assert.equal(server.bundledVariantId, "eclipse-jdt-ls");
  assert.deepEqual(Array.from(variant.requiredFiles), [
    "plugins/org.eclipse.equinox.launcher_*.jar",
    "config_win",
    "features",
    "plugins"
  ]);
  assert.equal(variant.entryFile, "plugins/org.eclipse.equinox.launcher_*.jar");
  assert.equal(registry.getLspLanguageId(server, "java"), "java");
  assert.equal(registry.isStandaloneJavaFile("java", "C:/Project/test.java"), true);
  assert.equal(registry.isStandaloneJavaFile("java", "C:/Project/src/App.java"), false);
  assert.equal(status.installed, true);
  assert.equal(status.bundled, false);
  assert.equal(status.installDir, "C:/Profile/language-servers/java");
  assert.equal(status.variant.id, "eclipse-jdt-ls");
  assert.match(descriptor.command, /^"C:\/JDK\/bin\/java\.exe" -Declipse\.application=org\.eclipse\.jdt\.ls\.core\.id1/);
  assert.match(descriptor.command, /-jar "C:\/Profile\/language-servers\/java\/plugins\/org\.eclipse\.equinox\.launcher_1\.7\.0\.v20250519-0528\.jar"/);
  assert.match(descriptor.command, /-configuration "C:\/Profile\/language-servers\/java\/config_win"/);
  assert.match(descriptor.command, /-data "C:\/Profile\/language-server-workspaces\/java\/project-[0-9a-f]+"/);
  assert.equal(descriptor.cwd, "C:/Profile/language-servers/java");
  assert.ok(createdDirectories.some((path) => path.includes("language-server-workspaces/java")));
});

test("LSP server registry exposes the bundled Eclipse JDT LS Java recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/config_win",
    "C:/Desktop/features",
    "C:/Desktop/plugins"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    getJavaWorkspaceRuntime: () => ({
      ok: true,
      projectJdk: { id: "jdk:project", name: "JDK 25", path: "C:/JDK", feature: 25 },
      launcherJdk: { id: "jdk:project", name: "JDK 25", path: "C:/JDK", feature: 25 }
    }),
    getJavaExecutableForJdkHome: () => "C:/JDK/bin/java.exe",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Desktop/plugins") {
            return [{ entry: "org.eclipse.equinox.launcher_1.7.0.v20250519-0528.jar", type: "FILE" }];
          }
          return [];
        },
        async readFile() {
          throw new Error("missing");
        },
        async createDirectory() {}
      }
    }
  });

  const status = await registry.getServerStatus("java");
  const descriptor = await registry.getLaunchDescriptor("java", { workspaceRoot: "C:/Project", filePath: "C:/Project/src/App.java" });

  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "eclipse-jdt-ls");
  assert.match(descriptor.command, /-jar \"C:\/Desktop\/plugins\/org\.eclipse\.equinox\.launcher_1\.7\.0\.v20250519-0528\.jar\"/);
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry launches standalone Java with the language server Java executable", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/config_win",
    "C:/Desktop/features",
    "C:/Desktop/plugins"
  ]);
  const createdDirectories = [];
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    getWorkspaceRoot: () => "",
    getJavaLanguageServerExecutable: async () => "C:/ToolingJdk/bin/java.exe",
    getJavaWorkspaceRuntime: () => null,
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Desktop/plugins") {
            return [{ entry: "org.eclipse.equinox.launcher_1.7.0.v20250519-0528.jar", type: "FILE" }];
          }
          return [];
        },
        async readFile() {
          throw new Error("missing");
        },
        async createDirectory(path) {
          createdDirectories.push(path);
        }
      }
    }
  });

  const descriptor = await registry.getLaunchDescriptor("java", { workspaceRoot: "", filePath: "Untitled.java" });

  assert.match(descriptor.command, /^"C:\/ToolingJdk\/bin\/java\.exe" /);
  assert.match(descriptor.command, /-data "C:\/Profile\/language-server-workspaces\/java\//);
  assert.ok(createdDirectories.some((path) => path.includes("language-server-workspaces/java")));
});
test("JDT Gradle import uses the Gradle choice saved in Java Build Path", () => {
  const context = createContext();
  let projectGradle = { mode: "installation", installationId: "gradle-8.14" };
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    getJavaWorkspaceModel: () => ({
      kind: "gradle",
      importers: { gradle: true },
      projectConfiguration: {
        buildSystem: "gradle",
        gradle: projectGradle
      }
    }),
    getJavaWorkspaceRuntime: () => ({ projectJdk: { id: "jdk-26", path: "C:/Java/26", feature: 26 } }),
    getConfiguredGradles: () => [{ id: "gradle-8.14", path: "C:/Gradle/8.14" }]
  });

  const configuration = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("java", {
    filePath: "C:/Project/src/App.java"
  })));
  assert.equal(configuration.java.import.gradle.wrapper.enabled, false);
  assert.equal(configuration.java.import.gradle.home, "C:/Gradle/8.14");
  assert.equal(configuration.java.import.gradle.java.home, "C:/Java/26");
  assert.equal(configuration.java.import.gradle.annotationProcessing.enabled, false);
  assert.deepEqual(configuration.java.import.gradle.arguments, ["-x", "test"]);

  projectGradle = { mode: "wrapper" };
  const wrapperConfiguration = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("java", {
    filePath: "C:/Project/src/App.java"
  })));
  assert.equal(wrapperConfiguration.java.import.gradle.wrapper.enabled, true);
  assert.equal(Object.prototype.hasOwnProperty.call(wrapperConfiguration.java.import.gradle, "home"), false);

  projectGradle = { mode: "built-in" };
  const builtInConfiguration = JSON.parse(JSON.stringify(registry.getServerWorkspaceConfiguration("java", {
    filePath: "C:/Project/src/App.java"
  })));
  assert.equal(builtInConfiguration.java.import.gradle.wrapper.enabled, false);
  assert.equal(Object.prototype.hasOwnProperty.call(builtInConfiguration.java.import.gradle, "home"), false);
});

test("JDT unmanaged project configuration uses workspace-relative source and output paths", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    getWorkspaceRoot: () => "C:/Projects/hello-world",
    getJavaWorkspaceModel: () => ({
      workspaceRoot: "C:/Projects/hello-world",
      kind: "unmanaged",
      importers: { maven: false, gradle: false },
      modules: [{
        sourceRoots: ["C:/Projects/hello-world/src/main/java", "C:/Projects/hello-world/src/test/java"],
        outputRoots: ["C:/Projects/hello-world/build/classes"],
        referencedLibraries: []
      }],
      projectConfiguration: { buildSystem: "javac" }
    }),
    getJavaWorkspaceRuntime: () => ({ projectJdk: { id: "jdk-25", path: "C:/Java/25", feature: 25 } })
  });

  const configuration = registry.getServerWorkspaceConfiguration("java", {
    filePath: "C:/Projects/hello-world/src/main/java/com/example/helloworld/Main.java"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(configuration.java.project.sourcePaths)), ["src/main/java", "src/test/java"]);
  assert.equal(configuration.java.project.outputPath, "build/classes");
});


test("LSP server registry exposes the installed LemMinX XML and POM recipe", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.0-uber.jar",
    "C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getJavaLanguageServerExecutable: async () => "C:/JDK/bin/java.exe",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Profile/language-servers/xml") {
            return [{ entry: "org.eclipse.lemminx-0.31.0-uber.jar", type: "FILE" }, { entry: "extensions", type: "DIRECTORY" }];
          }
          if (path === "C:/Profile/language-servers/xml/extensions") {
            return [{ entry: "lemminx-maven-0.12.0.jar", type: "FILE" }];
          }
          return [];
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });
  const xmlServer = registry.getServerForLanguage("xml");
  const mavenServer = registry.getServerForLanguage("maven");
  const variant = xmlServer.variants.find((candidate) => candidate.id === "eclipse-lemminx");
  const status = await registry.getServerStatus("xml");
  const descriptor = await registry.getLaunchDescriptor("xml", { workspaceRoot: "C:/Project", filePath: "C:/Project/pom.xml" });

  assert.equal(xmlServer.id, "xml");
  assert.equal(mavenServer.id, "xml");
  assert.deepEqual(Array.from(variant.requiredFiles), ["org.eclipse.lemminx-*-uber.jar"]);
  assert.equal(variant.entryFile, "org.eclipse.lemminx-*-uber.jar");
  assert.equal(registry.getLspLanguageId(xmlServer, "xml"), "xml");
  assert.equal(registry.getLspLanguageId(xmlServer, "maven"), "xml");
  assert.equal(status.installed, true);
  assert.equal(status.bundled, false);
  assert.equal(status.installDir, "C:/Profile/language-servers/xml");
  assert.equal(status.variant.id, "eclipse-lemminx");
  assert.match(descriptor.command, /^"C:\/JDK\/bin\/java\.exe" -cp /);
  assert.match(descriptor.command, /C:\/Profile\/language-servers\/xml\/org\.eclipse\.lemminx-0\.31\.0-uber\.jar/);
  assert.match(descriptor.command, /C:\/Profile\/language-servers\/xml\/extensions\/\*/);
  assert.match(descriptor.command, /org\.eclipse\.lemminx\.XMLServerLauncher$/);
  assert.equal(descriptor.cwd, "C:/Profile/language-servers/xml");
});
test("LSP server registry does not expose SQL as a language server", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });

  const status = await registry.getServerStatus("sql");
  const descriptor = await registry.getLaunchDescriptor("sql");

  assert.equal(registry.getServerForLanguage("sql"), null);
  assert.equal(registry.serverDefinitions.sql, undefined);
  assert.equal(status.server, null);
  assert.equal(status.installed, false);
  assert.equal(status.bundled, false);
  assert.equal(descriptor, null);
});


test("LSP server registry keeps a profile TypeScript install ahead of the bundled fallback", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs",
    "C:/Desktop/node_modules/typescript-language-server/package.json",
    "C:/Desktop/node_modules/typescript/package.json",
    "C:/Profile/language-servers/typescript/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js",
    "C:/Profile/language-servers/typescript/node_modules/typescript/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          return JSON.stringify({ variantId: "sourcegraph-javascript-typescript" });
        }
      }
    }
  });

  const status = await registry.getServerStatus("typescript");
  const descriptor = await registry.getLaunchDescriptor("typescript");

  assert.equal(status.installed, true);
  assert.equal(status.bundled, false);
  assert.equal(status.installDir, "C:/Profile/language-servers/typescript");
  assert.equal(status.variant.id, "sourcegraph-javascript-typescript");
  assert.equal(
    descriptor.command,
    'node "C:/Profile/language-servers/typescript/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js"'
  );
  assert.equal(descriptor.cwd, "C:/Profile/language-servers/typescript");
});

test("LSP server registry falls back to the bundled TypeScript language server without a profile install", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs",
    "C:/Desktop/node_modules/typescript-language-server/package.json",
    "C:/Desktop/node_modules/typescript/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });

  const status = await registry.getServerStatus("typescript");
  const descriptor = await registry.getLaunchDescriptor("typescript");

  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(status.installDir, "C:/Desktop");
  assert.equal(status.variant.id, "typescript-language-server");
  assert.equal(
    descriptor.command,
    'node "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs" --stdio'
  );
  assert.equal(descriptor.cwd, "C:/Desktop");
});

test("LSP server registry launches the installed Sourcegraph TypeScript variant", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Profile/language-servers/typescript/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js",
    "C:/Profile/language-servers/typescript/node_modules/typescript/package.json"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readFile() {
          return JSON.stringify({ variantId: "sourcegraph-javascript-typescript" });
        }
      }
    }
  });

  const descriptor = await registry.getLaunchDescriptor("typescript");

  assert.equal(
    descriptor.command,
    'node "C:/Profile/language-servers/typescript/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js"'
  );
  assert.equal(descriptor.cwd, "C:/Profile/language-servers/typescript");
});

test("LSP Java server declares the JDT LS version supported by MD-Editor", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });

  assert.equal(registry.serverDefinitions.java.variants[0].supportedVersion, "1.61.0");
  const appScript = readWebFile("js/script.js");
  assert.match(appScript, /MD-Editor supports Eclipse JDT LS \$\{supportedVersion\}/);
  assert.match(appScript, /currently supports Eclipse JDT LS \$\{getSupportedJdtLsVersion\(\)\}/);
});

test("LSP installer resolves the configured supported Eclipse JDT LS milestone", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);
  const commands = [];
  const registry = {
    serverDefinitions: {
      java: {
        variants: [{ id: "eclipse-jdt-ls", supportedVersion: "1.61.0" }]
      }
    },
    async getServerInstallDir() { return "C:/Profile/language-servers/java"; },
    joinPath(...parts) { return parts.join("/"); },
    normalizeLocalPath(value) { return String(value || "").replace(/\\/g, "/"); }
  };
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    Neutralino: {
      filesystem: {
        async createDirectory() {}
      },
      os: {
        async execCommand(command) {
          commands.push(command);
          if (command.includes(").Content")) {
            return {
              exitCode: 0,
              stdOut: '<a href="jdt-language-server-1.61.0-202607231254.tar.gz">archive</a>'
            };
          }
          return { exitCode: 1, stdErr: "stop after supported release resolution" };
        }
      }
    }
  });

  await assert.rejects(
    installer.installJavaJdtLsFromEclipse(),
    /Unable to download Eclipse JDT LS/
  );
  assert.equal(commands.length, 2);
  assert.match(commands[0], /jdtls\/milestones\/1\.61\.0\//);
});

test("VSIX installer detects the Sourcegraph TypeScript server layout", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {}
  });

  const validation = installer.validateVsix({
    files: {
      "extension/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js": {},
      "extension/node_modules/typescript/package.json": {}
    }
  }, registry.serverDefinitions.typescript);

  assert.equal(validation.valid, true);
  assert.equal(validation.variant.id, "sourcegraph-javascript-typescript");
});

test("VSIX installer reports missing Sourcegraph TypeScript server files", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {}
  });

  const validation = installer.validateVsix({ files: { "extension/package.json": {} } }, registry.serverDefinitions.typescript);

  assert.equal(validation.valid, false);
  assert.deepEqual(Array.from(validation.missingFiles), [
    "node_modules/javascript-typescript-langserver/lib/language-server-stdio.js",
    "node_modules/typescript/package.json"
  ]);
});

test("LSP installer detects an extracted Eclipse JDT LS layout", async () => {
  const context = createContext();
  const installedFiles = new Set([
    "C:/Staging/config_win",
    "C:/Staging/features",
    "C:/Staging/plugins"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Staging/plugins") {
            return [{ entry: "org.eclipse.equinox.launcher_1.7.0.v20250519-0528.jar", type: "FILE" }];
          }
          return [];
        }
      }
    }
  });

  const validation = await installer.validateJdtLsInstallDir("C:/Staging", registry.serverDefinitions.java);

  assert.equal(validation.valid, true);
  assert.equal(validation.variant.id, "eclipse-jdt-ls");
});

test("VSIX installer rejects unsafe archive paths", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry: { serverDefinitions: {} },
    JSZip: function JSZip() {}
  });

  assert.equal(installer.isSafeArchivePath("extension/server.js"), true);
  assert.equal(installer.isSafeArchivePath("../server.js"), false);
  assert.equal(installer.isSafeArchivePath("extension/../../server.js"), false);
  assert.equal(installer.isSafeArchivePath("/server.js"), false);
  assert.equal(installer.isSafeArchivePath("C:/server.js"), false);
});

test("VSIX installer exposes Java archive install entrypoints", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry: { serverDefinitions: {} },
    JSZip: function JSZip() {}
  });

  assert.equal(typeof installer.ensureBundledLanguageServerInstalled, "function");
  assert.equal(typeof installer.installJavaJdtLsArchive, "function");
  assert.equal(typeof installer.installJavaJdtLsFromDialog, "function");
  assert.equal(typeof installer.installXmlLemMinXFromEclipse, "function");
  assert.equal(typeof installer.installXmlLemMinXFromDialog, "function");
  assert.equal(typeof installer.installXmlLemMinXMavenExtensionFromDialog, "function");
});


test("VSIX installer installs bundled Eclipse JDT LS archive without removing bin archive", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Desktop/bin",
    "C:/Desktop/bin/jdt-language-server-1.59.0.tar.gz",
    "C:/Desktop/bin/jdt-language-server-1.60.0.tar.gz"
  ]);
  const removed = [];
  function listEntries(parentPath) {
    const prefix = `${parentPath}/`;
    return Array.from(existing)
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length))
      .filter((item) => item && !item.includes("/"))
      .map((entry) => ({ entry, type: Array.from(existing).some((item) => item.startsWith(`${parentPath}/${entry}/`)) ? "DIRECTORY" : "FILE" }));
  }
  function moveTree(sourcePath, targetPath) {
    for (const item of Array.from(existing).filter((entry) => entry === sourcePath || entry.startsWith(`${sourcePath}/`))) {
      existing.delete(item);
      existing.add(`${targetPath}${item.slice(sourcePath.length)}`);
    }
  }
  const Neutralino = {
    filesystem: {
      async getStats(path) {
        if (!existing.has(path)) throw new Error("missing");
        return {};
      },
      async readDirectory(path) {
        return listEntries(path);
      },
      async createDirectory(path) {
        existing.add(path);
      },
      async remove(path) {
        removed.push(path);
        existing.delete(path);
      },
      async move(sourcePath, targetPath) {
        moveTree(sourcePath, targetPath);
      },
      async readFile() {
        throw new Error("missing");
      },
      async writeFile(path) {
        existing.add(path);
      }
    },
    os: {
      async execCommand(command) {
        assert.match(command, /jdt-language-server-1\.60\.0\.tar\.gz/);
        existing.add("C:/Profile/language-servers/java.staging/config_win");
        existing.add("C:/Profile/language-servers/java.staging/features");
        existing.add("C:/Profile/language-servers/java.staging/plugins");
        existing.add("C:/Profile/language-servers/java.staging/plugins/org.eclipse.equinox.launcher_1.7.0.jar");
        return { exitCode: 0, stdOut: "" };
      }
    }
  };

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    Neutralino
  });

  const result = await installer.ensureBundledLanguageServerInstalled("java");
  const status = await registry.getServerStatus("java");

  assert.equal(result.installed, true);
  assert.equal(result.metadata.installSource, "bundled");
  assert.equal(result.metadata.archiveName, "jdt-language-server-1.60.0.tar.gz");
  assert.equal(existing.has("C:/Desktop/bin/jdt-language-server-1.60.0.tar.gz"), true);
  assert.equal(removed.includes("C:/Desktop/bin/jdt-language-server-1.60.0.tar.gz"), false);
  assert.equal(status.installed, true);
});

test("VSIX installer installs bundled LemMinX XML and Maven dependency jars", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Desktop/bin",
    "C:/Desktop/bin/org.eclipse.lemminx-0.31.2-uber.jar",
    "C:/Desktop/bin/lemminx-maven-0.12.0.jar",
    "C:/Desktop/bin/lemminx-maven-0.12.0-zip-with-dependencies.zip"
  ]);
  const binaryFiles = new Map([
    ["C:/Desktop/bin/org.eclipse.lemminx-0.31.2-uber.jar", new Uint8Array([1]).buffer],
    ["C:/Desktop/bin/lemminx-maven-0.12.0.jar", new Uint8Array([2]).buffer],
    ["C:/Desktop/bin/lemminx-maven-0.12.0-zip-with-dependencies.zip", new Uint8Array([3]).buffer]
  ]);
  const textFiles = new Map();
  function listEntries(parentPath) {
    const prefix = `${parentPath}/`;
    return Array.from(existing)
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length))
      .filter((item) => item && !item.includes("/"))
      .map((entry) => ({ entry, type: Array.from(existing).some((item) => item.startsWith(`${parentPath}/${entry}/`)) ? "DIRECTORY" : "FILE" }));
  }
  function moveTree(sourcePath, targetPath) {
    for (const item of Array.from(existing).filter((entry) => entry === sourcePath || entry.startsWith(`${sourcePath}/`))) {
      existing.delete(item);
      existing.add(`${targetPath}${item.slice(sourcePath.length)}`);
      if (binaryFiles.has(item)) {
        binaryFiles.set(`${targetPath}${item.slice(sourcePath.length)}`, binaryFiles.get(item));
        binaryFiles.delete(item);
      }
    }
  }
  const Neutralino = {
    filesystem: {
      async getStats(path) {
        if (!existing.has(path)) throw new Error("missing");
        return {};
      },
      async readDirectory(path) {
        return listEntries(path);
      },
      async createDirectory(path) {
        existing.add(path);
      },
      async remove(path) {
        existing.delete(path);
      },
      async move(sourcePath, targetPath) {
        moveTree(sourcePath, targetPath);
      },
      async readFile(path) {
        if (!textFiles.has(path)) throw new Error("missing");
        return textFiles.get(path);
      },
      async writeFile(path, contents) {
        existing.add(path);
        textFiles.set(path, contents);
      },
      async readBinaryFile(path) {
        if (!binaryFiles.has(path)) throw new Error("missing");
        return binaryFiles.get(path);
      },
      async writeBinaryFile(path, bytes) {
        existing.add(path);
        binaryFiles.set(path, bytes);
      }
    }
  };

  function MavenDependencyZip() {}
  MavenDependencyZip.loadAsync = async () => ({
    files: {
      "lemminx-maven-0.12.0.jar": {
        name: "lemminx-maven-0.12.0.jar",
        dir: false,
        async: async () => new Uint8Array([2])
      },
      "maven-settings-builder-3.9.9.jar": {
        name: "maven-settings-builder-3.9.9.jar",
        dir: false,
        async: async () => new Uint8Array([4])
      }
    }
  });
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: MavenDependencyZip,
    Neutralino
  });

  const result = await installer.ensureBundledLanguageServerInstalled("xml");
  const status = await registry.getServerStatus("xml");

  assert.equal(result.installed, true);
  assert.equal(result.metadata.installSource, "bundled");
  assert.equal(result.metadata.mavenExtensionSource, "bundled");
  assert.equal(result.metadata.mavenExtensionPackageType, "zip");
  assert.equal(result.metadata.mavenExtensionJarCount, 2);
  assert.equal(existing.has("C:/Desktop/bin/org.eclipse.lemminx-0.31.2-uber.jar"), true);
  assert.equal(existing.has("C:/Desktop/bin/lemminx-maven-0.12.0.jar"), true);
  assert.equal(existing.has("C:/Desktop/bin/lemminx-maven-0.12.0-zip-with-dependencies.zip"), true);
  assert.equal(existing.has("C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.2-uber.jar"), true);
  assert.equal(existing.has("C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"), true);
  assert.equal(existing.has("C:/Profile/language-servers/xml/extensions/maven-settings-builder-3.9.9.jar"), true);
  assert.equal(status.installed, true);
});
test("VSIX installer repairs bundled LemMinX Maven installs missing dependency jars", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Desktop/bin",
    "C:/Desktop/bin/lemminx-maven-0.12.0-zip-with-dependencies.zip",
    "C:/Profile/language-servers/xml",
    "C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.2-uber.jar",
    "C:/Profile/language-servers/xml/extensions",
    "C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"
  ]);
  const binaryFiles = new Map([
    ["C:/Desktop/bin/lemminx-maven-0.12.0-zip-with-dependencies.zip", new Uint8Array([3]).buffer],
    ["C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.2-uber.jar", new Uint8Array([1]).buffer],
    ["C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar", new Uint8Array([2]).buffer]
  ]);
  const textFiles = new Map();
  function listEntries(parentPath) {
    const prefix = `${parentPath}/`;
    return Array.from(existing)
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length))
      .filter((item) => item && !item.includes("/"))
      .map((entry) => ({ entry, type: Array.from(existing).some((item) => item.startsWith(`${parentPath}/${entry}/`)) ? "DIRECTORY" : "FILE" }));
  }
  function MavenDependencyZip() {}
  MavenDependencyZip.loadAsync = async () => ({
    files: {
      "lemminx-maven-0.12.0.jar": {
        name: "lemminx-maven-0.12.0.jar",
        dir: false,
        async: async () => new Uint8Array([2])
      },
      "maven-settings-builder-3.9.9.jar": {
        name: "maven-settings-builder-3.9.9.jar",
        dir: false,
        async: async () => new Uint8Array([4])
      }
    }
  });
  const Neutralino = {
    filesystem: {
      async getStats(path) {
        if (!existing.has(path)) throw new Error("missing");
        return {};
      },
      async readDirectory(path) {
        return listEntries(path);
      },
      async createDirectory(path) {
        existing.add(path);
      },
      async remove(path) {
        existing.delete(path);
        for (const item of Array.from(existing)) {
          if (item.startsWith(`${path}/`)) existing.delete(item);
        }
      },
      async readFile(path) {
        if (!textFiles.has(path)) throw new Error("missing");
        return textFiles.get(path);
      },
      async writeFile(path, contents) {
        existing.add(path);
        textFiles.set(path, contents);
      },
      async readBinaryFile(path) {
        if (!binaryFiles.has(path)) throw new Error("missing");
        return binaryFiles.get(path);
      },
      async writeBinaryFile(path, bytes) {
        existing.add(path);
        binaryFiles.set(path, bytes);
      }
    }
  };
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: MavenDependencyZip,
    Neutralino
  });

  const result = await installer.ensureBundledLanguageServerInstalled("xml");

  assert.equal(result.installed, true);
  assert.equal(result.reason, "installed-extension");
  assert.equal(existing.has("C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"), true);
  assert.equal(existing.has("C:/Profile/language-servers/xml/extensions/maven-settings-builder-3.9.9.jar"), true);
});

test("VSIX installer skips bundled install when artifacts are missing or profile exists", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Desktop/bin",
    "C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.0-uber.jar",
    "C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"
  ]);
  let writeBinaryCount = 0;
  function listEntries(parentPath) {
    const prefix = `${parentPath}/`;
    return Array.from(existing)
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length))
      .filter((item) => item && !item.includes("/"))
      .map((entry) => ({ entry, type: Array.from(existing).some((item) => item.startsWith(`${parentPath}/${entry}/`)) ? "DIRECTORY" : "FILE" }));
  }
  const Neutralino = {
    filesystem: {
      async getStats(path) {
        if (!existing.has(path)) throw new Error("missing");
        return {};
      },
      async readDirectory(path) {
        return listEntries(path);
      },
      async readFile() {
        throw new Error("missing");
      },
      async writeBinaryFile() {
        writeBinaryCount += 1;
      }
    }
  };

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    Neutralino
  });

  const missingJavaResult = await installer.ensureBundledLanguageServerInstalled("java");
  const existingXmlResult = await installer.ensureBundledLanguageServerInstalled("xml");

  assert.equal(missingJavaResult.installed, false);
  assert.equal(missingJavaResult.reason, "missing-bundled-artifact");
  assert.equal(existingXmlResult.installed, false);
  assert.equal(existingXmlResult.reason, "already-installed");
  assert.equal(writeBinaryCount, 0);
});

test("VSIX installer recursively removes and verifies a profile server install", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Profile/language-servers/typescript",
    "C:/Profile/language-servers/typescript/node_modules",
    "C:/Profile/language-servers/typescript/node_modules/server.js"
  ]);
  const childrenByPath = new Map([
    ["C:/Profile/language-servers/typescript", [{ entry: "node_modules", type: "DIRECTORY" }]],
    ["C:/Profile/language-servers/typescript/node_modules", [{ entry: "server.js", type: "FILE" }]]
  ]);
  const removed = [];
  const logs = [];

  function removeFromParents(pathToRemove) {
    for (const [parent, entries] of childrenByPath.entries()) {
      childrenByPath.set(parent, entries.filter((entry) => `${parent}/${entry.entry}` !== pathToRemove));
    }
  }


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        }
      }
    }
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          return childrenByPath.get(path) || [];
        },
        async remove(path) {
          const entries = childrenByPath.get(path) || [];
          if (entries.length) throw new Error("directory is not empty");
          removed.push(path);
          existing.delete(path);
          childrenByPath.delete(path);
          removeFromParents(path);
        }
      }
    }
  });

  const result = await installer.removeServer("typescript");

  assert.equal(result, true);
  assert.equal(existing.has("C:/Profile/language-servers/typescript"), false);
  assert.deepEqual(removed, [
    "C:/Profile/language-servers/typescript/node_modules/server.js",
    "C:/Profile/language-servers/typescript/node_modules",
    "C:/Profile/language-servers/typescript"
  ]);
  assert.equal(logs.some((entry) => entry.message === "[lsp] Language server uninstall verification complete"), true);
});



test("VSIX installer uses desktop fallback when Neutralino removal leaves the folder behind", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set(["C:/Users/shayg/.md-editor/language-servers/xml"]);
  const commands = [];
  const logs = [];

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getProfileDataDirPath: async () => "C:/Users/shayg/.md-editor",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        }
      }
    }
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          if (path === "C:/Users/shayg/.md-editor/language-servers/xml") {
            return [{ entry: "org.eclipse.lemminx-0.31.2-uber.jar", type: "FILE" }];
          }
          throw new Error("not a directory");
        },
        async remove() {
          throw new Error("folder locked");
        }
      },
      os: {
        async execCommand(command) {
          commands.push(command);
          existing.delete("C:/Users/shayg/.md-editor/language-servers/xml");
          return { exitCode: 0, stdOut: "" };
        }
      }
    }
  });

  const result = await installer.removeServer("xml");

  assert.equal(result, true);
  assert.equal(commands.length, 1);
  assert.match(commands[0], /Remove-Item -LiteralPath 'C:\/Users\/shayg\/\.md-editor\/language-servers\/xml' -Recurse -Force/);
  assert.equal(logs.some((entry) => entry.message === "[lsp] Removed language server folder with desktop fallback"), true);
});

test("VSIX installer recursively removes a profile install when a child folder is reported as a file", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set([
    "C:/Profile/language-servers/xml",
    "C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.2-uber.jar",
    "C:/Profile/language-servers/xml/extensions",
    "C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar"
  ]);
  const childrenByPath = new Map([
    ["C:/Profile/language-servers/xml", [
      { entry: "org.eclipse.lemminx-0.31.2-uber.jar", type: "FILE" },
      { entry: "extensions", type: "FILE" }
    ]],
    ["C:/Profile/language-servers/xml/extensions", [
      { entry: "lemminx-maven-0.12.0.jar", type: "FILE" }
    ]]
  ]);
  const removed = [];

  function removeFromParents(pathToRemove) {
    for (const [parent, entries] of childrenByPath.entries()) {
      childrenByPath.set(parent, entries.filter((entry) => `${parent}/${entry.entry}` !== pathToRemove));
    }
  }


  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        }
      }
    }
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory(path) {
          return childrenByPath.get(path) || [];
        },
        async remove(path) {
          const entries = childrenByPath.get(path) || [];
          if (entries.length) throw new Error("directory is not empty");
          removed.push(path);
          existing.delete(path);
          childrenByPath.delete(path);
          removeFromParents(path);
        }
      }
    }
  });

  const result = await installer.removeServer("xml");

  assert.equal(result, true);
  assert.deepEqual(removed, [
    "C:/Profile/language-servers/xml/org.eclipse.lemminx-0.31.2-uber.jar",
    "C:/Profile/language-servers/xml/extensions/lemminx-maven-0.12.0.jar",
    "C:/Profile/language-servers/xml/extensions",
    "C:/Profile/language-servers/xml"
  ]);
});

test("VSIX installer accepts an empty leftover profile folder after cleanup", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  vm.runInContext(readWebFile("js/lsp/vsix-installer.js"), context);

  const existing = new Set(["C:/Profile/language-servers/typescript"]);
  const logs = [];

  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getProfileDataDirPath: async () => "C:/Profile",
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        }
      }
    }
  });
  const installer = context.window.registerMarkdownViewerLspVsixInstaller(context.app, {
    registry,
    JSZip: function JSZip() {},
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!existing.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory() {
          return [];
        },
        async remove() {
          throw new Error("directory is locked");
        }
      }
    }
  });

  const result = await installer.removeServer("typescript");

  assert.equal(result, true);
  assert.equal(logs.some((entry) => entry.message === "[lsp] Language server folder is empty but could not be removed"), true);
  assert.equal(logs.some((entry) => entry.message === "[lsp] Language server uninstall verification complete"), true);
});

test("Java files in the opened folder share its workspace root", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    getWorkspaceRoot: () => "C:/Projects/spring-framework"
  });
  const filePath = "C:/Projects/spring-framework/spring-core/src/main/java/example/Example.java";

  assert.equal(await registry.resolveWorkspaceRoot(filePath, registry.serverDefinitions.java), "C:/Projects/spring-framework");
  assert.equal(registry.isStandaloneJavaFile("java", filePath), false);
});

test("CodeMirror shares one initialized LSP client per server transport", () => {
  const source = readWebFile("js/editor/codemirror-bundle-source.js");
  const generatedBundle = readWebFile("js/vendor/codemirror.bundle.js");

  assert.match(source, /const sharedLspClientsByTransport = new WeakMap\(\);/);
  assert.match(source, /function getSharedLspClient\(session\)/);
  assert.match(source, /sharedLspClientsByTransport\.set\(session\.transport, client\);/);
  assert.match(source, /activeLspClient = getSharedLspClient\(session\);/);
  assert.equal((source.match(/new LSPClient\(/g) || []).length, 1);
  assert.match(generatedBundle, /function getSharedLspClient\(session\)/);
  assert.match(generatedBundle, /activeLspClient = getSharedLspClient\(session\);/);
  assert.match(generatedBundle, /function showCodeMirrorLspNotification\(message\)/);
  assert.match(generatedBundle, /function installCodeMirrorLspNotificationReporter\(\)/);
  assert.match(generatedBundle, /JDT is still initializing, please try again later/);
});

test("CodeMirror sends Java workspace settings with the JDT initialize request", () => {
  const source = readWebFile("js/editor/codemirror-bundle-source.js");
  const generatedBundle = readWebFile("js/vendor/codemirror.bundle.js");

  for (const content of [source, generatedBundle]) {
    assert.match(content, /function createLspInitializationTransport\(session\)/);
    assert.match(content, /session\.languageId !== "java"/);
    assert.match(content, /\{ settings: session\.workspaceConfiguration \}/);
    assert.match(content, /client\.connect\(createLspInitializationTransport\(session\)\);/);
  }
});

test("JDT initialize request includes bundled MD-Editor extension bundles", () => {
  const bridge = readWebFile("js/lsp/neutralino-lsp-bridge.js");
  const client = readWebFile("js/lsp/jdt-proxy-client.js");

  assert.match(bridge, /jdtExtensionBundles: options\.jdtExtensionBundles \|\| \[\]/);
  assert.match(client, /method === "initialize"/);
  assert.match(client, /initializationOptions\.bundles = Array\.from\(new Set/);
});

test("Neutralino LSP bridge frames and parses JSON-only messages", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);

  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    registry: { isDesktopLspRuntime: () => false }
  });
  const message = JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} });
  const framed = bridge.frameMessage(message);
  const parsed = [];
  const parser = bridge.createMessageParser((value) => parsed.push(value));

  assert.match(framed, /^Content-Length: \d+\r\n\r\n/);
  parser(framed.slice(0, 12));
  parser(framed.slice(12));
  assert.deepEqual(parsed, [message]);
});

test("Neutralino LSP bridge parses adjacent UTF-8 framed messages", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);

  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    registry: { isDesktopLspRuntime: () => false }
  });
  const first = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { contents: "Résumé hover text" } });
  const second = JSON.stringify({ jsonrpc: "2.0", id: 2, result: { items: [] } });
  const parsed = [];
  const parser = bridge.createMessageParser((value) => parsed.push(value));

  parser(bridge.frameMessage(first) + bridge.frameMessage(second));

  assert.deepEqual(parsed, [first, second]);
});

test("Neutralino LSP bridge parses a large UTF-8 message delivered in small chunks", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);

  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    registry: { isDesktopLspRuntime: () => false }
  });
  const message = JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    result: { contents: "R\u00e9sum\u00e9 \u65e5\u672c\u8a9e \ud83d\ude80 ".repeat(16384) }
  });
  const framed = bridge.frameMessage(message);
  const parsed = [];
  const parser = bridge.createMessageParser((value) => parsed.push(value));

  for (let offset = 0; offset < framed.length; offset += 29) {
    parser(framed.slice(offset, offset + 29));
  }

  assert.deepEqual(parsed, [message]);
});

test("Neutralino LSP bridge logs the selected language server launch", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const logs = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: false,
        installDir: "C:/Profile/language-servers/typescript",
        metadata: { variantLabel: "Sourcegraph JavaScript and TypeScript IntelliSense" },
        variant: { id: "sourcegraph-javascript-typescript", label: "Sourcegraph JavaScript and TypeScript IntelliSense" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: 'node "C:/Profile/language-servers/typescript/node_modules/javascript-typescript-langserver/lib/language-server-stdio.js"',
        cwd: "C:/Profile/language-servers/typescript"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 42 };
        }
      }
    }
  });

  const session = await bridge.ensureSession({
    server: { id: "typescript" },
    filePath: "C:/Project/src/file.js"
  });

  assert.equal(session.processId, 42);
  const launchLog = logs.find((entry) => entry.message === "[lsp] Launching language server");
  assert.equal(launchLog.details.source, "profile");
  assert.equal(launchLog.details.variantId, "sourcegraph-javascript-typescript");
  assert.match(launchLog.details.command, /javascript-typescript-langserver/);
});

test("Neutralino LSP bridge launches JDT for standalone Java files", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  let workspaceResolutionCount = 0;
  let launchOptions = null;
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      isStandaloneJavaFile: () => true,
      async resolveWorkspaceRoot() {
        workspaceResolutionCount += 1;
        return "C:/Project";
      },
      toFileUri: (path) => `file:///${path}`,
      joinPath: (parent, child) => `${parent}/${child}`,
      getServerWorkspaceDir: async () => "C:/Profile/language-server-workspaces/java/standalone",
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "eclipse-jdt-ls", label: "Eclipse JDT Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async (_serverId, options) => {
        launchOptions = options;
        return { command: 'java -jar "C:/Desktop/jdtls.jar"', cwd: "C:/Desktop" };
      }
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 41 };
        }
      }
    }
  });

  const session = await bridge.ensureSession({
    server: { id: "java" },
    filePath: "C:/Project/test.java"
  });

  assert.equal(workspaceResolutionCount, 0);
  assert.equal(launchOptions.workspaceRoot, "");
  assert.equal(launchOptions.filePath, "C:/Project/test.java");
  assert.equal(session.processId, 41);
});

test("Neutralino LSP bridge relies on JDT automatic managed import and enables autobuild after its initial build", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/jdt-activity-tracker.js"), context);
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const writes = [];
  let processHandlers = null;
  const lifecycle = [];
  let workspacePhase = "dormant";
  const controller = {
    getModel: () => ({ importers: { maven: true, gradle: false } }),
    getRuntime: () => ({ ok: true, projectJdk: { id: "project", path: "C:/JDK", feature: 25 }, launcherJdk: { path: "C:/JDK", feature: 25 } }),
    getState: () => ({ phase: workspacePhase, logPath: "C:/Jdt/.metadata/.log" }),
    setLogPath() {},
    markInitializing: () => lifecycle.push("initializing"),
    markImporting: () => lifecycle.push("importing"),
    markReady: () => lifecycle.push("ready")
  };
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    getJavaWorkspaceController: () => controller,
    processRouter: {
      registerProcess(_process, handlers) { processHandlers = handlers; return () => {}; }
    },
    registry: {
      isDesktopLspRuntime: () => true,
      isStandaloneJavaFile: () => false,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      joinPath: (parent, child) => `${parent}/${child}`,
      getServerWorkspaceDir: async () => "C:/Jdt",
      getServerWorkspaceConfiguration: (_id, options) => ({ java: { autobuild: { enabled: options.javaAutobuildEnabled === true } } }),
      getServerStatus: async () => ({ installed: true, bundled: true, installDir: "C:/Desktop", variant: { id: "eclipse-jdt-ls" }, missingFiles: [] }),
      getLaunchDescriptor: async () => ({ command: "java -jar jdtls.jar", cwd: "C:/Desktop" })
    },
    Neutralino: {
      os: {
        async spawnProcess() { return { id: 51, pid: 9051 }; },
        async updateSpawnedProcess(_id, action, frame) { if (action === "stdIn") writes.push(frame); }
      }
    }
  });
  await bridge.ensureSession({ server: { id: "java" }, filePath: "C:/Project/src/App.java" });
  const frame = (message) => `Content-Length: ${Buffer.byteLength(message, "utf8")}\r\n\r\n${message}`;
  processHandlers.onStdout(frame(JSON.stringify({ jsonrpc: "2.0", method: "language/status", params: { type: "ServiceReady", message: "Ready" } })));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(writes.length, 0);
  assert.equal(lifecycle.includes("ready"), false);
  processHandlers.onStdout(frame(JSON.stringify({ jsonrpc: "2.0", method: "language/status", params: { type: "Started", message: "Ready" } })));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(writes.length, 0);
  assert.equal(lifecycle.includes("ready"), false);
  processHandlers.onStdout(frame(JSON.stringify({ jsonrpc: "2.0", method: "$/progress", params: { token: "import", value: { kind: "begin", title: "Importing Maven projects" } } })));
  processHandlers.onStdout(frame(JSON.stringify({ jsonrpc: "2.0", method: "$/progress", params: { token: "import", value: { kind: "end" } } })));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(writes.length, 1);
  assert.match(writes[0], /workspace\/didChangeConfiguration/);
  assert.match(writes[0], /"enabled":true/);
  assert.equal(lifecycle.at(-1), "importing");
  workspacePhase = "degraded";
  assert.equal(await bridge.ensureSession({ server: { id: "java" }, filePath: "C:/Project/src/Other.java" }), null);
});

test("Neutralino JDT proxy keeps project diagnostics quarantined until the workspace build finishes", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/jdt-activity-tracker.js"), context);
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const lifecycle = [];
  const diagnosticMilestones = [];
  const writes = [];
  let proxyOptions = null;
  let configuredLogPath = "";
  const controller = {
    getModel: () => ({ importers: { maven: true, gradle: false } }),
    getRuntime: () => ({ ok: true, projectJdk: { path: "C:/JDK", feature: 25 }, launcherJdk: { path: "C:/JDK", feature: 25 } }),
    getState: () => ({ phase: "initializing" }),
    setLogPath: (value) => { configuredLogPath = value; },
    markInitializing: () => lifecycle.push("initializing"),
    markImporting: (message) => lifecycle.push(message),
    markReady: () => lifecycle.push("ready")
  };
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    diagnosticLifecycleTrace: { mark: (milestone) => diagnosticMilestones.push(milestone) },
    getJavaWorkspaceController: () => controller,
    jdtProxyClient: {
      async startSession(options) {
        proxyOptions = options;
        return { processId: 91, processPid: 9091, processHandle: 91, transport: { send(message) { writes.push(message); } } };
      },
      setActiveDocument() {}
    },
    registry: {
      isDesktopLspRuntime: () => true,
      isStandaloneJavaFile: () => false,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      joinPath: (parent, child) => `${parent}/${child}`,
      getServerWorkspaceDir: async () => "C:/JdtWorkspace",
      getServerWorkspaceConfiguration: (_id, options) => ({ java: { autobuild: { enabled: options.javaAutobuildEnabled === true } } }),
      getServerStatus: async () => ({ installed: true, bundled: true, installDir: "C:/Desktop", variant: { id: "eclipse-jdt-ls" }, missingFiles: [] }),
      getLaunchDescriptor: async () => ({ command: "java -jar jdtls.jar", cwd: "C:/Desktop" })
    },
    Neutralino: { os: { async spawnProcess() { return { id: 91, pid: 9091 }; } } }
  });
  await bridge.ensureSession({ server: { id: "java" }, filePath: "C:/Project/src/App.java" });
  assert.equal(proxyOptions.jdtLogPath, "C:/JdtWorkspace/.metadata/.log");
  assert.equal(configuredLogPath, proxyOptions.jdtLogPath);
  proxyOptions.onLspMessage(JSON.stringify({ jsonrpc: "2.0", method: "language/status", params: { type: "ServiceReady", message: "Ready" } }));
  assert.equal(lifecycle.includes("ready"), false);
  assert.equal(writes.length, 0);
  assert.equal(lifecycle.includes("Java: Waiting for project import..."), true);

  proxyOptions.onStatus({ phase: "build-complete", message: "Java workspace build finished." });

  assert.equal(lifecycle.includes("ready"), false);
  assert.equal(lifecycle.at(-1), "Java: Validating imported projects...");
  assert.equal(writes.length, 1);
  assert.match(writes[0], /workspace\/didChangeConfiguration/);

  proxyOptions.onStatus({ phase: "build-started", message: "Java workspace build started." });
  assert.equal(lifecycle.at(-1), "Java: Building workspace...");
  assert.equal(diagnosticMilestones.includes("jdt-service-ready"), true);
  assert.equal(diagnosticMilestones.includes("jdt-build-completed"), true);
  assert.equal(diagnosticMilestones.includes("jdt-build-started"), true);
});

test("Neutralino LSP bridge accepts spawned process id zero", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const writes = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "typescript-language-server", label: "TypeScript Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: 'node "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs" --stdio',
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 0 };
        },
        async updateSpawnedProcess(id, event, data) {
          writes.push({ id, event, data });
        }
      }
    }
  });

  const session = await bridge.ensureSession({
    server: { id: "typescript" },
    filePath: "C:/Project/src/file.js"
  });

  session.transport.send(JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} }));

  assert.equal(session.processId, 0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 0);
  assert.equal(writes[0].event, "stdIn");
});

test("Neutralino LSP bridge logs protocol send and receive summaries", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const logs = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "typescript-language-server", label: "TypeScript Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: 'node "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs" --stdio',
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 7 };
        },
        async updateSpawnedProcess() {}
      }
    }
  });
  const session = await bridge.ensureSession({
    server: { id: "typescript" },
    filePath: "C:/Project/src/file.js"
  });
  const received = [];
  session.transport.subscribe((message) => received.push(message));

  session.transport.send(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "textDocument/hover", params: {} }));
  session.parser('Content-Length: 38\r\n\r\n{"jsonrpc":"2.0","id":3,"result":null}');
  session.transport.send(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "textDocument/definition", params: {} }));
  session.parser(bridge.frameMessage(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    result: [{
      targetUri: "file:///c%3A/Project/src/file.js",
      targetSelectionRange: { start: { line: 10, character: 4 }, end: { line: 10, character: 12 } }
    }]
  })));

  const sentLog = logs.find((entry) => entry.message === "[lsp] client -> server" && entry.details.method === "textDocument/hover");
  const receivedLog = logs.find((entry) => entry.message === "[lsp] server -> client" && entry.details.id === 3);
  const definitionLog = logs.find((entry) => entry.message === "[lsp] server -> client" && entry.details.id === 4);
  assert.equal(sentLog.details.kind, "request");
  assert.equal(receivedLog.details.kind, "response");
  assert.equal(definitionLog.details.responseMethod, "textDocument/definition");
  assert.equal(definitionLog.details.definitionResult.targetUri, "file:///c%3A/Project/src/file.js");
  assert.equal(definitionLog.details.definitionResult.line, 10);
  assert.equal(definitionLog.details.definitionResult.character, 4);
  assert.equal(definitionLog.details.definitionResult.empty, false);
  assert.equal(received.length, 2);
});

test("Neutralino LSP bridge logs malformed server output", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const logs = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog(level, message, details) {
      logs.push({ level, message, details });
    },
    registry: { isDesktopLspRuntime: () => false }
  });
  const parser = bridge.createMessageParser(() => {}, {
    onParseWarning(details) {
      logs.push({ level: "warning", message: "[lsp] Dropped malformed language server output", details });
    }
  });

  parser("Bad-Header: true\r\n\r\n{}");

  assert.equal(logs.some((entry) => entry.message === "[lsp] Dropped malformed language server output"), true);
});

test("Neutralino LSP bridge reuses a pending language server launch", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  let launchCount = 0;
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "typescript-language-server", label: "TypeScript Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: 'node "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs" --stdio',
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          launchCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { id: 100 + launchCount };
        }
      }
    }
  });

  const [first, second] = await Promise.all([
    bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/Project/src/a.js" }),
    bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/Project/src/a.js" })
  ]);

  assert.equal(launchCount, 1);
  assert.equal(first, second);
  assert.equal(first.processId, 101);
});

test("Neutralino LSP bridge reports runtime status and file session matches", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  let nextProcessId = 20;
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async (filePath) => filePath.includes("/src/") ? "C:/Project" : "C:/Other",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "typescript-language-server", label: "TypeScript Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: 'node "C:/Desktop/node_modules/typescript-language-server/lib/cli.mjs" --stdio',
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          nextProcessId += 1;
          return { id: nextProcessId };
        },
        async updateSpawnedProcess() {}
      }
    }
  });

  assert.equal(bridge.getServerRuntimeStatus("typescript").running, false);
  assert.equal(await bridge.hasRunningSessionForFile({ server: { id: "typescript" }, filePath: "C:/Project/src/a.ts" }), false);

  await bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/Project/src/a.ts" });

  const status = bridge.getServerRuntimeStatus("typescript");
  assert.equal(status.running, true);
  assert.equal(status.sessionCount, 1);
  assert.equal(await bridge.hasRunningSessionForFile({ server: { id: "typescript" }, filePath: "C:/Project/src/b.ts" }), true);
  assert.equal(await bridge.hasRunningSessionForFile({ server: { id: "typescript" }, filePath: "C:/Other/file.ts" }), false);
});

test("Neutralino LSP bridge stops one server without stopping other servers", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  let nextProcessId = 30;
  const stopped = [];
  let spawnedProcessHandler = null;
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "language-server", label: "Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async (serverId) => ({
        command: `node "C:/Desktop/${serverId}.js" --stdio`,
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          nextProcessId += 1;
          return { id: nextProcessId, pid: 9000 + nextProcessId };
        },
        async updateSpawnedProcess(id, event) {
          if (event === "exit") {
            stopped.push(id);
            spawnedProcessHandler?.({ detail: { id, action: "exit" } });
          }
        }
      },
      events: {
        on(event, handler) {
          if (event === "spawnedProcess") spawnedProcessHandler = handler;
        }
      }
    }
  });

  const typeScriptSession = await bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/Project/src/a.ts" });
  const pythonSession = await bridge.ensureSession({ server: { id: "python" }, filePath: "C:/Project/src/a.py" });

  await bridge.stopServerSessions("typescript");

  assert.deepEqual(stopped, [typeScriptSession.processId]);
  assert.equal(bridge.getServerRuntimeStatus("typescript").running, false);
  assert.equal(bridge.getServerRuntimeStatus("python").running, true);
  assert.equal(bridge.getServerRuntimeStatus("python").sessions[0].processId, pythonSession.processId);
});

test("Neutralino LSP bridge stopAllSessions still stops every running server", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  let nextProcessId = 40;
  const stopped = [];
  let spawnedProcessHandler = null;
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async (filePath) => filePath.includes("ProjectA") ? "C:/ProjectA" : "C:/ProjectB",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "language-server", label: "Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async (serverId) => ({
        command: `node "C:/Desktop/${serverId}.js" --stdio`,
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          nextProcessId += 1;
          return { id: nextProcessId, pid: 9000 + nextProcessId };
        },
        async updateSpawnedProcess(id, event) {
          if (event === "exit") {
            stopped.push(id);
            spawnedProcessHandler?.({ detail: { id, action: "exit" } });
          }
        }
      },
      events: {
        on(event, handler) {
          if (event === "spawnedProcess") spawnedProcessHandler = handler;
        }
      }
    }
  });

  const first = await bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/ProjectA/src/a.ts" });
  const second = await bridge.ensureSession({ server: { id: "python" }, filePath: "C:/ProjectB/src/a.py" });

  await bridge.stopAllSessions();

  assert.deepEqual(stopped, [first.processId, second.processId]);
  assert.equal(bridge.getServerRuntimeStatus("typescript").running, false);
  assert.equal(bridge.getServerRuntimeStatus("python").running, false);
});

test("Neutralino LSP bridge kills a server process when shutdown times out", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const stopped = [];
  const killed = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    shutdownTimeoutMs: 1,
    killTimeoutMs: 1,
    registry: {
      isDesktopLspRuntime: () => true,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "language-server", label: "Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: `java -jar "C:/Desktop/server.jar"`,
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 77, pid: 9077 };
        },
        async updateSpawnedProcess(id, event) {
          if (event === "exit") stopped.push(id);
        },
        async execCommand(command) {
          killed.push(command);
        }
      },
      events: {
        on() {}
      }
    }
  });

  await bridge.ensureSession({ server: { id: "xml" }, filePath: "C:/Project/pom.xml" });
  const stopping = bridge.stopServerSessions("xml");

  assert.equal(bridge.getServerRuntimeStatus("xml").stoppingSessionCount, 1);
  await stopping;

  assert.deepEqual(stopped, [77]);
  assert.deepEqual(killed, ["cmd /c taskkill /PID 9077 /T /F"]);
  assert.equal(bridge.getServerRuntimeStatus("xml").running, false);
  assert.equal(bridge.getServerRuntimeStatus("xml").stoppingSessionCount, 0);
});

test("Neutralino LSP bridge force-stops a server process without waiting for graceful shutdown", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/neutralino-lsp-bridge.js"), context);
  const stopped = [];
  const killed = [];
  const bridge = context.window.registerMarkdownViewerNeutralinoLspBridge(context.app, {
    appDebugLog() {},
    getJavaWorkspaceController: () => ({
      getRuntime: () => ({ ok: true, launcherJdk: { path: "C:/JDK", feature: 25 } }),
      getState: () => ({ phase: "ready" }),
      setLogPath() {},
      markInitializing() {}
    }),
    registry: {
      isDesktopLspRuntime: () => true,
      isStandaloneJavaFile: () => false,
      resolveWorkspaceRoot: async () => "C:/Project",
      toFileUri: (path) => `file:///${path}`,
      joinPath: (parent, child) => `${parent}/${child}`,
      getServerWorkspaceDir: async () => "C:/Jdt",
      getServerStatus: async () => ({
        installed: true,
        bundled: true,
        installDir: "C:/Desktop",
        metadata: null,
        variant: { id: "language-server", label: "Language Server" },
        missingFiles: []
      }),
      getLaunchDescriptor: async () => ({
        command: `java -jar "C:/Desktop/server.jar"`,
        cwd: "C:/Desktop"
      })
    },
    Neutralino: {
      os: {
        async spawnProcess() {
          return { id: 88, pid: 9088 };
        },
        async updateSpawnedProcess(id, event) {
          if (event === "exit") stopped.push(id);
        },
        async execCommand(command) {
          killed.push(command);
        }
      },
      events: {
        on() {}
      }
    }
  });

  await bridge.ensureSession({ server: { id: "java" }, filePath: "C:/Project/src/Main.java" });
  await bridge.stopServerSessions("java", { force: true });

  assert.deepEqual(stopped, []);
  assert.deepEqual(killed, ["cmd /c taskkill /PID 9088 /T /F"]);
  assert.equal(bridge.getServerRuntimeStatus("java").running, false);
  assert.equal(bridge.getServerRuntimeStatus("java").stoppingSessionCount, 0);
});

test("JDT proxy router parses split multibyte frames and filters expired requests", () => {
  const { LspMessageRouter } = require("../resources/bridges/jdt-proxy-bridge/lsp-message-router.cjs");
  const received = [];
  const writes = [];
  const router = new LspMessageRouter({
    onMessage: (message) => received.push(message),
    write: (frame) => writes.push(frame)
  });
  const message = { jsonrpc: "2.0", method: "window/showMessage", params: { message: "׳©׳׳•׳" } };
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`), payload]);
  for (let index = 0; index < frame.length; index += 2) router.acceptChunk(frame.subarray(index, index + 2));
  assert.deepEqual(received, [message]);

  assert.equal(router.send({ jsonrpc: "2.0", id: 1, method: "textDocument/hover", params: {} }, { expiresAt: Date.now() - 1 }), false);
  assert.equal(writes.length, 0);
  assert.equal(router.send({ jsonrpc: "2.0", id: 2, method: "textDocument/hover", params: {} }, { expiresAt: Date.now() + 1000 }), true);
  router.pendingRequests.get("2").expiresAt = Date.now() - 1;
  const response = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), "utf8");
  router.acceptChunk(Buffer.concat([Buffer.from(`Content-Length: ${response.length}\r\n\r\n`), response]));
  assert.equal(received.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes.some((item) => item.toString("utf8").includes("$/cancelRequest")), false);
});

test("JDT workspace log treats a completed build with compiler diagnostics as terminal", () => {
  const { classifyJdtWorkspaceLogLine } = require("../resources/bridges/jdt-proxy-bridge/jdt-workspace-log-monitor.cjs");
  assert.deepEqual(
    classifyJdtWorkspaceLogLine("!MESSAGE Error occured while building workspace. Details:"),
    {
      phase: "build-complete",
      outcome: "completed-with-errors",
      message: "Java workspace build finished with diagnostics."
    }
  );
});

test("JDT workspace log monitor periodically reports only newly appended build lifecycle entries", async () => {
  const { createJdtWorkspaceLogMonitor, resolveJdtWorkspaceLogPath } = require("../resources/bridges/jdt-proxy-bridge/jdt-workspace-log-monitor.cjs");
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-jdt-log-monitor-"));
  const logPath = path.join(tempDirectory, ".log");
  const statuses = [];
  assert.equal(
    resolveJdtWorkspaceLogPath({ command: 'java -jar jdtls.jar -data "C:/Profile/workspaces/java/project"' }),
    path.join("C:/Profile/workspaces/java/project", ".metadata", ".log")
  );
  assert.equal(resolveJdtWorkspaceLogPath({ jdtLogPath: "C:/Explicit/.metadata/.log", command: 'java -data "C:/Ignored"' }), "C:/Explicit/.metadata/.log");
  fs.writeFileSync(logPath, "!MESSAGE >> build jobs finished\n");
  const monitor = createJdtWorkspaceLogMonitor({ logPath, pollIntervalMs: 20, onLifecycle: (status) => statuses.push(status) });
  try {
    monitor.start();
    fs.appendFileSync(logPath, "!MESSAGE >> initialization job finished\n!MESSAGE >> build jobs finished\n");
    const deadline = Date.now() + 1000;
    while (statuses.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(statuses, [
      { phase: "build-started", message: "Java workspace build started." },
      { phase: "build-complete", message: "Java workspace build finished." }
    ]);
  } finally {
    monitor.stop();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("JDT proxy classifies Gradle causes beyond the bounded public log message", () => {
  const { LspMessageRouter } = require("../resources/bridges/jdt-proxy-bridge/lsp-message-router.cjs");
  const { JdtProjectModelState } = require("../resources/bridges/jdt-proxy-bridge/jdt-project-model-state.cjs");
  const statuses = [];
  const router = new LspMessageRouter({ onStatus: (status) => statuses.push(status) });
  const gradleFailure = `The supplied phased action failed with an exception. ${"stack ".repeat(100)}Unsupported class file major version 70`;
  const message = { jsonrpc: "2.0", method: "window/logMessage", params: { type: 1, message: gradleFailure } };
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  router.acceptChunk(Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`), payload]));

  assert.equal(statuses[0].message.length, 500);
  assert.doesNotMatch(statuses[0].message, /Unsupported class file major version/);
  assert.match(statuses[0].classificationMessage, /Unsupported class file major version 70/);
  const state = new JdtProjectModelState();
  const failure = state.acceptStatus(Object.assign({}, statuses[0], { message: statuses[0].classificationMessage }));
  assert.equal(failure.code, "jdk-incompatible");
  assert.equal(failure.rejectedJavaFeature, 26);
});

test("JDT proxy classifies one Gradle import failure and refines Java incompatibility evidence", () => {
  const { JdtProjectModelState } = require("../resources/bridges/jdt-proxy-bridge/jdt-project-model-state.cjs");
  const state = new JdtProjectModelState();
  const failed = state.acceptStatus({ phase: "log", message: "Synchronize Gradle projects with workspace failed due to an error connecting to the Gradle build." });
  assert.equal(failed.code, "gradle-import-failed");
  assert.equal(failed.fatal, true);
  assert.equal(state.acceptStatus({ phase: "log", message: "Synchronize project spring-core failed due to an error connecting to the Gradle build." }), null);
  const refined = state.acceptStatus({ phase: "log", message: "Unsupported class file major version 69" });
  assert.equal(refined.code, "jdk-incompatible");
  assert.equal(refined.rejectedJavaFeature, 25);
  state.reset();
  assert.equal(state.isFailed(), false);
  assert.equal(state.acceptStatus({ phase: "log", message: "Synchronize Gradle projects with workspace failed" }).code, "gradle-import-failed");
});

test("JDT diagnostic store defaults to a 5000-problem query cap", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/repo/Old.java",
    diagnostics: [{ severity: 1, message: "old", range: { start: { line: 0, character: 0 } } }]
  });
  store.updatePublication({
    uri: "file:///C:/repo/Old.java",
    diagnostics: [{ severity: 2, message: "new", range: { start: { line: 1, character: 1 } } }]
  });
  store.updatePublication({
    uri: "file:///C:/repo/Latest.java",
    diagnostics: Array.from({ length: 5005 }, (_value, index) => ({
      severity: 1,
      message: `problem ${index}`,
      range: { start: { line: index, character: 0 } }
    }))
  });
  const first = store.getProblems(0, 100);
  const all = store.getProblems(0, 6000, first.snapshotId);
  assert.equal(first.problems.length, 100);
  assert.match(first.snapshotId, /^jdt-problems-/);
  assert.equal(first.problems[0].filePath.endsWith("Latest.java"), true);
  assert.equal(first.totalCount, 5006);
  assert.equal(first.availableCount, 5000);
  assert.equal(all.problems.length, 5000);
  assert.equal(store.getSummary().counts.error, 5005);
  assert.equal(store.getSummary().counts.warning, 1);
  assert.equal(store.getSummary().lastPublication.uri, "file:///C:/repo/Latest.java");
  assert.equal(store.getSummary().lastPublication.sequence, 3);
  assert.deepEqual(store.getSummary().lastPublication.counts, { error: 5005, warning: 0, info: 0, total: 5005 });
  assert.equal(Number.isFinite(store.getSummary().lastPublication.timestamp), true);
});

test("JDT diagnostic store retains details beyond the query cap for later publications", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore({ maximumProblems: 1000 });
  store.updatePublication({
    uri: "file:///C:/repo/StillValid.java",
    diagnostics: [{ severity: 2, message: "still valid", range: { start: { line: 0, character: 0 } } }]
  });
  store.updatePublication({
    uri: "file:///C:/repo/ImportStorm.java",
    diagnostics: Array.from({ length: 1000 }, (_value, index) => ({
      severity: 1,
      message: `storm ${index}`,
      range: { start: { line: index, character: 0 } }
    }))
  });

  assert.equal(store.getSummary().totalCount, 1001);
  assert.equal(store.getSummary().availableCount, 1000);
  store.updatePublication({ uri: "file:///C:/repo/ImportStorm.java", diagnostics: [] });
  const afterStorm = store.getProblems(0, 100);

  assert.equal(afterStorm.totalCount, 1);
  assert.equal(afterStorm.availableCount, 1);
  assert.deepEqual(afterStorm.problems.map((problem) => problem.message), ["still valid"]);
});

test("JDT diagnostic store applies a changed maximum without losing published details", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore({ maximumProblems: 2 });
  store.updatePublication({
    uri: "file:///C:/repo/Main.java",
    diagnostics: Array.from({ length: 4 }, (_value, index) => ({
      severity: 1,
      message: `problem ${index}`,
      range: { start: { line: index, character: 0 } }
    }))
  });

  assert.equal(store.getSummary().availableCount, 2);
  assert.equal(store.setMaximumProblems(4).availableCount, 4);
  assert.equal(store.getProblems(0, 10).problems.length, 4);
});

test("JDT diagnostic pages exhaust errors before warnings and information", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore({ maximumProblems: 6 });
  store.updatePublication({
    uri: "file:///C:/repo/Information.java",
    diagnostics: [
      { severity: 3, message: "info 1", range: { start: { line: 0, character: 0 } } },
      { severity: 3, message: "info 2", range: { start: { line: 1, character: 0 } } }
    ]
  });
  store.updatePublication({
    uri: "file:///C:/repo/Warnings.java",
    diagnostics: [
      { severity: 2, message: "warning 1", range: { start: { line: 0, character: 0 } } },
      { severity: 2, message: "warning 2", range: { start: { line: 1, character: 0 } } }
    ]
  });
  store.updatePublication({
    uri: "file:///C:/repo/Errors.java",
    diagnostics: [
      { severity: 1, message: "error 1", range: { start: { line: 0, character: 0 } } },
      { severity: 1, message: "error 2", range: { start: { line: 1, character: 0 } } }
    ]
  });

  const firstPage = store.getProblems(0, 3);
  const secondPage = store.getProblems(3, 3, firstPage.snapshotId);

  assert.deepEqual(firstPage.problems.map((problem) => problem.severity), ["error", "error", "warning"]);
  assert.deepEqual(secondPage.problems.map((problem) => problem.severity), ["warning", "info", "info"]);
});

test("JDT diagnostic store keeps an open Problems snapshot stable and appends later findings", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/repo/First.java",
    diagnostics: [{ severity: 1, message: "first", range: { start: { line: 0, character: 0 } } }]
  });
  const firstPage = store.getProblems(0, 1);
  store.updatePublication({
    uri: "file:///C:/repo/Later.java",
    diagnostics: [{ severity: 2, message: "later", range: { start: { line: 1, character: 0 } } }]
  });
  const appendedPage = store.getProblems(1, 10, firstPage.snapshotId);
  const refreshedPage = store.getProblems(0, 1);

  assert.equal(firstPage.problems[0].message, "first");
  assert.equal(appendedPage.snapshotId, firstPage.snapshotId);
  assert.deepEqual(appendedPage.problems.map((problem) => problem.message), ["later"]);
  assert.equal(refreshedPage.problems[0].message, "first");
});

test("JDT diagnostic snapshot promotes higher severities and stays stable within one severity", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/repo/First.java",
    diagnostics: Array.from({ length: 2 }, (_value, index) => ({
      severity: 2,
      message: `first ${index}`,
      range: { start: { line: index, character: 0 } }
    }))
  });
  const initial = store.getProblems(0, 100);
  store.updatePublication({
    uri: "file:///C:/repo/Later.java",
    diagnostics: Array.from({ length: 120 }, (_value, index) => ({
      severity: 1,
      message: `later ${index}`,
      range: { start: { line: index, character: 0 } }
    }))
  });
  const filled = store.getProblems(0, 100, initial.snapshotId);
  const filledIds = filled.problems.map((problem) => problem.problemId);
  store.updatePublication({
    uri: "file:///C:/repo/Newest.java",
    diagnostics: [{ severity: 1, message: "newest", range: { start: { line: 0, character: 0 } } }]
  });
  const frozen = store.getProblems(0, 100, initial.snapshotId);
  store.updatePublication({ uri: "file:///C:/repo/First.java", diagnostics: [] });
  const retracted = store.getProblems(0, 100, initial.snapshotId);
  const loadedMore = store.getProblems(retracted.problems.length, 1000, initial.snapshotId);

  assert.equal(initial.problems.length, 2);
  assert.equal(filled.problems.length, 100);
  assert.equal(filled.problems.every((problem) => problem.severity === "error"), true);
  assert.deepEqual(frozen.problems.map((problem) => problem.problemId), filledIds);
  assert.equal(retracted.problems.length, 100);
  assert.equal(retracted.problems.some((problem) => problem.message.startsWith("first ")), false);
  assert.equal(loadedMore.problems.some((problem) => problem.message === "newest"), true);
});

test("JDT diagnostic store quarantines a failed Gradle import generation", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore();
  store.setActiveDocument("file:///C:/repo/Main.java");
  store.updatePublication({
    uri: "file:///C:/repo/Main.java",
    diagnostics: [{ severity: 1, message: "cascading", range: { start: { line: 0, character: 0 } } }]
  });

  const failed = store.failProjectAnalysis({ code: "gradle-import-failed" });
  assert.equal(failed.summary.analysisAvailable, false);
  assert.equal(failed.summary.totalCount, 0);
  assert.deepEqual(failed.activeDiagnostics.diagnostics, []);
  store.updatePublication({
    uri: "file:///C:/repo/Later.java",
    diagnostics: [{ severity: 1, message: "ignored", range: { start: { line: 1, character: 0 } } }]
  });
  assert.equal(store.getProblems(0, 100).problems.length, 0);
  assert.equal(store.getSummary().counts.total, 0);
});

test("JDT diagnostic generation snapshots remain immutable after later publications", () => {
  const { JdtDiagnosticStore } = require("../resources/bridges/jdt-proxy-bridge/jdt-diagnostic-store.cjs");
  const store = new JdtDiagnosticStore();
  store.updatePublication({
    uri: "file:///C:/repo/Main.java",
    diagnostics: [{ severity: 1, message: "generation one", range: { start: { line: 0, character: 0 } } }]
  });
  const frozen = store.freezeGenerationSnapshot(7);
  store.updatePublication({
    uri: "file:///C:/repo/Main.java",
    diagnostics: [{ severity: 2, message: "generation two", range: { start: { line: 1, character: 0 } } }]
  });

  const page = store.getProblems(0, 100, frozen.snapshotId);
  assert.equal(page.generationId, 7);
  assert.equal(page.totalCount, 1);
  assert.equal(Object.isFrozen(page.problems[0]), true);
  assert.deepEqual(page.problems.map((problem) => problem.message), ["generation one"]);
});

test("JDT diagnostic worker settles only after the final quiet window", async () => {
  const { Worker } = require("node:worker_threads");
  const worker = new Worker(path.join(webRoot, "bridges/jdt-proxy-bridge/jdt-diagnostic-worker.cjs"), {
    workerData: { maximumProblems: 1000, summarySettleDelayMs: 20, generationId: 3, workspaceRoot: "C:/repo" }
  });
  const messages = [];
  worker.on("message", (message) => messages.push(message));
  try {
    worker.postMessage({ type: "begin-analysis-generation", generationId: 3, workspaceRoot: "C:/repo" });
    worker.postMessage({ type: "finalize-analysis-generation", generationId: 3, workspaceRoot: "C:/repo" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    worker.postMessage({
      type: "publish-diagnostics",
      generationId: 3,
      workspaceRoot: "C:/repo",
      payload: JSON.stringify({
        params: {
          uri: "file:///C:/repo/Main.java",
          diagnostics: [{ severity: 1, message: "late current-generation problem", range: { start: { line: 0, character: 0 } } }]
        }
      })
    });
    const deadline = Date.now() + 3000;
    while (!messages.some((message) => message.type === "diagnostic-generation-settled") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const settled = messages.filter((message) => message.type === "diagnostic-generation-settled");
    assert.equal(settled.length, 1);
    assert.equal(settled[0].generationId, 3);
    assert.equal(settled[0].summary.totalCount, 1);
  } finally {
    await worker.terminate();
  }
});

test("AJDT generation finalization is idempotent and reports required unavailability", () => {
  const { AjdtDiagnosticsController } = require("../resources/bridges/jdt-proxy-bridge/ajdt-diagnostics-controller.cjs");
  const workerMessages = [];
  const proxyMessages = [];
  const terminals = [];
  const controller = new AjdtDiagnosticsController({
    launch: {
      workspaceRoot: "C:/repo",
      aspectjDiagnostics: { eligible: true, enabled: false, scopeUris: ["file:///C:/repo/spring-aspects"] }
    },
    diagnosticWorker: { postMessage: (message) => workerMessages.push(message) },
    send: (message) => proxyMessages.push(message),
    onTerminal: (terminal) => terminals.push(terminal)
  });

  controller.configure(false);
  assert.equal(workerMessages.length, 0);
  controller.beginGeneration(4);
  assert.equal(controller.finalizeGeneration(4, false), true);
  assert.deepEqual(terminals, [{ generationId: 4, outcome: "skipped" }]);
  assert.equal(controller.finalizeGeneration(3, false), false);

  controller.beginGeneration(5);
  assert.equal(controller.finalizeGeneration(5, true), false);
  assert.equal(workerMessages.at(-1).generationId, 5);
  assert.equal(proxyMessages.at(-1).type, "aspectj-diagnostics-failed");
  assert.deepEqual(terminals.at(-1), { generationId: 5, outcome: "failed" });
});

test("JDT proxy client applies dynamic interactive deadlines and force-kills the proxy tree", async () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/jdt-proxy-client.js"), context);
  const stdin = [];
  const killed = [];
  let nextPid = 7007;
  let timeoutMs = 4500;
  let maximumProblems = 5000;
  let projectAnalysisFailure = null;
  const generationStatuses = [];
  const client = context.window.registerMarkdownViewerJdtProxyClient(context.app, {
    getDesktopAppRootPath: () => "C:/Desktop",
    getWorkspaceModel: () => ({
      workspaceRoot: "C:/Project",
      analysisInventory: { buildSystem: "maven" },
      analysis: {
        mode: "selected",
        includedModuleRoots: ["C:/Project/desktop-app/converters/java_converter"]
      }
    }),
    getInteractiveRequestTimeoutMs: () => timeoutMs,
    getMaximumProblems: () => maximumProblems,
    processRouter: { registerProcess: () => () => {} },
    Neutralino: {
      filesystem: { async writeFile() {} },
      os: {
        async getPath() { return "C:/Temp"; },
        async spawnProcess() { return { id: nextPid, pid: nextPid++ }; },
        async updateSpawnedProcess(_id, _event, data) { stdin.push(JSON.parse(data)); },
        async execCommand(command) { killed.push(command); }
      }
    }
  });
  assert.equal(client._test.PROBLEMS_QUERY_TIMEOUT_MS, 30000);
  assert.equal(client._test.PROXY_SHUTDOWN_TIMEOUT_MS, 30000);
  const session = await client.startSession({
    key: "java:C:/Project",
    workspaceRoot: "C:/Project",
    launch: { command: "java -jar jdt.jar", cwd: "C:/Project" },
    onStatus(value) { generationStatuses.push(value); },
    onProjectAnalysisFailure(value) { projectAnalysisFailure = value; }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stdin.find((message) => message.type === "configure").maximumProblems, 5000);
  assert.equal(client.beginAnalysisGeneration({ generationId: 7, workspaceRoot: "C:/Project" }), true);
  assert.equal(client.finalizeAnalysisGeneration({ generationId: 7, workspaceRoot: "C:/Project", ajdtRequired: true }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stdin.find((message) => message.type === "begin-analysis-generation").generationId, 7);
  assert.equal(stdin.find((message) => message.type === "finalize-analysis-generation").ajdtRequired, true);
  client._test.handleProxyMessage(session, { type: "status", generationId: 6, phase: "build-complete" });
  client._test.handleProxyMessage(session, { type: "status", generationId: 7, phase: "build-complete" });
  assert.deepEqual(generationStatuses.map((status) => status.generationId), [7]);
  session.transport.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "textDocument/hover", params: {} }));
  session.transport.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }));
  session.transport.send(JSON.stringify({ jsonrpc: "2.0", method: "textDocument/didChange", params: {} }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const hover = stdin.find((message) => message.requestId === 1);
  const initialize = stdin.find((message) => message.requestId === 2);
  const notification = stdin.find((message) => message.message?.method === "textDocument/didChange");
  assert.equal(hover.expiresAt > Date.now() + 4000, true);
  assert.equal(initialize.expiresAt > Date.now() + 119000, true);
  assert.equal(initialize.message.params.rootUri, "file:///C:/Project");
  assert.equal(initialize.message.params.rootPath, "C:/Project");
  assert.deepEqual(initialize.message.params.workspaceFolders, [{
    uri: "file:///C:/Project",
    name: "Project"
  }]);
  assert.equal(notification.expiresAt, undefined);

  timeoutMs = 9000;
  maximumProblems = 7500;
  client.configure();
  session.transport.send(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "textDocument/references", params: {} }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stdin.find((message) => message.requestId === 3).expiresAt > Date.now() + 8500, true);
  assert.equal(stdin.filter((message) => message.type === "configure").at(-1).maximumProblems, 7500);

  const problemsPromise = client.getProblems({ key: session.key, offset: 100, limit: 25, snapshotId: "stable-page" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const problemsQuery = stdin.find((message) => message.type === "get-problems");
  assert.equal(problemsQuery.snapshotId, "stable-page");
  client._test.handleProxyMessage(session, {
    type: "problems-result",
    requestId: problemsQuery.requestId,
    snapshotId: "stable-page",
    problems: []
  });
  await problemsPromise;
  const tasksPromise = client.getTasks({ key: session.key, generationId: 7, offset: 0, limit: 50, snapshotId: "stable-page" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tasksQuery = stdin.find((message) => message.type === "get-tasks");
  assert.equal(tasksQuery.generationId, 7);
  assert.equal(tasksQuery.snapshotId, "stable-page");
  client._test.handleProxyMessage(session, {
    type: "tasks-result",
    requestId: tasksQuery.requestId,
    generationId: 7,
    snapshotId: "stable-page",
    tasks: []
  });
  await tasksPromise;
  client._test.handleProxyMessage(session, {
    type: "project-analysis-failed",
    failure: { code: "gradle-import-failed", fatal: true }
  });
  assert.equal(projectAnalysisFailure.code, "gradle-import-failed");
  assert.equal(projectAnalysisFailure.workspaceRoot, "C:/Project");

  await client.stopSession(session, { force: true });
  assert.deepEqual(killed, ["cmd /c taskkill /PID 7007 /T /F"]);
  assert.equal(stdin.some((message) => message.message?.method === "$/cancelRequest"), false);

  await client.startSession({ key: "java:C:/Second", workspaceRoot: "C:/Second", launch: { command: "java -jar jdt.jar", cwd: "C:/Second" } });
  await client.startSession({ key: "java:C:/Third", workspaceRoot: "C:/Third", launch: { command: "java -jar jdt.jar", cwd: "C:/Third" } });
  await client.stopAllSessions({ force: true });
  assert.deepEqual(killed, [
    "cmd /c taskkill /PID 7007 /T /F",
    "cmd /c taskkill /PID 7008 /T /F",
    "cmd /c taskkill /PID 7009 /T /F"
  ]);
  assert.equal(client.getSession("java:C:/Second"), null);
  assert.equal(client.getSession("java:C:/Third"), null);
});

test("JDT proxy client waits for graceful proxy exit before completing shutdown", async () => {
  const bridgeSource = readWebFile("bridges/jdt-proxy-bridge/jdt-proxy-bridge.cjs");
  assert.match(bridgeSource, /const POST_EXIT_GRACE_TIMEOUT_MS = 10000;/);
  assert.match(bridgeSource, /setTimeout\(killChildTree, POST_EXIT_GRACE_TIMEOUT_MS\)/);
  assert.doesNotMatch(bridgeSource, /setTimeout\(killChildTree, 500\)/);
  const context = createContext();
  vm.runInContext(readWebFile("js/lsp/jdt-proxy-client.js"), context);
  const stdin = [];
  let processHandlers = null;
  const client = context.window.registerMarkdownViewerJdtProxyClient(context.app, {
    getDesktopAppRootPath: () => "C:/Desktop",
    processRouter: {
      registerProcess(_process, handlers) {
        processHandlers = handlers;
        return () => {};
      }
    },
    Neutralino: {
      filesystem: { async writeFile() {} },
      os: {
        async getPath() { return "C:/Temp"; },
        async spawnProcess() { return { id: 77, pid: 7077 }; },
        async updateSpawnedProcess(_id, _event, data) { stdin.push(JSON.parse(data)); },
        async execCommand() { throw new Error("graceful shutdown must not force-kill"); }
      }
    }
  });
  const session = await client.startSession({
    key: "java:C:/Project",
    workspaceRoot: "C:/Project",
    launch: { command: "java -jar jdt.jar", cwd: "C:/Project" }
  });

  let completed = false;
  const stopping = client.stopSession(session).then(() => { completed = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stdin.some((message) => message.type === "stop"), true);
  assert.equal(completed, false);
  assert.equal(client.getSession(session.key), session);

  processHandlers.onExit({ code: 0 });
  await stopping;
  assert.equal(completed, true);
  assert.equal(client.getSession(session.key), null);
});

test("JDT proxy client waits exactly four seconds and reports the second consecutive start failure", async () => {
  const context = createContext();
  const timers = [];
  context.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  vm.runInContext(readWebFile("js/lsp/jdt-proxy-client.js"), context);
  const owners = new Map();
  let nextId = 0;
  let unavailable = 0;
  const client = context.window.registerMarkdownViewerJdtProxyClient(context.app, {
    getDesktopAppRootPath: () => "C:/Desktop",
    processRouter: {
      registerProcess(handle, owner) {
        owners.set(handle.id, owner);
        return () => owners.delete(handle.id);
      }
    },
    Neutralino: {
      filesystem: { async writeFile() {} },
      os: {
        async getPath() { return "C:/Temp"; },
        async spawnProcess() {
          nextId += 1;
          return { id: nextId, pid: 8000 + nextId };
        },
        async updateSpawnedProcess() {}
      }
    }
  });
  await client.startSession({
    key: "java:C:/Project",
    workspaceRoot: "C:/Project",
    launch: { command: "java -jar jdt.jar", cwd: "C:/Project" },
    onUnavailable() { unavailable += 1; }
  });
  owners.get(1).onExit({ exitCode: 1 });
  assert.equal(timers[0].delay, 4000);
  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  owners.get(2).onExit({ exitCode: 1 });
  assert.equal(unavailable, 1);
});

test("JDT diagnostic worker isolates storms, emits only active-file diagnostics, and answers bounded queries", async () => {
  const { Worker } = require("node:worker_threads");
  const worker = new Worker(path.join(webRoot, "bridges/jdt-proxy-bridge/jdt-diagnostic-worker.cjs"), {
    workerData: { maximumProblems: 1000, summarySettleDelayMs: 20 }
  });
  const messages = [];
  let workerError = null;
  worker.on("message", (message) => messages.push(message));
  worker.on("error", (error) => { workerError = error; });
  try {
  worker.postMessage({ type: "set-active-document", uri: "file:///C:/repo/Active.java" });
  for (let index = 0; index < 200; index += 1) {
    worker.postMessage({
      type: "publish-diagnostics",
      payload: JSON.stringify({
        method: "textDocument/publishDiagnostics",
        params: {
          uri: "file:///C:/repo/Background.java",
          diagnostics: [{ severity: 2, message: `background ${index}`, range: { start: { line: index, character: 0 } } }]
        }
      })
    });
  }
  worker.postMessage({
    type: "publish-diagnostics",
    payload: JSON.stringify({
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///C:/repo/Active.java",
        diagnostics: [{ severity: 1, message: "active", range: { start: { line: 0, character: 0 } } }]
      }
    })
  });
  worker.postMessage({ type: "get-problems", requestId: "query", offset: 0, limit: 100 });
  const deadline = Date.now() + 3000;
  while (!messages.some((message) => message.type === "problems-result") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const activeMessages = messages.filter((message) => message.type === "active-diagnostics");
  const result = messages.find((message) => message.type === "problems-result");
  assert.equal(workerError, null);
  assert.ok(result);
  assert.match(result.snapshotId, /^jdt-problems-/);
  assert.equal(activeMessages.every((message) => message.uri === "file:///C:/repo/Active.java"), true);
  assert.equal(activeMessages.filter((message) => message.diagnostics.length > 0).length, 1);
  assert.equal(result.totalCount, 2);
  assert.equal(result.problems.some((problem) => problem.message === "background 199"), true);
  assert.equal(result.problems.some((problem) => problem.message === "background 0"), false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(messages.filter((message) => message.type === "diagnostic-summary" && message.summary?.analysisAvailable !== false).length, 1);
  worker.postMessage({ type: "set-project-analysis-failure", failure: { code: "gradle-import-failed", fatal: true } });
  worker.postMessage({ type: "get-problems", requestId: "failed-query", offset: 0, limit: 100 });
  const failureDeadline = Date.now() + 3000;
  while (!messages.some((message) => message.type === "problems-result" && message.requestId === "failed-query") && Date.now() < failureDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const failedResult = messages.find((message) => message.type === "problems-result" && message.requestId === "failed-query");
  const unavailableSummaryIndex = messages.findIndex((message) => message.type === "diagnostic-summary" && message.summary?.analysisAvailable === false);
  const failureEventIndex = messages.findIndex((message) => message.type === "project-analysis-failed");
  assert.equal(failedResult.totalCount, 0);
  assert.deepEqual(failedResult.problems, []);
  assert.equal(unavailableSummaryIndex >= 0, true);
  assert.equal(failureEventIndex > unavailableSummaryIndex, true);
  } finally {
    await worker.terminate();
  }
});

test("LSP server registry exposes the bundled Kotlin adapter", async () => {
  const context = createContext();
  context.global = undefined;
  context.NL_OS = "Linux";
  let resolvedMavenOptions = null;
  const installedFiles = new Set([
    "C:/Desktop/resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs",
    "C:/Desktop/vendor/kotlin-lsp/bin/intellij-server.exe",
    "C:/Desktop/vendor/kotlin-compiler/kotlinc/bin/kotlinc.bat",
    "C:/Desktop/vendor/kotlin-compiler/kotlinc/lib/jvm-abi-gen.jar"
  ]);
  vm.runInContext(readWebFile("js/lsp/server-registry.js"), context);
  const registry = context.window.registerMarkdownViewerLspServerRegistry(context.app, {
    isNeutralinoRuntime: () => true,
    getDesktopAppRootPath: async () => "C:/Desktop",
    getProfileDataDirPath: async () => "C:/Profile",
    getMaximumProblems: () => 5000,
    getJavaWorkspaceModel: () => ({
      analysis: { mode: "build-path", includedModuleRoots: ["C:/Project/buildSrc"] }
    }),
    mavenRuntimeSettings: {
      getConfiguration: () => ({}),
      resolveRunner: async (options) => {
        resolvedMavenOptions = options;
        return { runner: "mvn" };
      }
    },
    Neutralino: {
      filesystem: {
        async getStats(path) {
          if (!installedFiles.has(path)) throw new Error("missing");
          return {};
        },
        async readDirectory() { return []; },
        async createDirectory() {}
      }
    }
  });
  const server = registry.getServerForLanguage("kotlin");
  const status = await registry.getServerStatus("kotlin");
  const descriptor = await registry.getLaunchDescriptor("kotlin", { workspaceRoot: "C:/Project", filePath: "C:/Project/src/App.kt" });

  assert.equal(server.id, "kotlin");
  assert.equal(server.bundledVariantId, "jetbrains-kotlin-lsp");
  assert.equal(status.installed, true);
  assert.equal(status.bundled, true);
  assert.equal(resolvedMavenOptions.osName, "Linux");
  assert.match(descriptor.command, /^node "C:\/Desktop\/resources\/bridges\/kotlin-adapter-bridge\/kotlin-adapter-bridge\.cjs"/);
  assert.match(descriptor.command, /--server "C:\/Desktop\/vendor\/kotlin-lsp\/bin\/intellij-server\.exe"/);
  assert.match(descriptor.command, /--maximumProblems 5000/);
  assert.match(descriptor.command, /--analysisRoots "%5B%22C%3A%2FProject%2FbuildSrc%22%5D"/);
});
test("JDT proxy router correlates explicit build completion with the initiating generation", () => {
  const { LspMessageRouter } = require("../resources/bridges/jdt-proxy-bridge/lsp-message-router.cjs");
  const completions = [];
  const router = new LspMessageRouter({
    onRequestCompleted: (request) => completions.push(request),
    write() {}
  });
  router.send(
    { jsonrpc: "2.0", id: "final-build-9", method: "java/buildWorkspace", params: false },
    { generationId: 9, workspaceRoot: "C:/Project" }
  );
  const response = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: "final-build-9", result: 1 }), "utf8");
  router.acceptChunk(Buffer.concat([Buffer.from(`Content-Length: ${response.length}\r\n\r\n`), response]));
  assert.deepEqual(completions, [{
    requestId: "final-build-9",
    method: "java/buildWorkspace",
    generationId: 9,
    workspaceRoot: "C:/Project",
    succeeded: true
  }]);
});
