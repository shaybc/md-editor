(function(window) {
  "use strict";

  /**
   * Settings -> AI -> Experimental.
   *
   * Visual, deterministic toggles for internal AI Companion controller flags that
   * otherwise have no UI (they can only be changed via the preferences tool). Each
   * switch writes the flag directly to `aiCompanionSettings` — no model involved.
   *
   * deps:
   *  - getSettings(): current normalized AI Companion settings.
   *  - persistFlags(patch): merge a partial flag map into aiCompanionSettings and save.
   */
  const EXPERIMENTAL_FLAGS = [
    { key: "planStatefulControllerEnabled", label: "Plan stateful controller (M8)", description: "Run Plan mode through the shared stateful controller instead of the legacy path." },
    { key: "chatStatefulControllerEnabled", label: "Chat stateful controller (M9)", description: "Run Chat mode through the shared controller (seam only until M9.2+)." },
    { key: "intentContractsEnabled", label: "Intent contracts", description: "Extract intent/answer criteria. Required for groundedness verification." },
    { key: "chatVerifierCompletionEnabled", label: "Chat groundedness verification (M9.4)", description: "Verify answers against evidence. Requires the Chat controller and intent contracts." },
    { key: "chatProgressEvaluationEnabled", label: "Chat progress evaluation (M9.6)", description: "Detect progress / loops on the complex Chat route. Requires the Chat controller." },
    { key: "chatProgressControlEnabled", label: "Chat progress control (M9.6)", description: "Force strategy revision on stalls. Requires progress evaluation + verification." },
    { key: "chatDurableRecoveryEnabled", label: "Chat durable recovery (M9.7)", description: "Checkpoint/restart recovery for long complex Chat turns. Requires the Chat controller." },
    { key: "intentProvenanceBoundaryEnabled", label: "Intent provenance boundary (M11.1)", description: "Keep the active file / open tabs as supporting context only — never a required inspection target unless you named it." },
    { key: "taskProfileRoutingEnabled", label: "Task-profile routing (M11.2)", description: "For a clearly-typed task (e.g. a preferences update), restrict the tool surface to that task's tools. Requires the Agent decision controller." }
  ];

  function registerMarkdownViewerAiCompanionExperimentalSettings(app, deps = {}) {
    const grid = document.getElementById("settings-ai-experimental-grid");
    if (!grid) return null;

    function currentSettings() {
      try { return deps.getSettings ? deps.getSettings() : {}; } catch (_error) { return {}; }
    }

    function row(flag, value) {
      const label = document.createElement("label");
      label.className = "settings-switch-row";
      const text = document.createElement("span");
      const title = document.createElement("span");
      title.className = "settings-switch-title";
      title.textContent = flag.label;
      const desc = document.createElement("span");
      desc.className = "settings-switch-description";
      desc.textContent = flag.description;
      text.appendChild(title);
      text.appendChild(desc);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "settings-switch-input";
      input.checked = value === true;
      input.addEventListener("change", () => {
        if (typeof deps.persistFlags === "function") deps.persistFlags({ [flag.key]: input.checked });
      });
      const track = document.createElement("span");
      track.className = "settings-switch";
      track.setAttribute("aria-hidden", "true");

      label.appendChild(text);
      label.appendChild(input);
      label.appendChild(track);
      return label;
    }

    function render() {
      const settings = currentSettings();
      grid.replaceChildren();
      EXPERIMENTAL_FLAGS.forEach((flag) => grid.appendChild(row(flag, settings[flag.key])));
    }

    render();
    const api = { render, EXPERIMENTAL_FLAGS };
    app.registerModule?.("aiCompanionExperimentalSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionExperimentalSettings = registerMarkdownViewerAiCompanionExperimentalSettings;
})(window);
