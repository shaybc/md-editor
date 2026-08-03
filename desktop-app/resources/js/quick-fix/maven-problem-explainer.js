(function(global) {
  "use strict";

  /** Explain Maven build-output problems and produce sanitized search queries. */
  function registerMarkdownViewerMavenProblemExplainer(app) {
    function getDiagnosticText(diagnostic) {
      return [
        diagnostic?.message,
        diagnostic?.originalMessage,
        diagnostic?.fullMessage,
        diagnostic?.rawMessage,
        diagnostic?.details
      ].map((value) => String(value || "").trim()).filter(Boolean).join("\n");
    }

    function stripWorkspaceSpecificDetails(value) {
      return String(value || "")
        .replace(/[A-Z]:[\\/][^\s'"`<>]+/gi, " ")
        .replace(/(?:^|\s)(?:\.{1,2}[\\/])?[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+){2,}/g, " ")
        .replace(/\bon project\s+[A-Za-z0-9_.-]+/gi, "on project")
        .replace(/\bfor\s+[A-Za-z0-9_.-]+(?=[:\s])/gi, "for project")
        .replace(/\bline\s+\d+\b/gi, "line")
        .replace(/:\d+:\d+\b/g, "")
        .replace(/\b\d+\.\d+(?:\.\d+)*(?:[-.][A-Za-z0-9]+)?\b/g, "version")
        .replace(/\s+/g, " ")
        .trim();
    }

    function pluginCoordinate(text) {
      const match = String(text || "").match(/(?:Failed to execute goal\s+)?([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):(?:[A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)/i);
      if (!match) return "";
      return `${match[1]} ${match[2]} ${match[3]}`;
    }

    function createExplanation(kind, title, summary, nextSteps, queryParts) {
      const searchQuery = queryParts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      return { kind, title, summary, nextSteps, searchQuery };
    }

    /**
     * Produce a developer-facing explanation for a Maven diagnostic.
     * @param {object} diagnostic Problems-panel diagnostic created from Maven output.
     * @returns {object} Explanation, next steps, and a sanitized web-search query.
     */
    function explain(diagnostic) {
      const text = getDiagnosticText(diagnostic);
      const stripped = stripWorkspaceSpecificDetails(text);

      if (diagnostic?.problemType === "spotless-format" || /com\.diffplug\.spotless:spotless-maven-plugin|spotless(?:-maven-plugin)?|format violations/i.test(text)) {
        return createExplanation(
          "spotless-format",
          "Spotless format violations",
          "Spotless checked the project formatting policy and found files that do not match the configured rules. This is not a Java semantic failure. A file can look visually fine because Spotless may be checking line endings, import order, whitespace, license/header layout, or formatter-specific rules.",
          [
            "Inspect the full Maven output to see the affected files and the formatter context that Spotless reported.",
            "The usual project-approved repair is mvn spotless:apply, which rewrites files according to the Spotless configuration; review the diff afterward before committing.",
            "If the formatter result looks wrong, inspect the Spotless configuration in pom.xml or the parent POM rather than editing files blindly."
          ],
          ["Maven Spotless spotless:check format violations mvn spotless:apply", pluginCoordinate(text)]
        );
      }

      if (/maven-default-http-blocker|Blocked mirror for repositories|repositories?\s+.+?\s+uses?\s+HTTP/i.test(text)) {
        return createExplanation(
          "http-blocker",
          "Maven HTTP repository blocked",
          "Maven refused to use a plain HTTP repository. Modern Maven blocks insecure HTTP repositories by default because dependency downloads should use HTTPS or an explicitly trusted internal mirror.",
          [
            "Find the repository or mirror URL mentioned in the Maven output, pom.xml, parent POM, or settings.xml.",
            "Change the repository to HTTPS when the remote server supports it.",
            "If this is an internal repository, configure a deliberate company-approved mirror rather than disabling Maven's blocker casually."
          ],
          ["Maven maven-default-http-blocker blocked mirror HTTP repository", stripped]
        );
      }

      if (/goal\s+requires\s+a\s+project|MissingProjectException|The goal you specified requires a project/i.test(text)) {
        return createExplanation(
          "missing-project",
          "Maven command is not running from a project",
          "Maven could not find a pom.xml for a command that requires a project. This usually means the command was launched from the wrong working directory or the selected project descriptor is not the intended module POM.",
          [
            "Run the command from the directory that contains the relevant pom.xml.",
            "In MD-Editor, check the rebuild dialog's Project descriptor field before running Maven again.",
            "If this is a multi-module project, decide whether the command should run from the module POM or the reactor root POM."
          ],
          ["Maven goal requires a project MissingProjectException pom.xml"]
        );
      }
      if (/could\s+not\s+resolve\s+dependencies|could\s+not\s+resolve\s+\d+\s+artifacts?|DependencyResolutionException|cached\s+the\s+failed\s+lookup|updates\s+are\s+forced/i.test(text)) {
        return createExplanation(
          "dependency-resolution",
          "Maven dependency resolution failure",
          "Maven could not resolve one or more artifacts required by the project, a plugin, or a module in the current reactor. A cached failed lookup means Maven previously tried a repository and will not retry it until its update interval expires unless you run with -U.",
          [
            "Retry once with forced updates (-U) if the repository or network may have recovered.",
            "Check whether the missing artifact is supposed to be built by another local module; if so, build from the reactor root or with the needed modules included.",
            "Inspect repositories, profiles, mirrors, and settings.xml if Maven is looking in the wrong repository."
          ],
          ["Maven could not resolve dependencies cached failed lookup -U", stripped]
        );
      }

      if (/org\.apache\.rat:apache-rat-plugin|Files?\s+with\s+unapproved\s+licenses?/i.test(text)) {
        return createExplanation(
          "apache-rat",
          "Apache RAT license audit finding",
          "Apache RAT found files whose license headers or approved-license matchers do not satisfy the project's configured license policy. This is a compliance/audit finding, not proof that a file is legally unusable.",
          [
            "Open Apache RAT License Audit to inspect the file, configuration, and provenance.",
            "Choose between adding a legitimate header, excluding generated/third-party files, documenting third-party provenance, or updating RAT policy.",
            "Use -Drat.skip=true only as a temporary audit bypass, not as the real license fix."
          ],
          ["Apache RAT unapproved licenses Maven", "apache-rat-plugin"]
        );
      }

      if (/duplicate-finder-maven-plugin|Duplicate classes|Found duplicate|duplicate resources?/i.test(text)) {
        return createExplanation(
          "duplicate-finder",
          "Duplicate class or resource detected",
          "The Duplicate Finder Maven plugin found the same class or resource in more than one dependency. This can cause unpredictable runtime behavior because Java may load whichever duplicate appears first on the classpath.",
          [
            "Inspect the plugin output to identify the duplicated class or resource and the dependencies that provide it.",
            "Prefer excluding one duplicate dependency or aligning dependency versions when the duplicate is real.",
            "Use plugin exceptions only for harmless duplicates such as expected metadata files, and document why the exception is safe."
          ],
          ["Maven duplicate-finder-maven-plugin duplicate classes resources", stripped]
        );
      }
      if (/maven-checkstyle-plugin|checkstyle|Checkstyle/i.test(text)) {
        return createExplanation(
          "checkstyle",
          "Checkstyle rule violation",
          "The Maven Checkstyle plugin found code style or source-layout violations according to the project's configured Checkstyle rules. This usually requires editing the source or updating the Checkstyle configuration when the rule is intentionally different.",
          [
            "Open the report or the listed source file to identify the exact rule violation.",
            "Fix the source according to the project style guide.",
            "Only change Checkstyle configuration when the project policy itself is wrong."
          ],
          ["Maven Checkstyle violation", pluginCoordinate(text), stripped]
        );
      }

      if (/maven-enforcer-plugin|\[ENFORCER\]|EnforcerRuleException|Rule\s+\d+\s+:/i.test(text)) {
        return createExplanation(
          "enforcer-rule",
          "Maven Enforcer rule failed",
          "The Maven Enforcer plugin stopped the build because the current environment or dependency graph violates a mandatory project rule. Common examples include the wrong Java version, banned dependencies, OS restrictions, or required Maven versions.",
          [
            "Look for the Enforcer rule name in the Maven output; that rule explains the actual policy that failed.",
            "Fix the environment or dependency version when the rule is intentional.",
            "Use -Denforcer.skip=true only as a temporary local bypass when you understand the policy impact."
          ],
          ["Maven Enforcer rule failed enforcer.skip", pluginCoordinate(text), stripped]
        );
      }
      if (/maven-surefire-plugin|maven-failsafe-plugin|There are test failures|test failures/i.test(text)) {
        return createExplanation(
          "test-failure",
          "Maven test failure",
          "A Maven test plugin reported failing tests. The build failed because test execution did not pass, not because Maven could not compile the project.",
          [
            "Open the Surefire/Failsafe report under target to see the failing test and stack trace.",
            "Run the specific failing test if the project supports that workflow.",
            "Use skip-test options only when you intentionally want to bypass test execution for this invocation."
          ],
          ["Maven Surefire test failures", pluginCoordinate(text), stripped]
        );
      }

      if (/sun\.misc\.Unsafe\s+is\s+internal\s+proprietary\s+API|internal\s+proprietary\s+API\s+and\s+may\s+be\s+removed/i.test(text)) {
        return createExplanation(
          "jdk-internal-api-warning",
          "JDK internal API warning",
          "The Java compiler found code that uses a JDK-internal API such as sun.misc.Unsafe. These APIs are not part of the supported Java SE contract, so they can change, become restricted, or be removed when the project moves to another JDK version.",
          [
            "Upgrade code to supported APIs where the JDK or a maintained library provides an official replacement.",
            "If the project intentionally uses sun.misc.Unsafe for low-level performance or memory access, confirm that the owning module documents the compatibility risk.",
            "Treat suppressing this warning as noise reduction only; it does not make the API supported or future-proof."
          ],
          ["Java sun.misc.Unsafe internal proprietary API supported replacement", stripped]
        );
      }

      if (/jacoco-maven-plugin|JaCoCo|coverage\s+(?:check|ratio|threshold|minimum)|Coverage checks have not been met/i.test(text)) {
        return createExplanation(
          "jacoco-coverage",
          "JaCoCo coverage threshold failed",
          "The JaCoCo Maven plugin measured test coverage and found it below the project's configured threshold. The code may compile and tests may pass, but the build policy requires more coverage or a different threshold.",
          [
            "Open the JaCoCo report under target/site/jacoco when available to see uncovered packages, classes, and branches.",
            "Add or improve tests for the uncovered behavior that matters.",
            "Only change the configured minimum threshold when the project policy intentionally changed."
          ],
          ["Maven JaCoCo coverage threshold failed jacoco-maven-plugin", stripped]
        );
      }
      if (/maven-compiler-plugin|Compilation failure|COMPILATION ERROR/i.test(text)) {
        return createExplanation(
          "compilation",
          "Maven compilation failure",
          "The Maven compiler phase failed while compiling Java sources. This is usually a real source, classpath, generated-source, or Java-version problem.",
          [
            "Open the first source location reported by Maven and inspect the compiler message.",
            "Check whether generated sources, annotation processors, or module dependencies are missing.",
            "Verify the project Java version if the message mentions source, target, release, or unsupported class file versions."
          ],
          ["Maven compiler compilation failure", pluginCoordinate(text), stripped]
        );
      }

      if (/maven-shade-plugin|shade(?:-plugin)?|overlapping|duplicate entry|META-INF\/services|Unable to shade/i.test(text)) {
        return createExplanation(
          "shade-collision",
          "Maven Shade packaging collision",
          "The Maven Shade plugin failed while building an aggregated or fat JAR. This often happens when multiple dependencies contribute the same resource path, service descriptor, or class entry and the project has not told Shade how to merge or filter them.",
          [
            "Inspect the exact overlapping resource or class named in the Maven output.",
            "For service descriptors, configure an appropriate Shade transformer such as a services or appending transformer.",
            "For duplicate classes, resolve the dependency conflict instead of blindly excluding files from the final artifact."
          ],
          ["Maven Shade plugin overlapping resource duplicate entry transformer", pluginCoordinate(text), stripped]
        );
      }

      if (/maven-deploy-plugin|Failed to deploy artifacts|Return code is: 401|Return code is: 403|repository element was not specified|cannot be updated|already exists in the repository/i.test(text)) {
        return createExplanation(
          "deploy-failure",
          "Maven deploy failed",
          "The Maven Deploy plugin could not publish artifacts to the configured repository. Common causes are missing credentials, a server id mismatch in settings.xml, insufficient permissions, or trying to redeploy an immutable release version.",
          [
            "Check the repository id in distributionManagement and match it with the server id in ~/.m2/settings.xml.",
            "Verify credentials and publishing permissions for the target repository.",
            "If the version is a fixed release that already exists, publish a new version instead of overwriting it."
          ],
          ["Maven deploy plugin failed credentials server id immutable release", pluginCoordinate(text), stripped]
        );
      }
      if (/Failed to execute goal/i.test(text)) {
        return createExplanation(
          "plugin-goal",
          "Maven plugin goal failure",
          "A Maven plugin goal failed during the build. The plugin, not JDT, owns the meaning of this error, so the useful fix depends on the specific plugin goal and the lines Maven printed above it.",
          [
            "Look at the plugin name and goal in the message, then inspect the full Maven output immediately above the failure.",
            "Use effective-POM inspection when the plugin came from a parent POM, profile, or pluginManagement.",
            "Search for the plugin goal and the stable part of the error text if the local explanation is not specific enough."
          ],
          ["Maven Failed to execute goal", pluginCoordinate(text), stripped]
        );
      }

      return createExplanation(
        "generic-maven",
        "Maven build problem",
        "This problem came from Maven build output. Maven problems can be caused by plugins, profiles, dependency resolution, repositories, tests, formatting, license checks, or generated build configuration.",
        [
          "Inspect the full Maven output around the first ERROR line.",
          "Run effective-POM inspection when profiles or parent configuration may be involved.",
          "Search the stable error text without local paths or project-specific file names."
        ],
        ["Maven build error", stripped]
      );
    }

    const api = { explain, stripWorkspaceSpecificDetails };
    app.registerModule?.("mavenProblemExplainer", api);
    return api;
  }

  global.registerMarkdownViewerMavenProblemExplainer = registerMarkdownViewerMavenProblemExplainer;
})(typeof window !== "undefined" ? window : globalThis);
