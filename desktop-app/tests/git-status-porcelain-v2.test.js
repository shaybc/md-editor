"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { readGitStatus } = require("../resources/bridges/git-bridge/git-bridge.cjs");
const { parseGitStatusPorcelainV2 } = require("../resources/bridges/git-bridge/git-status-porcelain-v2.cjs");

function porcelain(records) {
  return `${records.join("\0")}\0`;
}

test("iterative parser reads the captured current-workspace porcelain status", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/git-status/current-workspace-porcelain-v2.json");
  const output = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const status = parseGitStatusPorcelainV2(output);

  assert.equal(status.branch, "main");
  assert.equal(status.tracking, "origin/main");
  assert.equal(status.ahead, 0);
  assert.equal(status.behind, 0);
  assert.equal(status.files.length >= 19, true);
  assert.equal(status.files.some((file) => file.path === "PLAN-fix-git_status-stack-overflow.md"), true);
  assert.equal(status.files.some((file) => file.path === "desktop-app/resources/bridges/git-bridge/git-status-porcelain-v2.cjs"), true);
});

test("parser covers staged, unstaged, untracked, renamed, copied, deleted, and conflicted paths", () => {
  const status = parseGitStatusPorcelainV2(porcelain([
    "# branch.oid abc123",
    "# branch.head feature/status",
    "# branch.upstream origin/feature/status",
    "# branch.ab +4 -2",
    "1 A. N... 100644 100644 100644 a b added.md",
    "1 .M N... 100644 100644 100644 a b modified name.md",
    "1 D. N... 100644 000000 000000 a b staged-deleted.md",
    "1 .D N... 100644 100644 000000 a b unstaged-deleted.md",
    "2 R. N... 100644 100644 100644 a b R100 renamed destination.md",
    "renamed source.md",
    "2 C. N... 100644 100644 100644 a b C100 copied destination.md",
    "copied source.md",
    "u UU N... 100644 100644 100644 100644 a b c conflict.md",
    "? Unicode-שלג\tname.md"
  ]));

  assert.deepEqual(
    { branch: status.branch, tracking: status.tracking, ahead: status.ahead, behind: status.behind },
    { branch: "feature/status", tracking: "origin/feature/status", ahead: 4, behind: 2 }
  );
  assert.deepEqual(status.files.find((file) => file.path === "renamed destination.md"), {
    path: "renamed destination.md", originalPath: "renamed source.md", index: "R", workingDir: " "
  });
  assert.deepEqual(status.files.find((file) => file.path === "copied destination.md"), {
    path: "copied destination.md", originalPath: "copied source.md", index: "C", workingDir: " "
  });
  assert.equal(status.staged.some((file) => file.path === "conflict.md"), true);
  assert.equal(status.unstaged.some((file) => file.path === "Unicode-שלג\tname.md"), true);
});

test("parser handles detached heads and large status sets without recursion", () => {
  const records = ["# branch.oid abc123", "# branch.head (detached)"];
  for (let index = 0; index < 50000; index += 1) {
    records.push(`1 .M N... 100644 100644 100644 a b files/${index}.md`);
  }
  const status = parseGitStatusPorcelainV2(porcelain(records));
  assert.equal(status.branch, "");
  assert.equal(status.files.length, 50000);
  assert.equal(status.unstaged.length, 50000);
});

test("parser rejects malformed or unsupported output with a bounded error", () => {
  for (const output of ["missing terminator", porcelain(["3 .M unknown"]), porcelain(["1 malformed"])]) {
    assert.throws(
      () => parseGitStatusPorcelainV2(output),
      (error) => error.code === "GIT_STATUS_PARSE_FAILED"
        && error.stage === "parse"
        && error.retryable === false
        && !error.message.includes(output)
    );
  }
});

test("shared status reader uses raw porcelain and returns structured execution failures", async () => {
  const calls = [];
  const status = await readGitStatus({ raw: async (args) => {
    calls.push(args);
    return porcelain(["# branch.oid abc123", "# branch.head main", "# branch.ab +0 -0"]);
  } });
  assert.deepEqual(calls, [["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]]);
  assert.equal(status.branch, "main");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      readGitStatus({ raw: async () => { throw new RangeError("Maximum call stack size exceeded"); } }),
      (error) => error.code === "GIT_STATUS_EXECUTION_FAILED"
        && error.stage === "execute"
        && error.retryable === false
        && error.message === "Git status could not be read."
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test("all bridge status producers use the shared raw reader", () => {
  const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../resources/bridges/git-bridge/git-bridge.cjs"), "utf8");
  assert.doesNotMatch(bridgeSource, /git\.status\s*\(/);
  assert.equal((bridgeSource.match(/readGitStatus\(git\)/g) || []).length >= 14, true);
});
