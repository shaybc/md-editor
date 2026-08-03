const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { FOLDER_APPROVAL_POLICY_PATH } = require("../resources/ai-companion/core/agent-approval-policy");
const { getAgentToolDefinitions, runAgentToolLoop } = require("../resources/ai-companion/core/agent-tool-loop");
const editorActionTools = require("../resources/ai-companion/tools/editor-action-tools");

const EDITOR_ACTION_TOOL_NAMES = [
  "open_file_in_tab",
  "create_document_tab",
  "insert_at_cursor",
  "replace_selection",
  "replace_document_range",
  "extract_selection_to_note"
];

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

test("editor action tools are exposed only in agent mode", () => {
  const agentNames = getAgentToolDefinitions("agent").map((definition) => definition.function.name);
  const chatNames = getAgentToolDefinitions("chat").map((definition) => definition.function.name);
  const planNames = getAgentToolDefinitions("plan").map((definition) => definition.function.name);

  for (const name of EDITOR_ACTION_TOOL_NAMES) {
    assert.equal(agentNames.includes(name), true, `${name} should be available to agent mode`);
    assert.equal(chatNames.includes(name), false, `${name} should not be available to chat mode`);
    assert.equal(planNames.includes(name), false, `${name} should not be available to plan mode`);
  }
});

test("editor action proxy forwards app-action details and returns browser result", async () => {
  const result = await editorActionTools.requestEditorAction("", "replace_selection", { replacement: "updated" }, {
    requestAppAction: async (details) => {
      assert.equal(details.tool, "replace_selection");
      assert.deepEqual(details.args, { replacement: "updated" });
      assert.equal(details.preview.target, "replace_selection");
      return { changed: true, path: "docs/a.md" };
    }
  });

  assert.deepEqual(result, { changed: true, path: "docs/a.md" });
});

test("editor write action asks for write approval before app-action dispatch", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-action-approval-"));
  const events = [];
  const approvals = [];
  const appActions = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("replace_document_range", { path: "docs/a.md", start: 0, end: 3, replacement: "new" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "edit range", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { decision: "approve" };
    },
    requestAppAction: async (details) => {
      appActions.push(details);
      return { changed: true, path: details.args.path };
    }
  });

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].tool, "replace_document_range");
  assert.match(approvals[0].preview, /docs\/a\.md/);
  assert.equal(appActions.length, 1);
  assert.equal(appActions[0].tool, "replace_document_range");
  assert.equal(events.some((event) => event.type === "tool" && event.tool === "replace_document_range"), true);
});

test("open file editor action does not require write approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-action-open-"));
  let approvalRequested = false;
  let appAction = null;
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("open_file_in_tab", { path: "docs/a.md", line: 3 })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "open file", "agent", () => {}, createRuntime(), {
    requestApproval: async () => {
      approvalRequested = true;
      return { decision: "reject" };
    },
    requestAppAction: async (details) => {
      appAction = details;
      return { opened: true, path: details.args.path };
    }
  });

  assert.equal(approvalRequested, false);
  assert.equal(appAction.tool, "open_file_in_tab");
});

test("legacy folder approval policy does not silently approve editor writes", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-action-policy-"));
  const policyPath = path.join(workspace, FOLDER_APPROVAL_POLICY_PATH);
  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  await fs.writeFile(policyPath, JSON.stringify({ version: 1, allow: { write: ["docs/*.md"], command: [], test: [] } }), "utf8");
  const events = [];
  let approvalRequested = false;
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("replace_selection", { path: "docs/a.md", replacement: "new" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: true }, workspace, "replace selection", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => {
      approvalRequested = true;
      return { decision: "approve" };
    },
    requestAppAction: async (details) => ({ changed: true, path: details.args.path })
  });

  assert.equal(approvalRequested, true);
  assert.equal(events.some((event) => event.type === "approval" && event.tool === "replace_selection" && event.autoApproved === true), false);
});

test("editor action app-action errors are surfaced to the tool loop", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-action-error-"));
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("replace_selection", { replacement: "new" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  const events = [];
  await runAgentToolLoop(provider, { agentConfirmBeforeWrite: false }, workspace, "replace selection", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => ({ decision: "approve" }),
    requestAppAction: async () => {
      throw new Error("cancelled");
    }
  });

  assert.equal(events.some((event) => event.type === "tool-error" && event.tool === "replace_selection" && /cancelled/.test(event.error || "")), true);
});
