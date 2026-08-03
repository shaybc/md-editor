/**
 * Agent-facing editor action tools backed by the live md-editor UI.
 */

"use strict";

const EDITOR_ACTION_TOOL_NAMES = Object.freeze([
  "open_file_in_tab",
  "create_document_tab",
  "insert_at_cursor",
  "replace_selection",
  "replace_document_range",
  "extract_selection_to_note"
]);

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function getEditorActionPath(toolName, args = {}) {
  if (toolName === "insert_at_cursor" || toolName === "replace_selection") {
    return String(args.expectedPath || args.path || "").trim();
  }
  return String(args.path || "").trim();
}

/**
 * Whether a tool name represents a browser-owned editor action.
 * @param {string} toolName - Agent tool name.
 * @returns {boolean} True when the tool must be executed by the app UI.
 */
function isEditorActionTool(toolName) {
  return EDITOR_ACTION_TOOL_NAMES.includes(String(toolName || ""));
}

/**
 * Resolve the target path used for write approvals.
 * @param {string} toolName - Agent tool name.
 * @param {object} args - Tool arguments.
 * @returns {string} Workspace-relative target path when known.
 */
function getEditorActionApprovalPath(toolName, args = {}) {
  return getEditorActionPath(toolName, args);
}

/**
 * Request execution of a live editor action from the browser process.
 * @param {string} _root - Workspace root passed by the tool loop.
 * @param {string} toolName - Editor action tool name.
 * @param {object} args - Tool arguments.
 * @param {object} options - Tool options with requestAppAction and signal.
 * @returns {Promise<object>} Browser action result.
 */
async function requestEditorAction(_root, toolName, args = {}, options = {}) {
  throwIfAborted(options.signal);
  if (!isEditorActionTool(toolName)) throw new Error(`Unsupported editor action tool: ${toolName}`);
  if (typeof options.requestAppAction !== "function") {
    throw new Error("Editor actions require the md-editor app action bridge.");
  }
  const targetPath = getEditorActionApprovalPath(toolName, args);
  const result = await options.requestAppAction({
    tool: toolName,
    args,
    targetPath,
    preview: {
      target: targetPath || toolName
    }
  });
  throwIfAborted(options.signal);
  return result || {};
}

module.exports = {
  EDITOR_ACTION_TOOL_NAMES,
  getEditorActionApprovalPath,
  isEditorActionTool,
  requestEditorAction
};
