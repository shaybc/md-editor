# M11 — Task Profiles, Intent Boundary, and Action-Readiness (post-M9 hardening)

> Motivated by a real failing run: asked only to set six preferences, the agent seeded a workspace
> `list_files`, turned the incidental active file into a mandatory `mustInspect` acceptance
> criterion, searched source for tools it already had, accumulated ~384k tokens, and was cancelled
> without ever calling `preferences_update`. The high-level intent was extracted correctly; the
> *runtime* never said "you already know what to change — execute." M11 adds the missing control
> mechanisms on top of M0–M9. Verified against the working tree under
> `desktop-app/resources/ai-companion/`.

## Diagnosis in one line

The failure was not model intelligence. It was four interacting harness gaps: **forced generic
discovery**, an **intent contract polluted by incidental context**, **no engaged typed next-action
controller**, and **no information-sufficiency / no-progress gate**. Several needed mechanisms
already exist (M4 controller, M5 verifier, M6 progress) but were **not engaged** for the run
(empty `decisionId` values ⇒ the legacy agent path ran, not the stateful controller). Others are
genuinely missing (task typing, intent provenance boundary, action-readiness).

## Central invariants (new)

```text
Ambient context is not intent. The active file, open tabs, selection, and recent
activity are supporting evidence only; they never become mustInspect, acceptance
criteria, or named targets unless the user refers to them or a later observation
proves them necessary.

Known task types run a constrained tool surface. A deterministically classified
task (e.g. preferences mutation) exposes only the tools that task needs; general
discovery tools are hidden unless the specialized path fails.

Sufficiency ends discovery. When the runtime can prove it knows the target(s), the
desired value(s), an available capable tool, and that the task is authorized, further
discovery is rejected, not merely discouraged. Semantic task authorization (the user
asked) is separate from runtime execution approval (the approval policy permits it now)
and never substitutes for it.

Every action is a typed, governed decision. No action executes without a
decisionId, a reason, and an expectedObservation recorded in state.

Progress is task-relative. Re-deriving information already in state (e.g. source
searching a preference already resolved via preferences_search) is no_progress and
forces a strategy change.
```

## Mechanism 1 — Intent provenance boundary (ambient ≠ requirement)

**Problem.** The intent extractor put `conversation-export-tools.js` (the incidental active file)
into `mustInspect` and an acceptance criterion, converting editor context into mandatory work.

**Mechanism.** A deterministic provenance rule in the intent phase:

```text
user-referenced target (named in the prompt / clarification) -> may be required
ambient context (active file, open tab, selection, recent activity) -> supporting only
```

- Tag every candidate target with provenance (`user` | `ambient` | `observation`). Only `user` (or
  an `observation` that later proves necessity) may enter `mustInspect`, `acceptanceCriteria`, or
  `namedTargets`.
- Ambient targets are attached as optional evidence the model *may* use, never as coverage the
  verifier requires.

**Plugs into** `intent-analysis.js`, `intent-contract.js`, `intent-field-references.js`,
`intent-claim-type.js` (which already distinguishes claim types) — add provenance gating before a
target becomes required. Reuses the M9 lesson (context confused with authority) applied to intent.

**Invariant test.** With an unrelated active file open, a "set preference X" request produces a
contract whose `mustInspect`/criteria contain no file the user did not name.

## Mechanism 2 — Task-type classification + task profiles (constrained tool surface)

**Problem.** The request was a deterministic settings mutation, yet the loop seeded `list_files` and
left `glob`/`search_text`/`read_file` on the table, inviting open-ended exploration.

**Mechanism.** A deterministic **task classifier** + **task-profile registry** (`task-profiles.js`,
new) mapping a task type to its capability, allowed tool scopes, and a deterministic workflow:

```js
"preferences-update": {
  requiredCapability: "settings.change",
  allowedTools: ["preferences_search", "preferences_get", "preferences_update",
                 "request_user_input", "report_blocked"],
  deterministicWorkflow: ["resolve keys", "update values", "read back", "complete"]
}
```

**Classify from all signals, not prompt text alone.** The classifier reads: prompt shape, mode,
available tools, resolved preference descriptors, attachments, current interaction type, and
explicit user authorization. It never collapses a compound request (e.g. *"find where this
preference is implemented and then change it"* — investigation **plus** mutation) into a bare
`preferences-update`. It emits applicability + evidence, not just a label:

```js
{
  taskType: "preferences-update",
  applicability: "certain" | "uncertain" | "rejected" | "not_applicable",
  reasonCodes: [],
  conflictingSignals: []   // e.g. "investigation-verb", "multi-clause-request"
}
```

`not_applicable` is a first-class outcome distinct from failed classification. An informational
request ("Explain how preferences_update works") is not an uncertain mutation — it simply matches no
profile: `{ taskType: null, applicability: "not_applicable", reasonCodes: ["informational_request"] }`.
Separating it from `uncertain` keeps telemetry honest (classifier uncertainty vs ordinary
general-controller traffic).

- **Only `applicability: "certain"` activates a narrow profile.** `uncertain`, `rejected`, and
  `not_applicable` fall back to the general controller loop with the full read surface — fail-open
  toward capability.
- Classification is runtime-owned and deterministic, never model-chosen — mirrors the chat router.
- The profile's `allowedTools` are intersected with the existing **tool scope registry**
  (`tool-scope-registry.js`) and mode policy, so the model literally does not see discovery tools
  for a typed task unless the specialized path fails (then a bounded fallback re-widens the surface).

**What qualifies as a task profile (guardrail).** A profile exists **only** when *all* of: the task
is recognizable deterministically; a narrow capability already exists; the workflow is stable;
success is deterministically checkable; and restricting tools materially improves safety or
efficiency. Good profiles: `preferences-update`, `git-status-summary`, `export-document`,
`run-known-test`, `open-known-resource`. **Not** profiles (stay in the general controller):
`fix-bug`, `improve-architecture`, `investigate-performance`, `implement-feature`. Task profiles
are a small deterministic set, not a library of hardcoded task scripts.

**Compound requests.** When a request mixes a profile-eligible action with an open-ended clause,
the classifier returns `uncertain` with `conflictingSignals`, and the runtime either builds a
**compound profile with explicit ordered phases** (e.g. investigate → confirm target → mutate →
verify) or falls back to the general controller. It must never silently drop the non-profile clause
(e.g. discard an "…and explain where it is stored" requirement).

**Plugs into** `tool-scope-registry.js` (per-task seed sets already anticipated in the roster plan),
`companion-mode-policy.js` (task profile resolved alongside mode policy), `getAgentToolDefinitions`
(filter by the profile's tools). This is the roster-consolidation "per-task scope" made real.

**Invariant test.** A classified (`certain`) `preferences-update` request never exposes
`list_files`/`glob`/`read_file`; a general "investigate X" request keeps the full read surface; a
compound "set X and explain where it is stored" request is not narrowed to a bare mutation.

## Mechanism 3 — Action-readiness / information-sufficiency gate

**Problem.** After the first `preferences_search` resolved a real key + value + tool, the agent kept
researching. Nothing declared the task "ready to act."

**Mechanism.** A deterministic sufficiency gate evaluated every iteration:

```text
Do we know the exact target(s)?          (six keys — supplied by user)
Do we know the desired value(s)?         (true — supplied by user)
Is a capable tool available?             (preferences_update exists)
Is the task authorized?                   (yes — user asked for this outcome)
=> discovery is complete; the next decision MUST be the action (or approval / clarify / block).
```

**Two distinct authorizations — never conflated.** The user's request authorizes the task
*semantically*; the runtime approval policy decides whether *this specific action may execute now*.
The gate must not read "the user asked" as a license to bypass approval. It therefore produces:

```js
{
  status: "ready_for_action" | "ready_for_approval" | "incomplete",
  requiredAction: "preferences_update",
  missingFacts: [],
  approvalRequired: true   // from the existing approval policy, not the readiness computation
}
```

- `incomplete` → discovery may continue (bounded by Mechanism 5 / batch budget).
- `ready_for_approval` → the only permitted next step is requesting approval via the existing
  approval mechanism; discovery reads are rejected.
- `ready_for_action` → the next decision MUST be the action (or `request_user_input` /
  `report_blocked`); additional `tool_call` reads are rejected pre-execution with reason
  `discovery_disallowed_when_action_ready`.
- Sufficiency is computed from typed state (resolved targets/values), not model self-report.

**Partial resolution is all-or-nothing by default.** If some requested targets resolve and others do
not, the runtime does not silently apply the resolved subset:

```js
{ requestedKeys: 6, resolvedKeys: 5, unresolvedKeys: 1, readiness: "incomplete" }
```

While unresolved keys remain, readiness stays `incomplete`; the runtime either enters bounded
fallback to resolve the remainder (Mechanism 4) or asks the user whether to apply the resolved
subset. This prevents silent partial configuration.

**Readiness is version- and fingerprint-bound (stale-readiness protection).** An `action-ready`
verdict is stamped and revalidated immediately before execution:

```js
{
  readinessId: "ready-7",
  basedOnStateVersion: 22,
  targetFingerprint: "...",
  desiredValuesFingerprint: "...",
  requiredAction: "preferences_update"
}
```

Before the action runs, the controller reconfirms: the desired values are unchanged, user steering
has not altered scope, the preference descriptors are still current, and the approval applies to the
exact action. Any mismatch invalidates the readiness verdict (and any pending approval) and forces
recomputation — complementing the existing stale-decision protection.

**Plugs into** `agent-decision-controller.js` (as a precondition on allowed decision types), the
existing **approval policy** (`ai-agent-approval-policy`), `agent-state.js` (readiness stamp), and
`agent-completion-policy.js`. Analogous to M8/M9's deterministic gates.

## Mechanism 4 — Actually engage the typed next-action controller

**Problem.** The log had empty `decisionId`s ⇒ the run used the legacy free-form path; M4's typed
controller was not governing.

**Mechanism.** Split into two rollout steps so deterministic tasks are fixed without changing every
open-ended Agent run at once:

- **M11.4a — typed controller mandatory for classified task profiles.** Any `certain`-classified
  profile always runs through the stateful controller: every action is a typed decision with
  `decisionId`, `reason`, `expectedObservation`, `basedOnStateVersion`. Low blast radius (only
  narrowed tasks), fixes the empty-`decisionId` behavior for exactly the failing case.
- **M11.4b — general Agent controller default-on.** Promote `agentDecisionControllerEnabled` for all
  Agent runs (with a kill switch) **only after** a characterization snapshot + eval prove unchanged
  behavior on complex tasks. This is the M8.1-level change and gets its own rollout decision.
- In both, remove/curtail the **auto-seeded initial `list_files`** for typed tasks; initial
  discovery becomes a decision the controller may make, not a hardcoded prelude.

**Plugs into** `companion-mode-policy.js` (default flags), `agent-tool-loop.js` (drop the forced
initial discovery when a task profile supplies a workflow), `agent-decision-controller.js`.

**Invariant test.** Every executed action in a stateful run carries a non-empty `decisionId`; no
`list_files` runs before the first typed decision on a typed task.

### Specialized-path fallback (precise trigger)

Re-widening the tool surface is necessary but must be a **runtime transition on defined conditions
only** — never merely because the model says it wants more context. Allowed triggers:

```text
- a requested key cannot be resolved
- the specialized tool reports an unsupported capability
- results are contradictory
- the user explicitly asks for implementation investigation
- a deterministic workflow invariant fails
```

Emitted as a bounded, auditable event:

```js
{
  eventType: "task_profile_fallback_requested",
  fromProfile: "preferences-update",
  reasonCode: "unresolved_preference_key",
  allowedAdditionalScopes: ["workspace.search", "workspace.read"],
  boundedActions: 3
}
```

**Fallback is irreversible within a run.** Once a profile widens to the general controller, it does
not automatically narrow again in the same run — otherwise the system oscillates
`profile → fallback → profile → fallback`. Profile status is tracked and monotonic toward
termination:

```js
{ profileStatus: "active" | "fallback_active" | "completed" | "failed", fallbackCount: 1 }
```

After fallback, the run stays in the widened controller until it terminates or the user issues an
explicit new request.

## Mechanism 5 — Task-relative progress / no-progress enforcement (engage M6)

**Problem.** Source-searching an already-resolved preference, re-running `preferences_search`, and
globbing conversion files added no task information but continued.

**Mechanism.** Engage M6 progress control with **task-relative strategy signatures**:

```text
Once a target is resolved through its authoritative tool (preferences_search),
re-deriving it via source search / repeated search counts as no_progress.
```

- After N no-progress actions, force a typed strategy revision; if the task is already action-ready,
  the only permitted revision is "execute the action."

**Bounded, batch-first resolution.** The objective is not merely "no source reads" — it is bounded,
efficient execution. The profile prefers group/batch lookup and caps per-key work:

```text
Resolve all requested keys through the smallest bounded number of calls.
Prefer group/batch lookup when available.
Budget: at most one namespace/group search plus one fallback lookup per unresolved key.
```

Exceeding the budget is a no-progress signal (and a candidate fallback trigger, not a license to
keep searching).

**Plugs into** `agent-progress-evaluator.js`, `agent-progress-policy.js`, `agent-strategy-signature.js`
(add task-relative signatures), gated by `agentProgressControlEnabled`.

## Mechanism 6 — Deterministic execution plans for known task types

**Problem.** With no explicit plan, the model never knew what "enough investigation" looked like.

**Mechanism.** For classified task types, the **task profile supplies a deterministic workflow** (no
extra model call). Completion is measured against that workflow (resolve → update → read back →
verify), not against open-ended judgment. Unknown task types fall back to the general M4–M6 loop.

**Workflow lives in typed state — one shared source of truth.** The readiness gate, progress
controller, verifier, checkpoint system, and final-response composer all read the same object rather
than each re-deriving "where are we":

```js
{
  profileId: "preferences-update",
  workflowVersion: 1,
  steps: [
    { id: "resolve", status: "pending" },
    { id: "update",  status: "pending" },
    { id: "verify",  status: "pending" }
  ],
  activeStepId: "resolve"
}
```

**Only the reducer advances steps.** Step transitions are earned from authoritative events, never
declared by the model through decision metadata:

```text
resolve -> completed   only after the reducer accepts evidence that every requested key resolved
update  -> completed   only after an accepted preferences_update observation
verify  -> completed   only after read-back verification succeeds
```

Invariant: **only reducer-owned observation and verification events may advance workflow steps.** A
model decision that claims a step is done without the backing event is rejected.

**Profiles and workflows are versioned.** State carries `{ profileId, profileVersion, workflowVersion }`.
A checkpoint recovered under an incompatible `profileVersion`/`workflowVersion` must not resume
blindly — it revalidates against the current profile or falls back safely (Mechanism 4 fallback).

**Plugs into** `task-profiles.js`, `agent-state.js` (workflow-step slice + reducer), `agent-completion-policy.js`,
and the M7 checkpoint/recovery path (version compatibility check on resume).

### Read-back verification (persisted values, not tool success)

A successful `preferences_update` response is evidence, not proof. The final acceptance criterion
requires read-back of the authoritative preference state for **every** requested key:

```js
{ requestedValue: true, observedValue: true, source: "preferences_get", verified: true }
```

If read-back returns a different value (persistence failed, or normalization changed it),
verification fails and no success response is emitted. Reuses the M5 verifier + the M11 workflow
`verify` step.

## Mechanism 7 — Observation→state projection + context budget

**Problem.** ~384k sent tokens for a one-action task: raw search output (including plan docs and
binary matches) accumulated into context instead of being distilled into state.

**Mechanism.**

- **Project tool results into typed state**, not raw conversation: a `preferences_search` result
  updates `{ resolvedKeys, requestedKeysResolved, nextRequiredAction }`; the raw payload is dropped
  after projection.
- The **state-based context builder** (M3) rebuilds each turn's context from typed state + bounded
  evidence, retaining only: requested keys/values, resolved descriptors, the update-tool schema, and
  the latest result — never accumulated tool history.
- Broad-search results exclude irrelevant matches (plan docs, binaries) — but for typed tasks broad
  search is unavailable anyway (Mechanism 2), so this mainly bounds the general path.

**Plugs into** `agent-observation-normalizer.js`, `agent-context-builder.js`, `agent-state.js`.

**Invariant test.** A typed preferences task completes within a small token budget; context size does
not grow per no-op action.

## How M11 composes with M0–M9

M11 adds no parallel stack. It parameterizes and *engages* the existing controller:

- Intent boundary → sharpens the M1/M2 intent phase.
- Task profiles → extend the M9 tool-scope-registry with per-task seed sets + the mode-policy seam.
- Action-readiness + progress + deterministic plans → new preconditions inside the M4 decision
  controller, M5 completion policy, and M6 progress control (engaging flags that already exist).
- Observation projection + context budget → the M3 context builder and observation normalizer.

## Implementation order

```text
M11.1  Intent provenance boundary (ambient != requirement) + tests.
M11.2  Multi-signal task classifier (applicability/reasonCodes/conflictingSignals) +
       task-profiles registry; wire tool-surface restriction via tool-scope-registry /
       mode policy; remove forced initial list_files for typed tasks; fallback trigger event.
M11.3  Action-readiness gate: task-authorization vs execution-approval; ready_for_action /
       ready_for_approval / incomplete; discovery_disallowed_when_action_ready.
M11.4a Typed controller mandatory for classified task profiles (decisionId on every action).
M11.5  Task-relative progress signatures + batch-first budget + no-progress replan (engage M6).
M11.6  Workflow-step state + deterministic completion + read-back verification.
M11.7  Observation->state projection + context-budget enforcement.
M11.8  Rollout, eval (reuse M0/M10 harness), and the preferences-update golden case.
M11.4b General Agent controller default-on — separate rollout, gated on a characterization
       snapshot proving unchanged behavior on complex tasks.
```

## Acceptance criteria (golden case: "set six preferences to true")

- No `list_files`/`glob`/`read_file`/source search runs; only `preferences_search`/`get`/`update`.
- The active file never becomes a requirement.
- Exactly one `preferences_update` with all six full paths, then a read-back verification.
- Every action carries a `decisionId`; the run reaches a terminal state (not cancelled mid-flight).
- Token usage bounded (target: low thousands, not hundreds of thousands).
- General coding investigations are unaffected (full read surface, M4–M6 loop) — proven by the
  existing corpus showing no regression.

## Adversarial / regression tests

```text
Polluted-context     Active file payment-service.js; "Set autocompleteEnabled to true"
                     => payment-service.js absent from mustInspect/namedTargets/criteria/workflow.

Model resistance     Action-ready; model proposes search_text("preferences_update")
                     => decision rejected pre-execution, reason discovery_disallowed_when_action_ready.

False-positive       "Explain how preferences_update works"
profile              => NOT classified as a mutation; no settings-write capability exposed.

Mixed request        "Set X to true and explain where it is stored"
                     => compound profile with ordered phases, OR general controller;
                        the explanation requirement is never silently dropped.

Read-back mismatch    update reports success but read-back returns false
                     => verification fails; no success response emitted.

Steering after       Resolve 6 prefs -> ready_for_approval; user: "leave durable recovery
readiness            disabled" => prior readiness/approval goes stale; readiness recomputed
                     for five true + one false; only the updated action may execute.

Reducer-only steps   Model decision claims resolve->completed without a backing observation
                     => step advance rejected.

No fallback oscill.   After fallback_active, the run does not auto-narrow back to the profile
                     within the same run.
```

## Implementation status

- **M11.1 — Intent provenance boundary: implemented (flag `intentProvenanceBoundaryEnabled`,
  default-off).** `core/intent-provenance.js` demotes ambient-only editor context (active file /
  open tabs) out of `namedTargets.files` and every criterion's `mustInspect` unless the user named
  it or an observation confirmed it. Wired at the single choke point in
  `intent-analysis.extractContractWithDeadline`. Pure, non-mutating. Tests:
  `ai-companion-intent-provenance.test.js` (9, incl. the polluted-context golden case).
- **M11.2 — Task classifier + task-profiles registry: implemented (flag
  `taskProfileRoutingEnabled`, default-off).** `core/task-classifier.js` emits
  `{taskType, applicability(certain|uncertain|rejected|not_applicable), reasonCodes,
  conflictingSignals}` from multi-signal input; `core/task-profiles.js` holds the versioned
  registry (`preferences-update`, `git-status-summary`) with allow-lists, taskScopes, workflow
  templates, fallback-event builder, and version-compatibility check; `core/task-routing.js` ties
  them to the flag; `getAgentToolDefinitions` honors a `taskProfileToolNames` narrowing. Tests:
  `ai-companion-task-profiles.test.js` (12), `ai-companion-task-routing.test.js` (4).
- **M11.3 — Action-readiness gate: implemented.** `core/action-readiness.js` computes
  `ready_for_action | ready_for_approval | incomplete` from typed state, keeps semantic
  task-authorization separate from runtime execution-approval, enforces all-or-nothing partial
  resolution, and stamps a version+fingerprint-bound readiness verdict with `revalidateReadiness`
  (stale-readiness protection, incl. the steering-after-readiness case). Tests:
  `ai-companion-action-readiness.test.js` (10).
- **M11.4a — readiness precondition in the typed controller: implemented.**
  `agent-decision-controller.validateActionReadinessConstraint` rejects any discovery `tool_call`
  once state carries an actionable readiness verdict (`discovery_disallowed_when_action_ready`),
  while permitting the required action and control decisions; no-op when no verdict is present, so
  legacy runs are unaffected. Tests added to `ai-companion-agent-decision-controller.test.js`.
- **M11.5 — task-relative progress + batch budget: implemented.** `core/task-progress.js`
  classifies re-deriving a resolved target (source search / repeated search) as no-progress and
  enforces a per-key batch-lookup budget (one group search + one fallback). Tests:
  `ai-companion-task-progress.test.js` (7).
- **M11.6 — workflow reducer + read-back verification: implemented.** `core/workflow-progression.js`
  advances a step only from a reducer-sourced accepted observation/verification (a model claim
  cannot self-certify: `model_cannot_advance_steps`), and verifies persisted values by read-back
  (`preferences_get`), failing on any mismatch or missing key even when the update "succeeded".
  Tests: `ai-companion-workflow-progression.test.js` (8).
- **M11.7 — observation projection + context budget: implemented.**
  `core/task-observation-projection.js` projects tool results into compact typed state (resolved
  keys, truncated descriptors, read-back values), drops raw payloads and ambient hits, and rebuilds
  a bounded per-turn context that does not grow across no-op observations. Tests:
  `ai-companion-task-observation-projection.test.js` (6).
- **State-session reducer slice: implemented.** `agent-state.js` now carries a `taskProfile` /
  `actionReadiness` slice driven by two reducer events — `task_profile_seeded` and
  `task_profile_updated`. The reducer projects each accepted observation into compact task state,
  advances workflow steps reducer-only (model claims cannot), and recomputes the readiness verdict,
  so `state.actionReadiness` is what the M11.4a controller precondition reads. The full golden
  preferences flow (seed → resolve → ready → approval → update → read-back verify → completed) is
  covered end-to-end at the reducer level in `ai-companion-agent-state.test.js`; legacy runs get a
  null slice and are unaffected.
- **Live-loop emission: implemented (flag `taskProfileRoutingEnabled`, default-off, controller +
  agent only).** `agent-tool-loop.js` resolves the profile at run start, restricts the exposed tool
  surface to the profile allow-list, emits `task_profile_seeded`, and emits `task_profile_updated`
  from each accepted preferences observation. `core/task-preference-bridge.js` parses explicit
  fully-qualified keys + a desired value from the prompt and derives the reducer observation from
  live `preferences_search`/`get`/`update` results — degrading safely (an unrecognized result shape
  resolves nothing, so readiness stays incomplete and no action is forced). Proven end-to-end
  through the real loop in `ai-companion-task-profile-loop.test.js`: with the flag on and an
  explicit-keys prompt the first exposed tool surface excludes `glob`/`read_file`/`search_text` and
  the reducer slice is seeded; with the flag off the legacy surface is intact and no slice is
  created. Bridge derivation tested in `ai-companion-task-preference-bridge.test.js`.
- **Only-remaining depth:** requested keys/values are parsed deterministically only when the user
  states fully-qualified paths + an unambiguous value; fuzzy prompts still restrict tools and track
  the workflow but leave readiness `incomplete` (safe). Broadening key resolution (mapping fuzzy
  user terms to keys) and adding more profiles are additive follow-ups.
- **M11.4b — general controller default-on:** unchanged; separate rollout gated on a
  characterization snapshot.

## Guiding principle

```text
The model chooses among permitted next actions,
but the runtime determines when discovery is no longer permitted.
```

## Risks

- Over-narrow task classification could starve a legitimately complex request — mitigate with a
  bounded fallback that re-widens the tool surface when the specialized path fails, and with the
  action-readiness gate permitting `report_blocked`/`request_user_input`.
- Engaging the controller by default is the highest-risk change (mirrors M8.1); require a
  characterization snapshot proving unchanged behavior for complex tasks before promotion.
