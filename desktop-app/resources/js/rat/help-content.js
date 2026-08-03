(function(global) {
  "use strict";

  /** Provide plain-language Apache RAT guidance without performing project changes. */
  function registerMarkdownViewerRatHelpContent(app) {
    const OFFICIAL_LINKS = Object.freeze({
      overview: { label: "Apache RAT overview", url: "https://creadur.apache.org/rat/" },
      mavenPlugin: { label: "Apache RAT Maven Plugin", url: "https://creadur.apache.org/rat/apache-rat-plugin/" },
      mavenOptions: { label: "RAT Maven configuration options", url: "https://creadur.apache.org/rat/apache-rat-plugin/mvn_options.html" },
      customLicense: { label: "Custom license configuration", url: "https://creadur.apache.org/rat/apache-rat-plugin/examples/custom-license.html" },
      skip: { label: "Official rat.skip parameter", url: "https://creadur.apache.org/rat/apache-rat-plugin/check-mojo.html#skip" }
    });

    const GENERAL_HELP = Object.freeze({
      title: "What this Apache RAT finding means",
      introduction: [
        "Apache RAT (Release Audit Tool) is a software auditing utility created by the Apache Software Foundation to verify license compliance. It scans project source code and distribution packages for recognized license information and files that project policy allows or excludes.",
        "This finding means RAT could not accept one or more scanned files under the project's current RAT configuration. It does not automatically mean that the file is illegal, incompatible, or missing from LICENSE or NOTICE. The file may have no recognizable header, may be binary or generated, may use a license family the project has not configured, or may need a justified exclusion."
      ],
      issue: "The Maven build fails because apache-rat:check is enforcing the project's configured release-audit policy. The RAT report normally lists the exact files that require review.",
      buildImpact: "Until the finding is resolved or RAT is deliberately bypassed, Maven phases bound to the RAT check can fail. Compilation may be unrelated; the failure is a compliance gate.",
      developerImpact: "The developer must inspect the file and project policy, then make an explicit choice. MD-Editor can explain and implement configuration changes, but it cannot decide ownership, relicensing authority, or legal compatibility.",
      guidance: "Start with the RAT report and file investigation. Prefer the narrowest action that accurately represents the file: a legitimate header, an exact or reviewed generated-file exclusion, or recognition of an approved license family. Use audit bypass actions only when the build intentionally does not require license verification.",
      links: [OFFICIAL_LINKS.overview, OFFICIAL_LINKS.mavenPlugin, OFFICIAL_LINKS.mavenOptions]
    });

    const ACTION_HELP = Object.freeze({
      "resolution.add-header": {
        title: "Add the project license header",
        issue: "RAT did not recognize an acceptable license header in an eligible text file.",
        does: "Adds the reviewed project header using the file's comment syntax while preserving leading declarations such as a shebang or XML declaration.",
        buildImpact: "The RAT finding should clear after the edited file is saved and RAT recognizes the new header.",
        developerImpact: "You must confirm that the project is legally entitled to license this file under that license. Do not use this action merely to silence RAT for third-party content.",
        links: [OFFICIAL_LINKS.mavenOptions]
      },
      "resolution.exclude-file": {
        title: "Exclude this exact file from RAT",
        issue: "The file may be generated, binary, third-party, or otherwise unsuitable for header scanning.",
        does: "Adds one precise path to RAT's exclusions in the selected configuration scope. RAT stops inspecting that path.",
        buildImpact: "The current RAT finding should clear, but the file will no longer be checked by RAT in affected modules.",
        developerImpact: "You must provide a truthful rationale. Exclusion does not approve, license, or document the file; other project compliance obligations still apply.",
        links: [OFFICIAL_LINKS.mavenOptions]
      },
      "resolution.exclude-pattern": {
        title: "Exclude matching generated files",
        issue: "A repeatable build or generator may produce several files that are not meaningful candidates for license-header inspection.",
        does: "Adds a reviewed exclusion pattern after showing every current workspace match.",
        buildImpact: "All matching files are omitted from future RAT checks in the selected scope, including files created later.",
        developerImpact: "A broad pattern can hide real source files from auditing. Review the matches and keep the pattern limited to the actual generated output.",
        links: [OFFICIAL_LINKS.mavenOptions]
      },
      "resolution.approve-license-family": {
        title: "Recognize and approve a license family",
        issue: "The content may contain legitimate license text that RAT does not currently recognize or that project policy has not approved.",
        does: "Configures a matcher for the license family and adds that family to RAT's explicit approved-license policy.",
        buildImpact: "Files matching that configured evidence can pass RAT throughout the selected scope.",
        developerImpact: "This is a project-policy decision with potentially broad impact. Confirm the matcher is specific and that the project accepts the license family; RAT approval is not legal advice.",
        links: [OFFICIAL_LINKS.customLicense, OFFICIAL_LINKS.mavenOptions]
      },
      "documentation.third-party": {
        title: "Record third-party license and provenance",
        issue: "The project may need an auditable record of where third-party content came from and what obligations accompany it.",
        does: "Proposes attribution and provenance information in an existing project documentation workflow.",
        buildImpact: "Documentation alone does not change RAT matching and normally does not clear the finding.",
        developerImpact: "Use this alongside the technically correct RAT action when required. NOTICE is appropriate only when the license or project policy requires notice attribution.",
        links: [OFFICIAL_LINKS.overview]
      },
      "documentation.open-project-files": {
        title: "Open project license documentation",
        issue: "Existing LICENSE, NOTICE, README, or third-party inventory files may explain the project's policy or the origin of the reported content.",
        does: "Opens existing documentation for review without modifying it.",
        buildImpact: "This is read-only and cannot clear a RAT finding by itself.",
        developerImpact: "Use the information to make a better policy decision; do not assume mentioning a filename in documentation makes RAT approve it.",
        links: [OFFICIAL_LINKS.overview]
      },
      "investigate.file": {
        title: "Inspect the reported file",
        issue: "Before choosing a remediation, the developer needs to know whether the file is text, binary, generated-looking, or externally viewable.",
        does: "Shows bounded metadata and a safe preview. Unknown binary files are not opened as source text.",
        buildImpact: "No project or build behavior changes.",
        developerImpact: "This supplies evidence only. File contents do not by themselves establish ownership or permission to relicense.",
        links: [OFFICIAL_LINKS.overview]
      },
      "investigate.provenance": {
        title: "Investigate file provenance",
        issue: "The correct remediation depends on whether the file is authored by the project, generated, copied from upstream, or an accidental build artifact.",
        does: "Collects Git history, ignore status, nearby generators, metadata, and references without making a legal conclusion.",
        buildImpact: "No project or build behavior changes.",
        developerImpact: "Use the evidence to choose between a legitimate header, documentation, license-family approval, or a narrow exclusion.",
        links: [OFFICIAL_LINKS.overview]
      },
      "investigate.configuration": {
        title: "Inspect governing RAT configuration",
        issue: "RAT behavior may come from the module POM, a parent, an active profile, an external configuration, or pluginManagement.",
        does: "Shows where the current policy originates, whether it is inherited, and which modules may be affected.",
        buildImpact: "Inspection is read-only. Resolving an effective-POM ambiguity may run a confirmed Maven diagnostic command.",
        developerImpact: "Review this before editing a parent configuration; a parent-level change can alter compliance checking across many modules.",
        links: [OFFICIAL_LINKS.mavenPlugin, OFFICIAL_LINKS.mavenOptions]
      },
      "investigate.report": {
        title: "Open the RAT report",
        issue: "The Maven summary often reports only a count, while target/rat.txt identifies the files and RAT classifications.",
        does: "Opens the existing report without rerunning Maven.",
        buildImpact: "No project or build behavior changes.",
        developerImpact: "This is usually the best first step because it reveals whether the problem is isolated or part of a larger set.",
        links: [OFFICIAL_LINKS.mavenPlugin]
      },
      "run.check": {
        title: "Run Apache RAT check",
        issue: "The developer may need a fresh report after reviewing or saving configuration changes.",
        does: "Runs the wrapper-aware apache-rat:check command for the selected Maven scope and captures its output.",
        buildImpact: "It performs the license audit only; it does not automatically compile, package, or install the project. The command can exit with failure while findings remain.",
        developerImpact: "Review and save approved changes first. A failed check is verification feedback, not evidence that source compilation failed.",
        links: [OFFICIAL_LINKS.mavenPlugin]
      },
      "advanced.skip": {
        title: "Skip RAT for one Maven invocation",
        issue: "A technical build may intentionally need to continue without running the license-compliance gate.",
        does: "Adds -Drat.skip=true to one Maven command. RAT does not scan or approve any files during that invocation.",
        buildImpact: "The Maven build may proceed past RAT, but the original finding remains unresolved and will return when RAT runs again.",
        developerImpact: "Use only when license verification is intentionally out of scope for that invocation. Do not use it to prepare or validate a compliant release.",
        links: [OFFICIAL_LINKS.skip]
      },
      "advanced.disable-execution": {
        title: "Configure RAT to skip this scope",
        issue: "The project may have deliberately decided that RAT must not execute in a particular module, profile, or inherited scope.",
        does: "Persists a skip or deactivates a selected execution when the POM structure supports a safe edit.",
        buildImpact: "Future builds in the affected scope stop enforcing RAT until the configuration is reverted or overridden.",
        developerImpact: "This can remove a compliance control for multiple developers and modules. It requires explicit acknowledgement and should be reviewed like any policy change.",
        links: [OFFICIAL_LINKS.skip, OFFICIAL_LINKS.mavenOptions]
      }
    });

    /**
     * Return the introductory explanation for an Apache RAT finding.
     * @returns {object} Immutable help topic with official documentation links.
     */
    function getGeneralHelp() {
      return GENERAL_HELP;
    }

    /**
     * Return the explanation for one RAT Manager action.
     * @param {string} actionId Stable RAT action identifier.
     * @returns {object|null} Help topic, or null when the action is unknown.
     */
    function getActionHelp(actionId) {
      return ACTION_HELP[String(actionId || "")] || null;
    }

    const api = { getActionHelp, getGeneralHelp };
    app?.registerModule?.("ratHelpContent", api);
    return api;
  }

  global.registerMarkdownViewerRatHelpContent = registerMarkdownViewerRatHelpContent;
})(typeof window !== "undefined" ? window : globalThis);
