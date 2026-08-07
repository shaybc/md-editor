(function(window) {
  "use strict";

  /**
   * Settings -> AI -> Tool Access.
   *
   * One section per domain: a centered uppercase "<DOMAIN> TOOLS" title with a
   * master switch (flip to enable/disable every tool in the domain), then each
   * tool grouped into Read and Write. Every tool row shows the friendly label, the
   * real tool name in parentheses, an (i) info button with a hover tooltip, and its
   * own switch. Read and write rows use distinct row backgrounds. Colors come from
   * theme CSS variables so they follow light/dark and the selected theme.
   *
   * deps:
   *  - getToolScopes(): current normalized per-tool allow-list.
   *  - persistToolScopes(map): save a full per-tool allow-list.
   */
  function registerMarkdownViewerAiCompanionToolAccessSettings(app, deps = {}) {
    const registry = window.MarkdownViewerAiCompanionToolScopes;
    const grid = document.getElementById("settings-ai-tool-access-grid");
    const emptyNotice = document.getElementById("settings-ai-tool-access-empty");
    if (!grid) return null;
    if (!registry || typeof registry.getDomainToolGroups !== "function") {
      if (emptyNotice) emptyNotice.hidden = false;
      return null;
    }

    const groups = registry.getDomainToolGroups();
    let state = readState();
    const tooltip = ensureTooltip();

    function readState() {
      try {
        return registry.normalizeToolScopes(deps.getToolScopes ? deps.getToolScopes() : {});
      } catch (_error) {
        return registry.defaultToolScopes();
      }
    }

    function persist() {
      if (typeof deps.persistToolScopes === "function") deps.persistToolScopes({ ...state });
    }

    function ensureTooltip() {
      let el = document.getElementById("settings-ai-tool-access-tooltip");
      if (!el) {
        el = document.createElement("div");
        el.id = "settings-ai-tool-access-tooltip";
        el.className = "settings-ai-tool-access-tooltip";
        el.setAttribute("role", "tooltip");
        el.hidden = true;
        document.body.appendChild(el);
      }
      return el;
    }

    function showTooltip(anchor, text) {
      if (!text) return;
      tooltip.textContent = text;
      tooltip.hidden = false;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      // Prefer below the icon; flip above if it would overflow the viewport.
      let top = rect.bottom + margin;
      const maxWidth = Math.min(320, window.innerWidth - 24);
      tooltip.style.maxWidth = `${maxWidth}px`;
      let left = Math.min(Math.max(12, rect.left), window.innerWidth - maxWidth - 12);
      if (top + tooltip.offsetHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - margin - tooltip.offsetHeight);
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function hideTooltip() { tooltip.hidden = true; }

    function makeSwitch(checked, onChange, { indeterminate = false, disabled = false } = {}) {
      const label = document.createElement("label");
      label.className = "settings-switch-row settings-ai-tool-access-switch" + (disabled ? " is-disabled" : "");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "settings-switch-input";
      input.checked = checked === true;
      input.indeterminate = indeterminate === true;
      input.disabled = disabled === true;
      if (!disabled) input.addEventListener("change", () => onChange(input.checked));
      const track = document.createElement("span");
      track.className = "settings-switch";
      track.setAttribute("aria-hidden", "true");
      label.appendChild(input);
      label.appendChild(track);
      return label;
    }

    function makeInfo(entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-ai-tool-access-info";
      button.textContent = "i";
      // Opt out of the settings framework's native-title tooltip; this button shows
      // its own custom tooltip instead (avoids the small overlapping "i" tooltip).
      button.dataset.nativeTooltip = "off";
      const text = entry.description || entry.label;
      button.addEventListener("mouseenter", () => showTooltip(button, text));
      button.addEventListener("mouseleave", hideTooltip);
      button.addEventListener("focus", () => showTooltip(button, text));
      button.addEventListener("blur", hideTooltip);
      return button;
    }

    function toolRow(entry, kind, options = {}) {
      const readOnly = options.readOnly === true;
      const row = document.createElement("div");
      row.className = `settings-ai-tool-access-tool-row settings-ai-tool-access-tool-row--${kind}`;
      const label = document.createElement("span");
      label.className = "settings-ai-tool-access-tool-label";
      const friendly = document.createElement("span");
      friendly.className = "settings-ai-tool-access-tool-name";
      friendly.textContent = entry.label;
      const raw = document.createElement("span");
      raw.className = "settings-ai-tool-access-tool-id";
      raw.textContent = `(${entry.name})`;
      label.appendChild(friendly);
      label.appendChild(raw);

      const controls = document.createElement("div");
      controls.className = "settings-ai-tool-access-tool-controls";
      controls.appendChild(makeSwitch(
        readOnly ? true : state[entry.name] === true,
        (checked) => { state[entry.name] = checked; persist(); render(); },
        { disabled: readOnly }
      ));
      controls.appendChild(makeInfo(entry));

      row.appendChild(label);
      row.appendChild(controls);
      return row;
    }

    function subgroup(title, entries, kind, options) {
      if (!entries.length) return null;
      const wrap = document.createElement("div");
      wrap.className = "settings-ai-tool-access-subgroup";
      const heading = document.createElement("p");
      heading.className = "settings-ai-tool-access-subgroup-title";
      heading.textContent = title;
      wrap.appendChild(heading);
      entries.forEach((entry) => wrap.appendChild(toolRow(entry, kind, options)));
      return wrap;
    }

    function headerControls(masterSwitch) {
      const wrap = document.createElement("div");
      wrap.className = "settings-ai-tool-access-tool-controls";
      wrap.appendChild(masterSwitch);
      const spacer = document.createElement("span");
      spacer.className = "settings-ai-tool-access-info settings-ai-tool-access-info--spacer";
      spacer.setAttribute("aria-hidden", "true");
      wrap.appendChild(spacer);
      return wrap;
    }

    function renderCoreSection() {
      if (typeof registry.getCoreToolGroup !== "function") return null;
      const core = registry.getCoreToolGroup();
      const section = document.createElement("section");
      section.className = "settings-ai-tool-access-domain-section settings-ai-tool-access-core-section";

      const header = document.createElement("div");
      header.className = "settings-ai-tool-access-domain-header";
      const title = document.createElement("h4");
      title.className = "settings-ai-tool-access-domain-title";
      title.textContent = "Core Tools";
      header.appendChild(title);
      // Always on and locked: a checked, disabled master for visual consistency.
      header.appendChild(headerControls(makeSwitch(true, () => {}, { disabled: true })));
      section.appendChild(header);

      const note = document.createElement("p");
      note.className = "settings-ai-tool-access-core-note";
      note.textContent = "Always available (editing is governed by mode). Shown for reference — these can't be changed.";
      section.appendChild(note);

      const readGroup = subgroup("Read", core.read, "read", { readOnly: true });
      const writeGroup = subgroup("Write", core.write, "write", { readOnly: true });
      if (readGroup) section.appendChild(readGroup);
      if (writeGroup) section.appendChild(writeGroup);
      return section;
    }

    function render() {
      hideTooltip();
      grid.replaceChildren();
      for (const domain of groups) {
        const tools = [...domain.read, ...domain.write].map((entry) => entry.name);
        const enabledCount = tools.filter((name) => state[name] === true).length;
        const allOn = tools.length > 0 && enabledCount === tools.length;
        const allOff = enabledCount === 0;

        const section = document.createElement("section");
        section.className = "settings-ai-tool-access-domain-section" + (allOff ? " is-all-off" : "");

        const header = document.createElement("div");
        header.className = "settings-ai-tool-access-domain-header";
        const title = document.createElement("h4");
        title.className = "settings-ai-tool-access-domain-title";
        title.textContent = `${domain.label} Tools`;
        header.appendChild(title);
        // Master switch sits in the same switch+info column as the tool rows (with
        // an empty info slot) so every switch lines up vertically.
        header.appendChild(headerControls(makeSwitch(allOn, (checked) => {
          tools.forEach((name) => { state[name] = checked; });
          persist();
          render();
        }, { indeterminate: !allOn && !allOff })));
        section.appendChild(header);

        const readGroup = subgroup("Read", domain.read, "read");
        const writeGroup = subgroup("Write", domain.write, "write");
        if (readGroup) section.appendChild(readGroup);
        if (writeGroup) section.appendChild(writeGroup);
        grid.appendChild(section);
      }
      // Core tools always render last, as a read-only reference group.
      const coreSection = renderCoreSection();
      if (coreSection) grid.appendChild(coreSection);
    }

    if (typeof window.setTimeout === "function") {
      window.setTimeout(render, 0);
    } else {
      render();
    }
    const api = { render, refresh() { state = readState(); render(); } };
    app.registerModule?.("aiCompanionToolAccessSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionToolAccessSettings = registerMarkdownViewerAiCompanionToolAccessSettings;
})(window);
