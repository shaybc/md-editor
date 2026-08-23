# M5 — Verifier-Owned State and Runtime-Owned Completion

## Summary

Revise M5 to incorporate all five review recommendations.

For controller-enabled Agent runs:

```text
Completion proposal
→ AgentCompletionOrchestrator
→ bounded verification request
→ existing isolated assessor
→ typed verification result
→ AgentState reducer
→ deterministic completion policy
→ semantic outcome
→ state-grounded final response
```

The defining invariant is:

```text
No Agent run may enter semantic success unless the runtime accepts
a fresh verification result for the exact current contract, evidence,
proposal, and completion attempt.

The final response may claim only facts represented by that accepted state.
```

Chat, Plan, Git Summary, Autocomplete, connection tests, and specialized AI components remain unchanged.

## Contracts and State

### Completion-attempt identity

Create `completionAttemptId` when an accepted M4 `propose_completion` decision enters verification.

- One proposal may have multiple verifier invocations under the same attempt.
- Each invocation receives a unique `verificationId`.
- Attempt identity appears in the verification request, result, gate decision, state transitions, telemetry, and final response projection.
- A terminal or superseded attempt cannot accept later results.
- Only one completion attempt may be active.

### Verification freshness

Add `verificationContextVersion` to AgentState alongside global `stateVersion`.

Global `stateVersion` continues incrementing for every accepted transition. `verificationContextVersion` increments only for events that can change verification truth:

- Intent contract creation, correction, clarification, or replacement.
- Any unrelated decision lifecycle transition after verification begins.
- Action start or completion.
- New normalized tool observation.
- Approval or clarification request/resolution.
- Steering revision.
- Changed-file/run-summary projection.
- Run failure or cancellation.

These do not increment it:

- Current completion-attempt bookkeeping.
- Recording or rejecting the result derived from that attempt.
- Completion-gate projection.
- Final-response projection.
- Usage, debug, narration, title, timing, or other telemetry.
- Snapshot delivery or diagnostic counters.

The verification request captures:

- `basedOnStateVersion` for auditing.
- `basedOnVerificationContextVersion` for freshness.
- `contractFingerprint`.
- `evidenceVersion` and `evidenceFingerprint`.
- `completionAttemptId`, `verificationId`, and `proposalDecisionId`.

The reducer accepts a result only when all freshness identifiers still match.

### Evidence snapshot

Do not send the complete evidence ledger to the verifier.

Build a deterministic bounded snapshot containing:

- Every existing evidence ID cited by the completion proposal, up to the existing 50-ID proposal limit.
- Candidate-response evidence only for response-content or mixed criteria.
- Up to 20 relevant entries per criterion, selected through the existing relevance and claim-type rules.
- Required correction/reference-check evidence.
- Failed or denied evidence needed to explain blockers.
- At most 120 distinct entries across the request.

Selection order is:

1. Proposal-cited relevant evidence.
2. Exact named-target matches.
3. Independently confirmed evidence.
4. Remaining relevant evidence, newest first.

Each criterion carries `relevantEvidenceIds`; the request carries the deduplicated entries.

If relevant evidence exceeds a cap, mark the affected criterion `evidenceSelectionTruncated`. That criterion cannot be accepted as satisfied and receives `evidence_scope_overflow`. Nothing is silently omitted while still permitting success.

The evidence ledger gains:

- `evidenceVersion`, incremented only when an entry is inserted or materially replaced.
- Exact-ID lookup.
- Canonical snapshot fingerprinting over the complete normalized ledger metadata.
- Deterministic relevant-snapshot selection.

New evidence invalidates an in-flight result even when it was not selected for the bounded request. Duplicate evidence that leaves the ledger unchanged does not.

### Verification result

Use evidence status independently from runtime termination policy:

```js
{
  schemaVersion: 1,
  runId,
  completionAttemptId,
  verificationId,
  proposalDecisionId,
  basedOnStateVersion,
  basedOnVerificationContextVersion,
  contractFingerprint,
  evidenceVersion,
  evidenceFingerprint,
  verificationStatus:
    "satisfied" |
    "unsatisfied" |
    "provisional" |
    "unverified",
  criteria: [{
    id,
    status:
      "satisfied" |
      "unsatisfied" |
      "provisional" |
      "unverified",
    evidenceRefs: [],
    reasonCodes: [],
    explanation: ""
  }],
  blockers: [{
    type,
    criterionId,
    evidenceRefs: [],
    recoverable,
    requiredAction
  }],
  unresolvedIssues: [],
  reasonCodes: [],
  diagnostics: {}
}
```

- `blocked` is not a verifier status.
- Existing arbiter classifications populate `blockers` and reason codes.
- The completion policy decides whether blockers mean continue, clarification, or blocked termination.
- Confidence, if retained for evaluation, is diagnostic only.
- Missing criteria, duplicate IDs, unknown evidence, invalid statuses, or contradictory results use the existing bounded repair followed by deterministic unsatisfied fallback.

### AgentState v4

Keep technical lifecycle separate from semantic completion:

```js
{
  verificationContextVersion,
  verification: {
    activeAttempt,
    latestResult,
    history,
    acceptedCount,
    rejectedCount,
    staleCount
  },
  completion: {
    status:
      "running" |
      "verifying" |
      "rejected" |
      "succeeded" |
      "blocked" |
      "provisional" |
      "unverified" |
      "budget_exhausted" |
      "failed" |
      "cancelled",
    completionAttemptId,
    proposalDecisionId,
    verificationId,
    reasonCodes,
    unresolvedIssues,
    finalResponse
  }
}
```

Add reducer events:

- `completion_attempt_started`
- `completion_attempt_superseded`
- `verification_result_recorded`
- `verification_result_rejected`
- `completion_accepted`
- `completion_rejected`
- `completion_terminated`
- `final_response_recorded`

Only the reducer updates criterion, verification, completion, or semantic-outcome state.

## Implementation Changes

### Completion orchestration

Add one narrow `AgentCompletionOrchestrator` responsible only for:

```text
accepted proposal
→ start attempt transition
→ build verification request
→ invoke existing assessor
→ apply typed result
→ invoke completion policy
→ apply semantic transition
→ invoke final composer
```

It must not own evidence admissibility, reducer rules, tool execution, response-rewrite internals, or UI projection.

The existing completion assessor remains the verifier. A pure completion-policy module is shared by the orchestrator and reducer so safety rules cannot drift.

### Freshness and retries

After verification returns:

- Non-material telemetry leaves the result fresh.
- Any verification-context, contract, or evidence version mismatch rejects it as stale.
- Cancellation or user/intent/proposal changes supersede the attempt and require a new decision.
- If only new completed evidence appeared, no action remains pending, and the proposal is still current, permit one retry under the same `completionAttemptId` with a new `verificationId`.
- No attempt receives more than two verifier invocations.
- A second stale result supersedes the attempt and returns to normal Agent decision-making.
- Invalid assessor output repair remains internal to one verifier invocation and does not create another completion attempt.

### Completion policy

Success requires all of the following:

- Active run with no cancellation or failure.
- Current, non-superseded completion attempt and proposal.
- Fresh reducer-accepted verification result.
- `verificationStatus === "satisfied"`.
- Every required criterion represented exactly once and satisfied.
- All cited evidence exists and is admissible.
- No evidence-selection overflow.
- No pending action, approval, or clarification.
- No unresolved blocking ambiguity or blocker.
- Verified contract rather than provisional or unverified.
- Reducer acceptance of `completion_accepted`.

Policy outcomes:

- Satisfied and gate-valid → `succeeded`.
- Unsatisfied and recoverable → `completion_rejected`, then existing steering.
- Ambiguity/specification blocker → existing clarification route.
- Unrecoverable environmental blocker → `blocked`.
- Provisional/unverified result → matching honest non-success outcome.
- Token/action limit → `budget_exhausted`.
- Runtime/provider failure → `failed`.
- Cancellation → `cancelled`.

M5 does not introduce retry strategy, no-progress detection, replanning, or new budget policy; those remain M6.

### Final response precedence

The final response obeys:

```text
Authoritative AgentState facts
> accepted evidence
> accepted verification result
> proposal wording
```

The proposal is a drafting hint, never authoritative output.

Build a deterministic `FinalResponseViewV1` from state containing:

- Semantic outcome and terminal reason.
- Satisfied and unsatisfied criteria.
- Changed files and attempted/blocked changes.
- Validation and test evidence.
- Remaining issues and required user actions.
- Allowed evidence-backed factual claims.

An isolated composer may rewrite the proposal against this view, but:

- Factual sections are generated from the view.
- Unsupported file, test, validation, or success claims are rejected.
- Contradictory proposal wording is rewritten, not appended with a correction.
- Invalid composer output falls back to a deterministic state-generated response.
- `final_response_recorded` is accepted once before technical run completion.

### Compatibility and observability

- Add internal `agentVerifierCompletionEnabled`, default `false`, with no visible setting.
- Require Agent mode, M4 controller mode, an authoritative state session, intent contracts, and completion assessment.
- Preserve the current `completion-assessment` event as an already-accepted state projection.
- Emit content-limited attempt, verification, and completion events with IDs, versions, status, reason codes, duration, retry count, and evidence counts.
- Never emit proposal content, evidence payloads, malformed assessor output, or hidden reasoning.
- Read persisted AgentState v1–v3 snapshots and write v4.
- Preserve the entire M5-off branch.

## Test Plan and Acceptance Criteria

Test:

- Non-material usage telemetry during verification does not stale the result.
- New evidence, steering, clarification, intent amendment, action, approval change, failure, or cancellation does stale it.
- Global `stateVersion` may change without changing `verificationContextVersion`.
- Evidence version changes only for material ledger changes.
- Bounded selection is deterministic and overflow cannot produce success.
- Verifier status never directly chooses blocked termination.
- Attempt and verification IDs prevent cross-attempt, duplicate, and late-result application.
- One eligible stale retry remains in the same attempt; a second stale result supersedes it.
- Unsupported confident completion prose is rejected.
- Provisional, unverified, failed, denied, skipped, truncated, irrelevant, and superseded evidence cannot establish success.
- Pending work or interaction prevents success.
- Reducer validation rejects forged `completion_accepted` events.
- Proposal facts conflicting with state are rewritten or replaced by deterministic output.
- Exactly one semantic terminal transition and final response are recorded.
- Technical completion remains distinct from semantic success.
- M5-off Agent behavior remains unchanged.
- Chat, Plan, and specialized components never activate or import the M5 orchestrator.

Evaluation must report:

- Completion attempts and proposals.
- Verification requests per completion attempt.
- Stale verification retry rate.
- Accepted, rejected, fallback, and stale results.
- Gate outcomes and reason codes.
- False-completion and false-incomplete rates.
- Unsupported response-claim rate.
- Duplicate-finalization rate.
- Verification latency and token usage.

M5 exits only with:

- Zero successful runs lacking a fresh accepted verification result.
- Zero stale, provisional, unverified, invalid, or superseded results producing success.
- Zero authoritative state writes outside the reducer.
- Zero unsupported deterministic-corpus claims in successful responses.
- Zero duplicate semantic outcomes or final responses.
- Lower false-completion rate than M4 without lowering deterministic task pass rate.
- Verification requests per attempt normally close to one, with stale retries explained by relevant transitions.
- Full desktop unit suite passing.
- Protected modes and specialized components unchanged.
- Feature flag still default-off.

## Expected files to change:

- [agent-completion-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-completion-orchestrator.js) — completion-attempt orchestration.
- [agent-completion-policy.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-completion-policy.js) — pure gate and semantic-outcome policy.
- [agent-final-response-composer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-final-response-composer.js) — state-grounded response view, validation, and fallback.
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js) — invoke the orchestrator and type controller-enabled exits.
- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js) — AgentState v4, verification-context versioning, and reducer transitions.
- [agent-state-shadow.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state-shadow.js) — explicit authoritative transitions and UI-projection separation.
- [agent-context-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-context-builder.js) — bounded rejected-verification feedback.
- [completion-assessment.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/completion-assessment.js) — typed result mapping over the existing verifier.
- [completion-evidence-ledger.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/completion-evidence-ledger.js) — evidence versions, fingerprints, lookup, and bounded selection.
- [completion-response-rewrite.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/completion-response-rewrite.js) — state-owned non-success response input.
- [completion-steering.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/completion-steering.js) — consume state-owned unsatisfied results without owning termination.
- [agent-activity.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-activity.js) — project accepted semantic state into summaries.
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js) — feature boundary and v4 snapshot persistence.
- [headless defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js) and [browser settings](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js) — internal default-off flag.
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js) — v4 snapshot compatibility.
- [completion controller tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-completion-controller.test.js), [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js), [completion tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-completion-gate.test.js), and [evaluation harness](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-mode-runner.js) — lifecycle, freshness, evidence, response, boundary, and metric coverage.

## Assumptions and Unchanged Areas

- M0–M4 are prerequisites.
- The existing assessor, arbiter, evidence admissibility rules, and bounded repair remain authoritative.
- Semantic success and technical termination remain separate.
- Evidence stays immutable and request-local until M7.
- Plan/Chat adoption remains M8/M9.
- M6 retains ownership of progress detection, no-progress handling, replanning, and new budget policy.
- Tools, security, approval policy, mutation control, provider connectors, specialized AI workflows, visible settings, and public APIs remain unchanged.
