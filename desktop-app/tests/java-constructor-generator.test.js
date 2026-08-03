const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGenerator() {
  const context = { console, window: {} };
  context.window = context;
  [
    "../resources/js/outline/languages/java.js",
    "../resources/js/editor/source-actions/languages/java-class-analysis.js",
    "../resources/js/editor/source-actions/languages/java-constructor-generator.js"
  ].forEach((file) => vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, file), "utf8"), context));
  const outline = context.window.registerMarkdownViewerJavaOutlineLanguage({ registerModule() {} });
  return context.window.createMarkdownViewerJavaConstructorGenerator({ getOutlineLanguage: () => outline });
}

test("constructor analysis exposes only instance fields", () => {
  const source = "class Person {\n    private String name;\n    final int id;\n    final int fixed = 1;\n    static String species;\n}";
  const analysis = loadGenerator().analyze(source, source.indexOf("name"));

  assert.equal(analysis.owner.name, "Person");
  assert.equal(analysis.superConstructorLabel, "Object()");
  assert.deepEqual(Array.from(analysis.fields, (field) => [field.name, field.typeName]), [
    ["name", "String"],
    ["id", "int"]
  ]);
});

test("constructor generation respects field order, access, comments, super call, and insertion point", () => {
  const source = "class Person {\n    String name;\n    int id;\n\n    void work() {}\n}";
  const generator = loadGenerator();
  const analysis = generator.analyze(source, source.indexOf("name"));
  const fields = [analysis.fields[1], analysis.fields[0]];
  const insertion = generator.createInsertion(source, analysis, fields, {
    insertionPoint: "after-field:" + analysis.fields[1].id,
    accessModifier: "private",
    generateComments: true,
    omitSuper: false
  });
  const generated = source.slice(0, insertion.offset) + insertion.text + source.slice(insertion.offset);

  assert.match(generated, /@param id the id[\s\S]*@param name the name/);
  assert.match(generated, /private Person\(int id, String name\)/);
  assert.match(generated, /super\(\);/);
  assert.match(generated, /this\.id = id;[\s\S]*this\.name = name;/);
  assert.ok(generated.indexOf("private Person") < generated.indexOf("void work"));
});

test("constructor generation supports package access and omitting super()", () => {
  const source = "class Person { String name; }";
  const generator = loadGenerator();
  const analysis = generator.analyze(source, source.indexOf("name"));
  const text = generator.createInsertion(source, analysis, analysis.fields, {
    accessModifier: "package",
    omitSuper: true,
    insertionPoint: "end"
  }).text;

  assert.match(text, /\n    Person\(String name\)/);
  assert.doesNotMatch(text, /super\(\)/);
});

test("constructor generation detects an existing matching signature", () => {
  const source = "class Person { String name; Person(String name) { this.name = name; } }";
  const generator = loadGenerator();
  const analysis = generator.analyze(source, source.indexOf("String name"));

  assert.equal(generator.hasMatchingConstructor(analysis, analysis.fields), true);
  assert.equal(generator.createInsertion(source, analysis, analysis.fields), null);
});
