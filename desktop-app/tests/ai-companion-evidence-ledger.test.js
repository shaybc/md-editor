"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CANDIDATE_EVIDENCE_ID,
  createCompletionEvidenceLedger,
  isEvidenceAdmissible
} = require("../resources/ai-companion/core/completion-evidence-ledger");

test("completion evidence ledger assigns stable ids and one candidate entry", () => {
  const ledger = createCompletionEvidenceLedger();
  const first = ledger.recordToolEvidence({ toolCallId: "read-1", tool: "read_file", result: { content: "ok" }, summary: "Read a.js" });
  ledger.recordCandidateEvidence("candidate one");
  ledger.recordCandidateEvidence("candidate two");

  assert.equal(first.id, "EV1");
  assert.equal(isEvidenceAdmissible(first), true);
  assert.equal(ledger.listEvidence().filter((entry) => entry.id === CANDIDATE_EVIDENCE_ID).length, 1);
});

test("completion evidence ledger records files actually read or edited for localization metrics", () => {
  const ledger = createCompletionEvidenceLedger();
  const read = ledger.recordToolEvidence({ toolCallId: "read-local", tool: "read_file", args: { path: "src\\app.js" }, result: { content: "ok" } });
  const tabs = ledger.recordToolEvidence({ toolCallId: "tabs-local", tool: "read_open_tabs", result: { tabs: [{ path: "README.md" }] } });
  const editorWrite = ledger.recordToolEvidence({ toolCallId: "write-local", tool: "create_document_tab", args: { path: "docs\\guide.md" }, result: { status: "success" } });
  const search = ledger.recordToolEvidence({ toolCallId: "search-local", tool: "search_text", args: { path: "src" }, result: [] });
  assert.deepEqual(read.files, ["src/app.js"]);
  assert.deepEqual(tabs.files, ["README.md"]);
  assert.deepEqual(editorWrite.files, ["docs/guide.md"]);
  assert.equal(search.files, undefined);
});

test("failed denied and not-executed operations are inadmissible", () => {
  const ledger = createCompletionEvidenceLedger();
  const failed = ledger.recordToolEvidence({ toolCallId: "f1", tool: "run_test", error: new Error("crashed") });
  const denied = ledger.recordToolEvidence({ toolCallId: "f2", tool: "write_file", error: { code: "approval-denied", message: "denied" } });
  const skipped = ledger.recordToolEvidence({ toolCallId: "f3", tool: "run_command", result: { executed: false } });

  assert.deepEqual([failed.outcome, denied.outcome, skipped.outcome], ["failed", "denied", "not-executed"]);
  assert.equal([failed, denied, skipped].some(isEvidenceAdmissible), false);
});

test("truncation uses tool-specific confirmation instead of rejecting the whole entry", () => {
  const ledger = createCompletionEvidenceLedger();
  const confirmed = ledger.recordToolEvidence({
    toolCallId: "test-1",
    tool: "run_test",
    result: { exitCode: 0, stdout: "...[truncated]" },
    summary: "Tests passed"
  });
  const boundedRead = ledger.recordToolEvidence({
    toolCallId: "read-1",
    tool: "read_file",
    result: { content: "...[truncated]", truncated: true },
    summary: "Read partial file"
  });

  assert.equal(isEvidenceAdmissible(confirmed), true);
  assert.equal(isEvidenceAdmissible(boundedRead), true, "a successful bounded read is admissible; semantic completeness is judged by the assessor");
  assert.equal(confirmed.confirmationSource, "exit-status");
});

test("mutations require a post-mutation comparison to establish verified state", () => {
  const ledger = createCompletionEvidenceLedger();
  const unverified = ledger.recordToolEvidence({ toolCallId: "w1", tool: "write_file", result: { success: true }, summary: "Wrote file" });
  const verified = ledger.recordToolEvidence({
    toolCallId: "w2",
    tool: "apply_edit",
    result: { success: true },
    summary: "Edited file",
    mutationDetails: { compare: { changed: true } }
  });

  assert.equal(isEvidenceAdmissible(unverified), false);
  assert.equal(isEvidenceAdmissible(verified), true);
  assert.equal(verified.confirmationSource, "post-mutation-comparison");
});
