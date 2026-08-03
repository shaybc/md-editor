const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function normalizePath(filePath) {
  return path.resolve(filePath);
}

function toMarkdownPath(filePath) {
  return String(filePath || "").split(path.sep).join("/");
}

function isInside(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function getMarkdownOutputFile(sourceRoot, destinationRoot, sourceFile) {
  const relativeSource = path.relative(sourceRoot, sourceFile);
  return path.join(destinationRoot, `${relativeSource}.md`);
}

function getPortableSourcePath(sourceRootHome, sourceFile) {
  const relativeSource = path.relative(sourceRootHome, sourceFile);
  if (relativeSource && !relativeSource.startsWith("..") && !path.isAbsolute(relativeSource)) {
    return toMarkdownPath(relativeSource);
  }
  return toMarkdownPath(sourceFile);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function markdownLink(fromFile, toFile, label = toMarkdownPath(toFile)) {
  const rel = path.relative(path.dirname(fromFile), toFile) || path.basename(toFile);
  const href = encodeURI(toMarkdownPath(rel));
  return `[${label}](${href})`;
}

function safePathSegment(value) {
  return String(value || "dependency")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "dependency";
}

function stableId(parts) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":")
    .replace(/[^a-z0-9._:@/-]+/g, "-")
    .replace(/-+/g, "-");
}

module.exports = {
  normalizePath,
  toMarkdownPath,
  isInside,
  getMarkdownOutputFile,
  getPortableSourcePath,
  sha256File,
  sha256Text,
  yamlScalar,
  markdownLink,
  safePathSegment,
  stableId,
};
