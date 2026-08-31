"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CompanionChangeJournal } = require("../resources/ai-companion/orchestration/autonomous/change-journal");

function hasGitCli() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-journal-"));
  const workspaceRoot = path.join(root, "workspace");
  const profileRoot = path.join(root, "profile");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(profileRoot, { recursive: true });
  return { root, workspaceRoot, profileRoot };
}

async function openJournal(fixture) {
  return new CompanionChangeJournal({
    workspaceRoot: fixture.workspaceRoot,
    profileRoot: fixture.profileRoot
  }).open();
}

test("change journal records snapshots and restores a task", { skip: !hasGitCli() }, async () => {
  const fixture = await createFixture();
  const file = path.join(fixture.workspaceRoot, "note.md");
  await fs.writeFile(file, "before\n", "utf8");
  const journal = await openJournal(fixture);

  await journal.createTaskCheckpoint({ kind: "before-task", chatId: "chat-1", taskId: "task-1" });
  await fs.writeFile(file, "after\n", "utf8");
  const mutation = await journal.recordFileMutation({
    tool: "write_file",
    chatId: "chat-1",
    taskId: "task-1",
    actionId: "action-1",
    round: 1,
    path: "note.md",
    beforeExists: true,
    afterExists: true,
    beforeContent: "before\n",
    afterContent: "after\n"
  });

  assert.equal(mutation.restorable, true);
  const preview = await journal.previewRestore({ mode: "task", taskId: "task-1" });
  assert.equal(preview.ok, true);
  assert.equal(preview.affectedFiles.length, 1);
  assert.equal(preview.affectedFiles[0].action, "restore");

  const result = await journal.applyRestore(preview.previewId);
  assert.deepEqual(result.restoredFiles, ["note.md"]);
  assert.equal(await fs.readFile(file, "utf8"), "before\n");

  const history = await journal.listFileHistory({ path: "note.md", chatId: "chat-1" });
  assert.equal(history.ok, true);
  assert.ok(history.entries.length >= 2);
});

test("change journal deletes a file created by the task", { skip: !hasGitCli() }, async () => {
  const fixture = await createFixture();
  const file = path.join(fixture.workspaceRoot, "created.txt");
  const journal = await openJournal(fixture);

  await fs.writeFile(file, "created\n", "utf8");
  await journal.recordFileMutation({
    tool: "write_file",
    chatId: "chat-1",
    taskId: "task-create",
    actionId: "action-1",
    round: 1,
    path: "created.txt",
    beforeExists: false,
    afterExists: true,
    beforeContent: "",
    afterContent: "created\n"
  });

  const preview = await journal.previewRestore({ mode: "file", taskId: "task-create", path: "created.txt" });
  assert.equal(preview.affectedFiles[0].action, "delete");
  await journal.applyRestore(preview.previewId);
  await assert.rejects(() => fs.readFile(file, "utf8"), /ENOENT/);
});

test("change journal skips conflicted files by default", { skip: !hasGitCli() }, async () => {
  const fixture = await createFixture();
  const file = path.join(fixture.workspaceRoot, "conflict.txt");
  await fs.writeFile(file, "before\n", "utf8");
  const journal = await openJournal(fixture);

  await fs.writeFile(file, "after\n", "utf8");
  await journal.recordFileMutation({
    tool: "apply_edit",
    chatId: "chat-1",
    taskId: "task-conflict",
    actionId: "action-1",
    round: 1,
    path: "conflict.txt",
    beforeExists: true,
    afterExists: true,
    beforeContent: "before\n",
    afterContent: "after\n"
  });
  await fs.writeFile(file, "later\n", "utf8");

  const preview = await journal.previewRestore({ mode: "task", taskId: "task-conflict" });
  assert.equal(preview.blockedFiles.length, 1);
  assert.equal(preview.affectedFiles[0].action, "conflict");
  const result = await journal.applyRestore(preview.previewId);
  assert.equal(result.restoredFiles.length, 0);
  assert.equal(result.skippedFiles[0].reason, "conflict");
  assert.equal(await fs.readFile(file, "utf8"), "later\n");
});
