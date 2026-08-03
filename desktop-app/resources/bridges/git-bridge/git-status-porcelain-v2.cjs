/**
 * Iterative parser for Git porcelain-v2 status output.
 */

"use strict";

const NULL_CHARACTER = String.fromCharCode(0);
const VALID_STATUS_PAIR = /^[.MADRCUT]{2}$/;

function createParseError() {
  const error = new Error("Git status output could not be parsed.");
  error.code = "GIT_STATUS_PARSE_FAILED";
  error.stage = "parse";
  error.retryable = false;
  return error;
}

function readFixedFields(record, fieldCount) {
  const fields = [];
  let start = 0;
  for (let index = 0; index < fieldCount; index += 1) {
    const separator = record.indexOf(" ", start);
    if (separator < 0) throw createParseError();
    fields.push(record.slice(start, separator));
    start = separator + 1;
  }
  const path = record.slice(start);
  if (!path) throw createParseError();
  return { fields, path };
}

function normalizeStatusCharacter(value) {
  return value === "." ? " " : value;
}

function createFile(path, originalPath, statusPair) {
  if (!VALID_STATUS_PAIR.test(statusPair)) throw createParseError();
  return {
    path,
    originalPath,
    index: normalizeStatusCharacter(statusPair[0]),
    workingDir: normalizeStatusCharacter(statusPair[1])
  };
}

function parseBranchRecord(record, status) {
  if (record.startsWith("# branch.oid ")) return;
  if (record.startsWith("# branch.head ")) {
    const branch = record.slice("# branch.head ".length);
    if (!branch) throw createParseError();
    status.branch = branch === "(detached)" ? "" : branch;
    return;
  }
  if (record.startsWith("# branch.upstream ")) {
    status.tracking = record.slice("# branch.upstream ".length);
    if (!status.tracking) throw createParseError();
    return;
  }
  if (record.startsWith("# branch.ab ")) {
    const match = /^\+(\d+) -(\d+)$/.exec(record.slice("# branch.ab ".length));
    if (!match) throw createParseError();
    status.ahead = Number(match[1]);
    status.behind = Number(match[2]);
    return;
  }
  throw createParseError();
}

/**
 * Parse one complete `git status --porcelain=v2 --branch -z` response.
 * @param {string} output - Raw NUL-delimited porcelain-v2 output.
 * @returns {{branch: string, tracking: string, ahead: number, behind: number, staged: object[], unstaged: object[], files: object[]}} Normalized Git Panel status.
 * @throws {Error} A bounded GIT_STATUS_PARSE_FAILED error for malformed or unsupported records.
 */
function parseGitStatusPorcelainV2(output) {
  const records = String(output || "").split(NULL_CHARACTER);
  if (records[records.length - 1] !== "") throw createParseError();

  const status = { branch: "", tracking: "", ahead: 0, behind: 0, staged: [], unstaged: [], files: [] };
  for (let index = 0; index < records.length - 1; index += 1) {
    const record = records[index];
    if (!record) throw createParseError();
    if (record.startsWith("# ")) {
      parseBranchRecord(record, status);
      continue;
    }
    if (record.startsWith("1 ")) {
      const parsed = readFixedFields(record, 8);
      status.files.push(createFile(parsed.path, "", parsed.fields[1]));
      continue;
    }
    if (record.startsWith("2 ")) {
      const parsed = readFixedFields(record, 9);
      const originalPath = records[index + 1];
      if (!originalPath) throw createParseError();
      status.files.push(createFile(parsed.path, originalPath, parsed.fields[1]));
      index += 1;
      continue;
    }
    if (record.startsWith("u ")) {
      const parsed = readFixedFields(record, 10);
      status.files.push(createFile(parsed.path, "", parsed.fields[1]));
      continue;
    }
    if (record.startsWith("? ")) {
      const filePath = record.slice(2);
      if (!filePath) throw createParseError();
      status.files.push({ path: filePath, originalPath: "", index: "?", workingDir: "?" });
      continue;
    }
    if (record.startsWith("! ")) continue;
    throw createParseError();
  }

  status.staged = status.files.filter((file) => file.index && file.index !== " " && file.index !== "?");
  status.unstaged = status.files.filter((file) => file.workingDir && file.workingDir !== " ");
  return status;
}

module.exports = {
  parseGitStatusPorcelainV2
};
