const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const tools = require("../resources/ai-companion/tools/workspace-tools");
const gitPanelTools = require("../resources/ai-companion/tools/git-panel-tools");
const gitBridge = require("../resources/bridges/git-bridge/git-bridge.cjs");
const { getAgentToolDefinitions, runAgentToolLoop } = require("../resources/ai-companion/core/agent-tool-loop");
const { toCanonicalName } = require("../resources/ai-companion/core/tool-scope-registry");

function hasGitCli() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

function createToolCall(name, args) {
  return {
    id: `call-${name}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args)
    },
    raw: {
      id: `call-${name}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args)
      }
    }
  };
}

function createRuntime() {
  return {
    estimateTokens: () => 1,
    throwIfAborted: (signal) => {
      if (signal?.aborted) throw new Error("aborted");
    }
  };
}

function createFixtureRepo() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-git-tools-"));
  const git = (...args) => execFileSync("git", ["-C", repoPath, "-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { encoding: "utf8" });
  git("init");
  fs.writeFileSync(path.join(repoPath, "README.md"), "initial\n");
  git("add", "README.md");
  git("commit", "-m", "initial commit");
  return { repoPath, git };
}

test("Git Panel tools are exposed by mode with plan mode unchanged", () => {
  const chatDefinitions = getAgentToolDefinitions("chat");
  // Definitions expose model-facing names; canonicalize for these assertions.
  const chatNames = chatDefinitions.map((definition) => toCanonicalName(definition.function.name));
  const agentNames = getAgentToolDefinitions("agent").map((definition) => toCanonicalName(definition.function.name));
  const planNames = getAgentToolDefinitions("plan").map((definition) => toCanonicalName(definition.function.name));

  assert.equal(chatNames.includes("git_status"), true);
  assert.equal(chatNames.includes("git_changes_digest"), true);
  assert.equal(chatNames.includes("git_stage"), false);
  assert.equal(agentNames.includes("git_status"), true);
  assert.equal(agentNames.includes("git_stage"), true);
  assert.equal(agentNames.includes("git_commit"), true);
  assert.equal(planNames.includes("git_status"), false);
  assert.equal(planNames.includes("git_stage"), false);
  const statusDefinition = chatDefinitions.find((definition) => toCanonicalName(definition.function.name) === "git_status");
  assert.equal(statusDefinition.function.parameters.properties.maxFiles.maximum, 1000);
  assert.match(statusDefinition.function.description, /counts are complete; file details may be truncated/i);
});

test("Git Panel read tools inspect status, digest, and PR notes context", { skip: !hasGitCli() }, async () => {
  const { repoPath } = createFixtureRepo();
  try {
    fs.appendFileSync(path.join(repoPath, "README.md"), "changed\n");
    fs.writeFileSync(path.join(repoPath, "staged.md"), "staged\n");
    fs.writeFileSync(path.join(repoPath, "untracked.md"), "untracked\n");
    execFileSync("git", ["-C", repoPath, "add", "staged.md"], { stdio: "ignore" });

    const status = await tools.runGitPanelTool(repoPath, "git_status");
    assert.equal(status.isRepo, true);
    assert.deepEqual(status.counts, { files: 3, staged: 1, unstaged: 2 });
    assert.equal(status.truncated, false);
    assert.equal(status.returnedFiles, 3);
    assert.equal(status.status.files.some((file) => file.path === "README.md"), true);
    assert.equal(status.status.staged.some((file) => file.path === "staged.md"), true);

    const digest = await tools.runGitPanelTool(repoPath, "git_changes_digest");
    assert.match(digest.digest.stagedPatch, /staged/);
    assert.match(digest.digest.unstagedPatch, /changed/);
    assert.equal(digest.digest.untracked.some((entry) => entry.path === "untracked.md"), true);

    const notes = await tools.runGitPanelTool(repoPath, "git_pr_notes");
    assert.match(notes.scaffold, /# PR Notes/);
    assert.equal(notes.digest.clean, false);
  } finally {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Git status preserves the existing non-repository result", { skip: !hasGitCli() }, async () => {
  const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-git-tools-non-repo-"));
  try {
    const result = await tools.runGitPanelTool(folderPath, "git_status");
    assert.equal(result.isRepo, false);
    assert.deepEqual(result.counts, { files: 0, staged: 0, unstaged: 0 });
    assert.equal(result.status.files.length, 0);
    assert.equal(result.truncated, false);
  } finally {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
});

test("model-facing Git status sorts and bounds details while keeping complete counts", () => {
  const files = [
    { path: "z.md", originalPath: "", index: " ", workingDir: "M" },
    { path: "a.md", originalPath: "", index: "A", workingDir: " " },
    { path: "m.md", originalPath: "", index: "?", workingDir: "?" }
  ];
  const result = gitPanelTools.createBoundedGitStatusResult({
    action: "status",
    isRepo: true,
    status: { branch: "main", tracking: "origin/main", ahead: 0, behind: 0, files }
  }, 2);

  assert.deepEqual(result.counts, { files: 3, staged: 1, unstaged: 2 });
  assert.deepEqual(result.status.files.map((file) => file.path), ["a.md", "m.md"]);
  assert.equal(result.returnedFiles, 2);
  assert.equal(result.truncated, true);
  assert.equal(Buffer.byteLength(JSON.stringify(result, null, 2), "utf8") <= gitPanelTools.GIT_STATUS_RESULT_MAX_BYTES, true);

  const pathologicalName = gitPanelTools.createBoundedGitStatusResult({
    action: "status",
    isRepo: true,
    status: {
      branch: "main", tracking: "", ahead: 0, behind: 0,
      files: [{ path: `${"x".repeat(2000)}.md`, originalPath: "", index: " ", workingDir: "M" }]
    }
  }, 1, 500);
  assert.equal(pathologicalName.counts.files, 1);
  assert.equal(pathologicalName.returnedFiles, 0);
  assert.equal(pathologicalName.truncated, true);
  assert.equal(Buffer.byteLength(JSON.stringify(pathologicalName, null, 2), "utf8") <= 500, true);

  const overLimit = gitPanelTools.createBoundedGitStatusResult({
    action: "status",
    isRepo: true,
    status: { branch: "x".repeat(2000), tracking: "", ahead: 0, behind: 0, files: [] }
  }, 1, 500);
  assert.deepEqual(overLimit, {
    status: "failed",
    error: {
      code: "GIT_STATUS_RESULT_LIMIT",
      stage: "limit",
      retryable: false,
      message: "Git status exceeded the result limit."
    }
  });

  const manyFiles = Array.from({ length: 1001 }, (_, index) => ({
    path: `${String(index).padStart(4, "0")}.md`, originalPath: "", index: " ", workingDir: "M"
  }));
  const hardCapped = gitPanelTools.createBoundedGitStatusResult({
    action: "status",
    isRepo: true,
    status: { branch: "main", tracking: "", ahead: 0, behind: 0, files: manyFiles }
  }, 5000, 1024 * 1024);
  assert.equal(hardCapped.counts.files, 1001);
  assert.equal(hardCapped.returnedFiles, 1000);
  assert.equal(hardCapped.truncated, true);
});

test("successful Git status remains successful after activity formatting", async () => {
  const originalRunRequest = gitBridge.runRequest;
  const events = [];
  let round = 0;
  gitBridge.runRequest = async () => ({
    action: "status",
    isRepo: true,
    status: {
      branch: "main",
      tracking: "origin/main",
      ahead: 0,
      behind: 0,
      files: [{ path: "changed.md", originalPath: "", index: " ", workingDir: "M" }]
    }
  });
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) return { content: "", toolCalls: [createToolCall("git_status", {})] };
      return { content: "One changed file was found.", toolCalls: [] };
    },
    complete: async () => "One changed file was found."
  };

  try {
    await runAgentToolLoop(provider, {}, process.cwd(), "check status", "agent", (event) => events.push(event), createRuntime());
  } finally {
    gitBridge.runRequest = originalRunRequest;
  }

  assert.equal(events.some((event) => event.type === "tool-error" && event.tool === "git_status"), false);
  const completed = events.find((event) => event.type === "tool" && event.tool === "git_status" && event.activity?.status === "completed");
  assert.equal(completed.activity.resultSummary, "1 changed file(s)");
  const summary = events.find((event) => event.type === "agent-summary");
  const evidence = summary.evidenceLedger.find((entry) => entry.tool === "git_status");
  assert.equal(evidence.outcome, "succeeded");
  assert.equal(evidence.verifiedState, true);
});

test("Git status failures are non-retryable failed evidence and unchanged retries do not execute", async () => {
  const originalRunRequest = gitBridge.runRequest;
  const events = [];
  let bridgeCalls = 0;
  let round = 0;
  gitBridge.runRequest = async () => {
    bridgeCalls += 1;
    const error = new Error("private raw parser detail");
    error.code = "GIT_STATUS_PARSE_FAILED";
    error.stage = "parse";
    error.retryable = false;
    throw error;
  };
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round <= 2) return { content: "", toolCalls: [createToolCall("git_status", {})] };
      return { content: "Status could not be verified.", toolCalls: [] };
    },
    complete: async () => "Status could not be verified."
  };

  try {
    await runAgentToolLoop(provider, {}, process.cwd(), "check status", "agent", (event) => events.push(event), createRuntime());
  } finally {
    gitBridge.runRequest = originalRunRequest;
  }

  assert.equal(bridgeCalls, 1);
  const firstFailure = events.find((event) => event.type === "tool-error" && event.tool === "git_status");
  assert.equal(firstFailure.structuredResult.status, "failed");
  assert.equal(firstFailure.structuredResult.error.retryable, false);
  assert.equal(JSON.stringify(firstFailure.structuredResult).includes("private raw parser detail"), false);
  const summary = events.find((event) => event.type === "agent-summary");
  const evidence = summary.evidenceLedger.find((entry) => entry.tool === "git_status");
  assert.equal(evidence.outcome, "failed");
  assert.equal(evidence.verifiedState, false);
});

test("Git Panel mutations require approval and can stage and commit after approval", { skip: !hasGitCli() }, async () => {
  const { repoPath, git } = createFixtureRepo();
  try {
    fs.writeFileSync(path.join(repoPath, "approved.md"), "approved\n");
    const approvals = [];
    let round = 0;
    const provider = {
      completeMessage: async () => {
        round += 1;
        if (round === 1) return { content: "", toolCalls: [createToolCall("git_stage", { files: ["approved.md"] })] };
        if (round === 2) return { content: "", toolCalls: [createToolCall("git_commit", { message: "Add approved file" })] };
        return { content: "done", toolCalls: [] };
      },
      complete: async () => "done"
    };

    await runAgentToolLoop(provider, { toolScopes: { "git.write": true } }, repoPath, "stage and commit", "agent", () => {}, createRuntime(), {
      requestApproval: async (details) => {
        approvals.push(details);
        return { decision: "approve" };
      }
    });

    assert.deepEqual(approvals.map((approval) => approval.tool), ["git_stage", "git_commit"]);
    assert.match(git("log", "-1", "--pretty=%s"), /Add approved file/);
    assert.match(git("show", "--name-only", "--pretty=", "HEAD"), /approved.md/);
  } finally {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
});

test("Git Panel mutation rejection prevents the git action", { skip: !hasGitCli() }, async () => {
  const { repoPath, git } = createFixtureRepo();
  try {
    fs.writeFileSync(path.join(repoPath, "rejected.md"), "rejected\n");
    let approvalRequested = false;
    let round = 0;
    const provider = {
      completeMessage: async () => {
        round += 1;
        return round === 1
          ? { content: "", toolCalls: [createToolCall("git_stage", { files: ["rejected.md"] })] }
          : { content: "done", toolCalls: [] };
      },
      complete: async () => "done"
    };

    await runAgentToolLoop(provider, {}, repoPath, "stage rejected", "agent", () => {}, createRuntime(), {
      requestApproval: async () => {
        approvalRequested = true;
        return { decision: "reject" };
      }
    });

    assert.equal(approvalRequested, true);
    assert.equal(git("diff", "--cached", "--name-only").trim(), "");
  } finally {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
});

test("AI Companion panel refreshes the Git panel after mutating git tools", () => {
  const panelSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/panel.js"), "utf8");
  const scriptSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");

  assert.match(panelSource, /GIT_PANEL_REFRESH_TOOLS/);
  assert.match(panelSource, /refreshGitPanelAfterTool\(savedEvent\)/);
  assert.match(panelSource, /refreshWorkspaceGitFromAgentTool/);
  assert.match(scriptSource, /refreshWorkspaceGitFromAgentTool/);
  assert.match(scriptSource, /workspaceGit\?\.refreshWorkspaceGitStatus/);
});
