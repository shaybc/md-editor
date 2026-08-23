# M8 — Plan Mode Adoption to the Stateful Controller

> This revision merges the original M8 plan with its review. Review concerns are now folded in as
> resolved decisions. Changes from the prior draft are listed under "Revision notes" at the end.
> Verified against the working tree under `desktop-app/resources/ai-companion/`.

## Summary

M8 migrates Plan mode from its legacy direct-prompting path into the existing M2–M7 stateful
controller architecture.

M8 does **not** create a second orchestration stack for Plan mode. It reuses the existing shared
infrastructure for authoritative state, typed decisions, context building, observation
normalization, verification, completion control, progress detection, checkpoints, recovery,
telemetry, and final-response composition.

Plan mode contributes only Plan-specific policies, projections, decision types, tool restrictions,
plan artifacts, verification rules, recovery phases, and response composition.

The legacy Plan path remains intact behind an internal default-off feature flag.

```text
Plan request
    -> initialize Plan controller state
    -> derive Plan requirements / acceptance criteria (see "Plan requirements source")
    -> build read-only context
    -> request one typed decision
    -> validate against Plan policy
    -> execute bounded read-only action or control action
    -> record observation through the shared state transition service
    -> detect progress / require strategy revision when needed
    -> verify the proposed plan artifact
    -> deterministic completion gate
    -> compose final Plan response from accepted state
```

## Central invariants

```text
M8 reuses the existing controller.
It does not introduce a parallel Plan state machine, decision protocol,
checkpoint store, verifier, or recovery system.

Plan mode is read-only.
No workspace mutation may execute through the M8 controller.

The model may propose a plan and propose completion.
It cannot commit authoritative state or declare the plan complete.

A Plan run succeeds only after a fresh verifier result is accepted by the
shared state transition service and the deterministic completion gate accepts it.

The final response and saved-plan artifact are composed from accepted state,
verified evidence, explicit assumptions, unresolved questions, and termination reason.
```

## Scope

M8 applies only to Plan mode.

Included:

- Plan-specific policy over the shared controller.
- Plan-compatible state projections.
- Plan-specific typed decision actions.
- Read-only tool allowlisting.
- A Plan requirements-derivation step (new; see below).
- A structured plan artifact.
- Plan-specific verification and completion rules.
- Progress and anti-loop behavior for read-only investigation.
- Durable checkpoints and restart recovery using M7 infrastructure.
- Saved-plan output.
- Internal default-off rollout and evaluation.

Excluded:

- Agent behavior changes.
- Chat adoption, which remains M9.
- Tool implementation changes.
- Provider connector changes unless required for an existing shared controller capability.
- Autocomplete.
- Git Summary.
- Connection and model tests.
- Quick Fix internals outside existing Agent handoff.
- Specialized AI components.
- General UI redesign.
- Mutation tools in Plan mode.

## Prerequisites

M8 assumes M0–M7 are complete and stable.

The following shared components already exist in `resources/ai-companion/core/` and remain
authoritative (filenames confirmed against the working tree):

- state transition and reducer — `agent-state.js`
- typed decision controller — `agent-decision-controller.js`
- context builder — `agent-context-builder.js`
- observation normalizer — `agent-observation-normalizer.js`
- artifact store — `agent-artifact-store.js`
- verification evidence + completion arbitration — `agent-verification-evidence.js`,
  `completion-arbiter.js`, `completion-assessment.js`
- completion control — `agent-completion-orchestrator.js`, `agent-completion-policy.js`,
  `agent-completion-state.js`
- progress evaluation — `agent-progress-evaluator.js`, `agent-progress-policy.js`,
  `agent-strategy-signature.js`
- final-response composer — `agent-final-response-composer.js`
- checkpoint schema and store — `companion-checkpoint-schema.js`, `companion-checkpoint-store.js`
- recovery coordinator — `agent-recovery-coordinator.js`, `agent-checkpoint-runtime.js`,
  `agent-action-recovery-policy.js`
- approval and security policy — `agent-approval-policy.js`, `approval-*` modules
- evidence ledger — `agent-activity.js`, `completion-evidence-ledger.js`
- telemetry and evaluation harness — M0 baseline eval files under `tests/eval/`

M8 may generalize Agent-named internal types where necessary, but must preserve behavior and
compatibility for existing Agent runs.

> **Note on naming.** There is currently **no** `agent-verification-controller.js` or
> `agent-completion-controller.js`. Verification and completion are implemented across the
> modules listed above. M8 adapts those real modules; it does not create newly named replacements.

## Plan requirements source (resolved dependency)

The Plan verifier's coverage checks and mandatory context depend on a structured set of
requirements and acceptance criteria. In the current code, **intent extraction is gated to
`mode === "agent"`** (`agent-tool-loop.js` lines ~1353 and ~1359) and `intentContractsEnabled`
defaults `false`, so Plan mode does **not** build an intent contract today.

M8 resolves this explicitly. Plan requirements are derived by **enabling intent extraction for
Plan mode** under the Plan policy, producing a read-only intent contract and acceptance criteria
before context building. Constraints:

- Intent extraction for Plan reuses the existing intent modules; it does not fork them.
- The derived contract is read-only research scope, never a mutation authorization.
- If intent extraction is unavailable or fails, M8 may use a lightweight Plan-specific requirement
  derivation (requirements parsed from the verbatim user prompt and accepted clarifications), but
  only under the guard below — it does **not** silently replace failed extraction for complex
  requests.
- Whichever source is used, requirements are recorded in state with provenance and are the sole
  basis for the verifier's coverage checks.

### Fallback derivation guard

A weak fallback parser could omit a requirement and then let the verifier approve a plan against an
incomplete contract. To prevent this, fallback derivation is gated on a deterministic
request-shape classification:

```text
Simple, explicit request
  -> deterministic fallback requirement derivation allowed
Complex, ambiguous, or multi-part request
  -> request clarification, or terminate as unverified
```

Invariant:

```text
Fallback-derived requirements may be used for completion only when the runtime
can deterministically prove that the request is explicit and fully represented.
Otherwise, fallback requirements are provisional and cannot produce successful
Plan completion without user confirmation.
```

Consequences:

- The "simple and fully represented" determination is made by deterministic runtime logic, not by
  the model claiming the request is simple.
- When the request is not provably simple and intent extraction did not succeed, the run must
  either raise a `request_user_input` clarification or terminate as `unverified` — never emit a
  successful Plan.
- Fallback-derived requirements carry `provenance: "fallback"` and a `provisional` flag. The
  completion gate must reject success while any required coverage rests on provisional fallback
  requirements that lack user confirmation.

This dependency and its guard are hard prerequisites for M8.4 and are validated in M8.2.

## Architecture reuse rule

M8 must not create parallel replacements for existing controller components.

Do not create a second:

- state transition service,
- generic decision envelope,
- context-building pipeline,
- checkpoint store,
- recovery coordinator,
- evidence store,
- completion gate,
- generic progress engine,
- or orchestration loop.

Instead, parameterize the existing infrastructure with a Plan policy object.

```js
const planModePolicy = {
  mode: "plan",
  mutability: "read-only",
  allowedDecisionTypes: [],
  allowedTools: [],
  contextPolicy: {},
  verificationPolicy: {},
  progressPolicy: {},
  checkpointPolicy: {},
  finalResponsePolicy: {}
};
```

The mode-policy seam is introduced as a **new** module (no such file exists yet). Suggested name:
`resources/ai-companion/core/companion-mode-policy.js`. Its job is to replace the scattered
hardcoded `mode === "agent"` branches in `agent-tool-loop.js` with policy lookups.

## Internal feature boundary

Add to `defaults.js`, following the existing `agent*Enabled` convention:

```js
planStatefulControllerEnabled: false
```

Requirements:

- Internal only in M8.
- Default `false`.
- No visible Settings control. The `settings.js` change is **flag registration/normalization
  only** (parsed and defaulted alongside `agentDecisionControllerEnabled` and peers); it adds no
  user-facing toggle.
- Effective only when `mode === "plan"`.
- When disabled, execute the exact legacy Plan path.
- When enabled, execute the full M8 stateful path.
- Invalid controller dependencies fail closed before the first provider request.
- Never fall back to the legacy path after a stateful Plan run has started.
- Agent, Chat, and specialized AI paths must not resolve or activate the Plan policy.

## Plan state

Reuse the shared authoritative state envelope and add a Plan projection.

The implementation may use a generalized `CompanionState` internally or a mode-aware extension of
the existing state schema, but there must remain one reducer-owned mutation path.

```js
{
  mode: "plan",
  plan: {
    status: "drafting" |
            "inspecting" |
            "awaiting_clarification" |
            "verifying" |
            "rejected" |
            "succeeded" |
            "blocked" |
            "budget_exhausted" |
            "failed" |
            "cancelled",

    artifact: null,
    latestProposalDecisionId: null,
    latestVerificationId: null,

    requirementCoverage: [],
    assumptions: [],
    unresolvedQuestions: [],
    risks: [],
    evidenceRefs: [],

    savedPlanRef: null,
    terminalReasonCodes: []
  }
}
```

State must preserve:

- original user prompt verbatim,
- clarification answers verbatim with `source: "user"`,
- current intent contract (or fallback requirement set) and its provenance,
- acceptance criteria,
- requirements,
- explicit user constraints,
- Plan decision history,
- read-only observations,
- evidence references,
- progress assessments,
- strategy revisions,
- verification results,
- checkpoint and recovery state,
- semantic completion outcome,
- final response projection.

## Typed Plan decisions

Reuse the shared typed decision protocol introduced in M4.

Do not define a second Plan-only envelope such as `decision.action`, `decision.args`, or
model-controlled state versions.

```js
{
  schemaVersion: 1,
  decisionId,
  basedOnStateVersion,
  mode: "plan",
  type,
  intentId,
  rationale,
  expectedObservation,
  tool: null,
  payload: null
}
```

Runtime code generates decision identity, state version, mode, execution identity, and lifecycle
status.

### Allowed Plan decision types

Use existing real read-only tools plus these controller actions:

```text
tool_call
request_user_input
revise_plan_strategy
propose_plan_completion
report_blocked
```

Do not expose:

```text
commit
mark_intent
mark_complete
set_verification
set_criterion_status
abort
write_file
patch_file
delete_file
move_file
run_mutating_command
launch_mutating_external_action
```

The model may propose a plan artifact, but only the verifier, state transition service, and
completion gate may accept it.

## Read-only tool policy

Plan mode must use an explicit allowlist.

Typical allowed capabilities:

```text
read_file
read_active_document
search_workspace
find_symbol
inspect_project_metadata
inspect_repository_structure
read_configuration
read_documentation
read_git_metadata
run_proven-read-only diagnostic commands
```

Forbidden:

```text
write_file
patch_file
delete_file
move_file
rename_file
create_file
run mutating commands
install dependencies
start or stop applications with side effects
perform network writes
change settings
approve its own actions
```

A shell or command action is allowed only when the existing policy can prove it is read-only and
bounded. Unknown commands are rejected.

Plan mode must never request mutation approval because mutation tools are unavailable.

## Structured Plan artifact

Plan completion must produce a typed artifact rather than only free-form prose.

```js
{
  schemaVersion: 1,
  title: "",
  goal: "",

  requirements: [{
    id: "",
    statement: "",
    source: "user | intent-contract | clarification",
    required: true
  }],

  assumptions: [{
    id: "",
    statement: "",
    evidenceRefs: []
  }],

  steps: [{
    id: "",
    objective: "",
    description: "",
    requirementsCovered: [],
    affectedAreas: [],
    filesOrComponents: [],
    dependencies: [],
    prerequisites: [],
    actions: [],
    validations: [],
    risks: [],
    evidenceRefs: []
  }],

  sequencing: {
    orderedStepIds: [],
    parallelGroups: []
  },

  risks: [{
    id: "",
    description: "",
    mitigation: ""
  }],

  unresolvedQuestions: [{
    id: "",
    question: "",
    blocking: true
  }],

  exclusions: [],
  evidenceRefs: []
}
```

The saved artifact must be schema-versioned, bounded, free of hidden reasoning, based on accepted
state, explicit about uncertainty, explicit about unresolved blocking questions, and traceable to
requirements and evidence.

The rendered Markdown plan is derived from this artifact.

## Context building

Reuse the M3 shared Context Builder (`agent-context-builder.js`) with a Plan policy.

Mandatory Plan context:

1. System and policy instructions.
2. Current user prompt.
3. Current intent contract (or fallback requirement set) and acceptance criteria.
4. Verbatim accepted clarifications.
5. Explicit user constraints.
6. Current Plan state projection.
7. Latest rejected verification result and unmet coverage.
8. Current progress/replan requirement.
9. Read-only observations and selected artifact excerpts.

Optional context:

- bounded conversation history,
- active editor buffer,
- text and image attachments,
- older observations,
- repository metadata.

The builder must deduplicate repeated instructions, preserve authoritative user text over derived
summaries, use live editor buffers over stale persisted excerpts, report omitted sections and
budget overflow, avoid reconstructing accumulated legacy tool history, and remain provider-neutral.

## Plan progress policy

Reuse M6 progress infrastructure (`agent-progress-evaluator.js`, `agent-progress-policy.js`,
`agent-strategy-signature.js`) with a Plan-specific policy.

Meaningful Plan progress may include:

- discovering a required component,
- locating relevant files or symbols,
- resolving a requirement ambiguity,
- adding evidence for an architectural claim,
- expanding requirement coverage,
- identifying a dependency or risk,
- producing a materially improved plan revision,
- resolving a blocking clarification.

No progress may include:

- repeated equivalent searches,
- repeated reads with no new evidence,
- oscillating between the same files,
- reformulating the same plan without new coverage,
- proposing completion with unchanged unmet criteria,
- repeating a rejected strategy,
- reading unrelated files.

Plan-specific strategy signatures should detect conceptual repetition, not only exact tool
arguments.

Forced replanning must occur through the next normal typed decision. Do not add a second general
planner call.

Progress control may never satisfy requirements or authorize completion.

## Plan verification

Plan verification is **new verification logic that reuses shared plumbing**, not a thin adapter.
The Agent verifier checks evidence of *executed effects*; the Plan verifier checks a *proposed
artifact's internal coverage and consistency* with nothing executed. It reuses the evidence
ledger, artifact store, and the reducer's result-acceptance path, but its checks are Plan-specific.
It builds over `agent-verification-evidence.js` and the completion arbiter/assessment modules;
it does not introduce a parallel verifier.

The verifier receives the immutable Plan artifact proposal, current requirements and criteria,
evidence snapshot, unresolved questions, assumptions, current state version, fingerprints,
proposal decision ID, and completion attempt ID.

The verifier produces a typed result only and cannot mutate state.

### Verification checks

A Plan proposal is satisfied only when:

1. Every required user requirement is represented exactly once or traceably covered.
2. No requirement was silently removed or weakened.
3. Each required requirement maps to one or more actionable steps.
4. Steps are ordered or explicitly marked parallel.
5. Dependencies and prerequisites are identified where relevant.
6. Affected files, modules, components, or investigation targets are identified when supported by
   evidence.
7. Workspace-specific claims are backed by admissible evidence.
8. Validation or test steps exist for implementation work.
9. Risks and mitigations are explicit where material.
10. Assumptions are explicit and not presented as verified facts.
11. Blocking unresolved questions prevent success.
12. The artifact is internally consistent and schema-valid.
13. No mutation was performed.
14. The proposal is fresh for the current state, intent contract, evidence snapshot, and
    completion attempt.

Possible statuses:

```text
satisfied
unsatisfied
provisional
unverified
blocked
```

Status interpretation and semantic termination remain runtime-owned.

## Completion gate

Reuse the shared deterministic completion gate with a Plan-specific policy.

Successful Plan completion requires:

- the run is active,
- no pending clarification, decision, or observation,
- the current proposal exists and is accepted,
- the latest verifier result is fresh,
- every required criterion is satisfied,
- every requirement has coverage,
- no blocking unresolved question remains,
- all cited evidence is admissible,
- no forbidden mutation occurred,
- no required coverage rests on `provisional` fallback-derived requirements without user
  confirmation,
- the reducer accepts the semantic completion transition,
- the final Plan artifact is recorded exactly once.

The model cannot bypass this gate through text, provider finish reason, or a pseudo-tool claim.

Non-success outcomes include:

```text
blocked
provisional
unverified
budget_exhausted
failed
cancelled
```

These must produce honest responses and must not use success wording.

## Saved-plan output

After successful completion:

1. Build the final structured Plan artifact from accepted state.
2. Render the Markdown plan from that artifact.
3. Save it using the existing Plan saved-output behavior (`plan-finalization.js` and
   `tools/plan-repository-tools`).
4. Record the saved-plan reference in state.
5. Checkpoint the saved artifact and final-response projection.
6. Emit completion only after the terminal checkpoint succeeds.

The saved plan must not be generated from conversation memory alone.

The saved artifact and displayed response must agree on goal, requirements, steps, affected areas,
assumptions, risks, unresolved questions, verification status, and completion reason.

## Checkpoints and recovery

Reuse the M7 checkpoint schema, store, barriers, artifact persistence, and recovery coordinator.

Do not create a Plan-specific checkpoint store.

Add Plan-aware or generalized phases capable of representing:

```text
decision_ready
model_pending
interaction_pending
inspection_prepared
inspection_observed
progress_pending
verification_pending
finalizing
terminal
```

Because Plan mode is read-only:

- repeated reads may be safely retried after current policy checks,
- lost model calls may be repeated from the same durable state,
- pending clarifications must return as new live interactions,
- accepted user answers remain authoritative,
- stale decisions and verifier results remain invalid,
- saved-plan finalization must be idempotent,
- terminal checkpoints must not offer resume.

Recovery must rebuild context from authoritative state, durable artifacts, checkpoint phase/cursor,
and current workspace observations. Conversation history remains background only.

## Implementation order

### M8.1 — Shared-controller generalization (highest risk)

The controller is currently gated by hardcoded `mode === "agent"` checks scattered through
`agent-tool-loop.js` (~3,878 lines; confirmed sites include lines ~2924, ~2994, ~3134, and
roughly a dozen more). M8.1 replaces those with a mode-policy seam **without perturbing Agent
behavior**. This is the highest-risk work in M8.

- Introduce `companion-mode-policy.js` as the seam around existing controller components.
- Generalize Agent-specific names only where necessary.
- Preserve Agent behavior byte-for-byte when Plan mode is disabled.
- Add Plan policy registration without creating duplicate infrastructure.

**Exit condition (strengthened):** capture a **characterization snapshot of representative Agent
runs before the refactor** (decisions, tool calls, state transitions, checkpoints, final output),
then replay after the refactor and prove **identical** results. Additionally, the shared
controller can initialize a Plan-mode state session and validate Plan policy without executing a
model. "Plan can initialize" alone is not a sufficient gate.

### M8.2 — Plan state, requirements source, and decision contracts

- Add the Plan state projection.
- Wire the Plan requirements source (intent extraction enabled for Plan, with the guarded
  lightweight fallback derivation). Validate that requirements always exist before verification is
  reachable, and that fallback-derived requirements are marked `provisional` unless the request is
  deterministically proven simple and fully represented.
- Add Plan-specific typed decision validation.
- Add the read-only tool allowlist.
- Add Plan-specific control pseudo-tools.
- Reject all mutation tools and unsupported actions.

Exit condition: every Plan decision is typed, state-version bound, policy-valid, and read-only;
and every Plan run has an authoritative requirement set with recorded provenance.

### M8.3 — Plan context and observations

- Reuse the shared Context Builder with Plan source priorities.
- Normalize read-only observations through the shared observation pipeline.
- Add Plan progress signatures and evidence projection.
- Preserve live-buffer precedence and user-input provenance.

Exit condition: every Plan decision context can be rebuilt from state and bounded evidence without
accumulated legacy tool history.

### M8.4 — Plan artifact and verification (new verification logic)

- Add the structured Plan artifact schema.
- Build Plan verification over the existing verification/evidence modules (new checks, shared
  plumbing — not a thin adapter).
- Add coverage, consistency, evidence, risk, and unresolved-question checks.
- Add deterministic all-unsatisfied fallback after bounded repair.

Exit condition: no Plan proposal can complete without a fresh reducer-accepted verification result.

### M8.5 — Completion and saved-plan composition

- Add Plan-specific completion policy over the shared gate.
- Compose Markdown and structured output from accepted state.
- Save the plan idempotently.
- Record final response and saved-plan reference exactly once.

Exit condition: successful Plan output, saved artifact, state, and completion telemetry agree.

### M8.6 — Progress, anti-loop, and budgets

- Enable Plan-specific progress classification.
- Detect exact and semantic repetition.
- Force typed strategy revision after threshold breaches.
- Apply bounded replan and decision budgets.
- Terminate honestly when exhausted.

Exit condition: repeated inspection or plan-rewrite loops cannot continue without bounded strategy
change or non-success termination.

### M8.7 — Checkpoints and recovery

- Add Plan mode to the M7 checkpoint and recovery policies.
- Support recovery for read-only decision, observation, clarification, verification, and
  finalization phases.
- Preserve same-task lineage and saved-plan idempotency.

Exit condition: forced restart at every supported Plan boundary preserves accepted requirements,
user answers, evidence, plan revisions, and semantic outcome.

### M8.8 — Rollout and cleanup

- Add `planStatefulControllerEnabled`, default `false`.
- Compare legacy and stateful Plan runs.
- Keep both paths until evaluation gates pass.
- Promote to default-on only in a later release decision with a kill switch.
- Remove legacy Plan orchestration only after proven unused and rollback coverage exists.

> **Risk concentration.** M8.1 (seam surgery) and M8.4 (Plan verification) carry most of the risk.
> Each gets its own hard validation gate above rather than being treated as a uniform step.

## Observability

Emit content-limited Plan controller events for activation, decisions, read-only actions,
progress, replanning, verification, completion, checkpoints, saved-plan recording, semantic
outcome, loop length, model/tool calls, tokens, and latency.

Never emit raw prompts, hidden reasoning, sensitive tool arguments, file bodies, artifact
excerpts, clarification answers, or malformed provider payloads.

## Test plan

### Policy and decision tests

- Only Plan mode can activate the M8 policy.
- All mutation tools are unavailable or rejected.
- Exactly one typed decision is accepted per round.
- Multiple, malformed, unknown, stale, or unsupported actions execute nothing.
- Runtime stamps decision IDs and state versions.
- Plan policy changes do not alter Agent decisions.

### Seam characterization tests (M8.1)

- Pre-refactor Agent run snapshots replay identically post-refactor.
- Agent decisions, tool calls, state transitions, checkpoints, and final output are byte-for-byte
  equal with Plan mode disabled.

### Requirements-source tests (M8.2)

- Intent extraction runs for Plan mode under the Plan policy.
- Fallback requirement derivation activates only for deterministically simple, explicit requests.
- Complex, ambiguous, or multi-part requests whose intent extraction failed raise clarification or
  terminate as `unverified` — they never complete via fallback.
- Fallback-derived requirements are tagged `provenance: "fallback"` and `provisional`, and cannot
  produce successful completion without user confirmation.
- Every Plan run reaches verification with a non-empty, provenance-tagged requirement set.

### State and reducer tests

- Plan transitions mutate state only through the shared reducer.
- Duplicate and out-of-order transitions are rejected.
- Technical lifecycle and semantic completion remain separate.
- Verbatim user clarification survives.
- State and snapshot schemas remain bounded and serializable.
- Legacy Agent snapshots remain readable.

### Context and observation tests

- Plan context is rebuilt from authoritative state.
- Current prompt and constraints are mandatory.
- Live editor content overrides stale evidence.
- Unsupported workspace claims cannot enter a successful Plan.
- Repeated instructions are deduplicated.
- Context budgets and omitted-source manifests are deterministic.

### Plan artifact tests

- Artifact schema validation.
- Requirement-to-step coverage.
- Ordered and parallel sequencing.
- Risk and mitigation rendering.
- Explicit assumptions and unresolved questions.
- Evidence-reference validation.
- Stable Markdown rendering.
- Saved artifact matches accepted state.

### Verification and completion tests

- Confident model prose cannot bypass verification.
- Missing requirement coverage prevents success.
- Unsupported workspace claims prevent success.
- Blocking questions prevent success.
- Provisional and unverified results never become success.
- Fully covered and evidence-backed plans complete exactly once.
- Final response and saved plan claim only accepted facts.
- No duplicate saved plan or final response.

### Progress and loop tests

- Repeated equivalent searches trigger strategy revision.
- Repeated reads without new evidence count as no progress.
- Legitimate rereads after meaningful progress remain allowed.
- Rejected completion with unchanged plan remains stalled.
- Semantic strategy change clears the stall window.
- Budget exhaustion terminates honestly.

### Recovery tests

Force restart before and after model decisions, reads, clarifications, progress evaluation,
verification, save, and terminal projection.

Assert:

- no accepted requirement or user answer is lost,
- no stale decision or verifier result is accepted,
- read-only observations are safely repeated or reused,
- saved-plan finalization is idempotent,
- final response agrees with accepted state,
- terminal tasks do not offer resume.

### Boundary tests

- Agent behavior is unchanged with M8 off.
- Chat does not activate M8.
- Autocomplete, Git Summary, connection/model tests, and specialized AI components remain
  unchanged.
- No mutation tool is exposed in Plan mode.
- Legacy Plan remains unchanged with the feature flag off.

## Evaluation plan

Run the M0 Plan corpus and additional Plan-specific cases against:

1. Legacy Plan path.
2. Stateful Plan path.

Use target and reference models with the existing local opt-in runner.

> **Corpus adequacy gate (new).** M0 declares `chat`/`plan`/`agent` as evaluated modes and ships
> `tests/eval/ai-companion-baseline-cases.json` (Spring PetClinic as eval base), but the prior
> intent benchmark was only 5 real + 8 synthetic cases. Before the "no lower than legacy" gate is
> treated as authoritative rather than noise, **confirm or expand a Plan-specific corpus** of
> sufficient size (target: enough cases that a single pass/fail swing does not move the aggregate
> beyond the noise band). This is a precondition for the acceptance criteria below.

Report task pass rate, requirement coverage, unsupported-claim rate, clarification correctness,
plan usefulness and consistency, saved-plan success, false completion, false incomplete, repeated
actions, replans, budget exhaustion, provider/tool calls, tokens, latency, checkpoint overhead,
and recovered-versus-uninterrupted outcome agreement.

## Acceptance criteria

M8 exits only when:

- A Plan-specific evaluation corpus of adequate size exists (see corpus adequacy gate).
- Zero mutation tools execute in stateful Plan mode.
- Zero successful Plan runs bypass a fresh reducer-accepted verifier result.
- Zero successful plans omit a required criterion in the deterministic corpus.
- Zero successful plans contain unsupported workspace claims in the deterministic corpus.
- Zero successful plans complete against provisional fallback-derived requirements without user
  confirmation.
- Zero stale decisions or verifier results affect state.
- Zero duplicate final responses or saved-plan writes occur.
- Repeated and oscillating Plan strategies are bounded.
- Recovery preserves accepted requirements, evidence, user answers, and plan revisions.
- Recovered and uninterrupted runs agree on semantic outcome for supported phases.
- Stateful Plan deterministic pass rate is no lower than legacy.
- False-completion rate is no higher than legacy.
- Agent behavior is proven unchanged by the M8.1 characterization snapshot.
- Agent, Chat, and specialized AI components show no behavioral changes.
- Full desktop test suite passes.
- `planStatefulControllerEnabled` remains default-off after M8.

## Expected files to change

Prefer adapting the existing M2–M7 files rather than introducing a parallel orchestration
directory. Filenames below are confirmed against the working tree.

New:

- `resources/ai-companion/core/companion-mode-policy.js` (mode-policy seam)

Adapt:

- `resources/ai-companion/core/agent-state.js`
- `resources/ai-companion/core/agent-decision-controller.js`
- `resources/ai-companion/core/agent-context-builder.js`
- `resources/ai-companion/core/agent-observation-normalizer.js`
- `resources/ai-companion/core/agent-progress-policy.js`
- `resources/ai-companion/core/agent-progress-evaluator.js`
- `resources/ai-companion/core/agent-strategy-signature.js`
- `resources/ai-companion/core/agent-verification-evidence.js`
- `resources/ai-companion/core/completion-arbiter.js`
- `resources/ai-companion/core/completion-assessment.js`
- `resources/ai-companion/core/agent-completion-orchestrator.js`
- `resources/ai-companion/core/agent-completion-policy.js`
- `resources/ai-companion/core/agent-completion-state.js`
- `resources/ai-companion/core/agent-final-response-composer.js`
- `resources/ai-companion/core/companion-checkpoint-schema.js`
- `resources/ai-companion/core/companion-checkpoint-store.js`
- `resources/ai-companion/core/agent-recovery-coordinator.js`
- `resources/ai-companion/core/agent-tool-loop.js` (replace hardcoded `mode === "agent"` gates
  with policy lookups)
- `resources/ai-companion/core/intent-*.js` (enable Plan-mode intent extraction under policy)
- `resources/ai-companion/core/plan-finalization.js`
- `resources/ai-companion/modes/plan/index.js`
- `resources/ai-companion/config/defaults.js`
- `resources/js/ai-companion/settings.js` (flag registration/normalization only — no visible
  control)
- `resources/js/ai-companion/panel.js`
- Plan controller, artifact, verification, recovery, boundary, storage, and evaluation tests.

Avoid adding:

```text
a second state-transition module
a second decision-contract module
a second checkpoint-store module
a separate generic Plan orchestration loop
```

## Rollback plan

If instability appears:

1. Disable `planStatefulControllerEnabled`.
2. Route new Plan requests through the unchanged legacy path.
3. Preserve stateful Plan task records and checkpoints for diagnostics.
4. Do not resume stateful checkpoints through the legacy path.
5. Keep Agent and all specialized components unaffected.
6. Re-enable only after the failing evaluation or recovery gate is corrected.

## Assumptions and intentionally unchanged areas

- M0–M7 are complete before M8 implementation.
- Existing Agent controller behavior remains authoritative and unchanged (proven by the M8.1
  characterization snapshot).
- The shared reducer remains the only state mutation path.
- The existing verifier remains side-effect free.
- The deterministic completion gate remains runtime-owned.
- Plan remains read-only.
- No visible setting is added.
- Chat adoption remains M9.
- Specialized AI components remain outside the architecture.
- No unrelated refactoring, renaming, formatting, or UI redesign is included.

## Revision notes (changes merged from the review)

1. **File list corrected to real filenames.** The prior draft named `companion-mode-policy.js`
   (as if existing), `agent-verification-controller.js`, and `agent-completion-controller.js` —
   none of which exist. The seam module is now explicitly new; verification and completion point
   at the real modules.
2. **Plan requirements source resolved.** Added the "Plan requirements source" section and an
   M8.2 step, because intent extraction is currently Agent-only (`agent-tool-loop.js` ~1353/1359)
   and Plan had no authoritative requirement set to verify against.
2a. **Fallback derivation guarded.** The lightweight fallback must not silently replace failed
   intent extraction for complex requests. Fallback is now gated on a deterministic request-shape
   classification: simple/explicit requests may use it; complex/ambiguous/multi-part requests must
   clarify or terminate as `unverified`. Fallback-derived requirements are `provisional` and
   cannot produce successful completion without user confirmation. Threaded through M8.2, the
   completion gate, tests, and acceptance criteria.
3. **M8.1 exit gate strengthened.** Now requires a pre-refactor Agent characterization snapshot
   that must replay identically — appropriate for surgery on a ~3,878-line file gated by scattered
   `mode === "agent"` checks. Added to acceptance criteria and test plan.
4. **Plan verification reclassified** from "an adapter" to new verification logic reusing shared
   plumbing, reflecting that it validates a proposed artifact rather than executed effects.
5. **Eval corpus adequacy gate added**, since "pass rate no lower than legacy" is only meaningful
   with a sufficiently large Plan corpus.
6. **Settings tension clarified**: the `settings.js` change is flag registration/normalization
   only; no visible control is added.
7. **Risk concentration called out**: M8.1 and M8.4 each carry their own hard validation gate.
