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
    // Agent-mode controller (M4–M7). These govern Agent runs — the progress flags are
    // what curb a weak model's redundant searching / wandering on open-ended tasks.
    { key: "agentDecisionControllerEnabled", label: "Agent decision controller (M4)", description: "Run Agent mode through the typed next-action controller (one governed decision per step)." },
    { key: "agentVerifierCompletionEnabled", label: "Agent completion verification (M5)", description: "Verify the Agent's completion against evidence before returning. Requires the Agent controller." },
    { key: "agentProgressEvaluationEnabled", label: "Agent progress evaluation (M6)", description: "Detect no-progress / loops (e.g. repeated searches). Requires the Agent controller." },
    { key: "agentProgressControlEnabled", label: "Agent progress control (M6)", description: "Force a strategy change or stop when the Agent stalls. Requires Agent progress evaluation." },
    { key: "agentDurableRecoveryEnabled", label: "Agent durable recovery (M7)", description: "Checkpoint/restart recovery for long Agent runs. Requires the Agent controller." },
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

  // Direct prerequisites per flag. Turning a flag ON also turns on its (transitive)
  // prerequisites; turning a flag OFF also turns off anything that depends on it. This
  // mirrors the runtime validation in modes/agent + companion-mode-policy so a switch can
  // never be left in a combination that fails at run time.
  const DEPENDENCIES = Object.freeze({
    agentVerifierCompletionEnabled: ["agentDecisionControllerEnabled", "intentContractsEnabled"],
    agentProgressEvaluationEnabled: ["agentDecisionControllerEnabled", "intentContractsEnabled"],
    agentProgressControlEnabled: ["agentProgressEvaluationEnabled", "agentVerifierCompletionEnabled"],
    agentDurableRecoveryEnabled: ["agentDecisionControllerEnabled"],
    taskProfileRoutingEnabled: ["agentDecisionControllerEnabled"],
    intentProvenanceBoundaryEnabled: ["intentContractsEnabled"],
    chatVerifierCompletionEnabled: ["chatStatefulControllerEnabled", "intentContractsEnabled"],
    chatProgressEvaluationEnabled: ["chatStatefulControllerEnabled"],
    chatProgressControlEnabled: ["chatProgressEvaluationEnabled", "chatVerifierCompletionEnabled"],
    chatDurableRecoveryEnabled: ["chatStatefulControllerEnabled"]
  });

  /** All transitive prerequisites of a flag. */
  function collectPrerequisites(key, acc = new Set()) {
    for (const dep of DEPENDENCIES[key] || []) {
      if (!acc.has(dep)) { acc.add(dep); collectPrerequisites(dep, acc); }
    }
    return acc;
  }

  /** All flags that (transitively) depend on the given flag. */
  function collectDependents(key, acc = new Set()) {
    for (const [flagKey, prereqs] of Object.entries(DEPENDENCIES)) {
      if (prereqs.includes(key) && !acc.has(flagKey)) { acc.add(flagKey); collectDependents(flagKey, acc); }
    }
    return acc;
  }

  /** Build the settings patch for a toggle, cascading prerequisites (on) or dependents (off). */
  function buildCascadePatch(key, checked) {
    const patch = { [key]: checked };
    if (checked) for (const dep of collectPrerequisites(key)) patch[dep] = true;
    else for (const dependent of collectDependents(key)) patch[dependent] = false;
    return patch;
  }

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
        // Cascade prerequisites (on) / dependents (off), persist the whole patch, then
        // re-render so every affected switch reflects the new state.
        if (typeof deps.persistFlags === "function") deps.persistFlags(buildCascadePatch(flag.key, input.checked));
        render();
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
    if (typeof window.setTimeout === "function") {
      window.setTimeout(render, 0);
    } else {
      render();
    }

    const api = { render, EXPERIMENTAL_FLAGS };
    app.registerModule?.("aiCompanionExperimentalSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionExperimentalSettings = registerMarkdownViewerAiCompanionExperimentalSettings;
  // Exposed for tests / reuse: the dependency graph and cascade helper.
  window.MarkdownViewerAiCompanionExperimentalCascade = { DEPENDENCIES, buildCascadePatch, collectPrerequisites, collectDependents };
})(window);
