/**
 * Prompt builder for the git-summary mode.
 *
 * Turns the changes digest collected by the Git panel into the system and
 * user messages sent to the model. Adapted from the "local-change-pr-notes"
 * workflow: business-level PR notes plus a suggested commit message.
 */

"use strict";

/**
 * Byte budget for the rendered user message. The digest is already capped by
 * the collector; this is a final guard that drops patch bodies (keeping stat
 * lines) if the rendered prompt would still be too large.
 */
const MAX_USER_MESSAGE_CHARS = 128 * 1024;

const { DEFAULT_AI_COMPANION_PROMPTS } = require("../../config/prompts");
const GIT_SUMMARY_SYSTEM_PROMPT = DEFAULT_AI_COMPANION_PROMPTS.gitSummarySystem;

function formatUnpushedCommits(commits) {
  if (!Array.isArray(commits) || !commits.length) return "(none)";
  return commits.map((commit) => `- ${commit.hash} ${commit.date} ${commit.author}: ${commit.subject}`).join("\n");
}

function formatPatchSection(title, stat, patch) {
  const parts = [`### ${title}`];
  parts.push(stat ? `Stat:\n${stat.trim()}` : "Stat: (none)");
  if (patch) parts.push(`Patch:\n\`\`\`diff\n${patch}\n\`\`\``);
  return parts.join("\n");
}

function formatUntrackedFiles(untracked) {
  if (!Array.isArray(untracked) || !untracked.length) return "(none)";
  return untracked.map((entry) => {
    if (entry.binary) return `- ${entry.path} (binary file)`;
    if (!entry.content) return `- ${entry.path} (content unavailable)`;
    return `- ${entry.path}\n\`\`\`\n${entry.content}\n\`\`\``;
  }).join("\n");
}

/**
 * Render the digest into the user message. Pure function.
 *
 * @param digest - Changes digest produced by the Git panel's changesDigest action.
 * @returns The user message string, size-guarded by MAX_USER_MESSAGE_CHARS.
 */
function buildGitSummaryUserMessage(digest = {}) {
  const render = (source) => [
    "Summarize this repository's local Git state and propose a commit message.",
    "",
    "## Git state",
    `- branch: ${source.branch || "(unknown)"}`,
    `- upstream: ${source.tracking || "(no upstream)"}`,
    `- ahead: ${Number(source.ahead || 0)}, behind: ${Number(source.behind || 0)}`,
    `- working tree clean: ${source.clean === true}`,
    `- commitScope: ${source.commitScope === "staged" ? "staged" : "all"}`,
    `- truncated sections: ${Array.isArray(source.truncated) && source.truncated.length ? source.truncated.join(", ") : "(none)"}`,
    "",
    "## Unpushed commits",
    formatUnpushedCommits(source.unpushedCommits),
    "",
    formatPatchSection("Unpushed diff (upstream...HEAD)", source.unpushedStat, source.unpushedPatch),
    "",
    formatPatchSection("Staged changes", source.stagedStat, source.stagedPatch),
    "",
    formatPatchSection("Unstaged changes", source.unstagedStat, source.unstagedPatch),
    "",
    "## Untracked files",
    formatUntrackedFiles(source.untracked)
  ].join("\n");

  let message = render(digest);
  if (message.length <= MAX_USER_MESSAGE_CHARS) return message;

  // Final guard: drop patch bodies (least important first) until the message fits.
  const reduced = { ...digest, truncated: [...(digest.truncated || [])] };
  for (const field of ["unpushedPatch", "unstagedPatch", "stagedPatch"]) {
    if (message.length <= MAX_USER_MESSAGE_CHARS) break;
    if (!reduced[field]) continue;
    reduced[field] = "";
    if (!reduced.truncated.includes(field)) reduced.truncated.push(field);
    message = render(reduced);
  }
  return message;
}

module.exports = {
  GIT_SUMMARY_SYSTEM_PROMPT,
  MAX_USER_MESSAGE_CHARS,
  buildGitSummaryUserMessage
};
