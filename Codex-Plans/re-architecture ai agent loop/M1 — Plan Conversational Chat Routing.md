# M1 Plan: Conversational Chat Routing

## Summary

M1 introduces a deterministic, Chat-only request router so simple prompts no longer enter the full agent tool loop unnecessarily.

Each Chat request selects one typed route:

- `direct`: one model call, conversation context, no workspace tools.
- `grounded`: bounded deterministic workspace retrieval followed by one model call.
- `complex`: the existing agent tool loop, unchanged.

Routing is enabled by default with an internal kill switch. Plan, Agent, Autocomplete, Git Summary, connection tests, and all specialized AI components retain their current behavior.

## Implementation order

### M1.1 — Typed router and rollout control

- Add a pure `classifyChatRequest(request)` router with no model call.
- Return `{ route, reasonCode }`, where `route` is `direct`, `grounded`, or `complex`.
- Classify greetings, general explanations, provided-text transformations, and history-only follow-ups as `direct`.
- Classify a single explicit file, symbol, active document, README/configuration question, or project metadata lookup as `grounded`.
- Classify attachments, diagnostics, workspace changes, multiple targets, multi-step investigations, edited reruns, resumed requests, and uncertain cases as `complex`.
- Add `chatRequestRoutingEnabled`, defaulting to `true`, to both headless and browser settings normalization.
- When disabled, bypass the router and execute the exact existing Chat path.

### M1.2 — Bounded grounded retrieval

- Convert a grounded route into one deterministic retrieval plan:
  - Active/current document: use the live editor buffer.
  - Explicit filename/path: exact-name glob, then read the unique result.
  - Symbol lookup: exact-token grep, then read around the unique definition.
  - Project version: locate a root project manifest and read the unique candidate.
- Limit retrieval to one locator operation, at most two reads, 160 lines per read, and 16,000 total evidence characters.
- Never run `list_files` for a grounded request.
- Emit standard running/completed tool events so existing evaluation and activity accounting recognize the evidence.
- Normalize evidence to `{ sourceType, path, startLine, endLine, content }`.
- If evidence is missing, conflicting, truncated before the relevant content, or resolves to multiple plausible targets, emit an escalation event and continue through the existing complex loop.

### M1.3 — Route execution

- Update Chat mode to select the route before invoking the model.
- Extend the existing loop with optional internal controls:
  - `toolDefinitionsOverride`
  - `requireInitialDiscoveryOverride`
  - `skipIntentPhase`
  - `additionalSystemMessages`
  - `narrationEnabled`
- Defaults for these controls must preserve every existing caller.
- Run `direct` with no tools, no forced discovery, no active-file injection, and no intent extraction.
- Run `grounded` with no model-selected tools and inject only the normalized evidence gathered in M1.2.
- Run `complex` using the current Chat invocation without changed arguments or behavior.
- Continue using the existing loop infrastructure for abort handling, token budgets, usage/context events, chat-title extraction, output limits, and provider debugging.

### M1.4 — Prompts and telemetry

- Add a customizable `chatDirectSystem` prompt that permits general conversation but prohibits unsupported workspace claims.
- Reuse `workspaceContextSystem` for grounded answers and require answers to stay within supplied evidence.
- Leave the existing `chatSystem` unchanged for the complex route.
- Increment the bundled prompt default revision and migrate existing profiles by adding the new prompt without overwriting customized prompts.
- Emit telemetry-only events:
  - Selection: `{ type: "chat-route", stage: "selected", route, reasonCode, classifier: "deterministic" }`
  - Escalation: `{ type: "chat-route", stage: "escalated", route: "complex", fromRoute: "grounded", reasonCode, classifier: "deterministic" }`
- Do not add route badges, inspector rows, or other UI.

## Interfaces and compatibility

- New normalized setting: `chatRequestRoutingEnabled: boolean`, default `true`.
- New internal route values: `direct | grounded | complex`.
- New bridge event type: `chat-route`; existing renderers may safely ignore it.
- New loop options are optional and must reproduce current behavior when omitted.
- No provider, bridge request, stored-chat, intent-contract, approval, or specialized-tool schema changes.

## Expected files to change:

- [chat-request-router.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/chat-request-router.js) — new deterministic classifier, evidence planner, normalization, budgets, and escalation rules.
- [chat/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/modes/chat/index.js) — select and execute the Chat route.
- [agent-tool-loop.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/agent-tool-loop.js) — add narrowly scoped optional one-shot execution controls.
- [prompts.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/prompts.js) — add the direct prompt and increment the prompt revision.
- [defaults.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js) — add the headless kill switch default and normalization.
- [settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js) — keep browser normalization aligned with headless settings.
- [ai-companion-chat-routing.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-routing.test.js) — new classification, retrieval, escalation, execution, and settings-parity coverage.
- [ai-companion-mode-boundaries.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-mode-boundaries.test.js) — prove Plan, Agent, and protected specialized modes do not enter the router.
- [ai-companion-prompts.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-prompts.test.js) — verify the new prompt and backward-compatible profile migration.

## Test plan and acceptance gates

- Classification fixtures:
  - `Hello!`, generic explanations, supplied-text rewrites → `direct`.
  - Project version, `ttlMs`, `startServer`, README instructions → `grounded`.
  - Ambiguous `render`, diagnostics, attachments, changes, multiple files, resume/rerun → `complex` or grounded-to-complex escalation.
  - “What is that in seconds?” after a grounded answer → `direct` using conversation history.
- Execution assertions:
  - Direct uses exactly one provider call and zero workspace tools.
  - Grounded uses exactly one provider call after bounded deterministic retrieval.
  - Direct prompts receive no active-file or workspace context.
  - Ambiguous/missing evidence never produces an unsupported answer.
  - Chat remains read-only.
  - Chat titles, usage, cancellation, output limits, and context events remain functional.
  - Disabling routing restores the legacy forced-discovery Chat path.
- Run targeted routing, prompt, and boundary tests, followed by the complete desktop test suite.
- Run the existing two-provider M0 evaluation, three repetitions:
  - Direct Chat cases must use zero tools.
  - Grounded cases must satisfy their required `read_file` evidence.
  - The ambiguous target case must still clarify.
  - Plan and Agent deterministic pass rates, mutation violations, and false-completion rates must not regress.
  - Autocomplete, Git Summary, and connection-test boundary tests must remain unchanged and pass.

## Assumptions and exclusions

- M1 uses deterministic conservative routing; uncertainty always falls back to the existing complex loop.
- Routing is enabled by default with no visible settings control in this milestone.
- M1 does not introduce durable AgentState, checkpoints, verifier/completion gates, progress detection, or subagents; those belong to later milestones.
- Plan and Agent will adopt the broader controller architecture in later milestones, not during M1.
- No specialized AI mode, provider implementation, workspace tool implementation, bridge action, or unrelated UI code will be modified.
