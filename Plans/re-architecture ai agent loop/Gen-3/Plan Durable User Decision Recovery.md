# Plan: Durable User Decision Recovery

## Summary

Make a pending model-requested question survive application restart as an executable interaction.

After recovery, the same question will become interactive again, retain its interaction and tool-call identity, wait for the user’s answer, append that answer as the original tool result, and continue the model loop exactly once. The model will not need to recreate or reinterpret the question.

This remains runtime infrastructure—not hard-coded task behavior or semantic evaluation.

## Implementation Changes

### 1. Durable interaction state

- Advance the pending-interaction snapshot from version 1 to version 2.
- Store:
  - Interaction ID.
  - Original tool-call ID.
  - Questions, choices, reason, and request timestamp.
  - State: `waiting`, `answered`, or `declined`.
  - Normalized response and response timestamp when available.
- Pass the tool-call ID from the executor into `InteractionGate.requestChoice()`.
- Persist `waiting` before opening the live bridge request.
- Persist `answered` or `declined` before returning the result to the tool loop.
- Never serialize promises, callbacks, bridge objects, or approval authority.

### 2. Safe tool-result acknowledgement

- Stop clearing the pending interaction immediately in `requestChoice()`’s `finally` block.
- Keep a resolved interaction until its corresponding tool-result message has been appended to the transcript and recovery snapshot.
- Add an acknowledgement method that clears the interaction only after the loop confirms the matching tool result is present.
- This closes the crash window between receiving the answer and recording it in model context.

### 3. Executable restart reconciliation

- Recognize a pending `request_user_choice` call as a recoverable interaction rather than an uncertain generic tool call.
- Do not inject the normal “unknown outcome” tool error for that call.
- For a restored `waiting` interaction:
  - Recreate the bridge-side pending resolver.
  - Emit the original question with `restored: true`.
  - Pause provider execution until the user answers or declines.
  - Persist the response and append it under the original tool-call ID.
- For a restored `answered` or `declined` interaction:
  - Do not ask again.
  - Append the saved response if its tool result is absent.
- Continue the model loop only after a valid tool-call/result pair exists.

### 4. Backward-compatible recovery

- Read existing version-1 interaction snapshots.
- Derive the tool-call ID only when there is exactly one unmatched `request_user_choice` call in the saved transcript or pending-tool list.
- If identity cannot be established safely:
  - Preserve the existing interruption behavior.
  - Emit a visible recovery warning.
  - Do not attach an answer to an ambiguous tool call.
- No global recovery-schema version increase is required; this is a backward-compatible nested-state upgrade.

### 5. Bridge and UI rebinding

- Reuse the existing bridge request/response protocol to register a new live resolver for the restored interaction ID.
- Reject stale or duplicate responses after the first accepted answer.
- Ensure an interaction ID remains scoped to its active run.
- When the restored live event arrives, replace the historical noninteractive card with an interactive card rather than displaying a duplicate.
- Mark the card as restored while preserving the original questions and selections.
- Persist the resolved UI state after submission or decline.

### 6. Events and recovery history

- Continue using the existing:
  - `user-input-requested`
  - `user-input-resolved`
  - `user-input-declined`
- Add `restored: true` and recovery metadata instead of introducing parallel event types.
- Record waiting, response-received, result-consumed, and recovery-rebound boundaries in the run chronicle.
- Do not expose private worker transcripts or internal callback state.

## Public Interfaces

- `InteractionGate.requestChoice(input, { toolCallId })`
- `InteractionGate.restore(snapshot, recoveryContext)`
- `InteractionGate.resumePending()`
- `InteractionGate.acknowledgeToolResults(toolMessages)`
- Pending-interaction snapshot version 2.
- User-input events gain optional:
  - `restored`
  - `toolCallId`
  - `responseRecordedAt`

## Test Plan

- A question answered without restart retains existing behavior.
- Restart while waiting redisplays the exact question as interactive.
- No provider request occurs while the restored question awaits an answer.
- The answer becomes the tool result for the original tool-call ID.
- Declining produces a valid declined result and resumes the loop.
- Restart after answer receipt but before tool-result consumption does not ask again.
- Restart after tool-result persistence does not append a duplicate result.
- Duplicate and stale bridge responses are rejected.
- Cancellation remains terminal and does not resurrect the question.
- Version-1 snapshots recover when the tool call can be identified uniquely.
- Ambiguous version-1 snapshots fail safely with a visible warning.
- Historical UI cards are replaced rather than duplicated.
- A complete restart scenario answers the restored question and publishes exactly one final response.
- Existing ordinary questions, approvals, recovery, compaction, and worker tests remain passing.

## Expected files to change:

- [interaction-gate.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/interaction/interaction-gate.js)
- [tool-executor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/tool-executor.js)
- [autonomous-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-loop.js)
- [autonomous-orchestrator.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/autonomous-orchestrator.js)
- [restart-reconciler.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/recovery/restart-reconciler.js)
- [AI Companion bridge](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [advanced autonomous tool tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-advanced-tools.test.js)
- [autonomous recovery tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-autonomous-continuity.test.js)
- [panel interaction tests](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-panel-preferences.test.js)

## Intentionally Unchanged

- Question content remains model-controlled.
- The runtime will not decide whether a question is necessary.
- No automatic task decomposition, completion evaluation, or semantic response policing will be introduced.
- Approvals and user-information questions remain separate mechanisms.
- Worker runs remain unable to independently present foreground user questions.