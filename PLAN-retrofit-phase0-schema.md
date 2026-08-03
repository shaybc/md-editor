# Retrofit Phase 0 - Task 1: Contract schema + per-task-type shapes

ASCII only. This is a SEAM spec: it defines the shared data structure that Phase 1
(planner) writes and Phase 2 (verifier) reads. No behavior changes here - only the
schema and the rules that later tasks implement against. Anchored on the existing
`intent-contract.js` (schema v5); this is a delta, not a rewrite.

Schema bump: INTENT_CONTRACT_SCHEMA_VERSION 5 -> 6.

## 1. Task types (add one)

Current: answer, diagnostic, planning, implementation.
Add: `conformance` - "does artifact A satisfy spec/doc B" (compare-code-to-document,
check-diff-against-doc). This is the flagship failure class and is neither an
implementation nor a plain answer, so it gets its own type and its own required shapes.

Enum becomes: answer | diagnostic | planning | implementation | conformance.

## 2. Acceptance-criterion shape (delta)

Current criterion: { id, description, verification, provenance }.

New criterion (v6):

```json
{
  "id": "ac-1",
  "shape": "<one of the shapes in section 3>",
  "statement": "the observable, testable criterion",
  "sourceSpan": "verbatim quote from the user prompt or referenced document this criterion traces to",
  "mustInspect": ["glob or path the verifier must have READ evidence for"],
  "evidenceRequired": "what counts as proof - content + citation, never tool-family success alone",
  "provenance": "explicit | inferred | carried"
}
```

Field notes:
- `shape` (NEW, required) - drives which per-task-type rule and which verifier applies.
- `statement` (renamed from `description`) - kept for continuity; migration aliases `description` -> `statement`.
- `sourceSpan` (NEW) - the anti-paraphrase anchor. Every `explicit` criterion MUST quote
  the prompt/doc words it came from. This directly reverses the old "make criteria
  distinct from the request wording" rule that caused drift. `inferred` criteria are
  allowed but must be tagged and are surfaced for clarification (Task 4).
- `mustInspect` (NEW) - for inspection/comparison shapes, the concrete artifacts the
  verifier must see READ evidence for. This is what forces "actually read the code".
- `evidenceRequired` (NEW) - content-level proof description consumed by Phase 2.
- `verification` (old field) - folded into `evidenceRequired`; kept as alias during migration.

## 3. Criterion shapes and which task types require them

```
shape                    meaning                                        used by
-----------------------  ---------------------------------------------  ------------------------
ears-ubiquitous          "The system shall X" (always-on)               implementation
ears-event               "When <trigger>, the system shall X"           implementation
ears-state               "While <state>, the system shall X"            implementation
ears-unwanted            "If <trigger>, then the system shall X"        implementation (errors)
ears-optional            "Where <feature>, the system shall X"          implementation
diagnostic-finding       a checkable finding grounded in evidence       diagnostic
conformance-inspection   named artifacts (esp. code) were actually read conformance
conformance-comparison   the two sides were compared, gaps identified   conformance
conditional-action       "check X and update Y if warranted"            cross-cutting
prohibited-action        "do NOT destroy / touch / overwrite Z"         cross-cutting
response-content         claim supported by the answer text itself      answer
planning-coverage        the plan covers the required surfaces          planning
```

## 4. Per-task-type required-criteria rules (what Task 3's gate enforces)

- answer: >= 1 `response-content`. No workspace-mutation criteria required; do NOT force
  tool evidence onto pure Q&A.
- diagnostic: >= 1 `diagnostic-finding`. If the goal contains a change verb
  (fix/update/modify), ALSO require a `conditional-action`.
- implementation: >= 1 EARS-shaped criterion carrying a checkable state; every criterion
  must be testable and solution-free.
- conformance: MUST contain BOTH a `conformance-inspection` (the artifacts, especially the
  code, were read) AND a `conformance-comparison` (the two sides were compared). If the
  prompt says "update/fix if needed", ALSO require a `conditional-action`. This single rule
  is what would have failed the flagship run at extraction time.
- planning: >= 1 `planning-coverage`.
- any task: a stated prohibition ("do not overwrite", "do not edit") MUST become a
  `prohibited-action` criterion.

## 5. Five quality properties every criterion must satisfy (Task 3 checks)

Carried from EARS/INCOSE and Kiro requirements-analysis:
1. Testable - names inputs, outputs, and the condition under which the response holds.
2. Solution-free - describes WHAT, not HOW.
3. Unambiguous - two readers would verify it the same way.
4. Consistent - no two criteria demand incompatible outcomes.
5. Complete - error/edge paths named where the goal implies them.

## 6. What this seam guarantees downstream

- Phase 2 verifier receives, per criterion: `shape`, `mustInspect`, `evidenceRequired`,
  and `sourceSpan` - enough to judge on CONTENT and cite artifact evidence, never on
  tool-family success.
- Task 8 eval record stores exactly these fields plus the verdict and the quoted evidence,
  making every pass/fail auditable (kills the opaque `ac-1: unmet`).
- The benchmark's `shape` / `mustInspect` / `evidenceRequired` fields already use this
  vocabulary, so cases and schema stay in lockstep.

## 7. Migration / compatibility

- normalizeIntentContract bumps to v6; a v5 contract upgrades by: aliasing
  `description`->`statement`, `verification`->`evidenceRequired`, defaulting `shape` from
  taskType + heuristic, and leaving `sourceSpan`/`mustInspect` empty (which Task 3 then
  flags as low-quality on re-extraction).
- No caller is forced to change in Phase 0; the new fields are additive until Phase 1
  starts populating them.

---

# Retrofit Phase 0 - Task 8: Auditable eval-record schema

The mirror of Task 1. Anchored on the existing record in `core/intent-evaluation.js`
(record schemaVersion 1) written to `<profile>/companion/eval/intent-contracts.jsonl`.
The current record maps each criterion to only `{ id, status, harnessClaimType }`
(intent-evaluation.js line ~76) - that is the opaque `ac-1: unmet` that makes drift
invisible. This task expands that projection so every verdict is auditable.

Record bump: eval record schemaVersion 1 -> 2.

## 8.1 Per-criterion record (delta)

Current: `{ id, status, claimType, harnessClaimType, modelClaimType }`.

New (v2):

```json
{
  "id": "ac-1",
  "shape": "conformance-inspection",
  "statement": "the criterion text as authored",
  "sourceSpan": "the prompt/doc words it traced to",
  "status": "met | unmet | needs-clarification | not-applicable",
  "evidence": [
    {
      "artifact": "desktop-app/resources/ai-companion/core/intent-analysis.js",
      "quote": "the exact line/span from the artifact that proves or refutes the criterion",
      "toolEvidenceId": "EV5"
    }
  ],
  "unmetReason": "specific gap when status = unmet (empty otherwise)",
  "verifiedBy": "provider/model + context id of the INDEPENDENT verifier (Phase 2 audit)"
}
```

Rules:
- A `met` status with an empty `evidence[]` is INVALID and downgrades to `unmet`. Proof is a
  quoted artifact span, never "a tool succeeded".
- `verifiedBy` records which model/context judged it, so same-model-vs-cross-model
  independence is auditable after the fact.
- `sourceSpan` + `statement` are copied from the contract so the log is self-contained
  (you can read one JSONL line and see requirement -> criterion -> verdict -> evidence).

## 8.2 Per-run record (delta)

Keep all existing cost/latency fields (durationMs, providerCalls, tokens, taskType,
experiment, actualFiles). Add:

```json
{
  "recordSchemaVersion": 2,
  "overallVerdict": "pass | fail | needs-clarification",
  "criteria": [ /* the per-criterion objects above */ ],
  "benchmarkCaseId": "conformance-doc-represents-full-code | null",
  "benchmarkExpectedVerdict": "fail | null",
  "benchmarkMatch": "true | false | null"
}
```

- `overallVerdict` = fail if ANY criterion is unmet; needs-clarification if any criterion is
  needs-clarification and none unmet; else pass. (Replaces the softer complete/incomplete
  wording so the log speaks the same pass/fail language as the benchmark.)
- When a run is executed from `intent-benchmark-real.json`, `benchmarkCaseId`,
  `benchmarkExpectedVerdict`, and `benchmarkMatch` are filled in, so a benchmark run
  auto-scores itself (did the harness reach the hand-labeled verdict). `benchmarkMatch`
  is the single number every Phase 1/2 change is graded on.

## 8.3 What this unlocks

- The opaque `ac-1: unmet` becomes a full audit row: requirement span, criterion, verdict,
  and the quoted code/doc line behind it.
- `benchmarkMatch` turns the frozen benchmark into an automatic pass/fail gauge, so from
  Phase 1 on we can SEE whether a change moved the flagship case without hand-reading logs.
- Nothing else in Phase 0 depends on this; with Task 8 defined, the seam is frozen and the
  next task is real code (Phase 1, Task 2: EARS/templated extraction) run against the
  benchmark.
```
