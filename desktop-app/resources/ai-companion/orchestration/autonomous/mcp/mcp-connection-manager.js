/** Lazily connects approved external capability servers and exposes their offerings. */

"use strict";

const { StructuredExecutionBroker } = require("../../../security/structured-execution-broker");
const { authorizeTool } = require("../approval-gateway");
const { normalizeServerConfiguration, resolveServerCwd } = require("./server-configuration");

const DEFAULT_IDLE_MS = 120000;

class McpConnectionManager {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = emit;
    this.configurations = new Map();
    this.connections = new Map();
    this.externalTools = new Map();
    this.taskGrants = [];
  }

  /** Register server metadata without connecting or loading remote capabilities. */
  register(entries) {
    for (const entry of entries || []) {
      const configuration = normalizeServerConfiguration(entry);
      if (this.configurations.has(configuration.id)) throw new Error(`Duplicate external server id: ${configuration.id}`);
      this.configurations.set(configuration.id, configuration);
    }
  }

  /** Create a worker-owned manager with the same server metadata and no inherited grants or connections. */
  fork(request, emit = () => {}) {
    const manager = new McpConnectionManager(request, emit);
    manager.register(Array.from(this.configurations.values(), (configuration) => JSON.parse(JSON.stringify(configuration))));
    return manager;
  }

  /** Return connection-free server metadata for lazy discovery. */
  listServers() {
    return Array.from(this.configurations.values(), (configuration) => ({ id: configuration.id, name: configuration.name, description: configuration.description, transport: configuration.transport, connected: this.connections.has(configuration.id) }));
  }

  /** Connect one server after security validation and approval, then index offerings. */
  async connect(serverId) {
    if (this.connections.has(serverId)) return this.connections.get(serverId);
    const configuration = this.configurations.get(serverId);
    if (!configuration) throw new Error(`Unknown external server: ${serverId}`);
    this.emit({ type: "mcp-connecting", serverId });
    const approval = await authorizeTool(this.request, "mcp_server_connect", { serverId }, this.taskGrants);
    if (!approval.approved) throw new Error(`Connection to external server '${serverId}' was denied.`);
    const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const client = new Client({ name: "md-editor", version: String(this.request.appVersion || "0") });
    let transport;
    if (configuration.transport === "stdio") {
      const { StdioClientTransport } = await import("@modelcontextprotocol/client/stdio");
      const validated = await this.validateProcess(configuration);
      transport = new StdioClientTransport({ command: validated.executable, args: validated.args, cwd: validated.cwd, env: validated.environment, stderr: "pipe" });
    } else {
      if (this.request.securityContext?.policy?.execution?.networkAccess === false) throw new Error("External network access is disabled by the effective AI security policy.");
      transport = new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } });
    }
    try {
      await client.connect(transport);
      const connection = await this.indexConnection(configuration, client, transport);
      this.connections.set(serverId, connection);
      this.touch(connection);
      await this.audit(configuration, "connected");
      this.emit({ type: "mcp-ready", serverId, toolCount: connection.tools.size, resourceCount: connection.resources.length, promptCount: connection.prompts.length });
      return connection;
    } catch (error) {
      await client.close().catch(() => {});
      await this.audit(configuration, "connection-failed", { error: error?.message || String(error) });
      this.emit({ type: "mcp-failed", serverId, error: error?.message || String(error) });
      throw error;
    }
  }

  async validateProcess(configuration) {
    const policy = this.request.securityContext?.policy;
    if (!policy) throw new Error("An effective AI security policy is required to launch external servers.");
    const broker = new StructuredExecutionBroker();
    return broker.validateDescriptor({ workspaceRoot: this.request.workspaceRoot, cwd: resolveServerCwd(configuration, this.request.workspaceRoot), executable: configuration.command, args: configuration.args, environment: configuration.env }, policy);
  }

  async indexConnection(configuration, client, transport) {
    const [toolPage, resourcePage, promptPage] = await Promise.all([
      client.listTools().catch(() => ({ tools: [] })),
      client.listResources().catch(() => ({ resources: [] })),
      client.listPrompts().catch(() => ({ prompts: [] }))
    ]);
    const tools = new Map((toolPage.tools || []).map((tool) => [tool.name, tool]));
    return { configuration, client, transport, tools, resources: resourcePage.resources || [], prompts: promptPage.prompts || [], instructions: String(client.getInstructions?.() || "").slice(0, 12000), idleTimer: null };
  }

  /** Return namespaced model tool definitions for one connected server. */
  async getToolDefinitions(serverId) {
    return (await this.getToolRegistrations(serverId)).map((entry) => entry.definition);
  }

  /** Index one server while retaining each remote schema outside the provider roster. */
  async getToolRegistrations(serverId) {
    const connection = await this.connect(serverId);
    return Array.from(connection.tools.values(), (tool) => {
      const name = externalToolName(serverId, tool.name);
      this.externalTools.set(name, { serverId, toolName: tool.name });
      const description = String(tool.description || "External tool " + tool.name);
      return {
        definition: { type: "function", function: { name, description, parameters: tool.inputSchema || { type: "object", properties: {} } } },
        source: "external:" + serverId,
        domain: "external:" + serverId,
        description,
        searchHint: String(tool.title || tool.annotations?.title || ""),
        external: true,
        serverId,
        remoteName: tool.name,
        permissionScope: "external-server",
        executionOwner: "external",
        alwaysLoad: tool._meta?.["md-editor/alwaysLoad"] === true
      };
    });
  }

  /** Connect one server and retain its individual tool metadata outside provider requests. */
  async indexToolMetadata(serverId) { return this.getToolRegistrations(serverId); }

  /** Retrieve one exact namespaced definition without exposing sibling schemas. */
  async getToolDefinition(serverId, toolName) {
    const registrations = await this.getToolRegistrations(serverId);
    const requested = String(toolName || "");
    return registrations.find((entry) => entry.remoteName === requested || entry.definition.function.name === requested)?.definition || null;
  }

  /** Invoke a namespaced external tool through the approval gateway. */
  async invoke(namespacedName, args) {
    const parsed = this.externalTools.get(namespacedName);
    if (!parsed) throw new Error(`Unknown external tool: ${namespacedName}`);
    const connection = await this.connect(parsed.serverId);
    if (!connection.tools.has(parsed.toolName)) throw new Error(`Unknown external tool: ${namespacedName}`);
    const approval = await authorizeTool(this.request, "mcp_tool_invoke", { serverId: `${parsed.serverId}/${parsed.toolName}` }, this.taskGrants);
    if (!approval.approved) return { denied: true, message: "The external tool invocation was denied." };
    this.touch(connection);
    return connection.client.callTool({ name: parsed.toolName, arguments: args || {} });
  }

  /** Search indexed resource and prompt metadata without loading their contents. */
  async searchOfferings(serverId, query) {
    const connection = await this.connect(serverId);
    const needle = String(query || "").toLowerCase();
    const matches = (value) => !needle || JSON.stringify(value).toLowerCase().includes(needle);
    return { resources: connection.resources.filter(matches), prompts: connection.prompts.filter(matches), instructions: connection.instructions };
  }

  async readResource(serverId, uri) { const connection = await this.connect(serverId); this.touch(connection); return connection.client.readResource({ uri }); }
  async getPrompt(serverId, name, args) { const connection = await this.connect(serverId); this.touch(connection); return connection.client.getPrompt({ name, arguments: args || {} }); }

  touch(connection) {
    clearTimeout(connection.idleTimer);
    connection.idleTimer = setTimeout(() => { void this.close(connection.configuration.id); }, Number(this.request.mcpIdleMs || DEFAULT_IDLE_MS));
    connection.idleTimer.unref?.();
  }

  async close(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    this.connections.delete(serverId);
    clearTimeout(connection.idleTimer);
    if (connection.configuration.transport === "http") await connection.transport.terminateSession?.().catch(() => {});
    await connection.client.close().catch(() => {});
    this.emit({ type: "mcp-closed", serverId });
  }

  async closeAll() { await Promise.all(Array.from(this.connections.keys(), (id) => this.close(id))); }

  async audit(configuration, decision, extra = {}) {
    await this.request.securityContext?.auditLogger?.record({ timestamp: new Date().toISOString(), requestId: this.request.requestId, workspace: this.request.workspaceRoot, tool: "mcp_server_connect", serverId: configuration.id, transport: configuration.transport, decision, ...extra });
  }
}

function externalToolName(serverId, toolName) { return `mcp__${sanitize(serverId)}__${sanitize(toolName)}`; }
function sanitize(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64); }
module.exports = { McpConnectionManager, externalToolName };
