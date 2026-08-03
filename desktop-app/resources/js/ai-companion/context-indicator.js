(function(window, document) {
  "use strict";

  /**
   * Composer context indicator: a small donut ring next to the run/stop button showing how full
   * the model's context window is, with a hover tooltip carrying the exact numbers (current
   * context tokens, window size, and cumulative sent/received for the whole chat).
   *
   * Fed by two event streams from the bridge: `usage` (provider-reported token accounting,
   * authoritative) and `context` (chars/4 estimate, fallback shown only until real usage
   * arrives for the current request).
   */

  const RING_RADIUS = 7;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const WARNING_RATIO = 0.7;
  const DANGER_RATIO = 0.9;
  const DEFAULT_OUTPUT_RESERVE_TOKENS = 900;

  function formatTokenCount(value) {
    const tokens = Math.max(0, Math.round(Number(value) || 0));
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(tokens >= 10000000 ? 0 : 1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 100000 ? 0 : 1)}K`;
    return String(tokens);
  }

  function createMarkdownViewerAiCompanionContextIndicator(options = {}) {
    const container = options.container;
    if (!container) return null;
    const resolveModelInfo = typeof options.resolveModelInfo === "function" ? options.resolveModelInfo : () => null;
    const getModelName = typeof options.getModelName === "function" ? options.getModelName : () => "";
    const getOutputReserveTokens = typeof options.getOutputReserveTokens === "function"
      ? options.getOutputReserveTokens
      : () => DEFAULT_OUTPUT_RESERVE_TOKENS;
    const onTotalsChanged = typeof options.onTotalsChanged === "function" ? options.onTotalsChanged : null;
    const getContextFiles = typeof options.getContextFiles === "function" ? options.getContextFiles : () => [];
    const openContextFile = typeof options.openContextFile === "function" ? options.openContextFile : null;

    const state = {
      contextTokens: 0,
      reported: false,
      totalSent: 0,
      totalReceived: 0,
      totalsEstimated: false,
      requestCount: 0,
      hasData: false
    };
    let tooltipHideTimer = null;
    let contextFilesPanelOpen = false;
    let ignoreOutsidePanelCloseUntil = 0;

    const root = document.createElement("div");
    root.className = "ai-companion-context-indicator";
    root.setAttribute("role", "status");
    root.innerHTML = [
      `<svg class="ai-companion-context-ring" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">`,
      `<circle class="ai-companion-context-ring-track" cx="9" cy="9" r="${RING_RADIUS}" />`,
      `<circle class="ai-companion-context-ring-fill" cx="9" cy="9" r="${RING_RADIUS}"`,
      ` stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${RING_CIRCUMFERENCE.toFixed(2)}" />`,
      `</svg>`,
      `<div class="ai-companion-context-tooltip" role="tooltip" hidden></div>`
    ].join("");
    const fillCircle = root.querySelector(".ai-companion-context-ring-fill");
    const tooltip = root.querySelector(".ai-companion-context-tooltip");
    const contextFilesPanel = document.createElement("div");
    contextFilesPanel.className = "ai-companion-context-files-panel";
    contextFilesPanel.setAttribute("role", "dialog");
    contextFilesPanel.setAttribute("aria-label", "Context files");
    contextFilesPanel.hidden = true;
    container.insertBefore(root, options.beforeElement || null);
    document.body?.append(contextFilesPanel);

    function getWindowInfo() {
      const modelName = getModelName();
      const info = resolveModelInfo(modelName);
      const contextWindow = Number(info?.contextWindow) || 0;
      if (!contextWindow) return { modelName, contextWindow: 0, effectiveWindow: 0 };
      const reserve = Math.max(0, Number(getOutputReserveTokens()) || 0);
      return {
        modelName,
        contextWindow,
        effectiveWindow: Math.max(1, contextWindow - reserve)
      };
    }

    function getPercent() {
      const { effectiveWindow } = getWindowInfo();
      if (!effectiveWindow || !state.hasData) return null;
      return Math.min(1, state.contextTokens / effectiveWindow);
    }

    function renderRing() {
      const percent = getPercent();
      root.classList.toggle("empty", !state.hasData);
      root.classList.toggle("unknown-window", state.hasData && percent === null);
      root.classList.toggle("warning", percent !== null && percent >= WARNING_RATIO && percent < DANGER_RATIO);
      root.classList.toggle("danger", percent !== null && percent >= DANGER_RATIO);
      const shown = percent === null ? (state.hasData ? 1 : 0) : percent;
      fillCircle.style.strokeDashoffset = String((RING_CIRCUMFERENCE * (1 - shown)).toFixed(2));
      const label = percent === null
        ? (state.hasData ? `${formatTokenCount(state.contextTokens)} context tokens used` : "Context usage")
        : `Context window ${(percent * 100).toFixed(0)}% full`;
      root.setAttribute("aria-label", label);
    }

    function appendTooltipTitle(parent, text, extraClass = "") {
      const title = document.createElement("div");
      title.className = `ai-companion-context-tooltip-title${extraClass ? ` ${extraClass}` : ""}`;
      title.textContent = text;
      parent.append(title);
      return title;
    }

    function appendTooltipLine(parent, text, className = "") {
      const line = document.createElement("div");
      if (className) line.className = className;
      line.textContent = text;
      parent.append(line);
      return line;
    }

    function getContextFileGroups() {
      const groups = getContextFiles();
      return (Array.isArray(groups) ? groups : []).map((group) => ({
        title: String(group?.title || "").trim(),
        files: Array.isArray(group?.files) ? group.files.filter((file) => file?.name) : []
      })).filter((group) => group.title || group.files.length);
    }

    function hasContextFiles(groups) {
      return groups.some((group) => group.files.length);
    }

    function getContextFileIconClass(file = {}) {
      if (file.kind === "image") return "bi bi-file-earmark-image";
      if (file.kind === "code") return "bi bi-file-earmark-code";
      return "bi bi-file-earmark-text";
    }

    function createContextFileRow(file = {}) {
      const canOpen = !!file.openable && !!openContextFile;
      const row = document.createElement(canOpen ? "button" : "div");
      row.className = `ai-companion-context-file-row${canOpen ? " openable" : ""}`;
      if (canOpen) {
        row.type = "button";
        row.setAttribute("aria-label", `Open ${file.name}`);
        row.addEventListener("click", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          openContextFile(file);
        });
      }
      if (file.path) row.title = file.path;
      const icon = document.createElement("span");
      icon.className = "ai-companion-context-file-icon";
      const iconGlyph = document.createElement("i");
      iconGlyph.className = getContextFileIconClass(file);
      iconGlyph.setAttribute("aria-hidden", "true");
      icon.append(iconGlyph);
      const label = document.createElement("span");
      label.className = "ai-companion-context-file-name";
      label.textContent = file.name;
      row.append(icon, label);
      return row;
    }

    function renderContextFilesPanel() {
      contextFilesPanel.replaceChildren?.();
      if (typeof contextFilesPanel.replaceChildren !== "function") contextFilesPanel.innerHTML = "";

      const header = document.createElement("div");
      header.className = "ai-companion-context-files-header";
      const title = document.createElement("div");
      title.className = "ai-companion-context-files-title";
      title.textContent = "md-editor";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "ai-companion-context-files-close";
      close.title = "Close context files";
      close.setAttribute("aria-label", "Close context files");
      close.innerHTML = `<i class="bi bi-x" aria-hidden="true"></i>`;
      close.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        closeContextFilesPanel();
      });
      header.append(title, close);
      contextFilesPanel.append(header);

      const groups = getContextFileGroups();
      if (!hasContextFiles(groups)) {
        appendTooltipLine(contextFilesPanel, "No context files", "ai-companion-context-files-empty");
        return;
      }

      for (const group of groups) {
        if (!group.files.length) continue;
        const section = document.createElement("div");
        section.className = "ai-companion-context-files-section";
        const groupTitle = document.createElement("div");
        groupTitle.className = "ai-companion-context-files-section-title";
        groupTitle.textContent = group.title;
        const list = document.createElement("div");
        list.className = "ai-companion-context-file-list";
        group.files.forEach((file) => list.append(createContextFileRow(file)));
        section.append(groupTitle, list);
        contextFilesPanel.append(section);
      }
    }

    function positionContextFilesPanel() {
      if (!contextFilesPanelOpen || contextFilesPanel.hidden) return;
      const rect = root.getBoundingClientRect();
      const right = Math.max(12, window.innerWidth - rect.right - 10);
      const bottom = Math.max(12, window.innerHeight - rect.top + 14);
      contextFilesPanel.style.right = `${right}px`;
      contextFilesPanel.style.bottom = `${bottom}px`;
    }

    function openContextFilesPanel() {
      if (tooltipHideTimer) {
        window.clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
      ignoreOutsidePanelCloseUntil = Date.now() + 500;
      contextFilesPanelOpen = true;
      tooltip.hidden = true;
      renderContextFilesPanel();
      contextFilesPanel.hidden = false;
      positionContextFilesPanel();
    }

    function closeContextFilesPanel() {
      contextFilesPanelOpen = false;
      contextFilesPanel.hidden = true;
    }

    function renderTooltip() {
      const { modelName, contextWindow } = getWindowInfo();
      const percent = getPercent();
      tooltip.replaceChildren?.();
      if (typeof tooltip.replaceChildren !== "function") tooltip.innerHTML = "";
      if (percent !== null) {
        appendTooltipTitle(tooltip, "Context Tokens:");
        appendTooltipLine(tooltip, `${(percent * 100).toFixed(0)}% used (${formatTokenCount(state.contextTokens)} / ${formatTokenCount(contextWindow)})`);
      } else if (state.hasData) {
        appendTooltipTitle(tooltip, "Context Tokens:");
        appendTooltipLine(tooltip, `Context size unknown - add "${modelName || "this model"}" in Settings > AI Companion > Models`);
      } else {
        appendTooltipTitle(tooltip, "Context Tokens:");
        appendTooltipLine(tooltip, state.requestCount || state.totalSent || state.totalReceived
          ? "No token usage recorded for this chat"
          : "No requests sent yet in this chat");
      }
      if (state.totalSent || state.totalReceived) {
        const prefix = state.totalsEstimated ? "~" : "";
        appendTooltipTitle(tooltip, "Chat Tokens:", "ai-companion-context-tooltip-section");
        appendTooltipLine(tooltip, `Tx: ${prefix}${formatTokenCount(state.totalSent)} / Rx: ${prefix}${formatTokenCount(state.totalReceived)}`);
      }
      if (state.hasData) {
        appendTooltipLine(tooltip, modelName ? `(${modelName})` : "", "ai-companion-context-tooltip-model");
      }
      const actions = document.createElement("div");
      actions.className = "ai-companion-context-tooltip-actions";
      const filesButton = document.createElement("button");
      filesButton.type = "button";
      filesButton.className = "ai-companion-context-files-toggle";
      filesButton.setAttribute("aria-expanded", contextFilesPanelOpen ? "true" : "false");
      filesButton.innerHTML = `<i class="bi bi-folder2-open" aria-hidden="true"></i><span>Context files</span>`;
      filesButton.addEventListener("pointerdown", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        openContextFilesPanel();
      });
      filesButton.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
      });
      actions.append(filesButton);
      tooltip.append(actions);
    }

    function render() {
      renderRing();
      renderTooltip();
      if (contextFilesPanelOpen) renderContextFilesPanel();
    }

    /** Handle a provider-reported `usage` event for the active request. */
    function recordUsage(event) {
      const promptTokens = Math.max(0, Number(event?.promptTokens) || 0);
      const completionTokens = Math.max(0, Number(event?.completionTokens) || 0);
      state.contextTokens = promptTokens + completionTokens;
      state.reported = true;
      state.hasData = true;
      // Each request re-sends the conversation, so summing per-request usage counts the tokens
      // actually transferred/billed rather than unique content.
      state.totalSent += promptTokens;
      state.totalReceived += completionTokens;
      if (!state.requestCount) state.requestCount = 1;
      render();
      onTotalsChanged?.(getTotals());
    }

    /** Handle a chars/4 `context` estimate; never overrides reported usage for this request. */
    function recordEstimate(event) {
      const estimatedTokens = Math.max(0, Number(event?.estimatedTokens) || 0);
      if (!estimatedTokens) return;
      if (!state.reported) {
        state.contextTokens = estimatedTokens;
        state.hasData = true;
      }
      render();
    }

    /** A new request starts: reported usage from the previous round no longer wins. */
    function beginRequest() {
      state.reported = false;
      state.requestCount += 1;
    }

    function getTotals() {
      return {
        totalSent: state.totalSent,
        totalReceived: state.totalReceived,
        totalsEstimated: state.totalsEstimated,
        requestCount: state.requestCount,
        // Last known context occupancy, persisted so reloading a chat restores the ring and
        // tooltip instead of claiming no requests were sent.
        lastContextTokens: state.contextTokens,
        lastReported: state.reported
      };
    }

    /** Restore cumulative counters (and last context occupancy) from a saved chat record. */
    function restoreTotals(totals) {
      state.totalSent = Math.max(0, Number(totals?.totalSent) || 0);
      state.totalReceived = Math.max(0, Number(totals?.totalReceived) || 0);
      state.totalsEstimated = totals?.totalsEstimated === true;
      state.requestCount = Math.max(0, Number(totals?.requestCount) || 0);
      const lastContextTokens = Math.max(0, Number(totals?.lastContextTokens) || 0);
      if (lastContextTokens) {
        state.contextTokens = lastContextTokens;
        state.reported = totals?.lastReported === true;
        state.hasData = true;
      } else {
        state.contextTokens = 0;
        state.reported = false;
        state.hasData = false;
      }
      render();
    }

    function reset() {
      closeContextFilesPanel();
      state.contextTokens = 0;
      state.reported = false;
      state.totalSent = 0;
      state.totalReceived = 0;
      state.totalsEstimated = false;
      state.requestCount = 0;
      state.hasData = false;
      render();
    }

    function showTooltip() {
      if (tooltipHideTimer) {
        window.clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
      renderTooltip();
      if (!contextFilesPanelOpen) tooltip.hidden = false;
    }

    function hideTooltip() {
      renderTooltip();
      tooltip.hidden = true;
    }

    function scheduleTooltipHide() {
      if (tooltipHideTimer) window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = window.setTimeout(() => {
        tooltipHideTimer = null;
        hideTooltip();
      }, 180);
    }

    root.addEventListener("mouseenter", showTooltip);
    root.addEventListener("mouseleave", scheduleTooltipHide);
    root.addEventListener("focusin", showTooltip);
    root.addEventListener("focusout", (event) => {
      if (contextFilesPanelOpen) return;
      if (!root.contains(event.relatedTarget)) scheduleTooltipHide();
    });
    tooltip.addEventListener("mouseenter", showTooltip);
    tooltip.addEventListener("mouseleave", scheduleTooltipHide);
    contextFilesPanel.addEventListener("click", (event) => event.stopPropagation?.());
    document.addEventListener("click", (event) => {
      if (!contextFilesPanelOpen || Date.now() < ignoreOutsidePanelCloseUntil) return;
      if (root.contains(event.target) || contextFilesPanel.contains(event.target)) return;
      closeContextFilesPanel();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !contextFilesPanelOpen) return;
      closeContextFilesPanel();
    });
    window.addEventListener("resize", positionContextFilesPanel);
    window.addEventListener("scroll", positionContextFilesPanel, true);

    render();
    return { recordUsage, recordEstimate, beginRequest, restoreTotals, getTotals, reset, refresh: render };
  }

  window.createMarkdownViewerAiCompanionContextIndicator = createMarkdownViewerAiCompanionContextIndicator;
})(window, document);
