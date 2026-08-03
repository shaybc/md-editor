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
    "../resources/js/editor/source-actions/languages/java-equals-hashcode-generator.js"
  ].forEach((file) => vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, file), "utf8"), context));
  const outline = context.window.registerMarkdownViewerJavaOutlineLanguage({ registerModule() {} });
  return context.window.createMarkdownViewerJavaEqualsHashCodeGenerator({ getOutlineLanguage: () => outline });
}

const SOURCE = [
  "class Employee {",
  "    int id;",
  "    String name;",
  "    double salary;",
  "    int[] scores;",
  "    String[][] aliases;",
  "    static String company;",
  "}"
].join("\n");

test("equals/hashCode analysis exposes instance fields and detects existing methods", () => {
  const generator = loadGenerator();
  const analysis = generator.analyze(SOURCE, SOURCE.indexOf("name"));
  assert.deepEqual(Array.from(analysis.fields, (field) => field.name), ["id", "name", "salary", "scores", "aliases"]);
  assert.equal(analysis.hasHashCode, false);
  assert.equal(analysis.hasEquals, false);

  const existing = generator.analyze("class A { int id; public int hashCode(){return 1;} public boolean equals(Object o){return true;} }", 10);
  assert.equal(existing.hasHashCode, true);
  assert.equal(existing.hasEquals, true);
});

test("Objects generation creates comments, instanceof blocks, and array-safe equality", () => {
  const generator = loadGenerator();
  const analysis = generator.analyze(SOURCE, SOURCE.indexOf("name"));
  const insertion = generator.createInsertion(SOURCE, analysis, analysis.fields, {
    insertionPoint: "end",
    generateComments: true,
    useInstanceof: true,
    useBlocks: true,
    useObjects: true
  });
  const generated = SOURCE.slice(0, insertion.offset) + insertion.text + SOURCE.slice(insertion.offset);

  assert.match(generated, /@see java\.lang\.Object#hashCode\(\)/);
  assert.match(generated, /java\.util\.Objects\.hash\(id, name, salary\)/);
  assert.match(generated, /java\.util\.Arrays\.hashCode\(scores\)/);
  assert.match(generated, /java\.util\.Arrays\.deepHashCode\(aliases\)/);
  assert.match(generated, /if \(!\(obj instanceof Employee\)\) \{/);
  assert.match(generated, /java\.util\.Objects\.equals\(name, other\.name\)/);
  assert.match(generated, /java\.util\.Arrays\.deepEquals\(aliases, other\.aliases\)/);
  assert.match(generated, /Double\.compare\(salary, other\.salary\) == 0/);
});

test("manual generation uses exact-class checks and type-specific hashes", () => {
  const generator = loadGenerator();
  const analysis = generator.analyze(SOURCE, SOURCE.indexOf("id"));
  const text = generator.createInsertion(SOURCE, analysis, analysis.fields, {
    useInstanceof: false,
    useBlocks: false,
    useObjects: false,
    insertionPoint: "after-field:" + analysis.fields[1].id
  }).text;

  assert.match(text, /final int prime = 31;/);
  assert.match(text, /Double\.doubleToLongBits\(salary\)/);
  assert.match(text, /if \(obj == null\) return false;/);
  assert.match(text, /if \(getClass\(\) != obj\.getClass\(\)\) return false;/);
  assert.match(text, /\(name == null \? other\.name == null : name\.equals\(other\.name\)\)/);
});

test("equals/hashCode generation refuses to duplicate either existing method", () => {
  const source = "class A { int id; public int hashCode() { return 1; } }";
  const generator = loadGenerator();
  const analysis = generator.analyze(source, source.indexOf("id"));
  assert.equal(generator.createInsertion(source, analysis, analysis.fields), null);
});
