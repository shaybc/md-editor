const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadProvider() {
  const explainerPath = path.resolve(__dirname, "../resources/js/quick-fix/maven-problem-explainer.js");
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/local-fallback-provider.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(explainerPath, "utf8"), context, { filename: explainerPath });
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const mavenProblemExplainer = context.window.registerMarkdownViewerMavenProblemExplainer(app);
  return context.window.registerMarkdownViewerLocalQuickFixProvider(app, { mavenProblemExplainer });
}

test("local Quick Fix provider recognizes RAT findings and exposes local workflow deep links", async () => {
  const provider = loadProvider();
  const diagnostic = {
    source: "maven",
    message: "Files with unapproved licenses: module/src/test/resources/snapshot"
  };
  assert.equal(provider.isRatDiagnostic(diagnostic), true);
  const actions = await provider.getActions(diagnostic);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].title, "Resolve RAT finding\u2026");
  assert.equal(actions[0].provenance, "local");
  assert.equal(actions[0].kind, "rat-manager");
  assert.equal(actions[0].execute, true);
  assert.equal(actions[0].workspaceEdit, undefined);
  assert.equal(actions[1].title, "Rebuild once with Apache RAT skipped\u2026");
  assert.equal(actions[1].provenance, "local");
  assert.equal(actions[1].kind, "maven-rebuild-with-options");
  assert.equal(actions[1].mavenBuildOptions.invocationValues["plugin.apache-rat.skip"], true);
  assert.deepEqual(Array.from(actions[1].mavenBuildOptions.requestedPluginSkips), ["apache-rat"]);
  assert.equal(actions[2].title, "Search the web for this Maven error\u2026");
  assert.equal(actions[2].kind, "maven-search-web");
});

test("local Quick Fix provider recognizes project-level Apache RAT failures", () => {
  const provider = loadProvider();
  assert.equal(provider.isRatDiagnostic({
    source: "maven",
    message: "Failed to execute goal org.apache.rat:apache-rat-plugin:0.13:check"
  }), true);
});

test("local Quick Fix provider recognizes Maven dependency resolution failures", async () => {
  const provider = loadProvider();
  const diagnostic = {
    source: "maven",
    message: "Failed to execute goal on project flink-python: Could not resolve dependencies for project org.apache.flink:flink-python:jar:2.4-SNAPSHOT: org.apache.flink:flink-core:jar:2.4-SNAPSHOT was not found in https://maven.repository.redhat.com/ga/ during a previous attempt. This failure was cached in the local repository and resolution is not reattempted until the update interval of redhat has elapsed or updates are forced"
  };
  assert.equal(provider.isMavenDependencyResolutionDiagnostic(diagnostic), true);
  const actions = await provider.getActions(diagnostic);
  assert.equal(actions.length, 5);
  assert.equal(actions[0].title, "Retry Maven with forced updates (-U)\u2026");
  assert.equal(actions[0].provenance, "local");
  assert.equal(actions[0].kind, "maven-rebuild-with-options");
  assert.equal(actions[0].mavenBuildOptions.invocationValues["dependency.force-updates"], true);
  assert.equal(actions[1].title, "Rebuild with advanced Maven options\u2026");
  assert.equal(actions[1].kind, "maven-rebuild-with-options");
  assert.equal(actions[2].title, "Inspect effective Maven configuration\u2026");
  assert.equal(actions[2].kind, "maven-inspect-effective-pom");
  assert.equal(actions[3].title, "Explain Maven dependency resolution failure\u2026");
  assert.equal(actions[3].kind, "maven-problem-explanation");
  assert.equal(actions[4].title, "Search the web for this Maven error\u2026");
  assert.equal(actions[4].kind, "maven-search-web");
});

test("local Quick Fix provider recognizes summarized Maven dependency resolution diagnostics", async () => {
  const provider = loadProvider();
  const diagnostic = {
    source: "maven",
    message: "Maven dependency resolution failed for flink-python: could not resolve 43 artifacts. First missing: org.apache.flink:flink-core:jar:2.4-SNAPSHOT. Repository: https://maven.repository.redhat.com/ga/. Maven cached the failed lookup; use -U to force updates."
  };
  assert.equal(provider.isMavenDependencyResolutionDiagnostic(diagnostic), true);
  const actions = await provider.getActions(diagnostic);
  assert.equal(actions[0].title, "Retry Maven with forced updates (-U)\u2026");
});

test("local Quick Fix provider checks original diagnostic text when row message is summarized", async () => {
  const provider = loadProvider();
  const diagnostic = {
    source: "maven",
    message: "Maven dependency resolution failed for flink-python: could not resolve 43 artifacts.",
    originalMessage: "Failed to execute goal on project flink-python: Could not resolve dependencies for project org.apache.flink:flink-python:jar:2.4-SNAPSHOT: org.apache.flink:flink-core:jar:2.4-SNAPSHOT was not found in https://maven.repository.redhat.com/ga/ during a previous attempt."
  };

  assert.equal(provider.isMavenDependencyResolutionDiagnostic(diagnostic), true);
  const actions = await provider.getActions(diagnostic);
  assert.equal(actions[0].title, "Retry Maven with forced updates (-U)\u2026");
});

test("local Quick Fix provider exposes Spotless apply before mapped Maven actions for Spotless file diagnostics", async () => {
  const provider = loadProvider();
  const diagnostic = {
    source: "maven",
    filePath: "C:/Project/flink-annotations/src/main/java/org/apache/flink/annotation/docs/ConfigGroups.java",
    message: "Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:2.43.0:check (spotless-check) on project flink-annotations: The following files had format violations: src\\main\\java\\org\\apache\\flink\\annotation\\docs\\ConfigGroups.java"
  };

  assert.equal(provider.isMavenDiagnostic(diagnostic), true);
  assert.equal(provider.isSpotlessDiagnostic(diagnostic), true);
  const actions = await provider.getActions(diagnostic);
  assert.equal(actions.length, 6);
  assert.equal(actions[0].title, "Run Spotless apply for this module\u2026");
  assert.equal(actions[0].provenance, "local");
  assert.equal(actions[0].kind, "maven-spotless-apply");
  assert.equal(actions[0].description.includes("may rewrite multiple files"), true);
  assert.equal(actions[1].title, "Rebuild once with Spotless check disabled\u2026");
  assert.equal(actions[1].provenance, "local");
  assert.equal(actions[1].kind, "maven-rebuild-with-options");
  assert.equal(actions[1].mavenBuildOptions.invocationValues["plugin.spotless.skip"], true);
  assert.deepEqual(Array.from(actions[1].mavenBuildOptions.requestedPluginSkips), ["spotless"]);
  assert.match(actions[1].description, /bypass, not a formatting fix/);
  assert.equal(actions[2].title, "Rebuild with advanced Maven options\u2026");
  assert.equal(actions[3].title, "Inspect effective Maven configuration\u2026");
  assert.equal(actions[4].title, "Explain Spotless format violations\u2026");
  assert.equal(actions[4].kind, "maven-problem-explanation");
  assert.equal(actions[5].title, "Search the web for this Maven error\u2026");
  assert.equal(actions[5].searchQuery.includes("ConfigGroups.java"), false);
});
