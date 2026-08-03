const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule(relativePath, registerName, deps = {}, globals = {}) {
  const sourcePath = path.resolve(__dirname, `../resources/js/${relativePath}`);
  const context = {
    window: { ...globals, setTimeout, clearTimeout, AbortController },
    console,
    setTimeout,
    clearTimeout,
    AbortController
  };
  context.globalThis = context.window;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window[registerName]({ registerModule() {} }, deps);
}

test("standard inventory exposes source folders instead of the repository root", () => {
  const provider = loadModule(
    "project/java-analysis-scope/standard-source-inventory.js",
    "registerMarkdownViewerStandardSourceInventory"
  );
  const inventory = provider.resolve({
    workspaceRoot: "C:/Project",
    configuration: { sourceFolders: ["src/main/java"] },
    standardJavaSourceRoots: ["C:/Project/src/test/java"]
  });

  assert.equal(inventory.kind, "standard-source-folders");
  assert.deepEqual(
    Array.from(inventory.entries, (entry) => entry.relativePath),
    ["src/main/java", "src/test/java"]
  );
  assert.equal(inventory.entries.some((entry) => entry.relativePath === "."), false);
});

test("Gradle inventory normalizes declared project paths and dependencies", () => {
  const provider = loadModule(
    "project/java-analysis-scope/gradle-module-inventory.js",
    "registerMarkdownViewerGradleModuleInventory"
  );
  const inventory = provider.parseOutput(
    `MD_EDITOR_JAVA_PROJECT_INVENTORY=${JSON.stringify([
      {
        projectPath: ":",
        name: "aggregate",
        projectDir: "C:/Project",
        javaCapable: true,
        buildRoot: true,
        sourceRoots: [],
        projectDependencies: []
      },
      {
        projectPath: ":platform",
        name: "platform",
        projectDir: "C:/Project/platform",
        javaCapable: true,
        javaPlatform: true,
        sourceRoots: [],
        projectDependencies: []
      },
      {
        projectPath: ":api",
        name: "api",
        projectDir: "C:/Project/api",
        javaCapable: true,
        sourceRoots: ["C:/Project/api/src/main/java"],
        projectDependencies: [":core", ":platform"]
      },
      {
        projectPath: ":core",
        name: "core",
        projectDir: "C:/Project/core",
        javaCapable: true,
        sourceRoots: ["C:/Project/core/src/main/java"],
        projectDependencies: []
      }
    ])}`,
    "C:/Project"
  );

  assert.deepEqual(Array.from(inventory.entries, (entry) => entry.id), ["gradle::api", "gradle::core"]);
  assert.deepEqual(Array.from(inventory.entries[0].dependencies), ["gradle::core"]);
  assert.equal(inventory.entries.some((entry) => entry.relativePath === "."), false);
  assert.equal(inventory.entries.some((entry) => entry.id === "gradle::platform"), false);
});

test("Gradle inventory primes stdin and runs without a persistent daemon", async () => {
  let invocation = null;
  const provider = loadModule(
    "project/java-analysis-scope/gradle-module-inventory.js",
    "registerMarkdownViewerGradleModuleInventory",
    {
      Neutralino: { os: { async execCommand(command, options) {
        invocation = { command, options };
        return {
          exitCode: 0,
          stdOut: `MD_EDITOR_JAVA_PROJECT_INVENTORY=${JSON.stringify([{
            projectPath: ":app", name: "app", projectDir: "C:/Project/app",
            javaCapable: true, sourceRoots: ["C:/Project/app/src/main/java"], projectDependencies: []
          }])}`
        };
      } } },
      getDesktopAppRootPath: async () => "C:/Desktop",
      getGradleInstallations: () => [{ id: "gradle-9", path: "C:/Gradle" }]
    }
  );

  const result = await provider.resolve({
    workspaceRoot: "C:/Project",
    configuration: { gradle: { mode: "installation", installationId: "gradle-9" } }
  });

  assert.match(invocation.command, /--no-daemon/);
  assert.equal(invocation.options.cwd, "C:/Project");
  assert.equal(invocation.options.stdIn, "\n");
  assert.equal(result.entries.length, 1);
});

test("Maven inventory extracts the effective project model from Maven output", () => {
  const provider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory"
  );
  const effectivePom = provider.extractEffectivePom(`
[INFO] Effective POMs, after inheritance, interpolation, and profiles are applied:
<?xml version="1.0"?>
<project><artifactId>root</artifactId><modules><module>active-child</module></modules></project>
[INFO] BUILD SUCCESS
  `);

  assert.match(effectivePom, /^<\?xml/);
  assert.match(effectivePom, /<module>active-child<\/module>/);
  assert.equal(effectivePom.includes("BUILD SUCCESS"), false);
});

function xmlNode(localName, textContent = "", children = []) {
  return {
    localName,
    textContent: textContent || children.map((child) => child.textContent).join(""),
    children
  };
}

function effectiveProject({ groupId = "org.example", artifactId, packaging = "jar", root, dependencies = [] }) {
  return xmlNode("project", "", [
    xmlNode("groupId", groupId),
    xmlNode("artifactId", artifactId),
    xmlNode("packaging", packaging),
    xmlNode("build", "", [
      xmlNode("directory", `${root}/target`),
      xmlNode("sourceDirectory", `${root}/src/main/java`),
      xmlNode("testSourceDirectory", `${root}/src/test/java`)
    ]),
    xmlNode("dependencies", "", dependencies.map((dependency) => xmlNode("dependency", "", [
      xmlNode("groupId", dependency.groupId),
      xmlNode("artifactId", dependency.artifactId)
    ])))
  ]);
}

function domParserFor(projects, malformed = false) {
  return class DOMParser {
    parseFromString() {
      return {
        documentElement: xmlNode("projects", "", projects),
        querySelector(selector) { return malformed && selector === "parsererror" ? {} : null; }
      };
    }
  };
}

test("Maven inventory resolves the full reactor with one bridge command", async () => {
  let bridgeCalls = 0;
  let execCalls = 0;
  let rendererStatsCalls = 0;
  const projects = [
    effectiveProject({ artifactId: "aggregate", packaging: "pom", root: "C:/Project" }),
    effectiveProject({ artifactId: "core", root: "C:/Project/core" }),
    effectiveProject({
      artifactId: "api",
      root: "C:/Project/api",
      dependencies: [{ groupId: "org.example", artifactId: "core" }]
    })
  ];
  const provider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory",
    {
      bridge: {
        isAvailable: () => true,
        async run(request) {
          bridgeCalls += 1;
          assert.equal(request.mode, "resolve-maven-reactor");
          return { exitCode: 0, stdout: "<projects></projects>", stderr: "" };
        }
      },
      Neutralino: {
        filesystem: { async getStats() { rendererStatsCalls += 1; return { isDirectory: false }; } },
        os: { async execCommand() { execCalls += 1; throw new Error("must not execute in renderer"); } }
      }
    },
    { DOMParser: domParserFor(projects) }
  );

  const result = await provider.resolve({
    workspaceRoot: "C:/Project",
    standardJavaSourceRoots: [
      "C:/Project/core/src/main/java",
      "C:/Project/api/src/main/java"
    ],
    scanTruncated: false
  });

  assert.equal(bridgeCalls, 1);
  assert.equal(execCalls, 0);
  assert.equal(rendererStatsCalls, 0);
  assert.deepEqual(Array.from(result.entries, (entry) => entry.id), ["maven:core", "maven:api"]);
  assert.deepEqual(Array.from(result.entries[1].dependencies), ["maven:core"]);
  assert.equal(result.entries.some((entry) => entry.aggregate), false);
});

test("Maven inventory runs from the nested POM selected by Java Build Path sources", async () => {
  const nestedRoot = "C:/Project/desktop-app/converters/java_converter";
  let detectionContext = null;
  let bridgeRequest = null;
  const provider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory",
    {
      mavenDetection: {
        async detectProject(workspaceRoot, osName, sourceFolders) {
          detectionContext = { workspaceRoot, osName, sourceFolders };
          return {
            hasPom: true,
            projectRoot: nestedRoot,
            pomPath: `${nestedRoot}/pom.xml`
          };
        }
      },
      bridge: {
        isAvailable: () => true,
        async run(request) {
          bridgeRequest = request;
          return { exitCode: 0, stdout: "<projects></projects>", stderr: "" };
        }
      },
      Neutralino: { filesystem: { async getStats() { return { isDirectory: false }; } } }
    },
    { DOMParser: domParserFor([effectiveProject({ artifactId: "java_converter", root: nestedRoot })]) }
  );

  const result = await provider.resolve({
    workspaceRoot: "C:/Project",
    configuration: {
      sourceFolders: [
        "desktop-app/converters/java_converter/src/main/java",
        "desktop-app/converters/java_converter/src/test/java"
      ]
    },
    standardJavaSourceRoots: [`${nestedRoot}/src/main/java`],
    scanTruncated: false
  });

  assert.equal(detectionContext.workspaceRoot, "C:/Project");
  assert.equal(detectionContext.osName, "Windows");
  assert.equal(detectionContext.sourceFolders.length, 2);
  assert.equal(bridgeRequest.workspaceRoot, nestedRoot);
  assert.equal(bridgeRequest.pomPath, `${nestedRoot}/pom.xml`);
  assert.deepEqual(Array.from(result.entries, (entry) => entry.relativePath), [
    "desktop-app/converters/java_converter"
  ]);
});

test("Maven inventory rejects malformed and unmappable aggregate projects", async () => {
  const malformedProvider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory",
    {
      bridge: { isAvailable: () => true, async run() { return { exitCode: 0, stdout: "<projects></projects>", stderr: "" }; } },
      Neutralino: { filesystem: { async getStats() { return { isDirectory: false }; } } }
    },
    { DOMParser: domParserFor([], true) }
  );
  await assert.rejects(
    malformedProvider.resolve({ workspaceRoot: "C:/Project" }),
    (error) => error.code === "maven-reactor-model-failed" && /parse/i.test(error.message)
  );

  const unmappableProvider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory",
    {
      bridge: { isAvailable: () => true, async run() { return { exitCode: 0, stdout: "<projects></projects>", stderr: "" }; } },
      Neutralino: { filesystem: { async getStats() { return { isDirectory: false }; } } }
    },
    { DOMParser: domParserFor([effectiveProject({ artifactId: "outside", root: "D:/Elsewhere" })]) }
  );
  await assert.rejects(
    unmappableProvider.resolve({ workspaceRoot: "C:/Project" }),
    (error) => error.code === "maven-reactor-model-failed" && /mapped safely/i.test(error.message)
  );
});

test("Maven reactor command failures retain a managed inventory failure code", async () => {
  const provider = loadModule(
    "project/java-analysis-scope/maven-module-inventory.js",
    "registerMarkdownViewerMavenModuleInventory",
    {
      bridge: {
        isAvailable: () => true,
        async run() { return { exitCode: 1, stdout: "", stderr: "Unable to resolve active profile." }; }
      }
    }
  );
  await assert.rejects(
    provider.resolve({ workspaceRoot: "C:/Project" }),
    (error) => error.code === "maven-reactor-model-failed" && /active profile/i.test(error.message)
  );
});
test("managed inventory failures remain blocking and do not fall back", async () => {
  const inventory = loadModule(
    "project/java-analysis-scope/inventory.js",
    "registerMarkdownViewerJavaAnalysisInventory",
    {
      standard: { resolve() { throw new Error("standard fallback must not run"); } },
      maven: { async resolve() { throw new Error("effective Maven model failed"); } },
      gradle: { async resolve() {
        throw Object.assign(new Error("Gradle model failed"), { code: "gradle-model-failed" });
      } }
    }
  );

  const result = await inventory.resolve({
    workspaceRoot: "C:/Project",
    configuration: { buildSystem: "gradle" }
  });
  assert.equal(result.buildSystem, "gradle");
  assert.equal(result.entries.length, 0);
  assert.match(result.error, /Gradle model failed/);
  assert.equal(result.errorCode, "gradle-model-failed");
});

test("Java workspace startup stops before runtime resolution when managed inventory fails", async () => {
  const incomplete = [];
  let runtimeResolutionCount = 0;
  const controller = loadModule(
    "lsp/java-workspace-controller.js",
    "registerMarkdownViewerJavaWorkspaceController",
    {
      workspaceModel: { async detect() { return {
        hasJavaContent: true,
        derivedRoots: [],
        analysisInventory: {
          buildSystem: "gradle",
          kind: "gradle-modules",
          entries: [],
          error: "Could not determine if stdin is a console."
        }
      }; } },
      projectRuntime: { async resolve() { runtimeResolutionCount += 1; return { ok: true }; } },
      statusManager: { setStatus() {}, unsetStatus() {} },
      analysisGenerationCoordinator: {
        beginGeneration() { return 4; },
        getState() { return { generationId: 4 }; },
        markIncomplete(value) { incomplete.push(value); }
      }
    }
  );

  const state = await controller.openWorkspace("C:/Project");

  assert.equal(state.phase, "degraded");
  assert.equal(runtimeResolutionCount, 0);
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].code, "gradle-analysis-inventory-failed");
  assert.match(incomplete[0].summary, /stdin is a console/);
});

test("JDT inventory validates standard Java source roots from the internal project", () => {
  const validator = loadModule(
    "lsp/jdt-project-scope-validator.js",
    "registerMarkdownViewerJdtProjectScopeValidator"
  );
  const result = validator.validate({
    expectedProjectRoots: ["C:/Project"],
    expectedSourceRoots: ["C:/Project/src/main/java"],
    projects: [{
      name: "jdt.ls-java-project",
      locationUri: "",
      open: true,
      accessible: true,
      javaProject: true,
      internal: true,
      sourceRoots: ["file:///C:/Project/src/main/java"]
    }]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.missingSourceRoots), []);
  assert.deepEqual(Array.from(result.validatedProjectRoots), ["C:/Project"]);
});
