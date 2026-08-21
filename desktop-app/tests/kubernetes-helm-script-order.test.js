const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Kubernetes and Helm project helper scripts load before command modules", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const kubernetesContext = html.indexOf('src="js/project/kubernetes-context.js"');
  const resultParser = html.indexOf('src="js/project/kubernetes-command-result-parser.js"');
  const manifestGraph = html.indexOf('src="js/project/kubernetes-manifest-graph.js"');
  const optionsDialog = html.indexOf('src="js/project/kubernetes-command-options-dialog.js"');
  const resultModal = html.indexOf('src="js/project/project-command-result-modal.js"');
  const kubernetesCommands = html.indexOf('src="js/project/kubernetes-project-commands.js"');
  const helmDocs = html.indexOf('src="js/project/helm-authoring-docs.js"');
  const helmPreviewDialog = html.indexOf('src="js/project/helm-template-preview-dialog.js"');
  const helmCommands = html.indexOf('src="js/project/helm-project-commands.js"');

  assert.ok(kubernetesContext >= 0 && kubernetesContext < kubernetesCommands);
  assert.ok(resultParser >= 0 && resultParser < kubernetesCommands);
  assert.ok(manifestGraph >= 0 && manifestGraph < kubernetesCommands);
  assert.ok(optionsDialog >= 0 && optionsDialog < kubernetesCommands);
  assert.ok(resultModal >= 0 && resultModal < kubernetesCommands);
  assert.ok(helmDocs >= 0 && helmDocs < helmCommands);
  assert.ok(helmPreviewDialog >= 0 && helmPreviewDialog < helmCommands);
});

test("Kubernetes tool path settings are exposed and wired to command context", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const script = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");

  assert.match(html, /data-settings-tab="kubernetes"/);
  assert.match(html, /id="settings-kubernetes-helm-path"/);
  assert.match(html, /id="settings-kubernetes-kubectl-path"/);
  assert.match(html, /id="settings-kubernetes-kubeconfig-path"/);
  assert.match(html, /id="settings-kubernetes-detect-contexts"/);
  assert.match(html, /id="settings-kubernetes-context-options"/);
  assert.match(script, /kubernetesHelmPath/);
  assert.match(script, /getSetting: getKubernetesContextSetting/);
  assert.match(script, /settingsKubernetesHelmBrowseButton\?\.addEventListener/);
  assert.match(script, /detectSettingsKubernetesContexts/);
  assert.match(script, /config get-contexts -o name/);
});

test("Frameworks settings parent contains Java Maven Gradle and Kubernetes", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");

  assert.match(html, /data-settings-tab-group-toggle="frameworks"/);
  assert.match(html, /data-settings-tab-group-toggle="frameworks"[\s\S]*<i class="bi bi-boxes"[\s\S]*<span>Frameworks<\/span>[\s\S]*settings-tab-toggle-icon/);
  assert.match(html, /id="settings-frameworks-tab-group"/);
  for (const tab of ["jdks", "maven", "gradle", "kubernetes"]) {
    const pattern = new RegExp(`data-settings-tab="${tab}"[^>]*data-settings-parent-tab-group="frameworks"|data-settings-parent-tab-group="frameworks"[^>]*data-settings-tab="${tab}"`);
    assert.match(html, pattern);
  }
});

