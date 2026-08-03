const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(relativePath, context = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  context.globalThis = context;
  context.self = context;
  vm.runInNewContext(source, context, { filename: relativePath });
  return context;
}

test("filesystem reducer coalesces repeated changes and suppresses derived descendants", () => {
  const context = loadScript("resources/js/platform/filesystem-event-reducer.js");
  const reducer = context.MarkdownViewerFilesystemEventReducer.createFilesystemEventReducer();
  const options = { workspaceRoot: "C:/repo", derivedRoots: ["C:/repo/module/build"] };
  reducer.push({ dir: "C:/repo/src", filename: "Main.java", action: "add" }, options);
  reducer.push({ dir: "C:/repo/src", filename: "Main.java", action: "modified" }, options);
  reducer.push({ dir: "C:/repo/module/build/classes", filename: "Main.class", action: "add" }, options);
  const patch = reducer.flush(options);
  assert.equal(patch.changes.length, 1);
  assert.equal(patch.changes[0].action, "add");
  assert.equal(patch.changes[0].path, "C:/repo/src/Main.java");
  assert.deepEqual(Array.from(patch.invalidatedRoots), ["C:/repo/module/build"]);
});
test("filesystem reducer collapses an overflowing queue into workspace invalidation", () => {
  const context = loadScript("resources/js/platform/filesystem-event-reducer.js");
  const reducer = context.MarkdownViewerFilesystemEventReducer.createFilesystemEventReducer({ maximumPaths: 2 });
  const options = { workspaceRoot: "C:/repo" };
  reducer.push({ dir: "C:/repo", filename: "a", action: "add" }, options);
  reducer.push({ dir: "C:/repo", filename: "b", action: "add" }, options);
  reducer.push({ dir: "C:/repo", filename: "c", action: "add" }, options);
  const patch = reducer.flush(options);
  assert.deepEqual(Array.from(patch.invalidatedRoots), ["C:/repo"]);
  assert.equal(patch.changes.length, 0);
});

test("standalone LSP parser preserves adjacent multibyte messages", () => {
  const context = loadScript("resources/js/lsp/lsp-frame-parser.js", { TextEncoder, TextDecoder });
  const received = [];
  const parse = context.MarkdownViewerLspFrameParser.createLspFrameParser((message) => received.push(message));
  const frame = (message) => `Content-Length: ${Buffer.byteLength(message, "utf8")}\r\n\r\n${message}`;
  const first = JSON.stringify({ text: "׳©׳׳•׳" });
  const second = JSON.stringify({ text: "done" });
  const combined = frame(first) + frame(second);
  for (let index = 0; index < combined.length; index += 3) parse(combined.slice(index, index + 3));
  assert.deepEqual(received, [first, second]);
});

test("workspace activity worker remains filesystem-only", () => {
  const posted = [];
  const context = { Map, Set, Date, JSON, Math };
  context.postMessage = (message) => posted.push(message);
  context.setTimeout = (callback) => {
    callback();
    return 1;
  };
  context.clearTimeout = () => {};
  context.importScripts = (...scripts) => {
    for (const script of scripts) {
      const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/platform", script), "utf8");
      vm.runInNewContext(source, context, { filename: script });
    }
  };
  loadScript("resources/js/platform/workspace-activity-worker.js", context);
  context.onmessage({ data: { type: "register-workspace", workspaceId: "repo", workspaceRoot: "C:/repo", derivedRoots: [] } });
  context.onmessage({ data: { type: "watch-events", workspaceId: "repo", events: [{ dir: "C:/repo/src", filename: "Main.java", action: "modified" }] } });
  context.onmessage({ data: { type: "register-lsp-session", sessionId: "java:C:/repo" } });
  assert.equal(posted.some((message) => message.type === "filesystem-patch"), true);
  assert.equal(posted.some((message) => String(message.type).startsWith("jdt-")), false);
  assert.equal(posted.some((message) => message.type === "lsp-batch"), false);
});

test("JDT activity tracker waits for every concurrent project action before reporting ready", () => {
  const context = loadScript("resources/js/lsp/jdt-activity-tracker.js", { Map });
  const lifecycle = [];
  const tracker = context.MarkdownViewerJdtActivityTracker.createJdtActivityTracker({
    onLifecycle: (phase, message) => lifecycle.push([phase, message])
  });
  const progress = (token, value) => tracker.acceptMessage({ method: "$/progress", params: { token, value } });

  progress("gradle", { kind: "begin", title: "Import Gradle project" });
  progress("maven", { kind: "begin", title: "Import Maven project" });
  progress("gradle", { kind: "end" });
  tracker.acceptMessage({ method: "language/status", params: { type: "Started", message: "Ready" } });
  assert.equal(lifecycle.some(([phase]) => phase === "import-complete"), false);
  assert.equal(tracker.getActiveCount(), 1);

  progress("maven", { kind: "report", message: "Updating spring-core" });
  progress("maven", { kind: "end" });
  assert.equal(lifecycle.at(-1)[0], "import-complete");
  assert.equal(tracker.getActiveCount(), 0);
});

test("JDT activity tracker does not treat generic readiness as project import completion", () => {
  const context = loadScript("resources/js/lsp/jdt-activity-tracker.js", { Map });
  const lifecycle = [];
  const tracker = context.MarkdownViewerJdtActivityTracker.createJdtActivityTracker({
    onLifecycle: (phase, message) => lifecycle.push([phase, message])
  });

  assert.equal(tracker.acceptMessage({
    method: "language/status",
    params: { type: "Started", message: "Ready" }
  }), false);
  assert.equal(lifecycle.some(([phase]) => phase === "import-complete"), false);

  assert.equal(tracker.acceptMessage({
    method: "language/eventNotification",
    params: { type: "ProjectsImported", message: "Imported 15 projects" }
  }), true);
  assert.deepEqual(lifecycle.at(-1), ["import-complete", "Ready"]);
});
