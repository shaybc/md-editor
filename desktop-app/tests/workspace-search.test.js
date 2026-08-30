const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadWorkspaceSearchModule(depsOverride = {}) {
  const { document: documentOverride, app: appOverride, ...extraDeps } = depsOverride;
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/search/workspace-search.js"), "utf8");
  const sandbox = {
    console,
    setTimeout,
    document: documentOverride || {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    confirm: () => true,
    alert: () => {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const app = appOverride || { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const deps = {
    isFolderOpen: () => true,
    getFolderMarkdownFiles: () => [],
    getCurrentFolderTreeNodes: () => [],
    readWorkspaceEntryContent: async () => "",
    writeWorkspaceEntryContent: async () => {},
    parseFrontmatter: (content) => {
      const match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
      if (!match) return { frontmatter: null, body: content };
      const frontmatter = {};
      match[1].split(/\n/).forEach((line) => {
        const pair = line.match(/^([^:]+):\s*(.*)$/);
        if (pair) frontmatter[pair[1].trim()] = pair[2].replace(/^\[|\]$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
      });
      return { frontmatter, body: content };
    },
    getFileTagsFromContent: (content) => {
      const tags = [];
      const yaml = String(content || "").match(/tags:\s*\[([^\]]*)\]/);
      if (yaml) tags.push(...yaml[1].split(",").map((tag) => tag.trim()));
      const inline = String(content || "").match(/(^|\s)#([a-z0-9_-]+)/gi) || [];
      inline.forEach((tag) => tags.push(tag.replace(/^|\s|#/g, "")));
      return Array.from(new Set(tags.map((tag) => tag.toLowerCase()).filter(Boolean)));
    },
    normalizeTagName: (tag) => String(tag || "").toLowerCase().replace(/^#/, ""),
    isMarkdownPath: (filePath) => /\.md$/i.test(filePath || ""),
    isTextDocumentPath: () => true,
    isSupportedFolderTreeDocumentNode: () => true
  };
  return sandbox.registerMarkdownViewerWorkspaceSearch(app, { ...deps, ...extraDeps });
}

function loadWorkspaceSearchTestApi() {
  return loadWorkspaceSearchModule()._test;
}
class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : !!force;
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new FakeClassList();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener(name, handler) { this.listener = { name, handler }; }
  focus() { this.focused = true; }
}

function createSidebarViewHarness() {
  const elements = new Map();
  const buttons = ["files", "search", "git", "api-client", "ai-companion"].map((view) => {
    const button = new FakeElement(`${view}-button`);
    button.dataset.sidebarView = view;
    button.classList.add("sidebar-view-option");
    if (view === "files") button.classList.add("active");
    return button;
  });
  const regexButton = new FakeElement("regex-tester-button");
  regexButton.classList.add("open-regex-tester");
  regexButton.setAttribute("aria-pressed", "false");
  const folderTreeRoot = new FakeElement("folder-tree-root");
  const workspaceSearchPanel = new FakeElement("workspace-search-panel");
  const workspaceGitPanel = new FakeElement("workspace-git-panel");
  const apiClientPanel = new FakeElement("api-client-sidebar-panel");
  const regexTesterPanel = new FakeElement("regex-tester-sidebar-panel");
  regexTesterPanel.hidden = true;
  const folderTreePane = new FakeElement("folder-tree-pane");
  const folderTreeTopbar = new FakeElement("folder-tree-topbar");
  const dropzonePanel = new FakeElement("dropzone-panel");
  const dropzoneResizer = new FakeElement("sidebar-dropzone-resizer");
  const queryInput = new FakeElement("workspace-search-query");
  [folderTreeRoot, workspaceSearchPanel, workspaceGitPanel, apiClientPanel, regexTesterPanel, folderTreePane, dropzoneResizer, queryInput].forEach((element) => elements.set(element.id, element));
  const body = new FakeElement("body");
  const document = {
    body,
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => selector === ".sidebar-dropzone-panel" ? dropzonePanel : selector === ".folder-tree-topbar" ? folderTreeTopbar : buttons.find((button) => selector === ".sidebar-view-option.active" && button.classList.contains("active")) || null,
    querySelectorAll: (selector) => selector === ".sidebar-view-option" ? buttons : selector === ".open-regex-tester" ? [regexButton] : []
  };
  const aiCompanionPanel = {
    openCalls: [],
    closeCalls: 0,
    setOpen(open, options) {
      this.openCalls.push({ open, options });
      body.classList.toggle("ai-companion-open", open === true);
    },
    setWorkspaceOpen(open, options) { this.openCalls.push({ open, options, workspace: true }); },
    closeWorkspaceForExternalNavigation() { this.closeCalls += 1; }
  };
  const app = { modules: { aiCompanionPanel, workspaceGit: { refreshWorkspaceGitStatus() { this.refreshed = true; } } }, registerModule(name, api) { this.modules[name] = api; } };
  return { app, document, body, buttons, regexButton, folderTreeRoot, workspaceSearchPanel, workspaceGitPanel, apiClientPanel, regexTesterPanel, folderTreePane, folderTreeTopbar, dropzonePanel, dropzoneResizer, aiCompanionPanel };
}

test("workspace search uses the async workspace entry provider", async () => {
  const rootEntries = [{ name: "Root.md", path: "Root.md", content: "root only" }];
  const nestedEntries = [{ name: "Nested.md", path: "docs/Nested.md", content: "deep match" }];
  let providerCalled = false;
  const module = loadWorkspaceSearchModule({
    getFolderMarkdownFiles: () => rootEntries,
    getWorkspaceSearchFiles: async () => {
      providerCalled = true;
      return nestedEntries;
    },
    readWorkspaceEntryContent: async (entry) => entry.content
  });

  const results = await module.runWorkspaceSearch({ query: "deep" });

  assert.equal(providerCalled, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].path, "docs/Nested.md");
});
test("workspace search can limit results to root files", async () => {
  const entries = [
    { name: "Root.md", path: "Root.md", content: "needle root" },
    { name: "Nested.md", path: "docs/Nested.md", content: "needle nested" }
  ];
  const module = loadWorkspaceSearchModule({
    getWorkspaceSearchFiles: async () => entries,
    readWorkspaceEntryContent: async (entry) => entry.content
  });

  const defaultResults = await module.runWorkspaceSearch({ query: "needle" });
  const rootOnlyResults = await module.runWorkspaceSearch({ query: "needle", searchSubfolders: false });

  assert.deepEqual(Array.from(defaultResults, (result) => result.path), ["Root.md", "docs/Nested.md"]);
  assert.deepEqual(Array.from(rootOnlyResults, (result) => result.path), ["Root.md"]);
});
test("workspace search excludes unsupported files by default", async () => {
  const entries = [
    { name: "Alpha.java", path: "src/Alpha.java", content: "needle java" },
    { name: "Notes.md", path: "docs/Notes.md", content: "needle markdown" },
    { name: "Archive.bin", path: "bin/Archive.bin", content: "needle binary" }
  ];
  const module = loadWorkspaceSearchModule({
    getWorkspaceSearchFiles: async () => entries,
    readWorkspaceEntryContent: async (entry) => entry.content,
    isMarkdownPath: (filePath) => /\.md$/i.test(filePath || ""),
    isTextDocumentPath: () => true,
    isSupportedFolderTreeDocumentNode: (entry) => !/\.bin$/i.test(entry?.path || entry?.name || "")
  });

  const defaultResults = await module.runWorkspaceSearch({ query: "needle" });
  const unsupportedResults = await module.runWorkspaceSearch({ query: "needle", includeUnsupported: true });

  assert.deepEqual(Array.from(defaultResults, (result) => result.path), ["src/Alpha.java", "docs/Notes.md"]);
  assert.deepEqual(Array.from(unsupportedResults, (result) => result.path), ["src/Alpha.java", "docs/Notes.md", "bin/Archive.bin"]);
});
test("workspace search treats provider entries without kind as supported files", async () => {
  const entries = [
    {
      name: "panel.js",
      path: "web-app/js/ai-companion/panel.js",
      content: "Checking whether this file still exists..."
    }
  ];
  const module = loadWorkspaceSearchModule({
    getWorkspaceSearchFiles: async () => entries,
    readWorkspaceEntryContent: async (entry) => entry.content,
    isMarkdownPath: (filePath) => /\.md$/i.test(filePath || ""),
    isTextDocumentPath: () => true,
    isSupportedFolderTreeDocumentNode: (entry) => entry?.kind === "file" && /\.js$/i.test(entry?.path || entry?.name || "")
  });

  const results = await module.runWorkspaceSearch({
    query: "Checking whether this file still exists",
    include: "*.js"
  });

  assert.deepEqual(Array.from(results, (result) => result.path), ["web-app/js/ai-companion/panel.js"]);
});
test("workspace search renders collapsible file results", () => {
  const api = loadWorkspaceSearchTestApi();
  const result = {
    entry: { path: "docs/Alpha.md" },
    name: "Alpha.md",
    path: "docs/Alpha & Beta.md",
    matches: [{ lineNumber: 3, preview: "Need API review" }]
  };

  const expanded = api.renderSearchResult(result, 0, false);
  const collapsed = api.renderSearchResult(result, 0, true);

  assert.equal(api.getResultCollapseKey(result), "docs/alpha & beta.md");
  assert.match(expanded, /title="docs\/Alpha &amp; Beta\.md"/);
  assert.match(expanded, /workspace-search-collapse/);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /bi-chevron-down/);
  assert.match(expanded, /workspace-search-match/);
  assert.doesNotMatch(expanded, /is-collapsed/);
  assert.match(collapsed, /is-collapsed/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(collapsed, /bi-chevron-right/);
  assert.match(collapsed, /workspace-search-matches/);
});
test("workspace search matches content metadata path filters and case", async () => {
  const api = loadWorkspaceSearchTestApi();
  const entries = [
    { name: "Alpha.md", path: "notes/Alpha.md", content: "---\nstatus: draft\ntags: [review, docs]\n---\nNeed API review\n#todo" },
    { name: "Beta.md", path: "notes/Beta.md", content: "---\nstatus: done\ntags: [archive]\n---\nNeed API review" }
  ];
  const readEntryContent = async (entry) => entry.content;
  const parseFrontmatter = (content) => {
    const match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = {};
    if (match) {
      match[1].split(/\n/).forEach((line) => {
        const pair = line.match(/^([^:]+):\s*(.*)$/);
        if (!pair) return;
        frontmatter[pair[1].trim()] = pair[2].replace(/^\[|\]$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
      });
    }
    return { frontmatter };
  };
  const getFileTagsFromContent = (content) => {
    const yaml = String(content || "").match(/tags:\s*\[([^\]]*)\]/);
    const inline = String(content || "").match(/(^|\s)#([a-z0-9_-]+)/gi) || [];
    return [
      ...(yaml ? yaml[1].split(",").map((tag) => tag.trim()) : []),
      ...inline.map((tag) => tag.replace(/^|\s|#/g, ""))
    ].map((tag) => tag.toLowerCase()).filter(Boolean);
  };
  const deps = {
    readEntryContent,
    parseFrontmatter,
    getFileTagsFromContent,
    normalizeTagName: (tag) => String(tag || "").toLowerCase()
  };

  const results = await api.runSearch(entries, {
    query: "api",
    include: "alpha",
    matchCase: false
  }, deps);

  assert.equal(results.length, 1);
  assert.equal(results[0].path, "notes/Alpha.md");
  assert.equal(results[0].matches.length, 1);
  assert.equal(results[0].matches[0].lineNumber, 5);

  const metadataResults = await api.runSearch(entries, { query: "#review", include: "*.md", exclude: "beta" }, deps);
  assert.equal(metadataResults.length, 1);
  assert.equal(metadataResults[0].path, "notes/Alpha.md");

  const caseSensitive = await api.runSearch(entries, { query: "api", matchCase: true }, deps);
  assert.equal(caseSensitive.length, 0);
});

test("workspace search folder include glob only matches that folder subtree", async () => {
  const api = loadWorkspaceSearchTestApi();
  const entries = [
    { name: "match.md", path: "docs/match.md", fullPath: "C:/vault/docs/match.md", content: "folder needle" },
    { name: "skip.md", path: "other/docs/skip.md", fullPath: "C:/vault/other/docs/skip.md", content: "folder needle" },
    { name: "root.md", path: "docs.md", fullPath: "C:/vault/docs.md", content: "folder needle" }
  ];
  const deps = {
    readEntryContent: async (entry) => entry.content,
    parseFrontmatter: () => ({ frontmatter: null }),
    getFileTagsFromContent: () => []
  };

  const results = await api.runSearch(entries, { query: "folder needle", include: "./docs/**" }, deps);

  assert.deepEqual(Array.from(results, (result) => result.path), ["C:/vault/docs/match.md"]);
});

test("workspace search consumes streamed entries incrementally", async () => {
  const api = loadWorkspaceSearchTestApi();
  let secondEntryYielded = false;
  const callbacks = [];
  async function* entries() {
    yield { name: "Alpha.md", path: "notes/Alpha.md", content: "streamed match" };
    await new Promise((resolve) => setTimeout(resolve, 5));
    secondEntryYielded = true;
    yield { name: "Beta.md", path: "notes/Beta.md", content: "streamed match" };
  }
  const deps = {
    readEntryContent: async (entry) => entry.content,
    parseFrontmatter: () => ({ frontmatter: null }),
    getFileTagsFromContent: () => []
  };

  const results = await api.runSearch(entries(), { query: "streamed" }, deps, (result, partialResults) => {
    callbacks.push({ path: result.path, count: partialResults.length, secondEntryYielded });
  });

  assert.equal(results.length, 2);
  assert.deepEqual(callbacks[0], { path: "notes/Alpha.md", count: 1, secondEntryYielded: false });
  assert.deepEqual(callbacks[1], { path: "notes/Beta.md", count: 2, secondEntryYielded: true });
});
test("workspace search stops at the configured result limit", async () => {
  const api = loadWorkspaceSearchTestApi();
  const entries = [
    { name: "Alpha.md", path: "notes/Alpha.md", content: "limit match" },
    { name: "Beta.md", path: "notes/Beta.md", content: "limit match" },
    { name: "Gamma.md", path: "notes/Gamma.md", content: "limit match" }
  ];
  const reads = [];
  const deps = {
    readEntryContent: async (entry) => {
      reads.push(entry.path);
      return entry.content;
    },
    parseFrontmatter: () => ({ frontmatter: null }),
    getFileTagsFromContent: () => []
  };

  const results = await api.runSearch(entries, { query: "limit", maxResults: 2 }, deps);

  assert.equal(results.length, 2);
  assert.equal(results.limitReached, true);
  assert.deepEqual(reads, ["notes/Alpha.md", "notes/Beta.md"]);
});
test("workspace search reports each result as it becomes available", async () => {
  const api = loadWorkspaceSearchTestApi();
  const entries = [
    { name: "Alpha.md", path: "notes/Alpha.md", content: "stream match" },
    { name: "Beta.md", path: "notes/Beta.md", content: "stream match" }
  ];
  let secondReadStarted = false;
  const callbacks = [];
  const deps = {
    readEntryContent: async (entry) => {
      if (entry.path === "notes/Beta.md") {
        secondReadStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return entry.content;
    },
    parseFrontmatter: () => ({ frontmatter: null }),
    getFileTagsFromContent: () => []
  };

  const results = await api.runSearch(entries, { query: "stream" }, deps, (result, partialResults) => {
    callbacks.push({ path: result.path, count: partialResults.length, secondReadStarted });
  });

  assert.equal(results.length, 2);
  assert.deepEqual(callbacks.map((callback) => callback.path), ["notes/Alpha.md", "notes/Beta.md"]);
  assert.deepEqual(callbacks[0], { path: "notes/Alpha.md", count: 1, secondReadStarted: false });
  assert.deepEqual(callbacks[1], { path: "notes/Beta.md", count: 2, secondReadStarted: true });
});

test("workspace search can stop and keep partial results", async () => {
  const api = loadWorkspaceSearchTestApi();
  const entries = [
    { name: "Alpha.md", path: "notes/Alpha.md", content: "stop match" },
    { name: "Beta.md", path: "notes/Beta.md", content: "stop match" }
  ];
  const reads = [];
  let stopped = false;
  const deps = {
    readEntryContent: async (entry) => {
      reads.push(entry.path);
      return entry.content;
    },
    parseFrontmatter: () => ({ frontmatter: null }),
    getFileTagsFromContent: () => []
  };

  const results = await api.runSearch(entries, { query: "stop" }, deps, () => {
    stopped = true;
  }, () => stopped);

  assert.equal(results.length, 1);
  assert.equal(results[0].path, "notes/Alpha.md");
  assert.deepEqual(reads, ["notes/Alpha.md"]);
});

test("workspace search match offsets use editor-normalized line endings", () => {
  const api = loadWorkspaceSearchTestApi();
  const content = "one\r\ntwo\r\nconsole.info(formatEntry(entry));";
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const matches = api.findLiteralMatches(content, "console.info(formatEntry(entry));", false);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].lineNumber, 3);
  assert.equal(matches[0].index, normalizedContent.indexOf("console.info(formatEntry(entry));"));
  assert.equal(normalizedContent.slice(matches[0].index, matches[0].index + matches[0].length), "console.info(formatEntry(entry));");
});

test("workspace replace preview keeps source content unchanged until apply", () => {
  const api = loadWorkspaceSearchTestApi();
  const result = {
    entry: { path: "alpha.md" },
    name: "alpha.md",
    path: "alpha.md",
    content: "alpha beta alpha",
    matches: api.findLiteralMatches("alpha beta alpha", "alpha", false)
  };

  const preview = api.previewReplace([result], { query: "alpha", replacement: "omega" });

  assert.equal(result.content, "alpha beta alpha");
  assert.equal(preview.totalMatches, 2);
  assert.equal(preview.files[0].nextContent, "omega beta omega");
});

test("sidebar AI view opens the right sidebar AI panel", () => {
  const harness = createSidebarViewHarness();
  const module = loadWorkspaceSearchModule({ app: harness.app, document: harness.document });

  module.setSidebarView("ai-companion");

  assert.deepEqual(harness.aiCompanionPanel.openCalls.map((call) => call.open), [true]);
  assert.equal(harness.aiCompanionPanel.openCalls[0].workspace, undefined);
  assert.equal(harness.folderTreeRoot.hidden, false);
  assert.equal(harness.folderTreePane.classList.contains("ai-companion-workspace-rail"), false);
});

test("normal sidebar views close AI workspace before activating", () => {
  const harness = createSidebarViewHarness();
  const module = loadWorkspaceSearchModule({ app: harness.app, document: harness.document });

  module.setSidebarView("ai-companion");
  module.setSidebarView("search");
  module.setSidebarView("api-client");

  assert.equal(harness.aiCompanionPanel.closeCalls, 2);
  assert.equal(harness.workspaceSearchPanel.hidden, true);
  assert.equal(harness.apiClientPanel.hidden, false);
  assert.equal(harness.buttons.find((button) => button.dataset.sidebarView === "api-client").getAttribute("aria-pressed"), "true");
});

test("Regex-Tester sidebar replaces folder content and clears other rail selections", () => {
  const harness = createSidebarViewHarness();
  const module = loadWorkspaceSearchModule({ app: harness.app, document: harness.document });

  module.setSidebarView("regex-tester");

  assert.equal(harness.folderTreeRoot.hidden, true);
  assert.equal(harness.regexTesterPanel.hidden, false);
  assert.equal(harness.regexButton.classList.contains("active"), true);
  assert.equal(harness.regexButton.getAttribute("aria-pressed"), "true");
  assert.equal(harness.buttons.some((button) => button.classList.contains("active")), false);
  assert.equal(module.getActiveSidebarView(), "regex-tester");
  assert.equal(harness.folderTreeTopbar.hidden, true);

  module.setSidebarView("files");

  assert.equal(harness.folderTreeRoot.hidden, false);
  assert.equal(harness.regexTesterPanel.hidden, true);
  assert.equal(harness.regexButton.classList.contains("active"), false);
  assert.equal(harness.folderTreeTopbar.hidden, false);
});

test("search and git sidebars hide the folder toolbar until the folder view is restored", () => {
  const harness = createSidebarViewHarness();
  const module = loadWorkspaceSearchModule({ app: harness.app, document: harness.document });

  module.setSidebarView(harness.buttons[1].dataset.sidebarView);
  assert.equal(harness.folderTreeTopbar.hidden, true);

  module.setSidebarView(harness.buttons[0].dataset.sidebarView);
  assert.equal(harness.folderTreeTopbar.hidden, false);

  module.setSidebarView(harness.buttons[2].dataset.sidebarView);
  assert.equal(harness.folderTreeTopbar.hidden, true);

  module.setSidebarView(harness.buttons[0].dataset.sidebarView);
  assert.equal(harness.folderTreeTopbar.hidden, false);
});

test("AI workspace entry lives on the rail without panel maximize controls", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");

  assert.match(html, /sidebar-ai-companion-rail-button/);
  assert.match(html, /data-sidebar-view="ai-companion"/);
  assert.doesNotMatch(html, /ai-companion-workspace-maximize/);
  assert.doesNotMatch(html, /ai-companion-workspace-restore/);
});
