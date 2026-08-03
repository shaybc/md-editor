const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createApprovalFileCompare } = require("../resources/ai-companion/core/approval-file-compare");
const {
  APPLY_EDIT_CODES,
  prepareWorkspaceEdit
} = require("../resources/ai-companion/tools/workspace-edit-matcher");
const workspaceTools = require("../resources/ai-companion/tools/workspace-tools");

test("apply_edit prepares LF searches for CRLF files and preserves CRLF", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-edit-crlf-"));
  const content = "before\r\n  target  \r\nafter\r\n";
  await fs.writeFile(path.join(workspace, "index.md"), content, "utf8");
  const compare = await createApprovalFileCompare(workspace, "apply_edit", {
    path: "index.md",
    search: "target\nafter",
    replacement: "changed\nend"
  });

  assert.equal(compare.preparedEdit.matchMode, "whitespace");
  assert.equal(compare.afterContent, "before\r\n  changed\r\nend\r\n");
  await workspaceTools.applyEdit(workspace, "index.md", "target\nafter", "changed\nend", {
    allowWrites: true,
    preparedEdit: compare.preparedEdit
  });
  assert.equal(await fs.readFile(path.join(workspace, "index.md"), "utf8"), "before\r\n  changed\r\nend\r\n");
});

test("apply_edit treats line endings as equivalent without converting an LF file", async () => {
  const prepared = prepareWorkspaceEdit({
    path: "index.md",
    currentContent: "one\ntwo\nthree\n",
    search: "two\r\nthree",
    replacement: "second\r\nthird"
  });
  assert.equal(prepared.matchMode, "line-ending");
  assert.equal(prepared.proposedContent, "one\nsecond\nthird\n");
});

test("apply_edit whitespace matching preserves case and internal whitespace", () => {
  const prepared = prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "\talpha  beta  \nnext\n",
    search: "alpha  beta\nnext",
    replacement: "done"
  });
  assert.equal(prepared.matchMode, "whitespace");
  assert.equal(prepared.proposedContent, "\tdone\n");
  assert.throws(() => prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "alpha  beta\n",
    search: "Alpha beta",
    replacement: "done"
  }), (error) => error.code === APPLY_EDIT_CODES.SEARCH_NOT_FOUND);
});

test("a unique exact apply_edit match wins before tolerant matching", () => {
  const prepared = prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "target\nend\n  target  \r\nend\r\n",
    search: "target\nend",
    replacement: "selected"
  });
  assert.equal(prepared.matchMode, "exact");
  assert.equal(prepared.matchCount, 1);
  assert.equal(prepared.proposedContent, "selected\n  target  \r\nend\r\n");
});

test("ambiguous apply_edit matches require an explicit occurrence and expected count", () => {
  assert.throws(() => prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "item\nitem\nitem\n",
    search: "item",
    replacement: "selected"
  }), (error) => {
    assert.equal(error.code, APPLY_EDIT_CODES.AMBIGUOUS_MATCH);
    assert.equal(error.matchCount, 3);
    assert.deepEqual(error.candidates.map((candidate) => candidate.startLine), [1, 2, 3]);
    return true;
  });

  const prepared = prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "item\nitem\nitem\n",
    search: "item",
    replacement: "selected",
    occurrence: 2,
    expectedMatches: 3
  });
  assert.equal(prepared.proposedContent, "item\nselected\nitem\n");
  assert.equal(prepared.occurrence, 2);
});

test("apply_edit rejects changed counts and stale prepared previews before writing", async () => {
  assert.throws(() => prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "item\nitem\n",
    search: "item",
    replacement: "selected",
    occurrence: 1,
    expectedMatches: 3
  }), (error) => error.code === APPLY_EDIT_CODES.MATCH_COUNT_CHANGED);
  assert.throws(() => prepareWorkspaceEdit({
    path: "sample.txt",
    currentContent: "different\n",
    search: "item",
    replacement: "selected",
    occurrence: 1,
    expectedMatches: 1
  }), (error) => error.code === APPLY_EDIT_CODES.MATCH_COUNT_CHANGED && error.matchCount === 0);

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-edit-stale-"));
  const filePath = path.join(workspace, "sample.txt");
  await fs.writeFile(filePath, "before\n", "utf8");
  const prepared = prepareWorkspaceEdit({ path: "sample.txt", currentContent: "before\n", search: "before", replacement: "after" });
  await fs.writeFile(filePath, "changed\n", "utf8");
  await assert.rejects(
    workspaceTools.applyEdit(workspace, "sample.txt", "before", "after", { allowWrites: true, preparedEdit: prepared }),
    (error) => error.code === APPLY_EDIT_CODES.STALE_PREVIEW && error.preExecution === true
  );
  assert.equal(await fs.readFile(filePath, "utf8"), "changed\n");
});
