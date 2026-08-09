/** User-selected permission mode decisions below immutable security boundaries. */

"use strict";

const PERMISSION_MODES = Object.freeze(["guided", "observe-only", "edit-trusted", "risk-routed", "preauthorized-only", "sandbox-unattended"]);

class PermissionModePolicy {
  constructor(mode = "guided", effectiveSecurityPolicy = {}) {
    this.mode = PERMISSION_MODES.includes(mode) ? mode : "guided";
    this.effectiveSecurityPolicy = effectiveSecurityPolicy || {};
  }

  /** Resolve the mode default after managed rules and explicit grants were checked. */
  async resolve(descriptor, context = {}) {
    const capability = String(descriptor?.capability || "");
    const isFileEdit = capability === "workspace.file.write";
    const isCommand = capability === "shell.freeform";
    if (this.mode === "observe-only") return deny("Permission mode allows observation only.");
    if (this.mode === "preauthorized-only") return deny("Permission mode permits only actions covered by an explicit grant.");
    if (this.mode === "edit-trusted" && isFileEdit) return allow("Non-destructive workspace edits are trusted in this mode.");
    if (isCommand && context.autoRunCommands === true && context.commandAnalysis?.canAutoRun === true) return allow("The command was structurally proven read-only.");
    if (this.mode === "sandbox-unattended") {
      const enabled = this.effectiveSecurityPolicy?.approvals?.allowUnattended === true;
      return enabled ? allow("Managed policy permits unattended actions in this sandbox.") : deny("Managed policy has not enabled unattended actions.");
    }
    if (this.mode === "risk-routed" && context.riskAdvisor) return context.riskAdvisor.evaluate(descriptor, context);
    return { decision: "prompt", reason: "This action requires user confirmation." };
  }
}

function allow(reason) { return { decision: "allow", automatic: true, reason }; }
function deny(reason) { return { decision: "deny", reason, doNotRetry: true }; }

module.exports = { PERMISSION_MODES, PermissionModePolicy };
