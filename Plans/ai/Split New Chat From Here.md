# Split New Chat From Here

## Summary
Add a “Split new chat from here” icon action under terminal AI task responses. Clicking it creates a new saved chat containing cloned task history up to the selected task, opens that new chat, and leaves the original chat unchanged.

## Expected files to change:
- [panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [activity-renderer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/activity-renderer.js)
- [ai-companion-activity-renderer.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-activity-renderer.test.js)
- [ai-companion-panel-preferences.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-panel-preferences.test.js)
- [ai-companion-chat-storage.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-chat-storage.test.js)

## Key Changes
- Add a split icon button with title/aria label `Split new chat from here`, using the existing `ai-companion-box-copy` action-button styling and a Bootstrap split/branch icon.
- Show the button under completed task response surfaces:
  - Chat/plan response boxes rendered by `panel.js`.
  - Agent task summaries rendered by `activity-renderer.js`.
- Add an internal renderer callback, for example `onSplitTask`, matching the existing `onContinueTask` pattern. No app-wide public API change is required.

## Implementation Details
- In `panel.js`, add a focused `splitChatFromEntry(entry)` flow:
  - Block with `notifyAiCompanionBlocked("Stop the current task before splitting this chat")` if a request is running.
  - Save visible entries first with `saveVisibleAgentEntries()`.
  - Resolve the selected task’s position from `agentTaskIndex`, sorted by `compareAgentTaskIndexItems`.
  - Read full records for tasks from the beginning through the selected task only.
  - Create a new chat with a fresh `chat_...` ID, current `createdAt`/`updatedAt`, same `workspaceRoot`, and title `${getChatDisplayName(active chat)} - split`.
  - Clone each included task record with a new task ID/fileName/runId, new `chatId`, preserved sequence/order, prompt, rootPrompt, mode, events, status, plan metadata, changes, timestamps, and attachments.
  - Do not copy tasks, events, attachments, or metadata after the selected task.
- Copy saved attachment files that live under the old chat storage into the new chat’s `attachments/<newTaskId>/` folder and rewrite those attachment paths in cloned records.
  - Workspace file attachments and external absolute-path attachments remain referenced as-is.
  - If a saved attachment file cannot be copied/read, fail the split and show `notifyAiCompanionError("Unable to split chat")`.
- Persist the new chat using the existing chat folder/index layout:
  - Write each cloned task record as its own JSON file.
  - Write the new `index.json` with only cloned task index entries.
  - Keep token totals minimal: set `requestCount` to the cloned task count and do not copy cumulative token totals from later original-chat turns.
- After persistence, load the new chat with the existing `loadChatIntoPanel(newChatIndex)` path, refresh chat menus/sidebar, switch to chat history view if workspace mode is open, and set status text to `Chat split`.

## Tests
- Update renderer tests to confirm `activity-renderer.js` adds the split button beside model response actions and calls `onSplitTask` with the selected summary event.
- Add panel tests using the existing harness to verify:
  - Splitting after the middle task creates a new chat containing only earlier tasks plus the selected task.
  - The original chat/index/records remain unchanged.
  - The new chat has a new chat ID and cloned task IDs.
  - Future requests after loading the split use the new chat ID and same workspace root.
  - Saved chat-storage attachments are copied and rewritten; workspace/external attachment paths are preserved.
  - Split failure uses the app-styled notification path, not browser-native alert/confirm/prompt.
- Run focused verification:
  - `node --test desktop-app/tests/ai-companion-activity-renderer.test.js`
  - `node --test desktop-app/tests/ai-companion-panel-preferences.test.js`
  - `node --test desktop-app/tests/ai-companion-chat-storage.test.js`
  - `node --check desktop-app/resources/js/ai-companion/panel.js`
  - `node --check desktop-app/resources/js/ai-companion/activity-renderer.js`

## Assumptions
- “From here” means through the selected task record, inclusive.
- The button appears only once a task has a response/summary action row, not for an actively streaming task without a completed response.
- The new chat is named automatically as `<current display name> - split`; the existing rename action remains available afterward.
- No unrelated AI Companion behavior, existing response actions, chat continuation logic, settings, or storage migration behavior will be changed.
