/** Extension discovery, enablement, and workspace trust settings. */
(function(window) {
  "use strict";

  function registerMarkdownViewerAiExtensionSettings(app, deps) {
    const list = document.getElementById("settings-ai-extension-list");
    const empty = document.getElementById("settings-ai-extension-empty");
    const status = document.getElementById("settings-ai-extension-status");
    const refreshButton = document.getElementById("settings-ai-extension-refresh");

    function setStatus(message, isError) {
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("is-error", isError === true);
    }

    async function configure(bundle, patch) {
      setStatus(`Updating ${bundle.name}...`);
      try {
        await deps.bridge.extensionConfigure({ workspaceRoot: deps.getWorkspaceRoot?.() || "", id: bundle.id, ...patch });
        await refresh();
      } catch (error) {
        setStatus(error?.message || String(error), true);
      }
    }

    function render(snapshot) {
      if (!list) return;
      list.replaceChildren();
      const bundles = Array.isArray(snapshot?.bundles) ? snapshot.bundles : [];
      if (empty) empty.hidden = bundles.length > 0;
      for (const bundle of bundles) {
        const row = document.createElement("div");
        row.className = "settings-switch-row";
        const copy = document.createElement("span");
        copy.innerHTML = `<span class="settings-switch-title"></span><span class="settings-switch-description"></span>`;
        copy.children[0].textContent = bundle.name;
        copy.children[1].textContent = `${bundle.scope} · ${bundle.contributionCount} contributions${bundle.trusted ? " · trusted" : " · trust required"}`;
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "settings-switch-input";
        enabled.checked = bundle.enabled === true;
        enabled.addEventListener("change", () => void configure(bundle, { enabled: enabled.checked }));
        row.append(copy, enabled);
        if (bundle.scope === "workspace" && !bundle.trusted) {
          const trust = document.createElement("button");
          trust.type = "button";
          trust.className = "settings-secondary-button";
          trust.textContent = "Trust workspace bundle";
          trust.addEventListener("click", () => void configure(bundle, { trusted: true, enabled: true }));
          row.append(trust);
        }
        list.append(row);
      }
      const errors = Array.isArray(snapshot?.errors) ? snapshot.errors : [];
      setStatus(errors.length ? `${errors.length} extension item(s) could not be loaded.` : `${bundles.length} extension bundle(s) discovered.`, errors.length > 0);
    }

    async function refresh() {
      if (!deps.bridge?.extensionsList) return;
      setStatus("Discovering extensions...");
      try {
        render(await deps.bridge.extensionsList({ workspaceRoot: deps.getWorkspaceRoot?.() || "" }));
      } catch (error) {
        setStatus(error?.message || String(error), true);
      }
    }

    refreshButton?.addEventListener("click", () => void refresh());
    const api = { refresh };
    app.registerModule?.("aiExtensionSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiExtensionSettings = registerMarkdownViewerAiExtensionSettings;
})(window);
