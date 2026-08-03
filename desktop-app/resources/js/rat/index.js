(function(global) {
  "use strict";

  /** Coordinate Apache RAT analysis, reviewed changes, and verification. */
  function registerMarkdownViewerRatManager(app, deps = {}) {
    let activeContext = null;
    let activeApplication = null;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function detailRows(entries) {
      return `<dl class="rat-manager-detail-list">${entries.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value || "Unknown")}</dd>`).join("")}</dl>`;
    }

    async function open(request = {}) {
      const hasFindingInput = Boolean(request.finding || request.diagnostic);
      const finding = request.finding || deps.findingParser.parseDiagnostic(request.diagnostic || {}, {
        projectPath: request.projectPath || deps.getWorkspaceRoot?.(),
        targetPath: hasFindingInput ? request.targetPath : "",
        allowUnclassified: true
      });
      const context = await deps.projectContext.analyze({ ...request, finding });
      context.inspection = await deps.fileInspector.inspect(context.finding.filePath);
      context.provenance = await deps.provenanceAnalyzer.analyze(context);
      context.actions = deps.actionCatalog.getActions(context);
      activeContext = context;
      const handlers = { selectAction: (action) => selectAction(action) };
      deps.dialog.open({ context, actions: context.actions }, handlers);
      const route = String(request.route || "finding.summary");
      if (route !== "finding.summary") {
        const action = context.actions.find((candidate) => candidate.id === route);
        if (action?.enabled) await selectAction(action);
      }
      return context;
    }

    async function selectAction(action) {
      if (!activeContext || !action?.enabled) return;
      if (action.id === "investigate.file") {
        const file = activeContext.inspection;
        deps.dialog.renderDetails(action.title, detailRows([
          ["Path", file.path], ["Classification", file.classification], ["Size", `${file.size || 0} bytes`],
          ["Extension", file.extension], ["Signature (hex)", file.signatureHex], ["Signature (ASCII)", file.signatureAscii]
        ]) + `<div class="rat-manager-inline-actions"><button type="button" data-open-default>Open with default application</button><button type="button" data-hash>Compute SHA-256</button></div><output class="rat-manager-hash"></output>`);
        const dialogBody = document.querySelector(".rat-manager-body");
        dialogBody.querySelector("[data-open-default]")?.addEventListener("click", () => deps.openExternal?.(file.path));
        dialogBody.querySelector("[data-hash]")?.addEventListener("click", async () => {
          dialogBody.querySelector(".rat-manager-hash").textContent = await deps.fileInspector.sha256(file.path);
        });
        return;
      }
      if (action.id === "investigate.provenance") {
        const provenance = activeContext.provenance;
        deps.dialog.renderDetails(action.title, detailRows([
          ["Project-relative path", provenance.relativePath], ["Git state", provenance.trackedState],
          ["Generated-looking path", provenance.generatedLooking ? "Yes" : "No"], ["Conclusion", provenance.conclusion]
        ]));
        return;
      }
      if (action.id === "investigate.configuration") {
        const rows = activeContext.declarations.length
          ? activeContext.declarations.map((entry) => ["RAT declaration", `${entry.pomPath} - ${entry.active ? "active" : "pluginManagement"}${entry.inProfile ? ", profile" : ""}`])
          : [["RAT declaration", "No explicit apache-rat-plugin declaration found"]];
        deps.dialog.renderDetails(action.title, detailRows(rows.concat([
          ["Selected module", activeContext.module.projectRoot],
          ["Plugin version", activeContext.governing?.version || "Inherited or unspecified"],
          ["Confidence", activeContext.configurationConfidence]
        ])), activeContext.configurationConfidence === "ambiguous" ? {
          primaryLabel: "Resolve effective Maven configuration",
          onPrimary: async () => {
            const command = deps.commandBuilder.build(activeContext, { kind: "effective-pom" });
            const result = await deps.terminal.runCommand(command.command, {
              cwd: command.cwd,
              title: "Maven Effective POM",
              captureOutput: true
            });
            deps.dialog.renderDetails("Effective Maven configuration", `<pre>${escapeHtml(result?.output || "")}</pre>`, { stage: "Investigation" });
          }
        } : {});
        return;
      }
      if (action.id === "investigate.report") {
        await deps.openDocument(activeContext.reportPath);
        return;
      }
      if (action.id === "documentation.open-project-files") {
        const candidates = ["LICENSE", "LICENSE.txt", "NOTICE", "NOTICE.txt", "README.md", "THIRD-PARTY.md", "THIRD_PARTY_LICENSES.md"];
        const paths = [];
        for (const name of candidates) {
          const path = `${activeContext.projectPath}/${name}`;
          try {
            if ((await deps.Neutralino.filesystem.getStats(path))?.isFile) paths.push(path);
          } catch (_error) {
            // Missing project documentation is expected.
          }
        }
        const buttons = paths.length
          ? paths.map((path, index) => `<button type="button" data-rat-document="${index}">${escapeHtml(path)}</button>`).join("")
          : "<p>No common project license documentation file was found.</p>";
        deps.dialog.renderDetails(action.title, `<div class="rat-manager-inline-actions">${buttons}</div>`);
        document.querySelectorAll("[data-rat-document]").forEach((button) => {
          button.addEventListener("click", () => deps.openDocument(paths[Number(button.dataset.ratDocument)]));
        });
        return;
      }
      if (action.id === "run.check" || action.id === "advanced.skip") {
        const command = deps.commandBuilder.build(activeContext, { kind: action.id === "advanced.skip" ? "skip" : "check" });
        deps.dialog.renderDetails(action.title, `<p>${escapeHtml(action.description)}</p><label><span>Command</span><textarea readonly>${escapeHtml(command.command)}</textarea></label><p><strong>Working directory:</strong> ${escapeHtml(command.cwd)}</p>`, {
          primaryLabel: action.id === "advanced.skip" ? "Run bypass command" : "Run RAT check",
          onPrimary: async () => {
            if (action.id === "advanced.skip") {
              await deps.terminal.runCommand(command.command, { cwd: command.cwd, title: "Maven with RAT skipped", captureOutput: true });
              return;
            }
            const result = await deps.runner.runCheck(activeContext, "module");
            const verification = deps.runner.verify(activeContext.finding, result);
            deps.dialog.renderDetails(verification.status, detailRows([
              ["Command", result.command.command],
              ["Exit code", result.exitCode],
              ["Unapproved files", verification.unapprovedCount ?? verification.findings.length],
              ["RAT report", result.reportPath]
            ]), { stage: "Result" });
          }
        });
        return;
      }
      deps.dialog.renderActionForm(action, activeContext, async (input) => {
        const plan = await deps.changePlanner.plan(action.id, activeContext, input);
        deps.dialog.renderPreview(plan, async () => {
          activeApplication = await deps.changeSet.apply(plan);
          deps.dialog.renderApplied(activeApplication, {
            undo: async () => {
              await activeApplication.undo();
              activeApplication = null;
              await open({ projectPath: activeContext.projectPath, targetPath: activeContext.finding.filePath, finding: activeContext.finding });
            },
            run: async () => {
              const saved = await deps.tabs.saveExternalDocuments?.(plan.affectedPaths);
              if (saved === false) throw new Error("One or more affected RAT files could not be saved.");
              const dirty = plan.affectedPaths.some((path) => deps.tabs.getExternalDocumentSnapshot?.(path)?.isDirty);
              if (dirty) throw new Error("Save all affected RAT files before verification.");
              const result = await deps.runner.runCheck(activeContext, "module");
              const verification = deps.runner.verify(activeContext.finding, result);
              deps.dialog.renderDetails(verification.status, detailRows([
                ["Exit code", result.exitCode],
                ["Unapproved files", verification.unapprovedCount ?? verification.findings.length],
                ["RAT report", result.reportPath]
              ]), { stage: "Result" });
            }
          });
        });
      });
    }

    function verify(originalFinding, runResult) {
      return deps.runner.verify(originalFinding, runResult);
    }

    const api = { open, verify };
    app?.registerModule?.("ratManager", api);
    return api;
  }

  global.registerMarkdownViewerRatManager = registerMarkdownViewerRatManager;
})(typeof window !== "undefined" ? window : globalThis);
