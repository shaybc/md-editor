"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { _test } = require("../resources/ai-companion/core/agent-tool-loop");
const { summarizeToolEvidence, extractEvidenceContent } = _test;

test("git compare evidence surfaces the actual diff, not the short label", () => {
  const diff = "@@ -1 +1 @@\n-old\n+new conformance section";
  const summary = summarizeToolEvidence("git_diff", { diff });
  assert.match(summary, /new conformance section/, "verifier must be able to quote the comparison content");
  assert.notEqual(summary, "comparison ready");
});

test("read_file evidence surfaces file content", () => {
  const summary = summarizeToolEvidence("read_file", { startLine: 1, endLine: 5, content: "# Section 2\nIntent contracts and task classifications" });
  assert.match(summary, /Intent contracts/);
});

test("a content-less result falls back to the short UI summary", () => {
  assert.equal(summarizeToolEvidence("git_diff", {}), "comparison ready");
  assert.equal(extractEvidenceContent("git_diff", {}), "", "no citable content when result is empty");
});

test("non-content tools keep their terse summary", () => {
  assert.equal(summarizeToolEvidence("git_status", { counts: { files: 24 } }), "24 changed file(s)");
});

test("changes digest and search surface content when present", () => {
  const digest = summarizeToolEvidence("git_changes_digest", { digest: { files: ["a.js", "b.js"], clean: false } });
  assert.match(digest, /a\.js/);
  const search = summarizeToolEvidence("search_text", { matches: [{ file: "x.js", line: 3, text: "intentContract" }] });
  assert.match(search, /intentContract/);
});
