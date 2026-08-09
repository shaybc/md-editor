/** Resolves and invokes trusted persistent extension commands. */

"use strict";

const { executeTool } = require("../tool-executor");
const { authorizeTool } = require("../approval-gateway");

class ExtensionCommandCatalog {
  constructor(fabric, options = {}) {
    this.fabric = fabric;
    this.mode = String(options.mode || "agent");
    this.applicationActions = options.applicationActions;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.commands = new Map();
    this.aliases = new Map();
    this.errors = [];
  }

  /** Index mode-compatible command metadata and reject ambiguous names. */
  load() {
    for (const entry of Array.from(this.fabric.entries.values()).filter((item) => item.kind === "command")) {
      const command = entry.metadata;
      if (!command.allowedModes.includes(this.mode)) continue;
      if (this.commands.has(command.id)) { this.errors.push({ id: entry.id, error: `Command '${command.id}' is ambiguous.` }); continue; }
      const record = { ...command, extensionEntryId: entry.id, extensionId: entry.extensionId };
      this.commands.set(command.id, record);
      for (const alias of command.aliases) {
        if (this.commands.has(alias) || this.aliases.has(alias)) { this.aliases.delete(alias); this.errors.push({ id: entry.id, error: `Command alias '${alias}' is ambiguous.` }); }
        else this.aliases.set(alias, record);
      }
    }
    const commands = this.list();
    this.emit({ type: "extension-commands-discovered", commands, count: commands.length, summary: `${commands.length} extension command(s) discovered.` });
    for (const issue of this.errors) this.emit({ type: "extension-capability-unavailable", ...issue, summary: issue.error });
    return commands;
  }

  /** Return composer-safe command metadata. */
  list() { return Array.from(this.commands.values(), ({ extensionEntryId, name, ...entry }) => ({ ...entry, name: entry.id, displayName: name })); }

  /** Resolve one canonical command name or unambiguous alias. */
  resolve(name) { const key = String(name || "").trim().toLowerCase(); return this.commands.get(key) || this.aliases.get(key) || null; }

  /** Execute deterministic command behavior through existing secured runtime paths. */
  async invoke(command, argumentsText, context) {
    if (!command?.id) throw unavailable("The requested extension command is unavailable.");
    const current = this.resolve(command.id);
    if (!current) throw unavailable(`Extension command '${command.id}' is no longer available.`);
    const activated = await this.fabric.activate(current.extensionEntryId);
    const args = String(argumentsText || "");
    if (current.type === "prompt") return { promptExpansion: expandPrompt(activated.body, args) };
    if (current.type === "workflow") return { invocation: await context.skillInvocation.invoke(current.target, args, { trigger: "extension-command", user: true, context }) };
    if (current.type === "tool") {
      await context.capabilities.search(`select:${current.target}`);
      return { result: await executeTool({ id: `command-${current.id}`, type: "function", function: { name: current.target, arguments: commandArguments(args) } }, context) };
    }
    if (!this.applicationActions.describe(current.target)) {
      const registration = context.capabilities.registration(current.target);
      if (registration?.executionOwner !== "application") throw unavailable(`MD-Editor action '${current.target}' is not registered.`);
      await context.capabilities.search(`select:${current.target}`);
      return { result: await executeTool({ id: `command-${current.id}`, type: "function", function: { name: current.target, arguments: commandArguments(args) } }, context) };
    }
    const approval = await authorizeTool(context.request, "extension_tool_invoke", { extensionCommand: current.id, extensionId: current.extensionId, requiredCapability: current.requiredCapability, arguments: args, action: current.target }, context.taskGrants, { permissionPolicy: context.permissionPolicy, denialLedger: context.denialLedger, riskAdvisor: context.riskAdvisor });
    if (!approval.approved) throw unavailable(approval.instructions || "The user denied this command.");
    return { result: await this.applicationActions.invoke(current.target, { arguments: args }, context) };
  }
}

function commandArguments(value) { const text = String(value || "").trim(); if (!text) return "{}"; try { return JSON.stringify(JSON.parse(text)); } catch (_error) { return JSON.stringify({ arguments: text }); } }
function expandPrompt(body, args) { const instructions = String(body || "").trim(); return instructions.replace(/\$ARGUMENTS\b/g, args).replace(/\{\{arguments\}\}/g, args); }
function unavailable(message) { const error = new Error(message); error.code = "EXTENSION_COMMAND_UNAVAILABLE"; error.doNotRetry = true; return error; }

module.exports = { ExtensionCommandCatalog };
