const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGenerator() {
  const context = { console, window: {} };
  context.window = context;
  const outlinePath = path.resolve(__dirname, "../resources/js/outline/languages/java.js");
  const generatorPath = path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-accessor-generator.js");
  const classAnalysisPath = path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-class-analysis.js");
  vm.runInNewContext(fs.readFileSync(outlinePath, "utf8"), context, { filename: "java-outline.js" });
  vm.runInNewContext(fs.readFileSync(classAnalysisPath, "utf8"), context, { filename: "java-class-analysis.js" });
  vm.runInNewContext(fs.readFileSync(generatorPath, "utf8"), context, { filename: "java-accessor-generator.js" });
  const outline = context.window.registerMarkdownViewerJavaOutlineLanguage({ registerModule() {} });
  return context.window.createMarkdownViewerJavaAccessorGenerator({ getOutlineLanguage: () => outline });
}

test("local Java accessor analysis finds only missing accessors in the active class", () => {
  const generator = loadGenerator();
  const source = [
    "package demo;",
    "",
    "public class HelloWorld {",
    "    String name;",
    "    final int id = 0;",
    "    boolean active;",
    "",
    "    public String getName() {",
    "        return name;",
    "    }",
    "}"
  ].join("\n");

  const analysis = generator.analyze(source, source.indexOf("String name"));

  assert.equal(analysis.owner.name, "HelloWorld");
  assert.deepEqual(Array.from(analysis.fields, (field) => ({
    fieldName: field.fieldName,
    generateGetter: field.generateGetter,
    generateSetter: field.generateSetter
  })), [
    { fieldName: "name", generateGetter: false, generateSetter: true },
    { fieldName: "id", generateGetter: true, generateSetter: false },
    { fieldName: "active", generateGetter: true, generateSetter: true }
  ]);
});

test("local Java accessor generation creates an insertion before the active class closing brace", () => {
  const generator = loadGenerator();
  const source = [
    "public class HelloWorld {",
    "    static String name;",
    "    boolean active;",
    "}"
  ].join("\n");
  const analysis = generator.analyze(source, source.indexOf("active"));
  const pairedInsertion = generator.createInsertion(source, analysis.owner, analysis.fields);
  const paired = source.slice(0, pairedInsertion.offset) + pairedInsertion.text + source.slice(pairedInsertion.offset);
  assert.ok(paired.indexOf("setName(String name)") < paired.indexOf("isActive()"));
  const insertion = generator.createInsertion(source, analysis.owner, analysis.fields, {
    order: "getters-first",
    generateComments: true
  });
  const generated = source.slice(0, insertion.offset) + insertion.text + source.slice(insertion.offset);

  assert.match(generated, /public static String getName\(\)/);
  assert.match(generated, /\*\*\n     \* @return the name\n     \*\//);
  assert.match(generated, /\*\*\n     \* @param active the active to set\n     \*\//);
  assert.match(generated, /return HelloWorld\.name;/);
  assert.match(generated, /HelloWorld\.name = name;/);
  assert.match(generated, /public boolean isActive\(\)/);
  assert.match(generated, /this\.active = active;/);
  assert.ok(generated.indexOf("isActive()") < generated.indexOf("setName(String name)"));
  assert.ok(generated.indexOf("setName(String name)") < generated.indexOf("setActive(boolean active)"));
  assert.match(generated, /\n}\s*$/);
});

test("local Java accessor analysis uses the class containing the cursor", () => {
  const generator = loadGenerator();
  const source = "class Outer { int outer; class Inner { String inner; } }";
  const analysis = generator.analyze(source, source.indexOf("inner"));

  assert.equal(analysis.owner.name, "Inner");
  assert.deepEqual(Array.from(analysis.fields, (field) => field.fieldName), ["inner"]);
});
