(function(global) {
  global.registerMarkdownViewerGraphHealth = function registerMarkdownViewerGraphHealth(app, deps) {
    const api = {};

    with (deps) {
    const MAX_INITIAL_USAGE_ROWS = 100;
    const HEALTH_USAGE_MODE_MARKDOWN = "markdown";
    const HEALTH_USAGE_MODE_ORIGINAL = "original";
    const MD_EDITOR_DIR = ".md-editor";
    const PROJECT_METADATA_FILE = "_md_editor_project.json";
    const healthReportViewCache = new Map();

    function getEndpointId(endpoint) {
      return endpoint?.id || endpoint || "";
    }

    function getMissingDependencyLabel(node) {
      const qualifiedName = String(node?.qualifiedName || node?.label || node?.id || "").trim();
      if (qualifiedName) return qualifiedName;
      return "Missing dependency";
    }

    function getMissingDependencyKind(node) {
      const kind = String(node?.missingKind || "unknown").trim() || "unknown";
      const modifiers = [];
      if (node?.staticImport === true) modifiers.push("static");
      if (node?.wildcard === true) modifiers.push("wildcard");
      return [kind, ...modifiers].join(", ");
    }

    function findUsageDetails(snapshotFile, dependencyNode) {
      const dependencies = Array.isArray(snapshotFile?.unresolvedDependencies) ? snapshotFile.unresolvedDependencies : [];
      const qualifiedName = String(dependencyNode?.qualifiedName || "").trim();
      return dependencies.filter((dependency) => String(dependency?.symbol || "").trim() === qualifiedName);
    }

    function createUsageTarget(fileId, name, path, fullPath, content, handle) {
      const displayPath = fullPath || path || fileId;
      const displayName = name || (displayPath ? getFileName(displayPath) : fileId);
      return {
        fileId,
        name: displayName,
        path: path || displayPath,
        fullPath: displayPath,
        content: content || "",
        handle: handle || null
      };
    }

    function getUsageTarget(usage, mode) {
      if (mode === HEALTH_USAGE_MODE_ORIGINAL && usage.original?.path) return usage.original;
      return usage.markdown || usage;
    }

    function isHealthReportAbsolutePath(path) {
      if (typeof isAbsoluteFilesystemPath === "function") {
        return isAbsoluteFilesystemPath(path);
      }
      const value = String(path || "");
      return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/");
    }

    function getHealthReportActiveFolderPath() {
      return typeof activeFolderPath === "string" ? activeFolderPath : "";
    }

    function joinHealthReportPath(folderPath, relativePath) {
      if (typeof joinPath === "function") {
        return joinPath(folderPath, relativePath);
      }
      return String(folderPath || "").replace(/[\\/]+$/, "") + "/" + String(relativePath || "").replace(/^[\\/]+/, "");
    }

    function getHealthReportProjectMetadataPath(folderPath) {
      return joinHealthReportPath(joinHealthReportPath(folderPath, MD_EDITOR_DIR), PROJECT_METADATA_FILE);
    }

    function resolveHealthReportSourcePath(sourcePath, options = {}) {
      const rawPath = String(sourcePath || "").trim();
      if (!rawPath || isHealthReportAbsolutePath(rawPath)) return rawPath;
      if (options.allowActiveFolder === false) return rawPath;
      const folderPath = getHealthReportActiveFolderPath();
      return folderPath ? joinHealthReportPath(folderPath, rawPath) : rawPath;
    }

    function normalizeHealthReportPath(path) {
      return String(path || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/");
    }

    function dirnameHealthReportPath(path) {
      const normalized = normalizeHealthReportPath(path).replace(/\/+$/, "");
      if (!normalized) return "";
      const slashIndex = normalized.lastIndexOf("/");
      if (slashIndex <= 0) {
        return /^[a-zA-Z]:$/.test(normalized.slice(0, slashIndex)) ? normalized.slice(0, slashIndex + 1) : "";
      }
      return normalized.slice(0, slashIndex);
    }

    async function healthReportPathExists(path) {
      if (!path || typeof NL_VERSION === "undefined" || typeof Neutralino === "undefined" || !Neutralino?.filesystem?.getStats) return false;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function findMdEditorProjectRootFromPath(seedPath) {
      if (typeof findGeneratedProjectFolderFromPath === "function") {
        return findGeneratedProjectFolderFromPath(seedPath);
      }
      if (!seedPath || typeof NL_VERSION === "undefined" || typeof Neutralino === "undefined" || !Neutralino?.filesystem?.getStats) return "";
      let folder = normalizeHealthReportPath(seedPath);
      const seen = new Set();
      while (folder && !seen.has(folder)) {
        seen.add(folder);
        const metadataPath = getHealthReportProjectMetadataPath(folder);
        if (await healthReportPathExists(metadataPath)) return folder;
        const parent = dirnameHealthReportPath(folder);
        if (!parent || parent === folder) break;
        folder = parent;
      }
      return "";
    }

    async function findHealthReportGeneratedProjectFolderFromPath(seedPath) {
      return findMdEditorProjectRootFromPath(seedPath);
    }

    async function readHealthReportProjectMetadata(projectFolder) {
      if (!projectFolder || typeof NL_VERSION === "undefined" || typeof Neutralino === "undefined" || !Neutralino?.filesystem?.readFile) return null;
      try {
        const raw = await Neutralino.filesystem.readFile(getHealthReportProjectMetadataPath(projectFolder));
        const parsed = JSON.parse(raw || "{}");
        const sourceRootPath = normalizeHealthReportPath(parsed.sourceRootPath || "");
        return sourceRootPath ? {
          schemaVersion: Number(parsed.schemaVersion) || 1,
          type: parsed.type || "md-editor-generated-code-folder",
          sourceRootPath,
          sourcePathMode: parsed.sourcePathMode || "relative-to-source-root",
          projectFolderPath: projectFolder
        } : null;
      } catch (error) {
        if (typeof appDebugLog === "function") {
          void appDebugLog("warning", "[graph-health] Failed to read generated project metadata", {
            projectFolder,
            message: error?.message || String(error)
          });
        }
        return null;
      }
    }

    async function resolveHealthReportOriginalSourcePath(source, activeTab) {
      const rawPath = String(source?.rawPath || source?.path || "").trim();
      if (!rawPath) return { rawPath, resolvedPath: "", metadata: null, needsSourceRoot: true };
      if (isHealthReportAbsolutePath(rawPath)) {
        return { rawPath, resolvedPath: rawPath, metadata: null, needsSourceRoot: false };
      }

      if (typeof resolveOriginalSourcePath === "function") {
        const currentResolved = await resolveOriginalSourcePath(rawPath, { prompt: false });
        if (currentResolved?.resolvedPath && !currentResolved?.needsSourceRoot) return currentResolved;
      }

      const seeds = getHealthReportProjectSearchSeeds(activeTab);
      for (const seedPath of seeds) {
        const projectFolder = await findMdEditorProjectRootFromPath(seedPath);
        if (!projectFolder) continue;
        const metadata = await readHealthReportProjectMetadata(projectFolder);
        if (!metadata?.sourceRootPath) continue;
        return {
          rawPath,
          resolvedPath: joinHealthReportPath(metadata.sourceRootPath, rawPath),
          metadata,
          needsSourceRoot: false
        };
      }

      return { rawPath, resolvedPath: "", metadata: null, needsSourceRoot: true };
    }

    function getHealthReportGraphScopePath(tab) {
      const scopeKey = String(tab?.graphScopeKey || tab?.graphDocument?.graphScopeKey || "").trim();
      const rootPrefix = "root-folder:";
      return scopeKey.toLowerCase().startsWith(rootPrefix) ? scopeKey.slice(rootPrefix.length) : "";
    }

    function getHealthReportProjectSearchSeeds(activeTab) {
      const seeds = [];
      const addSeed = (value) => {
        const seed = String(value || "").trim();
        if (seed && !seeds.includes(seed)) seeds.push(seed);
      };
      const sourceTab = activeTab?.graphHealthSourceTabId
        ? (tabs || []).find((tab) => tab?.id === activeTab.graphHealthSourceTabId)
        : null;
      const addTabSeeds = (tab) => {
        addSeed(tab?.openedSource?.path);
        addSeed(tab?.sourceFilePath);
        addSeed(tab?.graphDocument?.sourceFilePath);
        addSeed(tab?.sourceFileName);
        addSeed(getHealthReportGraphScopePath(tab));
      };
      addTabSeeds(activeTab);
      addTabSeeds(sourceTab);
      addSeed(activeFolderPath);
      return seeds;
    }

    function confirmHealthReportProjectFolderSearch(rawPath) {
      const prompt = [
        "This health report references a relative Markdown file path:",
        rawPath,
        "",
        "Do you want MD-Editor to search for this file's generated project folder and open it so the report file can be displayed?"
      ].join("\n");
      if (typeof app?.services?.confirm === "function") return app.services.confirm(prompt);
      if (typeof confirm === "function") return confirm(prompt);
      if (typeof global?.confirm === "function") return global.confirm(prompt);
      return false;
    }

    function getHealthReportOriginalSourceRootPath() {
      if (typeof getOriginalSourceRootPath !== "function") return "";
      try {
        return String(getOriginalSourceRootPath() || "").trim();
      } catch (_error) {
        return "";
      }
    }

    function logMavenRecoveryHealth(level, message, details) {
      const line = `[maven-recovery] ${message}${details ? " " + JSON.stringify(details) : ""}`;
      const logger = level === "error" ? console.error : level === "warning" ? console.warn : console.debug;
      if (typeof logger === "function") {
        logger.call(console, `[maven-recovery] ${message}`, details || "");
      }
      if (typeof appDebugLog === "function") {
        void appDebugLog(level, `[maven-recovery] ${message}`, details);
      }
    }

    function createHealthReportOpenFailureDetails(reason, context = {}) {
      return {
        reason,
        nodeId: context.nodeId || "",
        mode: context.mode || "",
        rawPath: context.source?.rawPath || "",
        sourcePath: context.source?.path || "",
        resolvedPath: context.resolvedPath || "",
        activeFolderPath: getHealthReportActiveFolderPath(),
        originalSourceRootPath: getHealthReportOriginalSourceRootPath(),
        resolver: context.resolvedSource || null,
        error: context.error ? {
          name: context.error.name || "Error",
          message: context.error.message || String(context.error)
        } : null
      };
    }

    function deriveDependentClassNameFromPath(path, name = "") {
      const rawPath = String(path || name || "").trim();
      if (!rawPath) return "";
      const normalized = rawPath.replace(/\\/g, "/").replace(/\.md$/i, "");
      const withoutExtension = normalized.replace(/\.[^/.]+$/i, "");
      const javaSourceMatch = withoutExtension.match(/(?:^|\/)src\/(?:main|test)\/java\/(.+)$/i);
      if (javaSourceMatch?.[1]) return javaSourceMatch[1].replace(/\//g, ".");
      return getFileName(withoutExtension);
    }

    function getUsageDependentClassName(usage) {
      const explicitName = String(usage?.dependentClassName || "").trim();
      if (explicitName) return explicitName;
      const source = usage?.original?.path ? usage.original : (usage?.markdown || usage || {});
      return deriveDependentClassNameFromPath(source.fullPath || source.path, source.name);
    }

    function logHealthReportOpenFailure(reason, context = {}) {
      const details = createHealthReportOpenFailureDetails(reason, context);
      console.error("[graph-health] Unable to open health report file", details);
      if (typeof appDebugLog === "function") {
        void appDebugLog("error", "[graph-health] Unable to open health report file", details);
      }
      return details;
    }

    function createHealthReportOpenFailureMessage(details) {
      if (details.mode === HEALTH_USAGE_MODE_ORIGINAL) {
        if (details.reason === "missing-source-root") {
          return [
            "Unable to open the original source file from the health report.",
            "",
            "The report stores this original source as a relative path:",
            details.rawPath || "(missing path)",
            "",
            "MD-Editor could not resolve it because the generated project metadata did not provide an original source root, or the source root metadata was not loaded.",
            "",
            `Generated folder: ${details.activeFolderPath || "(none open)"}`,
            `Original source root: ${details.originalSourceRootPath || "(not loaded)"}`
          ].join("\n");
        }
        if (details.reason === "missing-original-file") {
          return [
            "Unable to open the original source file from the health report.",
            "",
            "The relative source path was resolved, but the file was not found or is not accessible:",
            details.resolvedPath || "(missing resolved path)",
            "",
            `Original source root: ${details.originalSourceRootPath || "(not loaded)"}`,
            `Generated folder: ${details.activeFolderPath || "(none open)"}`
          ].join("\n");
        }
        return [
          "Unable to open the original source file from the health report.",
          "",
          `Path tried: ${details.resolvedPath || details.sourcePath || details.rawPath || "(missing path)"}`,
          `Original source root: ${details.originalSourceRootPath || "(not loaded)"}`,
          "",
          details.error?.message ? `Error: ${details.error.message}` : "Check that the file exists and that MD-Editor can access it."
        ].join("\n");
      }
      return [
        "Unable to open this Markdown file from the health report.",
        "",
        "Open the generated project folder that contains .md-editor/_md_editor_project.json, then try again.",
        "",
        `Path tried: ${details.resolvedPath || details.sourcePath || details.rawPath || "(missing path)"}`
      ].join("\n");
    }

    function alertHealthReportOpenFailure(reason, context = {}) {
      const details = logHealthReportOpenFailure(reason, context);
      alert(createHealthReportOpenFailureMessage(details));
      return details;
    }

    async function resolveHealthReportMarkdownSourceRecovery(source, activeTab) {
      const rawPath = String(source?.rawPath || source?.path || "").trim();
      if (!rawPath || isHealthReportAbsolutePath(rawPath) || await healthReportPathExists(source.path)) {
        return {
          path: source.path,
          projectRootPath: ""
        };
      }
      if (!await confirmHealthReportProjectFolderSearch(rawPath)) return null;
      let projectFolder = "";
      const seeds = getHealthReportProjectSearchSeeds(activeTab);
      for (const seedPath of seeds) {
        projectFolder = await findMdEditorProjectRootFromPath(seedPath);
        if (projectFolder) break;
      }
      if (!projectFolder) return null;
      const resolvedPath = joinHealthReportPath(projectFolder, rawPath);
      if (!await healthReportPathExists(resolvedPath)) return null;
      return {
        path: resolvedPath,
        projectRootPath: projectFolder
      };
    }

    async function recoverHealthReportMarkdownSourcePath(source, activeTab) {
      const recovery = await resolveHealthReportMarkdownSourceRecovery(source, activeTab);
      return recovery?.path || "";
    }

    function getHealthReportMarkdownPath(snapshotFile, graphNode) {
      const fullPath = snapshotFile?.fullPath || graphNode?.fullPath || "";
      if (fullPath && isHealthReportAbsolutePath(fullPath)) return fullPath;
      return snapshotFile?.path || fullPath || graphNode?.path || "";
    }

    function getHealthGraphFileEntries(graphSnapshot) {
      if (typeof getGraphSnapshotFileEntries === "function") return getGraphSnapshotFileEntries(graphSnapshot);
      const files = Array.isArray(graphSnapshot?.files) ? graphSnapshot.files : [];
      if (files.length) return files;
      return (Array.isArray(graphSnapshot?.nodes) ? graphSnapshot.nodes : [])
        .filter((node) => (node?.type || "file") === "file")
        .map((node) => ({
          id: node.id,
          path: node.path || node.fullPath || "",
          name: node.name || getFileName(node.path || node.fullPath || node.label || node.id || "document.md"),
          tags: Array.isArray(node.tags) ? node.tags : []
        }));
    }

    function createHealthReportOpenSource(snapshotFile, graphNode, mode) {
      const originalPath = snapshotFile?.originalSourcePath || snapshotFile?.sourceFile || "";
      const openingOriginal = mode === HEALTH_USAGE_MODE_ORIGINAL && !!originalPath;
      const rawSourcePath = openingOriginal
        ? originalPath
        : getHealthReportMarkdownPath(snapshotFile, graphNode);
      const resolvedSourcePath = resolveHealthReportSourcePath(rawSourcePath, {
        allowActiveFolder: !openingOriginal
      });
      const sourceName = openingOriginal
        ? (snapshotFile?.originalSourceName || getFileName(rawSourcePath))
        : (snapshotFile?.name || (rawSourcePath ? getFileName(rawSourcePath) : graphNode?.label || graphNode?.id || "document.md"));
      return {
        name: sourceName,
        handle: openingOriginal ? null : (snapshotFile?.handle || null),
        path: resolvedSourcePath || null,
        rawPath: rawSourcePath || null,
        content: openingOriginal ? undefined : snapshotFile?.content
      };
    }

    function createEmptySummary() {
      return {
        missingCount: 0,
        affectedFileCount: 0,
        affectedFiles: [],
        rows: []
      };
    }

    function isGeneratedMissingDependencyReportFile(file) {
      const values = [
        file?.id,
        file?.name,
        file?.path,
        file?.fullPath,
        file?.originalSourcePath,
        file?.sourceFile
      ].map((value) => String(value || "").replace(/\\/g, "/").toLowerCase());
      return values.some((value) => /(?:^|\/)\.md-editor\/missing_dependencies_report\.(?:md|json)$/.test(value));
    }

    function aggregateAffectedFiles(rows) {
      const filesById = new Map();
      (rows || []).forEach((row) => {
        (row.usages || []).forEach((usage) => {
          const fileId = usage.fileId || usage.path || usage.name || "";
          if (!fileId) return;
          if (!filesById.has(fileId)) {
            filesById.set(fileId, {
              fileId,
              name: usage.name || usage.path || fileId,
              path: usage.path || fileId,
              fullPath: usage.fullPath || usage.path || fileId,
              markdown: usage.markdown || usage,
              original: usage.original || usage.markdown || usage,
              dependencies: new Set(),
              referenceCount: 0
            });
          }
          const entry = filesById.get(fileId);
          entry.dependencies.add(row.qualifiedName);
          entry.referenceCount += 1;
        });
      });

      return Array.from(filesById.values()).map((entry) => ({
        ...entry,
        dependencyCount: entry.dependencies.size,
        dependencies: Array.from(entry.dependencies).sort((a, b) => a.localeCompare(b))
      })).sort((a, b) => {
        const left = String(a.fullPath || a.path || a.name);
        const right = String(b.fullPath || b.path || b.name);
        return left.localeCompare(right);
      });
    }

    function aggregateMissingDependencies(graphSnapshot) {
      if (!graphSnapshot) return createEmptySummary();
      const nodes = Array.isArray(graphSnapshot.nodes) ? graphSnapshot.nodes : [];
      const links = Array.isArray(graphSnapshot.links) ? graphSnapshot.links : [];
      const files = getHealthGraphFileEntries(graphSnapshot);
      const nodesById = new Map(nodes.map((node) => [node.id, node]));
      const filesById = new Map(files.map((file) => [file.id, file]));
      const missingNodes = nodes.filter((node) => (node?.type || "file") === "missing-dependency");
      const missingNodeById = new Map(missingNodes.map((node) => [node.id, node]));
      const affectedFileIds = new Set();

      const rows = missingNodes.map((node) => {
        const usageLinks = links.filter((link) => {
          return (link?.type || "link") === "missing-dependency" && getEndpointId(link.target) === node.id;
        });
        const sourceIds = usageLinks.map((link) => getEndpointId(link.source)).filter(Boolean);
        const filteredSourceIds = sourceIds.filter((fileId) => {
          return !isGeneratedMissingDependencyReportFile(filesById.get(fileId) || nodesById.get(fileId) || { id: fileId });
        });
        const uniqueSourceIds = Array.from(new Set(filteredSourceIds));
        uniqueSourceIds.forEach((id) => affectedFileIds.add(id));
        const usages = uniqueSourceIds
          .map((fileId) => {
            const snapshotFile = filesById.get(fileId) || {};
            const sourceNode = nodesById.get(fileId) || {};
            const details = findUsageDetails(snapshotFile, node);
            const detail = details[0] || {};
            const markdownTarget = createUsageTarget(
              fileId,
              snapshotFile.name || fileId,
              snapshotFile.path || snapshotFile.fullPath || fileId,
              snapshotFile.fullPath || snapshotFile.path || fileId,
              snapshotFile.content,
              snapshotFile.handle
            );
            const originalPath = snapshotFile.originalSourcePath || snapshotFile.sourceFile || "";
            const originalTarget = originalPath
              ? createUsageTarget(fileId, snapshotFile.originalSourceName || getFileName(originalPath), originalPath, originalPath, "", null)
              : markdownTarget;
            return {
              fileId,
              name: markdownTarget.name,
              path: markdownTarget.path,
              fullPath: markdownTarget.fullPath,
              markdown: markdownTarget,
              original: originalTarget,
              dependentClassName: sourceNode.qualifiedName || "",
              line: Number.isFinite(Number(detail.line)) ? Number(detail.line) : null
            };
          })
          .sort((a, b) => String(a.path || a.name).localeCompare(String(b.path || b.name)));

        return {
          id: node.id,
          label: node.label || getMissingDependencyLabel(node),
          qualifiedName: getMissingDependencyLabel(node),
          kind: getMissingDependencyKind(node),
          rawKind: node.missingKind || "unknown",
          language: node.language || "unknown",
          affectedFileCount: uniqueSourceIds.length,
          referenceCount: filteredSourceIds.length,
          usages
        };
      }).sort((a, b) => {
        if (b.affectedFileCount !== a.affectedFileCount) return b.affectedFileCount - a.affectedFileCount;
        if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
        return a.qualifiedName.localeCompare(b.qualifiedName);
      });

      const filteredRows = rows.filter((row) => missingNodeById.has(row.id));
      return {
        missingCount: rows.length,
        affectedFileCount: affectedFileIds.size,
        affectedFiles: aggregateAffectedFiles(filteredRows),
        rows: filteredRows
      };
    }

    function sortMissingDependencyRows(rows, sortKey, direction = "asc") {
      const multiplier = direction === "desc" ? -1 : 1;
      const getValue = (row) => {
        switch (sortKey) {
          case "dependency":
            return row.qualifiedName || row.label || "";
          case "kind":
            return row.kind || "";
          case "language":
            return row.language || "";
          case "affected":
            return Number(row.affectedFileCount) || 0;
          case "references":
            return Number(row.referenceCount) || 0;
          default:
            return "";
        }
      };
      return (rows || []).slice().sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        let result = 0;
        if (typeof left === "number" && typeof right === "number") {
          result = left - right;
        } else {
          result = String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
        }
        if (result === 0) {
          result = String(a.qualifiedName || a.label || "").localeCompare(String(b.qualifiedName || b.label || ""), undefined, { sensitivity: "base", numeric: true });
        }
        return result * multiplier;
      });
    }

    function missingDependencyPackageBucket(row) {
      const name = String(row?.qualifiedName || row?.label || "").trim().replace(/\.\*$/, "");
      if (!name.includes(".")) return name;
      const parts = name.split(".").filter(Boolean);
      if (parts.length <= 2) return name;
      return parts.slice(0, -1).join(".");
    }

    function groupKeyForMissingDependency(row, rows) {
      const name = String(row?.qualifiedName || row?.label || "").trim();
      if (!name) return "";
      const prefixes = (rows || [])
        .map((candidate) => String(candidate?.qualifiedName || candidate?.label || "").trim())
        .filter((candidateName) => candidateName && name.startsWith(`${candidateName}.`))
        .sort((a, b) => b.length - a.length);
      if (prefixes.length) return prefixes[0];
      if ((rows || []).some((candidate) => {
        const candidateName = String(candidate?.qualifiedName || candidate?.label || "").trim();
        return candidateName && candidateName.startsWith(`${name}.`);
      })) {
        return name;
      }
      return missingDependencyPackageBucket(row);
    }

    function mergeGroupUsages(rows) {
      const usagesByFileId = new Map();
      (rows || []).forEach((row) => {
        (row.usages || []).forEach((usage) => {
          const fileId = usage.fileId || usage.path || usage.name || "";
          if (!fileId || usagesByFileId.has(fileId)) return;
          usagesByFileId.set(fileId, usage);
        });
      });
      return Array.from(usagesByFileId.values()).sort((a, b) => String(a.path || a.name).localeCompare(String(b.path || b.name)));
    }

    function groupMissingDependencyRows(rows) {
      const groups = new Map();
      (rows || []).forEach((row) => {
        const key = groupKeyForMissingDependency(row, rows);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });

      const result = [];
      groups.forEach((children, key) => {
        const sortedChildren = sortMissingDependencyRows(children, "dependency", "asc");
        if (sortedChildren.length <= 1) {
          result.push(sortedChildren[0]);
          return;
        }
        const affectedFileIds = new Set();
        sortedChildren.forEach((child) => {
          (child.usages || []).forEach((usage) => {
            if (usage.fileId) affectedFileIds.add(usage.fileId);
          });
        });
        const languages = Array.from(new Set(sortedChildren.map((child) => child.language || "unknown"))).sort((a, b) => a.localeCompare(b));
        result.push({
          id: `group:${key}`,
          isGroup: true,
          label: key,
          qualifiedName: key,
          kind: `${sortedChildren.length.toLocaleString()} symbols`,
          rawKind: "group",
          language: languages.join(", "),
          affectedFileCount: affectedFileIds.size,
          referenceCount: sortedChildren.reduce((total, child) => total + child.referenceCount, 0),
          usages: mergeGroupUsages(sortedChildren),
          children: sortedChildren
        });
      });
      return result.sort((a, b) => {
        if (b.affectedFileCount !== a.affectedFileCount) return b.affectedFileCount - a.affectedFileCount;
        if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
        return String(a.qualifiedName || "").localeCompare(String(b.qualifiedName || ""));
      });
    }

    function filterMissingDependencyRows(rows, query) {
      const normalizedQuery = String(query || "").trim().toLowerCase();
      if (!normalizedQuery) return (rows || []).slice();
      const rowMatches = (row) => {
        const values = [
          row?.qualifiedName,
          row?.label,
          row?.kind,
          row?.rawKind,
          row?.language
        ].map((value) => String(value || "").toLowerCase());
        if (values.some((value) => value.includes(normalizedQuery))) return true;
        return (row?.children || []).some((child) => rowMatches(child));
      };
      return (rows || []).filter(rowMatches);
    }

    function getMissingDependencyContextRows(row, allRows = []) {
      const children = Array.isArray(row?.children) ? row.children : [];
      if (children.length) return children;
      const entryName = String(row?.qualifiedName || row?.label || "").trim();
      const bucket = missingDependencyPackageBucket(row);
      const matches = (allRows || []).filter((candidate) => {
        const candidateName = String(candidate?.qualifiedName || candidate?.label || "").trim();
        if (!candidateName || !entryName) return false;
        return candidateName === entryName
          || candidateName.startsWith(`${entryName}.`)
          || (bucket && candidateName.startsWith(`${bucket}.`));
      });
      return matches.length ? matches : (row ? [row] : []);
    }

    function getAffectedFileTarget(file, mode) {
      if (mode === HEALTH_USAGE_MODE_ORIGINAL && file.original?.path) return file.original;
      return file.markdown || file;
    }

    function formatAffectedFilesText(files, mode) {
      return (files || []).map((file) => {
        const target = getAffectedFileTarget(file, mode);
        return target.fullPath || target.path || target.name || file.fileId || "";
      }).filter(Boolean).join("\n");
    }

    function getAffectedFilesExportName(activeTab, mode) {
      const base = String(activeTab?.folderName || activeTab?.title || "graph-health")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "graph-health";
      return `${base}-affected-${mode === HEALTH_USAGE_MODE_ORIGINAL ? "original" : "markdown"}-files.txt`;
    }

    async function copyAffectedFilesText(files, mode) {
      const text = formatAffectedFilesText(files, mode);
      try {
        if (typeof copyTextToSystemClipboard === "function") {
          await copyTextToSystemClipboard(text);
        } else if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error("Clipboard is unavailable.");
        }
        alert("Affected files copied to clipboard.");
      } catch (error) {
        console.error("Failed to copy affected files:", error);
        alert("Could not copy affected files: " + (error?.message || error || "Unknown error"));
      }
    }

    function downloadAffectedFilesText(files, mode, activeTab) {
      const text = formatAffectedFilesText(files, mode);
      const fileName = getAffectedFilesExportName(activeTab, mode);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      if (typeof saveAs === "function") {
        saveAs(blob, fileName);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function renderAffectedFilesModalRows(list, files, mode, activeTab = null) {
      list.innerHTML = "";
      files.forEach((file) => {
        const target = getAffectedFileTarget(file, mode);
        const path = target.fullPath || target.path || target.name || file.fileId || "";
        const graphTabIdAttribute = activeTab?.id ? ` data-graph-tab-id="${escapeHtml(activeTab.id)}"` : "";
        const row = document.createElement("div");
        row.className = "graph-health-affected-file-row";
        row.innerHTML = `
          <button class="graph-health-open-file graph-health-affected-open-file" type="button" data-file-id="${escapeHtml(file.fileId)}" data-file-mode="${escapeHtml(mode)}"${graphTabIdAttribute} title="Open file">
            <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
          </button>
          <div class="graph-health-affected-file-main">
            <button class="graph-health-affected-file-link" type="button" data-file-id="${escapeHtml(file.fileId)}" data-file-mode="${escapeHtml(mode)}"${graphTabIdAttribute} title="${escapeHtml(path)}">
              ${escapeHtml(target.name || path)}
            </button>
            <span title="${escapeHtml(path)}">${escapeHtml(path)}</span>
          </div>
          <div class="graph-health-affected-file-meta">
            <span>${file.dependencyCount.toLocaleString()} deps</span>
            <span>${file.referenceCount.toLocaleString()} refs</span>
          </div>
        `;
        list.appendChild(row);
      });
      if (!files.length) {
        const empty = document.createElement("p");
        empty.className = "graph-health-package-empty";
        empty.textContent = "No affected files.";
        list.appendChild(empty);
      }
    }

    function openAffectedFilesModal(summary, activeTab, initialMode = HEALTH_USAGE_MODE_MARKDOWN) {
      const existing = document.querySelector(".graph-health-affected-files-modal");
      if (existing) existing.remove();

      let mode = initialMode === HEALTH_USAGE_MODE_ORIGINAL ? HEALTH_USAGE_MODE_ORIGINAL : HEALTH_USAGE_MODE_MARKDOWN;
      const files = summary?.affectedFiles || [];
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay graph-health-package-modal graph-health-affected-files-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "graph-health-affected-files-title");
      overlay.innerHTML = `
        <div class="reset-modal-box graph-health-package-modal-box graph-health-affected-files-modal-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Graph Health</p>
              <h2 id="graph-health-affected-files-title">Affected Files</h2>
            </div>
            <button class="settings-modal-close graph-health-affected-files-close" type="button" aria-label="Close affected files">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="graph-health-package-toolbar graph-health-affected-files-toolbar">
            <div class="graph-health-usage-mode">
              <span class="graph-health-usage-mode-label">Open</span>
              <button class="graph-health-usage-mode-button" type="button" data-mode="${HEALTH_USAGE_MODE_MARKDOWN}">Markdown</button>
              <button class="graph-health-usage-mode-button" type="button" data-mode="${HEALTH_USAGE_MODE_ORIGINAL}">Originals</button>
            </div>
            <div class="graph-health-package-actions">
              <button class="reset-modal-btn graph-health-affected-copy" type="button">Copy List</button>
              <button class="reset-modal-btn graph-health-affected-download" type="button">Export TXT</button>
            </div>
          </div>
          <div class="graph-health-package-summary-counts graph-health-affected-files-counts">
            <span>${(summary?.affectedFileCount || 0).toLocaleString()} affected files</span>
            <span>${(summary?.missingCount || 0).toLocaleString()} missing dependencies</span>
          </div>
          <div class="graph-health-affected-files-list"></div>
        </div>
      `;

      const list = overlay.querySelector(".graph-health-affected-files-list");
      const updateModeButtons = () => {
        overlay.querySelectorAll(".graph-health-usage-mode-button").forEach((button) => {
          const isActive = button.dataset.mode === mode;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      };
      const render = () => {
        updateModeButtons();
        renderAffectedFilesModalRows(list, files, mode, activeTab);
      };
      const closeModal = () => overlay.remove();

      overlay.querySelector(".graph-health-affected-files-close").addEventListener("click", closeModal);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeModal();
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
      });
      overlay.querySelectorAll(".graph-health-usage-mode-button").forEach((button) => {
        button.addEventListener("click", () => {
          mode = button.dataset.mode === HEALTH_USAGE_MODE_ORIGINAL ? HEALTH_USAGE_MODE_ORIGINAL : HEALTH_USAGE_MODE_MARKDOWN;
          render();
        });
      });
      overlay.querySelector(".graph-health-affected-copy").addEventListener("click", () => {
        copyAffectedFilesText(files, mode);
      });
      overlay.querySelector(".graph-health-affected-download").addEventListener("click", () => {
        downloadAffectedFilesText(files, mode, activeTab);
      });

      document.body.appendChild(overlay);
      render();
      overlay.querySelector(".graph-health-affected-files-close")?.focus();
      return overlay;
    }

    function renderUsageRows(container, row, expandedCount, mode = HEALTH_USAGE_MODE_MARKDOWN) {
      const visibleUsages = row.usages.slice(0, expandedCount);
      container.innerHTML = `
        <div class="graph-health-usage-title">${mode === HEALTH_USAGE_MODE_ORIGINAL ? "Original source files" : "Markdown files"} and source lines that reference this missing dependency</div>
        ${visibleUsages.map((usage) => {
        const target = getUsageTarget(usage, mode);
        const lineText = usage.line ? `line ${usage.line}` : "";
        return `
          <div class="graph-health-usage-row">
            <button class="graph-health-open-file" type="button" data-file-id="${escapeHtml(usage.fileId)}" data-file-mode="${escapeHtml(mode)}" title="Open file">
              <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
            </button>
            <span class="graph-health-usage-file" title="${escapeHtml(target.fullPath || target.path)}">${escapeHtml(target.name || target.path)}</span>
            ${lineText ? `<span class="graph-health-usage-line">${escapeHtml(lineText)}</span>` : ""}
          </div>
        `;
      }).join("")}
      `;
      if (row.usages.length > expandedCount) {
        const moreButton = document.createElement("button");
        moreButton.className = "graph-health-show-more";
        moreButton.type = "button";
        moreButton.textContent = `Show ${row.usages.length - expandedCount} more`;
        moreButton.addEventListener("click", () => {
          container.dataset.expandedCount = String(row.usages.length);
          renderUsageRows(container, row, row.usages.length, mode);
        });
        container.appendChild(moreButton);
      }
    }

    function renderGroupedDependencyRows(container, groupRow, mode, allRows = []) {
      container.innerHTML = `
        <div class="graph-health-usage-title">Missing symbols in ${escapeHtml(groupRow.qualifiedName)}</div>
        <div class="graph-health-group-children"></div>
      `;
      const childrenContainer = container.querySelector(".graph-health-group-children");
      (groupRow.children || []).forEach((child) => {
        const childWrapper = document.createElement("div");
        childWrapper.className = "graph-health-group-child";
        childWrapper.innerHTML = `
          <button class="graph-health-group-child-button" type="button" aria-expanded="false">
            <i class="bi bi-chevron-right" aria-hidden="true"></i>
            <span class="graph-health-name" title="${escapeHtml(child.qualifiedName)}">${escapeHtml(child.qualifiedName)}</span>
            <span>${escapeHtml(child.kind)}</span>
            <span>${child.affectedFileCount.toLocaleString()} files</span>
            <span>${child.referenceCount.toLocaleString()} refs</span>
          </button>
          <div class="graph-health-group-child-usages hidden"></div>
        `;
        const childButton = childWrapper.querySelector(".graph-health-group-child-button");
        const childUsages = childWrapper.querySelector(".graph-health-group-child-usages");
        childButton.addEventListener("contextmenu", (event) => {
          openMissingDependencyContextMenu(event, child, allRows);
        });
        childButton.addEventListener("click", () => {
          const isOpening = childUsages.classList.contains("hidden");
          childUsages.classList.toggle("hidden", !isOpening);
          childButton.setAttribute("aria-expanded", isOpening ? "true" : "false");
          childButton.querySelector("i")?.classList.toggle("expanded", isOpening);
          if (!isOpening || childUsages.dataset.rendered === "true") return;
          childUsages.dataset.rendered = "true";
          childUsages.dataset.expandedCount = String(Math.min(MAX_INITIAL_USAGE_ROWS, child.usages.length));
          renderUsageRows(childUsages, child, MAX_INITIAL_USAGE_ROWS, mode);
        });
        childrenContainer.appendChild(childWrapper);
      });
    }

    function getMissingDependencyContextClassNames(row, allRows = []) {
      const entryName = String(row?.qualifiedName || row?.label || "").trim();
      const names = getMissingDependencyContextRows(row, allRows)
        .map((candidate) => candidate?.qualifiedName || candidate?.label || "")
        .filter(Boolean);
      if (!names.length && entryName) names.push(entryName);
      return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    }

    function getMissingDependencyContextDependentClassNames(row, allRows = []) {
      const names = [];
      getMissingDependencyContextRows(row, allRows).forEach((candidate) => {
        (candidate.usages || []).forEach((usage) => {
          const name = getUsageDependentClassName(usage);
          if (name) names.push(name);
        });
      });
      return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    }

    async function copyHealthDependencyContextText(text, label) {
      try {
        if (typeof copyTextToSystemClipboard === "function") {
          await copyTextToSystemClipboard(text);
        } else if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error("Clipboard is unavailable.");
        }
        alert(`${label} copied to clipboard.`);
      } catch (error) {
        console.error("Failed to copy health dependency entry:", error);
        alert("Could not copy dependency entry: " + (error?.message || error || "Unknown error"));
      }
    }

    async function openHealthReportFolder(path) {
      const normalized = normalizeHealthReportPath(path);
      const neutralinoApi = deps?.Neutralino || global?.Neutralino;
      const isDesktopRuntime = typeof deps?.isNeutralinoRuntime === "function"
        ? deps.isNeutralinoRuntime()
        : typeof global?.NL_VERSION !== "undefined";
      if (!normalized || !isDesktopRuntime || !neutralinoApi?.os) {
        alert("Opening Maven recovery folders is available only in the desktop app.");
        return;
      }
      try {
        if (neutralinoApi.os.open) {
          await neutralinoApi.os.open(normalized);
          return;
        }
        if (neutralinoApi.os.execCommand) {
          const windowsPath = normalized.replace(/\//g, "\\");
          await neutralinoApi.os.execCommand(`explorer.exe "${windowsPath}"`);
          return;
        }
        throw new Error("No supported folder opener is available.");
      } catch (error) {
        console.error("Failed to open Maven recovery path:", error);
        alert("Unable to open this path: " + (error?.message || error || "Unknown error"));
      }
    }

    function getMavenRecoveryMappedRows(model) {
      return (model?.mappedDependencies || []).map((dependency) => ({
        groupId: dependency.groupId || "",
        artifactId: dependency.artifactId || "",
        version: dependency.version || "",
        matchedPrefix: dependency.matchedPrefix || "",
        packages: (dependency.packages || []).join(", ")
      }));
    }

    function openMavenRecoveryTableModal(title, rows, columns, emptyText) {
      const existing = document.querySelector(".maven-recovery-table-modal");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay maven-recovery-table-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "maven-recovery-table-title");
      overlay.innerHTML = `
        <div class="reset-modal-box maven-recovery-table-modal-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Maven Recovery</p>
              <h2 id="maven-recovery-table-title">${escapeHtml(title)}</h2>
            </div>
            <button class="settings-modal-close maven-recovery-table-close" type="button" aria-label="Close Maven recovery details">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="maven-recovery-table-wrap">
            <table class="graph-health-table maven-recovery-table">
              <thead>
                <tr>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;

      const closeModal = () => overlay.remove();
      const tbody = overlay.querySelector("tbody");
      if (rows.length) {
        rows.forEach((row) => {
          const tableRow = document.createElement("tr");
          tableRow.innerHTML = columns.map((column) => `<td>${escapeHtml(row[column.key] || "")}</td>`).join("");
          tbody.appendChild(tableRow);
        });
      } else {
        const tableRow = document.createElement("tr");
        tableRow.innerHTML = `<td colspan="${columns.length}" class="graph-health-package-empty">${escapeHtml(emptyText)}</td>`;
        tbody.appendChild(tableRow);
      }

      overlay.querySelector(".maven-recovery-table-close").addEventListener("click", closeModal);
      document.body.appendChild(overlay);
      overlay.querySelector(".maven-recovery-table-close")?.focus();
      return overlay;
    }

    function openMavenRecoveryNotificationModal(result) {
      const existing = document.querySelector(".maven-recovery-notification-modal");
      if (existing) existing.remove();

      const mappedRows = getMavenRecoveryMappedRows(result?.model);
      const unmappedRows = (result?.model?.unmappedPackages || []).map((packageName) => ({ packageName }));
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay maven-recovery-notification-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "maven-recovery-notification-title");
      overlay.innerHTML = `
        <div class="reset-modal-box maven-recovery-notification-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Maven Recovery</p>
              <h2 id="maven-recovery-notification-title">Recovery Files Created</h2>
            </div>
            <button class="settings-modal-close maven-recovery-notification-close" type="button" aria-label="Close Maven recovery notification">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="maven-recovery-notification-body">
            <div class="maven-recovery-summary-grid">
              <div class="maven-recovery-summary-item">
                <span>Mapped dependencies</span>
                <strong>${Number(result?.mappedCount || 0).toLocaleString()}</strong>
                <button class="maven-recovery-inline-button maven-recovery-show-mapped" type="button" title="Show mapped dependencies" aria-label="Show mapped dependencies">...</button>
              </div>
              <div class="maven-recovery-summary-item">
                <span>Unmapped groups</span>
                <strong>${Number(result?.unmappedCount || 0).toLocaleString()}</strong>
                <button class="maven-recovery-inline-button maven-recovery-show-unmapped" type="button" title="Show unmapped groups" aria-label="Show unmapped groups">...</button>
              </div>
            </div>
            <div class="maven-recovery-path-list">
              <div>
                <span>Recovery folder</span>
                <button class="maven-recovery-path-link" type="button" data-path-kind="recovery">${escapeHtml(result?.recoveryFolder || "")}</button>
              </div>
              <div>
                <span>Target jar folder</span>
                <button class="maven-recovery-path-link" type="button" data-path-kind="target">${escapeHtml(result?.targetJarFolder || "")}</button>
              </div>
              <div>
                <span>Batch file</span>
                <button class="maven-recovery-path-link" type="button" data-path-kind="batch">${escapeHtml(result?.batchPath || "")}</button>
              </div>
            </div>
          </div>
          <div class="reset-modal-actions maven-recovery-notification-actions">
            <button class="reset-modal-btn maven-recovery-run-batch" type="button">Run batch</button>
            <button class="reset-modal-btn maven-recovery-update-project" type="button">Update project</button>
            <button class="reset-modal-btn maven-recovery-ok" type="button">Close</button>
          </div>
        </div>
      `;

      const closeModal = () => overlay.remove();
      overlay.querySelector(".maven-recovery-notification-close").addEventListener("click", closeModal);
      overlay.querySelector(".maven-recovery-ok").addEventListener("click", closeModal);
      overlay.querySelector(".maven-recovery-show-mapped").addEventListener("click", () => {
        openMavenRecoveryTableModal("Mapped Dependencies", mappedRows, [
          { key: "groupId", label: "Group ID" },
          { key: "artifactId", label: "Artifact ID" },
          { key: "version", label: "Version" },
          { key: "matchedPrefix", label: "Matched Prefix" },
          { key: "packages", label: "Packages" }
        ], "No mapped dependencies.");
      });
      overlay.querySelector(".maven-recovery-show-unmapped").addEventListener("click", () => {
        openMavenRecoveryTableModal("Unmapped Groups", unmappedRows, [
          { key: "packageName", label: "Package" }
        ], "No unmapped groups.");
      });
      overlay.querySelectorAll(".maven-recovery-path-link").forEach((button) => {
        button.addEventListener("click", () => {
          const kind = button.dataset.pathKind;
          const path = kind === "target" ? result?.targetJarFolder : result?.recoveryFolder;
          void openHealthReportFolder(path);
        });
      });
      overlay.querySelector(".maven-recovery-run-batch").addEventListener("click", async () => {
        try {
          await graphMavenRecovery.runRecoveryBatch(result?.batchPath || "");
        } catch (error) {
          console.error("Failed to run Maven recovery batch:", error);
          alert("Unable to run Maven recovery batch: " + (error?.message || error || "Unknown error"));
        }
      });
      overlay.querySelector(".maven-recovery-update-project").addEventListener("click", async () => {
        try {
          await recoveryUpdater?.runProjectUpdateFromSeed?.(activeFolderPath || result?.contextPath || "");
        } catch (error) {
          console.error("Failed to update project from Maven recovery:", error);
          alert("Unable to update project: " + (error?.message || error || "Unknown error"));
        }
      });
      document.body.appendChild(overlay);
      overlay.querySelector(".maven-recovery-ok")?.focus();
      return overlay;
    }

    function closeMissingDependencyContextMenu() {
      document.querySelector(".graph-health-dependency-context-menu")?.remove();
    }

    function createHealthContextMenuButton(label, iconClass, onClick) {
      const button = document.createElement("button");
      button.className = "graph-context-menu-item";
      button.type = "button";
      button.innerHTML = `
        <i class="${escapeHtml(iconClass)}" aria-hidden="true"></i>
        <span class="graph-context-menu-item-label">${escapeHtml(label)}</span>
      `;
      button.addEventListener("click", async () => {
        closeMissingDependencyContextMenu();
        await onClick();
      });
      return button;
    }

    function openMissingDependencyContextMenu(event, row, allRows = []) {
      event.preventDefault();
      event.stopPropagation();
      closeMissingDependencyContextMenu();

      const entryName = row?.qualifiedName || row?.label || "";
      const classNames = getMissingDependencyContextClassNames(row, allRows);
      const dependentClassNames = getMissingDependencyContextDependentClassNames(row, allRows);
      const menu = document.createElement("div");
      menu.className = "graph-context-menu graph-health-dependency-context-menu";
      menu.innerHTML = `
        <div class="graph-context-menu-title">${escapeHtml(entryName || "Dependency")}</div>
        <div class="graph-context-menu-separator"></div>
      `;
      menu.appendChild(createHealthContextMenuButton("Copy entry name", "bi bi-clipboard", () => (
        copyHealthDependencyContextText(entryName, "Entry name")
      )));
      menu.appendChild(createHealthContextMenuButton("Copy class names", "bi bi-clipboard-data", () => (
        copyHealthDependencyContextText(classNames.join("\n"), "Class names")
      )));
      menu.appendChild(createHealthContextMenuButton("Copy dependent classes", "bi bi-diagram-3", () => (
        copyHealthDependencyContextText(dependentClassNames.join("\n"), "Dependent classes")
      )));

      document.body.appendChild(menu);
      const margin = 8;
      const rect = menu.getBoundingClientRect();
      const left = Math.min(event.clientX, window.innerWidth - rect.width - margin);
      const top = Math.min(event.clientY, window.innerHeight - rect.height - margin);
      menu.style.left = `${Math.max(margin, left)}px`;
      menu.style.top = `${Math.max(margin, top)}px`;

      const closeOnOutside = (closeEvent) => {
        if (menu.contains(closeEvent.target)) return;
        closeMissingDependencyContextMenu();
        document.removeEventListener("click", closeOnOutside, true);
        document.removeEventListener("contextmenu", closeOnOutside, true);
      };
      setTimeout(() => {
        document.addEventListener("click", closeOnOutside, true);
        document.addEventListener("contextmenu", closeOnOutside, true);
      }, 0);
    }

    function renderGraphHealthSummary(container, activeTab, options = {}) {
      if (!container) return;
      container.innerHTML = "";
      const graphSnapshot = activeTab?.type === "graph"
        ? (activeTab.graphComparisonSnapshot || activeTab.graphSnapshot || null)
        : null;
      if (!graphSnapshot) return;

      const summary = aggregateMissingDependencies(graphSnapshot);
      let usageMode = HEALTH_USAGE_MODE_MARKDOWN;
      let groupSubpackages = false;
      const header = document.createElement("div");
      header.className = options.large ? "graph-health-summary graph-health-summary-large" : "graph-health-summary";
      header.innerHTML = `
        <span>${summary.missingCount.toLocaleString()} missing dependencies</span>
        <button class="graph-health-summary-link" type="button">${summary.affectedFileCount.toLocaleString()} affected files</button>
      `;
      container.appendChild(header);
      header.querySelector(".graph-health-summary-link")?.addEventListener("click", () => {
        openAffectedFilesModal(summary, activeTab, usageMode);
      });

      if (!summary.rows.length) {
        const empty = document.createElement("p");
        empty.className = "graph-health-empty";
        empty.textContent = "No missing dependencies";
        container.appendChild(empty);
        return;
      }

      const detailsByRowId = new Map();
      const controls = document.createElement("div");
      controls.className = "graph-health-controls";
      const filterInput = document.createElement("input");
      filterInput.className = "rename-modal-input graph-health-filter";
      filterInput.type = "search";
      filterInput.placeholder = "Filter dependencies";
      filterInput.setAttribute("aria-label", "Filter missing dependencies");
      const modeToggle = document.createElement("div");
      modeToggle.className = "graph-health-usage-mode";
      modeToggle.innerHTML = `
        <span class="graph-health-usage-mode-label">Show</span>
        <button class="graph-health-usage-mode-button active" type="button" data-mode="${HEALTH_USAGE_MODE_MARKDOWN}" aria-pressed="true">Markdown</button>
        <button class="graph-health-usage-mode-button" type="button" data-mode="${HEALTH_USAGE_MODE_ORIGINAL}" aria-pressed="false">Originals</button>
      `;
      const groupToggle = document.createElement("button");
      groupToggle.className = "graph-health-group-toggle";
      groupToggle.type = "button";
      groupToggle.setAttribute("aria-pressed", "false");
      groupToggle.innerHTML = `
        <span class="graph-health-switch" aria-hidden="true"></span>
        <span>Group subpackages</span>
      `;
      modeToggle.addEventListener("click", (event) => {
        const button = event.target.closest(".graph-health-usage-mode-button");
        if (!button) return;
        const nextMode = button.dataset.mode === HEALTH_USAGE_MODE_ORIGINAL ? HEALTH_USAGE_MODE_ORIGINAL : HEALTH_USAGE_MODE_MARKDOWN;
        if (nextMode === usageMode) return;
        usageMode = nextMode;
        modeToggle.querySelectorAll(".graph-health-usage-mode-button").forEach((candidate) => {
          const isActive = candidate.dataset.mode === usageMode;
          candidate.classList.toggle("active", isActive);
          candidate.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        detailsByRowId.forEach(({ details, row }) => {
          if (details.dataset.rendered !== "true") return;
          const expandedCount = Number(details.dataset.expandedCount || MAX_INITIAL_USAGE_ROWS);
          if (row.isGroup) {
            renderGroupedDependencyRows(details, row, usageMode, summary.rows);
          } else {
            renderUsageRows(details, row, expandedCount, usageMode);
          }
        });
      });
      groupToggle.addEventListener("click", () => {
        groupSubpackages = !groupSubpackages;
        groupToggle.classList.toggle("active", groupSubpackages);
        groupToggle.setAttribute("aria-pressed", groupSubpackages ? "true" : "false");
        visibleRows = getVisibleRows();
        renderTableRows();
        updateSortHeaderState();
      });
      controls.append(filterInput, modeToggle, groupToggle);
      container.appendChild(controls);

      const table = document.createElement("table");
      table.className = "graph-health-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th scope="col" data-sort-key="dependency">
              <button class="graph-health-sort-button" type="button" data-sort-key="dependency">Dependency <i class="bi bi-arrow-down-up" aria-hidden="true"></i></button>
            </th>
            <th scope="col" data-sort-key="kind">
              <button class="graph-health-sort-button" type="button" data-sort-key="kind">Kind <i class="bi bi-arrow-down-up" aria-hidden="true"></i></button>
            </th>
            <th scope="col" data-sort-key="language">
              <button class="graph-health-sort-button" type="button" data-sort-key="language">Language <i class="bi bi-arrow-down-up" aria-hidden="true"></i></button>
            </th>
            <th scope="col" data-sort-key="affected">
              <button class="graph-health-sort-button graph-health-sort-button-right" type="button" data-sort-key="affected">Affected files <i class="bi bi-arrow-down-up" aria-hidden="true"></i></button>
            </th>
            <th scope="col" data-sort-key="references">
              <button class="graph-health-sort-button graph-health-sort-button-right" type="button" data-sort-key="references">References <i class="bi bi-arrow-down-up" aria-hidden="true"></i></button>
            </th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      let sortState = { key: "", direction: "asc" };
      let filterQuery = "";
      const getBaseVisibleRows = () => groupSubpackages ? groupMissingDependencyRows(summary.rows) : summary.rows.slice();
      const getVisibleRows = () => {
        let rows = filterMissingDependencyRows(getBaseVisibleRows(), filterQuery);
        if (sortState.key) rows = sortMissingDependencyRows(rows, sortState.key, sortState.direction);
        return rows;
      };
      let visibleRows = getVisibleRows();
      const updateSortHeaderState = () => {
        table.querySelectorAll("th[data-sort-key]").forEach((cell) => {
          const isActive = cell.dataset.sortKey === sortState.key;
          cell.setAttribute("aria-sort", isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : "none");
        });
        table.querySelectorAll(".graph-health-sort-button").forEach((button) => {
          const isActive = button.dataset.sortKey === sortState.key;
          button.classList.toggle("active", isActive);
          button.dataset.sortDirection = isActive ? sortState.direction : "";
          const icon = button.querySelector("i");
          if (!icon) return;
          icon.className = isActive
            ? `bi ${sortState.direction === "asc" ? "bi-sort-alpha-down" : "bi-sort-alpha-up-alt"}`
            : "bi bi-arrow-down-up";
          if (button.dataset.sortKey === "affected" || button.dataset.sortKey === "references") {
            icon.className = isActive
              ? `bi ${sortState.direction === "asc" ? "bi-sort-numeric-down" : "bi-sort-numeric-up-alt"}`
              : "bi bi-arrow-down-up";
          }
        });
      };
      const renderTableRows = () => {
        tbody.innerHTML = "";
        detailsByRowId.clear();
        if (!visibleRows.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="graph-health-empty graph-health-table-empty">No missing dependencies match the filter.</td></tr>';
          return;
        }
        visibleRows.forEach((row) => {
        const item = document.createElement("tr");
        item.className = "graph-health-row";
        item.innerHTML = `
          <td>
            <button class="graph-health-expand-button" type="button" aria-expanded="false">
              <i class="bi bi-chevron-right" aria-hidden="true"></i>
              <span class="graph-health-name" title="${escapeHtml(row.qualifiedName)}">${escapeHtml(row.qualifiedName)}</span>
            </button>
          </td>
          <td>${escapeHtml(row.kind)}</td>
          <td>${escapeHtml(row.language)}</td>
          <td class="graph-health-number-cell">${row.affectedFileCount.toLocaleString()}</td>
          <td class="graph-health-number-cell">${row.referenceCount.toLocaleString()}</td>
        `;
        const detailsRow = document.createElement("tr");
        detailsRow.className = "graph-health-details-row hidden";
        const detailsCell = document.createElement("td");
        detailsCell.colSpan = 5;
        const details = document.createElement("div");
        details.className = "graph-health-usages";
        detailsCell.appendChild(details);
        detailsRow.appendChild(detailsCell);
        const toggleButton = item.querySelector(".graph-health-expand-button");
        toggleButton.addEventListener("contextmenu", (event) => {
          openMissingDependencyContextMenu(event, row, summary.rows);
        });
        toggleButton.addEventListener("click", () => {
          const isOpening = detailsRow.classList.contains("hidden");
          detailsRow.classList.toggle("hidden", !isOpening);
          toggleButton.setAttribute("aria-expanded", isOpening ? "true" : "false");
          toggleButton.querySelector("i")?.classList.toggle("expanded", isOpening);
          if (!isOpening || details.dataset.rendered === "true") return;
          details.dataset.rendered = "true";
          details.dataset.expandedCount = String(Math.min(MAX_INITIAL_USAGE_ROWS, row.usages.length));
          if (row.isGroup) {
            renderGroupedDependencyRows(details, row, usageMode, summary.rows);
          } else {
            renderUsageRows(details, row, MAX_INITIAL_USAGE_ROWS, usageMode);
          }
        });
        detailsByRowId.set(row.id, { details, row });
        tbody.append(item, detailsRow);
      });
      };
      filterInput.addEventListener("input", () => {
        filterQuery = filterInput.value;
        visibleRows = getVisibleRows();
        renderTableRows();
        updateSortHeaderState();
      });
      table.querySelectorAll(".graph-health-sort-button").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.sortKey || "";
          if (!key) return;
          sortState = {
            key,
            direction: sortState.key === key && sortState.direction === "asc" ? "desc" : "asc"
          };
          visibleRows = getVisibleRows();
          renderTableRows();
          updateSortHeaderState();
        });
      });
      renderTableRows();
      updateSortHeaderState();
      container.appendChild(table);
    }

    function renderGraphHealthPanel(activeTab) {
      return renderGraphHealthSummary(graphHealthPanel, activeTab);
    }

    async function getMavenRecoverySourceRootPath(activeTab) {
      const fallback = typeof getOriginalSourceRootPath === "function" ? String(getOriginalSourceRootPath() || "").trim() : "";
      if (fallback) {
        logMavenRecoveryHealth("info", "Using active original source root", {
          sourceRootPath: fallback
        });
        return fallback;
      }
      logMavenRecoveryHealth("info", "Resolving source root for health report", {
        tabId: activeTab?.id || "",
        title: activeTab?.title || "",
        seeds: getHealthReportProjectSearchSeeds(activeTab)
      });
      const seeds = getHealthReportProjectSearchSeeds(activeTab);
      for (const seedPath of seeds) {
        const projectFolder = await findMdEditorProjectRootFromPath(seedPath);
        if (!projectFolder) continue;
        const metadata = await readHealthReportProjectMetadata(projectFolder);
        if (metadata?.sourceRootPath) {
          logMavenRecoveryHealth("info", "Resolved source root from generated project metadata", {
            projectFolder,
            sourceRootPath: metadata.sourceRootPath
          });
          return metadata.sourceRootPath;
        }
      }
      logMavenRecoveryHealth("warning", "Source root metadata lookup finished", {
        sourceRootPath: "",
        found: false
      });
      return "";
    }

    function setMavenRecoveryButtonBusy(button, busy) {
      if (!button) return;
      button.disabled = busy;
      button.classList.toggle("is-loading", busy);
      button.innerHTML = busy
        ? '<i class="bi bi-arrow-repeat" aria-hidden="true"></i> Creating...'
        : '<i class="bi bi-download" aria-hidden="true"></i> Create Maven Recovery';
    }

    function withMavenRecoveryTimeout(promise, message, timeoutMs = 20000) {
      let timeoutId = null;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      });
      return Promise.race([promise, timeout]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
    }

    function waitForMavenRecoveryButtonPaint() {
      if (typeof requestAnimationFrame !== "function") return Promise.resolve();
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    async function getMavenRecoveryProjectContext(activeTab) {
      const sourceRootPath = await getMavenRecoverySourceRootPath(activeTab);
      let generatedProjectRootPath = "";
      const seeds = getHealthReportProjectSearchSeeds(activeTab);
      for (const seedPath of seeds) {
        const projectFolder = await findMdEditorProjectRootFromPath(seedPath);
        if (projectFolder) {
          generatedProjectRootPath = projectFolder;
          break;
        }
      }
      return { sourceRootPath, generatedProjectRootPath };
    }

    function createMavenRecoveryUpdateContext(dependencySummary, packageSummary) {
      const rowsBySymbol = new Map((dependencySummary?.rows || []).map((row) => [row.qualifiedName, row]));
      const packages = (packageSummary?.packages || []).map((entry) => {
        const affectedMarkdownFiles = new Set();
        const missingDependencyNodeIds = new Set();
        const resolvedSymbols = new Set();
        (entry.symbols || []).forEach((symbol) => {
          const symbolName = String(symbol?.symbol || "").trim();
          if (symbolName) resolvedSymbols.add(symbolName);
          const row = rowsBySymbol.get(symbol.symbol) || {};
          if (row.id) missingDependencyNodeIds.add(row.id);
          (row.usages || []).forEach((usage) => {
            const markdownPath = usage.markdown?.path || usage.path || "";
            if (markdownPath) affectedMarkdownFiles.add(markdownPath);
          });
        });
        return {
          packageName: entry.packageName,
          resolvedSymbols: Array.from(resolvedSymbols).sort((a, b) => a.localeCompare(b)),
          affectedMarkdownFiles: Array.from(affectedMarkdownFiles).sort((a, b) => a.localeCompare(b)),
          missingDependencyNodeIds: Array.from(missingDependencyNodeIds).sort((a, b) => a.localeCompare(b))
        };
      });
      return {
        packages
      };
    }

    function getGraphHealthPackageSummary(activeTab) {
      const snapshot = activeTab?.graphComparisonSnapshot || activeTab?.graphSnapshot || null;
      const folderName = snapshot?.folderName || activeTab?.folderName || activeTab?.title || "";
      return graphPackageSummary.aggregateMissingPackageSummary(aggregateMissingDependencies(snapshot), folderName);
    }

    async function saveGraphHealthReport(activeTab, format) {
      try {
        const summary = getGraphHealthPackageSummary(activeTab);
        const reportOptions = { title: activeTab?.folderName || activeTab?.title || "Graph Health" };
        const neutralinoRuntime = deps?.Neutralino;
        const canChooseDestination = neutralinoRuntime?.os?.showFolderDialog
          && neutralinoRuntime?.filesystem?.writeFile;
        if (!canChooseDestination) {
          return graphPackageSummary.downloadPackageSummaryExport(summary, format, reportOptions);
        }

        const report = graphPackageSummary.createPackageSummaryExport(summary, format, reportOptions);
        const folderOptions = activeFolderPath ? { defaultPath: activeFolderPath } : undefined;
        const destinationFolder = await neutralinoRuntime.os.showFolderDialog("Select graph report destination folder", folderOptions);
        if (!destinationFolder) return null;

        const destinationPath = joinPath(destinationFolder, report.fileName);
        await neutralinoRuntime.filesystem.writeFile(destinationPath, report.content);
        alert(`Graph report saved to:\n${destinationPath}`);
        return { ...report, destinationPath };
      } catch (error) {
        console.error("Failed to save graph health report:", error);
        alert("Failed to save graph report: " + (error?.message || error || "Unknown error"));
        return null;
      }
    }

    function openGraphHealthReportExportDialog(activeTab) {
      document.querySelector(".graph-health-report-export-modal")?.remove();
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay graph-health-report-export-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "graph-health-report-export-title");
      overlay.innerHTML = `
        <div class="reset-modal-box">
          <h2 id="graph-health-report-export-title">Save Graph Report</h2>
          <p>Choose the report format to save.</p>
          <div class="graph-health-package-actions">
            <button class="reset-modal-btn" type="button" data-graph-health-report-format="markdown">Markdown</button>
            <button class="reset-modal-btn" type="button" data-graph-health-report-format="csv">CSV</button>
            <button class="reset-modal-btn" type="button" data-graph-health-report-format="json">JSON</button>
            <button class="reset-modal-btn graph-health-report-export-cancel" type="button">Cancel</button>
          </div>
        </div>
      `;

      const closeDialog = () => overlay.remove();
      overlay.querySelector(".graph-health-report-export-cancel").addEventListener("click", closeDialog);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDialog();
      });
      overlay.querySelectorAll("[data-graph-health-report-format]").forEach((button) => {
        button.addEventListener("click", async () => {
          const format = button.dataset.graphHealthReportFormat || "";
          closeDialog();
          await saveGraphHealthReport(activeTab, format);
        });
      });

      document.body.appendChild(overlay);
      overlay.querySelector("[data-graph-health-report-format]")?.focus();
      return overlay;
    }

    function renderGraphHealthReportView(container, activeTab, options = {}) {
      if (!container || !activeTab) return null;
      document.querySelectorAll(".graph-quick-action").forEach((node) => node.classList.add("hidden"));
      if (graphViewToolbar) graphViewToolbar.classList.add("hidden");
      const cacheKey = activeTab.id || "";
      const signature = options.signature || "";
      const cached = cacheKey ? healthReportViewCache.get(cacheKey) : null;
      if (cached?.wrapper && cached.signature === signature) {
        if (cached.wrapper.parentElement !== container) container.appendChild(cached.wrapper);
        cached.wrapper.classList.remove("hidden");
        updateSaveCurrentFileButtons();
        return { wrapper: cached.wrapper, signature, reused: true };
      }
      if (cached?.wrapper) cached.wrapper.remove();

      const wrapper = document.createElement("div");
      wrapper.className = "graph-tab-render graph-health-report-render";
      wrapper.dataset.graphTabId = activeTab.id;
      const shell = document.createElement("div");
      shell.className = "graph-health-report-view";
      const header = document.createElement("div");
      header.className = "graph-health-report-header";
      const title = document.createElement("div");
      title.innerHTML = `
        <p class="graph-health-report-kicker">Graph Health</p>
        <h2>Missing Dependencies</h2>
      `;
      const actions = document.createElement("div");
      actions.className = "graph-health-report-actions";
      const packageButton = document.createElement("button");
      packageButton.className = "tool-button graph-health-package-button";
      packageButton.type = "button";
      packageButton.title = "Show missing dependency groups";
      packageButton.innerHTML = '<i class="bi bi-boxes" aria-hidden="true"></i> Dependency Groups';
      packageButton.addEventListener("click", () => {
        const summary = getGraphHealthPackageSummary(activeTab);
        graphPackageSummary.openPackageSummaryModal(summary, {
          title: activeTab.folderName || activeTab.title || "Graph Health"
        });
      });
      const mavenButton = document.createElement("button");
      mavenButton.className = "tool-button graph-health-maven-button graph-health-primary-action";
      mavenButton.type = "button";
      mavenButton.title = "Create Maven recovery files for Java missing dependencies";
      mavenButton.innerHTML = '<i class="bi bi-download" aria-hidden="true"></i> Create Maven Recovery';
      const getPackageSummary = () => getGraphHealthPackageSummary(activeTab);
      const hasJavaPackages = () => (getPackageSummary().packages || []).some((entry) => {
        const languages = Array.isArray(entry.languages)
          ? entry.languages
          : Array.from(new Set((entry.symbols || []).map((symbol) => symbol.language || "unknown")));
        return languages.some((language) => String(language || "").toLowerCase() === "java");
      });
      mavenButton.disabled = !hasJavaPackages();
      mavenButton.addEventListener("click", async () => {
        logMavenRecoveryHealth("info", "Create Maven Recovery clicked", {
          tabId: activeTab?.id || "",
          title: activeTab?.title || ""
        });
        if (!graphMavenRecovery?.createRecoveryWorkspace) {
          logMavenRecoveryHealth("error", "Graph Maven recovery module is unavailable");
          alert("Maven recovery file generation is unavailable in this build.");
          return;
        }
        if (!hasJavaPackages()) {
          logMavenRecoveryHealth("warning", "No Java missing dependency groups were available");
          alert("No Java missing dependency groups are available for Maven recovery.");
          return;
        }
        setMavenRecoveryButtonBusy(mavenButton, true);
        try {
          logMavenRecoveryHealth("info", "Resolving recovery source root before destination prompt");
          const projectContext = await withMavenRecoveryTimeout(
            getMavenRecoveryProjectContext(activeTab),
            "Timed out while resolving the original source root for Maven recovery."
          );
          const sourceRootPath = projectContext.sourceRootPath;
          if (!sourceRootPath) {
            setMavenRecoveryButtonBusy(mavenButton, false);
            alert("Original source root metadata was not found for this generated project. Re-run the converter or open the generated project folder that contains .md-editor/_md_editor_project.json.");
            return;
          }
          logMavenRecoveryHealth("info", "Opening recovery output folder prompt", {
            sourceRootPath
          });
          const outputFolderPath = await graphMavenRecovery.chooseRecoveryOutputFolder(sourceRootPath);
          if (!outputFolderPath) {
            logMavenRecoveryHealth("info", "Maven recovery destination selection cancelled");
            return;
          }
          const snapshot = activeTab.graphComparisonSnapshot || activeTab.graphSnapshot || null;
          const dependencySummary = aggregateMissingDependencies(snapshot);
          const packageSummary = graphPackageSummary.aggregateMissingPackageSummary(dependencySummary, snapshot?.folderName || activeTab.folderName || activeTab.title || "");
          const result = await graphMavenRecovery.createRecoveryWorkspace(packageSummary, {
            sourceRootPath,
            outputFolderPath,
            generatedProjectRootPath: projectContext.generatedProjectRootPath,
            updateContext: createMavenRecoveryUpdateContext(dependencySummary, packageSummary)
          });
          setMavenRecoveryButtonBusy(mavenButton, false);
          mavenButton.disabled = !hasJavaPackages();
          await waitForMavenRecoveryButtonPaint();
          openMavenRecoveryNotificationModal(result);
        } catch (error) {
          logMavenRecoveryHealth("error", "Failed to create Maven recovery files", {
            message: error?.message || String(error || "")
          });
          setMavenRecoveryButtonBusy(mavenButton, false);
          mavenButton.disabled = !hasJavaPackages();
          await waitForMavenRecoveryButtonPaint();
          alert(error?.message || String(error || "Unable to create Maven recovery files."));
        } finally {
          setMavenRecoveryButtonBusy(mavenButton, false);
          mavenButton.disabled = !hasJavaPackages();
        }
      });
      const saveButton = document.createElement("button");
      saveButton.className = "tool-button graph-health-save-button";
      saveButton.type = "button";
      saveButton.title = "Save the missing dependency report as Markdown, CSV, or JSON";
      saveButton.innerHTML = '<i class="bi bi-save" aria-hidden="true"></i> Save Graph Report';
      saveButton.addEventListener("click", () => openGraphHealthReportExportDialog(activeTab));
      actions.append(mavenButton, packageButton, saveButton);
      header.append(title, actions);
      const body = document.createElement("div");
      body.className = "graph-health-report-body";
      shell.append(header, body);
      wrapper.appendChild(shell);
      container.appendChild(wrapper);
      renderGraphHealthSummary(body, activeTab, { large: true });
      updateSaveCurrentFileButtons();
      if (cacheKey) healthReportViewCache.set(cacheKey, { signature, wrapper });
      return { wrapper, signature, reused: false };
    }

    async function openGraphHealthReportTab(sourceGraphTab) {
      const sourceTab = sourceGraphTab || getActiveGraphTab();
      if (!sourceTab?.graphSnapshot) {
        alert("Build or open a graph before opening the health report.");
        return null;
      }
      const existingTab = (tabs || []).find((tab) => (
        tab?.type === "graph"
        && tab.graphViewKind === "health-report"
        && tab.graphHealthSourceTabId === sourceTab.id
      ));
      if (existingTab) {
        switchTab(existingTab.id);
        return existingTab;
      }
      const title = `Health report: ${sourceTab.folderName || sourceTab.title || "Graph"}`;
      const reportTab = await createGraphTab(sourceTab.folderName || sourceTab.title || "Graph View", {
        graphSnapshot: sourceTab.graphSnapshot,
        graphViewConfig: sourceTab.graphViewConfig,
        graphLayout: sourceTab.graphLayout,
        openedSource: sourceTab.openedSource || null,
        skipGraphRenderWarning: true
      });
      if (!reportTab) return null;
      reportTab.title = title;
      reportTab.graphViewKind = "health-report";
      reportTab.graphHealthSourceTabId = sourceTab.id;
      reportTab.keepSavedGraphMode = sourceTab.keepSavedGraphMode;
      reportTab.sourceFileName = sourceTab.sourceFileName;
      reportTab.sourceFileHandle = sourceTab.sourceFileHandle;
      reportTab.sourceFilePath = sourceTab.sourceFilePath;
      reportTab.graphScopeKey = sourceTab.graphScopeKey;
      reportTab.openedSource = sourceTab.openedSource || reportTab.openedSource || null;
      reportTab.graphDocument = sourceTab.graphDocument;
      tabs.push(reportTab);
      saveTabsToStorage(tabs);
      switchTab(reportTab.id);
      return reportTab;
    }

    function getHealthReportOpenContextTab(button) {
      const tabId = button?.dataset?.graphTabId
        || button?.closest?.(".graph-tab-render")?.dataset?.graphTabId
        || "";
      if (tabId) {
        const tab = (tabs || []).find((candidate) => candidate?.id === tabId);
        if (tab) return tab;
      }
      return getActiveGraphTab();
    }

    document.addEventListener("click", async (event) => {
      const button = event.target.closest(".graph-health-open-file, .graph-health-affected-file-link");
      if (!button) return;
      const activeTab = getHealthReportOpenContextTab(button);
      const nodeId = button.dataset.fileId || "";
      const mode = button.dataset.fileMode === HEALTH_USAGE_MODE_ORIGINAL ? HEALTH_USAGE_MODE_ORIGINAL : HEALTH_USAGE_MODE_MARKDOWN;
      const graphNode = (activeTab?.graphSnapshot?.nodes || []).find((candidate) => candidate.id === nodeId) || {};
      const snapshotFile = getHealthGraphFileEntries(activeTab?.graphSnapshot).find((file) => file.id === nodeId) || createGraphFileDataFromNode?.(graphNode) || {};
      const source = createHealthReportOpenSource(snapshotFile, graphNode, mode);
      try {
        let resolvedPath = source.path;
        if (mode === HEALTH_USAGE_MODE_ORIGINAL) {
          const resolvedSource = await resolveHealthReportOriginalSourcePath(source, activeTab);
          if (resolvedSource?.needsSourceRoot || !resolvedSource?.resolvedPath) {
            alertHealthReportOpenFailure("missing-source-root", {
              nodeId,
              mode,
              source,
              resolvedSource
            });
            return;
          }
          resolvedPath = resolvedSource.resolvedPath;
          if (!await healthReportPathExists(resolvedPath)) {
            alertHealthReportOpenFailure("missing-original-file", {
              nodeId,
              mode,
              source,
              resolvedPath,
              resolvedSource
            });
            return;
          }
        } else if (mode === HEALTH_USAGE_MODE_MARKDOWN) {
          const recovery = await resolveHealthReportMarkdownSourceRecovery(source, activeTab);
          if (recovery?.path) {
            if (recovery.projectRootPath && typeof openFolderTreeFromNeutralinoPath === "function") {
              await openFolderTreeFromNeutralinoPath(recovery.projectRootPath);
            }
            resolvedPath = recovery.path;
          }
        }
        await openDocumentSourceFile({
          name: mode === HEALTH_USAGE_MODE_ORIGINAL ? getFileName(resolvedPath) : source.name,
          handle: source.handle,
          path: resolvedPath,
          content: source.content
        }, { temporary: false });
      } catch (error) {
        alertHealthReportOpenFailure("open-failed", {
          nodeId,
          mode,
          source,
          resolvedPath: source.path,
          error
        });
      }
    });

    api.aggregateMissingDependencies = aggregateMissingDependencies;
    api.resolveHealthReportSourcePath = resolveHealthReportSourcePath;
    api.createHealthReportOpenSource = createHealthReportOpenSource;
    api.findMdEditorProjectRootFromPath = findMdEditorProjectRootFromPath;
    api.findGeneratedProjectFolderFromPath = findHealthReportGeneratedProjectFolderFromPath;
    api.readHealthReportProjectMetadata = readHealthReportProjectMetadata;
    api.resolveHealthReportOriginalSourcePath = resolveHealthReportOriginalSourcePath;
    api.getHealthReportProjectSearchSeeds = getHealthReportProjectSearchSeeds;
    api.resolveHealthReportMarkdownSourceRecovery = resolveHealthReportMarkdownSourceRecovery;
    api.recoverHealthReportMarkdownSourcePath = recoverHealthReportMarkdownSourcePath;
    api.confirmHealthReportProjectFolderSearch = confirmHealthReportProjectFolderSearch;
    api.createHealthReportOpenFailureDetails = createHealthReportOpenFailureDetails;
    api.createHealthReportOpenFailureMessage = createHealthReportOpenFailureMessage;
    api.sortMissingDependencyRows = sortMissingDependencyRows;
    api.groupMissingDependencyRows = groupMissingDependencyRows;
    api.filterMissingDependencyRows = filterMissingDependencyRows;
    api.getMissingDependencyContextClassNames = getMissingDependencyContextClassNames;
    api.getMissingDependencyContextDependentClassNames = getMissingDependencyContextDependentClassNames;
    api.createMavenRecoveryUpdateContext = createMavenRecoveryUpdateContext;
    api.getHealthReportOpenContextTab = getHealthReportOpenContextTab;
    api.getMavenRecoverySourceRootPath = getMavenRecoverySourceRootPath;
    api.renderGraphHealthPanel = renderGraphHealthPanel;
    api.renderGraphHealthReportView = renderGraphHealthReportView;
    api.openGraphHealthReportTab = openGraphHealthReportTab;
    }

    return api;
  };
})(window);
