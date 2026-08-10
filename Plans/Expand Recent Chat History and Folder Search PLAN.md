# Expand Recent Chat History and Folder Search

## Summary

Load the newest 200 saved chats as the searchable history pool, display 25 initially, and reveal 15 more per click until the available history is exhausted. Search will cover all loaded folder-backed chats, including those outside the currently displayed page.

## Implementation Changes

- Add separate constants for:
  - Initial visible history: `25`
  - Load-more batch size: `15`
  - Maximum saved history: `200`
  - Keep the compact recent-chat dropdown limited to its existing 25 entries.
- Update the canonical saved-chat refresh flow to read and enrich up to the newest 200 valid chats from the chat folder using the existing index and task-record readers.
- Keep all 200 chats as the workspace search/pagination source while rendering only the first 25 during normal browsing.
- Change the load-more button to:
  - Display `Load more chats (15)` while at least 15 chats remain.
  - Display the actual smaller count for the final batch.
  - Increase the visible limit by 15 on every click.
  - Remain available until all matching chats, up to the 200-chat cap, are displayed.
- Search titles, saved prompts, and saved assistant/agent responses across the full 200-chat pool.
- Apply the existing mode filter to folder-backed search results.
- Render search matches through the existing chat-row implementation so found chats retain normal opening, status, metadata, and context-menu behavior.
- Reset the visible limit to 25 when search changes or is cleared. Clearing search therefore removes older search-only matches from the visible list and restores the normal newest-25 view.

## Interfaces and Compatibility

- No public APIs, storage formats, chat files, or persistence schemas change.
- Reuse `readSavedChatIndexes`, `addWorkspaceChatSearchContent`, `filterWorkspaceChats`, and `renderWorkspaceChatHistory`; do not create a parallel history/search implementation.
- Preserve compact recent-chat dropdown behavior, saved-chat ordering, filters, chat opening, and the existing context-menu behavior.

## Test Plan

- Create more than 55 saved chats and verify:
  - 25 rows appear initially.
  - The button reads `Load more chats (15)`.
  - Successive clicks display 40, then 55 chats.
  - A smaller final batch shows its actual count and removes the button after loading.
- Create more than 200 chats and verify only the newest 200 can be loaded or searched.
- Place a uniquely searchable chat beyond the initial 25 and verify:
  - It appears when matching its title, prompt, or response content.
  - It can be opened from the filtered results.
  - Clearing search returns to 25 recent chats and removes that older result.
- Verify mode filtering still combines correctly with folder-wide search.
- Run the focused AI Companion panel preference tests and JavaScript syntax validation.

## Expected files to change:

- [desktop-app/resources/js/ai-companion/panel.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/panel.js)
- [desktop-app/tests/ai-companion-panel-preferences.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-companion-panel-preferences.test.js)

## Assumptions

- “Maximum history load of 200” means the newest 200 valid saved chats are available to workspace pagination and search.
- Search retains its current fields: display title, user prompts, and assistant/agent response content.
- The final load-more label reports the actual remaining count when fewer than 15 chats remain.
- No CSS or markup changes are expected.
