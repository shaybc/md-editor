const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const scriptSource = fs.readFileSync(path.join(repoRoot, "desktop-app", "resources", "js", "script.js"), "utf8").replace(/^\uFEFF/, "");
test("debug log default app action uses the local default app launcher", () => {
  const functionStart = scriptSource.indexOf("async function openDebugLogInDefaultAppFromSettings()");
  assert.notEqual(functionStart, -1);
  const functionEnd = scriptSource.indexOf("async function clearDebugLogFromSettings()", functionStart);
  assert.notEqual(functionEnd, -1);
  const functionSource = scriptSource.slice(functionStart, functionEnd);

  assert.match(functionSource, /await openLocalFileWithDefaultApp\(logPath\);/);
  assert.doesNotMatch(functionSource, /Neutralino\.filesystem\.openFile\(logPath\)/);
  assert.doesNotMatch(functionSource, /Neutralino\.os\.open\(logPath\)/);
});

test("local default app launcher uses platform shell commands", () => {
  const functionStart = scriptSource.indexOf("async function openLocalFileWithDefaultApp(filePath)");
  assert.notEqual(functionStart, -1);
  const functionEnd = scriptSource.indexOf("async function openDebugLogInAppFromSettings()", functionStart);
  assert.notEqual(functionEnd, -1);
  const functionSource = scriptSource.slice(functionStart, functionEnd);

  assert.match(functionSource, /cmd \/c start ""/);
  assert.match(functionSource, /open \$\{quotedPath\}/);
  assert.match(functionSource, /xdg-open \$\{quotedPath\}/);
  assert.match(functionSource, /Neutralino\.os\.execCommand\(command\)/);
});

test("JDT log opening uses the recorded failure path and a project-root-only fallback", () => {
  const workspaceFunctionStart = scriptSource.indexOf("async function getActiveJdtWorkspacePath(projectPath = activeFolderPath)");
  assert.notEqual(workspaceFunctionStart, -1);
  const workspaceFunctionEnd = scriptSource.indexOf("async function getActiveJdtLogPath", workspaceFunctionStart);
  assert.notEqual(workspaceFunctionEnd, -1);
  const workspaceFunctionSource = scriptSource.slice(workspaceFunctionStart, workspaceFunctionEnd);
  assert.match(workspaceFunctionSource, /getServerWorkspaceDir\("java", workspaceRoot, ""\)/);
  assert.doesNotMatch(workspaceFunctionSource, /getActiveEditorPathForLanguage/);

  const showFunctionStart = scriptSource.indexOf('async function showActiveJdtLogFromSettings(preferredLogPath = "", projectPath = activeFolderPath)');
  assert.notEqual(showFunctionStart, -1);
  const showFunctionEnd = scriptSource.indexOf("async function resetActiveJdtWorkspaceFromSettings", showFunctionStart);
  assert.notEqual(showFunctionEnd, -1);
  const showFunctionSource = scriptSource.slice(showFunctionStart, showFunctionEnd);
  assert.match(showFunctionSource, /getActiveJdtLogPath\(preferredLogPath, projectPath\)/);
  assert.match(showFunctionSource, /Unable to access the JDT log at:/);
});
