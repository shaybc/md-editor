# Intent Contracts v6 -- Appendix: Intent Extraction and Acceptance Criteria Validation Mechanisms

This document serves as the supplemental appendix to `PLAN-intent-contracts-v6.md`, detailing the complete architecture, workflows, validation gates, and operational semantics of the intent extraction pipeline and acceptance criteria validation mechanisms as implemented in the AI Companion harness.

---

## 1. Executive Summary & Scope

The intent contract subsystem in the MD Editor AI Companion ensures that all user requests (`chat`, `agent`, `plan`) are rigorously parsed into structured contracts (`intent-contract.js`), validated against schema and semantic gates (`intent-contract-raw-validation.js`), enriched via concurrency seeds and clarification batches, guarded by mutation control, and finally verified via an objective evidence ledger and acceptance criteria assessment engine (`completion-assessment.js`).

This appendix covers:
1. **Full Intent Extraction Pipeline** (`intent-analysis.js`)
2. **Raw Validation & Multi-Turn Protocol** (`intent-contract-raw-validation.js`, `intent-relationship.js`)
3. **Acceptance Criteria Quality Gates & Claim Classification** (`intent-claim-type.js`, `intent-contract.js`)
4. **Evidence Admissibility & Relevance Verification** (`completion-evidence-ledger.js`)
5. **Forced Assessment & Response Rewrite** (`completion-assessment.js`, `completion-response-rewrite.js`)

---

## 2. Intent Extraction Pipeline (`intent-analysis.js`)

The extraction pipeline transforms raw conversational input and workspace context into a normalized, versioned intent contract (`INTENT_CONTRACT_SCHEMA_VERSION = 5`).

### 2.1 Extraction Workflow
1. **Invocation & Envelope Preparation:**
   * Initiated via `extractContract(params)` within `runIntentPhase`.
   * Gathers workspace mode, raw prompt, active file content, recent attachments, prior contract state, and recent conversation history.
   * Enforces the **Harness Coverage Rule**: Every named file, symbol, error, guide, page, panel, or UI area mentioned in the prompt must be explicitly recorded in `namedTargets`.
2. **Primary Capture Call:**
   * Uses `CAPTURE_INTENT_CONTRACT_TOOL` with `temperature: 0`, `streaming: false`, and forced tool choice.
3. **Validation & Repair Loop:**
   * **Validation:** Runs `validateCapturedContract` (combining raw relationship checks and normalized schema validation).
   * **Repair Fallback:** If validation fails, a single repair call is made (`CAPTURE_REVISED_INTENT_CONTRACT_TOOL`) providing exact canonical reference lists and specific validation error strings.
   * **Relationship Salvage:** If structural or relationship validation still fails but meets `isRelationshipOnly` criteria (and relies on validated provenance), the pipeline invokes `salvageRelationshipContract`, producing source `"extracted-relationship-degraded"` with `relationshipDegraded: true`.
   * **Reduced-Schema Fallback:** If salvage fails, a reduced-schema capture (`CAPTURE_REDUCED_INTENT_CONTRACT_TOOL` extracting only `goal`, `taskType`, and one criterion) yields source `"extracted-reduced"` (`provisional` verifiability).
   * **Raw Prompt Fallback:** Ultimate failure (or provider abort/timeout via `extractContractWithDeadline` set to 12,000ms) falls back to `createRawFallbackContract`, producing source `"raw-prompt-fallback"` (`unverified`).

---

## 3. Raw Validation & Multi-Turn Relationship Protocol (`intent-contract-raw-validation.js`)

Before normalization or merging, raw LLM contract outputs undergo strict pre-normalization validation:
* **Relationship Evidence:** Non-independent turns (`continues`, `extends`, `corrects`, `uncertain`) must include `relationshipEvidence` with verbatim quotes from the current prompt and clear explanations.
* **Carried & Corrected References:** `continues` and `extends` must declare valid canonical `carriedFieldRefs` (e.g., `goal`, `expectedOutcome`, `criterion:AC1`). `corrects` must declare valid `correctedFieldRefs` resolvable in the prior contract.
* **ID Collision & Remapping:** When merging turns (`mergeIntentContracts`), `nextAvailableId` assigns non-colliding IDs and records `idRemaps`.

---

## 4. Acceptance Criteria Validation & Quality Gates (`intent-claim-type.js`)

For all contracts with `verifiability != 'unverified'`, the subsystem enforces rigorous extraction-time quality gates (`validateIntentContract` in `intent-contract.js`):

### 4.1 Extraction-Time Quality Gates
1. **Criterion-Restates-Goal Check (`criterionRestatesGoal`):**
   * Computes token overlap between criterion descriptions and the main goal. Fails extraction if a criterion merely mirrors the goal without testable verification steps.
2. **Missing-Outcome Criterion Check:**
   * Non-answer task types (`diagnostic`, `implementation`, `planning`) require at least one criterion classified as `workspace-state` or `mixed` containing an explicit checkable state.
3. **Diagnostic Conditional-Action Check:**
   * If a `diagnostic` task goal contains a change verb (e.g., "fix", "update", "modify") without a corresponding action criterion, validation flags a diagnostic conditional-action error.

### 4.2 Harness-Owned Claim Classification (`intent-claim-type.js`)
* `deriveCriterionClaimType` automatically classifies each criterion from its `taskType` and semantic text (workspace-target references, outcome verbs, checkable-state phrases).
* The model's self-reported claim type is ignored for evaluation and audit, preventing model self-attestation bias.

---

## 5. Evidence Admissibility & Completion Assessment (`completion-evidence-ledger.js` & `completion-assessment.js`)

When a task completes, the completion pipeline verifies objective tool evidence before allowing success claims.

### 5.1 Evidence Ledger & Relevance
* **Request-Scoped Ledger:** `completion-evidence-ledger.js` records every tool execution, categorizing results into strict tool families (`git-change-content`, `test-result`, `build-result`, `file-write`, `file-read`).
* **Exclusion Safeguards:** `git_panel_status` is explicitly excluded from `git-change-content` (preventing false success claims from metadata-only status checks). File-write/read criteria require evidence matching the exact criterion file targets.

### 5.2 Forced Assessment & Response Rewriting
1. **Forced Evaluation:** `assess_acceptance_criteria` is called with the contract projection, candidate response, and evidence ledger.
2. **Verifiability Short-Circuit:** Unverified contracts automatically yield `createUnverifiedAssessment` (all criteria marked unverified). Provisional contracts cap overall status at `provisional`.
3. **Isolated Rewrite:** If an incomplete candidate response claims success while criteria fail, `completion-response-rewrite.js` performs an isolated rewrite to strip unsupported success claims while preserving helpful context.
