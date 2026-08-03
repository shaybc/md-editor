const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const MODULES = [
  "template-catalog.js",
  "project-specification.js",
  "generators/java-generator.js",
  "generators/python-generator.js",
  "generators/node-generator.js",
  "generators/typescript-generator.js",
  "generators/csharp-generator.js",
  "project-scaffolder.js"
];

function loadFeature(options = {}) {
  const registered = new Map();
  const context = {
    console,
    NL_OS: "Windows",
    window: {},
    globalThis: {}
  };
  context.window.NL_OS = "Windows";
  vm.createContext(context);
  for (const modulePath of MODULES) {
    const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/new-project", modulePath), "utf8");
    vm.runInContext(source, context);
  }
  const app = { registerModule(name, api) { registered.set(name, api); } };
  const catalog = context.window.registerMarkdownViewerProjectTemplateCatalog(app);
  const specification = context.window.registerMarkdownViewerProjectSpecification(app, { catalog });
  const generators = {
    java: context.window.registerMarkdownViewerNewProjectJavaGenerator(app),
    python: context.window.registerMarkdownViewerNewProjectPythonGenerator(app),
    node: context.window.registerMarkdownViewerNewProjectNodeGenerator(app),
    typescript: context.window.registerMarkdownViewerNewProjectTypeScriptGenerator(app),
    csharp: context.window.registerMarkdownViewerNewProjectCSharpGenerator(app)
  };
  const scaffolder = options.Neutralino
    ? context.window.registerMarkdownViewerProjectScaffolder(app, { Neutralino: options.Neutralino, specification })
    : null;
  return { catalog, generators, registered, scaffolder, specification };
}

function validDraft(catalog, language) {
  return {
    ...catalog.createDraft(language),
    projectName: language === "csharp" ? "HelloWorld" : "hello-world",
    parentDirectory: "C:/Projects"
  };
}

function fileMap(manifest) {
  return new Map(manifest.files.map((entry) => [entry.path, entry.content]));
}

function createMemoryNeutralino(options = {}) {
  const directories = new Set(["C:/Projects"]);
  const files = new Map();
  const commands = [];
  for (const directory of options.directories || []) directories.add(directory);
  for (const [filePath, content] of Object.entries(options.files || {})) files.set(filePath, content);
  if (options.existingTarget) directories.add("C:/Projects/hello-world");
  if (options.nonEmptyTarget) files.set("C:/Projects/hello-world/existing.txt", "existing");

  function normalize(value) {
    return String(value).replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function directChildren(directory) {
    const prefix = normalize(directory) + "/";
    const children = new Map();
    for (const pathValue of directories) {
      if (!pathValue.startsWith(prefix)) continue;
      const remaining = pathValue.slice(prefix.length);
      if (remaining && !remaining.includes("/")) children.set(remaining, "DIRECTORY");
    }
    for (const pathValue of files.keys()) {
      if (!pathValue.startsWith(prefix)) continue;
      const remaining = pathValue.slice(prefix.length);
      if (remaining && !remaining.includes("/")) children.set(remaining, "FILE");
    }
    return Array.from(children, ([entry, type]) => ({ entry, type }));
  }

  const Neutralino = {
    filesystem: {
      async getStats(pathValue) {
        const value = normalize(pathValue);
        if (directories.has(value)) return { isDirectory: true, isFile: false };
        if (files.has(value)) return { isDirectory: false, isFile: true };
        throw new Error("not found");
      },
      async readDirectory(pathValue) {
        if (!directories.has(normalize(pathValue))) throw new Error("not found");
        return directChildren(pathValue);
      },
      async createDirectory(pathValue) {
        directories.add(normalize(pathValue));
      },
      async writeFile(pathValue, content) {
        if (options.failWrite && String(pathValue).endsWith(options.failWrite)) throw new Error("simulated write failure");
        files.set(normalize(pathValue), content);
      },
      async readBinaryFile(pathValue) {
        return files.get(normalize(pathValue));
      },
      async writeBinaryFile(pathValue, content) {
        files.set(normalize(pathValue), content);
      },
      async remove(pathValue) {
        const value = normalize(pathValue);
        files.delete(value);
        directories.delete(value);
        for (const candidate of Array.from(files.keys())) if (candidate.startsWith(value + "/")) files.delete(candidate);
        for (const candidate of Array.from(directories)) if (candidate.startsWith(value + "/")) directories.delete(candidate);
      }
    },
    os: {
      async execCommand(command, commandOptions) {
        commands.push({ command, options: commandOptions });
        if (options.failGit && command === "git init") return { exitCode: 1, stdErr: "simulated Git failure" };
        return { exitCode: 0, stdOut: command === "git --version" ? "git version 2" : "" };
      }
    }
  };
  return { Neutralino, commands, directories, files };
}

test("catalog exposes exactly the five first-class runnable languages", () => {
  const { catalog } = loadFeature();
  assert.deepEqual(Array.from(catalog.list(), (entry) => entry.id), ["java", "python", "node", "typescript", "csharp"]);
});

test("catalog supplies a value for every required template field", () => {
  const { catalog, specification } = loadFeature();
  for (const template of catalog.list()) {
    const draft = catalog.createDraft(template.id);
    assert.equal(draft.projectName, "hello-world");
    for (const field of template.fields.filter((candidate) => (
      candidate.required && candidate.type !== "jdk" && specification.isFieldVisible(candidate, draft)
    ))) {
      assert.notEqual(String(draft[field.id] ?? "").trim(), "", `${template.id}.${field.id} should have a default`);
    }
  }
});

test("project specification rejects unsafe roots, invalid identifiers, and malformed dependencies", () => {
  const { catalog, specification } = loadFeature();
  assert.match(specification.validate({ ...validDraft(catalog, "java"), projectJdkId: "jdk-21", sourceFolder: "../src" }).error, /relative paths/);
  assert.match(specification.validate({ ...validDraft(catalog, "python"), packageName: "not-valid" }).error, /package name/);
  assert.match(specification.validate({ ...validDraft(catalog, "python"), virtualEnvironment: "../outside" }).error, /Virtual environment/);
  assert.match(specification.validate({ ...validDraft(catalog, "node"), packageName: "UPPER" }).error, /npm package/);
  assert.match(specification.validate({
    ...validDraft(catalog, "java"),
    projectJdkId: "jdk-21",
    projectType: "maven",
    dependencies: "broken"
  }).error, /group:artifact/);
});

test("Java generator covers standard, Maven, Gradle Groovy, and Gradle Kotlin projects", () => {
  const { catalog, generators, specification } = loadFeature();
  const base = { ...validDraft(catalog, "java"), projectJdkId: "jdk-21", projectJdkFeature: 21 };

  const standard = generators.java.createManifest(specification.normalize(base));
  const standardFiles = fileMap(standard);
  assert.ok(standardFiles.has("src/main/java/com/example/helloworld/Main.java"));
  assert.equal(JSON.parse(standardFiles.get(".md-editor/java-build-path.json")).buildSystem, "javac");

  const maven = fileMap(generators.java.createManifest(specification.normalize({
    ...base,
    projectType: "maven",
    sourceFolder: "source/main",
    testFolder: "source/test",
    dependencies: "org.example:sample:1.2.3:test"
  })));
  assert.match(maven.get("pom.xml"), /<sourceDirectory>source\/main<\/sourceDirectory>/);
  assert.match(maven.get("pom.xml"), /<scope>test<\/scope>/);

  const groovy = fileMap(generators.java.createManifest(specification.normalize({ ...base, projectType: "gradle", gradleDsl: "groovy" })));
  assert.ok(groovy.has("build.gradle"));
  assert.match(groovy.get("build.gradle"), /JavaLanguageVersion\.of\(21\)/);

  const kotlin = fileMap(generators.java.createManifest(specification.normalize({ ...base, projectType: "gradle", gradleDsl: "kotlin" })));
  assert.ok(kotlin.has("build.gradle.kts"));
  assert.match(kotlin.get("settings.gradle.kts"), /rootProject\.name/);
});

test("Python, Node.js, TypeScript, and C# generators produce runnable descriptors and entry points", () => {
  const { catalog, generators, specification } = loadFeature();
  const python = fileMap(generators.python.createManifest(specification.normalize(validDraft(catalog, "python"))));
  assert.ok(python.has("pyproject.toml"));
  assert.match(python.get("src/hello_world/main.py"), /Hello, world!/);

  const node = fileMap(generators.node.createManifest(specification.normalize(validDraft(catalog, "node"))));
  assert.equal(JSON.parse(node.get("package.json")).scripts.start, "node src/index.js");
  assert.ok(node.has(".nvmrc"));

  const typescript = fileMap(generators.typescript.createManifest(specification.normalize(validDraft(catalog, "typescript"))));
  assert.equal(JSON.parse(typescript.get("tsconfig.json")).compilerOptions.strict, true);
  assert.ok(typescript.has("src/index.ts"));

  const csharp = fileMap(generators.csharp.createManifest(specification.normalize(validDraft(catalog, "csharp"))));
  assert.ok(csharp.has("HelloWorld.csproj"));
  assert.match(csharp.get("Program.cs"), /Console\.WriteLine/);
});

test("scaffolder creates common metadata in a new project and initializes Git when selected", async () => {
  const memory = createMemoryNeutralino();
  const { catalog, generators, scaffolder, specification } = loadFeature({ Neutralino: memory.Neutralino });
  const validation = specification.validate({ ...validDraft(catalog, "node"), initializeGit: true });
  assert.equal(validation.valid, true);
  const generated = generators.node.createManifest(validation.specification);
  const prepared = await scaffolder.prepare(validation.specification, generated);
  assert.equal(prepared.directories.includes(".gitignor"), false);
  assert.equal(prepared.directories.includes("AGENTS.m"), false);
  assert.equal(prepared.directories.includes("README.m"), false);
  const result = await scaffolder.create(validation.specification, prepared);

  assert.equal(result.projectPath, "C:/Projects/hello-world");
  assert.ok(memory.files.has("C:/Projects/hello-world/README.md"));
  assert.ok(memory.files.has("C:/Projects/hello-world/AGENTS.md"));
  assert.equal(JSON.parse(memory.files.get("C:/Projects/hello-world/.md-editor/project.json")).type, "md-editor-project");
  assert.deepEqual(memory.commands.map((entry) => entry.command), ["git --version", "git init"]);
});

test("scaffolder rejects generated path traversal and collisions before writing", async () => {
  const memory = createMemoryNeutralino();
  const { catalog, scaffolder, specification } = loadFeature({ Neutralino: memory.Neutralino });
  const project = specification.validate(validDraft(catalog, "node")).specification;
  const generated = {
    files: [{ path: "src/index.js", content: "one" }, { path: "src/index.js", content: "two" }],
    copyDirectories: [],
    entryFile: "src/index.js",
    sourceFolders: ["src"],
    testFolders: ["test"],
    runtime: {},
    settings: {},
    prerequisites: "Node.js",
    buildCommand: "node --check src/index.js",
    runCommand: "node src/index.js",
    ignore: [],
    agentRules: []
  };
  await assert.rejects(scaffolder.prepare(project, generated), /collision/);
  generated.files = [{ path: "../outside.js", content: "unsafe" }];
  await assert.rejects(scaffolder.prepare(project, generated), /unsafe/);
  assert.equal(memory.directories.has("C:/Projects/hello-world"), false);
});

test("scaffolder refuses non-empty targets and rolls back only newly created content", async () => {
  const nonEmpty = createMemoryNeutralino({ existingTarget: true, nonEmptyTarget: true });
  let feature = loadFeature({ Neutralino: nonEmpty.Neutralino });
  let validation = feature.specification.validate(validDraft(feature.catalog, "node"));
  let prepared = await feature.scaffolder.prepare(validation.specification, feature.generators.node.createManifest(validation.specification));
  await assert.rejects(feature.scaffolder.create(validation.specification, prepared), /must be empty/);
  assert.equal(nonEmpty.files.get("C:/Projects/hello-world/existing.txt"), "existing");

  const failed = createMemoryNeutralino({ existingTarget: true, failWrite: "README.md" });
  feature = loadFeature({ Neutralino: failed.Neutralino });
  validation = feature.specification.validate(validDraft(feature.catalog, "node"));
  prepared = await feature.scaffolder.prepare(validation.specification, feature.generators.node.createManifest(validation.specification));
  await assert.rejects(feature.scaffolder.create(validation.specification, prepared), /simulated write failure/);
  assert.ok(failed.directories.has("C:/Projects/hello-world"));
  assert.equal(Array.from(failed.files.keys()).some((entry) => entry.startsWith("C:/Projects/hello-world/")), false);
});

test("Git initialization failure rolls back generated files and preserves an existing empty target", async () => {
  const memory = createMemoryNeutralino({ existingTarget: true, failGit: true });
  const { catalog, generators, scaffolder, specification } = loadFeature({ Neutralino: memory.Neutralino });
  const validation = specification.validate({ ...validDraft(catalog, "node"), initializeGit: true });
  const prepared = await scaffolder.prepare(validation.specification, generators.node.createManifest(validation.specification));
  await assert.rejects(scaffolder.create(validation.specification, prepared), /Git failure/);
  assert.ok(memory.directories.has("C:/Projects/hello-world"));
  assert.equal(Array.from(memory.files.keys()).some((entry) => entry.startsWith("C:/Projects/hello-world/")), false);
});

test("Java Eclipse settings are previewed and copied recursively without sibling metadata", async () => {
  const memory = createMemoryNeutralino({
    directories: ["C:/Eclipse", "C:/Eclipse/.settings", "C:/Eclipse/.settings/nested"],
    files: {
      "C:/Eclipse/.settings/org.eclipse.jdt.core.prefs": new Uint8Array([1, 2, 3]),
      "C:/Eclipse/.settings/nested/tool.prefs": new Uint8Array([4, 5]),
      "C:/Eclipse/.project": new Uint8Array([9])
    }
  });
  const { catalog, generators, scaffolder, specification } = loadFeature({ Neutralino: memory.Neutralino });
  const validation = specification.validate({
    ...validDraft(catalog, "java"),
    projectJdkId: "jdk-21",
    eclipseSettingsEnabled: true,
    eclipseSettingsSource: "C:/Eclipse/.settings"
  });
  assert.equal(validation.valid, true);
  const prepared = await scaffolder.prepare(validation.specification, generators.java.createManifest(validation.specification));
  assert.ok(prepared.files.some((entry) => entry.path === ".settings/org.eclipse.jdt.core.prefs"));
  assert.ok(prepared.files.some((entry) => entry.path === ".settings/nested/tool.prefs"));
  assert.equal(prepared.files.some((entry) => entry.path === ".project"), false);

  await scaffolder.create(validation.specification, prepared);
  assert.deepEqual(memory.files.get("C:/Projects/hello-world/.settings/org.eclipse.jdt.core.prefs"), new Uint8Array([1, 2, 3]));
  assert.equal(memory.files.has("C:/Projects/hello-world/.project"), false);
});
