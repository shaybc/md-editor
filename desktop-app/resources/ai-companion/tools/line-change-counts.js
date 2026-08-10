/**
 * Line-level change counts for completed AI Companion file mutations.
 */

"use strict";

/** Count added and removed lines between two text snapshots. */
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
  if (beforeMiddle.length * afterMiddle.length > 200000) {
    return { additions: afterMiddle.length, deletions: beforeMiddle.length };
  }
  let previous = new Array(afterMiddle.length + 1).fill(0);
  for (const beforeLine of beforeMiddle) {
    const current = new Array(afterMiddle.length + 1).fill(0);
    for (let index = 1; index <= afterMiddle.length; index += 1) {
      current[index] = beforeLine === afterMiddle[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1]);
    }
    previous = current;
  }
  const unchanged = previous[afterMiddle.length];
  return {
    additions: Math.max(0, afterMiddle.length - unchanged),
    deletions: Math.max(0, beforeMiddle.length - unchanged)
  };
}

function splitLines(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { countChangedLines };
