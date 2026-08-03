# Intent Contracts v6 -- As-Built Architecture (reverse-engineered from code)

ASCII-only. Arrows "->", dashes "--". No Unicode punctuation or box-drawing.

This document is a reverse-engineering of the intent-contract subsystem as it exists in
code today. It supersedes PLAN-intent-contracts-v5.md and folds in every change since,
including PLAN-preserve-intent-and-prevent-false-success.md and
PLAN-close-false-success-loophole.md. Where the code diverges from those plans, this
document describes the code, and the "As-built vs planned" section lists what is NOT
implemented.

Schema constant in code: INTENT_CONTRACT_SCHEMA_VERSION = 5 (document revision v6).

## 0. As-built vs planned (implemented / partial / not implemented)

Implemented:
- Full intent phase (fast-path, extraction+repair, reduced-schema recovery, raw
  fallback), concurrent discovery seed, per-round contract injection.
- Verifiability tiers verified/provisional/unverified, mapped from source and honored by
  injection, tier-gated approval grant reuse, and completion.
- Provenance + authority model; canonical field references; single uncertain constructor;
  multi-turn merge (independent/continues/extends/corrects/uncertain); relationship-only
  salvage ("extracted-relationship-degraded", single route).
- Clarification (ask/assume/off) with isolated refresh; hybrid conflict reporting + bounded
  revision + target confirmation; control-scoped mutation blocking; approval-instruction
  amendments + resume recovery; correction-consistency propagation.
- Completion: evidence ledger with admissibility, forced assessment with repair/fallback,
  isolated response rewrite for incomplete candidates, deterministic table + tier banners,
  Plan block insertion + Plan finalization clarification gate.
- Per-request experiment dimensions + local evaluation tracker; contract persistence via
  execution generations; contract reuse only on resume; prior-turn carry.

Also implemented (from PLAN-close-false-success-loophole.md -- landed after the initial
reverse-engineering pass; verified in code):
- Harness-derived claimType: core/intent-claim-type.js deriveCriterionClaimType classifies
  each criterion from taskType + criterion semantics (workspace-target references, outcome
  verbs, checkable-state phrases); the model's label is NOT consulted. completion-assessment
  normalizeAssessment records claimType = harnessClaimType (with modelClaimType kept for
  audit).
- Deterministic evidence relevance: evidenceEstablishesOutcome requires succeeded tool
  evidence from EVERY family implied by the criterion (getCriterionEvidenceFamilies /
  isToolInEvidenceFamily). git-change-content excludes git_panel_status (needs
  git_panel_changes_digest / compare_file); file-write/file-read additionally require the
  evidence to match the criterion's file targets.
- Criterion-quality gate in validateIntentContract: criterion-restates-goal,
  missing-outcome-criterion (non-answer task types need a workspace-state/mixed criterion
  with a checkable state), and a diagnostic conditional-action check (a change verb in the
  goal without a corresponding action criterion).
- Eval metrics: intent-evaluation records max criterionGoalOverlap and per-contract
  responseContentShare.

Remaining follow-up (minor): conditional-action decomposition is only partly enforced (the
diagnostic-goal change-verb check exists; a general "finding + conditional action"
decomposition is not).

## 1. Module map

Core (resources/ai-companion/core):
- intent-contract.js -- schema, normalization, validation, verifiability inference,
  fallback/fast-path, fingerprint, conversation anchor, reuse/carry gates, contract
  metadata, compacted injection projection + message.
- intent-field-references.js -- canonical field-ref grammar (FIELD_REF_PATTERN,
  collectCanonicalFieldRefs, isCanonicalFieldRef).
- intent-contract-raw-validation.js -- strict pre-normalization validation of extractor
  output incl. the multi-turn relationship protocol; RELATIONSHIP_VALIDATION_ERRORS +
  isRelationshipOnly.
- intent-analysis.js -- extraction pipeline: capture tools, fast-path signals, envelope,
  full/repair/reduced calls, relationship salvage, deadline wrapper, user-context refresh.
- intent-relationship.js -- multi-turn merge; single buildUncertainContract (2 modes);
  mergeIntentContracts; carried/corrected merges with id-collision remaps.
- intent-clarification.js -- blocking-ambiguity selection (ask/assume/off), sequential
  batch, answer application.
- intent-conflict.js -- search tracker, harness-auto absence + confirmation detection,
  report_intent_conflict tool + validation, provenance routing, bounded revision.
- intent-mutation-control.js -- control-scoped mutation blocking (capability/target).
- intent-amendment.js -- approval-instruction amendments + scoped-block failure +
  interrupted-run recovery.
- intent-correction-consistency.js -- reference-replacement derivation, active-correction
  listing, post-action reference checks, superseded-reference detection.
- intent-claim-type.js -- harness-owned criterion classification: deriveCriterionClaimType,
  criterionReferencesWorkspaceTarget, criterionHasCheckableState, hasChangeAction.
- intent-evaluation.js -- per-request metrics tracker + provider wrapper.
- completion-evidence-ledger.js -- request-scoped evidence normalization, outcome
  classification, success confirmation, admissibility, candidate + localization files.
- completion-assessment.js -- forced assess_acceptance_criteria call, validation,
  normalization, unverified/fallback assessments, deterministic rendering + banners.
- completion-response-rewrite.js -- isolated rewrite of an incomplete candidate to remove
  unsupported success claims.
- agent-tool-effect-registry.js -- tool -> { effect, capability }, resource resolver,
  effectful predicate.
- agent-tool-loop.js -- orchestrator: intent phase, injection, seed, mutation control,
  conflict, amendments, clarification, completion, experiment + evaluation wiring.

Browser/config:
- js/ai-companion/intent-experiment.js -- experiment dimensions + resolveIntentExperiment.
- config/prompts.js -- intent/completion prompt entries.
- config/defaults.js -- intent settings + normalization.

## 2. Intent contract schema (v5)

normalizeIntentContract(payload) always returns:

```json
{
  "schemaVersion": 5,
  "source": "extracted",
  "verifiability": "verified | provisional | unverified",
  "relationshipToPrior": "independent | continues | extends | corrects | uncertain",
  "taskType": "answer | diagnostic | planning | implementation",
  "goal": { "value": "...", "provenance": "..." },
  "expectedOutcome": { "value": "...", "provenance": "..." },
  "requestedActions":  [{ "id": "RA1", "value": "...", "provenance": "..." }],
  "prohibitedActions": [{ "id": "P1", "value": "...", "provenance": "..." }],
  "outOfScope":        [{ "id": "S1", "value": "...", "provenance": "..." }],
  "acceptanceCriteria":[{ "id": "AC1", "description": "...", "verification": "...", "provenance": "..." }],
  "supersededCriteria": [],
  "namedTargets": {
    "files":   [{ "id": "T1", "value": "...", "kind": "file-path|filename", "source": "...", "status": "unverified|confirmed|absent" }],
    "symbols": [{ "id": "T2", "value": "...", "kind": "symbol", ... }],
    "errors":  [{ "kind": "error-text", ... }],
    "uiAreas": [{ "kind": "ui-area", ... }]
  },
  "assumptions": [{ "id": "A1", "statement": "...", "kind": "...", "risk": "low|medium|high", "provenance": "...", "relatedTargets": [], "keywords": [] }],
  "unresolvedDecisions": [{ "id": "D1", "description": "...", "blocking": false, "controlsMutation": false, "controlledCapabilities": [], "controlledTargets": [] }],
  "ambiguities": [{ "id": "AMB1", "question": "...", "reason": "...", "impact": "low|medium|high", "blocking": false, "safetyOrScopeCritical": false, "suggestedAnswers": [], "status": "open|resolved", "resolution": { "source": "user|evidence", "answer": "", "evidenceIds": [] } }],
  "clarifications": [],
  "amendments": [],
  "revisions": [],
  "relationshipEvidence": [{ "quote": "...", "explanation": "..." }],
  "carriedFieldRefs": [],
  "correctedFieldRefs": [],
  "idRemaps": [{ "from": "AC1", "to": "AC3" }],
  "fallbackReason": "",
  "relationshipDegraded": false,
  "relationshipResolutionSource": "",
  "pendingRelationshipContract": null
}
```

Normalization rules: missing collections become empty arrays; ids allocated per prefix
(RA/P/S/AC/T/A/D/AMB) with collision-free allocation; enums coerced; strings bounded
(MAX_STRING_CHARS 4000). taskType defaults to "answer"; provenance defaults to "inferred".
`verifiability` is taken from source.verifiability if valid else inferred from `source`
(see section 4). normalizeIntentContract never throws; structural validity is separate.

validateIntentContract(contract) errors: unsupported-task-type, missing-goal,
missing-expected-outcome, missing-criteria, over-limit (>100), duplicate-criterion-id,
invalid-shape (empty criterion description), relationship-ref consistency
(unexpected/missing carried/corrected field refs, invalid canonical refs), and -- for
verifiability != unverified -- the criterion-quality gate: criterion-restates-goal
(criterionRestatesGoal token overlap), missing-outcome-criterion (diagnostic/implementation/
planning need a workspace-state|mixed criterion with a checkable state), and a diagnostic
conditional-action check (change verb in the goal but no action criterion). Helpers
criterionRestatesGoal and criterionGoalOverlap are exported from intent-contract.js.

Harness-owned metadata (createContractMeta): schemaVersion, mode, workspace,
promptFingerprint (sha256 of whitespace-normalized prompt, 16 hex), conversationAnchor
{ chatId, turnIndex }, validationState (valid|fallback|invalid), revision, executionKind
(new|edited-rerun|resume), executionGeneration (>=1), updatedAt.

## 3. Provenance and authority model

Provenance values: explicit (user stated), clarified (from a clarification answer),
inferred (extractor), carried (inherited from a prior turn), uninterpreted (verbatim
user text in a fallback). IMMUTABLE_PROVENANCE = { explicit, clarified, uninterpreted } is
enforced by conflict routing (section 12): discovery evidence may never override those,
nor may it revise a goal/expectedOutcome/criterion description whose provenance is
inferred without asking/recording. Discovery may directly revise only inferred/carried
targets, assumptions, decisions, or a criterion verification field.

## 4. Verifiability tiers

Inferred in normalizeIntentContract from `source`:
- source "raw-prompt-fallback" -> unverified.
- source "extracted-reduced" -> provisional.
- everything else (extracted, extracted-relationship-degraded, fast-path, persisted-*) ->
  verified. Explicit `verifiability` on the payload overrides inference.

Downstream effects:
- Injection (section 10) appends a tier instruction: provisional ("reduced contract; do
  not claim it captures every requirement"), unverified ("extraction unsuccessful; prefer
  discovery/planning, require approval for every effect, do not claim full success").
- Approval grant reuse (agent-tool-loop loadApprovalContext / ensureToolApproval ~964-1072):
  verified -> normal task + workspace grants; provisional -> per-resource
  `provisionalApprovalGrants` only; unverified -> no grant reuse (fresh approval per
  effect).
- Completion (section 16): unverified short-circuits to createUnverifiedAssessment (no
  provider call, all criteria "unverified"); provisional caps overallStatus at
  "provisional"; verified assesses normally.

## 5. Canonical field references

Grammar (intent-field-references.js): `goal`, `expectedOutcome`, and `<kind>:<id>` for
kinds requestedAction, prohibitedAction, outOfScope, criterion, target, assumption,
decision. collectCanonicalFieldRefs(contract) enumerates all valid refs of a contract;
carriedFieldRefs and correctedFieldRefs are validated against these.

## 6. Extraction pipeline (intent-analysis.js)

Tools: CAPTURE_INTENT_CONTRACT_TOOL (full schema, forced) and
CAPTURE_REDUCED_INTENT_CONTRACT_TOOL (goal + one criterion + taskType).
createCaptureIntentContractTool(priorContract) tailors the schema when a prior contract
exists. Calls use temperature 0, no streaming, maxTokens=intentMaxOutputTokens, forced
toolChoice.

extractContract(params) ladder:
1. Full capture with the extraction envelope (mode, prompt, active file, attachments,
   prior contract, prior turns, resume context) + a "harness coverage rule" instruction
   requiring every named file/symbol/error/guide/page/panel/UI area to be recorded in
   namedTargets (uiAreas kept even when a file target also exists).
2. validateCapturedContract (raw relationship validation + normalized validation). If
   valid -> mergeIntentContracts(prior, candidate) -> source "extracted".
3. If invalid -> one repair call (full replacement, allowed canonical refs listed). If
   valid -> merge -> "extracted".
4. If still invalid -> salvageRelationshipContract when isRelationshipOnly(errors) and no
   field relies on unvalidated carried provenance -> source
   "extracted-relationship-degraded", relationshipDegraded true, current-authoritative,
   prior fields NOT merged (single salvage route).
5. Else reducedOrFallback: one reduced-schema capture; if valid -> "extracted-reduced"
   (provisional); else createRawFallbackContract -> "raw-prompt-fallback" (unverified).
6. Provider error or abort at any stage -> reducedOrFallback / fallbackResult
   ("extraction-timeout" on abort).

extractContractWithDeadline wraps extractContract with a hard harness deadline; a
timed-out result is discarded even if the provider resolves late.

refreshContractFromUserContext(params) runs an isolated capture to re-derive the contract
from a user-context string (used by clarification answers and approval amendments), with
one repair attempt.

Fast-path (chat only): shouldUseChatFastPath requires no attachments, no change verbs, no
diagnostic language, no explicit-constraint language, no cross-turn referential phrase, and
length below intentFastPathMaxPromptChars (default 240). Produces createFastPathContract
(verified; active file path recorded as an unverified target).

## 7. Multi-turn relationship model (intent-relationship.js + raw validation)

Raw relationship validation (intent-contract-raw-validation.js) enforces the protocol:
relationshipEvidence required for non-independent (each with quote+explanation, quote must
appear in the current prompt); carriedFieldRefs required for continues/extends (continues
must carry goal + expectedOutcome), must be canonical and known in the prior contract;
correctedFieldRefs required for corrects (canonical, resolvable in prior); relationship
without a prior contract is an error. RELATIONSHIP_VALIDATION_ERRORS + isRelationshipOnly
gate the salvage route.

mergeIntentContracts(prior, current):
- independent (or no prior) -> current unchanged.
- continues/extends -> mergeSelectedPriorFields: carried refs are pulled from prior as
  `carried` provenance and unshifted into current; id collisions get a fresh id via
  nextAvailableId and an idRemaps entry; continues also carries goal/expectedOutcome.
- corrects -> mergeCorrection (replace corrected criteria/collections/targets, preserve
  carried constraints).
- uncertain -> buildUncertainContract(..., CURRENT_AUTHORITATIVE).

Single uncertain constructor buildUncertainContract({ prior, current, mode }) (throws if
no explicit mode):
- CURRENT_AUTHORITATIVE: current-authoritative, clears relationshipEvidence/carried/
  corrected/superseded, adds one low-impact non-blocking "how does this relate?" ambiguity.
  Does NOT merge prior fields.
- PRIOR_GATED (preserveUncertainRelationship): carries prior goal/expectedOutcome as
  `carried`, adds a high-impact blocking safety/scope-critical ambiguity plus a
  mutation-controlling decision, and stores pendingRelationshipContract = current.

## 8. Concurrent discovery seed + injection

runIntentPhase launches a harness-owned discovery seed (runInitialDiscoverySeed) that
executes list_files or read_open_tabs directly (no provider round) and returns synthetic
assistant tool_calls + tool-result messages plus seed evidence. It runs concurrently with
extraction (two child AbortControllers, Promise.allSettled, parent-abort cascade, listener
cleanup). If clarification changes namedTargets, a targeted seed re-runs.

buildContractInjectionMessage compacts the contract into one authoritative system message
(mandatory fields never dropped: verifiability, taskType, goal, prohibitedActions,
criteria id+description, open blocking decisions with control scope, unverified targets,
activeCorrections; optional fields dropped first; criterion descriptions truncated only as
a last resort; budget intentInjectedMaxChars default 3500 / hard max 6000). The message
instructs: do not broaden the goal or treat targets as verified; surface conflicts; active
corrections supersede earlier proposals; plus the tier instruction. It is replaced (not
duplicated) on refresh/revision/amendment.

## 9. Concurrency, reuse, and execution generations

runIntentPhase computes currentMeta and chooses one of:
- Persisted reuse: only when not resuming intent context, a saved contract exists and is
  valid, and canReuseContract passes -- which requires executionKind === "resume" and a
  matching executionGeneration (>0), prompt fingerprint, workspace, mode, and full
  conversation anchor. Any unapplied approval amendments are recovered first
  (recoverUnappliedApprovalAmendments) -> source persisted-amendment-recovered/-blocked or
  persisted-reuse.
- Fast path (chat, no prior, not edited-rerun, not resume).
- Extraction with deadline (default path). Prior-turn carry uses canCarryPriorContract
  (same chat, earlier turn, same workspace, valid).

## 10. Clarification (intent-clarification.js)

Gated on experiment.intentClarification and mode in {chat, agent} and a requestClarification
channel. selectAmbiguities honors intentClarificationMode: ask -> up to 3 highest-impact
blocking ambiguities; assume -> ask only safetyOrScopeCritical, convert the rest to visible
assumptions; off -> none. runClarificationBatch asks sequentially; answers are applied by
re-running refreshContractFromUserContext (isolated capture) then applyClarifications; if
the refresh fails, a blocking controlling decision is added instead. A "refreshed"
intent-contract event is emitted; a targeted seed re-runs if targets changed.

## 11. Discovery seed evidence and search tracking

Search/discovery results feed a per-request search tracker (intent-conflict.createSearchTracker)
via recordSearchAndDetectAbsence (gated on experiment.intentRevision). Records carry
tool, query, empty, notFound, truncated, exhaustive, succeeded, matches.

## 12. Hybrid conflict detection + bounded revision (intent-conflict.js)

- Harness-auto absence: detectAbsentTargets marks a file/filename/symbol target absent only
  from conclusive, exhaustive, untruncated searches (a single empty grep or a list_files
  cap never proves absence; an open unsaved tab defeats a disk miss). detectConfirmedTargets
  + confirmTargets flip targets to "confirmed" on positive evidence.
- Model-reported: REPORT_INTENT_CONFLICT_TOOL (read-only) with fieldRef, conflictType
  (assumption-contradicted/target-relocated/goal-misread/outcome-misread/criterion-unreachable),
  evidenceToolCallIds. validateConflictReport checks fieldRef resolves, cited evidence
  exists, and per-type admissibility (relocation needs a positive match; assumption
  contradiction needs evidence intersecting the assumption's keywords/relatedTargets).
- routeConflict by provenance: inferred/carried target/assumption/decision -> revise;
  inferred goal/outcome/criterion -> ask or record a controlling decision; immutable
  provenance -> reject. handleIntentConflictReport applies one bounded revision
  (reviseContractForConflict marks targets absent / raises assumption risk, never touching
  the goal) or recordConflictAsDecision, re-injects the contract, and may re-derive via
  refreshContractFromUserContext.

## 13. Control-scoped mutation blocking (intent-mutation-control.js)

Before any Agent mutation, evaluateMutationControl(toolName, args, contract) matches the
tool's capability/resource (from the tool-effect registry) against open controlling
decisions: block on a capability match, or a controlledTargets match (contract target ids
resolve to confirmed paths; glob supported); a decision with no scope blocks all Agent
mutations. Enforced in executeAgentTool (~1281) and again before dispatch in the loop
(~2743). Identical under clarification off.

## 14. Approval-instruction amendments (intent-amendment.js)

On an approval rejected with instructions, applyApprovalAmendment runs an isolated
refreshContractFromUserContext (two attempts) treating the instruction as
user-authoritative. On success the refreshed contract carries an applied amendment with
recovery metadata and derived referenceReplacements (section 15). On failure it never
drops the instruction: applyScopedBlock preserves it as an unapplied amendment and adds a
controlling decision scoped to the rejected tool's resource (or capability, or -- if
nothing derivable -- all mutations). getUnappliedApprovalAmendments + a resume-time
recovery re-apply pending instructions before replaying actions.

## 15. Correction consistency / propagation (intent-correction-consistency.js)

A subsystem that keeps downstream artifacts consistent with an applied correction.
deriveReferenceReplacements builds { amendmentId, fieldRef, superseded, replacement,
replacementAliases } from a corrected contract; listActiveReferenceReplacements exposes
them (injected as activeCorrections in the contract message and passed to assessment and
rewrite). createPostActionReferenceChecks inspects a mutation's result for the replacement
vs superseded references (attached to tool evidence as referenceChecks).
findSupersededReferencesInText flags a candidate/rewrite that still contains a superseded
reference -- which makes the evidence inadmissible and fails assessment/rewrite validation.

## 16. Completion pipeline

Gated on experiment.intentCompletionAssessment (agent-tool-loop ~1864); otherwise the loop
streams the ordinary final answer. finalizeAssessedCandidate:
1. Normalize the candidate (Plan mode: normalizeProposedPlanBlock).
2. recordCandidateEvidence(EV-CANDIDATE-1) and snapshot the evidence ledger.
3. assessAcceptanceCriteria: if verifiability === unverified, short-circuit to
   createUnverifiedAssessment (no provider call). Otherwise a forced
   assess_acceptance_criteria call over { contract projection, candidate, evidenceLedger }
   with a strict system prompt (failed/denied/not-executed evidence establishes nothing;
   candidate evidence supports only response-content; workspace-state/mixed require
   semantically relevant tool evidence; truncated reads/searches cannot prove
   completeness/absence; corrections authoritative; location-specific criteria need
   evidence from the exact location). validateRawAssessment then normalizeAssessment.
   One repair attempt; else createFallbackAssessment (all unmet).
4. normalizeAssessment: keep only admissible evidence (isEvidenceAdmissible); the criterion
   claim type is HARNESS-DERIVED via deriveCriterionClaimType (the model's claimType is kept
   only as modelClaimType for audit). A met verdict requires status met + >=1 admissible EV
   + sourceRequirementMet, where sourceRequirementMet is true for response-content and
   otherwise = evidenceEstablishesOutcome (succeeded tool evidence from every family the
   criterion implies; git-change-content excludes git_panel_status; file-read/file-write
   evidence must match the criterion's file targets). overallStatus = incomplete if any
   unmet, else provisional (if tier provisional) else complete.
5. If incomplete -> completion-response-rewrite.rewriteIncompleteCandidate: an isolated
   forced rewrite_assessed_candidate call rewrites the candidate to drop every success
   claim for an unmet criterion, using only admissible evidence, acknowledging exactly the
   unmet criterion ids, preserving the single <proposed_plan> block in Plan mode, and
   removing superseded references. Invalid/failed rewrite -> empty content.
6. renderAssessmentSection appends a deterministic "Acceptance criteria" table
   (Criterion | Status | Evidence) plus a banner: "Task incomplete: ..." / "Provisional
   result: ..." / "Unverified result: ...". Plan mode inserts the section inside the plan
   block (insertPlanAssessmentSection). A completion-assessment event is emitted.

Evidence ledger (completion-evidence-ledger.js): recordToolEvidence classifies outcome
(not-executed / denied / failed / succeeded; result.status === "failed" -> failed),
computes success confirmation per tool family (mutation -> post-mutation compare; execution
-> exit status/completion; effectful git_panel_* -> git-post-state; note git_panel_status
and other read git tools fall through to a generic confirmed "tool-result"), truncation
signal, and localization files. recordCandidateEvidence adds EV-CANDIDATE-1. isEvidenceAdmissible
requires outcome succeeded + verifiedState true + no superseded-reference check + (not
truncated or successConfirmedIndependently).

Plan finalization gate: before Plan finalizes, if open blocking ambiguities remain and the
one post-discovery clarification batch has not run, a single isolated clarification batch
runs; on the next finalize the plan must record still-unresolved ambiguities explicitly.

## 17. Tool-effect registry (agent-tool-effect-registry.js)

EFFECT_CATEGORIES = read | ui-state | workspace-write | external-write | execution. Each
exposed tool maps to { effect, capability } reusing approval-registry capability ids where
they exist (workspace.file.write, git.commit.create, git.index.change, git.branch.local,
git.remote.change, export.document, export.graph, conversion.start, settings.change,
settings.security.change, shell.freeform) plus registry-only capabilities (read.workspace/
editor/graph/git/settings/apiclient/conversion/plan, editor.view, graph.state, plan.write,
apiclient.mutate/send, execution.compile/test, deps.restore, package.manage). Provides a
resource resolver (normalized path or stable identity) and an effectful predicate
(workspace-write/external-write/execution). A test asserts every getAgentToolDefinitions()
tool has an entry. It also exposes EVIDENCE_TOOL_FAMILIES + getCriterionEvidenceFamilies +
isToolInEvidenceFamily (git-change-content, test-result, build-result, file-write,
file-read) used by completion's evidence-relevance check -- notably git_panel_status is NOT
in git-change-content.

## 18. Loop orchestration (agent-tool-loop.js)

Per request:
1. Resolve experiment (intentExperiment.resolveIntentExperiment; master off -> all off;
   revision/completion require extraction) and wrap the provider with the evaluation
   tracker.
2. Build base messages (system prompt, active file, attachments, history, current user).
3. If intentContractsEnabled and mode in {chat, agent, plan} and not resumed: runIntentPhase
   -> produce/reuse contract, emit intent-contract (+ intent-uninterpreted if unverified),
   run clarification, inject the contract message before the current user message, append
   seed synthetic messages + seed evidence, set usedTools.
4. Round loop: forced/auto tool choice; for each tool call: mutation-control check (agent),
   report_intent_conflict interception (revision budget), execute, record tool evidence +
   correction reference checks, record search + auto absence/confirmation (if
   intentRevision), file-search fallback; on a rejected-with-instructions approval, run the
   amendment and re-inject.
5. Final answer: if intentCompletionAssessment -> finalizeAssessedCandidate; else stream
   the ordinary final answer. A tool-reliability note is appended when >40% of tool calls
   failed.
6. Emit the evaluation record.

## 19. Experiment dimensions + evaluation

Dimensions (js/ai-companion/intent-experiment.js): intentExtraction, intentClarification,
intentRevision, intentCompletionAssessment. resolveIntentExperiment(value, masterEnabled,
{rejectInvalid}) returns all-off when the master is off, rejects incoherent combinations
(revision or completion without extraction), and is fixed per request. Default
settings.intentExperiment = ALL_ON.

createIntentEvaluationTracker wraps provider.complete/completeMessage to sum tokens per
call, records intent events (contract source/variant/verifiability, uninterpreted reason,
clarification count, completion assessment), and emits a bounded local record: providerCalls,
prompt/completion/total tokens, contractSources, final verifiability, uninterpretedReason,
clarificationCount, revisionCount (revised+amended variants), the assessment, actualFiles
(from succeeded tool evidence), and the loophole indicators max criterionGoalOverlap and
per-contract responseContentShare (criterionGoalOverlap imported from intent-contract.js).

## 20. Prompts and settings

Prompt entries (config/prompts.js): intentExtractionSystem, intentClarificationSystem,
intentContractRefreshSystem, intentContractRevisionSystem, completionAssessmentSystem,
completionFinalAnswer (arm-aware defaults; user overrides preserved).

Settings (config/defaults.js): intentContractsEnabled (master, default false),
intentExperiment (ALL_ON, resolved/validated), intentClarificationMode (assume),
intentFastPathEnabled (true), intentFastPathMaxPromptChars (240),
intentExtractionDeadlineMs (12000), intentMaxOutputTokens (1200), intentInjectedMaxChars
(3500). Mirrored/normalized in the browser settings surface.

## 21. Known gaps and follow-ups (as-built)

The git-task false-success loophole is now closed deterministically: harness-derived
claimType + family-relevant succeeded-evidence in completion, plus the criterion-quality
gate at extraction, plus the two eval indicators. Residual follow-ups:

1. Conditional-action decomposition is only partial: validateIntentContract flags a
   diagnostic goal with a change verb and no action criterion, but there is no general
   "finding + conditional action" decomposition for other task types.
2. Evidence-family relevance (getCriterionEvidenceFamilies) is regex/heuristic and worth
   tuning against the eval set; the deterministic guarantees are the succeeded-evidence
   requirement, the git-status-is-not-git-change exclusion, and file-target matching.
3. The git-status stack-overflow fix (PLAN-fix-git_panel_status-stack-overflow.md) is a
   separate, already-shipped change; a failed git status is recorded as failed evidence and
   is therefore inadmissible here.
