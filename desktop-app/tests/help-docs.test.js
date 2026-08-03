const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const helpRoot = path.join(repoRoot, "desktop-app", "help");

function listMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function getMarkdownLinks(markdown) {
  const links = [];
  const markdownLinkPattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(markdown)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

function isExternalOrAnchorLink(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target);
}

function stripLinkSuffix(target) {
  return target.split("#")[0].split("?")[0];
}

test("new desktop help docs have resolvable local links", () => {
  const markdownFiles = listMarkdownFiles(helpRoot);
  assert.ok(markdownFiles.length > 0, "expected help Markdown files");

  for (const file of markdownFiles) {
    const markdown = fs.readFileSync(file, "utf8");
    for (const rawTarget of getMarkdownLinks(markdown)) {
      if (isExternalOrAnchorLink(rawTarget)) continue;
      const target = stripLinkSuffix(rawTarget);
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), target);
      assert.ok(
        fs.existsSync(resolved),
        `${path.relative(repoRoot, file)} links to missing ${rawTarget}`
      );
    }
  }
});

test("new desktop help docs avoid stale web-app source-of-truth instructions", () => {
  const forbiddenPatterns = [
    /edit\s+`?web-app\/?`?\s+only/i,
    /web-app source is canonical/i,
    /canonical application is the static web app/i,
    /desktop-app\/resources\/.*generated/i,
    /prepare\.js.*copies.*web-app/i,
    /compile\.bat/i
  ];

  for (const file of listMarkdownFiles(helpRoot)) {
    const markdown = fs.readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        markdown,
        pattern,
        `${path.relative(repoRoot, file)} contains stale documentation text: ${pattern}`
      );
    }
  }
});
