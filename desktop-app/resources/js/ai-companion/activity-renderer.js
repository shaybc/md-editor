(function(window, document) {
  "use strict";

  function createMarkdownViewerAiCompanionActivityRenderer(deps) {
    const copyActions = window.createMarkdownViewerAiCompanionCopyActions?.({
      onCopied: deps.onCopied,
      onCopyError: deps.onCopyError,
      onOpenTabError: deps.onOpenTabError,
      openMarkdownInNewTab: deps.openMarkdownInNewTab
    }) || null;
    const rowsById = new Map();
    // Approval cards live outside tool groups but share the same focus behavior.
    const externalRowsById = new Map();
    const activitiesById = new Map();
    // Ordered log of timeline entries (tool activities and narration blocks)
    // so "Copy all activities" reproduces the timeline in display order.
    const timelineLog = [];
    // Collapsed tool groups: once narration is present, consecutive tool
    // activities render inside one expandable group row ("Ran 2 commands")
    // instead of as individual top-level cards. Pure presentation — the
    // timelineLog, rowsById counts, and copy output are unaffected.
    const groupsByActivityId = new Map();
    let narrationSeen = false;
    let openToolGroup = null;
    let latestActivityCompletedAt = 0;
    let timelineDetails = null;
    let timelineBody = null;
    let timelineSummaryText = null;
    let resultArea = null;

    function createElement(tagName, className, textContent) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      if (textContent !== undefined) element.textContent = textContent;
      return element;
    }

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    function appendTextWithCode(parent, text) {
      const parts = String(text || "").split(/(`[^`]+`)/g).filter(Boolean);
      parts.forEach((part) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          parent.append(createElement("code", "ai-companion-inline-code", part.slice(1, -1)));
        } else {
          parent.append(document.createTextNode(part));
        }
      });
    }

    function renderMarkdownResponse(parent, text) {
      if (typeof deps.renderMarkdownContent === "function" && deps.renderMarkdownContent(parent, text, { renderFrontmatter: false })) return true;
      parent.classList?.remove("markdown-body");
      parent.innerHTML = "";
      appendTextWithCode(parent, text);
      return false;
    }

    function attachCopyAction(element, getMarkdown, label, options = {}) {
      return copyActions?.attachCopyAction?.(element, getMarkdown, { ...options, label }) || null;
    }

    function insertActionBeforeTimestamp(actions, button) {
      const timestamp = Array.from(actions.children || []).find((child) => child.classList?.contains?.("ai-companion-box-timestamp"));
      if (timestamp) actions.insertBefore(button, timestamp);
      else actions.append(button);
    }

    function appendSplitTaskButton(actions, event) {
      if (!actions || typeof deps.onSplitTask !== "function") return;
      const button = createElement("button", "ai-companion-box-copy ai-companion-box-split-chat");
      button.type = "button";
      button.title = "Split new chat from here";
      button.setAttribute("aria-label", button.title);
      const icon = createElement("i", "bi bi-signpost-split");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault?.();
        clickEvent.stopPropagation?.();
        button.disabled = true;
        Promise.resolve(deps.onSplitTask(event)).finally(() => {
          button.disabled = false;
        });
      });
      insertActionBeforeTimestamp(actions, button);
    }

    function appendContinueTaskButton(actions, event) {
      const status = String(event?.status || "").toLowerCase();
      if (!actions || !["aborted", "cancelled", "canceled"].includes(status) || typeof deps.onContinueTask !== "function") return;
      const button = createElement("button", "ai-companion-box-copy ai-companion-box-continue-task");
      button.type = "button";
      button.title = "Continue task from this point";
      button.setAttribute("aria-label", button.title);
      const icon = createElement("i", "bi bi-play-fill");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault?.();
        clickEvent.stopPropagation?.();
        void deps.onContinueTask(event);
      });
      insertActionBeforeTimestamp(actions, button);
    }

    function appendWorkspaceResponseBadge(target) {
      if (!target) return null;
      target.querySelector?.(".ai-companion-workspace-role-badge")?.remove?.();
      const badge = createElement("span", "ai-companion-workspace-role-badge agent");
      badge.setAttribute("aria-hidden", "true");
      badge.setAttribute("data-role-label", "Agent");
      badge.title = "Agent";
      badge.append(createElement("i", "bi bi-stars"));
      target.append(badge);
      return badge;
    }

    function addMarkdownLine(lines, label, value) {
      const text = String(value || "").trim();
      if (text) lines.push(`- ${label}: ${text}`);
    }

    function formatActivityMarkdown(activity = {}) {
      const lines = [`### ${activity.title || activity.tool || "Agent action"}`];
      addMarkdownLine(lines, "Status", activity.status || "running");
      addMarkdownLine(lines, "Tool", activity.tool || "");
      addMarkdownLine(lines, "Detail", activity.primaryText || "");
      addMarkdownLine(lines, "Context", activity.secondaryText || "");
      addMarkdownLine(lines, "Result", activity.resultSummary || "");
      if (activity.durationMs !== undefined) addMarkdownLine(lines, "Duration", formatDuration(activity.durationMs));
      const links = (activity.links || []).filter((link) => link?.path);
      if (links.length) {
        lines.push("", "Links:");
        links.forEach((link) => lines.push(`- ${link.label || link.path}: ${link.path}${link.line ? `:${link.line}` : ""}`));
      }
      const webLinks = (activity.webLinks || []).filter((link) => link?.url);
      if (webLinks.length) {
        lines.push("", "Sources:");
        webLinks.forEach((link) => lines.push(`- [${link.label || link.url}](${link.url})`));
      }
      return lines.join("\n");
    }

    function formatActivitiesMarkdown() {
      if (!timelineLog.length) return "No activity recorded.";
      return timelineLog
        .map((entry) => entry.kind === "narration"
          ? entry.text
          : formatActivityMarkdown(activitiesById.get(entry.id) || {}))
        .join("\n\n");
    }

    function formatFileLineDelta(file = {}) {
      const additions = Number(file.additions) || 0;
      const deletions = Number(file.deletions) || 0;
      const parts = [];
      if (additions) parts.push(`+${additions}`);
      if (deletions) parts.push(`-${deletions}`);
      return parts.length ? ` ${parts.join(" ")}` : "";
    }

    function createLineDeltaElement(file = {}) {
      const additions = Number(file.additions) || 0;
      const deletions = Number(file.deletions) || 0;
      if (!additions && !deletions) return null;
      const delta = createElement("span", "ai-companion-summary-line-delta");
      if (additions) delta.append(createElement("span", "ai-companion-summary-line-added", `+${additions}`));
      if (deletions) delta.append(createElement("span", "ai-companion-summary-line-removed", `-${deletions}`));
      return delta;
    }

    function formatSummaryFiles(files) {
      return (files || [])
        .filter((file) => file?.path || file?.name)
        .map((file) => `- ${file.path || file.name}${formatFileLineDelta(file)}${file.description ? `: ${file.description}` : ""}`);
    }

    function appendSummaryFileLines(lines, heading, files) {
      const fileLines = formatSummaryFiles(files);
      if (!fileLines.length) return;
      lines.push("", heading, ...fileLines);
    }

    function flattenBlockedChanges(groups = []) {
      return groups.flatMap((group) => (Array.isArray(group?.items) ? group.items : []).map((item) => ({
        path: item.path || item.tool || "proposal",
        description: [item.tool, item.reason].filter(Boolean).join(" - ")
      })));
    }

    function getSummaryFinalResponse(event = {}) {
      const finalResponse = String(event.finalResponse || "").trim();
      if (finalResponse) return finalResponse;
      return event.isError === true ? String(event.outcome || "").trim() : "";
    }

    function getSummaryWorkedLabel(event = {}) {
      const workedLabel = String(event.workedLabel || "").trim();
      return workedLabel || `Worked for ${formatDuration(event.elapsedMs)}`;
    }

    function formatSummaryMarkdown(event = {}) {
      const status = getSummaryStatus(event);
      const workedLabel = getSummaryWorkedLabel(event);
      const lines = [
        workedLabel,
        status.label
      ];
      const finalResponse = getSummaryFinalResponse(event);
      if (finalResponse) lines.push("", finalResponse);
      appendSummaryFileLines(lines, "Changed files:", Array.isArray(event.changedFiles) ? event.changedFiles : []);
      appendSummaryFileLines(lines, "Attempted changes:", Array.isArray(event.attemptedChanges) ? event.attemptedChanges : []);
      appendSummaryFileLines(lines, "Blocked proposals:", flattenBlockedChanges(Array.isArray(event.blockedChanges) ? event.blockedChanges : []));
      (event.notes || []).forEach((note) => lines.push("", String(note || "").trim()));
      if (Array.isArray(event.validation) && event.validation.length) lines.push("", `Validation passed: ${event.validation.join(", ")}.`);
      lines.push("", workedLabel);
      return lines.filter((line, index, source) => line || source[index - 1]).join("\n");
    }


    function getTimestampMs(...values) {
      for (const value of values) {
        if (!value) continue;
        const numeric = Number(value);
        const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
        const timestamp = date.getTime();
        if (!Number.isNaN(timestamp)) return timestamp;
      }
      return 0;
    }

    function getEventTimestamp(event = {}) {
      const activity = event.activity || {};
      return getTimestampMs(activity.completedAt, event.completedAt, event.updatedAt, event.createdAt);
    }
    function attachTimelineCopyAction() {
      if (!timelineDetails) return;
      attachCopyAction(timelineDetails, formatActivitiesMarkdown, "Copy all activities as Markdown", { timestamp: latestActivityCompletedAt });
    }

    function updateLatestActivityCompletedAt(event = {}) {
      const activity = event.activity || {};
      if (activity.status === "running") return;
      const completedAt = getEventTimestamp(event);
      if (completedAt > latestActivityCompletedAt) latestActivityCompletedAt = completedAt;
    }
    function getPathOpenErrorDetails(error) {
      return {
        name: error?.name || "Error",
        message: error?.message || String(error || "Unable to open link")
      };
    }

    function openPathLink(link) {
      const open = link.kind === "folder" ? deps.openFolder : deps.openFile;
      if (typeof open !== "function") return;
      Promise.resolve(open(link.path, link.line)).catch((error) => {
        console.warn("Failed to open AI Companion activity link:", link.path, error);
        try {
          deps.onLinkOpenError?.({
            link,
            error: getPathOpenErrorDetails(error)
          });
        } catch (reportError) {
          console.warn("Failed to report AI Companion activity link error:", reportError);
        }
      });
    }

    function createPathButton(link) {
      const button = createElement("button", "ai-companion-activity-link");
      button.type = "button";
      button.textContent = link.label || link.path || "path";
      button.title = link.path || "";
      button.addEventListener("click", () => {
        openPathLink(link);
      });
      return button;
    }

    function createWebLink(link) {
      const anchor = createElement("a", "ai-companion-activity-link");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.label || link.url;
      anchor.title = link.url;
      if (typeof deps.openExternalUrl === "function") {
        anchor.addEventListener("click", (event) => {
          event.preventDefault?.();
          Promise.resolve(deps.openExternalUrl(link.url)).catch((error) => deps.onLinkOpenError?.({ link, error: getPathOpenErrorDetails(error) }));
        });
      }
      return anchor;
    }

    function createCompareButton(compare) {
      const button = createElement("button", "ai-companion-activity-action", "Compare");
      button.type = "button";
      button.addEventListener("click", () => deps.openCompare?.(compare));
      return button;
    }

    function getRollbackMetadata(value = {}) {
      return value.changeJournal || value.raw?.result?.changeJournal || null;
    }

    function hasRollbackMetadata(value = {}) {
      const metadata = getRollbackMetadata(value);
      if (metadata?.restorable === true) return true;
      return Array.isArray(metadata?.mutations) && metadata.mutations.some((entry) => entry?.restorable === true);
    }

    function createRollbackButton(label, title, handler, payload) {
      const button = createElement("button", "ai-companion-activity-action ai-companion-rollback-action");
      button.type = "button";
      button.title = title;
      button.append(createElement("i", "bi bi-arrow-counterclockwise"), createElement("span", "", label));
      const disabled = deps.isRollbackDisabled?.() === true;
      button.disabled = disabled;
      if (disabled) button.title = "Rollback is disabled while an agent task is running";
      button.addEventListener("click", () => {
        if (button.disabled) return;
        handler?.(payload);
      });
      return button;
    }

    function appendRollbackTaskButton(actions, event) {
      if (!actions || typeof deps.onRollbackTask !== "function") return;
      const files = Array.isArray(event.changedFiles) ? event.changedFiles : [];
      if (!files.some(hasRollbackMetadata) && !hasRollbackMetadata(event)) return;
      actions.append(createRollbackButton("Rollback task", "Preview rollback for this task", deps.onRollbackTask, event));
    }

    function renderRawDetails(activity) {
      if (!activity.raw) return null;
      const details = createElement("details", "ai-companion-activity-details");
      const summary = createElement("summary", "", "Details");
      const body = createElement("pre", "", JSON.stringify(activity.raw, null, 2));
      details.append(summary, body);
      return details;
    }

    function ensureResultArea() {
      if (resultArea?.isConnected) return resultArea;
      resultArea = createElement("div", "ai-companion-result-area");
      deps.container.appendChild(resultArea);
      return resultArea;
    }

    function ensureTimeline() {
      if (timelineDetails?.parentNode === deps.container && timelineBody) return timelineBody;
      timelineDetails = createElement("details", "ai-companion-activity-timeline");
      timelineDetails.open = true;
      const summary = createElement("summary", "ai-companion-activity-timeline-summary");
      timelineSummaryText = createElement("span", "", "Activity");
      summary.append(timelineSummaryText);
      timelineBody = createElement("div", "ai-companion-activity-timeline-body");
      timelineDetails.append(summary, timelineBody);
      deps.container.appendChild(timelineDetails);
      attachTimelineCopyAction();
      return timelineBody;
    }

    function updateTimelineSummary(event) {
      if (!timelineSummaryText) return;
      const count = rowsById.size;
      const failed = event?.activity?.status === "failed" || Array.from(rowsById.values()).some((row) => row.classList.contains("failed"));
      timelineSummaryText.textContent = failed
        ? `Activity (${count} step${count === 1 ? "" : "s"}, needs attention)`
        : `Activity (${count} step${count === 1 ? "" : "s"})`;
    }

    function collapseTimeline() {
      if (timelineDetails) timelineDetails.open = false;
    }

    function focusActivity(activityId) {
      const id = String(activityId || "");
      const row = rowsById.get(id) || externalRowsById.get(id);
      if (!row) return false;
      if (timelineDetails) timelineDetails.open = true;
      const group = groupsByActivityId.get(id);
      if (group?.element) group.element.open = true;
      row.classList.add("ai-companion-workspace-entry-focused");
      row.scrollIntoView?.({ block: "center" });
      setTimeout(() => row.classList.remove("ai-companion-workspace-entry-focused"), 1200);
      return true;
    }

    /**
     * Map a tool name to the aggregation bucket used in group labels.
     * Unknown tools fall back to a generic "actions" bucket.
     */
    function getToolGroupBucket(tool) {
      if (tool === "run_command" || tool === "run_test") return "command";
      if (tool === "search_text") return "pattern";
      if (tool === "read_file") return "readFile";
      if (tool === "apply_edit" || tool === "write_file") return "editFile";
      if (tool === "glob" || tool === "list_files") return "listing";
      return "action";
    }

    /** Render one bucket count as a verb phrase, e.g. "ran 2 commands". */
    function formatToolGroupSegment(bucket, count) {
      const plural = count === 1 ? "" : "s";
      if (bucket === "command") return `ran ${count} command${plural}`;
      if (bucket === "pattern") return `searched ${count} pattern${plural}`;
      if (bucket === "readFile") return `read ${count} file${plural}`;
      if (bucket === "editFile") return `edited ${count} file${plural}`;
      if (bucket === "listing") return count === 1 ? "listed files" : `listed files ${count} times`;
      return `took ${count} action${plural}`;
    }

    /**
     * Build the live aggregated label for a tool group, composing bucket
     * segments in first-appearance order ("Ran 2 commands, read 3 files").
     * Appends an ellipsis while any activity in the group is still running.
     */
    function formatToolGroupLabel(activities) {
      const counts = new Map();
      let running = false;
      activities.forEach((activity) => {
        const bucket = getToolGroupBucket(activity.tool);
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
        if (activity.status === "running") running = true;
      });
      const label = Array.from(counts.entries())
        .map(([bucket, count]) => formatToolGroupSegment(bucket, count))
        .join(", ");
      const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
      return running ? `${capitalized}…` : capitalized;
    }

    /**
     * Anything that must stay visible in the timeline (narration, approval
     * cards, the run summary) ends the current run of collapsible tools;
     * the next tool call starts a fresh group.
     */
    function closeToolGroup() {
      openToolGroup = null;
    }

    /** Get the open tool group, creating its collapsed row when needed. */
    function ensureToolGroup(timeline) {
      if (openToolGroup?.element?.isConnected) return openToolGroup;
      const element = createElement("details", "ai-companion-activity-group");
      const summary = createElement("summary", "ai-companion-activity-group-summary");
      const summaryText = createElement("span", "", "");
      summary.append(summaryText);
      const body = createElement("div", "ai-companion-activity-group-body");
      element.append(summary, body);
      timeline.appendChild(element);
      openToolGroup = { element, summaryText, body, activityIds: new Set() };
      return openToolGroup;
    }

    /**
     * Recompute a group's aggregated label from its member activities.
     * A failed member marks the group and force-opens it so the error is
     * not hidden behind the collapsed summary.
     */
    function refreshToolGroup(group) {
      const activities = Array.from(group.activityIds)
        .map((id) => activitiesById.get(id))
        .filter(Boolean);
      group.summaryText.textContent = formatToolGroupLabel(activities);
      if (activities.some((activity) => activity.status === "failed")) {
        group.element.classList.add("failed");
        group.element.open = true;
      }
    }

    function renderActivity(row, activity) {
      row.className = `ai-companion-activity-card ${activity.status || "running"}`;
      row.innerHTML = "";

      const icon = createElement("span", "ai-companion-activity-icon");
      icon.append(createElement("i", `bi ${activity.icon || "bi-gear"}`));

      const body = createElement("div", "ai-companion-activity-body");
      const header = createElement("div", "ai-companion-activity-header");
      const title = createElement("div", "ai-companion-activity-title", activity.title || activity.tool || "Agent action");
      const status = createElement("span", "ai-companion-activity-status", activity.status || "running");
      header.append(title, status);

      const primary = createElement("div", "ai-companion-activity-primary");
      if (activity.links?.length && activity.links[0]?.path && activity.primaryText === activity.links[0].path) {
        primary.append(createPathButton(activity.links[0]));
      } else {
        primary.textContent = activity.primaryText || "";
      }

      const meta = createElement("div", "ai-companion-activity-meta");
      if (activity.secondaryText) meta.append(createElement("span", "", activity.secondaryText));
      if (activity.resultSummary) meta.append(createElement("span", "", activity.resultSummary));
      if (activity.durationMs !== undefined) meta.append(createElement("span", "", formatDuration(activity.durationMs)));

      const extraLinks = (activity.links || []).slice(primary.childElementCount ? 1 : 0).filter((link) => link.path);
      const webLinks = (activity.webLinks || []).filter((link) => link.url);
      if (extraLinks.length || webLinks.length) {
        const links = createElement("div", "ai-companion-activity-links");
        extraLinks.forEach((link) => links.append(createPathButton(link)));
        webLinks.forEach((link) => links.append(createWebLink(link)));
        body.append(header, primary, meta, links);
      } else {
        body.append(header, primary, meta);
      }

      if (activity.compare || hasRollbackMetadata(activity)) {
        const actions = createElement("div", "ai-companion-activity-actions");
        if (activity.compare) actions.append(createCompareButton(activity.compare));
        if (hasRollbackMetadata(activity) && typeof deps.onRollbackAction === "function") {
          actions.append(createRollbackButton("Rollback", "Preview rollback for this action", deps.onRollbackAction, activity));
        }
        body.append(actions);
      }

      const details = renderRawDetails(activity);
      if (details) body.append(details);
      row.append(icon, body);
    }

    function appendActivity(event) {
      const activity = event.activity;
      if (!activity?.id) return false;
      activitiesById.set(activity.id, activity);
      updateLatestActivityCompletedAt(event);
      const timeline = ensureTimeline();
      attachTimelineCopyAction();
      let row = rowsById.get(activity.id);
      if (!row || !row.isConnected) {
        row = createElement("div", "ai-companion-activity-card");
        rowsById.set(activity.id, row);
        if (narrationSeen) {
          const group = ensureToolGroup(timeline);
          group.body.appendChild(row);
          group.activityIds.add(activity.id);
          groupsByActivityId.set(activity.id, group);
        } else {
          timeline.appendChild(row);
        }
        timelineLog.push({ kind: "activity", id: activity.id });
      }
      renderActivity(row, activity);
      // Running -> completed updates re-render in place; refresh the owning
      // group so the aggregated label tracks every state change live.
      const owningGroup = groupsByActivityId.get(activity.id);
      if (owningGroup) refreshToolGroup(owningGroup);
      updateTimelineSummary(event);
      deps.scrollToEnd?.();
      return true;
    }

    function appendExternalActivity(element) {
      // Approval and resume cards must stay visible, so they end the current
      // collapsible tool run.
      closeToolGroup();
      ensureTimeline().appendChild(element);
      const id = String(element?.dataset?.aiCompanionActivityId || "");
      if (id) externalRowsById.set(id, element);
      deps.scrollToEnd?.();
    }

    /**
     * Append a model narration block ("what I found, what I'll do next") into
     * the activity timeline, between tool cards. Shared by the live event path
     * and saved-task restore so both render identically.
     */
    function appendNarration(event) {
      const text = String(event?.content || "").trim();
      if (!text) return false;
      // Only an actually rendered narration block activates grouping and
      // breaks the current tool run; filtered-out duplicates never get here.
      narrationSeen = true;
      closeToolGroup();
      const block = createElement("div", "ai-companion-activity-narration");
      renderMarkdownResponse(block, text);
      ensureTimeline().appendChild(block);
      timelineLog.push({ kind: "narration", text });
      deps.scrollToEnd?.();
      return true;
    }

    function renderSummaryFile(file, event) {
      const item = createElement("li", "ai-companion-summary-file");
      const icon = createElement("i", `bi ${file.icon || "bi-file-earmark-code"}`);
      icon.setAttribute("aria-hidden", "true");
      const link = createPathButton({ kind: "file", path: file.path, label: file.path || file.name });
      const description = createElement("span", "ai-companion-summary-description");
      description.append(document.createTextNode(": "));
      appendTextWithCode(description, file.description || "Updated file.");
      item.append(icon, link);
      const actions = createElement("span", "ai-companion-summary-file-actions");
      if (file.compare) actions.append(createCompareButton(file.compare));
      const rollbackable = hasRollbackMetadata(file) || hasRollbackMetadata(event);
      if (rollbackable && typeof deps.onRollbackFile === "function") {
        actions.append(createRollbackButton("Rollback", "Preview rollback for this file", deps.onRollbackFile, { file, event }));
      }
      if (rollbackable && typeof deps.onShowFileHistory === "function") {
        actions.append(createRollbackButton("History", "Show agent file history", deps.onShowFileHistory, { file, event }));
      }
      if (actions.children?.length) item.append(actions);
      item.append(description);
      const delta = createLineDeltaElement(file);
      if (delta) item.append(delta);
      return item;
    }

    function appendFileSection(row, heading, files, event) {
      if (!files.length) return;
      row.append(createElement("div", "ai-companion-summary-heading", heading));
      const list = createElement("ul", "ai-companion-summary-files");
      files.forEach((file) => list.append(renderSummaryFile(file, event)));
      row.append(list);
    }

    function appendBlockedChangesSection(row, groups = []) {
      const files = flattenBlockedChanges(groups);
      if (!files.length) return;
      const details = createElement("details", "ai-companion-summary-blocked");
      const summary = createElement("summary", "", `Blocked proposals (${files.length})`);
      const list = createElement("ul", "ai-companion-summary-files");
      files.forEach((file) => list.append(renderSummaryFile(file, {})));
      details.append(summary, list);
      row.append(details);
    }

    function getSummaryStatus(event) {
      const explicitStatus = String(event.status || "").toLowerCase();
      if (explicitStatus === "success") return { key: "succeeded", label: "Task Succeeded", icon: "bi-check-lg" };
      if (explicitStatus === "failure") return { key: "failed", label: "Task Failed", icon: "bi-x-lg" };
      if (explicitStatus === "cancelled") return { key: "cancelled", label: "Task Cancelled", icon: "bi-stop-fill" };
      if (explicitStatus === "aborted") return { key: "aborted", label: "Task Aborted", icon: "bi-slash-circle" };
      // Explicit flag from the panel's error path (provider failures like quota/rate limits)
      // wins over the text heuristics below, which only catch edit-related failures.
      if (event.isError === true) return { key: "failed", label: "Task Failed", icon: "bi-x-lg" };
      const attemptedChanges = Array.isArray(event.attemptedChanges) ? event.attemptedChanges : [];
      const blockedChanges = flattenBlockedChanges(Array.isArray(event.blockedChanges) ? event.blockedChanges : []);
      const failed = attemptedChanges.length > 0 || blockedChanges.length > 0 || /failed|no file edits were applied/i.test(String(event.outcome || ""));
      return failed
        ? { key: "failed", label: "Task Failed", icon: "bi-x-lg" }
        : { key: "succeeded", label: "Task Succeeded", icon: "bi-check-lg" };
    }

    function renderTaskStatus(event) {
      const status = getSummaryStatus(event);
      const row = createElement("div", `ai-companion-task-status ${status.key}`);
      const icon = createElement("i", `bi ${status.icon}`);
      icon.setAttribute("aria-hidden", "true");
      row.append(icon, createElement("span", "", status.label));
      return row;
    }

    function appendFinalResponse(row, event) {
      const finalResponse = getSummaryFinalResponse(event);
      if (!finalResponse) return;
      const response = createElement("div", "ai-companion-final-response");
      renderMarkdownResponse(response, finalResponse);
      row.append(response);
    }

    function appendWorkedFooter(row, event) {
      row.append(createElement("div", "ai-companion-summary-worked-footer", getSummaryWorkedLabel(event)));
    }

    function appendSummary(event) {
      closeToolGroup();
      collapseTimeline();
      const row = createElement("div", `ai-companion-run-summary ${getSummaryStatus(event).key}`);
      appendWorkspaceResponseBadge(row);
      const worked = createElement("div", "ai-companion-summary-worked", getSummaryWorkedLabel(event));
      row.append(worked, renderTaskStatus(event));

      appendFileSection(row, "Changed files:", Array.isArray(event.changedFiles) ? event.changedFiles : [], event);
      appendFileSection(row, "Attempted changes:", Array.isArray(event.attemptedChanges) ? event.attemptedChanges : [], event);
      appendBlockedChangesSection(row, Array.isArray(event.blockedChanges) ? event.blockedChanges : []);

      (event.notes || []).forEach((note) => row.append(createElement("p", "ai-companion-summary-note", note)));
      if (Array.isArray(event.validation) && event.validation.length) {
        const validation = createElement("p", "ai-companion-summary-note");
        appendTextWithCode(validation, `Validation passed: ${event.validation.join(", ")}.`);
        row.append(validation);
      }
      appendFinalResponse(row, event);
      appendWorkedFooter(row, event);
      ensureResultArea().appendChild(row);
      const actions = attachCopyAction(row, () => formatSummaryMarkdown(event), "Copy task summary as Markdown", { timestamp: getEventTimestamp(event), isModelResponse: true });
      appendSplitTaskButton(actions, event);
      appendContinueTaskButton(actions, event);
      appendRollbackTaskButton(actions, event);
      deps.scrollToEnd?.();
    }

    function reset() {
      rowsById.clear();
      externalRowsById.clear();
      activitiesById.clear();
      timelineLog.length = 0;
      groupsByActivityId.clear();
      narrationSeen = false;
      openToolGroup = null;
      latestActivityCompletedAt = 0;
      timelineDetails = null;
      timelineBody = null;
      timelineSummaryText = null;
      resultArea = null;
    }

    return {
      appendActivity,
      appendExternalActivity,
      appendNarration,
      appendSummary,
      collapseTimeline,
      focusActivity,
      reset
    };
  }

  window.createMarkdownViewerAiCompanionActivityRenderer = createMarkdownViewerAiCompanionActivityRenderer;
})(window, document);
