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
