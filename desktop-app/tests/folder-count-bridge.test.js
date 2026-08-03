const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const bridge = require("../resources/bridges/folder-count-bridge/folder-count-bridge.cjs");

test("folder count bridge parser reads robocopy file and directory totals", () => {
  const result = bridge.parseRobocopyFolderCounts(`
-------------------------------------------------------------------------------
               Total    Copied   Skipped  Mismatch    FAILED    Extras
    Dirs :        12         0        12         0         0         0
   Files :     1,234         0     1,234         0         0         0
   Bytes :  10.000 m         0  10.000 m         0         0         0
`);

  assert.deepEqual(result, { files: 1234, folders: 11 });
});

test("folder count bridge parser never returns negative folder count", () => {
  const result = bridge.parseRobocopyFolderCounts(`
    Dirs :         0         0         0         0         0         0
   Files :         3         0         3         0         0         0
`);

  assert.deepEqual(result, { files: 3, folders: 0 });
});

test("folder count bridge parser rejects output without summary rows", () => {
  assert.throws(
    () => bridge.parseRobocopyFolderCounts("robocopy raw progress without summary"),
    /Unable to parse robocopy folder summary/
  );
});

test("folder count bridge keeps robocopy success code limit below eight", () => {
  assert.equal(bridge.ROBOCOPY_SUCCESS_EXIT_CODE_LIMIT, 8);
});

test("folder count bridge emits newline-delimited JSON errors", () => {
  const bridgePath = path.resolve(__dirname, "../resources/bridges/folder-count-bridge/folder-count-bridge.cjs");
  const result = spawnSync(process.execPath, [bridgePath, Buffer.from("{}").toString("base64")], { encoding: "utf8" });
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);

  assert.equal(lines.length, 1);
  assert.doesNotThrow(() => JSON.parse(lines[0]));
  assert.equal(JSON.parse(lines[0]).type, "error");
});
test("folder count bridge waits for the parent start handshake and returns a result", { skip: process.platform !== "win32" }, () => {
  const bridgePath = path.resolve(__dirname, "../resources/bridges/folder-count-bridge/folder-count-bridge.cjs");
  const request = Buffer.from(JSON.stringify({ folderPath: path.resolve(__dirname, "..") })).toString("base64");
  const result = spawnSync(process.execPath, [bridgePath, request], { encoding: "utf8", input: '{"type":"start"}\n' });
  const messages = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

  assert.equal(result.status, 0);
  assert.equal(messages.some((message) => message.type === "result" && message.files > 0), true);
});