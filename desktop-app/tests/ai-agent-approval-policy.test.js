"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getPolicyDecision,
  normalizeApprovalPolicy
} = require("../resources/ai-companion/core/agent-approval-policy");
const approvalCapabilities = require("../resources/ai-companion/core/approval-capability-registry");
const { ApprovalGrantStore } = require("../resources/ai-companion/core/approval-grant-store");
const { PRODUCT_DEFAULT_POLICY } = require("../resources/ai-companion/security/policy-schema");
const { runAgentToolLoop } = require("./helpers/autonomous-tool-harness");
const { CommandImpactInspector } = require("../resources/ai-companion/security/command-impact/command-impact-inspector");

function toolCall(name, args) {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

test("approval policy normalizes allowlists and matches exact capabilities", () => {
  const policies = [{
    directory: "workspace",
    policy: normalizeApprovalPolicy({ allow: { write: ["docs/**/*.md"], command: ["npm test"], test: [] } })
  }];
  assert.equal(getPolicyDecision(policies, "apply_edit", { path: "docs/guides/start.md" }).allowed, true);
  assert.equal(getPolicyDecision(policies, "write_file", { path: "src/app.js" }).allowed, false);
  assert.equal(getPolicyDecision(policies, "run_command", { command: "npm test" }).allowed, true);
  assert.equal(getPolicyDecision(policies, "run_command", { command: "npm test -- --watch" }).allowed, false);
});

test("approval capability descriptors preserve protected resources and grant limits", () => {
  const write = approvalCapabilities.describe("write_file", { path: "src/App.java" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(write.capability, "workspace.file.write");
  assert.equal(write.resource.value, "src/App.java");
  const protectedWrite = approvalCapabilities.describe("write_file", { path: ".env.production" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(protectedWrite.capability, "workspace.file.write");
  assert.equal(protectedWrite.resource.value, ".env.production");
});

test("command approvals bind grants to analyzed command structure", async () => {
  const commandAnalysis = await new CommandImpactInspector().inspect({ command: "git status", dialect: "cmd", workspaceRoot: process.cwd() });
  const descriptor = approvalCapabilities.describe("run_command", { command: "git status" }, { effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY, commandAnalysis });
  assert.equal(descriptor.resource.type, "command-digest");
  assert.equal(descriptor.commandImpact, "read-only");
  const exact = descriptor.grantOptions.find((option) => option.id === "task-command-exact");
  assert.ok(exact);
  const rule = { capability: descriptor.capability, matcher: exact.matcher, lifetime: "task", enabled: true };
  assert.equal(require("../resources/ai-companion/core/agent-approval-policy").matchesGrantRule(rule, descriptor), true);
  assert.equal(require("../resources/ai-companion/core/agent-approval-policy").matchesGrantRule(rule, { ...descriptor, commandDigest: "different" }), false);
  const prefix = descriptor.grantOptions.find((option) => option.id === "workspace-command-prefix");
  const prefixRule = { capability: descriptor.capability, matcher: prefix.matcher, lifetime: "workspace", enabled: true };
  assert.equal(require("../resources/ai-companion/core/agent-approval-policy").matchesGrantRule(prefixRule, descriptor), true);
  assert.equal(require("../resources/ai-companion/core/agent-approval-policy").matchesGrantRule(prefixRule, { ...descriptor, normalizedCommand: "git status && git reset --hard", commandImpact: "destructive", commandPrefix: "" }), false);
});

test("workspace approval grants persist under the profile and can be revoked", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-workspace-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-profile-"));
  const store = new ApprovalGrantStore(profileRoot, workspace);
  const added = await store.add({ capability: "workspace.file.write", matcher: { type: "path-glob", value: "docs/**" }, lifetime: "workspace", enabled: true });
  assert.equal((await store.list()).rules.length, 1);
  assert.equal((await store.revoke(added.id)).revoked, true);
  assert.equal((await store.list()).rules.length, 0);
});

test("autonomous writes execute only after approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approved-write-"));
  let round = 0;
  let approvals = 0;
  const provider = {
    completeMessage: async () => (++round === 1
      ? { content: "", toolCalls: [toolCall("write_file", { path: "approved.txt", content: "saved", approvalReason: "Create the requested file." })] }
      : { content: "Done.", toolCalls: [] })
  };
  await runAgentToolLoop(provider, {}, workspace, "create the file", "agent", () => {}, null, {
    requestApproval: async () => { approvals += 1; return { approved: true }; }
  });
  assert.equal(approvals, 1);
  assert.equal(await fs.readFile(path.join(workspace, "approved.txt"), "utf8"), "saved");
});

test("autonomous write denial is returned to the model and does not mutate the workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-denied-write-"));
  let round = 0;
  let observedDenial = false;
  const provider = {
    completeMessage: async (messages) => {
      round += 1;
      if (round === 1) return { content: "", toolCalls: [toolCall("write_file", { path: "denied.txt", content: "no", approvalReason: "Create the requested file." })] };
      observedDenial = messages.some((message) => message.role === "tool" && /denied/i.test(message.content));
      return { content: "The write was denied.", toolCalls: [] };
    }
  };
  await runAgentToolLoop(provider, {}, workspace, "create the file", "agent", () => {}, null, {
    requestApproval: async () => ({ approved: false, instructions: "Do not create it." })
  });
  assert.equal(observedDenial, true);
  await assert.rejects(() => fs.access(path.join(workspace, "denied.txt")));
});

test("external write approvals expose the absolute target and remain task scoped", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-opened-"));
  const external = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-approval-external-")), "result.txt");
  const descriptor = approvalCapabilities.describe("write_file", { path: external }, { workspaceRoot: workspace, effectiveSecurityPolicy: PRODUCT_DEFAULT_POLICY });
  assert.equal(descriptor.maximumGrantLifetime, "task");
  assert.equal(descriptor.grantOptions.length, 1);
  assert.equal(descriptor.grantOptions[0].lifetime, "task");
  assert.match(descriptor.grantOptions[0].targetLabel, /result\.txt$/);
  assert.equal(descriptor.grantOptions.some((option) => option.lifetime === "workspace"), false);
});
