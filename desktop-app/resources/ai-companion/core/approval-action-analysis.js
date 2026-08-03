/**
 * Builds authoritative, user-facing explanations for approval-capable actions.
 */

"use strict";

const { createApprovalFileCompare } = require("./approval-file-compare");
const { getApprovalIntentMismatch } = require("./approval-intent-validation");

const FILE_OPERATION_LABELS = Object.freeze({
  create: "Create file",
  modify: "Modify file",
  clear: "Clear file",
  "no-op": "No change"
});

function describeFileAction(operation) {
  switch (operation) {
    case "create": return "Create this file with the proposed content.";
    case "modify": return "Replace the current file content with the proposed content.";
    case "clear": return "Remove all content from this file. The file itself will remain.";
    case "no-op": return "Leave this file unchanged.";
    default: return "Apply the proposed file-content change.";
  }
}

function describeFileOutcome(compare = {}) {
  const impact = compare.lineImpact || { additions: 0, deletions: 0 };
  switch (compare.operation) {
    case "create":
      return compare.afterContent
        ? `The file will be created with ${impact.additions} line${impact.additions === 1 ? "" : "s"} of content.`
        : "The file will be created as an empty file.";
    case "modify":
      return `The file content will change: ${impact.additions} line${impact.additions === 1 ? "" : "s"} added and ${impact.deletions} removed.`;
    case "clear":
      return "The file will remain at this path but will contain no text.";
    case "no-op":
      return "No filesystem change will occur because the current and proposed content are identical.";
    default:
      return "The proposed file-content operation will be applied.";
  }
}

function createBlockingMessage(analysis) {
  if (analysis.blockingCode === "APPROVAL_ACTION_NO_CHANGE") {
    return [
      `Approval was not requested because ${analysis.resourcePath || "the target file"} would not change.`,
      analysis.outcomeDescription,
      "Re-evaluate the current workspace state and do not retry the same write."
    ].join(" ");
  }
  return analysis.limitations.join(" ");
}

/**
 * Analyze what an approval-capable tool will actually do.
 * @param {string} root Canonical workspace root used to read the current resource.
 * @param {string} toolName Tool selected by the agent.
 * @param {object} args Complete typed tool arguments.
 * @param {object} options Optional existing comparison and cancellation signal.
 * @returns {Promise<object>} Authoritative action description and approval eligibility.
 */
async function analyzeApprovalAction(root, toolName, args = {}, options = {}) {
  const compare = options.compare === undefined
    ? await createApprovalFileCompare(root, toolName, args, { signal: options.signal })
    : options.compare;
  const mismatch = getApprovalIntentMismatch(toolName, args);
  const isFileAction = toolName === "write_file" || toolName === "apply_edit";
  const operation = isFileAction && compare ? compare.operation : "action";
  const limitations = mismatch ? [mismatch.message] : [];
  const unavailableEdit = toolName === "apply_edit" && !compare;
  if (unavailableEdit) limitations.push("Approval was not requested because the proposed edit could not be matched to the current file.");
  const blockingCode = mismatch?.code
    || (unavailableEdit ? "APPLY_EDIT_SEARCH_NOT_FOUND" : "")
    || (operation === "no-op" ? "APPROVAL_ACTION_NO_CHANGE" : "");
  const analysis = {
    operation,
    operationLabel: FILE_OPERATION_LABELS[operation] || "Agent action",
    resourcePath: String(compare?.path || args.path || args.command || toolName || ""),
    taskGoal: String(args.approvalReason || "").trim(),
    actionDescription: isFileAction && compare ? describeFileAction(operation) : "",
    outcomeDescription: isFileAction && compare ? describeFileOutcome(compare) : "",
    limitations,
    lineImpact: compare?.lineImpact || null,
    canApprove: !blockingCode,
    blockingCode
  };
  return { ...analysis, blockingMessage: createBlockingMessage(analysis) };
}

module.exports = {
  FILE_OPERATION_LABELS,
  analyzeApprovalAction
};
