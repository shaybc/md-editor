# M6 — Progress Detection, Strategy Replanning, and Execution Budgets

## Summary

M6 adds an Agent-only progress controller over M1–M5:

1. Classify whether completed actions advanced the active intent.
2. Detect repeated actions and semantically repeated strategies.
3. Require a materially different strategy when progress stalls.
4. Stop honestly when the replan budget is exhausted.

M6 never satisfies acceptance criteria, authorizes success, or overrides M5 verification.

Rollout order:

1. Add state, signatures, and deterministic policy.
2. Add the narrow semantic evaluator.
3. Collect shadow assessments without affecting execution.
4. Validate accuracy and false-positive rates.
5. Enable enforcement behind an internal default-off flag.
6. Defer visible settings until progress control ships to normal Agent runs.

## Interfaces and state

### AgentState v5

Add:

```js
progress: {
  policyVersion: 1,
  mode: "off" | "shadow" | "enforce",
  progressEpoch: 0,
  strategyRevision: 0,

  stallScore: 0,
  consecutiveInconclusive: 0,

  replanRequired: false,
  replanAttemptCount: 0,
  acceptedReplanCount: 0,

  recentAssessments: [],
  recentStrategies: [],
  blockedActionSignatures: [],
  blockedStrategySignatures: [],

  budgets: {
    noProgressThreshold: 3,
    maxStrategyReplans: 2
  },

  terminalReason: null
}
```

Add reducer-owned events:

- `progress_recorded`
- `replan_required`
- `replan_attempted`
- `strategy_revised`
- `progress_budget_exhausted`

Write v5 snapshots while retaining v1–v4 compatibility.

### Progress assessment contract

```js
{
  status: "meaningful" | "no_progress" | "inconclusive",
  source: "deterministic" | "semantic-evaluator",

  decisionId: "string",
  observationId: "string",
  intentId: "string",

  basedOnStateVersion: 42,
  progressEpoch: 3,
  strategyRevision: 1,

  reasonCode: "string",
  evidenceIds: ["string"],

  actionSignature: "sha256",
  strategySignature: "sha256"
}
```

Reject the result unless all identifiers and freshness bindings still match current AgentState. Progress assessments cannot update criteria, completion, evidence admissibility, or intent status.

## Progress classification

### Deterministic precedence

Classify as `meaningful`:

- Successful non-empty mutation accepted by existing controls.
- Independently verified state change.
- Accepted contract amendment.
- Resolved clarification providing required information.
- New validation evidence that directly matches the expected observation.

Classify as `no_progress`:

- Denied, skipped, or no-op action.
- Unchanged non-retryable failure.
- Exact repeated action in the same progress epoch.
- Repeated unchanged validation result.
- Action whose strategy is already blocked for the current stall episode.

Cancellation remains cancellation rather than progress evidence.

Send ambiguous successful reads, searches, commands, tests, partial results, and novel failures to the semantic evaluator.

### Weighted stall accumulation

Use:

```js
meaningful:   reset stall state
no_progress:  +1.0 stall score
inconclusive: +0.5 stall score
```

Require replanning when any condition is met:

- `stallScore >= 3`.
- Five consecutive `inconclusive` assessments.
- Exact `A → B → A → B` oscillation without meaningful progress.
- A third proposal using the same stalled strategy signature.
- Two consecutive rejected attempts to execute a blocked action or strategy.

Meaningful progress:

- Increments `progressEpoch`.
- Resets `stallScore` and `consecutiveInconclusive`.
- Clears obsolete action and strategy blocks.

An accepted strategy revision resets the current stall window but does not reset the request-wide replan budget.

### Semantic evaluator

The evaluator receives only:

- Active intent and relevant acceptance criterion.
- Decision rationale and expected observation.
- Normalized observation.
- Bounded relevant artifact excerpt.
- Recent strategy summaries and identifiers.

It does not receive the full conversation or unrelated artifacts.

Use temperature `0`, a small fixed response limit, one structured-output repair, and deterministic `inconclusive` fallback. Evaluator results cite existing evidence IDs and cannot create facts or state patches.

## Action and strategy repetition

### Exact action signature

Hash:

```text
tool name + canonical sanitized arguments
```

This prevents literal repetition while avoiding raw argument storage in state or telemetry.

The same action becomes eligible again after `progressEpoch` changes. Therefore:

```text
read config
edit config
read config again
```

is valid because the edit established meaningful progress.

### Normalized strategy signature

Represent:

```js
{
  intentId,
  strategyClass,
  targetScope,
  conceptClusterId
}
```

Supported strategy classes initially include:

- `search_concept`
- `read_neighboring_files`
- `trace_symbol_references`
- `inspect_failure`
- `rerun_validation`
- `edit_target`
- `verify_state`
- `other`

Determine class and target scope deterministically from the tool-effect registry and sanitized arguments.

When differently worded proposals share an intent, strategy class, and target neighborhood, use the narrow evaluator to decide whether they are semantically equivalent. It returns either:

```js
{ equivalentToStrategyId: "strategy-2" }
```

or:

```js
{ equivalentToStrategyId: null }
```

Equivalent proposals reuse the earlier strategy signature. This groups sequences such as:

```text
search "token validation"
search "validate token"
search "authentication token check"
```

without treating every changed query string as a new strategy.

The evaluator is called only when deterministic comparison cannot establish equivalence.

## Forced replanning

Replanning remains part of the next normal decision call.

Extend `_decision` metadata:

```js
{
  strategyRevision: 2,
  replan: {
    triggerAssessmentIds: ["progress-7"],
    abandonedApproach: "Searching filenames related to token validation",
    revisedApproach: "Trace callers of the token verification entry point"
  }
}
```

When replanning is required:

- `strategyRevision` must equal the current revision plus one.
- Trigger IDs must match the current stall episode.
- The abandoned approach must identify the blocked strategy.
- The new action and strategy signatures must not be blocked.
- `propose_completion`, justified `request_user_input`, and structurally supported `report_blocked` remain permitted.

### Material-difference validation

First reject deterministically when:

- Normalized old and new approaches are equal.
- One merely adds filler such as “again,” “more,” or “carefully.”
- Token-set similarity is at least `0.8` while strategy class and target scope remain unchanged.
- The proposed strategy signature matches a blocked signature.

For ambiguous revisions, use the narrow evaluator:

```js
{
  materiallyDifferent: true,
  reasonCode: "changed_from_filename_search_to_reference_trace"
}
```

The comparison receives only the old strategy, proposed strategy, relevant intent, and signature metadata.

Each forced-replan opportunity permits one corrected decision after rejection. If both proposals fail material-difference validation, the replan attempt is unsuccessful and consumes one replan-budget entry. `strategyRevision` increments only after an accepted replan.

## Budgets and termination

Use hidden normalized settings during M6:

- `agentNoProgressActionLimit`: default `3`, range `1–10`.
- `agentMaxStrategyReplans`: default `2`, range `0–10`.

They are intentionally absent from the settings UI until progress enforcement is available to normal Agent runs.

The budgets are request-scoped and do not reset after user-approved task continuation. Preserve existing behavior for:

- `maxTasksPerChat`
- `maxTokensPerChatMinute`
- `agentMaxResponseTokens`
- `intentMaxCompletionRevisions`

When another replan is required after the budget is spent, M5 records:

```js
{
  status: "budget_exhausted",
  reasonCodes: ["no_progress_budget_exhausted"]
}
```

The final response reports the unproductive actions, attempted strategy revisions, and unresolved criteria without claiming success or incorrectly labeling the run as a technical failure.

## Shadow-first rollout

Add internal flags:

- `agentProgressEvaluationEnabled`, default `false`.
- `agentProgressControlEnabled`, default `false`.

Evaluation requires Agent mode, intent contracts, M4 controller mode, and authoritative AgentState. Enforcement additionally requires M5 verifier-owned completion.

In shadow mode:

- Record progress and strategy assessments.
- Record would-reject, would-replan, and would-terminate decisions.
- Do not alter provider decision context.
- Do not reject actions or strategies.
- Do not force replanning or terminate.
- Skip semantic shadow evaluation when its isolated evaluation allowance is unavailable.
- Keep evaluator failures telemetry-only.

In enforce mode:

- Project progress state and remaining budgets into decision context.
- Apply duplicate, oscillation, strategy, replan, and termination rules.
- Count semantic-evaluator usage through existing usage reporting and token controls.

Emit only IDs, reason codes, signature hashes, counters, latency, token use, and proposed control action. Never emit raw arguments, artifact contents, prompts, or hidden reasoning.

## Test plan and acceptance criteria

Test:

- Every deterministic classification and semantic-evaluator fallback.
- Weighted accumulation for three `no_progress`, mixed statuses, and five consecutive `inconclusive`.
- Freshness rejection when state version, progress epoch, strategy revision, intent, decision, or observation changes.
- Exact action repetition blocked within an epoch.
- `read → edit → same read` allowed after epoch advancement.
- Action-level and strategy-level `A → B → A → B` oscillation.
- Semantically equivalent token-validation searches grouped into one stalled strategy.
- Legitimately different search strategies remain distinct.
- Deterministic rejection of superficial replan wording.
- Semantic acceptance and rejection of ambiguous strategy revisions.
- Failed replan validation consumes only the appropriate replan attempt.
- Default two-attempt replan budget and honest exhaustion.
- Valid completion during a stall still succeeds only through M5.
- Shadow mode preserves executed tools, controller decisions, completion, and final content.
- Existing action, token, continuation, approval, security, and completion-revision behavior remains unchanged.
- Snapshot v1–v4 reads and v5 writes.
- Frontend/backend hidden-setting normalization parity.
- Chat, Plan, Autocomplete, Git Summary, provider/model tests, and specialized AI flows never activate M6.

Evaluation must report:

- Meaningful/no-progress/inconclusive precision and recall.
- Strategy-equivalence precision and recall.
- False stall and premature-replan rates.
- Duplicate and oscillation detection.
- Replan acceptance, rejection, recovery, and exhaustion.
- Unproductive actions avoided versus M5.
- Evaluator calls, repairs, failures, latency, and tokens.
- Task pass and false-completion rates.

Enforcement requires:

- At least 95% progress-classification precision.
- At least 90% progress-classification recall.
- At least 95% strategy-equivalence precision.
- All deterministic duplicate and oscillation scenarios detected.
- Zero premature stops in the deterministic success corpus.
- No reduction in deterministic task pass rate versus M5.
- No run exceeding its replan budget.
- Full desktop test suite passing.
- Protected and specialized AI modes unchanged.

## Expected files to change:

- [agent-progress-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-progress-policy.js) — weighted stall policy, thresholds, and control decisions.
- [agent-progress-evaluator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-progress-evaluator.js) — narrow progress, strategy-equivalence, and replan-difference evaluations.
- [agent-strategy-signature.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-strategy-signature.js) — action and strategy canonicalization, hashing, and deterministic comparison.
- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js) — AgentState v5 and progress/replan transitions.
- [agent-decision-controller.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-decision-controller.js) — replan metadata and pre-execution action/strategy validation.
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js) — shadow evaluation, enforced control, and budget termination.
- [agent-context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-context-builder.js) — enforced-mode progress and budget projection.
- [agent-final-response-composer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-final-response-composer.js) — honest progress-budget reporting.
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js) — feature dependencies and Agent-only activation.
- [headless defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js) and [browser settings](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js) — hidden flags and threshold normalization.
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js) — v5 terminal-snapshot compatibility only.
- [agent progress tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-progress.test.js), [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js), and [decision-controller tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-decision-controller.test.js) — policy, freshness, signature, replan, and integration coverage.
- [progress settings tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-progress-settings.test.js) and [mode-boundary tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js) — hidden-setting parity and isolation.
- [evaluation runner](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-mode-runner.js) and [progress scenarios](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/progress-scenarios.json) — shadow/enforced comparison and activation metrics.

## Assumptions and unchanged areas

- M0–M5 are prerequisites.
- M5 remains the sole authority for criteria satisfaction, semantic success, and final-response facts.
- M7 owns persistence and recovery of non-terminal runs.
- M8/M9 own Plan and Chat adoption.
- Visible progress controls are deferred until enforcement is available to ordinary Agent users.
- Tools, permissions, security, mutation control, providers, and specialized AI workflows remain unchanged.
- No unrelated refactoring, renaming, formatting, or UI redesign is included.

The defining invariant is:

```text
M6 may decide whether an action advanced the active intent and may require
a strategy change or bounded non-success termination.

M6 may never satisfy acceptance criteria, authorize success,
or override M5 verification.
```
