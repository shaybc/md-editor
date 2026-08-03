const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadExplainer() {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/maven-problem-explainer.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenProblemExplainer({ registerModule() {} });
}

test("Maven problem explainer maps Spotless format violations", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    problemType: "spotless-format",
    message: "Spotless format violation: src/main/java/org/apache/flink/annotation/docs/ConfigGroups.java",
    originalMessage: "Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:2.43.0:check (spotless-check) on project flink-annotations: The following files had format violations: C:/Users/shayg/Downloads/source_samples/flink/src/main/java/org/apache/flink/annotation/docs/ConfigGroups.java\nRun 'mvn spotless:apply' to fix these violations."
  });

  assert.equal(explanation.kind, "spotless-format");
  assert.equal(explanation.title, "Spotless format violations");
  assert.match(explanation.summary, /not a Java semantic failure/);
  assert.match(explanation.summary, /line endings/);
  assert.match(explanation.nextSteps.join("\n"), /mvn spotless:apply/);
  assert.match(explanation.nextSteps.join("\n"), /review the diff/);
  assert.equal(explanation.searchQuery.includes("C:/Users"), false);
  assert.equal(explanation.searchQuery.includes("ConfigGroups.java"), false);
});

test("Maven problem explainer maps dependency resolution cached lookup failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Maven dependency resolution failed for flink-python: could not resolve 43 artifacts. First missing: org.apache.flink:flink-core:jar:2.4-SNAPSHOT. Maven cached the failed lookup; use -U to force updates."
  });

  assert.equal(explanation.kind, "dependency-resolution");
  assert.match(explanation.summary, /cached failed lookup/);
  assert.match(explanation.searchQuery, /-U/);
  assert.equal(explanation.searchQuery.includes("flink-python"), false);
});
test("Maven problem explainer maps HTTP repository blocker failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Could not transfer artifact from/to maven-default-http-blocker: Blocked mirror for repositories: legacy-http (http://repo.example.com/maven2)"
  });

  assert.equal(explanation.kind, "http-blocker");
  assert.equal(explanation.title, "Maven HTTP repository blocked");
  assert.match(explanation.summary, /plain HTTP repository/);
});

test("Maven problem explainer maps missing project context failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "The goal you specified requires a project to execute but there is no POM in this directory. Please verify you invoked Maven from the correct directory."
  });

  assert.equal(explanation.kind, "missing-project");
  assert.match(explanation.summary, /could not find a pom.xml/);
});

test("Maven problem explainer maps Enforcer rule failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Failed to execute goal org.apache.maven.plugins:maven-enforcer-plugin:3.5.0:enforce (enforce-maven) on project sample: Some Enforcer rules have failed. Look above for specific messages explaining why the rule failed."
  });

  assert.equal(explanation.kind, "enforcer-rule");
  assert.match(explanation.summary, /mandatory project rule/);
  assert.match(explanation.nextSteps.join("\n"), /-Denforcer.skip=true/);
});

test("Maven problem explainer maps duplicate finder failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Failed to execute goal org.basepom.maven:duplicate-finder-maven-plugin:2.0.1:check: Found duplicate classes/resources in compile classpath."
  });

  assert.equal(explanation.kind, "duplicate-finder");
  assert.match(explanation.summary, /same class or resource/);
});

test("Maven problem explainer maps JaCoCo coverage failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Failed to execute goal org.jacoco:jacoco-maven-plugin:0.8.12:check: Coverage checks have not been met."
  });

  assert.equal(explanation.kind, "jacoco-coverage");
  assert.match(explanation.summary, /below the project's configured threshold/);
});

test("Maven problem explainer maps JDK internal API warnings", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Warning: sun.misc.Unsafe is internal proprietary API and may be removed in a future release"
  });

  assert.equal(explanation.kind, "jdk-internal-api-warning");
  assert.equal(explanation.title, "JDK internal API warning");
  assert.match(explanation.summary, /not part of the supported Java SE contract/);
  assert.match(explanation.nextSteps.join("\n"), /Upgrade code to supported APIs/);
});

test("Maven problem explainer maps Shade packaging collisions", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Failed to execute goal org.apache.maven.plugins:maven-shade-plugin:3.5.1:shade: Error creating shaded jar: duplicate entry: META-INF/services/java.sql.Driver"
  });

  assert.equal(explanation.kind, "shade-collision");
  assert.match(explanation.summary, /fat JAR/);
});

test("Maven problem explainer maps deploy publication failures", () => {
  const explainer = loadExplainer();
  const explanation = explainer.explain({
    source: "maven",
    message: "Failed to execute goal org.apache.maven.plugins:maven-deploy-plugin:3.1.1:deploy: Failed to deploy artifacts: Return code is: 401, ReasonPhrase: Unauthorized."
  });

  assert.equal(explanation.kind, "deploy-failure");
  assert.match(explanation.summary, /publish artifacts/);
});
