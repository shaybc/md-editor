/**
 * Read-only AI Companion tools backed by the live editor state snapshot.
 */

"use strict";

const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_MAX_ITEMS = 80;
const DEFAULT_MAX_TABS = 20;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function truncateText(value, maxChars = DEFAULT_MAX_CHARS) {
  const text = String(value || "");
  const limit = clampInteger(maxChars, DEFAULT_MAX_CHARS, 1, 100000);
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function getTabPath(tab = {}) {
  return normalizePath(tab.path || tab.sourceFilePath || tab.sourceFileName || tab.title || "");
}

function createTabSummary(tab = {}) {
  return {
    id: String(tab.id || ""),
    title: String(tab.title || ""),
    type: String(tab.type || "markdown"),
    path: getTabPath(tab),
    viewMode: String(tab.viewMode || ""),
    dirty: tab.dirty === true
  };
}

function getReadContext(options = {}) {
  return asObject(options.editorReadContext);
}

function getOpenTabs(context) {
  return asArray(context.openTabs);
}

function getActiveDocument(context) {
  return asObject(context.activeDocument);
}

function findTab(context, args = {}) {
  const tabs = getOpenTabs(context);
  const tabId = String(args.tabId || "").trim();
  if (tabId) return tabs.find((tab) => String(tab?.id || "") === tabId) || null;
  const targetPath = normalizePath(args.path || "").toLowerCase();
  if (targetPath) {
    return tabs.find((tab) => {
      const tabPath = getTabPath(tab).toLowerCase();
      return tabPath === targetPath || tabPath.endsWith(`/${targetPath}`);
    }) || null;
  }
  return null;
}

function getDocumentSource(context, args = {}) {
  if (String(args.source || "active") === "tab") {
    const tab = findTab(context, args);
    return tab ? { ...createTabSummary(tab), content: String(tab.content || "") } : null;
  }
  const activeDocument = getActiveDocument(context);
  return {
    id: String(activeDocument.id || ""),
    title: String(activeDocument.title || ""),
    type: String(activeDocument.type || "markdown"),
    path: normalizePath(activeDocument.path || ""),
    dirty: activeDocument.dirty === true,
    content: String(activeDocument.content || "")
  };
}

function lineNumberForOffset(content, offset) {
  const index = Math.max(0, Math.min(Number(offset) || 0, String(content || "").length));
  return String(content || "").slice(0, index).split(/\n/).length;
}

function parseFrontmatter(content) {
  const text = String(content || "").replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { hasFrontmatter: false, frontmatterLines: 0 };
  return { hasFrontmatter: true, frontmatterLines: match[1].split("\n").length };
}

function parseDocumentStructure(content, maxItems) {
  const text = String(content || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const limit = clampInteger(maxItems, DEFAULT_MAX_ITEMS, 1, 500);
  const headings = [];
  const links = [];
  const tags = [];
  const tasks = [];
  const codeBlocks = [];
  let inFence = false;
  let fenceStartLine = 0;
  let fenceLanguage = "";

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const fenceMatch = line.match(/^```+\s*([\w.+-]*)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceStartLine = lineNumber;
        fenceLanguage = fenceMatch[1] || "";
      } else {
        if (codeBlocks.length < limit) codeBlocks.push({ startLine: fenceStartLine, endLine: lineNumber, language: fenceLanguage });
        inFence = false;
      }
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch && headings.length < limit) {
      headings.push({ line: lineNumber, level: headingMatch[1].length, text: headingMatch[2].trim() });
    }

    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]]+)\]\]/g)) {
      if (links.length >= limit) break;
      links.push({ line: lineNumber, text: match[1] || match[3] || "", target: match[2] || match[3] || "" });
    }

    for (const match of line.matchAll(/(^|[\s([{])#([A-Za-z0-9/_-]+)/g)) {
      if (tags.length >= limit) break;
      tags.push({ line: lineNumber, tag: `#${match[2]}` });
    }

    const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch && tasks.length < limit) {
      tasks.push({ line: lineNumber, checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2].trim() });
    }
  });

  return {
    ...parseFrontmatter(text),
    lineCount: lines.length,
    wordCount: (text.match(/\S+/g) || []).length,
    characterCount: text.length,
    headings,
    links,
    tags,
    tasks,
    codeBlocks
  };
}

function searchTextEntries(entries, query, maxResults) {
  const needle = String(query || "").toLowerCase();
  if (!needle) return [];
  const limit = clampInteger(maxResults, DEFAULT_MAX_ITEMS, 1, 500);
  const results = [];
  for (const entry of entries) {
    const content = String(entry.content || "").replace(/\r\n?/g, "\n");
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const column = lines[index].toLowerCase().indexOf(needle);
      if (column === -1) continue;
      results.push({
        path: normalizePath(entry.path || entry.title || ""),
        tabId: String(entry.id || ""),
        title: String(entry.title || ""),
        line: index + 1,
        column: column + 1,
        text: lines[index]
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function normalizeLinkTarget(value) {
  return normalizePath(String(value || "").split("#")[0].trim()).replace(/^\/+/, "").replace(/\.(md|markdown)$/i, "").toLowerCase();
}

function getDocumentOutgoingLinks(document) {
  return parseDocumentStructure(document?.content || "", 500).links.map((link) => ({
    ...link,
    normalizedTarget: normalizeLinkTarget(link.target)
  }));
}

function getKnownDocumentEntries(context) {
  const tabs = getOpenTabs(context).map((tab) => ({
    id: String(tab?.id || ""),
    title: String(tab?.title || ""),
    path: getTabPath(tab),
    content: String(tab?.content || "")
  }));
  const folderEntries = asArray(context.folderMarkdownFiles).map((entry) => ({
    id: String(entry?.id || ""),
    title: String(entry?.name || entry?.title || ""),
    path: normalizePath(entry?.path || entry?.fullPath || entry?.name || ""),
    content: String(entry?.content || "")
  }));
  return [...tabs, ...folderEntries];
}

function graphMetadataForPath(context, documentPath) {
  const target = normalizeLinkTarget(documentPath);
  const matches = [];
  for (const graphTab of asArray(context.graphTabs)) {
    const nodes = asArray(graphTab.nodes);
    const files = asArray(graphTab.files);
    const nodeMatch = nodes.find((node) => normalizeLinkTarget(node?.path || node?.id || node?.label || node?.name) === target);
    const fileMatch = files.find((file) => normalizeLinkTarget(file?.path || file?.id || file?.name) === target);
    if (nodeMatch || fileMatch) {
      matches.push({
        graphTabId: String(graphTab.id || ""),
        graphTitle: String(graphTab.title || ""),
        node: nodeMatch || null,
        file: fileMatch || null
      });
    }
  }
  return matches;
}

/**
 * Return compact live workspace state from the editor snapshot.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments, including includeTabs.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Read-only workspace state.
 */
async function getWorkspaceState(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const context = getReadContext(options);
  const workspace = asObject(context.workspace);
  const openTabs = getOpenTabs(context);
  const graphTabs = asArray(context.graphTabs);
  return {
    workspace,
    activeTab: asObject(workspace.activeTab),
    counts: {
      openTabs: openTabs.length,
      graphTabs: graphTabs.length,
      dirtyTabs: openTabs.filter((tab) => tab?.dirty === true).length
    },
    tabs: args.includeTabs === true ? openTabs.map(createTabSummary) : undefined
  };
}

/**
 * Return the live active document buffer from the editor snapshot.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments controlling content and selection.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Active document metadata, optional content, and optional selection.
 */
async function readActiveDocument(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const document = getActiveDocument(getReadContext(options));
  const includeContent = args.includeContent !== false;
  const content = String(document.content || "");
  return {
    id: String(document.id || ""),
    title: String(document.title || ""),
    type: String(document.type || "markdown"),
    path: normalizePath(document.path || ""),
    dirty: document.dirty === true,
    content: includeContent ? truncateText(content, args.maxChars) : undefined,
    selection: args.includeSelection === false ? undefined : asObject(document.selection),
    lineCount: content ? content.replace(/\r\n?/g, "\n").split("\n").length : 0,
    characterCount: content.length
  };
}

/**
 * Return metadata and optional live content for open editor tabs.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments controlling counts and content caps.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Open tab records.
 */
async function readOpenTabs(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const includeContent = args.includeContent === true;
  const maxTabs = clampInteger(args.maxTabs, DEFAULT_MAX_TABS, 1, 100);
  const maxCharsPerTab = clampInteger(args.maxCharsPerTab, 4000, 1, 50000);
  const tabs = getOpenTabs(getReadContext(options)).slice(0, maxTabs).map((tab) => ({
    ...createTabSummary(tab),
    content: includeContent && typeof tab?.content === "string" ? truncateText(tab.content, maxCharsPerTab) : undefined
  }));
  return { tabs, totalTabs: getOpenTabs(getReadContext(options)).length };
}

/**
 * Parse Markdown structure for the active document or one open tab.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments selecting active document or tab.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Document structure summary.
 */
async function getDocumentStructure(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const document = getDocumentSource(getReadContext(options), args);
  if (!document) return { error: "Document was not found." };
  return {
    document: createTabSummary(document),
    structure: parseDocumentStructure(document.content || "", args.maxItems)
  };
}

/**
 * Search live open tabs or saved workspace files.
 * @param {string} root - Workspace root for disk-backed search.
 * @param {object} args - Tool arguments containing query, scope, and maxResults.
 * @param {object} options - Tool options carrying editorReadContext and searchGrep.
 * @returns {Array<object>} Search results.
 */
async function searchVault(root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const scope = String(args.scope || "open-tabs");
  const maxResults = clampInteger(args.maxResults, DEFAULT_MAX_ITEMS, 1, 500);
  if (scope === "workspace") {
    if (typeof options.searchGrep !== "function") throw new Error("Workspace search is unavailable.");
    return options.searchGrep(root, args.query, { maxMatches: maxResults, signal: options.signal });
  }
  return searchTextEntries(getOpenTabs(getReadContext(options)), args.query, maxResults);
}

/**
 * Return outgoing links, likely backlinks, unresolved links, and graph metadata.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments selecting active document, tab, or path.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Link context for the requested document.
 */
async function getLinkContext(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const context = getReadContext(options);
  const document = getDocumentSource(context, args.path ? { ...args, source: "tab" } : args) || {
    path: normalizePath(args.path || ""),
    content: ""
  };
  const documentTarget = normalizeLinkTarget(document.path || document.title);
  const outgoingLinks = getDocumentOutgoingLinks(document);
  const knownDocuments = getKnownDocumentEntries(context);
  const knownTargets = new Set(knownDocuments.map((entry) => normalizeLinkTarget(entry.path || entry.title)).filter(Boolean));
  const unresolvedLinks = outgoingLinks.filter((link) => link.normalizedTarget && !knownTargets.has(link.normalizedTarget));
  const backlinks = [];
  for (const entry of knownDocuments) {
    if (!documentTarget || normalizeLinkTarget(entry.path || entry.title) === documentTarget) continue;
    if (getDocumentOutgoingLinks(entry).some((link) => link.normalizedTarget === documentTarget)) {
      backlinks.push({ id: entry.id, title: entry.title, path: entry.path });
    }
  }
  const maxResults = clampInteger(args.maxResults, DEFAULT_MAX_ITEMS, 1, 500);
  return {
    document: createTabSummary(document),
    outgoingLinks: outgoingLinks.slice(0, maxResults),
    backlinks: backlinks.slice(0, maxResults),
    unresolvedLinks: unresolvedLinks.slice(0, maxResults),
    graphMatches: graphMetadataForPath(context, document.path || document.title).slice(0, maxResults)
  };
}

/**
 * Return recent read-only context known to the current editor session.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments controlling result count.
 * @param {object} options - Tool options carrying editorReadContext.
 * @returns {object} Recent activity entries.
 */
async function getRecentActivity(_root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const context = getReadContext(options);
  const maxItems = clampInteger(args.maxItems, DEFAULT_MAX_ITEMS, 1, 200);
  return {
    items: asArray(context.recentActivity).slice(0, maxItems),
    activeTab: asObject(context.workspace?.activeTab)
  };
}

module.exports = {
  getDocumentStructure,
  getLinkContext,
  getRecentActivity,
  getWorkspaceState,
  readActiveDocument,
  readOpenTabs,
  searchVault,
  _test: {
    parseDocumentStructure,
    searchTextEntries
  }
};
