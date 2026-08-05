/**
 * Classifies denied shell text and suggests a typed tool without executing it.
 */

"use strict";

function suggestion(tool, argumentsValue, classification) {
  return { classification, suggestion: { tool, arguments: argumentsValue } };
}

function classifyCommand(command) {
  const text = String(command || "").trim();
  const lower = text.toLowerCase();
  if (/^(mvn|mvnw(?:\.cmd)?)\s+(?:-q\s+)?(?:clean\s+)?(?:compile|package|verify)\b/.test(lower)) {
    return suggestion("compile_project", { targetPath: ".", buildMode: /\bclean\b/.test(lower) ? "clean" : "incremental", includeTestSources: /\btest-compile\b|\bverify\b/.test(lower) }, "java-compile");
  }
  if (/^(gradle|gradlew(?:\.bat)?)\s+.*\b(?:build|classes|compilejava)\b/.test(lower)) {
    return suggestion("compile_project", { targetPath: ".", buildMode: /\bclean\b/.test(lower) ? "clean" : "incremental", includeTestSources: /\btest\b/.test(lower) }, "java-compile");
  }
  if (/^(mvn|mvnw(?:\.cmd)?|gradle|gradlew(?:\.bat)?)\s+.*\btest\b/.test(lower)) {
    return suggestion("run_tests", { targetPath: ".", runner: "junit", scope: "project", selector: "" }, "java-test");
  }
  if (/^(node\s+--test|npm\s+(?:run\s+)?test|yarn\s+test|pnpm\s+test)\b/.test(lower)) {
    return suggestion("run_tests", { targetPath: ".", runner: "node", scope: "project", selector: "" }, "node-test");
  }
  if (/^(npx\s+)?playwright\s+test\b|^(npm|yarn|pnpm)\s+.*playwright.*test\b/.test(lower)) {
    return suggestion("run_tests", { targetPath: ".", runner: "playwright", scope: "project", selector: "" }, "playwright-test");
  }
  const packageMatch = lower.match(/^(npm|yarn|pnpm)\s+(install|add|update|remove|uninstall)\s+(@?[\w./-]+)(?:@([^\s]+))?/);
  if (packageMatch) {
    const action = ["remove", "uninstall"].includes(packageMatch[2]) ? "remove" : packageMatch[2] === "update" ? "update" : "install";
    return suggestion("manage_dependencies", {
      targetPath: ".",
      ecosystem: packageMatch[1],
      action,
      packageId: packageMatch[3],
      version: packageMatch[4] || "*",
      development: /\s(?:--save-dev|-d)\b/i.test(text)
    }, "package-management");
  }
  if (/^(npm|yarn|pnpm)\s+(install|fetch)\s*$/.test(lower) || /^(mvn|mvnw(?:\.cmd)?)\s+.*dependency/.test(lower) || /^(gradle|gradlew(?:\.bat)?)\s+.*dependencies/.test(lower)) {
    const ecosystem = lower.startsWith("mvn") ? "maven" : lower.startsWith("gradle") ? "gradle" : lower.split(/\s+/)[0];
    return suggestion("restore_dependencies", { targetPath: ".", ecosystem, refresh: /\brefresh|update\b/.test(lower) }, "dependency-restore");
  }
  return { classification: "unclassified", suggestion: null };
}

module.exports = {
  classifyCommand
};
