const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

test("AI autocomplete builds context from a bounded CodeMirror document window", () => {
  const controllerSource = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "autocomplete", "index.js"), "utf8");
  const contextWindowSource = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "autocomplete", "context-window.js"), "utf8");

  assert.doesNotMatch(controllerSource, /view\.state\.doc\.toString\(\)/);
  assert.match(controllerSource, /contextWindow\.shapeDocumentWindow\(view\.state\.doc, position\)/);
  assert.match(controllerSource, /if \(!settings\.enabled \|\| !settings\.autocompleteEnabled\)/);
  assert.match(contextWindowSource, /documentText\.sliceString\(documentText\.line\(prefixStartLine\)\.from, position\)/);
  assert.match(contextWindowSource, /documentText\.sliceString\(position, documentText\.line\(suffixEndLine\)\.to\)/);
});

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.values.has(name) : !!force;
    if (shouldAdd) this.values.add(name);
    else this.values.delete(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(id = "", tagName = "div") {
    this.id = id;
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.classList = new FakeClassList(this);
    this.className = "";
    this.dataset = {};
    this.listeners = new Map();
    const styleValues = new Map();
    this.style = {
      setProperty: (name, value) => styleValues.set(name, String(value)),
      getPropertyValue: (name) => styleValues.get(name) || "",
      removeProperty: (name) => styleValues.delete(name)
    };
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this._textContent = "";
    this.innerHTML = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.isConnected = false;
  }

  set textContent(value) {
    this._textContent = String(value || "");
    this.children = [];
    this.innerHTML = "";
  }

  get textContent() {
    const childText = this.children.map((child) => child.textContent || "").join("");
    return childText || this._textContent || "";
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }
  appendChild(child) {
    if (child.parentNode?.removeChild) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.isConnected = this.isConnected || this.id === "body";
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.isConnected = false;
    return child;
  }

  prepend(child) {
    child.parentNode = this;
    child.isConnected = this.isConnected || this.id === "body";
    this.children.unshift(child);
    return child;
  }

  insertBefore(child, before) {
    if (child.parentNode?.removeChild) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.isConnected = this.isConnected || this.id === "body";
    const index = this.children.indexOf(before);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.innerHTML = "";
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (this.parentNode?.removeChild) this.parentNode.removeChild(this);
  }

  after(...nodes) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index < 0) return;
    nodes.forEach((node, offset) => {
      if (node.parentNode?.removeChild) node.parentNode.removeChild(node);
      node.parentNode = this.parentNode;
      node.isConnected = this.parentNode.isConnected;
      this.parentNode.children.splice(index + offset + 1, 0, node);
    });
  }

  get nextElementSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] || null : null;
  }

  focus() {
    this.focused = true;
  }

  select() {}

  getBoundingClientRect() {
    return this.rect || { width: 1280, height: 720, left: 0, right: 1280, top: 0, bottom: 720 };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }

  dispatchEvent(event) {
    const eventObject = typeof event === "string" ? { type: event } : event;
    eventObject.target = eventObject.target || this;
    eventObject.stopPropagation = eventObject.stopPropagation || function() {};
    (this.listeners.get(eventObject.type) || []).forEach((handler) => handler(eventObject));
  }

  click() {
    this.dispatchEvent({ type: "click", target: this });
  }

  matches(selector) {
    const hasClass = (name) => this.classList.contains(name) || this.className.split(/\s+/).filter(Boolean).includes(name);
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) return hasClass(selector.slice(1));
    if (selector === "[data-ai-companion-tab]") return !!this.dataset.aiCompanionTab;
    if (selector === "[data-ai-companion-workspace-new-chat-mode]") return !!this.dataset.aiCompanionWorkspaceNewChatMode;
    if (selector === "[data-ai-companion-workspace-chat-filter]") return !!this.dataset.aiCompanionWorkspaceChatFilter;
    if (selector === "[data-ai-companion-workspace-plan-filter]") return !!this.dataset.aiCompanionWorkspacePlanFilter;
    if (selector === "[data-ai-companion-workspace-tab]") return !!this.dataset.aiCompanionWorkspaceTab;
    if (selector === "[data-ai-companion-inspector-info]") return !!this.dataset.aiCompanionInspectorInfo;
    if (selector === "[data-ai-companion-inspector-toggle]") return !!this.dataset.aiCompanionInspectorToggle;
    if (selector === '[data-ai-companion-inspector-section="changes"]') return this.dataset.aiCompanionInspectorSection === "changes";
    if (selector === "[data-ai-companion-chat-action-menu=\"true\"]") return this.dataset.aiCompanionChatActionMenu === "true";
    if (selector === ".ai-companion-mode-menu") return hasClass("ai-companion-mode-menu");
    if (selector === ".ai-companion-chat-picker") return hasClass("ai-companion-chat-picker");
    return selector.toUpperCase?.() === this.tagName;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node.matches(selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedSavedChatResponse(harness, content, options = {}) {
  const chatId = options.chatId || "chat_20260703_170000_markdown";
  const taskId = options.taskId || "task_000001_20260703_170001_markdown";
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Chat",
    createdAt: 1783090800000,
    updatedAt: 1783090801000,
    tasks: [{
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      title: "Markdown response",
      createdAt: 1783090801000,
      updatedAt: 1783090801000,
      mode: options.mode,
      status: options.status || (options.isError ? "error" : "completed")
    }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${taskId}`, JSON.stringify({
    id: taskId,
    fileName: `${taskId}.json`,
    sequence: 1,
    prompt: "Markdown response",
    title: "Markdown response",
    createdAt: 1783090801000,
    updatedAt: 1783090801000,
    mode: options.mode,
    status: options.status || (options.isError ? "error" : "completed"),
    events: options.events || [{ type: "chat-response", content, isError: options.isError === true }]
  }));
}

function getTaskOutput(entry) {
  return entry?.querySelector?.(".ai-companion-agent-task-output") || null;
}

function getFirstChatResponse(harness) {
  return getTaskOutput(harness.toolLog.children[0])?.children[0] || null;
}

function clickChatMenuItem(harness, index = 0) {
  const item = harness.chatMenu.children[index];
  const titleButton = item?.querySelector?.(".ai-companion-chat-menu-title") || item;
  titleButton?.click?.();
}

function getNeutralinoSavedTaskRecords(harness) {
  return Array.from(harness.neutralinoFiles.entries())
    .filter(([filePath]) => filePath.endsWith(".json") && !filePath.endsWith("/index.json"))
    .map(([filePath, content]) => ({ filePath, record: JSON.parse(String(content)) }));
}

function createTextFile(name, content, options = {}) {
  return {
    name,
    type: options.type || "text/plain",
    size: options.size || String(content).length,
    lastModified: options.lastModified || 1783080000000,
    path: options.path || "",
    text: async () => String(content)
  };
}

function createImageFile(name, dataUrl, options = {}) {
  return {
    name,
    type: options.type || "image/png",
    size: options.size || 128,
    lastModified: options.lastModified || 1783080000000,
    path: options.path || "",
    dataUrl
  };
}

function createClipboardImageItem(file) {
  return {
    type: file.type,
    getAsFile: () => file
  };
}

function pasteIntoElement(element, items) {
  const event = {
    type: "paste",
    clipboardData: { items },
    preventDefault() { this.defaultPrevented = true; }
  };
  element.dispatchEvent(event);
  return event;
}

function pasteIntoPrompt(harness, items) {
  return pasteIntoElement(harness.agentInput, items);
}

function dropFilesOnPanel(harness, files) {
  const event = {
    type: "drop",
    dataTransfer: { files, items: files, dropEffect: "" },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
  harness.panel.dispatchEvent(event);
  return event;
}
function createPanelHarness(options = {}) {
  const elements = new Map();
  const panel = new FakeElement("ai-companion-panel");
  const closeButton = new FakeElement("ai-companion-close");
  const toggleButton = new FakeElement("toggle-ai-companion");
  toggleButton.classList.add("toggle-ai-companion-panel");

  const chatTab = new FakeElement("chat-tab");
  chatTab.dataset.aiCompanionTab = "chat";
  const agentTab = new FakeElement("agent-tab");
  agentTab.dataset.aiCompanionTab = "agent";
  const planTab = new FakeElement("plan-tab");
  planTab.dataset.aiCompanionTab = "plan";
  const modeIcon = new FakeElement("ai-companion-mode-icon");
  const plansToggleButton = new FakeElement("ai-companion-plans-toggle", "button");
  const agentView = new FakeElement("ai-companion-agent-view");
  agentView.classList.add("ai-companion-agent-view");
  const plansView = new FakeElement("ai-companion-plans-view");
  plansView.classList.add("ai-companion-plans-view");
  plansView.hidden = true;
  const plansStatusSelect = new FakeElement("ai-companion-plans-status", "select");
  plansStatusSelect.value = "all";
  const plansSearchInput = new FakeElement("ai-companion-plans-search", "input");
  const plansRefreshButton = new FakeElement("ai-companion-plans-refresh", "button");
  const plansList = new FakeElement("ai-companion-plans-list");
  const planDetail = new FakeElement("ai-companion-plan-detail");
  plansView.append(plansStatusSelect, plansSearchInput, plansRefreshButton, plansList, planDetail);
  const toolLog = new FakeElement("ai-companion-tool-log");
  const taskChangesSection = new FakeElement("ai-companion-workspace-changes-section", "section");
  taskChangesSection.classList.add("ai-companion-workspace-inspector-section", "ai-companion-workspace-changes-section");
  taskChangesSection.dataset.aiCompanionInspectorSection = "changes";
  taskChangesSection.hidden = true;
  const taskChangesHeader = new FakeElement("ai-companion-workspace-changes-header");
  taskChangesHeader.classList.add("ai-companion-workspace-inspector-header");
  const taskChangesTitle = new FakeElement("", "h3");
  taskChangesTitle.textContent = "Changes";
  taskChangesHeader.appendChild(taskChangesTitle);
  const taskChangesPanel = new FakeElement("ai-companion-workspace-changes");
  taskChangesPanel.classList.add("ai-companion-workspace-changes");
  taskChangesSection.append(taskChangesHeader, taskChangesPanel);
  const attachmentList = new FakeElement("ai-companion-attachment-list");
  attachmentList.classList.add("ai-companion-attachment-list");
  attachmentList.hidden = true;
  const attachmentInput = new FakeElement("ai-companion-attachment-input", "input");
  const attachFilesButton = new FakeElement("ai-companion-attach-files", "button");
  attachFilesButton.classList.add("folder-tree-tool-button", "ai-companion-attach-files");
  attachFilesButton.setAttribute("title", "Attach files");
  attachFilesButton.setAttribute("aria-label", "Attach files");
  const attachFilesIcon = new FakeElement("", "i");
  attachFilesIcon.classList.add("bi", "bi-paperclip");
  attachFilesIcon.setAttribute("aria-hidden", "true");
  attachFilesButton.appendChild(attachFilesIcon);
  const agentInput = new FakeElement("ai-companion-agent-task");
  const agentRunButton = new FakeElement("ai-companion-agent-run");
  const agentActions = new FakeElement("ai-companion-agent-actions");
  agentActions.classList.add("ai-companion-agent-actions");
  const agentComposer = new FakeElement("ai-companion-agent-composer");
  agentComposer.classList.add("ai-companion-agent-composer");
  agentView.rect = { width: 400, height: 720, left: 0, right: 400, top: 0, bottom: 720 };
  agentComposer.rect = { width: 400, height: 100, left: 0, right: 400, top: 620, bottom: 720 };
  const modeMenu = new FakeElement("ai-companion-mode-menu");
  modeMenu.classList.add("ai-companion-mode-menu");
  const modeMenuToggle = new FakeElement("ai-companion-mode-menu-toggle", "button");
  modeMenuToggle.classList.add("ai-companion-mode-menu-toggle");
  const modeMenuList = new FakeElement("ai-companion-mode-menu-list");
  modeMenuList.classList.add("ai-companion-mode-menu-list");
  modeMenuList.hidden = true;
  modeMenuList.append(chatTab, agentTab, planTab);
  modeMenu.append(modeMenuToggle, modeMenuList);
  agentActions.append(modeMenu, attachFilesButton, agentRunButton);
  const newAgentButton = new FakeElement("ai-companion-agent-new");
  const chatPicker = new FakeElement("ai-companion-chat-picker");
  chatPicker.classList.add("ai-companion-chat-picker");
  const chatSelect = new FakeElement("ai-companion-chat-select");
  const chatSelectLabel = new FakeElement("ai-companion-chat-select-label");
  chatSelectLabel.classList.add("ai-companion-chat-select-label");
  const chatMenu = new FakeElement("ai-companion-chat-menu");
  chatMenu.hidden = true;
  chatSelect.appendChild(chatSelectLabel);
  chatPicker.append(chatSelect, chatMenu);
  const disabledNotice = new FakeElement("ai-companion-disabled-notice");
  disabledNotice.hidden = true;
  const tokenElement = new FakeElement("ai-companion-token-estimate");
  const elapsedElement = new FakeElement("ai-companion-elapsed");
  const workspaceHistory = new FakeElement("ai-companion-workspace-history");
  workspaceHistory.classList.add("ai-companion-workspace-history");
  workspaceHistory.hidden = true;
  const workspaceHistoryTitle = new FakeElement("ai-companion-workspace-history-title", "h2");
  workspaceHistoryTitle.textContent = "Recent chats";
  const workspaceHistoryTabs = new FakeElement("ai-companion-workspace-history-tabs");
  const workspaceChatsTab = new FakeElement("ai-companion-workspace-chats-tab", "button");
  workspaceChatsTab.dataset.aiCompanionWorkspaceTab = "chats";
  workspaceChatsTab.classList.add("ai-companion-workspace-history-tab", "active");
  workspaceChatsTab.setAttribute("aria-selected", "true");
  const workspacePlansTab = new FakeElement("ai-companion-workspace-plans-tab", "button");
  workspacePlansTab.dataset.aiCompanionWorkspaceTab = "plans";
  workspacePlansTab.classList.add("ai-companion-workspace-history-tab");
  workspacePlansTab.setAttribute("aria-selected", "false");
  workspaceHistoryTabs.append(workspaceChatsTab, workspacePlansTab);
  const workspaceChatsPane = new FakeElement("ai-companion-workspace-chats-pane");
  workspaceChatsPane.classList.add("ai-companion-workspace-history-pane", "active");
  const workspacePlansPane = new FakeElement("ai-companion-workspace-plans-pane");
  workspacePlansPane.classList.add("ai-companion-workspace-history-pane");
  workspacePlansPane.hidden = true;
  const workspaceChatSearch = new FakeElement("ai-companion-workspace-chat-search", "input");
  const workspaceChatFilterButton = new FakeElement("ai-companion-workspace-chat-filter", "button");
  const workspaceChatFilterMenu = new FakeElement("ai-companion-workspace-chat-filter-menu");
  workspaceChatFilterMenu.hidden = true;
  const workspaceChatFilterAll = new FakeElement("", "button");
  workspaceChatFilterAll.dataset.aiCompanionWorkspaceChatFilter = "all";
  const workspaceChatFilterChat = new FakeElement("", "button");
  workspaceChatFilterChat.dataset.aiCompanionWorkspaceChatFilter = "chat";
  const workspaceChatFilterAgent = new FakeElement("", "button");
  workspaceChatFilterAgent.dataset.aiCompanionWorkspaceChatFilter = "agent";
  const workspaceChatFilterPlan = new FakeElement("", "button");
  workspaceChatFilterPlan.dataset.aiCompanionWorkspaceChatFilter = "plan";
  workspaceChatFilterMenu.append(workspaceChatFilterAll, workspaceChatFilterChat, workspaceChatFilterAgent, workspaceChatFilterPlan);
  const workspaceChatList = new FakeElement("ai-companion-workspace-chat-list");
  const workspaceNewChatRow = new FakeElement("ai-companion-workspace-new-chat-row");
  workspaceNewChatRow.classList.add("ai-companion-workspace-new-chat-row");
  const workspaceNewChatButton = new FakeElement("ai-companion-workspace-new-chat", "button");
  const workspaceNewChatIcon = new FakeElement("", "i");
  workspaceNewChatIcon.className = "bi bi-plus-lg";
  workspaceNewChatIcon.setAttribute("aria-hidden", "true");
  const workspaceNewChatLabel = new FakeElement("", "span");
  workspaceNewChatLabel.textContent = "New Chat";
  workspaceNewChatButton.append(workspaceNewChatIcon, workspaceNewChatLabel);
  const workspaceNewChatMenuButton = new FakeElement("ai-companion-workspace-new-chat-menu", "button");
  const workspaceNewChatMenuList = new FakeElement("ai-companion-workspace-new-chat-menu-list");
  workspaceNewChatMenuList.hidden = true;
  const workspaceNewChatModeChat = new FakeElement("", "button");
  workspaceNewChatModeChat.dataset.aiCompanionWorkspaceNewChatMode = "chat";
  const workspaceNewChatModeAgent = new FakeElement("", "button");
  workspaceNewChatModeAgent.dataset.aiCompanionWorkspaceNewChatMode = "agent";
  const workspaceNewChatModePlan = new FakeElement("", "button");
  workspaceNewChatModePlan.dataset.aiCompanionWorkspaceNewChatMode = "plan";
  workspaceNewChatMenuList.append(workspaceNewChatModeChat, workspaceNewChatModeAgent, workspaceNewChatModePlan);
  workspaceNewChatRow.append(workspaceNewChatButton, workspaceNewChatMenuButton, workspaceNewChatMenuList);
  workspaceChatsPane.append(workspaceChatSearch, workspaceChatFilterButton, workspaceChatFilterMenu, workspaceChatList, workspaceNewChatRow);
  const workspacePlanSearch = new FakeElement("ai-companion-workspace-plan-search", "input");
  const workspacePlanFilterButton = new FakeElement("ai-companion-workspace-plan-filter", "button");
  const workspacePlanFilterMenu = new FakeElement("ai-companion-workspace-plan-filter-menu");
  workspacePlanFilterMenu.hidden = true;
  const workspacePlanFilterAll = new FakeElement("", "button");
  workspacePlanFilterAll.dataset.aiCompanionWorkspacePlanFilter = "all";
  const workspacePlanFilterPlanned = new FakeElement("", "button");
  workspacePlanFilterPlanned.dataset.aiCompanionWorkspacePlanFilter = "planned";
  const workspacePlanFilterImplemented = new FakeElement("", "button");
  workspacePlanFilterImplemented.dataset.aiCompanionWorkspacePlanFilter = "implemented";
  workspacePlanFilterMenu.append(workspacePlanFilterAll, workspacePlanFilterPlanned, workspacePlanFilterImplemented);
  const workspaceNewPlanButton = new FakeElement("ai-companion-workspace-new-plan", "button");
  const workspacePlansControls = new FakeElement("ai-companion-workspace-plans-controls");
  workspacePlansControls.append(workspacePlanSearch, workspacePlanFilterButton, workspaceNewPlanButton, workspacePlanFilterMenu);
  const workspaceSidebarPlans = new FakeElement("ai-companion-workspace-sidebar-plans");
  workspaceSidebarPlans.classList.add("ai-companion-workspace-saved-plans", "ai-companion-workspace-sidebar-plans");
  workspacePlansPane.append(workspacePlansControls, workspaceSidebarPlans);
  workspaceHistory.append(workspaceHistoryTitle, workspaceHistoryTabs, workspaceChatsPane, workspacePlansPane);
  const workspaceHeading = new FakeElement("ai-companion-workspace-heading");
  workspaceHeading.classList.add("ai-companion-workspace-heading");
  workspaceHeading.hidden = true;
  const workspaceHeaderMeta = new FakeElement("ai-companion-workspace-header-meta");
  workspaceHeaderMeta.classList.add("ai-companion-workspace-header-meta");
  workspaceHeaderMeta.hidden = true;
  const workspaceChatTitle = new FakeElement("ai-companion-workspace-chat-title");
  const workspaceTitleEditButton = new FakeElement("ai-companion-workspace-title-edit", "button");
  const workspaceTaskDetailsAnchor = new FakeElement("ai-companion-workspace-task-details-anchor");
  workspaceTaskDetailsAnchor.classList.add("ai-companion-workspace-task-details-anchor");
  const workspaceTaskDetailsToggle = new FakeElement("ai-companion-workspace-task-details-toggle", "button");
  const workspaceTaskDetailsPopover = new FakeElement("ai-companion-workspace-task-details-popover");
  workspaceTaskDetailsPopover.classList.add("ai-companion-workspace-task-details-popover");
  workspaceTaskDetailsPopover.hidden = true;
  const workspaceTaskDetails = new FakeElement("ai-companion-workspace-task-details");
  workspaceTaskDetails.classList.add("ai-companion-workspace-summary-list");
  workspaceTaskDetailsPopover.appendChild(workspaceTaskDetails);
  workspaceTaskDetailsAnchor.append(workspaceTaskDetailsToggle, workspaceTaskDetailsPopover);
  const workspaceStatusChip = new FakeElement("ai-companion-workspace-status-chip");
  const workspaceModeChip = new FakeElement("ai-companion-workspace-mode-chip");
  const workspaceModelChip = new FakeElement("ai-companion-workspace-model-chip");
  const workspaceTimeChip = new FakeElement("ai-companion-workspace-time-chip");
  workspaceHeaderMeta.append(workspaceStatusChip, workspaceModeChip, workspaceModelChip, workspaceTimeChip);
  workspaceHeading.append(workspaceChatTitle, workspaceTitleEditButton, workspaceTaskDetailsAnchor);
  const workspaceRestoreButton = new FakeElement("ai-companion-workspace-restore", "button");
  workspaceRestoreButton.hidden = true;
  const workspaceHistoryResizer = new FakeElement("ai-companion-workspace-history-resizer");
  workspaceHistoryResizer.classList.add("ai-companion-workspace-resizer", "ai-companion-workspace-history-resizer");
  workspaceHistoryResizer.hidden = true;
  const workspaceInspectorResizer = new FakeElement("ai-companion-workspace-inspector-resizer");
  workspaceInspectorResizer.classList.add("ai-companion-workspace-resizer", "ai-companion-workspace-inspector-resizer");
  workspaceInspectorResizer.hidden = true;
  const workspaceInspector = new FakeElement("ai-companion-workspace-inspector");
  workspaceInspector.classList.add("ai-companion-workspace-inspector");
  workspaceInspector.hidden = true;
  const workspaceContextSection = new FakeElement("", "section");
  workspaceContextSection.classList.add("ai-companion-workspace-inspector-section");
  const workspaceToolsSection = new FakeElement("", "section");
  workspaceToolsSection.classList.add("ai-companion-workspace-inspector-section");
  const workspaceApprovalsSection = new FakeElement("", "section");
  workspaceApprovalsSection.classList.add("ai-companion-workspace-inspector-section");
  const workspaceContextToggle = new FakeElement("ai-companion-workspace-context-toggle", "button");
  workspaceContextToggle.classList.add("ai-companion-workspace-inspector-toggle");
  workspaceContextToggle.dataset.aiCompanionInspectorToggle = "context";
  workspaceContextToggle.setAttribute("aria-expanded", "true");
  const workspaceContextInfoButton = new FakeElement("ai-companion-workspace-context-info", "button");
  workspaceContextInfoButton.classList.add("ai-companion-workspace-inspector-info");
  workspaceContextInfoButton.dataset.aiCompanionInspectorInfo = "context";
  workspaceContextInfoButton.setAttribute("aria-expanded", "false");
  const workspaceToolsToggle = new FakeElement("ai-companion-workspace-tools-toggle", "button");
  workspaceToolsToggle.classList.add("ai-companion-workspace-inspector-toggle");
  workspaceToolsToggle.dataset.aiCompanionInspectorToggle = "tools";
  workspaceToolsToggle.setAttribute("aria-expanded", "true");
  const workspaceToolsInfoButton = new FakeElement("ai-companion-workspace-tools-info", "button");
  workspaceToolsInfoButton.classList.add("ai-companion-workspace-inspector-info");
  workspaceToolsInfoButton.dataset.aiCompanionInspectorInfo = "tools";
  workspaceToolsInfoButton.setAttribute("aria-expanded", "false");
  const workspaceApprovalsToggle = new FakeElement("ai-companion-workspace-approvals-toggle", "button");
  workspaceApprovalsToggle.classList.add("ai-companion-workspace-inspector-toggle");
  workspaceApprovalsToggle.dataset.aiCompanionInspectorToggle = "approvals";
  workspaceApprovalsToggle.setAttribute("aria-expanded", "true");
  const workspaceApprovalsInfoButton = new FakeElement("ai-companion-workspace-approvals-info", "button");
  workspaceApprovalsInfoButton.classList.add("ai-companion-workspace-inspector-info");
  workspaceApprovalsInfoButton.dataset.aiCompanionInspectorInfo = "approvals";
  workspaceApprovalsInfoButton.setAttribute("aria-expanded", "false");
  const workspaceInspectorInfoPopover = new FakeElement("ai-companion-workspace-inspector-info-popover");
  workspaceInspectorInfoPopover.classList.add("ai-companion-workspace-inspector-info-popover");
  workspaceInspectorInfoPopover.hidden = true;
  const workspaceInspectorInfoTitle = new FakeElement("ai-companion-workspace-inspector-info-title", "strong");
  const workspaceInspectorInfoBody = new FakeElement("ai-companion-workspace-inspector-info-body", "p");
  workspaceInspectorInfoPopover.append(workspaceInspectorInfoTitle, workspaceInspectorInfoBody);
  const workspaceContext = new FakeElement("ai-companion-workspace-context");
  workspaceContext.classList.add("ai-companion-workspace-summary-list");
  const workspaceTools = new FakeElement("ai-companion-workspace-tools");
  workspaceTools.classList.add("ai-companion-workspace-summary-list");
  const workspaceApprovals = new FakeElement("ai-companion-workspace-approvals");
  workspaceApprovals.classList.add("ai-companion-workspace-summary-list");
  const workspaceContextStrip = new FakeElement("ai-companion-workspace-context-strip");
  workspaceContextStrip.classList.add("ai-companion-workspace-context-strip");
  workspaceContextStrip.hidden = true;
  const workspaceAddContextButton = new FakeElement("ai-companion-workspace-add-context", "button");
  workspaceAddContextButton.setAttribute("title", "Add files or paste text or images into the chat's context as part of the prompt");
  workspaceAddContextButton.setAttribute("aria-label", "Attache files");
  const workspaceAddContextLabel = new FakeElement("", "span");
  workspaceAddContextLabel.textContent = "Attache files";
  workspaceAddContextButton.appendChild(workspaceAddContextLabel);
  const workspaceContextCount = new FakeElement("ai-companion-workspace-context-count");
  workspaceContextStrip.append(workspaceAddContextButton, workspaceContextCount);
  workspaceContextSection.append(workspaceContextToggle, workspaceContextInfoButton, workspaceContext);
  workspaceToolsSection.append(workspaceToolsToggle, workspaceToolsInfoButton, workspaceTools);
  workspaceApprovalsSection.append(workspaceApprovalsToggle, workspaceApprovalsInfoButton, workspaceApprovals);
  workspaceInspector.append(workspaceContextSection, workspaceToolsSection, workspaceApprovalsSection, workspaceInspectorInfoPopover);

  agentComposer.append(attachmentList, agentInput, attachmentInput, agentActions);
  agentView.append(toolLog, taskChangesSection, disabledNotice, workspaceContextStrip, agentComposer);
  [workspaceHistory, workspaceHistoryResizer, modeIcon, workspaceHeading, workspaceHeaderMeta, workspaceRestoreButton, plansToggleButton, newAgentButton, chatPicker, plansView, agentView, workspaceInspectorResizer, workspaceInspector, tokenElement, elapsedElement]
    .forEach((element) => panel.appendChild(element));
  [panel, closeButton, toggleButton, chatTab, agentTab, planTab, modeIcon, plansToggleButton, agentView, plansView, plansStatusSelect, plansSearchInput, plansRefreshButton, plansList, planDetail, toolLog, taskChangesSection, taskChangesPanel, disabledNotice, attachmentList, attachmentInput, attachFilesButton, agentInput, agentRunButton, agentActions, agentComposer, modeMenu, modeMenuToggle, modeMenuList, newAgentButton, chatPicker, chatSelect, chatSelectLabel, chatMenu, tokenElement, elapsedElement, workspaceHistory, workspaceHistoryResizer, workspaceChatsTab, workspacePlansTab, workspaceChatsPane, workspacePlansPane, workspaceChatSearch, workspaceChatFilterButton, workspaceChatFilterMenu, workspaceChatList, workspaceNewChatButton, workspaceNewChatMenuButton, workspaceNewChatMenuList, workspaceHeading, workspaceHeaderMeta, workspaceChatTitle, workspaceTitleEditButton, workspaceTaskDetailsAnchor, workspaceTaskDetailsToggle, workspaceTaskDetailsPopover, workspaceStatusChip, workspaceModeChip, workspaceModelChip, workspaceTimeChip, workspaceRestoreButton, workspaceInspectorResizer, workspaceInspector, workspaceContextSection, workspaceToolsSection, workspaceApprovalsSection, workspaceContextToggle, workspaceToolsToggle, workspaceApprovalsToggle, workspaceContextInfoButton, workspaceToolsInfoButton, workspaceApprovalsInfoButton, workspaceInspectorInfoPopover, workspaceInspectorInfoTitle, workspaceInspectorInfoBody, workspaceContext, workspaceTools, workspaceApprovals, workspaceTaskDetails, workspaceNewPlanButton, workspaceContextStrip, workspaceAddContextButton, workspaceContextCount]
    .forEach((element) => elements.set(element.id, element));

  const documentListeners = new Map();
  const neutralinoEventListeners = new Map();
  const document = {
    body: new FakeElement("body"),
    createElement: (tagName) => new FakeElement("", tagName),
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (selector) => Array.from(elements.values()).filter((element) => element.matches(selector)),
    elementFromPoint: options.elementFromPoint || (() => null),
    addEventListener(name, handler) {
      const handlers = documentListeners.get(name) || [];
      handlers.push(handler);
      documentListeners.set(name, handlers);
    },
    removeEventListener(name, handler) {
      const handlers = documentListeners.get(name) || [];
      documentListeners.set(name, handlers.filter((candidate) => candidate !== handler));
    },    dispatchEvent(event) {
      const eventObject = typeof event === "string" ? { type: event } : event;
      eventObject.target = eventObject.target || this.body;
      (documentListeners.get(eventObject.type) || []).forEach((handler) => handler(eventObject));
    }
  };

  const savedPatches = [];
  const appDebugLogs = [];
  let currentSettings = options.settings || { enabled: true, chatEnabled: true, agentEnabled: true };
  const app = {
    modules: options.modules || {},
    services: options.appServices || {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
  const storage = new Map();
  const neutralinoDirectories = options.neutralinoDirectories || new Map();
  const neutralinoFiles = options.neutralinoFiles || new Map();
  const neutralinoWrites = options.neutralinoWrites || [];
  const openedDocuments = [];
  const openedFolders = [];
  const reloadedPaths = [];
  const clipboardWrites = [];
  const neutralino = options.isNeutralinoRuntime ? {
    filesystem: {
      createDirectory: async () => {},
      readDirectory: async (directoryPath) => neutralinoDirectories.get(directoryPath) || [],
      getStats: async (filePath) => {
        if (!neutralinoFiles.has(filePath)) throw new Error(`Missing fake file: ${filePath}`);
        const value = neutralinoFiles.get(filePath);
        return { size: value instanceof Uint8Array ? value.byteLength : String(value || "").length, modifiedAt: 1783080000000 };
      },
      readFile: async (filePath) => {
        if (!neutralinoFiles.has(filePath)) throw new Error(`Missing fake file: ${filePath}`);
        return neutralinoFiles.get(filePath);
      },
      readBinaryFile: async (filePath) => {
        if (!neutralinoFiles.has(filePath)) throw new Error(`Missing fake file: ${filePath}`);
        const value = neutralinoFiles.get(filePath);
        return value instanceof Uint8Array ? value : new Uint8Array(Buffer.from(String(value), "binary"));
      },
      writeFile: async (filePath, content) => {
        neutralinoWrites.push({ filePath, content: String(content) });
        neutralinoFiles.set(filePath, String(content));
      },
      writeBinaryFile: async (filePath, content) => {
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content || []);
        neutralinoWrites.push({ filePath, content: bytes });
        neutralinoFiles.set(filePath, bytes);
      }
    },
    events: {
      on: async (name, handler) => {
        const handlers = neutralinoEventListeners.get(name) || [];
        handlers.push(handler);
        neutralinoEventListeners.set(name, handlers);
      },
      off: async (name, handler) => {
        const handlers = neutralinoEventListeners.get(name) || [];
        neutralinoEventListeners.set(name, handlers.filter((candidate) => candidate !== handler));
      }
    },
    os: {
      showOpenDialog: async () => options.openDialogSelection || []
    }
  } : undefined;
  const context = {
    console,
    document,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    btoa: (value) => Buffer.from(String(value), "binary").toString("base64"),
    atob: (value) => Buffer.from(String(value), "base64").toString("binary"),
    matchMedia: () => ({ matches: true }),
    navigator: {
      clipboard: {
        writeText: async (value) => {
          if (options.clipboardWriteError) throw options.clipboardWriteError;
          clipboardWrites.push(String(value));
        }
      }
    },
    isSecureContext: true,
    Date: options.Date || Date,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    setInterval: options.setInterval || setInterval,
    clearInterval: options.clearInterval || clearInterval,
    window: null
  };
  context.marked = options.marked;
  context.DOMPurify = options.DOMPurify;
  context.createMarkdownViewerAiCompanionActivityRenderer = options.createActivityRenderer;
  context.createMarkdownViewerAiCompanionContextIndicator = options.createContextIndicator;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "copy-actions.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "rate-limit-wait-countdown.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "user-input-interaction.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "panel.js"), "utf8"), context);

  const api = context.registerMarkdownViewerAiCompanionPanel(app, {
    bridge: options.bridge || {},
    getSettings: () => currentSettings,
    getWorkspaceRoot: () => options.workspaceRoot || "",
    getTabs: () => options.tabs || [],
    getActiveTabId: () => options.activeTabId || "",
    getProfileDataDirPath: async () => options.profileDir || "profile",
    isNeutralinoRuntime: () => options.isNeutralinoRuntime === true,
    joinPath: (...parts) => parts.filter(Boolean).join("/"),
    Neutralino: neutralino,
    appDebugLog: (level, message, details) => appDebugLogs.push({ level, message, details }),
    loadGlobalState: () => options.globalState || {},
    saveGlobalState: (patch) => savedPatches.push(patch),
    renderMarkdownContent: options.renderMarkdownContent,
    openDocumentSourceFile: options.openDocumentSourceFile || (async (source, openOptions) => {
      openedDocuments.push({ source, openOptions });
      return source;
    }),
    openFileCompareInTab: options.openFileCompareInTab,
    openPathInExplorer: async (path) => {
      openedFolders.push(path);
      return path;
    },
    reloadOpenTabsFromDisk: async (path) => {
      reloadedPaths.push(path);
      return true;
    }
  });

  return {
    api,
    app,
    document,
    panel,
    closeButton,
    workspaceHistory,
    workspaceHistoryResizer,
    workspaceHistoryTitle,
    workspaceChatsTab,
    workspacePlansTab,
    workspaceChatsPane,
    workspacePlansPane,
    workspaceChatSearch,
    workspaceChatFilterButton,
    workspaceChatFilterMenu,
    workspaceChatFilterChat,
    workspaceChatFilterAgent,
    workspaceChatFilterPlan,
    workspaceChatList,
    workspacePlanSearch,
    workspacePlanFilterButton,
    workspacePlanFilterMenu,
    workspacePlanFilterPlanned,
    workspacePlanFilterImplemented,
    workspaceSidebarPlans,
    workspaceChatTitle,
    workspaceTitleEditButton,
    workspaceTaskDetailsToggle,
    workspaceTaskDetailsPopover,
    workspaceNewChatButton,
    workspaceNewChatMenuButton,
    workspaceNewChatMenuList,
    workspaceNewChatModePlan,
    workspaceStatusChip,
    workspaceModeChip,
    workspaceModelChip,
    workspaceRestoreButton,
    workspaceInspectorResizer,
    workspaceInspector,
    workspaceContextSection,
    workspaceToolsSection,
    workspaceApprovalsSection,
    workspaceContextToggle,
    workspaceToolsToggle,
    workspaceApprovalsToggle,
    workspaceContextInfoButton,
    workspaceToolsInfoButton,
    workspaceApprovalsInfoButton,
    workspaceInspectorInfoPopover,
    workspaceInspectorInfoTitle,
    workspaceInspectorInfoBody,
    workspaceContext,
    workspaceTools,
    workspaceApprovals,
    workspaceNewPlanButton,
    workspaceTaskDetails,
    workspaceContextStrip,
    workspaceAddContextButton,
    workspaceContextCount,
    toggleButton,
    chatTab,
    agentTab,
    planTab,
    modeIcon,
    plansToggleButton,
    agentView,
    plansView,
    plansStatusSelect,
    plansSearchInput,
    plansRefreshButton,
    plansList,
    planDetail,
    chatSelect,
    chatSelectLabel,
    chatMenu,
    toolLog,
    taskChangesSection,
    taskChangesPanel,
    taskChangesToggle: panel.querySelector("#ai-companion-workspace-changes-toggle"),
    taskChangesSummary: panel.querySelector("#ai-companion-workspace-change-summary"),
    taskChangesList: panel.querySelector("#ai-companion-workspace-change-list"),
    agentComposer,
    attachmentList,
    attachmentInput,
    attachFilesButton,
    agentInput,
    agentRunButton,
    modeMenuList,
    disabledNotice,
    elapsedElement,
    savedPatches,
    appDebugLogs,
    storage,
    neutralinoWrites,
    neutralinoFiles,
    openedDocuments,
    openedFolders,
    reloadedPaths,
    clipboardWrites,
    dispatchNeutralinoEvent(name, detail) {
      (neutralinoEventListeners.get(name) || []).forEach((handler) => handler({ type: name, detail }));
    },
    setSettings(settings) {
      currentSettings = settings;
    }
  };
}

test("AI Companion panel visibility persists only user-driven open state changes", () => {
  const harness = createPanelHarness();

  assert.equal(harness.panel.hidden, true);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), false);
  assert.deepEqual(plain(harness.savedPatches), []);

  harness.toggleButton.click();

  assert.equal(harness.panel.hidden, false);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), true);
  assert.deepEqual(plain(harness.savedPatches), [{ aiCompanionPanelVisible: true }]);

  harness.toggleButton.click();

  assert.equal(harness.panel.hidden, true);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), false);
  assert.deepEqual(plain(harness.savedPatches), [
    { aiCompanionPanelVisible: true },
    { aiCompanionPanelVisible: false }
  ]);
});

test("AI Companion panel restore can update visibility without writing preferences", () => {
  const harness = createPanelHarness();

  harness.api.setOpen(true, { persist: false });

  assert.equal(harness.panel.hidden, false);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), true);
  assert.deepEqual(plain(harness.savedPatches), []);

  harness.api.setOpen(false, { persist: false });

  assert.equal(harness.panel.hidden, true);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), false);
  assert.deepEqual(plain(harness.savedPatches), []);
});

test("AI Companion pauses and resumes auto-scroll in compact and full layouts", async () => {
  async function verifyLayout(workspaceOpen) {
    let handleEvent;
    const harness = createPanelHarness({
      setInterval: () => 1,
      clearInterval: () => {},
      bridge: {
        chat: async (_payload, nextEvent) => {
          handleEvent = nextEvent;
          nextEvent({ type: "start" });
          return new Promise(() => {});
        }
      }
    });
    if (workspaceOpen) harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
    harness.toolLog.clientHeight = 200;
    harness.toolLog.scrollHeight = 1000;
    harness.agentInput.value = "Keep the history position stable";
    harness.agentInput.dispatchEvent("input");
    harness.agentRunButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(typeof handleEvent, "function");
    assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), workspaceOpen);
    assert.equal(harness.toolLog.scrollTop, 1000);

    harness.toolLog.scrollTop = 300;
    harness.toolLog.dispatchEvent("scroll");
    harness.toolLog.scrollHeight = 1100;
    handleEvent({ type: "content-delta", content: "Paused update" });
    assert.equal(harness.toolLog.scrollTop, 300);

    harness.toolLog.scrollTop = 899.5;
    harness.toolLog.dispatchEvent("scroll");
    harness.toolLog.scrollHeight = 1200;
    handleEvent({ type: "content-delta", content: "Following again" });
    assert.equal(harness.toolLog.scrollTop, 1200);
  }

  await verifyLayout(false);
  await verifyLayout(true);
});

test("AI Companion resets auto-scroll when starting a new chat", async () => {
  let responseNumber = 0;
  const harness = createPanelHarness({
    bridge: {
      chat: async () => ({ content: `Answer ${++responseNumber}` })
    }
  });
  harness.toolLog.clientHeight = 200;
  harness.toolLog.scrollHeight = 1000;
  harness.agentInput.value = "First chat";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  harness.toolLog.scrollTop = 300;
  harness.toolLog.dispatchEvent("scroll");
  const newChatButton = harness.panel.querySelector("#ai-companion-agent-new");
  assert.ok(newChatButton);
  newChatButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  harness.toolLog.scrollHeight = 1200;
  harness.agentInput.value = "Second chat";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.toolLog.scrollTop, 1200);
});
test("AI Companion creates the active chat card when a request starts", async () => {
  const harness = createPanelHarness({
    setInterval: () => 1,
    clearInterval: () => {},
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        return new Promise(() => {});
      }
    }
  });
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.agentInput.value = "Keep this new chat reachable";
  harness.agentInput.dispatchEvent("input");

  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const savedChat = JSON.parse(harness.storage.get("ai-companion-chats"));
  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  assert.equal(savedChat.tasks.length, 1);
  assert.equal(chatRow.dataset.chatId, savedChat.id);
  assert.match(chatRow.textContent, /Keep this new chat reachable/);
  assert.equal(chatRow.classList.contains("active"), true);
  assert.equal(chatRow.classList.contains("running"), true);
});
test("AI Companion mode selection persists user-driven mode changes", () => {
  const harness = createPanelHarness();

  harness.agentTab.click();

  assert.equal(harness.agentTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Describe the task you want done");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-robot");
  assert.equal(harness.modeIcon.getAttribute("aria-label"), "Agent mode");
  assert.deepEqual(plain(harness.savedPatches), [{ aiCompanionSelectedMode: "agent" }]);

  harness.planTab.click();

  assert.equal(harness.planTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Describe the change you want planned");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-list-check");
  assert.equal(harness.modeIcon.getAttribute("aria-label"), "Plan mode");

  harness.chatTab.click();

  assert.equal(harness.chatTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Ask anything about this project");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-chat-dots");
  assert.equal(harness.modeIcon.getAttribute("aria-label"), "Chat mode");
  assert.deepEqual(plain(harness.savedPatches), [
    { aiCompanionSelectedMode: "agent" },
    { aiCompanionSelectedMode: "plan" },
    { aiCompanionSelectedMode: "chat" }
  ]);
});

test("AI Companion mode restore can update selection without writing preferences", () => {
  const harness = createPanelHarness();

  harness.api.selectTab("agent", { persist: false });

  assert.equal(harness.agentTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Describe the task you want done");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-robot");
  assert.deepEqual(plain(harness.savedPatches), []);

  harness.api.selectTab("plan", { persist: false });

  assert.equal(harness.planTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Describe the change you want planned");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-list-check");

  harness.api.selectTab("unknown", { persist: false });

  assert.equal(harness.chatTab.getAttribute("aria-selected"), "true");
  assert.equal(harness.agentInput.placeholder, "Ask anything about this project");
  assert.equal(harness.modeIcon.className, "bi ai-companion-title-mode-icon bi-chat-dots");
  assert.equal(harness.modeIcon.getAttribute("aria-label"), "Chat mode");
  assert.deepEqual(plain(harness.savedPatches), []);
});


test("autonomous Plan mode accepts repository metadata and refreshes saved plans", async () => {
  const planContent = "# Autonomous Plan\n\n## M1: Persist it";
  const savedPlan = { id: "plan_autonomous_1", title: "Autonomous Plan", path: "companion/plans/2026/08/08/autonomous-plan.md", status: "planned", milestones: [{ id: "M1", title: "Persist it", status: "pending" }] };
  let plansListCalls = 0;
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: true, agentEnabled: true },
    bridge: {
      plan: async (_payload, handleEvent) => {
        handleEvent({ type: "run-started", architecture: "autonomous", mode: "plan" });
        handleEvent({ type: "plan-saved", plan: savedPlan });
        handleEvent({ type: "assistant-final", content: planContent, plan: savedPlan });
        handleEvent({ type: "run-completed", mode: "plan", plan: savedPlan });
        return { content: planContent, architecture: "autonomous", plan: savedPlan };
      },
      plansList: async () => { plansListCalls += 1; return { plans: [savedPlan] }; }
    }
  });

  harness.planTab.click();
  harness.agentInput.value = "Create an autonomous plan";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  const savedTask = savedIndex.tasks[0];
  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${savedTask.id}`));
  assert.equal(savedRecord.status, "planned");
  assert.equal(savedRecord.plan.id, savedPlan.id);
  assert.equal(savedRecord.plan.path, savedPlan.path);
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.plan, "content"), false);
  assert.equal(plansListCalls > 0, true);
});

test("AI Companion exposes mode-filtered slash workflows and durable schedule polling", () => {
  const panelSource = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "panel.js"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8");
  assert.match(panelSource, /attachSlashWorkflowSuggestions\(agentInput, getSelectedRunMode\)/);
  assert.match(panelSource, /attachSlashWorkflowSuggestions\(textarea, getSelectedRunMode\)/);
  assert.match(panelSource, /allowedModes\.includes\(mode\)/);
  assert.match(panelSource, /schedulesClaimDue/);
  assert.match(panelSource, /capabilityBoundary/);
  assert.match(bridgeSource, /schedulesClaimDue/);
  assert.match(bridgeSource, /scheduleComplete/);
});

test("autonomous Plan mode does not synthesize saved metadata without a repository result", async () => {
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: true, agentEnabled: true },
    bridge: {
      plan: async (_payload, handleEvent) => {
        handleEvent({ type: "assistant-final", content: "# Unsaved Plan" });
        handleEvent({ type: "run-completed", mode: "plan" });
        return { content: "# Unsaved Plan", architecture: "autonomous" };
      }
    }
  });

  harness.planTab.click();
  harness.agentInput.value = "Create a plan";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  const savedTask = savedIndex.tasks[0];
  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${savedTask.id}`));
  assert.equal(savedRecord.status, "error");
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord, "plan"), false);
});

test("autonomous Agent mode does not mark an empty final response completed", async () => {
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: true, agentEnabled: true },
    bridge: {
      agent: async (_payload, handleEvent) => {
        handleEvent({ type: "run-started", architecture: "autonomous", mode: "agent" });
        handleEvent({ type: "assistant-final", content: "" });
        handleEvent({ type: "run-completed", mode: "agent" });
        return { content: "", architecture: "autonomous" };
      }
    }
  });

  harness.agentTab.click();
  harness.agentInput.value = "Perform a task";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  const savedTask = savedIndex.tasks[0];
  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${savedTask.id}`));
  assert.equal(savedRecord.status, "error");
  assert.equal(savedRecord.events.some((event) => event.type === "chat-response" && !event.content), false);
});

test("AI Companion task entries include workspace role badges", async () => {
  const harness = createPanelHarness({
    bridge: {
      chat: async () => ({ content: "Badge response" })
    }
  });

  harness.agentInput.value = "Badge prompt";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const entry = harness.toolLog.children[0];
  const promptBadge = entry.querySelector(".ai-companion-agent-task-prompt").querySelector(".ai-companion-workspace-role-badge");
  const responseBadge = entry.querySelector(".ai-companion-chat-response").querySelector(".ai-companion-workspace-role-badge");

  assert.equal(promptBadge.getAttribute("data-role-label"), "You");
  assert.equal(responseBadge.getAttribute("data-role-label"), "Agent");
  assert.match(promptBadge.className, /user/);
  assert.match(responseBadge.className, /agent/);
  assert.match(promptBadge.querySelector("i").className, /bi-person-circle/);
  assert.match(responseBadge.querySelector("i").className, /bi-stars/);
});

test("AI Companion edited prompt composer exposes Plan mode", async () => {
  const harness = createPanelHarness({
    bridge: {
      chat: async () => ({ content: "Answer" })
    }
  });

  harness.agentInput.value = "Original prompt";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const modeButtons = entry.querySelectorAll("[data-ai-companion-tab]");

  assert.equal(modeButtons.some((button) => button.dataset.aiCompanionTab === "plan"), true);
});

test("AI Companion Plans browser lists and manages saved plan cards", async () => {
  const calls = [];
  const planList = [{
    id: "",
    title: "Storage plan",
    status: "planned",
    path: "companion/plans/2026/07/06/storage-plan.md",
    relativePath: "2026/07/06/storage-plan.md",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    milestones: [{ id: "M1", title: "Inspect storage", status: "pending" }]
  }];
  let currentPlan = { ...planList[0], body: "# Storage plan\n\n## Milestones\n- M1: Inspect storage", content: "---\nstatus: planned\n---\n# Storage plan\n\n## Milestones\n- M1: Inspect storage" };
  const harness = createPanelHarness({
    profileDir: "C:/Users/shayg/.md-editor",
    appServices: { confirm: async () => true },
    bridge: {
      plansList: async (payload) => { calls.push({ action: "plansList", payload }); return { plans: planList }; },
      planRead: async (payload) => { calls.push({ action: "planRead", payload }); return currentPlan; },
      planUpdate: async (payload) => {
        calls.push({ action: "planUpdate", payload });
        const stalePlan = currentPlan;
        const nextPath = payload.renameFile ? "companion/plans/2026/07/06/renamed-storage-plan.md" : currentPlan.path;
        currentPlan = {
          ...currentPlan,
          title: payload.title,
          body: payload.body === undefined ? currentPlan.body : payload.body,
          content: payload.body === undefined ? currentPlan.content : payload.body,
          path: nextPath,
          updatedAt: "2026-07-06T10:05:00.000Z"
        };
        planList[0] = { ...planList[0], title: payload.title, path: nextPath, updatedAt: currentPlan.updatedAt };
        return { plan: stalePlan };
      },
      planUpdateStatus: async (payload) => {
        calls.push({ action: "planUpdateStatus", payload });
        const stalePlan = currentPlan;
        currentPlan = { ...currentPlan };
        if (payload.status !== undefined) currentPlan.status = payload.status;
        if (payload.archived !== undefined) currentPlan.archived = payload.archived;
        return { plan: stalePlan };
      },
      planDelete: async (payload) => {
        calls.push({ action: "planDelete", payload });
        planList.length = 0;
        return { changed: true };
      },
      planRebuildIndex: async (payload) => { calls.push({ action: "planRebuildIndex", payload }); return { plans: planList }; }
    }
  });
  const getCard = () => harness.plansList.children[0];
  const getActions = () => getCard().querySelector(".ai-companion-plan-card-actions");

  harness.plansToggleButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.plansView.hidden, false);
  assert.equal(harness.agentView.hidden, true);
  assert.equal(harness.plansList.children.length, 1);
  assert.equal(getCard().textContent.includes("Storage plan"), true);
  assert.equal(getCard().textContent.includes("Planned"), true);
  assert.equal(getCard().textContent.includes("2026-07-06T10:00:00.000Z [companion/plans/2026/07/06/storage-plan.md]"), true);
  assert.equal(getCard().textContent.includes("Loading plan"), false);
  assert.equal(getCard().textContent.includes("Empty plan"), false);
  assert.equal(getActions().children.length, 8);
  assert.equal(calls.some((call) => call.action === "plansList"), true);
  assert.equal(calls.some((call) => call.action === "planRead"), false);

  harness.plansStatusSelect.value = "planned";
  harness.plansStatusSelect.dispatchEvent("change");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls.findLast((call) => call.action === "plansList").payload.status, "planned");

  harness.plansSearchInput.value = "storage";
  harness.plansSearchInput.dispatchEvent("input");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls.findLast((call) => call.action === "plansList").payload.query, "storage");

  harness.plansRefreshButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.some((call) => call.action === "planRebuildIndex"), true);

  harness.plansStatusSelect.value = "all";

  getActions().children[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.openedDocuments.length, 1);
  assert.equal(harness.openedDocuments[0].source.path, "C:/Users/shayg/.md-editor/companion/plans/2026/07/06/storage-plan.md");
  assert.equal(harness.openedDocuments[0].openOptions.viewMode, "preview");
  assert.equal(calls.some((call) => call.action === "planRead"), false);

  getActions().children[7].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(harness.openedFolders, ["C:/Users/shayg/.md-editor/companion/plans/2026/07/06"]);


  getActions().children[2].click();
  const renameInput = harness.document.body.querySelector("#ai-companion-plan-rename-input");
  assert.ok(renameInput);
  renameInput.value = "Renamed Storage Plan";
  renameInput.parentNode.querySelectorAll("button")[1].click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planUpdate").payload.title, "Renamed Storage Plan");
  assert.equal(calls.findLast((call) => call.action === "planUpdate").payload.renameFile, true);
  const renameUpdateIndex = calls.findLastIndex((call) => call.action === "planUpdate");
  assert.equal(calls.slice(renameUpdateIndex + 1).some((call) => call.action === "planRebuildIndex"), true);
  assert.equal(calls.at(-1).action, "plansList");
  assert.equal(getCard().textContent.includes("Renamed Storage Plan"), true);
  assert.equal(getCard().textContent.includes("[companion/plans/2026/07/06/renamed-storage-plan.md]"), true);

  getActions().children[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.openedDocuments.at(-1).source.path, "C:/Users/shayg/.md-editor/companion/plans/2026/07/06/renamed-storage-plan.md");
  assert.equal(harness.openedDocuments.at(-1).openOptions.viewMode, "preview");

  const implementedButton = getActions().children[4];
  implementedButton.focus();
  implementedButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planUpdateStatus").payload.status, "implemented");
  assert.equal(getCard().textContent.includes("Implemented"), true);
  assert.equal(getActions().children[3].disabled, true);

  getActions().children[5].click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planUpdateStatus").payload.archived, true);
  assert.equal(getCard().textContent.includes("Implemented"), true);
  assert.equal(getCard().textContent.includes("Archived"), true);
  assert.equal(getActions().children[3].disabled, true);
  assert.equal(getActions().children[4].title, "Mark planned");
  assert.equal(harness.reloadedPaths.includes("C:/Users/shayg/.md-editor/companion/plans/2026/07/06/renamed-storage-plan.md"), true);

  getActions().children[5].click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planUpdateStatus").payload.archived, false);
  assert.equal(getCard().textContent.includes("Archived"), false);
  assert.equal(getCard().textContent.includes("Implemented"), true);

  getActions().children[4].click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planUpdateStatus").payload.status, "planned");
  assert.equal(getCard().textContent.includes("Planned"), true);
  assert.equal(getActions().children[3].disabled, false);

  getActions().children[6].click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.findLast((call) => call.action === "planDelete").payload.path, "companion/plans/2026/07/06/renamed-storage-plan.md");
  assert.equal(harness.plansList.children[0].textContent, "No saved plans");
});
test("AI Companion Plans browser jumps to a linked chat task", async () => {
  const chatId = "chat_20260706_100000_plan";
  const taskId = "task_000001_20260706_100001_plan";
  const savedPlan = {
    id: "plan_jump_chat",
    title: "Jump chat plan",
    status: "planned",
    path: "companion/plans/2026/07/06/jump-chat-plan.md",
    sourceChatId: chatId,
    sourceTaskId: taskId,
    content: "# Plan: Jump chat plan\n\n## Milestones\n- M1: Inspect chat"
  };
  const harness = createPanelHarness({
    bridge: {
      plansList: async () => ({ plans: [{ ...savedPlan, content: undefined }] }),
      planRead: async () => savedPlan
    }
  });
  seedSavedChatResponse(harness, savedPlan.content, { chatId, taskId });
  await harness.api.refreshChatSelectOptions();

  harness.plansToggleButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  harness.plansList.children[0].querySelector(".ai-companion-plan-card-actions").children[1].click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.plansView.hidden, true);
  assert.equal(harness.agentView.hidden, false);
  assert.equal(harness.toolLog.children.length, 1);
  assert.equal(harness.toolLog.children[0].dataset.agentTaskId, taskId);
  assert.equal(harness.toolLog.children[0].querySelector("details").open, true);
});
test("AI Companion Plans browser jumps to a Neutralino chat task by saved chat id", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatId = "chat_20260706_215138_633_r0n23l";
  const taskId = "task_000001_20260706_215508_500_ixd0g2";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/07`;
  const savedPlan = {
    id: "plan_jump_neutralino_chat",
    title: "Jump Neutralino chat plan",
    status: "planned",
    path: "companion/plans/2026/07/07/jump-neutralino-chat-plan.md",
    sourceChatId: chatId,
    sourceTaskId: taskId,
    content: "# Plan: Jump Neutralino chat plan"
  };
  const modalRequests = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "07", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles: new Map([
      [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
        version: 1,
        id: chatId,
        title: "Status Bar Counts",
        createdAt: 1783374698633,
        updatedAt: 1783375173846,
        tasks: [{
          id: taskId,
          fileName: `${taskId}.json`,
          sequence: 1,
          title: "Plan source task",
          createdAt: 1783374908500,
          updatedAt: 1783375173314,
          status: "planned",
          mode: "plan"
        }]
      })],
      [`${chatDayDir}/${chatId}/${taskId}.json`, JSON.stringify({
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        prompt: "Plan source task",
        title: "Plan source task",
        createdAt: 1783374908500,
        updatedAt: 1783375173314,
        status: "planned",
        mode: "plan",
        events: [{ type: "chat-response", content: savedPlan.content }]
      })]
    ]),
    bridge: {
      plansList: async () => ({ plans: [{ ...savedPlan, content: undefined }] })
    }
  });

  harness.plansToggleButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  harness.plansList.children[0].querySelector(".ai-companion-plan-card-actions").children[1].click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(modalRequests, []);
  assert.equal(harness.plansView.hidden, true);
  assert.equal(harness.agentView.hidden, false);
  assert.equal(harness.toolLog.children.length, 1);
  assert.equal(harness.toolLog.children[0].dataset.agentTaskId, taskId);
  assert.equal(harness.toolLog.children[0].querySelector("details").open, true);
});
test("AI Companion Plans browser executes a saved plan through Agent mode", async () => {
  const agentPayloads = [];
  const statusUpdates = [];
  const savedPlan = {
    id: "plan_execute_browser",
    title: "Browser execution plan",
    status: "planned",
    path: "companion/plans/2026/07/06/browser-execution.md",
    content: "# Browser execution plan\n\n## Milestones\n- M1: Build UI",
    milestones: [{ id: "M1", title: "Build UI", status: "pending" }]
  };
  const harness = createPanelHarness({
    bridge: {
      plansList: async () => ({ plans: [{ ...savedPlan, content: undefined }] }),
      planRead: async () => savedPlan,
      planUpdateStatus: async (payload) => { statusUpdates.push(payload); return { plan: { ...savedPlan, status: payload.status } }; },
      agent: async (payload, handleEvent) => {
        agentPayloads.push(payload);
        handleEvent({ type: "agent-summary", outcome: "Done", finalResponse: "Done", changedFiles: [], attemptedChanges: [] });
        return { content: "Done" };
      }
    }
  });

  harness.plansToggleButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  harness.plansList.children[0].querySelector(".ai-companion-plan-card-actions").children[3].click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(agentPayloads.length, 1);
  assert.match(agentPayloads[0].prompt, /Execute the reviewed saved implementation plan/);
  assert.match(agentPayloads[0].prompt, /Plan id: plan_execute_browser/);
  assert.match(agentPayloads[0].prompt, /Plan path: companion\/plans\/2026\/07\/06\/browser-execution\.md/);
  assert.match(agentPayloads[0].prompt, /M1: Build UI/);
  assert.deepEqual(statusUpdates.map((update) => update.status), ["implementing", "implemented"]);
  assert.equal(harness.plansView.hidden, true);
  assert.equal(harness.agentView.hidden, false);
});

test("AI Companion plan repository bridge actions are wired", () => {
  const requests = [];
  const context = {
    window: {},
    Neutralino: { events: { on: async () => {}, off: async () => {} } },
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => "bridge-test-id" }
  };
  context.window = context;
  context.Neutralino.events.dispatch = async (name, detail) => {
    requests.push({ name, detail });
    setTimeout(() => {
      const responseEvent = { type: "aiCompanionBridgeResponse", detail: { id: detail.id, ok: true, result: { ok: true, action: detail.action } } };
      (context.Neutralino.events.onHandlers || []).forEach((handler) => handler(responseEvent));
    }, 0);
  };
  context.Neutralino.events.on = async (_name, handler) => {
    context.Neutralino.events.onHandlers = context.Neutralino.events.onHandlers || [];
    context.Neutralino.events.onHandlers.push(handler);
  };
  context.Neutralino.events.off = async (_name, handler) => {
    context.Neutralino.events.onHandlers = (context.Neutralino.events.onHandlers || []).filter((candidate) => candidate !== handler);
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8"), context);
  const bridge = context.registerMarkdownViewerNeutralinoAiBridge({ registerModule() {} }, { Neutralino: context.Neutralino, getWorkspaceRoot: () => "" });

  assert.equal(typeof bridge.plansList, "function");
  assert.equal(typeof bridge.planRead, "function");
  assert.equal(typeof bridge.planUpdate, "function");
  assert.equal(typeof bridge.planUpdateStatus, "function");
  assert.equal(typeof bridge.planDelete, "function");
  assert.equal(typeof bridge.planRebuildIndex, "function");
});

test("AI Companion bridge ignores unrelated spawned process events without logging them", async () => {
  const appDebugLogs = [];
  let spawnedProcessHandler = null;
  let requestId = "";
  const Neutralino = {
    events: {
      on: async (name, handler) => {
        if (name === "spawnedProcess") spawnedProcessHandler = handler;
      }
    },
    os: {
      spawnProcess: async () => ({ id: 7, pid: 700 }),
      updateSpawnedProcess: async (_id, action, data) => {
        if (action === "stdIn") requestId = JSON.parse(data).id;
      }
    }
  };
  const context = {
    window: {},
    Neutralino,
    addEventListener: () => {},
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    unescape,
    crypto: { randomUUID: () => "bridge-log-test-id" }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8"), context);
  const bridge = context.registerMarkdownViewerNeutralinoAiBridge({ registerModule() {} }, {
    Neutralino,
    appDebugLog: async (level, message, details) => {
      appDebugLogs.push({ level, message, details });
    },
    getWorkspaceRoot: () => ""
  });

  const pendingRequest = bridge.chat({ workspaceRoot: "", settings: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  spawnedProcessHandler({ detail: { id: 99, pid: 9900, action: "stdOut", data: "language server output" } });

  assert.equal(appDebugLogs.some((entry) => entry.message.includes("ignored spawned process event")), false);

  spawnedProcessHandler({
    detail: {
      id: 7,
      pid: 700,
      action: "stdOut",
      data: JSON.stringify({ id: requestId, type: "done", result: { content: "done" } }) + "\n"
    }
  });
  assert.deepEqual(plain(await pendingRequest), { content: "done" });
  assert.equal(appDebugLogs.some((entry) => entry.message.includes("spawned process event")), true);
});

test("AI Companion bridge preserves an empty workspace root for repository-wide plan lists", async () => {
  let spawnedProcessHandler = null;
  let sentRequest = null;
  const Neutralino = {
    events: {
      on: async (name, handler) => {
        if (name === "spawnedProcess") spawnedProcessHandler = handler;
      }
    },
    os: {
      spawnProcess: async () => ({ id: 9, pid: 900 }),
      updateSpawnedProcess: async (_id, action, data) => {
        if (action === "stdIn") sentRequest = JSON.parse(data);
      }
    }
  };
  const context = {
    window: {},
    Neutralino,
    addEventListener: () => {},
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    unescape
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8"), context);
  const bridge = context.registerMarkdownViewerNeutralinoAiBridge({ registerModule() {} }, {
    Neutralino,
    getWorkspaceRoot: () => "C:/workspace/current"
  });

  const pendingRequest = bridge.plansList({ workspaceRoot: "" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sentRequest.workspaceRoot, "");

  spawnedProcessHandler({
    detail: {
      id: 9,
      pid: 900,
      action: "stdOut",
      data: JSON.stringify({ id: sentRequest.id, type: "done", result: { plans: [] } }) + "\n"
    }
  });
  assert.deepEqual(plain(await pendingRequest), { plans: [] });
});

test("AI Companion bridge forwards rate-limit retry waits without completing the request", async () => {
  const appDebugLogs = [];
  const requestEvents = [];
  let spawnedProcessHandler = null;
  let requestId = "";
  const Neutralino = {
    events: {
      on: async (name, handler) => {
        if (name === "spawnedProcess") spawnedProcessHandler = handler;
      }
    },
    os: {
      spawnProcess: async () => ({ id: 8, pid: 800 }),
      updateSpawnedProcess: async (_id, action, data) => {
        if (action === "stdIn") requestId = JSON.parse(data).id;
      }
    }
  };
  const context = {
    window: {},
    Neutralino,
    addEventListener: () => {},
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => "bridge-rate-limit-test-id" }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8"), context);
  const bridge = context.registerMarkdownViewerNeutralinoAiBridge({ registerModule() {} }, {
    Neutralino,
    appDebugLog: async (level, message, details) => appDebugLogs.push({ level, message, details }),
    getWorkspaceRoot: () => ""
  });

  const pendingRequest = bridge.chat({ workspaceRoot: "", settings: {} }, (event) => requestEvents.push(plain(event)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  spawnedProcessHandler({
    detail: {
      id: 8,
      pid: 800,
      action: "stdOut",
      data: JSON.stringify({
        id: requestId,
        type: "debug",
        level: "warning",
        message: "Provider rate limit reached; retrying request.",
        details: {
          kind: "rate-limit-retry",
          delayMs: 12826,
          providerDelayMs: 12826,
          delaySource: "error-message",
          quota: { metric: "generate_content_free_tier_requests", limit: 15 }
        }
      }) + "\n"
    }
  });

  assert.deepEqual(requestEvents, [{
    type: "rate-limit-wait",
    delayMs: 12826,
    providerDelayMs: 12826,
    delaySource: "error-message",
    quota: { metric: "generate_content_free_tier_requests", limit: 15 }
  }]);
  assert.equal(appDebugLogs.some((entry) => entry.details?.kind === "rate-limit-retry"), true);

  spawnedProcessHandler({
    detail: {
      id: 8,
      pid: 800,
      action: "stdOut",
      data: JSON.stringify({ id: requestId, type: "done", result: { content: "done" } }) + "\n"
    }
  });
  assert.deepEqual(plain(await pendingRequest), { content: "done" });
});

test("AI Companion panel refreshes disabled notice without status notifications", () => {
  const modalRequests = [];
  const harness = createPanelHarness({
    settings: { enabled: false, chatEnabled: true, agentEnabled: true },
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } }
  });

  assert.equal(harness.disabledNotice.hidden, false);
  assert.equal(harness.disabledNotice.children[0].textContent, "AI is disabled");
  assert.equal(harness.disabledNotice.children[1].textContent, "Open Settings > AI and enable AI.");
  assert.equal(harness.elapsedElement.hidden, true);

  harness.setSettings({ enabled: true, chatEnabled: true, agentEnabled: true });
  harness.api.setOpen(true, { persist: false });

  assert.equal(harness.disabledNotice.hidden, true);
  assert.equal(harness.elapsedElement.hidden, true);
  assert.deepEqual(modalRequests, []);
  assert.deepEqual(plain(harness.savedPatches), []);
});

test("AI Companion panel shows centered notices for disabled modes without notifications", () => {
  const modalRequests = [];
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: false, agentEnabled: false },
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } }
  });

  assert.equal(harness.disabledNotice.hidden, false);
  assert.equal(harness.disabledNotice.children[0].textContent, "Chat mode is disabled");
  assert.equal(harness.disabledNotice.children[1].textContent, "Open Settings > AI and enable Chat mode.");
  assert.equal(harness.elapsedElement.hidden, true);

  harness.api.selectTab("agent", { persist: false });

  assert.equal(harness.disabledNotice.hidden, false);
  assert.equal(harness.disabledNotice.children[0].textContent, "Agent mode is disabled");
  assert.equal(harness.disabledNotice.children[1].textContent, "Open Settings > AI and enable Agent mode.");
  assert.equal(harness.elapsedElement.hidden, true);
  assert.deepEqual(modalRequests, []);
});
test("AI Companion panel default submit shortcut keeps Enter for newlines", async () => {
  let chatCalls = 0;
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: true, agentEnabled: true, inputSubmitMode: "ctrl-enter" },
    bridge: {
      chat: async () => {
        chatCalls += 1;
        return { content: "Sent" };
      }
    }
  });
  let plainEnterPrevented = false;
  let ctrlEnterPrevented = false;

  harness.agentInput.value = "Write a summary";
  harness.agentInput.dispatchEvent({ type: "keydown", key: "Enter", preventDefault: () => { plainEnterPrevented = true; } });

  assert.equal(chatCalls, 0);
  assert.equal(plainEnterPrevented, false);
  assert.equal(harness.agentInput.value, "Write a summary");

  harness.agentInput.dispatchEvent({ type: "keydown", key: "Enter", ctrlKey: true, preventDefault: () => { ctrlEnterPrevented = true; } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(chatCalls, 1);
  assert.equal(ctrlEnterPrevented, true);
  assert.equal(harness.agentInput.value, "");
});

test("AI Companion enter submit shortcut keeps Shift+Enter for newlines", async () => {
  let chatCalls = 0;
  const harness = createPanelHarness({
    settings: { enabled: true, chatEnabled: true, agentEnabled: true, inputSubmitMode: "enter" },
    bridge: {
      chat: async () => {
        chatCalls += 1;
        return { content: "Sent" };
      }
    }
  });
  let shiftEnterPrevented = false;
  let plainEnterPrevented = false;

  harness.agentInput.value = "Write a summary";
  harness.agentInput.dispatchEvent({ type: "keydown", key: "Enter", shiftKey: true, preventDefault: () => { shiftEnterPrevented = true; } });

  assert.equal(chatCalls, 0);
  assert.equal(shiftEnterPrevented, false);
  assert.equal(harness.agentInput.value, "Write a summary");

  harness.agentInput.dispatchEvent({ type: "keydown", key: "Enter", preventDefault: () => { plainEnterPrevented = true; } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(chatCalls, 1);
  assert.equal(plainEnterPrevented, true);
  assert.equal(harness.agentInput.value, "");
});


test("AI Companion elapsed timer switches to minutes after sixty seconds", async () => {
  let now = 1783076400000;
  let intervalCallback = null;
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }
  const harness = createPanelHarness({
    Date: FakeDate,
    setInterval: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearInterval: () => {},
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        return new Promise(() => {});
      }
    }
  });

  assert.equal(harness.elapsedElement.hidden, true);
  harness.agentInput.value = "Track elapsed time";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(intervalCallback);
  assert.equal(harness.elapsedElement.hidden, false);
  now += 45000;
  intervalCallback();
  assert.equal(harness.elapsedElement.textContent, "45s");

  now += 15000;
  intervalCallback();
  assert.equal(harness.elapsedElement.textContent, "1m 0s");

  now += 30000;
  intervalCallback();
  assert.equal(harness.elapsedElement.textContent, "1m 30s");
});
test("AI Companion appends worked time to chat responses and resets the composer counter", async () => {
  let now = 1783076400000;
  let intervalCallback = null;
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }
  const harness = createPanelHarness({
    Date: FakeDate,
    setInterval: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearInterval: () => {},
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        now += 24000;
        intervalCallback();
        handleEvent({ type: "content", content: "Done." });
        return { content: "Done." };
      }
    }
  });

  harness.agentInput.value = "Track completed work time";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const response = getFirstChatResponse(harness);
  assert.ok(response);
  assert.equal(response.textContent, "Done.\n\nWorked for 24s");
  assert.equal(harness.elapsedElement.textContent, "0s");
  assert.equal(harness.elapsedElement.hidden, true);
});
test("AI Companion draft attachments render from panel drop and can be removed", async () => {
  const harness = createPanelHarness();
  const dropEvent = dropFilesOnPanel(harness, [createTextFile("context.js", "console.log('hi');")]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(dropEvent.defaultPrevented, true);
  assert.equal(dropEvent.propagationStopped, true);
  assert.equal(harness.attachmentList.hidden, false);
  assert.equal(harness.attachmentList.children.length, 1);
  assert.equal(harness.agentRunButton.disabled, false);
  assert.equal(harness.attachmentList.querySelector(".ai-companion-attachment-body").title || "", "");

  harness.attachmentList.querySelector(".ai-companion-attachment-remove").click();

  assert.equal(harness.attachmentList.hidden, true);
  assert.equal(harness.attachmentList.children.length, 0);
  assert.equal(harness.agentRunButton.disabled, true);
});

test("AI Companion sends attachments, saves compact references, and clears the draft tray", async () => {
  const bridgePayloads = [];
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload) => {
        bridgePayloads.push(plain(payload));
        return { content: "Read the attachment." };
      }
    }
  });

  dropFilesOnPanel(harness, [createTextFile("context.js", "export const name = 'md-editor';", { path: "C:/project/context.js" })]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(bridgePayloads.length, 1);
  assert.equal(bridgePayloads[0].prompt, "");
  assert.equal(bridgePayloads[0].attachments.length, 1);
  assert.equal(bridgePayloads[0].attachments[0].content, "export const name = 'md-editor';");
  assert.equal(bridgePayloads[0].attachments[0].path, "C:/project/context.js");
  assert.equal(harness.attachmentList.hidden, true);

  const savedTask = Array.from(harness.storage.entries()).find(([key]) => key.startsWith("ai-companion-agent-tasks:"));
  assert.ok(savedTask);
  const savedRecord = JSON.parse(savedTask[1]);
  assert.equal(savedRecord.attachments.length, 1);
  assert.equal(savedRecord.attachments[0].name, "context.js");
  assert.equal(savedRecord.attachments[0].path, "C:/project/context.js");
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "content"), false);
  assert.ok(harness.toolLog.children[0].querySelector(".ai-companion-saved-attachment"));
});



test("AI Companion requests a generated title only for the first chat prompt", async () => {
  const payloads = [];
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload, handleEvent) => {
        payloads.push(plain(payload));
        if (payloads.length === 1) handleEvent({ type: "chat-title", chatTitle: "\"Explain Workspace Indexing In Detail Now\"" });
        return payloads.length === 1
          ? { content: "First answer" }
          : { content: "Second answer" };
      }
    }
  });

  harness.agentInput.value = "How does workspace indexing work?";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].requestChatTitle, true);
  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  assert.equal(savedIndex.title, "Explain Workspace Indexing In Detail");
  assert.equal(harness.chatMenu.children[0].textContent, "Explain Workspace Indexing In Detail");

  harness.agentInput.value = "What about the second pass?";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(payloads.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(payloads[1], "requestChatTitle"), false);
  const updatedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  assert.equal(updatedIndex.title, "Explain Workspace Indexing In Detail");
});

test("AI Companion updates an agent chat title before the agent summary completes", async () => {
  const payloads = [];
  let continueAgent;
  const agentCanFinish = new Promise((resolve) => { continueAgent = resolve; });
  const harness = createPanelHarness({
    bridge: {
      agent: async (payload, handleEvent) => {
        payloads.push(plain(payload));
        handleEvent({ type: "chat-title", chatTitle: "Approval Policy Flow" });
        await agentCanFinish;
        handleEvent({ type: "agent-summary", outcome: "Done", finalResponse: "Done", changedFiles: [], attemptedChanges: [] });
        return { content: "Done" };
      }
    }
  });

  harness.api.selectTab("agent", { persist: false });
  harness.agentInput.value = "Review the approval policy flow";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].requestChatTitle, true);
  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  assert.equal(savedIndex.title, "Approval Policy Flow");
  assert.equal(harness.chatMenu.children[0].textContent, "Approval Policy Flow");

  continueAgent();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test("AI Companion shows pending questions above the composer and collapses answered free text into history", async () => {
  const responses = [];
  let finishQuestion;
  const answered = new Promise((resolve) => { finishQuestion = resolve; });
  const harness = createPanelHarness({
    createActivityRenderer: ({ container }) => ({
      appendActivity() {},
      appendExternalActivity(row) { container.appendChild(row); return true; },
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {}
    }),
    bridge: {
      agent: async (_payload, handleEvent) => {
        const questionEvent = {
          type: "user-input",
          interactionId: "decision-card",
          reason: "test-folders.txt will be created in this directory.",
          questions: [{
            question: "Which project root should be used?",
            options: [
              { label: "C:\\GitHub\\shaybc\\md-editor\\desktop-app", description: "Use the desktop app directory." },
              { label: "C:\\GitHub\\shaybc\\md-editor", description: "Use the repository root." }
            ],
            multiSelect: false,
            allowFreeText: true
          }]
        };
        handleEvent(questionEvent);
        handleEvent({ ...questionEvent, restored: true });
        await answered;
        return { content: "Decision received." };
      },
      respondUserInput: async (interactionId, answers, declined) => {
        responses.push({ interactionId, answers, declined });
        finishQuestion();
        return { accepted: true };
      }
    }
  });

  harness.api.selectTab("agent", { persist: false });
  harness.agentInput.value = "Ask before choosing the format";
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const interactionHost = harness.agentView.querySelector(".ai-companion-user-input-host");
  const card = interactionHost.querySelector(".ai-companion-user-input");
  assert.ok(card);
  assert.equal(interactionHost.nextElementSibling, harness.agentComposer);
  assert.equal(interactionHost.hidden, false);
  assert.match(card.textContent, /Input required/);
  assert.equal(harness.toolLog.querySelector(".ai-companion-user-input"), null);
  assert.equal(harness.toolLog.querySelector(".ai-companion-approval"), null);
  const choices = card.querySelectorAll("input").filter((input) => input.type === "radio");
  assert.equal(choices[0].focused, true);
  const customChoice = choices.find((input) => input.value === "Enter another path...");
  const freeText = card.querySelector(".ai-companion-user-input-free-text");
  const continueButton = card.querySelector(".ai-companion-user-input-primary");
  assert.equal(freeText.hidden, true);
  choices.forEach((input) => { input.checked = false; });
  customChoice.checked = true;
  customChoice.dispatchEvent("change");
  assert.equal(freeText.hidden, false);
  assert.equal(freeText.focused, true);
  assert.equal(continueButton.disabled, true);
  freeText.value = "C:\\Users\\shayg\\Downloads";
  freeText.dispatchEvent("input");
  assert.equal(continueButton.disabled, false);
  continueButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(plain(responses), [{
    interactionId: "decision-card",
    answers: { "Which project root should be used?": "C:\\Users\\shayg\\Downloads" },
    declined: false
  }]);
  assert.equal(interactionHost.hidden, true);
  assert.match(harness.toolLog.textContent, /Asked Which project root should be used\?.*C:\\Users\\shayg\\Downloads/);
  assert.equal(harness.toolLog.querySelectorAll(".ai-companion-user-input-history").length, 1);
});

test("AI Companion approval events render highlighted action cards", async () => {
  const responses = [];
  const openedComparisons = [];
  let resolveApproval;
  const approvalResponded = new Promise((resolve) => { resolveApproval = resolve; });
  const harness = createPanelHarness({
    openFileCompareInTab: (comparison) => {
      openedComparisons.push(comparison);
      return { id: "approval-diff" };
    },
    createActivityRenderer: ({ container }) => ({
      appendActivity() {},
      appendExternalActivity(row) {
        container.appendChild(row);
        return true;
      },
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {}
    }),
    bridge: {
      agent: async (_payload, handleEvent) => {
        handleEvent({
          type: "approval",
          approvalId: "approval-card",
          tool: "apply_edit",
          input: "Apply changes to the project?",
          approvalReason: "Update the project markup requested by the user.",
          summary: "Apply file edits",
          preview: "diff --git a/index.html b/index.html",
          compare: {
            path: "index.html",
            beforeContent: "<main>Before</main>",
            afterContent: "<main>After</main>",
            changed: true,
            readOnly: true
          },
          actionAnalysis: {
            operation: "modify",
            operationLabel: "Modify file",
            resourcePath: "index.html",
            taskGoal: "Update the project markup requested by the user.",
            actionDescription: "Replace the matching text in this file with the proposed text.",
            outcomeDescription: "The file content will change: 1 line added and 1 removed.",
            limitations: [],
            lineImpact: { additions: 1, deletions: 1 },
            canApprove: true,
            blockingCode: ""
          }
        });
        await approvalResponded;
        return { content: "Approved." };
      },
      respondApproval: async (approvalId, decision, instructions) => {
        responses.push({ approvalId, decision, instructions });
        resolveApproval();
      }
    }
  });

  harness.api.selectTab("agent", { persist: false });
  harness.agentInput.value = "Apply the pending edits";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const approval = harness.toolLog.querySelector(".ai-companion-approval");
  assert.ok(approval);
  assert.equal(approval.classList.contains("pending"), true);
  assert.match(approval.textContent, /Approval required/);
  assert.match(approval.textContent, /Modify file/);
  assert.match(approval.textContent, /Task goal: Update the project markup requested by the user\./);
  assert.match(approval.textContent, /This action: Replace the matching text in this file with the proposed text\./);
  assert.match(approval.textContent, /Outcome: The file content will change: 1 line added and 1 removed\./);
  assert.match(approval.textContent, /Replace the matching text in this file with the proposed text\./);
  assert.match(approval.textContent, /index\.html/);
  assert.ok(approval.querySelector(".ai-companion-approval-footer"));
  assert.equal(approval.querySelector(".ai-companion-approval-review").textContent, "Review changes");
  assert.equal(approval.querySelector(".ai-companion-approval-approve").textContent, "Approve");

  approval.querySelector(".ai-companion-approval-review").click();
  const approvalModal = harness.document.body.querySelector(".ai-companion-approval-modal");
  assert.ok(approvalModal);
  approvalModal.querySelector(".ai-companion-approval-modal-diff").click();
  assert.equal(openedComparisons.length, 1);
  assert.equal(openedComparisons[0].left.content, "<main>Before</main>");
  assert.equal(openedComparisons[0].right.content, "<main>After</main>");
  assert.equal(openedComparisons[0].right.path, null);

  approval.querySelector(".ai-companion-approval-approve").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(responses, [{ approvalId: "approval-card", decision: "approve", instructions: "" }]);
  assert.equal(approval.classList.contains("pending"), false);
  assert.equal(approval.classList.contains("approved"), true);
  const response = approval.querySelector(".ai-companion-approval-response");
  assert.equal(response.tagName, "BUTTON");
  assert.equal(response.textContent, "Approved");
});

test("AI Companion legacy no-op approvals render as blocked without approval controls", async () => {
  const harness = createPanelHarness({
    createActivityRenderer: ({ container }) => ({
      appendActivity() {},
      appendExternalActivity(row) { container.appendChild(row); return true; },
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {}
    }),
    bridge: {
      agent: async (_payload, handleEvent) => {
        handleEvent({
          type: "approval",
          approvalId: "legacy-no-op",
          tool: "write_file",
          input: "src/App.java",
          approvalReason: "Remove the old file.",
          compare: { path: "src/App.java", beforeContent: "", afterContent: "" }
        });
        return { content: "Blocked." };
      }
    }
  });

  harness.api.selectTab("agent", { persist: false });
  harness.agentInput.value = "Remove the old file";
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const approval = harness.toolLog.querySelector(".ai-companion-approval");
  assert.equal(approval.classList.contains("blocked"), true);
  assert.match(approval.textContent, /Action cannot be approved/);
  assert.match(approval.textContent, /No change/);
  assert.match(approval.textContent, /No filesystem change will occur/);
  assert.equal(approval.querySelector(".ai-companion-approval-approve"), null);
  assert.equal(approval.querySelector(".ai-companion-approval-review"), null);
});

test("AI Companion sends image attachments and saves compact image references", async () => {
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const bridgePayloads = [];
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload) => {
        bridgePayloads.push(plain(payload));
        return { content: "I can see it." };
      }
    }
  });

  dropFilesOnPanel(harness, [createImageFile("diagram.png", imageDataUrl, { path: "C:/project/diagram.png" })]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(harness.attachmentList.querySelector(".ai-companion-attachment-preview"));
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(bridgePayloads.length, 1);
  assert.equal(bridgePayloads[0].attachments.length, 1);
  assert.equal(bridgePayloads[0].attachments[0].kind, "image");
  assert.equal(bridgePayloads[0].attachments[0].dataUrl, imageDataUrl);
  assert.equal(harness.attachmentList.hidden, true);

  const savedTask = Array.from(harness.storage.entries()).find(([key]) => key.startsWith("ai-companion-agent-tasks:"));
  assert.ok(savedTask);
  const savedRecord = JSON.parse(savedTask[1]);
  assert.equal(savedRecord.attachments[0].kind, "image");
  assert.equal(savedRecord.attachments[0].name, "diagram.png");
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "dataUrl"), false);
});


test("AI Companion paste attaches image clipboard items without blocking text-only paste", async () => {
  const imageDataUrl = "data:image/png;base64,pasted";
  const harness = createPanelHarness();

  const textPaste = pasteIntoPrompt(harness, [{ type: "text/plain", getAsFile: () => null }]);

  assert.equal(textPaste.defaultPrevented, undefined);
  assert.equal(harness.attachmentList.hidden, true);

  const imagePaste = pasteIntoPrompt(harness, [createClipboardImageItem(createImageFile("", imageDataUrl, { size: 256 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(imagePaste.defaultPrevented, true);
  assert.equal(harness.attachmentList.hidden, false);
  assert.equal(harness.attachmentList.children.length, 1);
  assert.ok(harness.attachmentList.querySelector(".ai-companion-attachment-preview"));
  assert.equal(harness.agentRunButton.disabled, false);
});

test("AI Companion pasted images can be removed from the draft tray", async () => {
  const harness = createPanelHarness();

  pasteIntoPrompt(harness, [createClipboardImageItem(createImageFile("", "data:image/png;base64,pasted", { size: 256 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.attachmentList.querySelector(".ai-companion-attachment-remove").click();

  assert.equal(harness.attachmentList.hidden, true);
  assert.equal(harness.attachmentList.children.length, 0);
  assert.equal(harness.agentRunButton.disabled, true);
});

test("AI Companion sends pasted images and saves openable desktop file references", async () => {
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const profileDir = "C:/Users/shayg/.md-editor";
  const bridgePayloads = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    bridge: {
      chat: async (payload) => {
        bridgePayloads.push(plain(payload));
        return { content: "Pasted image received." };
      }
    }
  });

  pasteIntoPrompt(harness, [createClipboardImageItem(createImageFile("", imageDataUrl, { size: 8 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(bridgePayloads.length, 1);
  assert.equal(bridgePayloads[0].attachments[0].kind, "image");
  assert.equal(bridgePayloads[0].attachments[0].dataUrl, imageDataUrl);
  assert.equal(bridgePayloads[0].attachments[0].name, "pasted-image-1.png");

  const savedRecord = getNeutralinoSavedTaskRecords(harness).at(-1).record;
  assert.equal(savedRecord.attachments[0].kind, "image");
  assert.equal(savedRecord.attachments[0].name, "pasted-image-1.png");
  assert.equal(savedRecord.attachments[0].path.startsWith(`${profileDir}/companion/chats/`), true);
  assert.equal(savedRecord.attachments[0].path.includes(`/attachments/${savedRecord.id}/pasted-image-1.png`), true);
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "dataUrl"), false);
  assert.ok(harness.neutralinoWrites.some((write) => write.filePath === savedRecord.attachments[0].path && write.content instanceof Uint8Array));
  assert.equal(harness.toolLog.children[0].querySelector(".ai-companion-saved-attachment").tagName, "BUTTON");
});

test("AI Companion browser fallback saves pasted images as non-openable compact references", async () => {
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const bridgePayloads = [];
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload) => {
        bridgePayloads.push(plain(payload));
        return { content: "Pasted image received." };
      }
    }
  });

  pasteIntoPrompt(harness, [createClipboardImageItem(createImageFile("", imageDataUrl, { size: 8 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(bridgePayloads[0].attachments[0].dataUrl, imageDataUrl);
  const savedTask = Array.from(harness.storage.entries()).find(([key]) => key.startsWith("ai-companion-agent-tasks:"));
  assert.ok(savedTask);
  const savedRecord = JSON.parse(savedTask[1]);
  assert.equal(savedRecord.attachments[0].kind, "image");
  assert.equal(savedRecord.attachments[0].name, "pasted-image-1.png");
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "dataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "path"), false);
  assert.equal(harness.toolLog.children[0].querySelector(".ai-companion-saved-attachment").tagName, "SPAN");
});
test("AI Companion reloads pasted image references as non-openable compact chips", async () => {
  const harness = createPanelHarness();
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_190000_paste",
    title: "Chat",
    createdAt: 1783098000000,
    updatedAt: 1783098001000,
    tasks: [{
      id: "task_000001_20260703_190001_paste",
      fileName: "task_000001_20260703_190001_paste.json",
      sequence: 1,
      title: "Review pasted image",
      createdAt: 1783098001000,
      updatedAt: 1783098001000,
      status: "completed"
    }]
  }));
  harness.storage.set("ai-companion-agent-tasks:task_000001_20260703_190001_paste", JSON.stringify({
    id: "task_000001_20260703_190001_paste",
    fileName: "task_000001_20260703_190001_paste.json",
    sequence: 1,
    prompt: "Review pasted image",
    title: "Review pasted image",
    createdAt: 1783098001000,
    updatedAt: 1783098001000,
    status: "completed",
    attachments: [{ name: "pasted-image-1.png", size: 256, type: "image/png", kind: "image" }],
    events: [{ type: "chat-response", content: "Looks good." }]
  }));

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const savedAttachment = harness.toolLog.children[0].querySelector(".ai-companion-saved-attachment");

  assert.ok(savedAttachment);
  assert.equal(savedAttachment.tagName, "SPAN");
});
test("AI Companion prompt plus menu attaches desktop image files", async () => {
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    openDialogSelection: ["C:/project/diagram.png"],
    neutralinoFiles: new Map([["C:/project/diagram.png", new Uint8Array([137, 80, 78, 71])]])
  });

  harness.attachFilesButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.attachmentList.hidden, false);
  assert.equal(harness.attachmentList.children.length, 1);
  assert.ok(harness.attachmentList.querySelector(".ai-companion-attachment-preview"));
  assert.equal(harness.agentRunButton.disabled, false);
});
test("AI Companion prompt plus menu attaches desktop files", async () => {
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    openDialogSelection: ["C:/project/run.bat"],
    neutralinoFiles: new Map([["C:/project/run.bat", "npm run prod"]])
  });

  harness.attachFilesButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.attachmentList.hidden, false);
  assert.equal(harness.attachmentList.children.length, 1);
  assert.equal(harness.agentRunButton.disabled, false);
});

test("AI Companion native Neutralino file drops attach pathful desktop files", async () => {
  const payloads = [];
  const droppedPath = "C:/project/native-drop.md";
  const neutralinoFiles = new Map([[droppedPath, "# Native drop"]]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir: "C:/Users/shayg/.md-editor",
    neutralinoFiles,
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Read native drop." };
      }
    }
  });

  harness.agentInput.dispatchEvent({ type: "focus" });
  harness.dispatchNeutralinoEvent("filesDropped", { files: [droppedPath] });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.attachmentList.hidden, false);
  assert.equal(harness.attachmentList.children.length, 1);
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments.length, 1);
  assert.equal(payloads[0].attachments[0].path, droppedPath);
  assert.equal(payloads[0].attachments[0].content, "# Native drop");
  const savedRecord = getNeutralinoSavedTaskRecords(harness).at(-1).record;
  assert.equal(savedRecord.attachments[0].path, droppedPath);
});

test("AI Companion browser drop fallback saves pathless files as chat attachment copies", async () => {
  const payloads = [];
  const profileDir = "C:/Users/shayg/.md-editor";
  const neutralinoFiles = new Map();
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoFiles,
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Read copied drop." };
      }
    }
  });

  dropFilesOnPanel(harness, [createTextFile("fallback-drop.md", "# Fallback copy")]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments[0].content, "# Fallback copy");
  assert.equal(payloads[0].attachments[0].path, undefined);
  const savedRecord = getNeutralinoSavedTaskRecords(harness).at(-1).record;
  assert.equal(savedRecord.attachments.length, 1);
  assert.match(savedRecord.attachments[0].path, /\/attachments\/.*\/fallback-drop\.md$/);
  assert.equal(neutralinoFiles.get(savedRecord.attachments[0].path), "# Fallback copy");
});
test("AI Companion reloads compact saved attachments and opens existing file references", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const chatId = "chat_20260703_170000_attach";
  const taskId = "task_000001_20260703_170001_attach";
  const attachedPath = "C:/project/context.js";
  const missingPath = "C:/project/missing.txt";
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      version: 1,
      id: chatId,
      title: "Chat",
      createdAt: 1783090800000,
      updatedAt: 1783090801000,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review files",
        createdAt: 1783090801000,
        updatedAt: 1783090801000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${chatId}/${taskId}.json`, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review files",
      title: "Review files",
      createdAt: 1783090801000,
      updatedAt: 1783090801000,
      status: "completed",
      attachments: [
        { name: "context.js", path: attachedPath, size: 22, type: "text/javascript" },
        { name: "missing.txt", path: missingPath, size: 7, type: "text/plain" }
      ],
      events: [{ type: "chat-response", content: "Looks good." }]
    })],
    [attachedPath, "export const name = 'md-editor';"]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const savedAttachments = harness.toolLog.children[0].querySelectorAll(".ai-companion-saved-attachment");
  const savedAttachment = savedAttachments[0];
  const missingAttachment = savedAttachments[1];

  assert.ok(savedAttachment);
  assert.equal(savedAttachment.title || "", "");
  const tooltip = savedAttachment.querySelector(".ai-companion-saved-attachment-tooltip");
  assert.ok(tooltip);
  assert.equal(tooltip.textContent.includes("Click to open the file."), false);
  savedAttachment.dispatchEvent({ type: "mouseenter" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(tooltip.textContent, /Click to open the file\./);

  assert.ok(missingAttachment);
  const missingTooltip = missingAttachment.querySelector(".ai-companion-saved-attachment-tooltip");
  missingAttachment.dispatchEvent({ type: "mouseenter" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(missingTooltip.textContent, /This file no longer exists at this path\./);
  assert.equal(missingTooltip.textContent.includes("Click to open the file."), false);

  savedAttachment.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.openedDocuments.length, 1);
  assert.equal(harness.openedDocuments[0].source.path, attachedPath);
});


test("AI Companion reloads compact saved image attachments and opens existing file references", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const chatId = "chat_20260703_180000_image";
  const taskId = "task_000001_20260703_180001_image";
  const attachedPath = "C:/project/diagram.png";
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      version: 1,
      id: chatId,
      title: "Chat",
      createdAt: 1783094400000,
      updatedAt: 1783094401000,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review image",
        createdAt: 1783094401000,
        updatedAt: 1783094401000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${chatId}/${taskId}.json`, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review image",
      title: "Review image",
      createdAt: 1783094401000,
      updatedAt: 1783094401000,
      status: "completed",
      attachments: [{ name: "diagram.png", path: attachedPath, size: 4, type: "image/png", kind: "image" }],
      events: [{ type: "chat-response", content: "Looks good." }]
    })],
    [attachedPath, new Uint8Array([137, 80, 78, 71])]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const savedAttachment = harness.toolLog.children[0].querySelector(".ai-companion-saved-attachment");

  assert.ok(savedAttachment);
  savedAttachment.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.openedDocuments.length, 1);
  assert.equal(harness.openedDocuments[0].source.path, attachedPath);
});
test("AI Companion panel preference is part of startup global state restore", () => {
  const script = fs.readFileSync(path.join(webRoot, "js", "script.js"), "utf8");

  assert.match(script, /aiCompanionPanelVisible:\s*false/);
  assert.match(script, /aiCompanionSelectedMode:\s*"chat"/);
  assert.match(script, /aiCompanionPanel\s*=\s*window\.registerMarkdownViewerAiCompanionPanel/);
  assert.match(script, /saveGlobalState:\s*function\(patch\) \{ return saveGlobalState\(patch\); \}/);
  assert.match(script, /const restoredGlobalState = loadGlobalState\(\);/);
  assert.match(script, /aiCompanionPanel\?\.selectTab\(restoredGlobalState\.aiCompanionSelectedMode, \{ persist: false \}\)/);
  assert.match(script, /aiCompanionPanel\?\.setOpen\(restoredGlobalState\.aiCompanionPanelVisible === true, \{ persist: false \}\)/);
});
test("AI Companion previous chat dropdown refreshes without writing preferences", async () => {
  const harness = createPanelHarness();
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_120000_abc123",
    title: "Chat",
    createdAt: 1783072800000,
    updatedAt: 1783072900000,
    tasks: [{
      id: "task_000001_20260703_120001_def456",
      fileName: "task_000001_20260703_120001_def456.json",
      sequence: 1,
      title: "Review startup persistence",
      createdAt: 1783072801000,
      updatedAt: 1783072900000,
      status: "completed"
    }]
  }));

  await harness.api.refreshChatSelectOptions();

  assert.equal(harness.chatMenu.children.length, 1);
  assert.equal(harness.chatSelectLabel.textContent, "Recent chats");
  assert.equal(harness.chatMenu.children[0].dataset.chatId, "chat_20260703_120000_abc123");
  assert.equal(harness.chatMenu.children[0].textContent, "Review startup persistence");
  assert.match(harness.chatMenu.children[0].title, /^Last updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(plain(harness.savedPatches), []);
});
test("AI Companion previous chat select loads a saved chat without deleting storage", async () => {
  const harness = createPanelHarness();
  const chatId = "chat_20260703_130000_abc123";
  const taskId = "task_000001_20260703_130001_def456";
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Chat",
    createdAt: 1783076400000,
    updatedAt: 1783076500000,
    tasks: [{
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      title: "Load saved chat",
      createdAt: 1783076401000,
      updatedAt: 1783076500000,
      status: "completed"
    }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${taskId}`, JSON.stringify({
    id: taskId,
    fileName: `${taskId}.json`,
    sequence: 1,
    prompt: "Load saved chat",
    title: "Load saved chat",
    createdAt: 1783076401000,
    updatedAt: 1783076500000,
    status: "completed",
    events: [{ type: "chat-response", content: "Restored answer" }]
  }));

  await harness.api.refreshChatSelectOptions();
  harness.chatSelect.click();
  assert.equal(harness.chatMenu.hidden, false);
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.toolLog.children.length, 1);
  assert.equal(harness.storage.has("ai-companion-chats"), true);
  assert.equal(harness.storage.has(`ai-companion-agent-tasks:${taskId}`), true);
  assert.deepEqual(plain(harness.savedPatches), []);
});
test("AI Companion context indicator restores request activity from saved chat tasks", async () => {
  const restoredTotals = [];
  const harness = createPanelHarness({
    createContextIndicator: () => ({
      reset() {},
      restoreTotals(totals) { restoredTotals.push(totals); },
      refresh() {},
      recordUsage() {},
      recordEstimate() {},
      beginRequest() {},
      getTotals() { return {}; }
    })
  });
  const chatId = "chat_20260703_131000_activity";
  const taskId = "task_000001_20260703_131001_activity";
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Chat",
    createdAt: 1783077000000,
    updatedAt: 1783077100000,
    tasks: [{
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      title: "Restored activity",
      createdAt: 1783077001000,
      updatedAt: 1783077100000,
      status: "completed"
    }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${taskId}`, JSON.stringify({
    id: taskId,
    fileName: `${taskId}.json`,
    sequence: 1,
    prompt: "Restored activity",
    title: "Restored activity",
    createdAt: 1783077001000,
    updatedAt: 1783077100000,
    status: "completed",
    events: [{ type: "chat-response", content: "Restored answer" }]
  }));

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(restoredTotals.some((totals) => totals?.requestCount === 1), true);
});

test("AI Companion context indicator includes files read by tools", async () => {
  let getContextFiles = null;
  const snapshots = [];
  const harness = createPanelHarness({
    createContextIndicator: (options) => {
      getContextFiles = options.getContextFiles;
      return {
        reset() {},
        restoreTotals() {},
        refresh() { snapshots.push(plain(getContextFiles())); },
        recordUsage() {},
        recordEstimate() {},
        beginRequest() {},
        getTotals() { return {}; }
      };
    },
    bridge: {
      agent: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        handleEvent({ type: "tool", tool: "read_file", input: JSON.stringify({ path: "web-app/js/ai-companion/panel.js" }), summary: "1-120" });
        handleEvent({ type: "agent-summary", outcome: "Done", finalResponse: "Done", changedFiles: [], attemptedChanges: [] });
        return { content: "Done" };
      }
    }
  });

  harness.agentTab.click();
  harness.agentInput.value = "Inspect panel context";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const latestRequestFiles = plain(getContextFiles()).find((group) => group.title === "Latest request")?.files || [];
  assert.equal(latestRequestFiles.some((file) => file.path === "web-app/js/ai-companion/panel.js" && file.source === "read-file"), true);
  assert.equal(latestRequestFiles.some((file) => file.name === "document.md"), false);
  assert.equal(snapshots.some((groups) => groups.find((group) => group.title === "Latest request")?.files.some((file) => file.path === "web-app/js/ai-companion/panel.js")), true);
});

test("AI Companion saved chat responses render through the shared markdown renderer", async () => {
  const renderCalls = [];
  const harness = createPanelHarness({
    renderMarkdownContent(target, markdown, options) {
      renderCalls.push({ markdown, options });
      target.innerHTML = '<p><strong>bold</strong> <code>src/app.js</code></p><pre><code class="hljs python">total = 120</code></pre>';
      return true;
    }
  });
  seedSavedChatResponse(harness, '**bold** `src/app.js`\n\n```python\ntotal = 120\n```');

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = getFirstChatResponse(harness);
  assert.ok(response);
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].markdown, '**bold** `src/app.js`\n\n```python\ntotal = 120\n```');
  assert.deepEqual(plain(renderCalls[0].options), { renderFrontmatter: false });
  assert.match(response.className, /ai-companion-chat-response/);
  assert.match(response.className, /markdown-body/);
  assert.equal(response.textContent, "");
  assert.match(response.innerHTML, /<strong>bold<\/strong>/);
  assert.match(response.innerHTML, /class="hljs python"/);
});

test("AI Companion response action opens Markdown in a new preview tab", async () => {
  const openedTabs = [];
  const harness = createPanelHarness({
    appServices: {
      tabs: {
        newTab: (content, title, options) => {
          openedTabs.push({ content, title, options });
          return { content, title, options };
        }
      }
    }
  });
  seedSavedChatResponse(harness, "# Larger view\n\nReview this answer.");

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const output = getTaskOutput(harness.toolLog.children[0]);
  const openButton = output.querySelector(".ai-companion-box-open-tab");
  assert.ok(openButton);
  assert.equal(openButton.getAttribute("aria-label"), "Open in a new tab");

  openButton.click();

  assert.deepEqual(plain(openedTabs), [{
    content: "# Larger view\n\nReview this answer.",
    title: null,
    options: { viewMode: "preview" }
  }]);
});
test("AI Companion response open tab exits workspace to Files view", async () => {
  const openedTabs = [];
  let api = null;
  const workspaceSearch = {
    activeView: "ai-companion",
    calls: [],
    getActiveSidebarView() { return this.activeView; },
    setSidebarView(view) {
      this.activeView = view;
      this.calls.push(view);
      api?.closeWorkspaceForExternalNavigation?.();
    }
  };
  const harness = createPanelHarness({
    modules: { workspaceSearch },
    appServices: {
      tabs: {
        newTab: (content, title, options) => {
          openedTabs.push({ content, title, options });
          return { content, title, options };
        }
      }
    }
  });
  api = harness.api;
  seedSavedChatResponse(harness, "# Larger view\n\nReview this answer.");

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "ai-companion" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const output = getTaskOutput(harness.toolLog.children[0]);
  output.querySelector(".ai-companion-box-open-tab").click();

  assert.equal(openedTabs.length, 1);
  assert.equal(workspaceSearch.activeView, "files");
  assert.deepEqual(workspaceSearch.calls, ["files"]);
  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), false);
});
test("AI Companion summary file links exit workspace and reveal the opened editor tab", async () => {
  const openedDocuments = [];
  let api = null;
  const workspaceSearch = {
    activeView: "ai-companion",
    calls: [],
    getActiveSidebarView() { return this.activeView; },
    setSidebarView(view) {
      this.activeView = view;
      this.calls.push(view);
      api?.closeWorkspaceForExternalNavigation?.();
    }
  };
  const harness = createPanelHarness({
    modules: { workspaceSearch },
    workspaceRoot: "C:\\GitHub\\shaybc\\md-editor",
    openDocumentSourceFile: async (source, options) => {
      openedDocuments.push({ source, options });
      return { source, options };
    },
    createActivityRenderer: ({ container, openFile }) => ({
      appendActivity() {},
      appendExternalActivity(row) { container.appendChild(row); return true; },
      appendNarration() {},
      appendSummary(event) {
        const link = new FakeElement("", "button");
        link.classList.add("ai-companion-summary-file-link");
        link.addEventListener("click", () => { void openFile(event.changedFiles[0].path); });
        container.appendChild(link);
      },
      collapseTimeline() {}
    })
  });
  api = harness.api;
  seedSavedChatResponse(harness, "Done", {
    mode: "agent",
    events: [{
      type: "agent-summary",
      status: "success",
      finalResponse: "Done",
      changedFiles: [{ path: "test-folders.txt", description: "Created file." }],
      attemptedChanges: [],
      blockedChanges: []
    }]
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "ai-companion" });
  harness.toolLog.querySelector(".ai-companion-summary-file-link").click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(openedDocuments.length, 1);
  assert.equal(openedDocuments[0].source.path, "C:\\GitHub\\shaybc\\md-editor/test-folders.txt");
  assert.equal(workspaceSearch.activeView, "files");
  assert.deepEqual(workspaceSearch.calls, ["files"]);
  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), false);
});
test("AI Companion chat responses fall back to plain text when markdown rendering is unavailable", async () => {
  const harness = createPanelHarness({
    renderMarkdownContent() {
      return false;
    }
  });
  seedSavedChatResponse(harness, "**Not rendered**");

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = getFirstChatResponse(harness);
  assert.ok(response);
  assert.equal(response.className, "ai-companion-chat-response");
  assert.equal(response.textContent, "**Not rendered**");
  assert.equal(response.innerHTML, "");
});

test("AI Companion error chat responses remain plain text", async () => {
  let renderCount = 0;
  const harness = createPanelHarness({
    renderMarkdownContent() {
      renderCount += 1;
      return true;
    }
  });
  seedSavedChatResponse(harness, "**Failure**", { isError: true });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = getFirstChatResponse(harness);
  assert.ok(response);
  assert.match(response.className, /ai-companion-chat-response error/);
  assert.doesNotMatch(response.className, /markdown-body/);
  assert.equal(response.textContent, "**Failure**");
  assert.equal(response.innerHTML, "");
  assert.equal(renderCount, 0);
});

test("AI Companion chat request errors show notification dialog and inline response", async () => {
  const modalRequests = [];
  const harness = createPanelHarness({
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    bridge: {
      chat: async () => {
        throw new Error("Provider exploded");
      }
    }
  });

  harness.agentInput.value = "Trigger failure";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].title, "AI Companion");
  assert.equal(modalRequests[0].message, "Provider exploded");
  const response = getFirstChatResponse(harness);
  assert.ok(response);
  assert.equal(response.className, "ai-companion-chat-response error");
  assert.equal(response.textContent, "Provider exploded");
});
test("explicit continuation includes the immediately preceding cancelled task", async () => {
  const payloads = [];
  const chatId = "chat_20260809_120000_continue";
  const taskId = "task_000001_20260809_120001_continue";
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload) => {
        payloads.push(payload);
        return { content: "Continued." };
      }
    }
  });
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Documentation lookup",
    createdAt: 1786266000000,
    updatedAt: 1786266001000,
    tasks: [{ id: taskId, fileName: `${taskId}.json`, sequence: 1, title: "Find wiki files", createdAt: 1786266000000, updatedAt: 1786266001000, status: "cancelled" }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${taskId}`, JSON.stringify({
    id: taskId,
    fileName: `${taskId}.json`,
    sequence: 1,
    prompt: "Where are the wiki files located?",
    title: "Find wiki files",
    createdAt: 1786266000000,
    updatedAt: 1786266001000,
    status: "cancelled",
    events: [
      { type: "tool", tool: "glob_files", summary: "No matching wiki files" },
      { type: "chat-response", isError: true, content: "Provider rate limit interrupted the lookup." }
    ]
  }));

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.agentInput.value = "continue";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].conversationHistory[0].content, "Where are the wiki files located?");
  assert.match(payloads[0].conversationHistory[1].content, /explicitly asked to continue this immediately preceding task/i);
  assert.match(payloads[0].conversationHistory[1].content, /Provider rate limit interrupted the lookup/);
});
test("AI Companion prompt inline edit reruns from the edited prompt and truncates later history", async () => {
  const payloads = [];
  const harness = createPanelHarness({
    bridge: {
      chat: async (payload) => {
        payloads.push(payload);
        return { content: "Edited answer" };
      }
    }
  });
  const chatId = "chat_20260703_161000_edit";
  const firstTaskId = "task_000001_20260703_161001_edit";
  const secondTaskId = "task_000002_20260703_161002_edit";
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Chat",
    createdAt: 1783087800000,
    updatedAt: 1783087900000,
    tasks: [{
      id: firstTaskId,
      fileName: `${firstTaskId}.json`,
      sequence: 1,
      title: "Original prompt",
      createdAt: 1783087801000,
      updatedAt: 1783087802000,
      status: "completed"
    }, {
      id: secondTaskId,
      fileName: `${secondTaskId}.json`,
      sequence: 2,
      title: "Later prompt",
      createdAt: 1783087803000,
      updatedAt: 1783087804000,
      status: "completed"
    }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${firstTaskId}`, JSON.stringify({
    id: firstTaskId,
    fileName: `${firstTaskId}.json`,
    sequence: 1,
    prompt: "Original prompt",
    title: "Original prompt",
    createdAt: 1783087801000,
    updatedAt: 1783087802000,
    status: "completed",
    executionGeneration: 1,
    changes: { files: [{ path: "old.md" }], attempted: [{ path: "attempted.md" }], blocked: [] },
    resume: { reason: "approval" },
    plan: { id: "old-plan" },
    events: [
      { type: "chat-response", content: "Original answer" }
    ]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${secondTaskId}`, JSON.stringify({
    id: secondTaskId,
    fileName: `${secondTaskId}.json`,
    sequence: 2,
    prompt: "Later prompt",
    title: "Later prompt",
    createdAt: 1783087803000,
    updatedAt: 1783087804000,
    status: "completed",
    events: [{ type: "chat-response", content: "Later answer" }]
  }));

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const firstEntry = harness.toolLog.children[0];
  assert.notEqual(firstEntry.querySelector("details").open, true);
  firstEntry.querySelector(".ai-companion-box-edit").click();
  assert.equal(firstEntry.querySelector("summary").hidden, true);
  assert.equal(firstEntry.querySelector("details").open, true);
  const textarea = firstEntry.querySelector(".ai-companion-prompt-edit-textarea");
  textarea.value = "Original prompt";
  firstEntry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(payloads.length, 1);
  assert.equal(firstEntry.querySelector("summary").hidden, false);
  assert.equal(firstEntry.querySelector("details").open, false);
  assert.equal(payloads[0].prompt, "Original prompt");
  assert.equal(payloads[0].executionKind, "edited-rerun");
  assert.equal(payloads[0].executionGeneration, 2);
  assert.equal(payloads[0].conversationHistory.length, 0);
  assert.equal(harness.toolLog.children.length, 1);
  assert.equal(firstEntry.querySelector("summary").textContent, "Original prompt");
  assert.equal(getFirstChatResponse(harness).textContent, "Edited answer");
  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  assert.equal(savedIndex.tasks.length, 1);
  assert.equal(savedIndex.tasks[0].id, firstTaskId);
  assert.equal(harness.storage.has(`ai-companion-agent-tasks:${secondTaskId}`), false);
  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${firstTaskId}`));
  assert.equal(savedRecord.prompt, "Original prompt");
  assert.equal(savedRecord.executionGeneration, 2);
  assert.equal(savedRecord.lastExecutionKind, "edited-rerun");
  assert.equal(savedRecord.changes, null);
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord, "resume"), false);
  assert.equal(savedRecord.plan, null);
  assert.equal(savedRecord.events.some((event) => event.content === "Original answer"), false);
  assert.equal(savedRecord.events.some((event) => event.content === "Edited answer"), true);
});


test("AI Companion prompt inline edit resends persisted pasted images", async () => {
  const payloads = [];
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatId = "chat_20260703_191000_paste";
  const taskId = "task_000001_20260703_191001_paste";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const taskPath = `${chatDayDir}/${chatId}/${taskId}.json`;
  const attachmentPath = `${chatDayDir}/${chatId}/attachments/${taskId}/pasted-image-1.png`;
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      id: chatId,
      title: "Chat",
      createdAt: 1783098600000,
      updatedAt: 1783098601000,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review pasted image",
        createdAt: 1783098601000,
        updatedAt: 1783098601000,
        status: "completed"
      }]
    })],
    [taskPath, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review pasted image",
      title: "Review pasted image",
      createdAt: 1783098601000,
      updatedAt: 1783098601000,
      status: "completed",
      attachments: [{ name: "pasted-image-1.png", path: attachmentPath, size: 8, type: "image/png", kind: "image" }],
      events: [{ type: "chat-response", content: "Looks good." }]
    })],
    [attachmentPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Edited answer" };
      }
    }
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  assert.notEqual(entry.querySelector("details").open, true);
  entry.querySelector(".ai-companion-box-edit").click();
  assert.equal(entry.querySelector("summary").hidden, true);
  assert.equal(entry.querySelector("details").open, true);
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Edited pasted image prompt";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments.length, 1);
  assert.equal(payloads[0].attachments[0].kind, "image");
  assert.equal(payloads[0].attachments[0].path, attachmentPath);
  assert.equal(payloads[0].attachments[0].dataUrl, "data:image/png;base64,iVBORw0KGgo=");
  const savedRecord = JSON.parse(neutralinoFiles.get(taskPath));
  assert.equal(savedRecord.prompt, "Edited pasted image prompt");
  assert.equal(savedRecord.attachments[0].path, attachmentPath);
  assert.equal(Object.prototype.hasOwnProperty.call(savedRecord.attachments[0], "dataUrl"), false);
});

test("AI Companion prompt inline edit removes persisted pasted images from reruns", async () => {
  const payloads = [];
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatId = "chat_20260703_192000_paste";
  const taskId = "task_000001_20260703_192001_paste";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const taskPath = `${chatDayDir}/${chatId}/${taskId}.json`;
  const attachmentPath = `${chatDayDir}/${chatId}/attachments/${taskId}/pasted-image-1.png`;
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      id: chatId,
      title: "Chat",
      createdAt: 1783099200000,
      updatedAt: 1783099201000,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review pasted image",
        createdAt: 1783099201000,
        updatedAt: 1783099201000,
        status: "completed"
      }]
    })],
    [taskPath, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review pasted image",
      title: "Review pasted image",
      createdAt: 1783099201000,
      updatedAt: 1783099201000,
      status: "completed",
      attachments: [{ name: "pasted-image-1.png", path: attachmentPath, size: 8, type: "image/png", kind: "image" }],
      events: [{ type: "chat-response", content: "Looks good." }]
    })],
    [attachmentPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Edited answer" };
      }
    }
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  entry.querySelector(".ai-companion-prompt-edit-attachment-remove").click();
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Edited without pasted image";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments.length, 0);
  const savedRecord = JSON.parse(neutralinoFiles.get(taskPath));
  assert.equal(savedRecord.prompt, "Edited without pasted image");
  assert.deepEqual(savedRecord.attachments, []);
});
test("AI Companion prompt inline edit adds files and pasted images through the shared composer", async () => {
  const payloads = [];
  const profileDir = "C:/Users/shayg/.md-editor";
  const workspaceRoot = "C:/project";
  const chatId = "chat_20260703_193000_shared";
  const taskId = "task_000001_20260703_193001_shared";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const taskPath = `${chatDayDir}/${chatId}/${taskId}.json`;
  const originalPath = `${workspaceRoot}/original.txt`;
  const addedPath = `${workspaceRoot}/added.txt`;
  const imagePath = `${workspaceRoot}/added-image.png`;
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      id: chatId,
      title: "Chat",
      createdAt: 1783099800000,
      updatedAt: 1783099801000,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review original",
        createdAt: 1783099801000,
        updatedAt: 1783099801000,
        status: "completed"
      }]
    })],
    [taskPath, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review original",
      title: "Review original",
      createdAt: 1783099801000,
      updatedAt: 1783099801000,
      status: "completed",
      attachments: [{ name: "original.txt", path: originalPath, size: 8, type: "text/plain", kind: "text" }],
      events: [{ type: "chat-response", content: "Original answer" }]
    })],
    [originalPath, "original"],
    [addedPath, "added"],
    [imagePath, new Uint8Array([137, 80, 78, 71])]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    workspaceRoot,
    openDialogSelection: [addedPath, imagePath],
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Edited answer" };
      }
    }
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  entry.querySelector(".ai-companion-attach-files").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const textarea = entry.querySelector(".ai-companion-prompt-edit-textarea");
  pasteIntoElement(textarea, [createClipboardImageItem(createImageFile("", "data:image/png;base64,iVBORw0KGgo=", { size: 8 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  textarea.value = "Edited with shared composer attachments";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].attachments.map((attachment) => attachment.name).sort(), ["added-image.png", "added.txt", "original.txt", "pasted-image-1.png"].sort());
  assert.equal(payloads[0].attachments.some((attachment) => attachment.content === "original"), true);
  assert.equal(payloads[0].attachments.some((attachment) => attachment.content === "added"), true);
  assert.equal(payloads[0].attachments.filter((attachment) => attachment.kind === "image").length, 2);
  const savedRecord = JSON.parse(neutralinoFiles.get(taskPath));
  assert.equal(savedRecord.prompt, "Edited with shared composer attachments");
  assert.equal(savedRecord.attachments.length, 4);
  assert.equal(savedRecord.attachments.some((attachment) => Object.prototype.hasOwnProperty.call(attachment, "content")), false);
  assert.equal(savedRecord.attachments.some((attachment) => Object.prototype.hasOwnProperty.call(attachment, "dataUrl")), false);
  assert.equal(savedRecord.attachments.some((attachment) => String(attachment.path || "").includes(`/attachments/${taskId}/pasted-image-1.png`)), true);
});

function createExternalPromptEditHarness(options = {}) {
  const payloads = [];
  const modalRequests = [];
  const profileDir = "C:/Users/shayg/.md-editor";
  const workspaceRoot = "C:/project";
  const externalPath = "C:/external/context.txt";
  const chatId = "chat_20260703_200000_external";
  const taskId = "task_000001_20260703_200001_external";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const taskPath = `${chatDayDir}/${chatId}/${taskId}.json`;
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      id: chatId,
      title: "Chat",
      createdAt: 1783101600000,
      updatedAt: 1783101601000,
      workspaceRoot,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: "Review external",
        createdAt: 1783101601000,
        updatedAt: 1783101601000,
        status: "completed"
      }]
    })],
    [taskPath, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Review external",
      title: "Review external",
      createdAt: 1783101601000,
      updatedAt: 1783101601000,
      status: "completed",
      attachments: [{ name: "context.txt", path: externalPath, size: 16, type: "text/plain", kind: "text" }],
      events: [{ type: "chat-response", content: "Original answer" }]
    })],
    [externalPath, "external context"]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    workspaceRoot,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    appServices: {
      notify: {
        show: async (request) => {
          modalRequests.push(plain(request));
          return options.decision || "send";
        }
      }
    },
    bridge: {
      chat: async (payload) => {
        payloads.push(plain(payload));
        return { content: "Edited answer" };
      }
    }
  });
  return { externalPath, harness, modalRequests, neutralinoFiles, payloads, taskPath };
}

test("AI Companion prompt inline edit asks before sending persisted external attachments", async () => {
  const { externalPath, harness, modalRequests, payloads } = createExternalPromptEditHarness({ decision: "send" });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Edited external prompt";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].title, "External attachments");
  assert.equal(modalRequests[0].buttons.some((button) => button.value === "send"), true);
  assert.equal(modalRequests[0].buttons.some((button) => button.value === "skip"), true);
  assert.equal(modalRequests[0].buttons.some((button) => button.value === "cancel"), true);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments.length, 1);
  assert.equal(payloads[0].attachments[0].path, externalPath);
  assert.equal(payloads[0].attachments[0].content, "external context");
});

test("AI Companion prompt inline edit can skip persisted external attachments", async () => {
  const { externalPath, harness, modalRequests, neutralinoFiles, payloads, taskPath } = createExternalPromptEditHarness({ decision: "skip" });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Edited without external content";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modalRequests.length, 1);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].attachments.length, 0);
  const savedRecord = JSON.parse(neutralinoFiles.get(taskPath));
  assert.equal(savedRecord.attachments[0].path, externalPath);
});

test("AI Companion prompt inline edit cancel keeps external attachment rerun unsent", async () => {
  const { harness, modalRequests, payloads } = createExternalPromptEditHarness({ decision: "cancel" });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Cancelled external prompt";
  entry.querySelector(".ai-companion-prompt-edit-save").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modalRequests.length, 1);
  assert.equal(payloads.length, 0);
  assert.ok(entry.querySelector(".ai-companion-prompt-edit-textarea"));
});

test("AI Companion prompt inline edit cancel discards shared composer attachment changes", async () => {
  const harness = createPanelHarness();
  const chatId = "chat_20260703_194000_cancel";
  const taskId = "task_000001_20260703_194001_cancel";
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: chatId,
    title: "Chat",
    createdAt: 1783100400000,
    updatedAt: 1783100401000,
    tasks: [{
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      title: "Original prompt",
      createdAt: 1783100401000,
      updatedAt: 1783100401000,
      status: "completed"
    }]
  }));
  harness.storage.set(`ai-companion-agent-tasks:${taskId}`, JSON.stringify({
    id: taskId,
    fileName: `${taskId}.json`,
    sequence: 1,
    prompt: "Original prompt",
    title: "Original prompt",
    createdAt: 1783100401000,
    updatedAt: 1783100401000,
    status: "completed",
    attachments: [
      { name: "original.txt", size: 8, type: "text/plain", kind: "text" },
      { name: "second.md", size: 12, type: "text/markdown", kind: "text" }
    ],
    events: [{ type: "chat-response", content: "Original answer" }]
  }));

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  entry.querySelector(".ai-companion-prompt-edit-attachment-remove").click();
  const textarea = entry.querySelector(".ai-companion-prompt-edit-textarea");
  pasteIntoElement(textarea, [createClipboardImageItem(createImageFile("", "data:image/png;base64,iVBORw0KGgo=", { size: 8 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  entry.querySelector(".ai-companion-prompt-edit-cancel").click();
  assert.equal(entry.querySelector("summary").hidden, false);
  assert.equal(entry.querySelector("details").open, false);

  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${taskId}`));
  assert.equal(savedRecord.prompt, "Original prompt");
  assert.deepEqual(savedRecord.attachments, [
    { name: "original.txt", size: 8, type: "text/plain", kind: "text" },
    { name: "second.md", size: 12, type: "text/markdown", kind: "text" }
  ]);
  entry.querySelector(".ai-companion-box-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(entry.querySelector("summary").hidden, true);
  assert.equal(entry.querySelectorAll(".ai-companion-attachment-chip").length, 2);
  const reopenedTextarea = entry.querySelector(".ai-companion-prompt-edit-textarea");
  pasteIntoElement(reopenedTextarea, [createClipboardImageItem(createImageFile("", "data:image/png;base64,iVBORw0KGgo=", { size: 8 }))]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(entry.querySelectorAll(".ai-companion-attachment-chip").length, 3);
});
test("AI Companion prompt inline edit cancels on outside click", async () => {
  const harness = createPanelHarness({
    bridge: {
      chat: async () => ({ content: "Answer" })
    }
  });

  harness.agentInput.value = "Original prompt";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const entry = harness.toolLog.children[0];
  entry.querySelector(".ai-companion-box-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  entry.querySelector(".ai-companion-prompt-edit-textarea").value = "Ignored edit";
  harness.document.dispatchEvent({ type: "click", target: harness.document.body });

  assert.equal(entry.querySelector(".ai-companion-prompt-edit-textarea"), null);
  assert.equal(entry.querySelector(".ai-companion-agent-task-full-text").textContent, "Original prompt");
});
test("AI Companion thinking indicator appears while awaiting model replies", async () => {
  const checkpoints = [];
  const waitForNextCheckpoint = () => new Promise((resolve) => checkpoints.push(resolve));
  const continueBridge = () => checkpoints.shift()?.();
  const harness = createPanelHarness({
    createActivityRenderer: ({ container }) => ({
      appendActivity(event) {
        const row = harness.document.createElement("div");
        row.className = `ai-companion-activity-card ${event.activity?.status || ""}`;
        row.textContent = event.activity?.title || "Activity";
        container.appendChild(row);
        return true;
      },
      appendExternalActivity(row) {
        container.appendChild(row);
        return true;
      },
      appendSummary() {},
      collapseTimeline() {}
    }),
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        await waitForNextCheckpoint();
        handleEvent({ id: "request-1", type: "tool", tool: "list_files", input: "{}", summary: "running" });
        await waitForNextCheckpoint();
        handleEvent({ id: "request-1", type: "tool", tool: "list_files", input: "{}", summary: "10 item(s)" });
        await waitForNextCheckpoint();
        handleEvent({ type: "content", content: "Done." });
        return { content: "Done." };
      }
    }
  });

  harness.agentInput.value = "List files";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();

  await new Promise((resolve) => setTimeout(resolve, 0));
  const output = getTaskOutput(harness.toolLog.children[0]);
  assert.equal(output.children[0].className, "ai-companion-thinking-indicator");
  assert.equal(output.children[0].children[1].textContent, "Thinking ...");

  continueBridge();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.children[output.children.length - 1].className, "ai-companion-thinking-indicator");
  assert.equal(output.children[output.children.length - 1].children[1].textContent, "Listing workspace files ...");

  continueBridge();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(output.children[output.children.length - 1].className, "ai-companion-thinking-indicator");

  continueBridge();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(output.children.some((child) => child.className === "ai-companion-thinking-indicator"), false);
  assert.equal(output.children.some((child) => child.className.includes("ai-companion-chat-response")), true);
});

test("AI Companion thinking indicator shows a rate-limit countdown while waiting", async () => {
  let nowMs = 1_000_000;
  let nextTimerId = 1;
  const intervalCallbacks = new Map();
  class FakeDate extends Date {
    static now() {
      return nowMs;
    }
  }
  const harness = createPanelHarness({
    Date: FakeDate,
    setInterval: (callback, delayMs) => {
      const id = nextTimerId++;
      intervalCallbacks.set(id, { callback, delayMs });
      return id;
    },
    clearInterval: (id) => intervalCallbacks.delete(id),
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        handleEvent({ type: "rate-limit-wait", delayMs: 12826 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        handleEvent({ type: "content", content: "Done." });
        return { content: "Done." };
      }
    }
  });

  harness.agentInput.value = "Retry after rate limit";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const output = getTaskOutput(harness.toolLog.children[0]);
  const indicator = output.children.find((child) => child.className === "ai-companion-thinking-indicator");
  assert.equal(indicator.children[1].textContent, "Waiting (rate limit) · 13s");

  const countdownTimer = Array.from(intervalCallbacks.values()).filter((timer) => timer.delayMs === 250).at(-1);
  nowMs += 3000;
  countdownTimer.callback();
  assert.equal(indicator.children[1].textContent, "Waiting (rate limit) · 10s");

  nowMs += 10000;
  countdownTimer.callback();
  assert.equal(indicator.children[1].textContent, "Thinking ...");

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(output.children.some((child) => child.className === "ai-companion-thinking-indicator"), false);
});

test("AI Companion previous chat dropdown reads Neutralino entry names", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatId = "chat_20260703_133011_563_rjcofk";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: chatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles: new Map([[`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      version: 1,
      id: chatId,
      title: "Chat",
      createdAt: 1783085411563,
      updatedAt: 1783085453506,
      tasks: [{
        id: "task_000002_20260703_133037_890_9rwn4z",
        fileName: "task_000002_20260703_133037_890_9rwn4z.json",
        sequence: 2,
        title: "what is this app name ?",
        createdAt: 1783085437890,
        updatedAt: 1783085453493,
        status: "completed"
      }]
    })]])
  });

  await harness.api.refreshChatSelectOptions();

  assert.equal(harness.chatSelect.disabled, false);
  assert.equal(harness.chatMenu.children.length, 1);
  assert.equal(harness.chatMenu.children[0].dataset.chatId, chatId);
  assert.equal(harness.chatMenu.children[0].textContent, "what is this app name ?");
  assert.match(harness.chatMenu.children[0].title, /^Last updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(plain(harness.savedPatches), []);
});
test("AI Companion previous chat switching does not rewrite unchanged loaded chats", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const firstChatId = "chat_20260703_143000_first";
  const firstTaskId = "task_000001_20260703_143001_first";
  const secondChatId = "chat_20260703_142000_second";
  const secondTaskId = "task_000001_20260703_142001_second";
  const neutralinoWrites = [];
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${firstChatId}/index.json`, JSON.stringify({
      version: 1,
      id: firstChatId,
      title: "Chat",
      createdAt: 1783089000000,
      updatedAt: 1783089001000,
      tasks: [{
        id: firstTaskId,
        fileName: `${firstTaskId}.json`,
        sequence: 1,
        title: "First saved chat",
        createdAt: 1783089001000,
        updatedAt: 1783089001000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${firstChatId}/${firstTaskId}.json`, JSON.stringify({
      id: firstTaskId,
      fileName: `${firstTaskId}.json`,
      sequence: 1,
      prompt: "First saved chat",
      title: "First saved chat",
      createdAt: 1783089001000,
      updatedAt: 1783089001000,
      status: "completed",
      events: [{ type: "chat-response", content: "First answer" }]
    })],
    [`${chatDayDir}/${secondChatId}/index.json`, JSON.stringify({
      version: 1,
      id: secondChatId,
      title: "Chat",
      createdAt: 1783088400000,
      updatedAt: 1783088401000,
      tasks: [{
        id: secondTaskId,
        fileName: `${secondTaskId}.json`,
        sequence: 1,
        title: "Second saved chat",
        createdAt: 1783088401000,
        updatedAt: 1783088401000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${secondChatId}/${secondTaskId}.json`, JSON.stringify({
      id: secondTaskId,
      fileName: `${secondTaskId}.json`,
      sequence: 1,
      prompt: "Second saved chat",
      title: "Second saved chat",
      createdAt: 1783088401000,
      updatedAt: 1783088401000,
      status: "completed",
      events: [{ type: "chat-response", content: "Second answer" }]
    })]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: firstChatId, type: "DIRECTORY" }, { entry: secondChatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    neutralinoWrites
  });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  clickChatMenuItem(harness, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.toolLog.children.length, 1);
  assert.deepEqual(neutralinoWrites, []);
});

test("AI Companion previous chat menu opens from the header button", async () => {
  const harness = createPanelHarness();
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_140000_abc123",
    title: "Chat",
    createdAt: 1783080000000,
    updatedAt: 1783080001000,
    tasks: [{
      id: "task_000001_20260703_140001_def456",
      fileName: "task_000001_20260703_140001_def456.json",
      sequence: 1,
      title: "Open menu test",
      createdAt: 1783080001000,
      updatedAt: 1783080001000,
      status: "completed"
    }]
  }));

  await harness.api.refreshChatSelectOptions();
  assert.equal(harness.chatMenu.hidden, true);

  harness.chatSelect.click();

  assert.equal(harness.chatMenu.hidden, false);
  assert.equal(harness.chatSelect.getAttribute("aria-expanded"), "true");
});

test("AI Companion running request blocks chat switching with notification dialog", async () => {
  const modalRequests = [];
  let finishChat;
  const harness = createPanelHarness({
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        await new Promise((resolve) => { finishChat = resolve; });
        return { content: "Done" };
      }
    }
  });
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_140000_abc123",
    title: "Chat",
    createdAt: 1783080000000,
    updatedAt: 1783080001000,
    tasks: [{
      id: "task_000001_20260703_140001_def456",
      fileName: "task_000001_20260703_140001_def456.json",
      sequence: 1,
      title: "Review startup persistence",
      createdAt: 1783080001000,
      updatedAt: 1783080001000,
      status: "completed"
    }]
  }));

  await harness.api.refreshChatSelectOptions();
  harness.agentInput.value = "Keep running";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.chatSelect.click();

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].message, "Stop current request before switching chats");
  assert.equal(harness.chatMenu.hidden, true);

  finishChat();
  await new Promise((resolve) => setTimeout(resolve, 20));
});
test("AI Companion workspace can view another chat while current chat is running", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const runningChatId = "chat_20260703_143000_running";
  const runningTaskId = "task_000001_20260703_143001_running";
  const otherChatId = "chat_20260703_142000_other";
  const otherTaskId = "task_000001_20260703_142001_other";
  const modalRequests = [];
  const neutralinoWrites = [];
  let finishChat;
  const neutralinoFiles = new Map([
    [`${chatDayDir}/${runningChatId}/index.json`, JSON.stringify({
      version: 1,
      id: runningChatId,
      title: "Running chat",
      createdAt: 1783089000000,
      updatedAt: 1783089001000,
      tasks: [{
        id: runningTaskId,
        fileName: `${runningTaskId}.json`,
        sequence: 1,
        title: "Running chat saved task",
        createdAt: 1783089001000,
        updatedAt: 1783089001000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${runningChatId}/${runningTaskId}.json`, JSON.stringify({
      id: runningTaskId,
      fileName: `${runningTaskId}.json`,
      sequence: 1,
      prompt: "Running chat saved task",
      title: "Running chat saved task",
      createdAt: 1783089001000,
      updatedAt: 1783089001000,
      status: "completed",
      events: [{ type: "chat-response", content: "Running saved answer" }]
    })],
    [`${chatDayDir}/${otherChatId}/index.json`, JSON.stringify({
      version: 1,
      id: otherChatId,
      title: "Other chat",
      createdAt: 1783088400000,
      updatedAt: 1783088401000,
      tasks: [{
        id: otherTaskId,
        fileName: `${otherTaskId}.json`,
        sequence: 1,
        title: "Other saved chat",
        createdAt: 1783088401000,
        updatedAt: 1783088401000,
        status: "completed"
      }]
    })],
    [`${chatDayDir}/${otherChatId}/${otherTaskId}.json`, JSON.stringify({
      id: otherTaskId,
      fileName: `${otherTaskId}.json`,
      sequence: 1,
      prompt: "Other saved chat",
      title: "Other saved chat",
      createdAt: 1783088401000,
      updatedAt: 1783088401000,
      status: "completed",
      events: [{ type: "chat-response", content: "Other answer" }]
    })]
  ]);
  const harness = createPanelHarness({
    isNeutralinoRuntime: true,
    profileDir,
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    neutralinoDirectories: new Map([
      [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
      [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
      [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]],
      [chatDayDir, [{ entry: runningChatId, type: "DIRECTORY" }, { entry: otherChatId, type: "DIRECTORY" }]]
    ]),
    neutralinoFiles,
    neutralinoWrites,
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        await new Promise((resolve) => { finishChat = resolve; });
        handleEvent({ type: "content", content: "Background done" });
        return { content: "Background done" };
      }
    }
  });

  const getWorkspaceChatRow = (chatId) => [...harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item")]
    .find((row) => row.dataset.chatId === chatId);

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  getWorkspaceChatRow(runningChatId).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.agentInput.value = "Keep running";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  getWorkspaceChatRow(otherChatId).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(modalRequests.length, 0);
  assert.match(harness.workspaceChatTitle.textContent, /Other chat/);
  assert.match(harness.toolLog.textContent, /Other answer/);
  const runningRow = getWorkspaceChatRow(runningChatId);
  const selectedOtherRow = getWorkspaceChatRow(otherChatId);
  assert.equal(runningRow.classList.contains("running"), true);
  assert.equal(runningRow.classList.contains("active"), false);
  assert.equal(selectedOtherRow.classList.contains("active"), true);
  assert.ok(runningRow.querySelector(".ai-companion-workspace-chat-running-indicator"));
  assert.equal(harness.agentRunButton.classList.contains("running"), true);

  runningRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(getWorkspaceChatRow(runningChatId).classList.contains("active"), true);
  assert.equal(getWorkspaceChatRow(otherChatId).classList.contains("active"), false);
  assert.match(harness.toolLog.textContent, /Keep running/);
  assert.doesNotMatch(harness.toolLog.textContent, /Task Aborted/);
  assert.equal(harness.agentRunButton.classList.contains("running"), true);

  finishChat();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.agentRunButton.classList.contains("running"), false);
  assert.equal(neutralinoWrites.some((write) => write.filePath.includes(`/${runningChatId}/`) && write.content.includes("Background done")), true);
  assert.equal(neutralinoWrites.some((write) => write.filePath.includes(`/${otherChatId}/`) && write.content.includes("Background done")), false);
});

test("AI Companion previous chat refresh writes debug log breadcrumbs", async () => {
  const harness = createPanelHarness();
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_150000_abc123",
    title: "Chat",
    createdAt: 1783083600000,
    updatedAt: 1783083601000,
    tasks: [{
      id: "task_000001_20260703_150001_def456",
      fileName: "task_000001_20260703_150001_def456.json",
      sequence: 1,
      title: "Log breadcrumb test",
      createdAt: 1783083601000,
      updatedAt: 1783083601000,
      status: "completed"
    }]
  }));

  await harness.api.refreshChatSelectOptions();
  harness.chatSelect.click();

  assert.equal(harness.appDebugLogs.some((entry) => entry.message === "[ai-companion] chat history refresh started"), true);
  assert.equal(harness.appDebugLogs.some((entry) => entry.message === "[ai-companion] chat history rendered menu"), true);
  assert.equal(harness.appDebugLogs.some((entry) => entry.message === "[ai-companion] chat history header control clicked"), true);
});
test("AI Companion chat mode displays and reloads tool events as activity", async () => {
  const activityEvents = [];
  const renderedActivityRows = new Map();
  let collapseCount = 0;
  const renderActivityRow = (document, container, event) => {
    activityEvents.push(event);
    let row = renderedActivityRows.get(event.activity?.id);
    if (!row) {
      row = document.createElement("div");
      container.appendChild(row);
      renderedActivityRows.set(event.activity?.id, row);
    }
    row.className = `ai-companion-activity-card ${event.activity?.status || ""}`;
    row.textContent = [event.activity?.title, event.activity?.primaryText, event.activity?.secondaryText, event.activity?.resultSummary]
      .filter(Boolean)
      .join(" ");
    return true;
  };
  const harness = createPanelHarness({
    createActivityRenderer: ({ container }) => ({
      appendActivity(event) {
        return renderActivityRow(harness.document, container, event);
      },
      appendExternalActivity(row) {
        container.appendChild(row);
        return true;
      },
      appendSummary() {},
      collapseTimeline() {
        collapseCount += 1;
      }
    }),
    bridge: {
      chat: async (_payload, handleEvent) => {
        handleEvent({ type: "start" });
        handleEvent({ id: "request-1", type: "tool", tool: "list_files", input: JSON.stringify({ maxFiles: 200 }), summary: "running" });
        handleEvent({ id: "request-1", type: "tool", tool: "list_files", input: JSON.stringify({ maxFiles: 200 }), summary: "200 item(s)" });
        handleEvent({ id: "request-1", type: "tool", tool: "glob", input: JSON.stringify({ pattern: "*.md", maxFiles: 20 }), summary: "running" });
        handleEvent({ id: "request-1", type: "tool", tool: "glob", input: JSON.stringify({ pattern: "*.md", maxFiles: 20 }), summary: "12 item(s)" });
        handleEvent({ type: "content", content: "There are 132 Markdown files." });
        handleEvent({ type: "done" });
        return { content: "There are 132 Markdown files." };
      }
    }
  });

  harness.agentInput.value = "How many md files are there?";
  harness.agentInput.dispatchEvent("input");
  harness.agentRunButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const listFileEvents = activityEvents.filter((event) => event.activity?.title === "Listing workspace files");
  const globEvents = activityEvents.filter((event) => event.activity?.title === "Finding files");
  assert.equal(listFileEvents.length, 2);
  assert.equal(globEvents.length, 2);
  assert.equal(listFileEvents[0].activity.id, listFileEvents[1].activity.id);
  assert.equal(globEvents[0].activity.id, globEvents[1].activity.id);
  assert.notEqual(listFileEvents[1].activity.id, globEvents[1].activity.id);
  assert.equal(listFileEvents[1].activity.resultSummary, "200 item(s)");
  assert.equal(globEvents[1].activity.resultSummary, "12 item(s)");
  assert.equal(renderedActivityRows.size, 2);
  assert.equal(collapseCount >= 1, true);

  const savedIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  const savedTask = savedIndex.tasks[0];
  const savedRecord = JSON.parse(harness.storage.get(`ai-companion-agent-tasks:${savedTask.id}`));
  assert.equal(savedRecord.events.some((event) => event.activity?.title === "Listing workspace files"), true);

  activityEvents.length = 0;
  renderedActivityRows.clear();
  let reloadCollapseCount = 0;
  let reloadHarness;
  reloadHarness = createPanelHarness({
    createActivityRenderer: ({ container }) => ({
      appendActivity(event) {
        return renderActivityRow(reloadHarness.document, container, event);
      },
      appendExternalActivity(row) {
        container.appendChild(row);
        return true;
      },
      appendSummary() {},
      collapseTimeline() {
        reloadCollapseCount += 1;
      }
    })
  });
  reloadHarness.storage.set("ai-companion-chats", JSON.stringify({
    ...savedIndex,
    id: "chat_20260703_160000_reload",
    tasks: [{ ...savedTask, id: "task_000001_20260703_160001_reload" }]
  }));
  reloadHarness.storage.set("ai-companion-agent-tasks:task_000001_20260703_160001_reload", JSON.stringify({
    ...savedRecord,
    id: "task_000001_20260703_160001_reload",
    events: savedRecord.events.map((event) => {
      if (event.type !== "tool") return event;
      const copy = { ...event };
      delete copy.activity;
      return copy;
    })
  }));

  await reloadHarness.api.refreshChatSelectOptions();
  clickChatMenuItem(reloadHarness, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(activityEvents.some((event) => event.activity?.title === "Listing workspace files"), true);
  assert.equal(activityEvents.some((event) => event.activity?.title === "Finding files"), true);
  assert.equal(renderedActivityRows.size, 2);
  assert.equal(reloadCollapseCount >= 1, true);
  assert.equal(reloadHarness.toolLog.querySelectorAll(".ai-companion-tool").length, 0);
});
test("AI Companion previous chat menu closes on outside click", async () => {
  const harness = createPanelHarness();
  harness.storage.set("ai-companion-chats", JSON.stringify({
    id: "chat_20260703_160000_abc123",
    title: "Chat",
    createdAt: 1783087200000,
    updatedAt: 1783087201000,
    tasks: [{
      id: "task_000001_20260703_160001_def456",
      fileName: "task_000001_20260703_160001_def456.json",
      sequence: 1,
      title: "Outside click test",
      createdAt: 1783087201000,
      updatedAt: 1783087201000,
      status: "completed"
    }]
  }));

  await harness.api.refreshChatSelectOptions();
  harness.chatSelect.click();
  assert.equal(harness.chatMenu.hidden, false);

  harness.document.dispatchEvent({ type: "click", target: harness.document.body });

  assert.equal(harness.chatMenu.hidden, true);
  assert.equal(harness.chatSelect.getAttribute("aria-expanded"), "false");
});

test("workspace open and restore preserves compact panel and bottom panel state", async () => {
  const bottomPanel = {
    hidden: false,
    activeTabId: "search-results",
    isPanelVisible() { return !this.hidden; },
    getActiveTabId() { return this.activeTabId; },
    hidePanel() { this.hidden = true; },
    activateTab(tabId) { this.activeTabId = tabId; this.hidden = false; }
  };
  const workspaceSearch = { activeView: "search", getActiveSidebarView() { return this.activeView; }, setSidebarView(view) { this.activeView = view; } };
  const tabs = [{ id: "tab-1", title: "README.md" }, { id: "tab-2", title: "notes.md" }];
  const harness = createPanelHarness({ modules: { bottomPanelTabs: bottomPanel, workspaceSearch }, tabs, activeTabId: "tab-2" });

  harness.api.setOpen(true, { persist: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "search" });
  harness.api.selectTab("chat", { persist: false });

  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), true);
  assert.equal(bottomPanel.hidden, true);
  assert.equal(harness.workspaceHistory.hidden, false);
  assert.equal(harness.workspaceContextStrip.hidden, true);
  assert.match(harness.workspaceContext.textContent, /Active filenotes\.md/);
  assert.match(harness.workspaceContext.textContent, /Open tabs2/);
  assert.equal(harness.attachFilesButton.parentNode?.classList.contains("ai-companion-agent-actions"), true);
  assert.equal(harness.attachFilesButton.getAttribute("title"), "Attach files");
  assert.equal(harness.attachFilesButton.getAttribute("aria-label"), "Attach files");
  assert.equal(harness.attachFilesButton.textContent, "");
  let attachClicks = 0;
  harness.attachFilesButton.addEventListener("click", () => { attachClicks += 1; });
  harness.attachFilesButton.click();
  assert.equal(attachClicks, 1);
  assert.equal(harness.plansView.hidden, true);

  harness.api.setWorkspaceOpen(false, { restore: true });

  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), false);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), true);
  assert.equal(bottomPanel.hidden, false);
  assert.equal(bottomPanel.activeTabId, "search-results");
  assert.equal(workspaceSearch.activeView, "search");
});

test("workspace sidebars restore saved widths", () => {
  const harness = createPanelHarness({
    globalState: {
      aiCompanionWorkspaceHistoryWidth: 390,
      aiCompanionWorkspaceInspectorWidth: 420
    }
  });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });

  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-history-width"), "390px");
  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-inspector-width"), "420px");
  assert.equal(harness.workspaceHistoryResizer.hidden, false);
  assert.equal(harness.workspaceInspectorResizer.hidden, false);
  assert.equal(harness.workspaceHistoryResizer.getAttribute("aria-valuenow"), "390");
  assert.equal(harness.workspaceInspectorResizer.getAttribute("aria-valuenow"), "420");
});

test("workspace sidebar drag resize persists widths", () => {
  const harness = createPanelHarness();

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.workspaceHistoryResizer.dispatchEvent({ type: "mousedown", clientX: 100, preventDefault() { this.defaultPrevented = true; } });
  harness.document.dispatchEvent({ type: "mousemove", clientX: 140, preventDefault() { this.defaultPrevented = true; } });
  harness.document.dispatchEvent({ type: "mouseup", clientX: 140 });
  harness.workspaceInspectorResizer.dispatchEvent({ type: "mousedown", clientX: 100, preventDefault() { this.defaultPrevented = true; } });
  harness.document.dispatchEvent({ type: "mousemove", clientX: 60, preventDefault() { this.defaultPrevented = true; } });
  harness.document.dispatchEvent({ type: "mouseup", clientX: 60 });

  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-history-width"), "360px");
  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-inspector-width"), "360px");
  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-resizing"), false);
  assert.deepEqual(plain(harness.savedPatches).filter((patch) => Object.prototype.hasOwnProperty.call(patch, "aiCompanionWorkspaceHistoryWidth")), [{ aiCompanionWorkspaceHistoryWidth: 360 }]);
  assert.deepEqual(plain(harness.savedPatches).filter((patch) => Object.prototype.hasOwnProperty.call(patch, "aiCompanionWorkspaceInspectorWidth")), [{ aiCompanionWorkspaceInspectorWidth: 360 }]);
});

test("workspace sidebar keyboard resize persists widths", () => {
  const harness = createPanelHarness();

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.workspaceHistoryResizer.dispatchEvent({ type: "keydown", key: "ArrowRight", preventDefault() { this.defaultPrevented = true; } });
  harness.workspaceInspectorResizer.dispatchEvent({ type: "keydown", key: "ArrowLeft", preventDefault() { this.defaultPrevented = true; } });

  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-history-width"), "330px");
  assert.equal(harness.panel.style.getPropertyValue("--ai-companion-workspace-inspector-width"), "330px");
  assert.deepEqual(plain(harness.savedPatches).filter((patch) => Object.prototype.hasOwnProperty.call(patch, "aiCompanionWorkspaceHistoryWidth")), [{ aiCompanionWorkspaceHistoryWidth: 330 }]);
  assert.deepEqual(plain(harness.savedPatches).filter((patch) => Object.prototype.hasOwnProperty.call(patch, "aiCompanionWorkspaceInspectorWidth")), [{ aiCompanionWorkspaceInspectorWidth: 330 }]);
});

test("workspace composer places attach files as an icon button beside the mode menu", () => {
  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");
  const attachIndex = html.indexOf('id="ai-companion-attach-files"');
  const menuListIndex = html.indexOf('class="ai-companion-mode-menu-list"');
  const elapsedIndex = html.indexOf('id="ai-companion-elapsed"');

  assert.ok(attachIndex > menuListIndex);
  assert.ok(attachIndex < elapsedIndex);
  assert.match(html.slice(attachIndex, elapsedIndex), /bi-paperclip/);
  assert.match(styles, /body\.ai-companion-workspace-open\s+\.ai-companion-agent-actions\s*>\s*\.ai-companion-attach-files\s*\{[^}]*display:\s*inline-flex;/s);
  assert.doesNotMatch(styles, /body\.ai-companion-workspace-open\s+\.ai-companion-attach-files\s*\{\s*display:\s*none;/);
});

test("workspace restore opens the compact AI panel even when it was previously closed", async () => {
  const workspaceSearch = { activeView: "files", getActiveSidebarView() { return this.activeView; }, setSidebarView(view) { this.activeView = view; } };
  const harness = createPanelHarness({ modules: { workspaceSearch } });

  assert.equal(harness.document.body.classList.contains("ai-companion-open"), false);
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), true);

  harness.api.setWorkspaceOpen(false, { restore: true });

  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), false);
  assert.equal(harness.document.body.classList.contains("ai-companion-open"), true);
  assert.equal(workspaceSearch.activeView, "files");
});
test("workspace open does not show a modal when background saved plans load fails", async () => {
  const modalRequests = [];
  const harness = createPanelHarness({
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    bridge: {
      plansList: async () => {
        throw new Error("AI Companion bridge process exited before completing the request.");
      }
    }
  });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modalRequests.length, 0);
  assert.match(harness.plansList.textContent, /Unable to load saved plans/);
  assert.match(harness.workspaceSidebarPlans.textContent, /No saved plans loaded/);

  await harness.api.refreshPlans({ force: true });

  assert.equal(modalRequests.length, 1);
  assert.equal(modalRequests[0].message, "AI Companion bridge process exited before completing the request.");
});
test("workspace plans tab retries saved-plan loading through the existing repository source", async () => {
  const modalRequests = [];
  let plansListCalls = 0;
  const harness = createPanelHarness({
    appServices: { notify: { show: async (request) => { modalRequests.push(plain(request)); return "ok"; } } },
    bridge: {
      plansList: async () => {
        plansListCalls += 1;
        if (plansListCalls === 1) throw new Error("temporary plan load failure");
        return { plans: [{ id: "plan-retry", title: "Retried saved plan", status: "planned", path: "plans/retried.md" }] };
      }
    }
  });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(plansListCalls, 1);
  assert.match(harness.workspaceSidebarPlans.textContent, /No saved plans loaded/);

  harness.workspacePlansTab.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(plansListCalls, 2);
  assert.match(harness.workspaceSidebarPlans.textContent, /Retried saved plan/);
  assert.equal(harness.workspacePlansPane.hidden, false);
  assert.equal(harness.plansView.hidden, true);
  assert.equal(modalRequests.length, 0);
});

test("workspace new chat label follows the selected mode", () => {
  const harness = createPanelHarness();
  const label = harness.workspaceNewChatButton.querySelector("span");

  assert.equal(label.textContent, "New Chat");
  harness.api.selectTab("agent");
  assert.equal(label.textContent, "New Agentic Chat");
  harness.api.selectTab("plan");
  assert.equal(label.textContent, "New Plan");
  harness.api.selectTab("chat");
  assert.equal(label.textContent, "New Chat");
});

test("workspace untitled chat header identifies the selected mode", async () => {
  const harness = createPanelHarness();

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.api.selectTab("chat");
  harness.workspaceNewChatButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(harness.workspaceChatTitle.textContent, /^Chat \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  harness.api.selectTab("agent");
  harness.workspaceNewChatButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(harness.workspaceChatTitle.textContent, /^Chat \(agent\) \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  harness.api.selectTab("plan");
  harness.workspaceNewChatButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(harness.workspaceChatTitle.textContent, /^Chat \(plan\) \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("workspace new chat button focuses the composer", async () => {
  const harness = createPanelHarness();

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.workspaceNewChatButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.agentInput.focused, true);
});

test("workspace new chat split menu starts a chat in the selected mode", async () => {
  const harness = createPanelHarness();

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  harness.workspaceNewChatMenuButton.click();

  assert.equal(harness.workspaceNewChatMenuList.hidden, false);
  assert.equal(harness.workspaceNewChatMenuButton.getAttribute("aria-expanded"), "true");
  assert.match(harness.workspaceNewChatMenuList.children[0].querySelector(".ai-companion-workspace-menu-mode-icon").className, /bi-chat-dots/);
  assert.match(harness.workspaceNewChatMenuList.children[1].querySelector(".ai-companion-workspace-menu-mode-icon").className, /bi-robot/);
  assert.match(harness.workspaceNewChatMenuList.children[2].querySelector(".ai-companion-workspace-menu-mode-icon").className, /bi-list-check/);

  harness.workspaceNewChatModePlan.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.workspaceNewChatMenuList.hidden, true);
  assert.equal(harness.workspaceNewChatMenuButton.getAttribute("aria-expanded"), "false");
  assert.equal(harness.planTab.classList.contains("active"), true);
  assert.equal(harness.workspaceModeChip.textContent, "Plan");
  assert.match(harness.workspaceChatTitle.querySelector(".ai-companion-workspace-title-mode-icon").className, /bi-list-check/);
  assert.equal(harness.workspaceChatTitle.querySelector(".ai-companion-workspace-title-text").textContent, harness.workspaceChatTitle.textContent);
  assert.equal(harness.agentInput.focused, true);
});
test("workspace saved plans New plan starts a fresh Plan chat", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_new_plan", mode: "agent" });

  await harness.api.refreshChatSelectOptions();
  clickChatMenuItem(harness, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.toolLog.children.length, 1);

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.workspaceNewPlanButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.toolLog.children.length, 0);
  assert.equal(harness.planTab.classList.contains("active"), true);
  assert.equal(harness.workspaceModeChip.textContent, "Plan");
  assert.equal(harness.agentInput.focused, true);
});
test("workspace title edit renames the active saved chat", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_rename", mode: "agent" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  chatRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.workspaceTitleEditButton.click();
  const input = harness.document.body.querySelector("#ai-companion-chat-rename-input");
  assert.ok(input);
  input.value = "Renamed workspace chat";
  input.parentNode.querySelectorAll("button")[1].click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.workspaceChatTitle.textContent, "Renamed workspace chat");
  assert.equal(JSON.parse(harness.storage.get("ai-companion-chats")).title, "Renamed workspace chat");
});
test("workspace title edit uses the saved chat index title source", async () => {
  const chatId = "chat_20260703_170000_header_rename";
  const taskId = "task_000001_20260703_170001_header_rename";
  const createdAt = Date.parse("2026-07-03T12:00:00");
  const date = new Date(createdAt);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const chatsDir = "profile/companion/chats";
  const yearDir = `${chatsDir}/${year}`;
  const monthDir = `${yearDir}/${month}`;
  const dayDir = `${monthDir}/${day}`;
  const chatDir = `${dayDir}/${chatId}`;
  const chatIndex = {
    id: chatId,
    title: "Chat",
    createdAt,
    updatedAt: createdAt + 1000,
    tasks: [{
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      title: "Real saved chat name",
      createdAt: createdAt + 1000,
      updatedAt: createdAt + 1000,
      mode: "agent",
      status: "completed"
    }]
  };
  const neutralinoDirectories = new Map([
    [chatsDir, [{ name: year, type: "DIRECTORY" }]],
    [yearDir, [{ name: month, type: "DIRECTORY" }]],
    [monthDir, [{ name: day, type: "DIRECTORY" }]],
    [dayDir, [{ name: chatId, type: "DIRECTORY" }]]
  ]);
  const neutralinoFiles = new Map([
    [`${chatDir}/index.json`, JSON.stringify(chatIndex)],
    [`${chatDir}/${taskId}.json`, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: "Real saved chat name",
      title: "Real saved chat name",
      createdAt: createdAt + 1000,
      updatedAt: createdAt + 1000,
      mode: "agent",
      status: "completed",
      events: [{ type: "chat-response", content: "Existing response" }]
    })]
  ]);
  const harness = createPanelHarness({ isNeutralinoRuntime: true, neutralinoDirectories, neutralinoFiles });

  harness.api.setOpen(true, { persist: false });
  await new Promise((resolve) => setTimeout(resolve, 20));
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.workspaceChatTitle.textContent, "Real saved chat name");

  harness.workspaceTitleEditButton.click();
  const input = harness.document.body.querySelector("#ai-companion-chat-rename-input");
  assert.ok(input);
  assert.equal(input.value, "Real saved chat name");
  input.value = "Renamed from header";
  input.parentNode.querySelectorAll("button")[1].click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.workspaceChatTitle.textContent, "Renamed from header");
  assert.equal(JSON.parse(neutralinoFiles.get(`${chatDir}/index.json`)).title, "Renamed from header");
});

test("workspace chat history labels saved chats without mode as Chat", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_chat_fallback" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(harness.workspaceChatList.textContent, /Chat/);
  const chatIcon = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-icon");
  assert.match(chatIcon.className, /bi-chat-dots/);
  assert.match(chatIcon.className, /mode-chat/);

  harness.workspaceChatFilterChat.click();
  assert.match(harness.workspaceChatList.textContent, /Chat/);

  harness.workspaceChatFilterAgent.click();
  assert.match(harness.workspaceChatList.textContent, /No matching chats/);
});
test("workspace chat history uses Plan icon for plan chats", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Plan response", { chatId: "chat_20260703_170000_plan_icon", mode: "plan" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const planIcon = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-icon");
  assert.match(planIcon.className, /bi-list-check/);
  assert.match(planIcon.className, /mode-plan/);
});

test("workspace chat rows expose chat action menu from button and right click", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_actions", mode: "agent" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  const actionToggle = chatRow.querySelector(".ai-companion-chat-action-toggle");
  assert.ok(actionToggle);
  assert.equal(actionToggle.getAttribute("aria-label"), "Open actions for Markdown response");

  actionToggle.click();
  let openMenus = harness.document.body.querySelectorAll(".ai-companion-chat-action-menu").filter((menu) => menu.hidden === false);
  assert.equal(openMenus.length, 1);
  assert.match(openMenus[0].textContent, /Rename ChatOpen Chat FolderDelete Chat/);
  assert.equal(openMenus[0].children[2].getAttribute("role"), "separator");

  actionToggle.click();
  assert.equal(openMenus[0].hidden, true);

  const contextEvent = { type: "contextmenu", clientX: 120, clientY: 140, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
  chatRow.dispatchEvent(contextEvent);
  openMenus = harness.document.body.querySelectorAll(".ai-companion-chat-action-menu").filter((menu) => menu.hidden === false);
  assert.equal(openMenus.length, 1);
  assert.equal(contextEvent.defaultPrevented, true);
  assert.equal(openMenus[0].style.top, "140px");
  assert.match(openMenus[0].textContent, /Rename ChatOpen Chat FolderDelete Chat/);
});
test("workspace chat filter uses existing saved chat task mode", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_filter", mode: "agent" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(harness.workspaceChatList.textContent, /Agent/);
  assert.equal(harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-attachment-indicator"), null);
  assert.equal(harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-mode").classList.contains("mode-agent"), true);
  const agentIcon = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-icon");
  assert.match(agentIcon.className, /bi-robot/);
  assert.match(agentIcon.className, /mode-agent/);
  assert.notEqual(harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-time").textContent, "Saved chat");
  const chatMeta = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-meta");
  assert.equal(chatMeta.children[0].className.includes("ai-companion-workspace-chat-mode"), true);
  assert.equal(chatMeta.children[1].className.includes("ai-companion-workspace-chat-meta-separator"), true);
  assert.equal(chatMeta.children[2].className.includes("ai-companion-workspace-chat-time"), true);
  const statusDot = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-status-dot");
  assert.equal(statusDot.classList.contains("status-completed"), true);
  assert.equal(statusDot.getAttribute("aria-label"), "Completed");
  assert.equal(harness.workspaceStatusChip.textContent, "Completed");
  assert.equal(harness.workspaceStatusChip.classList.contains("status-completed"), true);

  harness.workspaceChatFilterButton.click();
  assert.equal(harness.workspaceChatFilterMenu.hidden, false);
  assert.equal(harness.workspaceChatFilterButton.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceChatFilterMenu.children[0].getAttribute("aria-checked"), "true");
  assert.equal(harness.workspaceChatFilterPlan.getAttribute("aria-checked"), "false");

  harness.workspaceChatFilterPlan.click();
  assert.equal(harness.workspaceChatFilterMenu.hidden, true);
  assert.equal(harness.workspaceChatFilterButton.getAttribute("aria-expanded"), "false");
  assert.equal(harness.workspaceChatFilterMenu.children[0].getAttribute("aria-checked"), "false");
  assert.equal(harness.workspaceChatFilterPlan.getAttribute("aria-checked"), "true");
  assert.equal(harness.workspaceChatFilterPlan.classList.contains("active"), true);
  assert.match(harness.workspaceChatList.textContent, /No matching chats/);

  harness.workspaceChatFilterAgent.click();
  assert.match(harness.workspaceChatList.textContent, /Agent/);
});
test("workspace chat search matches saved prompts and agent responses", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "The response contains a unique agent phrase.", {
    chatId: "chat_20260703_170000_content_search"
  });
  const taskKey = "ai-companion-agent-tasks:task_000001_20260703_170001_markdown";
  const task = JSON.parse(harness.storage.get(taskKey));
  task.prompt = "A unique user prompt about filtering";
  task.attachments = [{ name: "notes.md", type: "text/markdown", kind: "text" }];
  harness.storage.set(taskKey, JSON.stringify(task));

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const attachmentIndicator = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-attachment-indicator");
  assert.ok(attachmentIndicator);
  assert.equal(attachmentIndicator.getAttribute("aria-label"), "Contains attachments");
  assert.equal(attachmentIndicator.parentNode.className, "ai-companion-workspace-chat-icon-column");
  assert.equal(attachmentIndicator.querySelector(".bi-paperclip").className, "bi bi-paperclip");

  harness.workspaceChatSearch.value = "unique user prompt";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.match(harness.workspaceChatList.textContent, /Markdown response/);

  harness.workspaceChatSearch.value = "unique agent phrase";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.match(harness.workspaceChatList.textContent, /Markdown response/);

  harness.workspaceChatSearch.value = "content that is not saved";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.match(harness.workspaceChatList.textContent, /No matching chats/);
});
test("workspace chat history limits rows and loads more saved chats", async () => {
  const profileDir = "C:/Users/shayg/.md-editor";
  const chatsDir = `${profileDir}/companion/chats`;
  const chatDayDir = `${chatsDir}/2026/07/03`;
  const neutralinoDirectories = new Map([
    [chatsDir, [{ entry: "2026", type: "DIRECTORY" }]],
    [`${chatsDir}/2026`, [{ entry: "07", type: "DIRECTORY" }]],
    [`${chatsDir}/2026/07`, [{ entry: "03", type: "DIRECTORY" }]]
  ]);
  const neutralinoFiles = new Map();
  const chatEntries = [];
  const baseTime = 1783089000000;
  for (let index = 0; index < 205; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    const chatId = `chat_20260703_1430${number}_load_more`;
    const taskId = `task_000001_20260703_1430${number}_load_more`;
    const updatedAt = baseTime + index;
    chatEntries.push({ entry: chatId, type: "DIRECTORY" });
    neutralinoFiles.set(`${chatDayDir}/${chatId}/index.json`, JSON.stringify({
      version: 1,
      id: chatId,
      title: "Chat",
      createdAt: updatedAt,
      updatedAt,
      tasks: [{
        id: taskId,
        fileName: `${taskId}.json`,
        sequence: 1,
        title: `Saved chat ${number}`,
        createdAt: updatedAt,
        updatedAt,
        mode: index % 2 === 0 ? "agent" : "chat",
        status: index % 3 === 0 ? "error" : "completed"
      }]
    }));
    neutralinoFiles.set(`${chatDayDir}/${chatId}/${taskId}.json`, JSON.stringify({
      id: taskId,
      fileName: `${taskId}.json`,
      sequence: 1,
      prompt: `Saved chat ${number}`,
      title: `Saved chat ${number}`,
      createdAt: updatedAt,
      updatedAt,
      mode: index % 2 === 0 ? "agent" : "chat",
      status: index % 3 === 0 ? "error" : "completed",
      events: [{ type: "chat-response", content: `Answer ${number}` }]
    }));
  }
  neutralinoDirectories.set(chatDayDir, chatEntries);

  const harness = createPanelHarness({ isNeutralinoRuntime: true, profileDir, neutralinoDirectories, neutralinoFiles });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(harness.chatMenu.children.length, 25);
  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 25);
  let loadMore = harness.workspaceChatList.querySelector(".ai-companion-workspace-load-more");
  assert.ok(loadMore);
  assert.equal(loadMore.textContent, "Load more chats (15)");

  loadMore.click();

  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 40);
  loadMore = harness.workspaceChatList.querySelector(".ai-companion-workspace-load-more");
  assert.equal(loadMore.textContent, "Load more chats (15)");
  loadMore.click();
  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 55);

  while (harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length < 190) {
    loadMore = harness.workspaceChatList.querySelector(".ai-companion-workspace-load-more");
    assert.equal(loadMore.textContent, "Load more chats (15)");
    loadMore.click();
  }

  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 190);
  loadMore = harness.workspaceChatList.querySelector(".ai-companion-workspace-load-more");
  assert.equal(loadMore.textContent, "Load more chats (10)");
  loadMore.click();
  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 200);
  assert.equal(harness.workspaceChatList.querySelector(".ai-companion-workspace-load-more"), null);

  harness.workspaceChatSearch.value = "Answer 160";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 1);
  assert.match(harness.workspaceChatList.textContent, /Saved chat 160/);

  harness.workspaceChatFilterAgent.click();
  assert.match(harness.workspaceChatList.textContent, /No matching chats/);
  harness.workspaceChatFilterChat.click();
  const folderSearchResult = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  assert.ok(folderSearchResult);
  folderSearchResult.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.workspaceChatTitle.textContent, "Saved chat 160");

  harness.workspaceChatFilterMenu.children[0].click();
  harness.workspaceChatSearch.value = "";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.equal(harness.workspaceChatList.querySelectorAll(".ai-companion-workspace-chat-item").length, 25);
  assert.doesNotMatch(harness.workspaceChatList.textContent, /Saved chat 160/);

  harness.workspaceChatSearch.value = "Answer 001";
  harness.workspaceChatSearch.dispatchEvent("input");
  assert.match(harness.workspaceChatList.textContent, /No matching chats/);
});
test("workspace task details activity counts only tool activity events", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_activity_count",
    mode: "agent",
    events: [
      { type: "chat-response", content: "Done" },
      { type: "approval", approvalId: "approval-count", title: "Approval count" },
      { type: "tool", tool: "read_file", activity: { title: "read_file", status: "completed" } },
      { type: "tool-error", tool: "search_text", error: "No match" }
    ]
  });
  const chatIndex = JSON.parse(harness.storage.get("ai-companion-chats"));
  chatIndex.tokenTotals = { totalSent: 120, totalReceived: 45, requestCount: 2, lastContextTokens: 240 };
  harness.storage.set("ai-companion-chats", JSON.stringify(chatIndex));

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  chatRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.workspaceInspector.children.includes(harness.workspaceTaskDetails), false);
  assert.equal(harness.workspaceTaskDetailsPopover.hidden, true);
  harness.workspaceTaskDetailsToggle.rect = { left: 384, right: 406, top: 45, bottom: 67, width: 22, height: 22 };

  harness.workspaceTaskDetailsToggle.click();

  assert.equal(harness.workspaceTaskDetailsPopover.hidden, false);
  assert.equal(harness.workspaceTaskDetailsToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceTaskDetailsPopover.style.top, "75px");
  assert.equal(harness.workspaceTaskDetailsPopover.style.left, "384px");
  assert.equal(harness.workspaceTaskDetailsPopover.style.right, "auto");
  assert.match(harness.workspaceTaskDetails.textContent, /Duration0s/);
  assert.match(harness.workspaceTaskDetails.textContent, /Activity2/);
  assert.match(harness.workspaceTaskDetails.textContent, /Requests2/);
  assert.match(harness.workspaceTaskDetails.textContent, /Sent tokens120/);
  assert.match(harness.workspaceTaskDetails.textContent, /Received tokens45/);
  assert.match(harness.workspaceTaskDetails.textContent, /Context tokens240/);
  assert.match(harness.workspaceTaskDetails.textContent, /Total tokens165/);
  assert.match(harness.workspaceTaskDetails.textContent, /IDtask_000001_20260703_170001_markdown/);

  harness.document.dispatchEvent({ type: "click", target: harness.document.body });
  assert.equal(harness.workspaceTaskDetailsPopover.hidden, true);
  assert.equal(harness.workspaceTaskDetailsPopover.style.top, "");
  assert.equal(harness.workspaceTaskDetailsPopover.style.left, "");
  assert.equal(harness.workspaceTaskDetailsToggle.getAttribute("aria-expanded"), "false");

  harness.workspaceTaskDetailsToggle.click();
  harness.panel.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(harness.workspaceTaskDetailsPopover.hidden, true);
});
test("workspace Changes keeps two file entries inline", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Done", {
    chatId: "chat_20260703_170000_two_changes",
    mode: "agent",
    events: [{
      type: "agent-summary",
      finalResponse: "Done",
      changedFiles: [
        { path: "src/main/feature/components/one.js", action: "created", description: "Created one.", additions: 2, deletions: 0 },
        { path: "src/two.js", action: "renamed", oldPath: "src/old-two.js", description: "Renamed two.", additions: 3, deletions: 2 }
      ],
      attemptedChanges: [],
      blockedChanges: []
    }]
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item").click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.taskChangesSection.hidden, false);
  assert.equal(harness.taskChangesToggle.hidden, false);
  assert.equal(harness.taskChangesToggle.getAttribute("aria-label"), "Expand changes");
  assert.equal(harness.taskChangesList.hidden, false);
  assert.equal(harness.taskChangesList.children.length, 2);
  assert.match(harness.taskChangesSummary.textContent, /2 files/);
  assert.doesNotMatch(harness.taskChangesSummary.textContent, /Changed files/);
  assert.match(harness.taskChangesSummary.textContent, /\+5/);
  assert.match(harness.taskChangesSummary.textContent, /-2/);
  assert.equal(harness.taskChangesList.children[0].tagName, "BUTTON");
  assert.match(harness.taskChangesList.children[0].textContent, /^Asrc\/main\/feature\/components\/one\.js\+2-0$/);
  assert.match(harness.taskChangesList.children[0].title, /src[\\/]main[\\/]feature[\\/]components[\\/]one\.js/);
  assert.match(harness.taskChangesList.children[1].textContent, /^Rsrc\/two\.js\+3-2$/);

  harness.taskChangesList.children[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.openedDocuments.at(-1).source.path, "src/main/feature/components/one.js");
  assert.equal(harness.document.body.classList.contains("ai-companion-workspace-open"), false);
});

test("workspace Changes expands larger summaries as a scrollable overlay", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });
  seedSavedChatResponse(harness, "Done", {
    chatId: "chat_20260703_170000_many_changes",
    mode: "agent",
    events: [{
      type: "agent-summary",
      finalResponse: "Done",
      changedFiles: [
        { path: "src/one.js", description: "Updated one.", additions: 2, deletions: 1 },
        { path: "src/two.js", description: "Updated two.", additions: 3, deletions: 2 },
        { path: "src/three.js", action: "deleted", description: "Deleted three.", additions: 0, deletions: 4 }
      ],
      attemptedChanges: [{ path: "src/four.js", description: "Write failed." }],
      blockedChanges: [{
        code: "intent-mutation-blocked",
        count: 2,
        items: [
          { tool: "write_file", path: "src/five.js", reason: "Outside approved scope." },
          { tool: "write_file", path: "src/six.js", reason: "Outside approved scope." }
        ]
      }]
    }]
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item").click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.taskChangesToggle.hidden, false);
  assert.equal(harness.taskChangesToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.taskChangesToggle.getAttribute("aria-label"), "Expand changes");
  assert.equal(harness.taskChangesList.hidden, false);
  assert.match(harness.taskChangesSummary.textContent, /3 files/);
  assert.match(harness.taskChangesSummary.textContent, /Attempted 1/);
  assert.match(harness.taskChangesSummary.textContent, /Blocked 2/);
  assert.equal(harness.taskChangesList.children.length, 6);
  assert.equal(harness.taskChangesList.children[2].tagName, "DIV");
  assert.match(harness.taskChangesList.children[2].textContent, /^Dsrc\/three\.js\+0-4$/);
  assert.equal(harness.taskChangesList.children[3].classList.contains("is-collapsed-overflow"), true);
  assert.doesNotMatch(harness.taskChangesList.children[3].textContent, /\+0-0/);
  assert.equal(harness.taskChangesList.children[4].classList.contains("is-collapsed-overflow"), true);
  assert.equal(harness.taskChangesList.children[5].textContent, "+2 more");

  harness.taskChangesList.children[5].click();

  assert.equal(harness.taskChangesToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.taskChangesToggle.getAttribute("aria-label"), "Collapse changes");
  assert.equal(harness.taskChangesSection.classList.contains("is-expanded"), true);
  assert.equal(harness.taskChangesList.hidden, false);
  assert.equal(harness.taskChangesList.children.length, 6);
  assert.equal(harness.taskChangesList.children[4].tagName, "DETAILS");
  assert.match(harness.taskChangesList.children[4].textContent, /Blocked proposals \(2\)/);
  assert.equal(harness.taskChangesSection.style.getPropertyValue("--ai-companion-changes-overlay-bottom"), "108px");
  assert.equal(harness.taskChangesSection.style.getPropertyValue("--ai-companion-changes-overlay-height"), "604px");

  harness.taskChangesToggle.click();

  assert.equal(harness.taskChangesToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.taskChangesToggle.getAttribute("aria-label"), "Expand changes");
  assert.equal(harness.taskChangesSection.classList.contains("is-expanded"), false);
  assert.equal(harness.taskChangesList.hidden, false);
});

test("workspace task details ID copies the full value and shows temporary feedback", async () => {
  const feedbackTimers = new Map();
  let nextFeedbackTimerId = 1;
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    setTimeout(callback, delay, ...args) {
      if (delay !== 1200) return setTimeout(callback, delay, ...args);
      const timerId = nextFeedbackTimerId++;
      feedbackTimers.set(timerId, () => callback(...args));
      return timerId;
    },
    clearTimeout(timerId) {
      if (!feedbackTimers.delete(timerId)) clearTimeout(timerId);
    }
  });
  const taskId = "task_000001_20260703_170001_full_copy_value";
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_copy_id",
    taskId,
    mode: "agent"
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceTaskDetailsToggle.click();
  const idRow = harness.workspaceTaskDetails.children.find((row) => row.textContent.startsWith("ID"));
  const idValue = idRow.querySelector(".ai-companion-workspace-summary-value");

  assert.equal(idRow.title, "Copy ID");
  assert.equal(idRow.getAttribute("aria-label"), "Copy ID");
  assert.equal(idRow.classList.contains("ai-companion-workspace-summary-copy-row"), true);
  assert.equal(idValue.getAttribute("aria-live"), "polite");

  idRow.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.clipboardWrites, [taskId]);
  assert.equal(idValue.textContent, "ID copied");
  assert.equal(idRow.classList.contains("is-copied"), true);
  assert.equal(harness.workspaceTaskDetailsPopover.hidden, false);
  const firstTimerId = feedbackTimers.keys().next().value;

  idRow.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.clipboardWrites, [taskId, taskId]);
  assert.equal(feedbackTimers.has(firstTimerId), false);
  assert.equal(feedbackTimers.size, 1);
  const [activeTimerId, restoreFeedback] = feedbackTimers.entries().next().value;
  feedbackTimers.delete(activeTimerId);
  restoreFeedback();

  assert.equal(idValue.textContent, taskId);
  assert.equal(idRow.classList.contains("is-copied"), false);
});

test("workspace task details does not copy the New chat placeholder", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const idRow = harness.workspaceTaskDetails.children.find((row) => row.textContent.startsWith("ID"));

  assert.equal(idRow.textContent, "IDNew chat");
  assert.equal(idRow.classList.contains("ai-companion-workspace-summary-copy-row"), false);
  assert.equal(idRow.getAttribute("aria-label"), null);
  idRow.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.clipboardWrites, []);
});

test("workspace task details preserves the ID when clipboard copying fails", async () => {
  const notices = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    clipboardWriteError: new Error("Clipboard unavailable"),
    appServices: { notify: { show: (options) => notices.push(options) } }
  });
  const taskId = "task_000001_20260703_170001_copy_failure";
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_copy_failure",
    taskId,
    mode: "agent"
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const idRow = harness.workspaceTaskDetails.children.find((row) => row.textContent.startsWith("ID"));
  const idValue = idRow.querySelector(".ai-companion-workspace-summary-value");

  idRow.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(idValue.textContent, taskId);
  assert.equal(idRow.classList.contains("is-copied"), false);
  assert.deepEqual(harness.clipboardWrites, []);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].message, "Copy failed");
});

test("workspace inspector panel titles collapse and expand sections", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.workspaceContext.hidden, false);
  assert.equal(harness.workspaceContextToggle.getAttribute("aria-expanded"), "true");

  harness.workspaceContextToggle.click();
  assert.equal(harness.workspaceContext.hidden, true);
  assert.equal(harness.workspaceContextToggle.getAttribute("aria-expanded"), "false");
  assert.equal(harness.workspaceContextSection.classList.contains("collapsed"), true);

  harness.workspaceContextInfoButton.click();
  assert.equal(harness.workspaceContext.hidden, true);
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, false);

  harness.workspaceContextToggle.click();
  assert.equal(harness.workspaceContext.hidden, false);
  assert.equal(harness.workspaceContextToggle.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceContextSection.classList.contains("collapsed"), false);
});
test("workspace inspector info buttons open and close explanatory bubbles", async () => {
  const harness = createPanelHarness({ isNeutralinoRuntime: false });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.workspaceInspector.rect = { left: 20, right: 344, top: 0, bottom: 720, width: 324, height: 720 };
  harness.workspaceContextInfoButton.rect = { left: 284, right: 306, top: 52, bottom: 74, width: 22, height: 22 };

  harness.workspaceContextInfoButton.click();
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, false);
  assert.equal(harness.workspaceContextInfoButton.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceInspectorInfoTitle.textContent, "Context");
  assert.match(harness.workspaceInspectorInfoBody.textContent, /workspace, active file, open tabs/);
  assert.equal(harness.workspaceInspectorInfoPopover.style.top, "82px");
  assert.equal(harness.workspaceInspectorInfoPopover.style.left, "28px");
  assert.equal(harness.workspaceInspectorInfoPopover.style.right, "auto");
  assert.equal(harness.workspaceInspectorInfoPopover.style.width, "300px");

  harness.workspaceToolsInfoButton.click();
  assert.equal(harness.workspaceContextInfoButton.getAttribute("aria-expanded"), "false");
  assert.equal(harness.workspaceToolsInfoButton.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceInspectorInfoTitle.textContent, "Tools");
  assert.match(harness.workspaceInspectorInfoBody.textContent, /tool activity recorded/);

  harness.workspaceApprovalsInfoButton.dispatchEvent({ type: "keydown", key: " ", preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } });
  assert.equal(harness.workspaceToolsInfoButton.getAttribute("aria-expanded"), "false");
  assert.equal(harness.workspaceApprovalsInfoButton.getAttribute("aria-expanded"), "true");
  assert.equal(harness.workspaceInspectorInfoTitle.textContent, "Approvals");
  assert.match(harness.workspaceInspectorInfoBody.textContent, /pending and resolved approval events/);

  harness.document.dispatchEvent({ type: "click", target: harness.document.body });
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, true);
  assert.equal(harness.workspaceInspectorInfoPopover.style.top, "");
  assert.equal(harness.workspaceInspectorInfoPopover.style.left, "");
  assert.equal(harness.workspaceApprovalsInfoButton.getAttribute("aria-expanded"), "false");

  harness.workspaceContextInfoButton.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } });
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, false);
  assert.equal(harness.workspaceContextInfoButton.getAttribute("aria-expanded"), "true");

  harness.panel.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, true);
  assert.equal(harness.workspaceContextInfoButton.getAttribute("aria-expanded"), "false");

  harness.workspaceToolsInfoButton.click();
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, false);
  harness.api.setWorkspaceOpen(false, { restore: false });
  assert.equal(harness.workspaceInspectorInfoPopover.hidden, true);
  assert.equal(harness.workspaceToolsInfoButton.getAttribute("aria-expanded"), "false");
});
test("workspace tools show terminal saved running activity as ran", async () => {
  const restoredActivities = [];
  const focusedActivities = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    createActivityRenderer: () => ({
      appendActivity(event) {
        restoredActivities.push(plain(event.activity));
        return true;
      },
      appendExternalActivity() {},
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {},
      focusActivity(activityId) {
        focusedActivities.push(activityId);
        return true;
      }
    })
  });
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_tools",
    mode: "agent",
    events: [
      { type: "tool", tool: "read_file", activity: { title: "read_file", status: "completed" } },
      { type: "tool", tool: "search_text", activity: { title: "search_text", status: "running" } },
      { type: "tool", tool: "write_file", activity: { title: "write_file", status: "completed" } }
    ]
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  chatRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const text = harness.workspaceTools.textContent;
  assert.match(text, /Running0/);
  assert.match(text, /Completed3/);
  assert.match(text, /Failed0/);
  assert.match(text, /search_textRan/);
  assert.doesNotMatch(text, /search_textrunning/);
  assert.ok(text.indexOf("write_file") < text.indexOf("search_text"));
  assert.ok(text.indexOf("search_text") < text.indexOf("read_file"));

  assert.deepEqual(restoredActivities.map((activity) => activity.status), ["completed", "completed", "completed"]);

  const toolRow = harness.workspaceTools.children[4];
  assert.match(toolRow.querySelector(".ai-companion-workspace-summary-icon").className, /bi-search/);
  toolRow.click();
  assert.equal(focusedActivities.length, 1);
});
test("workspace tools preview expands all tools and restores inspector panels", async () => {
  const focusedActivities = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    createActivityRenderer: ({ container }) => ({
      appendActivity(event) {
        const row = harness.document.createElement("div");
        row.className = "ai-companion-activity-card";
        row.textContent = event.activity?.title || "Activity";
        container.appendChild(row);
        return true;
      },
      appendExternalActivity(row) {
        container.appendChild(row);
        return true;
      },
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {},
      focusActivity(activityId) {
        focusedActivities.push(activityId);
        return true;
      }
    })
  });
  const events = Array.from({ length: 8 }, (_unused, index) => ({
    type: "tool",
    tool: index % 2 === 0 ? "read_file" : "search_text",
    createdAt: 1783090800000 + index,
    completedAt: 1783090801000 + index,
    activity: { id: `tool-${index}`, title: `Tool ${index}`, status: "completed" }
  }));
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_many_tools",
    mode: "agent",
    events
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  chatRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  harness.workspaceContextToggle.click();
  assert.equal(harness.workspaceContext.hidden, true);
  assert.equal(harness.workspaceApprovals.hidden, false);
  assert.equal(harness.workspaceTools.children.length, 10);
  assert.match(harness.workspaceTools.textContent, /View all tools8/);
  assert.doesNotMatch(harness.workspaceTools.textContent, /Tool 1/);

  harness.workspaceTools.children[3].click();
  assert.deepEqual(focusedActivities, ["tool-7"]);

  harness.workspaceTools.children[9].click();
  assert.equal(harness.workspaceContext.hidden, true);
  assert.equal(harness.workspaceApprovals.hidden, true);
  assert.equal(harness.workspaceTools.hidden, false);
  assert.equal(harness.workspaceTools.children.length, 12);
  assert.match(harness.workspaceTools.textContent, /Tool 1/);
  assert.match(harness.workspaceTools.textContent, /Show less.../);

  harness.workspaceTools.children[11].click();
  assert.equal(harness.workspaceContext.hidden, true);
  assert.equal(harness.workspaceApprovals.hidden, false);
  assert.equal(harness.workspaceTools.children.length, 10);
  assert.match(harness.workspaceTools.textContent, /View all tools8/);
  assert.doesNotMatch(harness.workspaceTools.textContent, /Tool 1/);
});

test("workspace approvals show pending approvals before resolved approvals", async () => {
  const focusedApprovals = [];
  const renderedApprovalIds = [];
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    createActivityRenderer: ({ container }) => ({
      appendActivity() { return true; },
      appendExternalActivity(row) {
        renderedApprovalIds.push(row.dataset.aiCompanionActivityId);
        container.appendChild(row);
      },
      appendNarration() {},
      appendSummary() {},
      collapseTimeline() {},
      focusActivity(activityId) {
        focusedApprovals.push(activityId);
        return true;
      }
    })
  });
  seedSavedChatResponse(harness, "Existing response", {
    chatId: "chat_20260703_170000_approvals",
    mode: "agent",
    events: [
      { type: "approval", approvalId: "resolved-approval", title: "Resolved approval", response: { decision: "approve", label: "Approved", respondedAt: 1783090802000 } },
      { type: "approval", approvalId: "pending-approval", title: "Pending approval" }
    ]
  });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chatRow = harness.workspaceChatList.querySelector(".ai-companion-workspace-chat-item");
  chatRow.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(harness.workspaceApprovals.textContent, /Pending1/);
  assert.match(harness.workspaceApprovals.textContent, /History1/);
  assert.match(harness.workspaceApprovals.textContent, /pendingPending approval/);
  assert.ok(harness.workspaceApprovals.textContent.indexOf("Pending approval") < harness.workspaceApprovals.textContent.indexOf("Resolved approval"));
  assert.deepEqual(renderedApprovalIds, ["resolved-approval", "pending-approval"]);

  harness.workspaceApprovals.children[2].click();
  harness.workspaceApprovals.children[3].click();
  assert.deepEqual(focusedApprovals, ["pending-approval", "resolved-approval"]);
});
test("workspace top bar places task details beside title and omits saved plans button", () => {
  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  const titleEditIndex = html.indexOf('id="ai-companion-workspace-title-edit"');
  const detailsIndex = html.indexOf('id="ai-companion-workspace-task-details-toggle"');

  assert.equal(html.includes('id="ai-companion-workspace-plans-focus"'), false);
  assert.equal(html.includes('id="ai-companion-workspace-saved-plans"'), false);
  assert.notEqual(titleEditIndex, -1);
  assert.equal(detailsIndex > titleEditIndex, true);
});
test("workspace saved plans use compact card actions", async () => {
  const workspaceSearch = { activeView: "ai-companion", setSidebarView(view) { this.activeView = view; } };
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    profileDir: "C:/Users/shayg/.md-editor",
    modules: { workspaceSearch },
    bridge: {
      plansList: async () => ({ plans: [{ id: "plan-menu", title: "Menu plan", status: "planned", path: "companion/plans/menu-plan.md" }] })
    }
  });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.api.refreshPlans({ force: true });

  const planCard = harness.workspaceSidebarPlans.children[0];
  assert.equal(planCard.className.includes("ai-companion-plan-list-item"), true);
  assert.equal(planCard.className.includes("ai-companion-workspace-plan-card"), true);
  assert.match(planCard.textContent, /Menu plan/);
  const actions = planCard.querySelector(".ai-companion-plan-card-actions");
  assert.ok(actions);
  assert.equal(actions.children.length, 8);
  assert.equal(actions.children[0].getAttribute("aria-label"), "Open as tab");
  assert.equal(actions.children[1].getAttribute("aria-label"), "Jump to chat");
  assert.equal(actions.children[2].getAttribute("aria-label"), "Rename");

  actions.children[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.openedDocuments.length, 1);
  assert.equal(harness.openedDocuments[0].source.path, "C:/Users/shayg/.md-editor/companion/plans/menu-plan.md");
  assert.equal(harness.openedDocuments[0].openOptions.viewMode, "preview");
  assert.equal(workspaceSearch.activeView, "files");
});

test("workspace chat history and saved plans use existing panel sources", async () => {
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    bridge: {
      plansList: async () => ({ plans: Array.from({ length: 5 }, (_, index) => ({
        id: `plan-${index + 1}`,
        title: index === 0 ? "Saved plan" : `Saved plan ${index + 1}`,
        status: "planned",
        path: `plans/saved-${index + 1}.md`,
        sourceChatId: index === 0 ? "chat_20260703_170000_saved" : "",
        sourceTaskId: index === 0 ? "task_000001_20260703_170001_markdown" : ""
      })) }),
      planRead: async (locator) => ({ id: locator.id, title: "Saved plan", status: "planned", body: "Plan body" })
    }
  });
  seedSavedChatResponse(harness, "Existing response", { chatId: "chat_20260703_170000_saved", taskId: "task_000001_20260703_170001_markdown", mode: "agent" });

  await harness.api.refreshChatSelectOptions();
  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.api.refreshPlans({ force: true });

  assert.match(harness.workspaceChatList.textContent, /Markdown response|Chat/);
  assert.match(harness.workspaceChatList.textContent, /Agent/);
  assert.match(harness.workspaceSidebarPlans.textContent, /Saved plan/);
  assert.equal(harness.workspaceSidebarPlans.children[0].classList.contains("planned"), true);
  assert.match(harness.workspaceSidebarPlans.children[0].textContent, /Saved plan/);
  assert.match(harness.workspaceSidebarPlans.children[0].textContent, /Planned/);
  assert.equal(harness.workspaceHistoryTitle.textContent, "Recent chats");
  harness.workspacePlansTab.click();
  assert.equal(harness.workspacePlansPane.hidden, false);
  assert.equal(harness.workspaceHistoryTitle.textContent, "Saved plans");
  harness.workspaceSidebarPlans.children[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.workspaceSidebarPlans.children[0].classList.contains("active"), true);
  assert.match(harness.toolLog.textContent, /Existing response/);
  assert.equal(harness.plansView.hidden, true);
});

test("workspace mode hides normal app header chrome", () => {
  const styles = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");

  assert.match(styles, /body\.ai-companion-workspace-open \.app-header,\s*body\.ai-companion-workspace-open \.app-status-line\s*\{\s*display:\s*none;/);
  assert.match(styles, /body\.ai-companion-workspace-open \.app-container\s*\{\s*padding-bottom:\s*0;/);
  assert.match(styles, /body\.ai-companion-workspace-open\.sidebar-rail-spacious \.folder-tree-pane\s*\{[^}]*width:\s*88px;[^}]*min-width:\s*88px;[^}]*flex-basis:\s*88px;/s);
  assert.match(styles, /\.ai-companion-workspace-info-popover\s*\{[^}]*position:\s*fixed;[^}]*border-color:\s*var\(--accent-color, #3b82f6\);/s);
});


test("workspace visual shell keeps center content intentional", () => {
  const styles = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");
  const workspaceShell = styles.slice(styles.indexOf("body.ai-companion-workspace-open .ai-companion-panel"), styles.indexOf("body.ai-companion-workspace-open .folder-tree-pane"));

  assert.match(styles, /--ai-companion-workspace-content-max-width:\s*1120px;/);
  assert.match(styles, /--ai-companion-workspace-bg:\s*var\(--panel-bg\);/);
  assert.match(styles, /--ai-companion-workspace-panel-bg:\s*var\(--panel-bg\);/);
  assert.match(styles, /--ai-companion-workspace-card-bg:\s*var\(--input-bg\);/);
  assert.match(styles, /body\.ai-companion-workspace-open \.ai-companion-workspace-heading,\s*body\.ai-companion-workspace-open \.ai-companion-workspace-header-meta,\s*body\.ai-companion-workspace-open \.ai-companion-agent-view\s*\{\s*width:\s*min\(100%, var\(--ai-companion-workspace-content-max-width\)\);/);
  assert.match(styles, /body\.ai-companion-workspace-open \.ai-companion-workspace-history,[^{}]*body\.ai-companion-workspace-open \.ai-companion-workspace-inspector,[^{}]*body\.ai-companion-workspace-open \.ai-companion-workspace-chat-list,[^{}]*body\.ai-companion-workspace-open \.ai-companion-workspace-sidebar-plans,[^{}]*body\.ai-companion-workspace-open \.ai-companion-tool-log\s*\{[^}]*scrollbar-width:\s*thin;/s);
  assert.doesNotMatch(workspaceShell, /radial-gradient|linear-gradient\(180deg|linear-gradient\(145deg|box-shadow:\s*(?:inset|0\s+10px|0\s+16px)/);
  assert.match(styles, /body\.ai-companion-workspace-open \.ai-companion-chat-action-toggle\s*\{[^}]*border:\s*1px solid/s);
  assert.match(styles, /body\.ai-companion-workspace-open \.ai-companion-chat-action-menu\s*\{[^}]*z-index:\s*2200;/s);
  assert.match(styles, /\.ai-companion-workspace-menu button\.active::before,\s*\.ai-companion-workspace-menu button\[aria-checked="true"\]::before\s*\{[^}]*content:\s*"\\2713";/s);
});

test("workspace plans tab filters saved plans by search and status", async () => {
  const harness = createPanelHarness({
    isNeutralinoRuntime: false,
    bridge: {
      plansList: async () => ({ plans: [
        { id: "plan-alpha", title: "Alpha migration", status: "planned", path: "plans/alpha.md" },
        { id: "plan-beta", title: "Beta shipped", status: "implemented", path: "plans/beta.md" }
      ] })
    }
  });

  harness.api.setWorkspaceOpen(true, { previousSidebarView: "files" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.api.refreshPlans({ force: true });
  harness.workspacePlansTab.click();

  assert.match(harness.workspaceSidebarPlans.textContent, /Alpha migration/);
  assert.match(harness.workspaceSidebarPlans.textContent, /Beta shipped/);

  harness.workspacePlanSearch.value = "beta";
  harness.workspacePlanSearch.dispatchEvent("input");
  assert.doesNotMatch(harness.workspaceSidebarPlans.textContent, /Alpha migration/);
  assert.match(harness.workspaceSidebarPlans.textContent, /Beta shipped/);

  harness.workspacePlanSearch.value = "";
  harness.workspacePlanSearch.dispatchEvent("input");
  assert.equal(harness.workspacePlanFilterMenu.children[0].getAttribute("aria-checked"), "true");
  harness.workspacePlanFilterImplemented.click();
  assert.doesNotMatch(harness.workspaceSidebarPlans.textContent, /Alpha migration/);
  assert.match(harness.workspaceSidebarPlans.textContent, /Beta shipped/);
  assert.equal(harness.workspacePlanFilterImplemented.getAttribute("aria-checked"), "true");
  assert.equal(harness.workspacePlanFilterImplemented.classList.contains("active"), true);

  harness.workspacePlanFilterPlanned.click();
  assert.match(harness.workspaceSidebarPlans.textContent, /Alpha migration/);
  assert.doesNotMatch(harness.workspaceSidebarPlans.textContent, /Beta shipped/);
  assert.equal(harness.workspacePlanFilterImplemented.getAttribute("aria-checked"), "false");
  assert.equal(harness.workspacePlanFilterPlanned.getAttribute("aria-checked"), "true");
});

test("agent terminal lifecycle is summary-owned and stale runs become aborted", () => {
  const source = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "panel.js"), "utf8");
  assert.match(source, /if \(activeRunMode === "agent"\) \{\s*recordAgentEvent\(event\);\s*return;/);
  assert.match(source, /\["running", "interrupted"\]\.includes\(entry\.record\.status\)/);
  assert.match(source, /ensureAbortedTaskSummary\(entry\.record\)/);
  assert.match(source, /event\.type === "run-aborted"/);
  assert.match(source, /status === "aborted" \? "aborted"/);
  assert.doesNotMatch(source, /record\.recoveryInspection\?\.classification === "recoverable"\) record\.status = "interrupted"/);
});

test("AI operational requests preserve an explicitly empty workspace root", () => {
  const script = fs.readFileSync(path.join(webRoot, "js", "script.js"), "utf8");
  const bridge = fs.readFileSync(path.join(webRoot, "bridges", "ai-companion-bridge", "ai-companion-bridge.cjs"), "utf8");
  const neutralinoBridge = fs.readFileSync(path.join(webRoot, "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8");
  const aiRegistration = script.slice(script.indexOf("registerMarkdownViewerNeutralinoAiBridge"), script.indexOf("registerMarkdownViewerAiCompanionToolAccessSettings"));
  assert.doesNotMatch(aiRegistration, /activeFolderPath \|\| getDesktopAppRootPath\(\)/);
  assert.match(aiRegistration, /getWorkspaceRoot: function\(\) \{ return activeFolderPath \|\| ""; \}/);
  assert.match(neutralinoBridge, /Object\.hasOwn\(payload, "workspaceRoot"\) \? String\(payload\.workspaceRoot \|\| ""\) : deps\.getWorkspaceRoot/);
  assert.match(bridge, /Object\.hasOwn\(message, "workspaceRoot"\) \? String\(message\.workspaceRoot \|\| ""\) : session\.workspaceRoot/);
  assert.match(bridge, /const planRepositoryOptions = \{ signal: controller\.signal, profileRoot: requestProfileRoot \};/);
  assert.match(bridge, /planRepositoryTools\.planList\(request\.workspaceRoot, message, planRepositoryOptions\)/);
});
