(function(window, document) {
  "use strict";

  function registerMarkdownViewerAiCompanionPanel(app, deps) {
    const panel = document.getElementById("ai-companion-panel");
    if (!panel) return null;
    const toggleButtons = document.querySelectorAll(".toggle-ai-companion-panel");
    const closeButton = document.getElementById("ai-companion-close");
    const tabButtons = panel.querySelectorAll("[data-ai-companion-tab]");
    const modeIcon = panel.querySelector("#ai-companion-mode-icon");
    const modeMenuToggleButtons = panel.querySelectorAll(".ai-companion-mode-menu-toggle");
    const toolLog = panel.querySelector("#ai-companion-tool-log");
    const taskChangesPanel = panel.querySelector("#ai-companion-workspace-changes");
    const taskChangesSection = taskChangesPanel?.closest?.('[data-ai-companion-inspector-section="changes"]') || taskChangesPanel;
    const taskChangesHeader = taskChangesSection?.querySelector?.(".ai-companion-workspace-inspector-header") || null;
    const taskChangesToggle = taskChangesHeader ? document.createElement("button") : null;
    const taskChangesSummary = taskChangesPanel ? document.createElement("div") : null;
    const taskChangesList = taskChangesPanel ? document.createElement("div") : null;
    const attachmentList = panel.querySelector("#ai-companion-attachment-list");
    const attachmentInput = panel.querySelector("#ai-companion-attachment-input");
    const attachFilesButton = panel.querySelector("#ai-companion-attach-files");
    const agentInput = panel.querySelector("#ai-companion-agent-task");
    const agentRunButton = panel.querySelector("#ai-companion-agent-run");
    const newAgentButton = panel.querySelector("#ai-companion-agent-new");
    const plansToggleButton = panel.querySelector("#ai-companion-plans-toggle");
    const agentView = panel.querySelector(".ai-companion-agent-view");
    const agentComposer = panel.querySelector(".ai-companion-agent-composer");
    const plansView = panel.querySelector("#ai-companion-plans-view");
    const plansStatusSelect = panel.querySelector("#ai-companion-plans-status");
    const plansSearchInput = panel.querySelector("#ai-companion-plans-search");
    const plansRefreshButton = panel.querySelector("#ai-companion-plans-refresh");
    const plansList = panel.querySelector("#ai-companion-plans-list");
    const planDetail = panel.querySelector("#ai-companion-plan-detail");
    const chatSelect = panel.querySelector("#ai-companion-chat-select");
    const chatPicker = panel.querySelector(".ai-companion-chat-picker");
    const chatMenu = panel.querySelector("#ai-companion-chat-menu");
    const chatSelectLabel = chatSelect?.querySelector(".ai-companion-chat-select-label");
    const workspaceHistory = panel.querySelector("#ai-companion-workspace-history");
    const workspaceHistoryResizer = panel.querySelector("#ai-companion-workspace-history-resizer");
    const workspaceHistoryTitle = panel.querySelector("#ai-companion-workspace-history-title");
    const workspaceInspectorResizer = panel.querySelector("#ai-companion-workspace-inspector-resizer");
    const workspaceChatsTab = panel.querySelector("#ai-companion-workspace-chats-tab");
    const workspacePlansTab = panel.querySelector("#ai-companion-workspace-plans-tab");
    const workspaceChatsPane = panel.querySelector("#ai-companion-workspace-chats-pane");
    const workspacePlansPane = panel.querySelector("#ai-companion-workspace-plans-pane");
    const workspaceChatSearch = panel.querySelector("#ai-companion-workspace-chat-search");
    const workspaceChatFilterButton = panel.querySelector("#ai-companion-workspace-chat-filter");
    const workspaceChatFilterMenu = panel.querySelector("#ai-companion-workspace-chat-filter-menu");
    const workspaceChatList = panel.querySelector("#ai-companion-workspace-chat-list");
    const workspacePlanSearch = panel.querySelector("#ai-companion-workspace-plan-search");
    const workspacePlanFilterButton = panel.querySelector("#ai-companion-workspace-plan-filter");
    const workspacePlanFilterMenu = panel.querySelector("#ai-companion-workspace-plan-filter-menu");
    const workspaceSidebarPlans = panel.querySelector("#ai-companion-workspace-sidebar-plans");
    const workspaceNewChatButton = panel.querySelector("#ai-companion-workspace-new-chat");
    const workspaceNewChatMenuButton = panel.querySelector("#ai-companion-workspace-new-chat-menu");
    const workspaceNewChatMenuList = panel.querySelector("#ai-companion-workspace-new-chat-menu-list");
    const workspaceNewPlanButton = panel.querySelector("#ai-companion-workspace-new-plan");
    const workspaceHeading = panel.querySelector("#ai-companion-workspace-heading");
    const workspaceHeaderMeta = panel.querySelector("#ai-companion-workspace-header-meta");
    const workspaceChatTitle = panel.querySelector("#ai-companion-workspace-chat-title");
    const workspaceTitleEditButton = panel.querySelector("#ai-companion-workspace-title-edit");
    const workspaceTaskDetailsToggle = panel.querySelector("#ai-companion-workspace-task-details-toggle");
    const workspaceTaskDetailsPopover = panel.querySelector("#ai-companion-workspace-task-details-popover");
    const workspaceTaskDetails = panel.querySelector("#ai-companion-workspace-task-details");
    const workspaceStatusChip = panel.querySelector("#ai-companion-workspace-status-chip");
    const workspaceModeChip = panel.querySelector("#ai-companion-workspace-mode-chip");
    const workspaceModelChip = panel.querySelector("#ai-companion-workspace-model-chip");
    const workspaceTimeChip = panel.querySelector("#ai-companion-workspace-time-chip");
    const workspaceInspector = panel.querySelector("#ai-companion-workspace-inspector");
    const workspaceContextSection = panel.querySelector('[data-ai-companion-inspector-section="context"]') || panel.querySelector("#ai-companion-workspace-context")?.closest?.(".ai-companion-workspace-inspector-section");
    const workspaceToolsSection = panel.querySelector('[data-ai-companion-inspector-section="tools"]') || panel.querySelector("#ai-companion-workspace-tools")?.closest?.(".ai-companion-workspace-inspector-section");
    const workspaceApprovalsSection = panel.querySelector('[data-ai-companion-inspector-section="approvals"]') || panel.querySelector("#ai-companion-workspace-approvals")?.closest?.(".ai-companion-workspace-inspector-section");
    const workspaceContext = panel.querySelector("#ai-companion-workspace-context");
    const workspaceTools = panel.querySelector("#ai-companion-workspace-tools");
    const workspaceApprovals = panel.querySelector("#ai-companion-workspace-approvals");
    const workspaceInspectorInfoPopover = panel.querySelector("#ai-companion-workspace-inspector-info-popover");
    const workspaceInspectorInfoTitle = panel.querySelector("#ai-companion-workspace-inspector-info-title");
    const workspaceInspectorInfoBody = panel.querySelector("#ai-companion-workspace-inspector-info-body");
    const disabledNotice = panel.querySelector("#ai-companion-disabled-notice");
    const elapsedElement = panel.querySelector("#ai-companion-elapsed");
    const agentActions = panel.querySelector(".ai-companion-agent-actions");
    const copyActions = window.createMarkdownViewerAiCompanionCopyActions?.({
      onCopied: () => {},
      onCopyError: () => notifyAiCompanionError("Copy failed"),
      onOpenTabError: () => notifyAiCompanionError("Open failed"),
      openMarkdownInNewTab
    }) || null;
    const rateLimitWaitCountdown = window.createMarkdownViewerAiRateLimitWaitCountdown?.() || null;
    const AGENT_TASK_HISTORY_LIMIT = 20;
    const AGENT_TASKS_STORAGE_KEY = "ai-companion-agent-tasks";
    const AGENT_CHATS_STORAGE_KEY = "ai-companion-chats";
    const CHAT_TASK_INDEX_FILE_NAME = "index.json";
    const CHAT_HISTORY_SELECT_LIMIT = 25;
    const WORKSPACE_TOOLS_PREVIEW_LIMIT = 6;
    const WORKSPACE_ID_COPY_FEEDBACK_MS = 1200;
    const resumingRunTaskIds = new Set();
    const CONVERSATION_HISTORY_TURN_LIMIT = 12;
    const CONVERSATION_HISTORY_MESSAGE_MAX_CHARS = 4000;
    const APPROVAL_PILL_MAX_CHARS = 18;
    const AGENT_INPUT_MAX_VISIBLE_LINES = 4;
    const API_CLIENT_REFRESH_TOOLS = new Set(["request_create", "request_update", "request_send", "environment_update"]);
    const GIT_PANEL_REFRESH_TOOLS = new Set(["git_stage", "git_unstage", "git_commit", "git_fetch", "git_pull", "git_push", "git_branch_create", "git_branch_switch"]);
    const PANEL_VISIBILITY_ANIMATION_MS = 240;
    const TOOL_LOG_END_TOLERANCE_PX = 1;
    const TASK_CHANGES_INLINE_ENTRY_LIMIT = 2;
    const TASK_CHANGES_ANIMATION_MS = 180;
    const TEXT_ATTACHMENT_EXTENSIONS = new Set([
      "bat", "c", "cc", "cfg", "conf", "cpp", "cs", "css", "csv", "go", "gradle", "h", "hpp", "htm", "html", "ini", "java", "js", "json", "jsx", "kt", "log", "md", "mjs", "ps1", "py", "rb", "rs", "sh", "sql", "toml", "ts", "tsx", "txt", "xml", "yaml", "yml"
    ]);
    const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);
    const IMAGE_ATTACHMENT_MIME_TYPES = new Set(["image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/webp"]);
    const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
    const MAX_TOTAL_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
    const EDITOR_READ_CONTEXT_TAB_CONTENT_MAX_CHARS = 12000;
    const EDITOR_READ_CONTEXT_GRAPH_METADATA_MAX_ITEMS = 120;
    const EDITOR_READ_CONTEXT_GRAPH_TEXT_MAX_CHARS = 1000;
    const DEFAULT_WORKSPACE_HISTORY_WIDTH = 320;
    const DEFAULT_WORKSPACE_INSPECTOR_WIDTH = 320;
    const MIN_WORKSPACE_SIDE_WIDTH = 240;
    const MAX_WORKSPACE_SIDE_WIDTH = 520;
    const WORKSPACE_CHAT_PAGE_SIZE = 20;
    const WORKSPACE_STATUS_CLASS_NAMES = ["status-completed", "status-incomplete", "status-error", "status-cancelled", "status-planned", "status-running", "status-ready"];
    const BUNDLED_WORKFLOW_SUGGESTIONS = [
      { name: "investigate-defect", description: "Investigate a defect from evidence to root cause.", allowedModes: ["plan", "agent"] },
      { name: "develop-change", description: "Implement a scoped repository change.", allowedModes: ["agent"] },
      { name: "review-changes", description: "Review local changes for concrete defects.", allowedModes: ["plan", "agent"] },
      { name: "create-plan", description: "Create or revise an implementation plan.", allowedModes: ["plan", "agent"] },
      { name: "verify-work", description: "Run risk-based verification for a change.", allowedModes: ["agent"] },
      { name: "manage-context", description: "Release stale observations during a long run.", allowedModes: ["chat", "plan", "agent"] },
      { name: "discover-capabilities", description: "Find and activate secondary tools.", allowedModes: ["chat", "plan", "agent"] },
      { name: "record-change", description: "Record an intentional source-control change.", argumentHint: "[message guidance]", allowedModes: ["agent"] },
      { name: "refine-change", description: "Simplify selected code while preserving behavior.", argumentHint: "[target or constraint]", allowedModes: ["agent"] },
      { name: "companion-settings", description: "Inspect or update companion settings.", argumentHint: "<setting request>", allowedModes: ["agent"] },
      { name: "repeat-work", description: "Create, inspect, or cancel scheduled work.", argumentHint: "<timing and task>", allowedModes: ["agent"] },
      { name: "build-document", description: "Build and verify a document artifact.", argumentHint: "<document request>", allowedModes: ["agent"] },
      { name: "inspect-pull-request", description: "Review a pull-request change set.", argumentHint: "[pull request reference]", allowedModes: ["agent"] }
    ];
    let activeTab = "chat";
    let timerId = null;
    let startedAt = 0;
    let activeRequest = null;
    let activeAgentRunEventToken = null;
    let streamingChatResponse = null;
    let chatResponseRecorded = false;
    let activeRunMode = null;
    let activeAgentEntry = null;
    let activeActivityRenderer = null;
    let agentEntries = [];
    let agentTaskIndex = [];
    let activeAgentChat = null;
    let nextAgentTaskSequence = 1;
    let nextSyntheticActivitySequence = 1;
    let syntheticActivityIds = new Map();
    let agentHistoryLoaded = false;
    let loadingOlderAgentTasks = false;
    let shouldAutoScrollToolLog = true;
    let agentSaveTimer = null;
    let panelVisibilityTimer = null;
    let editingPromptEntry = null;
    let mainPromptComposer = null;
    let activeChatActionMenu = null;
    let activeChatActionToggle = null;
    const workspaceChatActionToggleToMenu = new WeakMap();
    let activeNativeDropComposer = null;
    const nativeDropComposers = new Set();
    let nativeDropListenerAttached = false;
    let nextDraftAttachmentId = 1;
    let latestRequestContextFiles = [];
    let plansViewOpen = false;
    let plansLoading = false;
    let selectedRepositoryPlan = null;
    let repositoryPlans = [];
    let plansLoadSequence = 0;
    let workspaceOpen = false;
    let workspaceRestoreState = null;
    let workspaceChatIndexes = [];
    let workspaceChatFilter = "all";
    let workspaceChatVisibleLimit = WORKSPACE_CHAT_PAGE_SIZE;
    let workspacePlanFilter = "all";
    let workspaceHistoryWidth = DEFAULT_WORKSPACE_HISTORY_WIDTH;
    let workspaceInspectorWidth = DEFAULT_WORKSPACE_INSPECTOR_WIDTH;
    let workspaceResizeState = null;
    let workspacePlanActionMenu = null;
    let workspaceToolsExpanded = false;
    let workspaceToolsExpandedRecordId = "";
    let availableWorkflowSkills = BUNDLED_WORKFLOW_SUGGESTIONS.slice();
    let schedulePollRunning = false;

    function updateWorkflowSkillSuggestions(skills) {
      for (const skill of Array.isArray(skills) ? skills : []) {
        if (!skill?.name) continue;
        const index = availableWorkflowSkills.findIndex((entry) => entry.name === skill.name);
        if (index >= 0) availableWorkflowSkills[index] = { ...availableWorkflowSkills[index], ...skill };
        else availableWorkflowSkills.push(skill);
      }
    }

    function attachSlashWorkflowSuggestions(textarea, modeProvider = getSelectedRunMode) {
      if (!textarea?.parentElement) return { destroy() {} };
      const popup = document.createElement("div");
      popup.className = "ai-companion-slash-suggestions";
      popup.hidden = true;
      textarea.parentElement.append(popup);
      let matches = [];
      let selected = 0;
      const hide = () => { popup.hidden = true; popup.innerHTML = ""; matches = []; selected = 0; };
      const choose = (index) => {
        const skill = matches[index];
        if (!skill) return;
        textarea.value = `/${skill.name} `;
        textarea.dispatchEvent?.(new Event("input", { bubbles: true }));
        textarea.focus?.();
        hide();
      };
      const render = () => {
        const match = String(textarea.value || "").match(/^\/([a-zA-Z0-9:_-]*)$/);
        if (!match) return hide();
        const query = match[1].toLowerCase();
        const mode = modeProvider();
        matches = availableWorkflowSkills.filter((skill) =>
          (!skill.allowedModes?.length || skill.allowedModes.includes(mode))
          && skill.name.toLowerCase().startsWith(query)
        ).slice(0, 8);
        popup.innerHTML = "";
        matches.forEach((skill, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `ai-companion-slash-suggestion${index === selected ? " is-selected" : ""}`;
          const title = document.createElement("strong");
          title.textContent = `/${skill.name}${skill.argumentHint ? ` ${skill.argumentHint}` : ""}`;
          const description = document.createElement("span");
          description.textContent = skill.description || "";
          button.append(title, description);
          button.addEventListener("mousedown", (event) => { event.preventDefault?.(); choose(index); });
          popup.append(button);
        });
        popup.hidden = matches.length === 0;
      };
      const keydown = (event) => {
        if (popup.hidden || !matches.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault?.();
          selected = (selected + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length;
          render();
        } else if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          choose(selected);
        } else if (event.key === "Escape") {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          hide();
        }
      };
      textarea.addEventListener("input", render);
      textarea.addEventListener("keydown", keydown, true);
      return { destroy() { textarea.removeEventListener("input", render); textarea.removeEventListener("keydown", keydown, true); popup.remove?.(); } };
    }

    async function pollDueCompanionSchedules() {
      if (schedulePollRunning || isAgentRunning() || typeof deps.bridge?.schedulesClaimDue !== "function") return;
      schedulePollRunning = true;
      try {
        const claimed = await deps.bridge.schedulesClaimDue({ workspaceRoot: deps.getWorkspaceRoot?.() || "" });
        for (const schedule of Array.isArray(claimed?.schedules) ? claimed.schedules : []) {
          let error = "";
          try {
            await startNewAgentChat();
            const outcome = await runCompanionPrompt({ prompt: schedule.prompt, mode: "agent", executionKind: "new", capabilityBoundary: schedule.capabilityBoundary });
            if (["error", "cancelled", "blocked"].includes(outcome?.status)) error = `Scheduled task ended with status ${outcome.status}.`;
          } catch (runError) {
            error = runError?.message || String(runError);
          }
          await deps.bridge.scheduleComplete?.({ workspaceRoot: deps.getWorkspaceRoot?.() || "", scheduleId: schedule.id, error });
        }
      } catch (error) {
        deps.appDebugLog?.("warning", "[ai-companion] Unable to poll scheduled work", { error: error?.message || String(error) });
      } finally {
        schedulePollRunning = false;
      }
    }
    let workspaceToolsCollapsedSnapshot = null;
    let workspaceOpenRefreshSequence = 0;
    let taskChangesExpanded = false;
    let taskChangesClosingTimer = null;
    let taskChangesResizeObserver = null;

    if (taskChangesToggle && taskChangesSummary && taskChangesList) {
      taskChangesToggle.id = "ai-companion-workspace-changes-toggle";
      taskChangesToggle.type = "button";
      taskChangesToggle.className = "folder-tree-tool-button ai-companion-workspace-changes-toggle";
      taskChangesToggle.hidden = true;
      taskChangesToggle.setAttribute("title", "Show changed files");
      taskChangesToggle.setAttribute("aria-label", "Show changed files");
      taskChangesToggle.setAttribute("aria-controls", "ai-companion-workspace-change-list");
      taskChangesToggle.setAttribute("aria-expanded", "false");
      const icon = document.createElement("i");
      icon.className = "bi bi-chevron-up";
      icon.setAttribute("aria-hidden", "true");
      taskChangesToggle.appendChild(icon);
      taskChangesHeader.appendChild(taskChangesToggle);

      taskChangesSummary.id = "ai-companion-workspace-change-summary";
      taskChangesList.id = "ai-companion-workspace-change-list";
      taskChangesList.className = "ai-companion-workspace-change-list";
      taskChangesPanel.replaceChildren(taskChangesSummary, taskChangesList);
    }

    // Context usage indicator: donut ring next to the run/stop button fed by provider-reported
    // `usage` events (authoritative) and chars/4 `context` estimates (fallback). Cumulative
    // sent/received totals live on the chat index record so they survive reloads.
    const modelRegistry = app?.modules?.aiCompanionModelRegistry || null;
    const contextIndicator = agentActions && typeof window.createMarkdownViewerAiCompanionContextIndicator === "function"
      ? window.createMarkdownViewerAiCompanionContextIndicator({
        container: agentActions,
        beforeElement: agentRunButton,
        resolveModelInfo: (modelName) => modelRegistry?.resolveModelInfo?.(modelName) || null,
        getModelName: () => {
          const settings = getCurrentSettings();
          return settings.providerMode === "litellm" && settings.litellmModelAlias
            ? settings.litellmModelAlias
            : settings.model || "";
        },
        onTotalsChanged: (totals) => {
          if (!activeAgentChat) return;
          activeAgentChat.tokenTotals = totals;
          // Totals piggyback on the index write of the next task save; nudge one if none is
          // pending so a reload right after a response keeps the numbers.
          if (!agentSaveTimer && activeAgentEntry) scheduleAgentEntrySave(activeAgentEntry);
        },
        getContextFiles: getContextFileGroups,
        openContextFile: openContextFileFromIndicator
      })
      : null;
    if (modelRegistry?.loadRegistry) void modelRegistry.loadRegistry().then(() => contextIndicator?.refresh?.());

    function openMarkdownInNewTab(markdown) {
      const content = String(markdown || "");
      if (workspaceOpen) {
        closeWorkspaceForExternalNavigation();
        setWorkspaceSidebarView("files");
      }
      if (typeof deps.openMarkdownInNewTab === "function") return deps.openMarkdownInNewTab(content);
      return app?.services?.tabs?.newTab?.(content, null, { viewMode: "preview" }) || null;
    }

    function createActivityRenderer(container) {
      return window.createMarkdownViewerAiCompanionActivityRenderer?.({
        container,
        openFile: openActivityFile,
        openFolder: openActivityFolder,
        openCompare: openActivityCompare,
        scrollToEnd: scrollToolLogToEnd,
        renderMarkdownContent: deps.renderMarkdownContent,
        onLinkOpenError: handleActivityLinkOpenError,
        onCopied: () => {},
        onCopyError: () => notifyAiCompanionError("Copy failed"),
        onOpenTabError: () => notifyAiCompanionError("Open failed"),
        openMarkdownInNewTab
      }) || null;
    }

    function attachCopyAction(element, getMarkdown, label, options = {}) {
      return copyActions?.attachCopyAction?.(element, getMarkdown, { ...options, label }) || null;
    }

    function attachChatResponseCopyAction(entry, response, content, completedAt) {
      const markdown = String(content || "").trim();
      if (markdown) {
        const actions = attachCopyAction(response, () => markdown, "Copy response as Markdown", { timestamp: completedAt, isModelResponse: true });
        appendExecutePlanButton(actions, entry);
      }
    }

    function appendWorkedFooter(content, workedLabel) {
      const text = String(content || "").trim();
      const label = String(workedLabel || "").trim();
      if (!text || !label || text.endsWith(label)) return text;
      return `${text}\n\n${label}`;
    }

    function renderChatResponseContent(response, content, isError = false, renderMarkdown = true) {
      const text = String(content || "");
      const baseClassName = `ai-companion-chat-response${isError ? " error" : ""}`;
      const shouldRenderMarkdown = !isError && renderMarkdown;
      response.className = shouldRenderMarkdown ? `${baseClassName} markdown-body` : baseClassName;
      if (shouldRenderMarkdown && typeof deps.renderMarkdownContent === "function" && deps.renderMarkdownContent(response, text, { renderFrontmatter: false })) {
        response.classList?.add("ai-companion-chat-response");
        return;
      }
      response.className = baseClassName;
      response.innerHTML = "";
      response.textContent = text;
    }

    function appendWorkspaceRoleBadge(target, kind, label, iconClass) {
      if (!target) return null;
      target.querySelector?.(".ai-companion-workspace-role-badge")?.remove?.();
      const badge = document.createElement("span");
      badge.className = `ai-companion-workspace-role-badge ${kind}`;
      badge.setAttribute("aria-hidden", "true");
      const icon = document.createElement("i");
      icon.className = `bi ${iconClass}`;
      badge.setAttribute("data-role-label", label);
      badge.title = label;
      badge.append(icon);
      target.appendChild(badge);
      return badge;
    }

    function appendWorkspacePromptBadge(target) {
      return appendWorkspaceRoleBadge(target, "user", "You", "bi-person-circle");
    }

    function appendWorkspaceResponseBadge(target, isError = false) {
      return appendWorkspaceRoleBadge(target, isError ? "error" : "agent", "Agent", isError ? "bi-exclamation-triangle" : "bi-stars");
    }

    function renderPromptSummary(summary, title, attachments = []) {
      if (!summary) return;
      if (typeof summary.replaceChildren === "function") summary.replaceChildren();
      else summary.textContent = "";
      const references = normalizeAttachmentReferences(attachments);
      summary.classList.toggle("has-attachments", references.length > 0);
      const titleElement = document.createElement("span");
      titleElement.className = "ai-companion-agent-task-title";
      titleElement.textContent = title || "Agent task";
      summary.append(titleElement);
      renderSavedAttachmentList(summary, references, "ai-companion-agent-task-summary-attachments");
      appendWorkspacePromptBadge(summary);
    }

    function appendChatResponseElement(entry, content, isError = false, renderMarkdown = true, completedAt = null) {
      hideThinkingIndicator(entry);
      const response = document.createElement("div");
      renderChatResponseContent(response, content, isError, renderMarkdown);
      if (String(content || "").trim()) appendWorkspaceResponseBadge(response, isError);
      entry.output.appendChild(response);
      attachChatResponseCopyAction(entry, response, content, completedAt);
      scrollToolLogToEnd();
      return response;
    }

    function createThinkingIndicatorElement() {
      const row = document.createElement("div");
      row.className = "ai-companion-thinking-indicator";
      row.setAttribute("role", "status");
      row.setAttribute("aria-live", "polite");
      const spinner = document.createElement("span");
      spinner.className = "ai-companion-thinking-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "Thinking ...";
      row.append(spinner, label);
      return row;
    }

    function hideThinkingIndicator(entry = activeAgentEntry) {
      rateLimitWaitCountdown?.cancel();
      const indicator = entry?.thinkingIndicator;
      if (!indicator?.parentNode) return;
      indicator.parentNode.removeChild?.(indicator);
    }

    function showThinkingIndicatorWithLabel(labelText, entry = activeAgentEntry) {
      if (!entry?.output) return;
      const indicator = entry.thinkingIndicator || createThinkingIndicatorElement();
      entry.thinkingIndicator = indicator;
      if (indicator.children?.[1]) indicator.children[1].textContent = labelText;
      const children = Array.from(entry.output.children || []);
      if (indicator.parentNode === entry.output && children[children.length - 1] === indicator) return;
      if (indicator.parentNode) indicator.parentNode.removeChild?.(indicator);
      entry.output.appendChild(indicator);
      scrollToolLogToEnd();
    }

    function showThinkingIndicator(entry = activeAgentEntry) {
      rateLimitWaitCountdown?.cancel();
      showThinkingIndicatorWithLabel("Thinking ...", entry);
    }

    function showRateLimitWaitIndicator(delayMs) {
      if (!rateLimitWaitCountdown) {
        showThinkingIndicatorWithLabel("Waiting (rate limit)");
        return;
      }
      rateLimitWaitCountdown.start(delayMs, {
        onTick: (remainingSeconds) => showThinkingIndicatorWithLabel(`Waiting (rate limit) · ${remainingSeconds}s`),
        onComplete: () => showThinkingIndicator()
      });
    }

    function recordChatResponse(content, isError = false, completedAt = Date.now()) {
      if (!activeAgentEntry) return;
      const text = String(content || "").trim();
      if (!text) return;
      activeAgentEntry.record.events.push({ type: "chat-response", content: text, isError, completedAt });
      if (activeRunMode === "plan" && !isError) {
        activeAgentEntry.record.mode = "plan";
        const repositoryPlan = activeAgentEntry.pendingPlanMetadata || (activeAgentEntry.record.plan?.path ? activeAgentEntry.record.plan : null);
        if (repositoryPlan?.path) activeAgentEntry.record.plan = createPlanMetadata(text, activeAgentEntry.record.plan, "planned", repositoryPlan);
        else delete activeAgentEntry.record.plan;
        delete activeAgentEntry.pendingPlanMetadata;
        activeAgentEntry.record.status = repositoryPlan?.path ? "planned" : "error";
        attachPromptActions(activeAgentEntry);
        attachPlanResponseActions(activeAgentEntry, streamingChatResponse);
      } else {
        activeAgentEntry.record.status = isError ? "error" : "completed";
      }
      activeAgentEntry.record.updatedAt = completedAt;
      activeAgentEntry.isDirty = true;
      chatResponseRecorded = true;
      scheduleAgentEntrySave(activeAgentEntry);
    }

    function appendChatResponseDelta(text) {
      if (!activeAgentEntry) return;
      hideThinkingIndicator();
      if (!streamingChatResponse || !streamingChatResponse.isConnected) {
        streamingChatResponse = appendChatResponseElement(activeAgentEntry, "", false, false);
        chatResponseRecorded = false;
      }
      streamingChatResponse.textContent += text;
      scrollToolLogToEnd();
    }

    function finishChatResponse(finalText = "", isError = false, workedLabel = "") {
      if (!activeAgentEntry) return false;
      hideThinkingIndicator();
      const text = appendWorkedFooter(finalText || streamingChatResponse?.textContent || "", workedLabel);
      if (!text) return false;
      if (chatResponseRecorded && !streamingChatResponse) return true;
      const completedAt = Date.now();
      if (!streamingChatResponse || !streamingChatResponse.isConnected) {
        streamingChatResponse = appendChatResponseElement(activeAgentEntry, text, isError, true, completedAt);
      } else {
        renderChatResponseContent(streamingChatResponse, text, isError);
        appendWorkspaceResponseBadge(streamingChatResponse, isError);
        attachChatResponseCopyAction(activeAgentEntry, streamingChatResponse, text, completedAt);
      }
      if (!chatResponseRecorded) recordChatResponse(text, isError, completedAt);
      streamingChatResponse = null;
      activeActivityRenderer?.collapseTimeline?.();
      renderWorkspaceInspectorPanels();
      renderWorkspaceChatHistory(workspaceChatIndexes);
      return true;
    }

    function isToolLogAtEnd() {
      return toolLog.scrollHeight - toolLog.clientHeight - toolLog.scrollTop <= TOOL_LOG_END_TOLERANCE_PX;
    }

    function scrollToolLogToEnd() {
      if (!shouldAutoScrollToolLog) return;
      toolLog.scrollTop = toolLog.scrollHeight;
    }

    function logChatHistoryDebug(message, details) {
      try {
        void deps.appDebugLog?.("debug", `[ai-companion] chat history ${message}`, details);
      } catch (_error) {
        // Debug logging must never affect the panel UI.
      }
    }

    function showAiCompanionDialog(title, message) {
      const text = String(message || "").trim();
      if (!text) return;
      const options = {
        title: title || "AI Companion",
        message: text,
        buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
      };
      try {
        const notification = app?.services?.notify;
        if (typeof notification?.show === "function") {
          const result = notification.show(options);
          if (result?.catch) result.catch(() => {});
          return;
        }
        if (typeof notification?.alert === "function") {
          const result = notification.alert(options);
          if (result?.catch) result.catch(() => {});
          return;
        }
        if (typeof app?.services?.alert === "function") {
          const result = app.services.alert(options);
          if (result?.catch) result.catch(() => {});
        }
      } catch (error) {
        console.warn("Failed to show AI Companion notification:", error);
      }
    }

    function notifyAiCompanionError(message, title = "AI Companion") {
      showAiCompanionDialog(title, message);
    }

    function notifyAiCompanionBlocked(message) {
      showAiCompanionDialog("AI Companion", message);
    }

    function isAbsoluteLocalPath(value) {
      const path = String(value || "");
      return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || /^\//.test(path);
    }

    function joinWorkspacePath(path) {
      const value = String(path || "");
      if (!value) return "";
      if (isAbsoluteLocalPath(value)) return value;
      const root = deps.getWorkspaceRoot?.() || "";
      return deps.joinPath ? deps.joinPath(root, value) : `${String(root || "").replace(/[\\/]+$/, "")}/${value.replace(/^[\\/]+/, "")}`;
    }

    function normalizeLocalPathForComparison(path) {
      const value = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = /^[a-zA-Z]:/.test(value) ? value.slice(0, 2) : (value.startsWith("//") ? "//" : (value.startsWith("/") ? "/" : ""));
      const rest = prefix === "//" ? value.slice(2) : value.slice(prefix.length);
      const parts = [];
      for (const part of rest.split("/").filter(Boolean)) {
        if (part === ".") continue;
        if (part === "..") {
          if (parts.length) parts.pop();
          continue;
        }
        parts.push(part);
      }
      if (prefix === "//") return `//${parts.join("/")}`;
      if (prefix === "/") return `/${parts.join("/")}`;
      return prefix ? `${prefix}/${parts.join("/")}` : parts.join("/");
    }

    function isPathWithinFolder(path, folder) {
      const root = normalizeLocalPathForComparison(folder || "");
      const fullPath = normalizeLocalPathForComparison(path);
      return !!root && !!fullPath && (fullPath === root || fullPath.startsWith(`${root}/`));
    }

    function isPathWithinWorkspace(path) {
      return isPathWithinFolder(path, deps.getWorkspaceRoot?.() || "");
    }

    function getWorkspaceAttachmentPath(attachment = {}) {
      const path = String(attachment.path || "").trim();
      if (!path) return "";
      const fullPath = joinWorkspacePath(path);
      return isPathWithinWorkspace(fullPath) ? fullPath : "";
    }

    function getActivityFileName(path) {
      if (typeof deps.getFileName === "function") return deps.getFileName(path);
      return String(path || "").replace(/\\/g, "/").split("/").pop() || "file";
    }

    function getActivityLinkOpenErrorDetails(error) {
      return {
        name: error?.name || "Error",
        message: error?.message || String(error || "Unable to open link")
      };
    }

    function logActivityLinkOpenFailure(kind, path, error) {
      try {
        const result = deps.appDebugLog?.("warning", "[ai-companion] Unable to open activity link", {
          kind,
          path,
          error: getActivityLinkOpenErrorDetails(error)
        });
        if (result?.catch) result.catch(() => {});
      } catch (_error) {
        // Link failure logging must never affect the panel.
      }
    }

    function reportActivityLinkOpenError(link, error) {
      const kind = link?.kind === "folder" ? "folder" : "file";
      const path = link?.path || "";
      console.error(`Failed to open AI Companion activity ${kind}:`, path, error);
      notifyAiCompanionError(`Unable to open linked ${kind}.`);
      logActivityLinkOpenFailure(kind, path, error);
    }

    function handleActivityLinkOpenError(details = {}) {
      reportActivityLinkOpenError(details.link || {}, details.error || null);
    }

    async function openActivityFile(path, line) {
      const fullPath = joinWorkspacePath(path);
      if (!fullPath || typeof deps.openDocumentSourceFile !== "function") return null;
      try {
        const tab = await deps.openDocumentSourceFile({ name: getActivityFileName(fullPath), path: fullPath }, { temporary: false, title: getActivityFileName(fullPath) });
        if (line) deps.focusEditorLine?.(line);
        return tab;
      } catch (error) {
        reportActivityLinkOpenError({ kind: "file", path: fullPath }, error);
        return null;
      }
    }

    async function openActivityFolder(path) {
      const fullPath = joinWorkspacePath(path);
      if (!fullPath) return null;
      try {
        return await deps.openPathInExplorer?.(fullPath);
      } catch (error) {
        reportActivityLinkOpenError({ kind: "folder", path: fullPath }, error);
        return null;
      }
    }

    function openActivityCompare(compare) {
      if (!compare || typeof deps.openFileCompareInTab !== "function") return null;
      const fullPath = joinWorkspacePath(compare.path);
      return deps.openFileCompareInTab({
        title: compare.title || `Agent edit: ${compare.path || compare.name || "file"}`,
        left: {
          name: compare.beforeName || "Before agent edit",
          content: compare.beforeContent || ""
        },
        right: {
          name: compare.afterName || "After agent edit",
          path: compare.readOnly === true ? null : (fullPath || null),
          content: compare.afterContent || ""
        },
        viewMode: "side-by-side"
      });
    }

    function reviewApprovalChanges(event = {}, actionLabel = "Agent action") {
      const analysis = getApprovalActionAnalysis(event);
      if (event.compare && analysis.operation !== "no-op" && event.compare.changed !== false && openActivityCompare(event.compare)) return;
      showApprovalDetailsModal(event, actionLabel);
    }

    function normalizeTaskChangeText(value) {
      return typeof value === "string" ? value : "";
    }

    function splitTaskChangeLines(value) {
      const text = normalizeTaskChangeText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (!text) return [];
      const lines = text.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      return lines;
    }

    function countChangedLinesFromCompare(compare = {}) {
      const beforeLines = splitTaskChangeLines(compare.beforeContent);
      const afterLines = splitTaskChangeLines(compare.afterContent);
      let start = 0;
      while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start += 1;
      let beforeEnd = beforeLines.length - 1;
      let afterEnd = afterLines.length - 1;
      while (beforeEnd >= start && afterEnd >= start && beforeLines[beforeEnd] === afterLines[afterEnd]) {
        beforeEnd -= 1;
        afterEnd -= 1;
      }
      const beforeMiddle = beforeLines.slice(start, beforeEnd + 1);
      const afterMiddle = afterLines.slice(start, afterEnd + 1);
      if (!beforeMiddle.length && !afterMiddle.length) return { additions: 0, deletions: 0 };
      if (!beforeMiddle.length) return { additions: afterMiddle.length, deletions: 0 };
      if (!afterMiddle.length) return { additions: 0, deletions: beforeMiddle.length };
      if (beforeMiddle.length * afterMiddle.length > 200000) return { additions: afterMiddle.length, deletions: beforeMiddle.length };
      let previous = new Array(afterMiddle.length + 1).fill(0);
      for (let beforeIndex = 0; beforeIndex < beforeMiddle.length; beforeIndex += 1) {
        const current = new Array(afterMiddle.length + 1).fill(0);
        for (let afterIndex = 0; afterIndex < afterMiddle.length; afterIndex += 1) {
          current[afterIndex + 1] = beforeMiddle[beforeIndex] === afterMiddle[afterIndex]
            ? previous[afterIndex] + 1
            : Math.max(previous[afterIndex + 1], current[afterIndex]);
        }
        previous = current;
      }
      const unchanged = previous[afterMiddle.length];
      return {
        additions: Math.max(0, afterMiddle.length - unchanged),
        deletions: Math.max(0, beforeMiddle.length - unchanged)
      };
    }

    function classifyTaskChangedFile(file = {}) {
      const action = String(file.action || "").trim().toLowerCase();
      if (action === "created" || action === "modified" || action === "deleted") return action;
      const compare = file.compare || {};
      const beforeExists = splitTaskChangeLines(compare.beforeContent).length > 0;
      const afterExists = splitTaskChangeLines(compare.afterContent).length > 0;
      if (!beforeExists && afterExists) return "created";
      if (beforeExists && !afterExists) return "deleted";
      return "modified";
    }

    function normalizeTaskChangedFile(file = {}) {
      const path = String(file.path || file.name || file.compare?.path || "").trim();
      if (!path) return null;
      const compare = file.compare && typeof file.compare === "object" ? file.compare : null;
      const counts = compare ? countChangedLinesFromCompare(compare) : { additions: Number(file.additions) || 0, deletions: Number(file.deletions) || 0 };
      return {
        path,
        name: String(file.name || getActivityFileName(path) || path).trim(),
        action: classifyTaskChangedFile(file),
        description: String(file.description || "Updated file.").trim(),
        additions: counts.additions,
        deletions: counts.deletions,
        compare
      };
    }

    function normalizeTaskAttemptedFile(file = {}) {
      const path = String(file.path || file.name || "").trim();
      if (!path) return null;
      return {
        path,
        name: String(file.name || getActivityFileName(path) || path).trim(),
        action: String(file.action || "attempted").trim() || "attempted",
        description: String(file.description || file.error || "Change was attempted.").trim(),
        additions: Number(file.additions) || 0,
        deletions: Number(file.deletions) || 0,
        compare: file.compare || null
      };
    }

    function normalizeTaskBlockedGroup(group = {}) {
      const items = (Array.isArray(group.items) ? group.items : []).map((item) => ({
        tool: String(item?.tool || ""),
        path: String(item?.path || "").trim(),
        reason: String(item?.reason || group.code || "Mutation was blocked.").trim()
      }));
      return {
        code: String(group.code || "mutation-blocked"),
        decisionId: String(group.decisionId || ""),
        capability: String(group.capability || ""),
        count: Math.max(Number(group.count) || 0, items.length),
        items
      };
    }

    function summarizeTaskChanges(files = [], attempted = [], blocked = []) {
      const normalizedFiles = files.map(normalizeTaskChangedFile).filter(Boolean);
      const normalizedAttempted = attempted.map(normalizeTaskAttemptedFile).filter(Boolean);
      const normalizedBlocked = blocked.map(normalizeTaskBlockedGroup);
      return {
        files: normalizedFiles,
        attempted: normalizedAttempted,
        blocked: normalizedBlocked,
        totalFiles: normalizedFiles.length,
        attemptedFiles: normalizedAttempted.length,
        blockedProposals: normalizedBlocked.reduce((total, group) => total + group.count, 0),
        additions: normalizedFiles.reduce((total, file) => total + (Number(file.additions) || 0), 0),
        deletions: normalizedFiles.reduce((total, file) => total + (Number(file.deletions) || 0), 0)
      };
    }

    function buildTaskChangesFromSummary(summary = {}) {
      return summarizeTaskChanges(
        Array.isArray(summary.changedFiles) ? summary.changedFiles : [],
        Array.isArray(summary.attemptedChanges) ? summary.attemptedChanges : [],
        Array.isArray(summary.blockedChanges) ? summary.blockedChanges : []
      );
    }

    function getTaskChanges(record = {}) {
      if (record?.changes && typeof record.changes === "object") {
        return summarizeTaskChanges(record.changes.files || [], record.changes.attempted || [], record.changes.blocked || []);
      }
      const events = Array.isArray(record?.events) ? record.events : [];
      const summary = [...events].reverse().find((event) => event?.type === "agent-summary");
      return summary ? buildTaskChangesFromSummary(summary) : summarizeTaskChanges();
    }

    function appendTaskChangeDelta(parent, file = {}) {
      const additions = Number(file.additions) || 0;
      const deletions = Number(file.deletions) || 0;
      if (!additions && !deletions) return;
      const delta = document.createElement("span");
      delta.className = "ai-companion-workspace-change-delta";
      if (additions) {
        const added = document.createElement("span");
        added.className = "ai-companion-workspace-change-added";
        added.textContent = `+${additions}`;
        delta.appendChild(added);
      }
      if (deletions) {
        const removed = document.createElement("span");
        removed.className = "ai-companion-workspace-change-removed";
        removed.textContent = `-${deletions}`;
        delta.appendChild(removed);
      }
      parent.appendChild(delta);
    }

    function renderTaskChangeRow(file = {}) {
      const row = document.createElement(file.compare ? "button" : "div");
      row.className = `ai-companion-workspace-change-file${file.compare ? " openable" : ""}`;
      if (file.compare) {
        row.type = "button";
        row.addEventListener("click", () => openActivityCompare(file.compare));
      }
      const icon = document.createElement("i");
      icon.className = "bi bi-file-earmark-code";
      icon.setAttribute("aria-hidden", "true");
      const body = document.createElement("span");
      body.className = "ai-companion-workspace-change-file-body";
      const title = document.createElement("span");
      title.className = "ai-companion-workspace-change-file-title";
      title.textContent = file.path || file.name || "file";
      const meta = document.createElement("span");
      meta.className = "ai-companion-workspace-change-file-meta";
      meta.textContent = [file.action, file.description].filter(Boolean).join(" - ");
      body.append(title, meta);
      row.append(icon, body);
      appendTaskChangeDelta(row, file);
      return row;
    }

    function renderBlockedChangesGroup(changes = {}) {
      if (!changes.blockedProposals) return null;
      const details = document.createElement("details");
      details.className = "ai-companion-workspace-blocked-changes";
      const summary = document.createElement("summary");
      summary.textContent = `Blocked proposals (${changes.blockedProposals})`;
      details.appendChild(summary);
      changes.blocked.forEach((group) => {
        const heading = document.createElement("div");
        heading.className = "ai-companion-workspace-blocked-heading";
        heading.textContent = [group.code, group.decisionId, group.capability].filter(Boolean).join(" - ");
        details.appendChild(heading);
        group.items.forEach((item) => details.appendChild(renderTaskChangeRow({
          path: item.path || item.tool || "proposal",
          name: item.path || item.tool || "proposal",
          action: item.tool || "blocked",
          description: item.reason
        })));
      });
      return details;
    }

    /** Count the rows that consume space before nested blocked proposals are expanded. */
    function getTaskChangesVisibleEntryCount(changes = {}) {
      return changes.files.length + changes.attempted.length + (changes.blockedProposals ? 1 : 0);
    }

    /** Keep the expanded changes overlay above the current composer bounds. */
    function syncTaskChangesOverlayLayout() {
      if (!taskChangesExpanded || !taskChangesSection || !agentView || !agentComposer) return;
      const viewBounds = agentView.getBoundingClientRect();
      const composerBounds = agentComposer.getBoundingClientRect();
      const bottomOffset = Math.max(0, viewBounds.bottom - composerBounds.top + 8);
      const availableHeight = Math.max(0, composerBounds.top - viewBounds.top - 16);
      taskChangesSection.style.setProperty("--ai-companion-changes-overlay-bottom", `${bottomOffset}px`);
      taskChangesSection.style.setProperty("--ai-companion-changes-overlay-height", `${availableHeight}px`);
    }

    /** Reflect compact Changes state through the visible control and its ARIA contract. */
    function updateTaskChangesToggle() {
      if (!taskChangesToggle || !taskChangesSection) return;
      const isCompact = taskChangesSection.classList.contains("is-compact");
      taskChangesToggle.hidden = !isCompact;
      taskChangesToggle.setAttribute("aria-expanded", taskChangesExpanded ? "true" : "false");
      taskChangesToggle.setAttribute("title", taskChangesExpanded ? "Hide changed files" : "Show changed files");
      taskChangesToggle.setAttribute("aria-label", taskChangesExpanded ? "Hide changed files" : "Show changed files");
      const icon = taskChangesToggle.querySelector("i");
      if (icon) icon.className = `bi bi-chevron-${taskChangesExpanded ? "down" : "up"}`;
    }

    /** Finish returning the Changes section to its compact in-flow presentation. */
    function finishTaskChangesCollapse() {
      if (taskChangesClosingTimer) {
        window.clearTimeout(taskChangesClosingTimer);
        taskChangesClosingTimer = null;
      }
      taskChangesSection?.classList?.remove("is-expanded", "is-closing");
      taskChangesSection?.style?.removeProperty("--ai-companion-changes-overlay-bottom");
      taskChangesSection?.style?.removeProperty("--ai-companion-changes-overlay-height");
      if (taskChangesList) taskChangesList.hidden = taskChangesSection?.classList?.contains("is-compact") === true;
    }

    /** Expand or explicitly minimize a compact Changes section. */
    function setTaskChangesExpanded(expanded, options = {}) {
      if (!taskChangesSection || !taskChangesList || !taskChangesSection.classList.contains("is-compact")) return;
      const nextExpanded = expanded === true;
      if (taskChangesClosingTimer) {
        window.clearTimeout(taskChangesClosingTimer);
        taskChangesClosingTimer = null;
      }
      taskChangesExpanded = nextExpanded;
      updateTaskChangesToggle();
      if (nextExpanded) {
        taskChangesSection.classList.remove("is-closing");
        taskChangesSection.classList.add("is-expanded");
        taskChangesList.hidden = false;
        syncTaskChangesOverlayLayout();
        return;
      }
      const shouldAnimate = options.animate !== false && !prefersReducedPanelMotion();
      if (!shouldAnimate) {
        finishTaskChangesCollapse();
        return;
      }
      taskChangesSection.classList.add("is-closing");
      taskChangesClosingTimer = window.setTimeout(finishTaskChangesCollapse, TASK_CHANGES_ANIMATION_MS);
    }

    /** Clear transient overlay state before rendering another task's changes. */
    function resetTaskChangesExpansion() {
      taskChangesExpanded = false;
      finishTaskChangesCollapse();
      updateTaskChangesToggle();
    }

    function renderTaskChangesPanel(record = null) {
      if (!taskChangesPanel || !taskChangesSummary || !taskChangesList) return;
      resetTaskChangesExpansion();
      const changes = getTaskChanges(record || {});
      const hasChanges = changes.totalFiles > 0 || changes.attemptedFiles > 0 || changes.blockedProposals > 0;
      if (taskChangesSection) taskChangesSection.hidden = !hasChanges;
      taskChangesSummary.replaceChildren?.();
      taskChangesList.replaceChildren?.();
      taskChangesSection?.classList?.remove("is-compact");
      if (!hasChanges) {
        updateTaskChangesToggle();
        return;
      }
      const summary = document.createElement("div");
      summary.className = "ai-companion-workspace-change-summary";
      const label = document.createElement("span");
      label.textContent = `Changed files ${changes.totalFiles}`;
      summary.appendChild(label);
      appendTaskChangeDelta(summary, changes);
      if (changes.attemptedFiles) {
        const attempted = document.createElement("span");
        attempted.className = "ai-companion-workspace-change-attempted";
        attempted.textContent = `Attempted ${changes.attemptedFiles}`;
        summary.appendChild(attempted);
      }
      if (changes.blockedProposals) {
        const blocked = document.createElement("span");
        blocked.className = "ai-companion-workspace-change-blocked";
        blocked.textContent = `Blocked ${changes.blockedProposals}`;
        summary.appendChild(blocked);
      }
      taskChangesSummary.appendChild(summary);
      changes.files.forEach((file) => taskChangesList.appendChild(renderTaskChangeRow(file)));
      changes.attempted.forEach((file) => taskChangesList.appendChild(renderTaskChangeRow(file)));
      const blockedGroup = renderBlockedChangesGroup(changes);
      if (blockedGroup) taskChangesList.appendChild(blockedGroup);
      const isCompact = getTaskChangesVisibleEntryCount(changes) > TASK_CHANGES_INLINE_ENTRY_LIMIT;
      taskChangesSection?.classList?.toggle("is-compact", isCompact);
      taskChangesList.hidden = isCompact;
      updateTaskChangesToggle();
    }

    taskChangesToggle?.addEventListener("click", () => setTaskChangesExpanded(!taskChangesExpanded));
    if (typeof window.ResizeObserver === "function" && agentView && agentComposer) {
      taskChangesResizeObserver = new window.ResizeObserver(syncTaskChangesOverlayLayout);
      taskChangesResizeObserver.observe(agentView);
      taskChangesResizeObserver.observe(agentComposer);
    }

    function hasWorkspaceUi() {
      return !!workspaceHistory && !!workspaceInspector;
    }

    function setWorkspaceElementHidden(element, hidden) {
      if (element) element.hidden = hidden === true;
    }

    function getWorkspaceSearchModule() {
      return deps.getWorkspaceSearch?.() || app?.modules?.workspaceSearch || null;
    }

    function getBottomPanelModule() {
      return deps.getBottomPanel?.() || app?.modules?.bottomPanelTabs || null;
    }

    function getCurrentSidebarView() {
      return deps.getSidebarView?.() || getWorkspaceSearchModule()?.getActiveSidebarView?.() || "files";
    }

    function setWorkspaceSidebarView(view) {
      const targetView = view || "files";
      if (typeof deps.setSidebarView === "function") deps.setSidebarView(targetView);
      else getWorkspaceSearchModule()?.setSidebarView?.(targetView);
    }

    function getCurrentBottomPanelState() {
      const bottomPanel = getBottomPanelModule();
      return {
        visible: bottomPanel?.isPanelVisible?.() === true,
        activeTabId: bottomPanel?.getActiveTabId?.() || ""
      };
    }

    function restoreBottomPanelState(state = {}) {
      const bottomPanel = getBottomPanelModule();
      if (!bottomPanel) return;
      if (state.visible) bottomPanel.activateTab?.(state.activeTabId || undefined);
      else bottomPanel.hidePanel?.();
    }

    function getWorkspaceGlobalStateNumber(key, fallback) {
      const value = Number(deps.loadGlobalState?.()?.[key]);
      return Number.isFinite(value) ? value : fallback;
    }

    function clampWorkspaceSideWidth(width) {
      const numeric = Number(width);
      const fallback = Number.isFinite(numeric) ? numeric : DEFAULT_WORKSPACE_HISTORY_WIDTH;
      return Math.max(MIN_WORKSPACE_SIDE_WIDTH, Math.min(MAX_WORKSPACE_SIDE_WIDTH, fallback));
    }

    function applyWorkspaceHistoryWidth(width, persist = true) {
      workspaceHistoryWidth = clampWorkspaceSideWidth(width);
      panel.style?.setProperty?.("--ai-companion-workspace-history-width", `${workspaceHistoryWidth}px`);
      workspaceHistoryResizer?.setAttribute("aria-valuemin", String(MIN_WORKSPACE_SIDE_WIDTH));
      workspaceHistoryResizer?.setAttribute("aria-valuemax", String(MAX_WORKSPACE_SIDE_WIDTH));
      workspaceHistoryResizer?.setAttribute("aria-valuenow", String(Math.round(workspaceHistoryWidth)));
      if (persist) deps.saveGlobalState?.({ aiCompanionWorkspaceHistoryWidth: workspaceHistoryWidth });
    }

    function applyWorkspaceInspectorWidth(width, persist = true) {
      workspaceInspectorWidth = clampWorkspaceSideWidth(width);
      panel.style?.setProperty?.("--ai-companion-workspace-inspector-width", `${workspaceInspectorWidth}px`);
      workspaceInspectorResizer?.setAttribute("aria-valuemin", String(MIN_WORKSPACE_SIDE_WIDTH));
      workspaceInspectorResizer?.setAttribute("aria-valuemax", String(MAX_WORKSPACE_SIDE_WIDTH));
      workspaceInspectorResizer?.setAttribute("aria-valuenow", String(Math.round(workspaceInspectorWidth)));
      if (persist) deps.saveGlobalState?.({ aiCompanionWorkspaceInspectorWidth: workspaceInspectorWidth });
    }

    function restoreWorkspaceSideWidths() {
      applyWorkspaceHistoryWidth(getWorkspaceGlobalStateNumber("aiCompanionWorkspaceHistoryWidth", DEFAULT_WORKSPACE_HISTORY_WIDTH), false);
      applyWorkspaceInspectorWidth(getWorkspaceGlobalStateNumber("aiCompanionWorkspaceInspectorWidth", DEFAULT_WORKSPACE_INSPECTOR_WIDTH), false);
    }

    function getChatPrimaryTask(chat = {}) {
      const tasks = Array.isArray(chat.tasks) ? [...chat.tasks].sort(compareAgentTaskIndexItems) : [];
      return tasks[tasks.length - 1] || null;
    }

    function getChatMode(chat = {}) {
      return normalizeCompanionMode(getChatPrimaryTask(chat)?.mode || "chat");
    }

    function getCompactModeLabel(mode) {
      const normalized = normalizeCompanionMode(mode);
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function getWorkspaceNewChatLabel(mode) {
      const normalized = normalizeCompanionMode(mode);
      if (normalized === "agent") return "New Agentic Chat";
      if (normalized === "plan") return "New Plan";
      return "New Chat";
    }

    function getCompanionModeIconClass(mode) {
      const normalized = normalizeCompanionMode(mode);
      if (normalized === "agent") return "bi-robot";
      if (normalized === "plan") return "bi-list-check";
      return "bi-chat-dots";
    }

    function renderWorkspaceTitle(title, mode) {
      if (!workspaceChatTitle) return;
      workspaceChatTitle.replaceChildren?.();
      const icon = document.createElement("i");
      icon.className = `bi ${getCompanionModeIconClass(mode)} ai-companion-workspace-title-mode-icon`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "ai-companion-workspace-title-text";
      label.textContent = title;
      workspaceChatTitle.append(icon, label);
    }

    function renderWorkspaceNewChatModeButtons() {
      workspaceNewChatMenuList?.querySelectorAll?.("[data-ai-companion-workspace-new-chat-mode]").forEach((button) => {
        const mode = normalizeCompanionMode(button.dataset.aiCompanionWorkspaceNewChatMode);
        const icon = document.createElement("i");
        icon.className = `bi ${getCompanionModeIconClass(mode)} ai-companion-workspace-menu-mode-icon`;
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `${getCompactModeLabel(mode)} mode`;
        button.replaceChildren?.(icon, label);
      });
    }

    function updateWorkspaceFilterMenuSelection(menu, dataKey, selectedValue) {
      menu?.querySelectorAll?.(`[${dataKey}]`).forEach((button) => {
        const datasetValue = dataKey === "data-ai-companion-workspace-chat-filter"
          ? button.dataset?.aiCompanionWorkspaceChatFilter
          : button.dataset?.aiCompanionWorkspacePlanFilter;
        const selected = String(datasetValue || button.getAttribute?.(dataKey) || "") === String(selectedValue || "all");
        button.classList?.toggle("active", selected);
        button.setAttribute("aria-checked", selected ? "true" : "false");
      });
    }
    function updateWorkspaceFilterSelections() {
      updateWorkspaceFilterMenuSelection(workspaceChatFilterMenu, "data-ai-companion-workspace-chat-filter", workspaceChatFilter);
      updateWorkspaceFilterMenuSelection(workspacePlanFilterMenu, "data-ai-companion-workspace-plan-filter", workspacePlanFilter);
    }

    function getWorkspaceStatusKey(status, fallback = "ready") {
      const normalized = String(status || fallback || "ready").trim().toLowerCase();
      if (["completed", "complete", "implemented", "success", "succeeded"].includes(normalized)) return "completed";
      if (normalized === "incomplete") return "incomplete";
      if (["error", "failed", "failure"].includes(normalized)) return "error";
      if (["cancelled", "canceled", "interrupted"].includes(normalized)) return "cancelled";
      if (["planned", "pending"].includes(normalized)) return "planned";
      if (["running", "working"].includes(normalized)) return "running";
      return "ready";
    }

    function getWorkspaceStatusLabel(status, fallback = "Ready") {
      const key = getWorkspaceStatusKey(status, fallback);
      if (key === "completed") return "Completed";
      if (key === "incomplete") return "Incomplete";
      if (key === "error") return "Error";
      if (key === "cancelled") return "Cancelled";
      if (key === "planned") return "Planned";
      if (key === "running") return "Running";
      return "Ready";
    }

    function isWorkspaceRecordTerminal(record = null) {
      const status = getWorkspaceStatusKey(record?.status, "");
      return status === "completed" || status === "incomplete" || status === "error" || status === "cancelled" || status === "planned";
    }

    function getWorkspaceChatStatus(chat = {}, isRunningChat = false) {
      if (isRunningChat) return "running";
      return getWorkspaceStatusKey(getChatPrimaryTask(chat)?.status, "ready");
    }

    function applyWorkspaceStatusClass(element, statusKey) {
      if (!element) return;
      WORKSPACE_STATUS_CLASS_NAMES.forEach((className) => element.classList?.remove?.(className));
      element.classList?.add?.(`status-${getWorkspaceStatusKey(statusKey)}`);
    }

    function formatWorkspaceDate(value) {
      const date = new Date(Number(value) || Date.now());
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function getWorkspaceChatGroup(chat = {}) {
      const date = new Date(Number(chat.updatedAt || chat.createdAt) || Date.now());
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfChatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      if (startOfChatDay >= startOfToday) return "Today";
      if (startOfChatDay >= startOfToday - 86400000) return "Yesterday";
      return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    }

    function filterWorkspaceChats(chats = []) {
      const query = String(workspaceChatSearch?.value || "").trim().toLowerCase();
      return chats.filter((chat) => {
        const mode = getChatMode(chat);
        if (workspaceChatFilter !== "all" && mode !== workspaceChatFilter) return false;
        if (!query) return true;
        return getChatDisplayName(chat).toLowerCase().includes(query) || String(chat.searchContent || "").includes(query);
      });
    }

    function getTaskRecordSearchContent(record = {}) {
      const responses = (Array.isArray(record.events) ? record.events : []).flatMap((event) => {
        if (event?.type === "chat-response") return [event.content];
        if (event?.type === "agent-summary") return [event.finalResponse, event.outcome];
        return [];
      });
      return [record.prompt, ...responses].map((value) => String(value || "").trim()).filter(Boolean).join("\n");
    }

    async function readChatTaskRecordForSearch(chat, task) {
      if (!task?.id) return null;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.readFile) {
        try {
          return JSON.parse(localStorage.getItem(`${AGENT_TASKS_STORAGE_KEY}:${task.id}`) || "null");
        } catch (_error) {
          return null;
        }
      }
      const chatDir = await getAgentChatDirPath(chat);
      if (!chatDir) return null;
      const filePath = deps.joinPath(chatDir, task.fileName || `${task.id}.json`);
      try {
        return JSON.parse(await deps.Neutralino.filesystem.readFile(filePath) || "null");
      } catch (_error) {
        return null;
      }
    }

    async function addWorkspaceChatSearchContent(chats = []) {
      await Promise.all(chats.map(async (chat) => {
        const records = await Promise.all((Array.isArray(chat.tasks) ? chat.tasks : []).map((task) => readChatTaskRecordForSearch(chat, task)));
        const savedRecords = records.filter(Boolean);
        chat.searchContent = savedRecords.map(getTaskRecordSearchContent).join("\n").toLowerCase();
        chat.hasAttachments = savedRecords.some((record) => Array.isArray(record.attachments) && record.attachments.length > 0);
      }));
      return chats;
    }

    function clearWorkspaceChatList(message = "No matching chats") {
      workspaceChatList?.replaceChildren?.();
      if (!workspaceChatList) return;
      const empty = document.createElement("div");
      empty.className = "ai-companion-workspace-empty";
      empty.textContent = message;
      workspaceChatList.appendChild(empty);
    }

    function createWorkspaceChatActionMenu(chat) {
      const actionMenu = document.createElement("div");
      actionMenu.className = "ai-companion-chat-action-menu";
      actionMenu.dataset.aiCompanionChatActionMenu = "true";
      actionMenu.setAttribute("role", "menu");
      actionMenu.hidden = true;
      const createActionItem = (label, handler, extraClass = "") => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `ai-companion-chat-action-menu-item${extraClass ? ` ${extraClass}` : ""}`;
        button.setAttribute("role", "menuitem");
        button.textContent = label;
        button.addEventListener("click", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          actionMenu.hidden = true;
          void handler(chat);
        });
        return button;
      };
      actionMenu.append(
        createActionItem("Rename Chat", renameSavedChat),
        createActionItem("Delete Chat", deleteSavedChat, "danger"),
        createActionItem("Open Chat Folder", showSavedChatFolder)
      );
      return actionMenu;
    }

    function createWorkspaceChatRow(chat = {}) {
      const row = document.createElement("div");
      row.className = "ai-companion-workspace-chat-item";
      row.classList?.add?.("ai-companion-workspace-chat-item");
      row.dataset.chatId = chat.id || "";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      const isRunningChat = isAgentRunning() && !!chat.id && chat.id === activeAgentChat?.id;
      row.classList.toggle("active", !!chat.id && chat.id === activeAgentChat?.id);
      row.classList.toggle("running", isRunningChat);
      row.title = formatChatUpdatedTooltip(chat);
      const chatMode = getChatMode(chat);
      const icon = document.createElement("i");
      icon.className = `bi ${getCompanionModeIconClass(chatMode)} ai-companion-workspace-chat-icon mode-${chatMode}`;
      icon.setAttribute("aria-hidden", "true");
      const iconColumn = document.createElement("span");
      iconColumn.className = "ai-companion-workspace-chat-icon-column";
      iconColumn.append(icon);
      if (chat.hasAttachments === true) {
        const attachmentIndicator = document.createElement("span");
        attachmentIndicator.className = "ai-companion-workspace-chat-attachment-indicator";
        attachmentIndicator.setAttribute("aria-label", "Contains attachments");
        attachmentIndicator.title = "Contains attachments";
        const attachmentIcon = document.createElement("i");
        attachmentIcon.className = "bi bi-paperclip";
        attachmentIcon.setAttribute("aria-hidden", "true");
        attachmentIndicator.append(attachmentIcon);
        iconColumn.append(attachmentIndicator);
      }
      const body = document.createElement("span");
      body.className = "ai-companion-workspace-chat-body";
      const title = document.createElement("span");
      title.className = "ai-companion-workspace-chat-title";
      title.textContent = getChatDisplayName(chat);
      const meta = document.createElement("span");
      meta.className = "ai-companion-workspace-chat-meta";
      const time = document.createElement("span");
      time.className = "ai-companion-workspace-chat-time";
      time.textContent = formatWorkspaceDate(chat.updatedAt || chat.createdAt);
      const separator = document.createElement("span");
      separator.className = "ai-companion-workspace-chat-meta-separator";
      separator.textContent = "-";
      const mode = document.createElement("span");
      mode.className = `ai-companion-workspace-chat-mode mode-${chatMode}`;
      mode.classList?.add?.("ai-companion-workspace-chat-mode", `mode-${chatMode}`);
      mode.textContent = getCompactModeLabel(chatMode);
      meta.append(mode, separator, time);
      body.append(title, meta);
      const chatStatus = getWorkspaceChatStatus(chat, isRunningChat);
      const status = document.createElement("span");
      status.className = "ai-companion-workspace-chat-status-dot ai-companion-workspace-chat-running-indicator";
      status.setAttribute("aria-label", getWorkspaceStatusLabel(chatStatus));
      status.title = getWorkspaceStatusLabel(chatStatus);
      applyWorkspaceStatusClass(status, chatStatus);
      const actions = document.createElement("div");
      actions.className = "ai-companion-chat-actions";
      const actionToggle = document.createElement("button");
      actionToggle.type = "button";
      actionToggle.className = "ai-companion-chat-action-toggle";
      actionToggle.setAttribute("aria-label", `Open actions for ${getChatDisplayName(chat)}`);
      actionToggle.setAttribute("aria-haspopup", "menu");
      actionToggle.setAttribute("aria-expanded", "false");
      actionToggle.innerHTML = '<i class="bi bi-three-dots-vertical" aria-hidden="true"></i>';
      const actionMenu = createWorkspaceChatActionMenu(chat);
      workspaceChatActionToggleToMenu.set(actionToggle, actionMenu);
      const openWorkspaceChatActionMenu = (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        setChatActionMenuOpen(actionToggle, actionMenu, actionMenu.hidden === true);
      };
      actionToggle.addEventListener("click", openWorkspaceChatActionMenu);
      actions.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        const actionMenuToggle = event.target?.closest?.(".ai-companion-chat-action-toggle");
        if (actionMenuToggle === actionToggle) openWorkspaceChatActionMenu(event);
      });
      row.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        const actionMenuToggle = event.target?.closest?.(".ai-companion-chat-action-toggle");
        if (actionMenuToggle === actionToggle) {
          setChatActionMenuOpen(actionToggle, actionMenu, actionMenu.hidden === true);
          return;
        }
        if (event.target?.closest?.(".ai-companion-chat-actions")) return;
        if (isAgentRunning()) {
          if (workspaceOpen) {
            void viewSavedChatInWorkspaceDuringRun(chat);
            return;
          }
          notifyAiCompanionBlocked("Stop current request before switching chats");
          return;
        }
        void switchToSavedChat(chat.id, chat);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target?.closest?.(".ai-companion-chat-actions")) return;
        event.preventDefault?.();
        row.click();
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setChatActionMenuOpen(actionToggle, actionMenu, true, { x: event.clientX, y: event.clientY });
      });
      document.body?.appendChild(actionMenu);
      row.append(iconColumn, body, status, actions);
      actions.append(actionToggle);
      return row;
    }

    function renderWorkspaceChatHistory(chats = workspaceChatIndexes) {
      workspaceChatIndexes = Array.isArray(chats) ? chats : [];
      if (!workspaceChatList) return;
      const activeSearchChat = workspaceChatIndexes.find((chat) => chat.id && chat.id === activeAgentChat?.id);
      if (activeSearchChat && agentEntries.length) {
        activeSearchChat.searchContent = agentEntries.map((entry) => getTaskRecordSearchContent(entry.record)).join("\n").toLowerCase();
        activeSearchChat.hasAttachments = agentEntries.some((entry) => Array.isArray(entry.record?.attachments) && entry.record.attachments.length > 0);
      }
      closeChatActionMenu();
      workspaceChatList.replaceChildren?.();
      const visibleChats = filterWorkspaceChats(workspaceChatIndexes);
      if (!visibleChats.length) {
        clearWorkspaceChatList(workspaceChatIndexes.length ? "No matching chats" : "No saved chats");
        return;
      }
      let currentGroup = "";
      const displayedChats = visibleChats.slice(0, workspaceChatVisibleLimit);
      displayedChats.forEach((chat) => {
        const group = getWorkspaceChatGroup(chat);
        if (group !== currentGroup) {
          currentGroup = group;
          const heading = document.createElement("div");
          heading.className = "ai-companion-workspace-chat-group";
          heading.textContent = group;
          workspaceChatList.appendChild(heading);
        }
        workspaceChatList.appendChild(createWorkspaceChatRow(chat));
      });
      if (visibleChats.length > displayedChats.length) {
        const loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.className = "ai-companion-workspace-load-more";
        loadMore.textContent = `Load more chats (${visibleChats.length - displayedChats.length})`;
        loadMore.addEventListener("click", () => {
          workspaceChatVisibleLimit += WORKSPACE_CHAT_PAGE_SIZE;
          renderWorkspaceChatHistory(workspaceChatIndexes);
        });
        workspaceChatList.appendChild(loadMore);
      }
    }

    function getActiveWorkspaceChatDisplaySource() {
      if (!activeAgentChat) return null;
      const savedChat = workspaceChatIndexes.find((chat) => chat.id && chat.id === activeAgentChat.id) || null;
      return {
        ...(savedChat || activeAgentChat),
        ...activeAgentChat,
        title: savedChat?.title || activeAgentChat.title,
        tasks: agentTaskIndex.length ? agentTaskIndex : (Array.isArray(savedChat?.tasks) ? savedChat.tasks : [])
      };
    }

    function renderWorkspaceHeader() {
      const record = getSelectedWorkspaceRecord();
      const displayChat = getActiveWorkspaceChatDisplaySource();
      const mode = record?.mode || activeTab;
      const title = displayChat ? getChatDisplayName(displayChat, mode) : "AI Companion";
      renderWorkspaceTitle(title, mode);
      if (workspaceStatusChip) {
        const statusKey = getWorkspaceStatusKey(record?.status, isAgentRunning() ? "running" : "ready");
        workspaceStatusChip.textContent = getWorkspaceStatusLabel(statusKey);
        applyWorkspaceStatusClass(workspaceStatusChip, statusKey);
      }
      if (workspaceModeChip) workspaceModeChip.textContent = getCompactModeLabel(record?.mode || activeTab);
      if (workspaceModelChip) workspaceModelChip.textContent = getCurrentSettings()?.model || getCurrentSettings()?.litellmModelAlias || "Model";
      if (workspaceTimeChip) workspaceTimeChip.textContent = formatWorkspaceDate(record?.updatedAt || activeAgentChat?.updatedAt || Date.now());
      if (workspaceTaskDetailsToggle) {
        workspaceTaskDetailsToggle.innerHTML = '<i class="bi bi-info-circle" aria-hidden="true"></i>';
        workspaceTaskDetailsToggle.setAttribute("aria-label", "Show task details");
        workspaceTaskDetailsToggle.setAttribute("aria-expanded", workspaceTaskDetailsPopover?.hidden === false ? "true" : "false");
      }
    }

    function appendWorkspaceSummaryRow(parent, label, value, iconClass = "bi-dot") {
      if (!parent) return null;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ai-companion-workspace-summary-row";
      const icon = document.createElement("i");
      icon.className = `bi ${iconClass} ai-companion-workspace-summary-icon`;
      icon.setAttribute("aria-hidden", "true");
      const title = document.createElement("span");
      title.className = "ai-companion-workspace-summary-label";
      title.textContent = label;
      const detail = document.createElement("span");
      detail.className = "ai-companion-workspace-summary-value";
      detail.textContent = value;
      row.append(icon, title, detail);
      parent.appendChild(row);
      return row;
    }

    function makeWorkspaceIdRowCopyable(row, id) {
      if (!row || !id || !copyActions?.writeTextToClipboard) return;
      const detail = row.querySelector?.(".ai-companion-workspace-summary-value");
      if (!detail) return;
      let feedbackTimer = null;
      row.classList.add("ai-companion-workspace-summary-copy-row");
      row.title = "Copy ID";
      row.setAttribute("aria-label", "Copy ID");
      detail.setAttribute("aria-live", "polite");
      row.addEventListener("click", async () => {
        try {
          await copyActions.writeTextToClipboard(id);
          if (feedbackTimer) window.clearTimeout(feedbackTimer);
          row.classList.add("is-copied");
          detail.textContent = "ID copied";
          feedbackTimer = window.setTimeout(() => {
            feedbackTimer = null;
            row.classList.remove("is-copied");
            detail.textContent = id;
          }, WORKSPACE_ID_COPY_FEEDBACK_MS);
        } catch (error) {
          if (feedbackTimer) window.clearTimeout(feedbackTimer);
          feedbackTimer = null;
          row.classList.remove("is-copied");
          detail.textContent = id;
          console.error("Failed to copy AI Companion task ID:", error);
          notifyAiCompanionError("Copy failed");
        }
      });
    }

    function renderWorkspaceContext() {
      if (!workspaceContext) return;
      workspaceContext.replaceChildren?.();
      const activeFilePayload = getActiveFilePayload();
      const editorContext = createEditorReadContext(getSelectedRunMode(), activeFilePayload);
      const workspace = editorContext.workspace || {};
      const activeDocument = editorContext.activeDocument || workspace.activeTab || null;
      appendWorkspaceSummaryRow(workspaceContext, "Workspace", workspace.rootPath || workspace.activeFolderName || "No folder", "bi-folder2-open");
      appendWorkspaceSummaryRow(workspaceContext, "Active file", activeDocument?.title || activeDocument?.path || "No active file", "bi-file-earmark-text");
      appendWorkspaceSummaryRow(workspaceContext, "Open tabs", String(workspace.openTabCount || 0), "bi-files");
      const contextCount = latestRequestContextFiles.length || 0;
      appendWorkspaceSummaryRow(workspaceContext, "Context files", String(contextCount), "bi-paperclip");
    }

    function getSelectedWorkspaceRecord() {
      return activeAgentEntry?.record || agentEntries[agentEntries.length - 1]?.record || null;
    }

    function getSelectedWorkspaceEntry() {
      const record = getSelectedWorkspaceRecord();
      return record?.id ? agentEntries.find((entry) => entry.record?.id === record.id) || null : null;
    }

    function getSelectedWorkspaceEvents() {
      return Array.isArray(getSelectedWorkspaceRecord()?.events) ? getSelectedWorkspaceRecord().events : [];
    }

    function getWorkspaceToolEvents() {
      const logicalEvents = new Map();
      getSelectedWorkspaceEvents().filter((event) => event?.type === "tool" || event?.type === "tool-error").forEach((event, index) => {
        const logicalId = event.activity?.id || event.activityId || `event-${index}`;
        logicalEvents.set(logicalId, event);
      });
      return [...logicalEvents.values()];
    }

    function getWorkspaceToolStatus(event = {}) {
      if (event.type === "tool-error") return "failed";
      const status = event.activity?.status || event.status || "completed";
      if (status === "running" && isWorkspaceRecordTerminal(getSelectedWorkspaceRecord())) return "completed";
      return status;
    }

    function getWorkspaceToolStatusLabel(event = {}) {
      const status = getWorkspaceToolStatus(event);
      return status === "completed" ? "Ran" : status;
    }

    function focusWorkspaceEntryForRecord(record) {
      panel.querySelectorAll?.(".ai-companion-workspace-entry-focused").forEach((element) => element.classList.remove("ai-companion-workspace-entry-focused"));
      const entry = record?.id ? agentEntries.find((candidate) => candidate.record?.id === record.id) : getSelectedWorkspaceEntry();
      entry?.element?.classList?.add("ai-companion-workspace-entry-focused");
      entry?.element?.scrollIntoView?.({ block: "center" });
    }

    function focusWorkspaceToolEvent(event) {
      panel.querySelectorAll?.(".ai-companion-workspace-entry-focused").forEach((element) => element.classList.remove("ai-companion-workspace-entry-focused"));
      const entry = getSelectedWorkspaceEntry();
      const focused = entry?.renderer?.focusActivity?.(event?.activity?.id) === true;
      if (!focused) focusWorkspaceEntryForRecord(getSelectedWorkspaceRecord());
    }

    function focusWorkspaceApprovalEvent(event) {
      panel.querySelectorAll?.(".ai-companion-workspace-entry-focused").forEach((element) => element.classList.remove("ai-companion-workspace-entry-focused"));
      const entry = getSelectedWorkspaceEntry();
      const focused = entry?.renderer?.focusActivity?.(event?.approvalId) === true;
      if (!focused) focusWorkspaceEntryForRecord(getSelectedWorkspaceRecord());
    }

    function captureWorkspaceInspectorSectionState(section, panelElement, toggle) {
      return {
        hidden: panelElement?.hidden === true,
        collapsed: section?.classList?.contains("collapsed") === true,
        ariaExpanded: toggle?.getAttribute("aria-expanded") || "true"
      };
    }

    function applyWorkspaceInspectorSectionState(section, panelElement, toggle, state) {
      if (!state) return;
      if (panelElement) panelElement.hidden = state.hidden;
      section?.classList?.toggle("collapsed", state.collapsed);
      toggle?.setAttribute("aria-expanded", state.ariaExpanded);
    }

    function setWorkspaceInspectorSectionCollapsed(section, panelElement, toggle, collapsed) {
      if (panelElement) panelElement.hidden = collapsed;
      section?.classList?.toggle("collapsed", collapsed);
      toggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    function captureWorkspaceToolsCollapsedSnapshot() {
      return {
        context: captureWorkspaceInspectorSectionState(workspaceContextSection, workspaceContext, workspaceContextSection?.querySelector?.("[data-ai-companion-inspector-toggle]")),
        approvals: captureWorkspaceInspectorSectionState(workspaceApprovalsSection, workspaceApprovals, workspaceApprovalsSection?.querySelector?.("[data-ai-companion-inspector-toggle]"))
      };
    }

    function setWorkspaceToolsExpanded(expanded) {
      const open = expanded === true;
      if (open && !workspaceToolsCollapsedSnapshot) workspaceToolsCollapsedSnapshot = captureWorkspaceToolsCollapsedSnapshot();
      workspaceToolsExpanded = open;
      workspaceToolsExpandedRecordId = open ? (getSelectedWorkspaceRecord()?.id || "") : "";
      if (open) {
        setWorkspaceInspectorSectionCollapsed(workspaceContextSection, workspaceContext, workspaceContextSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), true);
        setWorkspaceInspectorSectionCollapsed(workspaceToolsSection, workspaceTools, workspaceToolsSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), false);
        setWorkspaceInspectorSectionCollapsed(workspaceApprovalsSection, workspaceApprovals, workspaceApprovalsSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), true);
      } else if (workspaceToolsCollapsedSnapshot) {
        applyWorkspaceInspectorSectionState(workspaceContextSection, workspaceContext, workspaceContextSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), workspaceToolsCollapsedSnapshot.context);
        applyWorkspaceInspectorSectionState(workspaceApprovalsSection, workspaceApprovals, workspaceApprovalsSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), workspaceToolsCollapsedSnapshot.approvals);
        workspaceToolsCollapsedSnapshot = null;
      }
      renderWorkspaceTools();
    }

    function renderWorkspaceTools() {
      if (!workspaceTools) return;
      workspaceTools.replaceChildren?.();
      const record = getSelectedWorkspaceRecord();
      const recordId = record?.id || "";
      if (workspaceToolsExpanded && workspaceToolsExpandedRecordId && workspaceToolsExpandedRecordId !== recordId) {
        if (workspaceToolsCollapsedSnapshot) {
          applyWorkspaceInspectorSectionState(workspaceContextSection, workspaceContext, workspaceContextSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), workspaceToolsCollapsedSnapshot.context);
          applyWorkspaceInspectorSectionState(workspaceApprovalsSection, workspaceApprovals, workspaceApprovalsSection?.querySelector?.("[data-ai-companion-inspector-toggle]"), workspaceToolsCollapsedSnapshot.approvals);
        }
        workspaceToolsExpanded = false;
        workspaceToolsExpandedRecordId = "";
        workspaceToolsCollapsedSnapshot = null;
      }
      const events = getWorkspaceToolEvents();
      const running = events.filter((event) => getWorkspaceToolStatus(event) === "running").length;
      const failed = events.filter((event) => getWorkspaceToolStatus(event) === "failed").length;
      const partial = events.filter((event) => getWorkspaceToolStatus(event) === "partial").length;
      const completed = Math.max(0, events.length - running - failed - partial);
      appendWorkspaceSummaryRow(workspaceTools, "Running", String(running), "bi-play-circle");
      appendWorkspaceSummaryRow(workspaceTools, "Completed", String(completed), "bi-check-circle");
      if (partial > 0) appendWorkspaceSummaryRow(workspaceTools, "Partial", String(partial), "bi-exclamation-circle");
      appendWorkspaceSummaryRow(workspaceTools, "Failed", String(failed), "bi-x-circle");
      const sortedEvents = events.map((event, index) => ({ event, index })).sort((a, b) => {
        const statusA = getWorkspaceToolStatus(a.event) === "running" ? 0 : 1;
        const statusB = getWorkspaceToolStatus(b.event) === "running" ? 0 : 1;
        if (statusA !== statusB) return statusA - statusB;
        const timeA = Number(a.event.completedAt || a.event.createdAt || 0);
        const timeB = Number(b.event.completedAt || b.event.createdAt || 0);
        if (timeA !== timeB) return timeB - timeA;
        return b.index - a.index;
      }).map((item) => item.event);
      const visibleEvents = workspaceToolsExpanded ? sortedEvents : sortedEvents.slice(0, WORKSPACE_TOOLS_PREVIEW_LIMIT);
      visibleEvents.forEach((event) => {
        const presentation = getToolPresentation(event.tool);
        const title = event.activity?.title || event.tool || presentation.title || "Tool";
        const row = appendWorkspaceSummaryRow(workspaceTools, title, getWorkspaceToolStatusLabel(event), presentation.icon || "bi-gear");
        row?.addEventListener("click", () => focusWorkspaceToolEvent(event));
      });
      if (sortedEvents.length > WORKSPACE_TOOLS_PREVIEW_LIMIT) {
        const row = appendWorkspaceSummaryRow(
          workspaceTools,
          workspaceToolsExpanded ? "Show less..." : "View all tools",
          workspaceToolsExpanded ? String(WORKSPACE_TOOLS_PREVIEW_LIMIT) : String(sortedEvents.length),
          workspaceToolsExpanded ? "bi-chevron-up" : "bi-chevron-down"
        );
        row?.classList?.add("ai-companion-workspace-tools-toggle-row");
        row?.addEventListener("click", () => setWorkspaceToolsExpanded(!workspaceToolsExpanded));
      }
    }

    function renderWorkspaceApprovals() {
      if (!workspaceApprovals) return;
      workspaceApprovals.replaceChildren?.();
      const approvals = getSelectedWorkspaceEvents().filter((event) => event?.type === "approval");
      const pending = approvals.filter(isUnansweredApprovalEvent);
      const history = approvals.filter((event) => !isUnansweredApprovalEvent(event));
      appendWorkspaceSummaryRow(workspaceApprovals, "Pending", String(pending.length), "bi-shield-exclamation");
      appendWorkspaceSummaryRow(workspaceApprovals, "History", String(history.length), "bi-clock-history");
      [...pending, ...history].forEach((event) => {
        const row = appendWorkspaceSummaryRow(workspaceApprovals, isUnansweredApprovalEvent(event) ? "pending" : (event.response?.label || "resolved"), event.title || event.summary || event.tool || "Approval", "bi-shield-check");
        row?.addEventListener("click", () => focusWorkspaceApprovalEvent(event));
      });
    }

    function formatWorkspaceTokenCount(value) {
      const count = Math.max(0, Math.round(Number(value) || 0));
      if (count >= 1000000) return (count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
      if (count >= 1000) return (count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
      return String(count);
    }

    function getWorkspaceTaskTokenTotals() {
      const liveTotals = contextIndicator?.getTotals?.();
      const restoredTotals = getChatContextRestoreTotals(activeAgentChat, agentTaskIndex);
      return liveTotals || restoredTotals || { totalSent: 0, totalReceived: 0, requestCount: 0, lastContextTokens: 0 };
    }

    function renderWorkspaceTaskDetails() {
      if (!workspaceTaskDetails) return;
      workspaceTaskDetails.replaceChildren?.();
      const record = getSelectedWorkspaceRecord() || {};
      const activityCount = getWorkspaceToolEvents().length;
      const durationMs = Math.max(0, Number(record.updatedAt || 0) - Number(record.createdAt || 0));
      const tokenTotals = getWorkspaceTaskTokenTotals();
      const sentTokens = Math.max(0, Number(tokenTotals.totalSent) || 0);
      const receivedTokens = Math.max(0, Number(tokenTotals.totalReceived) || 0);
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Mode", getCompactModeLabel(record.mode || activeTab), "bi-chat-square-dots");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Status", record.status || "Ready", "bi-circle-fill");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Duration", formatElapsedTime(durationMs), "bi-stopwatch");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Attachments", String(normalizeAttachmentReferences(record.attachments).length), "bi-paperclip");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Activity", String(activityCount), "bi-list-check");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Requests", String(Math.max(0, Number(tokenTotals.requestCount) || 0)), "bi-arrow-repeat");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Sent tokens", formatWorkspaceTokenCount(sentTokens), "bi-upload");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Received tokens", formatWorkspaceTokenCount(receivedTokens), "bi-download");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Context tokens", formatWorkspaceTokenCount(tokenTotals.lastContextTokens), "bi-braces");
      appendWorkspaceSummaryRow(workspaceTaskDetails, "Total tokens", formatWorkspaceTokenCount(sentTokens + receivedTokens), "bi-calculator");
      const taskId = String(record.id || "");
      const idRow = appendWorkspaceSummaryRow(workspaceTaskDetails, "ID", taskId || "New chat", "bi-hash");
      makeWorkspaceIdRowCopyable(idRow, taskId);
    }

    function renderWorkspaceChanges() {
      renderWorkspaceSavedPlans(repositoryPlans);
    }

    function renderWorkspaceInspectorPanels() {
      renderWorkspaceHeader();
      renderWorkspaceContext();
      renderWorkspaceTools();
      renderWorkspaceApprovals();
      renderWorkspaceTaskDetails();
      renderWorkspaceChanges();
    }

    function setWorkspaceHistoryTab(tab) {
      const target = tab === "plans" ? "plans" : "chats";
      workspaceChatsTab?.setAttribute("aria-selected", target === "chats" ? "true" : "false");
      workspacePlansTab?.setAttribute("aria-selected", target === "plans" ? "true" : "false");
      workspaceChatsTab?.classList?.toggle("active", target === "chats");
      workspacePlansTab?.classList?.toggle("active", target === "plans");
      if (workspaceChatsPane) workspaceChatsPane.hidden = target !== "chats";
      if (workspacePlansPane) workspacePlansPane.hidden = target !== "plans";
      if (workspaceHistoryTitle) workspaceHistoryTitle.textContent = target === "plans" ? "Saved plans" : "Recent chats";
      if (target === "plans") {
        renderWorkspaceSidebarPlans(repositoryPlans);
        if (!repositoryPlans.length && !plansLoading) void loadRepositoryPlans({ silent: true });
      }
    }

    function closeWorkspaceTaskDetails() {
      if (workspaceTaskDetailsPopover) {
        workspaceTaskDetailsPopover.hidden = true;
        workspaceTaskDetailsPopover.style.left = "";
        workspaceTaskDetailsPopover.style.right = "";
        workspaceTaskDetailsPopover.style.top = "";
        workspaceTaskDetailsPopover.style.width = "";
      }
      workspaceHeading?.classList?.remove("is-task-details-open");
      workspaceTaskDetailsToggle?.setAttribute("aria-expanded", "false");
    }

    function positionWorkspaceTaskDetailsPopover() {
      if (!workspaceTaskDetailsPopover || !workspaceTaskDetailsToggle) return;
      const buttonRect = workspaceTaskDetailsToggle.getBoundingClientRect?.();
      const panelRect = panel.getBoundingClientRect?.();
      if (!buttonRect) return;
      const viewportWidth = Math.max(320, Number(panelRect?.width || panelRect?.right) || window.innerWidth || 1280);
      const popoverWidth = Math.min(320, Math.max(240, viewportWidth - 16));
      const preferredLeft = Number(buttonRect.left || 0);
      const maxLeft = viewportWidth - popoverWidth - 8;
      const left = Math.max(8, Math.min(Math.max(8, maxLeft), preferredLeft));
      const top = Number(buttonRect.bottom || buttonRect.top || 0) + 8;
      workspaceTaskDetailsPopover.style.right = "auto";
      workspaceTaskDetailsPopover.style.left = Math.round(left) + "px";
      workspaceTaskDetailsPopover.style.top = Math.round(top) + "px";
      workspaceTaskDetailsPopover.style.width = Math.round(popoverWidth) + "px";
    }

    function toggleWorkspaceTaskDetails() {
      if (!workspaceTaskDetailsPopover) return;
      renderWorkspaceTaskDetails();
      const open = workspaceTaskDetailsPopover.hidden !== false;
      workspaceTaskDetailsPopover.hidden = !open;
      workspaceHeading?.classList?.toggle("is-task-details-open", open);
      if (open) positionWorkspaceTaskDetailsPopover();
      workspaceTaskDetailsToggle?.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function getWorkspaceInfoCopy(kind) {
      if (kind === "tools") return { title: "Tools", body: "Shows tool activity recorded in the selected chat task, using the same timeline events as the main conversation." };
      if (kind === "approvals") return { title: "Approvals", body: "Shows pending and resolved approval events from the selected task and routes actions through the existing approval flow." };
      return { title: "Context", body: "Shows workspace, active file, open tabs, attachments, and request context from the existing AI Companion context sources." };
    }

    function closeWorkspaceInfoPopover() {
      if (workspaceInspectorInfoPopover) {
        workspaceInspectorInfoPopover.hidden = true;
        workspaceInspectorInfoPopover.style.left = "";
        workspaceInspectorInfoPopover.style.right = "";
        workspaceInspectorInfoPopover.style.top = "";
        workspaceInspectorInfoPopover.style.width = "";
      }
      panel.querySelectorAll?.("[data-ai-companion-inspector-info]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    }

    function positionWorkspaceInfoPopover(button) {
      if (!workspaceInspectorInfoPopover || !button) return;
      const buttonRect = button.getBoundingClientRect?.();
      const inspectorRect = workspaceInspector?.getBoundingClientRect?.() || panel.getBoundingClientRect?.();
      if (!buttonRect || !inspectorRect) return;
      const inspectorWidth = Math.max(220, Number(inspectorRect.width || (inspectorRect.right - inspectorRect.left)) || 300);
      const popoverWidth = Math.min(300, Math.max(220, inspectorWidth - 16));
      const minLeft = Number(inspectorRect.left || 0) + 8;
      const maxLeft = Number(inspectorRect.right || (minLeft + inspectorWidth)) - popoverWidth - 8;
      const preferredLeft = Number(buttonRect.right || buttonRect.left || 0) - popoverWidth;
      const left = Math.max(minLeft, Math.min(Math.max(minLeft, maxLeft), preferredLeft));
      const top = Number(buttonRect.bottom || buttonRect.top || 0) + 8;
      workspaceInspectorInfoPopover.style.right = "auto";
      workspaceInspectorInfoPopover.style.left = Math.round(left) + "px";
      workspaceInspectorInfoPopover.style.top = Math.round(top) + "px";
      workspaceInspectorInfoPopover.style.width = Math.round(popoverWidth) + "px";
    }

    function showWorkspaceInfoPopover(button) {
      const kind = button?.dataset?.aiCompanionInspectorInfo || "context";
      const copy = getWorkspaceInfoCopy(kind);
      closeWorkspaceInfoPopover();
      if (workspaceInspectorInfoTitle) workspaceInspectorInfoTitle.textContent = copy.title;
      if (workspaceInspectorInfoBody) workspaceInspectorInfoBody.textContent = copy.body;
      if (workspaceInspectorInfoPopover) {
        workspaceInspectorInfoPopover.hidden = false;
        positionWorkspaceInfoPopover(button);
      }
      button?.setAttribute("aria-expanded", "true");
    }

    function toggleWorkspaceInspectorSection(button) {
      const kind = button?.dataset?.aiCompanionInspectorToggle;
      const section = kind === "tools" ? workspaceToolsSection : (kind === "approvals" ? workspaceApprovalsSection : workspaceContextSection);
      const panelElement = kind === "tools" ? workspaceTools : (kind === "approvals" ? workspaceApprovals : workspaceContext);
      if (!section || !panelElement) return;
      const open = panelElement.hidden === true;
      panelElement.hidden = !open;
      section.classList.toggle("collapsed", !open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function setWorkspaceNewChatMenuOpen(open) {
      if (!workspaceNewChatMenuList || !workspaceNewChatMenuButton) return;
      workspaceNewChatMenuList.hidden = open !== true;
      workspaceNewChatMenuButton.setAttribute("aria-expanded", open ? "true" : "false");
    }

    async function startWorkspaceNewChat(mode = activeTab) {
      workspaceOpenRefreshSequence += 1;
      setPlansViewOpen(false, { load: false });
      await startNewAgentChat();
      selectTab(mode, { persist: true });
      setWorkspaceNewChatMenuOpen(false);
      agentInput?.focus?.();
      renderWorkspaceInspectorPanels();
    }

    function getWorkspaceFilteredPlans(plans = repositoryPlans) {
      const query = String(workspacePlanSearch?.value || "").trim().toLowerCase();
      const statusFilter = String(workspacePlanFilter || "all").toLowerCase();
      return (Array.isArray(plans) ? plans : []).filter((plan) => {
        const planStatus = String(plan.status || "planned").toLowerCase();
        const statusMatches = !statusFilter || statusFilter === "all"
          ? true
          : statusFilter === "archived"
            ? isPlanArchived(plan)
            : planStatus === statusFilter && !isPlanArchived(plan);
        if (!statusMatches) return false;
        if (!query) return true;
        return [plan.title, plan.path, plan.summary, getPlanStatusLabel(plan)].some((value) => String(value || "").toLowerCase().includes(query));
      });
    }

    function renderWorkspacePlanList(container, plans = repositoryPlans, emptyMessage = "No saved plans loaded") {
      if (!container) return;
      container.replaceChildren?.();
      if (!Array.isArray(plans) || !plans.length) {
        const empty = document.createElement("div");
        empty.className = "ai-companion-workspace-empty";
        empty.textContent = emptyMessage;
        container.appendChild(empty);
        return;
      }
      plans.forEach((plan) => {
        const card = createRepositoryPlanCard(plan, {
          className: "ai-companion-workspace-plan-card",
          openAsTab: async (planToOpen) => {
            await openRepositoryPlanInTab(planToOpen);
            closeWorkspaceForExternalNavigation();
            setWorkspaceSidebarView("files");
          },
          onOpen: async (planToOpen, cardElement) => {
            Array.from(container.children || []).forEach((item) => item.classList?.remove("active"));
            cardElement.classList.add("active");
            if (planToOpen.sourceChatId || planToOpen.frontmatter?.sourceChatId) await jumpToRepositoryPlanChat(planToOpen);
            else await readRepositoryPlan(planToOpen);
          }
        });
        container.appendChild(card);
      });
    }
    function renderWorkspaceSidebarPlans(plans = repositoryPlans) {
      const filteredPlans = getWorkspaceFilteredPlans(plans);
      const emptyMessage = Array.isArray(plans) && plans.length ? "No matching plans" : "No saved plans loaded";
      renderWorkspacePlanList(workspaceSidebarPlans, filteredPlans, emptyMessage);
    }

    function renderWorkspaceSavedPlans(plans = repositoryPlans) {
      renderWorkspaceSidebarPlans(plans);
    }


    function setWorkspaceVisible(open) {
      workspaceOpen = open === true;
      document.body.classList.toggle("ai-companion-workspace-open", workspaceOpen);
      setWorkspaceElementHidden(workspaceHistory, !workspaceOpen);
      setWorkspaceElementHidden(workspaceHistoryResizer, !workspaceOpen);
      setWorkspaceElementHidden(workspaceInspectorResizer, !workspaceOpen);
      setWorkspaceElementHidden(workspaceInspector, !workspaceOpen);
      setWorkspaceElementHidden(workspaceHeading, !workspaceOpen);
      setWorkspaceElementHidden(workspaceHeaderMeta, !workspaceOpen);
      if (chatPicker) chatPicker.hidden = workspaceOpen;
      if (plansToggleButton) plansToggleButton.hidden = workspaceOpen;
    }

    function captureWorkspaceRestoreState(options = {}) {
      return {
        compactPanelOpen: document.body.classList.contains("ai-companion-open"),
        sidebarView: options.previousSidebarView || getCurrentSidebarView(),
        bottomPanel: getCurrentBottomPanelState()
      };
    }

    async function refreshWorkspaceOnOpen(sequence) {
      await refreshChatSelectOptions();
      if (sequence !== workspaceOpenRefreshSequence) return;
      const activeSavedChat = workspaceChatIndexes.some((chat) => chat.id && chat.id === activeAgentChat?.id);
      if (!activeSavedChat && workspaceChatIndexes[0]?.id) await switchToSavedChat(workspaceChatIndexes[0].id, workspaceChatIndexes[0]);
      if (sequence !== workspaceOpenRefreshSequence) return;
      await loadRepositoryPlans({ silent: true });
      if (sequence !== workspaceOpenRefreshSequence) return;
      renderWorkspaceInspectorPanels();
    }

    function setWorkspaceOpen(open, options = {}) {
      if (!hasWorkspaceUi()) return;
      if (open) {
        if (!workspaceOpen) workspaceRestoreState = captureWorkspaceRestoreState(options);
        restoreWorkspaceSideWidths();
        setOpen(true, { persist: false });
        getBottomPanelModule()?.hidePanel?.();
        deps.setSidebarVisible?.(true, false, false);
        setWorkspaceVisible(true);
        setPlansViewOpen(false, { load: false });
        setWorkspaceHistoryTab("chats");
        workspaceChatVisibleLimit = WORKSPACE_CHAT_PAGE_SIZE;
        renderWorkspaceChatHistory();
        renderWorkspaceInspectorPanels();
        const refreshSequence = ++workspaceOpenRefreshSequence;
        void refreshWorkspaceOnOpen(refreshSequence);
        return;
      }
      setWorkspaceVisible(false);
      closeWorkspaceInfoPopover();
      closeWorkspaceTaskDetails();
      setWorkspaceNewChatMenuOpen(false);
      if (options.restore === true) {
        setOpen(true, { persist: false });
        if (workspaceRestoreState?.sidebarView) setWorkspaceSidebarView(workspaceRestoreState.sidebarView);
        restoreBottomPanelState(workspaceRestoreState?.bottomPanel || {});
      }
      workspaceRestoreState = null;
    }

    function closeWorkspaceForExternalNavigation() {
      if (workspaceOpen) setWorkspaceOpen(false, { restore: false });
    }

    function startWorkspaceResize(kind, event) {
      event?.preventDefault?.();
      workspaceResizeState = {
        kind,
        startX: Number(event?.clientX) || 0,
        startWidth: kind === "history" ? workspaceHistoryWidth : workspaceInspectorWidth
      };
      document.body.classList.add("ai-companion-workspace-resizing");
    }

    function handleWorkspaceResize(event) {
      if (!workspaceResizeState) return;
      event?.preventDefault?.();
      const delta = (Number(event?.clientX) || 0) - workspaceResizeState.startX;
      if (workspaceResizeState.kind === "history") applyWorkspaceHistoryWidth(workspaceResizeState.startWidth + delta, false);
      else applyWorkspaceInspectorWidth(workspaceResizeState.startWidth - delta, false);
    }

    function stopWorkspaceResize() {
      if (!workspaceResizeState) return;
      if (workspaceResizeState.kind === "history") applyWorkspaceHistoryWidth(workspaceHistoryWidth, true);
      else applyWorkspaceInspectorWidth(workspaceInspectorWidth, true);
      workspaceResizeState = null;
      document.body.classList.remove("ai-companion-workspace-resizing");
    }

    function handleWorkspaceResizeKeydown(kind, event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event?.key)) return;
      event.preventDefault?.();
      const currentWidth = kind === "history" ? workspaceHistoryWidth : workspaceInspectorWidth;
      const step = event.shiftKey ? 40 : 10;
      if (event.key === "Home") return kind === "history" ? applyWorkspaceHistoryWidth(MIN_WORKSPACE_SIDE_WIDTH) : applyWorkspaceInspectorWidth(MIN_WORKSPACE_SIDE_WIDTH);
      if (event.key === "End") return kind === "history" ? applyWorkspaceHistoryWidth(MAX_WORKSPACE_SIDE_WIDTH) : applyWorkspaceInspectorWidth(MAX_WORKSPACE_SIDE_WIDTH);
      const direction = kind === "history" ? (event.key === "ArrowRight" ? 1 : -1) : (event.key === "ArrowLeft" ? 1 : -1);
      if (kind === "history") applyWorkspaceHistoryWidth(currentWidth + (direction * step));
      else applyWorkspaceInspectorWidth(currentWidth + (direction * step));
    }
    function hasPlansRepositoryUi() {
      return !!(plansView && plansList && planDetail && deps.bridge?.plansList);
    }

    function getPlanLocator(plan = selectedRepositoryPlan || {}) {
      return { id: String(plan.id || ""), path: String(plan.path || "") };
    }

    function hasPlanLocator(plan = {}) {
      return !!(plan.id || plan.path);
    }

    function extractPlanBodyFromContent(content) {
      const text = String(content || "").replace(/\r\n?/g, "\n");
      if (!text.startsWith("---\n")) return text;
      const endIndex = text.indexOf("\n---\n", 4);
      return endIndex >= 0 ? text.slice(endIndex + 5) : text;
    }

    function getRepositoryPlanBody(plan = {}) {
      const body = plan.body === undefined || plan.body === null ? "" : String(plan.body);
      if (body.trim()) return body;
      return extractPlanBodyFromContent(plan.content || "");
    }

    function isRepositoryPlanHydrated(plan = {}) {
      return plan.body !== undefined || plan.content !== undefined || !!plan.frontmatter;
    }

    async function hydrateRepositoryPlan(plan = {}) {
      if (isRepositoryPlanHydrated(plan) || !hasPlanLocator(plan) || !deps.bridge?.planRead) return plan;
      const fullPlan = await deps.bridge.planRead(getPlanLocator(plan));
      selectedRepositoryPlan = fullPlan;
      return fullPlan;
    }

    function mergeRepositoryPlanState(plan = {}, patch = {}) {
      return { ...plan, ...patch, body: getRepositoryPlanBody(patch).trim() ? getRepositoryPlanBody(patch) : getRepositoryPlanBody(plan) };
    }

    function getToggledPlanStatus(plan = {}) {
      return String(plan.status || "planned").toLowerCase() === "implemented" ? "planned" : "implemented";
    }

    function getPlanStatusToggleLabel(plan = {}) {
      return String(plan.status || "planned").toLowerCase() === "implemented" ? "Mark planned" : "Mark implemented";
    }

    function getPlanStatusToggleIcon(plan = {}) {
      return String(plan.status || "planned").toLowerCase() === "implemented" ? "bi-arrow-counterclockwise" : "bi-check2-circle";
    }

    function isPlanArchived(plan = {}) {
      return plan.archived === true || String(plan.status || "planned").toLowerCase() === "archived";
    }

    function getToggledArchivePatch(plan = {}) {
      return { archived: !isPlanArchived(plan) };
    }

    function getArchiveToggleLabel(plan = {}) {
      return isPlanArchived(plan) ? "Unarchive" : "Archive";
    }

    function getArchiveToggleIcon(plan = {}) {
      return isPlanArchived(plan) ? "bi-arrow-counterclockwise" : "bi-archive";
    }

    function isPlanImplemented(plan = {}) {
      return String(plan.status || "planned").toLowerCase() === "implemented";
    }

    function getPlanStatusLabel(planOrStatus = {}) {
      const status = typeof planOrStatus === "object" ? planOrStatus.status : planOrStatus;
      const value = String(status || "planned").trim();
      const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : "Planned";
      return typeof planOrStatus === "object" && isPlanArchived(planOrStatus) ? `${label} \u00B7 Archived` : label;
    }

    function getPlanDisplayDate(plan = {}) {
      return String(plan.updatedAt || plan.createdAt || "").trim();
    }

    function getPlanDebugSnapshot(plan = {}) {
      return {
        id: String(plan.id || ""),
        title: String(plan.title || ""),
        status: String(plan.status || ""),
        archived: plan.archived === true,
        path: String(plan.path || ""),
        createdAt: String(plan.createdAt || ""),
        updatedAt: String(plan.updatedAt || "")
      };
    }

    function getPlansDebugSnapshot(plans = []) {
      return Array.isArray(plans) ? plans.slice(0, 10).map(getPlanDebugSnapshot) : [];
    }

    function logPlansDebug(message, details = {}) {
      void deps.appDebugLog?.("debug", `[ai-companion] plans ${message}`, details);
    }

    function logPlansWarning(message, details = {}) {
      void deps.appDebugLog?.("warning", `[ai-companion] plans ${message}`, details);
    }

    function waitForPlanUpdateResult(planUpdatePromise, timeoutMs) {
      let timeoutId = 0;
      const watchedPromise = planUpdatePromise
        .then((result) => ({ result, timedOut: false }))
        .catch((error) => ({ error, timedOut: false }));
      const timeoutPromise = new Promise((resolve) => {
        timeoutId = window.setTimeout(() => resolve({ result: null, timedOut: true }), timeoutMs);
      });
      return Promise.race([watchedPromise, timeoutPromise]).finally(() => window.clearTimeout?.(timeoutId));
    }
    function getPlanCardMeta(plan = {}) {
      const date = getPlanDisplayDate(plan);
      const planPath = String(plan.path || "").trim();
      return [date, planPath ? `[${planPath}]` : ""].filter(Boolean).join(" ");
    }

    function planMatchesVisibleStatus(plan = {}) {
      const status = String(plansStatusSelect?.value || "all");
      const implementationStatus = String(plan.status || "planned").toLowerCase();
      if (!status || status === "all") return true;
      if (status === "archived") return isPlanArchived(plan);
      if (status === "planned") return implementationStatus === "planned" && !isPlanArchived(plan);
      return implementationStatus === status;
    }

    function replaceVisibleRepositoryPlan(plan = {}, matchPlan = plan) {
      const updatedPlan = { ...plan };
      const originalPlan = { ...matchPlan };
      logPlansDebug("replace visible requested", {
        updatedPlan: getPlanDebugSnapshot(updatedPlan),
        matchPlan: getPlanDebugSnapshot(originalPlan),
        beforeCount: repositoryPlans.length,
        beforePlans: getPlansDebugSnapshot(repositoryPlans)
      });
      let found = false;
      let matchedPlan = null;
      let removedByFilter = false;
      repositoryPlans = repositoryPlans.reduce((items, candidate) => {
        const samePlan =
          (originalPlan.id && candidate.id === originalPlan.id) ||
          (originalPlan.path && candidate.path === originalPlan.path) ||
          (updatedPlan.id && candidate.id === updatedPlan.id) ||
          (updatedPlan.path && candidate.path === updatedPlan.path);
        if (!samePlan) return [...items, candidate];
        found = true;
        matchedPlan = getPlanDebugSnapshot(candidate);
        const visible = planMatchesVisibleStatus(updatedPlan);
        removedByFilter = !visible;
        return visible ? [...items, mergeRepositoryPlanState(candidate, updatedPlan)] : items;
      }, []);
      if (!found && planMatchesVisibleStatus(updatedPlan)) repositoryPlans = [...repositoryPlans, updatedPlan];
      logPlansDebug("replace visible completed", {
        found,
        removedByFilter,
        matchedPlan,
        afterCount: repositoryPlans.length,
        afterPlans: getPlansDebugSnapshot(repositoryPlans)
      });
      renderRepositoryPlans(repositoryPlans);
    }
    function getPlanFileName(plan = {}) {
      return getActivityFileName(plan.path || plan.title || "plan.md");
    }

    function getPlanParentPath(filePath) {
      const normalized = String(filePath || "").replace(/\\/g, "/");
      const index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : normalized;
    }

    function slugifyPlanTitle(value) {
      const slug = String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72);
      return slug || "plan";
    }

    function getRenamedPlanPath(plan = {}, nextTitle = "", returnedPlan = {}) {
      const currentPath = String(plan.path || "").trim();
      const returnedPath = String(returnedPlan.path || "").trim();
      if (returnedPath && returnedPath !== currentPath) return returnedPath;
      const normalizedPath = currentPath.replace(/\\/g, "/");
      const index = normalizedPath.lastIndexOf("/");
      const directory = index >= 0 ? normalizedPath.slice(0, index) : "";
      const fileName = `${slugifyPlanTitle(nextTitle)}.md`;
      return directory ? `${directory}/${fileName}` : fileName;
    }

    function createRenamedRepositoryPlan(plan = {}, nextTitle = "", returnedPlan = {}) {
      return {
        ...plan,
        ...returnedPlan,
        title: nextTitle,
        path: getRenamedPlanPath(plan, nextTitle, returnedPlan)
      };
    }
    async function getPlanAbsolutePath(plan = {}) {
      const planPath = String(plan.path || "").trim();
      if (!planPath) return "";
      if (isAbsoluteLocalPath(planPath)) return planPath;
      const profileDir = await deps.getProfileDataDirPath?.();
      return profileDir ? deps.joinPath(profileDir, planPath) : planPath;
    }

    async function refreshOpenRepositoryPlanTab(plan = {}) {
      if (typeof deps.reloadOpenTabsFromDisk !== "function") return;
      const fullPath = await getPlanAbsolutePath(plan);
      if (fullPath) await deps.reloadOpenTabsFromDisk(fullPath);
    }

    function setPlansViewOpen(open, options = {}) {
      plansViewOpen = open === true;
      if (plansView) plansView.hidden = !plansViewOpen;
      if (agentView) agentView.hidden = plansViewOpen;
      plansToggleButton?.setAttribute("aria-pressed", plansViewOpen ? "true" : "false");
      if (plansViewOpen && options.load !== false) void loadRepositoryPlans();
    }

    function setPlansLoading(loading) {
      plansLoading = loading === true;
      plansRefreshButton?.classList?.toggle("is-active", plansLoading);
      if (plansRefreshButton) plansRefreshButton.disabled = plansLoading;
    }

    function renderPlansEmpty(message) {
      if (!plansList) return;
      plansList.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "ai-companion-plans-empty";
      empty.textContent = message || "No saved plans";
      plansList.appendChild(empty);
      renderWorkspaceSavedPlans([]);
    }

    function createRepositoryPlanActions(plan = {}, options = {}) {
      const openAsTab = typeof options.openAsTab === "function" ? options.openAsTab : openRepositoryPlanInTab;
      const actions = document.createElement("div");
      actions.className = "ai-companion-plan-card-actions";
      actions.append(
        createPlanDetailButton("Open as tab", "bi-box-arrow-up-right", () => openAsTab(plan)),
        createPlanDetailButton("Jump to chat", "bi-chat-left-text", () => jumpToRepositoryPlanChat(plan)),
        createPlanDetailButton("Rename", "bi-pencil-square", () => renameRepositoryPlan(plan)),
        createPlanDetailButton("Execute", "bi-play-circle", () => executeRepositoryPlan(plan), { disabled: isPlanImplemented(plan) }),
        createPlanDetailButton(getPlanStatusToggleLabel(plan), getPlanStatusToggleIcon(plan), () => updateRepositoryPlanStatus(plan, getToggledPlanStatus(plan)), { blurAfterAction: true }),
        createPlanDetailButton(getArchiveToggleLabel(plan), getArchiveToggleIcon(plan), () => updateRepositoryPlanStatus(plan, getToggledArchivePatch(plan)), { blurAfterAction: true }),
        createPlanDetailButton("Delete", "bi-trash", () => deleteRepositoryPlan(plan)),
        createPlanDetailButton("Show folder", "bi-folder2-open", () => showRepositoryPlanFolder(plan))
      );
      return actions;
    }

    function createRepositoryPlanCard(plan = {}, options = {}) {
      const card = document.createElement("div");
      card.className = `ai-companion-plan-list-item${options.className ? ` ${options.className}` : ""}`;
      card.dataset.planId = plan.id || "";
      card.classList?.add?.(String(plan.status || "planned").toLowerCase());
      card.setAttribute("role", "listitem");
      card.tabIndex = 0;

      const header = document.createElement("div");
      header.className = "ai-companion-plan-list-header";
      const title = document.createElement("span");
      title.className = "ai-companion-plan-list-title";
      title.textContent = plan.title || "Untitled plan";
      const status = document.createElement("span");
      status.className = "ai-companion-plan-status";
      status.textContent = getPlanStatusLabel(plan);
      header.append(title, status);

      const meta = document.createElement("span");
      meta.className = "ai-companion-plan-list-meta";
      meta.textContent = getPlanCardMeta(plan);

      const actions = createRepositoryPlanActions(plan, options);
      if (typeof options.onOpen === "function") {
        const openCard = (event) => {
          if (event?.target?.closest?.("button")) return;
          event?.preventDefault?.();
          void options.onOpen(plan, card);
        };
        card.addEventListener("click", openCard);
        card.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          openCard(event);
        });
      }

      card.append(header, meta, actions);
      return card;
    }
    function renderRepositoryPlans(plans = []) {
      if (!plansList) return;
      logPlansDebug("render list requested", {
        count: Array.isArray(plans) ? plans.length : 0,
        plans: getPlansDebugSnapshot(plans)
      });
      plansList.replaceChildren();
      if (!plans.length) {
        logPlansDebug("render list empty", {});
        renderPlansEmpty("No saved plans");
        return;
      }
      renderWorkspaceSavedPlans(plans);
      plans.forEach((plan) => {
        plansList.appendChild(createRepositoryPlanCard(plan));
      });
      logPlansDebug("render list completed", {
        domCount: plansList.children.length,
        renderedText: Array.from(plansList.children).slice(0, 10).map((item) => item.textContent || "")
      });
    }

    async function loadRepositoryPlans(options = {}) {
      if (!hasPlansRepositoryUi()) {
        logPlansWarning("load skipped because repository UI is unavailable", {
          hasPlansView: !!plansView,
          hasPlansList: !!plansList,
          hasPlanDetail: !!planDetail,
          hasPlansListBridge: !!deps.bridge?.plansList
        });
        return;
      }
      if (plansLoading && options.force !== true) {
        logPlansDebug("load skipped because another load is active", { options, plansLoading });
        return;
      }
      const loadSequence = plansLoadSequence + 1;
      plansLoadSequence = loadSequence;
      setPlansLoading(true);
      logPlansDebug("load started", {
        loadSequence,
        options,
        currentCount: repositoryPlans.length,
        statusControl: String(plansStatusSelect?.value || ""),
        search: String(plansSearchInput?.value || "")
      });
      try {
        if (options.rebuild && typeof deps.bridge.planRebuildIndex === "function") {
          logPlansDebug("rebuild index requested", { loadSequence, workspaceRoot: deps.getWorkspaceRoot?.() || "" });
          const rebuildResult = await deps.bridge.planRebuildIndex({ workspaceRoot: deps.getWorkspaceRoot?.() || "" });
          logPlansDebug("rebuild index returned", {
            loadSequence,
            count: Array.isArray(rebuildResult?.plans) ? rebuildResult.plans.length : null,
            plans: getPlansDebugSnapshot(rebuildResult?.plans || [])
          });
        } else if (options.rebuild) {
          logPlansWarning("rebuild requested but bridge function is unavailable", { loadSequence });
        }
        const status = String(plansStatusSelect?.value || "all");
        const payload = {
          status: status && status !== "all" ? status : "",
          query: String(plansSearchInput?.value || "").trim(),
          maxResults: 100,
          workspaceRoot: ""
        };
        logPlansDebug("plansList requested", { loadSequence, payload });
        const result = await deps.bridge.plansList(payload);
        const plans = Array.isArray(result?.plans) ? result.plans : [];
        logPlansDebug("plansList returned", {
          loadSequence,
          count: plans.length,
          plans: getPlansDebugSnapshot(plans)
        });
        if (loadSequence !== plansLoadSequence) {
          logPlansWarning("load ignored because a newer load exists", { loadSequence, currentSequence: plansLoadSequence });
          return;
        }
        repositoryPlans = plans;
        logPlansDebug("repository plan state replaced from list", {
          loadSequence,
          count: repositoryPlans.length,
          plans: getPlansDebugSnapshot(repositoryPlans)
        });
        renderRepositoryPlans(repositoryPlans);
        selectedRepositoryPlan = null;
        if (planDetail) {
          planDetail.replaceChildren();
          planDetail.hidden = true;
        }
      } catch (error) {
        if (loadSequence !== plansLoadSequence) {
          logPlansWarning("load error ignored because a newer load exists", { loadSequence, currentSequence: plansLoadSequence, error: error?.message || String(error) });
          return;
        }
        logPlansWarning("load failed", { loadSequence, error: error?.message || String(error) });
        renderPlansEmpty("Unable to load saved plans");
        if (options.silent !== true) notifyAiCompanionError(error?.message || String(error));
      } finally {
        if (loadSequence === plansLoadSequence) {
          setPlansLoading(false);
          logPlansDebug("load completed", { loadSequence, count: repositoryPlans.length, plans: getPlansDebugSnapshot(repositoryPlans) });
        } else {
          logPlansDebug("load finally skipped state reset for stale sequence", { loadSequence, currentSequence: plansLoadSequence });
        }
      }
    }
    function selectRepositoryPlan(plan) {
      selectedRepositoryPlan = plan;
      Array.from(plansList?.children || []).forEach((item) => {
        const selected = !!plan?.id && item.dataset?.planId === plan.id;
        if (selected) item.setAttribute("aria-current", "true");
        else item.removeAttribute?.("aria-current");
      });
      renderRepositoryPlanDetail(plan);
      void readRepositoryPlan(plan);
    }

    async function readRepositoryPlan(plan) {
      if (!deps.bridge?.planRead) {
        selectedRepositoryPlan = plan;
        renderRepositoryPlanDetail(plan);
        return;
      }
      try {
        const fullPlan = await deps.bridge.planRead(getPlanLocator(plan));
        selectedRepositoryPlan = fullPlan;
        renderRepositoryPlanDetail(fullPlan);
      } catch (error) {
        selectedRepositoryPlan = plan;
        renderRepositoryPlanDetail(plan);
        notifyAiCompanionError(error?.message || String(error));
      }
    }

    function createPlanDetailButton(label, iconClass, handler, options = {}) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-tree-tool-button ai-companion-plan-action";
      button.title = label;
      button.setAttribute("aria-label", label);
      if (options.disabled) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }
      const icon = document.createElement("i");
      icon.className = `bi ${iconClass}`;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        if (button.disabled) return;
        if (options.blurAfterAction) button.blur?.();
        handler();
      });
      return button;
    }

    function renderRepositoryPlanDetail(plan = {}) {
      if (!planDetail) return;
      planDetail.replaceChildren();
      const header = document.createElement("div");
      header.className = "ai-companion-plan-detail-header";
      const title = document.createElement("h3");
      title.className = "ai-companion-plan-detail-title";
      title.textContent = plan.title || "Untitled plan";
      const status = document.createElement("span");
      status.className = "ai-companion-plan-status";
      status.textContent = getPlanStatusLabel(plan);
      header.append(title, status);

      const meta = document.createElement("div");
      meta.className = "ai-companion-plan-detail-meta";
      meta.textContent = [plan.path || "", plan.updatedAt || plan.createdAt || ""].filter(Boolean).join(" - ");

      const actions = document.createElement("div");
      actions.className = "ai-companion-plan-detail-actions";
      actions.append(
        createPlanDetailButton("Open as tab", "bi-box-arrow-up-right", () => openRepositoryPlanInTab(plan)),
        createPlanDetailButton("Jump to chat", "bi-chat-left-text", () => jumpToRepositoryPlanChat(plan)),
          createPlanDetailButton("Rename", "bi-pencil-square", () => renameRepositoryPlan(plan)),
        createPlanDetailButton("Execute", "bi-play-circle", () => executeRepositoryPlan(plan), { disabled: isPlanImplemented(plan) }),
        createPlanDetailButton(getPlanStatusToggleLabel(plan), getPlanStatusToggleIcon(plan), () => updateRepositoryPlanStatus(plan, getToggledPlanStatus(plan)), { blurAfterAction: true }),
        createPlanDetailButton(getArchiveToggleLabel(plan), getArchiveToggleIcon(plan), () => updateRepositoryPlanStatus(plan, getToggledArchivePatch(plan)), { blurAfterAction: true }),
        createPlanDetailButton("Delete", "bi-trash", () => deleteRepositoryPlan(plan)),
        createPlanDetailButton("Show folder", "bi-folder2-open", () => showRepositoryPlanFolder(plan))
      );

      const body = document.createElement("div");
      body.className = "ai-companion-plan-preview markdown-body";
      const markdown = getRepositoryPlanBody(plan).trim();
      if (!markdown || !deps.renderMarkdownContent?.(body, markdown, { renderFrontmatter: false })) {
        body.classList.remove("markdown-body");
        body.textContent = markdown || (hasPlanLocator(plan) && !isRepositoryPlanHydrated(plan) ? "Loading plan..." : "Empty plan");
      }
      planDetail.append(header, meta, actions, body);
    }

    async function editRepositoryPlan(plan = {}) {
      try {
        renderRepositoryPlanEditor(await hydrateRepositoryPlan(plan));
      } catch (error) {
        notifyAiCompanionError(error?.message || String(error));
      }
    }

    function renderRepositoryPlanEditor(plan = {}) {
      if (!planDetail) return;
      planDetail.hidden = false;
      planDetail.replaceChildren();
      const titleInput = document.createElement("input");
      titleInput.className = "ai-companion-plan-title-input";
      titleInput.value = plan.title || "Untitled plan";
      const bodyInput = document.createElement("textarea");
      bodyInput.className = "ai-companion-plan-body-input";
      bodyInput.value = getRepositoryPlanBody(plan);
      const actions = document.createElement("div");
      actions.className = "ai-companion-plan-detail-actions";
      actions.append(
        createPlanDetailButton("Save", "bi-check-lg", () => saveRepositoryPlan(plan, titleInput.value, bodyInput.value)),
        createPlanDetailButton("Cancel", "bi-x-lg", () => { planDetail.replaceChildren(); planDetail.hidden = true; })
      );
      planDetail.append(titleInput, bodyInput, actions);
      titleInput.focus?.();
    }

    async function saveRepositoryPlan(plan, title, body) {
      if (!deps.bridge?.planUpdate) return;
      try {
        await deps.bridge.planUpdate({ ...getPlanLocator(plan), title, body });
        selectedRepositoryPlan = null;
        if (planDetail) {
          planDetail.replaceChildren();
          planDetail.hidden = true;
        }
        await loadRepositoryPlans();
      } catch (error) {
        notifyAiCompanionError(error?.message || String(error));
      }
    }

    function promptForPlanRename(plan = {}) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "reset-modal-overlay ai-companion-plan-rename-modal";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "ai-companion-plan-rename-title");
        overlay.style.display = "flex";

        const dialog = document.createElement("div");
        dialog.className = "reset-modal-box ai-companion-plan-rename-box";
        const title = document.createElement("p");
        title.id = "ai-companion-plan-rename-title";
        title.className = "reset-modal-message";
        title.textContent = "Rename Plan";
        const label = document.createElement("label");
        label.className = "ai-companion-chat-rename-label";
        label.setAttribute("for", "ai-companion-plan-rename-input");
        label.textContent = "Plan name";
        const input = document.createElement("input");
        input.id = "ai-companion-plan-rename-input";
        input.className = "rename-modal-input";
        input.type = "text";
        input.value = plan.title || "Untitled plan";
        input.autocomplete = "off";
        const actions = document.createElement("div");
        actions.className = "reset-modal-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "reset-modal-btn reset-modal-cancel";
        cancelButton.textContent = "Cancel";
        const renameButton = document.createElement("button");
        renameButton.type = "button";
        renameButton.className = "reset-modal-btn";
        renameButton.textContent = "Rename";
        actions.append(cancelButton, renameButton);
        dialog.append(title, label, input, actions);
        overlay.appendChild(dialog);

        const close = (value) => {
          document.removeEventListener("keydown", onKeyDown);
          overlay.remove();
          resolve(value);
        };
        const submit = () => {
          const nextTitle = input.value.trim();
          if (!nextTitle) {
            input.focus();
            return;
          }
          close(nextTitle);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") close("");
          if (event.key === "Enter") {
            event.preventDefault?.();
            submit();
          }
        };
        cancelButton.addEventListener("click", () => close(""));
        renameButton.addEventListener("click", submit);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) close("");
        });
        document.addEventListener("keydown", onKeyDown);
        document.body.appendChild(overlay);
        input.focus();
        input.select?.();
      });
    }

    async function renameRepositoryPlan(plan = {}) {
      if (!deps.bridge?.planUpdate) {
        logPlansWarning("rename unavailable", { plan: getPlanDebugSnapshot(plan) });
        notifyAiCompanionError("Plan rename is unavailable.");
        return;
      }
      logPlansDebug("rename prompt opened", { plan: getPlanDebugSnapshot(plan) });
      const nextTitle = await promptForPlanRename(plan);
      logPlansDebug("rename prompt closed", {
        plan: getPlanDebugSnapshot(plan),
        nextTitle,
        cancelled: !nextTitle,
        unchanged: !!nextTitle && nextTitle === String(plan.title || "").trim()
      });
      if (!nextTitle || nextTitle === String(plan.title || "").trim()) return;
      const locator = getPlanLocator(plan);
      const request = { ...locator, title: nextTitle, renameFile: true };
      try {
        logPlansDebug("rename update requested", {
          request,
          originalPlan: getPlanDebugSnapshot(plan)
        });
        const planUpdatePromise = deps.bridge.planUpdate(request);
        const updateOutcome = await waitForPlanUpdateResult(planUpdatePromise, 1500);
        if (updateOutcome.error) throw updateOutcome.error;
        if (updateOutcome.timedOut) {
          logPlansWarning("rename update timed out; refreshing list anyway", {
            request,
            originalPlan: getPlanDebugSnapshot(plan)
          });
          void planUpdatePromise.then((lateResult) => logPlansDebug("rename update returned after timeout", {
            changed: lateResult?.changed === true,
            returnedPlan: getPlanDebugSnapshot(lateResult?.plan || {}),
            rawHasPlan: !!lateResult?.plan
          })).catch((error) => logPlansWarning("rename update failed after timeout", {
            request,
            error: error?.message || String(error)
          }));
        }
        const result = updateOutcome.result || {};
        if (!updateOutcome.timedOut) {
          logPlansDebug("rename update returned", {
            changed: result?.changed === true,
            returnedPlan: getPlanDebugSnapshot(result?.plan || {}),
            rawHasPlan: !!result?.plan
          });
        }
        const updatedPlan = createRenamedRepositoryPlan(plan, nextTitle, result?.plan);
        logPlansDebug("rename visible plan computed", {
          originalPlan: getPlanDebugSnapshot(plan),
          returnedPlan: getPlanDebugSnapshot(result?.plan || {}),
          computedPlan: getPlanDebugSnapshot(updatedPlan)
        });
        selectedRepositoryPlan = null;
        replaceVisibleRepositoryPlan(updatedPlan, plan);
        logPlansDebug("rename local visible replace finished", {
          repositoryPlans: getPlansDebugSnapshot(repositoryPlans),
          domText: Array.from(plansList?.children || []).slice(0, 10).map((item) => item.textContent || "")
        });
        logPlansDebug("rename forced list refresh requested", { request: { force: true, rebuild: true } });
        await loadRepositoryPlans({ force: true, rebuild: true });
        logPlansDebug("rename forced list refresh completed", {
          repositoryPlans: getPlansDebugSnapshot(repositoryPlans),
          domText: Array.from(plansList?.children || []).slice(0, 10).map((item) => item.textContent || "")
        });
      } catch (error) {
        logPlansWarning("rename failed", {
          request,
          originalPlan: getPlanDebugSnapshot(plan),
          error: error?.message || String(error)
        });
        notifyAiCompanionError(error?.message || String(error));
      }
    }    async function updateRepositoryPlanStatus(plan, patchOrStatus) {
      if (!deps.bridge?.planUpdateStatus) return;
      const locator = getPlanLocator(plan);
      const patch = patchOrStatus && typeof patchOrStatus === "object" ? { ...patchOrStatus } : { status: patchOrStatus };
      const optimisticPlan = { ...plan, ...patch };
      selectedRepositoryPlan = null;
      replaceVisibleRepositoryPlan(optimisticPlan);
      try {
        void deps.appDebugLog?.("debug", "[ai-companion] plan status update requested", { ...locator, fromStatus: plan?.status || "", fromArchived: plan?.archived === true, ...patch });
        const result = await deps.bridge.planUpdateStatus({ ...locator, ...patch });
        const updatedPlan = { ...(result?.plan || optimisticPlan), ...patch };
        void deps.appDebugLog?.("debug", "[ai-companion] plan status update returned", { ...locator, requestedStatus: patch.status || "", requestedArchived: patch.archived, returnedStatus: result?.plan?.status || "", returnedArchived: result?.plan?.archived === true, renderedStatus: updatedPlan.status, renderedArchived: updatedPlan.archived === true });
        replaceVisibleRepositoryPlan(updatedPlan);
        await refreshOpenRepositoryPlanTab(updatedPlan);
      } catch (error) {
        await loadRepositoryPlans();
        notifyAiCompanionError(error?.message || String(error));
      }
    }
    async function openRepositoryPlanInTab(plan) {
      try {
        logPlansDebug("open tab requested", { plan: getPlanDebugSnapshot(plan) });
        const fullPath = await getPlanAbsolutePath(plan);
        logPlansDebug("open tab path resolved", { plan: getPlanDebugSnapshot(plan), fullPath });
        if (fullPath && typeof deps.openDocumentSourceFile === "function") {
          try {
            await deps.openDocumentSourceFile({ name: getPlanFileName(plan), path: fullPath }, { temporary: false, title: plan.title || getPlanFileName(plan), viewMode: "preview" });
            logPlansDebug("open tab succeeded", { plan: getPlanDebugSnapshot(plan), fullPath });
            return;
          } catch (error) {
            logPlansWarning("open tab direct open failed", { plan: getPlanDebugSnapshot(plan), fullPath, error: error?.message || String(error) });
            if (plan?.id && deps.bridge?.planRead) {
              logPlansDebug("open tab reading latest plan by id", { id: plan.id });
              const latestPlan = await deps.bridge.planRead({ id: plan.id });
              const latestPath = await getPlanAbsolutePath(latestPlan);
              logPlansDebug("open tab latest plan returned", { latestPlan: getPlanDebugSnapshot(latestPlan), latestPath });
              if (latestPath && latestPath !== fullPath) {
                replaceVisibleRepositoryPlan(latestPlan);
                await deps.openDocumentSourceFile({ name: getPlanFileName(latestPlan), path: latestPath }, { temporary: false, title: latestPlan.title || getPlanFileName(latestPlan), viewMode: "preview" });
                logPlansDebug("open tab succeeded after latest plan fallback", { latestPlan: getPlanDebugSnapshot(latestPlan), latestPath });
                return;
              }
            }
            throw error;
          }
        }
        logPlansDebug("open tab falling back to hydrated markdown", { plan: getPlanDebugSnapshot(plan) });
        const fullPlan = await hydrateRepositoryPlan(plan);
        openMarkdownInNewTab(fullPlan.content || getRepositoryPlanBody(fullPlan));
        logPlansDebug("open tab fallback markdown opened", { plan: getPlanDebugSnapshot(fullPlan) });
      } catch (error) {
        logPlansWarning("open tab failed", { plan: getPlanDebugSnapshot(plan || {}), error: error?.message || String(error) });
        notifyAiCompanionError(error?.message || String(error));
      }
    }    async function showRepositoryPlanFolder(plan) {
      if (typeof deps.openPathInExplorer !== "function") return;
      const fullPath = await getPlanAbsolutePath(plan);
      const folder = getPlanParentPath(fullPath);
      if (folder) await deps.openPathInExplorer(folder);
    }

    async function jumpToRepositoryPlanChat(plan) {
      const chatId = String(plan?.sourceChatId || plan?.frontmatter?.sourceChatId || "").trim();
      const taskId = String(plan?.sourceTaskId || plan?.frontmatter?.sourceTaskId || "").trim();
      if (!chatId && !taskId) {
        notifyAiCompanionError("This plan is not linked to a saved chat task.");
        return;
      }
      if (chatId && chatId !== activeAgentChat?.id) await switchToSavedChat(chatId);
      setPlansViewOpen(false, { load: false });
      const entry = taskId ? agentEntries.find((candidate) => candidate.record?.id === taskId) : null;
      if (!entry) {
        notifyAiCompanionError("Unable to find the chat task for this plan.");
        return;
      }
      entry.promptElements?.details && (entry.promptElements.details.open = true);
      entry.element?.scrollIntoView?.({ block: "center" });
    }

    async function confirmDeleteRepositoryPlan(plan) {
      const title = plan?.title || "this plan";
      const message = `Delete ${title}? This removes the saved plan file.`;
      if (typeof deps.confirm === "function") {
        return deps.confirm(message, { title: "Delete Plan", confirmLabel: "Delete Plan", confirmVariant: "danger" });
      }
      if (typeof app?.services?.confirm === "function") {
        return app.services.confirm({ title: "Delete Plan", message, confirmLabel: "Delete Plan", confirmVariant: "danger" });
      }
      return typeof window.confirm === "function" ? window.confirm(message) : false;
    }

    async function deleteRepositoryPlan(plan) {
      if (!deps.bridge?.planDelete) {
        notifyAiCompanionError("Plan deletion is unavailable.");
        return;
      }
      if (!(await confirmDeleteRepositoryPlan(plan))) return;
      try {
        await deps.bridge.planDelete(getPlanLocator(plan));
        selectedRepositoryPlan = null;
        if (planDetail) {
          planDetail.replaceChildren();
          planDetail.hidden = true;
        }
        await loadRepositoryPlans({ rebuild: true });
      } catch (error) {
        notifyAiCompanionError(error?.message || String(error));
      }
    }

    async function executeRepositoryPlan(plan) {
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop the current task before executing a plan");
        return;
      }
      if (isPlanImplemented(plan)) {
        notifyAiCompanionBlocked("This plan is already implemented.");
        return;
      }
      plan = await hydrateRepositoryPlan(plan);
      if (deps.bridge?.planUpdateStatus) await deps.bridge.planUpdateStatus({ ...getPlanLocator(plan), status: "implementing" });
      setPlansViewOpen(false, { load: false });
      const record = { prompt: plan.title || "Execute saved plan", plan };
      const outcome = await runCompanionPrompt({ prompt: createPlanExecutionPrompt(record), mode: "agent" });
      if (deps.bridge?.planUpdateStatus) {
        await deps.bridge.planUpdateStatus({ ...getPlanLocator(plan), status: outcome?.status === "completed" ? "implemented" : "planned" });
      }
      selectedRepositoryPlan = null;
      if (plansViewOpen) await loadRepositoryPlans();
    }
    function cloneEvent(event) {
      try {
        return JSON.parse(JSON.stringify(event || {}));
      } catch (_error) {
        return { type: event?.type || "event" };
      }
    }

    function createStorageTimestamp(value = Date.now()) {
      return new Date(value).toISOString().replace(/[-:]/g, "").replace("T", "_").replace("Z", "").replace(/\./g, "_");
    }

    function getChatStorageDateParts(value = Date.now()) {
      const date = new Date(value);
      const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
      return {
        year: String(safeDate.getFullYear()),
        month: String(safeDate.getMonth() + 1).padStart(2, "0"),
        day: String(safeDate.getDate()).padStart(2, "0")
      };
    }

    function createStorageSuffix() {
      return Math.random().toString(36).slice(2, 8);
    }

    function padTaskSequence(value) {
      return String(Math.max(1, Number(value) || 1)).padStart(6, "0");
    }

    function createChatId(createdAt = Date.now()) {
      return `chat_${createStorageTimestamp(createdAt)}_${createStorageSuffix()}`;
    }

    function createTaskId(sequence, createdAt = Date.now()) {
      return `task_${padTaskSequence(sequence)}_${createStorageTimestamp(createdAt)}_${createStorageSuffix()}`;
    }

    function ensureActiveAgentChat() {
      if (activeAgentChat?.id) return activeAgentChat;
      const createdAt = Date.now();
      const id = createChatId(createdAt);
      activeAgentChat = {
        version: 1,
        id,
        createdAt,
        updatedAt: createdAt,
        workspaceRoot: deps.getWorkspaceRoot?.() || "",
        title: "Chat"
      };
      return activeAgentChat;
    }

    function getNextAgentTaskSequence() {
      const sequence = nextAgentTaskSequence;
      nextAgentTaskSequence += 1;
      return sequence;
    }

    function clipTaskTitle(text) {
      const singleLine = String(text || "").replace(/\s+/g, " ").trim();
      if (!singleLine) return "Agent task";
      return singleLine.length > 72 ? `${singleLine.slice(0, 69)}...` : singleLine;
    }

    function getAttachmentDisplayName(attachment = {}) {
      return String(attachment.name || getActivityFileName(attachment.path) || "file").trim() || "file";
    }

    function getTaskTitle(prompt, attachments = []) {
      const text = String(prompt || "").trim() || normalizeAttachmentReferences(attachments).map(getAttachmentDisplayName).join(", ");
      return clipTaskTitle(text || "Attached files");
    }
    function isPlanRecord(record) {
      return record?.mode === "plan" || !!record?.plan;
    }

    function extractPlanContent(content) {
      const text = String(content || "").trim();
      const match = text.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i);
      return (match ? match[1] : text).trim();
    }

    function extractPlanTitle(content) {
      const planText = extractPlanContent(content);
      const heading = planText.split(/\r?\n/).map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim()).find(Boolean);
      return (heading || "").replace(/^Plan:\s*/i, "").trim();
    }
    function extractPlanMilestones(content) {
      const planText = extractPlanContent(content);
      const milestones = [];
      const seen = new Set();
      const lines = planText.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*(?:[-*]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?(M\d+)\s*[:.)-]\s*(.+?)\s*$/i);
        if (!match) continue;
        const id = match[1].toUpperCase();
        if (seen.has(id)) continue;
        seen.add(id);
        milestones.push({ id, title: match[2].trim(), status: "pending" });
      }
      return milestones;
    }

    function createPlanMetadata(content, existingPlan = null, status = "planned", repositoryPlan = null) {
      const now = Date.now();
      const source = existingPlan && typeof existingPlan === "object" ? existingPlan : {};
      const saved = repositoryPlan && typeof repositoryPlan === "object" ? repositoryPlan : {};
      const hasRepositoryPointer = !!(saved.id || saved.path || source.path);
      const plan = {
        id: saved.id || source.id || `plan_${createStorageTimestamp(now)}_${createStorageSuffix()}`,
        status: saved.status || status,
        milestones: Array.isArray(saved.milestones) ? saved.milestones : extractPlanMilestones(content),
        createdAt: saved.createdAt || source.createdAt || now,
        updatedAt: saved.updatedAt || now,
        ...(saved.title || source.title || extractPlanTitle(content) ? { title: saved.title || source.title || extractPlanTitle(content) } : {}),
        ...(saved.path || source.path ? { path: saved.path || source.path } : {}),
        ...(saved.workspaceRoot || source.workspaceRoot ? { workspaceRoot: saved.workspaceRoot || source.workspaceRoot } : {}),
        ...(source.implementedAt ? { implementedAt: source.implementedAt } : {}),
        ...(saved.implementedAt ? { implementedAt: saved.implementedAt } : {}),
        ...(source.implementationTaskId ? { implementationTaskId: source.implementationTaskId } : {})
      };
      if (!hasRepositoryPointer) plan.content = String(content || "").trim();
      return plan;
    }
    function updatePlanRecordStatus(entry, status, extra = {}) {
      if (!entry?.record || !isPlanRecord(entry.record)) return;
      const now = Date.now();
      const plan = entry.record.plan && typeof entry.record.plan === "object" ? entry.record.plan : createPlanMetadata(getRecordFinalResponse(entry.record), null, status);
      entry.record.mode = "plan";
      entry.record.status = status;
      entry.record.updatedAt = now;
      entry.record.plan = {
        ...plan,
        ...extra,
        status,
        updatedAt: now
      };
      entry.isDirty = true;
      attachPromptActions(entry);
    }

    function createPlanExecutionPrompt(record) {
      const plan = record?.plan && typeof record.plan === "object" ? record.plan : {};
      const planContent = String(plan.content || getRecordFinalResponse(record) || "").trim();
      const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
      const milestoneText = milestones.map((milestone) => `- ${milestone.id}: ${milestone.title}`).join("\n");
      const planLocator = [
        plan.id ? `Plan id: ${plan.id}` : "",
        plan.path ? `Plan path: ${plan.path}` : ""
      ].filter(Boolean).join("\n");
      if (planLocator) {
        return [
          "Execute the reviewed saved implementation plan referenced below.",
          "First call plan_update_status for this plan with status implementing, then call plan_read and implement only the plan file content.",
          "Report implementation progress by milestone id in your narration and final summary.",
          "Before your final answer, call plan_update_status for this plan with status implemented if implementation succeeded.",
          "Do not broaden scope or perform unrelated cleanup.",
          "",
          planLocator,
          `Original user request:\n${String(record?.prompt || "").trim()}`,
          milestoneText ? `Milestones:\n${milestoneText}` : "Milestones: none extracted; follow the saved plan file sections in order."
        ].join("\n\n");
      }
      return [
        "Execute the reviewed implementation plan below.",
        "Implement only the work described in this plan. Do not broaden scope or perform unrelated cleanup.",
        "Report implementation progress by milestone id in your narration and final summary.",
        "",
        `Original user request:\n${String(record?.prompt || "").trim()}`,
        milestoneText ? `Milestones:\n${milestoneText}` : "Milestones: none extracted; follow the plan sections in order.",
        `Reviewed plan:\n${planContent}`
      ].join("\n\n");
    }
    function isDefaultChatTitle(title) {
      const text = String(title || "").trim();
      return !text || text === "Chat";
    }

    function sanitizeGeneratedChatTitle(value) {
      const singleLine = String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["'`*_\s:.-]+|["'`*_\s:.-]+$/g, "");
      const words = singleLine.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
      return words.length > 48 ? `${words.slice(0, 45)}...` : words;
    }

    function shouldRequestGeneratedChatTitle(existingEntry = null) {
      return !existingEntry && isDefaultChatTitle(activeAgentChat?.title) && agentTaskIndex.length === 0;
    }

    function applyGeneratedChatTitle(title) {
      const text = sanitizeGeneratedChatTitle(title);
      if (!text) return false;
      ensureActiveAgentChat();
      if (!isDefaultChatTitle(activeAgentChat.title)) return false;
      activeAgentChat.title = text;
      return true;
    }

    async function persistGeneratedChatTitle(title) {
      const entry = activeAgentEntry;
      if (!entry || !applyGeneratedChatTitle(title)) return;
      entry.isDirty = true;
      await saveAgentEntry(entry);
      await refreshChatSelectOptions();
    }

    function getAttachmentExtension(name) {
      const cleanName = String(name || "").replace(/\\/g, "/").split("/").pop() || "";
      const index = cleanName.lastIndexOf(".");
      return index > 0 ? cleanName.slice(index + 1).toLowerCase() : "";
    }

    function isTextAttachmentCandidate(source = {}) {
      const type = String(source.type || "").toLowerCase();
      if (type.startsWith("text/")) return true;
      const name = source.name || source.path || "";
      const extension = getAttachmentExtension(name);
      return !type || TEXT_ATTACHMENT_EXTENSIONS.has(extension);
    }

    function getImageAttachmentMimeType(source = {}) {
      const type = String(source.type || "").toLowerCase();
      if (IMAGE_ATTACHMENT_MIME_TYPES.has(type)) return type;
      switch (getAttachmentExtension(source.name || source.path || "")) {
        case "avif": return "image/avif";
        case "bmp": return "image/bmp";
        case "gif": return "image/gif";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "png": return "image/png";
        case "webp": return "image/webp";
        default: return "";
      }
    }

    function isImageAttachmentCandidate(source = {}) {
      return !!getImageAttachmentMimeType(source);
    }

    function getAttachmentKind(attachment = {}) {
      return attachment.kind === "image" || attachment.dataUrl ? "image" : "text";
    }

    function hasBinaryAttachmentContent(content) {
      const text = String(content || "");
      if (/\u0000/.test(text)) return true;
      const replacementCount = (text.match(/\uFFFD/g) || []).length;
      return text.length > 0 && replacementCount / text.length > 0.05;
    }

    function formatAttachmentSize(size) {
      const bytes = Number(size);
      if (!Number.isFinite(bytes) || bytes <= 0) return "";
      if (bytes < 1024) return `${Math.round(bytes)} B`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    }

    function formatAttachmentMeta(attachment = {}) {
      return [getAttachmentExtension(getAttachmentDisplayName(attachment)).toUpperCase(), formatAttachmentSize(attachment.size)].filter(Boolean).join(" - ");
    }

    function getAttachmentIdentity(attachment = {}) {
      return attachment.path || [attachment.name, attachment.size, attachment.lastModified].map((value) => String(value || "")).join(":");
    }

    function normalizeAttachmentReferences(attachments = []) {
      return (Array.isArray(attachments) ? attachments : []).map((attachment) => {
        const name = getAttachmentDisplayName(attachment);
        const kind = getAttachmentKind(attachment);
        return {
          id: String(attachment.id || getAttachmentIdentity(attachment) || name),
          name,
          kind,
          ...(attachment.path ? { path: String(attachment.path) } : {}),
          ...(Number.isFinite(Number(attachment.size)) ? { size: Number(attachment.size) } : {}),
          ...(attachment.type ? { type: String(attachment.type) } : {}),
          ...(Number.isFinite(Number(attachment.lastModified)) ? { lastModified: Number(attachment.lastModified) } : {})
        };
      }).filter((attachment) => attachment.name);
    }

    function normalizeAttachmentPayloads(attachments = []) {
      return (Array.isArray(attachments) ? attachments : []).map((attachment) => {
        const reference = normalizeAttachmentReferences([attachment])[0];
        if (!reference) return null;
        if (reference.kind === "image") return { ...reference, ...(attachment.pasted ? { pasted: true } : {}), dataUrl: String(attachment.dataUrl || "") };
        return { ...reference, content: String(attachment.content || "") };
      }).filter((attachment) => attachment?.name && (attachment.content || attachment.dataUrl));
    }

    function getContextFileKind(file = {}) {
      if (file.kind === "image") return "image";
      const extension = getAttachmentExtension(file.name || file.path || "").toLowerCase();
      return TEXT_ATTACHMENT_EXTENSIONS.has(extension) ? "code" : "text";
    }

    function getContextFileKey(file = {}) {
      const path = String(file.path || "").trim();
      if (path) return `path:${normalizeLocalPathForComparison(path).toLowerCase()}`;
      return `id:${String(file.id || file.name || "").toLowerCase()}`;
    }

    function addUniqueContextFile(files, file = {}) {
      if (!file.name) return;
      const key = getContextFileKey(file);
      if (files.some((candidate) => getContextFileKey(candidate) === key)) return;
      files.push(file);
    }

    function createContextFileFromAttachment(attachment = {}, source = "") {
      const reference = normalizeAttachmentReferences([attachment])[0];
      if (!reference) return null;
      const path = getSavedAttachmentResolvedPath(reference);
      return {
        id: reference.id,
        name: reference.name,
        path,
        kind: getContextFileKind(reference),
        source,
        openable: !!path
      };
    }

    function isPlaceholderActiveFilePath(path) {
      const value = String(path || "").trim().replace(/\\/g, "/");
      return value.toLowerCase() === "document.md";
    }

    function createContextFileFromPath(path, source = "") {
      const value = String(path || "").trim();
      if (!value) return null;
      return {
        id: value,
        name: getActivityFileName(value),
        path: value,
        kind: getContextFileKind({ name: value }),
        source,
        openable: true
      };
    }

    function createLatestRequestContextFiles(activeFile, attachments = []) {
      const files = [];
      if (activeFile?.path && !isPlaceholderActiveFilePath(activeFile.path)) {
        addUniqueContextFile(files, createContextFileFromPath(activeFile.path, "active-file"));
      }
      for (const attachment of normalizeAttachmentReferences(attachments)) {
        addUniqueContextFile(files, createContextFileFromAttachment(attachment, "current-attachment"));
      }
      return files;
    }

    function updateLatestRequestContextFromTool(event = {}) {
      if (event.type !== "tool" || event.tool !== "read_file") return;
      if (event.activity?.status === "running") return;
      const args = event.activity?.raw?.args || parseToolInput(event.input);
      const file = createContextFileFromPath(args.path || event.activity?.primaryText, "read-file");
      if (!file) return;
      addUniqueContextFile(latestRequestContextFiles, file);
      contextIndicator?.refresh?.();
    }

    function getChatReferenceContextFiles() {
      const files = [];
      const records = [];
      for (const item of agentTaskIndex) records.push(item);
      for (const entry of agentEntries) records.push(entry.record);
      if (activeAgentEntry?.record) records.push(activeAgentEntry.record);
      for (const record of records) {
        for (const attachment of normalizeAttachmentReferences(record?.attachments)) {
          addUniqueContextFile(files, createContextFileFromAttachment(attachment, "chat-reference"));
        }
      }
      return files;
    }

    function getContextFileGroups() {
      return [
        { title: "Latest request", files: latestRequestContextFiles },
        { title: "Chat references", files: getChatReferenceContextFiles() }
      ];
    }

    function openContextFileFromIndicator(file = {}) {
      if (!file.path) return;
      void openSavedAttachment({ name: file.name, path: file.path, kind: file.kind });
    }
    function validateImageAttachmentSize(size) {
      const bytes = Number(size);
      if (Number.isFinite(bytes) && bytes > MAX_IMAGE_ATTACHMENT_BYTES) throw new Error("Image file is too large to attach.");
    }

    function bytesToBase64(data) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
      }
      return btoa(binary);
    }

    function readFileAsText(file) {
      if (typeof file.text === "function") return file.text();
      if (typeof FileReader !== "function") return Promise.reject(new Error("Unable to read attached file."));
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Unable to read attached file."));
        reader.readAsText(file);
      });
    }

    function readFileAsDataUrl(file) {
      if (file?.dataUrl) return Promise.resolve(String(file.dataUrl));
      if (typeof FileReader !== "function") return Promise.reject(new Error("Unable to read attached image."));
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Unable to read attached image."));
        reader.readAsDataURL(file);
      });
    }

    function dataUrlToBytes(dataUrl) {
      const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
      if (!match || match[2] !== ";base64") throw new Error("Unable to persist attached image.");
      const decodeBase64 = typeof atob === "function" ? atob : window.atob;
      const binary = decodeBase64(String(match[3] || ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    function createImageAttachmentBase(source, dataUrl, fallbackSize) {
      const path = source.path || source.fullPath || "";
      const type = getImageAttachmentMimeType(source) || "image/png";
      const size = Number(source.size || fallbackSize || 0) || 0;
      validateImageAttachmentSize(size);
      return {
        id: `attachment-${nextDraftAttachmentId++}`,
        kind: "image",
        name: source.name || getActivityFileName(path),
        ...(path ? { path } : {}),
        size,
        type,
        lastModified: Number(source.lastModified || 0) || undefined,
        ...(source.pasted ? { pasted: true } : {}),
        dataUrl
      };
    }

    function getImageExtensionForMimeType(type) {
      switch (String(type || "").toLowerCase()) {
        case "image/avif": return "avif";
        case "image/bmp": return "bmp";
        case "image/gif": return "gif";
        case "image/jpeg": return "jpg";
        case "image/webp": return "webp";
        default: return "png";
      }
    }

    function createPastedImageName(file, index) {
      const name = String(file?.name || "").trim();
      if (name && name !== "image.png") return name;
      return `pasted-image-${index + 1}.${getImageExtensionForMimeType(file?.type)}`;
    }

    function getClipboardImageFiles(event) {
      return Array.from(event?.clipboardData?.items || []).map((item, index) => {
        if (!String(item?.type || "").startsWith("image/")) return null;
        const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
        return file ? { file, index } : null;
      }).filter(Boolean);
    }

    async function createAttachmentFromPastedImage(source) {
      const file = source?.file;
      if (!file || !isImageAttachmentCandidate(file)) throw new Error("Only image clipboard items can be attached.");
      validateImageAttachmentSize(file.size);
      const dataUrl = await readFileAsDataUrl(file);
      return createImageAttachmentBase({ name: createPastedImageName(file, source.index || 0), type: file.type, size: file.size, lastModified: file.lastModified, pasted: true }, dataUrl, file.size);
    }

    async function createAttachmentFromFile(file) {
      if (!file) throw new Error("Only text or image files can be attached.");
      if (isImageAttachmentCandidate(file)) {
        validateImageAttachmentSize(file.size);
        const dataUrl = await readFileAsDataUrl(file);
        return createImageAttachmentBase(file, dataUrl, file.size);
      }
      if (!isTextAttachmentCandidate(file)) throw new Error("Only text or image files can be attached.");
      const content = await readFileAsText(file);
      if (hasBinaryAttachmentContent(content)) throw new Error("Only text or image files can be attached.");
      const path = file.path || file.fullPath || "";
      return {
        id: `attachment-${nextDraftAttachmentId++}`,
        kind: "text",
        name: file.name || getActivityFileName(path),
        ...(path ? { path } : {}),
        size: Number(file.size || content.length) || content.length,
        type: file.type || "text/plain",
        lastModified: Number(file.lastModified || 0) || undefined,
        content
      };
    }

    async function createAttachmentFromPath(path) {
      const filePath = String(path || "");
      if (!filePath) throw new Error("Unable to read attached file.");
      let stats = null;
      try {
        stats = await deps.Neutralino?.filesystem?.getStats?.(filePath);
      } catch (_error) {
        stats = null;
      }
      const source = { name: getActivityFileName(filePath), path: filePath, size: Number(stats?.size || 0) || 0, lastModified: Number(stats?.modifiedAt || stats?.mtime || 0) || undefined };
      if (isImageAttachmentCandidate(source)) {
        if (!deps.Neutralino?.filesystem?.readBinaryFile) throw new Error("Unable to read attached image.");
        validateImageAttachmentSize(source.size);
        const data = await deps.Neutralino.filesystem.readBinaryFile(filePath);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
        const type = getImageAttachmentMimeType(source) || "image/png";
        return createImageAttachmentBase({ ...source, type }, `data:${type};base64,${bytesToBase64(bytes)}`, bytes.byteLength || source.size);
      }
      if (!deps.Neutralino?.filesystem?.readFile) throw new Error("Unable to read attached file.");
      const content = await deps.Neutralino.filesystem.readFile(filePath);
      if (hasBinaryAttachmentContent(content)) throw new Error("Only text or image files can be attached.");
      return {
        id: `attachment-${nextDraftAttachmentId++}`,
        kind: "text",
        name: getActivityFileName(filePath),
        path: filePath,
        size: Number(stats?.size || String(content || "").length) || String(content || "").length,
        type: "text/plain",
        lastModified: Number(stats?.modifiedAt || stats?.mtime || 0) || undefined,
        content: String(content || "")
      };
    }

    async function getExistingAttachmentPayloadPath(attachment = {}) {
      const workspacePath = getWorkspaceAttachmentPath(attachment);
      if (workspacePath) return workspacePath;
      const path = getSavedAttachmentResolvedPath(attachment);
      if (!path || !deps.isNeutralinoRuntime?.()) return "";
      const chatsDir = await getAgentChatsDirPath();
      return isPathWithinFolder(path, chatsDir) ? path : "";
    }

    async function isSavedAttachmentInChatStorage(path) {
      if (!path || !deps.isNeutralinoRuntime?.()) return false;
      const chatsDir = await getAgentChatsDirPath();
      return isPathWithinFolder(path, chatsDir);
    }

    async function getExternalPromptAttachmentReferences(attachments = []) {
      const external = [];
      for (const attachment of normalizeAttachmentReferences(attachments)) {
        const path = getSavedAttachmentResolvedPath(attachment);
        if (!path || isPathWithinWorkspace(path) || await isSavedAttachmentInChatStorage(path)) continue;
        external.push(attachment);
      }
      return external;
    }

    function getAttachmentPathKey(attachment = {}) {
      const path = getSavedAttachmentResolvedPath(attachment);
      return path ? normalizeLocalPathForComparison(path) : "";
    }

    function filterExternalAttachmentPayloads(payloads = [], externalAttachments = []) {
      const externalPaths = new Set(externalAttachments.map(getAttachmentPathKey).filter(Boolean));
      if (!externalPaths.size) return payloads;
      return payloads.filter((payload) => {
        const path = getAttachmentPathKey(payload);
        return !path || !externalPaths.has(path);
      });
    }

    async function loadAttachmentPayloadsFromReferences(attachments = []) {
      const payloads = [];
      for (const attachment of normalizeAttachmentReferences(attachments)) {
        const path = getSavedAttachmentResolvedPath(attachment);
        if (!path) continue;
        try {
          payloads.push(await createAttachmentFromPath(path));
        } catch (_error) {
          // Missing or unreadable external attachments should not block an edited prompt rerun.
        }
      }
      return payloads;
    }

    function mergeAttachmentPayloads(primary = [], additions = []) {
      const payloads = Array.isArray(primary) ? primary.slice() : [];
      const known = new Set(payloads.map(getAttachmentIdentity));
      for (const attachment of additions) {
        const identity = getAttachmentIdentity(attachment);
        if (identity && known.has(identity)) continue;
        if (identity) known.add(identity);
        payloads.push(attachment);
      }
      return payloads;
    }

    function formatExternalAttachmentApprovalMessage(attachments = []) {
      const names = normalizeAttachmentReferences(attachments).slice(0, 5).map((attachment) => {
        const path = getSavedAttachmentResolvedPath(attachment);
        return `- ${getAttachmentDisplayName(attachment)}${path ? ` (${path})` : ""}`;
      });
      const remaining = attachments.length > names.length ? `\n- ${attachments.length - names.length} more external file(s)` : "";
      return [
        "This edited prompt includes attachment files outside the opened folder.",
        "Send their current file contents to the AI with this prompt?",
        names.join("\n") + remaining
      ].filter(Boolean).join("\n\n");
    }

    async function requestExternalAttachmentApproval(attachments = []) {
      if (!attachments.length) return "send";
      const message = formatExternalAttachmentApprovalMessage(attachments);
      const notification = app?.services?.notify;
      if (typeof notification?.show === "function") {
        const decision = await notification.show({
          title: "External attachments",
          message,
          dismissValue: "cancel",
          buttons: [
            { id: "skip", label: "Send without external files", value: "skip", variant: "secondary" },
            { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
            { id: "send", label: "Send with external files", value: "send", variant: "primary", autoFocus: true }
          ]
        });
        return decision === "send" || decision === "skip" ? decision : "cancel";
      }
      if (typeof deps.confirm === "function") {
        return await deps.confirm(message, { title: "External attachments", confirmLabel: "Send with external files", cancelLabel: "Cancel" }) ? "send" : "cancel";
      }
      return typeof window.confirm === "function" && window.confirm(message) ? "send" : "cancel";
    }

    async function loadExistingWorkspaceAttachmentPayloads(attachments = []) {
      const payloads = [];
      for (const attachment of normalizeAttachmentReferences(attachments)) {
        const path = await getExistingAttachmentPayloadPath(attachment);
        if (!path) continue;
        try {
          payloads.push(await createAttachmentFromPath(path));
        } catch (_error) {
          // Missing or unreadable saved attachments should not block an edited prompt rerun.
        }
      }
      return payloads;
    }
    function getNativeDroppedPathCandidates(detail) {
      if (!detail) return [];
      if (typeof detail === "string") return [detail];
      if (Array.isArray(detail)) return detail;
      if (Array.isArray(detail.files)) return detail.files;
      if (Array.isArray(detail.paths)) return detail.paths;
      if (Array.isArray(detail.entries)) return detail.entries;
      return [];
    }

    function normalizeNativeDroppedPaths(detail) {
      const paths = [];
      const seen = new Set();
      getNativeDroppedPathCandidates(detail).forEach((entry) => {
        const path = typeof entry === "string" ? entry : (entry?.path || entry?.file || entry?.name || "");
        const value = String(path || "").trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        paths.push(value);
      });
      return paths;
    }

    function getNativeDropPoint(detail) {
      const source = detail && typeof detail === "object" ? detail : {};
      const nested = source.position || source.point || source.dropPosition || {};
      const x = Number(source.clientX ?? source.x ?? source.windowX ?? nested.clientX ?? nested.x);
      const y = Number(source.clientY ?? source.y ?? source.windowY ?? nested.clientY ?? nested.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }

    function elementContains(root, node) {
      let current = node;
      while (current) {
        if (current === root) return true;
        current = current.parentNode;
      }
      return false;
    }

    function resolveNativeDropComposer(detail) {
      const point = getNativeDropPoint(detail);
      const target = point && document.elementFromPoint?.(point.x, point.y);
      if (target) {
        for (const composer of nativeDropComposers) {
          if (composer?.root && elementContains(composer.root, target)) return composer;
        }
        return null;
      }
      return activeNativeDropComposer && nativeDropComposers.has(activeNativeDropComposer) ? activeNativeDropComposer : null;
    }

    function setActiveNativeDropComposer(composer) {
      if (composer && nativeDropComposers.has(composer)) activeNativeDropComposer = composer;
    }

    async function handleNativeFilesDropped(event) {
      const paths = normalizeNativeDroppedPaths(event?.detail);
      if (!paths.length) return;
      const composer = resolveNativeDropComposer(event?.detail);
      if (!composer) return;
      await composer.addAttachments(paths, createAttachmentFromPath);
    }

    function ensureNativeDropListener() {
      if (nativeDropListenerAttached || !deps.isNeutralinoRuntime?.() || !deps.Neutralino?.events?.on) return;
      nativeDropListenerAttached = true;
      void deps.Neutralino.events.on("filesDropped", handleNativeFilesDropped);
    }
    function createPromptComposerMenuElements() {
      const menu = document.createElement("div");
      menu.className = "ai-companion-mode-menu";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ai-companion-mode-menu-toggle";
      toggle.title = "Prompt actions";
      toggle.setAttribute("aria-label", "Prompt actions");
      toggle.setAttribute("aria-haspopup", "menu");
      toggle.setAttribute("aria-expanded", "false");
      const icon = document.createElement("i");
      icon.className = "bi bi-plus-lg";
      icon.setAttribute("aria-hidden", "true");
      toggle.append(icon);
      const list = document.createElement("div");
      list.className = "ai-companion-mode-menu-list";
      list.setAttribute("role", "menu");
      list.hidden = true;
      const attach = document.createElement("button");
      attach.type = "button";
      attach.className = "ai-companion-mode-menu-item ai-companion-attach-files";
      attach.setAttribute("role", "menuitem");
      attach.textContent = "Attach files";
      const chat = document.createElement("button");
      chat.type = "button";
      chat.className = "ai-companion-mode-menu-item";
      chat.dataset.aiCompanionTab = "chat";
      chat.setAttribute("role", "menuitem");
      chat.textContent = "Chat mode";
      const agent = document.createElement("button");
      agent.type = "button";
      agent.className = "ai-companion-mode-menu-item";
      agent.dataset.aiCompanionTab = "agent";
      agent.setAttribute("role", "menuitem");
      agent.textContent = "Agent mode";
      const plan = document.createElement("button");
      plan.type = "button";
      plan.className = "ai-companion-mode-menu-item";
      plan.dataset.aiCompanionTab = "plan";
      plan.setAttribute("role", "menuitem");
      plan.textContent = "Plan mode";
      list.append(attach, chat, agent, plan);
      menu.append(toggle, list);
      return { menu, toggle, list, attachFilesButton: attach, modeButtons: [chat, agent, plan] };
    }

    function renderAttachmentIcon(parent, attachment = {}) {
      const iconWrap = document.createElement("span");
      iconWrap.className = "ai-companion-attachment-icon";
      if (getAttachmentKind(attachment) === "image" && attachment.dataUrl) {
        const preview = document.createElement("img");
        preview.className = "ai-companion-attachment-preview";
        preview.alt = "";
        preview.src = attachment.dataUrl;
        iconWrap.append(preview);
      } else {
        const icon = document.createElement("i");
        icon.className = getAttachmentKind(attachment) === "image" ? "bi bi-file-earmark-image" : "bi bi-file-earmark-text";
        icon.setAttribute("aria-hidden", "true");
        iconWrap.append(icon);
      }
      parent.append(iconWrap);
    }

    function createComposerAttachmentChip(attachment, options = {}) {
      const chip = document.createElement("div");
      chip.className = `ai-companion-attachment-chip${options.edit ? " ai-companion-prompt-edit-attachment-chip" : ""}`;
      renderAttachmentIcon(chip, attachment);
      const body = document.createElement("button");
      body.type = "button";
      body.className = "ai-companion-attachment-body";
      const canOpen = !!attachment.path;
      body.disabled = !canOpen;
      if (canOpen) {
        body.setAttribute("aria-label", `Open ${getAttachmentDisplayName(attachment)} in app`);
        body.addEventListener("click", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          void openSavedAttachment(attachment);
        });
      }
      const name = document.createElement("span");
      name.className = "ai-companion-attachment-name";
      name.textContent = getAttachmentDisplayName(attachment);
      const meta = document.createElement("span");
      meta.className = "ai-companion-attachment-meta";
      meta.textContent = formatAttachmentMeta(attachment) || (getAttachmentKind(attachment) === "image" ? "Image" : "Text");
      body.append(name, meta);
      const tooltip = createSavedAttachmentTooltip(attachment);
      body.append(tooltip);
      if (canOpen) {
        body.addEventListener("mouseenter", () => { void refreshSavedAttachmentTooltip(attachment, tooltip); });
        body.addEventListener("focus", () => { void refreshSavedAttachmentTooltip(attachment, tooltip); });
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = `ai-companion-attachment-remove${options.edit ? " ai-companion-prompt-edit-attachment-remove" : ""}`;
      remove.title = "Remove attached file";
      remove.setAttribute("aria-label", `Remove ${getAttachmentDisplayName(attachment)}`);
      remove.textContent = "x";
      remove.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void options.onRemove?.(attachment);
      });
      chip.append(body, remove);
      return chip;
    }

    function getAttachmentPayloadFromMemory(attachment = {}) {
      const reference = normalizeAttachmentReferences([attachment])[0];
      if (!reference) return null;
      if (reference.kind === "image" && attachment.dataUrl) return { ...reference, ...(attachment.pasted ? { pasted: true } : {}), dataUrl: String(attachment.dataUrl || "") };
      if (reference.kind !== "image" && Object.prototype.hasOwnProperty.call(attachment, "content")) return { ...reference, content: String(attachment.content || "") };
      return null;
    }

    function createPromptComposer(options = {}) {
      const textarea = options.textarea;
      const attachmentList = options.attachmentList;
      const fileInput = options.fileInput;
      const root = options.root || panel;
      const submitButton = options.submitButton || null;
      const menu = options.menu || null;
      const menuToggle = options.menuToggle || null;
      const menuList = options.menuList || null;
      const attachButton = options.attachFilesButton || null;
      const modeButtons = Array.from(options.modeButtons || []);
      const nativeDropRoot = options.nativeDropRoot || textarea || root;
      let attachments = Array.isArray(options.initialAttachments) ? options.initialAttachments.map((attachment) => ({ ...attachment })) : [];
      let destroyed = false;

      function getCurrentImageAttachmentBytes() {
        return attachments.reduce((total, attachment) => getAttachmentKind(attachment) === "image" ? total + (Number(attachment.size) || 0) : total, 0);
      }

      function renderAttachments() {
        if (!attachmentList) return;
        attachmentList.replaceChildren?.();
        if (typeof attachmentList.replaceChildren !== "function") attachmentList.innerHTML = "";
        attachments.forEach((attachment) => attachmentList.append(createComposerAttachmentChip(attachment, { edit: options.edit === true, onRemove: removeAttachment })));
        if (options.edit === true && attachments.length) attachmentList.append(createPromptEditAttachmentHint());
        attachmentList.hidden = attachments.length === 0;
        updateSubmitState();
        options.onAttachmentsChanged?.(normalizeAttachmentReferences(attachments));
      }

      async function removeAttachment(attachment) {
        if (options.confirmRemovals && !await confirmEditedPromptAttachmentRemoval(attachment)) return;
        attachments = attachments.filter((candidate) => candidate.id !== attachment.id);
        renderAttachments();
      }

      function addAttachment(attachment) {
        const identity = getAttachmentIdentity(attachment);
        if (attachments.some((existing) => getAttachmentIdentity(existing) === identity)) return false;
        if (getAttachmentKind(attachment) === "image" && getCurrentImageAttachmentBytes() + (Number(attachment.size) || 0) > MAX_TOTAL_IMAGE_ATTACHMENT_BYTES) {
          throw new Error("Attached images are too large.");
        }
        attachments.push({ ...attachment, id: attachment.id || `attachment-${nextDraftAttachmentId++}` });
        return true;
      }

      async function addAttachments(sources, createAttachment) {
        const values = Array.from(sources || []).filter(Boolean);
        if (!values.length) return;
        let added = 0;
        let rejected = 0;
        let rejectionMessage = "Only text or image files can be attached.";
        for (const source of values) {
          try {
            if (addAttachment(await createAttachment(source))) added += 1;
          } catch (error) {
            rejected += 1;
            rejectionMessage = error?.message || rejectionMessage;
          }
        }
        renderAttachments();
        if (rejected) notifyAiCompanionError(rejectionMessage || `Skipped ${rejected} attachment${rejected === 1 ? "" : "s"}.`);
      }

      async function chooseFiles() {
        closeModeMenus();
        if (deps.isNeutralinoRuntime?.() && deps.Neutralino?.os?.showOpenDialog && deps.Neutralino?.filesystem?.readFile) {
          try {
            const selected = await deps.Neutralino.os.showOpenDialog("Attach files", { multiSelections: true });
            const paths = Array.isArray(selected) ? selected : (selected ? [selected] : []);
            if (paths.length) await addAttachments(paths, createAttachmentFromPath);
            return;
          } catch (_error) {
            // Fall back to the browser file input when the desktop picker is unavailable.
          }
        }
        fileInput?.click?.();
      }

      async function handlePaste(event) {
        const imageFiles = getClipboardImageFiles(event);
        if (!imageFiles.length) return;
        event.preventDefault?.();
        await addAttachments(imageFiles, createAttachmentFromPastedImage);
      }

      function handleFileInputChange() {
        void addAttachments(fileInput?.files, createAttachmentFromFile).then(() => {
          if (fileInput) fileInput.value = "";
        });
      }

      function handleDrop(event) {
        if (!hasDroppedFiles(event)) return;
        stopAttachmentDropEvent(event);
        root?.classList?.remove("ai-companion-attachment-dragging");
        void addAttachments(event.dataTransfer?.files, createAttachmentFromFile);
      }

      function handleDrag(event) {
        if (!hasDroppedFiles(event)) return;
        stopAttachmentDropEvent(event);
        root?.classList?.add("ai-companion-attachment-dragging");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }

      function handleDragEnd(event) {
        if (!hasDroppedFiles(event)) return;
        stopAttachmentDropEvent(event);
        root?.classList?.remove("ai-companion-attachment-dragging");
      }

      function handleMenuToggle(event) {
        event.preventDefault?.();
        event.stopPropagation?.();
        const shouldOpen = menuList?.hidden !== false;
        closeModeMenus(menu);
        setModeMenuOpen(menu, shouldOpen);
      }

      function handleAttachButton(event) {
        event.preventDefault?.();
        event.stopPropagation?.();
        void chooseFiles();
      }

      function handleModeButton(event) {
        const mode = (event.currentTarget || event.target)?.dataset?.aiCompanionTab;
        if (!mode) return;
        selectTab(mode);
      }

      function updateSubmitState() {
        if (typeof options.updateSubmitState === "function") options.updateSubmitState(api);
        else if (submitButton) submitButton.disabled = !hasContent();
      }

      function hasContent() {
        return !!String(textarea?.value || "").trim() || attachments.length > 0;
      }

      async function getAttachmentPayloads() {
        const payloads = [];
        for (const attachment of attachments) {
          const memoryPayload = getAttachmentPayloadFromMemory(attachment);
          if (memoryPayload) {
            payloads.push(memoryPayload);
            continue;
          }
          const path = await getExistingAttachmentPayloadPath(attachment);
          if (!path) continue;
          try {
            payloads.push(await createAttachmentFromPath(path));
          } catch (_error) {
            // Missing or unreadable saved attachments should not block a prompt run.
          }
        }
        return payloads;
      }

      function getAttachmentReferences() {
        return normalizeAttachmentReferences(attachments);
      }

      function clear() {
        if (textarea) textarea.value = "";
        attachments = [];
        renderAttachments();
        updateSubmitState();
      }

      function clearAttachments() {
        attachments = [];
        renderAttachments();
      }

      function activateNativeDropComposer() {
        setActiveNativeDropComposer(api);
      }
      function focus() {
        textarea?.focus?.();
      }

      function destroy() {
        if (destroyed) return;
        destroyed = true;
        textarea?.removeEventListener?.("input", updateSubmitState);
        textarea?.removeEventListener?.("paste", handlePaste);
        fileInput?.removeEventListener?.("change", handleFileInputChange);
        attachButton?.removeEventListener?.("click", handleAttachButton);
        menuToggle?.removeEventListener?.("click", handleMenuToggle);
        modeButtons.forEach((button) => button.removeEventListener?.("click", handleModeButton));
        nativeDropRoot?.removeEventListener?.("mouseenter", activateNativeDropComposer);
        nativeDropRoot?.removeEventListener?.("pointerenter", activateNativeDropComposer);
        nativeDropRoot?.removeEventListener?.("mousedown", activateNativeDropComposer);
        textarea?.removeEventListener?.("focus", activateNativeDropComposer);
        nativeDropComposers.delete(api);
        if (activeNativeDropComposer === api) activeNativeDropComposer = null;
        if (options.enableDrop !== false) {
          root?.removeEventListener?.("dragenter", handleDrag);
          root?.removeEventListener?.("dragover", handleDrag);
          root?.removeEventListener?.("dragleave", handleDragEnd);
          root?.removeEventListener?.("drop", handleDrop);
        }
      }

      if (textarea && Object.prototype.hasOwnProperty.call(options, "initialPrompt")) textarea.value = String(options.initialPrompt || "");
      const api = { addAttachments, chooseFiles, clear, clearAttachments, destroy, focus, getAttachmentPayloads, getAttachmentReferences, getPrompt: () => String(textarea?.value || "").trim(), hasContent, renderAttachments, root: nativeDropRoot };
      nativeDropComposers.add(api);
      ensureNativeDropListener();
      nativeDropRoot?.addEventListener?.("mouseenter", activateNativeDropComposer);
      nativeDropRoot?.addEventListener?.("pointerenter", activateNativeDropComposer);
      nativeDropRoot?.addEventListener?.("mousedown", activateNativeDropComposer);
      textarea?.addEventListener?.("focus", activateNativeDropComposer);
      textarea?.addEventListener?.("input", updateSubmitState);
      textarea?.addEventListener?.("paste", handlePaste);
      fileInput?.addEventListener?.("change", handleFileInputChange);
      attachButton?.addEventListener?.("click", handleAttachButton);
      menuToggle?.addEventListener?.("click", handleMenuToggle);
      modeButtons.forEach((button) => button.addEventListener?.("click", handleModeButton));
      updateModeButtonSelection();
      if (options.enableDrop !== false) {
        root?.addEventListener?.("dragenter", handleDrag);
        root?.addEventListener?.("dragover", handleDrag);
        root?.addEventListener?.("dragleave", handleDragEnd);
        root?.addEventListener?.("drop", handleDrop);
      }
      renderAttachments();
      updateSubmitState();
      return api;
    }

    function getDraftAttachmentPayloads() {
      return mainPromptComposer?.getAttachmentPayloads?.() || Promise.resolve([]);
    }

    function clearDraftAttachments() {
      mainPromptComposer?.clearAttachments?.();
    }

    function stopAttachmentDropEvent(event) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }

    function hasDroppedFiles(event) {
      const transfer = event?.dataTransfer;
      return !!(transfer?.files?.length || transfer?.items?.length);
    }
    async function openSavedAttachment(attachment) {
      const path = attachment?.path ? joinWorkspacePath(attachment.path) : "";
      if (!path) return;
      try {
        if (deps.Neutralino?.filesystem?.getStats) await deps.Neutralino.filesystem.getStats(path);
        const tab = await deps.openDocumentSourceFile?.({ name: getActivityFileName(path), path }, { temporary: false, title: getActivityFileName(path) });
        if (workspaceOpen) {
          closeWorkspaceForExternalNavigation();
          setWorkspaceSidebarView("files");
        }
        return tab;
      } catch (_error) {
        notifyAiCompanionError("Attached file not found");
        return null;
      }
    }

    function getSavedAttachmentResolvedPath(attachment = {}) {
      return attachment.path ? joinWorkspacePath(attachment.path) : "";
    }

    function getSavedAttachmentScopeLabel(path) {
      return isPathWithinWorkspace(path) ? "Workspace file" : "External file";
    }

    function setSavedAttachmentTooltipText(tooltip, attachment, status = "unknown") {
      const path = getSavedAttachmentResolvedPath(attachment);
      if (!path) {
        tooltip.textContent = "No saved file path.";
        return;
      }
      const lines = [getSavedAttachmentScopeLabel(path), path];
      if (status === "checking") lines.push("Checking whether this file still exists...");
      if (status === "exists") lines.push("Click to open the file.");
      if (status === "missing") lines.push("This file no longer exists at this path.");
      tooltip.textContent = lines.join("\n");
    }

    async function refreshSavedAttachmentTooltip(attachment, tooltip) {
      const path = getSavedAttachmentResolvedPath(attachment);
      if (!path || tooltip.dataset.existsChecked === "true") return;
      if (!deps.Neutralino?.filesystem?.getStats) return;
      tooltip.dataset.existsChecked = "true";
      setSavedAttachmentTooltipText(tooltip, attachment, "checking");
      try {
        await deps.Neutralino.filesystem.getStats(path);
        setSavedAttachmentTooltipText(tooltip, attachment, "exists");
      } catch (_error) {
        setSavedAttachmentTooltipText(tooltip, attachment, "missing");
      }
    }

    function createSavedAttachmentTooltip(attachment) {
      const tooltip = document.createElement("span");
      tooltip.className = "ai-companion-saved-attachment-tooltip";
      setSavedAttachmentTooltipText(tooltip, attachment);
      return tooltip;
    }

    function shouldConfirmEditedPromptAttachmentRemoval() {
      return deps.shouldConfirmEditedPromptAttachmentRemoval?.() === true;
    }

    async function confirmEditedPromptAttachmentRemoval(attachment) {
      if (!shouldConfirmEditedPromptAttachmentRemoval()) return true;
      const name = getAttachmentDisplayName(attachment);
      const path = getSavedAttachmentResolvedPath(attachment);
      const message = [
        `Remove "${name}" from the prompt you are editing?`,
        path,
        "This only removes the attachment from the edited prompt. It does not delete the file from disk."
      ].filter(Boolean).join("\n\n");
      if (typeof deps.confirm === "function") {
        return await deps.confirm(message, { confirmLabel: "Remove", confirmVariant: "danger" });
      }
      return typeof window.confirm === "function" ? window.confirm(message) : false;
    }

    function createSavedAttachmentChip(attachment) {
      const canOpen = !!attachment.path;
      const chip = document.createElement(canOpen ? "button" : "span");
      chip.className = `ai-companion-saved-attachment${canOpen ? " openable" : ""}`;
      const tooltip = createSavedAttachmentTooltip(attachment);
      if (canOpen) {
        chip.type = "button";
        chip.setAttribute("aria-label", `Open ${getAttachmentDisplayName(attachment)} in app`);
        chip.addEventListener("click", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          void openSavedAttachment(attachment);
        });
        chip.addEventListener("mouseenter", () => { void refreshSavedAttachmentTooltip(attachment, tooltip); });
        chip.addEventListener("focus", () => { void refreshSavedAttachmentTooltip(attachment, tooltip); });
      }
      const icon = document.createElement("i");
      icon.className = getAttachmentKind(attachment) === "image" ? "bi bi-file-earmark-image" : "bi bi-file-earmark-text";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = getAttachmentDisplayName(attachment);
      chip.append(icon, label, tooltip);
      return chip;
    }

    function createPromptEditAttachmentChip(attachment, onRemove) {
      const item = document.createElement("span");
      item.className = "ai-companion-prompt-edit-attachment-item";
      item.append(createSavedAttachmentChip(attachment));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ai-companion-prompt-edit-attachment-remove";
      remove.title = "Remove attachment from edited prompt";
      remove.setAttribute("aria-label", `Remove ${getAttachmentDisplayName(attachment)} from edited prompt`);
      const icon = document.createElement("i");
      icon.className = "bi bi-x";
      icon.setAttribute("aria-hidden", "true");
      remove.append(icon);
      remove.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void onRemove?.(attachment);
      });
      item.append(remove);
      return item;
    }

    function renderSavedAttachmentList(parent, attachments = [], extraClassName = "") {
      const references = normalizeAttachmentReferences(attachments);
      if (!references.length) return;
      const list = document.createElement("div");
      list.className = `ai-companion-saved-attachments${extraClassName ? ` ${extraClassName}` : ""}`;
      references.forEach((attachment) => list.append(createSavedAttachmentChip(attachment)));
      parent.append(list);
    }

    function createPromptEditAttachmentHint() {
      const hint = document.createElement("button");
      hint.type = "button";
      hint.className = "ai-companion-prompt-edit-attachment-hint";
      hint.setAttribute("aria-label", "Attachment edit behavior");
      const icon = document.createElement("i");
      icon.className = "bi bi-eye";
      icon.setAttribute("aria-hidden", "true");
      const tooltip = document.createElement("span");
      tooltip.className = "ai-companion-prompt-edit-attachment-tip";
      tooltip.textContent = "You are editing a prompt that has attachments. If these attachments are within the workspace and still exist, we will reattach them to the sent prompt. If a workspace file has been updated since you last sent this prompt, the updated copy will be sent. This includes text files and images.";
      function positionTooltip() {
        const rect = hint.getBoundingClientRect?.();
        if (!rect) return;
        const tooltipRect = tooltip.getBoundingClientRect?.();
        const width = tooltipRect?.width || 280;
        const height = tooltipRect?.height || 0;
        const margin = 8;
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || width;
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || height;
        const minLeft = margin + (width / 2);
        const maxLeft = viewportWidth - margin - (width / 2);
        const centeredLeft = rect.left + (rect.width / 2);
        const left = Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft));
        let top = rect.bottom + 6;
        if (height && top + height > viewportHeight - margin) top = Math.max(margin, rect.top - height - 6);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }
      function showTooltip() {
        if (!document.body) return;
        if (!tooltip.isConnected) document.body.append(tooltip);
        positionTooltip();
        tooltip.classList.add("is-visible");
        window.addEventListener?.("resize", positionTooltip);
        window.addEventListener?.("scroll", positionTooltip, true);
      }
      function hideTooltip() {
        tooltip.classList.remove("is-visible");
        tooltip.remove?.();
        window.removeEventListener?.("resize", positionTooltip);
        window.removeEventListener?.("scroll", positionTooltip, true);
      }
      hint.append(icon);
      hint.addEventListener("mouseenter", showTooltip);
      hint.addEventListener("focus", showTooltip);
      hint.addEventListener("mouseleave", hideTooltip);
      hint.addEventListener("blur", hideTooltip);
      hint.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
      });
      return hint;
    }

    function renderPromptEditAttachmentNotice(parent, attachments = [], onRemove = null) {
      const references = normalizeAttachmentReferences(attachments);
      if (!references.length) return null;
      const notice = document.createElement("div");
      notice.className = "ai-companion-prompt-edit-attachments";
      const list = document.createElement("div");
      list.className = "ai-companion-saved-attachments";
      references.forEach((attachment) => list.append(onRemove ? createPromptEditAttachmentChip(attachment, onRemove) : createSavedAttachmentChip(attachment)));
      notice.append(list, createPromptEditAttachmentHint());
      parent?.append?.(notice);
      return notice;
    }

    function getPromptEntryParts(entry) {
      return entry?.promptElements || {};
    }

    function updatePromptEntryDisplay(entry) {
      const { summary, fullPrompt } = getPromptEntryParts(entry);
      if (!entry?.record || !summary || !fullPrompt) return;
      entry.record.title = getTaskTitle(entry.record.prompt, entry.record.attachments);
      renderPromptSummary(summary, entry.record.title, entry.record.attachments);
      fullPrompt.replaceChildren?.();
      fullPrompt.textContent = entry.record.prompt || "";
      renderSavedAttachmentList(fullPrompt, entry.record.attachments);
      attachPromptActions(entry);
    }

    function createPromptEditButton(entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-companion-box-copy ai-companion-box-edit";
      button.title = "Edit prompt";
      button.setAttribute("aria-label", "Edit prompt");
      const icon = document.createElement("i");
      icon.className = "bi bi-pencil";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        beginPromptEdit(entry);
      });
      return button;
    }
    function canExecutePlanRecord(record) {
      return isPlanRecord(record) && record?.status === "planned";
    }

    function createExecutePlanButton(entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-companion-box-copy ai-companion-box-execute-plan";
      button.title = "Execute plan";
      button.setAttribute("aria-label", "Execute plan");
      const icon = document.createElement("i");
      icon.className = "bi bi-play-circle";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void executeSavedPlan(entry);
      });
      return button;
    }

    function appendExecutePlanButton(actions, entry) {
      if (!actions || !canExecutePlanRecord(entry?.record)) return;
      if (actions.querySelector?.(".ai-companion-box-execute-plan")) return;
      actions.append(createExecutePlanButton(entry));
    }

    function attachPlanResponseActions(entry, response) {
      const actions = response?.nextElementSibling?.className === "ai-companion-box-actions" ? response.nextElementSibling : null;
      appendExecutePlanButton(actions, entry);
    }

    function canResumeRun(record = {}) {
      return ["chat", "plan", "agent"].includes(normalizeCompanionMode(record.mode))
        && record.status === "interrupted"
        && record.recoveryInspection?.canResume === true;
    }

    function appendDurableResumeButton(actions, entry) {
      if (!actions || !canResumeRun(entry?.record) || actions.querySelector?.(".ai-companion-box-resume-task")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-companion-box-copy ai-companion-box-resume-task";
      button.title = "Resume from the latest safe runtime boundary";
      button.setAttribute("aria-label", "Resume task");
      const icon = document.createElement("i");
      icon.className = "bi bi-arrow-clockwise";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", async (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        const taskId = String(entry.record?.id || "");
        if (isAgentRunning() || !taskId || resumingRunTaskIds.has(taskId)) return;
        resumingRunTaskIds.add(taskId);
        button.disabled = true;
        try {
          await runCompanionPrompt({
            prompt: entry.record.rootPrompt || entry.record.prompt || "",
            mode: normalizeCompanionMode(entry.record.mode), entry, persistedAttachments: entry.record.attachments || [],
            executionKind: "resume", executionGeneration: entry.record.executionGeneration,
            resumeRun: true
          });
        } finally {
          resumingRunTaskIds.delete(taskId);
          button.disabled = false;
        }
      });
      actions.append(button);
    }

    function attachPromptActions(entry) {
      const { details } = getPromptEntryParts(entry);
      if (!details) return;
      const actions = attachCopyAction(details, () => String(entry.record?.prompt || ""), "Copy prompt as Markdown", { timestamp: entry.record?.createdAt });
      actions?.append(createPromptEditButton(entry));
      appendDurableResumeButton(actions, entry);
    }

    function getVisibleLineHeight(element) {
      if (!element) return 0;
      const style = window.getComputedStyle?.(element);
      const lineHeight = Number.parseFloat(style?.lineHeight || "");
      if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
      const fontSize = Number.parseFloat(style?.fontSize || "");
      return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.5 : 21;
    }

    function resizePromptEditTextarea(textarea) {
      if (!textarea) return;
      const lineHeight = getVisibleLineHeight(textarea);
      const minHeight = Math.ceil(lineHeight);
      const maxHeight = Math.ceil(lineHeight * AGENT_INPUT_MAX_VISIBLE_LINES);
      textarea.style.height = `${minHeight}px`;
      const contentHeight = textarea.scrollHeight || minHeight;
      const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    }

    function endPromptEdit(entry) {
      if (!editingPromptEntry || editingPromptEntry.entry !== entry) return;
      const state = editingPromptEntry;
      editingPromptEntry = null;
      state.composer?.destroy?.();
      document.removeEventListener?.("click", state.handleOutsideClick);
      const { details, summary } = getPromptEntryParts(entry);
      details?.classList?.remove("is-editing");
      updatePromptEntryDisplay(entry);
      if (summary) summary.hidden = state.summaryHidden;
      if (details) details.open = state.detailsOpen;
    }

    function cancelPromptEdit(entry) {
      endPromptEdit(entry);
    }

    async function savePromptEdit(entry, composer) {
      const prompt = composer?.getPrompt?.() || "";
      const attachmentReferences = composer?.getAttachmentReferences?.() || [];
      if (!prompt && !attachmentReferences.length) {
        notifyAiCompanionBlocked("Prompt is empty");
        composer?.focus?.();
        return;
      }
      const externalAttachments = await getExternalPromptAttachmentReferences(attachmentReferences);
      const externalDecision = await requestExternalAttachmentApproval(externalAttachments);
      if (externalDecision === "cancel") return;
      let attachmentPayloads = await composer.getAttachmentPayloads();
      if (externalDecision === "send") {
        attachmentPayloads = mergeAttachmentPayloads(attachmentPayloads, await loadAttachmentPayloadsFromReferences(externalAttachments));
      } else if (externalDecision === "skip") {
        attachmentPayloads = filterExternalAttachmentPayloads(attachmentPayloads, externalAttachments);
      }
      endPromptEdit(entry);
      await rerunFromEditedPrompt(entry, prompt, attachmentReferences, attachmentPayloads);
    }

    function beginPromptEdit(entry) {
      if (!entry?.record) return;
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop the current task before editing");
        return;
      }
      if (editingPromptEntry && editingPromptEntry.entry !== entry) cancelPromptEdit(editingPromptEntry.entry);
      const { details, summary, fullPrompt } = getPromptEntryParts(entry);
      if (!details || !summary || !fullPrompt) return;
      const detailsOpen = details.open === true;
      const summaryHidden = summary.hidden === true;
      details.open = true;
      details.classList?.add("is-editing");
      summary.hidden = true;
      fullPrompt.innerHTML = "";
      if (typeof fullPrompt.replaceChildren === "function") fullPrompt.replaceChildren();
      const editRoot = document.createElement("div");
      editRoot.className = "ai-companion-prompt-edit-composer";
      const editAttachmentList = document.createElement("div");
      editAttachmentList.className = "ai-companion-attachment-list ai-companion-prompt-edit-attachment-list";
      editAttachmentList.hidden = true;
      const textarea = document.createElement("textarea");
      textarea.className = "ai-companion-prompt-edit-textarea";
      textarea.value = entry.record.prompt || "";
      textarea.setAttribute("aria-label", "Edit prompt text");
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.multiple = true;
      fileInput.className = "visually-hidden";
      const actions = document.createElement("div");
      actions.className = "ai-companion-prompt-edit-actions";
      const menu = createPromptComposerMenuElements();
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "ai-companion-prompt-edit-save";
      saveButton.textContent = "Save";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "ai-companion-prompt-edit-cancel";
      cancelButton.textContent = "Cancel";
      actions.append(menu.menu, saveButton, cancelButton);
      editRoot.append(editAttachmentList, textarea, fileInput, actions);
      fullPrompt.append(editRoot);
      const editComposer = createPromptComposer({
        root: editRoot,
        textarea,
        attachmentList: editAttachmentList,
        fileInput,
        menu: menu.menu,
        menuToggle: menu.toggle,
        menuList: menu.list,
        attachFilesButton: menu.attachFilesButton,
        modeButtons: menu.modeButtons,
        initialPrompt: entry.record.prompt || "",
        initialAttachments: normalizeAttachmentReferences(entry.record.attachments),
        edit: true,
        enableDrop: true,
        confirmRemovals: shouldConfirmEditedPromptAttachmentRemoval(),
        updateSubmitState: () => {}
      });
      const editSlashSuggestions = attachSlashWorkflowSuggestions(textarea, getSelectedRunMode);
      const destroyEditComposer = editComposer.destroy;
      editComposer.destroy = () => { editSlashSuggestions.destroy(); destroyEditComposer?.(); };
      textarea.addEventListener("input", () => resizePromptEditTextarea(textarea));
      textarea.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault?.();
          cancelPromptEdit(entry);
        }
      });
      saveButton.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void savePromptEdit(entry, editComposer);
      });
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        cancelPromptEdit(entry);
      });
      const handleOutsideClick = (event) => {
        if (event.target?.closest?.(".ai-companion-agent-task-prompt") === details) return;
        cancelPromptEdit(entry);
      };
      editingPromptEntry = { entry, handleOutsideClick, composer: editComposer, detailsOpen, summaryHidden };
      document.addEventListener?.("click", handleOutsideClick);
      resizePromptEditTextarea(textarea);
      editComposer.focus();
      textarea.select?.();
    }
    async function deleteAgentTaskStorage(record) {
      if (!record?.id) return;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.writeFile) {
        localStorage.removeItem?.(`${AGENT_TASKS_STORAGE_KEY}:${record.id}`);
        return;
      }
      const removeFile = deps.Neutralino?.filesystem?.removeFile || deps.Neutralino?.filesystem?.deleteFile;
      const filePath = await getAgentTaskFilePath(record);
      if (!filePath) return;
      try {
        const chatDir = await getAgentChatDirPath();
        const recoveryPath = chatDir ? deps.joinPath(chatDir, `${record.id}.recovery`) : "";
        if (recoveryPath && typeof deps.Neutralino?.filesystem?.remove === "function") {
          await deps.Neutralino.filesystem.remove(recoveryPath);
        }
      } catch (_error) {
        // Recovery data is best-effort cleanup; deleting the task record remains authoritative.
      }
      try {
        if (typeof removeFile !== "function") return;
        await removeFile(filePath);
      } catch (_error) {
        // Stale unreferenced task files should not block prompt reruns.
      }
    }

    async function truncateAgentHistoryAfterEntry(entry) {
      const entryIndex = agentEntries.indexOf(entry);
      if (entryIndex < 0) return;
      const removedEntries = agentEntries.slice(entryIndex + 1);
      removedEntries.forEach((removedEntry) => removedEntry.element?.remove?.());
      agentEntries = agentEntries.slice(0, entryIndex + 1);
      const removedIds = new Set(removedEntries.map((removedEntry) => removedEntry.record?.id).filter(Boolean));
      if (removedIds.size) {
        agentTaskIndex = agentTaskIndex.filter((task) => !removedIds.has(task.id));
        await Promise.all(removedEntries.map((removedEntry) => deleteAgentTaskStorage(removedEntry.record)));
        await writeAgentTaskIndex();
      }
    }

    function prepareEntryForPromptRun(entry, prompt, attachments = entry?.record?.attachments || [], executionKind = "new", executionGeneration = 1) {
      const updatedAt = Date.now();
      hideThinkingIndicator(entry);
      entry.output?.replaceChildren?.();
      if (entry.output && typeof entry.output.replaceChildren !== "function") entry.output.innerHTML = "";
      entry.record = {
        ...entry.record,
        prompt,
        rootPrompt: prompt,
        attachments: normalizeAttachmentReferences(attachments),
        title: getTaskTitle(prompt, attachments),
        status: "running",
        events: [],
        changes: null,
        recoverySummary: null,
        recoveryInspection: null,
        plan: null,
        executionGeneration,
        lastExecutionKind: executionKind,
        updatedAt,
        mode: normalizeCompanionMode(activeRunMode || entry.record.mode)
      };
      entry.renderer?.reset?.();
      entry.renderer = createActivityRenderer(entry.output);
      entry.isDirty = true;
      updatePromptEntryDisplay(entry);
    }

    async function rerunFromEditedPrompt(entry, prompt, attachmentReferences = entry?.record?.attachments || [], attachmentPayloads = null) {
      await truncateAgentHistoryAfterEntry(entry);
      const attachments = Array.isArray(attachmentPayloads) ? attachmentPayloads : await loadExistingWorkspaceAttachmentPayloads(attachmentReferences);
      await runCompanionPrompt({ prompt, entry, attachments, persistedAttachments: attachmentReferences, executionKind: "edited-rerun" });
    }
    async function executeSavedPlan(entry) {
      if (!entry?.record || !canExecutePlanRecord(entry.record)) return;
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop the current task before executing a plan");
        return;
      }
      updatePlanRecordStatus(entry, "implementing");
      await saveAgentEntry(entry);
      const outcome = await runCompanionPrompt({ prompt: createPlanExecutionPrompt(entry.record), mode: "agent" });
      if (outcome?.status === "completed") {
        updatePlanRecordStatus(entry, "implemented", { implementedAt: Date.now(), implementationTaskId: outcome.entryId || "" });
      } else {
        updatePlanRecordStatus(entry, "planned", { lastExecutionError: outcome?.error || "Plan execution did not complete." });
      }
      await saveAgentEntry(entry);
    }
    function migrateTaskRecord(savedRecord = {}, legacyStorage = false) {
      const retained = { ...savedRecord };
      [
        ["agent", "LoopArchitecture"], ["agent", "StateSnapshot"], ["checkpoint", "Summary"],
        ["completion", "Assessment"], ["evidence", "Ledger"], ["intent", "Evaluation"],
        ["intent", "Contract"], ["intent", "ContractMeta"], ["clarification", "Feedback"],
        ["resume"]
      ].forEach((parts) => delete retained[parts.join("")]);
      const historical = legacyStorage || Number(savedRecord.version) < 6;
      const wasInterrupted = ["running", "interrupted"].includes(savedRecord.status);
      return {
        ...retained,
        version: 6,
        status: historical && wasInterrupted ? "historical" : savedRecord.status,
        migrationNotice: historical && wasInterrupted
          ? "This task was created by the retired runtime and is available as read-only history."
          : retained.migrationNotice
      };
    }

    function createAgentTaskEntry(prompt, savedRecord = null, attachments = []) {
      const createdAt = Date.now();
      const sequence = savedRecord?.sequence || getNextAgentTaskSequence();
      const id = savedRecord?.id || createTaskId(sequence, createdAt);
      const chat = savedRecord ? activeAgentChat : ensureActiveAgentChat();
      const migratedRecord = savedRecord ? migrateTaskRecord(savedRecord, savedRecord.storage === "legacy") : null;
      const record = migratedRecord ? {
        ...migratedRecord,
        rootPrompt: migratedRecord.rootPrompt || migratedRecord.prompt || "",
        chatId: savedRecord.chatId || chat?.id || "",
        id,
        fileName: savedRecord.fileName || `${createTaskId(sequence, savedRecord.createdAt || createdAt)}.json`,
        sequence,
        createdAt: savedRecord.createdAt || createdAt,
        updatedAt: savedRecord.updatedAt || savedRecord.createdAt || createdAt,
        attachments: normalizeAttachmentReferences(savedRecord.attachments),
        executionGeneration: Math.max(1, Number(savedRecord.executionGeneration) || 1),
        runId: String(savedRecord.runId || id)
      } : {
        version: 6,
        chatId: chat.id,
        id,
        runId: id,
        fileName: `${id}.json`,
        sequence,
        createdAt,
        updatedAt: createdAt,
        workspaceRoot: deps.getWorkspaceRoot?.() || "",
        prompt,
        rootPrompt: prompt,
        attachments: normalizeAttachmentReferences(attachments),
        title: getTaskTitle(prompt, attachments),
        status: "running",
        events: [],
        mode: normalizeCompanionMode(activeRunMode || activeTab),
        executionGeneration: 1,
        recoverySummary: null,
        recoveryInspection: null,
        lastExecutionKind: "new"
      };
      const row = document.createElement("section");
      row.className = "ai-companion-agent-task-entry";
      row.dataset.agentTaskId = record.id;
      const taskDetails = document.createElement("details");
      taskDetails.className = "ai-companion-agent-task-prompt";
      const summary = document.createElement("summary");
      renderPromptSummary(summary, record.title || getTaskTitle(record.prompt, record.attachments), record.attachments);
      const fullPrompt = document.createElement("div");
      fullPrompt.className = "ai-companion-agent-task-full-text";
      fullPrompt.textContent = record.prompt || "";
      renderSavedAttachmentList(fullPrompt, record.attachments);
      taskDetails.append(summary, fullPrompt);
      const output = document.createElement("div");
      output.className = "ai-companion-agent-task-output";
      row.append(taskDetails, output);
      toolLog.appendChild(row);
      const entry = {
        record,
        element: row,
        output,
        promptElements: { details: taskDetails, summary, fullPrompt },
        renderer: createActivityRenderer(output),
        isDirty: !savedRecord
      };
      attachPromptActions(entry);
      agentEntries.push(entry);
      scrollToolLogToEnd();
      return entry;
    }

    function scheduleAgentEntrySave(entry) {
      if (!entry) return;
      if (agentSaveTimer) window.clearTimeout(agentSaveTimer);
      agentSaveTimer = window.setTimeout(() => {
        agentSaveTimer = null;
        void saveAgentEntry(entry);
      }, 600);
    }

    async function saveAgentEntryImmediately(entry) {
      if (!entry) return;
      if (agentSaveTimer) {
        window.clearTimeout(agentSaveTimer);
        agentSaveTimer = null;
      }
      await saveAgentEntry(entry);
    }

    function recordAgentEvent(event) {
      if (!activeAgentEntry) return null;
      const savedEvent = cloneEvent(event);
      const completedAt = savedEvent.completedAt || Date.now();
      savedEvent.completedAt = completedAt;
      if (savedEvent.activity && savedEvent.activity.status !== "running" && !savedEvent.activity.completedAt) savedEvent.activity.completedAt = completedAt;
      if (savedEvent.type === "agent-summary") {
        const changes = buildTaskChangesFromSummary(savedEvent);
        savedEvent.changedFiles = changes.files;
        savedEvent.attemptedChanges = changes.attempted;
        savedEvent.blockedChanges = changes.blocked;
        activeAgentEntry.record.changes = changes;
      }
      activeAgentEntry.record.events.push(savedEvent);
      activeAgentEntry.record.updatedAt = completedAt;
      if (event.type === "agent-summary") {
        activeAgentEntry.record.status = event.isError === true
          ? "error"
          : "completed";
        renderTaskChangesPanel(activeAgentEntry.record);
      }
      activeAgentEntry.isDirty = true;
      scheduleAgentEntrySave(activeAgentEntry);
      return savedEvent;
    }

    function parseToolInput(input) {
      if (!input || typeof input !== "string") return input && typeof input === "object" ? input : {};
      try {
        const parsed = JSON.parse(input);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_error) {
        return {};
      }
    }

    function getToolPresentation(tool) {
      switch (tool) {
        case "list_files": return { icon: "bi-list-ul", title: "Listing workspace files" };
        case "glob": return { icon: "bi-folder2-open", title: "Finding files" };
        case "search_text": return { icon: "bi-search", title: "Searching workspace" };
        case "read_file": return { icon: "bi-file-earmark-text", title: "Reading file" };
        case "rate-limit": return { icon: "bi-hourglass-split", title: "Waiting for provider" };
        default: return { icon: "bi-gear", title: tool || "Tool activity" };
      }
    }

    function getSyntheticActivityKey(event, args) {
      return [event.tool || event.type || "tool", event.input || "", args.path || "", args.pattern || "", args.command || ""].join(" - ");
    }

    function createSyntheticActivityId(event, args) {
      const explicitId = event.toolCallId || event.tool_call_id || event.callId || event.activityId;
      if (explicitId) return `chat_tool_${String(explicitId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const key = getSyntheticActivityKey(event, args);
      const existing = syntheticActivityIds.get(key);
      if (existing) return existing;
      const id = `chat_tool_${nextSyntheticActivitySequence++}`;
      syntheticActivityIds.set(key, id);
      return id;
    }

    function createSyntheticToolActivity(event) {
      if (event.activity || (event.type !== "tool" && event.type !== "tool-error")) return event;
      const args = parseToolInput(event.input);
      const presentation = getToolPresentation(event.tool);
      const summary = event.summary || event.error || "";
      const status = event.type === "tool-error" ? "failed" : (/running/i.test(summary) ? "running" : "completed");
      const activity = {
        id: createSyntheticActivityId(event, args),
        tool: event.tool || event.type,
        status,
        icon: presentation.icon,
        title: presentation.title,
        primaryText: args.path || args.pattern || args.command || String(event.input || event.tool || ""),
        secondaryText: args.maxFiles ? `Limit ${args.maxFiles} files` : (args.maxMatches ? `Limit ${args.maxMatches} matches` : ""),
        resultSummary: status === "running" ? "" : summary,
        durationMs: event.durationMs,
        raw: {
          args,
          input: event.input || "",
          summary: event.summary || "",
          error: event.error || "",
          result: event.result
        }
      };
      if (status === "failed") activity.resultSummary = event.error || summary || "Failed";
      return { ...event, activity };
    }

    function getApprovalActionLabel(event = {}) {
      if (event.approvalKind === "task-limit") return "Continue task";
      switch (event.tool) {
        case "preferences_update":
        case "preferences_reset":
        case "preferences_import": return "Change settings";
        case "read_file": return "Read";
        case "apply_edit":
        case "write_file": return "Write";
        case "create_document_tab": return "Create document";
        case "insert_at_cursor": return "Insert text";
        case "replace_selection": return "Replace selection";
        case "replace_document_range": return "Replace text range";
        case "extract_selection_to_note": return "Create note";
        case "list_files":
        case "glob": return "List";
        case "search_text": return "Search";
        case "run_command": return "Run command";
        case "run_test": return "Run test";
        case "browse": return "Browse";
        default: return "Agent action";
      }
    }

    function getApprovalActionDescription(event = {}) {
      const analysis = getApprovalActionAnalysis(event);
      if (analysis.actionDescription) return analysis.actionDescription;
      if (event.approvalKind === "task-limit") return "Allow the agent to continue working after reaching the current task limit.";
      switch (event.tool) {
        case "write_file":
          return typeof event.compare?.afterContent === "string" && event.compare.afterContent.length === 0
            ? "Write an empty file at this path, replacing any existing file content. This does not delete the file."
            : "Write the proposed full content to this path, replacing any existing file content.";
        case "apply_edit": return "Replace the matching text in this file with the proposed text.";
        case "create_document_tab": return "Create and save a workspace document at the displayed path.";
        case "insert_at_cursor": return "Insert the proposed text at the active cursor and save the document.";
        case "replace_selection": return "Replace the selected text and save the document.";
        case "replace_document_range": return "Replace the specified text range and save the document.";
        case "extract_selection_to_note": return "Create and save a note from the selected text.";
        case "preferences_update":
        case "preferences_reset":
        case "preferences_import": return "Apply the proposed change to MD-Editor settings.";
        case "run_command": return "Run the displayed shell command in the workspace.";
        case "run_test": return "Run the displayed test command in the workspace.";
        case "read_file": return "Allow the agent to read the displayed file.";
        case "list_files":
        case "glob": return "Allow the agent to list matching workspace files.";
        case "search_text": return "Allow the agent to search workspace file contents.";
        case "browse": return "Allow the agent to open the displayed web location.";
        default: return normalizeApprovalDetailText(event.summary, "Allow the displayed agent action.");
      }
    }

    function getApprovalImpactDescription(event = {}) {
      const analysis = getApprovalActionAnalysis(event);
      if (analysis.lineImpact) {
        const { additions = 0, deletions = 0 } = analysis.lineImpact;
        return `${additions} line${additions === 1 ? "" : "s"} added, ${deletions} removed.`;
      }
      if (!event.compare || typeof event.compare !== "object") return "";
      const counts = countChangedLinesFromCompare(event.compare);
      return `${counts.additions} line${counts.additions === 1 ? "" : "s"} added, ${counts.deletions} removed.`;
    }

    function getApprovalReasonDescription(event = {}) {
      const reason = String(event.actionAnalysis?.taskGoal || event.approvalReason || "").trim();
      if (reason) return reason;
      if (event.approvalKind === "task-limit") return "Continue the current task after reaching its configured limit.";
      return "No rationale was provided for this saved request.";
    }

    function getApprovalIntentMismatch(event = {}) {
      const limitations = Array.isArray(event.actionAnalysis?.limitations) ? event.actionAnalysis.limitations.filter(Boolean) : [];
      if (limitations.length) return limitations.join(" ");
      const reason = String(event.approvalReason || "").trim();
      if ((event.tool !== "write_file" && event.tool !== "apply_edit") || !reason) return "";
      const describesDeletion = /(?:\b(?:delete|remove)\b.{0,48}\b(?:file|folder|directory|package)\b|\b(?:file|folder|directory|package)\b.{0,48}\b(?:delete|remove)\b)/i.test(reason);
      const describesMovement = /(?:\b(?:move|relocate)\b.{0,48}\b(?:file|folder|directory|package)\b|\b(?:file|folder|directory|package)\b.{0,48}\b(?:move|relocate)\b)/i.test(reason);
      return describesDeletion || describesMovement
        ? `Intent/effect mismatch: ${event.tool} can change file contents, but it cannot delete or move a file, folder, or package.`
        : "";
    }

    function getApprovalActionAnalysis(event = {}) {
      if (event.actionAnalysis && typeof event.actionAnalysis === "object") return event.actionAnalysis;
      const compare = event.compare && typeof event.compare === "object" ? event.compare : null;
      const changed = compare ? (compare.changed !== undefined ? compare.changed === true : String(compare.beforeContent || "") !== String(compare.afterContent || "")) : true;
      const operation = compare?.operation || (!changed ? "no-op" : (compare && !String(compare.afterContent || "") ? "clear" : "action"));
      const limitation = getApprovalIntentMismatch({ ...event, actionAnalysis: null });
      return {
        operation,
        operationLabel: operation === "no-op" ? "No change" : (operation === "clear" ? "Clear file" : "Agent action"),
        resourcePath: String(compare?.path || event.input || ""),
        taskGoal: String(event.approvalReason || "").trim(),
        actionDescription: "",
        outcomeDescription: operation === "no-op" ? "No filesystem change will occur because the current and proposed content are identical." : "",
        limitations: limitation ? [limitation] : [],
        lineImpact: compare ? (compare.lineImpact || countChangedLinesFromCompare(compare)) : null,
        canApprove: operation !== "no-op" && !limitation,
        blockingCode: limitation ? "APPROVAL_INTENT_TOOL_MISMATCH" : (operation === "no-op" ? "APPROVAL_ACTION_NO_CHANGE" : "")
      };
    }

    function normalizeApprovalDetailText(value, fallback = "Details") {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text || fallback;
    }

    function truncateApprovalPillText(value) {
      const text = normalizeApprovalDetailText(value);
      if (text.length <= APPROVAL_PILL_MAX_CHARS) return text;
      return `${text.slice(0, APPROVAL_PILL_MAX_CHARS - 3)}...`;
    }

    function createApprovalResponse(decision, instructions, event = {}, grantOption = null) {
      const normalizedDecision = decision === "approve" ? "approve" : (decision === "instruct" ? "instruct" : "reject");
      const text = String(instructions || "").trim();
      let label = normalizedDecision === "approve" ? "Approved" : "Rejected";
      if (event.approvalKind === "task-limit") label = normalizedDecision === "approve" ? "Continued" : "Stopped";
      if (normalizedDecision === "instruct") label = `Sent instructions: ${text}`;
      if (normalizedDecision === "approve" && grantOption?.label) label = grantOption.lifetime === "task" ? "Allowed for this task" : "Always allowed in this workspace";
      return {
        decision: normalizedDecision,
        instructions: text,
        label,
        grantOptionId: String(grantOption?.id || ""),
        grantLabel: String(grantOption?.label || ""),
        respondedAt: Date.now()
      };
    }

    function confirmApprovalGrant(event = {}, option = {}) {
      if (option.lifetime !== "workspace") return Promise.resolve(true);
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "ai-companion-approval-modal";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        const dialog = document.createElement("div");
        dialog.className = "ai-companion-approval-modal-box ai-companion-grant-confirmation";
        const header = document.createElement("div");
        header.className = "ai-companion-approval-modal-header";
        const title = document.createElement("h3");
        title.textContent = "Always allow this action?";
        header.appendChild(title);
        const body = document.createElement("div");
        body.className = "ai-companion-approval-modal-body";
        const summary = document.createElement("p");
        summary.textContent = option.confirmation || `${option.label} in this workspace.`;
        body.appendChild(summary);
        if (event.capability) {
          const capability = document.createElement("p");
          capability.textContent = `Capability: ${event.capability}`;
          body.appendChild(capability);
        }
        if (option.matcher?.value) {
          const resource = document.createElement("p");
          resource.textContent = `Resource: ${option.matcher.value}`;
          body.appendChild(resource);
        }
        const warning = document.createElement("p");
        warning.className = "ai-companion-grant-warning";
        warning.textContent = option.requiresBroadConfirmation
          ? "Any non-protected workspace file may be modified without another prompt. Delete and move remain separate. Protected files and paths outside the workspace remain excluded. Every automatic approval remains visible and audited."
          : "Future matching actions in this workspace will run without another approval prompt. Protected resources remain excluded and every automatic approval remains visible and audited.";
        body.appendChild(warning);
        const acknowledgementLabel = document.createElement("label");
        acknowledgementLabel.className = "ai-companion-grant-acknowledgement";
        const acknowledgement = document.createElement("input");
        acknowledgement.type = "checkbox";
        acknowledgementLabel.append(acknowledgement, document.createTextNode(" I understand this permission remains active until I revoke it."));
        body.appendChild(acknowledgementLabel);
        const actions = document.createElement("div");
        actions.className = "ai-companion-approval-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel";
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "ai-companion-approval-approve";
        confirmButton.textContent = "Always allow";
        confirmButton.disabled = true;
        acknowledgement.addEventListener("change", () => { confirmButton.disabled = !acknowledgement.checked; });
        actions.append(cancelButton, confirmButton);
        body.appendChild(actions);
        dialog.append(header, body);
        overlay.appendChild(dialog);
        const finish = (approved) => {
          document.removeEventListener("keydown", onKeyDown);
          overlay.remove();
          resolve(approved);
        };
        const onKeyDown = (keyboardEvent) => { if (keyboardEvent.key === "Escape") finish(false); };
        cancelButton.addEventListener("click", () => finish(false));
        confirmButton.addEventListener("click", () => finish(true));
        overlay.addEventListener("click", (clickEvent) => { if (clickEvent.target === overlay) finish(false); });
        document.addEventListener("keydown", onKeyDown);
        document.body.appendChild(overlay);
        acknowledgement.focus();
      });
    }

    function getApprovalFooter(row) {
      let footer = row.querySelector(".ai-companion-approval-footer");
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "ai-companion-approval-footer";
        row.appendChild(footer);
      }
      return footer;
    }

    function appendApprovalResponse(row, response, event = {}, actionLabel = "Agent action") {
      if (!row || !response?.label) return;
      row.classList.remove("pending");
      row.classList.toggle("approved", response.decision === "approve");
      row.classList.toggle("rejected", response.decision === "reject");
      row.classList.toggle("instructed", response.decision === "instruct");
      let responseElement = row.querySelector(".ai-companion-approval-response");
      if (!responseElement) {
        responseElement = document.createElement("button");
        responseElement.type = "button";
        responseElement.className = "ai-companion-approval-response";
        getApprovalFooter(row).appendChild(responseElement);
      }
      responseElement.textContent = response.label;
      responseElement.setAttribute("aria-label", `Show ${actionLabel} approval details`);
      responseElement.addEventListener("click", () => showApprovalDetailsModal(event, actionLabel), { once: true });
    }


    function getApprovalTimestamp(event = {}) {
      return event.response?.respondedAt || (event.autoApproved ? (event.completedAt || event.createdAt) : "");
    }

    function formatApprovalMarkdown(event = {}) {
      const actionLabel = getApprovalActionLabel(event);
      const lines = [`### Approval requested: ${actionLabel}`];
      const reason = getApprovalReasonDescription(event);
      const effect = getApprovalActionDescription(event);
      const impact = getApprovalImpactDescription(event);
      const warning = getApprovalIntentMismatch(event);
      const input = String(event.input || event.tool || "").trim();
      const summary = String(event.summary || "").trim();
      const preview = String(event.preview || "").trim();
      if (reason) lines.push("", "Why:", "", reason);
      if (effect) lines.push("", "Effect:", "", effect);
      if (impact) lines.push("", "Impact:", "", impact);
      if (warning) lines.push("", "Warning:", "", warning);
      if (input) lines.push("", "Input:", "", input);
      if (summary) lines.push("", "Summary:", "", summary);
      if (preview) lines.push("", "Details:", "", preview);
      if (event.response?.label) lines.push("", "Response:", "", event.response.label);
      return lines.join(" - ");
    }

    function attachApprovalCopyAction(row, event = {}) {
      attachCopyAction(row, () => formatApprovalMarkdown(event), "Copy approval as Markdown", { timestamp: () => getApprovalTimestamp(event) });
    }
    function showApprovalDetailsModal(event = {}, actionLabel = "Agent action") {
      const overlay = document.createElement("div");
      overlay.className = "ai-companion-approval-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      const dialog = document.createElement("div");
      dialog.className = "ai-companion-approval-modal-box";
      const header = document.createElement("div");
      header.className = "ai-companion-approval-modal-header";
      const title = document.createElement("h3");
      title.textContent = actionLabel;
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "ai-companion-approval-modal-close";
      closeButton.textContent = "Close";
      closeButton.setAttribute("aria-label", "Close approval details");
      header.append(title, closeButton);
      const body = document.createElement("div");
      body.className = "ai-companion-approval-modal-body";
      const addSection = (label, value) => {
        const text = String(value || "").trim();
        if (!text) return;
        const section = document.createElement("section");
        const heading = document.createElement("h4");
        heading.textContent = label;
        const content = document.createElement("pre");
        content.textContent = text;
        section.append(heading, content);
        body.appendChild(section);
      };
      const analysis = getApprovalActionAnalysis(event);
      addSection("Task goal", getApprovalReasonDescription(event));
      addSection("This action", getApprovalActionDescription(event));
      addSection("Outcome", analysis.outcomeDescription || getApprovalImpactDescription(event));
      addSection("Limitations", analysis.limitations?.join(" ") || getApprovalIntentMismatch(event));
      addSection("Resource", analysis.resourcePath || event.input || event.tool || "");
      addSection("Summary", event.summary || "");
      addSection("Details", event.preview || "");
      if (event.policyScope || event.policyPattern || event.policyRuleId || event.capability) addSection("Policy", [event.capability, event.policyScope, event.policyPattern, event.policyRuleId].filter(Boolean).join("\n"));
      dialog.append(header, body);
      overlay.appendChild(dialog);
      const close = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
      };
      const onKeyDown = (keyboardEvent) => {
        if (keyboardEvent.key === "Escape") close();
      };
      closeButton.addEventListener("click", close);
      overlay.addEventListener("click", (clickEvent) => {
        if (clickEvent.target === overlay) close();
      });
      document.addEventListener("keydown", onKeyDown);
      document.body.appendChild(overlay);
      closeButton.focus();
    }

    function attachApprovalGrantTooltip(trigger, option = {}) {
      const explanation = String(option.label || "Allow matching actions").trim();
      const resource = String(option.tooltipResource || "").trim();
      const tooltip = document.createElement("div");
      tooltip.className = "ai-companion-approval-grant-tooltip";
      tooltip.setAttribute("role", "tooltip");
      const description = document.createElement("div");
      description.className = "ai-companion-approval-grant-tooltip-description";
      description.textContent = explanation;
      tooltip.appendChild(description);
      if (resource) {
        const resourceRow = document.createElement("div");
        resourceRow.className = "ai-companion-approval-grant-tooltip-resource";
        const resourceLabel = document.createElement("strong");
        resourceLabel.textContent = "Requested file";
        const resourcePath = document.createElement("code");
        resourcePath.textContent = resource;
        resourceRow.append(resourceLabel, resourcePath);
        tooltip.appendChild(resourceRow);
      }
      trigger.setAttribute("aria-description", resource ? `${explanation} Requested file: ${resource}` : explanation);

      function positionTooltip() {
        const triggerRect = trigger.getBoundingClientRect?.();
        if (!triggerRect) return;
        const tooltipRect = tooltip.getBoundingClientRect?.();
        const width = tooltipRect?.width || 340;
        const height = tooltipRect?.height || 0;
        const margin = 8;
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || width;
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || height;
        const left = Math.min(Math.max(triggerRect.left, margin), Math.max(margin, viewportWidth - width - margin));
        let top = triggerRect.top - height - 6;
        if (!height || top < margin) top = Math.min(viewportHeight - height - margin, triggerRect.bottom + 6);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(margin, top)}px`;
      }

      function showTooltip() {
        if (!document.body) return;
        if (!tooltip.isConnected) document.body.appendChild(tooltip);
        positionTooltip();
        tooltip.classList.add("is-visible");
        window.addEventListener?.("resize", positionTooltip);
        window.addEventListener?.("scroll", positionTooltip, true);
      }

      function hideTooltip() {
        tooltip.classList.remove("is-visible");
        tooltip.remove?.();
        window.removeEventListener?.("resize", positionTooltip);
        window.removeEventListener?.("scroll", positionTooltip, true);
      }

      trigger.addEventListener("mouseenter", showTooltip);
      trigger.addEventListener("focus", showTooltip);
      trigger.addEventListener("mouseleave", hideTooltip);
      trigger.addEventListener("blur", hideTooltip);
    }

    function createApprovalCard(event = {}, options = {}) {
      const row = document.createElement("div");
      row.className = "ai-companion-approval pending";
      row.classList?.add?.("ai-companion-approval", "pending");
      // Let the activity renderer resolve inspector clicks to this exact card.
      if (event.approvalId) row.dataset.aiCompanionActivityId = String(event.approvalId);
      if (event.approvalKind === "task-limit") row.classList.add("task-limit");
      const actionLabel = getApprovalActionLabel(event);
      const actionAnalysis = getApprovalActionAnalysis(event);
      const actionDescription = getApprovalActionDescription(event);
      const approvalReason = getApprovalReasonDescription(event);
      const outcomeDescription = actionAnalysis.outcomeDescription || getApprovalImpactDescription(event);
      const limitations = actionAnalysis.limitations?.join(" ") || getApprovalIntentMismatch(event);
      const fullInput = normalizeApprovalDetailText(actionAnalysis.resourcePath || event.input || event.summary || event.tool || actionLabel);
      if (actionAnalysis.canApprove === false) row.classList.add("blocked");
      const header = document.createElement("div");
      header.className = "ai-companion-approval-header";
      const marker = document.createElement("i");
      marker.className = "bi bi-shield-exclamation ai-companion-approval-marker";
      marker.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div");
      copy.className = "ai-companion-approval-copy";
      const title = document.createElement("div");
      title.className = "ai-companion-approval-title";
      title.textContent = actionAnalysis.canApprove === false ? "Action cannot be approved" : ((event.response?.label || event.autoApproved) ? "Approval resolved" : "Approval required");
      const operation = document.createElement("span");
      operation.className = "ai-companion-approval-operation";
      operation.textContent = actionAnalysis.operationLabel || actionLabel;
      const description = document.createElement("div");
      description.className = "ai-companion-approval-action-description";
      description.textContent = `This action: ${actionDescription}`;
      const reason = document.createElement("div");
      reason.className = "ai-companion-approval-reason";
      reason.textContent = `Task goal: ${approvalReason}`;
      const outcome = document.createElement("div");
      outcome.className = "ai-companion-approval-impact";
      outcome.textContent = outcomeDescription ? `Outcome: ${outcomeDescription}` : "";
      const warning = document.createElement("div");
      warning.className = "ai-companion-approval-warning";
      warning.textContent = limitations ? `Limitations: ${limitations}` : "";
      const preview = document.createElement("div");
      preview.className = "ai-companion-approval-preview";
      preview.textContent = fullInput;
      copy.append(title, operation, reason, description);
      if (outcomeDescription) copy.appendChild(outcome);
      if (limitations) copy.appendChild(warning);
      copy.appendChild(preview);
      header.append(marker, copy);
      row.appendChild(header);
      if (event.autoApproved) {
        const scope = event.policyScope ? `${event.policyScope} policy` : "policy";
        appendApprovalResponse(row, { decision: "approve", label: `Auto-approved by ${scope}` }, event, actionLabel);
        return row;
      }
      if (event.response?.label) {
        appendApprovalResponse(row, event.response, event, actionLabel);
        return row;
      }
      if (actionAnalysis.canApprove === false) return row;
      if (options.interactive === false) return row;
      const allowInstructions = event.allowInstructions !== false;
      const instructionInput = document.createElement("textarea");
      instructionInput.className = "ai-companion-approval-instructions";
      instructionInput.rows = 2;
      instructionInput.placeholder = "Tell the agent what to do instead";
      instructionInput.setAttribute("aria-label", "Alternative instructions for this approval request");
      const actions = document.createElement("div");
      actions.className = "ai-companion-approval-actions";
      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "ai-companion-approval-review";
      reviewButton.textContent = "Review changes";
      reviewButton.setAttribute("aria-label", `Review ${actionLabel} approval details`);
      reviewButton.addEventListener("click", () => reviewApprovalChanges(event, actionLabel));
      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.className = "ai-companion-approval-approve";
      approveButton.textContent = event.approveLabel || "Approve";
      const rejectButton = document.createElement("button");
      rejectButton.type = "button";
      rejectButton.className = "ai-companion-approval-reject";
      rejectButton.textContent = event.rejectLabel || "Reject";
      const instructButton = document.createElement("button");
      instructButton.type = "button";
      instructButton.className = "ai-companion-approval-instruct";
      instructButton.textContent = "Send";
      const responseError = document.createElement("div");
      responseError.className = "ai-companion-approval-response-error";
      const respond = async (decision, grantOption = null) => {
        const instructions = decision === "instruct" && allowInstructions ? String(instructionInput.value || "").trim() : "";
        if (decision === "instruct" && !instructions) {
          instructionInput.focus();
          return;
        }
        responseError.textContent = "";
        for (const button of actions.querySelectorAll("button")) button.disabled = true;
        const response = createApprovalResponse(decision, instructions, event, grantOption);
        try {
          await options.onRespond?.(decision, instructions, response, grantOption?.id || "");
          instructionInput.remove();
          actions.remove();
          responseError.remove();
          appendApprovalResponse(row, response, event, actionLabel);
        } catch (error) {
          for (const button of actions.querySelectorAll("button")) button.disabled = false;
          responseError.textContent = error?.message || "The approval could not be saved. Please try again.";
        }
      };
      approveButton.addEventListener("click", () => { void respond("approve"); });
      rejectButton.addEventListener("click", () => { void respond("reject"); });
      instructButton.addEventListener("click", () => { void respond("instruct"); });
      actions.appendChild(reviewButton);
      const approveSplit = document.createElement("div");
      approveSplit.className = "ai-companion-approval-split";
      approveSplit.appendChild(approveButton);
      const grantOptions = Array.isArray(event.grantOptions) ? event.grantOptions : [];
      if (grantOptions.length) {
        const grantMenu = document.createElement("details");
        grantMenu.className = "ai-companion-approval-grant-menu";
        const grantToggle = document.createElement("summary");
        grantToggle.setAttribute("aria-label", "More approval choices");
        grantToggle.title = "More approval choices";
        grantToggle.textContent = "▾";
        const menu = document.createElement("div");
        menu.className = "ai-companion-approval-grant-options";
        for (const option of grantOptions) {
          const optionButton = document.createElement("button");
          optionButton.type = "button";
          if (option.requiresBroadConfirmation) optionButton.classList.add("is-broad");
          const optionLabel = document.createElement("span");
          optionLabel.className = "ai-companion-approval-grant-label";
          if (option.actionLabel && option.targetLabel) {
            const optionAction = document.createElement("strong");
            optionAction.className = "ai-companion-approval-grant-action";
            optionAction.textContent = option.actionLabel;
            const optionSeparator = document.createElement("span");
            optionSeparator.className = "ai-companion-approval-grant-separator";
            optionSeparator.textContent = "—";
            const optionTarget = document.createElement("span");
            optionTarget.className = "ai-companion-approval-grant-target";
            optionTarget.textContent = option.targetLabel;
            optionLabel.append(optionAction, optionSeparator, optionTarget);
          } else {
            optionLabel.textContent = option.label || "Allow matching actions";
          }
          optionButton.appendChild(optionLabel);
          optionButton.disabled = option.disabled === true;
          if (option.disabledReason) {
            const optionReason = document.createElement("small");
            optionReason.textContent = option.disabledReason;
            optionButton.appendChild(optionReason);
          }
          attachApprovalGrantTooltip(optionButton, option.disabledReason
            ? { ...option, label: `${option.label || "Allow matching actions"} ${option.disabledReason}` }
            : option);
          optionButton.addEventListener("click", async () => {
            if (option.disabled) return;
            grantMenu.open = false;
            if (!(await confirmApprovalGrant(event, option))) return;
            await respond("approve", option);
          });
          menu.appendChild(optionButton);
        }
        grantMenu.append(grantToggle, menu);
        approveSplit.appendChild(grantMenu);
      }
      actions.appendChild(approveSplit);
      actions.append(rejectButton);
      // Response-limit continuations offer "Always approve": continue now and stop asking by
      // disabling the per-response token cap (agentMaxResponseTokens = 0).
      if (event.allowAlwaysApprove === true && typeof options.onAlwaysApprove === "function") {
        const alwaysButton = document.createElement("button");
        alwaysButton.type = "button";
        alwaysButton.textContent = "Always approve";
        alwaysButton.title = "Continue and disable the per-response token cap so this approval is never asked again";
        alwaysButton.addEventListener("click", () => {
          options.onAlwaysApprove();
          void respond("approve");
        });
        actions.append(alwaysButton);
      }
      if (allowInstructions) {
        row.appendChild(instructionInput);
        actions.append(instructButton);
      }
      row.appendChild(responseError);
      getApprovalFooter(row).appendChild(actions);
      return row;
    }
    /**
     * Whether a saved approval event never received a user decision.
     * Auto-approved events and events with a recorded response are answered;
     * anything else means the task stopped while waiting on this approval.
     */
    function isUnansweredApprovalEvent(event = {}) {
      return event.autoApproved !== true && !event.response?.label;
    }

    /**
     * Render a restored approval that was never answered because the app closed.
     * The original approval channel died with the bridge process, so the card
     * keeps review available and offers to resume the task as a new agent run
     * that carries the saved progress and can request a live decision again.
     */
    function createInterruptedApprovalCard(entry, event, options = {}) {
      const row = createApprovalCard(event, { interactive: false });
      row.classList.add("interrupted");
      const actionLabel = getApprovalActionLabel(event);
      const actionAnalysis = getApprovalActionAnalysis(event);
      const interruption = document.createElement("div");
      interruption.className = "ai-companion-approval-action-description";
      interruption.textContent = actionAnalysis.canApprove === false
        ? "This saved action cannot be approved. Resume the task to re-evaluate the current workspace and choose a valid action."
        : "The app closed before this request was answered. Resume the task to approve, reject, or provide instructions.";
      row.querySelector(".ai-companion-approval-title")?.after(interruption);
      const actions = document.createElement("div");
      actions.className = "ai-companion-approval-actions";
      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "ai-companion-approval-review";
      reviewButton.textContent = "Review changes";
      reviewButton.setAttribute("aria-label", `Review ${actionLabel} approval details`);
      reviewButton.addEventListener("click", () => reviewApprovalChanges(event, actionLabel));
      actions.appendChild(reviewButton);
      if (options.showResume === false) {
        getApprovalFooter(row).appendChild(actions);
        return row;
      }
      const resumeButton = document.createElement("button");
      resumeButton.type = "button";
      resumeButton.className = "ai-companion-approval-approve";
      resumeButton.textContent = "Resume task";
      resumeButton.title = "Start a new agent run that continues this task from its saved progress";
      resumeButton.addEventListener("click", async () => {
        const taskId = String(entry.record?.id || "");
        if (isAgentRunning() || !taskId || resumingRunTaskIds.has(taskId) || !canResumeRun(entry.record)) return;
        resumingRunTaskIds.add(taskId);
        resumeButton.disabled = true;
        try {
        const prompt = String(entry.record.rootPrompt || entry.record.prompt || "").trim();
        entry.record.version = 6;
        entry.record.status = "interrupted";
        entry.record.updatedAt = Date.now();
        entry.isDirty = true;
        await saveAgentEntryImmediately(entry);
        actions.remove();
        row.classList.remove("pending");
        const title = row.querySelector(".ai-companion-approval-title");
        if (title) title.textContent = "Approval resumed";
        interruption.textContent = "The task was resumed. Use the new live approval request to approve, reject, or provide instructions.";
        await runCompanionPrompt({
          prompt,
          mode: normalizeCompanionMode(entry.record.mode),
          executionKind: "resume",
          executionGeneration: Math.max(1, Number(entry.record.executionGeneration) || 1),
          entry,
          persistedAttachments: entry.record.attachments || [],
          resumeRun: true
        });
        } finally {
          resumingRunTaskIds.delete(taskId);
        }
      });
      actions.appendChild(resumeButton);
      getApprovalFooter(row).appendChild(actions);
      return row;
    }

    function hasSavedEventAfter(events = [], index = -1) {
      return events.slice(index + 1).some((event) => !!event?.type);
    }

    function hasSavedTaskAfter(record = {}) {
      return agentTaskIndex.some((task) => task?.id !== record.id && compareAgentTaskIndexItems(record, task) < 0);
    }

    function canResumeSavedApproval(record, events, index) {
      const event = events[index];
      return canResumeRun(record) && isUnansweredApprovalEvent(event) && !hasSavedEventAfter(events, index) && !hasSavedTaskAfter(record);
    }

    function resetSyntheticActivityState() {
      nextSyntheticActivitySequence = 1;
      syntheticActivityIds = new Map();
    }

    function getSavedEventCompletedAt(entry, event = {}) {
      return event.completedAt || event.updatedAt || event.createdAt || entry.record?.updatedAt || entry.record?.createdAt || null;
    }

    function withSavedEventCompletedAt(entry, event) {
      const completedAt = getSavedEventCompletedAt(entry, event);
      if (!completedAt) return event;
      const normalized = event.completedAt === completedAt ? { ...event } : { ...event, completedAt };
      if (normalized.activity && normalized.activity.status !== "running" && !normalized.activity.completedAt) {
        normalized.activity = { ...normalized.activity, completedAt };
      }
      return normalized;
    }
    function withRestoredToolActivityStatus(entry, event) {
      if (event.type === "tool-error" || event.activity?.status !== "running" || !isWorkspaceRecordTerminal(entry?.record)) return event;
      const completedAt = getSavedEventCompletedAt(entry, event);
      return {
        ...event,
        activity: {
          ...event.activity,
          status: "completed",
          completedAt: event.activity.completedAt || completedAt,
          resultSummary: event.activity.resultSummary || event.summary || ""
        }
      };
    }

    function renderSavedAgentEvent(entry, event, options = {}) {
      if (event.type === "tool" || event.type === "tool-error") {
        const timestampedEvent = withSavedEventCompletedAt(entry, event);
        const displayEvent = withRestoredToolActivityStatus(entry, withSavedEventCompletedAt(entry, createSyntheticToolActivity(timestampedEvent)));
        if (displayEvent.activity) entry.renderer?.appendActivity?.(displayEvent);
        return;
      }
      if (event.type === "narration") {
        entry.renderer?.appendNarration?.(event);
        return;
      }
      if (event.type === "chat-response") {
        appendChatResponseElement(entry, event.content || "", event.isError === true, true, event.completedAt || entry.record.updatedAt || entry.record.createdAt);
        return;
      }
      if (event.type === "approval") {
        // An unanswered approval means the app closed mid-task: the pending approval
        // died with the bridge process, so offer to resume instead of dead buttons.
        if (isUnansweredApprovalEvent(event)) {
          const row = createInterruptedApprovalCard(entry, event, { showResume: options.canResumeApproval === true });
          entry.renderer?.appendExternalActivity?.(row);
          attachApprovalCopyAction(row, event);
          return;
        }
        const row = createApprovalCard(event, { interactive: false });
        entry.renderer?.appendExternalActivity?.(row);
        attachApprovalCopyAction(row, event);
        return;
      }
      if (event.type === "agent-summary") {
        const changes = getTaskChanges(entry.record);
        entry.renderer?.appendSummary?.({
          ...withSavedEventCompletedAt(entry, event),
          changedFiles: changes.files,
          attemptedChanges: changes.attempted,
          blockedChanges: changes.blocked
        });
        renderTaskChangesPanel(entry.record);
      }
    }

    function renderSavedAgentTask(record, prepend = false) {
      if (!record?.id || agentEntries.some((entry) => entry.record.id === record.id)) return null;
      const entry = createAgentTaskEntry(record.prompt || "", record);
      // A restored record still marked "running" was cut off by an app restart —
      // the task cannot actually be running anymore, so record the interruption.
      if (entry.record.status === "running") {
        entry.record.status = "interrupted";
        entry.isDirty = true;
        attachPromptActions(entry);
      }
      resetSyntheticActivityState();
      const events = record.events || [];
      const hasRestoredActivity = events.some((event) => event?.type === "tool" || event?.type === "tool-error" || event?.type === "approval" || event?.type === "agent-summary" || event?.type === "narration" || event?.type === "intent-contract" || event?.type === "steering" || event?.type === "clarification");
      events.forEach((event, index) => renderSavedAgentEvent(entry, event, { canResumeApproval: canResumeSavedApproval(entry.record, events, index) }));
      // Keep the timeline expanded when an interrupted approval offers a Resume
      // action; collapsing would bury the only way to continue the task.
      const hasPendingResume = entry.record.status === "interrupted"
        && events.some((event, index) => event?.type === "approval" && canResumeSavedApproval(entry.record, events, index));
      if (hasRestoredActivity && !hasPendingResume) entry.renderer?.collapseTimeline?.();
      if (prepend && entry.element.parentNode === toolLog) toolLog.prepend(entry.element);
      return entry;
    }

    function compareAgentTaskIndexItems(a, b) {
      const sequenceA = Number(a?.sequence || 0);
      const sequenceB = Number(b?.sequence || 0);
      if (sequenceA && sequenceB && sequenceA !== sequenceB) return sequenceA - sequenceB;
      return Number(a?.createdAt || 0) - Number(b?.createdAt || 0);
    }

    function updateNextAgentTaskSequence(tasks) {
      const lastSequence = (tasks || []).reduce((max, task) => Math.max(max, Number(task.sequence || 0)), 0);
      nextAgentTaskSequence = Math.max(nextAgentTaskSequence, lastSequence + 1);
    }

    function normalizeIndexPayload(payload) {
      const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
      const normalizedTasks = tasks.filter((task) => task?.id).map((task, index) => ({
        ...task,
        sequence: Number(task.sequence || index + 1) || index + 1,
        fileName: task.fileName || `${task.id}.json`
      })).sort(compareAgentTaskIndexItems);
      updateNextAgentTaskSequence(normalizedTasks);
      return normalizedTasks;
    }

    function getChatContextRestoreTotals(chat, tasks = []) {
      const tokenTotals = chat?.tokenTotals && typeof chat.tokenTotals === "object" ? chat.tokenTotals : {};
      const taskCount = Array.isArray(tasks) ? tasks.length : 0;
      const requestCount = Math.max(0, Number(tokenTotals.requestCount) || 0, taskCount);
      if (!requestCount && !tokenTotals.totalSent && !tokenTotals.totalReceived && !tokenTotals.lastContextTokens) return null;
      return { ...tokenTotals, requestCount };
    }

    function normalizeChatIndexPayload(payload, chatId) {
      const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      const createdAt = Number(source.createdAt || Date.now());
      return {
        version: 1,
        id: String(source.id || chatId || createChatId(createdAt)),
        createdAt,
        updatedAt: Number(source.updatedAt || createdAt),
        workspaceRoot: String(source.workspaceRoot || deps.getWorkspaceRoot?.() || ""),
        title: String(source.title || "Chat"),
        // Cumulative token accounting for the context indicator tooltip; preserved verbatim so
        // an index round-trip doesn't zero the chat's sent/received history.
        ...(source.tokenTotals && typeof source.tokenTotals === "object" ? { tokenTotals: source.tokenTotals } : {}),
        tasks: normalizeIndexPayload(source)
      };
    }

    function isDirectoryEntry(entry) {
      return entry?.type === "DIRECTORY" || entry?.type === "directory" || entry?.isDirectory === true;
    }

    function getDirectoryEntryName(entry) {
      const name = entry?.name || entry?.entry;
      if (name) return String(name);
      return String(entry?.path || entry?.fullPath || "").replace(/\\/g, "/").split("/").pop() || "";
    }

    function isChatDateDirectoryEntry(entry, pattern) {
      return isDirectoryEntry(entry) && pattern.test(getDirectoryEntryName(entry));
    }

    function joinStoragePath(...parts) {
      return parts.filter(Boolean).reduce((current, part) => current ? deps.joinPath(current, part) : part, "");
    }

    async function ensureProfileDirectory(path) {
      if (!path || !deps.Neutralino?.filesystem?.createDirectory) return;
      try {
        await deps.Neutralino.filesystem.createDirectory(path);
      } catch (_error) {
        // Existing folders are fine; later file operations surface real failures.
      }
    }

    async function getAgentChatsDirPath() {
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem || typeof deps.getProfileDataDirPath !== "function") return "";
      const profileDir = await deps.getProfileDataDirPath();
      if (!profileDir) {
        logChatHistoryDebug("profile path unavailable");
        return "";
      }
      const companionDir = deps.joinPath(profileDir, "companion");
      const chatsDir = deps.joinPath(companionDir, "chats");
      logChatHistoryDebug("resolved chats directory", { profileDir, chatsDir });
      await ensureProfileDirectory(companionDir);
      await ensureProfileDirectory(chatsDir);
      return chatsDir;
    }

    function getChatDateDirPath(chatsDir, chat = activeAgentChat) {
      if (!chatsDir) return "";
      const dateParts = getChatStorageDateParts(chat?.createdAt);
      return joinStoragePath(chatsDir, dateParts.year, dateParts.month, dateParts.day);
    }

    async function getAgentChatDirPath(chat = activeAgentChat) {
      const chatsDir = await getAgentChatsDirPath();
      const dateDir = getChatDateDirPath(chatsDir, chat);
      return dateDir && chat?.id ? deps.joinPath(dateDir, chat.id) : "";
    }

    async function ensureAgentChatDirPath(chat = activeAgentChat) {
      const chatsDir = await getAgentChatsDirPath();
      const dateDir = getChatDateDirPath(chatsDir, chat);
      if (!dateDir || !chat?.id) return "";
      const dateParts = getChatStorageDateParts(chat.createdAt);
      await ensureProfileDirectory(joinStoragePath(chatsDir, dateParts.year));
      await ensureProfileDirectory(joinStoragePath(chatsDir, dateParts.year, dateParts.month));
      await ensureProfileDirectory(dateDir);
      const chatDir = deps.joinPath(dateDir, chat.id);
      await ensureProfileDirectory(chatDir);
      return chatDir;
    }

    async function getLegacyAgentTasksDirPath() {
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem || typeof deps.getProfileDataDirPath !== "function") return "";
      const profileDir = await deps.getProfileDataDirPath();
      return profileDir ? deps.joinPath(profileDir, "companion", "agent", "tasks") : "";
    }

    async function getLegacyAgentTaskFilePath(id) {
      const tasksDir = await getLegacyAgentTasksDirPath();
      return tasksDir && id ? deps.joinPath(tasksDir, `${id}.json`) : "";
    }

    async function readLegacyAgentTaskIndex() {
      const tasksDir = await getLegacyAgentTasksDirPath();
      if (!tasksDir || !deps.Neutralino?.filesystem?.readFile) return [];
      try {
        const indexPath = deps.joinPath(tasksDir, CHAT_TASK_INDEX_FILE_NAME);
        return normalizeIndexPayload(JSON.parse(await deps.Neutralino.filesystem.readFile(indexPath) || "{}"))
          .map((task) => ({ ...task, storage: "legacy" }));
      } catch (_error) {
        return [];
      }
    }

    async function getAgentChatIndexPath(chat = activeAgentChat) {
      const chatDir = await getAgentChatDirPath(chat);
      return chatDir ? deps.joinPath(chatDir, CHAT_TASK_INDEX_FILE_NAME) : "";
    }

    function sanitizeAttachmentFileName(name, fallbackName = "pasted-image.png") {
      const clean = String(name || "").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/^\.+$/, "");
      return clean || fallbackName;
    }

    function createUniqueAttachmentFileName(name, usedNames) {
      const clean = sanitizeAttachmentFileName(name);
      if (!usedNames.has(clean.toLowerCase())) {
        usedNames.add(clean.toLowerCase());
        return clean;
      }
      const dotIndex = clean.lastIndexOf(".");
      const base = dotIndex > 0 ? clean.slice(0, dotIndex) : clean;
      const extension = dotIndex > 0 ? clean.slice(dotIndex) : "";
      let index = 2;
      while (usedNames.has(`${base}-${index}${extension}`.toLowerCase())) index += 1;
      const uniqueName = `${base}-${index}${extension}`;
      usedNames.add(uniqueName.toLowerCase());
      return uniqueName;
    }

    async function getAgentTaskAttachmentDirPath(recordOrId) {
      const taskId = typeof recordOrId === "object" && recordOrId ? recordOrId.id : String(recordOrId || "");
      const chatDir = await ensureAgentChatDirPath();
      if (!chatDir || !taskId) return "";
      const attachmentsDir = deps.joinPath(chatDir, "attachments");
      const taskDir = deps.joinPath(attachmentsDir, taskId);
      await ensureProfileDirectory(attachmentsDir);
      await ensureProfileDirectory(taskDir);
      return taskDir;
    }

    async function getAgentTaskFilePath(recordOrId) {
      const chatDir = await getAgentChatDirPath();
      const fileName = typeof recordOrId === "object" && recordOrId
        ? (recordOrId.fileName || `${recordOrId.id}.json`)
        : `${recordOrId}.json`;
      return chatDir && fileName ? deps.joinPath(chatDir, fileName) : "";
    }

    async function persistPastedImageAttachments(entry, attachments = [], compactReferences = []) {
      if (!entry?.record?.id || !deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem) return compactReferences;
      const taskDir = await getAgentTaskAttachmentDirPath(entry.record);
      if (!taskDir) return compactReferences;
      const usedNames = new Set();
      const references = normalizeAttachmentReferences(compactReferences);
      let changed = false;
      for (let index = 0; index < attachments.length; index += 1) {
        const attachment = attachments[index];
        if (!attachment || attachment.path) continue;
        try {
          const kind = getAttachmentKind(attachment);
          const reference = normalizeAttachmentReferences([attachment])[0];
          if (!reference) continue;
          if (kind === "image" && attachment.dataUrl && deps.Neutralino.filesystem.writeBinaryFile) {
            const bytes = dataUrlToBytes(attachment.dataUrl);
            const fileName = createUniqueAttachmentFileName(attachment.name || `pasted-image-${index + 1}.png`, usedNames);
            const filePath = deps.joinPath(taskDir, fileName);
            await deps.Neutralino.filesystem.writeBinaryFile(filePath, bytes);
            references[index] = {
              ...reference,
              name: fileName,
              path: filePath,
              kind: "image",
              type: attachment.type || "image/png",
              size: bytes.byteLength || Number(attachment.size || 0) || 0,
              lastModified: Date.now()
            };
            changed = true;
          } else if (kind !== "image" && Object.prototype.hasOwnProperty.call(attachment, "content") && deps.Neutralino.filesystem.writeFile) {
            const content = String(attachment.content || "");
            const fileName = createUniqueAttachmentFileName(attachment.name || `attached-file-${index + 1}.txt`, usedNames);
            const filePath = deps.joinPath(taskDir, fileName);
            await deps.Neutralino.filesystem.writeFile(filePath, content);
            references[index] = {
              ...reference,
              name: fileName,
              path: filePath,
              kind: "text",
              size: content.length,
              lastModified: Date.now()
            };
            changed = true;
          }
        } catch (_error) {
          // If persistence fails, keep the existing compact non-openable reference.
        }
      }
      return changed ? references : compactReferences;
    }
    function compareChatIndexesNewestFirst(a, b) {
      const updatedA = Number(a?.updatedAt || a?.createdAt || 0);
      const updatedB = Number(b?.updatedAt || b?.createdAt || 0);
      if (updatedA !== updatedB) return updatedB - updatedA;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    }

    function stripChatDisplayPrefix(text) {
      return String(text || "").replace(/^This Chat\s*[-:]\s*/i, "");
    }

    function clipChatDisplayName(text) {
      const singleLine = stripChatDisplayPrefix(text).replace(/\s+/g, " ").trim();
      if (!singleLine) return "Chat";
      return singleLine.length > 48 ? `${singleLine.slice(0, 45)}...` : singleLine;
    }

    function formatChatDisplayDate(value, mode = "chat") {
      const date = new Date(Number(value) || Date.now());
      const pad = (number) => String(number).padStart(2, "0");
      const normalizedMode = normalizeCompanionMode(mode);
      const chatLabel = normalizedMode === "chat" ? "Chat" : `Chat (${normalizedMode})`;
      return `${chatLabel} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatChatUpdatedTooltip(chat) {
      const date = new Date(Number(chat?.updatedAt || chat?.createdAt) || Date.now());
      const pad = (number) => String(number).padStart(2, "0");
      return `Last updated: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function getChatDisplayName(chat, fallbackMode = "chat") {
      const title = String(chat?.title || "").trim();
      if (title && title !== "Chat") return clipChatDisplayName(title);
      const tasks = Array.isArray(chat?.tasks) ? chat.tasks : [];
      for (const task of [...tasks].reverse()) {
        const taskTitle = task?.title || task?.prompt;
        if (String(taskTitle || "").trim()) return clipChatDisplayName(taskTitle);
      }
      return formatChatDisplayDate(chat?.updatedAt || chat?.createdAt, fallbackMode);
    }

    async function findChatDirectoryById(chatId) {
      const id = String(chatId || "");
      if (!id) return "";
      const chatsDir = await getAgentChatsDirPath();
      if (!chatsDir) return "";
      const chatEntries = await readDateNestedChatEntries(chatsDir);
      return chatEntries.find((entry) => entry.id === id)?.path || "";
    }

    async function readChatIndexById(chatId, chatDir = "") {
      const id = String(chatId || "");
      if (!id) return null;
      const sequenceBefore = nextAgentTaskSequence;
      try {
        if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.readFile) {
          const payload = JSON.parse(localStorage.getItem(AGENT_CHATS_STORAGE_KEY) || localStorage.getItem(AGENT_TASKS_STORAGE_KEY) || "{}");
          if (String(payload?.id || "") !== id) return null;
          const chatIndex = normalizeChatIndexPayload(payload, id);
          return chatIndex.tasks.length ? chatIndex : null;
        }
        const resolvedChatDir = chatDir || await findChatDirectoryById(id);
        if (!resolvedChatDir) return null;
        const indexPath = deps.joinPath(resolvedChatDir, CHAT_TASK_INDEX_FILE_NAME);
        const chatIndex = normalizeChatIndexPayload(JSON.parse(await deps.Neutralino.filesystem.readFile(indexPath) || "{}"), id);
        logChatHistoryDebug("read chat index", { chatId: id, indexPath, taskCount: chatIndex.tasks.length });
        return chatIndex.tasks.length ? chatIndex : null;
      } catch (error) {
        logChatHistoryDebug("failed to read chat index", { chatId: id, message: error?.message || String(error) });
        return null;
      } finally {
        nextAgentTaskSequence = sequenceBefore;
      }
    }

    async function readStorageDirectoryEntries(directory) {
      if (!directory || !deps.Neutralino?.filesystem?.readDirectory) return [];
      try {
        return await deps.Neutralino.filesystem.readDirectory(directory) || [];
      } catch (error) {
        logChatHistoryDebug("failed to read storage directory", { directory, message: error?.message || String(error) });
        return [];
      }
    }

    async function readDateNestedChatEntries(chatsDir) {
      const chatEntries = [];
      const yearEntries = (await readStorageDirectoryEntries(chatsDir))
        .filter((entry) => isChatDateDirectoryEntry(entry, /^\d{4}$/))
        .sort((a, b) => getDirectoryEntryName(b).localeCompare(getDirectoryEntryName(a)));
      for (const yearEntry of yearEntries) {
        const yearDir = joinStoragePath(chatsDir, getDirectoryEntryName(yearEntry));
        const monthEntries = (await readStorageDirectoryEntries(yearDir))
          .filter((entry) => isChatDateDirectoryEntry(entry, /^\d{2}$/))
          .sort((a, b) => getDirectoryEntryName(b).localeCompare(getDirectoryEntryName(a)));
        for (const monthEntry of monthEntries) {
          const monthDir = joinStoragePath(yearDir, getDirectoryEntryName(monthEntry));
          const dayEntries = (await readStorageDirectoryEntries(monthDir))
            .filter((entry) => isChatDateDirectoryEntry(entry, /^\d{2}$/))
            .sort((a, b) => getDirectoryEntryName(b).localeCompare(getDirectoryEntryName(a)));
          for (const dayEntry of dayEntries) {
            const dayDir = joinStoragePath(monthDir, getDirectoryEntryName(dayEntry));
            const chats = (await readStorageDirectoryEntries(dayDir))
              .filter((entry) => isDirectoryEntry(entry) && /^chat_/.test(getDirectoryEntryName(entry)))
              .sort((a, b) => getDirectoryEntryName(b).localeCompare(getDirectoryEntryName(a)));
            for (const chat of chats) {
              const id = getDirectoryEntryName(chat);
              chatEntries.push({ id, path: joinStoragePath(dayDir, id) });
            }
          }
        }
      }
      return chatEntries;
    }

    async function readSavedChatIndexes(limit = CHAT_HISTORY_SELECT_LIMIT) {
      logChatHistoryDebug("refresh started", { limit, neutralinoRuntime: deps.isNeutralinoRuntime?.() === true });
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.readDirectory) {
        try {
          const payload = JSON.parse(localStorage.getItem(AGENT_CHATS_STORAGE_KEY) || localStorage.getItem(AGENT_TASKS_STORAGE_KEY) || "{}");
          const id = String(payload?.id || "");
          if (!id) return [];
          const chatIndex = await readChatIndexById(id);
          logChatHistoryDebug("browser fallback completed", { chatId: id, found: !!chatIndex });
          return chatIndex ? [chatIndex] : [];
        } catch (error) {
          logChatHistoryDebug("browser fallback failed", { message: error?.message || String(error) });
          return [];
        }
      }
      const chatsDir = await getAgentChatsDirPath();
      if (!chatsDir) {
        logChatHistoryDebug("refresh stopped without chats directory");
        return [];
      }
      try {
        const chatEntries = await readDateNestedChatEntries(chatsDir);
        const chats = [];
        logChatHistoryDebug("chat folder candidates", { count: chatEntries.length, names: chatEntries.map((entry) => entry.id).slice(0, 30) });
        for (const entry of chatEntries) {
          const chatIndex = await readChatIndexById(entry.id, entry.path);
          if (chatIndex) chats.push(chatIndex);
        }
        const result = chats.sort(compareChatIndexesNewestFirst).slice(0, limit);
        logChatHistoryDebug("refresh completed", { acceptedCount: result.length, chatIds: result.map((chat) => chat.id) });
        return result;
      } catch (error) {
        logChatHistoryDebug("refresh failed", { chatsDir, message: error?.message || String(error) });
        return [];
      }
    }

    async function readLatestChatIndex() {
      const chats = await readSavedChatIndexes(1);
      return chats[0] || null;
    }

    async function readAgentTaskIndex() {
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.readFile) {
        try {
          return normalizeIndexPayload(JSON.parse(localStorage.getItem(AGENT_TASKS_STORAGE_KEY) || "{}"));
        } catch (_error) {
          return [];
        }
      }
      const chatIndex = activeAgentChat?.id ? null : await readLatestChatIndex();
      if (chatIndex) {
        activeAgentChat = { ...chatIndex };
        delete activeAgentChat.tasks;
        updateNextAgentTaskSequence(chatIndex.tasks);
        return chatIndex.tasks;
      }
      if (!activeAgentChat?.id) {
        const legacyTasks = await readLegacyAgentTaskIndex();
        if (legacyTasks.length) {
          ensureActiveAgentChat();
          return legacyTasks;
        }
        return [];
      }
      const indexPath = await getAgentChatIndexPath();
      if (!indexPath) return [];
      try {
        const chatPayload = normalizeChatIndexPayload(JSON.parse(await deps.Neutralino.filesystem.readFile(indexPath) || "{}"), activeAgentChat.id);
        activeAgentChat = { ...chatPayload };
        delete activeAgentChat.tasks;
        updateNextAgentTaskSequence(chatPayload.tasks);
        return chatPayload.tasks;
      } catch (_error) {
        return [];
      }
    }

    async function writeAgentTaskIndex() {
      const chat = ensureActiveAgentChat();
      const payload = {
        ...chat,
        version: 1,
        updatedAt: Date.now(),
        taskCount: agentTaskIndex.length,
        tasks: agentTaskIndex
      };
      activeAgentChat = { ...payload };
      delete activeAgentChat.tasks;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.writeFile) {
        localStorage.setItem(AGENT_CHATS_STORAGE_KEY, JSON.stringify(payload));
        localStorage.setItem(AGENT_TASKS_STORAGE_KEY, JSON.stringify(payload));
        return;
      }
      const chatDir = await ensureAgentChatDirPath();
      const indexPath = chatDir ? deps.joinPath(chatDir, CHAT_TASK_INDEX_FILE_NAME) : "";
      if (indexPath) await deps.Neutralino.filesystem.writeFile(indexPath, JSON.stringify(payload, null, 2));
    }

    function getChatRenameInitialTitle(chat) {
      const title = String(chat?.title || "").trim();
      return title && title !== "Chat" ? title : getChatDisplayName(chat);
    }

    function closeChatActionMenu() {
      if (activeChatActionMenu) {
        activeChatActionMenu.hidden = true;
        activeChatActionMenu.style.top = "";
        activeChatActionMenu.style.left = "";
      }
      if (activeChatActionToggle) activeChatActionToggle.setAttribute("aria-expanded", "false");
      activeChatActionMenu = null;
      activeChatActionToggle = null;
    }

    function removeChatActionMenus() {
      document.querySelectorAll?.('[data-ai-companion-chat-action-menu="true"]').forEach((menu) => menu.remove?.());
    }

    function positionChatActionMenu(toggle, menu, point = null) {
      const toggleRect = toggle.getBoundingClientRect?.();
      if (!toggleRect && !point) return;
      const menuWidth = menu.offsetWidth || 150;
      const menuHeight = menu.offsetHeight || 0;
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
      const anchorX = Number.isFinite(Number(point?.x)) ? Number(point.x) : toggleRect.right;
      const anchorY = Number.isFinite(Number(point?.y)) ? Number(point.y) : toggleRect.bottom + 2;
      const left = Math.max(8, Math.min(anchorX - (point ? 0 : menuWidth), viewportWidth - menuWidth - 8));
      const top = menuHeight && anchorY + menuHeight > viewportHeight - 8
        ? Math.max(8, anchorY - menuHeight)
        : anchorY;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function setChatActionMenuOpen(toggle, menu, open, point = null) {
      if (!toggle || !menu) return;
      if (open && activeChatActionMenu && activeChatActionMenu !== menu) closeChatActionMenu();
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) positionChatActionMenu(toggle, menu, point);
      else {
        menu.style.top = "";
        menu.style.left = "";
      }
      activeChatActionMenu = open ? menu : null;
      activeChatActionToggle = open ? toggle : null;
    }
    function resetDeletedActiveChat() {
      agentEntries = [];
      agentTaskIndex = [];
      activeAgentChat = null;
      nextAgentTaskSequence = 1;
      resetSyntheticActivityState();
      activeAgentEntry = null;
      activeActivityRenderer = null;
      activeRunMode = null;
      streamingChatResponse = null;
      chatResponseRecorded = false;
      latestRequestContextFiles = [];
      clearToolLog();
      mainPromptComposer?.clear?.();
      resizeAgentInput();
      contextIndicator?.reset();
      stopTimer();
      updateAgentRunButton();
      ensureActiveAgentChat();
      setStatus("Ready");
    }

    async function writeChatIndexTitle(chat, title) {
      const chatId = String(chat?.id || "");
      const nextTitle = String(title || "").trim();
      if (!chatId || !nextTitle) return false;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.writeFile) {
        const payload = JSON.parse(localStorage.getItem(AGENT_CHATS_STORAGE_KEY) || localStorage.getItem(AGENT_TASKS_STORAGE_KEY) || "{}");
        if (String(payload?.id || "") !== chatId) return false;
        const updatedPayload = { ...payload, title: nextTitle };
        localStorage.setItem(AGENT_CHATS_STORAGE_KEY, JSON.stringify(updatedPayload));
        localStorage.setItem(AGENT_TASKS_STORAGE_KEY, JSON.stringify(updatedPayload));
        if (activeAgentChat?.id === chatId) activeAgentChat = { ...activeAgentChat, title: nextTitle };
        return true;
      }
      const indexPath = await getAgentChatIndexPath(chat);
      if (!indexPath) return false;
      const payload = JSON.parse(await deps.Neutralino.filesystem.readFile(indexPath) || "{}");
      const updatedPayload = { ...payload, title: nextTitle };
      await deps.Neutralino.filesystem.writeFile(indexPath, JSON.stringify(updatedPayload, null, 2));
      if (activeAgentChat?.id === chatId) activeAgentChat = { ...activeAgentChat, title: nextTitle };
      return true;
    }

    function promptForChatRename(chat) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "reset-modal-overlay ai-companion-chat-rename-modal";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "ai-companion-chat-rename-title");
        overlay.style.display = "flex";

        const dialog = document.createElement("div");
        dialog.className = "reset-modal-box ai-companion-chat-rename-box";
        const title = document.createElement("p");
        title.id = "ai-companion-chat-rename-title";
        title.className = "reset-modal-message";
        title.textContent = "Rename Chat";
        const label = document.createElement("label");
        label.className = "ai-companion-chat-rename-label";
        label.setAttribute("for", "ai-companion-chat-rename-input");
        label.textContent = "Chat name";
        const input = document.createElement("input");
        input.id = "ai-companion-chat-rename-input";
        input.className = "rename-modal-input";
        input.type = "text";
        input.value = getChatRenameInitialTitle(chat);
        input.autocomplete = "off";
        const actions = document.createElement("div");
        actions.className = "reset-modal-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "reset-modal-btn reset-modal-cancel";
        cancelButton.textContent = "Cancel";
        const renameButton = document.createElement("button");
        renameButton.type = "button";
        renameButton.className = "reset-modal-btn";
        renameButton.textContent = "Rename";
        actions.append(cancelButton, renameButton);
        dialog.append(title, label, input, actions);
        overlay.appendChild(dialog);

        const close = (value) => {
          document.removeEventListener("keydown", onKeyDown);
          overlay.remove();
          resolve(value);
        };
        const submit = () => {
          const nextTitle = input.value.trim();
          if (!nextTitle) {
            input.focus();
            return;
          }
          close(nextTitle);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") close("");
          if (event.key === "Enter") {
            event.preventDefault?.();
            submit();
          }
        };
        cancelButton.addEventListener("click", () => close(""));
        renameButton.addEventListener("click", submit);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) close("");
        });
        document.addEventListener("keydown", onKeyDown);
        document.body.appendChild(overlay);
        input.focus();
        input.select?.();
      });
    }

    async function renameSavedChat(chat) {
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop current request before managing chats");
        return;
      }
      closeChatActionMenu();
      const nextTitle = await promptForChatRename(chat);
      if (!nextTitle) return;
      try {
        const renamed = await writeChatIndexTitle(chat, nextTitle);
        if (!renamed) {
          notifyAiCompanionError("Unable to rename chat");
          return;
        }
        await refreshChatSelectOptions();
        setStatus("Chat renamed");
      } catch (error) {
        console.warn("Failed to rename AI Companion chat:", error);
        notifyAiCompanionError("Unable to rename chat");
      }
    }

    async function confirmDeleteSavedChat(chat) {
      const message = `Delete "${getChatDisplayName(chat)}"?\n\nThis operation cannot be undone. You will lose all text, prompts, attached files, and pasted images included in this chat.`;
      if (typeof deps.confirm === "function") {
        return deps.confirm(message, { title: "Delete Chat", confirmLabel: "Delete Chat", confirmVariant: "danger" });
      }
      if (app?.services?.confirm) {
        return app.services.confirm({ title: "Delete Chat", message, confirmLabel: "Delete Chat", confirmVariant: "danger" });
      }
      return window.confirm(message);
    }

    async function deleteSavedChatStorage(chat) {
      const chatId = String(chat?.id || "");
      if (!chatId) return false;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.remove) {
        const payload = JSON.parse(localStorage.getItem(AGENT_CHATS_STORAGE_KEY) || localStorage.getItem(AGENT_TASKS_STORAGE_KEY) || "{}");
        if (String(payload?.id || "") !== chatId) return false;
        localStorage.removeItem(AGENT_CHATS_STORAGE_KEY);
        localStorage.removeItem(AGENT_TASKS_STORAGE_KEY);
        return true;
      }
      const chatDir = await getAgentChatDirPath(chat);
      if (!chatDir) return false;
      await deps.Neutralino.filesystem.remove(chatDir);
      return true;
    }

    async function deleteSavedChat(chat) {
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop current request before managing chats");
        return;
      }
      closeChatActionMenu();
      const confirmed = await confirmDeleteSavedChat(chat);
      if (!confirmed) return;
      try {
        const wasActive = chat?.id && chat.id === activeAgentChat?.id;
        const deleted = await deleteSavedChatStorage(chat);
        if (!deleted) {
          notifyAiCompanionError("Unable to delete chat");
          return;
        }
        if (wasActive) resetDeletedActiveChat();
        await refreshChatSelectOptions();
        setStatus("Chat deleted");
      } catch (error) {
        console.warn("Failed to delete AI Companion chat:", error);
        notifyAiCompanionError("Unable to delete chat");
      }
    }

    async function showSavedChatFolder(chat) {
      closeChatActionMenu();
      try {
        const chatDir = await getAgentChatDirPath(chat);
        if (!chatDir || typeof deps.openPathInExplorer !== "function") {
          notifyAiCompanionError("Unable to open chat folder");
          return;
        }
        await deps.openPathInExplorer(chatDir);
      } catch (error) {
        console.warn("Failed to open AI Companion chat folder:", error);
        notifyAiCompanionError("Unable to open chat folder");
      }
    }
    async function saveAgentEntry(entry) {
      if (!entry?.record?.id || (!String(entry.record.prompt || "").trim() && !normalizeAttachmentReferences(entry.record.attachments).length)) return;
      if (!entry.isDirty) return;
      ensureActiveAgentChat();
      const record = {
        ...entry.record,
        chatId: activeAgentChat.id,
        fileName: entry.record.fileName || `${entry.record.id}.json`,
        updatedAt: Date.now()
      };
      entry.record = record;
      const item = {
        id: record.id,
        fileName: record.fileName,
        sequence: record.sequence,
        title: record.title || getTaskTitle(record.prompt, record.attachments),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status || "completed",
        attachments: normalizeAttachmentReferences(record.attachments),
        ...(record.mode ? { mode: record.mode } : {}),
        ...(record.plan ? { plan: { id: record.plan.id, title: record.plan.title || "", path: record.plan.path || "", status: record.plan.status, milestones: record.plan.milestones || [], updatedAt: record.plan.updatedAt } } : {})
      };
      agentTaskIndex = [...agentTaskIndex.filter((task) => task.id !== record.id), item]
        .sort(compareAgentTaskIndexItems)
        .slice(-500);
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.writeFile) {
        localStorage.setItem(`${AGENT_TASKS_STORAGE_KEY}:${record.id}`, JSON.stringify(record));
        await writeAgentTaskIndex();
        entry.isDirty = false;
        return;
      }
      await ensureAgentChatDirPath();
      const filePath = await getAgentTaskFilePath(record);
      if (filePath) await deps.Neutralino.filesystem.writeFile(filePath, JSON.stringify(record, null, 2));
      await writeAgentTaskIndex();
      entry.isDirty = false;
    }

    async function saveVisibleAgentEntries() {
      if (agentSaveTimer) {
        window.clearTimeout(agentSaveTimer);
        agentSaveTimer = null;
      }
      for (const entry of agentEntries) await saveAgentEntry(entry);
    }

    async function readAgentTaskRecord(itemOrId) {
      const id = typeof itemOrId === "object" ? itemOrId?.id : itemOrId;
      if (!id) return null;
      let record = null;
      if (!deps.isNeutralinoRuntime?.() || !deps.Neutralino?.filesystem?.readFile) {
        try {
          record = JSON.parse(localStorage.getItem(`${AGENT_TASKS_STORAGE_KEY}:${id}`) || "null");
        } catch (_error) {
          return null;
        }
      } else {
        const filePath = itemOrId?.storage === "legacy"
          ? await getLegacyAgentTaskFilePath(id)
          : await getAgentTaskFilePath(typeof itemOrId === "object" ? itemOrId : id);
        if (!filePath) return null;
        try {
          record = JSON.parse(await deps.Neutralino.filesystem.readFile(filePath) || "null");
        } catch (_error) {
          return null;
        }
      }
      if (!record) return null;
      const originalVersion = Number(record.version) || 1;
      record = migrateTaskRecord(record, itemOrId?.storage === "legacy");
      if (originalVersion < 6 || !["running", "interrupted"].includes(record.status)) return record;
      try {
        const mode = normalizeCompanionMode(record.mode);
        record.recoveryInspection = await deps.bridge.runRecoveryInspect?.({
          settings: getCurrentSettings(),
          workspaceRoot: record.workspaceRoot || deps.getWorkspaceRoot?.() || "",
          action: mode,
          chatId: record.chatId || "",
          taskId: record.id || "",
          runId: record.runId || record.id || ""
        });
        if (record.recoveryInspection?.classification === "recoverable") record.status = "interrupted";
        else if (record.recoveryInspection?.classification === "completed") record.status = "completed";
        else record.status = "historical";
      } catch (error) {
        record.status = "historical";
        record.recoveryInspection = { classification: "unavailable", canResume: false, notices: [error?.message || String(error)] };
      }
      return record;
    }

    function truncateConversationHistoryContent(value) {
      const text = String(value || "").trim();
      return text.length > CONVERSATION_HISTORY_MESSAGE_MAX_CHARS
        ? `${text.slice(0, CONVERSATION_HISTORY_MESSAGE_MAX_CHARS)}\n...[truncated]`
        : text;
    }

    function getRecordFinalResponse(record) {
      const events = Array.isArray(record?.events) ? record.events : [];
      for (const event of [...events].reverse()) {
        if (event?.type === "chat-response" && event.isError !== true) {
          return truncateConversationHistoryContent(event.content);
        }
        if (event?.type === "agent-summary") {
          return truncateConversationHistoryContent(event.finalResponse || event.outcome);
        }
      }
      return "";
    }

    function getVisibleAgentTaskRecord(id) {
      return agentEntries.find((entry) => entry.record?.id === id)?.record || null;
    }

    /**
     * Whether a saved task was cut off by an app restart. "interrupted" is set on
     * restore; "running" covers records read straight from disk before any restore
     * pass has normalized them (a genuinely running task is never in a history build).
     */
    function isInterruptedTaskRecord(record) {
      return record?.status === "interrupted" || record?.status === "running";
    }

    /**
     * Summarize an interrupted task's recorded activity so a follow-up run knows
     * what already happened. Built from the saved tool events, partial responses,
     * and the approval the task was blocked on when the app closed.
     */
    function getRecordProgressSummary(record) {
      const events = Array.isArray(record?.events) ? record.events : [];
      const lines = [];
      for (const event of events) {
        if (event?.type === "tool" || event?.type === "tool-error") {
          const label = event.activity?.title || event.summary || event.tool || "Tool activity";
          const detail = event.activity?.primaryText || "";
          lines.push(`- ${label}${detail ? `: ${detail}` : ""}${event.type === "tool-error" ? " (failed)" : ""}`);
        } else if (event?.type === "chat-response" && event.isError !== true && event.content) {
          lines.push(`- Partial response: ${String(event.content).slice(0, 200)}`);
        } else if (event?.type === "approval" && isUnansweredApprovalEvent(event)) {
          lines.push(`- Stopped while waiting for approval: ${event.summary || event.tool || "approval request"}`);
        }
      }
      // Keep only the most recent activity so the summary stays within history limits.
      const recentLines = lines.slice(-20);
      // Frame the record as closed. Wording that ends on "stopped while waiting"
      // reads to the model like an unfinished turn it should complete, which made
      // follow-up prompts get answered as continuations of the old task.
      return [
        "[This task was interrupted by an app restart and is now closed. Do not resume or continue it unless the user explicitly asks.]",
        recentLines.length ? "Progress recorded before the interruption, for reference only:" : "It stopped before any progress was recorded.",
        ...recentLines,
        "[End of closed task record.]"
      ].join("\n");
    }

    function createConversationHistoryMessages(record) {
      const prompt = truncateConversationHistoryContent(record?.prompt);
      if (!prompt) return [];
      // Interrupted tasks used to be dropped entirely, which left follow-up prompts
      // with no memory of the cut-off work; contribute their progress instead.
      if (isInterruptedTaskRecord(record)) {
        return [
          { role: "user", content: prompt },
          { role: "assistant", content: truncateConversationHistoryContent(getRecordProgressSummary(record)) }
        ];
      }
      const status = String(record?.status || "");
      const canUsePlan = isPlanRecord(record) && ["planned", "implemented"].includes(status);
      if (status && status !== "completed" && !canUsePlan) return [];
      const response = getRecordFinalResponse(record);
      return response
        ? [{ role: "user", content: prompt }, { role: "assistant", content: response }]
        : [];
    }

    /**
     * Drop older task records whose prompt is repeated by a later record.
     *
     * Retried or interrupted runs of the same question would otherwise inject the
     * same user turn several times, biasing the model toward resuming the old task
     * instead of answering the new prompt. Only the most recent record for each
     * distinct prompt survives; relative order is preserved.
     */
    function dedupeConversationHistoryRecords(records) {
      const seenPrompts = new Set();
      const kept = [];
      for (let index = records.length - 1; index >= 0; index--) {
        const record = records[index];
        const promptKey = String(record?.prompt || "").trim();
        if (promptKey && seenPrompts.has(promptKey)) continue;
        if (promptKey) seenPrompts.add(promptKey);
        kept.unshift(record);
      }
      return kept;
    }

    async function buildConversationHistory(excludedEntry = null) {
      const excludedId = excludedEntry?.record?.id || "";
      const index = agentTaskIndex.length ? agentTaskIndex : await readAgentTaskIndex();
      const items = [...index].sort(compareAgentTaskIndexItems).slice(-CONVERSATION_HISTORY_TURN_LIMIT);
      const records = [];
      for (const item of items) {
        if (excludedId && item.id === excludedId) continue;
        records.push(getVisibleAgentTaskRecord(item.id) || await readAgentTaskRecord(item));
      }
      const messages = [];
      for (const record of dedupeConversationHistoryRecords(records)) {
        messages.push(...createConversationHistoryMessages(record));
      }
      return messages.slice(-(CONVERSATION_HISTORY_TURN_LIMIT * 2));
    }

    /** Return the newest persisted intent contract event in a task record. */
    function getTaskIntentState(record) {
      const events = Array.isArray(record?.events) ? record.events : [];
      let contract = null;
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event?.type !== "intent-contract") continue;
        if (!contract && event.contract) contract = event.contract;
        if (contract && event.meta) return { contract, meta: event.meta };
      }
      return contract ? { contract, meta: null } : null;
    }

    /** Load the newest prior task contract, excluding a task currently being rerun. */
    async function getPriorTaskIntentState(excludedEntry) {
      const excludedId = excludedEntry?.record?.id || "";
      const index = agentTaskIndex.length ? agentTaskIndex : await readAgentTaskIndex();
      const items = [...index].sort(compareAgentTaskIndexItems).reverse();
      for (const item of items) {
        if (excludedId && item.id === excludedId) continue;
        const state = getTaskIntentState(getVisibleAgentTaskRecord(item.id) || await readAgentTaskRecord(item));
        if (state) return state;
      }
      return null;
    }

    async function loadAgentTasksPage(offset = 0, limit = AGENT_TASK_HISTORY_LIMIT) {
      if (!agentTaskIndex.length) agentTaskIndex = await readAgentTaskIndex();
      const page = agentTaskIndex.slice(offset, offset + limit);
      for (const item of page) {
        const record = await readAgentTaskRecord(item);
        if (record) renderSavedAgentTask(record, false);
      }
    }

    async function loadInitialAgentHistory() {
      if (agentHistoryLoaded) return;
      agentHistoryLoaded = true;
      agentTaskIndex = await readAgentTaskIndex();
      await loadAgentTasksPage(0, agentTaskIndex.length || AGENT_TASK_HISTORY_LIMIT);
      contextIndicator?.restoreTotals(getChatContextRestoreTotals(activeAgentChat, agentTaskIndex));
      await refreshChatSelectOptions();
      scrollToolLogToEnd();
    }

    function clearToolLog() {
      shouldAutoScrollToolLog = true;
      if (typeof toolLog.replaceChildren === "function") toolLog.replaceChildren();
      else toolLog.innerHTML = "";
      renderTaskChangesPanel(null);
    }

    function setChatMenuOpen(open) {
      if (!chatSelect || !chatMenu) return;
      if (!open) closeChatActionMenu();
      chatMenu.hidden = !open;
      chatSelect.setAttribute("aria-expanded", open ? "true" : "false");
      logChatHistoryDebug("menu visibility changed", { open, itemCount: chatMenu.children?.length || 0 });
    }

    function renderChatSelectOptions(chats) {
      workspaceChatIndexes = Array.isArray(chats) ? chats : [];
      closeChatActionMenu();
      removeChatActionMenus();
      renderWorkspaceChatHistory(workspaceChatIndexes);
      renderWorkspaceHeader();
      if (!chatSelect || !chatMenu) return;
      if (typeof chatMenu.replaceChildren === "function") chatMenu.replaceChildren();
      else chatMenu.innerHTML = "";
      const activeId = activeAgentChat?.id || "";
      const activeChat = (chats || []).find((chat) => chat.id === activeId);
      if (chatSelectLabel) chatSelectLabel.textContent = activeChat ? getChatDisplayName(activeChat) : "Recent chats";
      (chats || []).forEach((chat) => {
        const item = document.createElement("div");
        item.className = "ai-companion-chat-menu-item";
        item.dataset.chatId = chat.id;
        item.setAttribute("role", "none");
        item.title = formatChatUpdatedTooltip(chat);

        const titleButton = document.createElement("button");
        titleButton.type = "button";
        titleButton.className = "ai-companion-chat-menu-title";
        titleButton.setAttribute("role", "menuitem");
        titleButton.textContent = getChatDisplayName(chat);
        titleButton.addEventListener("click", () => {
          setChatMenuOpen(false);
          void switchToSavedChat(chat.id, chat);
        });

        const actions = document.createElement("div");
        actions.className = "ai-companion-chat-actions";
        const actionToggle = document.createElement("button");
        actionToggle.type = "button";
        actionToggle.className = "ai-companion-chat-action-toggle";
        actionToggle.setAttribute("aria-label", `Open actions for ${getChatDisplayName(chat)}`);
        actionToggle.setAttribute("aria-haspopup", "menu");
        actionToggle.setAttribute("aria-expanded", "false");
        actionToggle.innerHTML = '<i class="bi bi-three-dots-vertical" aria-hidden="true"></i>';
        const actionMenu = document.createElement("div");
        actionMenu.className = "ai-companion-chat-action-menu";
        actionMenu.dataset.aiCompanionChatActionMenu = "true";
        actionMenu.setAttribute("role", "menu");
        actionMenu.hidden = true;
      workspaceChatActionToggleToMenu.set(actionToggle, actionMenu);
        const createActionItem = (label, handler, extraClass = "") => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `ai-companion-chat-action-menu-item${extraClass ? ` ${extraClass}` : ""}`;
          button.setAttribute("role", "menuitem");
          button.textContent = label;
          button.addEventListener("click", (event) => {
            event.preventDefault?.();
            event.stopPropagation?.();
            setChatMenuOpen(false);
            void handler(chat);
          });
          return button;
        };
        actionMenu.append(
          createActionItem("Rename Chat", renameSavedChat),
          createActionItem("Delete Chat", deleteSavedChat, "danger"),
          createActionItem("Show Chat Folder", showSavedChatFolder)
        );
        actionToggle.addEventListener("click", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          setChatActionMenuOpen(actionToggle, actionMenu, actionMenu.hidden === true);
        });
        actions.append(actionToggle);
        document.body?.appendChild(actionMenu);
        item.append(titleButton, actions);
        chatMenu.appendChild(item);
      });
      chatSelect.disabled = !(chats || []).length;
      logChatHistoryDebug("rendered menu", { chatCount: (chats || []).length, disabled: chatSelect.disabled, activeChatId: activeId, itemCount: chatMenu.children?.length || 0 });
      if (chatSelect.disabled) setChatMenuOpen(false);
    }

    async function refreshChatSelectOptions() {
      if (!chatSelect) {
        logChatHistoryDebug("refresh skipped missing control");
        return;
      }
      renderChatSelectOptions(await addWorkspaceChatSearchContent(await readSavedChatIndexes()));
    }

    async function loadChatIntoPanel(chatIndex) {
      if (!chatIndex?.id) return;
      agentEntries = [];
      agentTaskIndex = [...(chatIndex.tasks || [])].sort(compareAgentTaskIndexItems);
      activeAgentChat = { ...chatIndex };
      delete activeAgentChat.tasks;
      contextIndicator?.reset();
      contextIndicator?.restoreTotals(getChatContextRestoreTotals(chatIndex, agentTaskIndex));
      activeRequest = null;
      activeAgentEntry = null;
      activeActivityRenderer = null;
      activeRunMode = null;
      streamingChatResponse = null;
      chatResponseRecorded = false;
      resetSyntheticActivityState();
      clearToolLog();
      if (agentInput) agentInput.value = "";
      resizeAgentInput();
      nextAgentTaskSequence = 1;
      updateNextAgentTaskSequence(agentTaskIndex);
      for (const item of agentTaskIndex) {
        const record = await readAgentTaskRecord(item);
        if (record) renderSavedAgentTask(record, false);
      }
      stopTimer();
      scrollToolLogToEnd();
      refreshModeMessages();
      renderWorkspaceChatHistory(workspaceChatIndexes);
      renderWorkspaceInspectorPanels();
    }

    async function viewSavedChatInWorkspaceDuringRun(chatIndex) {
      if (!chatIndex?.id) return;
      const runningState = {
        activeAgentChat,
        agentTaskIndex,
        agentEntries,
        activeAgentEntry,
        activeActivityRenderer,
        activeRunMode,
        activeRequest,
        streamingChatResponse,
        chatResponseRecorded
      };
      const previewTaskIndex = [...(chatIndex.tasks || [])].sort(compareAgentTaskIndexItems);
      agentEntries = [];
      agentTaskIndex = previewTaskIndex;
      activeAgentChat = { ...chatIndex };
      delete activeAgentChat.tasks;
      activeAgentEntry = null;
      activeActivityRenderer = null;
      activeRunMode = null;
      activeRequest = null;
      streamingChatResponse = null;
      chatResponseRecorded = false;
      clearToolLog();
      for (const item of previewTaskIndex) {
        const record = await readAgentTaskRecord(item);
        if (record) renderSavedAgentTask(record, false);
      }
      scrollToolLogToEnd();
      renderWorkspaceInspectorPanels();
      activeAgentChat = runningState.activeAgentChat;
      agentTaskIndex = runningState.agentTaskIndex;
      agentEntries = runningState.agentEntries;
      activeAgentEntry = runningState.activeAgentEntry;
      activeActivityRenderer = runningState.activeActivityRenderer;
      activeRunMode = runningState.activeRunMode;
      activeRequest = runningState.activeRequest;
      streamingChatResponse = runningState.streamingChatResponse;
      chatResponseRecorded = runningState.chatResponseRecorded;
      if (workspaceChatTitle) workspaceChatTitle.textContent = getChatDisplayName(chatIndex);
      renderWorkspaceChatHistory(workspaceChatIndexes);
      updateAgentRunButton();
    }

    async function switchToSavedChat(chatId, selectedChatIndex = null) {
      if (!chatId || chatId === activeAgentChat?.id) return;
      await saveVisibleAgentEntries();
      const chatIndex = selectedChatIndex?.id === chatId ? selectedChatIndex : await readChatIndexById(chatId);
      if (!chatIndex) {
        await refreshChatSelectOptions();
        return;
      }
      await loadChatIntoPanel(chatIndex);
      setChatMenuOpen(false);
      await refreshChatSelectOptions();
    }

    function handleChatSelectClick() {
      logChatHistoryDebug("header control clicked", { disabled: chatSelect?.disabled === true, hasMenu: !!chatMenu, currentOpen: chatMenu?.hidden === false, itemCount: chatMenu?.children?.length || 0 });
      if (!chatSelect || chatSelect.disabled || !chatMenu) return;
      if (isAgentRunning()) {
        notifyAiCompanionBlocked("Stop current request before switching chats");
        return;
      }
      setChatMenuOpen(chatMenu.hidden !== false);
    }
    async function loadOlderAgentHistory() {
      if (loadingOlderAgentTasks) return;
      loadingOlderAgentTasks = false;
    }

    function shouldRefreshApiClientAfterTool(event) {
      if (event?.type !== "tool" || !API_CLIENT_REFRESH_TOOLS.has(event.tool)) return false;
      if (event.activity?.status === "running") return false;
      return !/running/i.test(String(event.summary || ""));
    }

    function refreshApiClientAfterTool(event) {
      if (!shouldRefreshApiClientAfterTool(event) || typeof deps.refreshApiClientFromAgentTool !== "function") return;
      try {
        const refresh = deps.refreshApiClientFromAgentTool(event);
        if (refresh?.catch) refresh.catch((error) => deps.appDebugLog?.("warning", "[ai-companion] Failed to refresh API Client after agent tool", { tool: event.tool, error: error?.message || String(error) }));
      } catch (error) {
        deps.appDebugLog?.("warning", "[ai-companion] Failed to refresh API Client after agent tool", { tool: event.tool, error: error?.message || String(error) });
      }
    }

    function shouldRefreshGitPanelAfterTool(event) {
      if (event?.type !== "tool" || !GIT_PANEL_REFRESH_TOOLS.has(event.tool)) return false;
      if (event.activity?.status === "running") return false;
      return !/running/i.test(String(event.summary || ""));
    }

    function refreshGitPanelAfterTool(event) {
      if (!shouldRefreshGitPanelAfterTool(event) || typeof deps.refreshWorkspaceGitFromAgentTool !== "function") return;
      try {
        const refresh = deps.refreshWorkspaceGitFromAgentTool(event);
        if (refresh?.catch) refresh.catch((error) => deps.appDebugLog?.("warning", "[ai-companion] Failed to refresh Git panel after agent tool", { tool: event.tool, error: error?.message || String(error) }));
      } catch (error) {
        deps.appDebugLog?.("warning", "[ai-companion] Failed to refresh Git panel after agent tool", { tool: event.tool, error: error?.message || String(error) });
      }
    }
    function appendTool(event) {
      const renderer = activeActivityRenderer;
      const displayEvent = createSyntheticToolActivity(event);
      const savedEvent = recordAgentEvent(displayEvent) || displayEvent;
      updateLatestRequestContextFromTool(savedEvent);
      if (savedEvent.activity) renderer?.appendActivity?.(savedEvent);
      if (savedEvent.activity?.status === "running") hideThinkingIndicator();
      else showThinkingIndicator();
      scrollToolLogToEnd();
      refreshApiClientAfterTool(savedEvent);
      refreshGitPanelAfterTool(savedEvent);
      renderWorkspaceInspectorPanels();
      renderWorkspaceChatHistory(workspaceChatIndexes);
    }

    function appendAutonomousRuntimeStatus(event) {
      const labels = {
        "context-thinned": "Context observations stored",
        "observation-released": "Context observations released",
        "observation-release-reminder": "Context release suggested",
        "tool-catalog-updated": "Tool catalog updated",
        "tool-schema-activated": "Tool schemas activated",
        "tool-schema-restored": "Tool schemas restored",
        "tool-schema-unavailable": "Tool schema unavailable",
        "rules-discovered": "Rules discovered",
        "rule-activated": "Scoped rule activated",
        "rule-unavailable": "Rule unavailable",
        "rules-refreshed": "Rules refreshed",
        "skills-discovered": "Workflow catalog discovered",
        "skill-invocation-started": "Workflow activated",
        "skill-invocation-completed": "Workflow completed",
        "skill-invocation-failed": "Workflow failed",
        "slash-workflow-expanded": "Slash workflow expanded",
        "skill-unavailable": "Workflow unavailable",
        "skills-changed": "Workflow catalog changed",
        "schedule-created": "Schedule created",
        "schedule-cancelled": "Schedule cancelled",
        "schedule-fired": "Scheduled task started",
        "schedule-completed": "Scheduled task completed",
        "schedule-failed": "Scheduled task failed",
        "continuity-updated": "Continuity record updated",
        "memory-proposed": "Memory confirmation requested",
        "memory-confirmed": "Curated memory saved",
        "memory-rejected": "Memory proposal rejected",
        "memory-forgotten": "Curated memory removed",
        "permission-mode-changed": "Permission mode changed",
        "tool-denied": "Tool action denied",
        "denial-guard-tripped": "Denial guard activated",
        "route-selected": "Provider route selected",
        "route-fallback": "Provider fallback selected",
        "route-unavailable": "Provider route unavailable",
        "run-restored": "Autonomous run restored",
        "recovery-warning": "Recovery warning",
        compaction: "Context renewed"
      };
      const summary = event.summary || event.error || event.reason || (event.estimatedTokensBefore
        ? `${event.estimatedTokensBefore} tokens before, ${event.estimatedTokensAfter || 0} after`
        : "Completed");
      const display = createSyntheticToolActivity({
        type: ["recovery-warning", "rule-unavailable", "skill-unavailable", "skill-invocation-failed", "schedule-failed", "memory-rejected", "tool-denied", "denial-guard-tripped", "route-unavailable"].includes(event.type) ? "tool-error" : "tool",
        tool: labels[event.type] || event.type,
        summary,
        callId: `${event.type}-${event.savedAt || event.updatedAt || Date.now()}`
      });
      const savedEvent = recordAgentEvent({ ...event, activity: display.activity }) || { ...event, activity: display.activity };
      activeActivityRenderer?.appendActivity?.(savedEvent);
      scrollToolLogToEnd();
      renderWorkspaceInspectorPanels();
    }

    /**
     * Record and render a model narration block (pre-tool commentary) in the
     * active run's timeline. Routing through recordAgentEvent persists it with
     * the task so restored chats replay the narration in place.
     */
    function appendNarration(event) {
      const savedEvent = recordAgentEvent(event) || event;
      activeActivityRenderer?.appendNarration?.(savedEvent);
      scrollToolLogToEnd();
    }

    function appendApproval(event) {
      let savedEvent = null;
      const row = createApprovalCard(event, {
        interactive: !event.autoApproved,
        onAlwaysApprove: () => {
          // Persist agentMaxResponseTokens = 0: future rounds run uncapped and the tool loop
          // auto-continues any residual response-limit stops without asking.
          const settings = { ...getCurrentSettings(), agentMaxResponseTokens: 0 };
          deps.saveGlobalState?.({ aiCompanionSettings: settings });
          setStatus("Response token cap disabled");
        },
        onRespond: async (decision, instructions, response, grantOptionId) => {
          await deps.bridge.respondApproval?.(event.approvalId, decision, instructions, grantOptionId);
          if (savedEvent) savedEvent.response = response;
          event.response = response;
          attachApprovalCopyAction(row, savedEvent || event);
          if (activeAgentEntry) {
            activeAgentEntry.record.updatedAt = response.respondedAt || Date.now();
            activeAgentEntry.isDirty = true;
            await saveAgentEntryImmediately(activeAgentEntry);
          }
        }
      });
      if (activeActivityRenderer?.appendExternalActivity) activeActivityRenderer.appendExternalActivity(row);
      else toolLog.appendChild(row);
      savedEvent = recordAgentEvent(event);
      if (activeAgentEntry) void saveAgentEntryImmediately(activeAgentEntry);
      attachApprovalCopyAction(row, savedEvent || event);
      scrollToolLogToEnd();
      renderWorkspaceInspectorPanels();
    }

    function isCancelledError(error) {
      return error?.cancelled === true || /cancelled/i.test(error?.message || "");
    }

    function prefersReducedPanelMotion() {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    }

    function updatePanelToggleButton(open) {
      if (!closeButton) return;
      const label = open ? "Hide AI Companion" : "Show AI Companion";
      closeButton.title = label;
      closeButton.setAttribute("aria-label", label);
      closeButton.setAttribute("aria-pressed", open ? "true" : "false");

    }

    function setOpen(open, options = {}) {
      if (panelVisibilityTimer) {
        window.clearTimeout(panelVisibilityTimer);
        panelVisibilityTimer = null;
      }
      const shouldAnimate = !prefersReducedPanelMotion();
      if (open) {
        panel.hidden = false;
        if (shouldAnimate) {
          window.requestAnimationFrame(() => document.body.classList.add("ai-companion-open"));
          panelVisibilityTimer = window.setTimeout(() => {
            panelVisibilityTimer = null;
            resizeAgentInput();
          }, PANEL_VISIBILITY_ANIMATION_MS);
        } else {
          document.body.classList.add("ai-companion-open");
          resizeAgentInput();
        }
        void loadInitialAgentHistory();
      } else {
        document.body.classList.remove("ai-companion-open");
        if (!shouldAnimate || panel.hidden) {
          panel.hidden = true;
        } else {
          panelVisibilityTimer = window.setTimeout(() => {
            panel.hidden = true;
            panelVisibilityTimer = null;
          }, PANEL_VISIBILITY_ANIMATION_MS);
        }
      }
      toggleButtons.forEach((button) => button.setAttribute("aria-pressed", open ? "true" : "false"));
      updatePanelToggleButton(open);
      refreshModeMessages();
      if (options.persist !== false) deps.saveGlobalState?.({ aiCompanionPanelVisible: open === true });
    }

    function setStatus(_status) {}

    function isAgentRunning() {
      return !!activeRequest && !!activeAgentEntry;
    }

    function getAgentInputLineHeight() {
      return getVisibleLineHeight(agentInput);
    }

    function resizeAgentInput() {
      if (!agentInput || panel.hidden || !document.body.classList.contains("ai-companion-open")) return;
      const lineHeight = getAgentInputLineHeight();
      const minHeight = Math.ceil(lineHeight);
      const maxHeight = Math.ceil(lineHeight * AGENT_INPUT_MAX_VISIBLE_LINES);
      agentInput.style.height = `${minHeight}px`;
      if (!String(agentInput.value || "").trim()) {
        agentInput.style.overflowY = "hidden";
        return;
      }
      const contentHeight = agentInput.scrollHeight;
      const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
      agentInput.style.height = `${nextHeight}px`;
      agentInput.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    }

    function updateAgentRunButton() {
      resizeAgentInput();
      if (!agentRunButton) return;
      const running = isAgentRunning();
      const mode = activeRunMode || getSelectedRunMode();
      const idleLabel = mode === "agent" ? "Run agent task" : (mode === "plan" ? "Create plan" : "Run chat prompt");
      const runningLabel = mode === "agent" ? "Stop agent task" : (mode === "plan" ? "Stop plan" : "Stop chat prompt");
      const icon = agentRunButton.querySelector("i");
      agentRunButton.classList.toggle("running", running);
      agentRunButton.disabled = !running && !(mainPromptComposer?.hasContent?.() || false);
      agentRunButton.title = running ? runningLabel : idleLabel;
      agentRunButton.setAttribute("aria-label", running ? runningLabel : idleLabel);
      if (icon) icon.className = running ? "bi bi-stop-fill" : "bi bi-play-fill";
    }

    function cancelAgentTask() {
      if (activeRequest) void deps.bridge.cancel?.(activeRequest);
      if (activeAgentEntry) {
        activeAgentEntry.record.status = "cancelled";
        activeAgentEntry.isDirty = true;
      }
      stopTimer();
      updateAgentRunButton();
    }
    function getCurrentSettings() {
      try {
        return deps.getSettings?.() || {};
      } catch (_error) {
        return {};
      }
    }

    function shouldSubmitPromptFromKeydown(event) {
      if (event.key !== "Enter") return false;
      if (event.ctrlKey || event.metaKey) return true;
      return getCurrentSettings().inputSubmitMode === "enter" && !event.shiftKey;
    }

    function getDisabledNoticeState(settings, mode = activeTab) {
      if (!settings.enabled) {
        return { title: "AI is disabled", detail: "Open Settings > AI and enable AI." };
      }
      if (mode === "agent" && !settings.agentEnabled) {
        return { title: "Agent mode is disabled", detail: "Open Settings > AI and enable Agent mode." };
      }
      if (mode === "chat" && settings.chatEnabled === false) {
        return { title: "Chat mode is disabled", detail: "Open Settings > AI and enable Chat mode." };
      }
      return null;
    }

    function updateDisabledNotice(settings, mode = activeTab) {
      if (!disabledNotice) return;
      const notice = getDisabledNoticeState(settings, mode);
      disabledNotice.hidden = !notice;
      disabledNotice.replaceChildren();
      if (!notice) return;
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      title.textContent = notice.title;
      detail.textContent = notice.detail;
      disabledNotice.append(title, detail);
    }

    function updateElapsedVisibility(settings, mode = activeTab) {
      if (!elapsedElement) return;
      elapsedElement.hidden = !!getDisabledNoticeState(settings, mode) || timerId === null;
    }

    function refreshModeMessages() {
      const settings = getCurrentSettings();
      updateDisabledNotice(settings);
      updateElapsedVisibility(settings);
      updateAgentRunButton();
    }

    function setModeMenuOpen(menu, open) {
      const list = menu?.querySelector(".ai-companion-mode-menu-list");
      const toggle = menu?.querySelector(".ai-companion-mode-menu-toggle");
      if (!list || !toggle) return;
      list.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeModeMenus(exceptMenu = null) {
      panel.querySelectorAll(".ai-companion-mode-menu").forEach((menu) => {
        if (menu !== exceptMenu) setModeMenuOpen(menu, false);
      });
    }

    function normalizeCompanionMode(value) {
      return value === "agent" || value === "plan" ? value : "chat";
    }

    function getModeLabel(mode) {
      if (mode === "agent") return "Agent mode";
      if (mode === "plan") return "Plan mode";
      return "Chat mode";
    }

    function updateInputPlaceholder() {
      if (!agentInput) return;
      agentInput.placeholder = activeTab === "agent" ? "Describe the task you want done" : (activeTab === "plan" ? "Describe the change you want planned" : "Ask anything about this project");
    }

    function updateModeIcon() {
      if (!modeIcon) return;
      const label = getModeLabel(activeTab);
      modeIcon.className = `bi ai-companion-title-mode-icon ${getCompanionModeIconClass(activeTab)}`;
      modeIcon.title = label;
      modeIcon.setAttribute("aria-label", label);
    }

    function updateWorkspaceNewChatLabel() {
      const label = workspaceNewChatButton?.querySelector?.("span");
      if (label) label.textContent = getWorkspaceNewChatLabel(activeTab);
    }

    function updateModeButtonSelection() {
      panel.querySelectorAll("[data-ai-companion-tab]").forEach((button) => {
        const selected = button.dataset.aiCompanionTab === activeTab;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    function selectTab(tab, options = {}) {
      activeTab = normalizeCompanionMode(tab);
      updateModeButtonSelection();
      updateInputPlaceholder();
      updateModeIcon();
      updateWorkspaceNewChatLabel();
      refreshModeMessages();
      closeModeMenus();
      if (options.persist !== false) deps.saveGlobalState?.({ aiCompanionSelectedMode: activeTab });
    }

    function formatElapsedTime(elapsedMs) {
      const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    function getWorkedLabelFromCounter() {
      if (timerId === null) return "";
      const elapsed = String(elapsedElement?.textContent || "").trim() || formatElapsedTime(Date.now() - startedAt);
      return `Worked for ${elapsed}`;
    }

    function resetElapsedCounter() {
      if (elapsedElement) elapsedElement.textContent = formatElapsedTime(0);
    }

    function startTimer() {
      startedAt = Date.now();
      stopTimer();
      resetElapsedCounter();
      timerId = window.setInterval(() => {
        elapsedElement.textContent = formatElapsedTime(Date.now() - startedAt);
      }, 250);
      updateElapsedVisibility(getCurrentSettings(), activeRunMode || getSelectedRunMode());
    }

    function stopTimer() {
      if (timerId) window.clearInterval(timerId);
      timerId = null;
      updateElapsedVisibility(getCurrentSettings(), activeRunMode || getSelectedRunMode());
      resetElapsedCounter();
    }


    function isConversionExportToolName(toolName) {
      return toolName === "get_conversion_export_state"
        || toolName === "get_code_conversion_status"
        || toolName === "export_active_document"
        || toolName === "export_active_folder_graph"
        || toolName === "start_code_conversion";
    }

    async function handleAppActionEvent(event) {
      const actionId = String(event?.actionId || "");
      const toolName = String(event?.tool || "");
      let result;
      try {
        const executor = toolName.startsWith("graph_")
          ? deps.graphCompanionControl
          : (toolName.startsWith("structured_")
            ? deps.structuredExecutionActions
          : (toolName.startsWith("preferences_")
            ? deps.settingsTools
            : (isConversionExportToolName(toolName) ? deps.conversionExportTools : deps.editorActionTools)));
        if (!executor?.execute) {
          throw new Error(toolName.startsWith("graph_")
            ? "Graph companion control is unavailable."
            : (toolName.startsWith("structured_")
              ? "Structured execution actions are unavailable."
            : (toolName.startsWith("preferences_")
              ? "Settings tools are unavailable."
              : (isConversionExportToolName(toolName) ? "Conversion/export tools are unavailable." : "Editor action tools are unavailable."))));
        }
        result = await executor.execute(toolName, event.args || {});
      } catch (error) {
        if (!toolName.startsWith("preferences_")) {
          await deps.bridge?.respondAppAction?.(actionId, {}, error?.message || String(error));
          return;
        }
        deps.appDebugLog?.("warn", "[ai-companion] preference action execution failed", {
          stage: "preference-execution",
          code: String(error?.code || "tool-execution-failed").slice(0, 80),
          stackLocation: String(error?.stack || "").split("\n")[1]?.trim().slice(0, 240) || ""
        });
        result = {
          status: "failed",
          entries: [],
          page: { returned: 0, hasMore: false, nextCursor: null },
          errors: [{ code: "tool-execution-failed", path: [], retryable: true, message: "The preference operation failed." }],
          complete: false
        };
      }
      try {
        JSON.stringify(result || {});
      } catch (error) {
        deps.appDebugLog?.("warn", "[ai-companion] preference action serialization failed", {
          stage: "bridge-serialization",
          code: "bridge-serialization-failed",
          stackLocation: String(error?.stack || "").split("\n")[1]?.trim().slice(0, 240) || ""
        });
        result = {
          status: "failed",
          entries: [],
          page: { returned: 0, hasMore: false, nextCursor: null },
          errors: [{ code: "bridge-serialization-failed", path: [], retryable: true, message: "The preference result could not be serialized safely." }],
          complete: false
        };
      }
      await deps.bridge?.respondAppAction?.(actionId, result || {});
    }
    function handleEvent(event) {
      if (event.type === "app-action") {
        void handleAppActionEvent(event);
        return;
      }
      if (event.type === "rate-limit-wait") {
        showRateLimitWaitIndicator(event.delayMs);
        return;
      }
      if (event.type === "context") contextIndicator?.recordEstimate(event);
      if (event.type === "usage") contextIndicator?.recordUsage(event);
      if (event.type === "start") {
        contextIndicator?.beginRequest();
        streamingChatResponse = null;
        chatResponseRecorded = false;
        showThinkingIndicator();
        startTimer();
      }
      if (event.type === "content-delta" || event.type === "content" || event.type === "done" || event.type === "cancelled" || event.type === "error") hideThinkingIndicator();
      if (event.type === "chat-title") {
        void persistGeneratedChatTitle(event.chatTitle);
        return;
      }
      // Narration is handled before the chat-mode early returns below so both
      // chat and agent runs show the model's pre-tool commentary.
      if (event.type === "narration") {
        appendNarration(event);
        return;
      }
      if (event.type === "assistant-final") {
        if (event.plan?.path && activeAgentEntry) activeAgentEntry.pendingPlanMetadata = event.plan;
        const finalContent = String(event.content || "").trim();
        if (!finalContent) {
          recordAgentEvent({ ...event, invalid: true, error: "The autonomous runtime returned an empty final response." });
          if (activeAgentEntry) activeAgentEntry.record.status = "error";
          return;
        }
        finishChatResponse(finalContent, false, getWorkedLabelFromCounter());
        return;
      }
      if (["plan-saved", "plan-updated"].includes(event.type)) {
        recordAgentEvent(event);
        if (event.plan?.path && activeAgentEntry) activeAgentEntry.pendingPlanMetadata = event.plan;
        void loadRepositoryPlans({ force: true });
        return;
      }
      if (["skills-discovered", "skill-invocation-started", "skill-invocation-completed", "skill-invocation-failed", "skill-unavailable", "slash-workflow-expanded", "skills-changed", "schedule-created", "schedule-cancelled", "schedule-fired", "schedule-completed", "schedule-failed"].includes(event.type)) {
        updateWorkflowSkillSuggestions(event.skills);
        appendAutonomousRuntimeStatus(event);
        return;
      }
      if (["run-started", "context-thinned", "observation-released", "observation-release-reminder", "tool-catalog-updated", "tool-schema-activated", "tool-schema-restored", "tool-schema-unavailable", "rules-discovered", "rule-activated", "rule-unavailable", "rules-refreshed", "continuity-updated", "chronicle-saved", "run-restored", "recovery-warning", "compaction", "run-completed", "run-cancelled", "run-failed"].includes(event.type) || /^(work|worker|memory|route)-/.test(event.type) || ["permission-mode-changed", "tool-denied", "denial-guard-tripped"].includes(event.type)) {
        if (["context-thinned", "observation-released", "observation-release-reminder", "tool-catalog-updated", "tool-schema-activated", "tool-schema-restored", "tool-schema-unavailable", "rules-discovered", "rule-activated", "rule-unavailable", "rules-refreshed", "continuity-updated", "run-restored", "recovery-warning", "compaction", "memory-proposed", "memory-confirmed", "memory-rejected", "memory-forgotten", "permission-mode-changed", "tool-denied", "denial-guard-tripped", "route-selected", "route-fallback", "route-unavailable"].includes(event.type)) appendAutonomousRuntimeStatus(event);
        else recordAgentEvent(event);
        if (activeAgentEntry && ["run-restored", "recovery-warning"].includes(event.type)) {
          activeAgentEntry.record.recoverySummary = {
            type: event.type,
            summary: event.summary || event.error || event.reason || "",
            classification: event.classification || "",
            updatedAt: new Date().toISOString()
          };
        }
        if (activeAgentEntry && event.type === "run-completed") activeAgentEntry.record.status = activeRunMode === "plan"
          ? (event.plan?.path || activeAgentEntry.record.plan?.path || activeAgentEntry.pendingPlanMetadata?.path ? "planned" : "error")
          : (String(getRecordFinalResponse(activeAgentEntry.record) || "").trim() ? "completed" : "error");
        if (activeAgentEntry && event.type === "run-cancelled") activeAgentEntry.record.status = "cancelled";
        if (activeAgentEntry && event.type === "run-failed") activeAgentEntry.record.status = "error";
        return;
      }
      if (activeRunMode === "chat" || activeRunMode === "plan") {
        if (event.type === "content-delta" && event.content) {
          appendChatResponseDelta(event.content);
          return;
        }
        if (event.type === "content" && event.content) {
          finishChatResponse(event.content, false, getWorkedLabelFromCounter());
          return;
        }
        if (event.type === "done" || event.type === "cancelled") {
          finishChatResponse("", false, getWorkedLabelFromCounter());
          return;
        }
      }
      if (event.type === "tool" || event.type === "tool-error") appendTool(event);
      if (event.type === "tool-started") appendTool({ ...event, type: "tool", summary: "Running" });
      if (event.type === "tool-completed") appendTool({ ...event, type: "tool", summary: "Completed" });
      if (event.type === "tool-failed") appendTool({ ...event, type: "tool-error" });
      if (event.type === "agent-summary") {
        hideThinkingIndicator();
        const summaryEvent = { ...event, workedLabel: event.workedLabel || getWorkedLabelFromCounter() };
        const savedEvent = recordAgentEvent(summaryEvent) || summaryEvent;
        activeActivityRenderer?.appendSummary?.(savedEvent);
      }
      if (event.type === "approval") {
        hideThinkingIndicator();
        appendApproval(event);
      }
    }

    function getActiveFilePayload() {
      let path = "";
      let content;
      try {
        path = deps.getActiveEditorPath?.() || "";
        content = deps.getActiveEditorContent?.();
      } catch (error) {
        if (error instanceof ReferenceError) return undefined;
        throw error;
      }
      return path && typeof content === "string" ? { path, content } : undefined;
    }


    function truncateEditorReadContextText(value, maxChars) {
      const text = String(value || "");
      const limit = Math.max(1, Number(maxChars) || EDITOR_READ_CONTEXT_TAB_CONTENT_MAX_CHARS);
      return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
    }

    function normalizeEditorReadContextPath(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function getTabReadContextPath(tab = {}) {
      return normalizeEditorReadContextPath(tab.sourceFilePath || tab.sourceFileName || tab.linkBasePath || tab.title || "");
    }

    function isEditorReadContextContentTab(tab = {}) {
      const type = tab.type || "markdown";
      return typeof tab.content === "string" && type !== "graph" && type !== "large-file" && type !== "file-preview" && type !== "file-compare" && type !== "api-client";
    }

    function getDirtyTabIds() {
      try {
        return new Set((deps.getUnsavedTabs?.() || []).map((tab) => String(tab?.id || "")).filter(Boolean));
      } catch (_error) {
        return new Set();
      }
    }

    function getTabReadContextContent(tab = {}) {
      if (!isEditorReadContextContentTab(tab)) return undefined;
      if (String(tab.id || "") === String(deps.getActiveTabId?.() || "")) {
        const activeContent = deps.getActiveEditorContent?.();
        if (typeof activeContent === "string") return truncateEditorReadContextText(activeContent, EDITOR_READ_CONTEXT_TAB_CONTENT_MAX_CHARS);
      }
      return truncateEditorReadContextText(tab.content, EDITOR_READ_CONTEXT_TAB_CONTENT_MAX_CHARS);
    }

    function createTabReadContext(tab = {}, dirtyTabIds = new Set()) {
      return {
        id: String(tab.id || ""),
        title: String(tab.title || tab.folderName || ""),
        type: String(tab.type || "markdown"),
        path: getTabReadContextPath(tab),
        sourceFileName: String(tab.sourceFileName || ""),
        sourceFilePath: normalizeEditorReadContextPath(tab.sourceFilePath || ""),
        viewMode: String(tab.viewMode || ""),
        dirty: dirtyTabIds.has(String(tab.id || "")),
        content: getTabReadContextContent(tab)
      };
    }

    function createGraphNodeReadContext(node = {}) {
      return {
        id: String(node.id || ""),
        label: String(node.label || node.name || node.title || node.id || ""),
        type: String(node.type || node.kind || ""),
        path: normalizeEditorReadContextPath(node.path || node.fullPath || "")
      };
    }

    function createGraphFileReadContext(file = {}) {
      return {
        id: String(file.id || ""),
        name: String(file.name || file.title || ""),
        path: normalizeEditorReadContextPath(file.path || file.fullPath || ""),
        tags: Array.isArray(file.tags) ? file.tags.slice(0, 30) : [],
        content: file.content ? truncateEditorReadContextText(file.content, EDITOR_READ_CONTEXT_GRAPH_TEXT_MAX_CHARS) : undefined
      };
    }

    function createGraphTabReadContext(tab = {}) {
      const snapshot = tab.graphComparisonSnapshot || tab.graphSnapshot || tab.graphDocument?.snapshot || {};
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
      const links = Array.isArray(snapshot.links) ? snapshot.links : [];
      const files = Array.isArray(snapshot.files) ? snapshot.files : [];
      return {
        id: String(tab.id || ""),
        title: String(tab.title || tab.folderName || "Graph View"),
        path: getTabReadContextPath(tab),
        active: String(tab.id || "") === String(deps.getActiveTabId?.() || ""),
        zoomScale: Number.isFinite(Number(tab.graphZoomScale)) ? Number(tab.graphZoomScale) : undefined,
        nodeCount: nodes.length,
        linkCount: links.length,
        fileCount: files.length,
        graphViewConfig: tab.graphViewConfig || tab.graphDocument?.viewConfig || null,
        nodes: nodes.slice(0, EDITOR_READ_CONTEXT_GRAPH_METADATA_MAX_ITEMS).map(createGraphNodeReadContext),
        files: files.slice(0, EDITOR_READ_CONTEXT_GRAPH_METADATA_MAX_ITEMS).map(createGraphFileReadContext),
        links: links.slice(0, EDITOR_READ_CONTEXT_GRAPH_METADATA_MAX_ITEMS).map((link) => ({
          source: String(link?.source?.id || link?.source || ""),
          target: String(link?.target?.id || link?.target || ""),
          type: String(link?.type || "")
        }))
      };
    }

    function createFolderMarkdownFileReadContext(entry = {}) {
      return {
        id: String(entry.id || ""),
        name: String(entry.name || entry.title || ""),
        path: normalizeEditorReadContextPath(entry.path || entry.fullPath || entry.file?.webkitRelativePath || entry.name || ""),
        tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 30) : []
      };
    }

    function getActiveEditorSelectionPayload(content) {
      let selection = null;
      try {
        selection = deps.getActiveEditorSelection?.() || null;
      } catch (_error) {
        selection = null;
      }
      if (!selection) return undefined;
      const start = Math.max(0, Number(selection.start) || 0);
      const end = Math.max(start, Number(selection.end) || start);
      return {
        start,
        end,
        text: start === end ? "" : String(content || "").slice(start, end)
      };
    }

    function createRecentActivityReadContext(openTabs, workspace) {
      const items = [];
      const activeTabId = String(workspace.activeTab?.id || "");
      const addItem = (item) => {
        const id = String(item?.id || item?.path || "");
        if (!id || items.some((existing) => String(existing.id || existing.path || "") === id)) return;
        items.push(item);
      };
      const activeTab = openTabs.find((tab) => String(tab.id || "") === activeTabId);
      if (activeTab) addItem({ kind: "open-tab", reason: "active", ...activeTab });
      openTabs.forEach((tab) => addItem({ kind: "open-tab", reason: "open", ...tab }));
      latestRequestContextFiles.forEach((file) => addItem({ kind: "context-file", reason: file.source || "recent-request", ...file }));
      return items;
    }

    function readEditorDependency(readValue, fallback) {
      try {
        return readValue();
      } catch (error) {
        if (error instanceof ReferenceError) return fallback;
        throw error;
      }
    }

    function createEditorReadContext(mode, activeFilePayload) {
      const tabs = readEditorDependency(() => {
        const currentTabs = deps.getTabs?.();
        return Array.isArray(currentTabs) ? currentTabs : [];
      }, []);
      const activeTabId = String(readEditorDependency(() => deps.getActiveTabId?.() || "", ""));
      const activeTab = tabs.find((tab) => String(tab?.id || "") === activeTabId) || null;
      const dirtyTabIds = getDirtyTabIds();
      const openTabs = tabs.map((tab) => createTabReadContext(tab, dirtyTabIds));
      const activeContent = activeFilePayload?.content || "";
      const workspace = {
        rootPath: readEditorDependency(() => deps.getWorkspaceRoot?.() || "", ""),
        activeFolderName: readEditorDependency(() => deps.getActiveFolderName?.() || "", ""),
        activeFolderPath: readEditorDependency(() => deps.getActiveFolderPath?.() || "", ""),
        mode,
        openTabCount: openTabs.length,
        activeTab: activeTab ? createTabReadContext(activeTab, dirtyTabIds) : null,
        activeGraphTabId: activeTab?.type === "graph" ? String(activeTab.id || "") : ""
      };
      const folderMarkdownFiles = readEditorDependency(() => deps.getFolderMarkdownFiles?.() || [], []);
      return {
        workspace,
        activeGraphTabId: workspace.activeGraphTabId,
        activeDocument: activeTab ? {
          ...createTabReadContext(activeTab, dirtyTabIds),
          path: activeFilePayload?.path || getTabReadContextPath(activeTab),
          content: truncateEditorReadContextText(activeContent, EDITOR_READ_CONTEXT_TAB_CONTENT_MAX_CHARS),
          selection: getActiveEditorSelectionPayload(activeContent)
        } : null,
        openTabs,
        graphTabs: tabs.filter((tab) => tab?.type === "graph").map(createGraphTabReadContext),
        folderMarkdownFiles: folderMarkdownFiles.slice(0, EDITOR_READ_CONTEXT_GRAPH_METADATA_MAX_ITEMS).map(createFolderMarkdownFileReadContext),
        recentActivity: createRecentActivityReadContext(openTabs, workspace)
      };
    }
    function getSelectedRunMode() {
      return normalizeCompanionMode(activeTab);
    }

    /**
     * Run the companion with a prompt, either typed into the input (default) or
     * supplied programmatically. `overrides.prompt` runs that text without touching
     * the input, and `overrides.mode` forces "agent"/"chat"/"plan" regardless of the active
     * tab. Used by the interrupted-task Resume button, which must run in agent mode.
     */
    async function runCompanionPrompt(overrides = {}) {
      const hasPromptOverride = Object.prototype.hasOwnProperty.call(overrides, "prompt");
      const prompt = hasPromptOverride ? String(overrides.prompt || "").trim() : String(agentInput.value || "").trim();
      const attachments = Array.isArray(overrides.attachments)
        ? normalizeAttachmentPayloads(overrides.attachments)
        : (hasPromptOverride ? [] : await getDraftAttachmentPayloads());
      if (!prompt && !attachments.length) return;
      const settings = { ...getCurrentSettings() };
      if (overrides.capabilityBoundary?.toolScopes) {
        const savedScopes = overrides.capabilityBoundary.toolScopes;
        const currentScopes = settings.toolScopes || {};
        settings.toolScopes = Object.fromEntries(Array.from(new Set([...Object.keys(currentScopes), ...Object.keys(savedScopes)]), (name) => [name, currentScopes[name] === true && savedScopes[name] === true]));
        settings.agentAutoRunCommands = settings.agentAutoRunCommands === true && overrides.capabilityBoundary.autoRunCommands === true;
      }
      const mode = overrides.mode ? normalizeCompanionMode(overrides.mode) : getSelectedRunMode();
      if (!settings.enabled || (mode === "agent" ? !settings.agentEnabled : (mode === "chat" && settings.chatEnabled === false))) {
        updateDisabledNotice(settings, mode);
        updateElapsedVisibility(settings, mode);
        return { status: "blocked", error: "AI Companion mode is disabled." };
      }
      const chat = ensureActiveAgentChat();
      renderTaskChangesPanel(null);
      activeRunMode = mode;
      const existingEntry = overrides.entry || null;
      const orderedTaskIndex = [...agentTaskIndex].sort(compareAgentTaskIndexItems);
      const indexedTurn = existingEntry ? orderedTaskIndex.findIndex((item) => item.id === existingEntry.record?.id) : -1;
      let requestTurnIndex = existingEntry
        ? Math.max(0, indexedTurn >= 0 ? indexedTurn : agentEntries.indexOf(existingEntry))
        : Math.max(agentTaskIndex.length, agentEntries.length);
      const executionKind = ["new", "edited-rerun", "resume"].includes(overrides.executionKind)
        ? overrides.executionKind
        : (overrides.resumeRun === true ? "resume" : "new");
      const requestedExecutionGeneration = Number(overrides.executionGeneration);
      const currentExecutionGeneration = Number.isInteger(requestedExecutionGeneration) && requestedExecutionGeneration > 0
        ? requestedExecutionGeneration
        : Math.max(1, Number(existingEntry?.record?.executionGeneration) || 1);
      const executionGeneration = executionKind === "edited-rerun"
        ? currentExecutionGeneration + 1
        : currentExecutionGeneration;
      let persistedAttachments = Array.isArray(overrides.persistedAttachments)
        ? normalizeAttachmentReferences(overrides.persistedAttachments)
        : (attachments.length ? normalizeAttachmentReferences(attachments) : normalizeAttachmentReferences(existingEntry?.record?.attachments));
      if (existingEntry) {
        if (executionKind === "resume" && overrides.resumeRun === true) {
          existingEntry.record.status = "running";
          existingEntry.record.lastExecutionKind = "resume";
          existingEntry.isDirty = true;
        } else {
          prepareEntryForPromptRun(existingEntry, prompt, persistedAttachments, executionKind, executionGeneration);
        }
        await saveAgentEntry(existingEntry);
      }
      const conversationHistory = await buildConversationHistory(existingEntry);
      const requestChatTitle = shouldRequestGeneratedChatTitle(existingEntry);
      const activeFilePayload = getActiveFilePayload();
      latestRequestContextFiles = createLatestRequestContextFiles(activeFilePayload, attachments);
      contextIndicator?.refresh?.();
      activeAgentEntry = existingEntry || createAgentTaskEntry(prompt, null, persistedAttachments);
      activeAgentEntry.record.executionGeneration = executionGeneration;
      activeAgentEntry.record.lastExecutionKind = executionKind;
      if (attachments.length) {
        persistedAttachments = await persistPastedImageAttachments(activeAgentEntry, attachments, persistedAttachments);
        activeAgentEntry.record.attachments = persistedAttachments;
        updatePromptEntryDisplay(activeAgentEntry);
      }
      // Only consume the input when it supplied the prompt; a programmatic run
      // (e.g. resuming an interrupted task) must not discard a typed draft.
      if (!hasPromptOverride) {
        mainPromptComposer?.clear?.();
      }
      activeActivityRenderer = activeAgentEntry.renderer;
      activeAgentEntry.record.mode = mode;
      resetSyntheticActivityState();
      streamingChatResponse = null;
      chatResponseRecorded = false;
      const editorReadContext = createEditorReadContext(mode, activeFilePayload);
      const requestPayload = {
        prompt,
        slashInvocation: (() => {
          const match = prompt.match(/^\/([a-zA-Z0-9:_-]+)(?:\s+([\s\S]*))?$/);
          return match ? { name: match[1].toLowerCase(), arguments: String(match[2] || "").trim() } : null;
        })(),
        settings,
        workspaceRoot: deps.getWorkspaceRoot(),
        activeFile: activeFilePayload,
        editorReadContext,
        conversationHistory,
        attachments,
        chatId: activeAgentChat?.id || "",
        taskId: activeAgentEntry?.record?.id || "",
        runId: activeAgentEntry?.record?.runId || activeAgentEntry?.record?.id || "",
        chatCreatedAt: activeAgentChat?.createdAt || activeAgentEntry?.record?.createdAt || Date.now(),
        resumeRun: overrides.resumeRun === true,
        modelLimits: (() => {
          const modelName = settings.providerMode === "litellm" && settings.litellmModelAlias
            ? settings.litellmModelAlias
            : settings.model;
          const info = modelRegistry?.resolveModelInfo?.(modelName);
          return info ? { contextWindow: Number(info.contextWindow) || 0, maxOutputTokens: Number(info.maxOutputTokens) || 0 } : null;
        })(),
        configuredModels: modelRegistry?.getCachedModels?.().map((model) => model.id).filter(Boolean) || [],
        turnIndex: requestTurnIndex,
        executionKind,
        executionGeneration
      };
      if (mode === "plan") {
        const existingPlanTarget = existingEntry?.record?.plan?.path ? getPlanLocator(existingEntry.record.plan) : null;
        requestPayload.sourceChatId = activeAgentChat?.id || "";
        requestPayload.sourceTaskId = activeAgentEntry?.record?.id || "";
        requestPayload.planTarget = overrides.planTarget && typeof overrides.planTarget === "object" ? overrides.planTarget : existingPlanTarget;
        requestPayload.planOperation = ["create", "update", "auto"].includes(overrides.planOperation)
          ? overrides.planOperation
          : (requestPayload.planTarget ? "update" : "create");
      }
      if (requestChatTitle) requestPayload.requestChatTitle = true;
      const agentEventToken = mode === "agent" ? {} : null;
      if (agentEventToken) activeAgentRunEventToken = agentEventToken;
      const requestEventHandler = agentEventToken
        ? (event) => {
            if (activeAgentRunEventToken === agentEventToken) handleEvent(event);
          }
        : handleEvent;
      const request = mode === "agent" ? deps.bridge.agent(requestPayload, requestEventHandler) : (mode === "plan" ? deps.bridge.plan(requestPayload, handleEvent) : deps.bridge.chat(requestPayload, handleEvent));
      activeRequest = request;
      let runOutcome = { status: "running", entryId: activeAgentEntry?.record?.id || "" };
      updateAgentRunButton();
      try {
        const result = await request;
        if (mode === "plan" && result?.plan?.path && activeAgentEntry) {
          activeAgentEntry.pendingPlanMetadata = result.plan;
          if (activeAgentEntry.record?.mode === "plan" && activeAgentEntry.record?.plan) {
            const planText = String(result.content || getRecordFinalResponse(activeAgentEntry.record) || "").trim();
            activeAgentEntry.record.plan = createPlanMetadata(planText, activeAgentEntry.record.plan, "planned", result.plan);
            activeAgentEntry.record.status = "planned";
            activeAgentEntry.isDirty = true;
            attachPromptActions(activeAgentEntry);
            delete activeAgentEntry.pendingPlanMetadata;
          }
          void loadRepositoryPlans({ force: true });
        }
        if ((mode === "chat" || mode === "plan") && result?.content) finishChatResponse(result.content, false, getWorkedLabelFromCounter());

        if (activeAgentEntry) {
          const status = activeAgentEntry.record.status || "completed";
          if (activeAgentEntry.record.status !== status) activeAgentEntry.isDirty = true;
          activeAgentEntry.record.status = status;
          runOutcome = { status, result, entryId: activeAgentEntry.record.id || "" };
        }
      } catch (error) {
        const cancelled = isCancelledError(error);
        if (activeAgentEntry) {
          const status = cancelled ? "cancelled" : "error";
          if (activeAgentEntry.record.status !== status) activeAgentEntry.isDirty = true;
          activeAgentEntry.record.status = status;
          runOutcome = { status, error: error?.message || String(error), entryId: activeAgentEntry.record.id || "" };
        }
        if (!cancelled && (mode === "chat" || mode === "plan")) {
          finishChatResponse(error?.message || String(error), true, getWorkedLabelFromCounter());
          notifyAiCompanionError(error?.message || String(error));
        } else if (!cancelled) {
          const event = { type: "agent-summary", isError: true, elapsedMs: Date.now() - startedAt, workedLabel: getWorkedLabelFromCounter(), outcome: error?.message || String(error), finalResponse: error?.message || String(error), changedFiles: [], attemptedChanges: [], blockedChanges: [] };
          const savedEvent = recordAgentEvent(event) || event;
          activeActivityRenderer?.appendSummary?.(savedEvent);
          notifyAiCompanionError(error?.message || String(error));
        }
      } finally {
        hideThinkingIndicator();
        if (activeAgentEntry) await saveAgentEntry(activeAgentEntry);
        void refreshChatSelectOptions();
        if (activeRequest === request) activeRequest = null;
        if (activeAgentRunEventToken === agentEventToken) activeAgentRunEventToken = null;
        activeAgentEntry = null;
        activeActivityRenderer = null;
        activeRunMode = null;
        streamingChatResponse = null;
        stopTimer();
        updateAgentRunButton();
        renderWorkspaceInspectorPanels();
        renderWorkspaceChatHistory(workspaceChatIndexes);
      }
      return runOutcome;
    }

    /**
     * Start the existing Agent workflow with complete Quick Fix diagnostic context.
     * @param {object} context Diagnostic, source, workspace, and build context.
     * @returns {Promise<object>} Existing companion run outcome.
     */
    async function runProblemFix(context = {}) {
      const settings = getCurrentSettings();
      if (!settings.enabled || !settings.agentEnabled) {
        return { status: "blocked", error: "AI Companion Agent mode is disabled." };
      }
      const diagnostic = context.diagnostic || {};
      const prompt = [
        "Investigate this Java diagnostic in the actual workspace and propose the smallest correct fix.",
        "Use the existing approval flow for every edit. Do not infer an edit only from the diagnostic text.",
        `Workspace root: ${context.workspaceRoot || ""}`,
        `File: ${diagnostic.filePath || ""}`,
        `Location: line ${diagnostic.line || 1}, column ${diagnostic.column || 1}`,
        `Message: ${diagnostic.message || ""}`,
        `Code: ${diagnostic.code ?? ""}`,
        `Range: ${JSON.stringify(diagnostic.range || null)}`,
        `Diagnostic data: ${JSON.stringify(diagnostic.data ?? null)}`,
        `Related information: ${JSON.stringify(diagnostic.relatedInformation || [])}`,
        `Related diagnostics: ${JSON.stringify(context.relatedDiagnostics || [])}`,
        `Selected source: ${context.selectedSource || ""}`,
        `Current source content:\n${context.sourceContent || diagnostic.sourceContent || ""}`
      ].join("\n");
      setOpen(true);
      selectTab("agent");
      return runCompanionPrompt({ prompt, mode: "agent" });
    }

    async function startNewAgentChat() {
      await saveVisibleAgentEntries();
      agentEntries = [];
      agentTaskIndex = [];
      activeAgentChat = null;
      nextAgentTaskSequence = 1;
      resetSyntheticActivityState();
      activeAgentEntry = null;
      activeActivityRenderer = null;
      clearToolLog();
      mainPromptComposer?.clear?.();
      resizeAgentInput();
      latestRequestContextFiles = [];
      contextIndicator?.reset();
      ensureActiveAgentChat();
      await refreshChatSelectOptions();
      setStatus("Ready");
      renderWorkspaceInspectorPanels();
    }

    mainPromptComposer = createPromptComposer({
      root: panel,
      textarea: agentInput,
      attachmentList,
      fileInput: attachmentInput,
      menu: panel.querySelector(".ai-companion-mode-menu"),
      menuToggle: panel.querySelector(".ai-companion-mode-menu-toggle"),
      menuList: panel.querySelector(".ai-companion-mode-menu-list"),
      attachFilesButton,
      modeButtons: tabButtons,
      submitButton: agentRunButton,
      enableDrop: true,
      updateSubmitState: updateAgentRunButton,
      onAttachmentsChanged: renderWorkspaceInspectorPanels
    });
    attachSlashWorkflowSuggestions(agentInput, getSelectedRunMode);
    if (typeof deps.bridge?.schedulesClaimDue === "function") {
      const schedulePollTimer = setInterval(() => { void pollDueCompanionSchedules(); }, 30000);
      schedulePollTimer?.unref?.();
      void pollDueCompanionSchedules();
    }

    toggleButtons.forEach((button) => button.addEventListener("click", () => setOpen(!document.body.classList.contains("ai-companion-open"))));
    closeButton?.addEventListener("click", () => setOpen(!document.body.classList.contains("ai-companion-open")));
    document.addEventListener("click", (event) => {
      const actionMenuToggle = event.target?.closest?.(".ai-companion-chat-action-toggle");
      if (actionMenuToggle) {
        const actionMenu = workspaceChatActionToggleToMenu.get(actionMenuToggle);
        if (actionMenu) {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          event.stopPropagation?.();
          setChatActionMenuOpen(actionMenuToggle, actionMenu, actionMenu.hidden === true);
          return;
        }
      }
      if (editingPromptEntry) {
        const { details } = getPromptEntryParts(editingPromptEntry.entry);
        if (event.target?.closest?.(".ai-companion-agent-task-prompt") !== details) cancelPromptEdit(editingPromptEntry.entry);
      }
      if (!event.target?.closest?.(".ai-companion-mode-menu")) closeModeMenus();
      if (!event.target?.closest?.(".ai-companion-chat-actions, .ai-companion-chat-action-menu, .ai-companion-chat-action-toggle")) closeChatActionMenu();
      if (!event.target?.closest?.(".ai-companion-chat-picker")) setChatMenuOpen(false);
      if (!event.target?.closest?.("#ai-companion-workspace-task-details-toggle, #ai-companion-workspace-task-details-popover")) closeWorkspaceTaskDetails();
      if (!event.target?.closest?.("#ai-companion-workspace-inspector-info-popover, [data-ai-companion-inspector-info]")) closeWorkspaceInfoPopover();
      if (!event.target?.closest?.("#ai-companion-workspace-chat-filter, #ai-companion-workspace-chat-filter-menu")) {
        if (workspaceChatFilterMenu) workspaceChatFilterMenu.hidden = true;
        workspaceChatFilterButton?.setAttribute("aria-expanded", "false");
      }
      if (!event.target?.closest?.("#ai-companion-workspace-plan-filter, #ai-companion-workspace-plan-filter-menu")) {
        if (workspacePlanFilterMenu) workspacePlanFilterMenu.hidden = true;
        workspacePlanFilterButton?.setAttribute("aria-expanded", "false");
      }
      if (!event.target?.closest?.("#ai-companion-workspace-new-chat-menu, #ai-companion-workspace-new-chat-menu-list")) setWorkspaceNewChatMenuOpen(false);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModeMenus();
        closeChatActionMenu();
        setChatMenuOpen(false);
        closeWorkspaceTaskDetails();
        closeWorkspaceInfoPopover();
        setWorkspaceNewChatMenuOpen(false);
      }
    });
    agentRunButton?.addEventListener("click", () => {
      if (isAgentRunning()) cancelAgentTask();
      else void runCompanionPrompt();
    });
    newAgentButton?.addEventListener("click", () => { setPlansViewOpen(false, { load: false }); void startNewAgentChat(); });
    plansToggleButton?.addEventListener("click", () => setPlansViewOpen(!plansViewOpen));
    plansRefreshButton?.addEventListener("click", () => { void loadRepositoryPlans({ rebuild: true }); });
    plansStatusSelect?.addEventListener("change", () => { selectedRepositoryPlan = null; void loadRepositoryPlans(); });
    plansSearchInput?.addEventListener("input", () => { selectedRepositoryPlan = null; void loadRepositoryPlans(); });
    chatSelect?.addEventListener("click", handleChatSelectClick);
    workspaceChatSearch?.addEventListener("input", () => {
      workspaceChatVisibleLimit = WORKSPACE_CHAT_PAGE_SIZE;
      renderWorkspaceChatHistory(workspaceChatIndexes);
    });
    workspaceChatFilterButton?.addEventListener("click", () => {
      if (!workspaceChatFilterMenu) return;
      workspaceChatFilterMenu.hidden = workspaceChatFilterMenu.hidden === false;
      workspaceChatFilterButton.setAttribute("aria-expanded", workspaceChatFilterMenu.hidden ? "false" : "true");
    });
    workspaceChatFilterMenu?.querySelectorAll?.("[data-ai-companion-workspace-chat-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        workspaceChatFilter = button.dataset.aiCompanionWorkspaceChatFilter || button.dataset.aiCompanionChatFilter || "all";
        updateWorkspaceFilterSelections();
        workspaceChatVisibleLimit = WORKSPACE_CHAT_PAGE_SIZE;
        workspaceChatFilterMenu.hidden = true;
        workspaceChatFilterButton?.setAttribute("aria-expanded", "false");
        renderWorkspaceChatHistory(workspaceChatIndexes);
      });
    });
    workspaceChatsTab?.addEventListener("click", () => setWorkspaceHistoryTab("chats"));
    workspacePlansTab?.addEventListener("click", () => setWorkspaceHistoryTab("plans"));
    workspacePlanSearch?.addEventListener("input", () => renderWorkspaceSidebarPlans(repositoryPlans));
    workspacePlanFilterButton?.addEventListener("click", () => {
      if (!workspacePlanFilterMenu) return;
      workspacePlanFilterMenu.hidden = workspacePlanFilterMenu.hidden === false;
      workspacePlanFilterButton.setAttribute("aria-expanded", workspacePlanFilterMenu.hidden ? "false" : "true");
    });
    workspacePlanFilterMenu?.querySelectorAll?.("[data-ai-companion-workspace-plan-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        workspacePlanFilter = button.dataset.aiCompanionWorkspacePlanFilter || "all";
        updateWorkspaceFilterSelections();
        workspacePlanFilterMenu.hidden = true;
        workspacePlanFilterButton?.setAttribute("aria-expanded", "false");
        renderWorkspaceSidebarPlans(repositoryPlans);
      });
    });
    renderWorkspaceNewChatModeButtons();
    updateWorkspaceFilterSelections();
    workspaceNewChatButton?.addEventListener("click", () => { void startWorkspaceNewChat(activeTab); });
    workspaceNewChatMenuButton?.addEventListener("click", () => setWorkspaceNewChatMenuOpen(workspaceNewChatMenuList?.hidden !== false));
    workspaceNewChatMenuList?.querySelectorAll?.("[data-ai-companion-workspace-new-chat-mode]").forEach((button) => {
      button.addEventListener("click", () => { void startWorkspaceNewChat(button.dataset.aiCompanionWorkspaceNewChatMode || "chat"); });
    });
    workspaceTitleEditButton?.addEventListener("click", () => {
      const displayChat = getActiveWorkspaceChatDisplaySource();
      if (displayChat) void renameSavedChat(displayChat);
    });
    workspaceTaskDetailsToggle?.addEventListener("click", toggleWorkspaceTaskDetails);
    workspaceNewPlanButton?.addEventListener("click", () => { void startWorkspaceNewChat("plan"); });
    panel.querySelectorAll?.("[data-ai-companion-inspector-info]").forEach((button) => {
      button.addEventListener("click", () => showWorkspaceInfoPopover(button));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault?.();
        event.stopPropagation?.();
        showWorkspaceInfoPopover(button);
      });
    });
    panel.querySelectorAll?.("[data-ai-companion-inspector-toggle]").forEach((button) => button.addEventListener("click", () => toggleWorkspaceInspectorSection(button)));
    workspaceHistoryResizer?.addEventListener("mousedown", (event) => startWorkspaceResize("history", event));
    workspaceInspectorResizer?.addEventListener("mousedown", (event) => startWorkspaceResize("inspector", event));
    workspaceHistoryResizer?.addEventListener("keydown", (event) => handleWorkspaceResizeKeydown("history", event));
    workspaceInspectorResizer?.addEventListener("keydown", (event) => handleWorkspaceResizeKeydown("inspector", event));
    document.addEventListener("mousemove", handleWorkspaceResize);
    document.addEventListener("mouseup", stopWorkspaceResize);
    agentInput?.addEventListener("keydown", (event) => {
      if (shouldSubmitPromptFromKeydown(event)) {
        event.preventDefault?.();
        void runCompanionPrompt();
      }
    });
    toolLog?.addEventListener("scroll", () => {
      shouldAutoScrollToolLog = isToolLogAtEnd();
      if (toolLog.scrollTop < 32) void loadOlderAgentHistory();
    });

    selectTab(activeTab, { persist: false });
    updateAgentRunButton();
    setOpen(false, { persist: false });

    const api = { setOpen, setWorkspaceOpen, closeWorkspaceForExternalNavigation, selectTab, refreshModeMessages, setStatus, refreshChatSelectOptions, refreshPlans: loadRepositoryPlans, setPlansViewOpen, runProblemFix };
    app.registerModule("aiCompanionPanel", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionPanel = registerMarkdownViewerAiCompanionPanel;
})(window, document);

