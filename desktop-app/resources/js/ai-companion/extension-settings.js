/** Extension discovery, authoring, enablement, trust, and recovery settings. */
(function(window, document) {
  "use strict";

  function registerMarkdownViewerAiExtensionSettings(app, deps) {
    const list = document.getElementById("settings-ai-extension-list");
    const empty = document.getElementById("settings-ai-extension-empty");
    const status = document.getElementById("settings-ai-extension-status");
    const refreshButton = document.getElementById("settings-ai-extension-refresh");
    const createButton = document.getElementById("settings-ai-extension-create");
    const restoreButton = document.getElementById("settings-ai-extension-restore");
    const editor = window.MarkdownViewerAiExtensionEditor?.create?.({ bridge: deps.bridge, onSaved: refresh });
    let snapshot = { bundles: [], errors: [] };

    function requestBase() { return { workspaceRoot: deps.getWorkspaceRoot?.() || "" }; }
    function setStatus(message, isError) { if (!status) return; status.textContent = message || ""; status.classList.toggle("is-error", isError === true); }

    async function configure(bundle, patch) {
      setStatus(`Updating ${bundle.name}...`);
      try { await deps.bridge.extensionConfigure({ ...requestBase(), id: bundle.id, ...patch }); await refresh(); }
      catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function openBundle(bundle) {
      setStatus(`Loading ${bundle.name}...`);
      try {
        const value = await deps.bridge.extensionRead({ ...requestBase(), scope: bundle.scope, id: bundle.id });
        editor?.open({ ...value, readOnly: bundle.scope === "bundled" });
        setStatus("");
      } catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function duplicateBundle(bundle) {
      const newId = window.prompt("Enter the new extension ID:", `${bundle.id}-copy`);
      if (!newId) return;
      try { await deps.bridge.extensionDuplicate({ ...requestBase(), scope: bundle.scope, id: bundle.id, targetScope: bundle.scope === "workspace" ? "workspace" : "user", newId }); await refresh(); }
      catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function exportBundle(bundle) {
      try {
        const destination = await window.Neutralino?.os?.showFolderDialog?.("Choose extension export folder");
        if (!destination) return;
        const result = await deps.bridge.extensionExport({ ...requestBase(), scope: bundle.scope, id: bundle.id, destination });
        setStatus(`Exported ${bundle.name} to ${result.path}.`);
      } catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function trashBundle(bundle) {
      const typed = window.prompt(`Type ${bundle.id} to move this extension to recoverable storage:`);
      if (typed !== bundle.id) { if (typed != null) setStatus("Extension ID did not match; nothing was deleted.", true); return; }
      try { await deps.bridge.extensionTrash({ ...requestBase(), scope: bundle.scope, id: bundle.id }); await refresh(); }
      catch (error) { setStatus(error?.message || String(error), true); }
    }

    function render(value) {
      snapshot = value || { bundles: [], errors: [] };
      if (!list) return;
      list.replaceChildren();
      const bundles = Array.isArray(snapshot.bundles) ? snapshot.bundles : [];
      if (empty) empty.hidden = bundles.length > 0 || (snapshot.errors?.length || 0) > 0;
      for (const bundle of bundles) list.append(bundleRow(bundle));
      for (const diagnostic of (snapshot.errors || [])) list.append(errorRow(diagnostic));
      const errors = Array.isArray(snapshot.errors) ? snapshot.errors : [];
      setStatus(errors.length ? `${bundles.length} extension bundle(s) loaded; ${errors.length} item(s) need attention.` : `${bundles.length} extension bundle(s) discovered.`, false);
    }

    function bundleRow(bundle) {
      const row = document.createElement("div"); row.className = "settings-table-row settings-ai-extension-row"; row.setAttribute("role", "row");
      const identity = document.createElement("span"); identity.className = "settings-ai-extension-identity";
      const name = document.createElement("strong"); name.textContent = bundle.name;
      const id = document.createElement("small"); id.textContent = bundle.id;
      identity.append(name, id);
      const version = cell(bundle.version);
      const scope = cell(bundle.scope === "user" ? "profile" : bundle.scope);
      const counts = bundle.contributionCounts || {};
      const contributions = cell([counts.skill && `${counts.skill} skills`, counts.agent && `${counts.agent} agents`, counts.hook && `${counts.hook} hooks`, counts["mcp-server"] && `${counts["mcp-server"]} servers`].filter(Boolean).join(", ") || "None");
      const access = document.createElement("span"); access.className = "settings-ai-extension-access";
      const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.className = "settings-switch-input"; toggle.checked = bundle.enabled === true; toggle.setAttribute("aria-label", `Enable ${bundle.name}`); toggle.addEventListener("change", () => void configure(bundle, { enabled: toggle.checked })); access.append(toggle);
      if (bundle.scope === "workspace") { const trust = button(bundle.trusted ? "bi-shield-check" : "bi-shield-exclamation", bundle.trusted ? "Workspace trusted" : "Trust workspace extension", () => void configure(bundle, { trusted: !bundle.trusted, enabled: !bundle.trusted || bundle.enabled })); trust.classList.toggle("is-active", bundle.trusted); access.append(trust); }
      const actions = document.createElement("span"); actions.className = "settings-table-actions";
      actions.append(button(bundle.scope === "bundled" ? "bi-eye" : "bi-pencil", bundle.scope === "bundled" ? "View" : "Edit", () => void openBundle(bundle)), button("bi-copy", "Duplicate", () => void duplicateBundle(bundle)), button("bi-box-arrow-up", "Export", () => void exportBundle(bundle)));
      if (bundle.scope !== "bundled") actions.append(button("bi-trash", "Delete", () => void trashBundle(bundle)));
      row.append(identity, version, scope, contributions, access, actions); return row;
    }

    function errorRow(diagnostic) {
      const row = document.createElement("div"); row.className = "settings-table-row settings-ai-extension-row is-invalid"; row.setAttribute("role", "row");
      const identity = document.createElement("span"); identity.className = "settings-ai-extension-identity"; const name = document.createElement("strong"); name.textContent = diagnostic.id || "Invalid extension"; const detail = document.createElement("small"); detail.textContent = diagnostic.error || "The bundle could not be loaded."; identity.append(name, detail);
      row.append(identity, cell("—"), cell(diagnostic.scope || "unknown"), cell("Validation failed"), cell("Unavailable"), cell("Repair the files, then refresh")); return row;
    }

    async function refresh() {
      if (!deps.bridge?.extensionsList) return;
      setStatus("Discovering extensions...");
      try { render(await deps.bridge.extensionsList(requestBase())); }
      catch (error) { setStatus(error?.message || String(error), true); }
    }

    async function restore() {
      try {
        const recoveries = [...await deps.bridge.extensionTrashList({ ...requestBase(), scope: "user" }), ...await deps.bridge.extensionTrashList({ ...requestBase(), scope: "workspace" })];
        if (!recoveries.length) { setStatus("No deleted extensions are available to restore."); return; }
        const menu = recoveries.map((entry, index) => `${index + 1}. ${entry.id} (${entry.scope === "user" ? "profile" : entry.scope})`).join("\n");
        const selected = Number(window.prompt(`Choose an extension to restore:\n${menu}`, "1")) - 1;
        if (!recoveries[selected]) return;
        await deps.bridge.extensionRestore({ ...requestBase(), ...recoveries[selected] }); await refresh();
      } catch (error) { setStatus(error?.message || String(error), true); }
    }

    refreshButton?.addEventListener("click", () => void refresh());
    createButton?.addEventListener("click", () => editor?.open({ scope: "user" }));
    restoreButton?.addEventListener("click", () => void restore());
    const api = { refresh, snapshot: () => snapshot };
    app.registerModule?.("aiExtensionSettings", api);
    return api;
  }

  function cell(value) { const element = document.createElement("span"); element.textContent = value; return element; }
  function button(icon, label, handler) { const element = document.createElement("button"); element.type = "button"; element.className = "settings-table-action"; element.title = label; element.setAttribute("aria-label", label); element.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`; element.addEventListener("click", handler); return element; }

  window.registerMarkdownViewerAiExtensionSettings = registerMarkdownViewerAiExtensionSettings;
})(window, document);
