/** Builds lazy capability registrations from trusted persistent tool descriptors. */

"use strict";

class ExtensionToolRegistry {
  constructor(fabric, options = {}) {
    this.fabric = fabric;
    this.mode = String(options.mode || "agent");
    this.prohibited = new Set((options.prohibitedNames || []).map(String));
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.errors = [];
  }

  /** Return deferred capability registrations without executing extension code. */
  registrations() {
    const registrations = [];
    const names = new Set(this.prohibited);
    for (const entry of Array.from(this.fabric.entries.values()).filter((item) => item.kind === "tool")) {
      const tool = entry.metadata;
      if (!tool.allowedModes.includes(this.mode)) continue;
      if (names.has(tool.name)) { this.errors.push({ id: entry.id, error: `Tool name '${tool.name}' conflicts with an existing capability.` }); continue; }
      names.add(tool.name);
      const bundle = this.fabric.bundles.find((candidate) => candidate.id === entry.extensionId);
      registrations.push({
        definition: { type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } },
        source: `extension:${entry.extensionId}`,
        domain: tool.domain,
        displayName: tool.displayName,
        description: tool.description,
        searchHint: tool.searchHint,
        requiredCapability: tool.requiredCapability,
        permissionScope: tool.permissionScope,
        allowedModes: tool.allowedModes,
        executionOwner: "persistent-extension",
        alwaysLoad: tool.alwaysLoad,
        rulePaths: tool.rulePaths,
        adapter: tool.adapter,
        extensionId: entry.extensionId,
        extensionDigest: bundle?.digest || "",
        timeoutMs: tool.timeoutMs,
        maxOutputBytes: tool.maxOutputBytes
      });
    }
    for (const entry of Array.from(this.fabric.entries.values()).filter((item) => item.kind === "command" && item.metadata.modelInvocable === true)) {
      const command = entry.metadata;
      if (!command.allowedModes.includes(this.mode)) continue;
      const name = `command_${command.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      if (names.has(name)) { this.errors.push({ id: entry.id, error: `Model command name '${name}' conflicts with an existing capability.` }); continue; }
      names.add(name);
      const bundle = this.fabric.bundles.find((candidate) => candidate.id === entry.extensionId);
      registrations.push({
        definition: { type: "function", function: { name, description: command.description, parameters: { type: "object", properties: { arguments: { type: "string", description: command.argumentHint || "Command arguments." } }, additionalProperties: false } } },
        source: `extension:${entry.extensionId}`, domain: "extension-command", description: command.description,
        searchHint: `${command.id} ${command.aliases.join(" ")}`, requiredCapability: command.requiredCapability,
        allowedModes: command.allowedModes, executionOwner: "persistent-extension",
        adapter: { type: "extension-command", target: command.id }, extensionId: entry.extensionId,
        extensionDigest: bundle?.digest || "", timeoutMs: 30000, maxOutputBytes: 262144
      });
    }
    for (const issue of this.errors) this.emit({ type: "extension-capability-unavailable", ...issue, summary: issue.error });
    return registrations;
  }

  /** Return compact discoverable metadata for extension search. */
  metadata() {
    return Array.from(this.fabric.entries.values()).filter((entry) => entry.kind === "tool" || (entry.kind === "command" && entry.metadata.modelInvocable === true)).map((entry) => ({ id: entry.id, kind: entry.kind, name: entry.metadata.name, description: entry.metadata.description, extensionId: entry.extensionId }));
  }
}

module.exports = { ExtensionToolRegistry };
