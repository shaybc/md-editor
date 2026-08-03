/**
 * Agent-facing conversion and export tools for md-editor.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const CONVERSION_EXPORT_READ_TOOL_NAMES = Object.freeze([
  "get_conversion_export_state",
  "get_code_conversion_status",
  "read_conversion_report"
]);

const CONVERSION_EXPORT_ACTION_TOOL_NAMES = Object.freeze([
  "export_active_document",
  "export_active_folder_graph",
  "start_code_conversion"
]);

const CONVERSION_EXPORT_TOOL_NAMES = Object.freeze([
  ...CONVERSION_EXPORT_READ_TOOL_NAMES,
  ...CONVERSION_EXPORT_ACTION_TOOL_NAMES
]);

const REPORT_DIRECTORY = ".md-editor";
const REPORT_JSON_FILE = "missing_dependencies_report.json";
const REPORT_MARKDOWN_FILE = "missing_dependencies_report.md";
const DEFAULT_MAX_REPORT_CHARS = 12000;

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function truncateText(value, maxChars) {
  const text = String(value || "");
  const limit = clampInteger(maxChars, DEFAULT_MAX_REPORT_CHARS, 1, 100000);
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

function resolveWorkspacePath(root, relativePath = "") {
  const workspaceRoot = path.resolve(String(root || ""));
  if (!workspaceRoot) throw new Error("Workspace root is required.");
  const resolvedPath = path.resolve(workspaceRoot, String(relativePath || ""));
  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRoot + path.sep)) {
    throw new Error("Path is outside the workspace.");
  }
  return { workspaceRoot, resolvedPath };
}

function toRelativePath(root, absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function getReportRoot(args = {}) {
  return String(args.destinationRoot || args.path || ".").trim() || ".";
}

async function readOptionalText(filePath, maxChars, signal) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    throwIfAborted(signal);
    return truncateText(content, maxChars);
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

/**
 * Whether a tool name belongs to the conversion/export surface.
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when the name is conversion/export-related.
 */
function isConversionExportTool(toolName) {
  return CONVERSION_EXPORT_TOOL_NAMES.includes(String(toolName || ""));
}

/**
 * Whether a conversion/export tool performs a browser-owned action.
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when explicit user approval is required.
 */
function isConversionExportActionTool(toolName) {
  return CONVERSION_EXPORT_ACTION_TOOL_NAMES.includes(String(toolName || ""));
}

/**
 * Build a compact timeline input summary for a conversion/export tool.
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Tool arguments.
 * @returns {string} Human-readable target summary.
 */
function getConversionExportToolInputSummary(toolName, args = {}) {
  if (toolName === "export_active_document") return String(args.format || "document").trim();
  if (toolName === "export_active_folder_graph") return String(args.path || args.folderPath || "active folder").trim();
  if (toolName === "start_code_conversion") return String(args.sourceRoot || args.destinationRoot || args.converterType || "code conversion").trim();
  if (toolName === "read_conversion_report") return normalizePath(getReportRoot(args));
  return toolName;
}

/**
 * Format an approval preview for conversion/export actions.
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Tool arguments.
 * @returns {string} Approval preview text.
 */
function getConversionExportApprovalPreview(toolName, args = {}) {
  const lines = [`Action: ${toolName.replace(/_/g, " ")}`];
  if (args.format) lines.push(`Format: ${String(args.format || "")}`);
  if (args.converterType) lines.push(`Converter: ${String(args.converterType || "")}`);
  if (args.sourceRoot) lines.push(`Source root: ${normalizePath(args.sourceRoot)}`);
  if (args.destinationRoot) lines.push(`Destination root: ${normalizePath(args.destinationRoot)}`);
  if (args.path || args.folderPath) lines.push(`Target: ${normalizePath(args.path || args.folderPath)}`);
  return lines.join("\n");
}

/**
 * Request execution of a browser-owned conversion/export action.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {string} toolName - Conversion/export tool name.
 * @param {object} args - Tool arguments.
 * @param {object} options - Tool options with requestAppAction and signal.
 * @returns {Promise<object>} Browser action result.
 */
async function requestConversionExportAction(_root, toolName, args = {}, options = {}) {
  throwIfAborted(options.signal);
  if (!isConversionExportTool(toolName) || toolName === "read_conversion_report") {
    throw new Error(`Unsupported conversion/export action: ${toolName}`);
  }
  if (typeof options.requestAppAction !== "function") {
    throw new Error("Conversion and export tools require the md-editor app action bridge.");
  }
  const target = getConversionExportToolInputSummary(toolName, args);
  const result = await options.requestAppAction({
    tool: toolName,
    args,
    targetPath: target,
    preview: { target }
  });
  throwIfAborted(options.signal);
  return result || {};
}

/**
 * Read the converter report generated under a workspace destination root.
 * @param {string} root - Workspace root passed by the tool loop.
 * @param {object} args - Tool arguments with optional destinationRoot/path.
 * @param {object} options - Tool options with signal.
 * @returns {Promise<object>} Parsed JSON report and optional Markdown text.
 */
async function readConversionReport(root, args = {}, options = {}) {
  throwIfAborted(options.signal);
  const { workspaceRoot, resolvedPath } = resolveWorkspacePath(root, getReportRoot(args));
  const metadataDir = path.join(resolvedPath, REPORT_DIRECTORY);
  const jsonPath = path.join(metadataDir, REPORT_JSON_FILE);
  const markdownPath = path.join(metadataDir, REPORT_MARKDOWN_FILE);
  const jsonText = await readOptionalText(jsonPath, args.maxChars, options.signal);
  if (!jsonText) {
    return {
      found: false,
      root: toRelativePath(workspaceRoot, resolvedPath) || ".",
      jsonPath: toRelativePath(workspaceRoot, jsonPath),
      markdownPath: toRelativePath(workspaceRoot, markdownPath)
    };
  }
  let report = null;
  try {
    report = JSON.parse(jsonText);
  } catch (error) {
    report = { parseError: error?.message || String(error), raw: truncateText(jsonText, args.maxChars) };
  }
  const includeMarkdown = args.includeMarkdown === true;
  return {
    found: true,
    root: toRelativePath(workspaceRoot, resolvedPath) || ".",
    jsonPath: toRelativePath(workspaceRoot, jsonPath),
    markdownPath: toRelativePath(workspaceRoot, markdownPath),
    report,
    markdown: includeMarkdown ? await readOptionalText(markdownPath, args.maxChars, options.signal) : undefined
  };
}

module.exports = {
  CONVERSION_EXPORT_ACTION_TOOL_NAMES,
  CONVERSION_EXPORT_READ_TOOL_NAMES,
  CONVERSION_EXPORT_TOOL_NAMES,
  getConversionExportApprovalPreview,
  getConversionExportToolInputSummary,
  isConversionExportActionTool,
  isConversionExportTool,
  readConversionReport,
  requestConversionExportAction
};
