(function(window) {
  "use strict";

  /**
   * Own the Keyboard Shortcuts settings panel and its unsaved draft.
   * @param {object} options Shortcut API and settings DOM dependencies.
   * @returns {object} Keyboard shortcut settings controller.
   */
  function createMarkdownViewerKeyboardShortcutsSettings(options = {}) {
    const root = options.root || document;
    const shortcuts = options.shortcuts;
    const list = root.getElementById("settings-shortcuts-list");
    const searchInput = root.getElementById("settings-shortcuts-search");
    const keystrokeSearchButton = root.getElementById("settings-shortcuts-keystroke-search");
    const resetAllButton = root.getElementById("settings-shortcuts-reset-all");
    const empty = root.getElementById("settings-shortcuts-empty");
    const status = root.getElementById("settings-shortcuts-status");
    let draft = {};
    let keystrokeFilter = null;
    let captureCommandId = "";

    function cloneOverrides(value) {
      return shortcuts.normalizeOverrides(JSON.parse(JSON.stringify(value || {})));
    }

    function getBinding(commandId) {
      return shortcuts.getEffectiveBinding(commandId, draft);
    }

    function setStatus(message, isError = false) {
      if (!status) return;
      status.textContent = message || "";
      status.classList.toggle("error", isError);
    }

    function findConflict(commandId, candidate) {
      return shortcuts.commands.find((command) => command.id !== commandId && shortcuts.eventMatchesBinding({
        key: candidate.key,
        ctrlKey: candidate.primary,
        metaKey: false,
        altKey: candidate.alt,
        shiftKey: candidate.shift
      }, getBinding(command.id))) || null;
    }

    function applyBinding(commandId, candidate) {
      const conflict = findConflict(commandId, candidate);
      if (conflict) {
        setStatus(`${shortcuts.formatBinding(candidate)} is already assigned to ${conflict.label}.`, true);
        return false;
      }
      const definition = shortcuts.commands.find((command) => command.id === commandId);
      if (!definition) return false;
      if (shortcuts.eventMatchesBinding({
        key: candidate.key,
        ctrlKey: candidate.primary,
        metaKey: false,
        altKey: candidate.alt,
        shiftKey: candidate.shift
      }, definition.defaultBinding)) delete draft[commandId];
      else draft[commandId] = candidate;
      captureCommandId = "";
      setStatus(`${definition.label} is now ${shortcuts.formatBinding(candidate)}. Save settings to apply.`);
      render();
      return true;
    }

    function createActionButton(icon, label, action, disabled = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-shortcut-action";
      button.dataset.shortcutAction = action;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.disabled = disabled;
      button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
      return button;
    }

    function render() {
      if (!list || !shortcuts) return;
      const query = String(searchInput?.value || "").trim().toLowerCase();
      const commands = shortcuts.commands.filter((command) => {
        const current = getBinding(command.id);
        if (keystrokeFilter) return shortcuts.eventMatchesBinding({
          key: keystrokeFilter.key,
          ctrlKey: keystrokeFilter.primary,
          metaKey: false,
          altKey: keystrokeFilter.alt,
          shiftKey: keystrokeFilter.shift
        }, current);
        return !query || `${command.label} ${command.description} ${shortcuts.formatBinding(current)}`.toLowerCase().includes(query);
      });
      list.replaceChildren();
      commands.forEach((command) => {
        const current = getBinding(command.id);
        const isDefault = shortcuts.eventMatchesBinding({
          key: command.defaultBinding.key,
          ctrlKey: command.defaultBinding.primary,
          metaKey: false,
          altKey: command.defaultBinding.alt,
          shiftKey: command.defaultBinding.shift
        }, current);
        const row = document.createElement("div");
        row.className = "settings-shortcut-row";
        row.dataset.shortcutCommand = command.id;
        row.setAttribute("role", "listitem");
        const details = document.createElement("div");
        details.className = "settings-shortcut-details";
        const title = document.createElement("strong");
        title.textContent = command.label;
        const description = document.createElement("span");
        description.textContent = command.description;
        details.append(title, description);
        const bindingButton = document.createElement("button");
        bindingButton.type = "button";
        bindingButton.className = "settings-shortcut-binding";
        bindingButton.dataset.shortcutAction = "edit";
        bindingButton.textContent = captureCommandId === command.id ? "Press shortcut…" : shortcuts.formatBinding(current);
        bindingButton.setAttribute("aria-label", `Edit ${command.label} shortcut`);
        const actions = document.createElement("div");
        actions.className = "settings-shortcut-actions";
        actions.append(
          createActionButton("bi-pencil", `Edit ${command.label}`, "edit"),
          createActionButton("bi-trash", `Unassign ${command.label}`, "unassign", current === null),
          createActionButton("bi-arrow-counterclockwise", `Reset ${command.label}`, "reset", isDefault)
        );
        row.append(details, bindingButton, actions);
        list.append(row);
      });
      if (empty) empty.hidden = commands.length > 0;
    }

    function setCaptureActive(active) {
      if (document.documentElement) document.documentElement.dataset.keyboardShortcutCapture = active ? "true" : "false";
    }

    function beginCapture(commandId) {
      captureCommandId = commandId;
      setCaptureActive(true);
      keystrokeFilter = null;
      keystrokeSearchButton?.setAttribute("aria-pressed", "false");
      setStatus("Press the new shortcut. Use Ctrl/Cmd or Alt, or press a function key.");
      render();
    }

    function handleListClick(event) {
      const row = event.target.closest("[data-shortcut-command]");
      const action = event.target.closest("[data-shortcut-action]")?.dataset.shortcutAction;
      const commandId = row?.dataset.shortcutCommand || "";
      if (!commandId || !action) return;
      if (action !== "edit") setCaptureActive(false);
      if (action === "edit") beginCapture(commandId);
      if (action === "unassign") {
        draft[commandId] = null;
        captureCommandId = "";
        setStatus("Shortcut unassigned. Save settings to apply.");
        render();
      }
      if (action === "reset") {
        delete draft[commandId];
        captureCommandId = "";
        setStatus("Shortcut restored to its default. Save settings to apply.");
        render();
      }
    }

    function handleKeydown(event) {
      const isKeystrokeSearch = keystrokeSearchButton?.getAttribute("aria-pressed") === "true";
      if (!captureCommandId && !isKeystrokeSearch) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        captureCommandId = "";
        keystrokeFilter = null;
        keystrokeSearchButton?.setAttribute("aria-pressed", "false");
        setCaptureActive(false);
        setStatus("");
        render();
        return;
      }
      const candidate = shortcuts.bindingFromEvent(event);
      if (!candidate) {
        setStatus("Use Ctrl/Cmd or Alt with a key, or press F1–F12.", true);
        return;
      }
      if (captureCommandId) {
        if (applyBinding(captureCommandId, candidate)) setCaptureActive(false);
      }
      else {
        keystrokeFilter = candidate;
        if (searchInput) searchInput.value = "";
        keystrokeSearchButton?.setAttribute("aria-pressed", "false");
        setCaptureActive(false);
        setStatus(`Showing commands assigned to ${shortcuts.formatBinding(candidate)}.`);
        render();
      }
    }

    list?.addEventListener("click", handleListClick);
    searchInput?.addEventListener("input", () => {
      setCaptureActive(false);
      captureCommandId = "";
      keystrokeSearchButton?.setAttribute("aria-pressed", "false");
      keystrokeFilter = null;
      render();
    });
    keystrokeSearchButton?.addEventListener("click", () => {
      const active = keystrokeSearchButton.getAttribute("aria-pressed") !== "true";
      captureCommandId = "";
      keystrokeFilter = null;
      keystrokeSearchButton.setAttribute("aria-pressed", active ? "true" : "false");
      setCaptureActive(active);
      setStatus(active ? "Press a shortcut to search for it." : "");
      render();
    });
    resetAllButton?.addEventListener("click", () => {
      setCaptureActive(false);
      draft = {};
      captureCommandId = "";
      keystrokeFilter = null;
      setStatus("All shortcuts restored to defaults. Save settings to apply.");
      render();
    });
    root.addEventListener("keydown", handleKeydown, true);

    return {
      open(value) {
        draft = cloneOverrides(value);
        captureCommandId = "";
        keystrokeFilter = null;
        if (searchInput) searchInput.value = "";
        keystrokeSearchButton?.setAttribute("aria-pressed", "false");
        setCaptureActive(false);
        setStatus("");
        render();
      },
      discard() {
        draft = {};
        captureCommandId = "";
        keystrokeFilter = null;
        setCaptureActive(false);
      },
      getDraft() {
        return cloneOverrides(draft);
      },
      render
    };
  }

  window.createMarkdownViewerKeyboardShortcutsSettings = createMarkdownViewerKeyboardShortcutsSettings;
})(window);
