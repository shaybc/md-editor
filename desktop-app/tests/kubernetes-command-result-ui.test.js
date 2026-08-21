const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule(file) {
  const source = fs.readFileSync(path.resolve(__dirname, `../resources/js/project/${file}`), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: file });
  return context.window;
}

test("Kubernetes command result parser identifies OpenAPI and missing tool failures", () => {
  const loaded = loadModule("kubernetes-command-result-parser.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const parser = loaded.registerMarkdownViewerKubernetesCommandResultParser(app);

  const openApi = parser.parse({ tool: "kubectl", exitCode: 1, stderr: "failed to download openapi: turn validation off with --validate=false" });
  assert.equal(openApi[0].title, "The selected server is not a Kubernetes API server");

  const missingHelm = parser.parse({ tool: "helm", exitCode: 1, stderr: "'helm' is not recognized" });
  assert.equal(missingHelm[0].title, "Helm is not installed");
});

test("Kubernetes manifest graph extracts field-aware resources and references", () => {
  const loaded = loadModule("kubernetes-manifest-graph.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const graph = loaded.registerMarkdownViewerKubernetesManifestGraph(app);
  const model = graph.buildFromYaml([
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    "  name: app-config",
    "---",
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: web",
    "spec:",
    "  template:",
    "    spec:",
    "      containers:",
    "      - envFrom:",
    "        - configMapRef:",
    "            name: app-config",
    ""
  ].join("\n"));

  const deployment = model.nodes.find((node) => node.label === "Deployment/web");
  const configMap = model.nodes.find((node) => node.label === "ConfigMap/app-config");
  const reference = model.edges.find((edge) => edge.label === "references" && edge.to === configMap.id);

  assert.equal(model.schemaVersion, 1);
  assert.ok(deployment);
  assert.ok(configMap);
  assert.ok(reference);
  assert.equal(reference.sourcePath, "spec.template.spec.containers[].envFrom[].configMapRef.name");
  assert.equal(reference.targetPath, "metadata.name");
  assert.ok(reference.sourceFieldId);
  assert.ok(reference.targetFieldId);
  assert.ok(deployment.fields.some((field) => field.id === reference.sourceFieldId));
  assert.ok(configMap.fields.some((field) => field.id === reference.targetFieldId));
});

test("Kubernetes manifest graph keeps Helm source comments as node file refs", () => {
  const loaded = loadModule("kubernetes-manifest-graph.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const graph = loaded.registerMarkdownViewerKubernetesManifestGraph(app);
  const model = graph.buildFromYaml([
    "# Source: hello-world/templates/deployment.yaml",
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: web",
    "",
  ].join("\n"), { sourceRefs: [{ kind: "chart", label: "Chart root", path: "C:/charts/hello-world" }] });

  const deployment = model.nodes.find((node) => node.label === "Deployment/web");

  assert.equal(deployment.fileRef, "hello-world/templates/deployment.yaml");
  assert.equal(model.sourceRefs[0].path, "C:/charts/hello-world");
});
test("Kubernetes manifest graph extracts exact field paths for topology relationships", () => {
  const loaded = loadModule("kubernetes-manifest-graph.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const graph = loaded.registerMarkdownViewerKubernetesManifestGraph(app);
  const model = graph.buildFromYaml([
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    "  name: web",
    "spec:",
    "  selector:",
    "    app: web",
    "---",
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: web",
    "spec:",
    "  serviceAccountName: web-sa",
    "  template:",
    "    metadata:",
    "      labels:",
    "        app: web",
    "    spec:",
    "      containers:",
    "      - name: web",
    "        envFrom:",
    "        - secretRef:",
    "            name: web-secret",
    "        volumeMounts:",
    "        - name: data",
    "          mountPath: /data",
    "      volumes:",
    "      - name: data",
    "        persistentVolumeClaim:",
    "          claimName: web-data",
    "---",
    "apiVersion: networking.k8s.io/v1",
    "kind: Ingress",
    "metadata:",
    "  name: web",
    "spec:",
    "  rules:",
    "  - http:",
    "      paths:",
    "      - backend:",
    "          service:",
    "            name: web",
    "---",
    "apiVersion: rbac.authorization.k8s.io/v1",
    "kind: RoleBinding",
    "metadata:",
    "  name: web-binding",
    "subjects:",
    "- kind: ServiceAccount",
    "  name: web-sa",
    "roleRef:",
    "  apiGroup: rbac.authorization.k8s.io",
    "  kind: Role",
    "  name: web-role",
    ""
  ].join("\n"));

  const selection = model.edges.find((edge) => edge.from.endsWith("/Service/web") && edge.to.endsWith("/Deployment/web/pod-template") && edge.label === "selects");
  const ingress = model.edges.find((edge) => edge.from.endsWith("/Ingress/web") && edge.to.endsWith("/Service/web") && edge.label === "routes to");
  const secret = model.edges.find((edge) => edge.to.endsWith("/Secret/web-secret"));
  const pvc = model.edges.find((edge) => edge.to.endsWith("/PersistentVolumeClaim/web-data"));
  const roleSubject = model.edges.find((edge) => edge.from.endsWith("/RoleBinding/web-binding") && edge.to.endsWith("/ServiceAccount/web-sa"));

  assert.equal(selection.sourcePath, "spec.selector");
  assert.equal(selection.targetPath, "metadata.labels");
  assert.ok(selection.sourceFieldId);
  assert.ok(selection.targetFieldId);
  assert.equal(ingress.sourcePath, "spec.rules[].http.paths[].backend.service.name");
  assert.equal(ingress.targetPath, "metadata.name");
  assert.match(secret.sourcePath, /secretRef.name/);
  assert.equal(pvc.sourcePath, "spec.template.spec.volumes[].persistentVolumeClaim.claimName");
  assert.equal(roleSubject.sourcePath, "subjects[].name");
  assert.equal(roleSubject.targetPath, "metadata.name");
  assert.ok(Array.isArray(model.warnings));
});

test("Kubernetes result modal delegates to the field-aware topology renderer", () => {
  const modalSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/project-command-result-modal.js"), "utf8");
  const rendererSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/kubernetes-topology-renderer.js"), "utf8");
  assert.match(modalSource, /topologyRenderer.render/);
  assert.match(rendererSource, /project-command-topology-forge/);
  assert.match(rendererSource, /project-command-topology-forge-node-row/);
  assert.match(rendererSource, /sourceFieldId/);
  assert.match(rendererSource, /targetFieldId/);
  assert.match(rendererSource, /getElementOffsetWithin/);
  assert.match(rendererSource, /getPortPoint/);
  assert.match(rendererSource, /scheduleLinkRedraw/);
  assert.match(rendererSource, /kubernetes-topology-redraw/);
  assert.match(rendererSource, /pointerdown/);
  assert.match(rendererSource, /setPointerCapture/);
  assert.match(rendererSource, /openInTab/);
  assert.match(rendererSource, /dblclick/);
  assert.match(rendererSource, /resolveNodeSourcePath/);
  assert.match(rendererSource, /openNodeSourceFile/);
  assert.match(rendererSource, /mountTopologyTab/);
  assert.match(rendererSource, /resetInitialViewportPosition/);
  assert.match(rendererSource, /Select a node or relationship to inspect it/);
});

test("Kubernetes topology can open as a managed tab", () => {
  const modalSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/project-command-result-modal.js"), "utf8");
  const tabsSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/index.js"), "utf8");
  const viewManagerSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/view-manager.js"), "utf8");
  const scriptSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");

  assert.match(modalSource, /kubernetes-topology-redraw/);
  assert.match(modalSource, /openKubernetesTopologyInTab/);
  assert.ok(modalSource.includes("openPath: deps.openPath"));
  assert.ok(modalSource.includes("sourceRefs: result.sourceRefs"));
  assert.match(tabsSource, /createKubernetesTopologyTab/);
  assert.match(tabsSource, /openKubernetesTopologyInTab/);
  assert.match(tabsSource, /let tab = isTemporary \? findTemporaryTab\(\) : null/);
  assert.match(tabsSource, /tabs\.splice\(tabIndex, 1, replacementTab\)/);
  assert.match(tabsSource, /markKubernetesTopologyTabDirty/);
  assert.match(viewManagerSource, /mountTopologyTab/);
  assert.match(scriptSource, /openKubernetesTopologyInTab/);
  assert.ok(scriptSource.includes("registerMarkdownViewerKubernetesTopologyRenderer?.(app, {"));
  assert.ok(scriptSource.includes("openDocumentSourceFile({ name: getFileName(path), path, sourceFilePath: path }"));
});

test("Kubernetes topology documents serialize and validate saveable graph state", () => {
  const loaded = loadModule("kubernetes-topology-document.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const documents = loaded.registerMarkdownViewerKubernetesTopologyDocument(app, { getFileName: (filePath) => path.basename(filePath || "") });
  const graph = {
    schemaVersion: 1,
    nodes: [{ id: "n1", kind: "Deployment", name: "web", fields: [{ id: "f1", path: "metadata.name", value: "web" }] }],
    edges: [{ from: "n1", to: "n1", sourceFieldId: "f1", targetFieldId: "f1", sourcePath: "metadata.name", targetPath: "metadata.name" }],
    warnings: [],
    sourceRefs: [{ path: "deployment.yaml" }]
  };
  const tab = {
    title: "Helm Topology",
    kubernetesTopology: { graph, result: { tool: "helm", commandName: "template", exitCode: 0 }, manifestContent: "kind: Deployment" },
    kubernetesTopologyLayout: { positions: { n1: { x: 12, y: 34 } }, scale: 1.25 }
  };

  const document = documents.serializeKubernetesTopologyTab(tab);
  assert.equal(document.documentType, "kubernetes-topology-view");
  assert.equal(document.sourceRefs[0].path, "deployment.yaml");
  assert.equal(document.layout.positions.n1.x, 12);
  assert.equal(documents.validateKubernetesTopologyDocument(document), true);
  assert.equal(documents.deserializeKubernetesTopologyDocument(document).graph.nodes[0].fields[0].path, "metadata.name");
  assert.equal(documents.isKubernetesTopologyFilePath("web.mdviewer-k8s-topology.json"), true);
});

test("Kubernetes topology document open forwards temporary tab options", async () => {
  const loaded = loadModule("kubernetes-topology-document.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  let receivedOptions = null;
  const documents = loaded.registerMarkdownViewerKubernetesTopologyDocument(app, {
    getFileName: (filePath) => path.basename(filePath || ""),
    openKubernetesTopologyInTab(_graph, _result, options) {
      receivedOptions = options;
      return { type: "kubernetes-topology" };
    },
    saveTabsToStorage() {},
    tabs: []
  });
  const sourceDocument = {
    documentType: "kubernetes-topology-view",
    schemaVersion: 1,
    title: "Saved Topology",
    topology: { nodes: [], edges: [], warnings: [] },
    layout: { positions: {} },
    manifestSnapshot: ""
  };

  const tab = await documents.openSavedKubernetesTopologyDocument({
    name: "saved.mdviewer-k8s-topology.json",
    path: "C:/vault/saved.mdviewer-k8s-topology.json",
    content: JSON.stringify(sourceDocument)
  }, { temporary: true, pinExisting: false });

  assert.equal(tab.type, "kubernetes-topology");
  assert.equal(receivedOptions.temporary, true);
  assert.equal(receivedOptions.pinExisting, false);
  assert.equal(receivedOptions.sourceFilePath, "C:/vault/saved.mdviewer-k8s-topology.json");
});
test("Kubernetes topology Save As uses the topology JSON document flow", () => {
  const scriptSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");
  const saveSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/files/save.js"), "utf8");

  assert.ok(scriptSource.includes('await kubernetesTopologyDocument?.saveKubernetesTopologyTabWithSaveDialog?.(activeTab);'));
  assert.ok(saveSource.includes('tab.type !== "graph" && tab.type !== "kubernetes-topology"'));
  assert.ok(saveSource.includes('tab.type === "graph" || tab.type === "kubernetes-topology" || (!tab.sourceFileHandle && !tab.sourceFilePath)'));
  assert.ok(saveSource.includes('tab.type === "graph" || tab.type === "kubernetes-topology") return false;'));
});
