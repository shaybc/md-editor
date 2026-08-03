const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const planTools = require("../resources/ai-companion/tools/plan-repository-tools");
const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");

async function createProfileRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "md-editor-plan-agent-"));
}

function profilePath(profileRoot, profileRelativePath) {
  return path.join(profileRoot, ...String(profileRelativePath || "").split("/"));
}

test("plan repository creates Markdown plans and rebuildable index entries", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };

  const created = await planTools.planCreate("C:/workspace/demo", {
    title: "Storage Plan",
    body: "# Storage Plan\n\n## Milestones\n- M1: Inspect storage\n",
    sourceChatId: "chat-1",
    sourceTaskId: "task-1",
    milestones: [{ id: "M1", title: "Inspect storage" }]
  }, options);

  assert.equal(created.changed, true);
  assert.match(created.plan.path, /^companion\/plans\/\d{4}\/\d{2}\/\d{2}\/storage-plan\.md$/);
  assert.equal(created.plan.status, "planned");
  assert.equal(created.plan.archived, false);
  assert.equal(created.plan.workspaceRoot, "C:/workspace/demo");
  assert.equal(created.plan.milestones[0].id, "M1");

  const fileContent = await fs.readFile(profilePath(profileRoot, created.plan.path), "utf8");
  assert.match(fileContent, /^---\nid: /);
  assert.match(fileContent, /title: "Storage Plan"/);
  assert.equal(fileContent.includes("archived:"), false);
  assert.match(fileContent, /# Storage Plan/);

  const index = JSON.parse(await fs.readFile(planTools._test.getIndexPath(options), "utf8"));
  assert.equal(index.plans.length, 1);
  assert.equal(index.plans[0].id, created.plan.id);
});

test("plan repository strips Plan prefix and deletes saved plans", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };

  const created = await planTools.planCreate("", {
    body: "# Plan: App-wide context menu\n\n## Milestones\n- M1: Inspect menu"
  }, options);

  assert.equal(created.plan.title, "App-wide context menu");
  assert.match(created.plan.path, /app-wide-context-menu\.md$/);

  const deleted = await planTools.planDelete("", { id: created.plan.id }, options);
  assert.equal(deleted.changed, true);
  await assert.rejects(() => planTools.planRead("", { id: created.plan.id }, options), /Plan was not found/);
  const listed = await planTools.planList("", {}, options);
  assert.deepEqual(listed.plans, []);
});
test("plan repository reads, lists, updates, and marks plan status", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };
  const created = await planTools.planCreate("", {
    title: "Searchable Storage Plan",
    body: "Initial durable artifact body",
    milestones: [{ id: "M1", title: "Initial step" }]
  }, options);

  const readById = await planTools.planRead("", { id: created.plan.id }, options);
  assert.equal(readById.id, created.plan.id);
  assert.equal(readById.body, "Initial durable artifact body");

  const readByPath = await planTools.planRead("", { path: created.plan.path }, options);
  assert.equal(readByPath.id, created.plan.id);

  const listed = await planTools.planList("", { status: "planned", query: "durable artifact" }, options);
  assert.deepEqual(listed.plans.map((plan) => plan.id), [created.plan.id]);

  const updated = await planTools.planUpdate("", {
    id: created.plan.id,
    title: "Updated Storage Plan",
    body: "Updated repository body",
    milestones: [{ id: "M2", title: "Second step", status: "done" }]
  }, options);
  assert.equal(updated.plan.id, created.plan.id);
  assert.equal(updated.plan.title, "Updated Storage Plan");
  assert.equal(updated.plan.path, created.plan.path);
  assert.equal(updated.plan.milestones[0].id, "M2");

  const renamed = await planTools.planUpdate("", {
    id: created.plan.id,
    title: "Renamed Storage Plan",
    renameFile: true
  }, options);
  assert.equal(renamed.plan.id, created.plan.id);
  assert.equal(renamed.plan.title, "Renamed Storage Plan");
  assert.match(renamed.plan.path, /renamed-storage-plan\.md$/);
  await assert.rejects(() => fs.access(profilePath(profileRoot, created.plan.path)), /ENOENT/);
  const renamedRead = await planTools.planRead("", { id: created.plan.id }, options);
  assert.equal(renamedRead.title, "Renamed Storage Plan");
  assert.equal(renamedRead.path, renamed.plan.path);

  const implemented = await planTools.planUpdateStatus("", { id: created.plan.id, status: "implemented" }, options);
  assert.equal(implemented.plan.status, "implemented");
  assert.equal(implemented.plan.archived, false);
  assert.ok(implemented.plan.implementedAt);

  const archived = await planTools.planUpdateStatus("", { id: created.plan.id, archived: true }, options);
  assert.equal(archived.plan.status, "implemented");
  assert.equal(archived.plan.archived, true);
  assert.ok(archived.plan.archivedAt);

  const afterArchive = await planTools.planRead("", { id: created.plan.id }, options);
  assert.equal(afterArchive.frontmatter.status, "implemented");
  assert.equal(afterArchive.frontmatter.archived, true);
  assert.ok(afterArchive.frontmatter.implementedAt);
  assert.ok(afterArchive.frontmatter.archivedAt);

  const archivedList = await planTools.planList("", { status: "archived" }, options);
  assert.deepEqual(archivedList.plans.map((plan) => plan.id), [created.plan.id]);
  const implementedList = await planTools.planList("", { status: "implemented" }, options);
  assert.deepEqual(implementedList.plans.map((plan) => plan.id), [created.plan.id]);
  const plannedList = await planTools.planList("", { status: "planned" }, options);
  assert.deepEqual(plannedList.plans.map((plan) => plan.id), []);

  const unarchived = await planTools.planUpdateStatus("", { id: created.plan.id, archived: false }, options);
  assert.equal(unarchived.plan.status, "implemented");
  assert.equal(unarchived.plan.archived, false);

  const plannedAgain = await planTools.planUpdateStatus("", { id: created.plan.id, status: "planned" }, options);
  assert.equal(plannedAgain.plan.status, "planned");
  assert.equal(plannedAgain.plan.archived, false);
  assert.equal(plannedAgain.plan.implementedAt, "");
});

test("plan repository reads legacy archived status as archive metadata", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };
  const created = await planTools.planCreate("", {
    title: "Legacy Archive Plan",
    body: "Legacy status archive body"
  }, options);
  const filePath = profilePath(profileRoot, created.plan.path);
  const fileContent = await fs.readFile(filePath, "utf8");
  await fs.writeFile(filePath, fileContent.replace('status: "planned"', 'status: "archived"'), "utf8");
  await planTools.planRebuildIndex("", {}, options);

  const read = await planTools.planRead("", { id: created.plan.id }, options);
  assert.equal(read.status, "planned");
  assert.equal(read.archived, true);
  assert.equal(read.frontmatter.status, "planned");
  assert.equal(read.frontmatter.archived, true);
});

test("plan repository list rebuilds index from Markdown files", async () => {
  const profileRoot = await createProfileRoot();
  const options = { profileRoot };
  const created = await planTools.planCreate("", {
    title: "Rebuild Index Plan",
    body: "Index can be rebuilt from files"
  }, options);

  await fs.writeFile(planTools._test.getIndexPath(options), "{not-json", "utf8");

  const listed = await planTools.planList("", { query: "rebuilt" }, options);
  assert.deepEqual(listed.plans.map((plan) => plan.id), [created.plan.id]);

  const index = JSON.parse(await fs.readFile(planTools._test.getIndexPath(options), "utf8"));
  assert.equal(index.plans[0].id, created.plan.id);
});

test("plan repository tools are exposed only to Agent mode", () => {
  const agentNames = getAgentToolDefinitions("agent").map((definition) => definition.function.name);
  const chatNames = getAgentToolDefinitions("chat").map((definition) => definition.function.name);
  const planNames = getAgentToolDefinitions("plan").map((definition) => definition.function.name);

  for (const name of ["plan_create", "plan_list", "plan_read", "plan_update", "plan_update_status", "plan_rebuild_index"]) {
    assert.equal(agentNames.includes(name), true, `${name} should be exposed to Agent mode`);
    assert.equal(chatNames.includes(name), false, `${name} should not be exposed to Chat mode`);
    assert.equal(planNames.includes(name), false, `${name} should not be exposed to Plan mode`);
  }
  assert.deepEqual(planNames, ["get_workspace_state", "read_active_document", "read_open_tabs", "get_document_structure", "search_vault", "get_link_context", "get_recent_activity", "graph_get_state", "graph_search_nodes", "graph_get_node_context", "graph_find_paths", "list_files", "glob", "search_grep", "read_file"]);
});
