const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  FOLDER_APPROVAL_POLICY_PATH,
  getPolicyDecision,
  normalizeApprovalPolicy
} = require("../resources/ai-companion/core/agent-approval-policy");
const approvalPolicy = require("../resources/ai-companion/core/agent-approval-policy");
const approvalCapabilities = require("../resources/ai-companion/core/approval-capability-registry");
const { ApprovalGrantStore } = require("../resources/ai-companion/core/approval-grant-store");
const { analyzeApprovalAction } = require("../resources/ai-companion/core/approval-action-analysis");
const { toCanonicalName } = require("../resources/ai-companion/core/tool-scope-registry");
const { PRODUCT_DEFAULT_POLICY } = require("../resources/ai-companion/security/policy-schema");
const { getAgentToolDefinitions, runAgentToolLoop } = require("../resources/ai-companion/core/agent-tool-loop");
const { validateApprovalIntent } = require("../resources/ai-companion/core/approval-intent-validation");
const { createResumeAction, validateResumeCheckpoint } = require("../resources/ai-companion/core/interrupted-task-resume");
const { runPlanMode } = require("../resources/ai-companion/modes/plan");

test("restart continuation replays the exact pending write before the model continues", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-resume-write-"));
  const filePath = path.join(workspace, "AppConstants.java");
  await fs.writeFile(filePath, "before", "utf8");
  const args = { path: "AppConstants.java", content: "after", approvalReason: "Replace the old package declaration." };
  const descriptor = approvalCapabilities.describe("write_file", args, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  const pendingAction = await createResumeAction(workspace, {
    activityId: "write-before-restart",
    tool: "write_file",
    args,
    capability: descriptor.capability,
    resource: descriptor.resource,
    approvalReason: args.approvalReason,
    compare: { path: args.path, beforeContent: "before" }
  });
  let approvals = 0;
  let firstMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      firstMessages = messages;
      return { content: "The saved write completed.", toolCalls: [] };
    },
    complete: async () => "The saved write completed."
  };

  await runAgentToolLoop(provider, {}, workspace, "Rename the package", "agent", () => {}, createRuntime(), {
    resumeCheckpoint: { version: 1, workspaceRoot: workspace, rootPrompt: "Rename the package", pendingAction },
    requestApproval: async (details) => {
      approvals += 1;
      assert.equal(details.resumeAction.args.content, "after");
      return { decision: "approve" };
    }
  });

  assert.equal(approvals, 1);
  assert.equal(await fs.readFile(filePath, "utf8"), "after");
  assert.equal(firstMessages.some((message) => (
    message.role === "user"
      && /harness-tool-observation/.test(message.content)
      && /AppConstants\.java/.test(message.content)
  )), true);
  assert.equal(firstMessages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => /_resume$/.test(call.id))), false);
});

test("restart continuation does not replay a write whose file changed", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-resume-stale-"));
  const filePath = path.join(workspace, "AppConstants.java");
  await fs.writeFile(filePath, "before", "utf8");
  const args = { path: "AppConstants.java", content: "after", approvalReason: "Replace the old package declaration." };
  const descriptor = approvalCapabilities.describe("write_file", args, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  const pendingAction = await createResumeAction(workspace, { tool: "write_file", args, capability: descriptor.capability, resource: descriptor.resource, approvalReason: args.approvalReason, compare: { path: args.path, beforeContent: "before" } });
  await fs.writeFile(filePath, "changed outside the task", "utf8");
  let approvals = 0;
  let round = 0;
  let modelMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      modelMessages = messages;
      round += 1;
      return round === 1 ? { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 10 })] } : { content: "The saved write is stale.", toolCalls: [] };
    },
    complete: async () => "The saved write is stale."
  };

  await runAgentToolLoop(provider, {}, workspace, "Rename the package", "agent", () => {}, createRuntime(), {
    resumeCheckpoint: { version: 1, workspaceRoot: workspace, rootPrompt: "Rename the package", pendingAction },
    requestApproval: async () => { approvals += 1; return { decision: "approve" }; }
  });

  assert.equal(approvals, 0);
  assert.equal(await fs.readFile(filePath, "utf8"), "changed outside the task");
  assert.match(JSON.stringify(modelMessages), /target file content changed|saved action was not executed/i);
});

test("restart continuation rejects a checkpoint from another workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-resume-workspace-"));
  const otherWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-resume-other-"));
  await fs.writeFile(path.join(workspace, "App.java"), "before", "utf8");
  const pendingAction = await createResumeAction(workspace, { tool: "write_file", args: { path: "App.java", content: "after" }, compare: { path: "App.java", beforeContent: "before" } });
  const validation = await validateResumeCheckpoint(workspace, { workspaceRoot: otherWorkspace, pendingAction });
  assert.equal(validation.canReplay, false);
  assert.match(validation.reason, /different workspace/);
});

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

function createRuntime(options = {}) {
  return {
    estimateTokens: () => Number(options.estimatedTokens) || 1,
    throwIfAborted: (signal) => {
      if (signal?.aborted) throw new Error("aborted");
    }
  };
}

function createTokenLimitError(message = "Could not finish the message because max tokens or model output limit was reached. Please try again with higher max_tokens.") {
  const error = new Error(message);
  error.providerStatus = 400;
  return error;
}

test("approval action analysis classifies create, modify, clear, and no-op writes", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-action-analysis-"));
  await fs.writeFile(path.join(workspace, "modify.txt"), "before\n", "utf8");
  await fs.writeFile(path.join(workspace, "clear.txt"), "remove me\n", "utf8");
  await fs.writeFile(path.join(workspace, "same.txt"), "same\n", "utf8");

  const create = await analyzeApprovalAction(workspace, "write_file", { path: "create.txt", content: "new\n", approvalReason: "Create the requested file." });
  const createEmpty = await analyzeApprovalAction(workspace, "write_file", { path: "empty.txt", content: "", approvalReason: "Create the requested empty file." });
  const modify = await analyzeApprovalAction(workspace, "write_file", { path: "modify.txt", content: "after\n", approvalReason: "Update the requested file." });
  const clear = await analyzeApprovalAction(workspace, "write_file", { path: "clear.txt", content: "", approvalReason: "Clear the requested file content." });
  const noOp = await analyzeApprovalAction(workspace, "write_file", { path: "same.txt", content: "same\n", approvalReason: "Keep the requested content." });

  assert.deepEqual([create.operation, modify.operation, clear.operation, noOp.operation], ["create", "modify", "clear", "no-op"]);
  assert.equal(create.operationLabel, "Create file");
  assert.equal(createEmpty.operation, "create");
  assert.equal(createEmpty.canApprove, true);
  assert.equal(modify.lineImpact.additions, 1);
  assert.equal(clear.outcomeDescription, "The file will remain at this path but will contain no text.");
  assert.equal(noOp.canApprove, false);
  assert.equal(noOp.blockingCode, "APPROVAL_ACTION_NO_CHANGE");
});

test("no-op file writes never request approval or reach the filesystem write", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-no-op-approval-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-no-op-profile-"));
  const filePath = path.join(workspace, "same.txt");
  await fs.writeFile(filePath, "same\n", "utf8");
  await new ApprovalGrantStore(profileRoot, workspace).add({ capability: "workspace.file.write", matcher: { type: "path-glob", value: "**/*" }, lifetime: "workspace", enabled: true });
  let approvalRequested = false;
  let round = 0;
  let finalMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      finalMessages = messages;
      round += 1;
      return round === 1
        ? { content: "", toolCalls: [createToolCall("write_file", { path: "same.txt", content: "same\n", approvalReason: "Keep the requested content." })] }
        : { content: "No change was needed.", toolCalls: [] };
    },
    complete: async () => "No change was needed."
  };

  await runAgentToolLoop(provider, {}, workspace, "Keep the file current", "agent", () => {}, createRuntime(), {
    profileRoot,
    requestApproval: async () => { approvalRequested = true; return { decision: "approve" }; }
  });

  assert.equal(approvalRequested, false);
  assert.equal(await fs.readFile(filePath, "utf8"), "same\n");
  assert.match(JSON.stringify(finalMessages), /APPROVAL_ACTION_NO_CHANGE/);
});


test("plan mode exposes only read-only workspace tools", () => {
  const names = getAgentToolDefinitions("plan").map((definition) => toCanonicalName(definition.function.name));

  assert.deepEqual(names, ["get_workspace_state", "read_active_document", "read_open_tabs", "get_document_structure", "search_vault", "get_link_context", "get_recent_activity", "graph_get_state", "graph_search_nodes", "graph_get_node_context", "graph_find_paths", "list_files", "glob", "search_text", "read_file"]);
  assert.equal(names.includes("apply_edit"), false);
  assert.equal(names.includes("write_file"), false);
  assert.equal(names.includes("run_command"), false);
  assert.equal(names.includes("request_create"), false);
});

test("approval-capable agent tools require a user-facing rationale", () => {
  const definitions = getAgentToolDefinitions("agent");
  for (const name of ["write_file", "apply_edit", "run_command", "preferences_update", "git_commit", "create_document_tab"]) {
    const parameters = definitions.find((definition) => toCanonicalName(definition.function.name) === name)?.function?.parameters;
    assert.ok(parameters, `${name} definition`);
    assert.equal(parameters.required.includes("approvalReason"), true, name);
    assert.equal(parameters.properties.approvalReason.maxLength, 160, name);
    assert.equal(parameters.properties.approvalReason.pattern, "^[^\\r\\n]+$", name);
  }
  const readParameters = definitions.find((definition) => definition.function.name === "read_file").function.parameters;
  assert.equal((readParameters.required || []).includes("approvalReason"), false);
});

test("approval intent rejects filesystem deletion claims for non-deleting tools", () => {
  const result = validateApprovalIntent("create_document_tab", {
    path: "Cleanup.java",
    approvalReason: "Create a marker file or remove obsolete files if needed."
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "APPROVAL_INTENT_TOOL_MISMATCH");
  assert.match(result.message, /cannot delete files, folders, or package directories/);
  assert.match(result.message, /Do not create a marker or placeholder file as a substitute/);
  assert.equal(validateApprovalIntent("write_file", { approvalReason: "Move the old file into the new package." }).allowed, false);
  assert.deepEqual(validateApprovalIntent("create_document_tab", {
    approvalReason: "Create the requested Java source file."
  }), { allowed: true });
});

test("mismatched approval intent does not request approval or execute the editor action", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-intent-"));
  let round = 0;
  let approvalRequested = false;
  let appActionRequested = false;
  let retryGuidance = [];
  const provider = {
    completeMessage: async (messages) => {
      round += 1;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [createToolCall("create_document_tab", {
            path: "Cleanup.java",
            content: "// cleanup marker",
            approvalReason: "Create a marker file or remove obsolete files if needed."
          })]
        };
      }
      retryGuidance = messages;
      return { content: "The cleanup is incomplete because no delete tool is available.", toolCalls: [] };
    },
    complete: async () => "The cleanup is incomplete because no delete tool is available."
  };

  const content = await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "remove the old package", "agent", () => {}, createRuntime(), {
    requestApproval: async () => {
      approvalRequested = true;
      return { decision: "approve" };
    },
    requestAppAction: async () => {
      appActionRequested = true;
      return { changed: true };
    }
  });

  assert.equal(approvalRequested, false);
  assert.equal(appActionRequested, false);
  const toolResult = JSON.parse(retryGuidance.find((message) => message.role === "tool").content);
  assert.equal(toolResult.code, "APPROVAL_INTENT_TOOL_MISMATCH");
  assert.equal(toolResult.retryable, false);
  assert.equal(toolResult.doNotRetry, true);
  assert.match(content, /cleanup is incomplete/);
});

test("write approval forwards the agent rationale to the approval event", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-reason-"));
  const approvals = [];
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      return round === 1
        ? { content: "", toolCalls: [createToolCall("write_file", { path: "example.txt", content: "updated", approvalReason: "Update the example requested by the user." })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async () => "complete"
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "update example", "agent", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].approvalReason, "Update the example requested by the user.");
  assert.equal(await fs.readFile(path.join(workspace, "example.txt"), "utf8"), "updated");
});

test("plan mode rejects when AI is disabled", async () => {
  await assert.rejects(
    () => runPlanMode({ settings: { enabled: false }, prompt: "Plan this" }, () => {}),
    /plan mode is disabled/
  );
});

test("plan mode forwards request context into the read-only tool loop", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-mode-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-profile-"));
  const events = [];
  const requestApproval = async () => ({ decision: "approve" });
  let firstMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      firstMessages = messages.map((message) => ({ role: message.role, content: message.content }));
      return { content: "ready", toolCalls: [] };
    },
    complete: async () => "<proposed_plan>\n## Summary\nPlan.\n\n## Milestones\n- M1: Inspect files\n</proposed_plan>"
  };
  const runtime = require("../resources/ai-companion/core/agent-runtime");
  const originalCreateProvider = runtime.createProvider;
  runtime.createProvider = () => provider;
  try {
    const result = await runPlanMode({
      settings: { enabled: true },
      workspaceRoot: workspace,
      profileRoot,
      prompt: "Plan this",
      activeFile: { path: "README.md", content: "active file" },
      attachments: [{ name: "notes.md", content: "attached context" }],
      conversationHistory: [{ role: "user", content: "Earlier" }, { role: "assistant", content: "Earlier answer" }],
      requestApproval
    }, (event) => events.push(event));

    assert.match(result.content, /<proposed_plan>/);
    assert.equal(result.plan.status, "planned");
    assert.match(result.plan.path, /^companion\/plans\/\d{4}\/\d{2}\/\d{2}\//);
    assert.deepEqual(result.plan.milestones.map((milestone) => milestone.id), ["M1"]);
    assert.match(JSON.stringify(firstMessages), /active file/);
    assert.match(JSON.stringify(firstMessages), /attached context/);
    assert.match(JSON.stringify(firstMessages), /Earlier answer/);
    assert.equal(events.some((event) => event.type === "content" && /<proposed_plan>/.test(event.content || "")), true);
  } finally {
    runtime.createProvider = originalCreateProvider;
  }
});

test("M3 Plan mode saves the same normalized assessed body that it displays", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-m3-mode-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-m3-profile-"));
  const contract = {
    taskType: "planning",
    relationshipToPrior: "independent",
    goal: { value: "Plan the retry change", provenance: "explicit" },
    expectedOutcome: { value: "A reviewable plan", provenance: "inferred" },
    requestedActions: [{ value: "Create a plan", provenance: "explicit" }],
    prohibitedActions: [],
    outOfScope: [],
    acceptanceCriteria: [{ description: "The plan provides implementation steps", verification: "Review the plan", provenance: "inferred" }],
    namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
    assumptions: [],
    unresolvedDecisions: [],
    ambiguities: [],
    relationshipEvidence: [],
    carriedFieldRefs: [],
    correctedFieldRefs: []
  };
  const provider = {
    completeMessage: async (_messages, options = {}) => {
      if (options.toolChoice?.function?.name === "capture_intent_contract") {
        return { content: "", toolCalls: [{ id: "capture-plan-m3", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      if (options.toolChoice?.function?.name === "assess_acceptance_criteria") {
        return { content: "", toolCalls: [{ id: "assess-plan-m3", function: { name: "assess_acceptance_criteria", arguments: JSON.stringify({
          overallStatus: "complete",
          criteria: [{ id: "AC1", status: "met", evidenceIds: ["EV-CANDIDATE-1"], explanation: "The plan contains steps.", claimType: "response-content" }],
          unmetSummary: ""
        }) } }] };
      }
      return { content: "draft", toolCalls: [] };
    },
    complete: async () => "prefix <proposed_plan>\n# Retry plan\n\n- M1: Inspect retry state\n</proposed_plan> trailing"
  };
  const runtime = require("../resources/ai-companion/core/agent-runtime");
  const originalCreateProvider = runtime.createProvider;
  runtime.createProvider = () => provider;
  try {
    const result = await runPlanMode({
      // This test asserts the saved body matches the displayed body, so isolate it
      // from the save-gate (planRequireSuccessToSaveEnabled defaults on now).
      settings: { enabled: true, intentContractsEnabled: true, intentFastPathEnabled: false, planRequireSuccessToSaveEnabled: false },
      workspaceRoot: workspace,
      profileRoot,
      prompt: "Create a detailed implementation plan for uploader retry state"
    }, () => {});

    const displayedBody = result.content.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i)?.[1]?.trim();
    const saved = await require("../resources/ai-companion/tools/plan-repository-tools").planRead(workspace, { path: result.plan.path }, { profileRoot });
    assert.equal(saved.body, displayedBody);
    assert.match(saved.body, /## Acceptance criteria/);
    assert.equal((result.content.match(/<proposed_plan>/g) || []).length, 1);
    assert.equal((result.content.match(/<\/proposed_plan>/g) || []).length, 1);
  } finally {
    runtime.createProvider = originalCreateProvider;
  }
});
test("approval policy normalizes allowlists and matches write globs", () => {
  const policy = normalizeApprovalPolicy({
    version: 1,
    allow: {
      write: ["desktop-app/resources/wiki/**/*.md", "", null],
      command: ["npm test"],
      test: ["npm run test"]
    }
  });
  const policies = [{ scope: "folder", path: "policy.json", policy }];

  assert.deepEqual(policy.allow.write, ["desktop-app/resources/wiki/**/*.md"]);
  assert.equal(getPolicyDecision(policies, "apply_edit", { path: "desktop-app/resources/wiki/dev/git-integration.md" }).allowed, true);
  assert.equal(getPolicyDecision(policies, "write_file", { path: "src/app.js" }).allowed, false);
});

test("approval policy matches command and test actions by exact trimmed command", () => {
  const policies = [{
    scope: "app",
    path: "policy.json",
    policy: normalizeApprovalPolicy({ allow: { command: ["npm test"], test: ["npm run test"] } })
  }];

  assert.equal(getPolicyDecision(policies, "run_command", { command: " npm test " }).allowed, true);
  assert.equal(getPolicyDecision(policies, "run_command", { command: "npm test -- --watch" }).allowed, false);
  assert.equal(getPolicyDecision(policies, "run_test", { command: "npm run test" }).allowed, true);
});


test("tool loop broadens empty file glob results before final answer", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-file-search-"));
  await fs.mkdir(path.join(workspace, "src", "main", "java"), { recursive: true });
  await fs.writeFile(path.join(workspace, "src", "main", "java", "ASPH.java"), "class ASPH {}", "utf8");
  const events = [];
  let firstCompleteMessages = null;
  let finalMessages = null;
  let firstToolChoice = null;
  let rounds = 0;
  const provider = {
    completeMessage: async (messages, options = {}) => {
      rounds += 1;
      if (!firstCompleteMessages) firstCompleteMessages = messages;
      if (!firstToolChoice) firstToolChoice = options.toolChoice;
      return rounds === 1
        ? { content: "I will locate the requested file.", toolCalls: [createToolCall("glob", { pattern: "**/qs/localtransactions/ASPH.java", maxFiles: 5 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async (messages) => {
      finalMessages = messages;
      return "Found ASPH.java.";
    }
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "look at the ASPH.java class", "chat", (event) => events.push(event), createRuntime(), {});

  assert.equal(content, "Found ASPH.java.");
  assert.equal(firstToolChoice?.function?.name, "read_open_tabs");
  assert.equal(events.some((event) => event.type === "tool" && event.tool === "glob" && event.input === "**/ASPH.java"), true);
  const finalText = JSON.stringify(finalMessages);
  assert.match(finalText, /glob returned no matches/);
  assert.match(finalText, /Do not answer from conversation history as if the file was inspected/);
  assert.match(finalText, /src\/main\/java\/ASPH\.java/);
});

test("tool loop emits first assistant chat title and continues tool execution", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-chat-title-"));
  const events = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "<chat_title>Workspace File Count</chat_title>\nI will inspect the workspace files.", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async () => "Done."
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "count files", "chat", (event) => events.push(event), createRuntime(), {
    requestChatTitle: true
  });

  const titleIndex = events.findIndex((event) => event.type === "chat-title");
  const toolIndex = events.findIndex((event) => event.type === "tool" && event.tool === "list_files");
  assert.equal(events[titleIndex].chatTitle, "Workspace File Count");
  assert.ok(titleIndex >= 0 && toolIndex > titleIndex);
  assert.equal(events.some((event) => String(event.content || "").includes("<chat_title>")), false);
  assert.equal(content, "Done.");
});

test("tool loop strips first assistant chat title from direct answers", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-chat-title-direct-"));
  const events = [];
  const provider = {
    completeMessage: async () => ({ content: "<chat_title>Workspace Indexing</chat_title>\nDirect answer.", toolCalls: [] }),
    complete: async () => "unused"
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "explain indexing", "gitSummary", (event) => events.push(event), createRuntime(), {
    requestChatTitle: true
  });

  assert.equal(events.some((event) => event.type === "chat-title" && event.chatTitle === "Workspace Indexing"), true);
  assert.equal(content, "Direct answer.");
  assert.equal(content.includes("<chat_title>"), false);
});
test("legacy folder approval policy is detected but not silently trusted", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-"));
  await fs.writeFile(path.join(workspace, "README.md"), "before", "utf8");
  const policyPath = path.join(workspace, FOLDER_APPROVAL_POLICY_PATH);
  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  await fs.writeFile(policyPath, JSON.stringify({ version: 1, allow: { write: ["README.md"], command: [], test: [] } }), "utf8");
  const events = [];
  let approvalRequested = false;
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "before", replacement: "after" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => {
      approvalRequested = true;
      return { decision: "approve" };
    }
  });

  assert.equal(await fs.readFile(path.join(workspace, "README.md"), "utf8"), "after");
  assert.equal(approvalRequested, true);
  assert.equal(events.some((event) => event.type === "approval" && event.autoApproved === true), false);
});

test("capability registry generates safe file grants and keeps high-risk capabilities one-time", () => {
  const write = approvalCapabilities.describe("write_file", { path: "src/main/App.java" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(write.capability, "workspace.file.write");
  assert.deepEqual(write.grantOptions.map((option) => option.id), ["task-folder", "workspace-file", "workspace-extension", "workspace-folder", "workspace-all-writes"]);
  const shell = approvalCapabilities.describe("run_command", { command: "npm test" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(shell.capability, "shell.freeform");
  assert.equal(shell.maximumGrantLifetime, "action");
  assert.equal(shell.grantOptions.length, 2);
  assert.equal(shell.grantOptions.every((option) => option.disabled === true && /one-time approval/.test(option.disabledReason)), true);
  assert.equal(approvalCapabilities.describe("delete_file", { path: "src/old.txt" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY }).capability, "workspace.file.delete");
  assert.equal(approvalCapabilities.describe("move_path", { sourcePath: "src/old.txt" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY }).capability, "workspace.path.move");
  assert.deepEqual(Object.keys(approvalCapabilities.CAPABILITIES).sort(), [
    "delete_file", "export_active_document", "export_active_folder_graph", "git_commit", "git_branch_create", "git_fetch", "git_pull", "git_push", "git_stage", "git_branch_switch", "git_unstage", "move_path", "preferences_import", "preferences_reset", "preferences_update", "run_command", "start_code_conversion"
  ].sort());
});

test("apply_edit preflight blocks missing searches before approval and suppresses equivalent retries", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-edit-preflight-"));
  await fs.writeFile(path.join(workspace, "README.md"), "current\n", "utf8");
  const events = [];
  let approvals = 0;
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) return { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "missing\ntext", replacement: "first", approvalReason: "Update the requested documentation." })] };
      if (round === 2) return { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "missing\r\ntext", replacement: "second", approvalReason: "Try the documentation update again." })] };
      return { content: "The edit could not be matched.", toolCalls: [] };
    },
    complete: async () => "The edit could not be matched."
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => { approvals += 1; return { decision: "approve" }; }
  });

  assert.equal(approvals, 0);
  assert.equal(await fs.readFile(path.join(workspace, "README.md"), "utf8"), "current\n");
  const failures = events.filter((event) => event.type === "tool-error" && event.tool === "apply_edit");
  assert.equal(failures.length, 2);
  assert.equal(failures[0].structuredResult.code, "APPLY_EDIT_SEARCH_NOT_FOUND");
  assert.equal(failures[0].structuredResult.executed, false);
  assert.equal(failures[1].structuredResult.repeatedWithoutExecution, true);
});

test("apply_edit approval previews and executes exactly one prepared normalized match", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-edit-approval-"));
  const filePath = path.join(workspace, "README.md");
  await fs.writeFile(filePath, "one\r\n  item  \r\nitem\r\n", "utf8");
  let approvals = 0;
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      return round === 1
        ? { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "item  ", replacement: "selected\nline", occurrence: 1, expectedMatches: 1, approvalReason: "Update the selected documentation entry." })] }
        : { content: "The entry was updated.", toolCalls: [] };
    },
    complete: async () => "The entry was updated."
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit", "agent", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals += 1;
      assert.equal(details.compare.afterContent, "one\r\n  selected\r\nline\r\nitem\r\n");
      assert.equal(Object.hasOwn(details.compare, "preparedEdit"), true);
      assert.equal(JSON.stringify(details.compare).includes("sourceHash"), false);
      return { decision: "approve" };
    }
  });

  assert.equal(approvals, 1);
  assert.equal(await fs.readFile(filePath, "utf8"), "one\r\n  selected\r\nline\r\nitem\r\n");
});

test("apply_edit stale approval previews are blocked without writing", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-edit-stale-approval-"));
  const filePath = path.join(workspace, "README.md");
  await fs.writeFile(filePath, "before\n", "utf8");
  const events = [];
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      return round === 1
        ? { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "before", replacement: "after", approvalReason: "Update the requested documentation." })] }
        : { content: "The approved preview became stale.", toolCalls: [] };
    },
    complete: async () => "The approved preview became stale."
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => {
      await fs.writeFile(filePath, "external change\n", "utf8");
      return { decision: "approve" };
    }
  });

  assert.equal(await fs.readFile(filePath, "utf8"), "external change\n");
  const failure = events.find((event) => event.type === "tool-error" && event.structuredResult?.code === "APPLY_EDIT_STALE_PREVIEW");
  assert.ok(failure);
  assert.equal(failure.structuredResult.executed, false);
  const summary = events.find((event) => event.type === "agent-summary");
  assert.equal(summary?.attemptedChanges?.length || 0, 0);
  assert.equal(summary?.blockedChanges?.some((group) => group.code === "APPLY_EDIT_STALE_PREVIEW"), true);
});

test("protected resources and managed maximum lifetimes do not match broader grants", () => {
  const protectedDescriptor = approvalCapabilities.describe("write_file", { path: ".env.production" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(approvalPolicy.resolveCapabilityApprovalDecision({
    descriptor: protectedDescriptor,
    workspaceGrants: [{ id: "broad", capability: "workspace.file.write", matcher: { type: "path-glob", value: "**/*" }, lifetime: "workspace", enabled: true }],
    effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY
  }).protected, true);
  const restrictedPolicy = JSON.parse(JSON.stringify(PRODUCT_DEFAULT_POLICY));
  restrictedPolicy.approvals.maximumGrantLifetime["workspace.file.write"] = "task";
  const descriptor = approvalCapabilities.describe("write_file", { path: "src/App.java" }, { effectiveSecurityPolicy: restrictedPolicy });
  assert.equal(approvalPolicy.resolveCapabilityApprovalDecision({
    descriptor,
    workspaceGrants: [{ id: "workspace", capability: "workspace.file.write", matcher: { type: "path-glob", value: "src/**" }, lifetime: "workspace", enabled: true }],
    effectiveSecurityPolicy: restrictedPolicy
  }).allowed, false);
});

test("task grants apply only within one tool-loop task", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-task-grant-"));
  await fs.mkdir(path.join(workspace, "src"));
  let approvals = 0;
  const events = [];
  let round = 0;
  const provider = {
    completeMessage: async () => {
      round += 1;
      if (round === 1) return { content: "", toolCalls: [createToolCall("write_file", { path: "src/a.txt", content: "a", approvalReason: "Create the first requested file." })] };
      if (round === 2) return { content: "", toolCalls: [createToolCall("write_file", { path: "src/b.txt", content: "b", approvalReason: "Create the second requested file." })] };
      return { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };
  await runAgentToolLoop(provider, {}, workspace, "create files", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async (details) => { approvals += 1; assert.equal(details.capability, "workspace.file.write"); return { decision: "approve", grantOptionId: "task-folder" }; }
  });
  assert.equal(approvals, 1);
  const autoApproved = events.find((event) => event.type === "approval" && event.autoApproved === true);
  assert.equal(autoApproved.actionAnalysis.operation, "create");
  assert.equal(autoApproved.actionAnalysis.resourcePath, "src/b.txt");
  assert.equal(autoApproved.compare.changed, true);
  round = 0;
  const secondProvider = {
    completeMessage: async () => (++round === 1
      ? { content: "", toolCalls: [createToolCall("write_file", { path: "src/c.txt", content: "c", approvalReason: "Create another requested file." })] }
      : { content: "done", toolCalls: [] }),
    complete: async () => "done"
  };
  await runAgentToolLoop(secondProvider, {}, workspace, "create another", "agent", () => {}, createRuntime(), {
    requestApproval: async () => { approvals += 1; return { decision: "approve" }; }
  });
  assert.equal(approvals, 2);
});

test("workspace grants persist under the profile and can be revoked", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-workspace-grant-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-workspace-profile-"));
  await fs.mkdir(path.join(workspace, "src"));
  let approvals = 0;
  const runWrite = async (fileName, grantOptionId = "") => {
    let round = 0;
    const provider = {
      completeMessage: async () => (++round === 1
        ? { content: "", toolCalls: [createToolCall("write_file", { path: `src/${fileName}`, content: fileName, approvalReason: "Create the requested workspace file." })] }
        : { content: "done", toolCalls: [] }),
      complete: async () => "done"
    };
    await runAgentToolLoop(provider, {}, workspace, "create file", "agent", () => {}, createRuntime(), {
      profileRoot,
      requestApproval: async () => { approvals += 1; return { decision: "approve", grantOptionId }; }
    });
  };
  await runWrite("first.txt", "workspace-folder");
  await runWrite("second.txt");
  assert.equal(approvals, 1);
  const store = new ApprovalGrantStore(profileRoot, workspace);
  const document = await store.list();
  assert.equal(document.version, 2);
  assert.equal(document.rules.length, 1);
  assert.ok(document.rules[0].lastUsedAt);
  assert.equal((await store.revoke(document.rules[0].id)).revoked, true);
  await assert.rejects(() => store.replace({ version: 2, rules: [{ capability: "workspace.file.write", matcher: { type: "path-glob", value: "src/**" }, lifetime: "task" }] }), /workspace lifetime/);
  await runWrite("third.txt");
  assert.equal(approvals, 2);
});

test("workspace grants never match a symlink escape", async (context) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-grant-symlink-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-grant-outside-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-grant-profile-"));
  try {
    await fs.symlink(outside, path.join(workspace, "linked"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error?.code)) return context.skip("Creating a test symlink is not permitted in this environment.");
    throw error;
  }
  await new ApprovalGrantStore(profileRoot, workspace).add({ capability: "workspace.file.write", matcher: { type: "path-glob", value: "**/*" }, lifetime: "workspace", enabled: true });
  let round = 0;
  let approvalRequested = false;
  const provider = {
    completeMessage: async () => (++round === 1
      ? { content: "", toolCalls: [createToolCall("write_file", { path: "linked/escape.txt", content: "blocked", approvalReason: "Create the requested file." })] }
      : { content: "done", toolCalls: [] }),
    complete: async () => "done"
  };
  await runAgentToolLoop(provider, {}, workspace, "write file", "agent", () => {}, createRuntime(), {
    profileRoot,
    requestApproval: async (details) => {
      approvalRequested = true;
      assert.equal(details.grantOptions.every((option) => option.disabled === true), true);
      return { decision: "reject" };
    }
  });
  assert.equal(approvalRequested, true);
  await assert.rejects(() => fs.access(path.join(outside, "escape.txt")));
});

test("approval instructions reject the pending tool and continue with guidance in context", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-"));
  const filePath = path.join(workspace, "README.md");
  await fs.writeFile(filePath, "before", "utf8");
  let rounds = 0;
  let finalMessages = [];
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("apply_edit", { path: "README.md", search: "before", replacement: "after" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async (messages) => {
      finalMessages = messages;
      return "done";
    }
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit", "agent", () => {}, createRuntime(), {
    requestApproval: async () => ({ decision: "instruct", instructions: "Do not edit; explain the change instead." })
  });

  assert.equal(await fs.readFile(filePath, "utf8"), "before");
  assert.match(JSON.stringify(finalMessages), /Do not edit; explain the change instead\./);
});


test("tool loop asks to continue when chat reaches the per-pass action limit", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-limit-"));
  await fs.writeFile(path.join(workspace, "README.md"), "hello", "utf8");
  const approvals = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds <= 4
        ? { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async () => "continued answer"
  };

  const content = await runAgentToolLoop(provider, { maxTasksPerChat: 2 }, workspace, "count files", "chat", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  assert.equal(content, "continued answer");
  assert.equal(rounds, 5);
  assert.equal(approvals.length, 2);
  assert.equal(approvals[0].approvalKind, "task-limit");
  assert.equal(approvals[0].input, "max actions");
  assert.equal(approvals[0].approveLabel, "Continue");
  assert.equal(approvals[0].rejectLabel, "Stop");
  assert.equal(approvals[0].allowInstructions, false);
  assert.equal(approvals[1].input, "max actions");
});
test("tool loop asks to continue when chat reaches the per-minute token limit", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-token-budget-"));
  await fs.writeFile(path.join(workspace, "README.md"), "hello", "utf8");
  const approvals = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async () => "continued answer"
  };

  const content = await runAgentToolLoop(provider, { maxTokensPerChatMinute: 100, maxTasksPerChat: 5 }, workspace, "count files", "chat", () => {}, createRuntime({ estimatedTokens: 80 }), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  assert.equal(content, "continued answer");
  assert.equal(rounds, 2);
  assert.equal(approvals.length, 2);
  assert.equal(approvals[0].approvalKind, "task-limit");
  assert.equal(approvals[0].input, "token budget reached");
  assert.match(approvals[0].preview, /maximum of 100 estimated token\(s\) per minute/);
  assert.equal(approvals[1].input, "token budget reached");
});

test("tool loop asks to continue when final answer provider reports max tokens", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-limit-"));
  await fs.writeFile(path.join(workspace, "README.md"), "hello", "utf8");
  const approvals = [];
  const finalMaxTokens = [];
  let rounds = 0;
  let completeCalls = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async (_messages, options) => {
      completeCalls += 1;
      finalMaxTokens.push(options.maxTokens);
      if (completeCalls <= 2) throw createTokenLimitError();
      return "continued answer";
    }
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "count files", "chat", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  assert.equal(content, "continued answer");
  assert.equal(completeCalls, 3);
  assert.deepEqual(finalMaxTokens, [2000, 2000, 2000]);
  assert.equal(approvals.length, 2);
  assert.equal(approvals[0].approvalKind, "task-limit");
  assert.equal(approvals[0].input, "response limit reached");
  assert.equal(approvals[0].approveLabel, "Continue");
  assert.equal(approvals[0].rejectLabel, "Stop");
  assert.match(approvals[0].preview, /Could not finish the message because max tokens or model output limit was reached/);
  assert.equal(approvals[1].input, "response limit reached");
});

test("tool loop asks to continue when tool planning provider reports max tokens", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-limit-"));
  await fs.writeFile(path.join(workspace, "README.md"), "hello", "utf8");
  const approvals = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      if (rounds === 1) throw createTokenLimitError("Provider stopped because context length exceeded.");
      return rounds === 2
        ? { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] }
        : { content: "ready", toolCalls: [] };
    },
    complete: async () => "continued answer"
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "count files", "chat", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  assert.equal(content, "continued answer");
  assert.equal(rounds, 3);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].approvalKind, "task-limit");
  assert.equal(approvals[0].input, "response limit reached");
  assert.equal(approvals[0].approveLabel, "Continue");
  assert.equal(approvals[0].rejectLabel, "Stop");
  assert.match(approvals[0].preview, /Provider stopped because context length exceeded\./);
});
test("tool loop compacts prior tool results after tool planning max tokens approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-limit-compact-"));
  const largeContent = "large-token-context\n".repeat(900);
  await fs.writeFile(path.join(workspace, "large.md"), largeContent, "utf8");
  const approvals = [];
  let rounds = 0;
  let retriedMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      rounds += 1;
      if (rounds === 1) return { content: "", toolCalls: [createToolCall("read_file", { path: "large.md" })] };
      if (rounds === 2) throw createTokenLimitError("Provider stopped because context length exceeded.");
      retriedMessages = messages.map((message) => ({ role: message.role, content: message.content }));
      return { content: "ready", toolCalls: [] };
    },
    complete: async () => "continued answer"
  };

  const content = await runAgentToolLoop(provider, {}, workspace, "read the large file", "chat", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    }
  });

  const compactedToolMessage = retriedMessages.find((message) => message.role === "tool");
  assert.equal(content, "continued answer");
  assert.equal(approvals.length, 1);
  assert.ok(compactedToolMessage);
  assert.match(compactedToolMessage.content, /compacted this prior tool result/);
  assert.equal(compactedToolMessage.content.includes(largeContent), false);
});
test("tool loop inserts same-chat conversation history before the current prompt", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-history-"));
  await fs.writeFile(path.join(workspace, "README.md"), "hello", "utf8");
  let rounds = 0;
  let firstMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      rounds += 1;
      if (rounds === 1) {
        firstMessages = messages.map((message) => ({ role: message.role, content: message.content }));
        return { content: "", toolCalls: [createToolCall("list_files", { maxFiles: 1 })] };
      }
      return { content: "ready", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "How many was that?", "chat", () => {}, createRuntime(), {
    conversationHistory: [
      { role: "system", content: "drop this" },
      { role: "user", content: "List the root files." },
      { role: "assistant", content: "There are 6 root files." },
      { role: "tool", content: "drop this too" }
    ]
  });

  assert.equal(firstMessages[0].role, "system");
  assert.ok(firstMessages.find((message) => message.role === "user" && message.content === "List the root files."));
  assert.ok(firstMessages.find((message) => message.role === "assistant" && message.content === "There are 6 root files."));
  assert.equal(firstMessages[firstMessages.length - 1].role, "user");
  assert.equal(firstMessages[firstMessages.length - 1].content, "How many was that?");
  assert.equal(firstMessages.some((message) => message.content === "drop this" || message.content === "drop this too"), false);
});

test("tool loop inserts prompt attachments before conversation history and current prompt", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-attachments-"));
  let firstMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      firstMessages = messages.map((message) => ({ role: message.role, content: message.content }));
      return { content: "ready", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "Use that file.", "chat", () => {}, createRuntime(), {
    attachments: [{ name: "notes.md", path: "C:/project/notes.md", content: "attached prompt context" }],
    conversationHistory: [
      { role: "user", content: "Earlier prompt" },
      { role: "assistant", content: "Earlier answer" }
    ]
  });

  assert.equal(firstMessages[0].role, "system");
  const attachmentMessage = firstMessages.find((message) => message.role === "system" && /attached prompt context/.test(message.content));
  assert.ok(attachmentMessage);
  assert.match(attachmentMessage.content, /notes\.md/);
  assert.ok(firstMessages.find((message) => message.role === "user" && message.content === "Earlier prompt"));
  assert.ok(firstMessages.find((message) => message.role === "assistant" && message.content === "Earlier answer"));
  assert.ok(firstMessages.find((message) => message.role === "user" && message.content === "Use that file."));
});

test("tool loop inserts image attachments into the current user message", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-image-attachments-"));
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
  let firstMessages = [];
  const provider = {
    completeMessage: async (messages) => {
      firstMessages = messages.map((message) => ({ role: message.role, content: message.content }));
      return { content: "ready", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "Describe this image.", "chat", () => {}, createRuntime(), {
    attachments: [{ kind: "image", name: "diagram.png", type: "image/png", dataUrl: imageDataUrl }]
  });

  assert.equal(firstMessages[0].role, "system");
  assert.equal(firstMessages[1].role, "user");
  assert.equal(Array.isArray(firstMessages[1].content), true);
  assert.deepEqual(firstMessages[1].content[0], { type: "text", text: "Describe this image." });
  assert.deepEqual(firstMessages[1].content[1], { type: "image_url", image_url: { url: imageDataUrl } });
});
test("agent and chat modes forward bridge approval callbacks and conversation history into the tool loop", async () => {
  const agentSource = await fs.readFile(path.resolve(__dirname, "../resources/ai-companion/modes/agent/index.js"), "utf8");
  const chatSource = await fs.readFile(path.resolve(__dirname, "../resources/ai-companion/modes/chat/index.js"), "utf8");
  assert.match(agentSource, /editorReadContext:\s*request\.editorReadContext/);
  assert.match(agentSource, /attachments:\s*request\.attachments/);
  assert.match(agentSource, /conversationHistory:\s*request\.conversationHistory/);
  assert.match(agentSource, /resumeCheckpoint:\s*request\.resumeCheckpoint/);
  assert.match(agentSource, /executionKind:\s*request\.executionKind/);
  assert.match(agentSource, /executionGeneration:\s*request\.executionGeneration/);
  assert.match(chatSource, /editorReadContext:\s*request\.editorReadContext/);
  assert.match(chatSource, /attachments:\s*request\.attachments/);
  assert.match(chatSource, /conversationHistory:\s*request\.conversationHistory/);
  assert.match(chatSource, /executionKind:\s*request\.executionKind/);
  assert.match(chatSource, /executionGeneration:\s*request\.executionGeneration/);
  assert.match(agentSource, /requestApproval:\s*request\.requestApproval/);
  assert.match(chatSource, /requestApproval:\s*request\.requestApproval/);
});
