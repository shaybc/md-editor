(function(global) {
  "use strict";

  function selectVisibleTasks(tasks, preferences, searchText = "") {
    const search = String(searchText || "").trim().toLowerCase();
    const priorityRank = { high: 0, normal: 1, low: 2, "": 3 };
    const visible = tasks.filter((task) => {
      if (preferences.source !== "all" && task.origin !== preferences.source) return false;
      if (preferences.status !== "all" && task.status !== preferences.status) return false;
      if (preferences.priority !== "all" && task.priority !== preferences.priority) return false;
      if (!search) return true;
      return [task.title, task.description, task.location?.path, ...(task.tags || [])]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
    visible.sort((left, right) => {
      let leftValue = left[preferences.sort] || "";
      let rightValue = right[preferences.sort] || "";
      if (preferences.sort === "source") { leftValue = left.origin; rightValue = right.origin; }
      if (preferences.sort === "location") { leftValue = left.location?.path || ""; rightValue = right.location?.path || ""; }
      if (preferences.sort === "priority") { leftValue = priorityRank[left.priority || ""]; rightValue = priorityRank[right.priority || ""]; }
      const result = typeof leftValue === "number"
        ? leftValue - rightValue
        : String(leftValue || "9999-99-99").localeCompare(String(rightValue || "9999-99-99"), undefined, { numeric: true, sensitivity: "base" });
      return (preferences.direction === "desc" ? -1 : 1) * (result || String(left.id).localeCompare(String(right.id)));
    });
    return visible;
  }

  function createSummaryText(state, visibleCount) {
    const total = (state.userTasks?.length || 0) + (state.jdtTasks?.length || 0);
    const counts = `${visibleCount === total ? total : `${visibleCount} of ${total}`} tasks · ${state.userTasks?.length || 0} user · ${state.jdtTasks?.length || 0} Java`;
    let status = "";
    if (state.loading) status = "Loading project tasks";
    else if (state.saving) status = "Saving task";
    else if (state.error) status = state.error.message;
    else if (["loading", "refreshing"].includes(state.jdt?.status)) status = "Refreshing Java tasks — showing previous completed analysis";
    else if (state.jdt?.status === "incomplete") status = "Java task analysis incomplete — previous completed tasks retained";
    else if (state.jdt?.status === "error") status = state.jdt.error?.message || "Java tasks could not be refreshed";
    return status ? `${counts} · ${status}` : counts;
  }
  function getTaskPrimaryAction(task) {
    return task?.origin === "jdt" ? "source" : "details";
  }

  function getTaskContextAvailability(task) {
    const isUserTask = task?.origin === "user";
    return {
      details: Boolean(task),
      openSource: Boolean(task?.location?.path),
      toggleComplete: isUserTask,
      convert: task?.origin === "jdt",
      delete: isUserTask
    };
  }

  /** Owns the project Tasks tab, task filtering, and task detail actions. */
  function registerMarkdownViewerTasksPanel(app, deps = {}) {
    const PREFERENCES_KEY = "markdownViewerTasksPanelPreferences";
    const taskStore = deps.taskStore || app?.modules?.projectTaskStore;
    const bottomPanel = deps.bottomPanel;
    const view = deps.view || document.getElementById("bottom-panel-tasks");
    let summary = deps.summary || document.getElementById("tasks-panel-summary");
    const statusRow = deps.statusRow || summary?.parentElement;
    const body = deps.body || document.getElementById("tasks-panel-body");
    const toggleButtons = Array.from(deps.toggleButtons || document.querySelectorAll('[data-project-command="show-tasks"]'));
    const lowerPanelElement = view?.closest?.("#find-in-files-results-panel") || document.getElementById("find-in-files-results-panel");
    const lowerPanelViews = view?.parentElement;
    let state = taskStore?.getState?.() || { workspaceRoot: "", userTasks: [], jdtTasks: [], jdt: { status: "idle" } };
    let selectedTaskId = "";
    let generationState = { status: "idle" };
    let preferences = loadPreferences();
    let contextTask = null;
    let contextMenu = null;

    function isVisible() {
      return Boolean(view?.parentElement && bottomPanel?.isPanelVisible?.() && bottomPanel?.getActiveTabId?.() === "tasks");
    }

    function updateToggleButtons() {
      const visible = isVisible();
      const label = visible ? "Hide Tasks" : "Show Tasks";
      toggleButtons.forEach((button) => {
        const labelElement = button.querySelector?.(".tasks-toggle-label");
        if (labelElement) labelElement.textContent = label;
        else button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(!visible));
      });
    }

    function loadPreferences() {
      try {
        const parsed = JSON.parse((deps.localStorage || global.localStorage)?.getItem(PREFERENCES_KEY) || "{}");
        return {
          source: ["all", "user", "jdt"].includes(parsed.source) ? parsed.source : "all",
          status: ["all", "open", "in-progress", "completed"].includes(parsed.status) ? parsed.status : "all",
          priority: ["all", "low", "normal", "high"].includes(parsed.priority) ? parsed.priority : "all",
          sort: ["title", "status", "priority", "dueDate", "source", "location"].includes(parsed.sort) ? parsed.sort : "dueDate",
          direction: parsed.direction === "desc" ? "desc" : "asc"
        };
      } catch (_error) {
        return { source: "all", status: "all", priority: "all", sort: "dueDate", direction: "asc" };
      }
    }

    function savePreferences() {
      try { (deps.localStorage || global.localStorage)?.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }
      catch (_error) { /* Filter persistence is best effort. */ }
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function initializeView() {
      if (!body) return;
      if (statusRow) {
        statusRow.innerHTML = `
          <label class="tasks-panel-search"><i class="bi bi-search" aria-hidden="true"></i><input type="search" data-tasks-search placeholder="Search tasks" aria-label="Search tasks"></label>
          <span class="tasks-panel-center">
            <span class="tasks-panel-source-counts" aria-hidden="true">
              <span data-tasks-user-count>0</span><span class="tasks-panel-source-badge user">User</span>
              <span data-tasks-java-count>0</span><span class="tasks-panel-source-badge jdt">Java</span>
            </span>
          </span>
          <span class="tasks-panel-actions">
            <label class="tasks-panel-sort-label"><span>Sort</span><select data-tasks-filter="sort"><option value="dueDate">Due date</option><option value="title">Title</option><option value="status">Status</option><option value="priority">Priority</option><option value="source">Source</option><option value="location">Location</option></select></label>
            <button class="tasks-panel-icon-button" type="button" data-tasks-direction title="Reverse sort order" aria-label="Reverse sort order"><i class="bi bi-sort-down" aria-hidden="true"></i></button>
            <button class="tasks-panel-icon-button" type="button" data-tasks-retry title="Refresh Java tasks" aria-label="Refresh Java tasks"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button>
            <button class="reset-modal-btn tasks-panel-add" type="button" data-tasks-add><i class="bi bi-plus-lg" aria-hidden="true"></i> Add Task</button>
          </span>`;
        summary = null;
      }
      body.innerHTML = `
        <div class="tasks-panel-table-wrap">
          <table class="tasks-panel-table"><thead><tr>
            <th><select class="tasks-panel-header-filter" data-tasks-filter="status" aria-label="Filter tasks by status"><option value="all">Status</option><option value="open">Open</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></th>
            <th>Task</th>
            <th><select class="tasks-panel-header-filter" data-tasks-filter="priority" aria-label="Filter tasks by priority"><option value="all">Priority</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></th>
            <th>Due</th>
            <th>Location</th>
            <th><select class="tasks-panel-header-filter" data-tasks-filter="source" aria-label="Filter tasks by source"><option value="all">Source</option><option value="user">User</option><option value="jdt">Java</option></select></th>
          </tr></thead><tbody data-tasks-rows></tbody></table>
          <div class="tasks-panel-empty" data-tasks-empty hidden>No tasks match the current filters.</div>
        </div>`;
      ["source", "status", "priority", "sort"].forEach((key) => {
        const select = view?.querySelector(`[data-tasks-filter="${key}"]`);
        if (!select) return;
        select.value = preferences[key];
        select.addEventListener("change", () => { preferences[key] = select.value; savePreferences(); render(); });
      });
      view?.querySelector("[data-tasks-search]")?.addEventListener("input", render);
      view?.querySelector("[data-tasks-direction]")?.addEventListener("click", () => {
        preferences.direction = preferences.direction === "asc" ? "desc" : "asc";
        savePreferences();
        render();
      });
      view?.querySelector("[data-tasks-retry]")?.addEventListener("click", () => {
        void taskStore?.openProject?.(state.workspaceRoot, { force: true });
        void deps.taskSource?.retry?.();
      });
      view?.querySelector("[data-tasks-add]")?.addEventListener("click", () => showTaskDialog());
    }

    function getVisibleTasks() {
      const search = String(view?.querySelector("[data-tasks-search]")?.value || "").trim().toLowerCase();
      return selectVisibleTasks([...(state.userTasks || []), ...(state.jdtTasks || [])], preferences, search);
    }

    function render() {
      if (!body) return;
      const tasks = getVisibleTasks();
      const rows = body.querySelector("[data-tasks-rows]");
      rows.replaceChildren();
      tasks.forEach((task) => {
        const row = document.createElement("tr");
        row.tabIndex = 0;
        row.dataset.taskId = task.id;
        row.classList.toggle("selected", task.id === selectedTaskId);
        const location = task.location ? `${task.location.path}:${task.location.line}` : "";
        row.innerHTML = `<td class="tasks-panel-status-cell"></td><td><span class="tasks-panel-task-title">${escapeHtml(task.title)}</span>${task.description ? `<span class="tasks-panel-task-description">${escapeHtml(task.description)}</span>` : ""}</td><td>${escapeHtml(task.priority || "")}</td><td>${escapeHtml(task.dueDate || "")}</td><td title="${escapeHtml(location)}">${escapeHtml(location)}</td><td><span class="tasks-panel-source-badge ${task.origin}">${task.origin === "jdt" ? "Java" : "User"}</span></td>`;
        const statusCell = row.querySelector(".tasks-panel-status-cell");
        if (task.origin === "user") {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = task.status === "completed";
          checkbox.title = checkbox.checked ? "Reopen task" : "Mark task complete";
          checkbox.setAttribute("aria-label", checkbox.title);
          checkbox.addEventListener("click", (event) => event.stopPropagation());
          checkbox.addEventListener("change", () => void taskStore.setTaskCompleted(task.id, checkbox.checked).catch(showError));
          statusCell.appendChild(checkbox);
        } else {
          statusCell.textContent = "Open";
        }
        const openTask = () => {
          hideTaskContextMenu();
          selectedTaskId = task.id;
          if (getTaskPrimaryAction(task) === "source") void deps.openTaskLocation?.(task);
          else showTaskDialog(task);
        };
        row.addEventListener("click", openTask);
        row.addEventListener("contextmenu", (event) => showTaskContextMenu(event, task));
        row.addEventListener("keydown", (event) => { if (event.key === "Enter") openTask(); });
        rows.appendChild(row);
      });
      body.querySelector("[data-tasks-empty]").hidden = tasks.length > 0;
      const addButton = view?.querySelector("[data-tasks-add]");
      if (addButton) addButton.disabled = !state.workspaceRoot || state.loading;
      const directionIcon = view?.querySelector("[data-tasks-direction] i");
      if (directionIcon) directionIcon.className = preferences.direction === "asc" ? "bi bi-sort-down" : "bi bi-sort-up";
      updateSummary(tasks.length);
    }

    function updateSummary(visibleCount) {
      statusRow?.setAttribute("aria-label", createSummaryText(state, visibleCount));
      const userCount = view?.querySelector("[data-tasks-user-count]");
      const javaCount = view?.querySelector("[data-tasks-java-count]");
      if (userCount) userCount.textContent = String(state.userTasks?.length || 0);
      if (javaCount) javaCount.textContent = String(state.jdtTasks?.length || 0);
    }

    function field(overlay, name) {
      return overlay.querySelector(`[name="${name}"]`);
    }

    function closeDialog(overlay) {
      overlay?.remove();
    }

    function convertJavaTask(task) {
      showTaskDialog(null, {
        title: task.title,
        description: task.description,
        tags: ["java"],
        location: task.location
      });
    }

    function hideTaskContextMenu() {
      contextMenu?.classList.add("hidden");
      contextTask = null;
    }

    /** Create the task actions menu shared by user and Java task rows. */
    function createTaskContextMenu() {
      const menu = document.createElement("div");
      menu.className = "graph-context-menu tasks-panel-context-menu hidden";
      menu.setAttribute("role", "menu");
      menu.innerHTML =
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="details"><i class="bi bi-info-circle" aria-hidden="true"></i><span class="graph-context-menu-item-label">Task Details...</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="open"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i><span class="graph-context-menu-item-label">Open Source</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="complete"><i class="bi bi-check2-circle" aria-hidden="true"></i><span class="graph-context-menu-item-label">Mark Complete</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="convert"><i class="bi bi-copy" aria-hidden="true"></i><span class="graph-context-menu-item-label">Convert to User Task</span></button>` +
        `<div class="graph-context-menu-separator" data-task-delete-separator aria-hidden="true"></div>` +
        `<button class="graph-context-menu-item graph-context-menu-item-danger" type="button" role="menuitem" data-action="delete"><i class="bi bi-trash" aria-hidden="true"></i><span class="graph-context-menu-item-label">Delete</span></button>`;
      menu.querySelector('[data-action="details"]').addEventListener("click", () => {
        const task = contextTask;
        hideTaskContextMenu();
        if (task) showTaskDialog(task);
      });
      menu.querySelector('[data-action="open"]').addEventListener("click", () => {
        const task = contextTask;
        hideTaskContextMenu();
        if (task) void deps.openTaskLocation?.(task);
      });
      menu.querySelector('[data-action="complete"]').addEventListener("click", () => {
        const task = contextTask;
        hideTaskContextMenu();
        if (task?.origin === "user") void taskStore.setTaskCompleted(task.id, task.status !== "completed").catch(showError);
      });
      menu.querySelector('[data-action="convert"]').addEventListener("click", () => {
        const task = contextTask;
        hideTaskContextMenu();
        if (task?.origin === "jdt") convertJavaTask(task);
      });
      menu.querySelector('[data-action="delete"]').addEventListener("click", () => {
        const task = contextTask;
        hideTaskContextMenu();
        if (task?.origin === "user") confirmDelete(task);
      });
      document.body.appendChild(menu);
      global.addEventListener("pointerdown", (event) => {
        if (!menu.contains(event.target)) hideTaskContextMenu();
      });
      global.addEventListener("blur", hideTaskContextMenu);
      global.addEventListener("resize", hideTaskContextMenu);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideTaskContextMenu();
      });
      body?.addEventListener("scroll", hideTaskContextMenu);
      return menu;
    }

    function showTaskContextMenu(event, task) {
      event.preventDefault();
      contextTask = taskStore?.getTask?.(task.id) || task;
      selectedTaskId = task.id;
      render();
      const availability = getTaskContextAvailability(contextTask);
      const detailsButton = contextMenu.querySelector('[data-action="details"]');
      detailsButton.querySelector(".graph-context-menu-item-label").textContent = contextTask.origin === "user" ? "Edit Task..." : "Task Details...";
      detailsButton.disabled = !availability.details;
      const openButton = contextMenu.querySelector('[data-action="open"]');
      openButton.disabled = !availability.openSource;
      const completeButton = contextMenu.querySelector('[data-action="complete"]');
      completeButton.classList.toggle("hidden", !availability.toggleComplete);
      completeButton.querySelector(".graph-context-menu-item-label").textContent = contextTask.status === "completed" ? "Reopen Task" : "Mark Complete";
      contextMenu.querySelector('[data-action="convert"]').classList.toggle("hidden", !availability.convert);
      contextMenu.querySelector("[data-task-delete-separator]").classList.toggle("hidden", !availability.delete);
      contextMenu.querySelector('[data-action="delete"]').classList.toggle("hidden", !availability.delete);
      contextMenu.classList.remove("hidden");
      const appZoomFactor = Math.max(0.01, Number(document.documentElement?.dataset?.appZoomPercent || 100) / 100);
      contextMenu.style.left = `${Math.max(4, event.clientX) / appZoomFactor}px`;
      contextMenu.style.top = `${Math.max(4, event.clientY) / appZoomFactor}px`;
      const bounds = contextMenu.getBoundingClientRect();
      const viewportLeft = Math.max(4, Math.min(event.clientX, global.innerWidth - bounds.width - 4));
      const viewportTop = Math.max(4, Math.min(event.clientY, global.innerHeight - bounds.height - 4));
      contextMenu.style.left = `${viewportLeft / appZoomFactor}px`;
      contextMenu.style.top = `${viewportTop / appZoomFactor}px`;
      contextMenu.querySelector(".graph-context-menu-item:not(:disabled):not(.hidden)")?.focus();
    }

    /** Open an editable user-task dialog or read-only JDT task details. */
    function showTaskDialog(task = null, defaults = {}) {
      document.querySelector(".tasks-detail-modal")?.remove();
      const isJdt = task?.origin === "jdt";
      const isEdit = task?.origin === "user";
      const value = task || defaults;
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay tasks-detail-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "tasks-detail-title");
      overlay.innerHTML = `
        <form class="reset-modal-box tasks-detail-modal-box">
          <div class="tasks-detail-heading"><h2 id="tasks-detail-title">${isJdt ? "Java Task Details" : isEdit ? "Edit Task" : "Add Task"}</h2><span class="tasks-panel-source-badge ${isJdt ? "jdt" : "user"}">${isJdt ? "Java · read only" : "Project task"}</span></div>
          <div class="tasks-detail-grid">
            <label class="tasks-detail-wide"><span>Title</span><input class="rename-modal-input" name="title" required maxlength="300"></label>
            <label class="tasks-detail-wide"><span>Description</span><textarea class="rename-modal-input" name="description" rows="5"></textarea></label>
            <label><span>Status</span><select class="rename-modal-input" name="status"><option value="open">Open</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>
            <label><span>Priority</span><select class="rename-modal-input" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
            <label><span>Due date</span><input class="rename-modal-input" name="dueDate" type="date"></label>
            <label><span>Tags</span><input class="rename-modal-input" name="tags" placeholder="Comma-separated"></label>
            <label class="tasks-detail-wide"><span>Project-relative file</span><input class="rename-modal-input" name="path" placeholder="src/main/java/Example.java"></label>
            <label><span>Line</span><input class="rename-modal-input" name="line" type="number" min="1"></label>
            <label><span>Column</span><input class="rename-modal-input" name="column" type="number" min="1"></label>
          </div>
          <div class="tasks-detail-error" data-task-error role="alert"></div>
          <div class="reset-modal-actions tasks-detail-actions">
            <button class="reset-modal-btn tasks-detail-delete" type="button" data-action="delete" ${isEdit ? "" : "hidden"}>Delete</button>
            <button class="reset-modal-btn" type="button" data-action="open" ${value.location?.path ? "" : "hidden"}>Open Source</button>
            <button class="reset-modal-btn" type="button" data-action="convert" ${isJdt ? "" : "hidden"}>Convert to User Task</button>
            <span class="tasks-detail-action-spacer"></span>
            <button class="reset-modal-btn" type="button" data-action="cancel">${isJdt ? "Close" : "Cancel"}</button>
            <button class="reset-modal-btn reset-modal-btn-primary" type="submit" ${isJdt ? "hidden" : ""}>${isEdit ? "Save" : "Create Task"}</button>
          </div>
        </form>`;
      field(overlay, "title").value = value.title || "";
      field(overlay, "description").value = value.description || "";
      field(overlay, "status").value = value.status || "open";
      field(overlay, "priority").value = value.priority || "normal";
      field(overlay, "dueDate").value = value.dueDate || "";
      field(overlay, "tags").value = (value.tags || []).join(", ");
      field(overlay, "path").value = value.location?.path || "";
      field(overlay, "line").value = value.location?.line || 1;
      field(overlay, "column").value = value.location?.column || 1;
      if (isJdt) overlay.querySelectorAll("input, textarea, select").forEach((control) => { control.disabled = true; });
      overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => closeDialog(overlay));
      overlay.querySelector('[data-action="open"]').addEventListener("click", () => { closeDialog(overlay); void deps.openTaskLocation?.(value); });
      overlay.querySelector('[data-action="convert"]').addEventListener("click", () => {
        closeDialog(overlay);
        convertJavaTask(value);
      });
      overlay.querySelector('[data-action="delete"]').addEventListener("click", () => confirmDelete(task, overlay));
      overlay.querySelector("form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const location = field(overlay, "path").value.trim() ? { path: field(overlay, "path").value, line: field(overlay, "line").value, column: field(overlay, "column").value } : null;
        const input = { title: field(overlay, "title").value, description: field(overlay, "description").value, status: field(overlay, "status").value, priority: field(overlay, "priority").value, dueDate: field(overlay, "dueDate").value, tags: field(overlay, "tags").value, location };
        try {
          if (isEdit) await taskStore.updateTask(task.id, input);
          else await taskStore.createTask(input);
          closeDialog(overlay);
        } catch (error) {
          overlay.querySelector("[data-task-error]").textContent = String(error?.message || error);
        }
      });
      overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(overlay); });
      overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDialog(overlay); });
      document.body.appendChild(overlay);
      (isJdt ? overlay.querySelector('[data-action="cancel"]') : field(overlay, "title")).focus();
    }

    function confirmDelete(task, detailOverlay) {
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay tasks-delete-modal";
      overlay.setAttribute("role", "alertdialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `<div class="reset-modal-box tasks-delete-modal-box"><h2>Delete Task</h2><p>Delete “${escapeHtml(task.title)}” from this project?</p><div class="reset-modal-actions"><button class="reset-modal-btn" type="button" data-cancel>Cancel</button><button class="reset-modal-btn reset-modal-btn-danger" type="button" data-delete>Delete</button></div></div>`;
      overlay.querySelector("[data-cancel]").addEventListener("click", () => overlay.remove());
      overlay.querySelector("[data-delete]").addEventListener("click", async () => {
        try { await taskStore.deleteTask(task.id); overlay.remove(); detailOverlay?.remove(); }
        catch (error) { overlay.remove(); showError(error); }
      });
      document.body.appendChild(overlay);
      overlay.querySelector("[data-cancel]").focus();
    }

    function showError(error) {
      deps.alert?.(String(error?.message || error));
    }

    /** Register the closable Tasks tab in the shared bottom panel. */
    function addTasksTab(options = {}) {
      bottomPanel?.addTab?.({
        id: "tasks",
        title: "Tasks",
        icon: "bi-check2-square",
        view,
        permanent: false,
        activate: options.activate === true,
        onActivate: () => {
          render();
          updateToggleButtons();
        }
      });
    }

    /** Show the Tasks tab, recreating it after the user closed it. */
    function show() {
      if (!bottomPanel?.hasTab?.("tasks") || !view?.parentElement) addTasksTab({ activate: true });
      else bottomPanel?.activateTab?.("tasks");
      updateToggleButtons();
    }

    /** Toggle the shared bottom panel with Tasks as its active tab. */
    function toggle() {
      if (view?.parentElement && bottomPanel?.isPanelVisible?.() && bottomPanel?.getActiveTabId?.() === "tasks") {
        const result = bottomPanel?.hidePanel?.();
        updateToggleButtons();
        return result;
      }
      show();
      return true;
    }

    function setAnalysisGenerationState(next = {}) {
      generationState = next;
      render();
    }

    initializeView();
    contextMenu = createTaskContextMenu();
    taskStore?.subscribe?.((next) => { state = next; render(); });
    addTasksTab();
    if (typeof global.MutationObserver === "function") {
      const visibilityObserver = new global.MutationObserver(updateToggleButtons);
      if (lowerPanelElement) visibilityObserver.observe(lowerPanelElement, { attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
      if (view) visibilityObserver.observe(view, { attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
      if (lowerPanelViews) visibilityObserver.observe(lowerPanelViews, { childList: true });
    }
    updateToggleButtons();

    const api = { show, toggle, render, showTaskDialog, setAnalysisGenerationState, getState: () => ({ state, preferences, generationState }) };
    app?.registerModule?.("tasksPanel", api);
    return api;
  }

  global.registerMarkdownViewerTasksPanel = registerMarkdownViewerTasksPanel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerTasksPanel, selectVisibleTasks, createSummaryText, getTaskPrimaryAction, getTaskContextAvailability };
  }
})(typeof window !== "undefined" ? window : globalThis);
