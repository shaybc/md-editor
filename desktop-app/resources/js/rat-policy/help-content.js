(function(global) {
  "use strict";

  /** Provide concise offline guidance for every RAT policy decision. */
  function registerMarkdownViewerRatPolicyHelpContent(app) {
    const OFFICIAL_LINKS = [
      { label: "Apache RAT overview", url: "https://creadur.apache.org/rat/" },
      { label: "Maven plugin", url: "https://creadur.apache.org/rat/apache-rat-plugin/" },
      { label: "Maven Central plugin page", url: "https://central.sonatype.com/artifact/org.apache.rat/apache-rat-plugin" },
      { label: "Custom license matchers", url: "https://creadur.apache.org/rat/apache-rat-plugin/examples/custom-license.html" }
    ];
    const TOPICS = {
      overview: {
        title: "What a RAT policy controls",
        body: "Apache RAT is a release-audit utility. A project policy decides when the Maven plugin runs, which files are inspected, which license evidence is recognized, and which recognized families the project accepts. RAT findings still require human interpretation.",
        caution: "MD-Editor can encode and verify a reviewed technical policy; it cannot decide ownership or legal compatibility."
      },
      license: {
        title: "Project license",
        body: "The project license describes the terms under which project-owned work is distributed. Selecting it here does not grant the project rights to third-party files and does not automatically add headers.",
        caution: "Only choose a license the project is authorized to apply."
      },
      coverage: {
        title: "Maven execution coverage",
        body: "A plugin in build/plugins can execute; pluginManagement only supplies defaults. Parent declarations may be inherited, while profiles may activate policy conditionally.",
        caution: "Use effective-POM inspection when static inheritance or profiles are ambiguous."
      },
      exclusions: {
        title: "RAT exclusions",
        body: "An exclusion tells RAT not to inspect matching files. It is appropriate for reviewed generated artifacts or binary fixtures whose licensing is tracked elsewhere.",
        caution: "Exclusion is not license approval and broad patterns can hide new files."
      },
      approvals: {
        title: "Recognized and approved license families",
        body: "A matcher recognizes license evidence; an approved family records that project policy accepts the recognized family. These are separate from file exclusions and documentation.",
        caution: "RAT approval is a policy configuration, not a legal opinion."
      },
      bypass: {
        title: "Audit bypass",
        body: "The rat.skip property or a disabled execution prevents the audit from blocking that scope. It may be useful for an intentionally non-audited invocation, but it does not fix any file or policy issue.",
        caution: "Bypasses are never recommended as the default policy."
      },
      offline: {
        title: "Offline references",
        body: "MD-Editor bundles authored templates, concise help, and versioned validation subsets for RAT 0.17 and 0.18. The manifest records origin and scope. Unknown versions receive structural validation only.",
        caution: "Bundled references do not replace the RAT executable or its mutable built-in license database."
      }
    };

    function get(topic) {
      const value = TOPICS[topic] || TOPICS.overview;
      return { ...value, links: OFFICIAL_LINKS };
    }

    const api = { get };
    app?.registerModule?.("ratPolicyHelpContent", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyHelpContent = registerMarkdownViewerRatPolicyHelpContent;
})(typeof window !== "undefined" ? window : globalThis);
