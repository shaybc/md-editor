"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { resolveCapabilityPolicy } = require("../resources/ai-companion/orchestration/shared/capability-policy");
const { getToolDefinitions } = require("../resources/ai-companion/orchestration/autonomous/tool-catalog");
const { SkillCatalog } = require("../resources/ai-companion/orchestration/autonomous/skills/skill-catalog");
const { SkillInvocationSession } = require("../resources/ai-companion/orchestration/autonomous/skills/skill-invocation-session");
const { SlashWorkflowRouter } = require("../resources/ai-companion/orchestration/autonomous/skills/slash-workflow-router");
const { RunScheduler } = require("../resources/ai-companion/orchestration/autonomous/scheduling/run-scheduler");

function request(workspaceRoot, action = "agent") {
  return { workspaceRoot, action, profileRoot: "", modelLimits: { contextWindow: 100000 } };
}

function capabilities(names) {
  return { registrations: () => names.map((name) => ({ name })) };
}

test("skill catalog advertises metadata and lazily loads the selected body", async () => {
  let loads = 0;
  const fabric = { entries: new Map([["skill:test", {
    id: "skill:test", kind: "skill", scope: "bundle", filePath: "bundle/test.md",
    metadata: { id: "focused-test", name: "Focused Test", description: "Run focused checks.", allowedModes: ["agent"], allowedTools: ["read_file"] }
  }]]), activate: async () => { loads += 1; return { body: "Read the target and verify it." }; } };
  const catalog = new SkillCatalog(request(process.cwd()), { fabric, capabilities: capabilities(["read_file"]) });
  await catalog.load();
  assert.equal(loads, 0);
  assert.match(catalog.advertisement(), /focused-test/);
  const session = new SkillInvocationSession(catalog);
  await session.invoke("focused-test", "target.js", { trigger: "model" });
  assert.equal(loads, 1);
  assert.match(catalog.consumeActivated()[0].body, /verify it/);
  assert.throws(() => session.assertToolAllowed("write_file"), { code: "SKILL_TOOL_NOT_ALLOWED" });
});

test("exact user slash commands expand deterministically and unknown commands fail", async () => {
  const catalog = new SkillCatalog({ ...request(process.cwd()), skills: [{
    id: "quick-check", name: "Quick Check", description: "Check one target.", body: "Inspect {{arguments}}.", allowedModes: ["agent"]
  }] }, { capabilities: capabilities([]) });
  await catalog.load();
  const session = new SkillInvocationSession(catalog);
  const router = new SlashWorkflowRouter(catalog, session);
  const expanded = await router.expand("/quick-check src/main.js");
  assert.equal(expanded.name, "quick-check");
  assert.match(catalog.consumeActivated()[0].body, /src\/main\.js/);
  assert.equal(router.parse("please /quick-check src/main.js"), null);
  await assert.rejects(() => router.expand("/missing"), { code: "UNKNOWN_SLASH_WORKFLOW" });
});

test("skill eligibility enforces mode, trust, and invocation audience", async () => {
  const catalog = new SkillCatalog({
    ...request(process.cwd(), "chat"),
    skills: [
      { id: "agent-only", name: "Agent Only", description: "Agent workflow.", body: "Agent.", allowedModes: ["agent"] },
      { id: "user-only", name: "User Only", description: "Direct workflow.", body: "User.", allowedModes: ["chat"], modelInvocable: false },
      { id: "untrusted", name: "Untrusted", description: "Untrusted workflow.", body: "No.", allowedModes: ["chat"], trusted: false }
    ]
  }, { capabilities: capabilities([]) });
  await catalog.load();
  assert.equal(catalog.resolve("agent-only", { user: true }), null);
  assert.equal(catalog.resolve("untrusted", { user: true }), null);
  assert.equal(catalog.resolve("user-only", { model: true }), null);
  assert.ok(catalog.resolve("user-only", { user: true }));
});

test("structured arguments are substituted without evaluating their contents", async () => {
  const catalog = new SkillCatalog({ ...request(process.cwd()), skills: [{
    id: "structured", name: "Structured", description: "Structured arguments.", body: "Target={{target}}; all={{arguments}}", arguments: ["target"], allowedModes: ["agent"]
  }] }, { capabilities: capabilities([]) });
  await catalog.load();
  const session = new SkillInvocationSession(catalog);
  await session.invoke("structured", { target: "$(not-executed)" }, { trigger: "model" });
  const body = catalog.consumeActivated()[0].body;
  assert.match(body, /Target=\$\(not-executed\)/);
  assert.match(body, /"target":"\$\(not-executed\)"/);
});

test("path-scoped skills activate only after a declared path is observed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-skill-"));
  const directory = path.join(root, ".agents", "skills", "javascript-check");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "SKILL.md"), `---
id: javascript-check
name: JavaScript Check
description: Check JavaScript paths.
paths: ["src/**/*.js"]
allowedModes: [agent]
---
Inspect the selected JavaScript file.
`);
  const catalog = new SkillCatalog(request(root), { capabilities: capabilities([]) });
  await catalog.load();
  assert.equal(catalog.resolve("javascript-check", { model: true }), null);
  await catalog.activateForPaths(["src/app.js"], "test");
  assert.ok(catalog.resolve("javascript-check", { model: true }));
});

test("scheduling is agent-only and persists workspace-scoped entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-schedule-"));
  const profileRoot = path.join(root, "profile");
  const scheduler = new RunScheduler({ ...request(root), profileRoot });
  await scheduler.load();
  const created = await scheduler.create({ prompt: "Run focused checks", delayMinutes: 60, durable: true });
  assert.equal(scheduler.list().length, 1);
  const restored = new RunScheduler({ ...request(root), profileRoot });
  await restored.load();
  assert.equal(restored.list()[0].id, created.id);
  const claimed = await restored.claimDue(Date.parse(created.nextRunAt) + 1);
  assert.equal(claimed[0].status, "running");
  const completed = await restored.complete(created.id);
  assert.equal(completed.status, "completed");
  const cancelledCandidate = await restored.create({ prompt: "Cancel this check", delayMinutes: 60 });
  await restored.cancel(cancelledCandidate.id);
  const chatNames = getToolDefinitions(resolveCapabilityPolicy("chat")).map((entry) => entry.function.name);
  const agentNames = getToolDefinitions(resolveCapabilityPolicy("agent")).map((entry) => entry.function.name);
  assert.equal(chatNames.includes("schedule_create"), false);
  assert.equal(agentNames.includes("schedule_create"), true);
});
