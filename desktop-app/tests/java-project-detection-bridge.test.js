const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { spawn } = require("node:child_process");

const bridgePath = path.resolve(
  __dirname,
  "../resources/bridges/java-project-detection-bridge/java-project-detection-bridge.cjs"
);

function writeFixtureFile(root, relativePath, contents = "") {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function runBridge(request) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
    const child = spawn(process.execPath, [bridgePath, encoded], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Bridge exited with ${code}.`));
        return;
      }
      resolve(stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
    });
    child.stdin.write(`${JSON.stringify({ type: "start" })}\n`);
  });
}

test("Java detection sidecar scans bounded source batches and ignores generated directories", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-java-scan-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  writeFixtureFile(workspaceRoot, "pom.xml", "<project/>");
  writeFixtureFile(workspaceRoot, "src/main/java/App.java", "class App {}");
  writeFixtureFile(workspaceRoot, "src/main/kotlin/App.kt", "class App");
  writeFixtureFile(workspaceRoot, "src/main/aspect/Trace.aj", "aspect Trace {}");
  writeFixtureFile(workspaceRoot, "module/build.gradle.kts", "");
  writeFixtureFile(workspaceRoot, "target/generated/Ignored.java", "class Ignored {}");

  const messages = await runBridge({ mode: "scan-workspace", workspaceRoot });
  const batches = messages.filter((message) => message.type === "scan-batch").map((message) => message.batch);
  const result = messages.find((message) => message.type === "result")?.result;
  const modules = batches.flatMap((batch) => batch.modules || []);
  const javaFiles = batches.flatMap((batch) => batch.javaSourceFiles || []);
  const kotlinFiles = batches.flatMap((batch) => batch.kotlinSourceFiles || []);
  const aspectRoots = batches.flatMap((batch) => batch.aspectjSourceDirectories || []);

  assert.equal(result.hasJavaContent, true);
  assert.equal(result.hasKotlinContent, true);
  assert.equal(result.truncated, false);
  assert.equal(modules.some((module) => module.kind === "maven"), true);
  assert.equal(modules.some((module) => module.kind === "gradle"), true);
  assert.equal(javaFiles.some((file) => /App\.java$/.test(file)), true);
  assert.equal(javaFiles.some((file) => /Ignored\.java$/.test(file)), false);
  assert.equal(kotlinFiles.some((file) => /App\.kt$/.test(file)), true);
  assert.equal(aspectRoots.some((root) => /src\/main\/aspect$/i.test(root)), true);
});

test("Java detection sidecar enforces the directory ceiling and strict stream batch size", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "md-editor-java-bounds-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  for (let index = 0; index < 5001; index += 1) {
    fs.mkdirSync(path.join(workspaceRoot, `directory-${String(index).padStart(4, "0")}`));
  }
  for (let index = 0; index < 450; index += 1) {
    writeFixtureFile(workspaceRoot, `Source${index}.java`, "class Source {}");
  }

  const messages = await runBridge({ mode: "scan-workspace", workspaceRoot });
  const batches = messages.filter((message) => message.type === "scan-batch").map((message) => message.batch);
  const result = messages.find((message) => message.type === "result")?.result;

  assert.equal(result.scannedDirectories, 5000);
  assert.equal(result.truncated, true);
  assert.equal(batches.length >= 3, true);
  assert.equal(batches.every((batch) => (
    Object.values(batch).reduce((count, entries) => count + entries.length, 0) <= 200
  )), true);
});

test("Java detection sidecar retains the 5,000-directory ceiling and one reactor Maven invocation", () => {
  const bridge = require(bridgePath);
  assert.equal(bridge.MAX_SCANNED_DIRECTORIES, 5000);
  assert.equal(bridge.SKIPPED_DIRECTORY_NAMES.has("target"), true);
  assert.deepEqual(
    bridge.createMavenArguments("C:/Project/pom.xml"),
    ["--no-transfer-progress", "-f", "C:/Project/pom.xml", "help:effective-pom"]
  );
});

function loadBridgeClient(context) {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/java-project-detection-bridge-client.js");
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.registerMarkdownViewerJavaProjectDetectionBridgeClient({ registerModule() {} }, {
    Neutralino: context.Neutralino
  });
}

test("renderer bridge client filters process events, streams results, and removes listeners", async () => {
  const listeners = new Map();
  const writes = [];
  const context = {
    Buffer,
    Promise,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    Neutralino: {
      os: {
        async spawnProcess() { return { id: 41, pid: 4100 }; },
        async updateSpawnedProcess(id, action, data) {
          writes.push({ id, action, data });
          if (action !== "stdIn" || !/"start"/.test(data)) return;
          setTimeout(() => {
            listeners.get("spawnedProcess")?.({ detail: {
              id: 999,
              action: "stdOut",
              data: `${JSON.stringify({ type: "result", result: { scannedDirectories: 999 } })}\n`
            } });
            listeners.get("spawnedProcess")?.({ detail: {
              id: 41,
              action: "stdOut",
              data: `${JSON.stringify({ type: "scan-batch", batch: { javaSourceFiles: ["C:/Project/App.java"] } })}\n`
                + `${JSON.stringify({ type: "result", result: { scannedDirectories: 12 } })}\n`
            } });
            listeners.get("spawnedProcess")?.({ detail: { id: 41, action: "exit" } });
          }, 0);
        }
      }
    }
  };
  const client = loadBridgeClient(context);

  const result = await client.run({ mode: "scan-workspace", workspaceRoot: "C:/Project" });

  assert.equal(result.scannedDirectories, 12);
  assert.deepEqual(Array.from(result.javaSourceFiles), ["C:/Project/App.java"]);
  assert.equal(writes.some((write) => write.action === "stdIn" && /"start"/.test(write.data)), true);
  assert.equal(listeners.has("spawnedProcess"), false);
});

test("renderer bridge client sends close and rejects cancellation without retaining listeners", async () => {
  const listeners = new Map();
  const writes = [];
  const context = {
    Buffer,
    Promise,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    Neutralino: {
      os: {
        async spawnProcess() { return { id: 51, pid: 5100 }; },
        async updateSpawnedProcess(id, action, data) { writes.push({ id, action, data }); }
      }
    }
  };
  const client = loadBridgeClient(context);
  const controller = new AbortController();
  const running = client.run(
    { mode: "scan-workspace", workspaceRoot: "C:/Project" },
    { signal: controller.signal }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();

  await assert.rejects(running, (error) => error.code === "java-project-detection-cancelled");
  assert.equal(writes.some((write) => write.action === "stdIn" && /"close"/.test(write.data)), true);
  assert.equal(writes.some((write) => write.action === "exit"), true);
  assert.equal(listeners.has("spawnedProcess"), false);
});
