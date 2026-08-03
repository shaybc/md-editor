const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadWorkspaceGitTestApi({
  folderPath = "C:/repo",
  execCommand = async () => ({ exitCode: 0, stdOut: "" }),
  returnModule = false
} = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/git/workspace-git.js"), "utf8");
  const sandbox = {
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    console,
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const app = { registerModule: () => {} };
  const api = sandbox.registerMarkdownViewerWorkspaceGit(app, {
    getActiveFolderPath: () => folderPath,
    isDesktopRuntime: () => true,
    Neutralino: { os: { execCommand } }
  });
  return returnModule ? api : api._test;
}

test("workspace git refresh remains idle when no folder is open", async () => {
  let commandCount = 0;
  const api = loadWorkspaceGitTestApi({
    folderPath: null,
    execCommand: async () => {
      commandCount += 1;
      return { exitCode: 0, stdOut: "" };
    },
    returnModule: true
  });

  assert.equal(await api.refreshWorkspaceGitStatus(), null);
  assert.equal(commandCount, 0);
});

test("workspace git parses porcelain status output", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main...origin/main [ahead 2, behind 1]\n M docs/readme.md\nA  staged.md\n?? new-file.md\nR  old.md -> new.md\n");

  assert.equal(status.isRepo, true);
  assert.equal(status.status.branch, "main");
  assert.equal(status.status.tracking, "origin/main");
  assert.equal(status.status.ahead, 2);
  assert.equal(status.status.behind, 1);
  assert.deepEqual(Array.from(status.status.files.map((file) => file.path)), ["docs/readme.md", "staged.md", "new-file.md", "new.md"]);
  assert.equal(status.status.staged.length, 2);
  assert.equal(status.status.unstaged.length, 2);
});

test("workspace git separates staged and unstaged file sections", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main\nMM both.md\n M changed.md\nA  staged.md\n?? new-file.md\n");

  assert.deepEqual(Array.from(status.status.unstaged.map((file) => file.path)), ["both.md", "changed.md", "new-file.md"]);
  assert.deepEqual(Array.from(status.status.staged.map((file) => file.path)), ["both.md", "staged.md"]);
});

test("workspace git identifies unmerged conflict status rows", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main\nUU README.md\nAA both-added.md\n M clean-change.md\n");

  assert.equal(api.isGitConflictFile(status.status.files[0]), true);
  assert.equal(api.isGitConflictFile(status.status.files[1]), true);
  assert.equal(api.isGitConflictFile(status.status.files[2]), false);
  assert.deepEqual(Array.from(api.getGitConflictFiles(status.status).map((file) => file.path)), ["README.md", "both-added.md"]);
});

test("workspace git commit readiness requires staged files and a message", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(api.isCommitReady({ staged: [{ path: "staged.md" }] }, "Update docs"), true);
  assert.equal(api.isCommitReady({ staged: [] }, "Update docs"), false);
  assert.equal(api.isCommitReady({ staged: [{ path: "staged.md" }] }, " "), false);
});

test("workspace git push readiness requires unpushed tracked commits", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(api.isPushReady({ tracking: "origin/main", ahead: 1 }), true);
  assert.equal(api.isPushReady({ tracking: "origin/main", ahead: 0 }), false);
  assert.equal(api.isPushReady({ tracking: "", ahead: 1 }), false);
  assert.equal(api.isPushReady(null), false);
});

test("workspace git suppresses folder watcher around working-tree mutations", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(api.shouldSuppressFolderWatcherForGitAction("stashCreate"), true);
  assert.equal(api.shouldSuppressFolderWatcherForGitAction("stashPop"), true);
  assert.equal(api.shouldSuppressFolderWatcherForGitAction("discardChanges"), true);
  assert.equal(api.shouldSuppressFolderWatcherForGitAction("stashList"), false);
  assert.equal(api.shouldSuppressFolderWatcherForGitAction("stage"), false);
  assert.equal(api.shouldSuppressFolderWatcherForGitAction("push"), false);
});

test("workspace git recognizes stash pop conflict errors", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(api.isStashPopConflictError(new Error("CONFLICT (content): Merge conflict in README.md")), true);
  assert.equal(api.isStashPopConflictError(new Error("README.md: needs merge")), true);
  assert.equal(api.isStashPopConflictError(new Error("fatal: bad revision")), false);
  assert.equal(api.isStashPopLocalOverwriteError(new Error("error: Your local changes to the following files would be overwritten by merge:\nREADME.md\nPlease commit your changes or stash them before you merge.\nAborting")), true);
  assert.equal(api.isStashPopLocalOverwriteError(new Error("CONFLICT (content): Merge conflict in README.md")), false);
  assert.equal(api.getStashPopConflictMessage(1), "Stash pop created 1 conflict. Resolve conflicted files before continuing.");
  assert.equal(api.getStashPopConflictMessage(2), "Stash pop created 2 conflicts. Resolve conflicted files before continuing.");
  assert.equal(api.getStashPopBlockedMessage(1), "Cannot pop this stash because 1 file already have local changes. Commit, stash, or discard those files first.");
});

test("workspace git detects dirty files that would block stash pop", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main\n M README.md\nM  staged.md\nR  docs/old.md -> docs/new.md\nUU conflicted.md\n");

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getDirtyStatusPaths(status.status))),
    ["README.md", "staged.md", "docs/new.md", "docs/old.md", "conflicted.md"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getStashPopDirtyOverlap(status.status, ["readme.md", "docs/old.md -> docs/new.md", "other.md"]))),
    ["readme.md", "docs/old.md -> docs/new.md"]
  );
  assert.deepEqual(JSON.parse(JSON.stringify(api.getStashPopDirtyOverlap(status.status, ["other.md"]))), []);
});

test("workspace git formats long status messages with details", () => {
  const api = loadWorkspaceGitTestApi();
  const longMessage = "error: Your local changes to the following files would be overwritten by merge:\nREADME.md\nAborting";
  const formatted = api.formatGitStatusMessage(longMessage);

  assert.equal(formatted.message, "error: Your local changes to the following files would be overwritten by merge:");
  assert.equal(formatted.details, longMessage);
  assert.equal(formatted.hasDetails, true);
  assert.equal(api.formatGitStatusMessage("Working tree clean.").hasDetails, false);
});

test("workspace git groups selected files for discard", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main\n M tracked.md\n?? new-file.md\nMM both.md\nUU conflicted.md\n");

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getDiscardFileGroups(status.status, ["tracked.md", "new-file.md", "both.md", "conflicted.md"]))),
    { tracked: ["tracked.md", "both.md"], untracked: ["new-file.md"], conflicted: ["conflicted.md"] }
  );
  assert.equal(api.isDiscardReady(["tracked.md"]), true);
  assert.equal(api.isDiscardReady([]), false);
});

test("workspace git sorts stash refs for safe drop order", () => {
  const api = loadWorkspaceGitTestApi();

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.sortStashRefsForDrop(["stash@{1}", "stash@{4}", "stash@{0}"]))),
    ["stash@{4}", "stash@{1}", "stash@{0}"]
  );
  assert.equal(api.isPopReady(["stash@{0}"]), true);
  assert.equal(api.isPopReady(["stash@{0}", "stash@{1}"]), false);
  assert.equal(api.isDropReady(["stash@{0}", "stash@{1}"]), true);
  assert.equal(api.isDropReady([]), false);
});

test("workspace git resolves affected stash file paths", () => {
  const api = loadWorkspaceGitTestApi();

  assert.deepEqual(
    JSON.parse(JSON.stringify(api.resolveWorkspaceGitFilePaths("C:\\repo", ["README.md", "docs\\old.md -> docs/new.md", "README.md"]))),
    ["C:/repo/README.md", "C:/repo/docs/old.md", "C:/repo/docs/new.md"]
  );
});

test("workspace git creates compare descriptors for staged and unstaged files", () => {
  const api = loadWorkspaceGitTestApi();
  const staged = api.createGitCompareDescriptor({
    filePath: "docs/readme.md",
    scope: "staged",
    leftContent: "old",
    rightContent: "new"
  });
  const unstaged = api.createGitCompareDescriptor({
    filePath: "docs/readme.md",
    scope: "unstaged",
    leftContent: "index",
    rightContent: "working",
    workingTreePath: "C:/repo/docs/readme.md"
  });
  const added = api.createGitCompareDescriptor({
    filePath: "docs/new.md",
    scope: "staged",
    leftContent: "",
    rightContent: "new file"
  });
  const deleted = api.createGitCompareDescriptor({
    filePath: "docs/old.md",
    scope: "unstaged",
    leftContent: "old file",
    rightContent: ""
  });

  assert.equal(staged.title, "Staged changes: docs/readme.md");
  assert.equal(staged.left.name, "HEAD: readme.md");
  assert.equal(staged.left.content, "old");
  assert.equal(staged.right.name, "Staged: readme.md");
  assert.equal(staged.right.content, "new");
  assert.equal(unstaged.title, "Unstaged changes: docs/readme.md");
  assert.equal(unstaged.left.name, "Index: readme.md");
  assert.equal(unstaged.left.content, "index");
  assert.equal(unstaged.right.name, "Working tree: readme.md");
  assert.equal(unstaged.right.content, "working");
  assert.equal(unstaged.right.path, "C:/repo/docs/readme.md");
  assert.equal(staged.right.path, undefined);
  assert.equal(added.left.content, "");
  assert.equal(added.right.content, "new file");
  assert.equal(deleted.left.content, "old file");
  assert.equal(deleted.right.content, "");
});

test("workspace git creates conflict compare descriptors for stash resolution", () => {
  const api = loadWorkspaceGitTestApi();
  const descriptor = api.createGitConflictCompareDescriptor({
    filePath: "docs/readme.md",
    leftContent: "stashed",
    rightContent: "<<<<<<< Updated upstream\ncurrent\n=======\nstashed\n>>>>>>> Stashed changes\n",
    workingTreePath: "C:/repo/docs/readme.md"
  });

  assert.equal(descriptor.title, "Resolve conflict: docs/readme.md");
  assert.equal(descriptor.left.name, "Stashed: readme.md");
  assert.equal(descriptor.left.content, "stashed");
  assert.equal(descriptor.right.name, "Working tree: readme.md");
  assert.equal(descriptor.right.path, "C:/repo/docs/readme.md");
  assert.equal(descriptor.gitConflict.filePath, "docs/readme.md");
});

test("workspace git creates stash compare descriptors", () => {
  const api = loadWorkspaceGitTestApi();
  const descriptor = api.createGitStashCompareDescriptor({
    stashRef: "stash@{2}",
    filePath: "docs/readme.md",
    originalPath: "docs/old-readme.md",
    leftContent: "stashed",
    rightContent: "working",
    workingTreePath: "C:/repo/docs/readme.md"
  });

  assert.equal(descriptor.title, "Stashed file: docs/readme.md");
  assert.equal(descriptor.left.name, "Stashed: readme.md");
  assert.equal(descriptor.left.content, "stashed");
  assert.equal(descriptor.right.name, "Working tree: readme.md");
  assert.equal(descriptor.right.path, "C:/repo/docs/readme.md");
  assert.equal(descriptor.right.content, "working");
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.gitStash)), {
    stashRef: "stash@{2}",
    filePath: "docs/readme.md",
    originalPath: "docs/old-readme.md"
  });
});

test("workspace git renders conflict rows with conflict compare metadata", () => {
  const api = loadWorkspaceGitTestApi();
  const row = api.renderGitFileRow({ path: "README.md", index: "U", workingDir: "U" }, "unstaged");

  assert.match(row, /workspace-git-file is-conflict/);
  assert.match(row, /data-conflict="true"/);
  assert.match(row, /Resolve conflict in README.md/);
});

test("workspace git renders file rows with separate checkbox and compare target", () => {
  const api = loadWorkspaceGitTestApi();
  const row = api.renderGitFileRow({ path: "docs/readme.md", originalPath: "README.md", index: "M", workingDir: " " }, "staged");

  assert.match(row, /class="workspace-git-file-check"/);
  assert.match(row, /type="checkbox"/);
  assert.match(row, /class="workspace-git-file-path workspace-git-file-compare"/);
  assert.match(row, /data-scope="staged"/);
  assert.match(row, /data-file-path="docs\/readme.md"/);
  assert.match(row, /data-original-path="README.md"/);
});

test("workspace git parses stash list and file output", () => {
  const api = loadWorkspaceGitTestApi();
  const stashes = api.parseStashListOutput("stash@{0}: WIP on main: Update docs\nstash@{1}: On main: Save work\n");
  const files = api.parseStashFilesOutput("M\tweb-app/index.html\nA\tnew-file.md\nR100\told.md\tnew.md\n");

  assert.deepEqual(JSON.parse(JSON.stringify(stashes)), [
    { ref: "stash@{0}", message: "WIP on main: Update docs", files: [] },
    { ref: "stash@{1}", message: "On main: Save work", files: [] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(files)), [
    { status: "M", path: "web-app/index.html" },
    { status: "A", path: "new-file.md" },
    { status: "R100", path: "old.md -> new.md" }
  ]);
  assert.equal(api.normalizeStashRef("stash@{2}"), "stash@{2}");
  assert.throws(() => api.normalizeStashRef("stash@{bad}"), /invalid/);
});

test("workspace git renders stash rows with selectable stash refs and files", () => {
  const api = loadWorkspaceGitTestApi();
  const row = api.renderGitStashRow({
    ref: "stash@{0}",
    message: "WIP on main: Update docs",
    files: [
      { status: "M", path: "web-app/index.html" },
      { status: "R100", path: "docs/old.md -> docs/new.md" }
    ]
  });

  assert.match(row, /class="workspace-git-stash-check"/);
  assert.match(row, /type="checkbox"/);
  assert.match(row, /value="stash@\{0\}"/);
  assert.match(row, /WIP on main: Update docs/);
  assert.match(row, /class="workspace-git-stash-file-compare workspace-git-file-path"/);
  assert.match(row, /data-stash-ref="stash@\{0\}"/);
  assert.match(row, /data-file-path="web-app\/index.html"/);
  assert.match(row, /data-file-path="docs\/new.md"/);
  assert.match(row, /data-original-path="docs\/old.md"/);
});

test("workspace git builds direct git commands for selected files", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(
    api.buildDirectGitCommand("C:/repo", "stage", { files: ["docs/a.md", "docs/b.md"] }),
    'git -C "C:/repo" add -- "docs/a.md" "docs/b.md"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "commit", { message: "Update docs" }),
    'git -C "C:/repo" commit -m "Update docs"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "stashCreate", { files: ["docs/a.md"], message: "Save work" }),
    'git -C "C:/repo" stash push --include-untracked --keep-index -m "Save work" -- "docs/a.md"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "stashPop", { stashRef: "stash@{0}" }),
    'git -C "C:/repo" stash pop "stash@{0}"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "compareConflictFile", { filePath: "docs/a.md" }),
    'git -C "C:/repo" show ":3:docs/a.md"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "compareStashFile", { stashRef: "stash@{0}", filePath: "docs/a.md" }),
    'git -C "C:/repo" show "stash@{0}:docs/a.md"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "discardChanges", { files: ["docs/a.md"] }),
    'git -C "C:/repo" restore --worktree -- "docs/a.md"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "stashDrop", { stashRefs: ["stash@{1}", "stash@{4}"] }),
    'git -C "C:/repo" stash drop "stash@{4}" && git -C "C:/repo" stash drop "stash@{1}"'
  );
});

test("workspace git builds reset command from validated branch names", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(api.normalizeBranchName(" release/8.18 "), "release/8.18");
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "resetToRemote", { branch: "main" }),
    'git -C "C:/repo" switch -f "main" && git -C "C:/repo" fetch origin && git -C "C:/repo" reset --hard "origin/main" && git -C "C:/repo" clean -fd'
  );
  assert.throws(() => api.normalizeBranchName("../main"), /invalid/);
  assert.throws(() => api.normalizeBranchName("bad branch"), /invalid/);
});

test("workspace git parses local and remote branches for switching", () => {
  const api = loadWorkspaceGitTestApi();
  const localBranches = api.parseLocalBranchListOutput("main|origin/main|*|2026-06-27 12:00:00 +0300|abc1234\nfeature/a|origin/feature/a||2026-06-26 10:00:00 +0300|def5678\nlocal-only|||2026-06-25 09:00:00 +0300|fed4321\n");
  const remoteBranches = api.parseRemoteBranchListOutput("origin\norigin/HEAD\norigin/HEAD -> origin/main\norigin/main|2026-06-27 11:00:00 +0300|aaa1111\norigin/feature/a|2026-06-26 10:00:00 +0300|def5678\norigin/feature/new|2026-06-24 08:00:00 +0300|bbb2222\n");
  const branches = api.createBranchList(localBranches, remoteBranches, "main");

  assert.deepEqual(JSON.parse(JSON.stringify(branches.remote)), [
    { type: "remote", name: "origin/main", localName: "main", hasLocal: true, current: true, tracking: "origin/main", updatedAt: "2026-06-27 12:00:00 +0300", commitHash: "abc1234" },
    { type: "remote", name: "origin/feature/a", localName: "feature/a", hasLocal: true, current: false, tracking: "origin/feature/a", updatedAt: "2026-06-26 10:00:00 +0300", commitHash: "def5678" },
    { type: "remote", name: "origin/feature/new", localName: "feature/new", hasLocal: false, current: false, tracking: "origin/feature/new", updatedAt: "2026-06-24 08:00:00 +0300", commitHash: "bbb2222" }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(branches.localOnly)), [
    { type: "local", name: "local-only", current: false, tracking: "", updatedAt: "2026-06-25 09:00:00 +0300", commitHash: "fed4321" }
  ]);
  assert.equal(api.getBranchListCount(branches), 4);
  assert.equal(api.getBranchDisplayName(branches.remote[2]), "feature/new");
  assert.equal(api.getBranchSourceLabel(branches.remote[0]), "Local + remote");
  assert.equal(api.getBranchSourceLabel(branches.remote[2]), "Remote only");
  assert.equal(api.getBranchSourceLabel(branches.localOnly[0]), "Local only");
});

test("workspace git chooses compact or full branch switcher mode", () => {
  const api = loadWorkspaceGitTestApi();
  const compact = api.createBranchList([], [{ name: "origin/main", localName: "main" }], "");
  const many = api.createBranchList([], Array.from({ length: 17 }, (_, index) => ({ name: `origin/branch-${index}`, localName: `branch-${index}` })), "");
  const longName = api.createBranchList([], [{ name: "origin/codex/improve-graph-view-text-fade-between-many-states", localName: "codex/improve-graph-view-text-fade-between-many-states" }], "");

  assert.equal(api.getBranchSwitchMode(compact), "compact");
  assert.equal(api.getBranchSwitchMode(many), "full");
  assert.equal(api.getBranchSwitchMode(longName), "full");
});

test("workspace git validates branch switch readiness helpers", () => {
  const api = loadWorkspaceGitTestApi();
  const cleanStatus = api.createStatusResult("## main\n");
  const dirtyStatus = api.createStatusResult("## main\n M README.md\n");

  assert.equal(api.isGitStatusDirty(cleanStatus.status), false);
  assert.equal(api.isGitStatusDirty(dirtyStatus.status), true);
  assert.equal(api.isTabUnsaved({ content: "one", savedContent: "one" }), false);
  assert.equal(api.isTabUnsaved({ content: "two", savedContent: "one" }), true);
  assert.equal(api.isTabUnsaved({ type: "graph", content: "two", savedContent: "one" }), false);
});

test("workspace git suggests creating missing searched branches", () => {
  const api = loadWorkspaceGitTestApi();
  const branches = api.createBranchList(
    api.parseLocalBranchListOutput("main|origin/main|*\nlocal-only||\n"),
    api.parseRemoteBranchListOutput("origin/main\norigin/feature/a\n"),
    "main"
  );

  assert.deepEqual(JSON.parse(JSON.stringify(api.getBranchCreateSuggestion("new_branch", branches, "main"))), {
    branch: "new_branch",
    fromBranch: "main"
  });
  assert.equal(api.getBranchCreateSuggestion("main", branches, "main"), null);
  assert.equal(api.getBranchCreateSuggestion("feature/a", branches, "main"), null);
  assert.equal(api.getBranchCreateSuggestion("bad branch", branches, "main"), null);
  assert.equal(api.getBranchCreateSuggestion(" ", branches, "main"), null);
});

test("workspace git parses and renders tags", () => {
  const api = loadWorkspaceGitTestApi();
  const tags = api.parseTagListOutput("v8.18.0|2026-06-27 12:00:00 +0300|abc1234\nv8.17.0|2026-06-20 10:00:00 +0300|def5678\n");

  assert.deepEqual(JSON.parse(JSON.stringify(tags)), [
    { name: "v8.18.0", updatedAt: "2026-06-27 12:00:00 +0300", commitHash: "abc1234" },
    { name: "v8.17.0", updatedAt: "2026-06-20 10:00:00 +0300", commitHash: "def5678" }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.getTagCreateSuggestion("v8.19.0", tags, "main"))), {
    tag: "v8.19.0",
    fromBranch: "main"
  });
  assert.equal(api.getTagCreateSuggestion("v8.18.0", tags, "main"), null);
  assert.equal(api.getTagCreateSuggestion("bad tag", tags, "main"), null);

  const html = api.renderTagModalItems(tags, {
    createSuggestion: { tag: "v8.19.0", fromBranch: "main" }
  });
  assert.match(html, /Create tag <strong>v8.19.0<\/strong> from main/);
  assert.match(html, /workspace-git-tag-copy/);
  assert.match(html, /workspace-git-tag-menu-button/);
  assert.match(html, /data-tag-name="v8.18.0"/);
});

test("workspace git renders full branch rows with copy actions", () => {
  const api = loadWorkspaceGitTestApi();
  const branches = api.createBranchList(
    api.parseLocalBranchListOutput("main|origin/main|*|2026-06-27 12:00:00 +0300|abc1234\nlocal-only|||2026-06-25 09:00:00 +0300|fed4321\n"),
    api.parseRemoteBranchListOutput("origin/main|2026-06-27 11:00:00 +0300|aaa1111\norigin/feature/new|2026-06-24 08:00:00 +0300|bbb2222\n"),
    "main"
  );
  const html = api.renderBranchModalItems([...branches.remote, ...branches.localOnly], {
    createSuggestion: { branch: "new_branch", fromBranch: "main" }
  });

  assert.match(html, /Branch/);
  assert.match(html, /Updated/);
  assert.match(html, /Source/);
  assert.match(html, /Actions/);
  assert.match(html, /data-branch-create="true"/);
  assert.match(html, /Create branch <strong>new_branch<\/strong> from main/);
  assert.match(html, /workspace-git-branch-copy/);
  assert.match(html, /workspace-git-branch-activity/);
  assert.match(html, /workspace-git-branch-menu-button/);
  assert.match(html, /data-branch-name="feature\/new"/);
  assert.match(html, /data-remote-branch="origin\/feature\/new"/);
  assert.match(html, /data-remote-branch="origin\/main"/);
  assert.match(html, /data-local-branch="local-only"/);
  assert.match(html, /data-current="true"/);
  assert.match(html, /Local \+ remote/);
  assert.match(html, /Remote only/);
  assert.match(html, /Local only/);
});

test("workspace git builds direct branch list, switch, and action commands", () => {
  const api = loadWorkspaceGitTestApi();

  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchList"),
    'git -C "C:/repo" fetch --prune'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "switchBranch", { branch: "feature/a" }),
    'git -C "C:/repo" switch "feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "switchBranch", { remoteBranch: "origin/feature/new" }),
    'git -C "C:/repo" switch --track "origin/feature/new"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchCreate", { branch: "new_branch" }),
    'git -C "C:/repo" switch -c "new_branch"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchRename", { branch: "feature/a", newBranch: "feature/b" }),
    'git -C "C:/repo" branch -m "feature/a" "feature/b"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchPush", { branch: "feature/a" }),
    'git -C "C:/repo" push -u origin "feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchDeleteLocal", { branch: "feature/a" }),
    'git -C "C:/repo" branch -d "feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchDeleteRemote", { remoteBranch: "origin/feature/a" }),
    'git -C "C:/repo" push "origin" --delete "feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchActivity", { ref: "origin/feature/a" }),
    'git -C "C:/repo" log --skip=0 -n 21 --date=relative --pretty=format:"%h%x1f%ad%x1f%an%x1f%s" "origin/feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "branchActivity", { ref: "origin/feature/a", activitySkip: 20, activityLimit: 20 }),
    'git -C "C:/repo" log --skip=20 -n 21 --date=relative --pretty=format:"%h%x1f%ad%x1f%an%x1f%s" "origin/feature/a"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "tagCreate", { tag: "v8.19.0" }),
    'git -C "C:/repo" tag "v8.19.0"'
  );
  assert.equal(
    api.buildDirectGitCommand("C:/repo", "tagDelete", { tag: "v8.19.0" }),
    'git -C "C:/repo" tag -d "v8.19.0"'
  );
  assert.equal(api.normalizeRemoteBranchName("origin/main"), "origin/main");
  assert.equal(api.getLocalBranchNameFromRemote("origin/bugfix/b"), "bugfix/b");
  assert.deepEqual(JSON.parse(JSON.stringify(api.splitRemoteBranchName("upstream/bugfix/b"))), { remote: "upstream", branch: "bugfix/b" });
  assert.throws(() => api.normalizeRemoteBranchName("main"), /invalid: main/);
});

test("workspace git parses branch activity output", () => {
  const api = loadWorkspaceGitTestApi();
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseBranchActivityOutput("abc123\u001f2 hours ago\u001fshaybc\u001fAdd branch actions\n"))), [
    { hash: "abc123", date: "2 hours ago", author: "shaybc", subject: "Add branch actions" }
  ]);
  assert.equal(api.normalizeBranchActivityLimit(250), 100);
  assert.equal(api.normalizeBranchActivityLimit(""), 20);
  assert.equal(api.normalizeBranchActivitySkip(20), 20);
  assert.equal(api.normalizeBranchActivitySkip(-1), 0);
});

test("workspace git caps digest patches per file and per section", () => {
  const api = loadWorkspaceGitTestApi();
  const smallPatch = "diff --git a/a.md b/a.md\n+one\n+two";
  assert.deepEqual(JSON.parse(JSON.stringify(api.capDigestPatchText(smallPatch))), { text: smallPatch, truncated: false });
  const bigChunk = `diff --git a/big.md b/big.md\n${"+line\n".repeat(500)}`;
  const capped = api.capDigestPatchText(`${bigChunk}${smallPatch}\n`);
  assert.equal(capped.truncated, true);
  assert.match(capped.text, /\.\.\.\[patch truncated\]/);
  assert.match(capped.text, /diff --git a\/a.md/);
});

test("workspace git builds the changes digest with scope and truncation markers", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main...origin/main [ahead 1]\nM  staged.md\n M changed.md\n?? new-file.md\n").status;
  const digest = api.buildChangesDigest({
    status,
    unpushedLog: ["abc123", "2026-07-01", "shaybc", "Earlier work"].join(String.fromCharCode(31)) + "\n",
    unpushedStat: " a.md | 1 +",
    unpushedPatch: "diff --git a/a.md b/a.md\n+x",
    stagedStat: " staged.md | 1 +",
    stagedPatch: "diff --git a/staged.md b/staged.md\n+y",
    unstagedStat: " changed.md | 1 +",
    unstagedPatch: `diff --git a/changed.md b/changed.md\n${"+z\n".repeat(500)}`,
    untracked: [{ path: "new-file.md", content: "hello", binary: false, truncated: false }]
  });
  assert.equal(digest.branch, "main");
  assert.equal(digest.tracking, "origin/main");
  assert.equal(digest.ahead, 1);
  assert.equal(digest.clean, false);
  assert.equal(digest.commitScope, "staged");
  assert.deepEqual(JSON.parse(JSON.stringify(digest.unpushedCommits)), [{ hash: "abc123", date: "2026-07-01", author: "shaybc", subject: "Earlier work" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(digest.truncated)), ["unstagedPatch"]);
  assert.match(digest.unstagedPatch, /\.\.\.\[patch truncated\]/);
  assert.equal(digest.untracked[0].path, "new-file.md");
});

test("workspace git digest uses all-changes scope when nothing is staged", () => {
  const api = loadWorkspaceGitTestApi();
  const status = api.createStatusResult("## main\n M changed.md\n").status;
  const digest = api.buildChangesDigest({ status });
  assert.equal(digest.commitScope, "all");
  assert.equal(digest.tracking, "");
  assert.deepEqual(JSON.parse(JSON.stringify(digest.unpushedCommits)), []);
  assert.equal(digest.clean, false);
});

test("workspace git digest total budget drops patches but keeps stats", () => {
  const api = loadWorkspaceGitTestApi();
  const digest = {
    unpushedPatch: "x".repeat(200 * 1024),
    unstagedPatch: "y".repeat(10),
    stagedPatch: "z".repeat(10),
    truncated: []
  };
  const result = api.enforceDigestTotalBudget(digest);
  assert.equal(result.unpushedPatch, "");
  assert.deepEqual(JSON.parse(JSON.stringify(result.truncated)), ["unpushedPatch"]);
  assert.equal(result.unstagedPatch, "y".repeat(10));
});

test("workspace git caps untracked digest content by count and total size", () => {
  const api = loadWorkspaceGitTestApi();
  const untracked = [];
  for (let index = 0; index < 45; index++) {
    untracked.push({ path: `file-${index}.md`, content: "x".repeat(2 * 1024), binary: false, truncated: false });
  }
  const markers = api.capUntrackedDigestEntries(untracked);
  // 48KB shared budget allows 24 files of 2KB; the count cap allows 40 - so
  // the byte budget wins here and later files keep only their paths.
  const withContent = untracked.filter((entry) => entry.content).length;
  assert.equal(withContent, 24);
  assert.equal(markers.length, 45 - 24);
  assert.equal(untracked[44].content, "");
  assert.equal(untracked[44].truncated, true);
});

test("workspace git digest total budget drops untracked contents after patches", () => {
  const api = loadWorkspaceGitTestApi();
  const digest = {
    unpushedPatch: "",
    unstagedPatch: "",
    stagedPatch: "",
    untracked: [{ path: "big.md", content: "x".repeat(200 * 1024), binary: false, truncated: false }],
    truncated: []
  };
  const result = api.enforceDigestTotalBudget(digest);
  assert.equal(result.untracked[0].content, "");
  assert.equal(result.untracked[0].truncated, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.truncated)), ["untracked:big.md"]);
});

test("workspace git rejects changesDigest in the single-command builder", () => {
  const api = loadWorkspaceGitTestApi();
  // Multi-command action: handled by a dedicated direct runner, never by the
  // one-shot command builder.
  assert.throws(() => api.buildDirectGitCommand("C:/repo", "changesDigest"), /not allowed/);
});
