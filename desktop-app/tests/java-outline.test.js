const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadJavaOutline() {
  const context = { window: {} };
  context.globalThis = context.window;
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/outline/languages/java.js"), "utf8");
  vm.runInContext(source, context, { filename: "java.js" });
  return context.window.registerMarkdownViewerJavaOutlineLanguage({ registerModule() {} });
}

function flatten(nodes) {
  return nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
}

test("Java outline extracts source-ordered packages, types, fields, constructors, and methods", () => {
  const adapter = loadJavaOutline();
  const nodes = adapter.parse(`package demo.app;
    public class Sample<T> {
      private final String name = create("ignored");
      int left, right;
      public Sample(String name) { this.name = name; }
      @Deprecated public <R> R convert(java.util.List<R> values) throws Exception { return null; }
      interface Nested { void run(); }
    }
    record Point(int x, int y) {}
    enum Mode { FAST(1), SLOW(2); private final int code; Mode(int code) { this.code = code; } }
  `);
  const entries = flatten(nodes);

  assert.equal(JSON.stringify(entries.map((node) => `${node.kind}:${node.name}`)), JSON.stringify([
    "package:demo.app", "class:Sample", "field:name", "field:left", "field:right",
    "constructor:Sample(String name)", "method:convert(java.util.List <R> values)",
    "interface:Nested", "method:run()", "record:Point", "field:x", "field:y", "enum:Mode",
    "enum-member:FAST", "enum-member:SLOW", "field:code", "constructor:Mode(int code)"
  ]));
  assert.equal(JSON.stringify(entries.find((node) => node.name === "convert(java.util.List <R> values)").selectionRange.start), JSON.stringify({ line: 5, character: 31 }));
});

test("Java outline ignores comments, literals, anonymous classes, lambdas, and local variables", () => {
  const adapter = loadJavaOutline();
  const nodes = adapter.parse(`class Real {
    // class Fake { void nope() {} }
    String text = "interface NotReal {}";
    String block = """
      record Hidden() {}
    """;
    Runnable task = new Runnable() { public void run() {} };
    java.util.function.Supplier<String> supplier = () -> "class Nope {}";
    void method() { int local = 1; class Local {} }
  }`);
  const entries = flatten(nodes);

  assert.equal(JSON.stringify(entries.map((node) => `${node.kind}:${node.name}`)), JSON.stringify([
    "class:Real", "field:text", "field:block", "field:task", "field:supplier", "method:method()"
  ]));
});

test("Java outline normalizes LSP symbols and preserves the parsed package root", () => {
  const adapter = loadJavaOutline();
  const range = { start: { line: 1, character: 6 }, end: { line: 3, character: 1 } };
  const nodes = adapter.normalizeDocumentSymbols([{ name: "Example", kind: 5, range, selectionRange: range, children: [{ name: "run()", kind: 6, range }] }], "package demo;\nclass Example { void run() {} }");

  assert.equal(nodes[0].kind, "package");
  assert.equal(nodes[0].name, "demo");
  assert.equal(nodes[0].children[0].kind, "class");
  assert.equal(nodes[0].children[0].children[0].kind, "method");
});

test("Java outline keeps useful declarations while a type body is incomplete", () => {
  const adapter = loadJavaOutline();
  const entries = flatten(adapter.parse("class Editing { private String value; void run() {"));

  assert.equal(JSON.stringify(entries.map((node) => `${node.kind}:${node.name}`)), JSON.stringify([
    "class:Editing", "field:value", "method:run()"
  ]));
});
