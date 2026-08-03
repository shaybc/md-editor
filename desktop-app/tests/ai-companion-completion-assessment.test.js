"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ASSESS_ACCEPTANCE_CRITERIA_TOOL,
  assessAcceptanceCriteria,
  renderAssessmentSection
} = require("../resources/ai-companion/core/completion-assessment");
const {
  REWRITE_ASSESSED_CANDIDATE_TOOL,
  rewriteIncompleteCandidate
} = require("../resources/ai-companion/core/completion-response-rewrite");
const {
  CANDIDATE_EVIDENCE_ID,
  createCompletionEvidenceLedger
} = require("../resources/ai-companion/core/completion-evidence-ledger");
const {
  extractProposedPlanBody,
  insertPlanAssessmentSection,
  normalizeProposedPlanBlock
} = require("../resources/ai-companion/core/plan-finalization");

const contract = {
  taskType: "answer",
  goal: { value: "Explain the failure" },
  expectedOutcome: { value: "A grounded explanation" },
  acceptanceCriteria: [{ id: "AC1", description: "Explain the observed failure" }]
};

function assessmentMessage(overrides = {}) {
  const value = {
    overallStatus: "complete",
    criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "The response explains it.", claimType: "response-content" }],
    unmetSummary: "",
    ...overrides
  };
  return {
    content: "",
    toolCalls: [{ id: "assess-1", function: { name: "assess_acceptance_criteria", arguments: JSON.stringify(value) } }]
  };
}

function ledgerEntries(extra) {
  const ledger = createCompletionEvidenceLedger();
  if (extra) ledger.recordToolEvidence(extra);
  ledger.recordCandidateEvidence("The failure is caused by X.");
  return ledger.listEvidence();
}

test("assessment phase exposes only the forced assessment tool", async () => {
  const calls = [];
  const provider = { completeMessage: async (_messages, options) => { calls.push(options); return assessmentMessage(); } };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(result.assessment.overallStatus, "complete");
  assert.equal(calls[0].tools.length, 1);
  assert.equal(calls[0].tools[0].function.name, ASSESS_ACCEPTANCE_CRITERIA_TOOL.function.name);
  assert.deepEqual(calls[0].toolChoice, { type: "function", function: { name: "assess_acceptance_criteria" } });
});

test("a met verdict with no quoted evidence span downgrades to unmet (content grounding)", async () => {
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "claimed done", claimType: "response-content" }]
    })
  };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: ledgerEntries() });
  assert.equal(result.assessment.criteria[0].status, "unmet", "a met claim with no quote is not proof");
  assert.equal(result.assessment.overallStatus, "incomplete");
});

test("a conditional action cannot be met while the finding it depends on is unmet (coherence)", async () => {
  const coherenceContract = {
    taskType: "conformance",
    goal: { value: "Check the diff and update the doc if needed" },
    expectedOutcome: { value: "The doc is current" },
    acceptanceCriteria: [
      // comparison is a finding shape but NOT an inspection shape, so it is not auto-rescued
      { id: "AC1", shape: "conformance-comparison", description: "The diff was compared against the doc and gaps identified" },
      { id: "AC2", shape: "conditional-action", description: "If warranted, the required follow-up was completed" }
    ]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [
        { id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "The comparison was not actually performed", claimType: "workspace-state" },
        { id: "AC2", status: "met", evidenceQuote: "follow-up completed", evidenceIds: ["EV1"], explanation: "claimed done", claimType: "workspace-state" }
      ]
    })
  };
  const evidenceLedger = ledgerEntries({ tool: "apply_edit", toolCallId: "t1", args: { path: "doc.md" }, result: { compare: { before: "a", after: "b" } }, mutationDetails: { compare: { before: "a", after: "b" } }, summary: "edit applied" });
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: coherenceContract, candidate: "answer", evidenceLedger });
  const ac2 = result.assessment.criteria.find((criterion) => criterion.id === "AC2");
  assert.equal(ac2.status, "unmet", "AC2 must not be met while AC1 (its finding) is unmet");
  assert.equal(ac2.incoherenceDowngrade, true);
  assert.equal(result.assessment.overallStatus, "incomplete");
});

test("per-criterion mode issues one call per criterion, each scoped to a single criterion", async () => {
  const twoCrit = {
    taskType: "answer",
    goal: { value: "explain and list steps" },
    expectedOutcome: { value: "done" },
    acceptanceCriteria: [
      { id: "AC1", shape: "response-content", description: "the response explains the failure" },
      { id: "AC2", shape: "response-content", description: "the response lists next steps" }
    ]
  };
  const seen = [];
  const provider = {
    completeMessage: async (messages) => {
      seen.push(messages);
      const payload = JSON.parse(messages[1].content.split("\n\n")[0]);
      const id = payload.contract.acceptanceCriteria[0].id;
      return assessmentMessage({ criteria: [{ id, status: "met", evidenceQuote: "explained", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "ok", claimType: "response-content" }] });
    }
  };
  const result = await assessAcceptanceCriteria({ provider, settings: { intentPerCriterionAssessment: true }, prompts: {}, contract: twoCrit, candidate: "answer", evidenceLedger: ledgerEntries() });
  assert.equal(seen.length, 2, "one model call per criterion");
  for (const messages of seen) {
    const payload = JSON.parse(messages[1].content.split("\n\n")[0]);
    assert.equal(payload.contract.acceptanceCriteria.length, 1, "each call is scoped to a single criterion");
  }
  assert.equal(result.assessment.criteria.length, 2);
  assert.deepEqual(result.assessment.criteria.map((criterion) => criterion.status), ["met", "met"]);
});

test("per-criterion mode is off when the flag is disabled (single call)", async () => {
  const twoCrit = {
    taskType: "answer", goal: { value: "g" }, expectedOutcome: { value: "o" },
    acceptanceCriteria: [
      { id: "AC1", shape: "response-content", description: "explains" },
      { id: "AC2", shape: "response-content", description: "lists steps" }
    ]
  };
  let calls = 0;
  const provider = {
    completeMessage: async () => { calls += 1; return assessmentMessage({ criteria: [
      { id: "AC1", status: "met", evidenceQuote: "x", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "ok", claimType: "response-content" },
      { id: "AC2", status: "met", evidenceQuote: "y", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "ok", claimType: "response-content" }
    ] }); }
  };
  await assessAcceptanceCriteria({ provider, settings: { intentPerCriterionAssessment: false }, prompts: {}, contract: twoCrit, candidate: "answer", evidenceLedger: ledgerEntries() });
  assert.equal(calls, 1, "flag off keeps the single-call path");
});

test("deterministic fallback rescues an inspection criterion when the model cites only the candidate (live regression)", async () => {
  const inspectionContract = {
    taskType: "conformance",
    goal: { value: "check the latest git changes against the doc" },
    expectedOutcome: { value: "gaps are known" },
    acceptanceCriteria: [{ id: "AC1", shape: "conformance-inspection", description: "The latest git changes were inspected" }]
  };
  // Reproduce the weak-model failure: it labels the criterion response-content and cites
  // only EV-CANDIDATE-1 with no quote. The harness must still establish the inspection from
  // the succeeded git inspection tool rather than collapsing to a false unmet.
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "cited candidate only", claimType: "response-content" }]
    })
  };
  const evidenceLedger = ledgerEntries({ tool: "git_panel_compare_file", toolCallId: "g1", result: { status: "ok" }, summary: "diff: +new conformance section" });
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: inspectionContract, candidate: "answer", evidenceLedger });
  const ac1 = result.assessment.criteria[0];
  assert.equal(ac1.status, "met", "a succeeded inspection tool establishes that the inspection happened");
  assert.equal(ac1.deterministicFallback, true);
  assert.ok(ac1.evidenceIds.length > 0 && !ac1.evidenceIds.includes(CANDIDATE_EVIDENCE_ID), "cites the tool evidence, not the candidate");
});

test("inspection fallback does NOT fire for a change-claim finding (refinement)", async () => {
  const changeContract = {
    taskType: "diagnostic",
    goal: { value: "fix the uploader" },
    expectedOutcome: { value: "fixed" },
    acceptanceCriteria: [{ id: "AC1", shape: "diagnostic-finding", description: "the uploader retry root cause is fixed and verified" }]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "not fixed", claimType: "workspace-state" }]
    })
  };
  // A succeeded read tool exists, but the criterion asserts a FIX -- reading cannot establish it.
  const evidenceLedger = ledgerEntries({ tool: "read_file", toolCallId: "r1", args: { path: "uploader.js" }, result: { content: "code" }, summary: "code" });
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: changeContract, candidate: "answer", evidenceLedger });
  assert.equal(result.assessment.criteria[0].status, "unmet", "a 'fixed' finding must not be rescued by a mere read");
});

test("inspection fallback does NOT fire from an unrelated discovery tool (target relevance)", async () => {
  const gitContract = {
    taskType: "conformance",
    goal: { value: "check the latest git changes" },
    expectedOutcome: { value: "changes known" },
    acceptanceCriteria: [{ id: "AC1", shape: "conformance-inspection", description: "the latest git changes were inspected", mustInspect: ["git diff"] }]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "no git evidence", claimType: "workspace-state" }]
    })
  };
  // Only an unrelated tab read happened -- it is NOT git evidence, so the git-change criterion stays unmet.
  const evidenceLedger = ledgerEntries({ tool: "read_open_tabs", toolCallId: "t1", result: { tabs: [] }, summary: "0 tab(s)" });
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: gitContract, candidate: "answer", evidenceLedger });
  assert.equal(result.assessment.criteria[0].status, "unmet", "an unrelated discovery read must not satisfy a git-change inspection");
});

function noOpWriteLedger(comparisonMet = true) {
  const ledger = createCompletionEvidenceLedger();
  if (comparisonMet) ledger.recordToolEvidence({ tool: "git_panel_compare_file", toolCallId: "g1", result: { status: "ok" }, summary: "diff: +new section" });
  ledger.recordToolEvidence({ tool: "write_file", toolCallId: "w1", args: { path: "doc.md" }, error: { code: "APPROVAL_ACTION_NO_CHANGE", actionAnalysis: { operation: "no-op" }, message: "would not change" } });
  ledger.recordCandidateEvidence("answer");
  return ledger.listEvidence();
}

test("a no-op write satisfies a conditional-action criterion (no update warranted)", async () => {
  const contract = {
    taskType: "conformance",
    goal: { value: "check the git changes and update the doc if needed" },
    expectedOutcome: { value: "doc current" },
    acceptanceCriteria: [
      { id: "AC1", shape: "conformance-comparison", description: "the git changes were compared against the doc", mustInspect: ["git diff"] },
      { id: "AC2", shape: "conditional-action", description: "if warranted, doc.md was updated", mustInspect: ["doc.md"] }
    ]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [
        { id: "AC1", status: "met", evidenceQuote: "diff: +new section", evidenceIds: ["EV1"], explanation: "compared", claimType: "workspace-state" },
        { id: "AC2", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "no write happened", claimType: "workspace-state" }
      ]
    })
  };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: noOpWriteLedger(true) });
  const ac2 = result.assessment.criteria.find((criterion) => criterion.id === "AC2");
  assert.equal(ac2.status, "met", "a no-op on the target means no update was warranted");
  assert.equal(ac2.noActionWarranted, true);
  assert.equal(result.assessment.overallStatus, "complete");
});

test("a no-op does NOT satisfy a required-change criterion", async () => {
  const contract = {
    taskType: "implementation",
    goal: { value: "add a section to the doc" },
    expectedOutcome: { value: "section added" },
    acceptanceCriteria: [{ id: "AC1", shape: "ears-event", description: "when built, doc.md gains the new section", mustInspect: ["doc.md"] }]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "no change made", claimType: "workspace-state" }]
    })
  };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: noOpWriteLedger(false) });
  assert.equal(result.assessment.criteria[0].status, "unmet", "a required change is not satisfied by a no-op");
});

test("no-op conditional satisfaction is still gated by coherence (unverified comparison)", async () => {
  const contract = {
    taskType: "conformance",
    goal: { value: "compare and update if needed" },
    expectedOutcome: { value: "current" },
    acceptanceCriteria: [
      { id: "AC1", shape: "conformance-comparison", description: "the git changes were compared against the doc", mustInspect: ["git diff"] },
      { id: "AC2", shape: "conditional-action", description: "if warranted, doc.md was updated", mustInspect: ["doc.md"] }
    ]
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [
        { id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "comparison not established", claimType: "workspace-state" },
        { id: "AC2", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "", claimType: "workspace-state" }
      ]
    })
  };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: noOpWriteLedger(false) });
  const ac2 = result.assessment.criteria.find((criterion) => criterion.id === "AC2");
  assert.equal(ac2.status, "unmet", "cannot claim 'no update warranted' without a verified comparison");
});

test("inspection fallback matches an absolute-path criterion target against relative evidence", async () => {
  const absPath = "C:/GitHub/shaybc/md-editor/desktop-app/help/developer/22-x.md";
  const contract = {
    taskType: "conformance",
    goal: { value: "check the developer guide" },
    expectedOutcome: { value: "known" },
    acceptanceCriteria: [{ id: "AC1", shape: "conformance-inspection", description: `the file ${absPath} was inspected`, mustInspect: [absPath] }],
    namedTargets: { files: [{ id: "T1", value: absPath, kind: "file-path" }] }
  };
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "unmet", evidenceQuote: "", evidenceIds: [], explanation: "no", claimType: "workspace-state" }]
    })
  };
  // Evidence records the RELATIVE path; the criterion cites the ABSOLUTE path.
  const evidenceLedger = ledgerEntries({ tool: "read_file", toolCallId: "r1", args: { path: "desktop-app/help/developer/22-x.md" }, result: { content: "guide" }, summary: "guide content" });
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger });
  assert.equal(result.assessment.criteria[0].status, "met", "absolute criterion target must match relative read evidence");
  assert.equal(result.assessment.criteria[0].deterministicFallback, true);
});

test("unverified intent bypasses the model assessor and cannot claim completion", async () => {
  let calls = 0;
  const provider = { completeMessage: async () => { calls += 1; return assessmentMessage(); } };
  const unverifiedContract = { ...contract, verifiability: "unverified" };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: unverifiedContract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(calls, 0);
  assert.equal(result.assessment.overallStatus, "unverified");
  assert.equal(result.assessment.criteria[0].status, "unverified");
  assert.match(renderAssessmentSection(unverifiedContract, result.assessment), /Unverified result:/);
});

test("a met reduced contract is capped at provisional completion", async () => {
  const provider = { completeMessage: async () => assessmentMessage() };
  const provisionalContract = { ...contract, verifiability: "provisional" };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: provisionalContract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(result.assessment.criteria[0].status, "met");
  assert.equal(result.assessment.overallStatus, "provisional");
  assert.match(renderAssessmentSection(provisionalContract, result.assessment), /Provisional result:/);
});

test("assessment receives named locations and harness-owned location evidence rules", async () => {
  const calls = [];
  const locationContract = {
    ...contract,
    requestedActions: [{ id: "RA1", value: "Link the guide", provenance: "explicit" }],
    namedTargets: {
      files: [], symbols: [], errors: [],
      uiAreas: [{ id: "UI1", kind: "ui-area", value: "developer help pages", provenance: "explicit" }]
    }
  };
  const provider = {
    completeMessage: async (messages) => {
      calls.push(messages);
      return assessmentMessage();
    }
  };

  await assessAcceptanceCriteria({ provider, settings: {}, prompts: { completionAssessmentSystem: "Custom assessor." }, contract: locationContract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.match(calls[0][0].content, /location-specific criterion is met only by evidence from that exact requested location/);
  assert.match(calls[0][0].content, /Opening a file directly proves only that it was opened/);
  const payload = JSON.parse(calls[0][1].content);
  assert.equal(payload.contract.namedTargets.uiAreas[0].value, "developer help pages");
  assert.equal(payload.contract.requestedActions[0].value, "Link the guide");
});

test("candidate evidence alone cannot establish a workspace-state claim", async () => {
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [CANDIDATE_EVIDENCE_ID], explanation: "Claimed complete.", claimType: "workspace-state" }]
    })
  };
  const workspaceContract = { ...contract, taskType: "diagnostic" };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: workspaceContract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(result.assessment.criteria[0].status, "unmet");
  assert.equal(result.assessment.overallStatus, "incomplete");
  assert.equal(result.assessment.criteria[0].harnessClaimType, "mixed");
  assert.equal(result.assessment.criteria[0].modelClaimType, "workspace-state");
});

test("failed tool evidence cannot establish a met criterion", async () => {
  const evidenceLedger = ledgerEntries({ toolCallId: "test-1", tool: "run_test", error: new Error("failed") });
  const failedId = evidenceLedger.find((entry) => entry.source === "tool").id;
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [failedId], explanation: "Tests prove it.", claimType: "workspace-state" }]
    })
  };
  const workspaceContract = { ...contract, taskType: "diagnostic" };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: workspaceContract, candidate: "answer", evidenceLedger });

  assert.equal(result.assessment.criteria[0].status, "unmet");
});

test("the recorded Git false-success task remains incomplete without diff evidence", async () => {
  const fixture = require("./fixtures/close-false-success-git-task.json");
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{
        id: "AC1",
        status: "met",
        evidenceQuote: "the changes were checked",
        evidenceIds: ["EV1", CANDIDATE_EVIDENCE_ID],
        explanation: "The response says the changes were checked.",
        claimType: "response-content"
      }]
    })
  };
  const result = await assessAcceptanceCriteria({
    provider,
    settings: {},
    prompts: {},
    contract: fixture.contract,
    candidate: "The changes were checked and the documentation is current.",
    evidenceLedger: fixture.evidenceLedger
  });

  assert.equal(result.assessment.criteria[0].harnessClaimType, "workspace-state");
  assert.equal(result.assessment.criteria[0].status, "unmet");
  assert.equal(result.assessment.overallStatus, "incomplete");
});

test("Git change claims require a succeeded digest or compare-file result", async () => {
  const gitContract = {
    ...contract,
    taskType: "diagnostic",
    acceptanceCriteria: [{ id: "AC1", description: "The actual Git changes are inspected" }]
  };
  const evidenceLedger = ledgerEntries({
    toolCallId: "digest-1",
    tool: "git_panel_changes_digest",
    result: { status: "success" }
  });
  const digestId = evidenceLedger.find((entry) => entry.tool === "git_panel_changes_digest").id;
  const provider = {
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [digestId], explanation: "The diff digest establishes the changes.", claimType: "response-content" }]
    })
  };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract: gitContract, candidate: "answer", evidenceLedger });

  assert.equal(result.assessment.criteria[0].status, "met");
  assert.equal(result.assessment.criteria[0].harnessClaimType, "workspace-state");
});

test("file update claims require succeeded write evidence on the named file", async () => {
  const fileContract = {
    ...contract,
    taskType: "implementation",
    acceptanceCriteria: [{ id: "AC1", description: "README.md was updated" }],
    namedTargets: { files: [{ value: "README.md" }], symbols: [], errors: [], uiAreas: [] }
  };
  const ledger = createCompletionEvidenceLedger();
  const wrongFile = ledger.recordToolEvidence({
    toolCallId: "edit-1",
    tool: "apply_edit",
    args: { path: "notes.md" },
    result: { status: "success" },
    mutationDetails: { compare: {} }
  });
  const rightFile = ledger.recordToolEvidence({
    toolCallId: "edit-2",
    tool: "apply_edit",
    args: { path: "README.md" },
    result: { status: "success" },
    mutationDetails: { compare: {} }
  });
  const providerFor = (evidenceId) => ({
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [evidenceId], explanation: "The write establishes the update.", claimType: "workspace-state" }]
    })
  });

  const wrong = await assessAcceptanceCriteria({ provider: providerFor(wrongFile.id), settings: {}, prompts: {}, contract: fileContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });
  const right = await assessAcceptanceCriteria({ provider: providerFor(rightFile.id), settings: {}, prompts: {}, contract: fileContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });

  assert.equal(wrong.assessment.criteria[0].status, "unmet");
  assert.equal(right.assessment.criteria[0].status, "met");
});

test("file content claims require a succeeded read of the named file", async () => {
  const fileContract = {
    ...contract,
    acceptanceCriteria: [{ id: "AC1", description: "README.md contains the new guidance" }],
    namedTargets: { files: [{ value: "README.md" }], symbols: [], errors: [], uiAreas: [] }
  };
  const ledger = createCompletionEvidenceLedger();
  const wrongFile = ledger.recordToolEvidence({ toolCallId: "read-1", tool: "read_file", args: { path: "notes.md" }, result: { content: "guidance" } });
  const rightFile = ledger.recordToolEvidence({ toolCallId: "read-2", tool: "read_file", args: { path: "README.md" }, result: { content: "guidance" } });
  const providerFor = (evidenceId) => ({
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [evidenceId], explanation: "The read establishes the content.", claimType: "response-content" }]
    })
  });

  const wrong = await assessAcceptanceCriteria({ provider: providerFor(wrongFile.id), settings: {}, prompts: {}, contract: fileContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });
  const right = await assessAcceptanceCriteria({ provider: providerFor(rightFile.id), settings: {}, prompts: {}, contract: fileContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });

  assert.equal(wrong.assessment.criteria[0].status, "unmet");
  assert.equal(right.assessment.criteria[0].status, "met");
});

test("test and build outcomes require their matching succeeded execution tools", async () => {
  const ledger = createCompletionEvidenceLedger();
  const tests = ledger.recordToolEvidence({ toolCallId: "tests-1", tool: "run_tests", result: { success: true, exitCode: 0 } });
  const build = ledger.recordToolEvidence({ toolCallId: "build-1", tool: "compile_project", result: { success: true, exitCode: 0 } });
  const providerFor = (evidenceId) => ({
    completeMessage: async () => assessmentMessage({
      criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [evidenceId], explanation: "Execution succeeded.", claimType: "workspace-state" }]
    })
  });
  const testContract = { ...contract, taskType: "implementation", acceptanceCriteria: [{ id: "AC1", description: "The tests pass" }] };
  const buildContract = { ...contract, taskType: "implementation", acceptanceCriteria: [{ id: "AC1", description: "The build succeeds" }] };

  const wrong = await assessAcceptanceCriteria({ provider: providerFor(build.id), settings: {}, prompts: {}, contract: testContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });
  const testsMet = await assessAcceptanceCriteria({ provider: providerFor(tests.id), settings: {}, prompts: {}, contract: testContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });
  const buildMet = await assessAcceptanceCriteria({ provider: providerFor(build.id), settings: {}, prompts: {}, contract: buildContract, candidate: "answer", evidenceLedger: ledger.listEvidence() });

  assert.equal(wrong.assessment.criteria[0].status, "unmet");
  assert.equal(testsMet.assessment.criteria[0].status, "met");
  assert.equal(buildMet.assessment.criteria[0].status, "met");
});

test("invalid assessment is repaired once with a complete replacement", async () => {
  let call = 0;
  const provider = { completeMessage: async () => (++call === 1 ? { content: "", toolCalls: [] } : assessmentMessage()) };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(call, 2);
  assert.equal(result.assessment.overallStatus, "complete");
  assert.deepEqual(result.diagnostics[0].errorCodes, ["missing-forced-assessment-call"]);
});

test("two invalid assessment attempts deterministically fall back to all unmet", async () => {
  let call = 0;
  const provider = { completeMessage: async () => { call += 1; return { content: "", toolCalls: [] }; } };
  const result = await assessAcceptanceCriteria({ provider, settings: {}, prompts: {}, contract, candidate: "answer", evidenceLedger: ledgerEntries() });

  assert.equal(call, 2);
  assert.equal(result.assessment.overallStatus, "incomplete");
  assert.equal(result.assessment.criteria[0].status, "unmet");
  assert.match(result.assessment.warning, /failed validation/);
});

test("superseded-reference evidence cannot establish a corrected criterion", async () => {
  const correctedContract = {
    ...contract,
    amendments: [{ id: "AM1", applied: true, summary: "rename the guide", referenceReplacements: [{
      fieldRef: "target:T1", kind: "resource", superseded: ["old.md"],
      replacement: "help/new.md", replacementAliases: ["new.md"]
    }] }]
  };
  const ledger = createCompletionEvidenceLedger();
  const toolEvidence = ledger.recordToolEvidence({
    toolCallId: "edit-1", tool: "apply_edit", args: { path: "help/index.md" },
    result: { status: "success" }, mutationDetails: { compare: {} },
    referenceChecks: [{ amendmentId: "AM1", fieldRef: "target:T1", replacementFound: false, supersededFound: true, checkedLocations: ["post-state-content"] }]
  });
  ledger.recordCandidateEvidence("The guide was linked.");
  const provider = { completeMessage: async () => assessmentMessage({
    criteria: [{ id: "AC1", status: "met", evidenceQuote: "quoted evidence span", evidenceIds: [toolEvidence.id], explanation: "The edit linked it.", claimType: "workspace-state" }]
  }) };

  const result = await assessAcceptanceCriteria({
    provider, settings: {}, prompts: {}, contract: correctedContract,
    candidate: "The guide was linked.", evidenceLedger: ledger.listEvidence()
  });

  assert.equal(result.assessment.overallStatus, "incomplete");
  assert.ok(result.diagnostics[0].errorCodes.includes("superseded-reference-evidence"));
});

test("a final rewrite cannot restore an exact superseded resource", async () => {
  const correctedContract = {
    ...contract,
    amendments: [{ id: "AM1", applied: true, referenceReplacements: [{
      fieldRef: "target:T1", kind: "resource", superseded: ["old.md"],
      replacement: "help/new.md", replacementAliases: ["new.md"]
    }] }]
  };
  const provider = { completeMessage: async () => ({
    content: "",
    toolCalls: [{ id: "rewrite-1", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({
      content: "The incomplete work still targets old.md.", acknowledgedUnmetCriterionIds: ["AC1"]
    }) } }]
  }) };
  const result = await rewriteIncompleteCandidate({
    provider, settings: {}, mode: "agent", contract: correctedContract,
    candidate: "Old result", assessment: {
      overallStatus: "incomplete",
      criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], explanation: "Not verified" }]
    }, evidenceLedger: []
  });

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics[0].errorCodes.includes("rewritten-content-contains-superseded-reference"));
});

test("the harness renders verdicts and normalizes a Plan to exactly one block", () => {
  const section = renderAssessmentSection(contract, {
    overallStatus: "incomplete",
    criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], explanation: "Missing", claimType: "mixed" }],
    unmetSummary: "The failure was not verified."
  });
  const normalized = normalizeProposedPlanBlock("before <proposed_plan>Plan body</proposed_plan> after <proposed_plan>extra</proposed_plan>");
  const finalPlan = insertPlanAssessmentSection(normalized, section);

  assert.equal((finalPlan.match(/<proposed_plan>/g) || []).length, 1);
  assert.equal((finalPlan.match(/<\/proposed_plan>/g) || []).length, 1);
  assert.ok(finalPlan.indexOf("## Acceptance criteria") < finalPlan.indexOf("</proposed_plan>"));
  assert.match(finalPlan, /Task incomplete: The failure was not verified\./);
  assert.match(extractProposedPlanBody(finalPlan), /Plan body/);
});

test("an incomplete candidate is rewritten through one isolated forced tool", async () => {
  const calls = [];
  const assessment = {
    overallStatus: "incomplete",
    criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], explanation: "The file was not written.", claimType: "workspace-state" }]
  };
  const provider = {
    completeMessage: async (messages, options) => {
      calls.push({ messages, options });
      return {
        content: "",
        toolCalls: [{
          id: "rewrite-1",
          function: {
            name: "rewrite_assessed_candidate",
            arguments: JSON.stringify({
              content: "I prepared the content, but the file was not written.",
              acknowledgedUnmetCriterionIds: ["AC1"]
            })
          }
        }]
      };
    }
  };

  const result = await rewriteIncompleteCandidate({
    provider,
    settings: {},
    mode: "agent",
    candidate: "I successfully wrote the file.",
    assessment,
    evidenceLedger: ledgerEntries()
  });

  assert.equal(result.valid, true);
  assert.doesNotMatch(result.content, /successfully wrote/);
  assert.equal(calls[0].options.tools.length, 1);
  assert.equal(calls[0].options.tools[0].function.name, REWRITE_ASSESSED_CANDIDATE_TOOL.function.name);
  assert.deepEqual(calls[0].options.toolChoice, { type: "function", function: { name: "rewrite_assessed_candidate" } });
});

test("an invalid incomplete rewrite returns an empty safe fallback", async () => {
  const provider = {
    completeMessage: async () => ({
      content: "",
      toolCalls: [{
        id: "rewrite-1",
        function: {
          name: "rewrite_assessed_candidate",
          arguments: JSON.stringify({ content: "I successfully wrote it.", acknowledgedUnmetCriterionIds: [] })
        }
      }]
    })
  };
  const result = await rewriteIncompleteCandidate({
    provider,
    settings: {},
    mode: "agent",
    candidate: "I successfully wrote it.",
    assessment: {
      overallStatus: "incomplete",
      criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], explanation: "Missing", claimType: "workspace-state" }]
    },
    evidenceLedger: ledgerEntries()
  });

  assert.equal(result.valid, false);
  assert.equal(result.content, "");
  assert.deepEqual(result.diagnostics[0].errorCodes, ["unmet-criterion-acknowledgement-mismatch"]);
});

test("Plan rewrites require exactly one proposed-plan block", async () => {
  const provider = {
    completeMessage: async () => ({
      content: "",
      toolCalls: [{
        id: "rewrite-1",
        function: {
          name: "rewrite_assessed_candidate",
          arguments: JSON.stringify({
            content: "<proposed_plan>Continue investigation without claiming the unmet edit.</proposed_plan>",
            acknowledgedUnmetCriterionIds: ["AC1"]
          })
        }
      }]
    })
  };
  const result = await rewriteIncompleteCandidate({
    provider,
    settings: {},
    mode: "plan",
    candidate: "<proposed_plan>Done.</proposed_plan>",
    assessment: {
      overallStatus: "incomplete",
      criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], explanation: "Missing", claimType: "workspace-state" }]
    },
    evidenceLedger: ledgerEntries()
  });

  assert.equal(result.valid, true);
  assert.equal((result.content.match(/<proposed_plan>/g) || []).length, 1);
  assert.equal((result.content.match(/<\/proposed_plan>/g) || []).length, 1);
});
