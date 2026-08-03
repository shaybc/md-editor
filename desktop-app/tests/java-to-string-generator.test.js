const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGenerator() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/outline/languages/java.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-class-analysis.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-to-string-generator.js"), "utf8"), context);
  const outline = context.window.registerMarkdownViewerJavaOutlineLanguage({ registerModule() {} });
  return context.window.createMarkdownViewerJavaToStringGenerator({ getOutlineLanguage: () => outline });
}

const SOURCE = [
  "public class Person {",
  "    private String name;",
  "    private int age;",
  "    private String[] tags;",
  "    private static String species;",
  "    private transient String cache;",
  "",
  "    public String displayName() { return name; }",
  "    public void reset() {}",
  "}"
].join("\n");

test("local toString analysis finds eligible fields and zero-argument value methods", () => {
  const analysis = loadGenerator().analyze(SOURCE, SOURCE.indexOf("age"));

  assert.equal(analysis.owner.name, "Person");
  assert.deepEqual(Array.from(analysis.fields, (member) => member.name), ["name", "age", "tags"]);
  assert.deepEqual(Array.from(analysis.methods, (member) => member.name), ["displayName"]);
  assert.deepEqual(Array.from(analysis.inheritedMethods, (member) => member.name), ["getClass", "hashCode", "toString"]);
  assert.equal(analysis.hasToString, false);
});

test("toString generation respects member order, comments, arrays, and concatenation", () => {
  const generator = loadGenerator();
  const analysis = generator.analyze(SOURCE, SOURCE.indexOf("age"));
  const members = [analysis.fields[1], analysis.fields[0], analysis.fields[2]];
  const insertion = generator.createInsertion(SOURCE, analysis, members, {
    generateComments: true,
    codeStyle: "concatenation",
    listArrays: true
  });
  const generated = SOURCE.slice(0, insertion.offset) + insertion.text + SOURCE.slice(insertion.offset);

  assert.match(generated, /@see java\.lang\.Object#toString\(\)/);
  assert.match(generated, /@Override\s+public String toString\(\)/);
  assert.ok(generated.indexOf("age=") < generated.indexOf("name="));
  assert.match(generated, /java\.util\.Arrays\.toString\(tags\)/);
});

test("toString generation supports builder, chained builder, format, and null skipping styles", () => {
  const generator = loadGenerator();
  const analysis = generator.analyze(SOURCE, SOURCE.indexOf("age"));
  const members = [analysis.fields[0], analysis.fields[1]];

  const generatedText = (options) => generator.createInsertion(SOURCE, analysis, members, options).text;
  assert.match(generatedText({ codeStyle: "builder" }), /StringBuilder builder/);
  assert.match(generatedText({ codeStyle: "builder-chained" }), /return new StringBuilder\(\)/);
  assert.match(generatedText({ codeStyle: "format" }), /String\.format\("Person \[name=%s, age=%s\]"/);
  assert.match(generatedText({ skipNulls: true }), /if \(name != null\).*joiner\.add/);
});

test("toString generation refuses to create a duplicate override", () => {
  const source = "class Existing { int id; public String toString() { return \"x\"; } }";
  const generator = loadGenerator();
  const analysis = generator.analyze(source, source.indexOf("id"));

  assert.equal(analysis.hasToString, true);
  assert.equal(generator.createInsertion(source, analysis, analysis.fields), null);
});
