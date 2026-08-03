(function(global) {
  "use strict";

  /** Detects Java build systems, modules, and generated output roots for one workspace. */
  function registerMarkdownViewerJavaWorkspaceModel(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const cache = new Map();
    const MAX_SCANNED_DIRECTORIES = 5000;
    const STANDARD_JAVA_SOURCE_ROOT_PATTERN = /\/src\/(?:main|test)\/java$/i;
    const SKIPPED_DIRECTORY_NAMES = new Set([".git", ".md-editor", "node_modules", "target", "build", "bin", "out", ".gradle"]);

    function normalizePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function resolveStoredPath(workspaceRoot, path) {
      const normalized = normalizePath(path);
      return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")
        ? normalized
        : normalized === "." ? normalizePath(workspaceRoot) : joinPath(workspaceRoot, normalized);
    }

    function toRelativeModuleRoot(workspaceRoot, moduleRoot) {
      const root = normalizePath(workspaceRoot);
      const candidate = normalizePath(moduleRoot);
      if (candidate.toLowerCase() === root.toLowerCase()) return ".";
      return candidate.slice(root.length).replace(/^\/+/, "");
    }

    function findOwningModule(modules, path) {
      const normalized = normalizePath(path).toLowerCase();
      return modules
        .filter((module) => normalized === module.root.toLowerCase() || normalized.startsWith(`${module.root.toLowerCase()}/`))
        .sort((left, right) => right.root.length - left.root.length)[0] || null;
    }

    /** Resolve which detected modules JDT should import for one Java Build Path configuration. */
    function resolveAnalysisScope(workspaceRoot, inventory, projectConfiguration = {}) {
      const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
      const configured = projectConfiguration.analysisScope && typeof projectConfiguration.analysisScope === "object"
        ? projectConfiguration.analysisScope
        : {};
      const mode = configured.mode === "selected" ? "selected" : "all";
      const deselected = new Set(mode === "selected" ? configured.deselectedEntryIds || [] : []);
      const selectedIds = new Set(entries.filter((entry) => !deselected.has(entry.id)).map((entry) => entry.id));
      let dependencyAdded = true;
      while (dependencyAdded) {
        dependencyAdded = false;
        for (const entry of entries) {
          if (!selectedIds.has(entry.id)) continue;
          for (const dependencyId of entry.dependencies || []) {
            if (selectedIds.has(dependencyId)) continue;
            selectedIds.add(dependencyId);
            deselected.delete(dependencyId);
            dependencyAdded = true;
          }
        }
      }
      const selectedEntries = entries.filter((entry) => selectedIds.has(entry.id));
      const deselectedEntries = entries.filter((entry) => !selectedIds.has(entry.id));
      const standard = inventory?.buildSystem === "javac";
      const includedModuleRoots = standard
        ? (selectedEntries.length ? [normalizePath(workspaceRoot)] : [])
        : selectedEntries.map((entry) => normalizePath(entry.absolutePath));
      const excludedModuleRoots = standard ? [] : deselectedEntries.map((entry) => normalizePath(entry.absolutePath));
      const selectedSourceRoots = standard ? selectedEntries.map((entry) => normalizePath(entry.absolutePath)) : [];
      const importExclusions = standard ? [] : deselectedEntries.flatMap((entry) => {
        const relative = String(entry.relativePath || "").replace(/\\/g, "/");
        if (!relative || relative === ".") return [];
        const containsSelectedDescendant = selectedEntries.some((selected) => {
          const selectedRelative = String(selected.relativePath || "").replace(/\\/g, "/");
          return selectedRelative.startsWith(`${relative}/`);
        });
        return containsSelectedDescendant ? [] : [`**/${relative}/**`];
      });
      const scopeSignature = JSON.stringify({
        boundaryVersion: 3,
        inventoryKind: inventory?.kind || "",
        selectedEntryIds: Array.from(selectedIds).sort()
      });
      return {
        mode,
        inventoryKind: inventory?.kind || "",
        inventoryError: inventory?.error || "",
        selectedEntryIds: Array.from(selectedIds),
        deselectedEntryIds: deselectedEntries.map((entry) => entry.id),
        selectedEntries,
        includedModuleRoots,
        excludedModuleRoots,
        selectedSourceRoots,
        importExclusions,
        scopeSignature
      };
    }

    function stableModuleId(directoryPath) {
      const normalized = normalizePath(directoryPath).toLowerCase();
      let hash = 2166136261;
      for (let index = 0; index < normalized.length; index += 1) hash = Math.imul(hash ^ normalized.charCodeAt(index), 16777619);
      return `jvm-${(hash >>> 0).toString(16)}`;
    }
    function classifyDirectory(directoryPath, entryNames) {
      const names = new Set(entryNames.map((name) => name.toLowerCase()));
      const kinds = [];
      if (names.has("pom.xml")) kinds.push("maven");
      if (names.has("settings.gradle") || names.has("settings.gradle.kts") || names.has("build.gradle") || names.has("build.gradle.kts")) kinds.push("gradle");
      if (names.has(".project") || names.has(".classpath")) kinds.push("eclipse");
      if (!kinds.length) return null;
      const kind = kinds.length > 1 ? "mixed" : kinds[0];
      const descriptorPaths = entryNames
        .filter((name) => /^(pom\.xml|settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|\.project|\.classpath)$/i.test(name))
        .map((name) => joinPath(directoryPath, name));
      const outputRoots = [];
      if (kinds.includes("maven")) outputRoots.push(joinPath(directoryPath, "target"));
      if (kinds.includes("gradle")) outputRoots.push(joinPath(directoryPath, "build"), joinPath(directoryPath, ".gradle"));
      if (kinds.includes("eclipse")) outputRoots.push(joinPath(directoryPath, "bin"));
      return { id: stableModuleId(directoryPath), root: directoryPath, kind, kinds, descriptorPaths, sourceRoots: [], generatedSourceRoots: [], outputRoots };
    }

    async function readProjectConfiguration(workspaceRoot) {
      const configPath = joinPath(joinPath(workspaceRoot, ".md-editor"), "java-build-path.json");
      try {
        return { path: configPath, value: JSON.parse(await Neutralino.filesystem.readFile(configPath)) };
      } catch (_error) {
        return { path: configPath, value: null };
      }
    }

    async function readConfiguredUnmanagedModule(workspaceRoot, projectConfiguration) {
      try {
        const configPath = projectConfiguration.path;
        const configuration = projectConfiguration.value;
        if (!configuration) throw new Error("Missing Java Build Path configuration.");
        const resolve = (path) => /^[A-Za-z]:\//.test(normalizePath(path)) || normalizePath(path).startsWith("/")
          ? normalizePath(path)
          : joinPath(workspaceRoot, path === "." ? "" : path);
        return {
          id: stableModuleId(workspaceRoot),
          root: workspaceRoot,
          kind: "unmanaged",
          descriptorPaths: [configPath],
          sourceRoots: (configuration.sourceFolders || []).map(resolve),
          generatedSourceRoots: [],
          outputRoots: configuration.javacProfile?.outputPath ? [resolve(configuration.javacProfile.outputPath)] : [joinPath(workspaceRoot, "out")],
          referencedLibraries: [...(configuration.classpathFolders || []), ...(configuration.jarFiles || [])].map(resolve)
        };
      } catch (_error) {
        return {
          id: stableModuleId(workspaceRoot),
          root: workspaceRoot,
          kind: "unmanaged",
          descriptorPaths: [],
          sourceRoots: [joinPath(workspaceRoot, "src")],
          generatedSourceRoots: [],
          outputRoots: [joinPath(workspaceRoot, "out")],
          referencedLibraries: []
        };
      }
    }

    /** Discover module descriptors asynchronously without materializing a recursive tree DOM. */
    async function detect(workspaceRoot, options = {}) {
      const normalizedRoot = normalizePath(workspaceRoot);
      const cacheKey = normalizedRoot.toLowerCase();
      if (!normalizedRoot || !Neutralino?.filesystem?.readDirectory) return null;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const pending = (async function() {
        const projectConfiguration = await readProjectConfiguration(normalizedRoot);
        const queue = [normalizedRoot];
        const modules = [];
        const aspectjSourceDirectories = [];
        const kotlinSourceDirectories = [];
        const kotlinSourceFiles = [];
        const javaSourceFiles = [];
        const standardJavaSourceRoots = [];
        let scannedDirectories = 0;
        let hasJavaContent = Boolean(projectConfiguration.value);
        let hasKotlinContent = false;
        if (options.signal?.aborted) {
          throw Object.assign(new Error("Java project detection was cancelled."), { name: "AbortError", code: "java-project-detection-cancelled" });
        }
        const desktopSpawnAvailable = Boolean(Neutralino?.os?.spawnProcess && Neutralino?.os?.updateSpawnedProcess);
        if (deps.bridge?.isAvailable?.()) {
          const discovery = await deps.bridge.run({ mode: "scan-workspace", workspaceRoot: normalizedRoot }, { signal: options.signal });
          modules.push(...(discovery.modules || []));
          aspectjSourceDirectories.push(...(discovery.aspectjSourceDirectories || []));
          kotlinSourceDirectories.push(...(discovery.kotlinSourceDirectories || []));
          kotlinSourceFiles.push(...(discovery.kotlinSourceFiles || []));
          javaSourceFiles.push(...(discovery.javaSourceFiles || []));
          standardJavaSourceRoots.push(...(discovery.standardJavaSourceRoots || []));
          scannedDirectories = Number(discovery.scannedDirectories) || 0;
          hasJavaContent = hasJavaContent || discovery.hasJavaContent === true;
          hasKotlinContent = discovery.hasKotlinContent === true;
          queue.length = discovery.truncated === true ? 1 : 0;
        } else if (desktopSpawnAvailable) {
          throw Object.assign(new Error("Java project detection bridge is unavailable."), {
            code: "java-project-detection-bridge-unavailable"
          });
        } else while (queue.length && scannedDirectories < MAX_SCANNED_DIRECTORIES) {
          if (options.signal?.aborted) {
            throw Object.assign(new Error("Java project detection was cancelled."), { name: "AbortError", code: "java-project-detection-cancelled" });
          }
          const directoryPath = queue.shift();
          let entries = [];
          try {
            entries = await Neutralino.filesystem.readDirectory(directoryPath);
          } catch (_error) {
            continue;
          }
          scannedDirectories += 1;
          if (STANDARD_JAVA_SOURCE_ROOT_PATTERN.test(directoryPath)) standardJavaSourceRoots.push(directoryPath);
          const entryNames = entries.map((entry) => String(entry?.entry || "")).filter(Boolean);
          if (!hasJavaContent && entryNames.some((name) => /\.java$/i.test(name))) hasJavaContent = true;
          entryNames.filter((name) => /\.java$/i.test(name)).forEach((name) => javaSourceFiles.push(joinPath(directoryPath, name)));
          if (entryNames.some((name) => /\.aj$/i.test(name))) aspectjSourceDirectories.push(directoryPath);
          const hasKotlinSource = entryNames.some((name) => /\.kt$/i.test(name) || (/\.kts$/i.test(name) && !/^(build|settings)\.gradle\.kts$/i.test(name) && /\/src\//i.test(normalizePath(directoryPath))));
          if (hasKotlinSource) {
            hasKotlinContent = true;
            kotlinSourceDirectories.push(directoryPath);
            entryNames.filter((name) => /\.kts?$/i.test(name)).forEach((name) => kotlinSourceFiles.push(joinPath(directoryPath, name)));
          }
          const module = classifyDirectory(directoryPath, entryNames);
          if (module) modules.push(module);
          entries.forEach((entry) => {
            const name = String(entry?.entry || "");
            if (entry?.type !== "DIRECTORY" || SKIPPED_DIRECTORY_NAMES.has(name.toLowerCase())) return;
            queue.push(joinPath(directoryPath, name));
          });
          if (scannedDirectories % 25 === 0) await new Promise((resolve) => global.setTimeout(resolve, 0));
        }
        if (!modules.length) modules.push(await readConfiguredUnmanagedModule(normalizedRoot, projectConfiguration));
        const analysisInventory = await deps.javaAnalysisInventory?.resolve?.({
          workspaceRoot: normalizedRoot,
          configuration: projectConfiguration.value || {},
          discoveredModules: modules,
          standardJavaSourceRoots,
          scanTruncated: queue.length > 0,
          signal: options.signal
        }) || { buildSystem: "javac", kind: "standard-source-folders", label: "Java source folders", entries: [], error: "" };
        const analysis = resolveAnalysisScope(normalizedRoot, analysisInventory, projectConfiguration.value || {});
        const includedRootKeys = new Set(analysis.includedModuleRoots.map((root) => root.toLowerCase()));
        const analysisModules = modules.filter((module) => includedRootKeys.has(module.root.toLowerCase()));
        const kind = analysisInventory.buildSystem === "gradle"
          ? "gradle"
          : (analysisInventory.buildSystem === "maven" ? "maven" : "unmanaged");
        const derivedRoots = Array.from(new Set(analysisModules.flatMap((module) => module.outputRoots || []).map(normalizePath)));
        const resolveOwningModuleRoot = (sourceDirectory) => {
          const candidates = modules.filter((module) => sourceDirectory === module.root || sourceDirectory.startsWith(`${module.root}/`));
          return candidates.sort((left, right) => right.root.length - left.root.length)[0]?.root || normalizedRoot;
        };
        const aspectjModuleRoots = Array.from(new Set(aspectjSourceDirectories.map((sourceDirectory) => {
          const candidates = modules.filter((module) => sourceDirectory === module.root || sourceDirectory.startsWith(`${module.root}/`));
          return candidates.sort((left, right) => right.root.length - left.root.length)[0]?.root || normalizedRoot;
        })));
        return {
          workspaceRoot: normalizedRoot,
          kind,
          hasJavaContent,
          hasAspectjContent: aspectjSourceDirectories.length > 0,
          hasKotlinContent,
          kotlinModuleRoots: Array.from(new Set(kotlinSourceDirectories.map(resolveOwningModuleRoot))),
          kotlinSourceFiles,
          javaSourceFiles,
          standardJavaSourceRoots,
          aspectjModuleRoots,
          projectConfiguration: projectConfiguration.value,
          analysisInventory,
          projectJdkId: String(projectConfiguration.value?.projectJdkId || "") || null,
          modules: modules.map((module) => ({ ...module, analysisIncluded: includedRootKeys.has(module.root.toLowerCase()) })),
          analysis,
          importers: {
            maven: analysisInventory.buildSystem === "maven",
            gradle: analysisInventory.buildSystem === "gradle",
            eclipse: analysisInventory.buildSystem === "javac" && modules.some((module) => module.kinds?.includes?.("eclipse") || module.kind === "eclipse")
          },
          derivedRoots,
          truncated: queue.length > 0,
          configurationSignature: `${modules.flatMap((module) => module.descriptorPaths).sort().join("|")}|${JSON.stringify(projectConfiguration.value?.analysisScope || {})}`
        };
      })();
      cache.set(cacheKey, pending);
      try {
        const model = await pending;
        cache.set(cacheKey, model);
        return model;
      } catch (error) {
        cache.delete(cacheKey);
        throw error;
      }
    }

    function getCached(workspaceRoot) {
      const value = cache.get(normalizePath(workspaceRoot).toLowerCase());
      return value && typeof value.then !== "function" ? value : null;
    }

    function invalidate(workspaceRoot) {
      cache.delete(normalizePath(workspaceRoot).toLowerCase());
    }

    const api = { detect, getCached, invalidate, resolveAnalysisScope, toRelativeModuleRoot };
    app?.registerModule?.("javaWorkspaceModel", api);
    return api;
  }

  global.registerMarkdownViewerJavaWorkspaceModel = registerMarkdownViewerJavaWorkspaceModel;
})(typeof window !== "undefined" ? window : globalThis);
