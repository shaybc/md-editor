# Preserve Structured Intent and Prevent Uninterpreted False Success

ASCII-only. Arrows are "->", dashes "--". No Unicode punctuation. Safe to paste into
implementation prompts.

This plan supersedes "Preserve Structured Intent When Only Relationship Validation
Fails". It folds that objective into a single design that also closes the uninterpreted
false-success gap, and it removes the divergent salvage/uncertain routes that the prior
version left open.

## Objectives

1. Preserve a valid semantic intent when only the multi-turn relationship fields fail --
   through exactly one salvage route and one uncertain-contract constructor.
2. Prevent uninterpreted (and reduced) intent from silently asserting completion --
   through explicit completion-verifiability tiers.

Objective 1 is the prerequisite: it establishes the single uncertain constructor and the
completion-tier field that Objective 2 consumes. Implement Part A, then Part B.

## Shared model (introduced by Part A, consumed by Part B)

### Completion-verifiability tier

Add one harness-owned field on the persisted contract metadata:

```
verifiability: "verified" | "provisional" | "unverified"
```

Mapping from the extraction outcome (`source`):
- `extracted`, `extracted-relationship-degraded` -> `verified` (a complete, sound
  current-turn contract; relationship degradation does NOT lower the tier).
- `extracted-reduced` -> `provisional` (reduced-schema salvage: sound but incomplete).
- `raw-prompt-fallback` -> `unverified` (no interpreted, falsifiable criteria).
- `fast-path` -> `verified` for its trivial read-only scope (chat answer; exempt from the
  banner below).

Completion assessment and the final-answer renderer read this tier; nothing downstream
infers success from `source` strings directly.

### Single uncertain-contract constructor

Introduce one canonical builder in `intent-relationship.js`:

```
buildUncertainContract({ prior, current, blocking, carryPrior })
```

- `blocking: false, carryPrior: false` -> current-authoritative, no prior fields merged,
  one non-blocking low-impact ambiguity. (Salvage and the ordinary merge use this.)
- `blocking: true, carryPrior: true` -> carries prior goal/outcome as `carried`, adds a
  high-impact blocking, safety/scope-critical ambiguity plus a mutation-controlling
  decision. (Reserved for a harness-initiated uncertain that intentionally gates work.)

Reconcile the existing constructors: `mergeIntentContracts`'s `uncertain` branch and
`preserveUncertainRelationship` both delegate to `buildUncertainContract` with the
appropriate flags. No other function constructs a `relationshipToPrior: "uncertain"`
contract (enforced by test).

## Part A -- Preserve semantic intent on relationship-only failure

### A1. Classify relationship-only validation errors

Centralize, in `intent-contract-raw-validation.js`, the canonical relationship-error set
and export a helper `isRelationshipOnly(errors)` returning true only when every error is
in the set:

- missing-relationship-evidence
- relationship-evidence-not-in-current-prompt
- missing-carried-field-ref
- invalid-carried-field-ref
- unexpected-carried-field-ref
- missing-corrected-field-refs
- invalid-corrected-field-ref
- unresolvable-corrected-field-ref
- unexpected-corrected-field-ref
- relationship-without-prior-contract
- missing-or-unsupported-relationship
- unsupported-relationship

Raw validation stays strict; the model contract is never accepted unchanged.

### A2. One salvage route (replaces the existing branch)

REMOVE the current `extracted-relationship-uncertain` salvage branch in
`intent-analysis.js`. The salvage below is the sole relationship-only salvage; the string
`extracted-relationship-uncertain` no longer appears in the code.

Salvage runs only after: (1) initial extraction failed, (2) the existing single repair
failed, and (3) `isRelationshipOnly(errors)` is true. No additional provider call.

Semantic verification of the repaired raw contract:
- Clone it; set `relationshipToPrior: "independent"`; clear `relationshipEvidence`,
  `carriedFieldRefs`, `correctedFieldRefs`, and unvalidated relationship effects
  (`supersededCriteria`).
- Re-run raw + normalized validation.
- Reject salvage if any goal, outcome, action, criterion, scope item, assumption,
  decision, or target relies on `carried` provenance (its source was never validated).
- If any non-relationship error remains, use the existing raw-prompt fallback.

### A3. Produce the degraded contract via the single constructor

On success:
- Prior contract exists -> `buildUncertainContract({ prior, current: salvaged,
  blocking: false, carryPrior: false })`. Result: `relationshipToPrior: "uncertain"`,
  current-authoritative, no prior fields merged, one visible non-blocking ambiguity
  ("How does this request relate to the previous task?").
- No prior contract -> normalize `relationshipToPrior: "independent"` (nothing to merge;
  do not fabricate uncertainty).

Set on the result: `source: "extracted-relationship-degraded"`, additive
`relationshipDegraded: true`, `relationshipResolutionSource: "harness-degraded"`, and
`verifiability: "verified"` (the current-turn contract is complete and sound; only the
cross-turn link is unknown). Do not block mutations solely because the relationship is
degraded. Independently-extracted blocking ambiguities/decisions remain effective.

### A4. Diagnostics

Return/emit bounded diagnostics: both failed attempts, and a `degradation` block with
`originalRelationship`, bounded `errorCodes`, and `priorFieldsMerged: false`. Never
include raw prompts, contracts, provider payloads, or arguments. Persist the salvaged
contract as valid structured intent (normal injection and genuine resume) -- shown as
structured intent with an uncertain prior relationship, never as uninterpreted fallback.

## Part B -- Prevent uninterpreted (and reduced) false success

### B1. Reduced-schema recovery before accepting uninterpreted

When full extraction (initial + repair) fails with non-relationship errors -- i.e. the
current path would go to raw fallback -- attempt one reduced-schema extraction first,
using the existing repair call budget rules (no extra provider call beyond the agreed
attempt count):
- Reduced schema asks only for `taskType`, a single concrete `goal`, and exactly one
  observable acceptance criterion.
- If it validates -> `source: "extracted-reduced"`, `verifiability: "provisional"`.
- If it fails -> raw-prompt fallback, `verifiability: "unverified"`.

The reduced contract is authoritative for guiding work and approvals; its completion
claim is capped (B2) and its mutation policy is tightened (B3).

### B2. Completion assessment honors the tier (the core fix)

The assessor and the harness-rendered final answer branch on `verifiability`:
- `verified`: assess and report normally (per-criterion met/unmet; global complete only
  if all met).
- `provisional`: report the single reduced criterion's met/unmet honestly, but the global
  outcome may never exceed "provisionally complete". The harness appends a scope caveat:
  "I verified <criterion>, but could not capture the full set of requirements/constraints
  for this request -- please confirm nothing else was intended." Downgrade further for
  `taskType` implementation/diagnostic: prefer confirmation and never claim done.
- `unverified`: the assessment must NOT return met/complete for any criterion. The global
  outcome is `unverified`; the harness appends an explicit banner: "I could not establish
  verifiable acceptance criteria for this request, so I cannot confirm it matches your
  intent. Here is what I did -- please confirm." (Exempt: `fast-path` trivial chat
  answers.)

The banner and the tier verdict are rendered deterministically by the harness from the
tier + assessment object, not transcribed by the model.

### B3. Mutation policy by tier

- `verified` (including relationship-degraded): normal task/workspace auto-approval
  grants apply. No extra restriction.
- `provisional`: a fresh approval is required per resource, but a granted resource may
  cover later matching actions on that same resource (per-target grants). Concrete target
  present -> scope to it.
- `unverified`: a fresh approval card for every effect-bearing action; ignore
  task/workspace grants and never reuse a grant, because no intent was captured to
  justify carrying one forward.

Enforced through the existing tool-effect registry + mutation-control matcher: the tier
selects the grant-reuse policy; reads/ui-state remain unaffected.

### B4. Observability

Emit a distinct `intent-uninterpreted` state (not just a fallback variant) carrying the
reason (provider-error, malformed, refused, timeout) and the resulting tier, so the eval
log can measure how often and why extraction fails and whether reduced recovery helped.

## Internal interface effects

- `intent-contract-raw-validation.js` exports `isRelationshipOnly`.
- `intent-relationship.js` exports the single `buildUncertainContract`; the old two
  constructors delegate to it.
- `intent-analysis.js` gains the reduced-schema recovery path and the single
  relationship salvage; the `extracted-relationship-uncertain` branch is removed.
- Completion assessment + final-answer renderer branch on `verifiability`.
- Additive metadata: `verifiability`, `relationshipDegraded`,
  `relationshipResolutionSource`. Intent-contract schema version unchanged.

## Test plan

Single-route guarantees (the divergence fix):
- Exactly one salvage source exists: `extracted-relationship-uncertain` no longer appears
  in the code; relationship-only salvage always yields `extracted-relationship-degraded`.
- `buildUncertainContract` is the only constructor of `relationshipToPrior: "uncertain"`;
  a test asserts `mergeIntentContracts` and `preserveUncertainRelationship` delegate to
  it, and that no other module builds an uncertain contract.

Part A:
- Initial `continues` without carried refs and repaired `corrects` without corrected refs
  preserve the repaired task type, goal, actions, targets, and concrete criteria.
- No prior goal/criterion/action/target/prohibition/scope item is merged.
- Result source `extracted-relationship-degraded`, `verifiability: "verified"`, one
  non-blocking ambiguity when a prior contract exists; `independent` when none.
- Carried provenance without a validated carrying relationship prevents salvage.
- Mixed relationship + semantic errors, or invalid provenance/targets/ids/criteria/task
  types, fall to raw fallback.
- A relationship-degraded implementation contract reaches normal mutation control (not
  blocked by degradation) and completion assessment with its concrete criteria.

Part B:
- Reduced-schema salvage yields `extracted-reduced` / `provisional`; a met reduced
  criterion is reported met but global outcome stays "provisionally complete" with the
  scope caveat; implementation task type prefers confirmation.
- Raw/uninterpreted -> `unverified`; the assessor cannot mark any criterion met; the
  banner is rendered by the harness; fast-path chat answers are exempt.
- Mutation policy: verified uses grants; provisional requires per-resource approval but
  reuses a same-resource grant; unverified requires a fresh approval per mutation with no
  grant reuse.
- `intent-uninterpreted` events carry reason + tier.

Unchanged:
- Existing valid `independent`/`continues`/`extends`/`corrects` contracts are unchanged.
- `verified` completion and approval behavior are unchanged for full contracts.

## Expected files to change

- core/intent-contract-raw-validation.js (relationship-error set + `isRelationshipOnly`)
- core/intent-relationship.js (single `buildUncertainContract`; delegate the two)
- core/intent-analysis.js (remove old branch; single salvage; reduced-schema recovery;
  set `verifiability`)
- core/intent-contract.js (verifiability metadata; tier mapping)
- core/completion-assessment.js (tier-aware verdict + deterministic banner)
- core/intent-mutation-control.js and the loop approval path (tier -> grant-reuse policy)
- config/prompts.js (reduced-schema extraction prompt; tier-aware completion instruction)
- tests/ai-companion-intent-contract.test.js, tests/ai-companion-intent-phase.test.js,
  tests/ai-companion-intent-relationship.test.js (new), tests for completion tiers and
  the single-route guarantees.

## Assumptions and out of scope

- The model remains the semantic intent and relationship classifier; the harness never
  infers continue/extend/correct.
- Provider attempt budget is unchanged except for the one reduced-schema recovery call,
  which replaces the jump straight to raw fallback (net calls do not increase for the
  already-failing case).
- No prior fields are ever carried through an invalid relationship.
- Prompt-profile schema and correction propagation are otherwise unchanged.
- The numeric/wording details of banners and the exact provisional caveat text are
  tunable defaults.
