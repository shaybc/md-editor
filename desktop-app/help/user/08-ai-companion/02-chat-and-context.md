---
tags: []
---
# 8.2. Chat And Context

Chat mode is the safest daily way to use AI Companion. It is designed for questions, explanations, writing help, and project exploration. Chat can inspect the live editor state and workspace through read-oriented tools, but it does not turn every question into a file-changing task.

Open the panel with <kbd>Actions</kbd> -> <kbd>AI Companion</kbd>, open the mode menu beside the composer, and choose <kbd>Chat mode</kbd>.

## What Chat Mode Is Good For

Use Chat mode when you want to understand before changing:

- "Summarize the active document and point out unclear sections."
- "Find the files that explain the graph export flow."
- "Compare these two open tabs and tell me what changed conceptually."
- "Rewrite this paragraph in a shorter user-guide style."
- "Look at this API collection and explain the request flow."
- "Which graph nodes are most relevant to this file?"

Business benefit: Chat mode shortens the distance between question and evidence. It can search, read, and summarize the workspace while keeping the answer visible beside the files you are already editing.

## Live Editor Context

When your prompt refers to "this file", "the active tab", "the selected text", or "the current editor", AI Companion can use editor read tools to inspect the live app state. That includes the active document, open tabs, document structure, links, recent activity, and workspace state.

This matters because the live editor may contain context that is not obvious from the folder tree alone. A Markdown tab, generated dependency map, graph document, or unsaved writing session can all influence the right answer.

> Tip: Keep the file you care about active before sending the prompt. If several tabs are relevant, mention them by name so the assistant spends context on the right material.

## Workspace Search And Reading

For saved files on disk, Chat mode can list files, match glob patterns, search with grep, and read targeted file ranges. It is especially useful in large projects where manually expanding the folder tree would be slow.

A good workspace prompt includes the goal and the evidence you expect:

| Instead Of | Ask |
| --- | --- |
| "Explain this project." | "Find the files that define AI Companion modes, then explain the difference between Chat, Agent, Plan, and Autocomplete." |
| "Where is this bug?" | "Search for the status-bar count code and list the functions that update folder counts." |
| "Write docs." | "Read the AI Companion README and settings code, then outline the user-facing features that need documentation." |

## Attachments And Pasted Images

Use <kbd>Attach files</kbd> from the composer menu when the assistant should consider specific files, screenshots, or documents. Pasted images can also be stored with the chat so the conversation remains understandable later.

Attachments are useful when the file is outside the opened folder, when you want the assistant to focus on a small set of evidence, or when a screenshot shows a UI state that is hard to describe.

> Note: Attachments add context to the provider request. If a file is large or sensitive, attach only what the assistant needs for the current answer.

## Saved Chats

The panel header includes a recent chats menu and a new chat button. Saved chats keep prompts, answers, attached files, pasted images, activity, and task history together. This lets you pause a research thread and come back to it later without rebuilding the context from memory.

Useful chat actions include:

- Open a previous chat from the recent chats menu.
- Rename a chat so it reads like a project note.
- Delete a chat when it contains throwaway work.
- Open the chat folder when you need to inspect local profile data.
- Start a fresh chat before changing topics so the context indicator stays meaningful.

## Reading Activity

Chat mode can show activity cards and narration when the model uses tools. A healthy answer often has a visible trail: workspace state, searches, file reads, graph queries, or Git status checks before the final response.

Read the activity stream as a source list. If an answer looks too broad, ask a follow-up that narrows the search:

- "Only use files under `desktop-app/resources/js/ai-companion`."
- "Ignore tests and explain the runtime path."
- "Show me the exact files you used."
- "Answer from the active document only."

## Copy And Reuse

AI Companion responses support copy actions so you can reuse summaries, snippets, plans, and explanations in Markdown files. For long documentation work, ask Chat mode to produce a section at a time, copy it into the editor, then ask for a review of the combined document.

> Tip: Treat Chat mode like a research partner. Ask it to find evidence first, then ask it to write or revise based on that evidence.

Previous: [8.1. Settings And Models](01-settings-and-models.md)  
Next: [8.3. Agent And Plan Mode](03-agent-and-plan-mode.md)
