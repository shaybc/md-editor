(function(global) {
  "use strict";

  /** Owns user-task persistence and the combined user/JDT task state for one project. */
  function registerMarkdownViewerProjectTaskStore(app, deps = {}) {
    const TASKS_FILE_NAME = "tasks.json";
    const TASK_DOCUMENT_TYPE = "md-editor-project-tasks";
    const listeners = new Set();
    let loadGeneration = 0;
    let fallbackId = 0;
    let writeQueue = Promise.resolve();
    let state = createState("");

    function createState(workspaceRoot) {
      return {
        workspaceRoot: normalizePath(workspaceRoot),
        loading: false,
        saving: false,
        error: null,
        revision: 0,
        userTasks: [],
        jdtTasks: [],
        jdt: { status: "idle", generationId: 0, snapshotId: "", error: null }
      };
    }

    function cloneState() {
      return {
        ...state,
        error: state.error ? { ...state.error } : null,
        userTasks: state.userTasks.map(cloneTask),
        jdtTasks: state.jdtTasks.map(cloneTask),
        jdt: { ...state.jdt, error: state.jdt.error ? { ...state.jdt.error } : null }
      };
    }

    function cloneTask(task) {
      return { ...task, tags: [...(task.tags || [])], location: task.location ? { ...task.location } : null };
    }

    function publish() {
      const snapshot = cloneState();
      listeners.forEach((listener) => {
        try { listener(snapshot); } catch (_error) { /* Task observers cannot interrupt persistence. */ }
      });
      return snapshot;
    }

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function workspaceKey(value) {
      return normalizePath(value).toLowerCase();
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getPersistencePath(workspaceRoot = state.workspaceRoot) {
      return joinPath(joinPath(workspaceRoot, ".md-editor"), TASKS_FILE_NAME);
    }

    function getFilesystem() {
      return deps.Neutralino?.filesystem || global.Neutralino?.filesystem || null;
    }

    function canPersist() {
      const filesystem = getFilesystem();
      return deps.isDesktopRuntime?.() !== false
        && Boolean(filesystem?.readFile && filesystem?.writeFile && filesystem?.createDirectory);
    }

    function createTaskId() {
      if (typeof global.crypto?.randomUUID === "function") return global.crypto.randomUUID();
      fallbackId += 1;
      return `task-${Date.now()}-${fallbackId}`;
    }

    function normalizeTags(tags) {
      const values = Array.isArray(tags) ? tags : String(tags || "").split(",");
      const seen = new Set();
      return values.map((tag) => String(tag || "").trim()).filter((tag) => {
        const key = tag.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function toProjectRelativePath(filePath, workspaceRoot = state.workspaceRoot) {
      const root = normalizePath(workspaceRoot);
      const normalized = normalizePath(filePath);
      if (!root || !normalized) return "";
      const rootKey = workspaceKey(root);
      const pathKey = workspaceKey(normalized);
      if (pathKey === rootKey) return "";
      if (pathKey.startsWith(`${rootKey}/`)) return normalized.slice(root.length + 1);
      if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) return "";
      const segments = normalized.split("/").filter(Boolean);
      if (segments.some((segment) => segment === "..")) return "";
      return segments.join("/");
    }

    function normalizeLocation(location, workspaceRoot) {
      if (!location?.path) return null;
      const relativePath = toProjectRelativePath(location.path, workspaceRoot);
      if (!relativePath) return null;
      return {
        path: relativePath,
        line: Math.max(1, Number(location.line) || 1),
        column: Math.max(1, Number(location.column) || 1)
      };
    }

    function normalizeUserTask(input = {}, existing = null, workspaceRoot = state.workspaceRoot) {
      const title = String(input.title ?? existing?.title ?? "").trim();
      if (!title) throw new Error("Task title is required.");
      const now = new Date().toISOString();
      const requestedStatus = String(input.status ?? existing?.status ?? "open");
      const status = ["open", "in-progress", "completed"].includes(requestedStatus) ? requestedStatus : "open";
      const requestedPriority = String(input.priority ?? existing?.priority ?? "normal");
      const priority = ["low", "normal", "high"].includes(requestedPriority) ? requestedPriority : "normal";
      const dueDateValue = input.dueDate === undefined ? existing?.dueDate : input.dueDate;
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDateValue || "")) ? String(dueDateValue) : null;
      const locationValue = input.location === undefined ? existing?.location : input.location;
      const location = normalizeLocation(locationValue, workspaceRoot);
      if (locationValue?.path && !location) throw new Error("Task locations must use a path inside the active project.");
      const completedAt = status === "completed"
        ? String(input.completedAt || existing?.completedAt || now)
        : null;
      return {
        id: String(existing?.id || input.id || createTaskId()),
        origin: "user",
        readOnly: false,
        title,
        description: String(input.description ?? existing?.description ?? ""),
        status,
        priority,
        dueDate,
        tags: normalizeTags(input.tags === undefined ? existing?.tags : input.tags),
        location,
        createdAt: String(existing?.createdAt || input.createdAt || now),
        updatedAt: now,
        completedAt
      };
    }

    function normalizeJdtTask(input = {}) {
      return {
        ...input,
        id: String(input.id || ""),
        origin: "jdt",
        readOnly: true,
        title: String(input.title || "Java task"),
        description: String(input.description || ""),
        status: "open",
        priority: null,
        tags: [],
        dueDate: null,
        location: input.filePath ? {
          path: toProjectRelativePath(input.filePath),
          line: Math.max(1, Number(input.line) || 1),
          column: Math.max(1, Number(input.column) || 1)
        } : null
      };
    }

    function parseTaskDocument(text, workspaceRoot) {
      const document = JSON.parse(String(text || ""));
      if (document?.type !== TASK_DOCUMENT_TYPE || document?.schemaVersion !== 1 || !Array.isArray(document.tasks)) {
        throw new Error("The project tasks file has an unsupported format or schema version.");
      }
      return document.tasks.map((task) => {
        const normalized = normalizeUserTask(task, task, workspaceRoot);
        normalized.updatedAt = String(task.updatedAt || normalized.updatedAt);
        return normalized;
      });
    }

    async function pathExists(path) {
      const filesystem = getFilesystem();
      if (!filesystem?.getStats) return true;
      try { await filesystem.getStats(path); return true; }
      catch (_error) { return false; }
    }

    /** Load user-defined tasks for the selected project and discard stale reads. */
    async function openProject(workspaceRoot, options = {}) {
      const root = normalizePath(workspaceRoot);
      if (options.force !== true && workspaceKey(root) === workspaceKey(state.workspaceRoot) && !state.loading && !state.error && state.revision > 0) {
        return cloneState();
      }
      const generation = ++loadGeneration;
      if (workspaceKey(root) !== workspaceKey(state.workspaceRoot)) {
        state = createState(root);
        publish();
      }
      if (!root) return cloneState();
      state.loading = true;
      state.error = null;
      publish();
      let tasks = [];
      let error = null;
      if (canPersist()) {
        try {
          const path = getPersistencePath(root);
          if (await pathExists(path)) tasks = parseTaskDocument(await getFilesystem().readFile(path), root);
        } catch (loadError) {
          error = { code: "tasks-load-failed", message: String(loadError?.message || loadError) };
        }
      }
      if (generation !== loadGeneration || workspaceKey(root) !== workspaceKey(state.workspaceRoot)) return cloneState();
      state.userTasks = tasks;
      state.loading = false;
      state.error = error;
      state.revision += 1;
      return publish();
    }

    async function removeIfPresent(path) {
      const filesystem = getFilesystem();
      if (!filesystem?.remove || !await pathExists(path)) return false;
      await filesystem.remove(path);
      return true;
    }

    async function persistUserTasks(workspaceRoot, tasks) {
      if (!canPersist()) throw new Error("Project task persistence is unavailable in this runtime.");
      const filesystem = getFilesystem();
      const metadataDirectory = joinPath(workspaceRoot, ".md-editor");
      const path = getPersistencePath(workspaceRoot);
      const temporaryPath = `${path}.tmp`;
      const backupPath = `${path}.bak`;
      try { await filesystem.createDirectory(metadataDirectory); }
      catch (_error) { /* The shared project metadata directory may already exist. */ }
      const payload = `${JSON.stringify({
        schemaVersion: 1,
        type: TASK_DOCUMENT_TYPE,
        updatedAt: new Date().toISOString(),
        tasks: tasks.map((task) => {
          const persisted = cloneTask(task);
          delete persisted.origin;
          delete persisted.readOnly;
          return persisted;
        })
      }, null, 2)}\n`;
      await filesystem.writeFile(temporaryPath, payload);
      if (!filesystem.move) {
        await filesystem.writeFile(path, payload);
        await removeIfPresent(temporaryPath);
        return;
      }
      await removeIfPresent(backupPath);
      const hadExistingFile = await pathExists(path);
      if (hadExistingFile) await filesystem.move(path, backupPath);
      try {
        await filesystem.move(temporaryPath, path);
        await removeIfPresent(backupPath);
      } catch (error) {
        if (hadExistingFile && await pathExists(backupPath)) await filesystem.move(backupPath, path);
        throw error;
      }
    }

    function enqueueUserMutation(mutator) {
      const requestedRoot = state.workspaceRoot;
      const operation = writeQueue.then(async () => {
        if (!requestedRoot || workspaceKey(requestedRoot) !== workspaceKey(state.workspaceRoot)) {
          throw new Error("The active project changed before the task could be saved.");
        }
        if (state.error?.code === "tasks-load-failed") {
          throw new Error("Resolve the project tasks file error before saving tasks.");
        }
        state.saving = true;
        state.error = null;
        publish();
        try {
          const candidate = mutator(state.userTasks.map(cloneTask));
          await persistUserTasks(requestedRoot, candidate);
          if (workspaceKey(requestedRoot) !== workspaceKey(state.workspaceRoot)) return null;
          state.userTasks = candidate;
          state.saving = false;
          state.revision += 1;
          publish();
          return candidate;
        } catch (error) {
          if (workspaceKey(requestedRoot) === workspaceKey(state.workspaceRoot)) {
            state.saving = false;
            state.error = { code: "tasks-save-failed", message: String(error?.message || error) };
            publish();
          }
          throw error;
        }
      });
      writeQueue = operation.catch(() => null);
      return operation;
    }

    /** Persist and publish a new user-defined task. */
    async function createTask(input) {
      const task = normalizeUserTask(input);
      await enqueueUserMutation((tasks) => [...tasks, task]);
      return cloneTask(task);
    }

    /** Persist changes to one existing user-defined task. */
    async function updateTask(taskId, patch) {
      let updated = null;
      await enqueueUserMutation((tasks) => {
        const index = tasks.findIndex((task) => task.id === String(taskId || ""));
        if (index < 0) throw new Error("The selected user task no longer exists.");
        updated = normalizeUserTask(patch, tasks[index]);
        tasks[index] = updated;
        return tasks;
      });
      return cloneTask(updated);
    }

    /** Complete or reopen one user-defined task. */
    function setTaskCompleted(taskId, completed) {
      return updateTask(taskId, { status: completed ? "completed" : "open", completedAt: completed ? undefined : null });
    }

    /** Permanently delete one user-defined task. */
    async function deleteTask(taskId) {
      const id = String(taskId || "");
      await enqueueUserMutation((tasks) => {
        const index = tasks.findIndex((task) => task.id === id);
        if (index < 0) throw new Error("The selected user task no longer exists.");
        tasks.splice(index, 1);
        return tasks;
      });
      return true;
    }

    /** Atomically install read-only JDT tasks for a matching committed generation. */
    function replaceJdtTasks(snapshot = {}) {
      if (workspaceKey(snapshot.workspaceRoot) !== workspaceKey(state.workspaceRoot)) return false;
      state.jdtTasks = (snapshot.tasks || []).map(normalizeJdtTask).filter((task) => task.id);
      state.jdt = {
        status: "ready",
        generationId: Number(snapshot.generationId) || 0,
        snapshotId: String(snapshot.snapshotId || ""),
        error: null
      };
      state.revision += 1;
      publish();
      return true;
    }

    /** Clear read-only JDT tasks when their workspace is closed or replaced. */
    function clearJdtTasks(workspaceRoot = state.workspaceRoot) {
      if (workspaceKey(workspaceRoot) !== workspaceKey(state.workspaceRoot)) return false;
      state.jdtTasks = [];
      state.jdt = { status: "idle", generationId: 0, snapshotId: "", error: null };
      state.revision += 1;
      publish();
      return true;
    }

    /** Publish JDT task-source progress without changing its last committed rows. */
    function setJdtSourceState(next = {}) {
      if (next.workspaceRoot && workspaceKey(next.workspaceRoot) !== workspaceKey(state.workspaceRoot)) return false;
      state.jdt = {
        ...state.jdt,
        status: String(next.status || state.jdt.status),
        generationId: Number(next.generationId ?? state.jdt.generationId) || 0,
        snapshotId: String(next.snapshotId ?? state.jdt.snapshotId ?? ""),
        error: next.error ? { code: String(next.error.code || "jdt-tasks-failed"), message: String(next.error.message || next.error) } : null
      };
      state.revision += 1;
      publish();
      return true;
    }

    function getTask(taskId) {
      const id = String(taskId || "");
      const task = [...state.userTasks, ...state.jdtTasks].find((candidate) => candidate.id === id);
      return task ? cloneTask(task) : null;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(cloneState());
      return () => listeners.delete(listener);
    }

    const api = {
      openProject,
      getState: cloneState,
      getTask,
      subscribe,
      createTask,
      updateTask,
      setTaskCompleted,
      deleteTask,
      replaceJdtTasks,
      setJdtSourceState,
      clearJdtTasks,
      getPersistencePath,
      toProjectRelativePath
    };
    app?.registerModule?.("projectTaskStore", api);
    return api;
  }

  global.registerMarkdownViewerProjectTaskStore = registerMarkdownViewerProjectTaskStore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerProjectTaskStore };
  }
})(typeof window !== "undefined" ? window : globalThis);
