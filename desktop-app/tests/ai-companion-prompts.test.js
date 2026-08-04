const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  AGENT_APPROVAL_RATIONALE_INSTRUCTION,
  AGENT_COMPLETION_REPORTING_INSTRUCTION,
  LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION,
  DEFAULT_AI_COMPANION_PROMPTS,
  PROMPTS_DOCUMENT_TYPE,
  PROMPTS_DEFAULT_REVISION,
  checkPromptProfileUpgrade,
  getPromptProfileUpgradeConflicts,
  resolvePromptProfileUpgrade,
  getPromptProfilePath,
  listProfilePromptEntries,
  listPromptEntries,
  loadAiCompanionPrompts,
  normalizePromptProfile,
  updateProfilePromptEntry
} = require("../resources/ai-companion/config/prompts");
const { runAgentMode } = require("../resources/ai-companion/modes/agent");

function createRuntimeProvider() {
  let firstMessages = [];
  return {
    provider: {
      completeMessage: async (messages) => {
        firstMessages = messages.map((message) => ({ role: message.role, content: message.content }));
        return { content: "done", toolCalls: [] };
      },
      complete: async () => "final"
    },
    getFirstMessages: () => firstMessages
  };
}

test("prompt profile is created from defaults when missing", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));

  const prompts = await loadAiCompanionPrompts({ profileRoot });
  const filePath = getPromptProfilePath({ profileRoot });
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));

  assert.equal(payload.documentType, PROMPTS_DOCUMENT_TYPE);
  assert.equal(payload.prompts.agentSystem, DEFAULT_AI_COMPANION_PROMPTS.agentSystem);
  assert.equal(prompts.agentSystem, DEFAULT_AI_COMPANION_PROMPTS.agentSystem);
});

test("prompt profile uses edited strings and fills missing defaults", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: 1,
    prompts: {
      agentSystem: "Custom agent prompt",
      autocomplete: {
        line: { taskInstruction: "Custom line task" }
      }
    }
  }), "utf8");

  const prompts = await loadAiCompanionPrompts({ profileRoot });

  assert.equal(prompts.agentSystem, "Custom agent prompt");
  assert.equal(prompts.chatDirectSystem, DEFAULT_AI_COMPANION_PROMPTS.chatDirectSystem);
  assert.equal(prompts.planSystem, DEFAULT_AI_COMPANION_PROMPTS.planSystem);
  assert.equal(prompts.autocomplete.line.taskInstruction, "Custom line task");
  assert.equal(prompts.autocomplete.line.systemPrompt, DEFAULT_AI_COMPANION_PROMPTS.autocomplete.line.systemPrompt);
});

test("corrupt prompt profile falls back to defaults", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "{", "utf8");

  const prompts = await loadAiCompanionPrompts({ profileRoot });

  assert.equal(prompts.chatSystem, DEFAULT_AI_COMPANION_PROMPTS.chatSystem);
});

test("prompt normalization ignores invalid fields", () => {
  const payload = normalizePromptProfile({
    prompts: {
      chatSystem: "",
      planFinalAnswer: 42,
      autocomplete: {
        block: { systemPrompt: "Custom block prompt", taskInstruction: null }
      }
    }
  });

  assert.equal(payload.prompts.chatSystem, DEFAULT_AI_COMPANION_PROMPTS.chatSystem);
  assert.equal(payload.prompts.planFinalAnswer, DEFAULT_AI_COMPANION_PROMPTS.planFinalAnswer);
  assert.equal(payload.prompts.autocomplete.block.systemPrompt, "Custom block prompt");
  assert.equal(payload.prompts.autocomplete.block.taskInstruction, DEFAULT_AI_COMPANION_PROMPTS.autocomplete.block.taskInstruction);
});

test("default prompts preserve explicit UI locations and require pre-approval localization", () => {
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /namedTargets\.uiAreas/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /do not collapse a specific named area/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.agentSystem, /resolve explicit user locations through discovery/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.agentSystem, /never use the approval card to discover that a target is wrong/);
});

test("intent extraction prompt requires grounded outcome criteria and conditional actions", () => {
  // v6: criteria are grounded (shape + verbatim sourceSpan), not paraphrased away.
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /assign it a shape/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /set sourceSpan to the verbatim words/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /Classify the task as conformance/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /never merge them/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /at least one criterion verifiable from tool evidence/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /emit both a finding criterion/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.intentExtractionSystem, /Bad criterion: Check the latest git changes/);
  assert.match(DEFAULT_AI_COMPANION_PROMPTS.chatDirectSystem, /no workspace evidence/i);
  assert.equal(PROMPTS_DEFAULT_REVISION, 11);
});

test("agent mode uses profile prompt override", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: 1,
    prompts: { agentSystem: "Custom agent system prompt" }
  }), "utf8");

  const runtime = require("../resources/ai-companion/core/agent-runtime");
  const originalCreateProvider = runtime.createProvider;
  const { provider, getFirstMessages } = createRuntimeProvider();
  runtime.createProvider = () => provider;
  try {
    await runAgentMode({
      settings: { enabled: true, agentEnabled: true },
      workspaceRoot: await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-workspace-")),
      profileRoot,
      prompt: "hello"
    }, () => {});
  } finally {
    runtime.createProvider = originalCreateProvider;
  }

  assert.equal(getFirstMessages()[0].content.startsWith("Custom agent system prompt"), true);
  assert.match(getFirstMessages()[0].content, new RegExp(AGENT_APPROVAL_RATIONALE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(getFirstMessages()[0].content, new RegExp(LEGACY_AGENT_COMPLETION_REPORTING_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});


test("prompt entries expose names descriptions and values", () => {
  const entries = listPromptEntries(DEFAULT_AI_COMPANION_PROMPTS);
  const chatEntry = entries.find((entry) => entry.keyPath === "chatSystem");
  const directChatEntry = entries.find((entry) => entry.keyPath === "chatDirectSystem");
  const assessmentEntry = entries.find((entry) => entry.keyPath === "completionAssessmentSystem");
  const candidateEntry = entries.find((entry) => entry.keyPath === "completionFinalAnswer");
  const clarificationEntry = entries.find((entry) => entry.keyPath === "intentClarificationSystem");
  const refreshEntry = entries.find((entry) => entry.keyPath === "intentContractRefreshSystem");
  const revisionEntry = entries.find((entry) => entry.keyPath === "intentContractRevisionSystem");
  const autocompleteEntry = entries.find((entry) => entry.keyPath === "autocomplete.line.systemPrompt");

  assert.ok(chatEntry);
  assert.equal(chatEntry.name, "Chat system prompt");
  assert.match(chatEntry.description, /Chat mode/);
  assert.equal(chatEntry.value, DEFAULT_AI_COMPANION_PROMPTS.chatSystem);
  assert.equal(directChatEntry.name, "Direct Chat system prompt");
  assert.equal(directChatEntry.value, DEFAULT_AI_COMPANION_PROMPTS.chatDirectSystem);
  assert.equal(assessmentEntry.name, "Completion assessment prompt");
  assert.equal(candidateEntry.name, "Completion candidate prompt");
  assert.equal(clarificationEntry.value, DEFAULT_AI_COMPANION_PROMPTS.intentClarificationSystem);
  assert.equal(refreshEntry.value, DEFAULT_AI_COMPANION_PROMPTS.intentContractRefreshSystem);
  assert.equal(revisionEntry.value, DEFAULT_AI_COMPANION_PROMPTS.intentContractRevisionSystem);
  assert.ok(autocompleteEntry);
  assert.match(autocompleteEntry.description, /inline completions/);
});

test("profile prompt update changes only the requested nested entry", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  await loadAiCompanionPrompts({ profileRoot });

  const entries = await updateProfilePromptEntry({ profileRoot }, "autocomplete.line.taskInstruction", "Custom nested task");
  const prompts = await loadAiCompanionPrompts({ profileRoot });

  assert.equal(prompts.autocomplete.line.taskInstruction, "Custom nested task");
  assert.equal(prompts.autocomplete.line.systemPrompt, DEFAULT_AI_COMPANION_PROMPTS.autocomplete.line.systemPrompt);
  assert.equal(entries.find((entry) => entry.keyPath === "autocomplete.line.taskInstruction").value, "Custom nested task");
});

test("profile prompt update rejects unknown prompt keys", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));

  await assert.rejects(
    () => updateProfilePromptEntry({ profileRoot }, "tools.read_file.description", "nope"),
    /prompt entry is not supported/
  );
});

test("profile prompt entries load from the profile file", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  await updateProfilePromptEntry({ profileRoot }, "agentSystem", "Agent from profile");

  const entries = await listProfilePromptEntries({ profileRoot });

  assert.equal(entries.find((entry) => entry.keyPath === "agentSystem").value, "Agent from profile");
});

test("untouched legacy prompts migrate silently while customized changes conflict", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: 1,
    prompts: { ...DEFAULT_AI_COMPANION_PROMPTS, agentSystem: "My custom agent prompt" }
  }), "utf8");

  const check = await checkPromptProfileUpgrade({ profileRoot });
  const conflicts = await getPromptProfileUpgradeConflicts({ profileRoot }, check.upgradeToken);
  const saved = JSON.parse(await fs.readFile(filePath, "utf8"));

  assert.equal(check.status, "conflicts");
  assert.equal(conflicts.conflicts.length, 1);
  assert.equal(conflicts.conflicts[0].keyPath, "agentSystem");
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.prompts.agentSystem, "My custom agent prompt");
});

test("keeping customized prompts resolves only the current default revision", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: 2,
    prompts: { ...DEFAULT_AI_COMPANION_PROMPTS, agentSystem: "My agent prompt" }
  }), "utf8");

  const check = await checkPromptProfileUpgrade({ profileRoot });
  await resolvePromptProfileUpgrade({ profileRoot }, { upgradeToken: check.upgradeToken, strategy: "keep-user" });
  const saved = JSON.parse(await fs.readFile(filePath, "utf8"));

  assert.equal(saved.pendingUpgrade, null);
  assert.equal(saved.resolvedDefaultRevision, PROMPTS_DEFAULT_REVISION);
  assert.equal(saved.prompts.agentSystem, "My agent prompt");
  assert.equal(saved.basePrompts.agentSystem, DEFAULT_AI_COMPANION_PROMPTS.agentSystem);
  assert.equal((await checkPromptProfileUpgrade({ profileRoot })).status, "current");
});

test("stale prompt-upgrade tokens cannot overwrite a newer profile", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-prompts-profile-"));
  const filePath = getPromptProfilePath({ profileRoot });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: 2,
    prompts: { ...DEFAULT_AI_COMPANION_PROMPTS, chatSystem: "First custom prompt" }
  }), "utf8");
  const check = await checkPromptProfileUpgrade({ profileRoot });
  await updateProfilePromptEntry({ profileRoot }, "chatSystem", "Newer custom prompt");

  await assert.rejects(
    () => resolvePromptProfileUpgrade({ profileRoot }, { upgradeToken: check.upgradeToken, strategy: "keep-user" }),
    (error) => error?.code === "stale-upgrade"
  );
});
