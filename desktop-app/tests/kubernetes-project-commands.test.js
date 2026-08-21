const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistration() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/kubernetes-project-commands.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "kubernetes-project-commands.js" });
  return context.window.registerMarkdownViewerKubernetesProjectCommands;
}

function createApp() {
  return { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
}

function createApi(overrides = {}) {
  const commands = [];
  const confirmations = [];
  const alerts = [];
  const register = loadRegistration();
  const app = createApp();
  const api = register(app, Object.assign({
    getActiveFolderPath: () => "C:/Project",
    getActiveFilePath: () => "C:/Project/k8s/deployment.yaml",
    getActiveEditorValue: () => "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n",
    getSelectedText: () => "",
    async confirm(options) {
      confirmations.push(options);
      return true;
    },
    alert(message) {
      alerts.push(message);
    },
    terminal: {
      async runCommand(command, options) {
        commands.push({ command, options });
        return { exitCode: 0, stdout: "", stderr: "", output: "" };
      }
    }
  }, overrides));
  return { api, app, commands, confirmations, alerts };
}

test("Kubernetes project commands detect manifests and require workspace context", () => {
  const { api } = createApi();

  assert.equal(api.isKubernetesManifest({ filePath: "C:/Project/k8s/deployment.yaml", content: "metadata:\n  name: app\n" }), true);
  assert.equal(api.isKubernetesManifest({ filePath: "C:/Project/config.yaml", content: "apiVersion: v1\nkind: Service\nmetadata:\n  name: app\n" }), true);
  assert.equal(api.isKubernetesManifest({ filePath: "C:/Project/settings.yaml", content: "name: app\nvalue: local\n" }), false);
  assert.equal(api.isKubernetesManifest({ filePath: "C:/Project/k8s/deployment.json", content: "apiVersion: v1\nkind: Pod\n" }), false);
  assert.equal(api.canExecute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml", content: "metadata:\n" }), true);

  const { api: noWorkspaceApi } = createApi({ getActiveFolderPath: () => "" });
  assert.equal(noWorkspaceApi.canExecute("kubernetes-dry-run", { folderPath: "", filePath: "C:/Project/config.yaml", content: "apiVersion: v1\nkind: ConfigMap\n" }), false);
  assert.equal(noWorkspaceApi.canExecute("unknown-command", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" }), false);
});

test("Kubernetes project commands build kubectl commands and explain targets", () => {
  const { api } = createApi();

  assert.equal(api.buildKubectlCommand("kubernetes-dry-run", { filePath: "C:/Project/k8s/my app.yaml" }), "kubectl apply --dry-run=client -f \"C:/Project/k8s/my app.yaml\"");
  assert.equal(api.buildKubectlCommand("kubernetes-server-dry-run", { filePath: "C:/Project/k8s/deployment.yaml", validateSchema: false }), "kubectl apply --dry-run=server --validate=false -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-apply", { filePath: "C:/Project/k8s/deployment.yaml" }), "kubectl apply -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-delete", { filePath: "C:/Project/k8s/deployment.yaml" }), "kubectl delete -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-explain", { selectedText: "deployment.spec.template" }), "kubectl explain deployment.spec.template");
  assert.equal(api.buildKubectlCommand("kubernetes-explain", { selectedText: "kind: Deployment", content: "apiVersion: apps/v1\nkind: Deployment\n" }), "kubectl explain deployment");
});

test("Kubernetes project commands confirm cluster changes and run through terminal", async () => {
  const { api, commands, confirmations } = createApi({ getSelectedText: () => "service.spec" });

  const dryRunResult = await api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(dryRunResult.ok, true);
  assert.equal(commands[0].command, "kubectl apply --dry-run=client -f C:/Project/k8s/deployment.yaml");
  assert.equal(commands[0].options.interactive, true);

  const applyResult = await api.execute("kubernetes-apply", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(applyResult.ok, true);
  assert.equal(confirmations[0].confirmVariant, "primary");
  assert.equal(commands[1].command, "kubectl apply -f C:/Project/k8s/deployment.yaml");

  const deleteResult = await api.execute("kubernetes-delete", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(deleteResult.ok, true);
  assert.equal(confirmations[1].confirmVariant, "danger");

  const explainResult = await api.execute("kubernetes-explain", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(explainResult.ok, true);
  assert.equal(commands[3].command, "kubectl explain service.spec");
});

test("Kubernetes project commands return structured failures", async () => {
  const nonzero = createApi({ terminal: { async runCommand() { return { exitCode: 7, stderr: "failed" }; } } });
  const nonzeroResult = await nonzero.api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(nonzeroResult.ok, false);
  assert.equal(nonzeroResult.exitCode, 7);
  assert.equal(nonzeroResult.diagnostics[0].title, "kubectl exited with code 7.");

  const missingTerminal = createApi({ terminal: null });
  const missingTerminalResult = await missingTerminal.api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(missingTerminalResult.ok, false);
  assert.equal(missingTerminalResult.diagnostics[0].title, "Terminal execution is unavailable.");
});

test("Kubernetes project commands build safe server-side, diff, events, and logs commands", () => {
  const { api } = createApi({
    kubernetesContext: {
      buildKubectlPrefix(options = {}) {
        const contextName = options.contextName || "local";
        const namespaceName = options.namespaceName || "dev";
        const namespace = options.includeNamespace === false ? "" : ` --namespace ${namespaceName}`;
        return `kubectl --context ${contextName}${namespace}`;
      },
      getContextSummary() { return { contextName: "local", namespaceName: "dev" }; }
    }
  });

  const manifest = { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml", content: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n" };
  assert.equal(api.buildKubectlCommand("kubernetes-server-dry-run", manifest), "kubectl --context local --namespace dev apply --dry-run=server -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-server-dry-run", Object.assign({}, manifest, { validateSchema: false })), "kubectl --context local --namespace dev apply --dry-run=server --validate=false -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-server-dry-run", Object.assign({}, manifest, { contextName: "prod", namespaceName: "ops" })), "kubectl --context prod --namespace ops apply --dry-run=server -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-diff", manifest), "kubectl --context local --namespace dev diff -f C:/Project/k8s/deployment.yaml");
  assert.equal(api.buildKubectlCommand("kubernetes-show-events", manifest), "kubectl --context local --namespace dev get events --sort-by=.lastTimestamp");
  assert.equal(api.buildKubectlCommand("kubernetes-logs", manifest), "kubectl --context local --namespace dev logs deployment/app");
});

test("Kubernetes project commands reject raw Helm templates for direct kubectl mutation and validation", () => {
  const { api } = createApi();
  const context = {
    folderPath: "C:/Project",
    filePath: "C:/Project/chart/templates/deployment.yaml",
    content: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Release.Name }}\n"
  };

  assert.equal(api.isRawHelmTemplate(context), true);
  assert.equal(api.canExecute("kubernetes-apply", context), false);
  assert.equal(api.canExecute("kubernetes-server-dry-run", context), false);
});

test("Kubernetes project commands explain missing kubectl executable", async () => {
  const missingKubectl = createApi({ terminal: { async runCommand() { return { exitCode: 1, stderr: "'kubectl' is not recognized as an internal or external command" }; } } });
  const result = await missingKubectl.api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/deployment.yaml" });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].title, "kubectl is not available. Install kubectl and add it to PATH, or set the full kubectl executable path in Settings > Kubernetes.");
});

test("Kubernetes server dry-run uses a temporary manifest for unsaved rendered YAML", async () => {
  const writes = [];
  const removals = [];
  const renderedYaml = "apiVersion: v1\nkind: Service\nmetadata:\n  name: hello-world\n";
  const temporaryPath = "C:/Temp/md-editor-kubernetes-rendered.yaml";
  const unsaved = createApi({
    pathExists: async () => false,
    async writeTemporaryManifest(content) { writes.push(content); return temporaryPath; },
    async removeTemporaryManifest(path) { removals.push(path); }
  });

  const result = await unsaved.api.execute("kubernetes-server-dry-run", { folderPath: "C:/Project", filePath: "helm-template.yaml", content: renderedYaml });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [renderedYaml]);
  assert.equal(unsaved.commands[0].command, "kubectl apply --dry-run=server -f C:/Temp/md-editor-kubernetes-rendered.yaml");
  assert.deepEqual(removals, [temporaryPath]);
});

test("Kubernetes project commands explain missing saved manifest files", async () => {
  const missingPath = createApi({ pathExists: async () => false });
  const result = await missingPath.api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "helm-template.yaml", content: "apiVersion: v1\nkind: Service\n" });
  assert.equal(result.ok, false);
  assert.equal(missingPath.commands.length, 0);
  assert.equal(result.diagnostics[0].title, "kubectl needs a saved manifest file for this command. The active path is helm-template.yaml. Save the rendered YAML first, or use Project > Helm > Render + Server Dry Run to validate rendered Helm output without saving it.");
});

test("Kubernetes server dry-run can explicitly skip schema validation from options", async () => {
  const { api, commands } = createApi();
  const result = await api.execute("kubernetes-server-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/service.yaml", content: "apiVersion: v1\nkind: Service\n" }, { validateSchema: false });
  assert.equal(result.ok, true);
  assert.equal(commands[0].command, "kubectl apply --dry-run=server --validate=false -f C:/Project/k8s/service.yaml");
});

test("Kubernetes project commands explain OpenAPI validation failures", async () => {
  const openApiFailure = createApi({ terminal: { async runCommand() { return { exitCode: 1, stderr: "error validating data: failed to download openapi: turn validation off with --validate=false" }; } } });
  const result = await openApiFailure.api.execute("kubernetes-server-dry-run", { folderPath: "C:/Project", filePath: "C:/Project/k8s/service.yaml", content: "apiVersion: v1\nkind: Service\n" });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].title, "kubectl reached the Kubernetes API server, but the server did not provide the OpenAPI schema needed for validation. Check that the selected context points to a compatible Kubernetes cluster. You can also try Client Dry Run for local client-side validation, or rerun Server Dry Run with schema validation disabled in the options dialog.");
});

test("Kubernetes project commands explain kubectl missing path output", async () => {
  const missingPathOutput = createApi({ terminal: { async runCommand() { return { exitCode: 1, stderr: "error: the path \"helm-template.yaml\" does not exist" }; } } });
  const result = await missingPathOutput.api.execute("kubernetes-dry-run", { folderPath: "C:/Project", filePath: "helm-template.yaml", content: "apiVersion: v1\nkind: Service\n" });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].title, "kubectl needs a saved manifest file for this command. The active path is helm-template.yaml. Save the rendered YAML first, or use Project > Helm > Render + Server Dry Run to validate rendered Helm output without saving it.");
});