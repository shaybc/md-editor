(function(global) {
  global.registerMarkdownViewerGraphMavenRecovery = function registerMarkdownViewerGraphMavenRecovery(app, deps) {
    const api = {};

    with (deps) {
    const RECOVERY_FOLDER = "md-editor-missing-dependencies";
    const POM_FILE = "pom.xml";
    const BATCH_FILE = "fetch-missing-dependencies.bat";
    const UNMAPPED_FILE = "unmapped-packages.txt";
    const RESOLVED_TREE_FILE = "resolved-runtime-dependency-tree.json";
    const LIB_EXTERNAL_FOLDER = "lib/external";
    const MD_EDITOR_DIR = ".md-editor";
    const MD_EDITOR_RECOVERY_DIR = "recovery";
    const RECOVERY_CONTEXT_FILE = "maven-recovery-context.json";

    const MAVEN_COORDINATE_MAP_URL = "js/graph/maven-coordinate-map.json";
    let mavenCoordinateMap = normalizeMavenCoordinateMap(deps?.mavenCoordinateMap || []);
    let mavenCoordinateMapLoadPromise = null;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function joinLocalPath(folderPath, relativePath) {
      if (typeof joinPath === "function") return joinPath(folderPath, relativePath);
      return normalizePath(folderPath).replace(/\/+$/, "") + "/" + normalizePath(relativePath).replace(/^\/+/, "");
    }

    function toWindowsBatchPath(value) {
      return normalizePath(value).replace(/\//g, "\\");
    }

    function getParentFolderPath(filePath) {
      const normalized = normalizePath(filePath);
      const index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : "";
    }

    function logMavenRecovery(level, message, details) {
      const line = `[maven-recovery] ${message}${details ? " " + JSON.stringify(details) : ""}`;
      const logger = level === "error" ? console.error : level === "warning" ? console.warn : console.debug;
      if (typeof logger === "function") {
        logger.call(console, `[maven-recovery] ${message}`, details || "");
      }
      if (typeof appDebugLog === "function") {
        void appDebugLog(level, `[maven-recovery] ${message}`, details);
      }
    }

    function getMavenCoordinateMapUrl() {
      return String(deps?.mavenCoordinateMapUrl || MAVEN_COORDINATE_MAP_URL);
    }

    function normalizeMavenCoordinateEntry(entry) {
      if (Array.isArray(entry)) {
        const [packagePrefix, coordinate] = entry;
        return normalizeMavenCoordinateEntry({ packagePrefix, ...(coordinate || {}) });
      }
      const packagePrefix = normalizePackageName(entry?.packagePrefix || entry?.prefix || entry?.package || "");
      const groupId = String(entry?.groupId || "").trim();
      const artifactId = String(entry?.artifactId || "").trim();
      const version = String(entry?.version || "").trim();
      if (!packagePrefix || !groupId || !artifactId || !version) return null;
      const coordinate = {
        groupId,
        artifactId,
        version
      };
      const scope = String(entry?.scope || "").trim();
      const notes = String(entry?.notes || "").trim();
      if (scope) coordinate.scope = scope;
      if (notes) coordinate.notes = notes;
      return [packagePrefix, coordinate];
    }

    function normalizeMavenCoordinateMap(value) {
      const entries = Array.isArray(value) ? value : Array.isArray(value?.mappings) ? value.mappings : [];
      return Object.freeze(entries
        .map(normalizeMavenCoordinateEntry)
        .filter(Boolean)
        .sort((a, b) => a[0].localeCompare(b[0])));
    }

    async function loadMavenCoordinateMap() {
      if (mavenCoordinateMap.length || mavenCoordinateMapLoadPromise) return mavenCoordinateMapLoadPromise || mavenCoordinateMap;
      if (typeof fetch !== "function") return mavenCoordinateMap;
      const url = getMavenCoordinateMapUrl();
      mavenCoordinateMapLoadPromise = fetch(url, { cache: "no-cache" })
        .then((response) => {
          if (!response?.ok) throw new Error(`Unable to load Maven coordinate map: ${response?.status || "unknown"}`);
          return response.json();
        })
        .then((payload) => {
          mavenCoordinateMap = normalizeMavenCoordinateMap(payload);
          logMavenRecovery("info", "Loaded Maven coordinate map", {
            url,
            entries: mavenCoordinateMap.length
          });
          return mavenCoordinateMap;
        })
        .catch((error) => {
          mavenCoordinateMapLoadPromise = null;
          logMavenRecovery("warning", "Unable to load Maven coordinate map", {
            url,
            message: error?.message || String(error || "")
          });
          return mavenCoordinateMap;
        });
      return mavenCoordinateMapLoadPromise;
    }

    async function ensureMavenCoordinateMapLoaded() {
      await loadMavenCoordinateMap();
      if (!mavenCoordinateMap.length) {
        throw new Error("Maven coordinate map is empty or unavailable.");
      }
      return mavenCoordinateMap;
    }

    function normalizePackageName(value) {
      return String(value || "").trim().replace(/\.\*$/, "").replace(/\.$/, "");
    }

    function packageMatchesPrefix(packageName, prefix) {
      return packageName === prefix || packageName.startsWith(prefix + ".");
    }

    function findMavenCoordinate(packageName) {
      const normalized = normalizePackageName(packageName);
      if (!normalized) return null;
      return mavenCoordinateMap
        .filter(([prefix]) => packageMatchesPrefix(normalized, prefix))
        .sort((a, b) => b[0].length - a[0].length)[0] || null;
    }

    function coordinateKey(coordinate) {
      return [coordinate.groupId, coordinate.artifactId, coordinate.version].join(":");
    }

    function xmlEscape(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function sanitizeXmlComment(value) {
      return String(value || "").replace(/--/g, "- -").replace(/^-/, " -");
    }

    function isJavaPackageEntry(entry) {
      const languages = Array.isArray(entry?.languages)
        ? entry.languages
        : Array.from(new Set((entry?.symbols || []).map((symbol) => symbol.language || "unknown")));
      return languages.some((language) => String(language || "").toLowerCase() === "java");
    }

    function createMavenRecoveryModel(packageSummary) {
      const mappedByCoordinate = new Map();
      const unmappedPackages = [];
      const packages = (packageSummary?.packages || [])
        .filter(isJavaPackageEntry)
        .map((entry) => normalizePackageName(entry.packageName))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      packages.forEach((packageName) => {
        const match = findMavenCoordinate(packageName);
        if (!match) {
          unmappedPackages.push(packageName);
          return;
        }
        const [matchedPrefix, coordinate] = match;
        const key = coordinateKey(coordinate);
        if (!mappedByCoordinate.has(key)) {
          mappedByCoordinate.set(key, {
            ...coordinate,
            matchedPrefix,
            packages: []
          });
        }
        mappedByCoordinate.get(key).packages.push(packageName);
      });

      return {
        generatedAt: new Date().toISOString(),
        folderName: packageSummary?.folderName || "",
        mappedDependencies: Array.from(mappedByCoordinate.values()),
        unmappedPackages
      };
    }

    function formatPomXml(model) {
      const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<project xmlns="http://maven.apache.org/POM/4.0.0"',
        '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
        "  <modelVersion>4.0.0</modelVersion>",
        "  <groupId>recover</groupId>",
        "  <artifactId>md-editor-missing-dependencies</artifactId>",
        "  <version>1.0</version>",
        "  <dependencies>"
      ];

      model.mappedDependencies.forEach((dependency) => {
        lines.push(`    <!-- Missing package group(s): ${sanitizeXmlComment(dependency.packages.join(", "))} -->`);
        lines.push("    <dependency>");
        lines.push(`      <groupId>${xmlEscape(dependency.groupId)}</groupId>`);
        lines.push(`      <artifactId>${xmlEscape(dependency.artifactId)}</artifactId>`);
        lines.push(`      <version>${xmlEscape(dependency.version)}</version>`);
        lines.push("    </dependency>");
      });

      if (model.unmappedPackages.length) {
        lines.push("    <!-- Unmapped package root(s). Add dependency blocks manually if needed:");
        model.unmappedPackages.forEach((packageName) => {
          lines.push(`         TODO ${sanitizeXmlComment(packageName)}`);
        });
        lines.push("    -->");
      }

      lines.push("  </dependencies>");
      lines.push("</project>");
      return lines.join("\n") + "\n";
    }

    function formatFetchBatch(targetJarFolder = "..\\lib\\external", mavenInvocation = {}) {
      const targetPath = toWindowsBatchPath(targetJarFolder || "..\\lib\\external");
      const runner = String(mavenInvocation.runner || "mvn");
      const commonArguments = Array.isArray(mavenInvocation.arguments) ? mavenInvocation.arguments.join(" ") : "";
      const mavenPrefix = ["call", runner, commonArguments].filter(Boolean).join(" ");
      return [
        "@echo off",
        "setlocal",
        "cd /d %~dp0",
        `set "TARGET_LIB=${targetPath}"`,
        "if not exist \"%TARGET_LIB%\" mkdir \"%TARGET_LIB%\"",
        "call mvn -f pom.xml org.apache.maven.plugins:maven-dependency-plugin:3.8.1:tree \"-DoutputType=json\" \"-DoutputFile=resolved-runtime-dependency-tree.json\" \"-Dscope=runtime\"",
        "if errorlevel 1 (",
        "  echo.",
        "  echo Maven dependency tree resolution failed.",
        "  exit /b %errorlevel%",
        ")",
        "call mvn -f pom.xml org.apache.maven.plugins:maven-dependency-plugin:3.8.1:copy-dependencies \"-DoutputDirectory=%TARGET_LIB%\" \"-DincludeScope=runtime\" \"-Dmdep.useRepositoryLayout=false\"",
        "if errorlevel 1 (",
        "  echo.",
        "  echo Maven dependency recovery failed.",
        "  exit /b %errorlevel%",
        ")",
        "echo.",
        "echo Missing dependency jars were copied to %TARGET_LIB%",
        "endlocal"
      ].join("\r\n").replace(/^call mvn /gm, mavenPrefix + " ") + "\r\n";
    }

    function formatUnmappedPackages(model) {
      if (!model.unmappedPackages.length) return "";
      return [
        "# Unmapped missing package roots",
        "# Add matching Maven dependency blocks to pom.xml if Maven Central has the library.",
        "",
        ...model.unmappedPackages
      ].join("\n") + "\n";
    }

    function expectedJarFileName(dependency) {
      const artifactId = String(dependency?.artifactId || "").trim();
      const version = String(dependency?.version || "").trim();
      return artifactId && version ? `${artifactId}-${version}.jar` : "";
    }

    function createPackageLookup(updateContext) {
      const lookup = new Map();
      (updateContext?.packages || []).forEach((entry) => {
        const packageName = normalizePackageName(entry?.packageName || entry?.groupName || "");
        if (packageName) lookup.set(packageName, entry);
      });
      return lookup;
    }

    function getPackageContext(packageLookup, packageName) {
      return packageLookup.get(normalizePackageName(packageName)) || {};
    }

    function uniqueSorted(values) {
      return Array.from(new Set((values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
    }

    function createRecoveryContextPayload(packageSummary, model, paths, options = {}) {
      const updateContext = options.updateContext || {};
      const packageLookup = createPackageLookup(updateContext);
      const mappedDependencies = model.mappedDependencies.map((dependency) => {
        const jarFileName = expectedJarFileName(dependency);
        const packageContexts = (dependency.packages || []).map((packageName) => getPackageContext(packageLookup, packageName));
        return {
          coordinateKey: coordinateKey(dependency),
          expectedJarFileName: jarFileName,
          expectedJarRelativePath: jarFileName ? joinLocalPath(LIB_EXTERNAL_FOLDER, jarFileName) : "",
          resolvedPackages: uniqueSorted(dependency.packages || []),
          resolvedSymbols: uniqueSorted(packageContexts.flatMap((entry) => entry.resolvedSymbols || [])),
          affectedMarkdownFiles: uniqueSorted(packageContexts.flatMap((entry) => entry.affectedMarkdownFiles || [])),
          missingDependencyNodeIds: uniqueSorted(packageContexts.flatMap((entry) => entry.missingDependencyNodeIds || []))
        };
      }).sort((a, b) => a.coordinateKey.localeCompare(b.coordinateKey));

      return {
        schemaVersion: 2,
        type: "md-editor-dependency-recovery-context",
        status: "pending",
        recoveryKind: "java-maven",
        generatedAt: new Date().toISOString(),
        generatedProjectRootPath: normalizePath(options.generatedProjectRootPath || ""),
        sourceRootPath: normalizePath(options.sourceRootPath || ""),
        batchPath: paths.batchPath || "",
        resolvedDependencyTreePath: paths.resolvedDependencyTreePath || "",
        targetJarRelativeFolder: LIB_EXTERNAL_FOLDER,
        mappedDependencies,
        unmappedPackages: uniqueSorted(model.unmappedPackages)
      };
    }

    function createMavenRecoveryFiles(packageSummary, options = {}) {
      const model = createMavenRecoveryModel(packageSummary);
      return {
        model,
        pomXml: formatPomXml(model),
        batch: formatFetchBatch(options.targetJarFolder, options.mavenInvocation),
        unmappedPackages: formatUnmappedPackages(model)
      };
    }

    async function pathExists(path) {
      if (!path || !Neutralino?.filesystem?.getStats) return false;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    async function ensureDirectory(path) {
      if (!path || !Neutralino?.filesystem?.createDirectory) return;
      if (await pathExists(path)) return;
      try {
        await Neutralino.filesystem.createDirectory(path);
      } catch (error) {
        const message = String(error?.message || error || "").toLowerCase();
        if (!message.includes("exist") && !message.includes("already")) throw error;
      }
    }

    async function writeMavenRecoveryFiles(sourceRootPath, files, options = {}) {
      const sourceRoot = normalizePath(sourceRootPath);
      if (!sourceRoot) throw new Error("No original source root was selected.");
      const recoveryFolder = normalizePath(options.outputFolderPath) || joinLocalPath(sourceRoot, RECOVERY_FOLDER);
      const targetJarFolder = joinLocalPath(sourceRoot, LIB_EXTERNAL_FOLDER);
      const generatedProjectRootPath = normalizePath(options.generatedProjectRootPath);
      const contextFolder = generatedProjectRootPath
        ? joinLocalPath(joinLocalPath(generatedProjectRootPath, MD_EDITOR_DIR), MD_EDITOR_RECOVERY_DIR)
        : "";
      const contextPath = contextFolder ? joinLocalPath(contextFolder, RECOVERY_CONTEXT_FILE) : "";
      logMavenRecovery("info", "Writing Maven recovery files", {
        sourceRoot,
        generatedProjectRootPath,
        recoveryFolder,
        contextPath,
        targetJarFolder,
        mappedDependencies: files.model?.mappedDependencies?.length || 0,
        unmappedPackages: files.model?.unmappedPackages?.length || 0
      });
      await ensureDirectory(recoveryFolder);
      await ensureDirectory(joinLocalPath(sourceRoot, "lib"));
      await ensureDirectory(targetJarFolder);
      if (contextFolder) await ensureDirectory(contextFolder);
      await Neutralino.filesystem.writeFile(joinLocalPath(recoveryFolder, POM_FILE), files.pomXml);
      logMavenRecovery("debug", "Wrote Maven recovery pom", {
        path: joinLocalPath(recoveryFolder, POM_FILE)
      });
      await Neutralino.filesystem.writeFile(joinLocalPath(recoveryFolder, BATCH_FILE), files.batch);
      logMavenRecovery("debug", "Wrote Maven recovery batch", {
        path: joinLocalPath(recoveryFolder, BATCH_FILE)
      });
      if (files.unmappedPackages) {
        await Neutralino.filesystem.writeFile(joinLocalPath(recoveryFolder, UNMAPPED_FILE), files.unmappedPackages);
        logMavenRecovery("debug", "Wrote Maven recovery unmapped packages", {
          path: joinLocalPath(recoveryFolder, UNMAPPED_FILE)
        });
      }
      if (contextPath) {
        const provisionalPaths = {
          recoveryFolder,
          targetJarFolder,
          pomPath: joinLocalPath(recoveryFolder, POM_FILE),
          batchPath: joinLocalPath(recoveryFolder, BATCH_FILE),
          resolvedDependencyTreePath: joinLocalPath(recoveryFolder, RESOLVED_TREE_FILE),
          unmappedPath: files.unmappedPackages ? joinLocalPath(recoveryFolder, UNMAPPED_FILE) : "",
          contextPath
        };
        const contextPayload = createRecoveryContextPayload(options.packageSummary, files.model, provisionalPaths, {
          generatedProjectRootPath,
          sourceRootPath: sourceRoot,
          updateContext: options.updateContext
        });
        await Neutralino.filesystem.writeFile(contextPath, JSON.stringify(contextPayload, null, 2) + "\n");
        logMavenRecovery("debug", "Wrote Maven recovery update context", {
          path: contextPath
        });
      }
      return {
        recoveryFolder,
        targetJarFolder,
        pomPath: joinLocalPath(recoveryFolder, POM_FILE),
        batchPath: joinLocalPath(recoveryFolder, BATCH_FILE),
        resolvedDependencyTreePath: joinLocalPath(recoveryFolder, RESOLVED_TREE_FILE),
        unmappedPath: files.unmappedPackages ? joinLocalPath(recoveryFolder, UNMAPPED_FILE) : "",
        contextPath
      };
    }

    async function chooseRecoveryOutputFolder(sourceRootPath) {
      if (!isNeutralinoRuntime?.() || !Neutralino?.os?.showFolderDialog) {
        throw new Error("Choosing a Maven recovery destination is available only in the desktop app.");
      }
      const sourceRoot = normalizePath(sourceRootPath);
      const defaultPath = sourceRoot || "";
      logMavenRecovery("info", "Opening Maven recovery destination picker", { defaultPath });
      const selectedPath = await Neutralino.os.showFolderDialog("Select Maven recovery output folder", defaultPath ? { defaultPath } : undefined);
      const normalized = normalizePath(selectedPath);
      logMavenRecovery(normalized ? "info" : "info", normalized ? "Maven recovery destination selected" : "Maven recovery destination picker cancelled", {
        selectedPath: normalized
      });
      return normalized;
    }

    async function resolveSourceRootForMavenRecovery() {
      const current = typeof getOriginalSourceRootPath === "function" ? getOriginalSourceRootPath() : "";
      if (current) return current;
      if (typeof loadSourceRootMetadata === "function") {
        const metadata = await loadSourceRootMetadata();
        if (metadata?.sourceRootPath) return metadata.sourceRootPath;
      }
      return "";
    }

    async function createRecoveryWorkspace(packageSummary, options = {}) {
      if (!isNeutralinoRuntime?.() || !Neutralino?.filesystem?.writeFile || !Neutralino?.filesystem?.createDirectory) {
        throw new Error("Maven recovery file generation is available only in the desktop app.");
      }
      const sourceRootPath = normalizePath(options.sourceRootPath) || await resolveSourceRootForMavenRecovery();
      if (!sourceRootPath) throw new Error("Original source root metadata was not found for this generated project.");
      const outputFolderPath = normalizePath(options.outputFolderPath);
      const targetJarFolder = joinLocalPath(sourceRootPath, LIB_EXTERNAL_FOLDER);
      await ensureMavenCoordinateMapLoaded();
      const resolvedRunner = deps.mavenRuntimeSettings?.resolveRunner
        ? await deps.mavenRuntimeSettings.resolveRunner({ projectRoot: sourceRootPath, workspaceRoot: sourceRootPath, osName: "Windows" })
        : { runner: "mvn.cmd", error: "" };
      if (resolvedRunner.error) throw new Error(resolvedRunner.error);
      const files = createMavenRecoveryFiles(packageSummary, {
        targetJarFolder,
        mavenInvocation: {
          runner: resolvedRunner.runner,
          arguments: deps.mavenRuntimeSettings?.getInvocationArguments?.() || []
        }
      });
      const paths = await writeMavenRecoveryFiles(sourceRootPath, files, {
        outputFolderPath,
        generatedProjectRootPath: options.generatedProjectRootPath,
        packageSummary,
        updateContext: options.updateContext
      });
      logMavenRecovery("info", "Maven recovery files created", {
        recoveryFolder: paths.recoveryFolder,
        contextPath: paths.contextPath,
        targetJarFolder: paths.targetJarFolder,
        mappedCount: files.model.mappedDependencies.length,
        unmappedCount: files.model.unmappedPackages.length
      });
      return {
        ...paths,
        model: files.model,
        mappedCount: files.model.mappedDependencies.length,
        unmappedCount: files.model.unmappedPackages.length
      };
    }

    async function runRecoveryBatch(batchPath) {
      const normalizedBatchPath = normalizePath(batchPath);
      if (!normalizedBatchPath) throw new Error("No Maven recovery batch file was provided.");
      if (!isNeutralinoRuntime?.() || !Neutralino?.os?.execCommand) {
        throw new Error("Running Maven recovery batch files is available only in the desktop app.");
      }
      const batchFolder = getParentFolderPath(normalizedBatchPath);
      const command = `cmd /c start "MD-Editor Maven Recovery" /D "${toWindowsBatchPath(batchFolder)}" cmd /k call "${toWindowsBatchPath(normalizedBatchPath)}"`;
      logMavenRecovery("info", "Running Maven recovery batch", {
        batchPath: normalizedBatchPath,
        batchFolder,
        command
      });
      const result = await Neutralino.os.execCommand(command);
      const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
      logMavenRecovery(exitCode ? "error" : "info", exitCode ? "Maven recovery batch launch failed" : "Maven recovery batch launched", {
        batchPath: normalizedBatchPath,
        exitCode,
        stdout: result?.stdOut || result?.stdout || "",
        stderr: result?.stdErr || result?.stderr || ""
      });
      if (exitCode) throw new Error(`Unable to launch Maven recovery batch. Exit code: ${exitCode}`);
      return result;
    }

    Object.assign(api, {
      RECOVERY_FOLDER,
      POM_FILE,
      BATCH_FILE,
      UNMAPPED_FILE,
      LIB_EXTERNAL_FOLDER,
      MD_EDITOR_DIR,
      MD_EDITOR_RECOVERY_DIR,
      RECOVERY_CONTEXT_FILE,
      createRecoveryContextPayload,
      MAVEN_COORDINATE_MAP_URL,
      createMavenRecoveryFiles,
      createMavenRecoveryModel,
      createRecoveryWorkspace,
      chooseRecoveryOutputFolder,
      ensureMavenCoordinateMapLoaded,
      findMavenCoordinate,
      formatFetchBatch,
      formatPomXml,
      formatUnmappedPackages,
      getMavenCoordinateMap: () => mavenCoordinateMap,
      loadMavenCoordinateMap,
      isJavaPackageEntry,
      runRecoveryBatch,
      writeMavenRecoveryFiles
    });
    }

    app.registerModule?.("graphMavenRecovery", api);
    return api;
  };
})(window);
