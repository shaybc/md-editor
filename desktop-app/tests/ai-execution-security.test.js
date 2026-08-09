const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const { getAgentToolDefinitions, runAgentToolLoop } = require("./helpers/autonomous-tool-harness");
const { toCanonicalName } = require("../resources/ai-companion/core/tool-scope-registry");
const { CommandAuditLogger } = require("../resources/ai-companion/security/audit-log");
const { classifyCommand } = require("../resources/ai-companion/security/command-suggestion");
const effectivePolicy = require("../resources/ai-companion/security/effective-policy");
const { readPolicyFile } = require("../resources/ai-companion/security/managed-policy-provider");
const { PRODUCT_DEFAULT_POLICY, validatePolicy } = require("../resources/ai-companion/security/policy-schema");
const { StructuredExecutionBroker } = require("../resources/ai-companion/security/structured-execution-broker");
const { createSecurityContext } = require("../resources/ai-companion/security/security-context");
const workspaceTools = require("../resources/ai-companion/tools/workspace-tools");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { createPackageProviderRegistry } = require("../resources/ai-companion/tools/package-providers");
const structuredTools = require("../resources/ai-companion/tools/structured-execution-tools");
const { CommandImpactInspector } = require("../resources/ai-companion/security/command-impact/command-impact-inspector");

function createToolCall(name, args) {
  return {
    id: `call-${name}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
    raw: { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }
  };
}

function createRuntime() {
  return { estimateTokens: () => 1, throwIfAborted: () => {} };
}

test("agent exposes typed execution tools and no string-based run_test", () => {
  const names = getAgentToolDefinitions("agent").map((definition) => toCanonicalName(definition.function.name));
  assert.equal(names.includes("run_command"), true);
  assert.equal(names.includes("run_test"), false);
  assert.equal(names.includes("compile_project"), true);
  assert.equal(names.includes("run_tests"), true);
  assert.equal(names.includes("restore_dependencies"), false);
  assert.equal(names.includes("manage_dependencies"), true);
});

test("fresh policy defaults to deny-and-audit with wildcard package rules and disabled launchers", () => {
  assert.equal(validatePolicy(PRODUCT_DEFAULT_POLICY).valid, true);
  assert.equal(PRODUCT_DEFAULT_POLICY.shell.mode, "deny-and-audit");
  assert.equal(PRODUCT_DEFAULT_POLICY.packages.rules.every((rule) => rule.packageId === "*" && rule.registry === "*"), true);
  assert.deepEqual(PRODUCT_DEFAULT_POLICY.packageBinaries, { npx: false, yarnDlx: false, pnpmDlx: false });
});

test("existing settings migrate to deny-and-audit while preserving the auto-run preference", () => {
  const migrated = normalizeAiCompanionSettings({ agentAutoRunCommands: true });
  assert.equal(migrated.aiSecurityPolicy.shell.mode, "deny-and-audit");
  assert.equal(migrated.agentAutoRunCommands, true);
});

test("explicit AI security policies normalize without a renderer failure", () => {
  const normalized = normalizeAiCompanionSettings({
    aiSecurityPolicy: { version: 1, shell: { mode: "sandbox-shell" } }
  });
  assert.equal(normalized.aiSecurityPolicy.shell.mode, "sandbox-shell");
});

test("managed and workspace restrictions cannot be broadened by user policy", () => {
  const policy = effectivePolicy.resolve({
    user: { version: 1, shell: { mode: "sandbox-shell" }, packageBinaries: { npx: true } },
    workspace: { version: 1, shell: { mode: "deny-and-audit" }, packageBinaries: { npx: false } },
    managed: { version: 1, execution: { networkAccess: false, allowedExecutables: ["node.exe"] } }
  });
  assert.equal(policy.shell.mode, "deny-and-audit");
  assert.equal(policy.packageBinaries.npx, false);
  assert.equal(policy.execution.networkAccess, false);
  assert.deepEqual(policy.execution.allowedExecutables, ["node.exe"]);
  assert.equal(policy.metadata.lockedFields.includes("execution.networkAccess"), true);
});

test("managed workspace roots narrow the workspace placeholder without denying the matching root", () => {
  const managedRoot = path.resolve("C:/enterprise/workspaces");
  const policy = effectivePolicy.resolve({
    user: { version: 1 },
    managed: { version: 1, execution: { allowedWorkspaceRoots: [managedRoot] } }
  });
  assert.deepEqual(policy.execution.allowedWorkspaceRoots, [managedRoot]);
});

test("package rules are authorized by every configured policy layer", () => {
  const policy = effectivePolicy.resolve({
    user: { version: 1, packages: { rules: [{ ecosystem: "npm", packageId: "*", version: "*", action: "*", registry: "*" }] } },
    workspace: { version: 1, packages: { rules: [{ ecosystem: "npm", packageId: "approved", version: "1.*", action: "install", registry: "https://artifactory.example/npm" }] } },
    managed: { version: 1, packages: { rules: [{ ecosystem: "npm", packageId: "*", version: "*", action: "*", registry: "*" }] } }
  });
  assert.equal(effectivePolicy.isPackageOperationAllowed(policy, { ecosystem: "npm", packageId: "approved", version: "1.2.0", action: "install", registry: "https://artifactory.example/npm" }), true);
  assert.equal(effectivePolicy.isPackageOperationAllowed(policy, { ecosystem: "npm", packageId: "unapproved", version: "1.2.0", action: "install", registry: "https://artifactory.example/npm" }), false);
});

test("invalid managed policy source is reported as present and invalid", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-managed-policy-"));
  const filePath = path.join(root, "policy.json");
  await fs.writeFile(filePath, "{invalid", "utf8");
  const source = await readPolicyFile(filePath, "machine-managed");
  assert.equal(source.found, true);
  assert.equal(source.valid, false);
  assert.match(source.error, /JSON/);
});

test("invalid managed policy fails closed for shell, structured execution, and packages", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-managed-closed-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-managed-profile-"));
  const context = await createSecurityContext({
    workspaceRoot: workspace,
    profileRoot,
    userPolicy: { version: 1, shell: { mode: "sandbox-shell" } },
    managedProvider: { load: async () => ({ found: true, valid: false, source: "machine-managed", path: "managed.json", error: "invalid managed policy" }) }
  });
  assert.equal(context.policy.shell.mode, "deny-and-audit");
  assert.deepEqual(context.policy.execution.allowedExecutables, []);
  assert.deepEqual(context.policy.packages.rules, []);
  assert.match(context.policyError, /invalid managed policy/);
});

test("denied shell command is audited once, never requests approval, and returns do-not-retry guidance", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-denied-command-"));
  const marker = path.join(workspace, "should-not-exist.txt");
  const audits = [];
  const events = [];
  let rounds = 0;
  let finalMessages;
  const provider = {
    completeMessage: async (messages) => {
      rounds += 1;
      if (rounds === 1) {
        return { content: "", toolCalls: [createToolCall("run_command", { command: `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "\\\\")}','bad')"` })] };
      }
      finalMessages = messages;
      return { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };
  await runAgentToolLoop(provider, { agentAutoRunCommands: true }, workspace, "run it", "agent", (event) => events.push(event), createRuntime(), {
    requestApproval: async () => { throw new Error("approval must not be requested"); },
    requestId: "request-1",
    securityContext: {
      policy: { version: 1, shell: { mode: "deny-and-audit" }, metadata: { source: "product-defaults", hash: "hash" } },
      auditLogger: { record: async (record) => audits.push(record) }
    }
  });
  await assert.rejects(() => fs.access(marker));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].decision, "deny");
  assert.match(JSON.stringify(finalMessages), /FREE_FORM_COMMAND_NOT_PERMITTED/);
  assert.match(JSON.stringify(finalMessages), /doNotRetry/);
 const completedCommand = events.find((event) => event.type === "tool-error" && event.tool === "run_command");
  assert.ok(completedCommand);
  assert.match(completedCommand.error, /security policy/i);
});

test("sandbox-shell preserves auto-run command behavior and audits request and outcome", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-sandbox-command-"));
  const audits = [];
  let approvalRequested = false;
  let executionCount = 0;
  let rounds = 0;
  const originalRunCommand = workspaceTools.runCommand;
  workspaceTools.runCommand = async () => {
    executionCount += 1;
    return { command: "git status", stdout: "ok", stderr: "" };
  };
  const provider = {
    completeMessage: async () => {
      rounds += 1;
      return rounds === 1
        ? { content: "", toolCalls: [createToolCall("run_command", { command: "git status" })] }
        : { content: "done", toolCalls: [] };
    },
    complete: async () => "done"
  };
  try {
    await runAgentToolLoop(provider, { agentAutoRunCommands: true }, workspace, "run it", "agent", () => {}, createRuntime(), {
      requestApproval: async () => { approvalRequested = true; return { decision: "approve" }; },
      securityContext: {
        policy: { version: 1, shell: { mode: "sandbox-shell", timeoutMs: 1000, outputLimitBytes: 1024 }, metadata: { source: "user", hash: "hash" } },
        auditLogger: { record: async (record) => audits.push(record) }
      }
    });
  } finally {
    workspaceTools.runCommand = originalRunCommand;
  }
  assert.equal(executionCount, 1);
  assert.equal(approvalRequested, false);
  assert.deepEqual(audits.map((record) => record.decision), ["requested", "executed-success"]);
  assert.equal(audits[0].commandImpact.impact, "read-only");
  assert.equal(audits[0].commandImpact.canAutoRun, true);
});

test("command impact analysis is structural, flag-aware, and fails closed", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-command-impact-"));
  const inspector = new CommandImpactInspector();
  const inspect = (command, dialect = "cmd") => inspector.inspect({ command, dialect, workspaceRoot: workspace, workingDirectory: workspace });
  assert.equal((await inspect("git status")).canAutoRun, true);
  assert.equal((await inspect("git status | findstr clean")).impact, "read-only");
  assert.equal((await inspect('echo "a|b"')).canAutoRun, true);
  assert.equal((await inspect("git status 2>&1")).canAutoRun, true);
  assert.equal((await inspect("git reset --hard")).impact, "destructive");
  assert.equal((await inspect("git branch -D old")).impact, "destructive");
  assert.equal((await inspect("echo hi > output.txt")).impact, "workspace-write");
  assert.equal((await inspect('powershell -Command "Remove-Item -Recurse ."')).impact, "destructive");
  assert.equal((await inspect('echo "unterminated')).impact, "unknown");
  assert.equal((await inspect("echo %DYNAMIC%")).impact, "unknown");
  assert.equal((await inspect("cat $HOME/.ssh/id_rsa", "posix")).canAutoRun, false);
  assert.equal((await inspect("Get-Content $env:USERPROFILE/.ssh/id_rsa", "powershell")).canAutoRun, false);
  assert.equal((await inspect("cat .env", "posix")).impact, "sensitive-read");
  assert.equal((await inspect("git diff --output=changes.txt")).impact, "workspace-write");
  assert.equal((await inspect("git status &")).impact, "unknown");
  assert.equal((await inspect("cat <(git status)", "posix")).impact, "unknown");
  const outsideWrite = await inspect("cd .. && echo hi > outside.txt", "posix");
  assert.equal(outsideWrite.affectedPaths.some((entry) => entry.outsideWorkspace), true);
  assert.equal(outsideWrite.impact, "destructive");
});

test("command classifier suggests typed tools without executing", () => {
  assert.equal(classifyCommand("mvn compile").suggestion.tool, "compile_project");
  assert.equal(classifyCommand("mvn test").suggestion.tool, "run_tests");
  assert.equal(classifyCommand("node --test tests/example.test.js").suggestion.tool, "run_tests");
  assert.equal(classifyCommand("npx playwright test").suggestion.tool, "run_tests");
  assert.equal(classifyCommand("npm install lodash@4.17.21").suggestion.tool, "manage_dependencies");
});

test("command runner rejects a digest mismatch before launch", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-command-digest-"));
  await assert.rejects(
    () => workspaceTools.runCommand(workspace, "git status", { allowCommands: true, expectedCommandDigest: "different" }),
    { code: "COMMAND_AUTHORIZATION_MISMATCH" }
  );
});

test("package providers expose the constrained provider interface for every V1 ecosystem", () => {
  const registry = createPackageProviderRegistry({
    baseDescriptor: (workspaceRoot, projectRoot, executable, args) => ({ workspaceRoot, cwd: projectRoot, executable, args }),
    findExecutable: async (_root, candidates) => candidates[candidates.length - 1]
  });
  assert.deepEqual(registry.providers.map((provider) => provider.id), ["npm", "yarn", "pnpm", "maven", "gradle"]);
  for (const provider of registry.providers) {
    assert.equal(typeof provider.supports, "function");
    assert.equal(typeof provider.restoreDependencies, "function");
    assert.equal(typeof provider.managePackage, "function");
  }
});

test("structured broker executes an argument array inside the canonical workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-broker-"));
  const policy = effectivePolicy.resolve({
    user: {
      version: 1,
      execution: {
        allowedWorkspaceRoots: ["${workspaceRoot}"],
        allowedExecutables: [path.basename(process.execPath)]
      }
    }
  });
  const result = await new StructuredExecutionBroker().execute({
    workspaceRoot: workspace,
    cwd: workspace,
    executable: process.execPath,
    args: ["-e", "process.stdout.write('ok')"]
  }, policy);
  assert.equal(result.success, true);
  assert.equal(result.stdout, "ok");
});

test("structured broker rejects an out-of-workspace cwd and bounds combined output", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-broker-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-broker-outside-"));
  const policy = effectivePolicy.resolve({
    user: {
      version: 1,
      shell: { outputLimitBytes: 1024 },
      execution: { allowedWorkspaceRoots: ["${workspaceRoot}"], allowedExecutables: [path.basename(process.execPath)] }
    }
  });
  const broker = new StructuredExecutionBroker();
  await assert.rejects(() => broker.execute({
    workspaceRoot: workspace,
    cwd: outside,
    executable: process.execPath,
    args: ["-e", "process.stdout.write('bad')"]
  }, policy), /escapes the workspace/);
  const result = await broker.execute({
    workspaceRoot: workspace,
    cwd: workspace,
    executable: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(900));process.stderr.write('y'.repeat(900))"]
  }, policy);
  assert.equal(result.outputTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 1024);
});

test("Windows package scripts are translated to trusted Node entry points", { skip: process.platform !== "win32" }, async (context) => {
  const npmCommand = path.join(path.dirname(process.execPath), "npm.cmd");
  try {
    await fs.access(npmCommand);
  } catch (_error) {
    context.skip("npm.cmd is unavailable beside Node");
    return;
  }
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-npm-launcher-"));
  const policy = effectivePolicy.resolve({
    user: { version: 1, execution: { allowedWorkspaceRoots: ["${workspaceRoot}"], allowedExecutables: ["npm.cmd"] } }
  });
  const result = await new StructuredExecutionBroker().execute({
    workspaceRoot: workspace,
    cwd: workspace,
    executable: npmCommand,
    args: ["--version"]
  }, policy);
  assert.equal(result.success, true);
  assert.match(result.stdout, /^\d+\./);
});

test("typed Node test operation returns normalized counts through the broker", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-node-tests-"));
  await fs.writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "security-test", private: true }), "utf8");
  await fs.writeFile(path.join(workspace, "example.test.js"), "const test=require('node:test');test('ok',()=>{});", "utf8");
  const audits = [];
  const policy = effectivePolicy.resolve({ user: { version: 1, execution: { networkAccess: false } } });
  const result = await structuredTools.runTests(workspace, {
    targetPath: ".",
    runner: "node",
    scope: "project",
    selector: ""
  }, {
    policy,
    auditLogger: { record: async (record) => audits.push(record) },
    requestId: "node-tests"
  });
  assert.equal(result.success, true);
  assert.equal(result.runner, "node");
  assert.equal(result.summary.total, 1);
  assert.deepEqual(audits.map((record) => record.decision), ["allow", "executed-success"]);
});

test("typed Javac compile operation builds plain Java sources without a shell", async (context) => {
  const javac = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "javac.exe" : "javac")
    : process.platform === "win32" ? "javac.exe" : "javac";
  if (spawnSync(javac, ["-version"], { windowsHide: true }).status !== 0) {
    context.skip("javac is not available");
    return;
  }
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-javac-"));
  await fs.writeFile(path.join(workspace, "Main.java"), "public class Main { public static void main(String[] args) {} }", "utf8");
  const policy = effectivePolicy.resolve({ user: { version: 1, execution: { networkAccess: false } } });
  const result = await structuredTools.compileProject(workspace, {
    targetPath: ".",
    buildMode: "clean",
    includeTestSources: false
  }, {
    policy,
    auditLogger: { record: async () => {} },
    requestId: "javac"
  });
  assert.equal(result.success, true);
  await fs.access(path.join(workspace, ".md-editor", "ai-build", "classes", "Main.class"));
});

test("audit logger serializes concurrent writes and rotates within retention", async () => {
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-audit-"));
  const loggerA = new CommandAuditLogger(profileRoot, { enabled: true, capture: "full", maxFiles: 2, maxFileBytes: 300 });
  const loggerB = new CommandAuditLogger(profileRoot, { enabled: true, capture: "full", maxFiles: 2, maxFileBytes: 300 });
  await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? loggerA : loggerB).record({
    requestId: String(index),
    requestedCommand: `command-${index}-${"x".repeat(70)}`,
    decision: "deny"
  })));
  const files = (await fs.readdir(loggerA.getLocation())).filter((name) => name.startsWith("commands.jsonl"));
  assert.ok(files.length <= 2);
  const current = await fs.readFile(path.join(loggerA.getLocation(), "commands.jsonl"), "utf8");
  assert.doesNotThrow(() => current.trim().split(/\r?\n/).filter(Boolean).forEach((line) => JSON.parse(line)));
});

test("AI Security settings disable auto-run outside sandbox mode and preserve custom whitelist rules", async () => {
  const source = await fs.readFile(path.resolve(__dirname, "../resources/js/ai-companion/security-settings.js"), "utf8");
  const ids = [
    "settings-ai-security-shell-mode", "settings-ai-agent-auto-run-commands", "settings-ai-security-binary-npx",
    "settings-ai-security-binary-yarn-dlx", "settings-ai-security-binary-pnpm-dlx", "settings-ai-security-registries",
    "settings-ai-security-policy-json", "settings-ai-security-effective-source", "settings-ai-security-managed-status",
    "settings-ai-security-audit-location", "settings-ai-security-status",
    ...["npm", "yarn", "pnpm", "maven", "gradle"].map((name) => `settings-ai-security-package-${name}`)
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    id, value: "", checked: false, disabled: false, textContent: "",
    addEventListener() {},
    closest() { return { classList: { toggle() {} } }; }
  }]));
  let api;
  const context = {
    console,
    document: { getElementById: (id) => elements[id] || null },
    window: {}
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.runInNewContext(source, context);
  context.window.registerMarkdownViewerAiSecuritySettings({ registerModule(_name, value) { api = value; } }, {});
  api.apply({
    version: 1,
    shell: { mode: "deny-and-audit" },
    packages: { rules: [{ ecosystem: "npm", packageId: "approved-package", version: "1.*", action: "install", registry: "https://artifactory.example/npm" }] },
    packageBinaries: { npx: false, yarnDlx: false, pnpmDlx: false }
  }, true);
  assert.equal(elements["settings-ai-agent-auto-run-commands"].disabled, true);
  elements["settings-ai-security-shell-mode"].value = "sandbox-shell";
  api.updateShellInteraction();
  assert.equal(elements["settings-ai-agent-auto-run-commands"].disabled, false);
  const collected = api.collect();
  assert.equal(collected.packages.rules.some((rule) => rule.packageId === "approved-package"), true);
});
