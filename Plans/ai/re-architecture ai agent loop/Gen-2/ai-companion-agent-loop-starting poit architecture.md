# AI Companion Agent Loop Architecture

## Purpose

This document describes the current architecture of an IDE-based AI companion, identifies the orchestration capability that is currently missing, and proposes a structure for planning its implementation.

The main problem is not that the language model lacks intelligence. The problem is that too much responsibility is currently implicit inside one model invocation.

The system already understands the user's requested outcomes and can verify whether those outcomes were achieved. What it lacks is an explicit component responsible for deciding, at each moment, what should happen next.

---

## Current System

The AI companion currently has the following capabilities.

### 1. User prompt intake

The system receives a natural-language request from the user.

Example:

> Fix the bug that causes the editor preview to stop updating after changing tabs.

### 2. Intent extraction

The system analyzes the prompt and extracts one or more intents or required outcomes.

Example:

```json
{
  "intents": [
    {
      "id": "intent-1",
      "description": "Identify the cause of the preview update bug"
    },
    {
      "id": "intent-2",
      "description": "Modify the implementation to fix the bug"
    },
    {
      "id": "intent-3",
      "description": "Verify that preview updates continue after changing tabs"
    }
  ]
}
```

### 3. Tool definitions and execution

The model is informed about available tools, such as:

- Search files or symbols
- Read files
- Edit files
- Create files
- Run tests
- Run builds
- Inspect diagnostics
- Read logs
- Query project metadata

The runtime can execute a selected tool and return the tool result to the model.

### 4. Intent tracking

The harness tracks which intents are:

- Pending
- In progress
- Satisfied
- Failed
- Blocked

### 5. Evidence collection

The system can require evidence before marking an intent as satisfied.

Examples of evidence:

- A relevant source file was inspected
- A code change was applied
- A test passed
- A build completed successfully
- A diagnostic disappeared
- A runtime observation matches the requested behavior

### 6. Verification and retry

The system can determine that an intent has not yet been satisfied and instruct the agent to retry.

This provides an outcome-validation loop.

---

## What the Current System Is Missing

The missing component is an explicit **next-action decision engine**.

This component may also be called:

- Planner
- Policy
- Controller
- Orchestrator
- Decision engine
- Agent brain
- Action selector
- Replanning loop

In reference agent-loop diagrams, this responsibility is represented by the model-evaluation step.

In that context, “evaluates” does not primarily mean grading or testing the agent. It means:

> Examine the current state and decide what to do next.

The decision engine must determine whether the system should:

- Search for information
- Read a file
- Inspect a symbol
- Read another related file
- Edit code
- Run a test
- Inspect a failure
- Revise the current hypothesis
- Replan
- Ask the user for missing information
- Mark an intent complete
- Produce the final response

Currently, these decisions are left implicitly to the model while it is also expected to remember the goal, maintain the plan, interpret tool results, verify progress, recover from mistakes, and know when to stop.

That can work for simple tasks, but it becomes unreliable as tasks grow longer or require multiple tools.

---

## Important Distinction: Verification vs. Decision

The system already has verification logic. Verification and next-action selection are different responsibilities.

### Verification asks

> Did the previous action produce the required result?

Examples:

- Did the file search return relevant files?
- Did the edit apply successfully?
- Did the test pass?
- Is there enough evidence to mark this intent as satisfied?

### Decision asks

> Given everything known now, what is the best next action?

Examples:

- Should another file be read?
- Should the current hypothesis be abandoned?
- Is it time to edit?
- Which test should be run?
- Is the task finished?

A verifier judges progress.

A decision engine chooses the next move.

Both are required.

---

## Proposed Agent Loop

The proposed architecture is:

```text
User Prompt
    |
    v
Intent Extraction
    |
    v
Initialize Agent State
    |
    v
Next-Action Decision Engine
    |
    +--> Tool Call -------------------+
    |                                 |
    |                                 v
    |                           Tool Execution
    |                                 |
    |                                 v
    |                           Observation / Result
    |                                 |
    |                                 v
    |                         State Update + Verification
    |                                 |
    +---------------------------------+
    |
    +--> Final Response
```

The loop continues until the decision engine chooses a terminal action.

---

## Recommended Blocks

## Block 1: Goal and Intent Model

### Responsibility

Represent what the user wants the system to achieve.

### Inputs

- User prompt
- Project context
- Conversation context

### Outputs

- Structured intents
- Constraints
- Acceptance criteria
- Required evidence
- Priority relationships

### Current status

This block already exists.

---

## Block 2: Agent State Store

### Responsibility

Maintain the authoritative state of the current run.

The model should not be expected to reconstruct the complete state from an unstructured conversation transcript on every iteration.

### Suggested state

```json
{
  "goal": "Fix the preview update bug after tab changes",
  "intents": [],
  "activeIntentId": "intent-1",
  "completedIntentIds": [],
  "failedIntentIds": [],
  "constraints": [],
  "knownFacts": [],
  "openQuestions": [],
  "hypotheses": [],
  "filesInspected": [],
  "filesModified": [],
  "toolHistory": [],
  "evidence": [],
  "currentPlan": [],
  "lastAction": null,
  "lastObservation": null,
  "iteration": 0,
  "terminationReason": null
}
```

### Current status

Some of this likely exists indirectly in the harness, but it should become an explicit and normalized state object.

---

## Block 3: Next-Action Decision Engine

### Responsibility

Select the next best action based on the current state.

This is the main missing block.

### Inputs

- Original user goal
- Structured intents
- Intent statuses
- Evidence collected
- Known project facts
- Current hypotheses
- Previous actions
- Latest tool result
- Available tools
- Constraints and permissions
- Remaining execution budget

### Output

Exactly one structured decision.

Example:

```json
{
  "action": "read_file",
  "reason": "The search result shows that preview refresh is triggered from TabManager.js. The file must be inspected before editing.",
  "intentId": "intent-1",
  "tool": "read_file",
  "arguments": {
    "path": "src/editor/TabManager.js"
  },
  "expectedObservation": "The code path responsible for notifying the preview after a tab switch",
  "successCriteria": "The file reveals either the refresh call or the event chain leading to it",
  "fallback": "Search for usages of refreshPreview and activeTabChanged"
}
```

### Terminal decision example

```json
{
  "action": "final_response",
  "reason": "All required intents are satisfied and supported by evidence.",
  "summary": "The bug was fixed and the relevant tests pass."
}
```

### Design principle

The model still performs reasoning, but the runtime constrains the result to a small, explicit decision contract.

The deterministic system controls execution.

The model proposes the next action.

---

## Block 4: Tool Executor

### Responsibility

Validate and execute the selected tool call.

### Duties

- Confirm that the tool exists
- Validate arguments against the tool schema
- Enforce permissions
- Enforce file or workspace scope
- Execute the operation
- Capture structured results
- Capture errors
- Prevent unsupported actions
- Apply timeout and resource limits

### Current status

This block already exists.

---

## Block 5: Observation Normalizer

### Responsibility

Convert raw tool output into a form useful to the decision engine and verifier.

A raw command result or large source file should not always be inserted directly into the model context without processing.

### Example normalized observation

```json
{
  "tool": "run_tests",
  "status": "failed",
  "summary": "One of 42 tests failed",
  "importantDetails": [
    "PreviewControllerTest.refreshesAfterTabChange failed",
    "Expected refresh count: 2",
    "Actual refresh count: 1"
  ],
  "artifacts": [
    "build/test-results/PreviewControllerTest.xml"
  ]
}
```

### Current status

This may exist partially. It should be explicit if raw tool output is currently passed directly to the model.

---

## Block 6: State Updater

### Responsibility

Update the agent state after each observation.

### Possible updates

- Add newly discovered facts
- Record inspected files
- Record modified files
- Add or reject hypotheses
- Attach evidence to an intent
- Update intent status
- Record tool failures
- Track repeated actions
- Increment the iteration counter

### Important rule

The state update should not rely entirely on free-form conversational memory.

Some updates can be deterministic. Others may require a small model call that produces a structured state patch.

---

## Block 7: Verifier

### Responsibility

Determine whether an intent or the overall goal has been satisfied.

### Inputs

- Intent definition
- Acceptance criteria
- Evidence
- Tool results
- Current project state

### Output example

```json
{
  "intentId": "intent-3",
  "status": "satisfied",
  "confidence": 0.96,
  "evidenceIds": [
    "evidence-test-42",
    "evidence-build-7"
  ],
  "reason": "The regression test passed and the full project build completed successfully."
}
```

### Current status

This block already exists.

---

## Block 8: Stop Controller

### Responsibility

Prevent the agent from stopping too early or continuing indefinitely.

### Stop conditions

The loop may stop when:

- All required intents are satisfied
- Required evidence is present
- No unresolved blocking issue remains
- The decision engine selects `final_response`
- The user must provide information
- Permissions prevent further progress
- The action or token budget is exhausted
- The same failed strategy is repeating
- A fatal tool or environment failure occurs

### Current status

The system appears to have partial completion checks, but it currently lacks a clear agent-level stop decision.

---

## Block 9: Final Response Composer

### Responsibility

Explain the result to the user after the execution loop has terminated.

The final response should be based on structured state rather than on the model's memory of the entire run.

### Inputs

- Goal
- Intent results
- Changes made
- Evidence
- Tests and validation
- Remaining limitations
- Termination reason

### Current status

A response mechanism probably exists, but it should only run after an explicit terminal decision.

---

## What Should Remain Deterministic

The following responsibilities should normally belong to the runtime or harness:

- Tool registration
- Tool schema validation
- Permission enforcement
- Workspace boundaries
- State persistence
- Action history
- Intent status storage
- Evidence storage
- Iteration limits
- Cost limits
- Duplicate-action detection
- Loop detection
- Required-evidence enforcement
- Terminal condition enforcement
- Tool execution

These parts should not depend on the model remembering to perform them.

---

## What the Model Should Decide

The model is useful where semantic judgment is required:

- Which unresolved intent should be handled next?
- Which available tool is most useful now?
- Which file or symbol is most relevant?
- What does the latest observation imply?
- Is the current hypothesis still plausible?
- Should the plan change?
- Is more evidence required?
- Is the task complete?
- What should be communicated to the user?

The goal is not to remove planning from the model.

The goal is to make planning explicit, observable, constrained, and recoverable.

---

## Plan-First vs. Step-by-Step Planning

There are two useful planning modes.

## Full initial plan

The model creates a multi-step plan before using tools.

Example:

```json
{
  "steps": [
    "Locate preview update logic",
    "Trace the tab-change event path",
    "Identify the missing refresh notification",
    "Apply the fix",
    "Run focused tests",
    "Run broader validation"
  ]
}
```

### Advantages

- Gives the user and runtime visibility
- Helps identify dependencies
- Supports parallel work where possible
- Creates a useful expected path

### Limitations

- The initial plan is based on incomplete information
- Later observations may invalidate it
- The agent may follow a bad plan too rigidly

## Step-by-step planning

The model selects only the next action after each observation.

### Advantages

- Adapts naturally to new information
- Avoids overcommitting to speculative steps
- Matches the normal tool-use loop

### Limitations

- Can become locally reactive
- May lose the broader strategy
- Can repeat unproductive actions

## Recommended hybrid

Use both:

1. Generate a lightweight initial plan.
2. Select one concrete action at a time.
3. Re-evaluate the plan after important observations.
4. Modify, replace, or abandon plan steps when evidence requires it.

The plan is guidance, not an immutable script.

---

## Example Execution

### User request

> Fix the bug that prevents the preview from refreshing after switching tabs.

### Initial intents

```text
1. Reproduce or understand the failure.
2. Locate the responsible code path.
3. Apply a minimal fix.
4. Verify the behavior.
```

### Iteration 1

Decision:

```text
Search for preview refresh and tab-change handlers.
```

Observation:

```text
Relevant matches found in PreviewController.js, TabManager.js, and EditorView.js.
```

### Iteration 2

Decision:

```text
Read TabManager.js because it owns the active-tab transition.
```

Observation:

```text
TabManager emits activeTabChanged after updating internal state.
```

### Iteration 3

Decision:

```text
Read PreviewController.js to inspect its subscription to activeTabChanged.
```

Observation:

```text
The controller subscribes during initialization but unsubscribes when the old tab closes and does not resubscribe.
```

### Iteration 4

Decision:

```text
Update the subscription lifecycle in PreviewController.js.
```

Observation:

```text
Edit applied successfully.
```

### Iteration 5

Decision:

```text
Run the focused preview controller test suite.
```

Observation:

```text
All focused tests pass.
```

### Iteration 6

Decision:

```text
Run the broader editor integration tests.
```

Observation:

```text
All editor integration tests pass.
```

### Iteration 7

Verification:

```text
All intents are satisfied and supported by code inspection, a source change, and passing tests.
```

Decision:

```text
Produce the final response.
```

---

## Handling a Wrong Decision

Assume the agent reads an unrelated file.

The runtime should not need to know deterministically that the file was wrong in every case.

Instead, the system should observe that the action did not produce useful information.

Example:

```json
{
  "action": "read_file",
  "path": "src/theme/ColorPalette.js"
}
```

Observation:

```json
{
  "relevance": "low",
  "newFacts": [],
  "intentProgress": "none"
}
```

The verifier or state updater records that no progress was made.

The next-action decision engine then receives:

- The same unresolved intent
- No useful evidence from the previous action
- A record of the unproductive file read
- Other candidate search results

It should choose a different action.

The system can also add deterministic protections:

- Do not repeat the same action with the same arguments
- Penalize actions that produced no progress
- Detect repeated low-relevance observations
- Trigger replanning after several unproductive steps
- Require the decision engine to state the expected information gain before executing a read-only action

---

## Suggested Decision Contract

The next-action engine should return one of a small number of action types.

```json
{
  "type": "tool_call | update_plan | request_user_input | mark_intent | final_response | abort",
  "intentId": "string or null",
  "reason": "string",
  "tool": "string or null",
  "arguments": {},
  "expectedObservation": "string or null",
  "successCriteria": "string or null",
  "planChanges": [],
  "confidence": 0.0
}
```

The runtime should reject outputs that do not match the schema.

---

## Suggested Control Loop Pseudocode

```javascript
async function runAgent(userPrompt) {
  const intents = await extractIntents(userPrompt);
  let state = createInitialState(userPrompt, intents);

  while (true) {
    enforceBudgets(state);
    detectLoops(state);

    const decision = await decideNextAction(state, toolDefinitions);
    validateDecision(decision, toolDefinitions);

    if (decision.type === "final_response") {
      ensureCompletionRequirements(state);
      return composeFinalResponse(state, decision);
    }

    if (decision.type === "request_user_input") {
      return composeUserQuestion(state, decision);
    }

    if (decision.type === "abort") {
      return composeFailureResponse(state, decision);
    }

    if (decision.type === "update_plan") {
      state = applyPlanUpdate(state, decision);
      continue;
    }

    if (decision.type === "mark_intent") {
      state = applyIntentUpdate(state, decision);
      continue;
    }

    const rawResult = await executeTool(decision.tool, decision.arguments);
    const observation = normalizeToolResult(rawResult, decision);

    state = updateState(state, decision, observation);
    state = await verifyRelevantIntents(state, decision, observation);
  }
}
```

---

## Avoiding Excessive Model Calls

The architecture does not require a separate large model call for every block.

A practical implementation may combine related responsibilities.

### Possible model call structure

#### Call 1: Intent extraction

Runs once at the start, and again only when the goal changes.

#### Call 2: Decide and interpret

On each iteration, one model call can:

- Interpret the latest observation
- Update semantic state
- Revise the plan
- Choose the next action

It must return a structured response.

#### Call 3: Verification

Run only when:

- An intent may have been completed
- A major edit was made
- Tests completed
- The agent wants to terminate

Some verification should remain deterministic.

### Key point

The important architectural change is separation of responsibilities and explicit state, not necessarily a separate model invocation for every box.

---

## Minimum Viable Implementation

The first version does not require a sophisticated planning framework.

Implement the following:

1. Create an explicit `AgentState` object.
2. Add a `decideNextAction(state, tools)` model call.
3. Require one structured action per iteration.
4. Store each decision and observation in the state.
5. Feed current intent statuses and evidence into every decision.
6. Add explicit terminal actions.
7. Reject final completion when required intents or evidence are missing.
8. Add loop and repeated-action detection.
9. Support plan revision after failed or unproductive actions.

This would supply the main missing orchestration layer without replacing the existing intent and verification system.

---

## Current Architecture Assessment

Based on the current description:

| Capability | Status |
|---|---|
| Receive user prompt | Exists |
| Extract intents | Exists |
| Define tools | Exists |
| Execute tools | Exists |
| Track required outcomes | Exists |
| Collect evidence | Exists |
| Verify intent completion | Exists |
| Retry failed intents | Exists |
| Maintain explicit normalized run state | Partial or implicit |
| Create an initial strategy | Missing or implicit |
| Select the next action on every iteration | Missing as an explicit component |
| Revise the plan from observations | Missing or implicit |
| Decide when more information is needed | Missing or implicit |
| Decide when the whole task is complete | Partial, but not owned by a clear controller |
| Detect unproductive action loops | Should be added |
| Produce a final response from structured state | Should be formalized |

---

## Questions for Planning the Implementation

Use the following questions when reviewing the existing codebase:

1. Where is the current agent run state stored?
2. Is the state structured, or only represented in model messages?
3. Which component currently chooses a tool?
4. Which component decides that no tool is needed?
5. Which component decides that the task is complete?
6. Can the model explicitly revise a plan?
7. Can the runtime distinguish between no progress and meaningful progress?
8. How are tool observations summarized and stored?
9. How are facts separated from hypotheses?
10. How is evidence attached to individual intents?
11. What prevents the same unsuccessful action from repeating?
12. What execution budgets exist?
13. What happens when the model chooses an invalid or unavailable tool?
14. What happens when a tool succeeds technically but provides irrelevant information?
15. What exact conditions allow the final response to be generated?

---

## Prompt for Codex

Use the following instructions together with this document:

> Review the current AI companion implementation and compare it against the architecture described in this document.
>
> Do not implement changes yet.
>
> First, inspect the codebase and identify:
>
> 1. Which described blocks already exist.
> 2. Where each block is implemented.
> 3. Which responsibilities are currently combined inside model prompts or agent callbacks.
> 4. Which state is explicit and which state exists only in conversation history.
> 5. Which component currently selects the next tool or action.
> 6. Which component currently decides that the task is complete.
> 7. What is missing to introduce an explicit next-action decision engine.
> 8. What existing code can be reused.
> 9. What minimal changes would produce a working first version.
> 10. What risks, migration concerns, and testing requirements exist.
>
> Then produce an implementation plan containing:
>
> - Current architecture map
> - Gap analysis
> - Proposed component boundaries
> - Proposed `AgentState` schema
> - Proposed decision-output schema
> - Control-loop pseudocode adapted to this codebase
> - Exact files likely to be added or modified
> - Incremental implementation stages
> - Unit, integration, and evaluation tests
> - Observability and logging requirements
> - Backward-compatibility considerations
>
> Do not assume that every conceptual block requires a separate model call or class. Prefer the smallest design that makes state, decisions, verification, and termination explicit.

---

## Final Summary

The current system already has two important capabilities:

1. It understands what outcomes the user requested.
2. It checks whether those outcomes were achieved.

The missing capability is the explicit control layer between them:

> Given the current state, what should the agent do next?

That control layer should use the model for semantic reasoning while relying on deterministic code for state, execution, permissions, validation, evidence, budgets, and loop control.

The model remains the reasoning engine, but it no longer carries the complete orchestration process implicitly inside an unstructured conversation.
