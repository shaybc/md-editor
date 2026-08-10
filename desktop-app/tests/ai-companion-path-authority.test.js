"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { PathAuthority, resolveKnownFolderReference } = require("../resources/ai-companion/orchestration/autonomous/path-authority");
const { RunSummary } = require("../resources/ai-companion/orchestration/autonomous/run-summary");
const workspaceTools = require("../resources/ai-companion/tools/workspace-tools");

function assertAuthorityError(callback, code) {
  assert.throws(callback, (error) => error?.code === code);
}

test("relative paths require an opened folder and never use the process directory", () => {
  const authority = new PathAuthority({ workspaceRoot: "", prompt: "read requirement.md" });
  assertAuthorityError(() => authority.resolveFilePath("requirement.md"), "PATH_LOCATION_REQUIRED");
  assert.throws(() => workspaceTools.resolveWorkspacePath("", "requirement.md"), /Workspace root is required/);
});

test("relative paths remain contained in the opened folder", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-path-workspace-"));
  const authority = new PathAuthority({ workspaceRoot: workspace, prompt: "read docs/requirement.md" });
  const target = authority.resolveFilePath(path.join("docs", "requirement.md"));
  assert.equal(target.external, false);
  assert.equal(target.resolvedPath, path.join(workspace, "docs", "requirement.md"));
  assertAuthorityError(() => authority.resolveFilePath(path.join("..", "outside.md")), "PATH_NOT_AUTHORIZED");
});

test("an explicitly supplied absolute file authorizes only that file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-path-file-"));
  const file = path.join(directory, "requirement.md");
  const authority = new PathAuthority({ workspaceRoot: "", prompt: `read the file: ${file}` });
  assert.equal(authority.resolveFilePath(file).resolvedPath, file);
  assertAuthorityError(() => authority.resolveFilePath(path.join(directory, "sibling.md")), "PATH_NOT_AUTHORIZED");
});

test("an explicitly supplied directory authorizes descendants", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-path-directory-"));
  const authority = new PathAuthority({ workspaceRoot: "", prompt: `work in ${directory}` });
  const target = path.join(directory, "nested", "result.txt");
  assert.equal(authority.resolveFilePath(target).resolvedPath, target);
});

test("model-invented absolute paths are rejected until supplied by the user", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-path-choice-"));
  const target = path.join(directory, "result.txt");
  const authority = new PathAuthority({ workspaceRoot: "", prompt: "create the result file" });
  assertAuthorityError(() => authority.resolveFilePath(target), "PATH_NOT_AUTHORIZED");
  authority.addUserText({ location: target });
  assert.equal(authority.resolveFilePath(target).resolvedPath, target);
});

test("known Home references resolve through the platform home folder", () => {
  const authority = new PathAuthority({ workspaceRoot: "", prompt: "inspect Home" });
  assert.equal(authority.resolveFilePath("Home").resolvedPath, path.resolve(os.homedir()));
});

test("Desktop and Documents suffixes resolve through platform-aware known folders", () => {
  for (const name of ["Desktop", "Documents"]) {
    const target = resolveKnownFolderReference(`${name}${path.sep}requirement.md`);
    assert.ok(target);
    assert.equal(path.isAbsolute(target.resolvedPath), true);
    assert.equal(path.basename(target.resolvedPath), "requirement.md");
  }
});

test("write_file reports created, unchanged, and modified from disk state", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-write-action-"));
  const created = await workspaceTools.writeFile(workspace, "result.txt", "one", { allowWrites: true });
  const unchanged = await workspaceTools.writeFile(workspace, "result.txt", "one", { allowWrites: true });
  const modified = await workspaceTools.writeFile(workspace, "result.txt", "two", { allowWrites: true });
  assert.deepEqual([created.action, unchanged.action, modified.action], ["created", "unchanged", "modified"]);
  assert.deepEqual([created.changed, unchanged.changed, modified.changed], [true, false, true]);
});

test("run summaries restore mutation evidence and publish exactly once", () => {
  const ledger = new RunSummary("agent", Date.now(), { changedFiles: [{ path: "saved.txt", action: "created" }] });
  ledger.recordToolCompleted("write_file", { path: "denied.txt" }, { denied: true, instructions: "Denied." });
  const events = [];
  assert.equal(ledger.publish((event) => events.push(event), { status: "failure", outcome: "Stopped." }), true);
  assert.equal(ledger.publish((event) => events.push(event), { status: "success", outcome: "Done." }), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "failure");
  assert.equal(events[0].changedFiles[0].path, "saved.txt");
  assert.equal(events[0].blockedChanges[0].items[0].path, "denied.txt");
});

  const internalFailure = new RunSummary("agent");
  const internalEvents = [];
  internalFailure.publish((event) => internalEvents.push(event), { status: "failure", error: new ReferenceError("effectiveCall is not defined"), outcome: "effectiveCall is not defined" });
  assert.equal(internalEvents[0].finalResponse, "The task couldn’t continue because of an internal Agent error (`effectiveCall`). No file was created or changed.");
  assert.equal(internalEvents[0].outcome, internalEvents[0].finalResponse);
