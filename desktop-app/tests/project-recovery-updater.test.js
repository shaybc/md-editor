const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function joinPath(folderPath, relativePath) {
  if (!folderPath) return normalizePath(relativePath);
  return normalizePath(folderPath).replace(/\/+$/, "") + "/" + normalizePath(relativePath).replace(/^\/+/, "");
}

function createFilesystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles).map(([filePath, content]) => [normalizePath(filePath), content]));
  const directories = new Set();
  for (const filePath of files.keys()) {
    let folder = normalizePath(filePath).replace(/\/[^/]+$/, "");
    while (folder && !directories.has(folder)) {
      directories.add(folder);
      const parent = folder.replace(/\/[^/]+$/, "");
      if (!parent || parent === folder) break;
      folder = parent;
    }
  }
  return {
    files,
    directories,
    Neutralino: {
      filesystem: {
        async getStats(targetPath) {
          const normalized = normalizePath(targetPath);
          if (files.has(normalized)) return { isFile: true };
          if (directories.has(normalized)) return { isDirectory: true };
          throw new Error("not found");
        },
        async readFile(targetPath) {
          const normalized = normalizePath(targetPath);
          if (!files.has(normalized)) throw new Error("not found");
          return files.get(normalized);
        },
        async writeFile(targetPath, content) {
          const normalized = normalizePath(targetPath);
          files.set(normalized, content);
          directories.add(normalized.replace(/\/[^/]+$/, ""));
        },
        async createDirectory(targetPath) {
          directories.add(normalizePath(targetPath));
        }
      }
    }
  };
}

function loadUpdaterApi(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/recovery-updater.js"), "utf8");
  const context = {
    window: {},
    console,
    Date,
    Set,
    document: {
      querySelector() {
        return null;
      },
      createElement() {
        return {
          className: "",
          setAttribute() {},
          querySelector() { return null; },
          querySelectorAll() { return []; },
          addEventListener() {},
          remove() {}
        };
      },
      body: {
        appendChild() {}
      }
    }
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerRecoveryUpdater({}, {
    Neutralino: undefined,
    joinPath,
    findGeneratedProjectFolderFromPath: async () => "",
    escapeHtml(value) {
      return String(value || "");
    },
    ...overrides
  });
}

function createContext(overrides = {}) {
  return {
    schemaVersion: 1,
    type: "md-editor-dependency-recovery-context",
    status: "pending",
    recoveryKind: "java-maven",
    generatedAt: "2026-06-19T00:00:00.000Z",
    generatedProjectRootPath: "C:/generated/project",
    sourceRootPath: "C:/source/project",
    batchPath: "C:/source/project/md-editor-missing-dependencies/fetch-missing-dependencies.bat",
    targetJarRelativeFolder: "lib/external",
    mappedDependencies: [{
      coordinateKey: "org.slf4j:slf4j-api:2.0.13",
      expectedJarFileName: "slf4j-api-2.0.13.jar",
      expectedJarRelativePath: "lib/external/slf4j-api-2.0.13.jar",
      resolvedPackages: ["org.slf4j"],
      resolvedSymbols: ["org.slf4j.Logger"],
      affectedMarkdownFiles: ["src/App.java.md"],
      missingDependencyNodeIds: ["missing:java:org.slf4j.logger"]
    }],
    unmappedPackages: ["unknown.lib"],
    ...overrides
  };
}

test("pending recovery context creates jar markdown and updates affected markdown once", async () => {
  const contextPath = "C:/generated/project/.md-editor/recovery/maven-recovery-context.json";
  const appPath = "C:/generated/project/src/App.java.md";
  const jarMdPath = "C:/generated/project/lib/external/slf4j-api-2.0.13.jar.md";
  const filesystem = createFilesystem({
    "C:/generated/project/.md-editor/_md_editor_project.json": "{}",
    [contextPath]: JSON.stringify(createContext(), null, 2),
    "C:/source/project/lib/external/slf4j-api-2.0.13.jar": "jar",
    [appPath]: [
      "---",
      "entity_type: code_file",
      "---",
      "",
      "# App",
      "",
      "## Unresolved Dependencies",
      "",
      "- `org.slf4j.Logger` (class)",
      "- `missing.Other` (class)",
      ""
    ].join("\n")
  });
  let refreshed = false;
  const api = loadUpdaterApi({
    Neutralino: filesystem.Neutralino,
    findGeneratedProjectFolderFromPath: async () => "C:/generated/project",
    onProjectUpdated: async () => {
      refreshed = true;
    }
  });

  const result = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");

  assert.equal(result.status, "applied");
  assert.equal(result.counts.jarMarkdownCreated, 1);
  assert.equal(result.counts.markdownFilesUpdated, 1);
  assert.equal(result.counts.missingDependencyReferencesRemoved, 1);
  assert.equal(result.counts.dependencyLinksAdded, 1);
  assert.equal(refreshed, true);
  assert.match(filesystem.files.get(jarMdPath), /entity_type: external_dependency/);
  const updatedMarkdown = filesystem.files.get(appPath);
  assert.doesNotMatch(updatedMarkdown, /org\.slf4j\.Logger/);
  assert.match(updatedMarkdown, /missing\.Other/);
  assert.match(updatedMarkdown, /\[slf4j-api-2\.0\.13\.jar\]\(\.\.\/lib\/external\/slf4j-api-2\.0\.13\.jar\.md\)/);
  assert.equal(JSON.parse(filesystem.files.get(contextPath)).status, "applied");

  const secondResult = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");
  assert.equal(secondResult.status, "noop");
  assert.equal(secondResult.reason, "already-applied");
});

test("missing recovered jar blocks dependency without touching markdown", async () => {
  const contextPath = "C:/generated/project/.md-editor/recovery/maven-recovery-context.json";
  const appPath = "C:/generated/project/src/App.java.md";
  const originalMarkdown = [
    "# App",
    "",
    "## Unresolved Dependencies",
    "",
    "- `org.slf4j.Logger` (class)",
    ""
  ].join("\n");
  const filesystem = createFilesystem({
    "C:/generated/project/.md-editor/_md_editor_project.json": "{}",
    [contextPath]: JSON.stringify(createContext(), null, 2),
    [appPath]: originalMarkdown
  });
  const api = loadUpdaterApi({
    Neutralino: filesystem.Neutralino,
    findGeneratedProjectFolderFromPath: async () => "C:/generated/project"
  });

  const result = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");

  assert.equal(result.status, "blocked");
  assert.equal(result.counts.jarsMissing, 1);
  assert.equal(result.blockedJars[0].expectedJarFileName, "slf4j-api-2.0.13.jar");
  assert.equal(filesystem.files.get(appPath), originalMarkdown);
  assert.equal(filesystem.files.has("C:/generated/project/lib/external/slf4j-api-2.0.13.jar.md"), false);
  const savedContext = JSON.parse(filesystem.files.get(contextPath));
  assert.equal(savedContext.status, "pending");
  assert.equal(typeof savedContext.lastAttemptAt, "string");
});

test("recovered dependency removes exact resolved symbols when package prefix is broader", async () => {
  const contextPath = "C:/generated/project/.md-editor/recovery/maven-recovery-context.json";
  const appPath = "C:/generated/project/src/App.java.md";
  const filesystem = createFilesystem({
    "C:/generated/project/.md-editor/_md_editor_project.json": "{}",
    [contextPath]: JSON.stringify(createContext({
      mappedDependencies: [{
        coordinateKey: "example:widget:1.0.0",
        expectedJarFileName: "widget-1.0.0.jar",
        expectedJarRelativePath: "lib/external/widget-1.0.0.jar",
        resolvedPackages: ["example.widgets"],
        resolvedSymbols: ["example.WidgetFactory"],
        affectedMarkdownFiles: ["src/App.java.md"],
        missingDependencyNodeIds: ["missing:example.WidgetFactory"]
      }]
    }), null, 2),
    "C:/source/project/lib/external/widget-1.0.0.jar": "jar",
    [appPath]: [
      "# App",
      "",
      "## Unresolved Dependencies",
      "",
      "- `example.WidgetFactory` (missing class, line 4)",
      "- `example.other.StillMissing` (missing class, line 5)",
      ""
    ].join("\n")
  });
  const api = loadUpdaterApi({
    Neutralino: filesystem.Neutralino,
    findGeneratedProjectFolderFromPath: async () => "C:/generated/project"
  });

  const result = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");

  assert.equal(result.status, "applied");
  assert.equal(result.counts.missingDependencyReferencesRemoved, 1);
  const updatedMarkdown = filesystem.files.get(appPath);
  assert.doesNotMatch(updatedMarkdown, /example\.WidgetFactory/);
  assert.match(updatedMarkdown, /example\.other\.StillMissing/);
  assert.match(updatedMarkdown, /\[widget-1\.0\.0\.jar\]\(\.\.\/lib\/external\/widget-1\.0\.0\.jar\.md\)/);
});

test("missing or applied context reports friendly no-op", async () => {
  const filesystem = createFilesystem({
    "C:/generated/project/.md-editor/_md_editor_project.json": "{}",
    "C:/generated/project/.md-editor/recovery/maven-recovery-context.json": JSON.stringify(createContext({ status: "applied" }), null, 2)
  });
  const api = loadUpdaterApi({ Neutralino: filesystem.Neutralino });

  const applied = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");
  const missing = await api.applyPendingRecoveryProjectUpdate("C:/other/project");

  assert.equal(applied.status, "noop");
  assert.equal(applied.reason, "already-applied");
  assert.equal(missing.status, "noop");
  assert.equal(missing.reason, "missing-context");
});

test("schema version 2 recovery creates transitive JAR pages and dependency links", async () => {
  const contextPath = "C:/generated/project/.md-editor/recovery/maven-recovery-context.json";
  const treePath = "C:/source/project/md-editor-missing-dependencies/resolved-runtime-dependency-tree.json";
  const appPath = "C:/generated/project/src/App.java.md";
  const treeSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/maven-runtime-tree.js"), "utf8");
  const treeContext = { globalThis: {} };
  vm.runInNewContext(treeSource, treeContext);
  const context = createContext({
    schemaVersion: 2,
    resolvedDependencyTreePath: treePath,
    mappedDependencies: [{
      coordinateKey: "com.fasterxml.jackson.core:jackson-databind:2.17.2",
      expectedJarFileName: "jackson-databind-2.17.2.jar",
      expectedJarRelativePath: "lib/external/jackson-databind-2.17.2.jar",
      resolvedPackages: ["com.fasterxml.jackson.databind"],
      resolvedSymbols: ["com.fasterxml.jackson.databind.ObjectMapper"],
      affectedMarkdownFiles: ["src/App.java.md"],
      missingDependencyNodeIds: []
    }]
  });
  const tree = {
    groupId: "recover",
    artifactId: "project",
    version: "1",
    type: "jar",
    children: [{
      groupId: "com.fasterxml.jackson.core",
      artifactId: "jackson-databind",
      version: "2.17.2",
      type: "jar",
      scope: "compile",
      children: [{
        groupId: "com.fasterxml.jackson.core",
        artifactId: "jackson-annotations",
        version: "2.17.2",
        type: "jar",
        scope: "compile"
      }, {
        groupId: "com.fasterxml.jackson.core",
        artifactId: "jackson-core",
        version: "2.17.2",
        type: "jar",
        scope: "compile"
      }]
    }]
  };
  const filesystem = createFilesystem({
    [contextPath]: JSON.stringify(context, null, 2),
    [treePath]: JSON.stringify(tree),
    "C:/source/project/lib/external/jackson-databind-2.17.2.jar": "jar",
    "C:/source/project/lib/external/jackson-annotations-2.17.2.jar": "jar",
    "C:/source/project/lib/external/jackson-core-2.17.2.jar": "jar",
    [appPath]: "# App\n\n## Unresolved Dependencies\n\n- `com.fasterxml.jackson.databind.ObjectMapper` (class)\n"
  });
  const api = loadUpdaterApi({
    Neutralino: filesystem.Neutralino,
    mavenRuntimeTree: treeContext.globalThis.MdEditorMavenRuntimeTree,
    findGeneratedProjectFolderFromPath: async () => "C:/generated/project"
  });

  const result = await api.applyPendingRecoveryProjectUpdate("C:/generated/project");

  assert.equal(result.status, "applied");
  assert.equal(result.counts.jarsExpected, 3);
  assert.equal(result.counts.jarMarkdownCreated, 3);
  const databindPage = filesystem.files.get(
    "C:/generated/project/lib/external/jackson-databind-2.17.2.jar.md"
  );
  assert.match(databindPage, /## Runtime Dependencies/);
  assert.match(databindPage, /\[jackson-annotations-2\.17\.2\.jar\]\(jackson-annotations-2\.17\.2\.jar\.md\)/);
  assert.match(databindPage, /\[jackson-core-2\.17\.2\.jar\]\(jackson-core-2\.17\.2\.jar\.md\)/);
  assert.match(
    filesystem.files.get("C:/generated/project/lib/external/jackson-annotations-2.17.2.jar.md"),
    /dependency_resolution: transitive/
  );
  assert.ok(filesystem.files.has(
    "C:/generated/project/.md-editor/recovery/resolved-runtime-dependencies.json"
  ));
});
