# M0 — Baseline, Evaluation Harness, and Mode Boundaries

## Summary

M0 introduces no production behavior changes. It establishes a repeatable baseline for Chat, Plan, and Agent while locking Autocomplete, Git Summary, connection tests, and every other specialized bridge action outside the future conversational controller.

Real-model evaluations will be opt-in and local. The full baseline will compare the currently used model with one stronger reference model. Deterministic harness and boundary tests will run in the normal test suite.

## Implementation order

1. **Define the evaluation contract**
   - Add a versioned dataset with exactly 24 scenarios: 8 Chat, 8 Plan, and 8 Agent.
   - Mark six cases as a fast smoke suite and include at least two multi-turn cases per mode.
   - Cover direct conversational prompts, repository-grounded questions, ambiguity, planning, diagnostics, implementation, approval denial, tool failure, blocked work, and honest incomplete completion.
   - Declare `chat`, `plan`, and `agent` as evaluated/controller-eligible modes. All other bridge actions are protected and ineligible.

2. **Build the isolated mode runner**
   - Invoke the existing `runChatMode`, `runPlanMode`, and `runAgentMode` entry points without changing them.
   - Create a fresh temporary workspace and profile directory for every case, model, and repetition.
   - Populate fixture files, capture pre/post workspace hashes, and delete the isolated environment afterward.
   - Instrument the provider and emitted events to record model calls, token usage, tool calls, failures, clarifications, approvals, evidence, duration, final response, and workspace changes.
   - Feed multi-turn cases through the existing `conversationHistory` field.
   - Default all approvals to denial; cases requiring mutation explicitly allow only their declared workspace files or commands.
   - Run cases sequentially because provider substitution uses the shared runtime module.

3. **Add the developer evaluation CLI**
   - Add `npm run eval:ai-companion:baseline -- --config <path> [--suite smoke|full] [--repetitions 3] [--output <dir>]`.
   - Add `npm run eval:ai-companion:report -- --runs <file> --scores <file> --key <file> --output <dir>`.
   - The configuration contains exactly two entries with roles `target` and `reference`, using the existing normalized provider settings schema.
   - API keys are referenced by environment-variable name; secrets are rejected from committed configuration and removed from output.
   - Support `--dry-run` for schema, fixture, configuration, and case validation without model calls.

4. **Produce scoring and reports**
   - Write ignored local artifacts: `runs.jsonl`, `blind-scoring.json`, `scoring-key.json`, `scored-runs.json`, `baseline-report.json`, and `baseline-report.md`.
   - Keep provider identity hidden from the human scoring packet.
   - Human scoring covers task success, answer correctness, plan usefulness, completion honesty, and case-specific criteria.
   - Deterministic scoring covers workspace mutation violations, expected file changes, required or forbidden tools, unnecessary tool use, duplicate tool calls, missing evidence, failed actions, output shape, and false completion.
   - Aggregate results by provider role, mode, and scenario category, including success rate, false-completion rate, unnecessary-tool rate, mutation violations, evidence failures, median/p95 latency, calls, tokens, clarifications, and approvals.
   - Commit only a sanitized aggregate baseline containing model identifiers, repository commit, dataset version, repetitions, metrics, and report timestamp—never raw responses, prompts containing workspace content, credentials, or scoring identities.

5. **Lock specialized-component boundaries**
   - Add regression tests proving the evaluator rejects every mode except Chat, Plan, and Agent.
   - Verify the bridge retains separate handlers for Autocomplete, Git Summary, and connection tests.
   - Verify Autocomplete retains its completion request path.
   - Verify Git Summary continues through its existing `gitSummary` legacy-loop mode and response parser.
   - Verify connection testing continues to call the provider’s dedicated `testConnection`.
   - Document that Git Summary currently shares the low-level tool-loop implementation; later milestones must introduce the new controller beside that legacy path, not replace the shared function underneath it.

## Developer interfaces and data

- Dataset cases contain: `id`, `mode`, `category`, `suite`, fixture files, one or more turns, interaction policy, deterministic expectations, and human rubric.
- Run records contain: schema version, dataset version, case/turn/repetition IDs, provider role and sanitized model metadata, duration, usage, event trace, tool signatures/outcomes, approval and clarification decisions, workspace diff, response, and deterministic scores.
- No application-facing API, persisted chat schema, settings schema, renderer behavior, or mode implementation changes are permitted in M0.

## Test plan and M0 exit criteria

- Validate dataset uniqueness, supported modes, fixture paths, expectation structure, and configuration secret handling.
- Verify workspace and profile isolation, including Plan’s saved-plan side effect.
- Verify event/tool/usage capture, multi-turn history, workspace diffing, deterministic scoring, blind-score separation, percentile calculations, and report grouping.
- Verify protected-mode regression tests and existing AI Companion tests pass.
- Run the six-case scripted smoke suite without network access.
- Run all 24 cases three times against both target and reference models, complete blind scoring, and generate the sanitized M0 baseline.
- Current model-quality failures are recorded, not treated as test-suite failures. Only harness, safety, schema, isolation, and protected-boundary violations fail M0.

## Expected files to change:

- [package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json)
- [ai-companion-baseline-eval.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-baseline-eval.js)
- [ai-companion-mode-runner.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-mode-runner.js)
- [ai-companion-baseline-cases.json](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-baseline-cases.json)
- [ai-companion-eval-config.example.json](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/ai-companion-eval-config.example.json)
- [m0-baseline.json](C:/GitHub/shaybc/md-editor/desktop-app/tests/eval/baselines/m0-baseline.json)
- [ai-companion-baseline-eval.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-baseline-eval.test.js)
- [ai-companion-mode-boundaries.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js)
- [22-ai-companion-agent-loop-and-harnes-internals.md](C:/GitHub/shaybc/md-editor/desktop-app/help/developer/22-ai-companion-agent-loop-and-harnes-internals.md)

## Assumptions and intentionally unchanged behavior

- The target and reference model configurations are supplied locally when the baseline is run.
- Live evaluations never run as part of CI or the default `npm test`.
- Existing intent-contract evaluation files and their rollout gates remain unchanged.
- Chat, Plan, Agent, Git Summary, Autocomplete, provider transport, security policy, approvals, tools, UI, storage, and prompts remain behaviorally unchanged.
- No unrelated code is modified.
