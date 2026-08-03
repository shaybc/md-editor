# Close the False-Success Loophole (criterion quality + evidence honesty)

ASCII-only. Arrows are "->", dashes "--". Safe to paste into implementation prompts.

## Problem (from real task records)

Two agent tasks with `source: "extracted"`, `verifiability: "verified"` were marked
`complete` while the underlying work was not verified:

- Each contract had exactly one acceptance criterion that was a near-verbatim
  restatement of the goal (provenance `explicit`).
- The git task (`taskType: diagnostic`, "check the latest git changes ... and update the
  doc") had its single criterion self-labeled `claimType: "response-content"`. In
  `completion-assessment.js` line ~96, `sourceRequirementMet = assessed.claimType ===
  "response-content" || hasToolEvidence`, so a response-content criterion needs ZERO tool
  evidence -- the candidate reply alone satisfies it. The actual diffs were never read
  (`run_command` git diff was `not-executed -- blocked by policy`; `git_panel_status`
  only returned a 19-file list), yet the criterion was `met` and the task `complete`.

The verified/provisional/unverified tiers only defend against failed extraction. They do
nothing when extraction SUCCEEDS with a weak or mislabeled criterion. This plan closes
that. It is independent of, and complementary to, the git-status crash fix.

## Design principle

An acceptance criterion may only be `met` if the evidence actually establishes its
claimed outcome. The two levers: (1) the harness -- not the model -- decides whether a
criterion is a response claim or a workspace claim, and (2) a workspace claim requires
succeeded tool evidence whose tool family matches the claim. Extraction is tightened so a
single prompt-echoing criterion is invalid for non-`answer` tasks.

## Changes (ordered by leverage)

### 1. Harness-derived claimType (highest leverage)

Add `core/intent-claim-type.js` with a pure classifier
`deriveCriterionClaimType(criterion, contract)` used as the single source of truth:

- Returns `response-content` ONLY when `contract.taskType === "answer"` AND the criterion
  references no workspace named target AND uses no outcome/action verb.
- Returns `workspace-state` when `taskType` is `diagnostic`/`implementation`, or the
  criterion names a file/symbol/error/UI target, or it uses a verb like check, read,
  fetch, inspect, verify, confirm, update, change, modify, edit, create, delete, add,
  remove, apply, run, test, build, commit.
- Returns `mixed` for `planning` (a plan artifact plus grounding claims), or when a
  criterion has both a response deliverable and a workspace claim.

In `completion-assessment.js` `normalizeAssessment`, compute
`harnessClaimType = deriveCriterionClaimType(criterion, contract)`, keep the model's
label only as a hint, and replace line ~96 with:

```
const sourceRequirementMet = harnessClaimType === "response-content"
  ? true
  : evidenceEstablishesOutcome(criterion, contract, admissibleEntries); // see #2
```

Persist `harnessClaimType` on the rendered criterion so the audit shows the harness
decision, not the model's.

### 2. Evidence must establish the outcome (pairs with #1)

Today `hasToolEvidence` is "any admissible EV with `source === "tool"`" -- it ignores
`outcome` and tool family, which is why a succeeded `git_panel_status` (a file list)
would satisfy a "git changes" criterion. Replace it with
`evidenceEstablishesOutcome(criterion, contract, entries)`:

- Require at least one cited EV that is `source: "tool"` AND `outcome: "succeeded"`
  (not merely present/admissible).
- Require the succeeded EV's tool to be in the family matching the criterion's claim,
  derived from the criterion's named targets/verbs via the tool-effect registry:
  - git *changes/diff/what-changed* claim -> a diff/digest tool
    (`git_panel_changes_digest` or `git_panel_compare_file`). `git_panel_status` (the
    file-name list) does NOT establish a change-content claim.
  - "file X updated/created/changed" -> a write EV on X (`apply_edit`/`write_file`/editor
    write), ideally plus a post-write read.
  - "file X contains/says Y" (read) -> a succeeded read of X (`read_file`/`read_open_tabs`).
  - tests pass/build succeeds -> `run_tests`/`compile_project` succeeded.
- Fallback when no family can be derived: require at least one succeeded `source: "tool"`
  EV (still stricter than today, which accepted any admissible tool EV).
- `EV-CANDIDATE-1` never satisfies a `workspace-state`/`mixed` claim (already the rule via
  claimType; #1 guarantees the git task is now `workspace-state`).

With #1 + #2, the git task becomes: criterion reclassified `workspace-state`; the only
succeeded git EV is `git_panel_status` (wrong family for a change claim); diff evidence is
absent (blocked) -> criterion `unmet` -> overall `incomplete`, and the harness renders "I
could not verifiably read the git changes (the diff was blocked), so I cannot confirm."

Note: the tool-family relevance is heuristic and tunable; the deterministic wins are the
`outcome: "succeeded"` requirement and "git_panel_status is not evidence of git changes."

### 3. Criterion-quality gate at extraction (kills "criterion == prompt")

In `intent-contract.js` `validateIntentContract`, add two checks that trigger the existing
repair path:

- `criterion-restates-goal`: a criterion whose description overlaps `goal.value` above a
  normalized token-containment/Jaccard threshold (default 0.8) after lowercasing,
  stripping punctuation, and dropping stopwords. Use a shared helper
  `criterionRestatesGoal(criterion, goal)`.
- `missing-outcome-criterion`: for `taskType` in `diagnostic`/`implementation`/`planning`,
  require at least one criterion whose `deriveCriterionClaimType` is `workspace-state` or
  `mixed` and that names a concrete observable (a named target, or a checkable state). A
  single response-level criterion for these task types is invalid.

Reinforce `intentExtractionSystem` in `prompts.js`: "Write acceptance criteria as
observable outcomes distinct from the request wording, each tied to a named target or a
checkable state; never restate the goal. For diagnostic/implementation tasks, at least one
criterion must be verifiable from tool evidence." Include the git task as an explicit bad
example ("Check the latest git changes ...") paired with a good decomposition (a criterion
that cites the actual diff, and, per #4, a conditional action criterion).

### 4. Conditional-action intent ("check X and update if needed") -- staged

When the prompt implies a conditional action, extraction should emit BOTH a finding
criterion and a conditional-action criterion ("if the changes warrant it, the doc was
updated and the update verified"). Implement as: an extraction-prompt instruction plus a
soft validation hint that flags a diagnostic contract whose goal contains a change verb
(update/change/fix/add) with no action criterion. Lower priority than 1-3; it addresses
"check" tasks silently skipping the implied work.

### 5. Metrics (leading indicators that 1 and 3 work)

Add to the eval/experiment log two per-contract metrics:

- `criterionGoalOverlap`: max token-containment of any criterion against the goal.
- `responseContentShare`: fraction of criteria whose harness claimType is
  `response-content`, reported per `taskType`.

Today these are ~1.0 and ~high for diagnostic/implementation; they should fall after #1
and #3. Wire into the existing experiment/eval log; no new UI required.

## Interaction with the existing tiers

These changes operate on `verified` (and `provisional`) contracts. A `workspace-state`
criterion lacking succeeded, family-matching tool evidence is `unmet` -> the assessment is
`incomplete` -> the harness's existing incomplete-statement/banner path fires. No new tier
is introduced; the tiers gate whether we assess, this plan gates whether a criterion can be
`met`.

## Test plan

- Replay the git task: a `diagnostic` contract, one `response-content`-labeled criterion,
  a succeeded `git_panel_status` EV, no diff EV -> harness reclassifies to
  `workspace-state`, `evidenceEstablishesOutcome` rejects the status EV as wrong family,
  criterion `unmet`, overall `incomplete`.
- claimType override: identical contract/evidence yields `met` under the old model-declared
  path and `unmet` under the harness-derived path (regression guard on the exploit).
- Evidence relevance: a "git changes" criterion is `met` only when a succeeded
  `git_panel_changes_digest`/`compare_file` EV is cited; a "file X updated" criterion needs
  a succeeded write EV on X; a failed/`not-executed`/`denied` EV never satisfies.
- Extraction gate: a criterion that restates the goal yields `criterion-restates-goal` and
  triggers repair; a diagnostic/implementation contract with only a response-level
  criterion yields `missing-outcome-criterion`; a well-decomposed contract passes.
- Metrics: `criterionGoalOverlap` and `responseContentShare` are recorded per taskType.
- Regression: `answer`-type tasks with a genuine response criterion still pass as
  `response-content` needing no tool evidence; existing completion tests still pass.

## Expected files

- `core/intent-claim-type.js` (new: `deriveCriterionClaimType`; shared by assessment and
  validation)
- `core/completion-assessment.js` (`normalizeAssessment`: harness claimType +
  `evidenceEstablishesOutcome`; tighten `hasToolEvidence` to succeeded + family)
- `core/agent-tool-effect-registry.js` (expose tool families used for evidence matching, if
  not already derivable from capability/effect)
- `core/intent-contract.js` (`validateIntentContract`: `criterion-restates-goal`,
  `missing-outcome-criterion`; `criterionRestatesGoal` helper)
- `config/prompts.js` (`intentExtractionSystem`: outcome-criteria instruction + git bad
  example; conditional-action guidance)
- eval/experiment logging (metrics #5)
- tests: `ai-companion-completion-assessment.test.js`,
  `ai-companion-intent-contract.test.js`, a new `ai-companion-intent-claim-type.test.js`,
  and an assessment fixture replaying the git task.

## Assumptions and boundaries

- The model remains the semantic assessor of whether a criterion is met; the harness
  decides claim TYPE and enforces evidence sufficiency deterministically.
- Tool-family relevance (#2) is a tunable heuristic; the guaranteed wins are the
  succeeded-evidence requirement and rejecting `git_panel_status` as change evidence.
- This is independent of the git-status crash fix and of the intent-preservation/tier
  work; all three compose.
- No change to mutation-control, approval, or command policy.
