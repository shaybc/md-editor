/**
 * Builds read-only file comparisons for pending AI Companion write approvals.
 */

"use strict";

const tools = require("../tools/workspace-tools");
const { prepareWorkspaceEdit } = require("../tools/workspace-edit-matcher");

function splitLines(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Count added and removed lines between current and proposed content.
 * @param {string} beforeContent Current file content.
 * @param {string} afterContent Proposed file content.
 * @returns {{additions: number, deletions: number}} Normalized line impact.
 */
function countChangedLines(beforeContent, afterContent) {
  const beforeLines = splitLines(beforeContent);
  const afterLines = splitLines(afterContent);
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

/**
 * Compare the current workspace file with the content a pending write would produce.
 * @param {string} root Workspace root used to resolve the proposed file path.
 * @param {string} toolName Pending workspace mutation tool.
 * @param {object} args Tool arguments containing the path and proposed mutation.
 * @param {object} options Optional cancellation signal.
 * @returns {Promise<object|null>} Compare descriptor, or null when the mutation cannot be previewed.
 */
async function createApprovalFileCompare(root, toolName, args = {}, options = {}) {
  if ((toolName !== "write_file" && toolName !== "apply_edit") || !args.path) return null;
  const snapshot = await tools.readTextFileSnapshot(root, args.path, { signal: options.signal });
  if (!snapshot || snapshot.unavailable) return null;

  const currentContent = snapshot.exists === false ? "" : String(snapshot.content || "");
  let proposedContent = "";
  let preparedEdit = null;
  if (toolName === "write_file") {
    proposedContent = String(args.content || "");
  } else {
    preparedEdit = prepareWorkspaceEdit({
      path: String(args.path || snapshot.path),
      currentContent,
      search: args.search,
      replacement: args.replacement,
      occurrence: args.occurrence,
      expectedMatches: args.expectedMatches
    });
    proposedContent = preparedEdit.proposedContent;
  }

  const filePath = String(snapshot.path || args.path);
  const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "file";
  const existed = snapshot.exists !== false;
  const changed = !existed || currentContent !== proposedContent;
  const operation = !changed ? "no-op" : (!existed ? "create" : (!proposedContent ? "clear" : "modify"));
  const compare = {
    title: `Proposed change: ${filePath}`,
    readOnly: true,
    path: filePath,
    name: fileName,
    beforeName: `Current: ${fileName}`,
    afterName: `Proposed: ${fileName}`,
    beforeContent: currentContent,
    afterContent: proposedContent,
    operation,
    changed,
    lineImpact: countChangedLines(currentContent, proposedContent)
  };
  if (preparedEdit) {
    Object.defineProperty(compare, "preparedEdit", { value: preparedEdit, enumerable: false });
  }
  return compare;
}

module.exports = { countChangedLines, createApprovalFileCompare };
