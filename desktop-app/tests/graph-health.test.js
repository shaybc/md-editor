const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGraphHealthApi(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/health.js"), "utf8");
  const context = {
    window: {},
    alert() {},
    document: {
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      createElement() {
        return {
          className: "",
          dataset: {},
          innerHTML: "",
          append() {},
          appendChild() {},
          addEventListener() {},
          set textContent(value) { this._textContent = value; },
          get textContent() { return this._textContent || ""; }
        };
      }
    },
    console,
    Map,
    Set,
    Number,
    String
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGraphHealth({}, {
    graphHealthPanel: null,
    graphViewToolbar: null,
    tabs: [],
    activeFolderPath: "",
    getActiveGraphTab() { return null; },
    createGraphTab() { return null; },
    switchTab() {},
    saveTabsToStorage() {},
    saveCurrentFileIfChanged() {},
    updateSaveCurrentFileButtons() {},
    openDocumentSourceFile() {},
    openGraphNodeFileInPermanentTab() {},
    copyTextToSystemClipboard() {},
    saveAs() {},
    getFileName(value) {
      return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
    },
    escapeHtml(value) {
      return String(value || "");
    },
    joinPath(dirPath, fileName) {
      if (!dirPath) return fileName;
      return String(dirPath).replace(/[\\/]+$/, "") + "/" + String(fileName || "").replace(/^[\\/]+/, "");
    },
    isAbsoluteFilesystemPath(value) {
      const sourcePath = String(value || "");
      return /^[a-zA-Z]:[\\/]/.test(sourcePath) || /^\\\\/.test(sourcePath) || sourcePath.startsWith("/");
    },
    ...overrides
  });
}

function readGraphHealthSource() {
  return fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/health.js"), "utf8");
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\n    function ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

function loadGraphPackageSummaryApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/package-summary.js"), "utf8");
  const context = {
    window: {},
    console,
    Map,
    Set,
    Date,
    JSON,
    alert() {}
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGraphPackageSummary({}, {
    copyTextToSystemClipboard() {},
    saveAs() {},
    escapeHtml(value) {
      return String(value || "");
    }
  });
}

test("grouped subpackage usage panels hide when collapsed", () => {
  const styles = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  assert.match(styles, /\.graph-health-group-child-usages\.hidden\s*\{\s*display:\s*none;/);
});

test("Maven recovery notification requires explicit close controls", () => {
  const modalSource = extractFunctionSource(readGraphHealthSource(), "openMavenRecoveryNotificationModal");

  assert.doesNotMatch(modalSource, /event\.target\s*===\s*overlay/);
  assert.doesNotMatch(modalSource, /event\.key\s*===\s*["']Escape["']/);
  assert.match(modalSource, /maven-recovery-notification-close/);
  assert.match(modalSource, /maven-recovery-ok/);
});

test("Maven recovery details table requires explicit close controls", () => {
  const modalSource = extractFunctionSource(readGraphHealthSource(), "openMavenRecoveryTableModal");

  assert.doesNotMatch(modalSource, /event\.target\s*===\s*overlay/);
  assert.doesNotMatch(modalSource, /event\.key\s*===\s*["']Escape["']/);
  assert.match(modalSource, /maven-recovery-table-close/);
});

test("missing dependency health returns an empty summary without a snapshot", () => {
  const api = loadGraphHealthApi();

  assert.deepEqual(JSON.parse(JSON.stringify(api.aggregateMissingDependencies(null))), {
    missingCount: 0,
    affectedFileCount: 0,
    affectedFiles: [],
    rows: []
  });
});

test("missing dependency health groups references by dependency", () => {
  const api = loadGraphHealthApi();
  const summary = api.aggregateMissingDependencies({
    nodes: [
      { id: "src/a.java", type: "file", label: "A" },
      { id: "src/b.java", type: "file", label: "B" },
      { id: "missing:com.foo.client", type: "missing-dependency", qualifiedName: "com.foo.Client", label: "Client", missingKind: "class", language: "java" },
      { id: "missing:org.slf4j.logger", type: "missing-dependency", qualifiedName: "org.slf4j.Logger", label: "Logger", missingKind: "class", language: "java" }
    ],
    links: [
      { source: "src/a.java", target: "missing:org.slf4j.logger", type: "missing-dependency" },
      { source: "src/b.java", target: "missing:org.slf4j.logger", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:com.foo.client", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:com.foo.client", type: "missing-dependency" }
    ],
    files: [
      {
        id: "src/a.java",
        name: "A.java.md",
        path: "src/A.java.md",
        originalSourcePath: "C:\\workspace\\src\\A.java",
        originalSourceName: "A.java",
        unresolvedDependencies: [
          { symbol: "org.slf4j.Logger", line: 12 },
          { symbol: "com.foo.Client", line: 20 }
        ]
      },
      {
        id: "src/b.java",
        name: "B.java.md",
        path: "src/B.java.md",
        unresolvedDependencies: [{ symbol: "org.slf4j.Logger", line: 8 }]
      }
    ]
  });

  assert.equal(summary.missingCount, 2);
  assert.equal(summary.affectedFileCount, 2);
  assert.equal(summary.affectedFiles.length, 2);
  assert.equal(summary.affectedFiles[0].fileId, "src/a.java");
  assert.deepEqual(JSON.parse(JSON.stringify(summary.affectedFiles[0].dependencies)), ["com.foo.Client", "org.slf4j.Logger"]);
  assert.equal(summary.affectedFiles[0].dependencyCount, 2);
  assert.equal(summary.affectedFiles[0].referenceCount, 2);
  assert.equal(summary.affectedFiles[1].fileId, "src/b.java");
  assert.equal(summary.affectedFiles[1].dependencyCount, 1);
  assert.equal(summary.rows[0].qualifiedName, "org.slf4j.Logger");
  assert.equal(summary.rows[0].affectedFileCount, 2);
  assert.equal(summary.rows[0].referenceCount, 2);
  assert.equal(summary.rows[0].usages[0].line, 12);
  assert.equal(summary.rows[0].usages[0].markdown.name, "A.java.md");
  assert.equal(summary.rows[0].usages[0].original.name, "A.java");
  assert.equal(summary.rows[0].usages[0].original.path, "C:\\workspace\\src\\A.java");
  assert.equal(summary.rows[1].qualifiedName, "com.foo.Client");
  assert.equal(summary.rows[1].affectedFileCount, 1);
  assert.equal(summary.rows[1].referenceCount, 2);
});

test("missing dependency health falls back to markdown usage when original source is missing", () => {
  const api = loadGraphHealthApi();
  const summary = api.aggregateMissingDependencies({
    nodes: [
      { id: "src/a.java", type: "file" },
      { id: "missing:org.slf4j.logger", type: "missing-dependency", qualifiedName: "org.slf4j.Logger" }
    ],
    links: [
      { source: "src/a.java", target: "missing:org.slf4j.logger", type: "missing-dependency" }
    ],
    files: [
      {
        id: "src/a.java",
        name: "A.java.md",
        path: "src/A.java.md",
        unresolvedDependencies: [{ symbol: "org.slf4j.Logger", line: 8 }]
      }
    ]
  });

  assert.equal(summary.rows[0].usages[0].original.name, "A.java.md");
  assert.equal(summary.rows[0].usages[0].original.path, "src/A.java.md");
});

test("missing dependency health ignores generated report files as affected files", () => {
  const api = loadGraphHealthApi();
  const summary = api.aggregateMissingDependencies({
    nodes: [
      { id: "src/a.java", type: "file", qualifiedName: "app.A" },
      { id: ".md-editor/missing_dependencies_report.md", type: "file", label: "missing_dependencies_report.md" },
      { id: "missing:org.w3c.dom.document", type: "missing-dependency", qualifiedName: "org.w3c.dom.Document" }
    ],
    links: [
      { source: "src/a.java", target: "missing:org.w3c.dom.document", type: "missing-dependency" },
      { source: ".md-editor/missing_dependencies_report.md", target: "missing:org.w3c.dom.document", type: "missing-dependency" }
    ],
    files: [
      {
        id: "src/a.java",
        name: "A.java.md",
        path: "src/A.java.md",
        unresolvedDependencies: [{ symbol: "org.w3c.dom.Document", line: 8 }]
      },
      {
        id: ".md-editor/missing_dependencies_report.md",
        name: "missing_dependencies_report.md",
        path: ".md-editor/missing_dependencies_report.md",
        fullPath: "C:/generated/src/.md-editor/missing_dependencies_report.md",
        unresolvedDependencies: [{ symbol: "org.w3c.dom.Document", line: 1 }]
      }
    ]
  });

  assert.equal(summary.affectedFileCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.affectedFiles.map((file) => file.fileId))), ["src/a.java"]);
  assert.equal(summary.rows[0].affectedFileCount, 1);
  assert.equal(summary.rows[0].referenceCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.rows[0].usages.map((usage) => usage.fileId))), ["src/a.java"]);
});

test("health report file opens keep the owning graph tab context after active tab changes", () => {
  const healthTab = { id: "health-tab", graphSnapshot: { files: [{ id: "src/a.java" }] } };
  const openedFileTab = { id: "opened-file" };
  const api = loadGraphHealthApi({
    tabs: [healthTab, openedFileTab],
    getActiveGraphTab() {
      return openedFileTab;
    }
  });
  const button = {
    dataset: { graphTabId: "health-tab" },
    closest() {
      return null;
    }
  };

  assert.equal(api.getHealthReportOpenContextTab(button), healthTab);
});

test("missing dependency health orders ties by reference count then name", () => {
  const api = loadGraphHealthApi();
  const summary = api.aggregateMissingDependencies({
    nodes: [
      { id: "src/a.java", type: "file" },
      { id: "missing:zeta", type: "missing-dependency", qualifiedName: "zeta.Missing" },
      { id: "missing:alpha", type: "missing-dependency", qualifiedName: "alpha.Missing" },
      { id: "missing:beta", type: "missing-dependency", qualifiedName: "beta.Missing" }
    ],
    links: [
      { source: "src/a.java", target: "missing:zeta", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:alpha", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:beta", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:beta", type: "missing-dependency" }
    ],
    files: [{ id: "src/a.java", name: "A.java.md", path: "src/A.java.md" }]
  });

  assert.deepEqual(summary.rows.map((row) => row.qualifiedName), [
    "beta.Missing",
    "alpha.Missing",
    "zeta.Missing"
  ]);
});

test("missing dependency health sorts table rows by selected header", () => {
  const api = loadGraphHealthApi();
  const rows = [
    { qualifiedName: "zeta.Missing", kind: "class", language: "java", affectedFileCount: 2, referenceCount: 9 },
    { qualifiedName: "alpha.Missing", kind: "package", language: "python", affectedFileCount: 4, referenceCount: 4 },
    { qualifiedName: "beta.Missing", kind: "class", language: "javascript", affectedFileCount: 1, referenceCount: 7 }
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.sortMissingDependencyRows(rows, "dependency", "asc").map((row) => row.qualifiedName))),
    ["alpha.Missing", "beta.Missing", "zeta.Missing"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.sortMissingDependencyRows(rows, "affected", "desc").map((row) => row.qualifiedName))),
    ["alpha.Missing", "zeta.Missing", "beta.Missing"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.sortMissingDependencyRows(rows, "references", "asc").map((row) => row.qualifiedName))),
    ["alpha.Missing", "beta.Missing", "zeta.Missing"]
  );
});

test("missing dependency health filters rows by dependency metadata and grouped children", () => {
  const api = loadGraphHealthApi();
  const rows = [
    { qualifiedName: "picocli.CommandLine", kind: "3 symbols", language: "java", children: [{ qualifiedName: "picocli.CommandLine.Option", kind: "class", language: "java" }] },
    { qualifiedName: "org.w3c.dom", kind: "4 symbols", language: "java", children: [{ qualifiedName: "org.w3c.dom.Document", kind: "class", language: "java" }] },
    { qualifiedName: "requests.sessions", kind: "package", language: "python" }
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.filterMissingDependencyRows(rows, "option").map((row) => row.qualifiedName))),
    ["picocli.CommandLine"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.filterMissingDependencyRows(rows, "python").map((row) => row.qualifiedName))),
    ["requests.sessions"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.filterMissingDependencyRows(rows, "missing").map((row) => row.qualifiedName))),
    []
  );
});

test("missing dependency health groups nested subpackages under the shared root", () => {
  const api = loadGraphHealthApi();
  const rows = [
    { qualifiedName: "picocli.CommandLine", kind: "class", language: "java", affectedFileCount: 3, referenceCount: 3, usages: [{ fileId: "a" }, { fileId: "b" }, { fileId: "c" }] },
    { qualifiedName: "picocli.CommandLine.Command", kind: "class", language: "java", affectedFileCount: 2, referenceCount: 2, usages: [{ fileId: "a" }, { fileId: "b" }] },
    { qualifiedName: "picocli.CommandLine.Option", kind: "class", language: "java", affectedFileCount: 2, referenceCount: 2, usages: [{ fileId: "a" }, { fileId: "b" }] },
    { qualifiedName: "org.w3c.dom.Document", kind: "class", language: "java", affectedFileCount: 1, referenceCount: 1, usages: [{ fileId: "a" }] },
    { qualifiedName: "org.w3c.dom.Node", kind: "class", language: "java", affectedFileCount: 1, referenceCount: 1, usages: [{ fileId: "b" }] }
  ];

  const grouped = api.groupMissingDependencyRows(rows);
  const picocli = grouped.find((row) => row.qualifiedName === "picocli.CommandLine");
  const dom = grouped.find((row) => row.qualifiedName === "org.w3c.dom");

  assert.equal(picocli.isGroup, true);
  assert.equal(picocli.affectedFileCount, 3);
  assert.equal(picocli.referenceCount, 7);
  assert.deepEqual(
    JSON.parse(JSON.stringify(picocli.children.map((row) => row.qualifiedName))),
    ["picocli.CommandLine", "picocli.CommandLine.Command", "picocli.CommandLine.Option"]
  );
  assert.equal(dom.isGroup, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(dom.children.map((row) => row.qualifiedName))),
    ["org.w3c.dom.Document", "org.w3c.dom.Node"]
  );
});

test("missing dependency health context menu class list uses grouped child names", () => {
  const api = loadGraphHealthApi();
  const group = {
    qualifiedName: "picocli.CommandLine",
    isGroup: true,
    children: [
      { qualifiedName: "picocli.CommandLine.Option" },
      { qualifiedName: "picocli.CommandLine" },
      { qualifiedName: "picocli.CommandLine.Command" },
      { qualifiedName: "picocli.CommandLine.Option" }
    ]
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getMissingDependencyContextClassNames(group))),
    ["picocli.CommandLine", "picocli.CommandLine.Command", "picocli.CommandLine.Option"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getMissingDependencyContextClassNames({ qualifiedName: "missing.Client" }))),
    ["missing.Client"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getMissingDependencyContextClassNames(
      { qualifiedName: "app.unused.Unused" },
      [
        { qualifiedName: "app.unused.Helper" },
        { qualifiedName: "app.unused.Unused" },
        { qualifiedName: "app.StaticUtil" }
      ]
    ))),
    ["app.unused.Helper", "app.unused.Unused"]
  );
});

test("missing dependency health context menu copies dependent class names", () => {
  const api = loadGraphHealthApi();
  const rows = [
    {
      qualifiedName: "org.w3c.dom.Document",
      usages: [
        { dependentClassName: "com.mdeditor.ProjectScanner" },
        { original: { path: "C:/workspace/src/main/java/com/mdeditor/Main.java", name: "Main.java" } }
      ]
    },
    {
      qualifiedName: "org.w3c.dom.Element",
      usages: [
        { markdown: { path: "src/ProjectScanner.java.md", name: "ProjectScanner.java.md" } },
        { dependentClassName: "com.mdeditor.ProjectScanner" }
      ]
    },
    {
      qualifiedName: "app.unused.Unused",
      usages: [
        { original: { path: "src/test/java/app/UnusedTest.java", name: "UnusedTest.java" } }
      ]
    }
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getMissingDependencyContextDependentClassNames({ qualifiedName: "org.w3c.dom" }, rows))),
    ["com.mdeditor.Main", "com.mdeditor.ProjectScanner", "ProjectScanner"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getMissingDependencyContextDependentClassNames({ qualifiedName: "app.unused.Unused" }, rows))),
    ["app.UnusedTest"]
  );
});

test("missing dependency health resolves relative markdown paths from the active folder", () => {
  const api = loadGraphHealthApi({ activeFolderPath: "C:/vault" });
  const source = api.createHealthReportOpenSource(
    { id: "src/a.java", name: "A.java.md", path: "src/A.java.md" },
    { id: "src/a.java", fullPath: "src/A.java.md" },
    "markdown"
  );

  assert.equal(source.name, "A.java.md");
  assert.equal(source.path, "C:/vault/src/A.java.md");
});

test("missing dependency health leaves absolute markdown paths unchanged", () => {
  const api = loadGraphHealthApi({ activeFolderPath: "C:/vault" });
  const source = api.createHealthReportOpenSource(
    { id: "src/a.java", name: "A.java.md", path: "src/A.java.md", fullPath: "D:/generated/src/A.java.md" },
    { id: "src/a.java", fullPath: "src/A.java.md" },
    "markdown"
  );

  assert.equal(source.name, "A.java.md");
  assert.equal(source.path, "D:/generated/src/A.java.md");
});

test("missing dependency health keeps absolute original source paths unchanged", () => {
  const api = loadGraphHealthApi({ activeFolderPath: "C:/vault" });
  const source = api.createHealthReportOpenSource(
    {
      id: "src/a.java",
      name: "A.java.md",
      path: "src/A.java.md",
      originalSourcePath: "C:/workspace/src/A.java",
      originalSourceName: "A.java"
    },
    { id: "src/a.java", fullPath: "src/A.java.md" },
    "original"
  );

  assert.equal(source.name, "A.java");
  assert.equal(source.path, "C:/workspace/src/A.java");
});

test("missing dependency health keeps relative original source paths for the source-root resolver", () => {
  const api = loadGraphHealthApi({ activeFolderPath: "C:/vault" });
  const source = api.createHealthReportOpenSource(
    {
      id: "src/a.java",
      name: "A.java.md",
      path: "src/A.java.md",
      originalSourcePath: "src/A.java",
      originalSourceName: "A.java"
    },
    { id: "src/a.java", fullPath: "src/A.java.md" },
    "original"
  );

  assert.equal(source.name, "A.java");
  assert.equal(source.path, "src/A.java");
});

test("health report original file errors explain missing source-root metadata", () => {
  const api = loadGraphHealthApi({ activeFolderPath: "C:/generated/project" });
  const message = api.createHealthReportOpenFailureMessage({
    reason: "missing-source-root",
    mode: "original",
    rawPath: "src/A.java",
    activeFolderPath: "C:/generated/project",
    originalSourceRootPath: ""
  });

  assert.match(message, /Unable to open the original source file/);
  assert.match(message, /src\/A\.java/);
  assert.match(message, /original source root/i);
  assert.match(message, /C:\/generated\/project/);
});

test("health report original file errors include the resolved missing path", () => {
  const api = loadGraphHealthApi();
  const message = api.createHealthReportOpenFailureMessage({
    reason: "missing-original-file",
    mode: "original",
    rawPath: "src/A.java",
    resolvedPath: "C:/source/project/src/A.java",
    activeFolderPath: "C:/generated/project",
    originalSourceRootPath: "C:/source/project"
  });

  assert.match(message, /file was not found or is not accessible/i);
  assert.match(message, /C:\/source\/project\/src\/A\.java/);
  assert.match(message, /C:\/source\/project/);
});

test("health report recovers relative markdown files from a generated project folder", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json",
    "C:/generated/project/src/A.java.md"
  ]);
  const prompts = [];
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        }
      }
    },
    confirm(message) {
      prompts.push(message);
      return true;
    }
  });

  const projectFolder = await api.findGeneratedProjectFolderFromPath("C:/generated/project/graphs/demo.mdviewer-graph.json");
  assert.equal(projectFolder, "C:/generated/project");

  const recoveredPath = await api.recoverHealthReportMarkdownSourcePath(
    { rawPath: "src/A.java.md", path: "src/A.java.md" },
    { sourceFilePath: "C:/generated/project/graphs/demo.mdviewer-graph.json" }
  );

  assert.equal(recoveredPath, "C:/generated/project/src/A.java.md");
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /search for this file's generated project folder/);
  assert.match(prompts[0], /src\/A\.java\.md/);

  const recovery = await api.resolveHealthReportMarkdownSourceRecovery(
    { rawPath: "src/A.java.md", path: "src/A.java.md" },
    { sourceFilePath: "C:/generated/project/graphs/demo.mdviewer-graph.json" }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(recovery)), {
    path: "C:/generated/project/src/A.java.md",
    projectRootPath: "C:/generated/project"
  });
});

test("health report uses opened source metadata as project search anchor", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json",
    "C:/generated/project/flink-docs/src/Test.java.md"
  ]);
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        }
      }
    },
    confirm() {
      return true;
    }
  });

  const recoveredPath = await api.recoverHealthReportMarkdownSourcePath(
    { rawPath: "flink-docs/src/Test.java.md", path: "flink-docs/src/Test.java.md" },
    {
      openedSource: {
        path: "C:/generated/project/.md-editor/missing_dependencies_report.json",
        name: "missing_dependencies_report.json",
        kind: "health-report"
      }
    }
  );

  assert.equal(recoveredPath, "C:/generated/project/flink-docs/src/Test.java.md");
});

test("health report resolves original source from generated project metadata without prompting", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json",
    "C:/source/project/flink-docs/src/Test.java"
  ]);
  let prompted = false;
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        },
        async readFile(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (normalized === "C:/generated/project/.md-editor/_md_editor_project.json") {
            return JSON.stringify({
              schemaVersion: 1,
              type: "md-editor-generated-code-folder",
              sourceRootPath: "C:/source/project",
              sourcePathMode: "relative-to-source-root"
            });
          }
          throw new Error("missing");
        }
      }
    },
    async resolveOriginalSourcePath() {
      return { rawPath: "flink-docs/src/Test.java", resolvedPath: "", metadata: null, needsSourceRoot: true };
    },
    confirm() {
      prompted = true;
      return false;
    }
  });

  const resolved = await api.resolveHealthReportOriginalSourcePath(
    { rawPath: "flink-docs/src/Test.java", path: "flink-docs/src/Test.java" },
    { sourceFilePath: "C:/generated/project/flink-docs.mdviewer-graph.json" }
  );

  assert.equal(prompted, false);
  assert.equal(resolved.needsSourceRoot, false);
  assert.equal(resolved.resolvedPath, "C:/source/project/flink-docs/src/Test.java");
  assert.equal(resolved.metadata.projectFolderPath, "C:/generated/project");
});

test("health report resolves Maven recovery source root from generated project metadata", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json"
  ]);
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        },
        async readFile(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (normalized === "C:/generated/project/.md-editor/_md_editor_project.json") {
            return JSON.stringify({
              schemaVersion: 1,
              type: "md-editor-generated-code-folder",
              sourceRootPath: "C:/source/project",
              sourcePathMode: "relative-to-source-root"
            });
          }
          throw new Error("missing");
        }
      }
    },
    getOriginalSourceRootPath() {
      return "";
    }
  });

  const sourceRootPath = await api.getMavenRecoverySourceRootPath({
    sourceFilePath: "C:/generated/project/graphs/health.mdviewer-graph.json"
  });

  assert.equal(sourceRootPath, "C:/source/project");
});

test("health report uses active source root before Maven recovery metadata search", async () => {
  let statCalls = 0;
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats() {
          statCalls += 1;
          throw new Error("metadata search should not run");
        }
      }
    },
    getOriginalSourceRootPath() {
      return "C:/source/active";
    }
  });

  const sourceRootPath = await api.getMavenRecoverySourceRootPath({
    sourceFilePath: "C:/generated/project/graphs/health.mdviewer-graph.json"
  });

  assert.equal(sourceRootPath, "C:/source/active");
  assert.equal(statCalls, 0);
});

test("health report does not prompt for Maven recovery source root when metadata is missing", async () => {
  let prompted = false;
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        }
      }
    },
    getOriginalSourceRootPath() {
      return "";
    },
    async promptForSourceRoot() {
      prompted = true;
      return { sourceRootPath: "C:/source/from-prompt" };
    }
  });

  const sourceRootPath = await api.getMavenRecoverySourceRootPath({
    sourceFilePath: "C:/generated/project/graphs/health.mdviewer-graph.json"
  });

  assert.equal(sourceRootPath, "");
  assert.equal(prompted, false);
});

test("health report finds generated project folder from a folder seed", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json",
    "C:/generated/project/src/A.java.md"
  ]);
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        }
      }
    }
  });

  const projectFolder = await api.findGeneratedProjectFolderFromPath("C:/generated/project");
  assert.equal(projectFolder, "C:/generated/project");
});

test("health report recovers relative markdown files from graph scope folder", async () => {
  const existingPaths = new Set([
    "C:/generated/project/.md-editor/_md_editor_project.json",
    "C:/generated/project/flink-docs/src/Test.java.md"
  ]);
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          const normalized = String(filePath || "").replace(/\\/g, "/");
          if (!existingPaths.has(normalized)) throw new Error("missing");
          return { isFile: true };
        }
      }
    },
    confirm() {
      return true;
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(api.getHealthReportProjectSearchSeeds({
    graphScopeKey: "root-folder:C:/generated/project"
  }))), ["C:/generated/project"]);

  const recoveredPath = await api.recoverHealthReportMarkdownSourcePath(
    { rawPath: "flink-docs/src/Test.java.md", path: "flink-docs/src/Test.java.md" },
    { graphScopeKey: "root-folder:C:/generated/project" }
  );

  assert.equal(recoveredPath, "C:/generated/project/flink-docs/src/Test.java.md");
});

test("health report returns empty recovery path when generated project folder is unavailable", async () => {
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats() {
          throw new Error("missing");
        }
      }
    },
    confirm() {
      return true;
    }
  });

  const recoveredPath = await api.recoverHealthReportMarkdownSourcePath(
    { rawPath: "src/A.java.md", path: "src/A.java.md" },
    { sourceFilePath: "C:/generated/project/graphs/demo.mdviewer-graph.json" }
  );

  assert.equal(recoveredPath, "");
});

test("health report does not search for project folder when relative file recovery is declined", async () => {
  let statCalls = 0;
  const openedFolders = [];
  const api = loadGraphHealthApi({
    NL_VERSION: "test",
    Neutralino: {
      filesystem: {
        async getStats() {
          statCalls += 1;
          throw new Error("missing");
        }
      }
    },
    async openFolderTreeFromNeutralinoPath(folderPath) {
      openedFolders.push(folderPath);
    },
    confirm() {
      return false;
    }
  });

  const recoveredPath = await api.recoverHealthReportMarkdownSourcePath(
    { rawPath: "src/A.java.md", path: "src/A.java.md" },
    { sourceFilePath: "C:/generated/project/graphs/demo.mdviewer-graph.json" }
  );

  assert.equal(recoveredPath, "");
  assert.equal(statCalls, 1);
  assert.deepEqual(openedFolders, []);
});

test("missing package summary derives package buckets from symbols", () => {
  const api = loadGraphPackageSummaryApi();

  assert.equal(api.deriveMissingPackageBucket("org.junit.jupiter.api.Test", "class"), "org.junit.jupiter.api");
  assert.equal(api.deriveMissingPackageBucket("org.assertj.core.api.Assertions", "static-owner"), "org.assertj.core.api");
  assert.equal(api.deriveMissingPackageBucket("com.foo.tools.*", "package"), "com.foo.tools");
  assert.equal(api.deriveMissingPackageBucket("org.slf4j.Logger", "class"), "org.slf4j");
  assert.equal(api.deriveMissingPackageBucket("@scope/tool/subpath", "package", "javascript"), "@scope/tool");
  assert.equal(api.deriveMissingPackageBucket("requests.sessions", "package", "python"), "requests");
  assert.equal(api.deriveMissingPackageBucket("Missing.Namespace.Type", "namespace", "csharp"), "Missing.Namespace");
  assert.equal(api.deriveMissingPackageBucket("Missing", "class"), "");
});

test("missing package summary merges symbols and preserves affected files and references", () => {
  const healthApi = loadGraphHealthApi();
  const packageApi = loadGraphPackageSummaryApi();
  const dependencySummary = healthApi.aggregateMissingDependencies({
    folderName: "Demo",
    nodes: [
      { id: "src/a.java", type: "file" },
      { id: "src/b.java", type: "file" },
      { id: "src/c.java", type: "file" },
      { id: "missing:junit-test", type: "missing-dependency", qualifiedName: "org.junit.jupiter.api.Test", missingKind: "class", language: "java" },
      { id: "missing:junit-before", type: "missing-dependency", qualifiedName: "org.junit.jupiter.api.BeforeEach", missingKind: "class", language: "java" },
      { id: "missing:slf4j", type: "missing-dependency", qualifiedName: "org.slf4j.Logger", missingKind: "class", language: "java" },
      { id: "missing:foo-tools", type: "missing-dependency", qualifiedName: "com.foo.tools.*", missingKind: "package", wildcard: true, language: "java" }
    ],
    links: [
      { source: "src/a.java", target: "missing:junit-test", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:junit-test", type: "missing-dependency" },
      { source: "src/b.java", target: "missing:junit-before", type: "missing-dependency" },
      { source: "src/c.java", target: "missing:slf4j", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:foo-tools", type: "missing-dependency" }
    ],
    files: [
      { id: "src/a.java", name: "A.java.md", path: "src/A.java.md", unresolvedDependencies: [{ symbol: "org.junit.jupiter.api.Test", line: 1 }, { symbol: "com.foo.tools.*", line: 2 }] },
      { id: "src/b.java", name: "B.java.md", path: "src/B.java.md", unresolvedDependencies: [{ symbol: "org.junit.jupiter.api.BeforeEach", line: 3 }] },
      { id: "src/c.java", name: "C.java.md", path: "src/C.java.md", unresolvedDependencies: [{ symbol: "org.slf4j.Logger", line: 4 }] }
    ]
  });
  const summary = packageApi.aggregateMissingPackageSummary(dependencySummary, "Demo");

  assert.equal(summary.packageCount, 3);
  assert.equal(summary.missingSymbolCount, 4);
  assert.equal(summary.referenceCount, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.packages.map((entry) => entry.packageName))), [
    "org.junit.jupiter.api",
    "com.foo.tools",
    "org.slf4j"
  ]);
  assert.equal(summary.packages[0].missingSymbolCount, 2);
  assert.equal(summary.packages[0].affectedFileCount, 2);
  assert.equal(summary.packages[0].referenceCount, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.packages[0].symbols.map((symbol) => symbol.symbol))), [
    "org.junit.jupiter.api.Test",
    "org.junit.jupiter.api.BeforeEach"
  ]);
});

test("Maven recovery update context carries exact resolved symbols", () => {
  const healthApi = loadGraphHealthApi();
  const packageApi = loadGraphPackageSummaryApi();
  const dependencySummary = healthApi.aggregateMissingDependencies({
    folderName: "Demo",
    nodes: [
      { id: "src/a.java", type: "file" },
      { id: "missing:junit-test", type: "missing-dependency", qualifiedName: "org.junit.jupiter.api.Test", missingKind: "class", language: "java" },
      { id: "missing:junit-before", type: "missing-dependency", qualifiedName: "org.junit.jupiter.api.BeforeEach", missingKind: "class", language: "java" }
    ],
    links: [
      { source: "src/a.java", target: "missing:junit-test", type: "missing-dependency" },
      { source: "src/a.java", target: "missing:junit-before", type: "missing-dependency" }
    ],
    files: [
      {
        id: "src/a.java",
        name: "A.java.md",
        path: "src/A.java.md",
        unresolvedDependencies: [
          { symbol: "org.junit.jupiter.api.Test", line: 1 },
          { symbol: "org.junit.jupiter.api.BeforeEach", line: 2 }
        ]
      }
    ]
  });
  const packageSummary = packageApi.aggregateMissingPackageSummary(dependencySummary, "Demo");

  const context = healthApi.createMavenRecoveryUpdateContext(dependencySummary, packageSummary);

  assert.deepEqual(JSON.parse(JSON.stringify(context.packages[0])), {
    packageName: "org.junit.jupiter.api",
    resolvedSymbols: ["org.junit.jupiter.api.BeforeEach", "org.junit.jupiter.api.Test"],
    affectedMarkdownFiles: ["src/A.java.md"],
    missingDependencyNodeIds: ["missing:junit-before", "missing:junit-test"]
  });
});

test("missing package summary exports markdown csv and json", () => {
  const api = loadGraphPackageSummaryApi();
  const summary = {
    folderName: "Demo",
    packageCount: 1,
    missingSymbolCount: 2,
    affectedFileCount: 3,
    referenceCount: 4,
    packages: [
      {
        packageName: "org.junit.jupiter.api",
        missingSymbolCount: 2,
        affectedFileCount: 3,
        referenceCount: 4,
        symbols: [
          { symbol: "org.junit.jupiter.api.Test", language: "java", rawKind: "class", affectedFileCount: 2, referenceCount: 3 },
          { symbol: "org.junit.jupiter.api.BeforeEach", language: "java", rawKind: "class", affectedFileCount: 1, referenceCount: 1 }
        ]
      }
    ]
  };

  const markdown = api.formatPackageSummaryMarkdown(summary, { title: "Demo Graph" });
  assert.match(markdown, /# Missing Dependency Group Summary: Demo Graph/);
  assert.match(markdown, /\| org\.junit\.jupiter\.api \| java \| 2 \| 3 \| 4 \|/);
  assert.match(markdown, /`org\.junit\.jupiter\.api\.Test` \(java, class, 2 files, 3 references\)/);
  const markdownExport = api.createPackageSummaryExport(summary, "markdown", { title: "Demo Graph" });
  assert.deepEqual(JSON.parse(JSON.stringify(markdownExport)), {
    content: markdown,
    fileName: "Demo-missing-dependency-groups.md",
    extension: "md",
    mimeType: "text/markdown;charset=utf-8"
  });

  const csv = api.formatPackageSummaryCsv(summary);
  assert.equal(csv.split("\n")[0], "group,languages,missingSymbols,affectedFiles,references,symbols");
  assert.match(csv, /org\.junit\.jupiter\.api,java,2,3,4,/);
  const csvExport = api.createPackageSummaryExport(summary, "csv");
  assert.deepEqual(JSON.parse(JSON.stringify(csvExport)), {
    content: csv,
    fileName: "Demo-missing-dependency-groups.csv",
    extension: "csv",
    mimeType: "text/csv;charset=utf-8"
  });

  const json = api.createPackageSummaryJson(summary);
  assert.equal(json.folderName, "Demo");
  assert.equal(json.packageCount, 1);
  assert.equal(json.packages[0].packageName, "org.junit.jupiter.api");
  assert.deepEqual(JSON.parse(JSON.stringify(json.packages[0].languages)), ["java"]);
  assert.deepEqual(JSON.parse(JSON.stringify(json.packages[0].symbols)), [
    { symbol: "org.junit.jupiter.api.Test", language: "java", kind: "class" },
    { symbol: "org.junit.jupiter.api.BeforeEach", language: "java", kind: "class" }
  ]);
  const jsonExport = api.createPackageSummaryExport(summary, "json");
  assert.equal(jsonExport.fileName, "Demo-missing-dependency-groups.json");
  assert.equal(jsonExport.extension, "json");
  assert.equal(jsonExport.mimeType, "application/json;charset=utf-8");
  assert.equal(JSON.parse(jsonExport.content).packages[0].packageName, "org.junit.jupiter.api");
});

test("missing package summary export rejects unknown formats", () => {
  const api = loadGraphPackageSummaryApi();

  assert.throws(
    () => api.createPackageSummaryExport({ folderName: "Demo", packages: [] }, "xml"),
    /Unsupported graph report format: xml/
  );
});

test("missing package summary context menu sub-entries are sorted and unique", () => {
  const api = loadGraphPackageSummaryApi();

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getPackageSummaryEntrySubEntryNames({
      packageName: "picocli.CommandLine",
      symbols: [
        { symbol: "picocli.CommandLine.Option" },
        { symbol: "picocli.CommandLine" },
        { symbol: "picocli.CommandLine.Command" },
        { symbol: "picocli.CommandLine.Option" }
      ]
    }))),
    ["picocli.CommandLine", "picocli.CommandLine.Command", "picocli.CommandLine.Option"]
  );
});

test("missing package summary context menu is attached to group rows", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/package-summary.js"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");

  assert.match(source, /row\.dataset\.packageName = entry\.packageName/);
  assert.match(source, /tbody\.addEventListener\("contextmenu"/);
  assert.match(source, /row\.addEventListener\("contextmenu",\s*openContextMenu\)/);
  assert.match(source, /toggleButton\.addEventListener\("contextmenu",\s*openContextMenu\)/);
  assert.match(styles, /\.graph-health-package-context-menu\s*\{[\s\S]*z-index:\s*4601;/);
});

test("missing dependency groups support mixed languages", () => {
  const healthApi = loadGraphHealthApi();
  const packageApi = loadGraphPackageSummaryApi();
  const dependencySummary = healthApi.aggregateMissingDependencies({
    nodes: [
      { id: "src/app.js", type: "file" },
      { id: "src/worker.py", type: "file" },
      { id: "missing:javascript:@scope/tool", type: "missing-dependency", qualifiedName: "@scope/tool/subpath", missingKind: "package", language: "javascript" },
      { id: "missing:python:requests", type: "missing-dependency", qualifiedName: "requests.sessions", missingKind: "package", language: "python" }
    ],
    links: [
      { source: "src/app.js", target: "missing:javascript:@scope/tool", type: "missing-dependency" },
      { source: "src/worker.py", target: "missing:python:requests", type: "missing-dependency" }
    ],
    files: [
      { id: "src/app.js", name: "app.js.md", path: "src/app.js.md", unresolvedDependencies: [{ symbol: "@scope/tool/subpath", language: "javascript", line: 1 }] },
      { id: "src/worker.py", name: "worker.py.md", path: "src/worker.py.md", unresolvedDependencies: [{ symbol: "requests.sessions", language: "python", line: 1 }] }
    ]
  });
  const summary = packageApi.aggregateMissingPackageSummary(dependencySummary, "Mixed");

  assert.deepEqual(JSON.parse(JSON.stringify(summary.packages.map((entry) => entry.packageName))), [
    "@scope/tool",
    "requests"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.packages.map((entry) => entry.symbols[0].language))), [
    "javascript",
    "python"
  ]);
});
