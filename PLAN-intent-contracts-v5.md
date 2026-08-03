# Plan: Explicit Intent Contracts for AI Companion (v5)

ASCII-only. Arrows are "->", dashes "--", ellipses "...". No Unicode punctuation or
box-drawing. Safe to paste into implementation prompts.

Document revision v5. Supersedes PLAN-intent-contracts-v4.md (kept as review history).
This is the authoritative, decision-complete implementation plan.

Schema versions are distinct from the document revision and are unchanged by v5:
- intent-contract schema: v4  (constant INTENT_CONTRACT_SCHEMA_VERSION = 4)
- task-record schema:     v3  (constant TASK_RECORD_SCHEMA_VERSION = 3)
- prompt-profile schema:  v2  (constant PROMPT_PROFILE_SCHEMA_VERSION = 2)
The v5 additions are backward-compatible optional fields within intent-contract v4;
no version bump is required.

## What changed from v4

Blockers resolved:
1. Candidate-response evidence -- a reserved EV-CANDIDATE ledger entry so
   response-content criteria (explain root cause, produce a plan, answer the question)
   can be cited without inventing tool evidence.
2. Canonical tool-effect registry -- a single source of truth mapping every exposed
   tool to an effect category, canonical capability, and resource resolver, so
   control-scoped mutation blocking is deterministic and capability vocabulary cannot
   drift. Fixes the git.commit vs git.commit.create mismatch and covers the effectful
   tools the approval registry does not.
3. Functional milestone ownership -- minimal persistence and clarification UI move into
   M1/M2 so each milestone is runnable end-to-end, not just unit-testable.
4. Deterministic Plan finalization gate -- an explicit harness trigger that switches
   Plan from discovery into one isolated clarification batch, instead of relying on the
   model to volunteer that discovery failed.

Supporting corrections: target-type-specific absence rules; tool-specific evidence
truncation via successConfirmedIndependently; relationshipToPrior "uncertain"; scoped
approval-amendment failure; one identical normalized plan value across the completion
pipeline; both settings surfaces; experiment precedence and by-task-type metrics; and a
defined thumbs record shape.

## Delivery Milestones (functional ownership)

Each milestone is runnable end-to-end in developer tests and stays default-off until
M3 (the evidence-backed completion path) lands. No milestone is described as
independently functional while deferring a required browser-owned interaction.

- M1 Foundation: contract schema + validation, Chat-only fast path, harness-owned
  concurrent discovery seed, headless persistence of the contract, minimal panel
  handling and persistence of intent-contract events, and a basic read-only intent
  card. End-to-end result: a request produces, persists, and displays a contract.
- M2 Intent control: field provenance + authority, the clarification bridge plus
  minimal sequential clarification cards and respondClarification, approval amendments
  with persistence, hybrid conflict reporting + bounded revision, and control-scoped
  mutation-block errors. End-to-end: a blocking ambiguity can be asked and answered; a
  contradicted target is revised; a scoped mutation is blocked.
- M3 Evidence + completion: the evidence ledger with task persistence, candidate
  evidence, forced assessment, deterministic table + incomplete-statement rendering,
  and Plan block insertion + finalization gate. End-to-end: a diagnostic/implementation/
  planning task produces an evidence-cited verdict table.
- M4 Product surface: panel restoration/styling, thumbs feedback, resume, the
  evaluation harness, per-chat experiment assignment, and rollout reporting.

## Intent Contract (schema v4, v5 optional fields)

```json
{
  "schemaVersion": 4,
  "source": "extracted",
  "relationshipToPrior": "independent",
  "taskType": "implementation",

  "goal":            { "value": "...", "provenance": "explicit" },
  "expectedOutcome": { "value": "...", "provenance": "inferred" },

  "requestedActions":  [{ "id": "RA1", "value": "...", "provenance": "explicit" }],
  "prohibitedActions": [{ "id": "P1", "value": "...", "provenance": "explicit" }],
  "outOfScope":        [{ "id": "S1", "value": "...", "provenance": "explicit" }],

  "acceptanceCriteria": [
    { "id": "AC1", "description": "...", "verification": "...", "provenance": "explicit" }
  ],
  "supersededCriteria": [
    { "id": "AC0", "description": "...", "supersededBy": "AC1", "turn": 2 }
  ],

  "namedTargets": {
    "files":   [{ "id": "T1", "value": "src/example.js", "kind": "file-path", "source": "prompt", "status": "unverified" }],
    "symbols": [{ "id": "T2", "value": "parseToken", "kind": "symbol", "source": "prompt", "status": "unverified" }],
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
      "blocking": true, "safetyOrScopeCritical": false, "suggestedAnswers": [],
      "status": "open",
      "resolution": { "source": "user | evidence", "answer": "", "evidenceIds": [] } }
  ],

  "clarifications": [ { "ambiguityId": "AMB1", "question": "...", "answer": "..." } ],

  "amendments": [
    { "id": "AM1", "source": "approval-instruction", "provenance": "clarified",
      "summary": "...", "changedFields": ["criterion:AC2"], "toolCallId": "call_...",
      "applied": true } ],

  "revisions": [
    { "id": "R1", "trigger": "harness-auto | model-reported", "conflictId": "C1",
      "fieldRef": "target:T1", "summary": "...", "changedFields": ["target:T1"] } ]
}
```

Notes: goal and expectedOutcome are singletons addressed by canonical field reference;
all other collections carry stable IDs. namedTargets entries carry an explicit kind
(file-path | filename | symbol | ui-area | error-text) that selects the absence rule.
ambiguities now carry status/resolution used by the Plan finalization gate.
relationshipToPrior may be independent | continues | extends | corrects | uncertain.

Fallback/fast-path: raw fallback copies user text verbatim with provenance
"uninterpreted"; fast-path (Chat only) carries an informational note and, for
active-editor questions, the active path as an unverified target.

## Canonical Field References

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

The harness resolves a fieldRef to its node, provenance, and discovery-revisability.
Unresolvable fieldRefs are rejected.

## Provenance and Authority Model

Provenance: explicit (user stated), clarified (from a clarification answer), inferred
(extractor), carried (prior turn), uninterpreted (verbatim user text in a fallback).

- Discovery may DIRECTLY revise only inferred/carried targets, assumptions, decisions,
  or a criterion verification field.
- Contradiction of an inferred/carried goal, expectedOutcome, requestedAction, or
  criterion description -> ask the user (clarification enabled) or record a controlling
  unresolvedDecision and block dependent mutations (clarification off). Never silent.
- Discovery may never create or strengthen prohibitedActions/outOfScope; only the user
  can, via clarification or an approval amendment.
- explicit, clarified, and uninterpreted content are immutable to discovery.

## Restricted Phase Tools

Phase isolation replaces (does not append) the tool inventory per phase:
extraction/refresh/revision expose only capture_intent_contract; clarification exposes
only ask_clarification; the workspace loop exposes mode tools plus the read-only
report_intent_conflict; assessment exposes only assess_acceptance_criteria; the final
phase exposes no tools.

report_intent_conflict (model-reported semantic conflicts; harness validates):

```json
{ "fieldRef": "criterion:AC2",
  "conflictType": "assumption-contradicted | target-relocated | goal-misread | criterion-unreachable | outcome-misread",
  "evidenceToolCallIds": ["call_ab12"],
  "explanation": "...", "userClarificationRequired": false }
```

assess_acceptance_criteria (assessor maps evidence to criteria):

```json
{ "overallStatus": "complete | incomplete",
  "criteria": [ { "id": "AC1", "status": "met | unmet", "evidenceIds": ["EV12"], "explanation": "..." } ],
  "unmetSummary": "" }
```

## Canonical Tool-Effect Registry (blocker 2)

Add core/agent-tool-effect-registry.js as the single source of truth for every exposed
tool. It is SEPARATE from approval policy: "effectful" and "requires approval" are
different concepts, though they share one capability vocabulary.

```text
tool name
  -> effect: read | ui-state | workspace-write | external-write | execution
  -> capability (canonical ID)
  -> resource resolver (args -> normalized path or stable resource identity)
  -> effectful predicate (is this call mutating/effectful)
```

Requirements:
- Reuse the exact existing approval capability IDs where present, including
  git.commit.create, workspace.file.write, workspace.file.delete, workspace.path.move,
  git.index.change, git.branch.local, git.remote.change, settings.change,
  settings.security.change, export.document, export.graph, conversion.start,
  shell.freeform.
- Define new canonical capabilities for the currently-uncovered effectful tools:
  execution.compile, execution.test, deps.restore, package.manage, apiclient.mutate,
  apiclient.send, plan.write, graph.state, editor.write (grouping the editor-action
  write tools). Read tools map to effect read with capability read.* and no resource
  mutation.
- Every tool returned by getAgentToolDefinitions() MUST have a registry entry; a test
  enumerates the definitions and fails on any omission (prevents vocabulary drift).
- Approval policy consumes the same capability IDs but keeps its own approval-required
  logic.
- Resource resolvers return normalized paths (workspace-relative, separator- and
  case-normalized per platform) or a stable non-path resource identity (e.g. a plan ID,
  an API request ID).

Target matching for control scope:
- Capability match takes precedence: a mutation whose capability is in a decision's
  controlledCapabilities is blocked regardless of target.
- Target match: resolve the mutation's resource, resolve each controlledTarget contract
  ID to its confirmed path, and compare by normalized equality or glob.
- If the mutation target has not been associated with any contract target, and the
  decision has controlledTargets but no capability match, treat target scope as unknown.
- Unknown capability or unknown target scope conservatively blocks all Agent mutations
  governed by that decision.

## Hybrid Conflict Detection

Two paths, one bounded revision budget (one discovery-driven change per request;
approval amendments are separate and uncounted).

Harness-auto (deterministic; runs the bounded revision directly on a conclusive fact).
Model-reported (semantic; validated before acting: fieldRef resolves, cited tool calls
exist in the request's search-tracking map, and the cited evidence meets the type's
admissibility bar; assumption-contradicted requires evidence intersecting the
assumption's relatedTargets or keywords -- filenames alone cannot contradict a concept).

Absence is target-type-specific (an empty result is conclusive only if the tool reports
the search was not truncated or limited):
- file-path target: check live open tabs, then a direct disk read. A disk miss alone
  does NOT prove absence when an unsaved matching tab exists.
- filename target: check live tabs, then an exhaustive exact-basename glob.
- symbol target: an exact symbol search across the complete searched scope; empty is
  conclusive only across that scope.
- ui-area and error-text targets are never auto-marked absent from file searches; error
  text yields only positive confirmed matches, never absence.
- list_files (capped at 160) can never establish absence.
- The search-tracking map records, per search, its scope and whether a zero-result
  search was exhaustive; only exhaustive, untruncated zero-results feed an absence
  conclusion.

## Mutation Control Scope

controlsMutation alone is insufficient; each controlling decision carries
controlledCapabilities and controlledTargets, matched against a proposed mutation via
the tool-effect registry (see above). Enforcement is identical whether
intentClarificationMode is ask, assume, or off: a mutation matched by capability or
target is blocked with a tool error naming the open decision; unknown scope blocks all.

## Concurrent Discovery Seed

Harness-owned seed executes discovery directly (no provider round; fixes the forced
toolChoice round at agent-tool-loop.js ~1683):

```
runInitialDiscoverySeed(root, prompt, options):
  name   = promptMentionsLikelyFile(prompt) ? "read_open_tabs" : "list_files"
  callId = "seed_" + requestId + "_" + name        // unique, request-scoped
  emit tool "running" event
  result = execute the tool directly
  return synthetic messages:
    { role: "assistant", content: "<seed narration>",
      tool_calls: [ { id: callId, type: "function",
                      function: { name, arguments: JSON.stringify(args) } } ] }
    { role: "tool", tool_call_id: callId, content: <normalized result> }
```

The assistant message MUST carry a valid tool_calls array whose id matches the tool
message's tool_call_id (an announcement + bare tool result is rejected by
OpenAI-compatible providers). Concurrency: two child AbortControllers (extraction,
seed) from the request signal; aborting one does not abort the other; parent abort
aborts both; remove parent abort listeners on settle. Join with Promise.allSettled.
Extraction deadline intentExtractionDeadlineMs (default 12000): on deadline abort and
DISCARD the extraction result via a settled flag keyed to requestId+revision. The seed
is governed by the parent request timeout only; a seed finishing after a fallback was
chosen is kept as valid context. Discovery failure does not cancel extraction and vice
versa. Reasoning waits for a ready contract; a clarification answer that changes the
relevant target retains the seed as context and re-runs targeted discovery.

## Fast Path (Chat only, v1)

Bypass extraction only when ALL hold: mode Chat and intentFastPathEnabled; no
attachments; no write/change verbs; no diagnostic/error language; no explicit
constraint language; no cross-turn referential phrase; length below
intentFastPathMaxPromptChars (default 240). Active-editor questions fast-path to a
contract carrying the active path as an unverified target. Any signal failing -> full
extraction.

## Model Conversations

Extraction envelope: mode, prompt, minimal prior turns, active file path/tab type/
compact selection, attachment names/types/bounded excerpts. No directory listing,
search results, Git state, or inferred repo facts; not the full 20000-char buffer.
Settings: temperature 0, no streaming, bounded output intentMaxOutputTokens (default
1200), forced capture_intent_contract. The prompt instructs provenance tagging on all
challengeable fields (including requestedActions), assumption kind/relatedTargets/
keywords, decision control scope, target kind, and relationshipToPrior classification.
Invalid extraction: Chat immediate raw fallback; Agent/Plan one repair then one generic
restate card then fallback; every fallback emits a warned event and Agent may mutate
only after it persists.

## Multi-turn Merge Semantics

relationshipToPrior rules on prior content tagged carried:
- independent: no inheritance.
- continues: carry prior contract; refine; keep prior criteria unless superseded.
- extends: carry prior criteria; append new with fresh IDs (never reuse an ID; allocate
  the next free ID and record any remap).
- corrects: replace named fields; the change MUST cite affected field/criterion IDs via
  canonical fieldRefs; superseded criteria move to supersededCriteria.
- uncertain: do NOT merge or discard the prior contract yet. Present the ambiguity per
  clarification policy; if clarification is off and a mutation depends on the
  relationship, create a controlling decision and block it; read-only discovery may
  continue; resolve to one of the four concrete relationships before any dependent
  mutation.

Invariant: continues and extends may add to but MUST NOT drop a carried prohibitedAction
or outOfScope entry (validation fails otherwise); only a user-authored corrects or an
approval amendment may remove one.

## Approval Instructions as Amendment -- Full State Transition

```
Approval instruction received
  -> append the verbatim instruction as user-authoritative amendment input
  -> enter an isolated capture_intent_contract refresh (only that tool exposed)
  -> validate the refreshed contract
  -> replace the injected contract message
  -> persist an amended revision (amendments[]: source approval-instruction,
     provenance clarified, originating tool_call_id, changedFields, applied true)
  -> resume the workspace loop
```

An amendment may change explicit/clarified/inferred content (it is user-sourced) and is
not counted against the discovery-revision budget; the original approval tool error is
still returned.

Refresh-failure scope extraction:
- Preserve the instruction verbatim (amendments[] applied false).
- Default the controlling decision scope to the capability AND resource of the rejected
  tool call.
- Broaden only when the instruction explicitly names additional targets.
- If parsing is uncertain, block the rejected capability/resource first; block all Agent
  mutations only when no safe scope can be derived.
- Never silently fall back to the pre-instruction contract.

## Completion Evidence Ledger (blockers 1 and 3-supporting)

Request-scoped ledger extending agent-activity.js (today only apply_edit/write_file,
validation: []). Tool entry:

```json
{ "id": "EV12", "source": "tool", "toolCallId": "call_...", "tool": "run_tests",
  "outcome": "succeeded | failed | denied | not-executed",
  "summary": "18 tests passed", "verifiedState": true,
  "truncated": false, "successConfirmedIndependently": true,
  "confirmationSource": "exit-status" }
```

Reserved candidate-response entry, created after candidate normalization (for Plan,
after <proposed_plan> normalization and before assessment):

```json
{ "id": "EV-CANDIDATE-1", "source": "candidate-response", "outcome": "succeeded",
  "summary": "Normalized candidate response", "verifiedState": true, "truncated": false }
```

- Response-content criteria (explain the root cause, produce a decision-complete plan,
  document assumptions, answer the question) may cite EV-CANDIDATE-1.
- Candidate evidence CANNOT establish claims about workspace state without supporting
  tool evidence.
- Candidate and tool evidence stay distinguishable via source.
- Assessment runs against the exact candidate later shown and persisted.

Admissibility replaces the vague truncationConfirmed flag with tool-specific
normalization; an entry is inadmissible for a success claim only when its own success
was not confirmed:
- Test/build exit status and structured counts may confirm success despite truncated logs.
- Post-mutation comparison may confirm a write despite truncated content.
- Git post-state may confirm an operation independently of truncated console output.
- A truncated file read cannot prove full-file completeness or absence.
- A truncated search cannot prove no additional matches.
- Each entry records successConfirmedIndependently and confirmationSource; do not mark a
  whole entry inadmissible merely because ancillary output was truncated.

## Draft, Assessment, and Streaming UX

- answer: stream normally; no hidden draft, no assessment call, no criterion verdict,
  no table, no unmet note.
- diagnostic, implementation, planning:
  1. Generate a hidden candidate (non-streamed); narration/progress stays visible.
  2. Normalize the candidate (for Plan, the block normalization below), then create
     EV-CANDIDATE-1 representing exactly that normalized value.
  3. Forced assess_acceptance_criteria over the normalized candidate + evidence ledger
     (tool + candidate) + contract; validate each criterion appears once; parse failure
     retry once then mark all unmet with a warning; normalize verdicts against
     admissibility (uncited or inadmissible-only -> unmet).
  4. The HARNESS -- not the candidate -- appends deterministically: the
     "Criterion | Status | Evidence" table and, if any criterion is unmet, an explicit
     incomplete-task statement.
  5. Emit normalized candidate prose + harness-appended section as the final result.

One identical normalized value is used across normalization, candidate-evidence
creation, assessment, insertion, display, and persistence.

## Plan Block Insertion and Finalization Gate (blocker 4)

Finalization gate (deterministic; the harness decides, not the model):

```
Plan is about to finalize
  -> inspect open blocking ambiguities
  -> an ambiguity counts as resolved only if status is resolved with either a user
     clarification answer or a recorded evidence resolution carrying valid evidenceIds
  -> if unresolved blocking ambiguities remain AND the one post-discovery batch has not run:
        switch to an isolated ask_clarification phase (no workspace tools)
        ask up to three questions
        refresh the contract (answers -> clarified; set ambiguity status resolved)
        resume read-only planning
        mark the post-discovery batch consumed
  -> on the next finalization attempt, proceed even if ambiguities remain and record
     them explicitly in the proposed plan
  -> the gate cannot run its clarification batch again
```

If clarification is disabled, skip the question phase and preserve unresolved
ambiguities visibly in the plan.

Block insertion structural rules (run before runPlanMode extracts/persists):
1. Validate exactly one opening <proposed_plan> and one closing </proposed_plan>.
2. If malformed, normalize: extract the body and re-wrap in one well-formed block.
3. Create EV-CANDIDATE-1 from this normalized block; assess the normalized block.
4. Insert the assessment section (table + any incomplete statement) immediately before
   </proposed_plan>.
5. Save and show the SAME final content; title/milestone extraction runs on it.

## Reinjection and Token Budget

One authoritative contract system message, replaced on refresh/revision/amendment,
included in every round/phase, exempt from compaction. Compacted projection limits:
intentInjectedMaxChars default 3500 (hard max 6000; 6000 chars ~ 1500 tokens ~ 45000
billed input tokens over 30 rounds). Max 12 criteria, 20 targets injected (excess as
counts). Never dropped: goal, prohibitedActions, criterion id+description, open blocking
decisions with control scope, unverified targets. Dropped first: audit history, resolved
clarifications, resolved decisions, low-risk assumptions, verification prose. If
mandatory fields exceed the cap, truncate criterion descriptions with "(truncated)"
before dropping any mandatory field.

## Clarification Preferences

ask: up to three blocking questions pre-discovery (Chat/Agent). assume: convert
non-safety-critical blocking ambiguities to visible assumptions; stop and ask only when
safetyOrScopeCritical. off: never pre-work clarify; preserve unresolved decisions
visibly; Agent may not run a mutation matched by an open controlling decision's scope
(or any mutation if that scope is unknown). Default biases toward assume.

## Persistence, Events, UI, Resume

Task records -> schema v3 adding intentContract, intentStatus, intentRevision,
clarifications, amendments, completionAssessment, evidenceLedger, supersededCriteria.
Persistence ownership is split by milestone: M1 persists intentContract + contract
events; M2 persists clarifications + amendments; M3 persists evidenceLedger +
completionAssessment. Older records remain readable; missing intent fields force
extraction on a new run or resumed action.

Bridge: a clarification channel parallel to but separate from approvals
(pendingClarifications map, request-scoped IDs, requestClarification emit-and-wait,
clarification response action, rejection on cancel/shutdown, browser
respondClarification, requestClarification in runtime options). Minimal cards +
respondClarification land in M2.

Events: intent-contract (variant initial|refreshed|revised|amended|fallback),
clarification, clarification-resolved, completion-assessment.

Resume (v1 simplified): persist clarification Q&A; on restart while awaiting, mark the
intent phase interrupted; Resume re-extracts using saved answers rather than
resurrecting the exact pending call; a resumed mutation whose saved contract no longer
matches re-extracts first. Exact pending-question replay is deferred to M4+.

## Evaluation Protocol

Independent internal experiment dimensions so a quality change is attributable:

```
experiment = {
  intentExtraction:           on | off,
  intentClarification:        on | off,
  intentRevision:             on | off,
  intentCompletionAssessment: on | off
}
```

Precedence: the user master preference (intentContractsEnabled) off ALWAYS disables all
dimensions; the internal per-chat assignment applies only when the master is on. The
experiment configuration is fixed at chat creation. Dependencies: intentRevision and
intentCompletionAssessment require intentExtraction on; incoherent combinations are
rejected.

Off-arm equivalence ("byte-for-byte off") applies to provider requests and visible
behavior, NOT to serialized task-record files or regenerated prompt-profile documents.

Metrics are local and gitignored, recorded SEPARATELY BY TASK TYPE (never averaged
across quick answers and long Agent tasks): task success (blind rubric), localization
precision/recall on files actually read+edited (from the ledger, not namedTargets),
false-met rate (primary), clarification over-ask rate, revision usefulness, and added
calls/tokens/latency. Human scoring is blind to configuration.

Numeric rollout gates (tunable defaults, evaluated per task type):
- false-met rate: no regression; target relative reduction >= 30 percent vs off.
- latency: answer median added <= 2.0s / p95 <= 5.0s; diagnostic/implementation/planning
  median <= 6.0s / p95 <= 12.0s.
- clarification over-ask: <= 20 percent of asked questions rated not decision-shaping.
- cost: <= 2 extra provider calls and <= 25 percent added input tokens per task, per
  task type.

Thumbs record (clarification usefulness): { clarificationId, rating, timestamp }, stored
per clarification with last-write-wins on rating changes.

## Prompt Profile

Add intentExtractionSystem, intentClarificationSystem, intentContractRefreshSystem,
intentContractRevisionSystem, completionAssessmentSystem, completionFinalAnswer. Update
chatSystem/agentSystem/planSystem to treat the injected contract as authoritative and to
surface conflicts via report_intent_conflict; update AGENT_COMPLETION_REPORTING_INSTRUCTION
to reference AC IDs; update toolLoopFinalAnswer/planFinalAnswer for the harness-appended
section. Arm-awareness: when intentExtraction/intentCompletionAssessment are off, the
global prompts and completion instruction MUST NOT mention contracts,
report_intent_conflict, or criteria tables. Constants:
PROMPT_PROFILE_SCHEMA_VERSION = 2; existing profiles get defaults; no user strings
overwritten.

## Settings Surfaces

The master preference and all thresholds must be mirrored in both settings
implementations, which are separate today:
- Headless: config/defaults.js defaults + normalizeAiCompanionSettings.
- Browser: resources/js/ai-companion/settings.js defaults + normalization, plus the
  settings UI wiring for the user-visible master preference.
Both normalizers must agree on defaults and precedence so headless and browser runs
behave identically.

## Files by Milestone

M1: core/intent-contract.js; core/agent-tool-loop.js (fast-path + seed + injection);
config/prompts.js (extraction, arm-aware); config/defaults.js (headless prefs);
resources/js/ai-companion/settings.js (browser prefs); modes/{chat,agent,plan}/index.js;
resources/js/ai-companion/panel.js (persist intentContract + events);
resources/js/ai-companion/intent-contract-renderer.js (basic read-only card);
resources/js/ai-companion/neutralino-ai-bridge.js; tests/ai-companion-intent-contract.test.js.

M2: core/intent-analysis.js; core/intent-clarification.js; core/intent-conflict.js;
core/agent-tool-effect-registry.js; approval-amendment handling in core/agent-tool-loop.js
and core/agent-approval-policy.js; resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs
and neutralino-ai-bridge.js (clarification channel); panel.js + intent-contract-renderer.js
(minimal clarification cards + respondClarification); tests/ai-companion-intent-conflict.test.js,
tests/ai-companion-intent-revision.test.js, tests/ai-companion-tool-effect-registry.test.js,
tests/ai-agent-approval-policy.test.js.

M3: core/completion-assessment.js; core/agent-activity.js (ledger + candidate evidence);
Plan insertion/finalization in modes/plan/index.js and core/agent-tool-loop.js;
panel.js (persist evidenceLedger + completionAssessment; render table);
tests/ai-companion-completion-assessment.test.js, tests/ai-companion-evidence-ledger.test.js.

M4: intent-contract-renderer.js + panel.js (restoration, styling, thumbs);
interrupted-task-resume.js; resources/index.html; resources/styles.css;
desktop-app/tests/eval/intent-contracts-eval.js; tests/eval/intent-eval-prompts.json;
tests/ai-companion-intent-ui.test.js; settings UI wiring files for the master preference.

## Test Plan (key additions beyond v4)

- Candidate evidence: response-content criteria cite EV-CANDIDATE-1; candidate evidence
  cannot satisfy a workspace-state criterion; the assessed value equals the shown/saved
  value; for Plan the entry is created from the normalized block.
- Tool-effect registry: every getAgentToolDefinitions() tool has an entry (omission
  fails); capabilities reuse git.commit.create etc.; resolvers normalize paths;
  capability match blocks regardless of target; unknown scope blocks all.
- Milestones: M1 runs end-to-end (produce/persist/display a contract); M2 asks and
  receives a clarification and blocks a scoped mutation end-to-end; M3 renders an
  evidence-cited verdict table end-to-end.
- Plan gate: an open blocking ambiguity with no resolution forces exactly one isolated
  clarification batch before finalization; the gate cannot re-run; disabled clarification
  records the ambiguity in the plan.
- Absence: file-path uses tabs then direct read (unsaved tab defeats a disk miss);
  filename uses tabs then exhaustive basename glob; symbol uses exact scoped search;
  list_files never proves absence; ui-area/error-text never auto-absent; only exhaustive
  untruncated zero-results conclude absence.
- Truncation: exit-status/counts/post-state confirm success despite truncated logs; a
  truncated read/search cannot prove completeness/absence; successConfirmedIndependently
  and confirmationSource are set by tool-specific rules.
- Multi-turn uncertain: no merge/discard while uncertain; asks or blocks per policy;
  read-only discovery continues; resolves before dependent mutation.
- Amendment: refresh-failure preserves the verbatim instruction, scopes the controlling
  decision to the rejected call's capability/resource, broadens only on explicit named
  targets, and blocks all only when no safe scope derives.
- Settings/experiment: headless and browser normalizers agree; master off disables all
  dimensions; per-chat assignment only when master on; off-arm equivalence covers
  provider requests and visible behavior, not serialized files; metrics recorded per task
  type; thumbs record is last-write-wins.

## Assumptions and Deliberate Boundaries

Intent uses the selected model (small envelope, temperature 0, bounded output, no
streaming, one forced function, overlapped with the seed). Fast path is Chat-only in v1.
Discovery may correct inferred localization/assumptions but never rewrites an inferred
goal/criterion silently and never creates prohibitions or scope. One questioning
mechanism (ask_clarification) across modes; Plan uses it only via the finalization gate.
The harness renders the criteria table and incomplete statement. No repo files change
during the intent phase; no automatic remediation after assessment. Ships behind a master
flag with independent internal experiment dimensions and a local-only eval harness;
unrelated provider, security, tool, and editor behavior is not refactored.

## Validation Checklist

- Every acceptance criterion can cite admissible tool evidence OR candidate-response
  evidence.
- Every exposed Agent tool has a canonical effect, capability, and resource resolver.
- Controlled decisions deterministically match proposed mutations.
- M1 persists and displays contracts; M2 asks and receives clarification end-to-end.
- Plan cannot finalize without executing its one deterministic ambiguity gate.
- File/symbol absence rules cannot misclassify unsaved tabs or limited searches.
- Truncated output is admitted only when an independent structured signal confirms success.
- Uncertain multi-turn relationships cannot silently merge or discard intent.
- Failed approval amendments remain authoritative and block the correct scope.
- Settings and experiment precedence are identical in headless and browser normalization.
- Document uses balanced Markdown fences and ASCII-safe punctuation.

## Blocker Resolution Summary

1. Candidate-response evidence -- DONE (Completion Evidence Ledger; Draft/Assessment;
   Plan insertion creates EV-CANDIDATE-1 from the normalized block).
2. Canonical tool-effect registry -- DONE (Canonical Tool-Effect Registry; Mutation
   Control Scope consumes it; git.commit.create reused; uncovered tools given capabilities).
3. Functional milestone ownership -- DONE (Delivery Milestones; Files by Milestone place
   minimal persistence in M1, clarification UI in M2, ledger persistence in M3).
4. Deterministic Plan finalization gate -- DONE (Plan Block Insertion and Finalization
   Gate; ambiguity status/resolution).
