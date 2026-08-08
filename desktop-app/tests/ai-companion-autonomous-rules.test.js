"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { RuleCatalog } = require("../resources/ai-companion/orchestration/autonomous/rules/rule-catalog");
const { matchesRule } = require("../resources/ai-companion/orchestration/autonomous/rules/rule-path-matcher");
const { ToolPathObserver } = require("../resources/ai-companion/orchestration/autonomous/rules/tool-path-observer");

async function createRoots(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-scoped-rules-"));
  const workspaceRoot = path.join(parent, "workspace");
  const profileRoot = path.join(parent, "profile");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(profileRoot, { recursive: true });
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  return { workspaceRoot, profileRoot };
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

test("rules load in user, workspace, and hierarchical order", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.profileRoot, "companion", "rules", "base.md"), "User rule.");
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "base.md"), "Workspace rule.");
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "javascript.md"), [
    "---", "paths:", "  - src/**/*.js", "---", "JavaScript rule."
  ].join("\n"));
  await write(path.join(roots.workspaceRoot, "AGENTS.md"), "Workspace hierarchy rule.");
  await write(path.join(roots.workspaceRoot, "src", "AGENTS.md"), "Source hierarchy rule.");

  const catalog = new RuleCatalog({ ...roots });
  await catalog.load(path.join(roots.workspaceRoot, "src", "feature", "index.js"));
  const contents = catalog.activeInstructions().map((entry) => entry.content);

  assert.deepEqual(contents, [
    "User rule.", "Workspace rule.", "Workspace hierarchy rule.",
    "Source hierarchy rule.", "JavaScript rule."
  ]);
});

test("path-scoped rules activate lazily from declared tool paths", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "tests.md"), [
    "---", "paths: tests/**/*.js", "exclude: tests/fixtures/**", "---", "Test-file rule."
  ].join("\n"));
  const catalog = new RuleCatalog({ ...roots });
  const observer = new ToolPathObserver(catalog);
  await catalog.load();
  catalog.activeInstructions({ markInjected: true });

  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Test-file rule."), false);
  await observer.beforeTool("read_file", { path: "tests/fixtures/sample.js" }, { rulePaths: { arguments: ["path"], results: [] } });
  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Test-file rule."), false);
  await observer.afterTool("search_text", {}, [{ path: "tests/unit/sample.js" }], { rulePaths: { arguments: [], results: ["[].path"] } });

  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Test-file rule."), true);
  assert.equal(catalog.consumeActivated().length, 1);
  assert.equal(catalog.consumeActivated().length, 0);
});

test("tools without declared path fields cannot activate scoped rules", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "source.md"), [
    "---", "paths: src/**", "---", "Source rule."
  ].join("\n"));
  const catalog = new RuleCatalog({ ...roots });
  const observer = new ToolPathObserver(catalog);
  await catalog.load();
  await observer.afterTool("capability_search", {}, { path: "src/private.js" }, { rulePaths: { arguments: [], results: [] } });

  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Source rule."), false);
});

test("file enumeration results do not activate scoped rules", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "source.md"), [
    "---", "paths: src/**", "---", "Source rule."
  ].join("\n"));
  const catalog = new RuleCatalog({ ...roots });
  const observer = new ToolPathObserver(catalog);
  await catalog.load();
  await observer.afterTool("glob_files", {}, ["README.md", "src/index.js"], { rulePaths: { arguments: [], results: [] } });

  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Source rule."), false);
});

test("imports are bounded to their rule directory and refresh reloads current content", async (t) => {
  const roots = await createRoots(t);
  const rulesRoot = path.join(roots.workspaceRoot, ".md-editor", "rules");
  const fragment = path.join(rulesRoot, "shared", "fragment.txt");
  await write(fragment, "Imported first version.");
  await write(path.join(rulesRoot, "main.md"), [
    "---", "imports: shared/fragment.txt", "---", "Primary rule."
  ].join("\n"));
  const events = [];
  const catalog = new RuleCatalog({ ...roots }, (event) => events.push(event));
  await catalog.load();
  assert.match(catalog.activeInstructions()[0].content, /Imported first version/);

  await fs.writeFile(fragment, "Imported second version.", "utf8");
  const refreshed = await catalog.refresh();
  assert.match(refreshed.active[0].content, /Imported second version/);
  assert.equal(events.some((event) => event.type === "rules-refreshed"), true);
});

test("glob matching honors include and exclude patterns", () => {
  const rule = { paths: ["src/**/*.js"], exclude: ["src/generated/**"] };
  assert.equal(matchesRule(rule, "src/index.js"), true);
  assert.equal(matchesRule(rule, "src/lib/index.js"), true);
  assert.equal(matchesRule(rule, "src/generated/index.js"), false);
  assert.equal(matchesRule(rule, "tests/index.js"), false);
});

test("one invalid hierarchical rule is reported without aborting other rules", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "base.md"), "Usable rule.");
  await write(path.join(roots.workspaceRoot, "AGENTS.md"), [
    "---", "paths: [", "---", "Invalid rule."
  ].join("\n"));
  const events = [];
  const catalog = new RuleCatalog({ ...roots }, (event) => events.push(event));

  await catalog.load();

  assert.equal(catalog.activeInstructions().some((entry) => entry.content === "Usable rule."), true);
  assert.equal(events.some((event) => event.type === "rule-unavailable"), true);
});

test("imports reject cycles, duplicates, escapes, binary data, and oversized rules", async (t) => {
  const roots = await createRoots(t);
  const rulesRoot = path.join(roots.workspaceRoot, ".md-editor", "rules");
  await write(path.join(rulesRoot, "cycle.md"), ["---", "imports: cycle.txt", "---", "Cycle root."].join("\n"));
  await write(path.join(rulesRoot, "cycle.txt"), ["---", "imports: cycle.md", "---", "Cycle fragment."].join("\n"));
  await write(path.join(rulesRoot, "duplicate.md"), ["---", "imports: [shared.txt, shared.txt]", "---", "Duplicate root."].join("\n"));
  await write(path.join(rulesRoot, "shared.txt"), "Shared fragment.");
  await write(path.join(rulesRoot, "escaped.md"), ["---", "imports: ../outside.txt", "---", "Escaped root."].join("\n"));
  await fs.writeFile(path.join(rulesRoot, "binary.dat"), Buffer.from([65, 0, 66]));
  await write(path.join(rulesRoot, "binary.md"), ["---", "imports: binary.dat", "---", "Binary root."].join("\n"));
  await write(path.join(rulesRoot, "oversized.md"), "x".repeat(131073));
  const events = [];
  const catalog = new RuleCatalog({ ...roots }, (event) => events.push(event));

  await catalog.load();

  const reasons = events.filter((event) => event.type === "rule-unavailable").map((event) => event.reason).join("\n");
  assert.match(reasons, /cycle detected/i);
  assert.match(reasons, /duplicate rule import/i);
  assert.match(reasons, /within the owning rule directory|escape/i);
  assert.match(reasons, /binary data/i);
  assert.match(reasons, /131072 character limit/i);
});

test("parallel path observations activate a rule once", async (t) => {
  const roots = await createRoots(t);
  await write(path.join(roots.workspaceRoot, ".md-editor", "rules", "source.md"), [
    "---", "paths: src/**", "---", "Source rule."
  ].join("\n"));
  const events = [];
  const catalog = new RuleCatalog({ ...roots }, (event) => events.push(event));
  const observer = new ToolPathObserver(catalog);
  await catalog.load();

  await Promise.all([
    observer.beforeTool("read_file", { path: "src/index.js" }, { rulePaths: { arguments: ["path"], results: [] } }),
    observer.beforeTool("read_file", { path: "src/index.js" }, { rulePaths: { arguments: ["path"], results: [] } })
  ]);

  assert.equal(events.filter((event) => event.type === "rule-activated" && event.scope === "workspace").length, 1);
});
