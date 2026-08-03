const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGenerator() {
  const context = { window: {} };
  context.globalThis = context.window;
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/source-actions/languages/java-method-javadoc.js"), "utf8"),
    context,
    { filename: "java-method-javadoc.js" }
  );
  return context.window.createMarkdownViewerJavaMethodJavadoc();
}

test("method Javadoc is generated from the active record method signature", () => {
  const generator = loadGenerator();
  const source = [
    "record AnalysisResult(java.util.List<String> sources) {",
    "  int localDependencyCount() {",
    "    return sources.size();",
    "  }",
    "}"
  ].join("\n");
  const result = generator.createInsertion(source, source.indexOf("return sources"));

  assert.equal(result.status, "ready");
  assert.equal(result.methodName, "localDependencyCount");
  assert.equal(result.offset, source.indexOf("  int localDependencyCount"));
  assert.equal(result.text, [
    "  /**",
    "   * Returns the result of {@code localDependencyCount}.",
    "   *",
    "   * @return the result of {@code localDependencyCount}",
    "   */",
    ""
  ].join("\n"));
});

test("method Javadoc includes type parameters, arguments, return, and declared throws", () => {
  const generator = loadGenerator();
  const source = [
    "class Sample {",
    "  @Deprecated",
    "  public <T extends Number> java.util.List<T> convert(",
    "      @Named(\"items\") final java.util.List<T> values, String... labels",
    "  ) throws java.io.IOException, IllegalStateException {",
    "    return values;",
    "  }",
    "}"
  ].join("\n");
  const result = generator.createInsertion(source, source.indexOf("return values"));

  assert.equal(result.status, "ready");
  assert.equal(result.offset, source.indexOf("  @Deprecated"));
  assert.match(result.text, /@param <T> the T type parameter/);
  assert.match(result.text, /@param values the values value/);
  assert.match(result.text, /@param labels the labels value/);
  assert.match(result.text, /@return the result of \{@code convert\}/);
  assert.match(result.text, /@throws java\.io\.IOException if the method cannot complete/);
  assert.match(result.text, /@throws IllegalStateException if the method cannot complete/);
});

test("void methods omit return documentation", () => {
  const generator = loadGenerator();
  const source = "interface Work {\n  void run(String value);\n}";
  const result = generator.createInsertion(source, source.indexOf("run"));

  assert.equal(result.status, "ready");
  assert.match(result.text, /Performs \{@code run\}/);
  assert.match(result.text, /@param value/);
  assert.doesNotMatch(result.text, /@return/);
});

test("existing Javadoc is preserved", () => {
  const generator = loadGenerator();
  const source = "class Sample {\n  /** Already documented. */\n  @Deprecated\n  int value() { return 1; }\n}";
  const result = generator.createInsertion(source, source.indexOf("return 1"));

  assert.equal(result.status, "existing");
  assert.equal(result.methodName, "value");
});

test("constructors, lambdas, invocations, and non-method locations are rejected", () => {
  const generator = loadGenerator();
  const source = [
    "class Sample {",
    "  Sample() {}",
    "  Runnable task = () -> run();",
    "  void run() {}",
    "}"
  ].join("\n");

  assert.equal(generator.createInsertion(source, source.indexOf("Sample()")).status, "no-method");
  assert.equal(generator.createInsertion(source, source.indexOf("() ->")).status, "no-method");
  assert.equal(generator.createInsertion(source, source.indexOf("class Sample")).status, "no-method");
});
