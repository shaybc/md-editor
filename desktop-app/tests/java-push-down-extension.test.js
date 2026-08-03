const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "..");

test("Java Push Down companion declares all JDT delegate commands", () => {
  const plugin = fs.readFileSync(path.join(appRoot, "language-server-extensions", "java-push-down", "src", "main", "resources", "plugin.xml"), "utf8");
  assert.match(plugin, /mdeditor\.java\.pushDown\.check/);
  assert.match(plugin, /mdeditor\.java\.pushDown\.resolve/);
  assert.match(plugin, /mdeditor\.java\.pushDown\.preview/);
  assert.match(plugin, /PushDownCommandHandler/);
});

test("desktop resources load and inject the packaged Push Down bundle", () => {
  const html = fs.readFileSync(path.join(appRoot, "resources", "index.html"), "utf8");
  const registry = fs.readFileSync(path.join(appRoot, "resources", "js", "lsp", "server-registry.js"), "utf8");
  const jar = path.join(appRoot, "resources", "language-server-extensions", "mdeditor-java-push-down.jar");
  assert.match(html, /push-down-dialog\.css/);
  assert.match(html, /push-down-dialog\.js/);
  assert.match(html, /java-push-down-actions\.js/);
  assert.match(registry, /mdeditor-java-push-down\.jar/);
  assert.equal(fs.existsSync(jar), true);
  assert.ok(fs.statSync(jar).size > 0);
});

test("Push Down preview uses the same configured processor for validation and change creation", () => {
  const service = fs.readFileSync(path.join(appRoot, "language-server-extensions", "java-push-down", "src", "main", "java", "mdeditor", "java", "pushdown", "PushDownRefactoringService.java"), "utf8");
  assert.match(service, /ProcessorBasedRefactoring refactoring = new ProcessorBasedRefactoring\(processor\)/);
  assert.match(service, /prepared\.refactoring\(\)\.checkFinalConditions/);
  assert.match(service, /prepared\.refactoring\(\)\.createChange/);
  assert.doesNotMatch(service, /new ProcessorBasedRefactoring\(prepared\.processor\(\)\)/);
});
