(function(global) {
  "use strict";

  /** Own the Project Clean selection dialog. */
  function registerMarkdownViewerJavaCleanDialog(app) {
    const modal = document.getElementById("java-clean-modal");
    const standardPanel = document.getElementById("java-clean-standard-panel");
    const mavenPanel = document.getElementById("java-clean-maven-panel");
    const gradlePanel = document.getElementById("java-clean-gradle-panel");
    const sourceList = document.getElementById("java-clean-source-list");
    const mavenPom = document.getElementById("java-clean-maven-pom");
    const mavenRunner = document.getElementById("java-clean-maven-runner");
    const gradleDescriptor = document.getElementById("java-clean-gradle-descriptor");
    const gradleVersion = document.getElementById("java-clean-gradle-version");
    const gradleHome = document.getElementById("java-clean-gradle-home");
    const gradleRunner = document.getElementById("java-clean-gradle-runner");
    const buildAfterClean = document.getElementById("java-clean-build-after");
    const cleanButton = document.getElementById("java-clean-confirm");
    const cancelButton = document.getElementById("java-clean-cancel");
    const errorElement = document.getElementById("java-clean-error");

    function setError(message) {
      if (!errorElement) return;
      errorElement.textContent = message || "";
      errorElement.hidden = !message;
    }

    function renderSourceEntries(entries) {
      sourceList.textContent = "";
      for (const entry of entries) {
        const label = document.createElement("label");
        label.className = "java-rebuild-check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.dataset.sourcePath = entry.path;
        const text = document.createElement("span");
        text.textContent = entry.label;
        label.append(input, text);
        sourceList.appendChild(label);
      }
      sourceList.onchange = () => {
        cleanButton.disabled = !sourceList.querySelector("input[data-source-path]:checked");
      };

    }

    /** Show clean choices for one configured Java build system. */
    function openDialog(model) {
      if (!modal) throw new Error("The Java Clean dialog is unavailable.");
      const isMaven = model.mode === "maven";
      const isGradle = model.mode === "gradle";
      standardPanel.hidden = isMaven || isGradle;
      mavenPanel.hidden = !isMaven;
      if (gradlePanel) gradlePanel.hidden = !isGradle;
      buildAfterClean.checked = false;
      setError("");
      if (isMaven) {
        mavenPom.value = model.mavenProject?.pomLabel || "pom.xml";
        mavenRunner.value = model.mavenProject?.runner || "mvn";
        cleanButton.disabled = model.mavenProject?.hasPom !== true;
        if (cleanButton.disabled) setError("The configured Maven project does not have a usable pom.xml.");
      } else if (isGradle) {
        gradleDescriptor.value = model.gradleProject?.descriptorLabel || "build.gradle";
        gradleVersion.value = model.gradleProject?.gradleInstallation?.version || "Unavailable";
        gradleHome.value = model.gradleProject?.gradleInstallation?.path || "Unavailable";
        gradleRunner.value = model.gradleProject?.runner || model.gradleProject?.runnerError || "Unavailable";
        cleanButton.disabled = model.gradleProject?.hasGradleProject !== true || Boolean(model.gradleProject?.runnerError);
        if (cleanButton.disabled) setError(model.gradleProject?.runnerError || "The configured Gradle project does not have a usable settings or build file.");
      } else {
        renderSourceEntries(model.sourceEntries || []);
        cleanButton.disabled = !(model.sourceEntries || []).length;
        if (cleanButton.disabled) setError("Configure at least one Java source folder before cleaning.");
      }
      modal.style.display = "flex";
      return new Promise((resolve) => {
        const finish = (value) => {
          modal.style.display = "none";
          cleanButton.onclick = null;
          cancelButton.onclick = null;
          resolve(value);
        };
        cleanButton.onclick = () => finish({
          mode: isMaven ? "maven" : (isGradle ? "gradle" : "javac"),
          sourceFolders: Array.from(sourceList.querySelectorAll("input[data-source-path]:checked"))
            .map((input) => input.dataset.sourcePath),
          modules: isMaven ? [{ id: ".", path: model.mavenProject?.projectRoot || model.projectPath }] : [],
          buildAfterClean: buildAfterClean.checked
        });
        cancelButton.onclick = () => finish(null);
        modal.onclick = (event) => { if (event.target === modal) finish(null); };
      });
    }

    const api = { openDialog };
    app.registerModule?.("javaCleanDialog", api);
    return api;
  }

  global.registerMarkdownViewerJavaCleanDialog = registerMarkdownViewerJavaCleanDialog;
})(typeof window !== "undefined" ? window : globalThis);
