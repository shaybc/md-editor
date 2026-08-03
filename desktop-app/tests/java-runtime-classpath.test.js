const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadResolver(deps) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/run/java-runtime-classpath.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerJavaRuntimeClasspath({ registerModule() {} }, deps);
}

test("Standard Java runtime classpath combines output and ordered build-path entries", async () => {
  const resolver = loadResolver({
    osName: "Windows",
    buildPath: {
      getOrderedLibraryEntries() {
        return [{ path: "lib/a.jar" }, { path: "build/classes" }];
      },
      resolveStoredPath(projectPath, storedPath) { return `${projectPath}/${storedPath}`; }
    },
    compiler: {
      resolveStoredPath(projectPath, storedPath) { return `${projectPath}/${storedPath}`; }
    }
  });
  const result = await resolver.resolve("C:/Project", {
    type: "java-application",
    java: { classpathOverride: "" }
  }, {
    buildSystem: "javac",
    sourceFolders: ["src"],
    javacProfile: { outputMode: "classes", outputPath: "classes" }
  }, {});
  assert.equal(result.classpath, "C:/Project/classes;C:/Project/lib/a.jar;C:/Project/build/classes");
});

test("Gradle classpath init script emits one stable parse marker", () => {
  const resolver = loadResolver({});
  const script = resolver.createGradleInitScript();
  assert.match(script, /mdEditorPrintRuntimeClasspath/);
  assert.match(script, /MD_EDITOR_RUNTIME_CLASSPATH=/);
  assert.match(script, /sourceSets\.main\.runtimeClasspath\.asPath/);
});

test("Explicit classpath override bypasses build-tool inspection", async () => {
  const resolver = loadResolver({ osName: "Windows" });
  const result = await resolver.resolve("C:/Project", {
    type: "java-application",
    java: { classpathOverride: "C:/one;C:/two" }
  }, { buildSystem: "maven" }, {});
  assert.equal(result.classpath, "C:/one;C:/two");
  assert.deepEqual(Array.from(result.entries), ["C:/one", "C:/two"]);
});
