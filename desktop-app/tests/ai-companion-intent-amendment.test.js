"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");
const { refreshContractFromUserContext } = require("../resources/ai-companion/core/intent-analysis");
const {
  applyApprovalAmendment,
  applyScopedBlock,
  recoverUnappliedApprovalAmendments
} = require("../resources/ai-companion/core/intent-amendment");
const { evaluateMutationControl } = require("../resources/ai-companion/core/intent-mutation-control");
const correctionConsistency = require("../resources/ai-companion/core/intent-correction-consistency");

const settings = { intentMaxOutputTokens: 1200 };
const prompts = { intentExtractionSystem: "extract" };

function baseContract() {
  return normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Add an uploader", provenance: "explicit" },
    expectedOutcome: { value: "Files upload", provenance: "inferred" },
    acceptanceCriteria: [{ description: "Uploads work" }]
  });
}

function refreshingProvider(refreshed) {
  return {
    completeMessage: async () => ({
      content: "",
      toolCalls: [{ id: "r1", function: { name: "capture_intent_contract", arguments: JSON.stringify(refreshed) } }]
    })
  };
}

test("a successful refresh applies the amendment and updates the contract", async () => {
  const provider = refreshingProvider({
    taskType: "implementation",
    relationshipToPrior: "corrects",
    relationshipEvidence: [{ quote: "use axios instead", explanation: "The approval instruction changes the requested implementation." }],
    carriedFieldRefs: [],
    correctedFieldRefs: ["goal", "expectedOutcome", "criterion:AC1"],
    goal: { value: "Use axios for uploads", provenance: "clarified" },
    expectedOutcome: { value: "Uploads use axios", provenance: "inferred" },
    requestedActions: [],
    prohibitedActions: [],
    outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "Uploads use axios", provenance: "clarified" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
    assumptions: [],
    unresolvedDecisions: [],
    ambiguities: []
  });
  const result = await applyApprovalAmendment({
    provider, settings, prompts, contract: baseContract(),
    instructions: "use axios instead", toolName: "apply_edit", args: { path: "src/a.js" }, toolCallId: "t1"
  });

  assert.equal(result.applied, true);
  assert.equal(result.contract.goal.value, "Use axios for uploads");
  const amendment = result.contract.amendments.at(-1);
  assert.equal(amendment.source, "approval-instruction");
  assert.equal(amendment.provenance, "clarified");
  assert.equal(amendment.applied, true);
  assert.equal(amendment.rejectedToolCallId, "t1");
});

test("two failed refresh attempts preserve the instruction with bounded diagnostics and target scope", async () => {
  let calls = 0;
  const provider = { completeMessage: async () => { calls += 1; throw new Error("provider down"); } };
  const result = await applyApprovalAmendment({
    provider, settings, prompts, contract: baseContract(),
    instructions: "do it differently", toolName: "apply_edit", args: { path: "src/a.js" }, toolCallId: "t7"
  });

  assert.equal(result.applied, false);
  assert.equal(result.state, "blocked");
  assert.equal(calls, 2);
  assert.deepEqual(result.diagnostics.map((entry) => entry.stage), ["provider", "provider"]);
  const amendment = result.contract.amendments.at(-1);
  assert.equal(amendment.applied, false);
  assert.equal(amendment.summary, "do it differently");
  assert.equal(amendment.rejectedToolCallId, "t7");

  const decision = result.contract.unresolvedDecisions.at(-1);
  assert.deepEqual(decision.controlledCapabilities, []);
  assert.deepEqual(decision.controlledTargets, ["src/a.js"]);
  // The rejected resource remains blocked without misrepresenting every file write as
  // part of the rejected action. Unknown targets remain conservative until refresh.
  assert.equal(evaluateMutationControl("apply_edit", { path: "src/a.js" }, result.contract).blocked, true);
  assert.equal(evaluateMutationControl("write_file", { path: "other.js" }, result.contract).blocked, true);
  assert.equal(evaluateMutationControl("git_commit", {}, result.contract).blocked, true, "an unassociated mutation target is conservatively blocked");
});

test("an invalid first refresh is repaired once with a complete replacement", async () => {
  const valid = {
    taskType: "implementation",
    relationshipToPrior: "corrects",
    relationshipEvidence: [{ quote: "use axios instead", explanation: "The instruction corrects the implementation." }],
    carriedFieldRefs: [],
    correctedFieldRefs: ["goal", "criterion:AC1"],
    goal: { value: "Use axios", provenance: "clarified" },
    expectedOutcome: { value: "Uploads use axios", provenance: "inferred" },
    requestedActions: [], prohibitedActions: [], outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "Axios is used", provenance: "clarified" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
    assumptions: [], unresolvedDecisions: [], ambiguities: []
  };
  let call = 0;
  const provider = refreshingProvider(null);
  provider.completeMessage = async (_messages) => {
    call += 1;
    const value = call === 1 ? { taskType: "implementation" } : valid;
    return { content: "", toolCalls: [{ id: "repair", function: { name: "capture_intent_contract", arguments: JSON.stringify(value) } }] };
  };
  const result = await applyApprovalAmendment({
    provider, settings, prompts, contract: baseContract(), instructions: "use axios instead", toolName: "apply_edit", args: { path: "src/a.js" }, toolCallId: "t9"
  });

  assert.equal(result.state, "applied");
  assert.equal(call, 2);
  assert.equal(result.contract.goal.value, "Use axios");
  assert.equal(result.diagnostics[0].attempt, 1);
  assert.ok(result.diagnostics[0].errorCodes.length > 0);
});

test("an underivable scope blocks all mutations, conservatively", () => {
  const blocked = applyScopedBlock(baseContract(), { instructions: "x", toolName: "not_a_tool", args: {}, toolCallId: "", amendmentId: "AM1" });
  const decision = blocked.unresolvedDecisions.at(-1);
  assert.deepEqual(decision.controlledCapabilities, []);
  assert.deepEqual(decision.controlledTargets, []);
  assert.equal(evaluateMutationControl("git_commit", {}, blocked).blocked, true);
  assert.equal(evaluateMutationControl("apply_edit", { path: "any.js" }, blocked).blocked, true);
});

test("resume recovery applies a legacy unapplied amendment and removes its controlling decision", async () => {
  const blocked = applyScopedBlock(baseContract(), {
    instructions: "use the developer guide",
    toolName: "write_file",
    args: { path: "help/user/example.md" },
    toolCallId: "t11",
    amendmentId: "AM11"
  });
  const legacyAmendment = blocked.amendments.at(-1);
  delete legacyAmendment.instruction;
  delete legacyAmendment.capability;
  delete legacyAmendment.resource;
  const provider = refreshingProvider({
    taskType: "implementation",
    relationshipToPrior: "corrects",
    relationshipEvidence: [{ quote: "use the developer guide", explanation: "The instruction corrects the destination." }],
    carriedFieldRefs: [],
    correctedFieldRefs: ["goal", "criterion:AC1"],
    goal: { value: "Write the developer guide", provenance: "clarified" },
    expectedOutcome: { value: "The developer guide contains the document", provenance: "inferred" },
    requestedActions: [], prohibitedActions: [], outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "The developer guide contains the document", provenance: "clarified" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [{ id: "T1", kind: "ui-area", value: "developer guide", provenance: "clarified" }] },
    assumptions: [], unresolvedDecisions: [], ambiguities: []
  });

  const result = await recoverUnappliedApprovalAmendments({ provider, settings, prompts, contract: blocked });

  assert.equal(result.state, "applied");
  assert.equal(result.contract.amendments.at(-1).applied, true);
  assert.equal(result.contract.unresolvedDecisions.some((decision) => decision.id === "D-AM11"), false);
});

test("resume recovery preserves an unapplied amendment when both refresh attempts fail", async () => {
  const blocked = applyScopedBlock(baseContract(), {
    instructions: "use the developer guide",
    toolName: "write_file",
    args: { path: "help/user/example.md" },
    toolCallId: "t12",
    amendmentId: "AM12"
  });
  let calls = 0;
  const provider = { completeMessage: async () => { calls += 1; throw new Error("provider down"); } };

  const result = await recoverUnappliedApprovalAmendments({ provider, settings, prompts, contract: blocked });

  assert.equal(result.state, "blocked");
  assert.equal(calls, 2);
  assert.equal(result.contract.amendments.at(-1).applied, false);
  assert.equal(result.contract.unresolvedDecisions.some((decision) => decision.id === "D-AM12"), true);
  assert.deepEqual(result.diagnostics.map((entry) => entry.stage), ["provider", "provider"]);
});

test("amendment refresh exposes only exact canonical references and forbids carried correction fields", async () => {
  const valid = {
    taskType: "implementation",
    relationshipToPrior: "corrects",
    relationshipEvidence: [{ quote: "use axios instead", explanation: "The instruction corrects the implementation." }],
    carriedFieldRefs: [],
    correctedFieldRefs: ["goal", "criterion:AC1"],
    goal: { value: "Use axios", provenance: "clarified" },
    expectedOutcome: { value: "Files upload", provenance: "inferred" },
    requestedActions: [], prohibitedActions: [], outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "Uploads work", provenance: "clarified" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
    assumptions: [], unresolvedDecisions: [], ambiguities: []
  };
  let inspected = false;
  const provider = {
    completeMessage: async (messages, options) => {
      const properties = options.tools[0].function.parameters.properties;
      assert.deepEqual(properties.correctedFieldRefs.items.enum, ["goal", "expectedOutcome", "criterion:AC1"]);
      assert.equal(properties.correctedFieldRefs.minItems, 1);
      assert.equal(properties.carriedFieldRefs.maxItems, 0);
      assert.match(messages[1].content, /goal, expectedOutcome, criterion:AC1/);
      assert.match(messages[1].content, /carriedFieldRefs must be an empty array/);
      inspected = true;
      return { content: "", toolCalls: [{ id: "r1", function: { name: "capture_intent_contract", arguments: JSON.stringify(valid) } }] };
    }
  };

  const result = await refreshContractFromUserContext({ provider, settings, prompts, contract: baseContract(), userContext: "use axios instead" });

  assert.equal(inspected, true);
  assert.equal(result.validation.valid, true);
});

test("resource steering persists rejected and prior target aliases for every dependent action", async () => {
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Create the guide", provenance: "explicit" },
    expectedOutcome: { value: "The guide is linked and opened", provenance: "explicit" },
    acceptanceCriteria: [{ id: "AC1", description: "The guide exists", provenance: "explicit" }],
    namedTargets: {
      files: [{ id: "T1", kind: "file-path", value: "document.md", provenance: "inferred" }],
      symbols: [], errors: [], uiAreas: []
    }
  });
  const provider = refreshingProvider({
    taskType: "implementation",
    relationshipToPrior: "corrects",
    relationshipEvidence: [{ quote: "change the name", explanation: "The instruction corrects the destination." }],
    carriedFieldRefs: [],
    correctedFieldRefs: ["target:T1"],
    goal: { value: "Create the guide", provenance: "explicit" },
    expectedOutcome: { value: "The guide is linked and opened", provenance: "explicit" },
    requestedActions: [], prohibitedActions: [], outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "The guide exists", provenance: "explicit" }],
    namedTargets: {
      files: [{ id: "T1", kind: "file-path", value: "help/developer/agent-loop.md", provenance: "clarified" }],
      symbols: [], errors: [], uiAreas: []
    },
    assumptions: [], unresolvedDecisions: [], ambiguities: []
  });

  const result = await applyApprovalAmendment({
    provider, settings, prompts, contract,
    instructions: "change the name", toolName: "write_file",
    args: { path: "help/developer/agent-loop-internals.md" }, toolCallId: "old-call"
  });
  const replacement = result.contract.amendments.at(-1).referenceReplacements[0];

  assert.equal(replacement.fieldRef, "target:T1");
  assert.equal(replacement.replacement, "help/developer/agent-loop.md");
  assert.ok(replacement.superseded.includes("help/developer/agent-loop-internals.md"));
  assert.ok(replacement.superseded.includes("agent-loop-internals.md"));
  assert.ok(replacement.superseded.includes("document.md"));
  assert.deepEqual(replacement.replacementAliases, ["agent-loop.md"]);
});

test("correction preflight checks produced effects but permits reads and edit search preconditions", () => {
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Use the corrected guide", provenance: "clarified" },
    expectedOutcome: { value: "Only the corrected guide is produced", provenance: "clarified" },
    acceptanceCriteria: [{ id: "AC1", description: "Links use the corrected guide", provenance: "clarified" }],
    amendments: [{
      id: "AM1", applied: true, summary: "rename the guide",
      referenceReplacements: [{
        fieldRef: "target:T1", kind: "resource",
        superseded: ["help/developer/old.md", "old.md"],
        replacement: "help/developer/new.md", replacementAliases: ["new.md"], sourceToolCallId: "t1"
      }]
    }]
  });

  assert.equal(correctionConsistency.findStaleEffectReferences("read_file", { path: "help/developer/old.md" }, contract).length, 0);
  assert.equal(correctionConsistency.findStaleEffectReferences("apply_edit", {
    path: "help/developer/index.md", search: "(old.md)", replacement: "(new.md)"
  }, contract).length, 0);
  const staleEdit = correctionConsistency.findStaleEffectReferences("apply_edit", {
    path: "help/developer/index.md", search: "section", replacement: "[Guide](old.md)"
  }, contract)[0];
  assert.deepEqual(staleEdit.argumentPaths, ["replacement"]);
  assert.equal(correctionConsistency.findStaleEffectReferences("open_file_in_tab", { path: ".\\help\\developer\\old.md" }, contract)[0].argumentPaths[0], "path");
});

test("post-action checks retain bounded correction facts without file contents", () => {
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Use new.md", provenance: "clarified" },
    expectedOutcome: { value: "The index links new.md", provenance: "clarified" },
    acceptanceCriteria: [{ id: "AC1", description: "The link is corrected", provenance: "clarified" }],
    amendments: [{ id: "AM1", applied: true, referenceReplacements: [{
      fieldRef: "target:T1", kind: "resource", superseded: ["old.md"],
      replacement: "help/new.md", replacementAliases: ["new.md"]
    }] }]
  });
  const checks = correctionConsistency.createPostActionReferenceChecks(
    "apply_edit",
    { path: "help/index.md", replacement: "[Guide](new.md)" },
    { compare: { afterContent: "# Help\n[Guide](new.md)" } },
    contract
  );

  assert.equal(checks[0].replacementFound, true);
  assert.equal(checks[0].supersededFound, false);
  assert.ok(checks[0].checkedLocations.includes("post-state-content"));
  assert.equal(Object.hasOwn(checks[0], "content"), false);
});

test("a newer correction of the same field replaces the older enforcement map", () => {
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Use the latest target", provenance: "clarified" },
    expectedOutcome: { value: "Only the latest target is produced", provenance: "clarified" },
    acceptanceCriteria: [{ id: "AC1", description: "Latest target is used", provenance: "clarified" }],
    amendments: [
      { id: "AM1", applied: true, changedFields: ["target:T1"], referenceReplacements: [{
        fieldRef: "target:T1", kind: "resource", superseded: ["old.md"], replacement: "new.md", replacementAliases: []
      }] },
      { id: "AM2", applied: true, changedFields: ["target:T1"], referenceReplacements: [{
        fieldRef: "target:T1", kind: "resource", superseded: ["new.md"], replacement: "old.md", replacementAliases: []
      }] }
    ]
  });

  const active = correctionConsistency.listActiveReferenceReplacements(contract);
  assert.deepEqual(active.map((entry) => entry.amendmentId), ["AM2"]);
  assert.equal(correctionConsistency.findStaleEffectReferences("write_file", { path: "old.md", content: "ok" }, contract).length, 0);
  assert.equal(correctionConsistency.findStaleEffectReferences("write_file", { path: "new.md", content: "wrong" }, contract)[0].amendmentId, "AM2");
});
