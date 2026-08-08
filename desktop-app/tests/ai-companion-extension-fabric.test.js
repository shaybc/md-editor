"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ExtensionFabric } = require("../resources/ai-companion/orchestration/autonomous/extensions/extension-fabric");
const { HookGateway } = require("../resources/ai-companion/orchestration/autonomous/hooks/hook-gateway");
const { CapabilityCatalog } = require("../resources/ai-companion/orchestration/autonomous/capabilities/capability-catalog");
const { normalizeServerConfiguration } = require("../resources/ai-companion/orchestration/autonomous/mcp/server-configuration");

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
  assert.equal(bundle.contributionCount, 11);
  const skill = snapshot.entries.find((entry) => entry.id === "core-workflows:develop-change");
  assert.equal(skill.kind, "skill");
  assert.equal(Object.hasOwn(skill, "body"), false);
  assert.match((await fabric.activate(skill.id)).body, /smallest coherent change/i);
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
  assert.equal(catalog.definitions()[0].function.name, "mcp__sample__lookup");
});

test("external server configuration accepts stdio and protected HTTP transports", () => {
  const stdio = normalizeServerConfiguration({ id: "local", transport: "stdio", command: "C:\\tools\\server.exe", args: ["--stdio"] });
  assert.deepEqual({ id: stdio.id, transport: stdio.transport, command: stdio.command, args: stdio.args, cwd: stdio.cwd, env: stdio.env }, {
    id: "local", transport: "stdio", command: "C:\\tools\\server.exe", args: ["--stdio"], cwd: "", env: {}
  });
  assert.equal(normalizeServerConfiguration({ id: "loopback", transport: "http", url: "http://localhost:4080/mcp" }).url, "http://localhost:4080/mcp");
  assert.throws(() => normalizeServerConfiguration({ id: "remote", transport: "http", url: "http://example.test/mcp" }), /HTTPS/i);
});
