(function(global) {
  global.registerMarkdownViewerRecoveryUpdater = function registerMarkdownViewerRecoveryUpdater(app, deps) {
    const api = {};

    with (deps) {
    const MD_EDITOR_DIR = ".md-editor";
    const RECOVERY_DIR = "recovery";
    const RECOVERY_CONTEXT_FILE = "maven-recovery-context.json";
    const RESOLVED_DEPENDENCY_MANIFEST_FILE = "resolved-runtime-dependencies.json";
    const PROJECT_METADATA_FILE = "_md_editor_project.json";
    const RECOVERY_CONTEXT_TYPE = "md-editor-dependency-recovery-context";
    const JAVA_MAVEN_RECOVERY_KIND = "java-maven";

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function trimSlashes(value) {
      return normalizePath(value).replace(/^\/+/, "").replace(/\/+$/, "");
    }

    function joinLocalPath(folderPath, relativePath) {
      if (typeof joinPath === "function") return joinPath(folderPath, relativePath);
      const left = normalizePath(folderPath).replace(/\/+$/, "");
      const right = normalizePath(relativePath).replace(/^\/+/, "");
      return left ? `${left}/${right}` : right;
    }

    function getParentPath(path) {
      const normalized = normalizePath(path).replace(/\/+$/, "");
      const index = normalized.lastIndexOf("/");
      if (index <= 0) return "";
      return normalized.slice(0, index);
    }

    function getFileName(path) {
      const normalized = normalizePath(path);
      const index = normalized.lastIndexOf("/");
      return index >= 0 ? normalized.slice(index + 1) : normalized;
    }

    function htmlEscape(value) {
      if (typeof deps?.escapeHtml === "function") return deps.escapeHtml(value);
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function uniqueSorted(values) {
      return Array.from(new Set((values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
    }

    function pathExists(path) {
      if (!path || !Neutralino?.filesystem?.getStats) return Promise.resolve(false);
      return Neutralino.filesystem.getStats(path)
        .then(() => true)
        .catch(() => false);
    }

    async function ensureDirectory(path) {
      const normalized = normalizePath(path);
      if (!normalized || !Neutralino?.filesystem?.createDirectory) return;
      if (await pathExists(normalized)) return;
      const parent = getParentPath(normalized);
      if (parent && parent !== normalized) await ensureDirectory(parent);
      try {
        await Neutralino.filesystem.createDirectory(normalized);
      } catch (error) {
        const message = String(error?.message || error || "").toLowerCase();
        if (!message.includes("exist") && !message.includes("already")) throw error;
      }
    }

    function getProjectMetadataPath(projectRootPath) {
      return joinLocalPath(joinLocalPath(projectRootPath, MD_EDITOR_DIR), PROJECT_METADATA_FILE);
    }

    function getRecoveryContextPath(projectRootPath) {
      return joinLocalPath(joinLocalPath(joinLocalPath(projectRootPath, MD_EDITOR_DIR), RECOVERY_DIR), RECOVERY_CONTEXT_FILE);
    }

    async function findGeneratedProjectRootFromSeed(seedPath) {
      const seed = normalizePath(seedPath);
      if (!seed) return "";
      if (typeof findGeneratedProjectFolderFromPath === "function") {
        const found = await findGeneratedProjectFolderFromPath(seed);
        if (found) return normalizePath(found);
      }
      let folder = seed;
      const seen = new Set();
      while (folder && !seen.has(folder)) {
        seen.add(folder);
        if (await pathExists(getProjectMetadataPath(folder))) return folder;
        const parent = getParentPath(folder);
        if (!parent || parent === folder) break;
        folder = parent;
      }
      return "";
    }

    function normalizeContext(rawContext) {
      if (!rawContext || typeof rawContext !== "object") return null;
      return {
        ...rawContext,
        generatedProjectRootPath: normalizePath(rawContext.generatedProjectRootPath),
        sourceRootPath: normalizePath(rawContext.sourceRootPath),
        batchPath: normalizePath(rawContext.batchPath),
        resolvedDependencyTreePath: normalizePath(rawContext.resolvedDependencyTreePath),
        targetJarRelativeFolder: trimSlashes(rawContext.targetJarRelativeFolder || "lib/external"),
        mappedDependencies: Array.isArray(rawContext.mappedDependencies) ? rawContext.mappedDependencies : [],
        unmappedPackages: uniqueSorted(rawContext.unmappedPackages)
      };
    }

    async function readRecoveryContext(projectRootPath) {
      const root = normalizePath(projectRootPath);
      const contextPath = getRecoveryContextPath(root);
      if (!root || !Neutralino?.filesystem?.readFile) {
        return { status: "noop", reason: "desktop-only", projectRootPath: root, contextPath, context: null };
      }
      try {
        const raw = await Neutralino.filesystem.readFile(contextPath);
        return { status: "loaded", projectRootPath: root, contextPath, context: normalizeContext(JSON.parse(raw || "{}")) };
      } catch (_error) {
        return { status: "noop", reason: "missing-context", projectRootPath: root, contextPath, context: null };
      }
    }

    function isPendingJavaMavenContext(context) {
      return context?.type === RECOVERY_CONTEXT_TYPE
        && context?.status === "pending"
        && context?.recoveryKind === JAVA_MAVEN_RECOVERY_KIND;
    }

    function getJarSourcePath(context, dependency) {
      return joinLocalPath(context.sourceRootPath, dependency.expectedJarRelativePath || "");
    }

    function getJarMarkdownRelativePath(dependency) {
      return dependency.expectedJarRelativePath || "";
    }

    function getJarMarkdownPath(context, dependency) {
      return joinLocalPath(context.generatedProjectRootPath, getJarMarkdownRelativePath(dependency) + ".md");
    }

    function getResolvedDependencyManifestPath(context) {
      return joinLocalPath(joinLocalPath(joinLocalPath(
        context.generatedProjectRootPath,
        MD_EDITOR_DIR
      ), RECOVERY_DIR), RESOLVED_DEPENDENCY_MANIFEST_FILE);
    }

    function createLegacyResolvedDependencies(context) {
      return (context.mappedDependencies || []).map((dependency) => ({
        ...dependency,
        artifactKey: dependency.artifactKey || `${dependency.coordinateKey || ""}:jar:`,
        runtimeDependencyArtifactKeys: []
      }));
    }

    async function loadResolvedDependencies(context) {
      const runtimeTree = deps?.mavenRuntimeTree || globalThis.MdEditorMavenRuntimeTree;
      if (Number(context.schemaVersion || 1) < 2
          || !context.resolvedDependencyTreePath
          || typeof runtimeTree?.normalizeMavenRuntimeTree !== "function") {
        return { dependencies: createLegacyResolvedDependencies(context), edges: [], source: "legacy-context" };
      }
      try {
        const rawTree = await Neutralino.filesystem.readFile(context.resolvedDependencyTreePath);
        const normalized = runtimeTree.normalizeMavenRuntimeTree(JSON.parse(rawTree || "{}"), {
          targetJarRelativeFolder: context.targetJarRelativeFolder
        });
        const mappedByCoordinate = new Map((context.mappedDependencies || [])
          .map((dependency) => [dependency.coordinateKey, dependency]));
        const childKeysByParent = new Map();
        normalized.edges.forEach((edge) => {
          if (!childKeysByParent.has(edge.fromArtifactKey)) childKeysByParent.set(edge.fromArtifactKey, []);
          childKeysByParent.get(edge.fromArtifactKey).push(edge.toArtifactKey);
        });
        const dependencies = normalized.artifacts.map((artifact) => ({
          ...artifact,
          ...(mappedByCoordinate.get(artifact.coordinateKey) || {}),
          artifactKey: artifact.artifactKey,
          expectedJarFileName: artifact.expectedJarFileName,
          expectedJarRelativePath: artifact.expectedJarRelativePath,
          runtimeDependencyArtifactKeys: uniqueSorted(childKeysByParent.get(artifact.artifactKey))
        }));
        return { dependencies, edges: normalized.edges, source: "maven-runtime-tree" };
      } catch (_error) {
        return { dependencies: createLegacyResolvedDependencies(context), edges: [], source: "legacy-context" };
      }
    }

    function getRelativePathBetweenFiles(fromFilePath, toFilePath) {
      const fromParts = normalizePath(getParentPath(fromFilePath)).split("/").filter(Boolean);
      const toParts = normalizePath(toFilePath).split("/").filter(Boolean);
      while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
        fromParts.shift();
        toParts.shift();
      }
      const up = new Array(fromParts.length).fill("..");
      return [...up, ...toParts].join("/") || getFileName(toFilePath);
    }

    function escapeYamlString(value) {
      return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function createJarMarkdownContent(context, dependency, jarSourcePath, affectedMarkdownFiles, runtimeDependencyLinks = []) {
      const jarFileName = dependency.expectedJarFileName || getFileName(jarSourcePath);
      const entityId = `lib.${trimSlashes(dependency.expectedJarRelativePath).replace(/[^\w.-]+/g, ".")}`;
      const usedBy = uniqueSorted(affectedMarkdownFiles).map((filePath) => `- ${filePath}`).join("\n") || "- None recorded";
      const packages = uniqueSorted(dependency.resolvedPackages).map((packageName) => `- ${packageName}`).join("\n") || "- None recorded";
      const runtimeDependencies = runtimeDependencyLinks.join("\n") || "None.";
      return [
        "---",
        "entity_type: external_dependency",
        `entity_id: ${entityId}`,
        "dependency_kind: jar",
        "language: java",
        "conversion_status: not_started",
        "shared: false",
        dependency.coordinateKey ? `maven_coordinate: "${escapeYamlString(dependency.coordinateKey)}"` : "",
        dependency.scope ? `dependency_scope: ${dependency.scope}` : "",
        `dependency_resolution: ${dependency.direct === false ? "transitive" : "direct"}`,
        `source_file: "${escapeYamlString(jarSourcePath)}"`,
        'source_hash: ""',
        "tags:",
        "  - external-dependency",
        "---",
        "",
        `# ${jarFileName}`,
        "",
        "Type: External JAR",
        "",
        `Source file: \`${jarSourcePath}\``,
        "",
        "## Used By",
        "",
        usedBy,
        "",
        "## Resolved Packages",
        "",
        packages,
        "",
        "## Runtime Dependencies",
        "",
        runtimeDependencies,
        ""
      ].join("\n");
    }

    function upsertRuntimeDependenciesSection(content, runtimeDependencyLinks) {
      const body = runtimeDependencyLinks.join("\n") || "None.";
      const section = `## Runtime Dependencies\n\n${body}\n`;
      const current = String(content || "");
      if (/^## Runtime Dependencies\s*$/m.test(current)) {
        return current.replace(
          /(^## Runtime Dependencies\s*\n)([\s\S]*?)(?=^##\s+|\s*$)/m,
          `${section}\n`
        );
      }
      const separator = current.endsWith("\n") ? "\n" : "\n\n";
      return `${current}${separator}${section}`;
    }

    function normalizeSymbolPattern(value) {
      return String(value || "").trim().replace(/\.\*$/, "").replace(/\.$/, "");
    }

    function symbolMatchesResolvedDependency(symbol, packages, symbols) {
      const value = String(symbol || "").trim();
      const normalizedValue = normalizeSymbolPattern(value);
      if (!normalizedValue) return false;
      if ((symbols || []).some((resolvedSymbol) => normalizedValue === normalizeSymbolPattern(resolvedSymbol))) {
        return true;
      }
      return (packages || []).some((packageName) => {
        const normalizedPackage = normalizeSymbolPattern(packageName);
        return normalizedPackage && (normalizedValue === normalizedPackage || normalizedValue.startsWith(normalizedPackage + "."));
      });
    }

    function removeResolvedUnresolvedDependencyLines(content, resolvedPackages, resolvedSymbols = []) {
      let removed = 0;
      const nextContent = String(content || "").replace(
        /(^## Unresolved Dependencies\s*\n)([\s\S]*?)(?=^##\s+|\s*$)/gm,
        (match, heading, body) => {
          const lines = String(body || "").split(/\r?\n/);
          const kept = [];
          for (const line of lines) {
            const symbol = line.match(/^\s*-\s+`([^`]+)`/)?.[1] || "";
            if (symbol && symbolMatchesResolvedDependency(symbol, resolvedPackages, resolvedSymbols)) {
              removed += 1;
              continue;
            }
            kept.push(line);
          }
          const meaningful = kept.filter((line) => line.trim()).length;
          if (!meaningful) return "";
          return heading + kept.join("\n").replace(/\n*$/, "\n\n");
        }
      );
      return { content: nextContent, removed };
    }

    function addExternalDependencyLink(content, markdownPath, jarMarkdownPath, dependency) {
      const jarName = dependency.expectedJarFileName || getFileName(jarMarkdownPath).replace(/\.md$/i, "");
      const relativeJarPath = getRelativePathBetweenFiles(markdownPath, jarMarkdownPath);
      const linkLine = `- [${jarName}](${relativeJarPath})`;
      const current = String(content || "");
      if (current.includes(`](${relativeJarPath})`) || current.includes(linkLine)) {
        return { content: current, added: false };
      }
      if (/^## External Dependencies\s*$/m.test(current)) {
        return {
          content: current.replace(/(^## External Dependencies\s*\n)([\s\S]*?)(?=^##\s+|\s*$)/m, (match, heading, body) => {
            const normalizedBody = String(body || "").replace(/\n*$/, "\n");
            return `${heading}${normalizedBody}${linkLine}\n\n`;
          }),
          added: true
        };
      }
      const separator = current.endsWith("\n") ? "\n" : "\n\n";
      return {
        content: `${current}${separator}## External Dependencies\n\n${linkLine}\n`,
        added: true
      };
    }

    async function applyDependencyToMarkdownFile(context, dependency, markdownRelativePath, jarMarkdownPath) {
      const markdownPath = joinLocalPath(context.generatedProjectRootPath, markdownRelativePath);
      if (!await pathExists(markdownPath)) {
        return { path: markdownPath, updated: false, missing: true, removed: 0, added: 0 };
      }
      const original = await Neutralino.filesystem.readFile(markdownPath);
      const removedResult = removeResolvedUnresolvedDependencyLines(
        original,
        dependency.resolvedPackages || [],
        dependency.resolvedSymbols || []
      );
      const linkResult = addExternalDependencyLink(removedResult.content, markdownPath, jarMarkdownPath, dependency);
      const changed = linkResult.content !== original;
      if (changed) {
        await Neutralino.filesystem.writeFile(markdownPath, linkResult.content);
      }
      return {
        path: markdownPath,
        relativePath: markdownRelativePath,
        updated: changed,
        missing: false,
        removed: removedResult.removed,
        added: linkResult.added ? 1 : 0
      };
    }

    function createEmptyResult(projectRootPath, contextPath) {
      return {
        status: "noop",
        projectRootPath: normalizePath(projectRootPath),
        contextPath: normalizePath(contextPath),
        batchPath: "",
        counts: {
          jarsExpected: 0,
          jarsFound: 0,
          jarsMissing: 0,
          jarMarkdownCreated: 0,
          jarMarkdownExisting: 0,
          markdownFilesUpdated: 0,
          missingDependencyReferencesRemoved: 0,
          dependencyLinksAdded: 0,
          blockedDependencies: 0,
          unmappedPackages: 0
        },
        blockedJars: [],
        createdJarMarkdownFiles: [],
        reusedJarMarkdownFiles: [],
        updatedMarkdownFiles: [],
        missingMarkdownFiles: [],
        unmappedPackages: []
      };
    }

    async function applyPendingRecoveryProjectUpdate(projectRootPath, options = {}) {
      const loaded = await readRecoveryContext(projectRootPath);
      const result = createEmptyResult(loaded.projectRootPath, loaded.contextPath);
      if (!loaded.context) {
        result.reason = loaded.reason || "missing-context";
        return result;
      }
      const context = loaded.context;
      result.batchPath = context.batchPath || "";
      result.unmappedPackages = uniqueSorted(context.unmappedPackages);
      result.counts.unmappedPackages = result.unmappedPackages.length;
      if (!isPendingJavaMavenContext(context)) {
        result.reason = context.status === "applied" ? "already-applied" : "unsupported-context";
        return result;
      }

      const resolved = await loadResolvedDependencies(context);
      const mappedDependencies = resolved.dependencies;
      const dependenciesByArtifactKey = new Map(mappedDependencies.map((dependency) => [dependency.artifactKey, dependency]));
      const availableArtifactKeys = new Set();
      result.counts.jarsExpected = mappedDependencies.length;
      for (const dependency of mappedDependencies) {
        const jarPath = getJarSourcePath(context, dependency);
        if (!await pathExists(jarPath)) {
          result.counts.jarsMissing += 1;
          result.counts.blockedDependencies += 1;
          result.blockedJars.push({
            coordinateKey: dependency.coordinateKey || "",
            expectedJarFileName: dependency.expectedJarFileName || getFileName(jarPath),
            jarPath
          });
          continue;
        }
        result.counts.jarsFound += 1;
        availableArtifactKeys.add(dependency.artifactKey);
      }

      const manifestPath = getResolvedDependencyManifestPath(context);
      await Neutralino.filesystem.writeFile(manifestPath, JSON.stringify({
        schemaVersion: 1,
        type: "md-editor-resolved-runtime-dependencies",
        generatedAt: new Date().toISOString(),
        source: resolved.source,
        artifacts: mappedDependencies,
        edges: resolved.edges
      }, null, 2) + "\n");
      context.resolvedDependencyManifestPath = manifestPath;

      for (const dependency of mappedDependencies) {
        if (!availableArtifactKeys.has(dependency.artifactKey)) continue;
        const jarPath = getJarSourcePath(context, dependency);
        const jarMarkdownPath = getJarMarkdownPath(context, dependency);
        const runtimeDependencyLinks = uniqueSorted(dependency.runtimeDependencyArtifactKeys)
          .filter((artifactKey) => availableArtifactKeys.has(artifactKey))
          .map((artifactKey) => dependenciesByArtifactKey.get(artifactKey))
          .filter(Boolean)
          .map((childDependency) => {
            const childPath = getJarMarkdownPath(context, childDependency);
            return `- [${childDependency.expectedJarFileName}](${getRelativePathBetweenFiles(jarMarkdownPath, childPath)})`;
          });
        if (await pathExists(jarMarkdownPath)) {
          result.counts.jarMarkdownExisting += 1;
          result.reusedJarMarkdownFiles.push(jarMarkdownPath);
          const currentJarMarkdown = await Neutralino.filesystem.readFile(jarMarkdownPath);
          const updatedJarMarkdown = upsertRuntimeDependenciesSection(currentJarMarkdown, runtimeDependencyLinks);
          if (updatedJarMarkdown !== currentJarMarkdown) {
            await Neutralino.filesystem.writeFile(jarMarkdownPath, updatedJarMarkdown);
          }
        } else {
          await ensureDirectory(getParentPath(jarMarkdownPath));
          await Neutralino.filesystem.writeFile(jarMarkdownPath, createJarMarkdownContent(
            context,
            dependency,
            jarPath,
            dependency.affectedMarkdownFiles || [],
            runtimeDependencyLinks
          ));
          result.counts.jarMarkdownCreated += 1;
          result.createdJarMarkdownFiles.push(jarMarkdownPath);
        }
        for (const markdownRelativePath of uniqueSorted(dependency.affectedMarkdownFiles)) {
          const fileResult = await applyDependencyToMarkdownFile(context, dependency, markdownRelativePath, jarMarkdownPath);
          if (fileResult.missing) {
            result.missingMarkdownFiles.push(fileResult.path);
            continue;
          }
          result.counts.missingDependencyReferencesRemoved += fileResult.removed;
          result.counts.dependencyLinksAdded += fileResult.added;
          if (fileResult.updated) {
            result.counts.markdownFilesUpdated += 1;
            result.updatedMarkdownFiles.push(fileResult.path);
          }
        }
      }

      if (result.counts.jarsFound > 0 && result.counts.jarsMissing > 0) result.status = "partial";
      else if (result.counts.jarsFound > 0) result.status = "applied";
      else result.status = result.counts.jarsMissing > 0 ? "blocked" : "noop";

      const now = new Date().toISOString();
      if (result.status === "applied") {
        context.status = "applied";
        context.appliedAt = now;
      } else if (result.status === "partial" || result.status === "blocked") {
        context.lastAttemptAt = now;
        context.lastAttemptSummary = result.counts;
      }
      if (result.status !== "noop") {
        await Neutralino.filesystem.writeFile(loaded.contextPath, JSON.stringify(context, null, 2) + "\n");
      }
      if (result.status === "applied" || result.status === "partial") {
        await (options.onProjectUpdated || deps?.onProjectUpdated)?.(result);
      }
      return result;
    }

    function openRecoveryUpdaterSummaryModal(result) {
      const existing = document.querySelector(".recovery-updater-modal");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay recovery-updater-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      const counts = result?.counts || {};
      const blockedJars = result?.blockedJars || [];
      const visibleBlockedJars = blockedJars.slice(0, 80);
      const hiddenBlockedJarCount = Math.max(0, blockedJars.length - visibleBlockedJars.length);
      const blockedRows = visibleBlockedJars.map((jar) => `<li><code>${htmlEscape(jar.expectedJarFileName || "")}</code><span>${htmlEscape(jar.jarPath || "")}</span></li>`).join("");
      const title = result?.status === "noop"
        ? "No Pending Project Update"
        : result?.status === "blocked"
          ? "Project Update Blocked"
          : "Project Update Summary";
      const titleIcon = result?.status === "blocked"
        ? '<i class="bi bi-x-circle-fill recovery-updater-title-icon" aria-hidden="true"></i>'
        : "";
      const message = result?.reason === "already-applied"
        ? "The dependency recovery context was already applied."
        : result?.reason === "missing-project"
          ? "No generated Markdown project metadata was found for this folder."
        : result?.reason === "missing-context"
          ? "No pending dependency recovery updates were found."
          : result?.status === "blocked"
            ? "Recovered jars are missing. Run the batch and try Update project again."
            : "Dependency recovery updates were applied to the generated Markdown project.";
      const canOfferFullUpdate = result?.status === "applied" || result?.status === "partial";
      overlay.innerHTML = `
        <div class="reset-modal-box recovery-updater-modal-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Update Project</p>
              <h2 class="recovery-updater-title">${titleIcon}<span>${htmlEscape(title)}</span></h2>
            </div>
            <button class="settings-modal-close recovery-updater-close" type="button" aria-label="Close update project summary">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="maven-recovery-notification-body">
            <p class="recovery-updater-message">${htmlEscape(message)}</p>
            <div class="maven-recovery-summary-grid">
              <div class="maven-recovery-summary-item"><span>Jars expected</span><strong>${Number(counts.jarsExpected || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Jars found</span><strong>${Number(counts.jarsFound || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Jars missing</span><strong>${Number(counts.jarsMissing || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Jar MD created</span><strong>${Number(counts.jarMarkdownCreated || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Jar MD existed</span><strong>${Number(counts.jarMarkdownExisting || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Markdown updated</span><strong>${Number(counts.markdownFilesUpdated || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Missing refs removed</span><strong>${Number(counts.missingDependencyReferencesRemoved || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Jar links added</span><strong>${Number(counts.dependencyLinksAdded || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Blocked dependencies</span><strong>${Number(counts.blockedDependencies || 0).toLocaleString()}</strong></div>
              <div class="maven-recovery-summary-item"><span>Still unmapped</span><strong>${Number(counts.unmappedPackages || 0).toLocaleString()}</strong></div>
            </div>
            ${blockedRows ? `<div class="recovery-updater-blocked"><h3>Blocked jars</h3><ul>${blockedRows}</ul>${hiddenBlockedJarCount ? `<p>${hiddenBlockedJarCount.toLocaleString()} more blocked jars are not shown.</p>` : ""}</div>` : ""}
            ${canOfferFullUpdate ? '<p class="recovery-updater-followup">Do you want to run a full project update from the original source folder?</p>' : ""}
          </div>
          <div class="reset-modal-actions maven-recovery-notification-actions">
            ${result?.batchPath && (result?.status === "blocked" || result?.status === "partial") ? '<button class="reset-modal-btn recovery-updater-run-batch primary-action-button" type="button">Run batch</button>' : ""}
            ${result?.batchPath && (result?.status === "blocked" || result?.status === "partial") ? '<button class="reset-modal-btn recovery-updater-open-batch" type="button">Open recovery folder</button>' : ""}
            ${canOfferFullUpdate ? '<button class="reset-modal-btn" type="button" disabled aria-disabled="true">Full update</button>' : ""}
            <button class="reset-modal-btn recovery-updater-close" type="button">${canOfferFullUpdate ? "Not yet" : "Close"}</button>
          </div>
        </div>
      `;
      const closeModal = () => overlay.remove();
      overlay.querySelectorAll(".recovery-updater-close").forEach((button) => button.addEventListener("click", closeModal));
      overlay.querySelector(".recovery-updater-run-batch")?.addEventListener("click", async () => {
        await runRecoveryBatch?.(result.batchPath);
      });
      overlay.querySelector(".recovery-updater-open-batch")?.addEventListener("click", async () => {
        const folder = getParentPath(result.batchPath || "");
        if (folder && Neutralino?.os?.open) await Neutralino.os.open(folder);
      });
      document.body.appendChild(overlay);
      overlay.querySelector(".recovery-updater-close")?.focus();
      return overlay;
    }

    function openRecoveryUpdaterProgressModal() {
      const existing = document.querySelector(".recovery-updater-progress-modal");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay recovery-updater-progress-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div class="reset-modal-box recovery-updater-modal-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Update Project</p>
              <h2 class="recovery-updater-progress-title">
                <span class="recovery-updater-spinner" aria-hidden="true"></span>
                <span>Applying Recovery Context</span>
              </h2>
            </div>
          </div>
          <div class="maven-recovery-notification-body">
            <div class="recovery-updater-progress-bar" aria-hidden="true"></div>
            <ul class="recovery-updater-progress-list">
              <li>Checking recovery context</li>
              <li>Verifying recovered jars</li>
              <li>Creating jar representations</li>
              <li>Updating affected Markdown files</li>
              <li>Writing summary</li>
            </ul>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      return overlay;
    }

    async function runProjectUpdateFromSeed(seedPath, options = {}) {
      const progressModal = openRecoveryUpdaterProgressModal();
      try {
        const projectRootPath = await findGeneratedProjectRootFromSeed(seedPath);
        if (!projectRootPath) {
          const result = createEmptyResult(seedPath, "");
          result.reason = "missing-project";
          openRecoveryUpdaterSummaryModal(result);
          return result;
        }
        const result = await applyPendingRecoveryProjectUpdate(projectRootPath, options);
        openRecoveryUpdaterSummaryModal(result);
        return result;
      } finally {
        progressModal.remove();
      }
    }

    Object.assign(api, {
      RECOVERY_CONTEXT_FILE,
      applyPendingRecoveryProjectUpdate,
      findGeneratedProjectRootFromSeed,
      getJarMarkdownPath,
      getJarMarkdownRelativePath,
      readRecoveryContext,
      removeResolvedUnresolvedDependencyLines,
      addExternalDependencyLink,
      openRecoveryUpdaterSummaryModal,
      runProjectUpdateFromSeed
    });
    }

    app.registerModule?.("recoveryUpdater", api);
    return api;
  };
})(window);
