/**
 * Approval intent validation for agent actions.
 * Prevents an approval request when the selected tool cannot perform the stated filesystem operation.
 */

"use strict";

const NON_DELETING_FILE_ACTIONS = Object.freeze({
  apply_edit: "replace text inside one file",
  write_file: "create or replace file content",
  create_document_tab: "create or overwrite a saved document",
  insert_at_cursor: "insert text into an open document",
  replace_selection: "replace selected text in an open document",
  replace_document_range: "replace a text range in an open document",
  extract_selection_to_note: "create a note from selected text"
});

function describesFilesystemDeletion(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\b(?:delete|remove)\s+(?:the\s+)?(?:(?:old|obsolete|existing|unused)\s+)*(?:files?|folders?|directories?|packages?|package\s+(?:folders?|directories?))\b/i.test(text)
    || /\b(?:rm\s+-rf|rmdir)\b/i.test(text);
}

function describesFilesystemMovement(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\b(?:move|relocate)\s+(?:the\s+)?(?:(?:old|existing)\s+)*(?:files?|folders?|directories?|packages?)\b/i.test(text)
    || /\b(?:files?|folders?|directories?)\b.{0,32}\b(?:move|relocate)\b/i.test(text);
}

/**
 * Explain when an agent rationale claims a filesystem effect the tool cannot perform.
 * @param {string} toolName Agent tool selected by the model.
 * @param {object} args Typed tool arguments containing the agent rationale.
 * @returns {{code: string, message: string}|null} Blocking mismatch, when present.
 */
function getApprovalIntentMismatch(toolName, args = {}) {
  const capability = NON_DELETING_FILE_ACTIONS[toolName];
  if (!capability) return null;
  const deletion = describesFilesystemDeletion(args.approvalReason);
  const movement = describesFilesystemMovement(args.approvalReason);
  if (!deletion && !movement) return null;
  const unsupportedEffect = deletion && movement ? "delete or move" : (deletion ? "delete" : "move");
  return {
    code: "APPROVAL_INTENT_TOOL_MISMATCH",
    message: [
      `${toolName} can only ${capability}; it cannot ${unsupportedEffect} files, folders, or package directories.`,
      "Use a dedicated delete or move tool if one is available; otherwise the requested cleanup remains incomplete."
    ].join(" ")
  };
}

/**
 * Validate that an approval rationale describes an outcome the selected tool can perform.
 * @param {string} toolName Agent tool selected by the model.
 * @param {object} args Parsed tool arguments, including the user-facing approval reason.
 * @returns {{ allowed: true } | { allowed: false, code: string, message: string }} Validation result with non-retryable guidance.
 */
function validateApprovalIntent(toolName, args = {}) {
  const mismatch = getApprovalIntentMismatch(toolName, args);
  if (!mismatch) return { allowed: true };
  return {
    allowed: false,
    code: mismatch.code,
    message: [
      `Approval was not requested because ${mismatch.message}`,
      "Do not create a marker or placeholder file as a substitute.",
      "Re-evaluate the available typed tools and report the task as incomplete when no valid alternative exists."
    ].join(" ")
  };
}

module.exports = {
  describesFilesystemDeletion,
  describesFilesystemMovement,
  getApprovalIntentMismatch,
  validateApprovalIntent
};
