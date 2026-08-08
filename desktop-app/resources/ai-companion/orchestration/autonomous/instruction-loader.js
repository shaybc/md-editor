/** Layered application, user, workspace, and path-scoped instruction loading. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { loadAiCompanionPrompts } = require("../../config/prompts");
const { RuleCatalog } = require("./rules/rule-catalog");

async function readOptional(filePath) {
  try { return await fs.readFile(filePath, "utf8"); } catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
}

async function readMarkdownDirectory(directory) {
  try {
    const names = (await fs.readdir(directory)).filter((name) => /\.md$/i.test(name)).sort();
    return Promise.all(names.map(async (name) => ({ source: path.join(directory, name), content: await readOptional(path.join(directory, name)) })));
  } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

function scopedDirectories(root, activePath) {
  const directories = [root];
  const target = path.dirname(path.resolve(root, String(activePath || "")));
  if (target !== root && target.startsWith(root + path.sep)) {
    let current = root;
    for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      directories.push(current);
    }
  }
  return directories;
}

/** Load rules that are active for this run; skills and agents remain lazy metadata. */
async function loadActiveInstructions(request, policy, suppliedCatalog = null) {
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });
  const application = policy.mode === "agent" ? prompts.agentSystem : (policy.mode === "plan" ? prompts.planSystem : prompts.chatSystem);
  const catalog = suppliedCatalog || new RuleCatalog(request);
  if (!suppliedCatalog) await catalog.load(request.activeFile?.path);
  return { application: String(application || ""), rules: catalog.activeInstructions({ markInjected: true }) };
}

module.exports = { loadActiveInstructions, scopedDirectories };
