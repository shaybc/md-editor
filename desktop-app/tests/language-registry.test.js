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
