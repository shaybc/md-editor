(function(global) {
  "use strict";

  /**
   * Manage side rail icon visibility, ordering, and long-press drag behavior.
   * @param {object} app - Shared MD-Editor application registry.
   * @param {object} deps - Persistence and default preference dependencies.
   * @returns {object} Side rail preference operations.
   */
  global.registerMarkdownViewerSidebarRailPreferences = function registerMarkdownViewerSidebarRailPreferences(app, deps) {
    const LONG_PRESS_DELAY_MS = 400;
    const PRESS_MOVEMENT_THRESHOLD_PX = 8;
    const configurableIconIds = new Set(Object.keys(deps.defaultVisibility));
    const fixedBottomIconId = "settings";
    const aiCompanionIconId = "ai-companion";
    const knownIconIds = new Set(deps.defaultOrder);
    const boundRails = new WeakSet();
    let pressState = null;
    let suppressNextClick = false;

    /**
     * Return one complete, duplicate-free rail order.
     * @param {unknown} value - Saved rail order.
     * @returns {string[]} Normalized rail icon identifiers.
     */
    function normalizeOrder(value) {
      const normalized = [];
      const seen = new Set();
      if (Array.isArray(value)) {
        value.forEach((iconId) => {
          const normalizedId = String(iconId || "").trim();
          if (!knownIconIds.has(normalizedId) || normalizedId === fixedBottomIconId || seen.has(normalizedId)) return;
          seen.add(normalizedId);
          normalized.push(normalizedId);
        });
      }
      deps.defaultOrder.forEach((iconId) => {
        if (iconId === fixedBottomIconId || seen.has(iconId)) return;
        seen.add(iconId);
        normalized.push(iconId);
      });
      normalized.push(fixedBottomIconId);
      return normalized;
    }

    /**
     * Return visibility values for configurable rail icons.
     * @param {unknown} value - Saved visibility object.
     * @returns {object} Normalized visibility preferences.
     */
    function normalizeVisibility(value) {
      const savedVisibility = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      return Object.fromEntries(
        Object.keys(deps.defaultVisibility).map((iconId) => [iconId, savedVisibility[iconId] !== false])
      );
    }

    function getRail() {
      return document.querySelector(".sidebar-view-rail");
    }

    function getRailButtons(rail) {
      return Array.from(rail?.querySelectorAll?.(".sidebar-view-rail-button[data-sidebar-rail-icon]") || []);
    }

    function updateBottomArea(rail) {
      const buttons = getRailButtons(rail);
      const aiCompanionButton = buttons.find((button) => button.dataset.sidebarRailIcon === aiCompanionIconId);
      const settingsButton = buttons.find((button) => button.dataset.sidebarRailIcon === fixedBottomIconId);
      const aiCompanionIndex = buttons.indexOf(aiCompanionButton);
      const settingsIndex = buttons.indexOf(settingsButton);
      const isAiCompanionInBottomArea = !!aiCompanionButton
        && !aiCompanionButton.hidden
        && aiCompanionIndex === settingsIndex - 1;
      rail.classList.toggle("sidebar-rail-ai-bottom", isAiCompanionInBottomArea);
    }

    function clearDropPosition(rail) {
      getRailButtons(rail).forEach((button) => {
        button.classList.remove("sidebar-rail-drop-before", "sidebar-rail-drop-after");
      });
    }

    function collectCurrentOrder(rail) {
      return normalizeOrder(getRailButtons(rail).map((button) => button.dataset.sidebarRailIcon));
    }

    function persistCurrentOrder(rail) {
      deps.saveGlobalState({ sidebarRailIconOrder: collectCurrentOrder(rail) });
      deps.scheduleGlobalProfileWrite();
    }

    function cancelPendingPress() {
      if (!pressState) return;
      window.clearTimeout(pressState.timer);
      pressState = null;
    }

    function finishDrag(options = {}) {
      if (!pressState) return;
      const { button, rail, pointerId, isDragging } = pressState;
      window.clearTimeout(pressState.timer);
      clearDropPosition(rail);
      button.classList.remove("sidebar-rail-button-dragging");
      rail.classList.remove("sidebar-rail-dragging");
      if (button.hasPointerCapture?.(pointerId)) button.releasePointerCapture(pointerId);
      pressState = null;

      if (!isDragging) return;
      if (options.persist === false) {
        applyPreferences(deps.loadGlobalState(), { ensureActiveView: false });
        return;
      }
      suppressNextClick = true;
      persistCurrentOrder(rail);
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    function startDrag() {
      if (!pressState) return;
      pressState.isDragging = true;
      pressState.button.classList.add("sidebar-rail-button-dragging");
      pressState.rail.classList.add("sidebar-rail-dragging");
      pressState.button.setPointerCapture?.(pressState.pointerId);
    }

    function updateDragPosition(clientY) {
      if (!pressState?.isDragging) return;
      const { button, rail } = pressState;
      const visibleButtons = getRailButtons(rail).filter((candidate) => candidate !== button && !candidate.hidden);
      clearDropPosition(rail);
      const nextButton = visibleButtons.find((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return clientY < bounds.top + bounds.height / 2;
      });
      if (nextButton) {
        rail.insertBefore(button, nextButton);
        nextButton.classList.add("sidebar-rail-drop-before");
        updateBottomArea(rail);
        return;
      }
      const settingsButton = getRailButtons(rail).find((candidate) => candidate.dataset.sidebarRailIcon === fixedBottomIconId);
      if (settingsButton) {
        rail.insertBefore(button, settingsButton);
        settingsButton.classList.add("sidebar-rail-drop-before");
        updateBottomArea(rail);
      }
    }

    function handlePointerDown(event) {
      const button = event.target.closest?.(".sidebar-view-rail-button[data-sidebar-rail-icon]");
      const rail = button?.closest?.(".sidebar-view-rail");
      if (!button || !rail || button.hidden || button.dataset.sidebarRailIcon === fixedBottomIconId || event.button !== 0 || event.isPrimary === false) return;
      cancelPendingPress();
      pressState = {
        button,
        rail,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isDragging: false,
        timer: window.setTimeout(startDrag, LONG_PRESS_DELAY_MS)
      };
    }

    function handlePointerMove(event) {
      if (!pressState || event.pointerId !== pressState.pointerId) return;
      if (!pressState.isDragging) {
        const distance = Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY);
        if (distance > PRESS_MOVEMENT_THRESHOLD_PX) cancelPendingPress();
        return;
      }
      event.preventDefault();
      updateDragPosition(event.clientY);
    }

    function handlePointerUp(event) {
      if (!pressState || event.pointerId !== pressState.pointerId) return;
      finishDrag();
    }

    function handlePointerCancel(event) {
      if (!pressState || event.pointerId !== pressState.pointerId) return;
      finishDrag({ persist: false });
    }

    function handleClick(event) {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function handleContextMenu(event) {
      if (!pressState?.isDragging) return;
      event.preventDefault();
    }

    function bindRail(rail) {
      if (!rail || boundRails.has(rail)) return;
      boundRails.add(rail);
      rail.addEventListener("pointerdown", handlePointerDown);
      rail.addEventListener("click", handleClick, true);
      rail.addEventListener("contextmenu", handleContextMenu);
      document.addEventListener("pointermove", handlePointerMove, { passive: false });
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerCancel);
    }

    function ensureVisibleActiveView(rail) {
      const hiddenActiveButton = getRailButtons(rail).find((button) => {
        return button.hidden && (button.classList.contains("active") || button.getAttribute("aria-pressed") === "true");
      });
      if (!hiddenActiveButton) return;
      rail.querySelector('[data-sidebar-rail-icon="files"]')?.click();
    }

    /**
     * Apply saved ordering and visibility to the current side rail.
     * @param {object} state - Current global preference state.
     * @param {object} options - Application behavior options.
     */
    function applyPreferences(state = deps.loadGlobalState(), options = {}) {
      const rail = getRail();
      if (!rail) return;
      bindRail(rail);
      const order = normalizeOrder(state?.sidebarRailIconOrder);
      const visibility = normalizeVisibility(state?.sidebarRailIconVisibility);
      const buttonsById = new Map(getRailButtons(rail).map((button) => [button.dataset.sidebarRailIcon, button]));
      order.forEach((iconId) => {
        const button = buttonsById.get(iconId);
        if (button) rail.appendChild(button);
      });
      buttonsById.forEach((button, iconId) => {
        button.hidden = configurableIconIds.has(iconId) && visibility[iconId] === false;
      });
      updateBottomArea(rail);
      if (options.ensureActiveView !== false) ensureVisibleActiveView(rail);
    }

    const api = {
      normalizeOrder,
      normalizeVisibility,
      applyPreferences
    };
    app.modules = app.modules || {};
    app.modules.sidebarRailPreferences = api;
    return api;
  };
})(window);
