---
tags: []
---
# AI Companion Agent Loop, Modes, And Harness Summary

This overview details the AI Companion harness implemented within the MD Editor desktop application, covering the core agent loop, operating modes (**Chat**, **Agent**, **Plan**, **Autocomplete**, **Git Summary**), instruction layers, feedback mechanisms, tool activation architecture, closed-loop completion steering, actions, workflows, triggers, and events.

---

## 1. Core Architecture And Runtime Flow

AI Companion bridges the Neutralino renderer interface with a local Node.js runtime process (`ai-companion-bridge.cjs`). 

- **Renderer Interface:** `resources/js/ai-companion/panel.js` renders the side panel UI, chat/task records, approval cards, composer inputs, and activity trails via `activity-renderer.js`.
- **Bridge Client:** `resources/js/ai-companion/neutralino-ai-bridge.js` starts the child process and routes newline-delimited JSON messages over `stdio`.
- **Runtime Core:** `resources/ai-companion/core/` houses the execution loop, tool definitions, intent evaluation, completion assessment, and completion steering.

---

## 2. Operating Modes

| Mode | Main Behavior |
| --- | --- |
| **Chat** | Read-oriented project Q&A with bounded conversation history and prompt attachments. |
| **Agent** | Multi-step autonomous work with tool calling, approval gates for writes/commands/tests, and closed-loop verification. |
| **Plan** | Reviewable planning and structuring without file mutation. |
| **Autocomplete** | Inline ghost text suggestions in active editor tabs. |
| **Git Summary** | Commit message and PR notes generator derived from Git status and patch context. |

---

## 3. Core Agent Tool Loop (`agent-tool-loop.js`)

The core execution loop orchestrates multi-turn model interactions and tool execution:
1. **Intent Contract Formulation:** Analyzes user prompts to establish acceptance criteria, constraints, and task type.
2. **Tool Selection & Execution:** Dynamic tool groups (workspace file tools, editor action tools, graph tools, Git tools, API Client tools, and plan tools) are filtered by mode and security policy.
3. **Approval Gates:** Mutating operations require explicit user approval via policy control before execution.
4. **Completion Assessment:** Evaluates candidate output against the intent contract's acceptance criteria using `completion-assessment.js` and `completion-arbiter.js`.

---

## 4. Closed-Loop Completion Steering

When an agent run completes an initial pass with an `incomplete` verdict, the harness initiates **Closed-Loop Completion Steering** (`completion-steering.js`):
- **Arbiter Routing:** Categorizes incomplete verdicts and determines whether to `continue`, `revise-contract`, or `stop`.
- **Bounded Revisions:** Controlled by settings `intentCompletionSteeringEnabled` and `intentMaxCompletionRevisions` (default max 3 extra passes).
- **Contract Clarification:** For ambiguity or spec-gap classes, `runSteeringClarification()` automatically requests user clarification and updates the authoritative contract before the next steered agent pass.
- **Evidence & Evaluation Tracking:** Records convergence state, iteration counts, and final reasons in `intent-evaluation.js`.

---

## 5. Instruction Layers And Preferences

- **System Prompts & Profiles:** `resources/ai-companion/config/prompts.js` defines behavioral instructions and steering discipline constraints.
- **Preferences & Defaults:** Configured via `resources/ai-companion/config/defaults.js` and managed in `desktop-app/resources/js/ai-companion/settings.js`.

---

## 6. M0 Baseline And Controller Boundary

M0 is an observation-only baseline. It does not change production prompts, modes, tools, storage, provider transport, or UI behavior.

- **Controller-eligible modes:** Chat, Plan, and Agent are the only modes measured for the future conversational controller.
- **Protected specialized actions:** Autocomplete, Git Summary, connection and certificate checks, plan-repository actions, prompt-profile actions, security-policy actions, and approval-grant actions remain outside that controller.
- **Legacy Git Summary path:** Git Summary currently calls `runAgentToolLoop` with mode `gitSummary`. Future controller work must route Chat, Plan, and Agent beside this legacy path rather than changing the shared loop underneath Git Summary.

The versioned dataset is `tests/eval/ai-companion-baseline-cases.json`. Every run uses disposable workspace and profile directories; profile isolation is required because Plan mode saves a plan even though it does not mutate the workspace.

Run a schema-only validation without contacting either provider:

```powershell
npm run eval:ai-companion:baseline -- --config tests/eval/ai-companion-eval-config.example.json --suite full --dry-run
```

Run the opt-in local target/reference evaluation:

```powershell
npm run eval:ai-companion:baseline -- --config <local-config.json> --suite full --repetitions 3 --output tests/eval/results/m0-baseline
```

After completing the provider-blind human fields in `blind-scoring.json`, generate the report:

```powershell
npm run eval:ai-companion:report -- --runs tests/eval/results/m0-baseline/runs.jsonl --scores tests/eval/results/m0-baseline/blind-scoring.json --key tests/eval/results/m0-baseline/scoring-key.json --output tests/eval/results/m0-baseline
```

Raw runs and scoring files stay under the ignored `tests/eval/results/` directory. Only a sanitized aggregate may replace `tests/eval/baselines/m0-baseline.json`.
