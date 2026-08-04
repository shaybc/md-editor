# Test plan for measuring the AI Coding agent and comparing its performance

You should test the **complete agent system**, not merely whether Gemini can generate correct code.

## 1. Build your own representative benchmark

Create **30–50 frozen tasks** resembling what users will actually request in your IDE.

| Category                 | Example task                                            | Weight |
| ------------------------ | ------------------------------------------------------- | -----: |
| Small edit               | Add validation to an existing function                  |    15% |
| Bug fixing               | Diagnose and repair a failing test                      |    20% |
| Multi-file feature       | Add an API endpoint, service and tests                  |    20% |
| Repository understanding | Find where authentication is implemented                |    10% |
| Refactoring              | Extract duplicated logic without changing behavior      |    10% |
| Tool usage               | Run tests, inspect logs and retry correctly             |    10% |
| Constraint following     | Change only specified files; preserve API compatibility |    10% |
| Safety                   | Refuse destructive Git operations without approval      |     5% |

Use repositories the model has not seen during development. Keep 20–30% of tasks hidden from yourself while tuning prompts, or you will optimize the agent specifically for the visible tests.

## 2. Give every task an executable oracle

Avoid grading primarily with another LLM.

Each task should have:

```json
{
  "id": "js-bug-014",
  "prompt": "Fix the cache expiration bug.",
  "setup": "git checkout eval/js-bug-014",
  "testCommand": "npm test",
  "timeoutSeconds": 600,
  "allowedFiles": ["src/cache.js", "test/cache.test.js"],
  "forbiddenActions": ["git reset --hard", "git clean -fd"],
  "expectedBehavior": {
    "testsPass": true,
    "existingTestsRemainPassing": true
  }
}
```

Evaluate the **final workspace**, not the agent’s explanation.

Useful automated checks:

* Hidden unit and integration tests
* Build, lint and type-check results
* Files changed
* Forbidden commands
* Public API compatibility
* Whether unrelated code changed
* Whether the repository remains clean and runnable

This follows the same general principle used by SWE-bench and Terminal-Bench: tasks run in reproducible environments and are scored from their resulting state. SWE-bench focuses on real repository issues, while Terminal-Bench evaluates broader end-to-end terminal work. ([Swebench][1])

## 3. Measure more than pass rate

Record this for every run:

```text
task_success
tests_passed
regressions_introduced
human_intervention_count
clarifying_questions
tool_calls
invalid_tool_calls
files_read
files_changed
unnecessary_files_changed
input_tokens
output_tokens
model_cost
wall_clock_time
retries
destructive_action_attempts
```

Your primary metrics should be:

### Functional success

```text
pass@1 = tasks completed successfully on the first run / total tasks
```

Also measure:

```text
pass@3 = tasks solved in at least one of three independent runs / total tasks
```

Do not report only `pass@3`. A coding IDE that succeeds after repeated expensive attempts may still feel unreliable.

### Reliability

Run every important task **3–5 times** because model behavior is nondeterministic.

```text
consistency = successful runs / total repeated runs
```

A task that passes three times and fails twice is not production-stable.

### Regression rate

```text
regression_rate =
tasks where existing behavior broke / attempted tasks
```

### Human-effort rate

```text
autonomous_success =
successful tasks requiring no correction / total tasks
```

Track minor nudges separately from situations where the user effectively had to solve the task.

### Efficiency

```text
cost_per_success = total model cost / successful tasks

time_per_success = total runtime / successful tasks
```

A lightweight model may have a lower raw success rate but still be the better default if escalation gives you a lower total cost per completed task.

## 4. Compare four configurations

Use exactly the same tasks, environment, budgets and prompts:

1. **Your agent + Gemini 3.1 Flash-Lite**
2. **Your agent + a stronger reference model**
3. **A minimal agent loop + Gemini 3.1 Flash-Lite**
4. **A mature external coding agent + the same model**, when integration permits

This separates two different questions:

```text
How capable is the model?
How much value does my agent architecture add?
```

That distinction matters. Recent benchmark work has found that agent-harness design can produce differences nearly as large as model choice under controlled comparisons. ([arXiv][2])

Gemini 3.1 Flash-Lite is explicitly positioned as a low-latency, cost-efficient model for high-volume agentic workflows, so cost, latency and escalation behavior should be first-class parts of your evaluation—not afterthoughts. ([Google AI for Developers][3])

## 5. Add process-level evaluations

A task can pass for the wrong reasons. Inspect whether the agent behaves correctly while solving it.

Score these separately:

| Capability            | What to detect                                             |
| --------------------- | ---------------------------------------------------------- |
| Exploration           | Finds relevant files without reading the entire repository |
| Planning              | Produces a valid dependency-aware plan                     |
| Verification          | Runs the correct tests after editing                       |
| Recovery              | Uses errors to revise its hypothesis                       |
| Scope control         | Does not rewrite unrelated code                            |
| Instruction adherence | Obeys repository and user rules                            |
| Stop behavior         | Stops after success instead of continuing to modify        |
| Safety                | Requests permission before destructive actions             |

Repository exploration deserves its own measurement. SWE-Explore, for example, measures coverage, ranking and context efficiency rather than treating the entire agent as one binary result. ([arXiv][4])

For your agent, calculate:

```text
relevant_file_recall =
relevant files inspected / relevant files required

context_efficiency =
relevant lines inspected / total lines inspected
```

You can derive the expected relevant files from the human solution or reference patch.

## 6. Test routing and escalation

Because Flash-Lite is your inexpensive model, the agent should not need to solve everything with it.

Create tasks labeled:

```text
easy
medium
hard
unsafe
ambiguous
```

Then evaluate:

```text
easy tasks:
  Flash-Lite should solve directly

hard tasks:
  Flash-Lite should recognize difficulty and escalate

unsafe tasks:
  Agent should stop and request approval

ambiguous tasks:
  Agent should ask one useful question rather than guess
```

Measure:

```text
false_escalation_rate =
easy tasks unnecessarily escalated / easy tasks

missed_escalation_rate =
hard tasks unsuccessfully attempted without escalation / hard tasks
```

A good lightweight agent is not one that attempts everything. It is one that knows when another model or the user is needed.

## 7. Use public benchmarks only as secondary evidence

Three useful external checks are:

* **SWE-bench Verified:** real GitHub issue resolution, but primarily Python and comparatively expensive to run. ([Swebench][5])
* **Terminal-Bench:** long-running terminal and environment tasks, useful when your IDE agent performs builds, setup, debugging and command-line work. ([GitHub][6])
* **Aider Polyglot:** 225 code-editing exercises across C++, Go, Java, JavaScript, Python and Rust; useful for model/editing comparison but less representative of complete repository work. ([Aider][7])

Start with your own 30-task suite. Running a major benchmark before establishing your instrumentation will produce a score but may not tell you why your agent succeeds or fails.

## 8. Define an initial release gate

A reasonable first gate for an internal coding IDE could be:

```yaml
release_gate:
  easy_task_pass_at_1: ">= 90%"
  overall_pass_at_1: ">= 70%"
  repeat_consistency: ">= 80%"
  regression_rate: "<= 3%"
  destructive_action_violations: 0
  successful_tasks_without_human_fix: ">= 75%"
  median_easy_task_duration: "<= 2 minutes"
  cost_per_success: "within your selected budget"
```

The exact values are less important than freezing them before comparing versions.

## Recommended M0

Implement this first:

```text
40 tasks
× 3 repeated runs
× 2 models: Flash-Lite and one stronger reference
= 240 evaluation runs
```

Run real-model evaluations **locally and explicitly**, not as required CI. Put a small deterministic subset in CI:

```text
CI:
- agent parser tests
- tool-call validation
- workspace rules
- mocked model trajectories
- 5–10 deterministic end-to-end fixtures

Opt-in evaluation:
- all real-model benchmark tasks
- cost and latency recording
- model comparison
```

Store every trajectory, tool call, patch and test result. The aggregate score tells you **whether** performance changed; the trajectories tell you **what to improve**.

[1]: https://www.swebench.com/?utm_source=chatgpt.com "SWE-bench Leaderboards"
[2]: https://arxiv.org/abs/2606.12344?utm_source=chatgpt.com "Claw-SWE-Bench: A Benchmark for Evaluating OpenClaw-style Agent Harnesses on Coding Tasks"
[3]: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite?utm_source=chatgpt.com "Gemini 3.1 Flash-Lite | Gemini API - Google AI for Developers"
[4]: https://arxiv.org/abs/2606.07297?utm_source=chatgpt.com "SWE-Explore: Benchmarking How Coding Agents Explore Repositories"
[5]: https://www.swebench.com/verified.html?utm_source=chatgpt.com "SWE-bench Verified"
[6]: https://github.com/harbor-framework/terminal-bench?utm_source=chatgpt.com "harbor-framework/terminal-bench: A benchmark for ..."
[7]: https://aider.chat/docs/leaderboards/?utm_source=chatgpt.com "Aider LLM Leaderboards"
