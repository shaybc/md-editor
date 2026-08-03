const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bridge = require("../../desktop-app/resources/bridges/git-bridge/git-bridge.cjs");

function hasGitCli() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

function createFixtureRepo() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-digest-"));
  const git = (...args) => execFileSync("git", ["-C", repoPath, "-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { stdio: "ignore" });
  git("init");
  fs.writeFileSync(path.join(repoPath, "committed.md"), "first line\n");
  git("add", "committed.md");
  git("commit", "-m", "initial commit");
  return { repoPath, git };
}

test("git bridge collects a scoped, capped changes digest from a real repo", { skip: !hasGitCli() }, async () => {
  const { repoPath, git } = createFixtureRepo();
  try {
    // Staged change, unstaged change, text untracked file, binary untracked file.
    fs.writeFileSync(path.join(repoPath, "staged.md"), "staged content\n");
    git("add", "staged.md");
    fs.appendFileSync(path.join(repoPath, "committed.md"), "second line\n");
    fs.writeFileSync(path.join(repoPath, "untracked.md"), "untracked content\n");
    fs.writeFileSync(path.join(repoPath, "binary.bin"), Buffer.from([0, 1, 2, 3, 0]));

    const response = await bridge.runRequest({ action: "changesDigest", folderPath: repoPath });
    assert.equal(response.ok, undefined);
    assert.equal(response.isRepo, true);
    const digest = response.digest;
    assert.equal(digest.commitScope, "staged");
    assert.equal(digest.clean, false);
    assert.equal(digest.tracking, "");
    assert.deepEqual(digest.unpushedCommits, []);
    assert.match(digest.stagedPatch, /staged content/);
    assert.match(digest.unstagedPatch, /second line/);
    const untrackedText = digest.untracked.find((entry) => entry.path === "untracked.md");
    assert.match(untrackedText.content, /untracked content/);
    const untrackedBinary = digest.untracked.find((entry) => entry.path === "binary.bin");
    assert.equal(untrackedBinary.binary, true);
    assert.equal(untrackedBinary.content, "");
  } finally {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
});

test("git bridge digest reports all-changes scope when nothing is staged", { skip: !hasGitCli() }, async () => {
  const { repoPath } = createFixtureRepo();
  try {
    fs.appendFileSync(path.join(repoPath, "committed.md"), "unstaged only\n");
    const response = await bridge.runRequest({ action: "changesDigest", folderPath: repoPath });
    assert.equal(response.digest.commitScope, "all");
    assert.match(response.digest.unstagedPatch, /unstaged only/);
    assert.equal(response.digest.stagedPatch, "");
  } finally {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
});

test("git bridge digest cap helpers truncate oversized patches", () => {
  const big = `diff --git a/big.md b/big.md\n${"+x\n".repeat(bridge.DIGEST_LIMITS.patchFileLines + 50)}`;
  const capped = bridge.capDigestPatchText(big);
  assert.equal(capped.truncated, true);
  assert.match(capped.text, /\.\.\.\[patch truncated\]/);

  const digest = { unpushedPatch: "x".repeat(bridge.DIGEST_LIMITS.totalBytes + 1), unstagedPatch: "keep", stagedPatch: "keep", truncated: [] };
  const result = bridge.enforceDigestTotalBudget(digest);
  assert.equal(result.unpushedPatch, "");
  assert.deepEqual(result.truncated, ["unpushedPatch"]);
});

test("git bridge caps untracked digest content by count and total size", () => {
  const untracked = [];
  for (let index = 0; index < bridge.DIGEST_LIMITS.untrackedMaxFiles + 5; index++) {
    untracked.push({ path: `file-${index}.md`, content: "x".repeat(1024), binary: false, truncated: false });
  }
  const markers = bridge.capUntrackedDigestEntries(untracked);
  const withContent = untracked.filter((entry) => entry.content).length;
  assert.equal(withContent, bridge.DIGEST_LIMITS.untrackedMaxFiles);
  assert.equal(markers.length, 5);

  const digest = { unpushedPatch: "", unstagedPatch: "", stagedPatch: "", untracked: [{ path: "big.md", content: "x".repeat(bridge.DIGEST_LIMITS.totalBytes + 1), binary: false, truncated: false }], truncated: [] };
  bridge.enforceDigestTotalBudget(digest);
  assert.equal(digest.untracked[0].content, "");
  assert.deepEqual(digest.truncated, ["untracked:big.md"]);
});

test("git bridge allows the changesDigest action in decodeRequest", () => {
  const encoded = Buffer.from(JSON.stringify({ action: "changesDigest", folderPath: "/tmp/repo" }), "utf8").toString("base64");
  const request = bridge.decodeRequest(encoded);
  assert.equal(request.action, "changesDigest");
});
