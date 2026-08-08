const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { getAgentToolDefinitions, runAgentToolLoop } = require("./helpers/autonomous-tool-harness");
const conversionExportTools = require("../resources/ai-companion/tools/conversion-export-tools");

const CONVERSION_EXPORT_TOOL_NAMES = [
  "get_conversion_export_state",
  "get_code_conversion_status",
  "read_conversion_report",
  "export_active_document",
  "export_active_folder_graph",
  "start_code_conversion"
];

function createToolCall(name, args = {}) {
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

function loadBrowserRegisterFunction() {
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../resources/js/ai-companion/conversion-export-tools.js"), "utf8");
  const sandbox = { console, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "conversion-export-tools.js" });
  return sandbox.registerMarkdownViewerAiCompanionConversionExportTools;
}

test("conversion reads follow mode policy while conversion writes remain agent-only", () => {
  const agentNames = getAgentToolDefinitions("agent").map((definition) => definition.function.name);
  const chatNames = getAgentToolDefinitions("chat").map((definition) => definition.function.name);
  const planNames = getAgentToolDefinitions("plan").map((definition) => definition.function.name);

  for (const name of CONVERSION_EXPORT_TOOL_NAMES.slice(0, 3)) {
    assert.equal(agentNames.includes(name), true, `${name} should be available to agent mode`);
    assert.equal(chatNames.includes(name), true, `${name} should be available to chat mode`);
    assert.equal(planNames.includes(name), true, `${name} should be available to plan mode`);
  }
  for (const name of CONVERSION_EXPORT_TOOL_NAMES.slice(3)) {
    assert.equal(agentNames.includes(name), true, `${name} should be available to agent mode`);
    assert.equal(chatNames.includes(name), false, `${name} should not be available to chat mode`);
    assert.equal(planNames.includes(name), false, `${name} should not be available to plan mode`);
  }
});

test("conversion/export proxy forwards app-action details and returns browser result", async () => {
  const result = await conversionExportTools.requestConversionExportAction("", "export_active_document", { format: "pdf" }, {
    requestAppAction: async (details) => {
      assert.equal(details.tool, "export_active_document");
      assert.deepEqual(details.args, { format: "pdf" });
      assert.equal(details.preview.target, "pdf");
      return { exported: true, format: "pdf" };
    }
  });

  assert.deepEqual(result, { exported: true, format: "pdf" });
});

test("read_conversion_report reads workspace-scoped report files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-conversion-report-"));
  const reportRoot = path.join(workspace, "generated");
  const metadataRoot = path.join(reportRoot, ".md-editor");
  await fs.mkdir(metadataRoot, { recursive: true });
  await fs.writeFile(path.join(metadataRoot, "missing_dependencies_report.json"), JSON.stringify({ missing: [{ name: "dep" }] }), "utf8");
  await fs.writeFile(path.join(metadataRoot, "missing_dependencies_report.md"), "# Missing\n\n- dep", "utf8");

  const result = await conversionExportTools.readConversionReport(workspace, { destinationRoot: "generated", includeMarkdown: true });

  assert.equal(result.found, true);
  assert.equal(result.root, "generated");
  assert.deepEqual(result.report, { missing: [{ name: "dep" }] });
  assert.match(result.markdown, /Missing/);
});

test("read_conversion_report rejects paths outside the workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-conversion-report-root-"));

  await assert.rejects(
    () => conversionExportTools.readConversionReport(workspace, { destinationRoot: "../outside" }),
    /outside the workspace/
  );
});

test("conversion/export actions ask for approval before app-action dispatch", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-conversion-approval-"));
  const approvals = [];
  const appActions = [];
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("export_active_document", { format: "html" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "export active document", "agent", () => {}, createRuntime(), {
    requestApproval: async (details) => {
      approvals.push(details);
      return { approved: true };
    },
    requestAppAction: async (details) => {
      appActions.push(details);
      return { exported: true, format: details.args.format };
    }
  });

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].tool, "export_active_document");
  assert.equal(approvals[0].summary, "Export documents");
  assert.equal(appActions.length, 1);
  assert.equal(appActions[0].tool, "export_active_document");
});

test("conversion/export action rejection prevents app-action dispatch", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-conversion-reject-"));
  const events = [];
  let appActionRequested = false;
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("start_code_conversion", { sourceRoot: "src", destinationRoot: "docs" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "convert code", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => ({ approved: false }),
    requestAppAction: async () => {
      appActionRequested = true;
      return {};
    }
  });

  assert.equal(appActionRequested, false);
  assert.equal(events.some((event) => event.type === "tool" && event.tool === "start_code_conversion"), true);
});

test("conversion/export read state app-action does not ask for approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-conversion-state-"));
  let approvalRequested = false;
  let appAction = null;
  let rounds = 0;
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("get_conversion_export_state")] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };

  await runAgentToolLoop(provider, {}, workspace, "read conversion state", "agent", () => {}, createRuntime(), {
    requestApproval: async () => {
      approvalRequested = true;
      return { decision: "reject" };
    },
    requestAppAction: async (details) => {
      appAction = details;
      return { codeConverter: { state: "idle" } };
    }
  });

  assert.equal(approvalRequested, false);
  assert.equal(appAction.tool, "get_conversion_export_state");
});

test("browser conversion/export executor exports the active document", async () => {
  const register = loadBrowserRegisterFunction();
  const calls = [];
  const api = register({}, {
    getActiveTab: () => ({ title: "Note", path: "docs/note.md" }),
    getActiveEditorValue: () => "# Note",
    exportMarkdownContent: (content, name) => calls.push({ content, name })
  });

  const result = await api.execute("export_active_document", { format: "md", fileName: "note.md" });

  assert.deepEqual(calls, [{ content: "# Note", name: "note.md" }]);
  assert.equal(result.exported, true);
  assert.equal(result.format, "markdown");
  assert.equal(result.title, "Note");
  assert.equal(result.path, "docs/note.md");
});
