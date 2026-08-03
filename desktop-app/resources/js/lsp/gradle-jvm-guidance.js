(function(global) {
  "use strict";

  /** Read explicit project declarations that identify a safe Gradle/IDE JVM recommendation. */
  function registerMarkdownViewerGradleJvmGuidance(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    async function readOptional(path) {
      try { return await Neutralino?.filesystem?.readFile?.(path) || ""; }
      catch (_error) { return ""; }
    }

    function parseJavaFeature(value) {
      const match = String(value || "").match(/(?:JavaSE-|^\s*java\s*=\s*|^\s*)(\d{1,2})(?:\D|$)/im);
      const feature = Number(match?.[1]);
      return Number.isInteger(feature) && feature >= 8 ? feature : null;
    }

    /** Detect an explicit project JVM recommendation without inferring from source compatibility. */
    async function detect(workspaceRoot) {
      const root = normalizePath(workspaceRoot);
      if (!root) return null;
      const rootBuild = `${await readOptional(`${root}/build.gradle`)}\n${await readOptional(`${root}/build.gradle.kts`)}`;
      const ideScriptReferenced = /(?:gradle[\\/]ide\.gradle|ide\.gradle)/i.test(rootBuild);
      if (ideScriptReferenced) {
        const ideScript = `${await readOptional(`${root}/gradle/ide.gradle`)}\n${await readOptional(`${root}/gradle/ide.gradle.kts`)}`;
        const ideFeature = parseJavaFeature(ideScript.match(/javaRuntimeName\s*=\s*["']JavaSE-\d+["']/i)?.[0]);
        if (ideFeature) return { feature: ideFeature, source: "gradle/ide.gradle", kind: "ide-runtime" };
      }

      const javaVersion = await readOptional(`${root}/.java-version`);
      const javaVersionFeature = parseJavaFeature(javaVersion);
      if (javaVersionFeature) return { feature: javaVersionFeature, source: ".java-version", kind: "project-runtime" };

      const sdkman = await readOptional(`${root}/.sdkmanrc`);
      const sdkmanFeature = parseJavaFeature(sdkman.match(/^\s*java\s*=\s*(.+)$/im)?.[0]);
      if (sdkmanFeature) return { feature: sdkmanFeature, source: ".sdkmanrc", kind: "project-runtime" };
      return null;
    }

    /** Build conservative remediation text from the selected JVM and explicit project evidence. */
    function createRemediation(failure, projectJdk, guidance) {
      const selectedFeature = Number(projectJdk?.feature) || null;
      const recommendedFeature = Number(guidance?.feature) || null;
      if ((failure?.code === "jdk-incompatible" || failure?.rejectedJavaFeature) && recommendedFeature && recommendedFeature !== selectedFeature) {
        const declaration = guidance.kind === "ide-runtime" ? "for IDE imports" : "as its project runtime";
        return `The selected Gradle JVM is Java ${selectedFeature || "unknown"}, but this project declares Java ${recommendedFeature} ${declaration} in ${guidance.source}. Select a Java ${recommendedFeature} Project JDK in Java Build Path, then retry project analysis.`;
      }
      if (failure?.code === "jdk-incompatible" || failure?.rejectedJavaFeature) {
        return `The selected Gradle JVM${selectedFeature ? ` (Java ${selectedFeature})` : ""} is incompatible with this Gradle import. Select a compatible Project JDK in Java Build Path, then retry project analysis.`;
      }
      return "Fix the Gradle project import or tooling error, then retry Java project analysis.";
    }

    const api = { createRemediation, detect, parseJavaFeature };
    app?.registerModule?.("gradleJvmGuidance", api);
    return api;
  }

  global.registerMarkdownViewerGradleJvmGuidance = registerMarkdownViewerGradleJvmGuidance;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerGradleJvmGuidance };
})(typeof window !== "undefined" ? window : globalThis);
