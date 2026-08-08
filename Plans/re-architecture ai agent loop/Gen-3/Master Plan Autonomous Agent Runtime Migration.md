# Master Plan: Autonomous Agent Runtime Migration

## Summary

Replace the M0–M11 orchestration system with a separate autonomous runtime modeled behaviorally on the reference agent runtime. Keep MD-Editor’s providers, tools, permissions, approvals, transport, storage primitives, and UI foundation. Develop each stage under its own implementation plan.

## Important rules

- Reference-project product names must not appear in code or plans.
- Use the reference codebase only to study behavior, concepts, sequencing, and control flow. Reimplement those ideas independently; do not copy its source.
- Cover all relevant concepts, steps, rules, prompts, agent behaviors, built-in capabilities, tools, instructions, and constraints in newly authored artifacts. Rephrase every instruction and preserve its behavioral intent and important detail.
- Give every system, mechanism, architectural block, protocol, and runtime component an original MD-Editor name rather than adopting names from the reference project.
- During planning, ask the user only when a decision cannot be resolved from the behavioral reference codebase, explicit user requirements, or authoritative MD-Editor constraints. Otherwise, reproduce the reference behavior through independently authored code, prompts, flows, and original MD-Editor terminology.

Use one temporary setting, `agentLoopArchitecture: "legacy" | "autonomous"`, selected when a task starts and fixed for its lifetime. The autonomous runtime must not import legacy controller modules.

## Staged Migration

1. **Runtime boundary**
   - Introduce an orchestrator interface and factory.
   - Wrap M0–M11 behind `LegacyOrchestrator`.
   - Define shared dependencies for providers, tools, permissions, approvals, persistence, cancellation, and events.

2. **Autonomous loop kernel**
   - Add an isolated `AutonomousOrchestrator`.
   - Let the model return final text naturally or select tools with automatic tool choice.
   - Validate and execute tool calls, append results, and continue until text completion, cancellation, or a hard limit.
   - Publish exactly one authoritative final-response event.

3. **Instructions and context**
   - Load application, user, workspace, and path-scoped rules.
   - Add context budgeting, tool-result truncation, and artifact references.
   - Do not extract acceptance criteria or force workspace discovery.

4. **Extensibility**
   - Add lazy skill discovery/loading, deferred tool search, plugins, hooks, and MCP registration.
   - Add Markdown agent definitions with scoped tools, instructions, model selection, and permissions.

5. **Large-task execution**
   - Add model-controlled task creation, progress updates, subagent delegation, messaging, and waiting.
   - Keep decomposition and replanning under model control.

6. **Memory, compaction, and recovery**
   - Add relevant-memory retrieval, micro-compaction, full structured compaction, transcript checkpoints, and restart recovery.
   - Reinject active rules, tasks, skills, and unresolved work after compaction.

7. **Cutover and removal**
   - Route Chat, Plan, and Agent through the autonomous kernel using capability policies rather than separate loops.
   - Make `autonomous` the default after acceptance gates pass.
   - Remove M0–M11 runtime code, legacy settings/checkpoints, the legacy adapter, and finally the architecture switch.

## Public Interfaces

- Add `CompanionOrchestrator.run(request, services, emit)`.
- Add `agentLoopArchitecture` during migration; default to `legacy` until cutover.
- Standardize events for run lifecycle, assistant streaming/final output, tools, approvals, compaction, completion, cancellation, and failure.
- Version autonomous transcripts and checkpoints independently from legacy AgentState data.

## Test and Acceptance Gates

- Greetings and ordinary questions complete without tools or hidden verification calls.
- Read, edit, approval, denial, tool-error, cancellation, and parallel-tool scenarios work end to end.
- Large tasks can create task logs, delegate work, recover from failures, and finish after compaction.
- Rules, skills, agents, hooks, deferred tools, plugins, and MCP are discoverable without loading all content upfront.
- Weak-model tests demonstrate bounded continuation and failure-loop handling without semantic action policing.
- Provider response → final event → persistence → restored UI is tested vertically.
- Autonomous code has no imports from M0–M11 before legacy deletion.

## Expected files to change:

- [defaults.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js)
- [settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js)
- [Agent mode entry point](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/agent/index.js)
- [Chat mode entry point](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/chat/index.js)
- [Plan mode entry point](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/plan/index.js)
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- New files under `desktop-app/resources/ai-companion/orchestration/autonomous/` and corresponding tests under `desktop-app/tests/`.

## Assumptions

- Existing provider, tool, approval, security, transport, and storage infrastructure remains authoritative.
- Legacy code is frozen except for critical fixes during migration.
- M0 test prompts may be rewritten as black-box scenarios, but no M0–M11 runtime implementation is reused.
- The external runtime is an architectural and behavioral reference only. Its implementation must not be copied; all resulting code and instructional artifacts must be independently authored.
- Every stage receives a separate, decision-complete implementation plan and must leave the application runnable.
