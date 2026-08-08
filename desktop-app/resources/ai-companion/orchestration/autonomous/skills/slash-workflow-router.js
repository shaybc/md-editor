/** Deterministic routing for exact user-authored slash workflow requests. */

"use strict";

const SLASH_PATTERN = /^\/([a-zA-Z0-9:_-]+)(?:\s+([\s\S]*))?$/;

class SlashWorkflowRouter {
  constructor(catalog, invocation, emit = () => {}) { this.catalog = catalog; this.invocation = invocation; this.emit = emit; }

  /** Parse only a complete leading slash workflow expression. */
  parse(prompt) {
    const match = String(prompt || "").trim().match(SLASH_PATTERN);
    return match ? { name: match[1].toLowerCase(), args: String(match[2] || "").trim() } : null;
  }

  /** Expand a trusted user slash invocation before the provider is called. */
  async expand(prompt) {
    const parsed = this.parse(prompt);
    if (!parsed) return null;
    return this.expandTrusted(parsed);
  }

  async expandTrusted(value) {
    const parsed = { name: String(value?.name || "").trim().toLowerCase(), args: value?.arguments ?? value?.args ?? "" };
    if (!parsed.name) return null;
    const resolved = this.catalog.resolve(parsed.name, { user: true });
    if (!resolved) {
      const error = new Error(`Unknown workflow: ${parsed.name}`);
      error.code = "UNKNOWN_SLASH_WORKFLOW";
      throw error;
    }
    const invocation = await this.invocation.invoke(resolved.definition.name, parsed.args, { trigger: "user-slash", user: true, context: this.context });
    this.emit({ type: "slash-workflow-expanded", name: resolved.definition.name, summary: `Workflow ${resolved.definition.name} expanded from the user command.` });
    return { ...parsed, invocation };
  }

  setContext(context) { this.context = context; return this; }
}

module.exports = { SLASH_PATTERN, SlashWorkflowRouter };
