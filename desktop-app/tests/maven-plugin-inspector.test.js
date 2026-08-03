const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadInspector(files) {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/maven-plugin-inspector.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const normalized = new Map(Object.entries(files).map(([key, value]) => [key.replace(/\\/g, "/"), value]));
  return context.window.registerMarkdownViewerMavenPluginInspector({ registerModule() {} }, {
    filesystem: {
      async getStats(filePath) { return { isFile: normalized.has(filePath.replace(/\\/g, "/")) }; },
      async readFile(filePath) { return normalized.get(filePath.replace(/\\/g, "/")); }
    }
  });
}

test("inspector detects active Maven plugin declarations", async () => {
  const inspector = loadInspector({
    "C:/Project/pom.xml": "<project><build><plugins><plugin><groupId>org.apache.rat</groupId><artifactId>apache-rat-plugin</artifactId></plugin></plugins></build></project>"
  });

  const result = await inspector.inspect({ projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" });
  assert.equal(result.plugins[0].id, "apache-rat");
  assert.equal(result.plugins[0].declarationKind, "active-plugin");
  assert.equal(result.plugins[0].skipArgument, "-Drat.skip=true");
});

test("inspector marks pluginManagement declarations as available-only", async () => {
  const inspector = loadInspector({
    "C:/Project/pom.xml": "<project><build><pluginManagement><plugins><plugin><artifactId>maven-checkstyle-plugin</artifactId></plugin></plugins></pluginManagement></build></project>"
  });

  const result = await inspector.inspect({ projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" });
  assert.equal(result.plugins[0].id, "checkstyle");
  assert.equal(result.plugins[0].declarationKind, "plugin-management");
  assert.equal(result.plugins[0].confidence, "available-only");
});

test("inspector marks profile declarations as ambiguous", async () => {
  const inspector = loadInspector({
    "C:/Project/pom.xml": "<project><profiles><profile><build><plugins><plugin><artifactId>spotbugs-maven-plugin</artifactId></plugin></plugins></build></profile></profiles></project>"
  });

  const result = await inspector.inspect({ projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" });
  assert.equal(result.plugins[0].id, "spotbugs");
  assert.equal(result.plugins[0].declarationKind, "profile");
  assert.equal(result.plugins[0].confidence, "ambiguous");
});

test("inspector detects local parent POM declarations as inherited static plugins", async () => {
  const inspector = loadInspector({
    "C:/Project/module/pom.xml": "<project><parent><relativePath>../pom.xml</relativePath></parent></project>",
    "C:/Project/pom.xml": "<project><build><plugins><plugin><artifactId>maven-pmd-plugin</artifactId></plugin></plugins></build></project>"
  });

  const result = await inspector.inspect({ projectRoot: "C:/Project", pomPath: "C:/Project/module/pom.xml" });
  assert.equal(result.plugins[0].id, "pmd");
  assert.equal(result.plugins[0].declarationKind, "inherited-static");
});



test("inspector detects Spotless Maven plugin declarations", async () => {
  const inspector = loadInspector({
    "C:/Project/pom.xml": "<project><build><plugins><plugin><groupId>com.diffplug.spotless</groupId><artifactId>spotless-maven-plugin</artifactId></plugin></plugins></build></project>"
  });

  const result = await inspector.inspect({ projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" });
  assert.equal(result.plugins[0].id, "spotless");
  assert.equal(result.plugins[0].displayName, "Spotless");
  assert.equal(result.plugins[0].skipArgument, "-Dspotless.check.skip=true");
});
