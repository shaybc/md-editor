"use strict";

/* Reduces failed Gradle process output to its actionable root-cause description. */

/**
 * Describe a failed Gradle invocation from its captured stderr.
 *
 * Gradle interleaves unrelated noise into stderr (for example `git` VCS probes that
 * print "fatal: not a git repository" on non-git checkouts) before the structured
 * failure report. Surfacing the first stderr line therefore blames the wrong cause.
 * The "* What went wrong:" section is the only reliable root-cause summary, so it is
 * preferred whenever present.
 *
 * @param {string} stderr - Complete stderr captured from the Gradle process.
 * @param {number|string} exitCode - The process exit code, used for the fallback text.
 * @returns {string} A single-line, human-readable failure description.
 */
function describeGradleFailure(stderr, exitCode) {
  const text = String(stderr || "").trim();
  if (!text) return `Gradle exited with code ${exitCode}.`;
  const wentWrong = text.match(/\* What went wrong:\r?\n([\s\S]*?)(?:\r?\n\s*\* Try:|$)/);
  if (!wentWrong) return text;
  return wentWrong[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*>\s*/, "").trim())
    .filter(Boolean)
    .join(" - ");
}

module.exports = { describeGradleFailure };
