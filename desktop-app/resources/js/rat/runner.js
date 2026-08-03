(function(global) {
  "use strict";

  /** Execute reviewed RAT commands through the existing read-only terminal. */
  function registerMarkdownViewerRatRunner(app, deps = {}) {
    function parseOutput(output, projectPath) {
      const findings = [];
      let unapprovedCount = null;
      let reportPath = "";
      const lines = String(output || "").split(/\r?\n/);
      for (const line of lines) {
        const count = deps.findingParser.parseUnapprovedCount?.(line);
        if (count !== null && count !== undefined) {
          unapprovedCount = count;
        }
        reportPath = deps.findingParser.extractReportPath?.(line) || reportPath;
        if (count !== null && count !== undefined) continue;
        const diagnostic = deps.findingParser.parseDiagnostic({ message: line, source: "maven" }, {
          projectPath,
          allowUnclassified: false
        });
        if (diagnostic) findings.push(diagnostic);
      }
      return { findings, reportPath, unapprovedCount };
    }

    async function runCheck(context, scope = "module") {
      const command = deps.commandBuilder.build(context, { scope, kind: "check" });
      const result = await deps.terminal.runCommand(command.command, {
        cwd: command.cwd,
        title: "Apache RAT Check",
        tabId: "apache-rat-check",
        captureOutput: true
      });
      const output = `${result?.stdout || ""}\n${result?.stderr || ""}\n${result?.consoleOutput || ""}`;
      const parsed = parseOutput(output, context.projectPath);
      return {
        command,
        exitCode: result?.exitCode ?? null,
        output,
        findings: parsed.findings,
        reportPath: parsed.reportPath || context.reportPath || "",
        unapprovedCount: parsed.unapprovedCount,
        succeeded: Number(result?.exitCode) === 0
      };
    }

    function verify(originalFinding, runResult) {
      if (!runResult) return { status: "Verification timed out", findings: [], unapprovedCount: null };
      const original = deps.findingParser.fingerprint(originalFinding);
      const current = (runResult.findings || []).map((finding) => deps.findingParser.fingerprint(finding));
      const unapprovedCount = runResult.unapprovedCount;
      if (current.includes(original) || Number(unapprovedCount) > 0) {
        return { status: "Still unapproved", findings: runResult.findings || [], unapprovedCount };
      }
      if (!runResult.succeeded && !current.length) {
        return { status: "RAT execution failed", findings: [], unapprovedCount, exitCode: runResult.exitCode };
      }
      if (current.length) {
        return { status: "Different RAT findings introduced", findings: runResult.findings, unapprovedCount };
      }
      return { status: "Resolved", findings: [], unapprovedCount: unapprovedCount ?? 0 };
    }

    const api = { parseOutput, runCheck, verify };
    app?.registerModule?.("ratRunner", api);
    return api;
  }

  global.registerMarkdownViewerRatRunner = registerMarkdownViewerRatRunner;
})(typeof window !== "undefined" ? window : globalThis);
