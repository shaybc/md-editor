const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const snippetsPath = path.resolve(__dirname, "../resources/js/editor/snippets.js");

function loadSnippetRegistry() {
  const source = fs.readFileSync(snippetsPath, "utf8");
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: snippetsPath });
  return sandbox.registerMarkdownViewerSnippetRegistry._test;
}

test("snippet registry exposes editable JavaScript, TypeScript, Java, YAML, Python, and C# defaults", () => {
  const registry = loadSnippetRegistry();
  const supportedLanguageIds = registry.getSupportedLanguages().map((language) => language.id);
  const javascriptSnippets = registry.getDefaultSnippets("javascript");
  const typescriptSnippets = registry.getDefaultSnippets("typescript");
  const javaSnippets = registry.getDefaultSnippets("java");
  const yamlSnippets = registry.getDefaultSnippets("yaml");
  const pythonSnippets = registry.getDefaultSnippets("python");
  const csharpSnippets = registry.getDefaultSnippets("csharp");

  assert.equal(JSON.stringify(supportedLanguageIds), JSON.stringify(["javascript", "typescript", "java", "yaml", "python", "csharp"]));
  assert.ok(javascriptSnippets.some((snippet) => snippet.id === "function-definition"));
  assert.ok(javascriptSnippets.some((snippet) => snippet.id === "node-require"));
  assert.ok(javascriptSnippets.some((snippet) => snippet.id === "node-express-route"));
  assert.ok(typescriptSnippets.some((snippet) => snippet.id === "interface-definition"));
  assert.ok(typescriptSnippets.some((snippet) => snippet.id === "node-require"));
  assert.ok(javaSnippets.some((snippet) => snippet.id === "main-method"));
  assert.ok(javaSnippets.some((snippet) => snippet.id === "class-definition"));
  assert.ok(yamlSnippets.some((snippet) => snippet.id === "kubernetes-deployment"));
  assert.ok(yamlSnippets.some((snippet) => snippet.id === "spring-boot-kubernetes-deployment"));
  assert.ok(yamlSnippets.some((snippet) => snippet.id === "docker-compose-spring-postgres"));
  assert.ok(pythonSnippets.some((snippet) => snippet.id === "function-definition"));
  assert.ok(pythonSnippets.some((snippet) => snippet.id === "main-guard"));
  assert.ok(csharpSnippets.some((snippet) => snippet.id === "main-method"));
  assert.ok(csharpSnippets.some((snippet) => snippet.id === "property"));
  assert.ok(javascriptSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
  assert.ok(typescriptSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
  assert.ok(javaSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
  assert.ok(yamlSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
  assert.ok(pythonSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
  assert.ok(csharpSnippets.every((snippet) => typeof snippet.template === "string" && snippet.template.length > 0));
});

test("snippet registry merges overrides, disabled state, and custom snippets", () => {
  const registry = loadSnippetRegistry();
  const preferences = registry.saveSnippet(null, "javascript", {
    id: "function-definition",
    label: "fn",
    detail: "override",
    type: "function",
    template: "function ${name}() {\n\t${}\n}",
    enabled: false
  });
  const custom = registry.createCustomSnippet();
  custom.label = "log";
  custom.template = "console.log(${})";
  const withCustom = registry.saveSnippet(preferences, "javascript", custom);
  const rows = registry.getSnippetRows("javascript", withCustom);
  const overridden = rows.find((snippet) => snippet.id === "function-definition");

  assert.equal(overridden.label, "fn");
  assert.equal(overridden.enabled, false);
  assert.ok(rows.some((snippet) => snippet.id === custom.id && snippet.source === "custom"));
  assert.ok(!registry.getCompletionSnippets("javascript", withCustom).some((snippet) => snippet.id === "function-definition"));
  assert.ok(registry.getCompletionSnippets("javascript", withCustom).some((snippet) => snippet.id === custom.id));
});

test("snippet registry resets built-ins and deletes custom snippets", () => {
  const registry = loadSnippetRegistry();
  let preferences = registry.saveSnippet(null, "typescript", {
    id: "interface-definition",
    label: "iface",
    detail: "override",
    type: "keyword",
    template: "interface ${name} {\n\t${}\n}",
    enabled: true
  });
  const custom = registry.createCustomSnippet();
  preferences = registry.saveSnippet(preferences, "typescript", custom);
  preferences = registry.resetBuiltinSnippet(preferences, "typescript", "interface-definition");
  preferences = registry.deleteCustomSnippet(preferences, "typescript", custom.id);
  const rows = registry.getSnippetRows("typescript", preferences);

  assert.equal(rows.find((snippet) => snippet.id === "interface-definition").label, "interface");
  assert.ok(!rows.some((snippet) => snippet.id === custom.id));
});

test("snippet registry merges overrides and custom snippets for Java, Python, and C#", () => {
  const registry = loadSnippetRegistry();
  const javaPreferences = registry.saveSnippet(null, "java", {
    id: "main-method",
    label: "main",
    detail: "override",
    type: "function",
    template: "public static void main(String[] args) {\n\tSystem.out.println(${message});\n}",
    enabled: true
  });
  const pythonCustom = registry.createCustomSnippet();
  pythonCustom.label = "print";
  pythonCustom.template = "print(${})";
  const pythonPreferences = registry.saveSnippet(null, "python", pythonCustom);
  const csharpPreferences = registry.saveSnippet(null, "csharp", {
    id: "property",
    label: "prop",
    detail: "override",
    type: "property",
    template: "public ${Type} ${Name} { get; init; }",
    enabled: true
  });

  assert.equal(registry.getSnippetRows("java", javaPreferences).find((snippet) => snippet.id === "main-method").detail, "override");
  assert.ok(registry.getCompletionSnippets("python", pythonPreferences).some((snippet) => snippet.id === pythonCustom.id));
  assert.equal(registry.getSnippetRows("csharp", csharpPreferences).find((snippet) => snippet.id === "property").detail, "override");
});

test("snippet registry merges overrides and custom snippets for YAML", () => {
  const registry = loadSnippetRegistry();
  const preferences = registry.saveSnippet(null, "yaml", {
    id: "kubernetes-deployment",
    label: "deploy",
    detail: "override",
    type: "class",
    template: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${appName}\n",
    enabled: true
  });
  const custom = registry.createCustomSnippet();
  custom.label = "namespace";
  custom.template = "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${namespace}\n";
  const withCustom = registry.saveSnippet(preferences, "yaml", custom);

  const completionLabels = registry.getCompletionSnippets("yaml", withCustom).map((snippet) => snippet.label);

  assert.equal(registry.getSnippetRows("yaml", withCustom).find((snippet) => snippet.id === "kubernetes-deployment").detail, "override");
  assert.ok(registry.getCompletionSnippets("yaml", withCustom).some((snippet) => snippet.id === custom.id));
  assert.ok(completionLabels.includes("deployment"));
  assert.ok(completionLabels.includes("service"));
  assert.ok(completionLabels.includes("namespace"));
  assert.ok(completionLabels.includes("postgres"));
});