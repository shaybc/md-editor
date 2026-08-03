const fs = require("fs");
const path = require("path");
const { MD_EDITOR_DIR, REPORT_JSON_FILE, REPORT_MARKDOWN_FILE } = require("./constants");
const { toMarkdownPath } = require("./utils");

function writeMissingDependenciesReport(destinationRoot, report) {
  const metadataDir = path.join(destinationRoot, MD_EDITOR_DIR);
  fs.mkdirSync(metadataDir, { recursive: true });
  const jsonPath = path.join(metadataDir, REPORT_JSON_FILE);
  const markdownPath = path.join(metadataDir, REPORT_MARKDOWN_FILE);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  const lines = [
    "# Built-in Converter Missing Dependencies Report",
    "",
    `- Root: ${report.root}`,
    `- Source root home: ${report.sourceRootPath}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Duration: ${report.duration}`,
    `- Source files: ${report.counts.sourceFiles}`,
    `- Markdown files: ${report.counts.markdownFilesWritten}`,
    `- Local dependencies: ${report.counts.localDependencies}`,
    `- Unresolved dependencies: ${report.counts.unresolvedDependencies}`,
    `- Discovered external dependencies: ${report.counts.discoveredExternalDependencies}`,
    "",
    "## Warnings",
    "",
  ];
  if (report.warnings?.length) report.warnings.forEach((warning) => lines.push(`- ${warning}`));
  else lines.push("None.");
  lines.push("", "## Unresolved Dependencies", "");
  const unresolved = (report.sources || []).flatMap((source) => (
    (source.unresolvedDependencies || []).map((dependency) => ({ source, dependency }))
  ));
  if (!unresolved.length) {
    lines.push("None.");
  } else {
    unresolved.forEach(({ source, dependency }) => {
      lines.push(`- \`${dependency.symbol}\` (${dependency.language}, ${dependency.kind}) in ${source.sourceFile}`);
    });
  }
  fs.writeFileSync(markdownPath, lines.join("\n"), "utf8");
  return { jsonPath, markdownPath };
}

function createReport({ sourceRoot, sourceRootHome, destinationRoot, files, startedAt, finishedAt, sources, externalDependencies, warnings }) {
  const localDependencyCount = sources.reduce((total, source) => total + (source.localDependencies?.length || 0), 0);
  const unresolvedCount = sources.reduce((total, source) => total + (source.unresolvedDependencies?.length || 0), 0);
  return {
    schemaVersion: 1,
    generator: "builtin_converter",
    language: "mixed",
    root: sourceRoot,
    sourceRootPath: toMarkdownPath(sourceRootHome),
    vault: destinationRoot,
    startedAt,
    finishedAt,
    duration: `${Math.max(0, new Date(finishedAt) - new Date(startedAt))}ms`,
    counts: {
      sourceFiles: files.length,
      filesAnalyzed: files.length,
      markdownFilesWritten: sources.length,
      localDependencies: localDependencyCount,
      unresolvedDependencies: unresolvedCount,
      discoveredExternalDependencies: externalDependencies.length,
    },
    warnings,
    diagnostics: [],
    sources,
    externalDependencies,
  };
}

module.exports = {
  writeMissingDependenciesReport,
  createReport,
};
