"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INTENT_CONTRACT_SCHEMA_VERSION,
  criterionGoalOverlap,
  criterionRestatesGoal,
  normalizeIntentContract,
  validateIntentContract,
  createRawFallbackContract,
  createFastPathContract,
  computePromptFingerprint,
  canReuseContract,
  canCarryPriorContract,
  createContractMeta,
  buildContractInjectionMessage
} = require("../resources/ai-companion/core/intent-contract");
const { validateRawIntentContract } = require("../resources/ai-companion/core/intent-contract-raw-validation");
const { mergeIntentContracts } = require("../resources/ai-companion/core/intent-relationship");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");

function createRawContract(overrides = {}) {
  return {
    taskType: "answer",
    relationshipToPrior: "independent",
    goal: { value: "Inspect settings", provenance: "explicit" },
    expectedOutcome: { value: "Settings are reported", provenance: "inferred" },
    requestedActions: [],
    prohibitedActions: [],
    outOfScope: [],
    acceptanceCriteria: [{ id: "AC1", description: "Settings are reported", provenance: "inferred" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
    assumptions: [],
    unresolvedDecisions: [],
    ambiguities: [],
    relationshipEvidence: [],
    carriedFieldRefs: [],
    correctedFieldRefs: [],
    ...overrides
  };
}

test("normalizeIntentContract fills defaults, assigns AC IDs, and coerces enums", () => {
  const contract = normalizeIntentContract({
    taskType: "not-a-type",
    goal: "Fix the parser",
    expectedOutcome: { value: "Parser handles empty input", provenance: "explicit" },
    acceptanceCriteria: [{ description: "No crash on empty input" }, { description: "Test added" }],
    namedTargets: { files: [{ value: "src/parser.js" }] }
  });

  assert.equal(contract.schemaVersion, INTENT_CONTRACT_SCHEMA_VERSION);
  assert.equal(contract.taskType, "answer", "invalid taskType falls back to answer");
  assert.equal(contract.goal.value, "Fix the parser");
  assert.equal(contract.goal.provenance, "inferred", "bare string goal defaults to inferred");
  assert.deepEqual(contract.acceptanceCriteria.map((criterion) => criterion.id), ["AC1", "AC2"]);
  assert.equal(contract.namedTargets.files[0].id, "T1");
  assert.equal(contract.namedTargets.files[0].kind, "file-path");
  assert.equal(contract.namedTargets.files[0].status, "unverified");
});

test("raw validation accepts a v6 statement-only criterion (regression: invalid-criterion)", () => {
  const base = {
    taskType: "conformance", relationshipToPrior: "independent", relationshipEvidence: [], carriedFieldRefs: [],
    goal: { value: "g", provenance: "explicit" }, expectedOutcome: { value: "e", provenance: "explicit" },
    requestedActions: [], prohibitedActions: [], outOfScope: [], assumptions: [], namedTargets: {}
  };
  const statementOnly = validateRawIntentContract({ ...base, acceptanceCriteria: [{ shape: "conformance-inspection", statement: "code read", provenance: "inferred" }] });
  const legacyDescription = validateRawIntentContract({ ...base, acceptanceCriteria: [{ description: "code read", provenance: "inferred" }] });
  assert.ok(!statementOnly.errors.includes("invalid-criterion"), "v6 statement field must not trip invalid-criterion");
  assert.ok(!legacyDescription.errors.includes("invalid-criterion"), "legacy description field still accepted");
});

test("v6 conformance contract carries shape, sourceSpan, mustInspect, and evidenceRequired", () => {
  const contract = normalizeIntentContract({
    taskType: "conformance",
    goal: { value: "Check the doc represents the full code", provenance: "explicit" },
    expectedOutcome: { value: "Gaps identified", provenance: "explicit" },
    acceptanceCriteria: [
      {
        shape: "conformance-inspection",
        statement: "The intent-extraction source modules were read",
        sourceSpan: "the full code of the intent extraction",
        mustInspect: ["core/intent-*.js"],
        evidenceRequired: "read_file evidence for the code modules",
        provenance: "explicit"
      }
    ]
  });

  assert.equal(contract.schemaVersion, 6);
  assert.equal(contract.taskType, "conformance", "conformance is an accepted task type");
  const ac = contract.acceptanceCriteria[0];
  assert.equal(ac.shape, "conformance-inspection");
  assert.equal(ac.sourceSpan, "the full code of the intent extraction");
  assert.deepEqual(ac.mustInspect, ["core/intent-*.js"]);
  assert.equal(ac.evidenceRequired, "read_file evidence for the code modules");
  assert.equal(ac.statement, ac.description, "description mirrors statement for back-compat");
  assert.equal(ac.verification, ac.evidenceRequired, "verification mirrors evidenceRequired for back-compat");
});

test("normalizeCriteria upgrades a legacy v5 criterion and drops an unknown shape", () => {
  const contract = normalizeIntentContract({
    taskType: "diagnostic",
    goal: { value: "diagnose", provenance: "explicit" },
    expectedOutcome: { value: "found", provenance: "explicit" },
    acceptanceCriteria: [
      { description: "legacy criterion", verification: "old proof", shape: "not-a-real-shape" }
    ]
  });
  const ac = contract.acceptanceCriteria[0];
  assert.equal(ac.statement, "legacy criterion", "legacy description maps to statement");
  assert.equal(ac.evidenceRequired, "old proof", "legacy verification maps to evidenceRequired");
  assert.equal(ac.shape, "", "an unrecognized shape is dropped to empty");
  assert.deepEqual(ac.mustInspect, []);
});

test("validateIntentContract reports structural problems", () => {
  const missing = validateIntentContract(normalizeIntentContract({ taskType: "implementation" }));
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("missing-goal"));
  assert.ok(missing.errors.includes("missing-expected-outcome"));
  assert.ok(missing.errors.includes("missing-criteria"));

  const good = validateIntentContract(normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Diagnose the parser failure",
    expectedOutcome: "The root cause is identified",
    acceptanceCriteria: [{ shape: "diagnostic-finding", statement: "The parser failure root cause is identified from inspected evidence" }]
  }));
  assert.deepEqual(good, { valid: true, errors: [], hints: [] });
});

test("v6 gate hints on ungrounded criteria; restates-goal is no longer an error", () => {
  // A verified criterion with no shape is a HINT (not fatal): it must not cascade to fallback.
  const noShape = normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Diagnose the parser failure",
    expectedOutcome: "The root cause is known",
    acceptanceCriteria: [{ statement: "The parser root cause is identified from inspected evidence" }]
  });
  // An explicit criterion with no sourceSpan is hinted; faithful wording is fine.
  const explicitNoSpan = normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Diagnose the parser failure",
    expectedOutcome: "The root cause is known",
    acceptanceCriteria: [{ shape: "diagnostic-finding", statement: "The parser root cause is identified", provenance: "explicit" }]
  });
  const responseOnly = normalizeIntentContract({
    taskType: "implementation",
    goal: "Improve the parser",
    expectedOutcome: "The parser is improved",
    acceptanceCriteria: [{ shape: "response-content", statement: "The response summarizes the request" }]
  });

  assert.ok(validateIntentContract(noShape).hints.includes("criterion-missing-shape"));
  assert.ok(validateIntentContract(noShape).valid, "a missing shape is a hint, not a hard failure");
  assert.ok(validateIntentContract(explicitNoSpan).hints.includes("criterion-missing-source-span"));
  assert.ok(validateIntentContract(responseOnly).errors.includes("missing-outcome-criterion"));
  // restates-goal is intentionally no longer a validation error (faithfulness is now required).
  assert.ok(!validateIntentContract(noShape).errors.includes("criterion-restates-goal"));
  // The overlap metric function still exists for monitoring.
  assert.equal(criterionGoalOverlap({ description: "abc def" }, { value: "abc def" }), 1);
});

test("conformance task must decompose into inspection and comparison criteria", () => {
  const oneCriterion = normalizeIntentContract({
    source: "extracted", verifiability: "provisional",
    taskType: "conformance",
    goal: "Check whether the doc represents the full code",
    expectedOutcome: "Gaps identified",
    acceptanceCriteria: [{ shape: "conformance-inspection", statement: "The code was read", mustInspect: ["core/*.js"] }]
  });
  const errors = validateIntentContract(oneCriterion).errors;
  assert.ok(errors.includes("conformance-missing-comparison-criterion"), "a lone inspection criterion is not enough");
});

test("well-decomposed diagnostic criteria pass; a missing conditional action is now an error", () => {
  const complete = normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Check the latest Git changes and update README.md if needed",
    expectedOutcome: "The diff is understood and README.md is current",
    acceptanceCriteria: [
      { shape: "diagnostic-finding", statement: "The actual Git diff is inspected and relevant behavior changes are identified" },
      { shape: "conditional-action", statement: "If warranted by the diff, README.md was updated and its resulting content was verified" }
    ],
    namedTargets: { files: [{ value: "README.md" }] }
  });
  const missingAction = normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Inspect the parser and update README.md if needed",
    expectedOutcome: "The parser finding and documentation state are known",
    acceptanceCriteria: [{ shape: "diagnostic-finding", statement: "The parser behavior is identified from inspected evidence" }],
    namedTargets: { files: [{ value: "README.md" }], symbols: [{ value: "parser" }] }
  });
  const readOnlyChanges = normalizeIntentContract({
    taskType: "diagnostic",
    goal: "Check the latest Git changes",
    expectedOutcome: "The relevant changes are identified",
    acceptanceCriteria: [{ shape: "diagnostic-finding", statement: "The actual Git diff is inspected and relevant behavior changes are identified" }]
  });

  assert.equal(validateIntentContract(complete).valid, true);
  assert.ok(validateIntentContract(missingAction).hints.includes("missing-conditional-action-criterion"));
  assert.ok(!validateIntentContract(readOnlyChanges).hints.includes("missing-conditional-action-criterion"),
    "the noun Git changes is not a conditional action");
});

test("validateIntentContract detects duplicate criterion IDs", () => {
  const contract = normalizeIntentContract({
    goal: "g",
    expectedOutcome: "o",
    acceptanceCriteria: [{ id: "AC1", description: "a" }, { id: "AC1", description: "b" }]
  });
  // Normalization de-collides IDs, so a hand-forged duplicate is validated directly.
  contract.acceptanceCriteria[1].id = "AC1";
  const result = validateIntentContract(contract);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("duplicate-criterion-id"));
});

test("raw validation rejects coercible malformed extraction before normalization", () => {
  const result = validateRawIntentContract({
    taskType: "not-a-type",
    goal: { value: "g" },
    expectedOutcome: { value: "o", provenance: "inferred" },
    acceptanceCriteria: [
      { id: "AC1", description: "a", provenance: "inferred" },
      { id: "AC1", description: "b", provenance: "inferred" }
    ],
    prohibitedActions: [{ value: "do not publish" }]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("unsupported-task-type"));
  assert.ok(result.errors.includes("missing-or-unsupported-goal-provenance"));
  assert.ok(result.errors.includes("missing-or-unsupported-prohibited-action-provenance"));
  assert.ok(result.errors.includes("duplicate-supplied-id"));
});

test("relationship validation requires current-prompt evidence and resolvable carried fields", () => {
  const prior = normalizeIntentContract({
    goal: { value: "Inspect settings", provenance: "explicit" },
    expectedOutcome: { value: "Settings are reported", provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", description: "Settings are reported", provenance: "inferred" }]
  });
  const invalid = validateRawIntentContract(createRawContract({
    relationshipToPrior: "extends",
    relationshipEvidence: [{ quote: "also include defaults", explanation: "Adds defaults." }],
    carriedFieldRefs: ["criterion:missing"]
  }), {
    hasPriorContract: true,
    priorContract: prior,
    currentPrompt: "Count boolean settings."
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("relationship-evidence-not-in-current-prompt"));
  assert.ok(invalid.errors.includes("invalid-carried-field-ref"));
});

test("same-topic self-contained prompts remain independent without carried fields", () => {
  const prior = normalizeIntentContract({
    goal: { value: "Read three AI Companion settings", provenance: "explicit" },
    expectedOutcome: { value: "Three values are shown", provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", description: "Three values are shown", provenance: "inferred" }]
  });
  const result = validateRawIntentContract(createRawContract({
    goal: { value: "Count boolean AI Companion settings", provenance: "explicit" },
    expectedOutcome: { value: "The boolean setting count is shown", provenance: "inferred" }
  }), {
    hasPriorContract: true,
    priorContract: prior,
    currentPrompt: "Count boolean AI Companion settings."
  });

  assert.equal(result.valid, true);
});

test("extends carries constraints and remaps colliding criterion IDs", () => {
  const prior = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Build uploader", provenance: "explicit" },
    expectedOutcome: { value: "Uploads work", provenance: "inferred" },
    prohibitedActions: [{ id: "P1", value: "Do not change the API", provenance: "explicit" }],
    acceptanceCriteria: [{ id: "AC1", description: "Uploads work", provenance: "inferred" }]
  });
  const current = normalizeIntentContract({
    taskType: "implementation",
    relationshipToPrior: "extends",
    relationshipEvidence: [{ quote: "Also add retries", explanation: "Adds retry behavior." }],
    carriedFieldRefs: ["prohibitedAction:P1", "criterion:AC1"],
    goal: { value: "Also add retries", provenance: "explicit" },
    expectedOutcome: { value: "Uploads retry", provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", description: "Retries three times", provenance: "inferred" }]
  });
  const merged = mergeIntentContracts(prior, current);
  assert.equal(merged.prohibitedActions[0].provenance, "carried");
  assert.deepEqual(merged.acceptanceCriteria.map((criterion) => criterion.id), ["AC1", "AC2"]);
  assert.deepEqual(merged.idRemaps.at(-1), { from: "AC1", to: "AC2" });
});

test("uncertain relationships keep current intent without blocking unrelated implementation work", () => {
  const prior = normalizeIntentContract({ goal: { value: "Prior goal", provenance: "explicit" }, expectedOutcome: { value: "Prior result", provenance: "inferred" }, acceptanceCriteria: [{ description: "prior", provenance: "inferred" }] });
  const current = normalizeIntentContract({ taskType: "implementation", relationshipToPrior: "uncertain", goal: { value: "Maybe continue", provenance: "explicit" }, expectedOutcome: { value: "unknown", provenance: "inferred" }, acceptanceCriteria: [{ description: "current", provenance: "inferred" }] });
  const merged = mergeIntentContracts(prior, current);
  assert.equal(merged.goal.value, "Maybe continue");
  assert.equal(merged.ambiguities.at(-1).blocking, false);
  assert.equal(merged.unresolvedDecisions.some((decision) => decision.id === "D-REL"), false);
  assert.equal(merged.pendingRelationshipContract, null);
});

test("corrects changes only cited fields and may remove a cited carried prohibition", () => {
  const prior = normalizeIntentContract({
    goal: { value: "Old goal", provenance: "explicit" },
    expectedOutcome: { value: "Keep outcome", provenance: "explicit" },
    prohibitedActions: [{ id: "P1", value: "Do not publish", provenance: "explicit" }, { id: "P2", value: "Do not rename", provenance: "explicit" }],
    acceptanceCriteria: [{ id: "AC1", description: "Keep criterion", provenance: "explicit" }]
  });
  const current = normalizeIntentContract({
    relationshipToPrior: "corrects",
    correctedFieldRefs: ["goal", "prohibitedAction:P1"],
    goal: { value: "New goal", provenance: "clarified" },
    expectedOutcome: { value: "Model tried to change this", provenance: "inferred" },
    prohibitedActions: [{ id: "P2", value: "Model tried to alter this", provenance: "inferred" }],
    acceptanceCriteria: [{ id: "AC1", description: "Model tried to alter this", provenance: "inferred" }]
  });
  const merged = mergeIntentContracts(prior, current);
  assert.equal(merged.goal.value, "New goal");
  assert.equal(merged.expectedOutcome.value, "Keep outcome");
  assert.deepEqual(merged.prohibitedActions.map((entry) => entry.id), ["P2"]);
  assert.equal(merged.prohibitedActions[0].value, "Do not rename");
  assert.equal(merged.acceptanceCriteria.length, 1);
  assert.equal(merged.acceptanceCriteria[0].description, "Keep criterion");
});

test("raw fallback copies the prompt verbatim with uninterpreted provenance and validates", () => {
  const contract = createRawFallbackContract("  Explain   the retry logic  ", { reason: "extraction-error" });
  assert.equal(contract.source, "raw-prompt-fallback");
  assert.equal(contract.verifiability, "unverified");
  assert.equal(contract.goal.provenance, "uninterpreted");
  assert.equal(contract.goal.value, "Explain the retry logic");
  assert.equal(contract.acceptanceCriteria.length, 1);
  assert.equal(validateIntentContract(contract).valid, true);
});

test("fast-path contract carries the active file as an unverified target", () => {
  const contract = createFastPathContract("what does this do?", { activeFilePath: "src/a.js" });
  assert.equal(contract.source, "fast-path");
  assert.equal(contract.verifiability, "verified");
  assert.equal(contract.namedTargets.files[0].value, "src/a.js");
  assert.equal(contract.namedTargets.files[0].source, "active-editor");
  assert.equal(contract.namedTargets.files[0].status, "unverified");
  assert.equal(validateIntentContract(contract).valid, true);
});

test("prompt fingerprint is whitespace-stable and edit-sensitive", () => {
  assert.equal(computePromptFingerprint("fix  the\nbug"), computePromptFingerprint("fix the bug"));
  assert.notEqual(computePromptFingerprint("fix the bug"), computePromptFingerprint("fix the other bug"));
});

test("canReuseContract requires matching fingerprint, workspace, mode, and chat", () => {
  const base = { mode: "chat", workspaceRoot: "/w", prompt: "do a thing", chatId: "c1", turnIndex: 0, executionGeneration: 1 };
  const saved = createContractMeta(base);
  const resume = (overrides = {}) => createContractMeta({ ...base, executionKind: "resume", ...overrides });
  assert.equal(canReuseContract(saved, resume()), true);
  assert.equal(canReuseContract(saved, resume({ prompt: "do a different thing" })), false);
  assert.equal(canReuseContract(saved, resume({ mode: "agent" })), false);
  assert.equal(canReuseContract(saved, resume({ workspaceRoot: "/other" })), false);
  assert.equal(canReuseContract(saved, resume({ chatId: "c2" })), false);
  assert.equal(canReuseContract(saved, resume({ turnIndex: 1 })), false);
  assert.equal(canReuseContract(saved, resume({ executionGeneration: 2 })), false);
  assert.equal(canReuseContract(saved, createContractMeta({ ...base, executionKind: "edited-rerun" })), false);
  assert.equal(canReuseContract({ ...saved, executionGeneration: undefined }, resume()), false);
  assert.equal(canCarryPriorContract(saved, createContractMeta({ ...base, prompt: "next", turnIndex: 1 })), true);
});

test("injection message keeps the goal and criteria and stays within budget", () => {
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: "Add retry with backoff to the uploader",
    expectedOutcome: "Uploads retry up to three times",
    prohibitedActions: [{ value: "Do not change the public API" }],
    acceptanceCriteria: [{ description: "Retries on 500" }, { description: "Backoff is exponential" }]
  });
  const message = buildContractInjectionMessage(contract, { maxChars: 3500 });
  assert.equal(message.role, "system");
  assert.ok(message.content.includes("Add retry with backoff to the uploader"));
  assert.ok(message.content.includes("Retries on 500"));
  assert.ok(message.content.includes("Authoritative task contract"));
});

test("injection truncates criterion descriptions rather than dropping mandatory fields", () => {
  const longDescription = "x".repeat(400);
  const contract = normalizeIntentContract({
    taskType: "implementation",
    goal: "Critical goal that must survive compaction",
    expectedOutcome: "o",
    acceptanceCriteria: Array.from({ length: 8 }, (_unused, index) => ({ description: `${longDescription} ${index}` }))
  });
  const message = buildContractInjectionMessage(contract, { maxChars: 500 });
  assert.ok(message.content.includes("Critical goal that must survive compaction"), "goal is never dropped");
  assert.ok(message.content.includes("(truncated)"), "criterion descriptions truncate under pressure");
});

test("settings normalizer exposes M1 intent-contract preferences with clamped defaults", () => {
  const defaulted = normalizeAiCompanionSettings({});
  assert.equal(defaulted.intentContractsEnabled, false);
  assert.equal(defaulted.intentFastPathEnabled, true);
  assert.equal(defaulted.intentInjectedMaxChars, 3500);

  const clamped = normalizeAiCompanionSettings({ intentContractsEnabled: true, intentInjectedMaxChars: 999999, intentMaxOutputTokens: 1 });
  assert.equal(clamped.intentContractsEnabled, true);
  assert.equal(clamped.intentInjectedMaxChars, 6000, "injected chars clamp to hard max");
  assert.equal(clamped.intentMaxOutputTokens, 256, "output tokens clamp to floor");
});
