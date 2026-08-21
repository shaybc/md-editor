const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(relativePath, exportName) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  const context = { window: {}, globalThis: {}, console, Date };
  vm.runInNewContext(source, context, { filename: relativePath });
  return context.window[exportName];
}

function createApp() {
  return { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
}

test("Run configuration store persists CRUD and active selection per project", async () => {
  const register = load("../resources/js/project/run/run-configuration-store.js", "registerMarkdownViewerRunConfigurationStore");
  const files = new Map();
  const Neutralino = {
    filesystem: {
      async createDirectory() {},
      async readFile(filePath) {
        if (!files.has(filePath)) throw new Error("missing");
        return files.get(filePath);
      },
      async writeFile(filePath, content) { files.set(filePath, content); }
    }
  };
  const store = register(createApp(), { Neutralino });
  await store.loadProject("C:/Project");
  const saved = await store.upsert({
    ...store.createDraft("java-application"),
    name: "Main",
    java: { mainClass: "example.Main" }
  });
  assert.equal(store.getActive().id, saved.id);
  assert.equal(store.getSnapshot().configurations.length, 1);
  assert.equal(store.createSequencedName("Main"), "Main 1");
  await store.upsert({ ...store.createDraft("java-application"), name: "Main 1", java: { mainClass: "example.Main" } });
  assert.equal(store.createSequencedName("Main"), "Main 2");
  const duplicate = await store.duplicate(saved.id);
  assert.equal(duplicate.name, "Copy of Main");
  assert.equal(store.getActive().id, duplicate.id);
  await store.remove(duplicate.id);
  assert.equal(store.getActive().id, saved.id);

  const document = JSON.parse(files.get(store.getPersistencePath("C:/Project")));
  assert.equal(document.version, 1);
  assert.equal(document.configurations[0].java.mainClass, "example.Main");
  assert.equal("maven" in document.configurations[0], false);

  const springMaven = store.createDraft("maven-spring-boot");
  assert.equal(springMaven.type, "maven");
  assert.equal(springMaven.maven.commandLine, "spring-boot:run");
  const springGradle = store.createDraft("gradle-spring-boot");
  assert.equal(springGradle.type, "gradle");
  assert.equal(springGradle.gradle.tasks, "bootRun");
  const composeLogs = store.createDraft("docker-compose-logs");
  assert.equal(composeLogs.type, "docker-compose");
  assert.equal(composeLogs.dockerCompose.command, "logs");
  assert.equal(composeLogs.dockerCompose.followLogs, true);
});

test("Run configuration validation reports common and type-specific fields", async () => {
  const register = load("../resources/js/project/run/run-configuration-validation.js", "registerMarkdownViewerRunConfigurationValidation");
  const validation = register(createApp(), {
    Neutralino: { filesystem: { async getStats() { return { isDirectory: true }; } } }
  });
  const result = await validation.validate({
    id: "two",
    type: "java-application",
    name: "Main",
    workingDirectory: "",
    environment: [{ name: "DUP", value: "1" }, { name: "dup", value: "2" }],
    java: { mainClass: "" }
  }, {
    projectPath: "C:/Project",
    configurations: [{ id: "one", name: "Main" }],
    runtime: { ok: false, code: "project-jdk-required" }
  });
  assert.equal(result.runnable, false);
  assert.match(result.errors.name, /unique/);
  assert.match(result.errors["java.mainClass"], /required/);
  assert.match(result.errors["java.jdkId"], /Project JDK/);
  assert.match(result.errors["environment.1.name"], /unique/);

  const composeResult = await validation.validate({
    id: "compose",
    type: "docker-compose",
    name: "Compose",
    workingDirectory: "",
    environment: [],
    dockerCompose: { command: "restart" }
  }, { projectPath: "C:/Project", configurations: [] });
  assert.equal(composeResult.runnable, false);
  assert.match(composeResult.errors["dockerCompose.command"], /Docker Compose command/);
});

test("Java main discovery ignores comments and returns qualified class names", () => {
  const register = load("../resources/js/project/run/java-main-class-finder.js", "registerMarkdownViewerJavaMainClassFinder");
  const finder = register(createApp(), {});
  const found = finder.inspectSource(`
    package example.app;
    // public static void main(String[] fake) {}
    public class Main {
      public static void main(String... args) {}
    }
  `, "C:/Project/src/example/app/Main.java", "C:/Project/src");
  assert.equal(found.className, "example.app.Main");
  assert.equal(found.simpleName, "Main");
  assert.equal(finder.inspectSource('class Fake { String text = "public static void main(String[] args)"; }', "Fake.java"), null);
});

test("Run command builder applies JDK environment and arbitrary Maven or Gradle commands", () => {
  const register = load("../resources/js/project/run/run-command-builder.js", "registerMarkdownViewerRunCommandBuilder");
  const mavenCommand = {
    buildGoalsCommand(options) { return `${options.runner} -Pdev ${options.commandLine}`; }
  };
  const gradleCommand = {
    buildTasksCommand(options) { return `${options.runner} --console=plain --no-daemon :${options.projectPath}:${options.tasks}`; }
  };
  const builder = register(createApp(), { mavenCommand, gradleCommand, osName: "Windows" });
  const runtime = { projectJdk: { path: "C:/Java/JDK 21" }, javaExecutable: "C:/Java/JDK 21/bin/java.exe" };
  const java = builder.build({
    type: "java-application",
    name: "Main",
    workingDirectory: "",
    environment: [{ name: "APP_MODE", value: "dev" }],
    java: { mainClass: "example.Main", vmArguments: "-Xmx256m", programArguments: "--port 8080" }
  }, { projectPath: "C:/Project", runtime, classpath: "C:/Project/classes;C:/lib/a.jar" });
  assert.match(java.command, /set "JAVA_HOME=C:\/Java\/JDK 21"/);
  assert.match(java.command, /example\.Main --port 8080/);
  assert.equal(java.cwd, "C:/Project");

  const maven = builder.build({
    type: "maven", name: "Package", environment: [], maven: { commandLine: "clean package", profiles: "dev" }
  }, { projectPath: "C:/Project", runtime, mavenProject: { runner: ".\\mvnw.cmd", projectRoot: "C:/Project" } });
  assert.match(maven.command, /\.\\mvnw\.cmd -Pdev clean package/);

  const gradle = builder.build({
    type: "gradle", name: "Boot", environment: [], gradle: { tasks: "bootRun", projectPath: "app" }
  }, { projectPath: "C:/Project", runtime, gradleProject: { runner: ".\\gradlew.bat", projectRoot: "C:/Project" } });
  assert.match(gradle.command, /:app:bootRun/);

  const compose = builder.build({
    type: "docker-compose", name: "Compose", workingDirectory: "", environment: [], dockerCompose: { command: "logs", filePath: "compose.yml", services: "app db", followLogs: true }
  }, { projectPath: "C:/Project" });
  assert.equal(compose.command, "docker compose -f compose.yml logs -f app db");
  assert.equal(compose.cwd, "C:/Project");
});
