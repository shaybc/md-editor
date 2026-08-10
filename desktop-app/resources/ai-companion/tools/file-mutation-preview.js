/**
 * Approval previews for AI Companion text-file mutations.
 */

"use strict";

const fs = require("node:fs/promises");
const { hashWorkspaceContent, prepareWorkspaceEdit } = require("./workspace-edit-matcher");

/** Prepare the exact current and proposed text shown before a file mutation is approved. */
async function prepareFileMutationPreview({ tool, resolvedPath, mutationPath, comparePath, args = {} }) {
  const beforeContent = await readCurrentContent(resolvedPath, tool === "write_file");
  const sourceExists = beforeContent !== null;
  const currentContent = beforeContent || "";
  const preparedEdit = tool === "apply_edit"
    ? prepareWorkspaceEdit({
      path: mutationPath,
      currentContent,
      search: args.search,
      replacement: args.replacement,
      occurrence: args.occurrence,
      expectedMatches: args.expectedMatches
    })
    : null;
  const proposedContent = preparedEdit ? preparedEdit.proposedContent : String(args.content || "");
  return {
    compare: {
      path: comparePath,
      beforeName: sourceExists ? "Current file" : "File does not exist",
      afterName: "Proposed file",
      beforeContent: currentContent,
      afterContent: proposedContent,
      changed: !sourceExists || currentContent !== proposedContent,
      readOnly: true
    },
    preparedEdit,
    preparedWrite: tool === "write_file" ? {
      resolvedPath,
      sourceExists,
      sourceHash: hashWorkspaceContent(currentContent),
      proposedContent
    } : null
  };
}

async function readCurrentContent(resolvedPath, allowMissing) {
  try {
    return await fs.readFile(resolvedPath, "utf8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw error;
  }
}

module.exports = { prepareFileMutationPreview };
