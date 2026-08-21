// Read-only Stats for Geeks dialog.
(function(global) {
  "use strict";

  function createElement(documentRef, tagName, className, text) {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(Number(value) || 0);
  }

  function formatDuration(value) {
    let milliseconds = Math.max(0, Number(value) || 0);
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${formatNumber(seconds, 1)} sec`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${formatNumber(minutes, 1)} min`;
    const hours = minutes / 60;
    if (hours < 24) return `${formatNumber(hours, 1)} hr`;
    return `${formatNumber(hours / 24, 1)} days`;
  }

  function metric(documentRef, label, value, description) {
    const card = createElement(documentRef, "article", "statistics-metric");
    card.append(
      createElement(documentRef, "strong", "statistics-metric-value", value),
      createElement(documentRef, "span", "statistics-metric-label", label)
    );
    if (description) card.appendChild(createElement(documentRef, "small", "statistics-metric-description", description));
    return card;
  }

  /** Register the read-only Help > Stats for Geeks dialog. */
  function registerMarkdownViewerStatisticsDialog(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const statistics = deps.statistics || app?.services?.statistics;
    if (!documentRef || !statistics?.getSnapshot) return null;
    let modal = null;
    let content = null;
    let lastInvoker = null;
    let refreshTimer = null;

    function close() {
      if (!modal) return;
      modal.style.display = "none";
      if (refreshTimer) global.clearInterval?.(refreshTimer);
      refreshTimer = null;
      lastInvoker?.focus?.();
      lastInvoker = null;
    }

    function createSection(title, iconClass, cards) {
      const section = createElement(documentRef, "section", "statistics-section");
      const heading = createElement(documentRef, "h3", "statistics-section-title");
      const icon = createElement(documentRef, "i", `bi ${iconClass}`);
      icon.setAttribute("aria-hidden", "true");
      heading.append(icon, documentRef.createTextNode(title));
      const grid = createElement(documentRef, "div", "statistics-metric-grid");
      cards.forEach((card) => grid.appendChild(card));
      section.append(heading, grid);
      return section;
    }

    function renderModeBreakdown(summary) {
      const block = createElement(documentRef, "div", "statistics-mode-breakdown");
      block.appendChild(createElement(documentRef, "h4", "statistics-mode-title", "AI requests by mode"));
      const entries = Object.entries(summary.ai.requestsByMode).sort((left, right) => right[1] - left[1]);
      const list = createElement(documentRef, "div", "statistics-mode-list");
      if (!entries.length) list.appendChild(createElement(documentRef, "span", "statistics-empty", "No AI requests recorded yet."));
      entries.forEach(([mode, count]) => {
        const row = createElement(documentRef, "div", "statistics-mode-row");
        row.append(
          createElement(documentRef, "span", "statistics-mode-name", mode),
          createElement(documentRef, "strong", "statistics-mode-count", formatNumber(count))
        );
        list.appendChild(row);
      });
      block.appendChild(list);
      return block;
    }

    function render() {
      if (!content) return;
      const summary = statistics.getSnapshot();
      content.replaceChildren();
      const trackingDate = new Date(summary.trackingStartedAt);
      content.appendChild(createElement(
        documentRef,
        "p",
        "statistics-tracking-note",
        `Statistics are stored locally on this device and have been collected since ${trackingDate.toLocaleString()}. Earlier activity is not estimated.`
      ));
      content.appendChild(createSection("Developer activity", "bi-person-workspace", [
        metric(documentRef, "Characters saved", formatNumber(summary.user.charactersSaved), `${formatNumber(summary.user.saves)} successful saves`),
        metric(documentRef, "Projects worked on", formatNumber(summary.user.projectsWorkedOn), "Distinct opened workspace folders"),
        metric(documentRef, "AI chats active", formatNumber(summary.ai.conversations), "Chats with at least one recorded request"),
        metric(documentRef, "Runs initiated", formatNumber(summary.user.runs), `Average ${formatDuration(summary.user.averageRunDurationMs)}`),
        metric(documentRef, "Longest run", formatDuration(summary.user.maxRunDurationMs)),
        metric(documentRef, "Builds / compiles", formatNumber(summary.user.builds), `Average ${formatDuration(summary.user.averageBuildDurationMs)}`)
      ]));
      const aiSection = createSection("AI usage", "bi-stars", [
        metric(documentRef, "Tokens sent", formatNumber(summary.ai.promptTokens)),
        metric(documentRef, "Tokens received", formatNumber(summary.ai.completionTokens)),
        metric(documentRef, "Total tokens", formatNumber(summary.ai.totalTokens)),
        metric(documentRef, "Requests", formatNumber(summary.ai.requests), `Average ${formatNumber(summary.ai.averageRequestsPerConversation, 1)} per chat`),
        metric(documentRef, "Maximum in one chat", formatNumber(summary.ai.maxRequestsPerConversation)),
        metric(documentRef, "Tools activated", formatNumber(summary.ai.toolActivations)),
        metric(documentRef, "Total AI duration", formatDuration(summary.ai.requestDurationMs)),
        metric(documentRef, "Average AI duration", formatDuration(summary.ai.averageRequestDurationMs)),
        metric(documentRef, "Maximum AI duration", formatDuration(summary.ai.maxRequestDurationMs))
      ]);
      aiSection.appendChild(renderModeBreakdown(summary));
      content.appendChild(aiSection);
      content.appendChild(createSection("Git activity", "bi-git", [
        metric(documentRef, "Lines added", formatNumber(summary.git.additions), "Recorded successful commit summaries"),
        metric(documentRef, "Lines deleted", formatNumber(summary.git.deletions), "Recorded successful commit summaries"),
        metric(documentRef, "Files changed", formatNumber(summary.git.filesChanged), "Cumulative files in recorded commits"),
        metric(documentRef, "Commits", formatNumber(summary.git.commits)),
        metric(documentRef, "Pushes", formatNumber(summary.git.pushes)),
        metric(documentRef, "Pull requests", formatNumber(summary.git.pullRequests))
      ]));
      content.appendChild(createSection("Application", "bi-speedometer2", [
        metric(documentRef, "Total run time", formatDuration(summary.app.totalRuntimeMs)),
        metric(documentRef, "Longest uptime", formatDuration(summary.app.maxUptimeMs)),
        metric(documentRef, "Average uptime", formatDuration(summary.app.averageUptimeMs)),
        metric(documentRef, "Launches", formatNumber(summary.app.launches))
      ]));
    }

    function ensureModal() {
      if (modal) return modal;
      modal = createElement(documentRef, "div", "reset-modal-overlay statistics-modal");
      modal.id = "statistics-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "statistics-modal-title");
      modal.style.display = "none";
      const box = createElement(documentRef, "section", "reset-modal-box statistics-modal-box");
      const header = createElement(documentRef, "header", "statistics-modal-header");
      const heading = createElement(documentRef, "div", "statistics-modal-heading");
      const title = createElement(documentRef, "h2", "statistics-modal-title", "Stats for Geeks");
      title.id = "statistics-modal-title";
      heading.append(title, createElement(documentRef, "p", "statistics-modal-subtitle", "A read-only view of your local MD-Editor activity."));
      const headerClose = createElement(documentRef, "button", "statistics-modal-close", "×");
      headerClose.type = "button";
      headerClose.title = "Close";
      headerClose.setAttribute("aria-label", "Close Stats for Geeks dialog");
      headerClose.addEventListener("click", close);
      header.append(heading, headerClose);
      content = createElement(documentRef, "div", "statistics-modal-content");
      const actions = createElement(documentRef, "div", "reset-modal-actions statistics-modal-actions");
      const closeButton = createElement(documentRef, "button", "reset-modal-btn", "Close");
      closeButton.type = "button";
      closeButton.addEventListener("click", close);
      actions.appendChild(closeButton);
      box.append(header, content, actions);
      modal.appendChild(box);
      modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
      documentRef.body.appendChild(modal);
      return modal;
    }

    function open(options = {}) {
      lastInvoker = options.invoker || documentRef.activeElement;
      const dialog = ensureModal();
      render();
      dialog.style.display = "flex";
      refreshTimer = global.setInterval?.(render, 1000) || null;
      dialog.querySelector(".statistics-modal-close")?.focus();
    }

    documentRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal?.style.display !== "none") close();
    });
    const api = { open, close, render };
    app?.registerModule?.("statisticsDialog", api);
    return api;
  }

  global.registerMarkdownViewerStatisticsDialog = registerMarkdownViewerStatisticsDialog;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatDuration, formatNumber, registerMarkdownViewerStatisticsDialog };
  }
})(typeof window !== "undefined" ? window : globalThis);
