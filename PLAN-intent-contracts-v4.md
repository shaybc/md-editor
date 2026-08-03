# Plan: Explicit Intent Contracts for AI Companion (v4)

ASCII-only. Arrows are "->", dashes "--", ellipses "...". No Unicode punctuation or
box-drawing. Safe to paste into implementation prompts.

This version supersedes PLAN-intent-contracts-v3.md. It keeps v3's architecture and
makes the remaining enforcement deterministic instead of model-volunteered, fixes the
completion/Plan/concurrency mechanics, splits the experiment into independent flags,
and reframes delivery into four independently testable milestones.

## What changed from v3

Major:
1. Hybrid conflict detection -- the harness auto-raises conclusive conflicts (e.g. a
   validated absent target); the model reports only semantic conflicts; the harness
   validates all model-cited evidence. Adds canonical field references so goal,
   expectedOutcome, and specific criteria can be targeted; defines how a conceptual
   assumption is associated with evidence.
2. Control-scoped mutation blocking -- unresolvedDecisions carry
   controlledCapabilities and controlledTargets so the harness can deterministically
   block exactly the dependent mutations; unknown scope blocks all.
3. Evidence determinism split -- the harness verifies evidence existence and
   admissibility only; the assessor judges semantic relevance; the rendered verdict is
   deterministic given the validated assessment. Ledger entries no longer claim an
   AC mapping; the assessor maps EV IDs to criteria.
4. Complete approval-amendment state transition, including the refresh-failure path.

Completion/Plan/multi-turn/concurrency/eval:
5. Answer mode performs no criterion verdict (removed the undefined "ordinary
   completion check"); the harness -- not the candidate -- appends both the table and
   the incomplete-task statement; Plan insertion has explicit structural rules.
6. Multi-turn gains a supersededCriteria audit collection, ID-collision rules,
   corrects-must-cite-IDs, a carried-prohibition preservation invariant, and an
   uncertain-classification fallback to independent + a visible ambiguity;
   requestedActions now carry provenance.
7. Concurrency uses a valid assistant tool_calls message + matching tool result,
   unique request-scoped synthetic IDs, parent abort-listener cleanup, an explicit
   late-seed rule, and a stated discovery timeout policy.
8. The experiment is split into independent internal flags (extraction,
   clarification, revision, completion assessment) under one master preference, with
   numeric rollout gates.

Minor: balanced code fences; distinct named schema constants; a dedicated fallback
provenance value; and a lower default injected-contract size.

## Delivery Milestones (implement in this order)

Each milestone is independently testable and stays behind the master flag until
Milestone 3 (the evidence-backed completion path) lands.

- M1 Foundation: contract schema + validation, Chat-only fast path, harness-owned
  concurrent discovery seed, persistence, and reinjection. No behavior change to
  approvals or completion yet.
- M2 Intent control: clarification (pre/post), field provenance + authority, approval
  amendments, hybrid conflict reporting + bounded revision, and control-scoped
  mutation blocking.
- M3 Evidence + completion: the evidence ledger, forced assessment, deterministic
  table + incomplete-statement rendering, and Plan block insertion.
- M4 Product surface: panel restoration/rendering, resume, the evaluation harness,
  per-chat experiment assignment, and numeric rollout gates.

## Intent Contract (schema v4)

Constant name: INTENT_CONTRACT_SCHEMA_VERSION = 4 (distinct from
PROMPT_PROFILE_SCHEMA_VERSION = 2; see Prompt Profile).

```json
{
  "schemaVersion": 4,
  "source": "extracted",
  "relationshipToPrior": "independent",
  "taskType": "implementation",

  "goal":            { "value": "...", "provenance": "explicit" },
  "expectedOutcome": { "value": "...", "provenance": "inferred" },

  "requestedActions": [
    { "id": "RA1", "value": "...", "provenance": "explicit" }
  ],
  "prohibitedActions": [{ "id": "P1", "value": "...", "provenance": "explicit" }],
  "outOfScope":       [{ "id": "S1", "value": "...", "provenance": "explicit" }],

  "acceptanceCriteria": [
    { "id": "AC1", "description": "...", "verification": "...", "provenance": "explicit" }
  ],
  "supersededCriteria": [
    { "id": "AC0", "description": "...", "supersededBy": "AC1", "turn": 2 }
  ],

  "namedTargets": {
    "files":   [{ "id": "T1", "value": "src/example.js", "source": "prompt", "status": "unverified" }],
    "symbols": [{ "id": "T2", "value": "parseToken", "source": "prompt", "status": "unverified" }],
    "errors":  [],
    "uiAreas": []
  },

  "assumptions": [
    { "id": "A1", "statement": "...", "kind": "locational", "risk": "low",
      "provenance": "inferred", "relatedTargets": ["T1"], "keywords": ["token", "parse"] }
  ],

  "unresolvedDecisions": [
    { "id": "D1", "description": "...", "blocking": false,
      "controlsMutation": false, "controlledCapabilities": [], "controlledTargets": [] }
  ],

  "ambiguities": [
    { "id": "AMB1", "question": "...", "reason": "...", "impact": "high",
      "blocking": true, "safetyOrScopeCritical": false, "suggestedAnswers": [] }
  ],

  "clarifications": [ { "ambiguityId": "AMB1", "question": "...", "answer": "..." } ],

  "amendments": [
    { "id": "AM1", "source": "approval-instruction", "provenance": "clarified",
      "summary": "...", "changedFields": ["criterion:AC2"], "toolCallId": "call_..." }
  ],

  "revisions": [
    { "id": "R1", "trigger": "harness-auto | model-reported", "conflictId": "C1",
      "fieldRef": "target:T1", "summary": "...", "changedFields": ["target:T1"] }
  ]
}
```

Rules of note (unchanged rules from v3 still apply):

- Every revisable/challengeable item carries provenance, now including
  requestedActions (an inferred requested action can drive a mutation as strongly as
  an inferred goal, so it must be challengeable/askable the same way).
- Stable IDs exist on requestedActions (RA*), prohibitedActions (P*), outOfScope (S*),
  criteria (AC*), targets (T*), assumptions (A*), and decisions (D*). goal and
  expectedOutcome are singletons addressed by their canonical field reference.
- assumptions carry kind (locational | behavioral | environmental | policy) plus
  relatedTargets and keywords to make evidence association possible (see Hybrid
  Conflict Detection).
- unresolvedDecisions carry control scope (see Mutation Control Scope).
- supersededCriteria is the audit trail for multi-turn corrects/extends.

Fallback/fast-path contracts: source raw-prompt-fallback or fast-path. For a raw
fallback the goal/expectedOutcome copy the user's text verbatim with
provenance "uninterpreted" (a distinct value meaning "the user's own words, not
model-interpreted") -- not "inferred" and not "explicit," because no extraction
occurred. Fallback shows a visible warning; fast-path shows an informational note and
includes the active file path as an unverified target for active-editor questions.

## Canonical Field References

A single string grammar addresses any challengeable/amendable field, used by
report_intent_conflict, revisions[].fieldRef, amendments[].changedFields, and the
authority router:

```
goal
expectedOutcome
requestedAction:RA1
prohibitedAction:P1
outOfScope:S1
criterion:AC2
target:T1
assumption:A1
decision:D1
```

The harness resolves a fieldRef to the concrete node, its provenance, and whether it
is discovery-revisable (see below). An unresolvable fieldRef is rejected.

## Provenance and Authority Model

Provenance values: explicit (user stated), clarified (from a clarification answer),
inferred (extractor-supplied), carried (inherited from a prior turn), uninterpreted
(verbatim user text in a fallback contract).

Authority:
- Discovery evidence may DIRECTLY revise only inferred or carried fields that are
  targets, assumptions, decisions, or a criterion's verification field.
- When evidence contradicts an inferred/carried goal, expectedOutcome, requestedAction,
  or a criterion's description, the harness does NOT silently revise. It asks the user
  (clarification enabled) or preserves both interpretations as a controlling
  unresolvedDecision and blocks dependent mutations (clarification off).
- Discovery evidence may never add or strengthen prohibitedActions or outOfScope; it
  may only raise an assumption/decision recommending caution. Only the user (via
  clarification or approval-instruction amendment) can create a prohibition or scope.
- explicit, clarified, and uninterpreted content are immutable to discovery.

## Restricted Phase Tools

Phase isolation is unchanged (functions replaced, not appended). Updated tools:

### report_intent_conflict (model-reported semantic conflicts only)

```json
{
  "fieldRef": "criterion:AC2",
  "conflictType": "assumption-contradicted | target-relocated | goal-misread | criterion-unreachable | outcome-misread",
  "evidenceToolCallIds": ["call_ab12", "call_cd34"],
  "explanation": "One or two sentences tying cited evidence to the field.",
  "userClarificationRequired": false
}
```

- Read-only; returns a small acknowledgement.
- Used for SEMANTIC conflicts the harness cannot conclude on its own (e.g. "the true
  behavior lives elsewhere," "this criterion cannot be satisfied as written").
  Conclusive structural conflicts (a validated absent target) are raised by the harness
  automatically and do not require this call.
- fieldRef must resolve; criterion-unreachable and outcome-misread must name a
  criterion:AC* or expectedOutcome ref respectively; evidenceToolCallIds must all exist
  in the request's tracked search map. Invalid reports are rejected with a tool error
  and no revision.

### assess_acceptance_criteria (assessor maps EV -> criteria)

```json
{
  "overallStatus": "complete | incomplete",
  "criteria": [
    { "id": "AC1", "status": "met | unmet", "evidenceIds": ["EV12"], "explanation": "..." }
  ],
  "unmetSummary": ""
}
```

The assessor -- not the ledger -- assigns which EV IDs support which criterion. A
verdict citing no EV, or only inadmissible EV, is normalized to unmet by the harness.

capture_intent_contract and ask_clarification are as in v3.

## Hybrid Conflict Detection

Two paths feed one bounded revision budget (one discovery-driven change per request;
approval amendments are separate and uncounted).

Harness-auto (deterministic, no model call to detect):
- Absent target: raised automatically when (a) a direct path read_file returns
  not-found, or (b) a glob on the exact basename AND a search_grep on the symbol name
  both return zero across tracked searches. A single empty grep is inconclusive.
- On an auto-raised absent target the harness runs the bounded revision directly
  (mark status absent, update dependent verification), since the fact is deterministic.

Model-reported (semantic, then validated):
- The model calls report_intent_conflict for relocation/misread/unreachable cases.
- The harness validates: fieldRef resolves; cited tool calls exist; and the cited
  evidence meets the type's admissibility bar (target-relocated requires a positive
  confirmed match for the described behavior in a non-listed file; assumption
  contradiction requires evidence intersecting that assumption's relatedTargets or
  keywords -- filename matching alone cannot contradict a conceptual assumption).
- Routing by provenance/authority: revisable inferred/carried targets/assumptions/
  decisions/verification -> bounded revision; inferred goal/expectedOutcome/criterion
  description -> ask the user or record a controlling decision (never silent).

Search tracking: the loop maintains a per-request map from each discovery/search tool
call (tool_call_id, tool, args, result shape) to the target/assumption IDs it bears on.
Target association is by path/symbol string match; assumption association is by
relatedTargets and keywords. This map is what makes both the auto and validated paths
deterministic.

## Mutation Control Scope

controlsMutation alone is insufficient -- the harness must know WHICH mutation is
gated. Each controlling decision carries:

```json
{ "id": "D1", "controlsMutation": true,
  "controlledCapabilities": ["workspace.file.write", "git.commit"],
  "controlledTargets": ["T1"] }
```

Enforcement: before any Agent mutating tool runs, the harness matches it against open
controlling decisions:
- Block if the tool's capability is in controlledCapabilities OR the tool's resolved
  target is in controlledTargets.
- If a controlling decision has empty/unknown scope, conservatively block ALL Agent
  mutations while it is open.
- The block is surfaced as a tool error naming the open decision so the model can ask
  or route around it.

This applies identically when intentClarificationMode is off (open blocking decisions
persist and gate exactly their controlled mutations).

## Concurrent Discovery Seed

A harness-owned seed executes the discovery tool directly (no provider round, fixing
the forced-toolChoice round at agent-tool-loop.js ~1683):

```
runInitialDiscoverySeed(root, prompt, options):
  name = promptMentionsLikelyFile(prompt) ? "read_open_tabs" : "list_files"
  callId = "seed_" + requestId + "_" + name        // unique, request-scoped
  emit tool "running" event
  result = execute the tool directly
  return synthetic messages:
    { role: "assistant", content: "<seed narration>",
      tool_calls: [ { id: callId, type: "function",
                      function: { name, arguments: JSON.stringify(args) } } ] }
    { role: "tool", tool_call_id: callId, content: <normalized result> }
```

The assistant message MUST carry a valid tool_calls array whose id matches the
following tool message's tool_call_id. An assistant announcement followed directly by a
tool result (with no tool_calls) is rejected by OpenAI-compatible providers.

Concurrency semantics:
- Two child AbortControllers derived from the request signal (extraction, seed);
  aborting one does not abort the other; aborting the parent aborts both; remove the
  parent abort listeners on settle to avoid leaks.
- Launch extraction and the seed together; join with Promise.allSettled.
- Extraction deadline: intentExtractionDeadlineMs (default 12000). On deadline, abort
  the extraction controller and DISCARD its result via a settled flag keyed to
  requestId+revision, so a late extraction can never overwrite a fallback.
- Discovery seed timeout: the seed is governed by the parent request timeout only (no
  separate deadline); it is a local, fast, read-only call. If the seed finishes AFTER a
  fallback contract was already chosen, its synthetic messages are still valid context
  and are kept; the contract choice is independent of the seed.
- Discovery failure does not cancel extraction and vice versa.
- Reasoning must not begin until the contract is ready; if a clarification answer
  changes the relevant target, the seed output is retained as general context and a
  fresh targeted discovery runs at loop start.

Fast path stays Chat-only in v1 (exact signals unchanged from v3: no attachments, no
write/change verbs, no diagnostic/error language, no explicit constraints, no cross-turn
referential phrase, below intentFastPathMaxPromptChars default 240; active-editor
questions fast-path to a contract carrying the active path as an unverified target).

## Model Conversations

Extraction envelope and settings unchanged from v3 (temperature 0, no streaming,
bounded output intentMaxOutputTokens default 1200, forced capture_intent_contract). The
extraction prompt additionally instructs: tag requestedActions with provenance; give
each assumption a kind, relatedTargets, and keywords; set controlledCapabilities/
controlledTargets on any decision that gates an edit; classify relationshipToPrior.

Invalid extraction handling and clarification/refresh prompts are as in v3.

## Multi-turn Merge Semantics

The extractor sets relationshipToPrior; the harness applies deterministic rules on
prior content tagged carried:
- independent: no inheritance.
- continues: carry the prior contract; refine current state; keep prior criteria unless
  superseded.
- extends: carry prior criteria and append new criteria with fresh IDs.
- corrects: replace named fields; the correcting change MUST cite the affected
  field/criterion IDs (via canonical fieldRefs); superseded criteria move to
  supersededCriteria with supersededBy and turn.

Invariants and edge rules:
- ID collision on extend: never reuse an ID; allocate the next free AC*/RA*/T* and
  record any remap.
- Carried prohibitions and outOfScope are preserved: continues and extends may add to
  them but MUST NOT drop a carried prohibitedAction or outOfScope entry (validation
  fails otherwise). Only corrects with an explicit user-authored change, or an approval
  amendment, may remove one.
- Uncertain classification: if the extractor is unsure, it must choose independent and
  emit a visible ambiguity ("Is this a new task or a continuation?") rather than risk
  accidental goal accumulation via a wrong continues/extends.

## Approval Instructions as Amendment -- Full State Transition

When a user rejects an approval with alternative instructions, the harness runs a
complete, isolated transition (not just "re-derive"):

```
Approval instruction received
  -> append the verbatim user instruction as user-authoritative amendment input
  -> enter an isolated capture_intent_contract refresh phase
  -> expose ONLY capture_intent_contract
  -> validate the refreshed contract
  -> replace the injected contract message
  -> persist an amended revision (amendments[]: source approval-instruction,
     provenance clarified, originating tool_call_id, changedFields)
  -> resume the workspace loop
```

Authority: an amendment may change explicit/clarified/inferred content (including goal
or criteria) because it comes from the user; it is NOT counted against the
discovery-revision budget. The original approval tool error is still returned so the
model knows the action was rejected.

Refresh-failure path (do not lose the instruction):
- Preserve the instruction verbatim in amendments[] as unapplied.
- Add a controlling unresolvedDecision scoped to the affected capability/target.
- Block the affected mutations until resolved.
- Never fall back to a contract that silently ignores the instruction.

## Completion Evidence Ledger

Request-scoped ledger extending agent-activity.js (today only apply_edit/write_file,
validation: []). Entry:

```json
{ "id": "EV12", "toolCallId": "call_...", "tool": "run_tests",
  "outcome": "succeeded | failed | denied | not-executed",
  "summary": "18 tests passed", "verifiedState": true,
  "truncated": false, "truncationConfirmed": false }
```

Note: entries do NOT carry a criterion mapping. Nothing in the loop supplies a reliable
EV->AC link, so the assessor assigns it. Every workspace tool call (mutating and
non-mutating: editor-action writes, git mutations, conversion/export, package/build/test)
appends an entry recording outcome, files actually changed (from the extended before/
after capture), any post-action verification (diff applied as intended; compile/test
pass-fail counts), and truncation status.

Admissibility (deterministic, harness-enforced): failed, denied, not-executed, or
truncated-without-confirmation (truncated true and truncationConfirmed false) evidence
CANNOT establish success for any criterion, regardless of what the assessor says.

Semantic relevance (model-produced): whether an admissible EV actually satisfies a given
criterion is judged by the assessor. The harness does not attempt to prove that a
successful read_file semantically established "root cause identified"; it only enforces
existence and admissibility, then renders the assessor's validated verdict deterministically.

## Draft, Assessment, and Streaming UX

By task type:
- answer: stream the final response normally. No hidden draft, no
  assess_acceptance_criteria call, and NO criterion verdict or unmet note (v3's
  "ordinary completion check" did not exist and is removed).
- diagnostic, implementation, planning:
  1. Generate a hidden candidate (non-streamed); keep narration/progress visible.
  2. Forced assess_acceptance_criteria over candidate + evidence ledger + contract.
  3. Validate: each criterion appears once; parse failure -> retry once -> else mark all
     unmet with a warning. Normalize verdicts against admissibility.
  4. The HARNESS appends, deterministically from the validated assessment:
     - the "Criterion | Status | Evidence" table, and
     - an explicit incomplete-task statement whenever any criterion is unmet.
     The candidate cannot know the later assessment result, so neither the table nor the
     incomplete statement may come from the candidate.
  5. Emit candidate prose + harness-appended section as the final result (chunked for
     display); for Plan, insert per the structural rules below.

No automatic remediation on unmet criteria in v1.

## Plan Block Insertion -- Structural Rules

Deterministic content must land inside the single <proposed_plan> block that
runPlanMode extracts and persists, so insertion happens BEFORE extraction/persist:

1. Validate the candidate has exactly one opening <proposed_plan> and one closing
   </proposed_plan>.
2. If malformed (missing/duplicate/unbalanced), normalize: extract the plan body and
   re-wrap it in a single well-formed block.
3. Assess the NORMALIZED candidate -- the exact content that will be saved -- not the
   raw candidate.
4. Insert the assessment section (table + any incomplete statement) immediately before
   </proposed_plan>.
5. Save and show the SAME final plan content; runPlanMode's title/milestone extraction
   runs on this final content.

## Reinjection and Token Budget

One authoritative contract system message, replaced on refresh/revision/amendment,
included in every round and phase, exempt from compaction. Injected as a compacted
projection with hard limits:

- intentInjectedMaxChars default 3500 (hard max 6000). Rationale: 6000 chars is roughly
  1500 tokens, which over ~30 rounds is ~45000 billed input tokens; default to 3500
  (~875 tokens) and only raise when criteria volume requires it.
- Max criteria injected 12; max named targets injected 20 (excess summarized as counts).
- Never dropped: goal, prohibitedActions, criterion id+description, open blocking
  decisions (with control scope), unverified named targets. Dropped first: revisions/
  amendments/superseded audit history, resolved clarifications, resolved decisions,
  low-risk assumptions, verification prose.
- If mandatory fields alone exceed the cap, truncate criterion descriptions with an
  explicit "(truncated)" marker before dropping any mandatory field.

## Clarification Preferences

- ask: up to three blocking questions pre-discovery (Chat/Agent).
- assume: convert non-safety-critical blocking ambiguities into visible assumptions and
  proceed; STOP and ask only when safetyOrScopeCritical is true.
- off: never pre-work clarify; preserve unresolved decisions visibly; Agent may not run a
  mutation matched by an open controlling decision's scope (or any mutation if that
  scope is unknown).

Default biases toward assume.

## Persistence, Events, UI, Resume

Task records -> version 3 adding intentContract, intentStatus, intentRevision,
clarifications, amendments, completionAssessment, evidenceLedger, supersededCriteria.
Older records readable; missing intent fields force extraction. Persist on: extraction
success, clarification emit/answer, refresh/revision/amendment/fallback creation, and
assessment completion.

Bridge: a clarification channel parallel to but separate from approvals
(pendingClarifications map, request-scoped IDs, requestClarification emit-and-wait,
clarification response action, rejection on cancel/shutdown, browser
respondClarification, requestClarification in runtime options).

Events: intent-contract (variant initial|refreshed|revised|amended|fallback),
clarification, clarification-resolved, completion-assessment. Clarification cards carry a
thumbs control (for the over-ask metric); this requires the small UI + persistence
addition included in M4's file scope.

Panel: dedicated renderer (collapsible intent card; provenance and verified/absent state
on targets; revision/amendment indicator; fallback warning; sequential clarification
cards distinct from approvals; saved tasks replay events). No direct contract editing;
users edit the prompt and rerun.

Resume (v1 simplified): persist clarification Q&A; on restart while awaiting, mark the
intent phase interrupted; "Resume" re-extracts using saved answers rather than
resurrecting the exact pending call; a resumed mutation whose saved contract no longer
matches re-extracts first. Exact pending-question replay is deferred.

## Evaluation Protocol

Split the single on/off comparison into independent internal experiment dimensions so a
quality change can be attributed:

```
experiment = {
  intentExtraction:          on | off,
  intentClarification:       on | off,
  intentRevision:            on | off,
  intentCompletionAssessment:on | off
}
```

- One user-facing master preference (intentContractsEnabled) still exists; the four
  dimensions above are internal experiment flags, not user settings.
- Assign the experiment configuration PER CHAT (fixed at chat creation) so
  configurations cannot contaminate across turns within a conversation.
- Dependencies: intentRevision and intentCompletionAssessment require intentExtraction
  on; the harness rejects incoherent combinations.
- Metrics are written to a local, gitignored eval log under the desktop-app storage dir;
  nothing leaves the machine by default.
- Offline harness runs each rubric prompt through configured combinations with fixed
  provider/model/settings, multiple paired repetitions, recording contract source,
  clarification/revision/amendment activity, provider-call count, tokens, and latency.
  Human scoring is blind to configuration.
- Localization measured on ACTUAL files read+edited (from the ledger), not namedTargets.

Numeric rollout gates (defaults, tune with data):
- False-met rate: must not regress; target relative reduction >= 30 percent vs off.
- Latency: median added time-to-final <= 2.0s and p95 <= 5.0s for answer;
  <= 6.0s / p95 <= 12.0s for diagnostic/implementation/planning (which run the hidden
  candidate + assessment).
- Clarification over-ask ceiling: <= 20 percent of asked questions rated not
  decision-shaping.
- Added cost ceiling: <= 2 extra provider calls and <= 25 percent added input tokens per
  task on average.

Broadening (default-on, then beyond Chat fast path) requires meeting all four gates.

## Prompt Profile

Add: intentExtractionSystem, intentClarificationSystem, intentContractRefreshSystem,
intentContractRevisionSystem, completionAssessmentSystem, completionFinalAnswer.
Update chatSystem/agentSystem/planSystem to treat the injected contract as authoritative
and to surface conflicts via report_intent_conflict; update
AGENT_COMPLETION_REPORTING_INSTRUCTION to reference AC IDs; update toolLoopFinalAnswer/
planFinalAnswer for the harness-appended section.

Arm-awareness: for a clean experiment the global prompts must be conditional. When
intentExtraction/intentCompletionAssessment are off, chatSystem/agentSystem/planSystem
and the completion instruction MUST NOT mention contracts, report_intent_conflict, or
criteria tables (byte-for-byte prior behavior in the off configuration).

Name the two schema constants distinctly: INTENT_CONTRACT_SCHEMA_VERSION = 4 and
PROMPT_PROFILE_SCHEMA_VERSION = 2. Existing profiles get defaults; no user-authored
strings are overwritten.

## Files by Milestone

M1: core/intent-contract.js, core/agent-tool-loop.js (fast-path + seed + injection),
config/prompts.js (extraction only, arm-aware), config/defaults.js (prefs/thresholds),
modes/{chat,agent,plan}/index.js, tests/ai-companion-intent-contract.test.js.

M2: core/intent-analysis.js, core/intent-clarification.js, core/intent-conflict.js,
approval-amendment handling in core/agent-tool-loop.js + core/agent-approval-policy.js,
bridge files (ai-companion-bridge.cjs, neutralino-ai-bridge.js),
tests/ai-companion-intent-conflict.test.js, tests/ai-companion-intent-revision.test.js,
tests/ai-agent-approval-policy.test.js.

M3: core/completion-assessment.js, core/agent-activity.js (ledger),
Plan insertion in modes/plan/index.js + core/agent-tool-loop.js,
tests/ai-companion-completion-assessment.test.js, tests/ai-companion-evidence-ledger.test.js.

M4: resources/js/ai-companion/intent-contract-renderer.js, panel.js,
interrupted-task-resume.js, resources/index.html, resources/styles.css,
desktop-app/tests/eval/intent-contracts-eval.js, tests/eval/intent-eval-prompts.json,
tests/ai-companion-intent-ui.test.js.

## Test Plan (key additions beyond v3)

- Hybrid detection: harness auto-raises a validated absent target with no model call; an
  inconclusive single empty grep does not; a model report with a fabricated tool_call_id
  or an assumption conflict whose evidence does not intersect relatedTargets/keywords is
  rejected.
- Field refs: goal-misread and outcome-misread route to ask/record (never silent);
  criterion-unreachable names an AC ID.
- Mutation control: a mutation matching controlledCapabilities or controlledTargets is
  blocked; unknown scope blocks all; identical behavior with clarification off.
- Evidence: failed/denied/not-executed/truncated-unconfirmed EV cannot yield met; ledger
  has no AC mapping; assessor supplies evidenceIds; rendered table matches the object.
- Amendment: full transition applies and persists; refresh failure preserves the verbatim
  instruction, adds a controlling decision, and blocks affected mutations without silently
  dropping the instruction.
- Answer mode: streams, no assessment call, no table, no unmet note.
- Completion: harness (not candidate) appends table + incomplete statement.
- Plan insertion: exactly-one-block validation; malformed candidate normalized; assessment
  runs on the normalized content that is saved and shown.
- Multi-turn: extend never reuses IDs; continues/extends cannot drop carried
  prohibitions/scope; corrects cites affected IDs and moves superseded criteria; uncertain
  classification yields independent + a visible ambiguity; requestedActions provenance is
  honored by the authority router.
- Concurrency: synthetic assistant message has valid tool_calls with an id matching the
  tool result; unique request-scoped IDs; parent abort listeners removed on settle; a late
  extraction after fallback is discarded; a late seed after fallback is kept as context;
  discovery failure does not cancel extraction.
- Eval: independent flags toggle independently; incoherent combos rejected; configuration
  fixed per chat; localization scored on files read+edited; off configuration is
  byte-for-byte prior behavior including contract-free global prompts.

## Assumptions and Deliberate Boundaries

- Intent uses the selected model; cheap = small envelope, temperature 0, bounded output,
  no streaming, one forced function, overlapped with the seed.
- Fast path is Chat-only in v1; Agent and Plan always extract.
- Discovery may correct inferred localization/assumptions; it never rewrites an inferred
  goal/criterion silently and never creates prohibitions or scope.
- One questioning mechanism (ask_clarification) across modes; Plan uses it only
  post-discovery under bounded conditions.
- Harness renders the criteria table and incomplete statement; quick answers stay clean.
- No repo files change during the intent phase; no automatic remediation after assessment.
- Ships behind a master flag with independent internal experiment dimensions and a
  local-only eval harness; unrelated provider, security, tool, and editor behavior is not
  refactored.

## Required-before-implementation checklist (this round)

1. Hybrid conflict detection + canonical field refs + assumption-evidence association. DONE (Hybrid Conflict Detection; Canonical Field References; assumptions carry kind/relatedTargets/keywords).
2. Control-scoped mutation blocking (controlledCapabilities/controlledTargets; unknown -> block all). DONE (Mutation Control Scope).
3. Evidence existence/admissibility vs semantic-relevance split; drop ledger AC mapping. DONE (Completion Evidence Ledger; assessor maps EV->criteria).
4. Complete approval-amendment state transition incl. refresh-failure path. DONE (Approval Instructions as Amendment).

Completion/Plan/multi-turn/concurrency/eval/minor items are folded into their sections
above. Delivery is staged as M1-M4, each behind the master flag until M3 lands.