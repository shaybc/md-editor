/* Background Processes lower-panel rendering and singleton tab behavior. */
(function(global) {
  "use strict";

  const TAB_ID = "background-processes";

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  /**
   * Register the singleton Background Processes lower-panel tab.
   * @param {object} app MD-Editor application registry.
   * @param {object} deps Bottom-panel, store, and DOM dependencies.
   * @returns {object} Panel visibility and rendering API.
   */
  function registerMarkdownViewerBackgroundProcessesPanel(app, deps = {}) {
    const store = deps.store || app?.modules?.backgroundProcesses;
    const bottomPanel = deps.bottomPanel;
    const view = deps.view || document.getElementById("bottom-panel-background-processes");
    const body = deps.body || document.getElementById("background-processes-body");
    const summary = deps.summary || document.getElementById("background-processes-summary");
    const search = deps.search || document.getElementById("background-processes-search");
    const clearButton = deps.clearButton || document.getElementById("background-processes-clear");
    const toggleButtons = Array.from(deps.toggleButtons || document.querySelectorAll(".toggle-background-processes"));
    const statusTip = deps.statusTip || document.getElementById("status-tip");
    const model = deps.model || global.MarkdownViewerBackgroundProcessEntry;
    let entries = store?.getEntries?.() || [];
    let ticker = null;

    function isVisible() {
      return Boolean(view?.parentElement && bottomPanel?.isPanelVisible?.() && bottomPanel?.getActiveTabId?.() === TAB_ID);
    }

    function updateToggleButtons() {
      const visible = isVisible();
      toggleButtons.forEach((button) => {
        const label = visible ? "Hide Background Processes" : "Show Background Processes";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(visible));
        const text = button.querySelector(".background-processes-toggle-label");
        if (text) text.textContent = label;
      });
    }

    function render() {
      if (!body) return;
      const query = String(search?.value || "").trim().toLowerCase();
      const visibleEntries = query ? entries.filter((entry) =>
        entry.description.toLowerCase().includes(query) || String(entry.pid || "").includes(query)
      ) : entries;
      const runningCount = entries.filter((entry) => entry.status === "running").length;
      if (summary) summary.textContent = `${entries.length} process${entries.length === 1 ? "" : "es"}${runningCount ? ` · ${runningCount} running` : ""}`;
      if (clearButton) clearButton.disabled = !entries.some((entry) => entry.status !== "running");
      body.innerHTML = "";
      if (!visibleEntries.length) {
        const empty = document.createElement("div");
        empty.className = "background-processes-empty";
        empty.textContent = query ? "No background processes match this search." : "No background process history.";
        body.appendChild(empty);
        return;
      }
      const table = document.createElement("table");
      table.className = "background-processes-table";
      table.innerHTML = "<thead><tr><th aria-label=\"Icon\"></th><th>Description</th><th>PID</th><th>Status</th><th>Started</th><th>Duration</th><th>Actions</th></tr></thead>";
      const tableBody = document.createElement("tbody");
      visibleEntries.forEach((entry) => {
        const row = document.createElement("tr");
        row.dataset.backgroundProcessId = entry.id;
        const isRunProcess = entry.category === "run";
        const pendingLabel = isRunProcess ? "Killing..." : "Cancelling...";
        const statusLabel = entry.status === "running" ? (entry.cancelPending ? pendingLabel : "Working") : `${entry.status[0].toUpperCase()}${entry.status.slice(1)}`;
        row.innerHTML = `
          <td class="background-process-icon"><i class="bi ${entry.icon}" aria-hidden="true"></i></td>
          <td class="background-process-description"></td>
          <td>${entry.pid || "—"}</td>
          <td><span class="background-process-status ${entry.status}">${entry.status === "running" ? '<i class="bi bi-arrow-repeat" aria-hidden="true"></i>' : ""}<span>${statusLabel}</span></span></td>
          <td>${new Date(entry.startedAt).toLocaleString()}</td>
          <td>${formatDuration(model.getDuration(entry))}</td>
          <td class="background-process-actions"></td>`;
        const description = row.querySelector(".background-process-description");
        if (entry.status === "running" && isRunProcess && entry.tabId) {
          const openRun = document.createElement("button");
          openRun.type = "button";
          openRun.className = "background-process-description-button";
          openRun.textContent = entry.description;
          openRun.title = `Show ${entry.description} output`;
          openRun.addEventListener("click", () => bottomPanel?.activateTab?.(entry.tabId));
          description.appendChild(openRun);
        } else {
          description.textContent = entry.description;
        }
        const actions = row.querySelector(".background-process-actions");
        if (entry.status === "running") {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "background-process-action";
          cancel.textContent = entry.cancelPending ? (isRunProcess ? "Killing..." : "Cancelling...") : (isRunProcess ? "Kill" : "Cancel");
          cancel.disabled = entry.cancelPending;
          cancel.addEventListener("click", () => { void store?.requestCancel?.(entry.id); });
          actions.appendChild(cancel);
        } else {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "background-process-action background-process-delete";
          remove.textContent = "Delete";
          remove.addEventListener("click", () => store?.remove?.(entry.id));
          actions.appendChild(remove);
        }
        tableBody.appendChild(row);
      });
      table.appendChild(tableBody);
      body.appendChild(table);
    }

    function addTab(options = {}) {
      bottomPanel?.addTab?.({
        id: TAB_ID,
        title: "Background Processes",
        icon: "bi-gear-wide-connected",
        view,
        permanent: false,
        activate: options.activate === true,
        onActivate: () => { render(); updateToggleButtons(); }
      });
    }

    function show() {
      if (!bottomPanel?.hasTab?.(TAB_ID) || !view?.parentElement) addTab({ activate: true });
      else bottomPanel?.activateTab?.(TAB_ID);
      updateToggleButtons();
      return true;
    }

    function toggle() {
      if (isVisible()) {
        bottomPanel?.hidePanel?.();
        updateToggleButtons();
        return false;
      }
      return show();
    }

    search?.addEventListener?.("input", render);
    clearButton?.addEventListener?.("click", () => store?.clearCompleted?.());
    toggleButtons.forEach((button) => button.addEventListener("click", toggle));
    statusTip?.addEventListener?.("click", show);
    statusTip?.addEventListener?.("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      show();
    });
    statusTip?.setAttribute?.("role", "button");
    statusTip && (statusTip.tabIndex = 0);
    store?.subscribe?.((next) => { entries = next; render(); });
    addTab();
    ticker = global.setInterval?.(() => {
      if (isVisible() && entries.some((entry) => entry.status === "running")) render();
    }, 1000);
    global.addEventListener?.("beforeunload", () => global.clearInterval?.(ticker));
    if (typeof global.MutationObserver === "function" && view) {
      const observer = new global.MutationObserver(updateToggleButtons);
      observer.observe(view.parentElement || view, { attributes: true, childList: true });
    }
    updateToggleButtons();

    const api = { TAB_ID, show, toggle, render, isVisible };
    app?.registerModule?.("backgroundProcessesPanel", api);
    return api;
  }

  global.registerMarkdownViewerBackgroundProcessesPanel = registerMarkdownViewerBackgroundProcessesPanel;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerBackgroundProcessesPanel, formatDuration, TAB_ID };
})(typeof window !== "undefined" ? window : globalThis);
