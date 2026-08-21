const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistration() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/kubernetes-cluster-explorer.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "kubernetes-cluster-explorer.js" });
  return context.window.registerMarkdownViewerKubernetesClusterExplorer;
}

test("Kubernetes cluster explorer lists contexts, namespaces, pods, events, and logs", async () => {
  const commands = [];
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const kubernetesContext = { buildKubectlPrefix: ({ includeNamespace, namespaceName } = {}) => includeNamespace === false ? "kubectl --context dev" : `kubectl --context dev --namespace ${namespaceName || "default"}` };
  const api = loadRegistration()(app, {
    kubernetesContext,
    terminal: {
      async runCommand(command) {
        commands.push(command);
        if (command.includes("get-contexts")) return { exitCode: 0, stdout: "dev\nprod\n" };
        if (command.includes("get namespaces")) return { exitCode: 0, stdout: "namespace/default\nnamespace/dev\n" };
        if (command.includes("get pods")) return { exitCode: 0, stdout: "NAME  READY  STATUS\napp-1  1/1  Running\n" };
        if (command.includes("get events")) return { exitCode: 0, stdout: "LAST SEEN  TYPE\n1m  Normal\n" };
        if (command.includes("logs")) return { exitCode: 0, stdout: "hello\n" };
        return { exitCode: 0, stdout: "" };
      }
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await api.listContexts())), ["dev", "prod"]);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.listNamespaces())), ["default", "dev"]);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.listPods("dev"))), [{ name: "app-1", ready: "1/1", status: "Running" }]);
  assert.equal(await api.getEvents("dev"), "LAST SEEN  TYPE\n1m  Normal\n");
  assert.equal(await api.getLogs({ name: "app-1", namespace: "dev" }), "hello\n");
  assert.ok(commands.some((command) => command.includes("--namespace dev get pods")));
});

