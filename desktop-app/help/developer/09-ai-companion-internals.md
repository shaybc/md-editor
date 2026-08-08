---
tags: []
---
# 9. AI Companion Internals

This page covers the AI Companion developer harness, conversation-history internals, and token accounting.

## 9.1. Developer Harness

AI Companion is split between renderer UI, a Neutralino bridge, and a local Node runtime. For a comprehensive overview of the agent loop, operating modes, instruction layers, feedback mechanisms, and tool activation architecture, see [AI Companion Agent Loop And Harness Internals](22-ai-companion-agent-loop-and-harnes-internals.md).

| Area | Current Path | Purpose |
| --- | --- | --- |
| Renderer panel | `desktop-app/resources/js/ai-companion/panel.js` | Panel UI, chat/task records, approvals, composer, activity events. |
| Renderer bridge client | `desktop-app/resources/js/ai-companion/neutralino-ai-bridge.js` | Starts the bridge and routes request/response events. |
| Runtime bridge | `desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs` | Node child process protocol for AI actions. |
| Conversational runtime | `desktop-app/resources/ai-companion/orchestration/autonomous/` | Shared Chat, Plan, and Agent kernel, context continuity, extensions, work, workers, and recovery. |
| Shared core | `desktop-app/resources/ai-companion/core/` | Approval, tool-scope, provider-debug, and certificate helpers. |
| Focused modes | `desktop-app/resources/ai-companion/modes/` | Autocomplete and Git summary handlers. |
| Tools | `desktop-app/resources/ai-companion/tools/` | Workspace, editor, graph, Git, plan, and API Client tools. |
| Provider adapters | `desktop-app/resources/ai-companion/providers/` | OpenAI-compatible, LiteLLM, and Gemini connector adapters. |
| Demo server | `desktop-app/resources/ai-companion/ai-model-demo/` | Local OpenAI-compatible stub server and fixtures. |

Bridge actions include `testConnection`, `chat`, `autocomplete`, `agent`, `gitSummary`, `approval`, and `cancel`. Requests and events use newline-delimited JSON over stdio.

## 9.2. Modes And Tools

| Mode | Main Behavior |
| --- | --- |
| Chat | Read-oriented project Q&A. |
| Agent | Multi-step work with approval-controlled writes, commands, tests, and app actions. |
| Plan | Reviewable planning without file mutation. |
| Autocomplete | Inline ghost suggestions in the editor. |
| Git summary | Commit summary and PR-note style output from Git panel context. |

Tool groups include workspace file tools, editor read/action tools, graph tools, Git panel tools, API Client tools, settings tools, and plan repository tools.

Tool availability is not communicated only through prose in the system prompt. The callable contract is built by `orchestration/autonomous/tool-catalog.js`, filtered through the mode capability policy and configured tool scopes, and sent in the provider request's structured `tools` field. Provider adapters translate that contract to the selected connector's tool-calling format.

Profile-backed prompt files can change instructions about how the model should use tools, but they do not define or customize the tools themselves. Tool schemas, descriptions, allowed modes, approval behavior, and mutating/read-only boundaries remain owned by the runtime tool-definition code.

## 9.3. Conversation History

AI Companion does not depend on hidden model memory. The renderer builds a bounded `conversationHistory` array from the active chat's saved task records and sends it with each chat or agent request.

Current limits:

| Limit | Value | Source |
| --- | --- | --- |
| Renderer prior turns | `12` | `CONVERSATION_HISTORY_TURN_LIMIT` in `panel.js` |
| Renderer chars per history message | `4000` | `CONVERSATION_HISTORY_MESSAGE_MAX_CHARS` in `panel.js` |
| Runtime context | Model-specific | `WindowSteward` uses model registry limits, provider usage, artifact references, and structured context renewal. |

The runtime inserts normalized history before the latest user prompt, with a boundary message that tells the model prior turns are background and the newest user message is the current task.

Saved desktop chat records live under the profile data directory, date-partitioned by chat. Legacy and browser fallback stores are still supported for older profiles.

## 9.4. Token Accounting

The context indicator uses two event streams:

- `usage`: provider-reported `prompt_tokens`, `completion_tokens`, and `total_tokens` when available.
- `context`: fallback estimate based on message text, tool schemas, and overhead.

The context donut prefers provider usage. In the tooltip:

| Label | Meaning |
| --- | --- |
| Tx | Cumulative prompt tokens sent across requests in the active chat. |
| Rx | Cumulative completion tokens received across requests in the active chat. |
| Context tokens | Latest request prompt plus completion tokens, or the fallback estimate. |

Tx/Rx totals are cumulative request usage, not unique content. Tool loops resend accumulated context, so the same earlier content can be counted more than once.

## 9.5. Counted Inputs

Counted or estimated content can include system prompts, active editor context, current prompt, text attachments, image attachments, conversation history, tool schemas, tool call arguments, tool results, continuation messages, and final-answer prompts.

Previous: [8. Runtime Bridge Model](08-runtime-bridge-model.md)  
Next: [10. Project Metadata And Recovery](10-project-metadata-and-recovery.md)
