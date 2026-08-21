const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    window: {},
    app: {
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

test("language registry detects Docker-related file names", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);

  assert.equal(registry.resolveLanguageForPath("C:/Project/Dockerfile")?.id, "dockerfile");
  assert.equal(registry.resolveLanguageForPath("C:\\Project\\Dockerfile.dev")?.id, "dockerfile");
  assert.equal(registry.resolveLanguageForPath("C:/Project/app.Dockerfile")?.id, "dockerfile");
  assert.equal(registry.resolveLanguageForPath("C:/Project/docker-compose.yml")?.id, "yaml");

  const dockerignore = registry.resolveLanguageForPath("C:/Project/.dockerignore");
  assert.equal(dockerignore?.id, "dockerignore");
  assert.equal(dockerignore?.codeMirrorLanguage, "text");
});

test("language registry adds Kubernetes metadata to YAML manifests", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);
  const pathManifest = registry.resolveLanguageForPath("C:/Project/k8s/deployment.yaml");
  const contentManifest = registry.resolveLanguageForPath("C:/Project/config.yaml", {
    content: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: app\n"
  });
  const compose = registry.resolveLanguageForPath("C:/Project/manifests/docker-compose.yml", {
    content: "apiVersion: v1\nkind: ConfigMap\nservices:\n  app:\n    image: nginx\n"
  });
  const generic = registry.resolveLanguageForPath("C:/Project/settings.yaml", {
    content: "name: app\nsettings:\n  enabled: true\n"
  });

  assert.equal(pathManifest?.id, "yaml");
  assert.equal(pathManifest?.codeMirrorLanguage, "yaml");
  assert.equal(pathManifest?.formatter, "prettier-yaml");
  assert.equal(pathManifest?.variantId, "kubernetes");
  assert.equal(pathManifest?.variantLabel, "Kubernetes");
  assert.equal(contentManifest?.variantId, "kubernetes");
  assert.equal(compose?.id, "yaml");
  assert.equal(compose?.variantId, undefined);
  assert.equal(generic?.id, "yaml");
  assert.equal(generic?.variantId, undefined);
  assert.equal(registry.isKubernetesYamlManifest("C:/Project/kubernetes/service.yml", ""), true);
  assert.equal(registry.isKubernetesYamlManifest("C:/Project/docker-compose.yml", "apiVersion: v1\nkind: Service\n"), false);
});
test("language registry colors MD-Editor debug logs as C#", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);

  assert.equal(registry.resolveLanguageForPath("C:/temp/md-editor-debug.log")?.codeMirrorLanguage, "csharp");
  assert.equal(registry.resolveLanguageForPath("C:/temp/md-editor-debug-1.log")?.codeMirrorLanguage, "csharp");
  assert.equal(registry.resolveLanguageForPath("C:/temp/application.log")?.id, "log");
});

test("language registry detects common text-based project files", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);
  assert.equal(registry.setSupportedTextExtensions("md java xml txt"), true);

  assert.equal(registry.resolveLanguageForPath("C:/Project/.classpath")?.codeMirrorLanguage, "xml");
  assert.equal(registry.resolveLanguageForPath("C:/Project/.project")?.codeMirrorLanguage, "xml");
  assert.equal(registry.resolveLanguageForPath("C:/Project/TracingAspect.aj")?.codeMirrorLanguage, "java");
  assert.equal(registry.resolveLanguageForPath("C:/Project/.sdkmanrc")?.codeMirrorLanguage, "text");
  assert.equal(registry.resolveLanguageForPath("C:/Project/service.proto")?.codeMirrorLanguage, "text");
  assert.equal(registry.resolveLanguageForPath("C:/Project/.TestExecutionListener")?.codeMirrorLanguage, "text");
  assert.equal(registry.resolveLanguageForPath("C:/Project/template.ftl")?.codeMirrorLanguage, "text");
});

test("language registry treats Mermaid files as Markdown-backed diagrams", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);
  const mermaid = registry.resolveLanguageForPath("C:/Project/architecture.mermaid");

  assert.equal(mermaid?.id, "mermaid");
  assert.equal(mermaid?.codeMirrorLanguage, "markdown");
  assert.equal(mermaid?.icon, "bi-diagram-2");
  assert.equal(mermaid?.formatter, "");
});

test("language registry supports editable extension list", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);

  assert.equal(registry.resolveLanguageForPath("C:/Project/app.js")?.id, "javascript");
  assert.equal(registry.resolveLanguageForPath("C:/Project/App.java")?.formatter, "prettier-java");
  assert.deepEqual(Array.from(registry.normalizeSupportedTextExtensions(".foo, JS\nfoo invalid!")), ["foo", "js"]);

  assert.equal(registry.setSupportedTextExtensions("md foo"), true);
  assert.equal(registry.resolveLanguageForPath("C:/Project/app.js"), null);
  assert.equal(registry.resolveLanguageForPath("C:/Project/readme.md")?.id, "markdown");
  assert.equal(registry.resolveLanguageForPath("C:/Project/diagram.mermaid")?.id, "mermaid");
  assert.equal(registry.resolveLanguageForPath("C:/Project/data.foo")?.id, "text");
  assert.equal(registry.getSupportedTextExtensions().includes("foo"), true);
  assert.equal(registry.setSupportedTextExtensions("invalid!"), false);
});

test("language registry classifies configurable file opening mode types", () => {
  const context = createContext();
  vm.runInContext(readWebFile("js/languages/registry.js"), context);

  const registry = context.window.registerMarkdownViewerLanguageRegistry(context.app);

  assert.deepEqual(
    JSON.parse(JSON.stringify(registry.classifyOpeningModeSource(null))),
    { key: "untitled", label: "Untitled / new document", languageLabel: "New file", defaultMode: "editor" }
  );
  assert.equal(registry.classifyOpeningModeSource({ name: "notes.md" }).key, "extension:md");
  assert.equal(registry.classifyOpeningModeSource({ name: "notes.md" }).defaultMode, "split");
  assert.equal(registry.classifyOpeningModeSource({ name: "index.html" }).defaultMode, "split");
  assert.equal(registry.classifyOpeningModeSource({ name: "App.java" }).defaultMode, "editor");
  assert.equal(registry.classifyOpeningModeSource({ name: "README" }).key, "special:readme");
  assert.equal(registry.classifyOpeningModeSource({ name: "CHANGELOG" }).defaultMode, "split");
  assert.equal(registry.classifyOpeningModeSource({ name: "Dockerfile.dev" }).key, "special:dockerfile");
  assert.equal(registry.classifyOpeningModeSource({ name: "pom.xml" }).key, "extension:pom.xml");
  assert.equal(registry.classifyOpeningModeSource({ name: "build.gradle.kts" }).key, "extension:gradle.kts");
  assert.equal(registry.classifyOpeningModeSource({ name: "LICENSE.custom" }).key, "extension:custom");
  assert.equal(registry.classifyOpeningModeSource({ name: "NOTICE" }).key, "other");

  const types = registry.getOpeningModeFileTypes("foo md");
  assert.equal(types.some((type) => type.key === "extension:foo" && type.languageLabel === "Custom text"), true);
  assert.equal(types.some((type) => type.key === "extension:js"), true);
  assert.equal(types.some((type) => type.key === "special:license"), true);
  assert.equal(types.find((type) => type.key === "extension:markdown")?.defaultMode, "split");
});

