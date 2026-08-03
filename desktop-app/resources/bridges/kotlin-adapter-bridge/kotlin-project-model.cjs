"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SKIPPED = new Set([".git", ".md-editor", ".gradle", "build", "target", "bin", "out", "node_modules"]);

/** Detects Kotlin/JVM source and build metadata without invoking a project compiler. */
function detectKotlinJvmWorkspace(workspaceRoot) {
  const modules = new Map();
  const queue = [path.resolve(workspaceRoot)];
  let androidOrMultiplatform = false;
  while (queue.length) {
    const directory = queue.shift();
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_error) { continue; }
    const names = entries.map((entry) => entry.name);
    const descriptors = names.filter((name) => /^(pom\.xml|settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|\.classpath)$/i.test(name));
    if (descriptors.length) modules.set(directory, { root: directory, descriptors: descriptors.map((name) => path.join(directory, name)), kotlin: [], java: [] });
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIPPED.has(entry.name.toLowerCase())) queue.push(path.join(directory, entry.name));
      if (!entry.isFile()) continue;
      if (/\.kt$/i.test(entry.name) && !/\.gradle\.kts$/i.test(entry.name)) addSource(modules, directory, "kotlin", path.join(directory, entry.name), workspaceRoot);
      if (/\.java$/i.test(entry.name)) addSource(modules, directory, "java", path.join(directory, entry.name), workspaceRoot);
      if (/\.(gradle|gradle\.kts|xml)$/i.test(entry.name)) {
        const text = safeRead(path.join(directory, entry.name));
        if (/org\.jetbrains\.kotlin\.(multiplatform|android)|com\.android\./.test(text)) androidOrMultiplatform = true;
      }
    }
  }
  const resultModules = Array.from(modules.values()).filter((module) => module.kotlin.length || module.java.length).map((module) => ({
    ...module,
    id: crypto.createHash("sha1").update(module.root.toLowerCase()).digest("hex").slice(0, 12),
    kind: module.kotlin.length && module.java.length ? "mixed" : module.kotlin.length ? "kotlin" : "java",
    sourceSets: classifySourceSets(module)
  }));
  return {
    workspaceRoot: path.resolve(workspaceRoot),
    hasKotlin: resultModules.some((module) => module.kotlin.length),
    unsupported: androidOrMultiplatform,
    modules: resultModules,
    configurationSignature: crypto.createHash("sha256").update(resultModules.flatMap((module) => module.descriptors).sort().map(safeRead).join("\n")).digest("hex")
  };
}

function addSource(modules, directory, language, file, workspaceRoot) {
  const roots = Array.from(modules.keys()).filter((root) => directory === root || directory.startsWith(root + path.sep)).sort((a, b) => b.length - a.length);
  const moduleRoot = roots[0] || path.resolve(workspaceRoot);
  if (!modules.has(moduleRoot)) modules.set(moduleRoot, { root: moduleRoot, descriptors: [], kotlin: [], java: [] });
  modules.get(moduleRoot)[language].push(file);
}

function classifySourceSets(module) {
  const groups = new Map();
  for (const file of [...module.kotlin, ...module.java]) {
    const normalized = file.replace(/\\/g, "/");
    const match = normalized.match(/\/src\/([^/]+)\//i);
    const name = match?.[1] || "main";
    if (!groups.has(name)) groups.set(name, { name, test: /test/i.test(name), kotlin: [], java: [] });
    groups.get(name)[/\.kt$/i.test(file) ? "kotlin" : "java"].push(file);
  }
  return Array.from(groups.values());
}

function safeRead(file) {
  try { return fs.readFileSync(file, "utf8"); } catch (_error) { return ""; }
}

module.exports = { detectKotlinJvmWorkspace };

