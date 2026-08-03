---
tags:
  - the_rest
---
# 8.5. Git Summary And Integrations

AI Companion is connected to more than the chat panel. It can work with the Git panel, Graph View, API Client, live editor actions, settings, and local workspace tools. These integrations are what make it useful inside MD-Editor instead of being a separate generic chat window.

## Git Summary

Open the Git panel from the sidebar, review your working tree, then use the AI summary action when you want a concise explanation of the changes. Git summary mode starts from a pre-collected changes digest and can use read-only follow-up tools when a hunk needs more context.

Use Git summary when:

- You have many changed files and need a human summary.
- You want a commit message draft grounded in actual diffs.
- You need PR notes before pushing.
- You want to understand uncommitted work left from an earlier session.

Business benefit: Git summary turns raw file status and diffs into reviewable intent. It helps you avoid vague commit messages like "updates" and makes it easier to explain the work to someone else.

## Git Panel Tools

In Agent mode, AI Companion can use Git panel tools for repository work. Read-only tools can inspect status, branches, file comparisons, change digests, and PR-note context. Mutating tools, such as stage, unstage, commit, fetch, pull, push, create branch, and switch branch, are approval-controlled.

> Tip: Ask for a summary first, then explicitly approve any Git action. For example: "Summarize the changes and suggest a commit message, but do not stage or commit."

## Graph View Integration

When a graph tab is open, AI Companion can read graph state, search nodes, inspect node context, find paths between nodes, apply filters, focus nodes, show local graph views, and clear focus. This is useful for generated code maps and relationship-heavy documentation.

Good graph prompts:

- "Find graph nodes related to the Java converter export flow."
- "Explain the shortest paths between these two nodes."
- "Focus the graph on API Client storage modules."
- "Which tags or groups make this graph easier to read?"

Business benefit: graph integration turns visual structure into searchable context. You can ask for relationships directly instead of manually panning through a dense graph.

## API Client Integration

AI Companion can search API Client assets, read saved requests, inspect local OpenAPI or Swagger specs, create or update saved requests, send requests, read recent history, analyze responses, inspect environments, resolve variables, redact secrets, and work with mocks.

Use it when:

- A saved request needs documentation.
- An OpenAPI file should become a saved API Client request.
- A response needs quick analysis.
- Environment variables are confusing.
- A mock should be created or updated for a workflow.

Secret-like values are redacted in relevant API Client tool output, but you should still avoid pasting credentials into prompts unless the provider and workspace policy allow it.

## Editor And Settings Integration

Agent mode can request live editor actions such as creating document tabs, opening files, inserting text at the cursor, replacing selections, or applying edits. It can also request settings updates through the app action bridge.

These actions are useful when the goal is part of the current editing session:

- "Replace the selected text with a shorter version."
- "Create a new Markdown tab with the release notes draft."
- "Open the file that defines this setting."
- "Preview a settings import but do not apply it."

Approval still matters. A live editor action can change the file you are viewing, so review the prompt and the approval card before accepting.

## Workspace Tools

AI Companion also has core workspace tools for listing files, glob matching, grep search, reading files, applying search/replace edits, writing files, running commands, and running tests. Read tools power Chat and Plan mode. Mutating tools are limited to Agent mode and can require approval.

This split is intentional:

- Chat mode answers from evidence.
- Plan mode researches without changing anything.
- Agent mode performs work with visible activity and approvals.

## Privacy Boundaries

MD-Editor keeps profile data locally, including preferences, saved chats, saved plans, drafts, API Client data, and AI Companion state. Model requests are sent to the provider you configure. That means your provider choice, base URL, token, model, debug logging, attachments, and prompt content all matter.

Practical rules:

- Use local or trusted provider endpoints for sensitive folders.
- Attach only the files needed for the current question.
- Turn off full provider debug logs when you finish troubleshooting.
- Keep approvals strict for folders that contain private or production data.
- Use Plan mode when you want analysis without mutation.

## Failure Modes

| Symptom | Likely Cause | What To Do |
| --- | --- | --- |
| Git summary is unavailable | Git summary mode is disabled or the folder is not a Git repository. | Enable Git summary and open a repository folder. |
| Agent cannot stage, commit, or push | Git mutations require approval or are blocked by policy. | Review approval settings and approve only the exact action you want. |
| Graph prompts return little context | No graph tab is open or the target node is ambiguous. | Open the graph tab and name a node, path, tag, or visible label. |
| API Client tools cannot find an asset | The saved request, environment, mock, or spec is not in the current profile or workspace. | Open the API Client and confirm the asset exists, or attach the spec file. |
| Command or test execution is refused | Command execution is disabled or needs approval. | Use approvals intentionally, or ask for a plan that avoids commands. |

Previous: [8.4. Autocomplete](04-autocomplete.md)  
Next: [8.6. AI Provider Setup Recipes](06-provider-setup-recipes.md)
