const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

/** Load one browser registration function into an isolated renderer context. */
function loadBrowserRegistration(relativePath, exportName, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  const context = Object.assign({ console, window: {} }, globals);
  vm.createContext(context);
  vm.runInContext(source, context, { filename: relativePath });
  return context.window[exportName];
}

test("structured compile action invokes IDE rebuild with configuration fallback", async () => {
  const register = loadBrowserRegistration(
    "../resources/js/ai-companion/structured-execution-actions.js",
    "registerMarkdownViewerStructuredExecutionActions"
  );
  const calls = [];
  const api = register({ registerModule() {} }, {
    projectCommands: {
      async execute(commandName, options) {
        calls.push({ commandName, options });
        return false;
      }
    }
  });

  const result = await api.execute("structured_compile_project", {});

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    commandName: "rebuild-project-last-options",
    options: { configureIfMissing: true, waitForAnalysis: false, source: "ai-companion" }
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: false });
});

test("structured run tests continues through the existing structured project command", async () => {
  const register = loadBrowserRegistration(
    "../resources/js/ai-companion/structured-execution-actions.js",
    "registerMarkdownViewerStructuredExecutionActions"
  );
  const calls = [];
  const api = register({ registerModule() {} }, {
    projectCommands: {
      async executeStructured(operationName, args) {
        calls.push({ operationName, args });
        return { success: true };
      }
    }
  });

  const result = await api.execute("structured_run_tests", { scope: "project" });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    operationName: "run_tests",
    args: { scope: "project" }
  }]);
  assert.equal(result.success, true);
});

test("project command propagates IDE rebuild results and AI-only fallback options", async () => {
  const document = {
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const register = loadBrowserRegistration(
    "../resources/js/project/project-command-menu.js",
    "registerMarkdownViewerProjectCommandMenu",
    { document }
  );
  const rebuildCalls = [];
  const api = register({ registerModule() {} }, {
    getActiveFolderPath: () => "C:/Project",
    getActiveFilePath: () => ""
  });
  api.registerProvider("java", {
    supports: () => true,
    canRebuildProject: () => true,
    async rebuildProject(context, options) {
      rebuildCalls.push({ context, options });
      return false;
    }
  });

  const result = await api.execute("rebuild-project-last-options", {
    configureIfMissing: true,
    waitForAnalysis: false
  });

  assert.equal(result, false);
  assert.equal(rebuildCalls[0].context.folderPath, "C:/Project");
  assert.deepEqual(JSON.parse(JSON.stringify(rebuildCalls[0].options)), {
    useLastOptions: true,
    configureIfMissing: true,
    waitForAnalysis: false
  });
});
