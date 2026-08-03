const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "..");

test("Java Pull Up companion declares all JDT delegate commands", () => {
  const plugin = fs.readFileSync(path.join(appRoot, "language-server-extensions", "java-pull-up", "src", "main", "resources", "plugin.xml"), "utf8");
  assert.match(plugin, /mdeditor\.java\.pullUp\.check/);
  assert.match(plugin, /mdeditor\.java\.pullUp\.resolve/);
  assert.match(plugin, /mdeditor\.java\.pullUp\.preview/);
  assert.match(plugin, /PullUpCommandHandler/);
});

test("desktop resources load and inject the packaged Pull Up bundle", () => {
  const html = fs.readFileSync(path.join(appRoot, "resources", "index.html"), "utf8");
  const registry = fs.readFileSync(path.join(appRoot, "resources", "js", "lsp", "server-registry.js"), "utf8");
  const jar = path.join(appRoot, "resources", "language-server-extensions", "mdeditor-java-pull-up.jar");
  assert.match(html, /pull-up-dialog\.css/);
  assert.match(html, /pull-up-dialog\.js/);
  assert.match(html, /java-pull-up-actions\.js/);
  assert.match(registry, /mdeditor-java-pull-up\.jar/);
  assert.equal(fs.existsSync(jar), true);
  assert.ok(fs.statSync(jar).size > 0);
});

test("Pull Up preview reuses the processor's single refactoring wrapper", () => {
  const service = fs.readFileSync(path.join(appRoot, "language-server-extensions", "java-pull-up", "src", "main", "java", "mdeditor", "java", "pullup", "PullUpRefactoringService.java"), "utf8");
  assert.match(service, /ProcessorBasedRefactoring refactoring = new ProcessorBasedRefactoring\(processor\)/);
  assert.match(service, /ProcessorBasedRefactoring refactoring = prepared\.refactoring\(\)/);
  assert.doesNotMatch(service, /new ProcessorBasedRefactoring\(prepared\.processor\(\)\)/);
});