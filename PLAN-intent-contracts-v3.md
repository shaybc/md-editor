# Plan: Explicit Intent Contracts for AI Companion (v3)

ASCII-only document. All arrows are written "->", dashes as "--", ellipses as
"...". No box-drawing or Unicode punctuation is used, so the text is safe to paste
directly into implementation prompts regardless of editor encoding.

This version supersedes PLAN-intent-contracts-revised.md and closes the five
required-before-implementation gaps plus the moderate items from review.

## What changed from the prior revision

1. Field-level provenance and an authority model so a confidently-wrong
   interpretation of the goal is corrected by asking the user, not silently revised;
   discovery can never create prohibitions or scope.
2. A concrete, deterministic conflict-detection mechanism: stable IDs on targets and
   assumptions, deterministic search tracking, and a non-mutating
   report_intent_conflict tool whose cited tool-call IDs are validated before any
   revision runs.
3. A harness-owned, directly-executed, cancellable concurrent discovery seed with
   exact concurrency semantics (separate controllers, allSettled, extraction
   deadline, timed-out-extraction discard).
4. A normalized completion evidence ledger that the assessor must cite by EV ID, and
   the activity layer extended beyond apply_edit/write_file to produce it.
5. An explicit, honest draft-vs-stream UX decision per task type, and a real
   post-discovery clarification path for Plan instead of prose that terminates the run.

Plus moderate fixes: relationshipToPrior multi-turn merge, approval instructions as
a user-directed intent amendment, exact Chat-only fast-path signals, concrete token
numbers, sharper clarification preference semantics, a simplified v1 resume, and an
executable evaluation protocol.

## Summary

Add a bounded intent phase around workspace discovery for Chat, Agent, and Plan. It
converts the request into a validated, persisted intent contract with field-level
provenance, optionally clarifies blocking ambiguities, corrects itself under bounded
rules when discovery contradicts inferred content, and drives an evidence-backed
completion assessment. The intent phase has its own restricted tool inventory and
never receives workspace, editor-action, Git, graph, command, API Client, settings,
conversion, or plan-repository tools.

High-level flow (ASCII):

```
Prompt + compact request context
  -> Fast-path check (Chat only; may skip extraction for trivial read-only prompts)
  -> Launch concurrently:
        (a) Intent extraction call
        (b) Harness-owned read-only discovery seed (executed directly)
  -> Join (Promise.allSettled, extraction deadline enforced)
  -> Optional bounded clarification (Chat/Agent, preference-gated)
  -> Refresh / repair / fallback as needed
  -> Persist + display contract
  -> Workspace loop
        - contract reinjected every round
        - model may emit report_intent_conflict (non-mutating)
        - harness validates the conflict, then runs one bounded revision OR
          asks the user, per provenance/authority rules
  -> Draft candidate (hidden for diagnostic/implementation/planning)
  -> Completion assessment (forced call, cites evidence-ledger EV IDs)
  -> Deterministic per-criterion table render (harness, not the model)
  -> Final response (streamed path for answer; candidate+table for others)
```

## Intent Contract (schema v3)

```json
{
  "schemaVersion": 3,
  "source": "extracted",
  "relationshipToPrior": "independent",
  "taskType": "implementation",

  "goal":            { "value": "...", "provenance": "explicit" },
  "expectedOutcome": { "value": "...", "provenance": "inferred" },

  "requestedActions": ["..."],
  "prohibitedActions": [{ "value": "...", "provenance": "explicit" }],
  "outOfScope":       [{ "value": "...", "provenance": "explicit" }],

  "acceptanceCriteria": [
    {
      "id": "AC1",
      "description": "Observable outcome.",
      "verification": "Evidence needed to mark met.",
      "provenance": "explicit"
    }
  ],

  "namedTargets": {
    "files":   [{ "id": "T1", "value": "src/example.js", "source": "prompt", "status": "unverified" }],
    "symbols": [],
    "errors":  [],
    "uiAreas": []
  },

  "assumptions": [
    { "id": "A1", "statement": "...", "risk": "low", "provenance": "inferred" }
  ],

  "unresolvedDecisions": [
    { "id": "D1", "description": "...", "blocking": false, "controlsMutation": false }
  ],

  "ambiguities": [
    { "id": "AMB1", "question": "...", "reason": "...", "impact": "high",
      "blocking": true, "safetyOrScopeCritical": false, "suggestedAnswers": [] }
  ],

  "clarifications": [
    { "ambiguityId": "AMB1", "question": "...", "answer": "..." }
  ],

  "amendments": [
    { "id": "AM1", "source": "approval-instruction", "summary": "...",
      "changedFields": ["acceptanceCriteria.AC2"], "toolCallId": "call_..." }
  ],

  "revisions": [
    { "id": "R1", "trigger": "discovery-conflict", "conflictId": "C1",
      "summary": "...", "changedFields": ["namedTargets.T1", "assumptions.A1"] }
  ]
}
```

Rules:

- taskType is one of answer, diagnostic, planning, implementation.
- goal, expectedOutcome, and at least one acceptance criterion are required.
- Every field that can be revised or challenged carries provenance (see next
  section). Named targets and assumptions carry stable IDs (T1.., A1..).
- Criteria are observable outcomes with deterministic AC1, AC2... IDs preserved
  across refresh/revision when meaning is unchanged.
- Named targets are unverified leads with status unverified|confirmed|absent and
  source prompt|active-editor|attachment|history.
- unresolvedDecisions carry controlsMutation, meaning "an Agent mutation depends on
  choosing between the open options."
- ambiguities carry safetyOrScopeCritical for the clarification-preference semantics.
- amendments and revisions are append-only audit logs.
- Harness-owned metadata also records mode, workspace, prompt fingerprint,
  conversation anchor, timestamps, revision counter, validation state, and any
  fallback reason.

Fallback and fast-path contracts:

- source raw-prompt-fallback or fast-path. Normalized prompt as goal.value and
  expectedOutcome.value with provenance "inferred"; a single AC1 criterion.
- Fallback additionally carries a visible warning that structured extraction was
  unavailable. Fast-path carries an informational note and, for active-editor
  questions, includes the active file path as an unverified named target.

## Provenance and Authority Model (Required 1)

Provenance is the mechanism that lets a wrong interpretation be corrected safely.

Provenance values:

- explicit: directly stated by the user. Only user clarification or a user-directed
  amendment can change it.
- clarified: established through a clarification answer. Only later user instruction
  can change it.
- inferred: supplied by the extractor. Discovery evidence may challenge it.
- carried: inherited from a prior turn's contract. The new turn may replace it per
  relationshipToPrior rules.

Authority rules the harness enforces:

- Discovery evidence may directly revise only inferred or carried content that is a
  named target, assumption, unresolved decision, or a criterion's verification field.
- When discovery evidence contradicts an inferred (or carried) goal, expectedOutcome,
  or a criterion's description, the harness does NOT silently revise it. It:
  1. If clarification is enabled: asks the user one bounded clarification tying the
     evidence to the contested field, then applies the answer as a clarified change.
  2. If clarification is disabled: preserves both interpretations in
     unresolvedDecisions (marked controlsMutation when relevant), keeps the original
     value, and blocks any Agent mutation that depends on choosing between them.
- Discovery evidence may never add or strengthen prohibitedActions or outOfScope.
  Repository facts cannot create user intent. Evidence may only raise an
  unresolvedDecision or an assumption recommending caution; only the user (via
  clarification or an approval-instruction amendment) can establish a prohibition or
  a scope boundary.
- explicit and clarified content is immutable to discovery entirely.

## Restricted Phase Tools

Available functions are replaced, not appended, per phase:

| Phase                           | Available functions            |
|---------------------------------|--------------------------------|
| Intent extraction               | capture_intent_contract only   |
| Clarification (pre or post)     | ask_clarification only         |
| Refresh / repair / revision     | capture_intent_contract only   |
| Workspace loop                  | mode tools + report_intent_conflict |
| Completion assessment           | assess_acceptance_criteria only|
| Final response                  | no tools                       |

### capture_intent_contract

Internal forced function for extraction, refresh, and revision. Argument schema is
the contract schema; the harness validates and consumes it; it executes no workspace
action; it is never in the normal Agent tool list. Forced function calling is used
because both providers support it and neither exposes JSON-schema response formatting.

### ask_clarification

Blocking function, intent phase and (for Plan) one bounded post-discovery batch:

```json
{ "ambiguityId": "AMB1", "question": "...", "reason": "...",
  "answerType": "free_text", "choices": [] }
```

- Never callable from the normal loop or final phase.
- Emits a clarification bridge event and waits; the answer returns as the tool result.
- No approval/grant/mutation semantics.
- At most three highest-impact blocking ambiguities pre-discovery; at most one batch
  post-discovery for Plan.
- Questions shown sequentially as separate cards; the run stays active.

### report_intent_conflict (Required 2, new; non-mutating, in the workspace loop)

The model calls this when workspace evidence contradicts the contract:

```json
{
  "fieldId": "T1",
  "conflictType": "target-absent | target-relocated | assumption-contradicted | goal-misread | criterion-unreachable",
  "evidenceToolCallIds": ["call_ab12", "call_cd34"],
  "explanation": "One or two sentences tying the evidence to the field.",
  "userClarificationRequired": false
}
```

- It is read-only: it never edits, never mutates, and returns a small acknowledgement.
- The harness validates it before acting (see conflict mechanism). Invalid reports
  (unknown fieldId, no cited tool calls, cited calls that do not exist) are rejected
  with a tool error and no revision is launched.

### assess_acceptance_criteria

Internal forced function after a draft candidate exists. The model must cite evidence
by ledger EV ID:

```json
{
  "overallStatus": "complete | incomplete",
  "criteria": [
    { "id": "AC1", "status": "met | unmet",
      "evidenceIds": ["EV12"], "explanation": "..." }
  ],
  "unmetSummary": ""
}
```

- Only met or unmet per criterion; missing or uncited evidence yields unmet, never an
  optimistic inference.
- The harness -- not the model -- renders the final table from this validated object.

## Conflict Detection and Bounded Revision (Required 2)

"Revision on conflict" must be harness behavior, not prompt advice. Mechanism:

1. Stable IDs. Every named target (T*) and assumption (A*) has an ID at extraction.
2. Deterministic search tracking. The loop maintains a per-request map from each
   discovery/search tool call (its tool_call_id, tool name, args, and result shape)
   to the target/assumption IDs it plausibly bears on. Association is deterministic
   and evidence-based:
   - A glob/list_files/search_grep/search_vault whose pattern or returned paths match
     a target file/symbol string is associated with that target ID.
   - Distinguish "no matches" from "wrong pattern": a target file is treated as
     conclusively absent only when (a) a direct path read_file returns not-found, or
     (b) a glob on the exact basename AND a search_grep on the symbol name both return
     zero, across the tracked searches. A single empty grep is "inconclusive," not
     "absent," and does not by itself justify a target-absent conflict.
   - "True locus elsewhere" (target-relocated) requires positive evidence: a confirmed
     match for the described behavior in a file not listed in namedTargets.
3. Model-raised conflicts. When the model calls report_intent_conflict, the harness:
   - Confirms fieldId exists and evidenceToolCallIds are all present in the tracked
     search map for this request.
   - Confirms the cited evidence actually supports the declared conflictType using the
     deterministic rules above (for example a target-absent claim must meet the
     absence bar). Unsupported claims are rejected with a tool error.
4. Routing by provenance and authority:
   - If the contested field is inferred/carried and is a target, assumption, decision,
     or criterion verification -> run one bounded capture_intent_contract revision in
     an isolated phase, given the current contract and the validated conflict.
     Immutable guards: goal.value and expectedOutcome.value cannot change; criterion
     IDs/descriptions preserved; prohibitedActions/outOfScope may not be added or
     strengthened; explicit/clarified content untouched.
   - If the contested field is an inferred goal/expectedOutcome/criterion-description
     (conflictType goal-misread or criterion-unreachable) -> do NOT revise. Follow the
     authority rule: ask the user if clarification is enabled; otherwise record both
     interpretations in unresolvedDecisions and block dependent mutations.
5. Budget. At most one discovery-driven revision per request. Further validated
   conflicts are recorded as unresolvedDecisions and surfaced in the assessment.
   (Approval-instruction amendments are separate and not counted here.)
6. Every accepted conflict is logged (C*), the revision or clarification is persisted,
   and an intent-contract event (revised or clarify variant) is emitted.

## Concurrent Discovery Seed (Required 3)

The existing forced discovery is a model round: the harness calls the model with a
forced toolChoice (agent-tool-loop.js line ~1683) and only then executes the chosen
tool. To overlap discovery with extraction, add a harness-owned seed that skips the
model round:

```
runInitialDiscoverySeed(root, prompt, options):
  name = promptMentionsLikelyFile(prompt) ? "read_open_tabs" : "list_files"
  emit tool "running" event
  result = execute that tool directly (no provider call)
  return { name, args, result, syntheticMessages: [assistant-announce, tool-result] }
```

Concurrency semantics (exact):

- Create two child AbortControllers from the request signal: one for extraction, one
  for the seed. Aborting one does not abort the other; aborting the parent aborts both.
- Launch extraction and runInitialDiscoverySeed together; join with
  Promise.allSettled.
- Extraction deadline: a bounded timeout (default 12s, configurable
  intentExtractionDeadlineMs). On deadline, abort the extraction controller and
  DISCARD its result -- a late response must never arrive and overwrite an
  already-created fallback contract (guard by a settled flag keyed to the request +
  revision).
- Discovery failure must not cancel extraction; extraction failure must not cancel
  discovery. Each is handled independently on join.
- The seed's syntheticMessages are appended to the workspace message array so the
  first real reasoning round starts with discovery already in hand and usedTools=true
  (so the loop does not re-force discovery).
- Clarification may wait while discovery finishes, but workspace reasoning must not
  begin until the contract is ready. If a clarification answer changes the relevant
  target, the seed output is retained as general context and a fresh targeted
  discovery is performed at the start of the loop rather than discarded.

Fast path is Chat-only in v1 (see below); Agent and Plan always extract, so for them
the seed simply overlaps with a guaranteed extraction call.

## Fast Path (Chat only, exact signals)

A Chat prompt bypasses extraction to a fast-path contract only when ALL hold:

- Mode is Chat and intentFastPathEnabled is true.
- No attachments.
- No write/change verbs (add, change, edit, fix, implement, refactor, rename, delete,
  create, update, remove, write, replace, generate, ... configurable list).
- No diagnostic/error language (error, exception, stack trace, fails, broken, bug,
  crash, ... configurable list).
- No explicit constraint/prohibition language (must, must not, only, do not, without,
  never, ... configurable list).
- No cross-turn referential phrase (also, instead, continue, that change, as before,
  keep, still, ... configurable list).
- Prompt length below an exact threshold (default 240 characters /
  intentFastPathMaxPromptChars).

Active-editor questions ("what does this function do?") may fast-path, but only to a
contract that includes the active file path as an unverified named target so later
context is anchored. Any signal failing -> full extraction. Fast-path contracts are
first-class: persisted, injected, and (not relevant in Chat) would satisfy the
mutation guard.

## Model Conversations

Input envelope (extraction): current mode, current prompt, prior turns needed to
resolve references, active file path/tab type/compact selection context, attachment
names/types/bounded excerpts. No directory listing, search results, Git state, or
inferred repo facts. The full 20000-character active buffer is not sent; only enough
to resolve "this function" / "the selected text."

Extraction call settings: same model/provider, temperature 0, bounded output
(intentMaxOutputTokens default 1200), no streaming, only capture_intent_contract,
forced choice, usage/debug events still emitted.

Extraction system prompt adds provenance and relationshipToPrior instructions:

```
You are the intent-analysis stage of AI Companion.

Do not answer, inspect the repository, propose implementation details, or claim
facts about files that were not inspected.

Extract only what the user asks and what the request context supports. Tag every
goal, expected outcome, prohibited action, scope item, and acceptance criterion with
provenance: explicit if the user stated it directly, inferred if you are supplying
it, carried if it comes from the provided prior contract. Never mark inferred content
as explicit.

Write acceptance criteria as observable outcomes. Identify requested and prohibited
actions, out-of-scope work, assumptions (with risk), unresolved decisions (mark
controlsMutation when an edit depends on the choice), and ambiguities (mark blocking
and safetyOrScopeCritical). Treat named files, symbols, errors, and UI areas as
unverified references with stable IDs.

If a prior contract is provided, classify relationshipToPrior as independent,
continues, extends, or corrects. Classify taskType as answer, diagnostic, planning,
or implementation. Call capture_intent_contract exactly once.
```

Clarification and refresh prompts are as before (ask exactly one supplied blocking
ambiguity; refresh preserving unaffected IDs and recording answers as clarified
provenance). The revision prompt additionally states the immutable guards from the
conflict section and that it must only touch inferred/carried revisable fields.

Invalid extraction: Chat -> immediate raw-prompt fallback; Agent/Plan -> one repair
attempt, then one generic restate-the-outcome clarification card, then fallback.
Every fallback emits a fallback-marked intent-contract event with a visible warning;
Agent may mutate only after the fallback is persisted.

## Multi-turn Merge Semantics (moderate)

The extractor sets relationshipToPrior; the harness applies deterministic rules using
prior content tagged carried:

- independent: do not inherit prior criteria or goal; new contract stands alone.
- continues: preserve the prior contract as carried; refine current state; keep prior
  criteria unless superseded.
- extends: preserve prior criteria (carried) and append new criteria with fresh IDs.
- corrects: replace the affected fields; move superseded criteria to an audit list and
  mark the correcting change with provenance clarified/explicit as appropriate.

The conversation anchor (chat ID + turn index) plus prompt fingerprint gates reuse;
an edited/rerun prompt always yields a new contract.

## Approval Instructions as Intent Amendment (moderate)

When a user rejects an approval with alternative instructions (today this returns as a
tool error only), the harness also treats it as a user-directed amendment:

- Higher authority than discovery revision: it may change explicit/clarified/inferred
  content, including goal or criteria, because it comes from the user.
- Recorded in amendments[] with source approval-instruction, provenance clarified, the
  originating tool_call_id, and changedFields; the contract message is replaced.
- NOT counted against the one discovery-revision budget.
- Before the next mutation, the contract (and, for diagnostic/implementation, the
  criteria) are re-derived so the amended intent -- not the stale one -- is authoritative.
- The tool error is still returned so the model knows the action was rejected.

## Completion Evidence Ledger (Required 4)

The assessor cannot produce evidence-backed verdicts unless the harness gives it
normalized evidence. Extend the activity layer (which today tracks only apply_edit and
write_file and returns validation: []) into a request-scoped ledger:

```json
{
  "entries": [
    { "id": "EV12", "toolCallId": "call_...", "tool": "run_tests",
      "outcome": "succeeded | failed | denied | not-executed",
      "summary": "18 tests passed",
      "targets": ["AC2"], "verifiedState": true, "truncated": false }
  ]
}
```

Every workspace tool call appends a ledger entry recording:

- The tool call ID and a normalized result summary.
- outcome: succeeded, failed, denied (approval rejected, with instructions captured),
  or not-executed.
- Files actually changed (from the existing before/after mutation capture), extended
  beyond apply_edit/write_file to editor-action writes, git mutations, conversion/
  export, and package/build/test tools.
- Post-action comparison or verification result where one exists (diff applied as
  intended; compile/test pass/fail).
- Test/build results as structured pass/fail counts when available.
- truncated status when the underlying result was cut to MAX_TOOL_RESULT_CHARS.

The assessor call receives the ledger and the contract; each criterion verdict must
cite one or more existing EV IDs. A verdict citing no EV, or an EV that does not
support success, is normalized to unmet.

## Draft, Assessment, and Streaming UX (Required 5)

Resolve the draft-vs-stream contradiction explicitly by task type:

- answer: keep the current streamed final path. No hidden draft, no forced
  assess_acceptance_criteria call, no criteria table. If the single AC1 is judged
  unmet by the ordinary completion check, append a one-line "this did not fully
  answer the request" note. This keeps quick answers fast and cheap.
- diagnostic, implementation, planning:
  1. Generate a hidden candidate answer (non-streamed), with narration/progress still
     visible so the UI is not frozen.
  2. Run one forced assess_acceptance_criteria call over the candidate + evidence
     ledger + contract.
  3. Validate: every contract criterion appears exactly once; parse failure -> retry
     once -> else conservatively mark all unmet with an assessment warning.
  4. Render the "Criterion | Status | Evidence" table deterministically from the
     validated assessment object in harness code (a mismatch between a rendered status
     and the object is a bug, not a style choice).
  5. Emit the candidate prose plus the harness table as the final result (chunked for
     display), and for Plan place the table inside the single <proposed_plan> block so
     Plan's output contract stays valid.
  6. Any unmet criterion yields an explicit incomplete-task statement.

This accepts a slower time-to-first-content for the three heavy task types and makes
that trade explicit; the evaluation section measures it. No automatic remediation is
triggered by unmet criteria in v1.

## Plan Mode: Real Post-discovery Clarification (Required 5)

Plan's system prompt telling the model to "ask a question" is not a usable loop --
when Plan stops calling tools the harness proceeds to the forced final plan. So Plan
uses ask_clarification after discovery, bounded:

- Allowed only when the contract already contains a blocking ambiguity, read-only
  discovery did not resolve it, and it has not already been asked.
- At most one post-discovery clarification batch (<= 3 questions).
- Answers are applied as a clarified refresh; still-unresolved blocking ambiguities
  are recorded in the proposed plan rather than silently decided.
- Pre-discovery clarification remains disabled for Plan; extraction-recovery
  clarification is still allowed.

This gives one questioning mechanism across all modes.

## Reinjection and Token Budget (numbers)

Insert exactly one authoritative contract system message after prior history and
before the current user message; replace it on refresh/revision/amendment; include it
in every planning round, continuation, resume, revision call, assessment, and final
request; exempt it from tool-result compaction.

The injected form is a compacted projection, not the full record, with hard limits:

- Max injected size: 6000 characters (about 1500 tokens), intentInjectedMaxChars.
- Max criteria injected: 12; max named targets injected: 20 (excess summarized as
  counts).
- Field priority (highest first, never dropped): goal, prohibitedActions, acceptance
  criteria (id + description), open blocking unresolvedDecisions, unverified named
  targets. Dropped first when over budget: revisions/amendments audit history, resolved
  clarifications, resolved decisions, low-risk assumptions, verification prose.
- If mandatory fields alone exceed the cap, criteria descriptions are truncated with an
  explicit "(truncated)" marker before any mandatory field is dropped; goal, prohibited
  actions, criteria identity, and open blocking decisions are never dropped.

Extraction/assessment/revision calls use temperature 0 and the bounded output above.
Measured per-round overhead is recorded in the test pass.

## Clarification Preferences (sharper)

intentClarificationMode:

- ask: ask up to three blocking questions pre-discovery (Chat/Agent).
- assume: convert non-safety-critical blocking ambiguities into visible assumptions
  and proceed; STOP and ask only when safetyOrScopeCritical is true.
- off: never run pre-work clarification; preserve unresolved decisions visibly; Agent
  may not perform a mutation where a blocking unresolvedDecision has
  controlsMutation=true.

Default biases toward assume (proceed with visible assumptions) over interrogation.

## Persistence, Events, UI, and Resume

Task records -> version 3, adding intentContract, intentStatus, intentRevision,
clarifications, amendments, completionAssessment, evidenceLedger. Older records remain
readable; missing intent fields force extraction on a new run or resumed action.
Persist on: extraction success, clarification emit, clarification answer, refresh/
revision/amendment/fallback creation, and assessment completion.

Bridge: a clarification channel parallel to but separate from approvals
(pendingClarifications map, request-scoped ID, requestClarification() emit-and-wait,
clarification response action, rejection on cancel/shutdown, browser
respondClarification(id, answer), requestClarification in runtime options).

Events: intent-contract (with variant initial|refreshed|revised|amended|fallback),
clarification, clarification-resolved, completion-assessment. A thumbs signal on
clarification cards (for the over-ask metric) requires a small UI + persistence
addition included in the file scope below.

Panel: a dedicated renderer (collapsible intent card; provenance and verified/absent
state on targets; revision/amendment indicator; fallback warning banner; sequential
clarification cards visually distinct from approvals; saved tasks replay contract/
revision/clarification events). Direct contract editing is excluded; users edit the
prompt and rerun.

Resume (simplified for v1):

- Persist clarification questions and answers.
- If the app restarts while awaiting clarification, mark the intent phase interrupted.
- "Resume" reruns intent extraction using the saved answers rather than resurrecting
  the exact pending tool call. Exact pending-question replay is deferred to a later
  increment.
- A resumed pending mutation whose saved contract no longer matches re-extracts before
  replaying the action.

## Evaluation Protocol (executable)

- Separate the user preference from experiment assignment. intentContractsEnabled is
  the user setting; a distinct experimentArm value drives A/B and is not user-facing.
- Assign the A/B arm at chat creation (not per turn) so contracts cannot contaminate
  across arms within a conversation.
- Metric storage: metrics are written to a local, gitignored evaluation log under the
  desktop-app storage dir; nothing leaves the machine by default. Any future upload is
  a separate, explicitly-opted decision.
- Offline harness: run each rubric prompt through both arms with fixed provider, model,
  and settings, multiple paired repetitions, recording per-run contract source,
  clarification/revision/amendment activity, tokens, provider-call count, and latency.
- Human scoring is blind to the assigned arm.
- Localization is measured against ACTUAL files read and edited during the run (from
  the evidence ledger), not against namedTargets, since initial targets are
  deliberately repository-blind. namedTargets accuracy after revision is a secondary
  signal.
- Metrics: task success (blind rubric), localization precision/recall on files
  read+edited, false-met rate (primary), clarification over-ask rate (thumbs), revision
  usefulness, and added calls/tokens/latency split by fast-path vs full extraction.
- Rollout: internal flag -> measure -> default-on for Agent implementation -> broaden
  once false-met rate and latency targets are met.

## Prompt Profile Changes (arm-aware)

Add entries: intentExtractionSystem, intentClarificationSystem,
intentContractRefreshSystem, intentContractRevisionSystem, completionAssessmentSystem,
completionFinalAnswer. Update chatSystem/agentSystem/planSystem to recognize the
injected contract as authoritative and to surface (not absorb) conflicts via
report_intent_conflict. Update AGENT_COMPLETION_REPORTING_INSTRUCTION to reference
stored AC IDs; update toolLoopFinalAnswer and planFinalAnswer for the harness-rendered
table.

Critical for a clean A/B: "byte-for-byte prior behavior when off" requires the global
system prompts to be conditional. In the off arm, chatSystem/agentSystem/planSystem
and the completion instruction must NOT mention contracts, report_intent_conflict, or
criteria tables. Bump the prompt profile schema to version 2 with defaults for new
entries; no user-authored strings are overwritten.

## Implementation Structure and Files

Orchestrator stays in agent-tool-loop.js; new responsibilities in focused modules.

Core/config:
- core/intent-contract.js (schema, provenance, normalization, validation,
  fallback/fast-path, fingerprint, conversation anchor, compacted injection with the
  numeric limits)
- core/intent-analysis.js (extraction, repair, refresh, discovery-conflict revision
  routing, relationshipToPrior application, phase-only provider calls)
- core/intent-clarification.js (ranking, bounded pre/post-discovery clarification,
  tool results)
- core/intent-conflict.js (search tracking, evidence-to-target association,
  report_intent_conflict validation, absence/relocation rules)
- core/completion-assessment.js (evidence ledger consumption, forced assessment,
  validation, conservative fallback, deterministic table render)
- core/agent-activity.js (extend into the evidence ledger; add outcomes and
  non-mutating tool coverage)
- core/agent-tool-loop.js (fast-path check, concurrent seed, revision/amendment hooks,
  draft/assessment/final orchestration)
- config/prompts.js (new + arm-aware prompts)
- config/defaults.js (new preferences and thresholds)

Mode/bridge:
- modes/chat/index.js, modes/agent/index.js, modes/plan/index.js
- resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs
- resources/js/ai-companion/neutralino-ai-bridge.js

Panel/persistence:
- resources/js/ai-companion/intent-contract-renderer.js
- resources/js/ai-companion/panel.js
- resources/js/ai-companion/interrupted-task-resume.js
- resources/index.html, resources/styles.css

Evaluation:
- desktop-app/tests/eval/intent-contracts-eval.js
- desktop-app/tests/eval/intent-eval-prompts.json

Tests:
- ai-companion-intent-contract.test.js
- ai-companion-intent-conflict.test.js (new)
- ai-companion-intent-revision.test.js (new)
- ai-companion-intent-ui.test.js
- ai-companion-completion-assessment.test.js
- ai-companion-evidence-ledger.test.js (new)
- ai-companion-prompts.test.js
- ai-agent-approval-policy.test.js

## Test Plan (additions beyond the prior version)

Provenance/authority:
- inferred goal/expectedOutcome/criterion contradicted by evidence -> asks (ask mode)
  or blocks dependent mutation (off mode); never silently revised.
- explicit/clarified content is never changed by discovery.
- discovery cannot add or strengthen prohibitedActions/outOfScope.

Conflict mechanism:
- a single empty grep is inconclusive; target-absent requires the direct-read or
  basename-glob + symbol-grep double-zero bar.
- report_intent_conflict citing a non-existent tool_call_id or unknown fieldId is
  rejected with no revision.
- target-relocated requires a positive confirmed match elsewhere.
- at most one discovery revision per request; further conflicts become
  unresolvedDecisions.

Concurrent seed:
- seed executes the tool directly with no provider call and injects synthetic messages
  so discovery is not re-forced.
- extraction and seed use separate controllers; deadline aborts and discards a late
  extraction so it cannot overwrite a fallback; discovery failure does not cancel
  extraction and vice versa.
- clarification that changes a target retains the seed as context and re-runs targeted
  discovery.

Evidence ledger + assessment:
- ledger records succeeded/failed/denied/not-executed for mutating AND non-mutating
  tools, files changed, and test/build results.
- assessment verdicts must cite existing EV IDs; uncited or unsupported -> unmet.
- rendered table matches the validated object exactly; mismatch is a failure.

UX/mode:
- answer keeps streamed path with no assessment call and no table.
- diagnostic/implementation/planning produce hidden candidate + assessment + table;
  Plan's table is inside the proposed-plan block; narration stays visible.
- Plan asks a bounded post-discovery clarification only under the four conditions.

Amendment/multi-turn/preferences/resume/eval:
- approval instructions amend the contract with provenance clarified, outrank discovery
  revision, are not counted against the revision budget, and force re-derivation before
  the next mutation.
- relationshipToPrior independent/continues/extends/corrects apply the specified merge.
- assume vs off differ exactly on safetyOrScopeCritical and controlsMutation handling.
- v1 resume re-extracts from saved answers rather than replaying the pending call.
- off arm is byte-for-byte prior behavior including contract-free global prompts; A/B
  arm is fixed at chat creation; localization measured on files read+edited.

## Assumptions and Deliberate Boundaries

- Intent uses the selected model; "cheap" means small envelope, temperature 0, bounded
  output, no streaming, one forced function, overlapped with discovery.
- Fast path is Chat-only in v1; Agent and Plan always extract.
- Discovery may correct inferred localization/assumptions; it may never rewrite an
  inferred goal/criterion silently and may never create prohibitions or scope.
- One questioning mechanism (ask_clarification) across modes; Plan uses it only
  post-discovery under bounded conditions.
- The per-criterion table is harness-rendered and scoped to diagnostic/implementation/
  planning; quick answers stay clean.
- No repository files change during the intent phase; no automatic remediation after
  assessment.
- Ships behind an arm-aware capability flag with an executable local-only eval harness;
  unrelated provider, security, tool, and editor behavior is not refactored.

## Required-before-implementation checklist

1. Field-level provenance + user-confirmed path for revising inferred goals/criteria. DONE (Provenance and Authority Model; Conflict routing step 4).
2. Deterministic conflict reporting + evidence-to-contract mapping. DONE (report_intent_conflict; Conflict Detection mechanism).
3. Direct, cancellable concurrent discovery seed. DONE (Concurrent Discovery Seed with exact semantics).
4. Normalized completion evidence ledger. DONE (Completion Evidence Ledger; agent-activity.js extension).
5. Resolve hidden-draft vs streaming and give Plan a real post-discovery clarification path. DONE (Draft/Assessment/Streaming UX; Plan Mode clarification).

Everything else (thumbs UI, exact pending-question resume replay, automatic
remediation, broadening the fast path beyond Chat) is explicitly staged for later
increments.
```