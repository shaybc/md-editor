/**
 * Guided, workspace-scoped management for profile-owned agent approval grants.
 */
(function(window) {
  "use strict";

  function registerMarkdownViewerAiApprovalSettings(app, deps) {
    const elements = {
      list: document.getElementById("settings-ai-approval-rule-list"),
      empty: document.getElementById("settings-ai-approval-rule-empty"),
      status: document.getElementById("settings-ai-approval-policy-status"),
      source: document.getElementById("settings-ai-approval-effective-source"),
      advanced: document.getElementById("settings-ai-approval-rules-json"),
      refresh: document.getElementById("settings-ai-approval-refresh"),
      importApp: document.getElementById("settings-ai-approval-import-app"),
      importFolder: document.getElementById("settings-ai-approval-import-folder")
    };
    let currentDocument = { version: 2, rules: [] };
    let loading = false;
    let advancedDirty = false;

    function setStatus(message, isError) {
      if (!elements.status) return;
      elements.status.textContent = message || "";
      elements.status.classList.toggle("is-error", isError === true);
    }

    function formatTimestamp(value) {
      if (!value) return "Never";
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
    }

    async function replaceDocument(document, successMessage) {
      const workspaceRoot = deps.getWorkspaceRoot?.() || "";
      if (!workspaceRoot) throw new Error("Open a workspace before changing approval grants.");
      const result = await deps.bridge?.approvalGrantsReplace?.({ workspaceRoot, document });
      currentDocument = result || document;
      setStatus(successMessage || "Approval grants updated.");
      await refresh();
    }

    function renderRules(rules) {
      if (!elements.list) return;
      elements.list.replaceChildren();
      if (elements.empty) elements.empty.hidden = rules.length > 0;
      for (const rule of rules) {
        const row = document.createElement("div");
        row.className = "settings-ai-approval-rule";
        const copy = document.createElement("div");
        copy.className = "settings-ai-approval-rule-copy";
        const title = document.createElement("strong");
        title.textContent = rule.capability;
        const resource = document.createElement("code");
        resource.textContent = rule.matcher?.value || "";
        const metadata = document.createElement("span");
        metadata.textContent = `Source: profile · Workspace grant · Created ${formatTimestamp(rule.createdAt)} · Last used ${formatTimestamp(rule.lastUsedAt)}`;
        copy.append(title, resource, metadata);
        const controls = document.createElement("div");
        controls.className = "settings-ai-approval-rule-controls";
        const enabledLabel = document.createElement("label");
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = rule.enabled !== false;
        enabled.addEventListener("change", async () => {
          const documentValue = { ...currentDocument, rules: currentDocument.rules.map((item) => item.id === rule.id ? { ...item, enabled: enabled.checked } : item) };
          try { await replaceDocument(documentValue, enabled.checked ? "Approval grant enabled." : "Approval grant disabled."); }
          catch (error) { enabled.checked = !enabled.checked; setStatus(error?.message || String(error), true); }
        });
        enabledLabel.append(enabled, document.createTextNode(" Enabled"));
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "settings-secondary-button";
        revoke.textContent = "Revoke";
        revoke.addEventListener("click", async () => {
          if (!window.confirm(`Revoke ${rule.capability} for ${rule.matcher?.value || "this resource"}?`)) return;
          try {
            await deps.bridge?.approvalGrantRevoke?.({ workspaceRoot: deps.getWorkspaceRoot?.() || "", ruleId: rule.id });
            setStatus("Approval grant revoked.");
            await refresh();
          } catch (error) { setStatus(error?.message || String(error), true); }
        });
        controls.append(enabledLabel, revoke);
        row.append(copy, controls);
        elements.list.appendChild(row);
      }
    }

    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const workspaceRoot = deps.getWorkspaceRoot?.() || "";
        if (!workspaceRoot) {
          renderRules([]);
          setStatus("Open a workspace to manage project approval grants.");
          return;
        }
        const [documentValue, policy] = await Promise.all([
          deps.bridge?.approvalGrantsList?.({ workspaceRoot }),
          deps.bridge?.securityPolicyGet?.({ workspaceRoot })
        ]);
        currentDocument = documentValue || { version: 2, rules: [] };
        renderRules(Array.isArray(currentDocument.rules) ? currentDocument.rules : []);
        if (elements.advanced) elements.advanced.value = JSON.stringify({ version: 2, rules: currentDocument.rules || [] }, null, 2);
        advancedDirty = false;
        const managed = policy?.managed;
        if (elements.source) elements.source.textContent = managed?.found
          ? `Managed restrictions (locked): ${managed.path || managed.source || "enterprise policy"}`
          : `Profile-owned workspace rules: ${currentDocument.path || "profile storage"}`;
        const legacyByScope = Object.fromEntries((currentDocument.legacy || []).map((item) => [item.scope, item]));
        if (elements.importApp) {
          elements.importApp.disabled = !(legacyByScope.app?.writeRuleCount > 0);
          elements.importApp.textContent = `Review and import app rules (${legacyByScope.app?.writeRuleCount || 0})`;
        }
        if (elements.importFolder) {
          elements.importFolder.disabled = !(legacyByScope.folder?.writeRuleCount > 0);
          elements.importFolder.textContent = `Review and import folder rules (${legacyByScope.folder?.writeRuleCount || 0})`;
        }
        setStatus(policy?.error || "");
      } catch (error) {
        setStatus(error?.message || String(error), true);
      } finally {
        loading = false;
      }
    }

    async function importLegacy(scope) {
      if (!window.confirm("Import the legacy file-write patterns as profile-owned grants for this workspace? Review the resulting rules and revoke any you do not want.")) return;
      try {
        const result = await deps.bridge?.approvalLegacyImport?.({ workspaceRoot: deps.getWorkspaceRoot?.() || "", scope });
        setStatus(`Imported ${result?.imported || 0} legacy file-write rules.`);
        await refresh();
      } catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function saveAdvanced() {
      if (!elements.advanced) return;
      if (!(deps.getWorkspaceRoot?.() || "")) return;
      if (!advancedDirty) return;
      let parsed;
      try { parsed = JSON.parse(elements.advanced.value || "{}"); }
      catch (error) { throw new Error(`Approval grant JSON is invalid: ${error?.message || error}`); }
      if (parsed?.version !== 2 || !Array.isArray(parsed.rules)) throw new Error("Approval grant JSON must use version 2 and contain a rules array.");
      await replaceDocument(parsed, "Advanced approval grants saved.");
    }

    elements.refresh?.addEventListener("click", () => { void refresh(); });
    elements.advanced?.addEventListener("input", () => { advancedDirty = true; });
    elements.importApp?.addEventListener("click", () => { void importLegacy("app"); });
    elements.importFolder?.addEventListener("click", () => { void importLegacy("folder"); });
    const api = { refresh, saveAdvanced };
    app.registerModule("aiApprovalSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiApprovalSettings = registerMarkdownViewerAiApprovalSettings;
})(window);
