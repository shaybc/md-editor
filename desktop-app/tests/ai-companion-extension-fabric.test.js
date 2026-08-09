"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ExtensionFabric } = require("../resources/ai-companion/orchestration/autonomous/extensions/extension-fabric");
const { HookGateway } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-gateway");
const { CapabilityCatalog } = require("../resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog");
const { ToolSchemaInventory } = require("../resources/ai-companion/orchestration/autonomous/capabilities/tool-schema-inventory");
const { normalizeServerConfiguration } = require("../resources/ai-companion/orchestration/autonomous/mcp/server-configuration");
const { AgentDefinitionPolicy } = require("../resources/ai-companion/orchestration/autonomous/agents/agent-definition-policy");
const { McpConnectionManager } = require("../resources/ai-companion/orchestration/autonomous/mcp/mcp-connection-manager");
const { AgentCatalog } = require("../resources/ai-companion/orchestration/autonomous/agents/agent-catalog");
const { WorkspaceAgentSource } = require("../resources/ai-companion/orchestration/autonomous/agents/workspace-agent-source");
const { BundleAgentSource } = require("../resources/ai-companion/orchestration/autonomous/agents/bundle-agent-source");
const { discoverExtensions } = require("../resources/ai-companion/orchestration/autonomous/extension-registry");
const { RunExtensionCatalog } = require("../resources/ai-companion/orchestration/autonomous/extensions/run-extension-catalog");
const { RunAgentSource } = require("../resources/ai-companion/orchestration/autonomous/agents/run-agent-source");
const { executeTool } = require("../resources/ai-companion/orchestration/autonomous/tool-executor");
const { ExtensionAuthoringRepository } = require("../resources/ai-companion/orchestration/autonomous/extensions/extension-authoring-repository");

test("settings help tooltips render above extension editor layers", async () => {
  const styles = await fs.readFile(path.join(__dirname, "../resources/styles.css"), "utf8");
  const tooltipLayer = Number(styles.match(/\.settings-ai-entry-tooltip\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1] || 0);
  const contributionLayer = Number(styles.match(/\.settings-ai-extension-contribution-editor\s*\{\s*z-index:\s*(\d+)/)?.[1] || 0);
  assert.ok(tooltipLayer > contributionLayer, `Expected tooltip layer ${tooltipLayer} above contribution dialog layer ${contributionLayer}.`);
});

async function temporaryRoots(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-extensions-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, "workspace");
  const profileRoot = path.join(root, "profile");
  await fs.mkdir(workspaceRoot, { recursive: true });
  return { workspaceRoot, profileRoot };
}

async function writeWorkspaceBundle(workspaceRoot, id, manifest, files = {}) {
  const root = path.join(workspaceRoot, ".md-editor", "companion", "extensions", id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "extension.json"), JSON.stringify(manifest), "utf8");
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
}

test("bundled workflow metadata is available without loading instruction bodies", async () => {
  const fabric = new ExtensionFabric({ workspaceRoot: "", profileRoot: "" });
  const snapshot = await fabric.load();
  const bundle = snapshot.bundles.find((entry) => entry.id === "core-workflows");
  assert.equal(bundle.enabled, true);
  assert.equal(bundle.trusted, true);
  assert.equal(bundle.contributionCount, 23);
  const skill = snapshot.entries.find((entry) => entry.id === "core-workflows:develop-change");
  assert.equal(skill.kind, "skill");
  assert.equal(Object.hasOwn(skill, "body"), false);
  assert.match((await fabric.activate(skill.id)).body, /smallest coherent change/i);
  const scheduledSkill = snapshot.entries.find((entry) => entry.id === "core-workflows:repeat-work");
  assert.equal(Object.hasOwn(scheduledSkill, "body"), false);
});

test("canonical agent discovery hides mode-incompatible definitions and invalid metadata fails closed", async () => {
  const request = { workspaceRoot: "", profileRoot: "", action: "plan" };
  const fabric = new ExtensionFabric(request);
  await fabric.load();
  const catalog = new AgentCatalog(request, [new BundleAgentSource(fabric)]);
  const snapshot = await catalog.load();
  assert.equal(snapshot.entries.some((entry) => entry.id === "core-workflows:change-builder"), false);
  assert.equal(snapshot.entries.some((entry) => entry.id === "change-builder"), false);
  assert.equal(snapshot.entries.some((entry) => entry.id === "implementation-planner"), true);
  await assert.rejects(() => catalog.activate("core-workflows:change-builder"), (error) => error.code === "AGENT_MODE_NOT_ALLOWED");
  const validation = AgentDefinitionPolicy.validate({ allowedModes: ["agent"], permissions: { guessedAuthority: true } });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /unknown permission/i);
});

test("canonical agent catalog uses workspace precedence for discovery, aliases, and activation", async (t) => {
  const roots = await temporaryRoots(t);
  const agentDirectory = path.join(roots.workspaceRoot, ".agents");
  await fs.mkdir(agentDirectory, { recursive: true });
  await fs.writeFile(path.join(agentDirectory, "repository-explorer.md"), "---\nid: repository-explorer\nname: Workspace Explorer\ndescription: Workspace override agent\nallowedModes: [agent]\ncapabilities: [read, context]\n---\nWorkspace-specific agent instructions.", "utf8");
  const request = { ...roots, action: "agent" };
  const fabric = new ExtensionFabric(request);
  await fabric.load();
  const catalog = new AgentCatalog(request, [new WorkspaceAgentSource(request), new BundleAgentSource(fabric)]);
  const snapshot = await catalog.load();
  const metadata = snapshot.entries.find((entry) => entry.id === "repository-explorer");
  assert.equal(metadata.source, "workspace-agent");
  assert.equal(Object.hasOwn(metadata, "body"), false);
  assert.match((await catalog.activate(".agents/repository-explorer.md")).body, /Workspace-specific/);
  assert.match((await catalog.activate("core-workflows:repository-explorer")).body, /Workspace-specific/);
  assert.equal(snapshot.shadowed.some((entry) => entry.sourceIdentity === "core-workflows:repository-explorer"), true);
  assert.equal((await discoverExtensions(request)).some((entry) => entry.kind === "agent"), false);
});

test("canonical agent catalog preserves mode-specific launch errors without advertising the agent", async (t) => {
  const roots = await temporaryRoots(t);
  const agentDirectory = path.join(roots.workspaceRoot, ".agents");
  await fs.mkdir(agentDirectory, { recursive: true });
  await fs.writeFile(path.join(agentDirectory, "builder.md"), "---\nid: private-builder\nname: Private Builder\ndescription: Agent-only definition\nallowedModes: [agent]\n---\nBuild changes.", "utf8");
  const request = { ...roots, action: "plan" };
  const catalog = new AgentCatalog(request, [new WorkspaceAgentSource(request)]);
  await catalog.load();
  assert.equal(catalog.list().some((entry) => entry.id === "private-builder"), false);
  await assert.rejects(() => catalog.activate("private-builder"), (error) => error.code === "AGENT_MODE_NOT_ALLOWED");
});

test("workspace bundles remain inactive until enabled and trusted for that workspace", async (t) => {
  const roots = await temporaryRoots(t);
  await writeWorkspaceBundle(roots.workspaceRoot, "local-pack", {
    schemaVersion: 1, id: "local-pack", name: "Local Pack", version: "1.0.0", description: "Local test bundle",
    contributions: { skills: ["skills/local.md"] }
  }, { "skills/local.md": "---\nid: local-skill\nname: Local Skill\ndescription: Workspace guidance\n---\nPrivate instructions." });
  const fabric = new ExtensionFabric(roots);
  let snapshot = await fabric.load();
  assert.equal(snapshot.entries.some((entry) => entry.extensionId === "local-pack"), false);
  snapshot = await fabric.configure({ id: "local-pack", enabled: true, trusted: true });
  assert.equal(snapshot.entries.some((entry) => entry.id === "local-pack:local-skill"), true);
});

test("authored extensions create, rename, delete, and restore without duplicate publication", async (t) => {
  const roots = await temporaryRoots(t);
  const repository = new ExtensionAuthoringRepository(roots);
  const draft = {
    manifest: { schemaVersion: 1, id: "authored-pack", name: "Authored Pack", version: "1.0.0", description: "Authoring transaction test" },
    skills: [], agents: [], hooks: [], mcpServers: []
  };
  const created = await repository.save({ scope: "user", draft });
  assert.equal(created.id, "authored-pack");
  await assert.rejects(() => repository.save({ scope: "user", draft }), /already exists/i);
  created.draft.manifest.id = "renamed-pack";
  const renamed = await repository.save({ scope: "user", originalId: created.id, expectedDigest: created.digest, draft: created.draft });
  assert.equal(renamed.id, "renamed-pack");
  const recovery = await repository.trash({ scope: "user", id: renamed.id });
  assert.equal((await repository.listTrash("user")).length, 1);
  await repository.restore(recovery);
  assert.equal((await repository.read("user", renamed.id)).id, "renamed-pack");
});

test("workspace extension edits reject stale drafts and invalidate prior trust", async (t) => {
  const roots = await temporaryRoots(t);
  const repository = new ExtensionAuthoringRepository(roots);
  const draft = {
    manifest: { schemaVersion: 1, id: "workspace-pack", name: "Workspace Pack", version: "1.0.0", description: "Workspace authoring test" },
    skills: [], agents: [], hooks: [], mcpServers: []
  };
  const created = await repository.save({ scope: "workspace", draft });
  const fabric = new ExtensionFabric(roots);
  await fabric.load();
  await fabric.configure({ id: created.id, enabled: true, trusted: true });
  const stale = JSON.parse(JSON.stringify(created.draft));
  created.draft.manifest.description = "Changed description";
  await repository.save({ scope: "workspace", originalId: created.id, expectedDigest: created.digest, draft: created.draft });
  const refreshed = await fabric.load();
  assert.equal(refreshed.bundles.find((entry) => entry.id === created.id).trusted, false);
  await assert.rejects(() => repository.save({ scope: "workspace", originalId: created.id, expectedDigest: created.digest, draft: stale }), /changed after it was opened/i);
});

test("a traversal contribution invalidates only its bundle", async (t) => {
  const roots = await temporaryRoots(t);
  await writeWorkspaceBundle(roots.workspaceRoot, "unsafe-pack", {
    schemaVersion: 1, id: "unsafe-pack", name: "Unsafe Pack", version: "1.0.0", description: "Unsafe test bundle",
    contributions: { skills: ["../outside.md"] }
  });
  const snapshot = await new ExtensionFabric(roots).load();
  assert.equal(snapshot.bundles.some((entry) => entry.id === "unsafe-pack"), false);
  assert.equal(snapshot.errors.some((entry) => /outside|bundle|path/i.test(entry.error)), true);
  assert.equal(snapshot.bundles.some((entry) => entry.id === "core-workflows"), true);
});

test("pre hooks fail closed while post hooks report and continue", async () => {
  const events = [];
  const before = new HookGateway({}, [{ metadata: { id: "before", event: "before-tool", action: { type: "context", content: "bounded guidance" } } }], (event) => events.push(event));
  assert.deepEqual(await before.run("before-tool", { tool: "read_file" }), { additionalContext: ["bounded guidance"] });
  const invalidPost = new HookGateway({}, [{ metadata: { id: "after", event: "after-tool", action: { type: "context", content: "" } } }], (event) => events.push(event));
  assert.deepEqual(await invalidPost.run("after-tool"), { additionalContext: [] });
  assert.equal(events.some((event) => event.type === "hook-completed"), true);
});

test("capability discovery adds external schemas only after a metadata match", async () => {
  const external = { type: "function", function: { name: "mcp__sample__lookup", description: "Lookup", parameters: { type: "object", properties: {} } } };
  let connects = 0;
  const fabric = {
    entries: new Map([["pack:sample", { metadata: { id: "sample" }, localId: "sample" }]]),
    snapshot: () => ({ entries: [{ id: "pack:sample", kind: "mcp-server", name: "Sample Search", description: "Looks up records", metadata: {} }] })
  };
  const mcp = { getToolDefinitions: async () => { connects += 1; return [external]; }, listServers: () => ["sample"] };
  const catalog = new CapabilityCatalog({ fabric, mcp, baseDefinitions: [] });
  assert.equal(catalog.definitions().length, 0);
  await catalog.discover("unrelated");
  assert.equal(connects, 0);
  await catalog.discover("records");
  assert.equal(connects, 1);
  assert.equal(catalog.definitions().length, 0);
  await catalog.discover("select:mcp__sample__lookup");
  assert.equal(catalog.definitions()[0].function.name, "mcp__sample__lookup");
});

test("deferred schemas require exact activation and remain isolated per catalog", async () => {
  const definition = (name, description = name) => ({ type: "function", function: { name, description, parameters: { type: "object", properties: {} } } });
  const registrations = [definition("capability_search"), definition("work_create"), definition("work_list")];
  const dependencies = { policy: { mode: "agent" }, fabric: { entries: new Map(), snapshot: () => ({ entries: [] }) }, mcp: { listServers: () => [] } };
  const parent = new CapabilityCatalog({ ...dependencies, baseDefinitions: registrations, knownToolNames: ["capability_search", "work_create", "work_list", "plan_update"] });
  const sibling = new CapabilityCatalog({ ...dependencies, baseDefinitions: registrations });

  assert.deepEqual(parent.definitions().map((entry) => entry.function.name), ["capability_search"]);
  assert.equal(parent.classifyCall("work_create").status, "deferred");
  assert.equal(parent.classifyCall("plan_update").status, "prohibited");
  assert.throws(() => parent.assertCallable("work_create"), (error) => error.code === "TOOL_SCHEMA_NOT_ACTIVE");

  const search = await parent.search("select:work_create");
  assert.deepEqual(search.activatedTools, ["work_create"]);
  assert.deepEqual(parent.definitions().map((entry) => entry.function.name), ["capability_search", "work_create"]);
  assert.deepEqual(sibling.definitions().map((entry) => entry.function.name), ["capability_search"]);

  const restored = new CapabilityCatalog({ ...dependencies, baseDefinitions: registrations });
  assert.deepEqual((await restored.restore(parent.snapshot())).restored, ["work_create"]);
  assert.equal(restored.classifyCall("work_create").status, "active");

  const changed = new CapabilityCatalog({ ...dependencies, baseDefinitions: [definition("capability_search"), definition("work_create", "Changed definition"), definition("work_list")] });
  assert.deepEqual((await changed.restore(parent.snapshot())).missing, ["work_create"]);
  assert.equal(changed.classifyCall("work_create").status, "deferred");
});

test("schema inventory rejects duplicate canonical names", () => {
  const duplicate = { type: "function", function: { name: "read_file", parameters: { type: "object", properties: {} } } };
  assert.throws(() => new ToolSchemaInventory([duplicate, duplicate]), /duplicate autonomous tool schema/i);
});

test("external server configuration accepts stdio and protected HTTP transports", () => {
  const stdio = normalizeServerConfiguration({ id: "local", transport: "stdio", command: "C:\\tools\\server.exe", args: ["--stdio"] });
  assert.deepEqual({ id: stdio.id, transport: stdio.transport, command: stdio.command, args: stdio.args, cwd: stdio.cwd, env: stdio.env }, {
    id: "local", transport: "stdio", command: "C:\\tools\\server.exe", args: ["--stdio"], cwd: "", env: {}
  });
  assert.equal(normalizeServerConfiguration({ id: "loopback", transport: "http", url: "http://localhost:4080/mcp" }).url, "http://localhost:4080/mcp");
  assert.throws(() => normalizeServerConfiguration({ id: "remote", transport: "http", url: "http://example.test/mcp" }), /HTTPS/i);
});

test("delegated external-server managers inherit metadata without parent task grants", () => {
  const parent = new McpConnectionManager({ workspaceRoot: process.cwd() });
  parent.register([{ id: "local", transport: "stdio", command: "server.exe" }]);
  parent.taskGrants.push({ capability: "external.server.connect", enabled: true });
  const child = parent.fork({ workspaceRoot: process.cwd() });
  assert.deepEqual(child.listServers().map((entry) => entry.id), ["local"]);
  assert.deepEqual(child.taskGrants, []);
  assert.equal(child.connections.size, 0);
});

test("run-scoped plugins contribute executable tools, servers, hooks, skills, and agents", async () => {
  const request = {
    action: "agent",
    plugins: [{ id: "programmatic-pack", contributions: {
      hooks: [{ id: "opening-note", event: "run-start", action: { type: "context", content: "Injected context." } }],
      mcpServers: [{ id: "local-search", transport: "stdio", command: "server.exe" }],
      deferredTools: [{ name: "project_lookup", description: "Look up project data", execute: async (args) => ({ query: args.query }) }],
      skills: [{ id: "lookup-flow", name: "Lookup flow", description: "Use project lookup", body: "Search carefully." }],
      agents: [{ id: "lookup-agent", name: "Lookup agent", description: "Investigates project data", allowedModes: ["agent"], body: "Investigate only the requested data." }]
    } }]
  };
  const catalog = new RunExtensionCatalog(request);
  const runtimeRequest = catalog.extendRequest();
  const registrations = catalog.toolRegistrations(runtimeRequest);
  const capabilities = new CapabilityCatalog({
    policy: { mode: "agent" },
    fabric: { entries: new Map(), snapshot: () => ({ entries: [] }) },
    mcp: { listServers: () => [] },
    registrations
  });
  const agents = new AgentCatalog(runtimeRequest, [new RunAgentSource(runtimeRequest)]);
  await agents.load();

  assert.equal(runtimeRequest.hooks[0].id, "opening-note");
  assert.equal(runtimeRequest.mcpServers[0].id, "local-search");
  assert.equal(runtimeRequest.skills[0].id, "lookup-flow");
  assert.equal(agents.list()[0].id, "lookup-agent");
  assert.match((await agents.activate("lookup-agent")).body, /Investigate only/);
  assert.equal(capabilities.classifyCall("project_lookup").status, "deferred");
  await capabilities.search("select:project_lookup");
  assert.deepEqual(await executeTool({ function: { name: "project_lookup", arguments: JSON.stringify({ query: "wiki" }) } }, {
    request: { workspaceRoot: "" }, capabilities
  }), { query: "wiki" });
  const mcp = new McpConnectionManager({ workspaceRoot: process.cwd() });
  mcp.register(runtimeRequest.mcpServers);
  assert.deepEqual(mcp.listServers().map((entry) => entry.id), ["local-search"]);
  assert.equal(agents.list()[0].metadata.body, undefined);
});

test("invalid injected deferred tools stay unavailable and produce an isolated diagnostic", () => {
  const catalog = new RunExtensionCatalog({ deferredTools: [{ name: "missing_handler", description: "Cannot execute" }] });
  assert.deepEqual(catalog.toolRegistrations(), []);
  assert.match(catalog.errors[0].error, /executable handler/i);
});
