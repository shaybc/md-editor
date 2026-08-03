(function(global) {
  "use strict";

  /** Owns Neutralino spawned-process event dispatch for every desktop subsystem. */
  function registerMarkdownViewerSpawnedProcessRouter(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const ownersByProcessId = new Map();
    const pendingEventsByProcessId = new Map();
    const MAX_PENDING_EVENTS = 64;
    const MAX_PENDING_BYTES = 256 * 1024;
    const PENDING_TTL_MS = 1000;
    let pendingBytes = 0;
    let listenerAttached = false;

    function getProcessId(value) {
      const processId = value && typeof value === "object" ? value.id : value;
      return processId === null || processId === undefined || processId === "" ? "" : String(processId);
    }

    function getEventSize(detail) {
      return String(detail?.data || "").length;
    }

    function dropExpiredPendingEvents(now = Date.now()) {
      pendingEventsByProcessId.forEach((entry, processId) => {
        if (now - entry.createdAt <= PENDING_TTL_MS) return;
        pendingBytes -= entry.bytes;
        pendingEventsByProcessId.delete(processId);
      });
    }

    function bufferUnownedEvent(detail) {
      const processId = getProcessId(detail?.id);
      if (!processId) return;
      dropExpiredPendingEvents();
      const size = getEventSize(detail);
      if (size > MAX_PENDING_BYTES) return;
      while (pendingBytes + size > MAX_PENDING_BYTES || countPendingEvents() >= MAX_PENDING_EVENTS) {
        const first = pendingEventsByProcessId.entries().next().value;
        if (!first) break;
        const [firstId, firstEntry] = first;
        const removed = firstEntry.events.shift();
        const removedSize = getEventSize(removed);
        firstEntry.bytes -= removedSize;
        pendingBytes -= removedSize;
        if (!firstEntry.events.length) pendingEventsByProcessId.delete(firstId);
      }
      const entry = pendingEventsByProcessId.get(processId) || { createdAt: Date.now(), bytes: 0, events: [] };
      entry.events.push(detail);
      entry.bytes += size;
      pendingBytes += size;
      pendingEventsByProcessId.set(processId, entry);
    }

    function countPendingEvents() {
      let count = 0;
      pendingEventsByProcessId.forEach((entry) => { count += entry.events.length; });
      return count;
    }

    function deliver(owner, detail) {
      if (!owner) return;
      if (detail.action === "stdOut") owner.onStdout?.(detail.data || "", detail);
      else if (detail.action === "stdErr") owner.onStderr?.(detail.data || "", detail);
      else if (detail.action === "exit") owner.onExit?.(detail);
      else owner.onEvent?.(detail);
    }

    /** Route one Neutralino event only to the subsystem that owns its process. */
    function handleSpawnedProcessEvent(event) {
      const detail = event?.detail || {};
      const processId = getProcessId(detail.id);
      const owner = ownersByProcessId.get(processId);
      if (!owner) {
        bufferUnownedEvent(detail);
        return;
      }
      deliver(owner, detail);
      if (detail.action === "exit") ownersByProcessId.delete(processId);
    }

    /** Register callbacks for a spawned process and replay bounded startup-race output. */
    function registerProcess(processHandle, handlers = {}) {
      const processId = getProcessId(processHandle);
      if (!processId) return function() {};
      ownersByProcessId.set(processId, handlers);
      dropExpiredPendingEvents();
      const pending = pendingEventsByProcessId.get(processId);
      if (pending) {
        pendingEventsByProcessId.delete(processId);
        pendingBytes -= pending.bytes;
        pending.events.forEach((detail) => deliver(handlers, detail));
      }
      return function unregisterOwnedProcess() {
        if (ownersByProcessId.get(processId) === handlers) ownersByProcessId.delete(processId);
      };
    }

    /** Remove process ownership without changing the spawned process itself. */
    function unregisterProcess(processHandle) {
      const processId = getProcessId(processHandle);
      return ownersByProcessId.delete(processId);
    }

    /** Spawn a process and immediately associate its output with one owner. */
    async function spawnTracked(command, options, handlers = {}) {
      if (!Neutralino?.os?.spawnProcess) throw new Error("Tracked processes require the Neutralino desktop runtime.");
      const handle = await Neutralino.os.spawnProcess(command, options);
      const unregister = registerProcess(handle, handlers);
      return { handle, unregister };
    }

    /** Attach the one global Neutralino process listener. */
    async function start() {
      if (listenerAttached || !Neutralino?.events?.on) return listenerAttached;
      await Neutralino.events.on("spawnedProcess", handleSpawnedProcessEvent);
      listenerAttached = true;
      return true;
    }

    /** Release router-owned state during application shutdown. */
    function dispose() {
      ownersByProcessId.clear();
      pendingEventsByProcessId.clear();
      pendingBytes = 0;
    }

    const api = {
      start,
      registerProcess,
      unregisterProcess,
      spawnTracked,
      dispose,
      _test: { handleSpawnedProcessEvent, countPendingEvents, getProcessId }
    };
    app?.registerModule?.("spawnedProcessRouter", api);
    void start();
    return api;
  }

  global.registerMarkdownViewerSpawnedProcessRouter = registerMarkdownViewerSpawnedProcessRouter;
})(typeof window !== "undefined" ? window : globalThis);
