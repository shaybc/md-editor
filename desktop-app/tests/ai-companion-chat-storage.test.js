const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const panelSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/panel.js"), "utf8");
const indexSource = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");

test("AI Companion persists chats as date-nested chat folders with ordered task files", () => {
  assert.match(panelSource, /deps\.joinPath\(companionDir, "chats"\)/);
  assert.match(panelSource, /function getChatStorageDateParts\(value = Date\.now\(\)\)/);
  assert.match(panelSource, /function joinStoragePath\(\.\.\.parts\)/);
  assert.match(panelSource, /return joinStoragePath\(chatsDir, dateParts\.year, dateParts\.month, dateParts\.day\)/);
  assert.match(panelSource, /return dateDir && chat\?\.id \? deps\.joinPath\(dateDir, chat\.id\) : ""/);
  assert.match(panelSource, /await ensureProfileDirectory\(joinStoragePath\(chatsDir, dateParts\.year\)\)/);
  assert.match(panelSource, /await ensureProfileDirectory\(joinStoragePath\(chatsDir, dateParts\.year, dateParts\.month\)\)/);
  assert.match(panelSource, /await ensureProfileDirectory\(dateDir\)/);
  assert.match(panelSource, /return `chat_\$\{createStorageTimestamp\(createdAt\)\}_\$\{createStorageSuffix\(\)\}`/);
  assert.match(panelSource, /return `task_\$\{padTaskSequence\(sequence\)\}_\$\{createStorageTimestamp\(createdAt\)\}_\$\{createStorageSuffix\(\)\}`/);
  assert.match(panelSource, /fileName: `\$\{id\}\.json`/);
  assert.match(panelSource, /sort\(compareAgentTaskIndexItems\)/);
  assert.match(panelSource, /readLatestChatIndex/);
  assert.match(panelSource, /readSavedChatIndexes/);
  assert.match(panelSource, /function getChatContextRestoreTotals\(chat, tasks = \[\]\)/);
  assert.match(panelSource, /return \{ \.\.\.tokenTotals, requestCount \}/);
  assert.match(panelSource, /chatIndex\.tasks\.length \? chatIndex : null/);
});

test("AI Companion keeps a legacy flat task fallback while moving new saves to chats", () => {
  assert.match(panelSource, /deps\.joinPath\(profileDir, "companion", "agent", "tasks"\)/);
  assert.match(panelSource, /readLegacyAgentTaskIndex/);
  assert.match(panelSource, /storage: "legacy"/);
  assert.match(panelSource, /getLegacyAgentTaskFilePath/);
});

test("AI Companion previous chat dropdown uses date-nested saved non-empty chat indexes", () => {
  assert.match(indexSource, /id="ai-companion-chat-select"/);
  assert.match(panelSource, /const CHAT_HISTORY_SELECT_LIMIT = 25/);
  assert.match(panelSource, /async function readDateNestedChatEntries\(chatsDir\)/);
  assert.match(panelSource, /isChatDateDirectoryEntry\(entry, \/\^\\d\{4\}\$\/\)/);
  assert.match(panelSource, /isChatDateDirectoryEntry\(entry, \/\^\\d\{2\}\$\/\)/);
  assert.match(panelSource, /chatEntries\.push\(\{ id, path: joinStoragePath\(dayDir, id\) \}\)/);
  assert.match(panelSource, /readChatIndexById\(entry\.id, entry\.path\)/);
  assert.doesNotMatch(panelSource, /\.filter\(\(entry\) => \/\^chat_\/\.test\(getDirectoryEntryName\(entry\)\)\)\s*\.sort\(\(a, b\) => getDirectoryEntryName\(b\)\.localeCompare\(getDirectoryEntryName\(a\)\)\);\s*const chats = \[\]/);
  assert.match(panelSource, /const result = chats\.sort\(compareChatIndexesNewestFirst\)\.slice\(0, limit\)/);
  assert.match(panelSource, /logChatHistoryDebug\("refresh completed"/);
  assert.match(panelSource, /chatIndex\.tasks\.length \? chatIndex : null/);
});

test("AI Companion previous chat dropdown derives compact display names", () => {
  assert.match(panelSource, /function getChatDisplayName\(chat, fallbackMode = "chat"\)/);
  assert.match(panelSource, /function stripChatDisplayPrefix\(text\)/);
  assert.match(panelSource, /replace\(\/\^This Chat\\s\*\[-:\]\\s\*\/i, ""\)/);
  assert.match(panelSource, /title && title !== "Chat"/);
  assert.match(panelSource, /const taskTitle = task\?\.title \|\| task\?\.prompt/);
  assert.match(panelSource, /return `\$\{chatLabel\} \$\{date\.getFullYear\(\)\}-/);
  assert.match(panelSource, /singleLine\.length > 48/);
  assert.match(panelSource, /function formatChatUpdatedTooltip\(chat\)/);
  assert.match(panelSource, /Last updated:/);
});

test("AI Companion previous chat selection saves and visually replaces the active chat", () => {
  assert.match(panelSource, /async function switchToSavedChat\(chatId, selectedChatIndex = null\)/);
  assert.match(panelSource, /void switchToSavedChat\(chat\.id, chat\)/);
  assert.match(panelSource, /await saveVisibleAgentEntries\(\)/);
  assert.match(panelSource, /const chatIndex = selectedChatIndex\?\.id === chatId \? selectedChatIndex : await readChatIndexById\(chatId\)/);
  assert.match(panelSource, /await loadChatIntoPanel\(chatIndex\)/);
  assert.match(panelSource, /function clearToolLog\(\)/);
  assert.match(panelSource, /agentEntries = \[\]/);
  assert.match(panelSource, /for \(const item of agentTaskIndex\)[\s\S]*renderSavedAgentTask\(record, false\)/);
});
test("AI Companion previous chat dropdown exposes per-chat actions", () => {
  assert.match(panelSource, /className = "ai-companion-chat-menu-title"/);
  assert.match(panelSource, /className = "ai-companion-chat-action-toggle"/);
  assert.match(panelSource, /bi bi-three-dots-vertical/);
  assert.match(panelSource, /className = "ai-companion-chat-action-menu"/);
  assert.match(panelSource, /dataset\.aiCompanionChatActionMenu = "true"/);
  assert.match(panelSource, /document\.body\?\.appendChild\(actionMenu\)/);
  assert.match(panelSource, /function removeChatActionMenus\(\)/);
  assert.match(panelSource, /createActionItem\("Rename Chat", renameSavedChat\)/);
  assert.match(panelSource, /createActionItem\("Delete Chat", deleteSavedChat, "danger"\)/);
  assert.match(panelSource, /createActionItem\("Show Chat Folder", showSavedChatFolder\)/);
  assert.match(panelSource, /function closeChatActionMenu\(\)/);
  assert.match(panelSource, /if \(!event\.target\?\.closest\?\.\("\.ai-companion-chat-actions, \.ai-companion-chat-action-menu, \.ai-companion-chat-action-toggle"\)\) closeChatActionMenu\(\)/);
});

test("AI Companion chat actions rename, delete, and reveal saved chat storage", () => {
  assert.match(panelSource, /async function writeChatIndexTitle\(chat, title\)/);
  assert.match(panelSource, /const updatedPayload = \{ \.\.\.payload, title: nextTitle \}/);
  assert.match(panelSource, /await deps\.Neutralino\.filesystem\.writeFile\(indexPath, JSON\.stringify\(updatedPayload, null, 2\)\)/);
  assert.match(panelSource, /return deps\.confirm\(message, \{ title: "Delete Chat", confirmLabel: "Delete Chat", confirmVariant: "danger" \}\)/);
  assert.match(panelSource, /This operation cannot be undone/);
  assert.match(panelSource, /You will lose all text, prompts, attached files, and pasted images included in this chat/);
  assert.match(panelSource, /async function deleteSavedChatStorage\(chat\)/);
  assert.match(panelSource, /await deps\.Neutralino\.filesystem\.remove\(chatDir\)/);
  assert.match(panelSource, /if \(wasActive\) resetDeletedActiveChat\(\)/);
  assert.match(panelSource, /async function showSavedChatFolder\(chat\)/);
  assert.match(panelSource, /await deps\.openPathInExplorer\(chatDir\)/);
});
test("AI Companion split persists cloned chat state without rewriting the source", () => {
  assert.match(panelSource, /async function splitChatFromEntry\(entry\)/);
  assert.match(panelSource, /notifyAiCompanionBlocked\("Stop the current task before splitting this chat"\)/);
  assert.match(panelSource, /await saveVisibleAgentEntries\(\)/);
  assert.match(panelSource, /const includedTasks = sortedTasks\.slice\(0, splitIndex \+ 1\)/);
  assert.match(panelSource, /async function cloneTaskRecordForSplit\(sourceRecord, splitChat, fallbackSequence, chatsDir\)/);
  assert.match(panelSource, /id = createTaskId\(sequence, createdAt\)/);
  assert.match(panelSource, /chatId: splitChat\.id/);
  assert.match(panelSource, /tokenTotals: \{ requestCount: clonedTasks\.length \}/);
  assert.match(panelSource, /await copySplitAttachmentFile\(sourcePath, destinationPath\)/);
  assert.match(panelSource, /await loadChatIntoPanel\(splitChatIndex\)/);
  assert.match(panelSource, /notifyAiCompanionError\("Unable to split chat"\)/);
});
test("AI Companion builds same-chat conversation history for new requests", () => {
  assert.match(panelSource, /const CONVERSATION_HISTORY_TURN_LIMIT = 12/);
  assert.match(panelSource, /const CONVERSATION_HISTORY_MESSAGE_MAX_CHARS = 4000/);
  assert.match(panelSource, /async function buildConversationHistory\(excludedEntry = null, currentPrompt = "", continuationRecordId = ""\)/);
  assert.match(panelSource, /record\?\.status === "interrupted" \|\| record\?\.status === "running"/);
  assert.match(panelSource, /getVisibleAgentTaskRecord\(item\.id\) \|\| await readAgentTaskRecord\(item\)/);
  assert.match(panelSource, /event\?\.type === "chat-response" && event\.isError !== true/);
  assert.match(panelSource, /event\.finalResponse \|\| event\.outcome/);
  assert.match(panelSource, /const conversationHistory = await buildConversationHistory\(existingEntry, prompt, overrides\.continuationRecordId\)/);
  assert.match(panelSource, /const requestPayload = \{/);
  assert.match(panelSource, /workspaceRoot: deps\.getWorkspaceRoot\(\)/);
  assert.match(panelSource, /conversationHistory,/);
  assert.match(panelSource, /if \(executionKind === "resume" && overrides\.resumeRun === true\)/);
  assert.match(panelSource, /resumeRun: overrides\.resumeRun === true/);
  assert.match(panelSource, /attachments: normalizeAttachmentReferences\(attachments\)/);
});


test("AI Companion persists task-level changed file summaries", () => {
  assert.ok(panelSource.includes("function buildTaskChangesFromSummary(summary = {})"));
  assert.ok(panelSource.includes("activeAgentEntry.record.changes = changes"));
  assert.ok(panelSource.includes("savedEvent.changedFiles = changes.files"));
  assert.ok(panelSource.includes("function getTaskChanges(record = {})"));
  assert.ok(panelSource.includes('event?.type === "agent-summary"'));
});

test("AI Companion persists version-6 autonomous recovery metadata", () => {
  assert.match(panelSource, /version: 6/);
  assert.ok(panelSource.includes("recoverySummary: null"));
  assert.ok(panelSource.includes("recoveryInspection: null"));
  assert.ok(panelSource.includes("function migrateTaskRecord(savedRecord = {}, legacyStorage = false)"));
  assert.ok(panelSource.includes("recoveryInspection"));
  assert.ok(panelSource.includes("resumeRun: true"));
});

test("AI Companion exposes a task-level Changes inspector section", () => {
  assert.ok(indexSource.includes('id="ai-companion-workspace-changes"'));
  assert.ok(indexSource.includes('data-ai-companion-inspector-section="changes"'));
  assert.ok(panelSource.includes('const taskChangesPanel = panel.querySelector("#ai-companion-workspace-changes")'));
  assert.ok(panelSource.includes("function renderTaskChangesPanel(record = null)"));
  assert.ok(panelSource.includes("openActivityCompare(file.compare)"));
});
