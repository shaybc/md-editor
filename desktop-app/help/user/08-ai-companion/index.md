---
tags:
  - the_rest
---
# 8. AI Companion

AI Companion is the right-side assistant in MD-Editor. It can answer questions about the open project, help write and revise Markdown, inspect source files, prepare implementation plans, run visible multi-step workspace tasks, suggest inline completions, and summarize Git changes. It is built for people who keep real work in local folders: notes, generated code maps, API collections, graph documents, and source code can all become useful context without leaving the desktop app.

The practical benefit is focus. Instead of switching between an editor, search tool, terminal, Git client, API client, and a separate AI chat, you can ask from the same workspace where the files are open. The assistant can read the active document, inspect open tabs, search the folder, look at graph state, use Git panel data, and explain what it found in the activity stream.

## Open AI Companion

Use any of these entry points:

- Choose <kbd>Actions</kbd> -> <kbd>AI Companion</kbd>.
- Use the AI Companion sidebar toggle when it is visible.
- Open <kbd>Actions</kbd> -> <kbd>Settings...</kbd> -> <kbd>AI</kbd> to configure the feature before using it.

The panel opens on the right side of the app. Its header contains the mode icon, saved plans button, recent chats menu, and new chat button. The composer at the bottom accepts prompts, attached files, and pasted images. The run button starts the selected mode and changes to a stop button while a request is active.

> Tip: Open the folder you want to discuss before asking project questions. AI Companion can still talk without a folder, but workspace-aware answers are strongest when the folder tree, active file, tabs, Git panel, or graph view provide real context.

## Mode Map

| Mode | Use It For | Business Benefit |
| --- | --- | --- |
| Chat mode | Questions, explanations, Markdown rewrites, project exploration, and lightweight help. | Get answers grounded in the open workspace without granting edit or command authority. |
| Agent mode | Multi-step work that may inspect files, edit documents, update API Client data, use Git tools, or run approved commands. | Turn a goal into visible work while keeping approvals in front of you. |
| Plan mode | Read-only investigation and implementation plans. | Separate thinking from doing, so large changes can be reviewed before any files are changed. |
| Autocomplete | Inline ghost suggestions while editing. | Speed up repetitive Markdown and code writing without opening the panel. |
| Git summary | Commit summaries and PR-style change notes from the Git panel. | Convert a noisy working tree into a clear human summary before committing. |

## Safety Model

AI Companion is designed around visible context and explicit authority. Read-only tools can inspect the workspace so the assistant can answer accurately. Mutating actions, such as file writes, editor edits, Git operations, settings changes, shell commands, and tests, are handled separately and can require approval depending on your settings.

The activity stream shows what the assistant is doing: searches, file reads, graph lookups, Git panel queries, proposed edits, command requests, and final summaries. When approval is required, the panel shows what action is being requested and waits for your decision.

> Note: The assistant is not a background automation system. It runs when you ask it to run, reports visible progress, and can be stopped from the composer while a request is active.

## What AI Companion Can See

AI Companion can use several kinds of context when they are relevant:

- The active document, selection, cursor context, and open tabs.
- Attached files and pasted images in the current chat.
- The opened folder and searchable workspace files.
- Markdown document structure, links, backlinks, and recent activity.
- Graph tabs, graph nodes, filters, paths, and local graph context.
- Git panel status, diffs, branches, and change digests.
- API Client collections, environments, mocks, saved requests, recent history, and local OpenAPI or Swagger files.

This context is used to answer the prompt you send. The app stores profile data locally, and provider requests depend on the model provider you configure in [Settings And Models](01-settings-and-models.md). For supplier-specific values, see [AI Provider Setup Recipes](06-provider-setup-recipes.md).

## Suggested First Workflows

Try these in order if you are new:

1. Open a folder, open one important Markdown or source file, then ask Chat mode: "Explain this file and list the related files I should read next."
2. Switch to Plan mode and ask: "Plan the safest way to update the documentation for this feature."
3. Review the plan, then switch to Agent mode only if you want the assistant to perform a visible multi-step task.
4. Open the Git panel and use AI summary before writing a commit message.
5. Enable Autocomplete only after your model connection is stable, then tune its delay and context settings.

## In This Section

- [8.1. Settings And Models](01-settings-and-models.md): connect a provider, define model profiles, understand token limits, and debug setup issues.
- [8.2. Chat And Context](02-chat-and-context.md): ask workspace-aware questions, attach files, use saved chats, and read the context indicator.
- [8.3. Agent And Plan Mode](03-agent-and-plan-mode.md): use visible task execution, approvals, activity cards, and saved plans.
- [8.4. Autocomplete](04-autocomplete.md): configure inline ghost suggestions for Markdown and code.
- [8.5. Git Summary And Integrations](05-git-summary-and-integrations.md): use Git summaries and the assistant's Graph, API Client, editor, and settings integrations.
- [8.6. AI Provider Setup Recipes](06-provider-setup-recipes.md): configure Google Connector, Gemini, OpenAI, Anthropic through LiteLLM, local models, and LiteLLM.

Previous: [7. Keyboard Shortcuts](../07-keyboard-shortcuts.md)  
Back to: [User Guide Index](../index.md)
