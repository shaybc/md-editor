const assert = require("node:assert/strict");
const test = require("node:test");

const { parseGitSummaryResponse } = require("../resources/ai-companion/modes/git-summary/response-parser");
const { buildGitSummaryUserMessage, GIT_SUMMARY_SYSTEM_PROMPT, MAX_USER_MESSAGE_CHARS } = require("../resources/ai-companion/modes/git-summary/prompt");
const { normalizeAiCompanionSettings, DEFAULT_AI_COMPANION_SETTINGS } = require("../resources/ai-companion/config/defaults");

test("git summary settings default to enabled and normalize opt-out", () => {
  assert.equal(DEFAULT_AI_COMPANION_SETTINGS.gitSummaryEnabled, true);
  assert.equal(normalizeAiCompanionSettings({}).gitSummaryEnabled, true);
  assert.equal(normalizeAiCompanionSettings({ gitSummaryEnabled: false }).gitSummaryEnabled, false);
});

test("git summary response parser accepts bare JSON", () => {
  const result = parseGitSummaryResponse('{"commitSubject":"Add thing","commitBody":"- did it","summaryMarkdown":"## What Changed Locally\\n- did it"}');
  assert.equal(result.parsed, true);
  assert.equal(result.commitSubject, "Add thing");
  assert.equal(result.commitBody, "- did it");
  assert.match(result.summaryMarkdown, /What Changed Locally/);
});

test("git summary response parser accepts fenced and prose-wrapped JSON", () => {
  const fenced = parseGitSummaryResponse('```json\n{"commitSubject":"S","commitBody":"","summaryMarkdown":"## Git State"}\n```');
  assert.equal(fenced.parsed, true);
  assert.equal(fenced.commitSubject, "S");
  const wrapped = parseGitSummaryResponse('Here is the result:\n{"commitSubject":"W","commitBody":"","summaryMarkdown":"x"}\nThanks!');
  assert.equal(wrapped.parsed, true);
  assert.equal(wrapped.commitSubject, "W");
});

test("git summary response parser keeps multi-line subjects to one line", () => {
  const result = parseGitSummaryResponse('{"commitSubject":"First line\\nSecond line","commitBody":"","summaryMarkdown":"x"}');
  assert.equal(result.commitSubject, "First line");
});

test("git summary response parser falls back to raw text on malformed JSON", () => {
  const result = parseGitSummaryResponse("## What Changed Locally\n- something (not json)");
  assert.equal(result.parsed, false);
  assert.equal(result.commitSubject, "");
  assert.match(result.summaryMarkdown, /What Changed Locally/);
});

test("git summary prompt renders digest sections and scope", () => {
  const message = buildGitSummaryUserMessage({
    branch: "feature/x",
    tracking: "origin/feature/x",
    ahead: 2,
    behind: 0,
    clean: false,
    commitScope: "staged",
    unpushedCommits: [{ hash: "abc1234", date: "2026-07-01", author: "shay", subject: "Earlier work" }],
    unpushedStat: " file.md | 2 +-",
    unpushedPatch: "diff --git a/file.md b/file.md\n+new",
    stagedStat: " staged.md | 1 +",
    stagedPatch: "diff --git a/staged.md b/staged.md\n+line",
    unstagedStat: "",
    unstagedPatch: "",
    untracked: [{ path: "new.md", content: "hello", binary: false }],
    truncated: []
  });
  assert.match(message, /branch: feature\/x/);
  assert.match(message, /commitScope: staged/);
  assert.match(message, /abc1234 2026-07-01 shay: Earlier work/);
  assert.match(message, /### Staged changes/);
  assert.match(message, /diff --git a\/staged.md/);
  assert.match(message, /- new.md/);
  assert.match(GIT_SUMMARY_SYSTEM_PROMPT, /commitScope/);
  assert.match(GIT_SUMMARY_SYSTEM_PROMPT, /JSON object/);
});

test("git summary prompt drops patch bodies before stat lines when over budget", () => {
  const hugePatch = `diff --git a/big.md b/big.md\n${"+x\n".repeat(80000)}`;
  const message = buildGitSummaryUserMessage({
    branch: "main",
    tracking: "origin/main",
    commitScope: "all",
    unpushedCommits: [],
    unpushedStat: "",
    unpushedPatch: hugePatch,
    stagedStat: " staged.md | 1 +",
    stagedPatch: "diff --git a/staged.md b/staged.md\n+line",
    unstagedStat: " big.md | 80000 +",
    unstagedPatch: hugePatch,
    untracked: [],
    truncated: []
  });
  assert.ok(message.length <= MAX_USER_MESSAGE_CHARS + 4096);
  assert.match(message, /staged.md \| 1 \+/);
  assert.match(message, /big.md \| 80000 \+/);
  assert.match(message, /diff --git a\/staged.md/);
});
