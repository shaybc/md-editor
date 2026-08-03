(function(global) {
  "use strict";

  /** Create safe local fallback actions for syntax errors that occupy a complete line. */
  function registerMarkdownViewerLocalQuickFixProvider(app, deps = {}) {
    function getMavenProblemExplainer() {
      return deps.mavenProblemExplainer || app.modules?.mavenProblemExplainer || null;
    }

    function getDiagnosticSearchText(diagnostic) {
      return [
        diagnostic?.message,
        diagnostic?.originalMessage,
        diagnostic?.fullMessage,
        diagnostic?.rawMessage,
        diagnostic?.details
      ].map((value) => String(value || "").trim()).filter(Boolean).join("\n");
    }

    function isRatDiagnostic(diagnostic) {
      const message = getDiagnosticSearchText(diagnostic);
      return diagnostic?.source === "maven-rat"
        || /files?\s+with\s+unapproved\s+licenses?/i.test(message)
        || /org\.apache\.rat:apache-rat-plugin/i.test(message);
    }

    function isMavenDiagnostic(diagnostic) {
      return /\bmaven\b/i.test(String(diagnostic?.source || ""));
    }

    function isSpotlessDiagnostic(diagnostic) {
      const message = getDiagnosticSearchText(diagnostic);
      return diagnostic?.problemType === "spotless-format"
        || (isMavenDiagnostic(diagnostic)
          && (/spotless-maven-plugin/i.test(message)
            || /spotless:apply/i.test(message)
            || /the following files had format violations/i.test(message)
            || /violations also present in:/i.test(message)));
    }

    function isMavenDependencyResolutionDiagnostic(diagnostic) {
      const message = getDiagnosticSearchText(diagnostic);
      return /\bmaven\b/i.test(String(diagnostic?.source || ""))
        && (/maven\s+dependency\s+resolution\s+failed/i.test(message)
          || /could\s+not\s+resolve\s+dependencies/i.test(message)
          || /could\s+not\s+resolve\s+\d+\s+artifacts?/i.test(message)
          || /DependencyResolutionException/i.test(message)
          || /was\s+not\s+found\s+in\s+.+?during\s+a\s+previous\s+attempt/i.test(message)
          || /resolution\s+is\s+not\s+reattempted\s+until.+updates\s+are\s+forced/i.test(message)
          || /cached\s+the\s+failed\s+lookup;\s+use\s+-U\s+to\s+force\s+updates/i.test(message));
    }

    function getLineRange(diagnostic, sourceContent) {
      const lines = String(sourceContent || "").split(/\r?\n/);
      const line = Number(diagnostic?.range?.start?.line);
      if (!Number.isInteger(line) || line < 0 || line >= lines.length) return null;
      return {
        line,
        text: lines[line],
        range: {
          start: { line, character: 0 },
          end: { line: line + 1, character: 0 }
        }
      };
    }

    function createAction(id, title, description, isPreferred, uri, range, newText) {
      return {
        id,
        title,
        description,
        provenance: "Local",
        isPreferred,
        disabled: false,
        needsResolve: false,
        workspaceEdit: {
          changes: {
            [uri]: [{ range, newText }]
          }
        }
      };
    }

    function createMavenExplanationAction(explanation, fallbackTitle, fallbackDescription) {
      return {
        id: "local-maven-build-problem-help",
        title: `Explain ${explanation?.title || fallbackTitle}\u2026`,
        description: explanation?.summary || fallbackDescription,
        provenance: "local",
        isPreferred: false,
        disabled: false,
        needsResolve: false,
        execute: true,
        kind: "maven-problem-explanation",
        explanation
      };
    }

    function createMavenSearchAction(explanation, fallbackQuery) {
      return {
        id: "local-maven-search-web",
        title: "Search the web for this Maven error\u2026",
        description: "Open your default browser with a sanitized search query that removes local paths and project-specific names.",
        provenance: "local",
        isPreferred: false,
        disabled: false,
        needsResolve: false,
        execute: true,
        kind: "maven-search-web",
        searchQuery: explanation?.searchQuery || fallbackQuery
      };
    }

    /**
     * Return safe local alternatives when JDT provides no action for a complete-line syntax error.
     * @param {object} diagnostic Matched Java diagnostic.
     * @returns {Promise<object[]>} Previewable local workspace-edit actions.
     */
    async function getActions(diagnostic) {
      const mavenExplanation = getMavenProblemExplainer()?.explain?.(diagnostic) || null;
      if (isRatDiagnostic(diagnostic)) {
        return [
          {
            id: "local-resolve-rat-finding",
            title: "Resolve RAT finding\u2026",
            description: "Open Apache RAT License Audit to investigate the file, choose an appropriate policy action, preview changes, and verify the result.",
            provenance: "local",
            isPreferred: true,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "rat-manager"
          },
          {
            id: "local-rebuild-with-rat-skipped",
            title: "Rebuild once with Apache RAT skipped\u2026",
            description: "Open the Maven rebuild dialog with -Drat.skip=true selected for this rebuild only. This is an audit bypass, not a license fix.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: {
              invocationValues: { "plugin.apache-rat.skip": true },
              requestedPluginSkips: ["apache-rat"]
            }
          },
          createMavenSearchAction(mavenExplanation, "Apache RAT unapproved licenses Maven")
        ];
      }
      if (isSpotlessDiagnostic(diagnostic)) {
        return [
          {
            id: "local-maven-spotless-apply",
            title: "Run Spotless apply for this module…",
            description: "Runs mvn spotless:apply using the project Maven runner. This may rewrite multiple files in the module; review the diff afterward.",
            provenance: "local",
            isPreferred: true,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-spotless-apply"
          },
          {
            id: "local-maven-rebuild-with-spotless-skipped",
            title: "Rebuild once with Spotless check disabled…",
            description: "Open the Maven rebuild dialog with -Dspotless.check.skip=true selected for this rebuild only. This is a formatting check bypass, not a formatting fix.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: {
              invocationValues: { "plugin.spotless.skip": true },
              requestedPluginSkips: ["spotless"]
            }
          },
          {
            id: "local-maven-rebuild-advanced-options",
            title: "Rebuild with advanced Maven options…",
            description: "Open the Maven rebuild dialog so you can add validated one-time Maven options before running the command.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: {}
          },
          {
            id: "local-maven-inspect-effective-pom",
            title: "Inspect effective Maven configuration…",
            description: "Run Maven's read-only effective-POM inspection to see the active project, profile, plugin, and repository configuration.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-inspect-effective-pom"
          },
          createMavenExplanationAction(
            mavenExplanation,
            "Spotless format violations",
            "Explain why Spotless reported a formatting policy violation and why the file may look visually correct."
          ),
          createMavenSearchAction(mavenExplanation, "Maven Spotless spotless:check format violations mvn spotless:apply")
        ];
      }
      if (isMavenDependencyResolutionDiagnostic(diagnostic)) {
        return [
          {
            id: "local-maven-retry-forced-updates",
            title: "Retry Maven with forced updates (-U)\u2026",
            description: "Open the Maven rebuild dialog with Force Maven dependency updates (-U) selected for this invocation.",
            provenance: "local",
            isPreferred: true,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: { invocationValues: { "dependency.force-updates": true } }
          },
          {
            id: "local-maven-rebuild-advanced-options",
            title: "Rebuild with advanced Maven options\u2026",
            description: "Open the Maven rebuild dialog so you can add validated one-time Maven options before running the command.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: {}
          },
          {
            id: "local-maven-inspect-effective-pom",
            title: "Inspect effective Maven configuration\u2026",
            description: "Run Maven's read-only effective-POM inspection to see the active project, profile, plugin, and repository configuration.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-inspect-effective-pom"
          },
          createMavenExplanationAction(
            mavenExplanation,
            "Maven dependency resolution",
            "Explain why even Maven clean can resolve dependencies and what the cached-failure message means."
          ),
          createMavenSearchAction(mavenExplanation, "Maven dependency resolution failed cached lookup -U")
        ];
      }
      if (isMavenDiagnostic(diagnostic)) {
        return [
          {
            id: "local-maven-rebuild-advanced-options",
            title: "Rebuild with advanced Maven options\u2026",
            description: "Open the Maven rebuild dialog so you can add validated one-time Maven options before running the command.",
            provenance: "local",
            isPreferred: true,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-rebuild-with-options",
            mavenBuildOptions: {}
          },
          {
            id: "local-maven-inspect-effective-pom",
            title: "Inspect effective Maven configuration\u2026",
            description: "Run Maven's read-only effective-POM inspection to see the active project, profile, plugin, and repository configuration.",
            provenance: "local",
            isPreferred: false,
            disabled: false,
            needsResolve: false,
            execute: true,
            kind: "maven-inspect-effective-pom"
          },
          createMavenExplanationAction(
            mavenExplanation,
            "Maven build problem",
            "Explain why this Problems entry came from Maven output and why JDT quick fixes may not apply."
          ),
          createMavenSearchAction(mavenExplanation, "Maven build error")
        ];
      }
      const context = await deps.getProblemContext?.(diagnostic);
      const uri = diagnostic?.uri;
      const line = getLineRange(diagnostic, context?.sourceContent);
      if (!uri || !line || !line.text.trim()) return [];
      const diagnosticRange = diagnostic?.range;
      if (diagnosticRange?.start?.line !== diagnosticRange?.end?.line) return [];
      const token = line.text.slice(diagnosticRange.start.character, diagnosticRange.end.character);
      if (!token.trim() || line.text.trim() !== token.trim()) return [];
      const lineEnding = String(context.sourceContent || "").includes("\r\n") ? "\r\n" : "\n";
      const indentation = line.text.match(/^\s*/)?.[0] || "";
      return [
        createAction(
          "local-delete-line",
          "Delete the line entirely",
          "Removes the complete invalid line. Recommended when it is accidental text.",
          true,
          uri,
          line.range,
          ""
        ),
        createAction(
          "local-comment-line",
          "Comment out the line",
          "Keeps the text for later review while preventing Java from parsing it as code.",
          false,
          uri,
          line.range,
          `${indentation}// ${line.text.trim()}${lineEnding}`
        )
      ];
    }

    const api = { getActions, isMavenDependencyResolutionDiagnostic, isMavenDiagnostic, isRatDiagnostic, isSpotlessDiagnostic };
    app.registerModule?.("localQuickFixProvider", api);
    return api;
  }

  global.registerMarkdownViewerLocalQuickFixProvider = registerMarkdownViewerLocalQuickFixProvider;
})(typeof window !== "undefined" ? window : globalThis);