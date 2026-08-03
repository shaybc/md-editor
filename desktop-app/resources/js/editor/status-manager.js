(function(global) {
  "use strict";

  /** Owns temporary messages displayed in the status-bar tip area. */
  function registerMarkdownViewerStatusManager(app, deps = {}) {
    const statusElement = deps.statusElement;
    const getDefaultLabel = deps.getDefaultLabel || function() { return ""; };
    const backgroundProcesses = deps.backgroundProcesses || app?.modules?.backgroundProcesses;
    const statuses = new Map();
    let activeStatus = null;
    let nextSequence = 1;

    function selectActiveStatus() {
      return Array.from(statuses.values()).sort((left, right) => {
        if (left.showProgress !== right.showProgress) return right.showProgress === true ? 1 : -1;
        if (left.priority !== right.priority) return right.priority - left.priority;
        return right.sequence - left.sequence;
      })[0] || null;
    }

    function render() {
      if (!statusElement) return;
      const cancelSuffix = activeStatus?.cancelPending ? " · Cancelling..." : "";
      statusElement.textContent = activeStatus ? `${activeStatus.label}${cancelSuffix}` : getDefaultLabel();
      const canCancel = false;
      statusElement.classList.toggle("status-progress-loop", activeStatus?.showProgress === true);
      statusElement.classList.toggle("status-cancellable", canCancel);
      if (activeStatus) {
        statusElement.dataset.statusId = activeStatus.id;
      } else {
        delete statusElement.dataset.statusId;
      }
    }

    /** Request cancellation from the owner of the currently displayed status. */
    function cancelActiveStatus() {
      if (typeof activeStatus?.onCancel !== "function" || activeStatus.cancelPending) return false;
      const cancellingStatus = activeStatus;
      cancellingStatus.cancelPending = true;
      render();
      Promise.resolve(cancellingStatus.onCancel()).catch((error) => {
        if (activeStatus === cancellingStatus) {
          cancellingStatus.cancelPending = false;
          render();
        }
        deps.onCancelError?.(error, cancellingStatus);
      });
      return true;
    }

    /**
     * Display or update one temporary status while retaining other status owners.
     * @param {{id: string, label: string, showProgress?: boolean, onCancel?: Function, cancelLabel?: string, priority?: number}} status Temporary status request.
     * @returns {boolean} Whether a valid status was displayed.
     */
    function setStatus(status = {}) {
      const id = String(status.id || "").trim();
      const label = String(status.label || "").trim();
      if (!id || !label) return false;
      const normalizedStatus = {
        id,
        label,
        showProgress: status.showProgress === true,
        onCancel: typeof status.onCancel === "function" ? status.onCancel : null,
        cancelLabel: String(status.cancelLabel || "").trim(),
        cancelPending: false,
        priority: Number.isFinite(Number(status.priority)) ? Number(status.priority) : 0,
        sequence: nextSequence++,
        backgroundProcess: status.backgroundProcess || null
      };
      statuses.delete(id);
      if (normalizedStatus.backgroundProcess?.outcome) {
        backgroundProcesses?.complete?.(id, normalizedStatus.backgroundProcess.outcome, { description: label });
      } else if (normalizedStatus.backgroundProcess) {
        backgroundProcesses?.start?.({ ownerId: id, description: label, onCancel: normalizedStatus.onCancel, ...normalizedStatus.backgroundProcess });
      }
      statuses.set(id, normalizedStatus);
      activeStatus = selectActiveStatus();
      render();
      return true;
    }

    /**
     * Release the displayed status only when the caller still owns it.
     * @param {string} id Unique identifier supplied when the status was set.
     * @returns {boolean} Whether the matching status was released.
     */
    function unsetStatus(id, options = {}) {
      const normalizedId = String(id || "").trim();
      const ownedActiveStatus = activeStatus?.id === normalizedId;
      const status = statuses.get(normalizedId);
      if (!statuses.delete(normalizedId)) return false;
      activeStatus = selectActiveStatus();
      if (status?.backgroundProcess) backgroundProcesses?.complete?.(normalizedId, options.outcome || "finished", { description: options.description || status.label });
      if (!ownedActiveStatus) return false;
      render();
      return true;
    }

    /** Refresh the displayed default without replacing an active temporary status. */
    function refresh() {
      render();
    }


    const api = { setStatus, unsetStatus, refresh, cancelActiveStatus };
    app.registerModule?.("statusManager", api);
    render();
    return api;
  }

  global.registerMarkdownViewerStatusManager = registerMarkdownViewerStatusManager;
})(typeof window !== "undefined" ? window : globalThis);
