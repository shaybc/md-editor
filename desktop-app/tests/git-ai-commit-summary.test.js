const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadGitAiCommitSummaryTestApi(deps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/git/ai-commit-summary.js"), "utf8");
  const sandbox = {
    console,
    navigator: {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  const app = { modules: {}, registerModule: function(name, moduleApi) { this.modules[name] = moduleApi; } };
  return sandbox.registerMarkdownViewerGitAiCommitSummary(app, deps)._test;
}

test("git ai summary is only visible on desktop with AI and git summaries enabled", () => {
  const api = loadGitAiCommitSummaryTestApi();
  assert.equal(api.computeVisibility({ enabled: true, gitSummaryEnabled: true }, true), true);
  assert.equal(api.computeVisibility({ enabled: true, gitSummaryEnabled: false }, true), false);
  assert.equal(api.computeVisibility({ enabled: false, gitSummaryEnabled: true }, true), false);
  assert.equal(api.computeVisibility({ enabled: true, gitSummaryEnabled: true }, false), false);
  assert.equal(api.computeVisibility(null, true), false);
});

test("git ai summary offers generation for dirty trees or unpushed commits only", () => {
  const api = loadGitAiCommitSummaryTestApi();
  assert.equal(api.shouldOfferGeneration({ files: [{ path: "a.md" }], ahead: 0 }), true);
  assert.equal(api.shouldOfferGeneration({ files: [], ahead: 2 }), true);
  assert.equal(api.shouldOfferGeneration({ files: [], ahead: 0 }), false);
  assert.equal(api.shouldOfferGeneration(null), true);
});

test("git ai summary builds subject plus body commit messages", () => {
  const api = loadGitAiCommitSummaryTestApi();
  assert.equal(api.buildCommitMessageText("Subject", "- bullet"), "Subject\n\n- bullet");
  assert.equal(api.buildCommitMessageText("Subject", ""), "Subject");
  assert.equal(api.buildCommitMessageText("", "- bullet"), "");
});

test("git ai summary never overwrites user-typed commit text", () => {
  const api = loadGitAiCommitSummaryTestApi();
  const policy = (current, generated, next) => JSON.parse(JSON.stringify(api.applyCommitMessagePolicy(current, generated, next)));
  assert.deepEqual(policy("", "", "New message"), { fill: true, offerInsert: false });
  assert.deepEqual(policy("Old AI text", "Old AI text", "New message"), { fill: true, offerInsert: false });
  assert.deepEqual(policy("typed by user", "Old AI text", "New message"), { fill: false, offerInsert: true });
  assert.deepEqual(policy("typed by user", "", ""), { fill: false, offerInsert: false });
});

test("git ai summary renders safe markdown for the summary block", () => {
  const api = loadGitAiCommitSummaryTestApi();
  const html = api.renderSummaryMarkdown([
    "## What Changed Locally",
    "- Restores preferences via the app modal instead of `window.confirm`.",
    "  - resets submenu `aria-expanded`",
    "<script>alert(1)</script>"
  ].join("\n"));
  assert.match(html, /workspace-git-ai-summary-heading/);
  assert.match(html, /<li>Restores preferences via the app modal instead of <code>window.confirm<\/code>.<\/li>/);
  assert.match(html, /<ul class="workspace-git-ai-summary-list"><li>Restores/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("git ai summary formats streamed tool progress", () => {
  const api = loadGitAiCommitSummaryTestApi();
  assert.equal(api.formatToolProgress({ type: "tool", tool: "read_file", input: "js/app.js", summary: "1-160" }), "read_file: js/app.js 1-160");
  assert.equal(api.formatToolProgress({ type: "tool-error", tool: "glob", error: "bad pattern" }), "glob failed: bad pattern");
  assert.equal(api.formatToolProgress({ type: "content-delta", content: "x" }), "");
  assert.equal(api.formatToolProgress(null), "");
});
