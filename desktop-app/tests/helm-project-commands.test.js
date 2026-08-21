const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModules() {
  const context = { window: {}, globalThis: {}, console };
  for (const file of ["helm-chart-context.js", "helm-authoring-docs.js", "helm-project-commands.js"]) {
    const source = fs.readFileSync(path.resolve(__dirname, `../resources/js/project/${file}`), "utf8");
    vm.runInNewContext(source, context, { filename: file });
  }
  return context.window;
}

function createApp() {
  return { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
}

function createApi(overrides = {}) {
  const loaded = loadModules();
  const app = createApp();
  const chartContext = loaded.registerMarkdownViewerHelmChartContext(app);
  const commands = [];
  const tabs = [];
  const compareTabs = [];
  const previews = [];
  const files = Object.assign({
    "C:/Project/charts/hello-world/Chart.yaml": "apiVersion: v2\nname: hello-world\n",
    "C:/Project/charts/hello-world/values.yaml": "image:\n  repository: nginx\n",
    "C:/Project/charts/hello-world/templates/_helpers.tpl": '{{ define "hello-world.fullname" }}{{ end }}',
    "C:/Project/charts/hello-world/templates/deployment.yaml": "apiVersion: apps/v1\\nkind: Deployment\\n"
  }, overrides.files || {});
  const helmAuthoringDocs = loaded.registerMarkdownViewerHelmAuthoringDocs(app);
  const api = loaded.registerMarkdownViewerHelmProjectCommands(app, Object.assign({
    chartContext,
    helmAuthoringDocs,
    getActiveFolderPath: () => "C:/Project",
    getActiveFilePath: () => "C:/Project/charts/hello-world/templates/deployment.yaml",
    getActiveEditorValue: () => "apiVersion: apps/v1\nkind: Deployment\n",
    pathExists: async (candidate) => Object.prototype.hasOwnProperty.call(files, candidate),
    readFile: async (candidate) => {
      if (!Object.prototype.hasOwnProperty.call(files, candidate)) throw new Error("missing");
      return files[candidate];
    },
    dryRunOptionsDialog: {
      async open(initial) { return Object.assign({}, initial, overrides.dryRunOptions || {}); }
    },
    templatePreviewDialog: {
      async open(initial) {
        previews.push(initial);
        if (overrides.previewOptions === null) return null;
        return Object.assign({}, initial, overrides.previewOptions || {});
      }
    },
    terminal: {
      async runCommand(command, options) {
        commands.push({ command, options });
        return { exitCode: 0, stdout: "apiVersion: v1\nkind: Service\n", stderr: "", output: "apiVersion: v1\nkind: Service\n" };
      }
    },
    openRenderedYamlTab(content, title) {
      tabs.push({ content, title });
      return { content, title };
    },
    openFileCompareInTab(compareDescriptor) {
      compareTabs.push(compareDescriptor);
      return { compareDescriptor };
    }
  }, overrides.deps || {}));
  return { api, app, chartContext, commands, tabs, compareTabs, previews };
}

test("Helm project commands detect charts and build expected commands", () => {
  const { api } = createApi();
  const context = { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/templates/deployment.yaml" };

  assert.equal(api.canExecute("helm-lint-chart", context), true);
  assert.equal(api.canExecute("helm-template-active-file", context), true);
  assert.equal(api.canExecute("helm-template-active-file", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/values.yaml" }), false);
  assert.equal(api.buildHelmCommand("helm-lint-chart", context), "helm lint C:/Project/charts/hello-world");
  assert.equal(api.buildHelmCommand("helm-template-chart", context), "helm template hello-world C:/Project/charts/hello-world");
  assert.equal(api.buildHelmCommand("helm-template-active-file", context), "helm template hello-world C:/Project/charts/hello-world --show-only templates/deployment.yaml");
  assert.equal(api.buildHelmCommand("helm-dependency-update", context), "helm dependency update C:/Project/charts/hello-world");
  assert.equal(api.buildHelmCommand("helm-show-dependencies", context), "helm dependency list C:/Project/charts/hello-world");
  assert.equal(api.buildHelmCommand("helm-package-chart", context), "helm package C:/Project/charts/hello-world");
  assert.equal(api.buildHelmCommand("helm-render-kubernetes-dry-run", context), "helm template hello-world C:/Project/charts/hello-world | kubectl apply --dry-run=client -f -");
  assert.equal(api.buildHelmCommand("helm-render-server-dry-run", Object.assign({}, context, { validateSchema: false })), "helm template hello-world C:/Project/charts/hello-world | kubectl apply --dry-run=server --validate=false -f -");
});

test("Helm project commands open rendered YAML in unsaved tabs", async () => {
  const { api, commands, tabs } = createApi();
  const result = await api.execute("helm-template-active-file", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/templates/deployment.yaml" });

  assert.equal(result.ok, true);
  assert.equal(commands[0].command, "helm template hello-world C:/Project/charts/hello-world --show-only templates/deployment.yaml");
  assert.deepEqual(tabs, [{ content: "apiVersion: v1\nkind: Service\n", title: "deployment.rendered.yaml" }]);
});

test("Helm project commands render before Kubernetes dry run and use selected options", async () => {
  const { api, commands, tabs } = createApi({
    dryRunOptions: { dryRunMode: "server", validateSchema: false, contextName: "prod", namespaceName: "ops" },
    deps: {
      kubernetesContext: {
        buildHelmPrefix() { return "helm"; },
        buildKubectlPrefix(options = {}) {
          const context = options.contextName ? ` --context ${options.contextName}` : "";
          const namespace = options.namespaceName ? ` --namespace ${options.namespaceName}` : "";
          return `kubectl${context}${namespace}`;
        },
        getContextSummary() { return { contextName: "local", namespaceName: "default" }; }
      }
    }
  });
  const result = await api.execute("helm-render-kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, true);
  assert.equal(commands[0].command, "helm template hello-world C:/Project/charts/hello-world");
  assert.equal(commands[1].command, "helm template hello-world C:/Project/charts/hello-world | kubectl --context prod --namespace ops apply --dry-run=server --validate=false -f -");
  assert.equal(tabs[0].title, "helm-template.yaml");
});


test("Helm preview commands build values and set overrides", () => {
  const { api } = createApi();
  const context = {
    folderPath: "C:/Project",
    filePath: "C:/Project/charts/hello-world/templates/deployment.yaml",
    valuesFiles: ["C:/Project/charts/hello-world/values-dev.yaml", "C:/Project/charts/hello-world/env values.yaml"],
    setValues: "image.tag=1.0,replicaCount=2"
  };

  assert.equal(api.buildHelmCommand("helm-preview-chart", context), "helm template hello-world C:/Project/charts/hello-world --values C:/Project/charts/hello-world/values-dev.yaml --values \"C:/Project/charts/hello-world/env values.yaml\" --set image.tag=1.0,replicaCount=2");
  assert.equal(api.buildHelmCommand("helm-preview-template", context), "helm template hello-world C:/Project/charts/hello-world --show-only templates/deployment.yaml --values C:/Project/charts/hello-world/values-dev.yaml --values \"C:/Project/charts/hello-world/env values.yaml\" --set image.tag=1.0,replicaCount=2");
});

test("Helm preview opens a read-only compare tab for active templates", async () => {
  const { api, commands, compareTabs, previews, tabs } = createApi({
    previewOptions: {
      valuesFiles: ["C:/Project/charts/hello-world/values-dev.yaml"],
      setValues: "image.tag=1.0"
    }
  });
  const result = await api.execute("helm-preview-template", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/templates/deployment.yaml" });

  assert.equal(result.ok, true);
  assert.equal(previews[0].mode, "template");
  assert.equal(commands[0].command, "helm template hello-world C:/Project/charts/hello-world --show-only templates/deployment.yaml --values C:/Project/charts/hello-world/values-dev.yaml --set image.tag=1.0");
  assert.equal(tabs.length, 0);
  assert.equal(compareTabs.length, 1);
  assert.equal(compareTabs[0].title, "Helm preview: deployment.yaml");
  assert.equal(compareTabs[0].readOnly, true);
  assert.equal(compareTabs[0].left.content, "apiVersion: apps/v1\\nkind: Deployment\\n");
  assert.equal(compareTabs[0].right.content, "apiVersion: v1\nkind: Service\n");
});

test("Helm preview opens a read-only compare tab for full charts", async () => {
  const { api, commands, compareTabs } = createApi({ previewOptions: { mode: "chart" } });
  const result = await api.execute("helm-preview-chart", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, true);
  assert.equal(commands[0].command, "helm template hello-world C:/Project/charts/hello-world");
  assert.equal(compareTabs[0].title, "Helm preview: hello-world");
  assert.equal(compareTabs[0].left.name, "Chart.yaml");
  assert.equal(compareTabs[0].left.content, "apiVersion: v2\nname: hello-world\n");
  assert.equal(compareTabs[0].right.name, "Rendered Helm YAML");
});

test("Helm preview cancellation does not run Helm", async () => {
  const { api, commands, compareTabs } = createApi({ previewOptions: null });
  const result = await api.execute("helm-preview-chart", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.cancelled, true);
  assert.equal(commands.length, 0);
  assert.equal(compareTabs.length, 0);
});

test("Helm preview failures do not open compare tabs", async () => {
  const { api, compareTabs } = createApi({ deps: { terminal: { async runCommand() { return { exitCode: 1, stdout: "", stderr: "template failed", output: "template failed" }; } } } });
  const result = await api.execute("helm-preview-chart", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, false);
  assert.equal(compareTabs.length, 0);
  assert.equal(result.diagnostics[0].title, "helm exited with code 1.");
});
test("Helm project commands return structured nonzero exits", async () => {
  const { api } = createApi({ deps: { terminal: { async runCommand() { return { exitCode: 2, stdout: "", stderr: "failed", output: "failed" }; } } } });
  const result = await api.execute("helm-lint-chart", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.equal(result.diagnostics[0].title, "helm exited with code 2.");
});

test("Helm project commands refresh cached completion items", async () => {
  const { api } = createApi();
  const items = JSON.parse(JSON.stringify(await api.refreshCompletionItems({ folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/templates/deployment.yaml" })));

  assert.ok(items.some((item) => item.label === ".Values.image.repository" && item.detail === "Helm values"));
  assert.ok(items.some((item) => item.label === "include \"hello-world.fullname\" ." && item.detail === "Helm named template"));
  assert.ok(items.some((item) => item.label === "toYaml" && item.info.includes("Convert a value")));
  assert.equal(api.getCachedCompletionItems().length, items.length);
});

test("Helm project commands handle dependency fragment command", async () => {
  const { api, tabs } = createApi();
  const result = await api.execute("helm-insert-dependency", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, true);
  assert.equal(tabs[0].title, "Chart-dependency-fragment.yaml");
  assert.match(tabs[0].content, /dependencies:/);
});

test("Helm project commands explain missing Helm executable", async () => {
  const { api } = createApi({ deps: { terminal: { async runCommand() { return { exitCode: 1, stdout: "", stderr: "'helm' is not recognized as an internal or external command", output: "" }; } } } });
  const result = await api.execute("helm-lint-chart", { folderPath: "C:/Project", filePath: "C:/Project/charts/hello-world/Chart.yaml" });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].title, "Helm is not available. Install Helm and add it to PATH, or set the full Helm executable path in Settings > Kubernetes.");
});