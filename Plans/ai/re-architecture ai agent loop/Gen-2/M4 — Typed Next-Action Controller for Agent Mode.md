# M4 — Typed Next-Action Controller for Agent Mode

## Summary

M4 activates the M2/M3 state pipeline for Agent decisions behind an internal, default-off flag.

For enabled Agent runs:

1. Build the next decision from authoritative `AgentState` and the M3 `ContextBundle`.
2. Require exactly one provider-native function call.
3. Normalize and validate it as a typed decision.
4. Revalidate it against current state immediately before execution.
5. Execute accepted actions through existing security and approval paths.
6. Record the decision lifecycle and observation before rebuilding context.

Central invariant:

```text
Every ordinary Agent iteration executes zero or one validated action
derived from current authoritative state.

No action may execute from an invalid, stale, rejected,
superseded, or multi-call decision.
```

Chat, Plan, Git Summary, Autocomplete, connection tests, and specialized AI components remain unchanged.

## Internal contracts

- Add `agentDecisionControllerEnabled`, defaulting to `false`, to both settings normalizers. Do not add a Settings UI control in M4.
- Normalize provider calls into `AgentDecisionV1`:

  ```js
  {
    schemaVersion: 1,
    decisionId,
    basedOnStateVersion,
    type: "tool_call" | "request_user_input" | "propose_completion" | "report_blocked",
    intentId,
    rationale,
    expectedObservation,
    status: "proposed" | "accepted" | "rejected" | "executed" | "superseded",
    proposedAtStateVersion,
    acceptedAtStateVersion: null,
    authorizedAtStateVersion: null,
    executedAtStateVersion: null,
    runtimeReasonCodes: [],
    replacesDecisionId: null,
    tool: { name, arguments, providerCallId } | null,
    payload: object | null
  }
  ```

- `rationale` is untrusted model-authored context. Security, approval, validation, and authorization logic must never use it.
- `runtimeReasonCodes` are deterministic values such as:
  - `missing_decision_metadata`
  - `unknown_tool`
  - `invalid_tool_arguments`
  - `invalid_intent_reference`
  - `multiple_function_calls`
  - `stale_state_version`
  - `authorization_denied`
  - `invalid_blocker_claim`
- Runtime code generates IDs, lifecycle fields, reason codes, and state versions.
- `intentId` may be `"task"` or a current acceptance-criterion ID.
- Rejected decisions remain `rejected`; a repair decision references them through `replacesDecisionId`. `superseded` is reserved for an accepted decision invalidated before execution.

## Provider decision interface

- Keep every existing Agent tool as a native provider function.
- Add a required `_decision` object to the Agent-controller copy of each schema:

  ```js
  {
    intentId,
    rationale,
    expectedObservation
  }
  ```

- Strip `_decision` before invoking the real executor.
- Preserve provider call IDs, raw provider metadata, and Gemini thought signatures.
- Add controller-only pseudo-tools:
  - `agent_request_user_input`
  - `agent_propose_completion`
  - `agent_report_blocked`
- Do not expose model-controlled `mark_intent`, `revise_plan`, or `abort` actions in M4.
- Allow title or narration text alongside the single function call. A response without a function call is invalid.

## Implementation order

1. **Feature boundary and AgentState v3**
   - Resolve the internal flag only in Agent mode.
   - Start the state session in `shadow` or `controller` mode.
   - Add bounded decision records and these transitions:
     - `decision_proposed`
     - `decision_accepted`
     - `decision_rejected`
     - `decision_execution_authorized`
     - `decision_executed`
     - `decision_superseded`
   - Controller-mode state, observation, and context failures are fail-closed; shadow mode preserves existing fail-open behavior.
   - Continue accepting persisted v1/v2 terminal snapshots while writing v3 snapshots.

2. **Authoritative decision request**
   - Build a fresh M3 `ContextBundle` before every ordinary Agent decision.
   - Send `ContextBundle.messages`, decorated tools, and `toolChoice: "required"` instead of the accumulated legacy transcript.
   - Retain legacy messages only for existing intent extraction, approval recovery, completion assessment, and compatibility helpers.
   - Disable synthetic initial discovery in controller mode.
   - Calculate context and token estimates from the actual state-built request.

3. **Decision validation**
   - Atomically reject zero or multiple function calls.
   - Validate the function name, JSON object arguments, `_decision` metadata, intent reference, control payload, and original tool requirements.
   - Record no raw malformed arguments in state, telemetry, or repair context.
   - Classify rejection causes so metadata-decoration failures are distinguishable from invalid original tool arguments.
   - Never execute any call from a rejected multi-call response.

4. **Bounded repair**
   - Permit one repair after an invalid decision.
   - Rebuild the same relevant state context and add only:
     - Prior runtime validation codes.
     - Allowed decision types.
     - Current state version.
     - The replaced decision ID.
     - An instruction not to repeat the invalid structure.
   - Do not reproduce invalid arguments.
   - If the repair is also invalid, execute nothing and return a deterministic blocked response.
   - Never fall back to the legacy loop after typed execution starts.

5. **Execution-time freshness and authorization**
   - Treat `basedOnStateVersion` as the decision’s source version, not as a value that must naïvely equal the live version after lifecycle bookkeeping.
   - Before execution, inspect all accepted transitions since `basedOnStateVersion`.
   - Ignore only transitions belonging to that same decision:
     - Its proposed/accepted records.
     - Its approval request.
     - A plain approval response with no new instructions.
   - Supersede the decision if intervening state contains user steering, changed approval instructions, intent revision, unrelated actions/observations, cancellation, or another material state change.
   - After a fresh approval, create `decision_execution_authorized` against the latest state version.
   - Check the AbortSignal and confirm no state transition occurred after authorization before entering the executor.
   - Add a narrow callback at the existing approval-to-execution seam so mutation authorization happens after approval but before filesystem, command, graph, or editor effects.
   - A denied approval marks the decision `rejected` with `authorization_denied`; changed instructions mark it `superseded` and cause a new decision.
   - Read-only tools receive the same immediate pre-execution authorization check without requesting approval.

6. **Tool and control execution**
   - Real tools continue through the existing executor, approvals, security policy, stale-write checks, amendment handling, activity tracking, evidence ledger, and observation normalizer.
   - Mark a decision `executed` when the executor was entered, regardless of whether its normalized outcome succeeded, partially succeeded, or failed.
   - `request_user_input` uses the existing clarification callback, preserves the response verbatim, and refreshes the intent contract through the existing validated path when applicable.
   - `propose_completion` supplies a candidate to the current completion assessment and steering path. The model does not gain completion authority.
   - Runtime cancellation remains authoritative and may stop the run at any point without executing the pending decision.

7. **Credible blocked reporting**
   - Require `agent_report_blocked` to provide:

     ```js
     {
       blockerType: "missing_information" |
                    "permission_denied" |
                    "unavailable_capability" |
                    "external_failure",
       description,
       attemptedDecisionIds: [],
       recoverableByUser,
       requiredUserAction: "",
       requiredCapability: ""
     }
     ```

   - Validate every attempted decision ID against AgentState.
   - `permission_denied` requires a cited denied authorization or approval.
   - `external_failure` requires a cited executed decision with failed or partial evidence.
   - `missing_information` with `recoverableByUser: true` is rejected while the clarification callback is available; the model must use `agent_request_user_input`.
   - `unavailable_capability` requires a named capability and is rejected if it contradicts an exact currently available tool.
   - M4 validates structure and internal consistency only; semantic blocker verification remains later work.

8. **Provider compatibility and observability**
   - Map `toolChoice: "required"` to Gemini `ANY`; OpenAI-compatible and LiteLLM already forward it.
   - Emit content-limited `agent-decision` lifecycle events containing IDs, status, type, tool name, intent reference, state versions, and runtime reason codes.
   - Do not emit raw arguments, malformed payloads, or hidden reasoning.
   - Store the final decision lifecycle in AgentState snapshots without adding user-visible rendering.

## Test plan and exit criteria

- Unit-test schema decoration, metadata stripping, normalization, lifecycle transitions, reason-code ownership, intent references, and provider metadata preservation.
- Verify text-only, unknown-tool, malformed, missing-metadata, stale, and multi-call decisions execute nothing.
- Verify a repaired decision references the rejected decision without storing its invalid arguments.
- Test AgentState v3 decision history, state-version monotonicity, allowed lifecycle transitions, supersession, and v1/v2 snapshot compatibility.
- Test approval concurrency:
  1. A mutation is proposed from state version N.
  2. Approval begins.
  3. User steering or changed instructions advance authoritative state.
  4. The user approves the original operation.
  5. The original decision becomes `superseded`.
  6. No mutation executes.
  7. Context is rebuilt and a new decision is requested.
- Test plain approval without steering creates fresh authorization and executes exactly once.
- Test cancellation between approval and execution prevents execution.
- Test blocker validation for all four blocker types and contradictory claims.
- Test read → observation → rebuilt context, approval denial, restart-safe approval replay, clarification, completion proposal, and honest blocked completion.
- Assert flag-off Agent messages, tool selection, approvals, and completion behavior remain unchanged.
- Assert protected modes and specialized AI components never import or instantiate the controller.
- Extend evaluation reports with:
  - Proposed, accepted, rejected, executed, and superseded counts.
  - Repair rate.
  - Stale-decision rate.
  - `_decision` metadata rejection rate.
  - Original tool-argument rejection rate.
  - Legacy versus decorated tool-argument validity.
- Run the M0 suite three times against target and reference providers with the controller off, then on for Agent cases.
- M4 exits only with:
  - Zero invalid, rejected, stale, or superseded actions executed.
  - Zero multi-action executions from one decision.
  - Zero mutation-policy or protected-mode violations.
  - Controller-on Agent deterministic pass rate no lower than legacy.
  - Controller-on false-completion rate no higher than legacy.
  - No significant decorated-tool argument-validity regression.
  - Full desktop unit suite passing.
- The flag remains default-off after M4.

## Expected files to change:

- [agent-decision-controller.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-decision-controller.js) — new decision tools, validation, repair, blocker validation, freshness checks, and safe event projection.
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js) — Agent-only controller branch and post-approval/pre-execution authorization seam.
- [agent-state.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state.js) — schema v3 and complete decision lifecycle transitions.
- [agent-state-shadow.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-state-shadow.js) — strict controller session, transition-since inspection, and preserved shadow behavior.
- [Agent mode](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js) — flag resolution and selected state-session wiring.
- [headless defaults](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js) — internal default-off flag normalization.
- [browser settings](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js) — matching normalization without UI.
- [Gemini connector](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/providers/gemini-connector.js) — required-any-function mapping.
- [AI Companion panel](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js) — v3 snapshot acceptance with v1/v2 compatibility.
- [controller tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-decision-controller.test.js) — decision, repair, concurrency, authorization, control-action, and integration coverage.
- [AgentState tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-agent-state.test.js) — v3 reducer, lifecycle, and snapshot coverage.
- [observation/context tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-observation-context.test.js) — authoritative context and strict-failure coverage.
- [Gemini tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-gemini-connector-provider.test.js) — required tool-choice and thought-signature preservation.
- [mode-boundary tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js) — Agent-only controller enforcement.
- [storage tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-storage.test.js) — v1/v2/v3 persistence compatibility.
- [evaluation runner](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-mode-runner.js) — control-call classification and decision lifecycle metrics.
- [evaluation reporting](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-baseline-eval.js) — paired legacy/decorated validity and controller-quality reporting.

## Assumptions and exclusions

- M0–M3 at the current repository HEAD remain prerequisites.
- M4 changes only ordinary Agent decisions; intent extraction, completion assessment, tools, security policy, and approval policy retain their current ownership.
- The runtime, never model rationale, decides authorization and execution freshness.
- Rejected repair predecessors stay rejected; supersession applies to previously accepted decisions invalidated by newer state.
- Completion authority remains M5 work; progress detection and validated replanning remain M6; durable recovery remains M7.
- Plan and Chat controller adoption remains M8 and M9.
- No specialized AI component, public application API, visible setting, or unrelated code changes.
