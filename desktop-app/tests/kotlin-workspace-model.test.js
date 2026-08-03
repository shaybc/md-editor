const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { detectKotlinJvmWorkspace } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-project-model.cjs");
const { resolveKotlinJvmModel, mergeExportedModel, parseMavenKotlinConfiguration, findGradleDescriptor } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-model-resolver.cjs");

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-kotlin-model-"));
}

function write(root, relative, content = "") {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test("detects mixed Kotlin/JVM source sets and ignores Gradle scripts", () => {
  const root = fixture();
  write(root, "build.gradle.kts", "plugins { kotlin(\"jvm\") version \"2.3.21\" }");
  write(root, "src/main/kotlin/sample/KotlinApi.kt", "package sample\nclass KotlinApi");
  write(root, "src/main/java/sample/JavaApi.java", "package sample; class JavaApi {}");
  write(root, "src/testFixtures/kotlin/sample/Fixture.kt", "package sample\nclass Fixture");
  const model = detectKotlinJvmWorkspace(root);
  assert.equal(model.hasKotlin, true);
  assert.equal(model.unsupported, false);
  assert.equal(model.modules[0].kind, "mixed");
  assert.deepEqual(model.modules[0].sourceSets.map((sourceSet) => sourceSet.name).sort(), ["main", "testFixtures"]);
  assert.equal(model.modules[0].kotlin.some((file) => file.endsWith("build.gradle.kts")), false);
});

test("flags Android and Kotlin Multiplatform as unsupported", () => {
  const root = fixture();
  write(root, "settings.gradle.kts", "plugins { id(\"org.jetbrains.kotlin.multiplatform\") }");
  write(root, "src/main/kotlin/App.kt", "class App");
  assert.equal(detectKotlinJvmWorkspace(root).unsupported, true);
});

test("merges exported custom Kotlin/JVM source sets", () => {
  const root = fixture();
  write(root, "build.gradle", "plugins { id 'org.jetbrains.kotlin.jvm' }");
  write(root, "src/integration/kotlin/sample/Integration.kt", "package sample\nclass Integration");
  const detected = detectKotlinJvmWorkspace(root);
  const model = mergeExportedModel(detected, [{
    projectDir: root,
    projectPath: ":",
    sourceSets: [{ name: "integration", kotlinSourceRoots: [path.join(root, "src", "integration", "kotlin")], javaSourceRoots: [] }]
  }]);
  assert.equal(model.modules[0].sourceSets[0].name, "integration");
  assert.equal(model.modules[0].sourceSets[0].kotlin.length, 1);
});

test("extracts Kotlin Maven custom source roots and compiler arguments", () => {
  const root = fixture();
  const model = parseMavenKotlinConfiguration(`
    <plugin>
      <artifactId>kotlin-maven-plugin</artifactId><version>2.3.21</version>
      <configuration><jvmTarget>17</jvmTarget><sourceDirs><sourceDir>\${project.basedir}/src/custom/kotlin</sourceDir></sourceDirs><args><arg>-Xjsr305=strict</arg></args></configuration>
    </plugin>`, root);
  assert.equal(model.kotlinPluginVersion, "2.3.21");
  assert.equal(model.sourceSets[0].kotlinSourceRoots[0], path.join(root, "src", "custom", "kotlin"));
  assert.deepEqual(model.sourceSets[0].compilerArguments, ["-Xjsr305=strict", "-jvm-target", "17"]);
});
test("uses unmanaged Java Build Path and Eclipse classpath inputs", async () => {
  const root = fixture();
  const configuredJar = write(root, "lib/configured.jar");
  const eclipseJar = write(root, "lib/eclipse.jar");
  write(root, ".classpath", "<classpath><classpathentry kind=\"src\" path=\"custom-src\"/><classpathentry kind=\"lib\" path=\"lib/eclipse.jar\"/></classpath>");
  write(root, ".md-editor/java-build-path.json", JSON.stringify({
    sourceFolders: ["configured-src"],
    jarFiles: ["lib/configured.jar"]
  }));
  write(root, "custom-src/sample/EclipseApi.kt", "package sample\nclass EclipseApi");
  write(root, "configured-src/sample/ConfiguredApi.kt", "package sample\nclass ConfiguredApi");

  const model = await resolveKotlinJvmModel({ workspaceRoot: root });
  const sourceSet = model.modules[0].sourceSets.find((entry) => entry.name === "main");
  assert.equal(sourceSet.kotlin.length, 2);
  assert.deepEqual(sourceSet.classpath.sort(), [configuredJar, eclipseJar].sort());
});

test("restricts Kotlin model resolution to Java analysis roots", async () => {
  const root = fixture();
  const includedRoot = path.join(root, "included");
  const excludedRoot = path.join(root, "excluded");
  const javaOnlyRoot = path.join(root, "java-only");
  write(root, "included/.classpath", "<classpath/>");
  write(root, "included/src/main/kotlin/Included.kt", "class Included");
  write(root, "excluded/.classpath", "<classpath/>");
  write(root, "excluded/src/main/kotlin/Excluded.kt", "class Excluded");
  write(root, "java-only/.classpath", "<classpath/>");
  write(root, "java-only/src/main/java/OnlyJava.java", "class OnlyJava {}");

  const model = await resolveKotlinJvmModel({ workspaceRoot: root, analysisRoots: [includedRoot] });
  assert.equal(model.modules.length, 1);
  assert.equal(model.modules[0].root, includedRoot);

  const noKotlin = await resolveKotlinJvmModel({ workspaceRoot: root, analysisRoots: [javaOnlyRoot] });
  assert.equal(noKotlin.hasKotlin, false);
});
test("uses Gradle's exact filtered source files and project dependencies", () => {
  const root = fixture();
  const included = write(root, "src/main/kotlin/Included.kt", "class Included");
  write(root, "src/main/kotlin/Excluded.kt", "class Excluded");
  write(root, "build.gradle", "plugins { id 'org.jetbrains.kotlin.jvm' }");
  const detected = detectKotlinJvmWorkspace(root);
  const model = mergeExportedModel(detected, [{
    projectDir: root,
    projectPath: ":sample",
    sourceSets: [{
      name: "main",
      dependsOnMain: true,
      localSourceSetDependencies: ["main", "testFixtures"],
      compilerPluginClasspath: [path.join(root, "serialization-plugin.jar")],
      kotlinSourceRoots: [path.join(root, "src", "main", "kotlin")],
      javaSourceRoots: [],
      kotlinFiles: [included],
      javaFiles: [],
      projectDependencies: [":dependency"],
      dependencyJavaSourceRoots: [path.join(root, "dependency", "src", "main", "java")]
    }]
  }]);
  assert.deepEqual(model.modules[0].sourceSets[0].kotlin, [included]);
  assert.equal(model.modules[0].sourceSets[0].dependsOnMain, true);
  assert.deepEqual(model.modules[0].sourceSets[0].localSourceSetDependencies, ["main", "testFixtures"]);
  assert.deepEqual(model.modules[0].sourceSets[0].compilerPluginClasspath, [path.join(root, "serialization-plugin.jar")]);
  assert.deepEqual(model.modules[0].sourceSets[0].projectDependencies, [":dependency"]);
  assert.deepEqual(model.modules[0].sourceSets[0].dependencyJavaSourceRoots, [path.join(root, "dependency", "src", "main", "java")]);
});
test("prefers the opened workspace Gradle root over nested builds", () => {
  const root = fixture();
  const rootSettings = write(root, "settings.gradle", "rootProject.name = 'root'");
  const nestedSettings = write(root, "nested/settings.gradle", "rootProject.name = 'nested'");
  const rootBuild = write(root, "build.gradle", "");
  assert.equal(findGradleDescriptor({
    workspaceRoot: root,
    modules: [{ descriptors: [nestedSettings, rootBuild] }]
  }), rootSettings);
});
