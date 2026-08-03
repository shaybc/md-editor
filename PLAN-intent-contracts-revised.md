# Plan: Explicit Intent Contracts for AI Companion (Revised)

## Revision Notes

This revision keeps the original design intact and folds in fixes for the four
major holes plus the moderate ones identified in review:

- **Latency/cost (Major 1):** the intent phase now has an explicit *fast path* and
  runs extraction *concurrently* with read-only discovery instead of serially. It
  is no longer an unconditional serial pre-step on every request.
- **Frozen contract (Major 2):** a bounded, audited **contract-revision on
  discovery conflict** step is added so a confidently-wrong contract can be
  corrected by evidence instead of amplified.
- **Assessment drift + forced table (Major 3):** the per-criterion table is now
  **rendered deterministically** from the validated assessment object rather than
  transcribed by the final generation, and the table is scoped by `taskType`
  instead of forced onto every response.
- **No quality measurement (Major 4):** an **Evaluation and Rollout** section adds
  an A/B capability flag, an offline eval set, and success metrics.
- **Moderate fixes:** multi-turn contract carry, Plan-mode single-questioning
  reconciliation, a user preference to tune/disable pre-work clarification, a
  token-budget accounting note, an expanded resume edge matrix, per-`taskType`
  behavior made explicit, and corrected mutation-guard framing.

## Summary

Add a bounded intent phase around workspace discovery for Chat, Agent, and Plan.
It converts the request into a validated, persisted **intent contract**, optionally
clarifies important ambiguities, revises itself once when discovery contradicts it,
and serves as the authoritative target for later rounds and for a deterministic
completion assessment.

The intent phase has its own restricted tool inventory. It never receives
workspace, editor-action, Git, graph, command, API Client, settings, conversion,
or plan-repository tools.

The high-level flow:

```text
Prompt and compact request context
→ Fast-path check (skip / defer extraction for trivial read-only prompts)
→ Intent extraction  ┐
                     ├─ run concurrently with read-only discovery seed
→ Read-only discovery┘
→ Optional bounded clarification (Chat/Agent, preference-gated)
→ Contract refresh or fallback
→ Persist and display contract
→ Reinject contract on every model request
→ Workspace loop
     └─ Contract-revision-on-conflict check (bounded, once)
→ Draft final response
→ Structured acceptance-criteria assessment (forced call)
→ Deterministic per-criterion table render
→ Final response
```

## Fast Path and Concurrency (Major 1)

The intent phase must not make every request slower, especially trivial Chat
questions. Two mechanisms bound its cost.

### Pre-call fast-path gating

Before any extraction call, a cheap local heuristic decides whether a full
contract is worth it. Because `taskType` is only known *after* extraction, this
decision is heuristic and pre-model:

- **Skip to raw-prompt fallback** when the prompt is short and clearly read-only
  (for example under a small token threshold, no imperative change verbs, no
  attachments, no named write targets). These become a single `AC1` fallback
  contract with `source: "fast-path"` and no extra provider call. Chat is the
  primary beneficiary.
- **Always extract** for Agent write-capable requests, for prompts containing
  change verbs or named targets, and for any request with attachments that may
  define the task.
- The threshold and verb list are configurable (`intentFastPathEnabled`,
  `intentFastPathMaxPromptTokens`) and default to conservative values so the fast
  path only catches obviously-trivial cases.

A fast-path fallback contract is a first-class contract: it is persisted, injected,
and (for Agent) satisfies the mutation-presence guard. It simply skips extraction.

### Concurrent extraction and discovery

When extraction *does* run, it no longer blocks time-to-first-action:

- The read-only discovery seed (the existing forced `list_files` /
  `read_open_tabs`) is side-effect-free, so it is launched **in parallel** with the
  extraction call rather than after it.
- The workspace loop's first *reasoning* round waits on both, but discovery
  results and the extraction call overlap, hiding most of the added latency.
- Extraction and discovery share no state; discovery results are not fed into
  extraction (extraction must stay repository-blind, see Input Envelope).
- If extraction fails or is slow past a bounded deadline, discovery results are
  already in hand and the loop proceeds under the fallback contract.

Net effect: trivial prompts pay nothing (fast path); non-trivial prompts pay the
overlap of one extra call, not a serial addition.

## Intent Contract

A versioned contract with stable IDs:

```json
{
  "schemaVersion": 2,
  "source": "extracted",
  "taskType": "implementation",
  "goal": "Concise statement of the user's goal.",
  "expectedOutcome": "Observable state expected when the task is complete.",
  "requestedActions": ["Actions explicitly requested or necessarily implied."],
  "prohibitedActions": ["Actions explicitly prohibited by the user."],
  "acceptanceCriteria": [
    {
      "id": "AC1",
      "description": "Observable outcome that must be satisfied.",
      "verification": "Evidence needed to mark this criterion met."
    }
  ],
  "outOfScope": ["Related work that must not be performed."],
  "namedTargets": {
    "files": [{ "value": "src/example.js", "source": "prompt", "status": "unverified" }],
    "symbols": [],
    "errors": [],
    "uiAreas": []
  },
  "assumptions": [
    { "id": "A1", "statement": "Assumption required to interpret the request.", "risk": "low" }
  ],
  "unresolvedDecisions": [
    { "id": "D1", "description": "Decision not settled by the request.", "blocking": false }
  ],
  "ambiguities": [
    {
      "id": "AMB1",
      "question": "Decision-shaping question for the user.",
      "reason": "Why the answer changes the work.",
      "impact": "high",
      "blocking": true,
      "suggestedAnswers": []
    }
  ],
  "clarifications": [
    { "ambiguityId": "AMB1", "question": "Question that was presented.", "answer": "User response." }
  ],
  "revisions": [
    {
      "id": "R1",
      "trigger": "discovery-conflict",
      "summary": "What evidence changed and which fields were updated.",
      "changedFields": ["namedTargets.files", "assumptions"]
    }
  ]
}
```

Contract rules:

- `schemaVersion` is `2` (adds `namedTargets[*].status` and the `revisions` log).
- `taskType` is one of `answer`, `diagnostic`, `planning`, or `implementation`.
- `goal`, `expectedOutcome`, and at least one acceptance criterion are required.
- Criteria describe observable outcomes, not implementation steps, and receive
  deterministic `AC1`, `AC2`, … identifiers that are preserved across revisions
  whenever meaning is unchanged.
- Assumptions are separated from user statements; prohibited actions are never
  invented merely because they would be prudent.
- Named targets are unverified search leads carrying an explicit
  `status` of `unverified`, `confirmed`, or `absent`, plus a `source` of `prompt`,
  `active-editor`, `attachment`, or `history`.
- Ambiguities carry impact and blocking classification.
- Clarification answers and revisions remain in the contract for audit.
- Strings and collection sizes are bounded before persistence and injection.
- Harness-owned metadata additionally records mode, workspace, prompt fingerprint,
  conversation anchor (see Multi-turn), timestamps, revision, validation state, and
  fallback reason.

Raw-prompt / fast-path fallback contract:

- `source` is `raw-prompt-fallback` or `fast-path`.
- Normalized prompt as `goal` and `expectedOutcome`.
- One criterion, `AC1`, requiring the response to satisfy that request.
- Empty requested/prohibited/out-of-scope unless directly recoverable without model
  inference.
- Fallback (not fast-path) additionally carries a prominent warning that structured
  extraction was unavailable. Fast-path carries an informational note only.

## Restricted Phase Tools

### `capture_intent_contract`

Internal function used only for extraction, refresh, and revision:

- Argument schema is the contract schema.
- `toolChoice` forces this function.
- The harness consumes and validates arguments; it executes no workspace action.
- Never added to the normal Agent tool list.

Forced function calling is preferred over free-form JSON because both provider
implementations already support forced tools, while neither currently exposes
JSON-schema response formatting.

### `ask_clarification`

A real blocking function used only during the intent phase:

```json
{
  "ambiguityId": "AMB1",
  "question": "The focused question to show.",
  "reason": "Why this answer changes the result.",
  "answerType": "free_text",
  "choices": []
}
```

Behavior:

- Available only before the workspace loop, and only when the
  `intentClarificationMode` preference allows it (see Preferences).
- Cannot be invoked from the normal loop or the final-answer phase.
- Each call emits a clarification bridge event and waits for the answer.
- The answer returns to the model as the tool result.
- No approval, permission, grant, or mutation semantics.
- At most the three highest-impact **blocking** ambiguities are asked.
- Questions display sequentially in separate cards; the run stays active.
- After all answers, the whole contract is refreshed once.
- No clarification tool is exposed after discovery begins.

### `assess_acceptance_criteria`

Internal function used only after a draft final response exists:

```json
{
  "overallStatus": "complete",
  "criteria": [
    { "id": "AC1", "status": "met", "evidence": "Specific response or tool evidence.", "explanation": "Short justification." }
  ],
  "unmetSummary": ""
}
```

Only `met` and `unmet` are allowed per criterion. Missing evidence produces
`unmet`, never an optimistic inference. The harness — not the model — renders the
final table from this validated object (see Completion).

### Phase isolation

Available functions are **replaced**, not appended, per phase:

| Phase | Available functions |
|---|---|
| Intent extraction | `capture_intent_contract` only |
| Clarification | `ask_clarification` only |
| Contract refresh/repair | `capture_intent_contract` only |
| Workspace loop | Existing mode-specific tools only |
| Contract revision on conflict | `capture_intent_contract` only |
| Completion assessment | `assess_acceptance_criteria` only |
| Final response | No tools |

`executeAgentTool` additionally rejects every mutating or externally effectful
action unless a validated *or* explicitly marked fallback contract exists. Note
this is a **wiring safeguard**, not a security boundary: any extraction failure
produces a fallback contract that permits mutations, so its value is catching an
accidental future code path that exposes tools before a contract exists, not
gating on user intent. It covers file/editor writes, Git mutations, settings
mutations, graph actions, conversion/export, API Client mutations and sends,
plan-repository mutations, commands/compilation/tests/dependency/package
management, and resumed replayed actions.

Read-only discovery may begin as soon as it is launched (concurrently with
extraction); mutations wait for a usable contract.

## Contract Revision on Discovery Conflict (Major 2)

A contract validated for *shape* can still misread *intent*, and once injected as
authoritative it will steer every round. To prevent a confident misread from being
amplified, the workspace loop may revise the contract **once**, under bounded
conditions, when discovery evidence contradicts it.

### Trigger conditions

A revision is considered at most once per request when any of the following is
observed from tool results during the loop:

- A `namedTargets.files` or `symbols` entry resolves to `absent` (the referenced
  file/symbol does not exist and no close match is confirmed).
- An assumption marked `risk: "medium"` or `"high"` is directly contradicted by
  inspected state.
- Discovery confirms the true locus of work is a file/area not present in
  `namedTargets`, materially changing where acceptance criteria apply.

Low-risk drift, ordinary detail-filling, and anything touching `goal` or
`prohibitedActions` do **not** trigger revision.

### Revision behavior

1. The loop pauses tool planning and issues one forced `capture_intent_contract`
   call in an isolated phase, given: the current contract, the specific
   conflicting evidence, and an instruction to update only `namedTargets`,
   `assumptions`, `unresolvedDecisions`, and `verification` fields.
2. Guardrails: `goal` and `expectedOutcome` are immutable; `prohibitedActions` and
   `outOfScope` may only be *added* to, never relaxed; acceptance-criterion IDs and
   descriptions are preserved unless a criterion's `verification` must point at the
   corrected target.
3. The revision is appended to `revisions[]` with its trigger and changed fields,
   validated, persisted, and the injected contract message is replaced.
4. A `intent-contract` event (revision variant) is emitted so the panel shows the
   contract changed and why.
5. The budget is one revision per request. Further conflicts are recorded as
   `unresolvedDecisions` and surfaced in the completion assessment rather than
   triggering more calls.

This gives evidence a bounded path to correct the contract without opening the door
to silent goal drift or an unbounded revision loop.

## Model Conversations

### Input envelope

The extraction request contains only intent-relevant context:

- Current mode and prompt.
- Prior user/assistant turns needed to resolve follow-up language (see Multi-turn).
- Active file path, tab type, and compact selection context.
- Attachment names, types, and bounded excerpts when contents may define the request.
- No directory listing, workspace search results, Git state, or inferred repo facts.

The active file's full 20,000-character buffer is **not** sent to the intent call;
only enough context to interpret references like "this function" or "the selected
text." The normal tool loop keeps its richer editor context.

### Initial extraction

System instruction:

```text
You are the intent-analysis stage of AI Companion.

Do not answer the request, inspect the repository, propose implementation
details, or claim facts about files that have not been inspected.

Extract only what the user is asking for and what can be supported by the
provided request context. Separate explicit requirements from assumptions.
Treat named files, symbols, errors, and UI areas as unverified references.

Write acceptance criteria as observable outcomes. Identify requested and
prohibited actions, out-of-scope work, assumptions, unresolved decisions,
and ambiguities. Mark an ambiguity blocking only when choosing incorrectly
would materially change the result, scope, safety, or public behavior.

Classify the task as answer, diagnostic, planning, or implementation.
Call capture_intent_contract exactly once.
```

Request instruction:

```text
Analyze the current request envelope and capture its intent contract.
Do not use repository knowledge or solve the task.
```

Call settings: same model/provider, temperature `0`, small bounded output, no
streaming, only `capture_intent_contract`, forced function choice, usage/debug
events still emitted.

### Valid contract without blocking ambiguity

1. Normalize and validate arguments.
2. Emit and persist the contract.
3. Insert the authoritative contract system message.
4. Proceed into the workspace loop (discovery already launched concurrently).

### Valid contract with blocking ambiguities in Chat or Agent

Only when `intentClarificationMode` allows pre-work questions:

1. Sort blocking ambiguities by impact, then original order; select at most three.
2. Enter the clarification stage with only `ask_clarification`.
3. Present each returned call as its own sequential card.
4. Return each answer as the corresponding tool result.
5. After all answers, make one contract-refresh call (original envelope, initial
   contract, questions and answers, instruction to preserve unaffected requirements).
6. Validate, persist, and inject the refreshed contract.
7. If ambiguities remain, preserve them visibly and proceed on explicitly recorded
   conservative assumptions. The tool cannot be reused later to stall execution.

When the preference disables pre-work questions, blocking ambiguities are recorded
as conservative assumptions and surfaced in the contract card and the final
assessment instead of being asked.

Clarification prompt:

```text
Ask only the supplied blocking ambiguity. Preserve its meaning, make the
question concise, and include meaningful choices only when the choices are
already supported by the request. Do not ask for repository facts and do
not combine unrelated decisions. Call ask_clarification exactly once.
```

Refresh prompt:

```text
Refresh the intent contract using the user's clarification answers.
Preserve unaffected requirements and acceptance-criterion IDs where their
meaning is unchanged. Resolve answered ambiguities, record each answer,
and expose any genuinely unresolved decisions. Do not solve the task.
Call capture_intent_contract exactly once.
```

### Plan mode: single questioning path (moderate fix)

Plan receives the same extraction but, to avoid asking the user overlapping
questions from two systems, questioning is unified:

- Plan does **not** use the pre-discovery `ask_clarification` flow for ordinary
  blocking ambiguities; those stay in the injected contract.
- Plan researches first, then uses its existing decision-shaping question behavior
  to resolve any *still-blocking* contract ambiguity that repository evidence could
  not settle — reading the contract's `ambiguities[]` as its question backlog so it
  neither repeats a question nor invents a new one.
- Plan must not silently convert a blocking ambiguity into a product decision; an
  unresolved blocking ambiguity is recorded in the proposed plan.
- `ask_clarification` is available to Plan only to recover from invalid extraction.

### Invalid extraction

Validation failures: missing/unparseable function call, empty goal or expected
outcome, missing acceptance criteria, unsupported task type, invalid shapes,
duplicate/unusable criterion IDs, or over-limit contract.

Mode behavior:

- Chat immediately creates a raw-prompt fallback and continues.
- Agent and Plan perform one repair attempt.
- If the first response is too malformed to yield meaningful ambiguities, show one
  generic clarification card asking the user to restate the expected outcome and
  key restrictions.
- Retry extraction with the original request, the validation errors, and the answer.
- If that still fails, create a raw-prompt fallback and continue.

Every fallback emits an `intent-contract` event marked fallback with a visible
timeline warning. Agent may mutate only after this fallback contract is persisted.

### Reinjecting the contract

Insert a dedicated system message immediately after prior conversation history and
before the current user message:

```text
Authoritative task contract for the current request:

<compact normalized contract JSON>

Use this contract as the target for this request. The raw user prompt remains
context, but do not broaden the goal, violate prohibited actions, or treat
named targets as verified until tools confirm them. Keep every acceptance
criterion in view. If tool evidence conflicts with a named target or a
medium/high-risk assumption, surface it so the contract can be revised; do
not silently change the user's goal.
```

Implementation requirements:

- Keep exactly one contract message in the array; replace it on refresh or revision.
- Include it in every planning round, continuation, resumed task, revision call,
  draft-answer request, completion assessment, and final-answer request.
- Never append duplicates; exempt it from tool-result compaction.
- Persist the normalized contract separately from conversational messages.
- Validate prompt fingerprint, workspace, mode, conversation anchor, and schema
  version before reusing a saved contract.
- Edited/rerun prompts receive a new contract.
- Resumed tasks reuse a matching valid contract; otherwise extraction runs before
  replaying any pending action.

### Multi-turn intent (moderate fix)

Contracts are per-request but conversation-aware:

- Each contract records a **conversation anchor** (the chat ID plus the index of the
  turn it was built for) alongside its prompt fingerprint.
- A follow-up turn in the same chat starts from the previous turn's contract as
  *prior context* passed into extraction, so accumulated goals ("now also do X") are
  carried forward rather than lost, but a fresh contract is still produced and
  validated for the new turn.
- The extraction envelope includes the minimal prior turns needed to resolve
  references; the prior contract's `goal`/`outOfScope` are provided as context the
  model may extend but should not silently drop.
- A turn that clearly restarts the task (topic change, new named targets, no
  referential language) produces an independent contract with no carry.

### Token-budget accounting (moderate note)

The injected contract adds fixed per-round tokens that compete with tool results
under `reserveTokenMinuteBudget` and the continuation logic:

- The normalized *injected* contract is a compacted projection (goal, expected
  outcome, criteria, prohibited actions, unverified named targets, open decisions) —
  not the full persisted record — and is size-bounded.
- Extraction/assessment calls use temperature 0 and small output allowances.
- The plan should record measured per-round token overhead in the test pass and set
  the compacted-contract bound so overhead stays within a small single-digit
  percentage of a typical round's budget.

## Persistence, Events, and UI

### Task records

Bump task records to version 3 and add:

```json
{
  "intentContract": {},
  "intentStatus": "ready",
  "intentRevision": 2,
  "clarifications": [],
  "completionAssessment": {}
}
```

Older records remain readable; missing intent fields mean a new run or resumed
action must extract a contract. Persist immediately when: extraction succeeds, a
clarification is emitted, a clarification answer is received, a refreshed/revised/
fallback contract is created, or completion assessment finishes.

### Bridge protocol

Add a clarification channel parallel to but separate from approvals:

- `pendingClarifications` map in the Node bridge; unique clarification ID scoped to
  the request.
- `requestClarification()` emits the question and waits; `clarification` response
  action resolves it.
- Cancellation and bridge shutdown reject pending clarification promises.
- Browser bridge exposes `respondClarification(id, answer)`.
- Mode requests receive `requestClarification` in runtime options.

Events:

- `intent-contract`: normalized contract, revision, source, validation state,
  optional warning, and a `variant` of `initial`, `refreshed`, `revised`, or
  `fallback`.
- `clarification`: pending question metadata.
- `clarification-resolved`: persisted question and answer.
- `completion-assessment`: overall and per-criterion statuses.

### Panel behavior

A dedicated renderer, not an expansion of the already-large panel:

- Collapsible "Intent and acceptance criteria" card; summary shows task type, goal,
  and criterion count.
- Expanded view shows expected outcome, requested/prohibited actions, criteria,
  scope, named targets (with verified/absent state), assumptions, unresolved
  decisions, and a revision indicator when the contract changed mid-run.
- Fallback contracts show a prominent warning banner; fast-path contracts show a
  quiet informational note.
- Pending clarifications show one focused card (free-text or single-choice),
  displayed sequentially, run stays active, visually distinct from approvals.
- Saved tasks replay contract, revision, and clarification events.
- An unanswered clarification after restart shows as interrupted with a "Resume
  intent analysis" action; resumption reuses saved answers and reissues only the
  pending question.
- Direct contract editing is intentionally excluded; users correct it by editing the
  prompt and rerunning.

### Resume edge matrix (moderate fix)

The new pending-clarification interrupted state is distinct from pending-approval
and must be tested against: prompt edited while a clarification is pending (discard
pending, re-extract), workspace changed between emit and resume (re-extract),
app restart with a partially-answered clarification set (reuse recorded answers,
reissue only the unanswered), cancellation during clarification (reject promises,
mark task cancelled), and a resumed *action* whose saved contract no longer matches
(extract before replaying the action).

## Completion Assessment and Final Response (Major 3)

Replace memory-based completion with contract-based verification whose verdicts are
rendered deterministically.

Assessment system prompt:

```text
Verify each stored acceptance criterion by its stable ID using inspected state,
tool results, validation output, and the draft response. Do not mark a criterion
met merely because an action was attempted or claimed. Denied, failed,
unexecuted, or unverified actions do not satisfy a criterion. Return one entry
per criterion with status met or unmet and concrete evidence.
```

Final flow:

1. Generate a non-streamed draft answer from the workspace conversation and contract.
2. Run one forced `assess_acceptance_criteria` call using: the contract, the draft,
   successful and failed tool evidence, changed/attempted file summary, validation
   and command results, and approval denials/user instructions.
3. Validate the assessment; ensure every contract criterion appears exactly once.
4. If parsing fails, retry once; if still invalid, conservatively mark all criteria
   unmet and show an assessment warning.
5. **Render the per-criterion table deterministically from the validated assessment
   object** (`Criterion | Status | Evidence`), in harness code — not by asking the
   final generation to reproduce verdicts. The streamed final response is the draft
   prose; the table is appended by the harness so a criterion marked `unmet` can
   never be softened into `met` by transcription.
6. **Scope the table by `taskType`:**
   - `implementation` and `diagnostic`: full table appended, plus an explicit
     incomplete-task statement when any criterion is unmet.
   - `planning`: the table is placed inside Plan's single required `<proposed_plan>`
     block so the plan output contract stays valid.
   - `answer`: no table by default; if the single `AC1` is unmet the response
     carries a one-line "this did not fully answer the request" note instead of a
     table, keeping quick answers clean.
7. Persist and emit the assessment for audit and restored-task rendering.

This phase does not auto-reopen implementation when criteria are unmet; it reports
incompleteness accurately. Automatic remediation is a separate future task-loop
enhancement.

## Evaluation and Rollout (Major 4)

Because the motivation is response quality, the change ships behind measurement.

### Capability flag / A-B

- A single `intentContractsEnabled` capability flag gates the entire phase. Off = the
  current behavior exactly (no extraction, no assessment table).
- The flag supports an A/B assignment so runs can be compared with contracts on vs
  off on the same prompts.
- Every run records which arm it was in, the contract source (`extracted`,
  `refreshed`, `revised`, `fallback`, `fast-path`), whether clarification fired, and
  whether a revision fired.

### Offline eval set

- A curated set of representative prompts per mode (answer, diagnostic, planning,
  implementation), each with a rubric of expected acceptance criteria and the
  correct target files/symbols.
- A harness runs each prompt through both arms and records outcomes.

### Metrics

- **Task success rate** (rubric-scored) contracts-on vs off.
- **Localization precision/recall** of `namedTargets` after any revision vs the
  rubric's true targets — measures whether the contract actually helps zero in.
- **Assessment accuracy:** agreement of `met`/`unmet` verdicts with human judgment;
  specifically the false-`met` rate, the exact error class this feature targets.
- **Clarification quality:** fraction of asked questions users found decision-shaping
  (thumbs signal) and the over-ask rate.
- **Revision usefulness:** fraction of revisions that moved `namedTargets` closer to
  truth.
- **Cost:** added provider calls, added tokens, and added wall-clock latency per
  task, broken out by fast-path vs full extraction.

Rollout is staged: internal flag on → measure on the eval set → limited default-on
for Agent implementation tasks → broaden once the false-`met` rate and latency
budget targets are met.

## Prompt Profile Changes

Add configurable prompt entries:

- `intentExtractionSystem`
- `intentClarificationSystem`
- `intentContractRefreshSystem`
- `intentContractRevisionSystem` (new: discovery-conflict revision)
- `completionAssessmentSystem`
- `completionFinalAnswer`

Update:

- `chatSystem`, `agentSystem`, `planSystem` to recognize the injected contract as
  authoritative and to surface (not silently absorb) conflicts with named targets or
  risky assumptions.
- `AGENT_COMPLETION_REPORTING_INSTRUCTION` to reference stored acceptance-criterion
  IDs.
- `toolLoopFinalAnswer` so ordinary final responses leave room for the
  harness-rendered assessment table (implementation/diagnostic) and stay clean for
  `answer` tasks.
- `planFinalAnswer` so the table remains inside the proposed-plan block.

Bump the prompt profile schema to version 2; existing profiles get defaults for new
entries and remain valid; no user-authored strings are overwritten.

## Preferences (moderate fix)

Add user-visible settings:

- `intentContractsEnabled` — master flag (also the A/B gate).
- `intentFastPathEnabled` / `intentFastPathMaxPromptTokens` — trivial-prompt bypass.
- `intentClarificationMode` — `ask` (pre-work questions for Chat/Agent),
  `assume` (record conservative assumptions instead of asking), or `off`. Defaults
  bias toward proceeding with recorded assumptions over interrogating the user.
- `intentAssessmentTable` — whether the per-criterion table is shown for
  implementation/diagnostic tasks (default on).

## Implementation Structure

Keep the existing tool-loop entrypoint as orchestrator; move new responsibilities
into focused modules:

- `intent-contract.js`: schemas, normalization, validation, fallback/fast-path
  creation, prompt fingerprinting, conversation anchoring, compacted-injection
  formatting.
- `intent-analysis.js`: extraction, repair, refresh, discovery-conflict revision,
  mode policy, and phase-only provider calls.
- `intent-clarification.js`: ambiguity ranking, bounded sequential clarification,
  clarification tool results.
- `completion-assessment.js`: assessment prompt, forced assessment call, validation,
  conservative fallback, and **deterministic table rendering**.
- A browser-side intent renderer: contract cards, revision/fallback indicators,
  clarification inputs, restored-state rendering.

The main tool loop should only:

1. Run the fast-path check.
2. Launch discovery and (when needed) extraction concurrently.
3. Receive a ready contract and add the contract message.
4. Run the existing discovery/tool loop, invoking the bounded revision check when a
   conflict trigger fires.
5. Invoke draft/assessment/deterministic-render/final orchestration.

Existing workspace tools, approval policy, editor actions, and security policy stay
unchanged except for the contract-presence mutation safeguard.

## Expected Files to Change

Core runtime and prompts:

- `core/intent-contract.js`
- `core/intent-analysis.js`
- `core/intent-clarification.js`
- `core/completion-assessment.js`
- `core/agent-tool-loop.js`
- `config/prompts.js`
- `config/defaults.js` (new preferences)

Mode and bridge wiring:

- `modes/chat/index.js`
- `modes/agent/index.js`
- `modes/plan/index.js`
- `resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs`
- `resources/js/ai-companion/neutralino-ai-bridge.js`

Panel and persistence:

- `resources/js/ai-companion/intent-contract-renderer.js`
- `resources/js/ai-companion/panel.js`
- `resources/js/ai-companion/interrupted-task-resume.js`
- `resources/index.html`
- `resources/styles.css`

Evaluation:

- `desktop-app/tests/eval/intent-contracts-eval.js` (offline A/B eval harness)
- `desktop-app/tests/eval/intent-eval-prompts.json` (rubric prompt set)

Tests:

- `ai-companion-intent-contract.test.js`
- `ai-companion-intent-revision.test.js` (new)
- `ai-companion-intent-ui.test.js`
- `ai-companion-completion-assessment.test.js`
- `ai-companion-prompts.test.js`
- `ai-agent-approval-policy.test.js`

## Test Plan

### Fast path and concurrency

- Trivial read-only Chat prompts take the fast path and make no extraction call.
- Fast-path contracts are persisted, injected, and satisfy the mutation guard.
- Write-capable / change-verb / attachment-bearing prompts always extract.
- Extraction and the read-only discovery seed run concurrently; a slow/failed
  extraction does not block discovery, and the loop proceeds under fallback.

### Extraction and isolation

- Extraction occurs before the workspace *reasoning* round (discovery may overlap).
- Extraction receives only the request envelope and `capture_intent_contract`.
- No mode-specific workspace or mutation tools leak into intent calls.
- OpenAI-compatible and Gemini connector providers receive valid forced-tool requests.
- Named files/symbols remain marked unverified until confirmed.

### Contract validation and fallback

- Valid contracts preserve goal, requested/prohibited actions, criteria, scope,
  targets, assumptions, ambiguities.
- Missing required fields trigger repair/fallback policy; Chat falls back
  immediately, Agent/Plan repair once first.
- Fallback contracts are persisted, injected, and visibly warned.
- Mutating tools reject calls made with no usable contract; a fallback permits the
  normal loop to continue.

### Contract revision on conflict

- An absent named target triggers exactly one bounded revision.
- Revision may update named targets/assumptions/decisions/verification but never
  `goal`/`expectedOutcome`, and may only tighten `prohibitedActions`/`outOfScope`.
- A second conflict does not trigger a second call; it is recorded as an unresolved
  decision.
- The revision is logged, persisted, and surfaced as an `intent-contract` revised event.

### Clarification and preferences

- With `intentClarificationMode: ask`, Chat/Agent ask only blocking ambiguities, at
  most three, sequentially, with only `ask_clarification` available.
- With `assume`/`off`, no pre-work questions are asked; ambiguities become recorded
  assumptions surfaced in the card and assessment.
- Refreshed contracts preserve unaffected criterion IDs; no clarification tool
  remains after discovery.
- Plan uses only its existing decision-shaping path (plus extraction-recovery
  clarification) and never double-asks a contract ambiguity.

### Reinjection, multi-turn, persistence

- Every provider round contains exactly one current contract message; continuations,
  compaction, and revision preserve/replace it correctly.
- Follow-up turns carry prior-contract context; a clear task restart produces an
  independent contract.
- Edited prompts invalidate the prior contract; matching resumed tasks reuse theirs
  before pending actions replay.
- Old task records load without migration failures; the resume edge matrix cases all
  behave as specified.

### Completion and deterministic rendering

- The draft is assessed against every `AC` ID; attempts without verified success and
  denied/failed actions remain unmet.
- The rendered table comes from the validated assessment object; a mismatch between
  a criterion's rendered status and the assessment object is a test failure.
- Missing criterion results invalidate the assessment; invalid assessments retry once
  then fail conservatively (all unmet).
- Implementation/diagnostic responses carry the full table; `answer` responses carry
  no table (one-line note if unmet); Plan places the table inside its proposed-plan
  block.
- Any unmet criterion yields an explicit incomplete-task statement.

### Evaluation

- The A/B flag fully disables the phase (byte-for-byte prior behavior when off).
- The eval harness runs the rubric prompt set through both arms and reports task
  success, localization precision/recall, false-`met` rate, clarification over-ask
  rate, revision usefulness, and added cost/latency.

### Regression

- Existing Chat, Agent, Plan, approval, narration, title, continuation, and resume
  behavior remain intact after accounting for the (now often-concurrent) intent call.
- Provider-mocking tests gain a shared intent-response helper.
- Autocomplete and Git Summary remain outside this change.

## Assumptions and Deliberate Boundaries

- Intent extraction uses the currently selected model; no separate intent-model
  setting. "Cheap" = small envelope, temperature 0, bounded output, no streaming, one
  forced internal function — and, when possible, overlapped with discovery.
- Chat, Agent, and Plan extract contracts (subject to the fast path); Git Summary and
  Autocomplete do not.
- Pre-work clarification is opt-tunable and biased toward proceeding with recorded
  assumptions; Plan uses a single questioning path.
- The contract may be revised once by discovery evidence but its goal is immutable;
  remaining ambiguities are preserved and made visible rather than looped on.
- The per-criterion table is rendered deterministically by the harness, scoped by
  task type; quick answers stay clean.
- Raw-prompt / fast-path fallback is allowed in every mode under the mode-specific
  retry policy.
- The contract is read-only in the UI; users correct it by editing and rerunning.
- No repository files change during the intent phase; no automatic remediation loop
  after assessment.
- The change ships behind a capability/A-B flag with an eval harness; unrelated
  provider, security, tool, and editor behavior is not refactored.
```