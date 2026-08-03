const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeNode {
  constructor(name, text = "") {
    this.nodeName = name;
    this.localName = name;
    this.textContent = text;
    this.children = [];
  }
  append(child) { this.children.push(child); return child; }
}

function plugin(groupId, artifactId) {
  const node = new FakeNode("plugin");
  node.append(new FakeNode("groupId", groupId));
  node.append(new FakeNode("artifactId", artifactId));
  return node;
}

class FakeDOMParser {
  parseFromString() {
    const project = new FakeNode("project");
    const build = project.append(new FakeNode("build"));
    const management = build.append(new FakeNode("pluginManagement"));
    const managedPlugins = management.append(new FakeNode("plugins"));
    managedPlugins.append(plugin("org.owasp", "dependency-check-maven"));
    const activePlugins = build.append(new FakeNode("plugins"));
    activePlugins.append(plugin("org.apache.rat", "apache-rat-plugin"));
    return { documentElement: project, getElementsByTagName() { return []; } };
  }
}

class FakeReactorDOMParser {
  parseFromString() {
    const projects = new FakeNode("projects");
    const managedProject = projects.append(new FakeNode("project"));
    const managedBuild = managedProject.append(new FakeNode("build"));
    const management = managedBuild.append(new FakeNode("pluginManagement"));
    const managedPlugins = management.append(new FakeNode("plugins"));
    managedPlugins.append(plugin("com.github.spotbugs", "spotbugs-maven-plugin"));
    const activeProject = projects.append(new FakeNode("project"));
    const activeBuild = activeProject.append(new FakeNode("build"));
    const activePlugins = activeBuild.append(new FakeNode("plugins"));
    activePlugins.append(plugin("com.github.spotbugs", "spotbugs-maven-plugin"));
    activePlugins.append(plugin("org.owasp", "dependency-check-maven"));
    return { documentElement: projects, getElementsByTagName() { return []; } };
  }
}

class FailingDOMParser {
  parseFromString() {
    return { documentElement: new FakeNode("parsererror"), getElementsByTagName(name) { return name === "parsererror" ? [new FakeNode("parsererror")] : []; } };
  }
}

function loadParser(deps = {}) {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/effective-pom-parser.js");
  const context = { window: {}, DOMParser: deps.DOMParser };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerMavenEffectivePomParser({ registerModule() {} }, deps);
}

test("effective POM parser extracts supported active and managed plugins", () => {
  const parser = loadParser({ DOMParser: FakeDOMParser });
  const result = parser.parse("[INFO]\n<project><build></build></project>\n[INFO]");

  const rat = result.plugins.find((item) => item.id === "apache-rat");
  const dependencyCheck = result.plugins.find((item) => item.id === "dependency-check");
  assert.equal(rat.declarationKind, "active-plugin");
  assert.equal(rat.confidence, "effective");
  assert.equal(rat.skipArgument, "-Drat.skip=true");
  assert.equal(dependencyCheck.declarationKind, "plugin-management");
  assert.equal(dependencyCheck.confidence, "available-only");
});

test("effective POM parser rejects output without project XML", () => {
  const parser = loadParser({ DOMParser: FakeDOMParser });
  assert.throws(() => parser.parse("[INFO] no XML here"), /effective <project>/);
});
test("effective POM parser handles Maven reactor projects output", () => {
  const parser = loadParser({ DOMParser: FakeReactorDOMParser });
  const xml = "[INFO]\n<projects><project></project><project></project></projects>\n[INFO]";
  const result = parser.parse(xml);

  const spotbugs = result.plugins.find((item) => item.id === "spotbugs");
  const dependencyCheck = result.plugins.find((item) => item.id === "dependency-check");
  assert.equal(parser.extractProjectXml(xml), "<projects><project></project><project></project></projects>");
  assert.equal(spotbugs.declarationKind, "active-plugin");
  assert.equal(spotbugs.confidence, "effective");
  assert.equal(dependencyCheck.declarationKind, "active-plugin");
  assert.equal(dependencyCheck.confidence, "effective");
});
test("effective POM parser ignores project-prefixed tags before the real XML document", () => {
  const parser = loadParser({ DOMParser: FakeDOMParser });
  const output = [
    "<projectBuildDir>${rootDir}/tools/japicmp-output/module</projectBuildDir>",
    "<project.basedir>C:\\repo\\module</project.basedir>",
    "<project><build></build></project>",
    "[INFO] BUILD SUCCESS"
  ].join("\n");

  assert.equal(parser.extractProjectXml(output), "<project><build></build></project>");
  const result = parser.parse(output);
  assert.equal(result.plugins.find((item) => item.id === "apache-rat").confidence, "effective");
});
test("effective POM parser prefers namespaced Maven project roots in partial reactor output", () => {
  const parser = loadParser({ DOMParser: FakeReactorDOMParser });
  const xml = [
    "<projectBuildDir>${rootDir}/module</projectBuildDir>",
    "<configuration><project><groupId>not-a-root</groupId></project></configuration>",
    "<project xmlns=\"http://maven.apache.org/POM/4.0.0\"><build /></project>",
    "<!-- Effective POM for project -->",
    "<project xmlns=\"http://maven.apache.org/POM/4.0.0\"><build /></project>",
    "</projects>"
  ].join("\n");

  const extracted = parser.extractProjectXml(xml);
  assert.match(extracted, /^<projects><project xmlns=/);
  assert.equal(extracted.includes("not-a-root"), false);
  const result = parser.parse(xml);
  assert.equal(result.plugins.find((item) => item.id === "spotbugs").confidence, "effective");
});
test("effective POM parser falls back to scanning plugins when XML parsing fails", () => {
  const parser = loadParser({ DOMParser: FailingDOMParser });
  const xml = [
    "<project xmlns=\"http://maven.apache.org/POM/4.0.0\">",
    "<build>",
    "<pluginManagement><plugins><plugin><groupId>org.owasp</groupId><artifactId>dependency-check-maven</artifactId></plugin></plugins></pluginManagement>",
    "<plugins><plugin><groupId>com.github.spotbugs</groupId><artifactId>spotbugs-maven-plugin</artifactId></plugin></plugins>",
    "</build>",
    "</project>"
  ].join("\n");

  const result = parser.parse(xml);
  const dependencyCheck = result.plugins.find((item) => item.id === "dependency-check");
  const spotbugs = result.plugins.find((item) => item.id === "spotbugs");
  assert.equal(dependencyCheck.declarationKind, "plugin-management");
  assert.equal(dependencyCheck.confidence, "available-only");
  assert.equal(spotbugs.declarationKind, "active-plugin");
  assert.equal(spotbugs.confidence, "effective");
  assert.match(result.warnings[0], /lightweight scanner/);
});
test("effective POM fallback scanner defaults Maven plugin groupId before nested dependencies", () => {
  const parser = loadParser({ DOMParser: FailingDOMParser });
  const xml = [
    "<project xmlns=\"http://maven.apache.org/POM/4.0.0\">",
    "<build><plugins><plugin>",
    "<artifactId>maven-checkstyle-plugin</artifactId>",
    "<dependencies><dependency><groupId>com.puppycrawl.tools</groupId><artifactId>checkstyle</artifactId></dependency></dependencies>",
    "</plugin></plugins></build>",
    "</project>"
  ].join("\n");

  const result = parser.parse(xml);
  const checkstyle = result.plugins.find((item) => item.id === "checkstyle");
  assert.equal(checkstyle.groupId, "org.apache.maven.plugins");
  assert.equal(checkstyle.declarationKind, "active-plugin");
  assert.equal(checkstyle.confidence, "effective");
});