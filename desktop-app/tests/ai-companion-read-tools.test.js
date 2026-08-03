const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const tools = require("../resources/ai-companion/tools/workspace-tools");

function createEditorReadContext() {
  return {
    workspace: {
      rootPath: "C:/workspace",
      activeFolderName: "workspace",
      activeFolderPath: "C:/workspace",
      mode: "chat",
      openTabCount: 2,
      activeTab: { id: "tab-a", title: "Alpha", type: "markdown", path: "docs/alpha.md", dirty: true }
    },
    activeDocument: {
      id: "tab-a",
      title: "Alpha",
      type: "markdown",
      path: "docs/alpha.md",
      dirty: true,
      selection: { start: 2, end: 7, text: "pha s" },
      content: [
        "---",
        "title: Alpha",
        "---",
        "# Alpha",
        "Alpha search term links to [Beta](docs/beta.md), [[Ghost]], and #topic.",
        "- [x] Done task",
        "```js",
        "console.log('alpha');",
        "```"
      ].join("\n")
    },
    openTabs: [
      {
        id: "tab-a",
        title: "Alpha",
        type: "markdown",
        path: "docs/alpha.md",
        viewMode: "split",
        dirty: true,
        content: "Alpha live unsaved needle"
      },
      {
        id: "tab-b",
        title: "Beta",
        type: "markdown",
        path: "docs/beta.md",
        viewMode: "editor",
        dirty: false,
        content: "Back to [Alpha](docs/alpha.md)"
      }
    ],
    graphTabs: [
      {
        id: "graph-1",
        title: "Workspace Graph",
        nodeCount: 2,
        linkCount: 1,
        fileCount: 2,
        graphViewConfig: { mode: "local", focusNodeId: "docs/alpha.md" },
        nodes: [{ id: "docs/alpha.md", label: "Alpha", path: "docs/alpha.md" }],
        files: [{ id: "docs/alpha.md", name: "Alpha", path: "docs/alpha.md", tags: ["topic"] }],
        links: [{ source: "docs/beta.md", target: "docs/alpha.md", type: "link" }]
      }
    ],
    folderMarkdownFiles: [
      { name: "Alpha", path: "docs/alpha.md" },
      { name: "Beta", path: "docs/beta.md" }
    ],
    recentActivity: [
      { kind: "open-tab", id: "tab-a", path: "docs/alpha.md", reason: "active" },
      { kind: "open-tab", id: "tab-b", path: "docs/beta.md", reason: "open" }
    ]
  };
}

test("editor read tools return workspace state and open tab content from the renderer snapshot", async () => {
  const editorReadContext = createEditorReadContext();
  const state = await tools.getWorkspaceState("", { includeTabs: true }, { editorReadContext });
  const active = await tools.readActiveDocument("", { includeContent: true, includeSelection: true, maxChars: 40 }, { editorReadContext });
  const tabs = await tools.readOpenTabs("", { includeContent: true, maxTabs: 1, maxCharsPerTab: 10 }, { editorReadContext });

  assert.equal(state.workspace.mode, "chat");
  assert.equal(state.counts.openTabs, 2);
  assert.equal(state.counts.graphTabs, 1);
  assert.equal(state.counts.dirtyTabs, 1);
  assert.equal(state.tabs[0].path, "docs/alpha.md");
  assert.equal(active.path, "docs/alpha.md");
  assert.equal(active.selection.text, "pha s");
  assert.match(active.content, /\.\.\.\[truncated\]/);
  assert.equal(tabs.totalTabs, 2);
  assert.equal(tabs.tabs.length, 1);
  assert.match(tabs.tabs[0].content, /\.\.\.\[truncated\]/);
});

test("document structure parses the active document and selected tab", async () => {
  const editorReadContext = createEditorReadContext();
  const activeStructure = await tools.getDocumentStructure("", { source: "active" }, { editorReadContext });
  const tabStructure = await tools.getDocumentStructure("", { source: "tab", tabId: "tab-b" }, { editorReadContext });

  assert.equal(activeStructure.structure.hasFrontmatter, true);
  assert.deepEqual(activeStructure.structure.headings.map((heading) => heading.text), ["Alpha"]);
  assert.equal(activeStructure.structure.links.length, 2);
  assert.equal(activeStructure.structure.tags[0].tag, "#topic");
  assert.equal(activeStructure.structure.tasks[0].checked, true);
  assert.equal(activeStructure.structure.codeBlocks[0].language, "js");
  assert.equal(tabStructure.document.id, "tab-b");
  assert.equal(tabStructure.structure.links[0].target, "docs/alpha.md");
});

test("search vault uses live open-tab content or disk-backed workspace search by scope", async () => {
  const editorReadContext = createEditorReadContext();
  const liveResults = await tools.searchVault("", { query: "unsaved", scope: "open-tabs" }, { editorReadContext });
  assert.equal(liveResults.length, 1);
  assert.equal(liveResults[0].tabId, "tab-a");

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-read-tools-"));
  await fs.writeFile(path.join(workspace, "saved.md"), "Saved disk-only needle", "utf8");
  const diskResults = await tools.searchVault(workspace, { query: "disk-only", scope: "workspace" }, {
    editorReadContext,
    searchGrep: tools.searchGrep
  });
  assert.equal(diskResults.length, 1);
  assert.equal(diskResults[0].path, "./saved.md");
});

test("glob finds a deep file after many earlier files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-glob-tools-"));
  const fillerDir = path.join(workspace, "aaa_earlier_files");
  await fs.mkdir(fillerDir, { recursive: true });
  for (let index = 0; index < 2105; index++) {
    await fs.writeFile(path.join(fillerDir, `filler-${String(index).padStart(4, "0")}.txt`), "filler", "utf8");
  }

  const targetPath = path.join(workspace, "amta_idb_arch", "AMTA_IDB_ARCH", "Discount_Distribution", "qs", "localtransactions", "ASPH.java");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, "package qs.localtransactions;", "utf8");

  const matches = await tools.globFiles(workspace, "**/qs/localtransactions/ASPH.java", { maxFiles: 5 });

  assert.deepEqual(matches, ["amta_idb_arch/AMTA_IDB_ARCH/Discount_Distribution/qs/localtransactions/ASPH.java"]);
});

test("glob falls back when fast-glob cannot be loaded", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-glob-fallback-"));
  const targetPath = path.join(workspace, "amta_idb_arch", "AMTA_IDB_ARCH", "Discount_Distribution", "qs", "localtransactions", "ASPH.java");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, "package qs.localtransactions;", "utf8");

  const toolsPath = path.join(__dirname, "..", "resources", "ai-companion", "tools", "workspace-tools.js");
  const script = `
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "fast-glob") {
    const error = new Error("Cannot find module '@nodelib/fs.stat'");
    error.code = "MODULE_NOT_FOUND";
    throw error;
  }
  return originalLoad.apply(this, arguments);
};
const tools = require(${JSON.stringify(toolsPath)});
(async () => {
  const matches = await tools.globFiles(process.argv[1], "**/qs/localtransactions/ASPH.java", { maxFiles: 5 });
  console.log(JSON.stringify(matches));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
`;
  const result = await execFileAsync(process.execPath, ["-e", script, workspace], { cwd: path.join(__dirname, "..") });

  assert.deepEqual(JSON.parse(result.stdout), ["amta_idb_arch/AMTA_IDB_ARCH/Discount_Distribution/qs/localtransactions/ASPH.java"]);
});

test("link context returns outgoing links backlinks unresolved links and graph metadata", async () => {
  const editorReadContext = createEditorReadContext();
  const context = await tools.getLinkContext("", { source: "active" }, { editorReadContext });

  assert.equal(context.document.path, "docs/alpha.md");
  assert.equal(context.outgoingLinks.some((link) => link.target === "docs/beta.md"), true);
  assert.deepEqual(context.backlinks.map((link) => link.path), ["docs/beta.md"]);
  assert.equal(context.unresolvedLinks.some((link) => link.target === "Ghost"), true);
  assert.equal(context.graphMatches[0].graphTabId, "graph-1");
});

test("recent activity and empty snapshots are safe", async () => {
  const editorReadContext = createEditorReadContext();
  const recent = await tools.getRecentActivity("", { maxItems: 1 }, { editorReadContext });
  const emptyState = await tools.getWorkspaceState("", { includeTabs: true }, { editorReadContext: {} });

  assert.equal(recent.items.length, 1);
  assert.equal(recent.items[0].reason, "active");
  assert.equal(emptyState.counts.openTabs, 0);
  assert.deepEqual(emptyState.tabs, []);
});
