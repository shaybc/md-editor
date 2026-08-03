"use strict";

const fs = require("fs");
const path = require("path");
const { spawnCommand } = require("../lsp-proxy-common/process-launcher.cjs");
const { describeGradleFailure } = require("../lsp-proxy-common/gradle-failure-description.cjs");
const { detectKotlinJvmWorkspace } = require("./kotlin-project-model.cjs");
const { exportMavenModel } = require("./maven-model-exporter.cjs");

/** Resolves build-tool Kotlin/JVM inputs without invoking compilation tasks. */
async function resolveKotlinJvmModel(options) {
  const detected = selectAnalysisModules(detectKotlinJvmWorkspace(options.workspaceRoot), options.analysisRoots);
  if (detected.unsupported || !detected.hasKotlin) return detected;
  const gradleDescriptor = findGradleDescriptor(detected);
  const mavenDescriptors = findDescriptors(detected, /pom\.xml$/i);
  let exported = [];
  if (gradleDescriptor) exported = await exportGradleModel(options, path.dirname(gradleDescriptor));
  else if (mavenDescriptors.length) exported = await exportMavenModels(options, mavenDescriptors);
  return exported.length ? mergeExportedModel(detected, exported) : enrichUnmanagedModel(detected);
}

/** Restrict Kotlin discovery to the same canonical module roots imported by JDT. */
function selectAnalysisModules(detected, analysisRoots) {
  const roots = (Array.isArray(analysisRoots) ? analysisRoots : []).map((root) => path.resolve(root));
  if (!roots.length) return detected;
  const modules = detected.modules.filter((module) => roots.some((root) => {
    const relative = path.relative(root, path.resolve(module.root));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }));
  return {
    ...detected,
    hasKotlin: modules.some((module) => module.kotlin.length),
    modules
  };
}

function enrichUnmanagedModel(detected) {
  const buildPath = readJson(path.join(detected.workspaceRoot, ".md-editor", "java-build-path.json"));
  const modules = detected.modules.map((module) => {
    const eclipse = readEclipseClasspath(module);
    const isWorkspaceModule = samePath(module.root, detected.workspaceRoot);
    const configuredLibraries = isWorkspaceModule
      ? [...(buildPath.classpathFolders || []), ...(buildPath.jarFiles || [])].map((entry) => resolveStoredPath(detected.workspaceRoot, entry))
      : [];
    const configuredSources = isWorkspaceModule
      ? (buildPath.sourceFolders || []).map((entry) => resolveStoredPath(detected.workspaceRoot, entry))
      : [];
    const classpath = Array.from(new Set([...eclipse.libraries, ...configuredLibraries])).filter((entry) => fs.existsSync(entry));
    const sourceSets = mergeConfiguredSources(module.sourceSets || [], [...eclipse.sources, ...configuredSources])
      .map((sourceSet) => ({
        ...sourceSet,
        kotlinSourceRoots: sourceSet.kotlinSourceRoots || rootsForFiles(sourceSet.kotlin),
        javaSourceRoots: sourceSet.javaSourceRoots || rootsForFiles(sourceSet.java),
        classpath
      }));
    return { ...module, sourceSets, referencedLibraries: classpath };
  });
  return { ...detected, modules };
}

function readEclipseClasspath(module) {
  const classpathFile = (module.descriptors || []).find((file) => path.basename(file).toLowerCase() === ".classpath");
  const result = { libraries: [], sources: [] };
  if (!classpathFile) return result;
  const matcher = /<classpathentry\b([^>]*)\/?\s*>/gi;
  let match;
  while ((match = matcher.exec(safeRead(classpathFile)))) {
    const attributes = Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)=["']([^"']*)["']/g), (item) => [item[1], decodeXml(item[2])]));
    if (attributes.kind === "lib" && attributes.path) result.libraries.push(resolveStoredPath(module.root, attributes.path));
    if (attributes.kind === "src" && attributes.path && !attributes.path.startsWith("/")) result.sources.push(resolveStoredPath(module.root, attributes.path));
  }
  return result;
}

function mergeConfiguredSources(sourceSets, roots) {
  const result = sourceSets.map((sourceSet) => ({
    ...sourceSet,
    kotlin: [...(sourceSet.kotlin || [])],
    java: [...(sourceSet.java || [])]
  }));
  for (const root of Array.from(new Set(roots)).filter((entry) => fs.existsSync(entry))) {
    const name = /(?:^|[/\\])test(?:Fixtures)?(?:[/\\]|$)/i.test(root) ? (/[\\/]testFixtures(?:[\\/]|$)/i.test(root) ? "testFixtures" : "test") : "main";
    let sourceSet = result.find((entry) => entry.name === name);
    if (!sourceSet) {
      sourceSet = { name, test: /test/i.test(name), kotlin: [], java: [] };
      result.push(sourceSet);
    }
    sourceSet.kotlin = Array.from(new Set([...sourceSet.kotlin, ...collectFiles([root], /\.kts?$/i)]));
    sourceSet.java = Array.from(new Set([...sourceSet.java, ...collectFiles([root], /\.java$/i)]));
  }
  return result;
}

function rootsForFiles(files = []) {
  return Array.from(new Set(files.map((file) => path.dirname(file))));
}

function resolveStoredPath(root, value) {
  return path.isAbsolute(String(value || "")) ? path.normalize(value) : path.resolve(root, String(value || ""));
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_error) { return {}; }
}

function findDescriptors(model, matcher) {
  return model.modules.flatMap((module) => module.descriptors || []).filter((file) => matcher.test(file));
}

function findDescriptor(model, matcher) {
  return findDescriptors(model, matcher)[0] || "";
}

function findGradleDescriptor(model) {
  const rootDescriptor = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"]
    .map((name) => path.join(model.workspaceRoot, name)).find((file) => fs.existsSync(file));
  if (rootDescriptor) return rootDescriptor;
  return findDescriptors(model, /(?:settings|build)\.gradle(?:\.kts)?$/i).sort((left, right) => {
    const leftRelative = path.relative(model.workspaceRoot, left);
    const rightRelative = path.relative(model.workspaceRoot, right);
    const leftDepth = leftRelative.split(path.sep).length;
    const rightDepth = rightRelative.split(path.sep).length;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    const leftSettings = /^settings\.gradle(?:\.kts)?$/i.test(path.basename(left)) ? 0 : 1;
    const rightSettings = /^settings\.gradle(?:\.kts)?$/i.test(path.basename(right)) ? 0 : 1;
    return leftSettings - rightSettings || left.localeCompare(right);
  })[0] || "";
}

async function exportGradleModel(options, projectRoot) {
  const output = path.join(options.cacheRoot, "models", "gradle-kotlin-jvm.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const wrapper = process.platform === "win32" ? path.join(projectRoot, "gradlew.bat") : path.join(projectRoot, "gradlew");
  const executable = fs.existsSync(wrapper) ? wrapper : (options.gradleExecutable || "gradle");
  const args = [
    "-p", projectRoot,
    "mdEditorExportKotlinJvmModels",
    "-x", "test",
    "--no-daemon",
    "--no-problems-report",
    "--project-cache-dir", path.join(options.cacheRoot, "gradle-project-cache"),
    "-I", options.gradleInitScript,
    `-Dmdeditor.kotlin.model.output=${output}`
  ];
  await runWithRetry(executable, args, projectRoot, options);
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

async function exportMavenModels(options, poms) {
  const records = [];
  for (const pom of poms) {
    const projectDir = path.dirname(pom);
    const modelRoot = path.join(options.cacheRoot, "models", "maven", stableId(projectDir));
    fs.mkdirSync(modelRoot, { recursive: true });
    const exported = await exportMavenModel({
      cacheRoot: modelRoot,
      mavenExecutable: options.mavenExecutable || "mvn",
      pom,
      repository: path.join(options.cacheRoot, "maven-repository"),
      cwd: projectDir,
      onProgress: options.onProgress,
      stallTimeoutMs: options.stallTimeoutMs,
      environment: options.environment
    });
    const configuration = parseMavenKotlinConfiguration(safeRead(exported.effectivePom), projectDir);
    records.push({
      projectPath: projectDir,
      projectDir,
      kotlinPluginVersion: configuration.kotlinPluginVersion,
      classpath: safeRead(exported.classpath).split(path.delimiter).filter(Boolean),
      sourceSets: configuration.sourceSets
    });
  }
  return records;
}

function parseMavenKotlinConfiguration(effectivePom, projectDir) {
  const plugin = (String(effectivePom || "").match(/<plugin>\s*[\s\S]*?<artifactId>kotlin-maven-plugin<\/artifactId>[\s\S]*?<\/plugin>/i) || [""])[0];
  const configuredRoots = extractXmlValues(plugin, "sourceDir").map((value) => resolveMavenPath(projectDir, value));
  const compilerArguments = extractXmlValues(plugin, "arg");
  const jvmTarget = decodeXml((plugin.match(/<jvmTarget>([^<]+)<\/jvmTarget>/i) || [])[1] || "");
  if (jvmTarget && !compilerArguments.includes("-jvm-target")) compilerArguments.push("-jvm-target", jvmTarget);
  const mainRoots = configuredRoots.filter((root) => !/[/\\]test(?:[/\\]|$)/i.test(root));
  const testRoots = configuredRoots.filter((root) => /[/\\]test(?:[/\\]|$)/i.test(root));
  if (!mainRoots.length) mainRoots.push(path.join(projectDir, "src", "main", "kotlin"));
  if (!testRoots.length) testRoots.push(path.join(projectDir, "src", "test", "kotlin"));
  return {
    kotlinPluginVersion: decodeXml((plugin.match(/<version>([^<]+)<\/version>/i) || [])[1] || "unknown"),
    sourceSets: [
      { name: "main", kotlinSourceRoots: mainRoots, javaSourceRoots: [path.join(projectDir, "src", "main", "java")], compilerArguments },
      { name: "test", test: true, kotlinSourceRoots: testRoots, javaSourceRoots: [path.join(projectDir, "src", "test", "java")], compilerArguments }
    ]
  };
}

function extractXmlValues(xml, tag) {
  const values = [];
  const matcher = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, "gi");
  let match;
  while ((match = matcher.exec(String(xml || "")))) values.push(decodeXml(match[1].trim()));
  return Array.from(new Set(values));
}

function resolveMavenPath(projectDir, value) {
  const expanded = String(value || "")
    .replace(/\$\{project\.basedir\}|\$\{basedir\}/g, projectDir)
    .replace(/\$\{project\.build\.directory\}/g, path.join(projectDir, "target"));
  return path.resolve(projectDir, expanded);
}

function decodeXml(value) {
  return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
function mergeExportedModel(detected, exported) {
  const ajdtClasspath = collectAjdtOutputRoots(detected.workspaceRoot);
  const modules = exported.map((record) => {
    const original = detected.modules.find((module) => samePath(module.root, record.projectDir));
    const sourceSets = (record.sourceSets || []).map((sourceSet) => ({
      name: sourceSet.name || "main",
      test: sourceSet.test === true || /test/i.test(sourceSet.name || ""),
      dependsOnMain: sourceSet.dependsOnMain === true,
      localSourceSetDependencies: sourceSet.localSourceSetDependencies || [],
      kotlin: explicitOrCollectedFiles(sourceSet.kotlinFiles, sourceSet.kotlinSourceRoots, /\.kts?$/i),
      java: explicitOrCollectedFiles(sourceSet.javaFiles, sourceSet.javaSourceRoots, /\.java$/i),
      kotlinSourceRoots: (sourceSet.kotlinSourceRoots || []).map((value) => path.resolve(value)),
      javaSourceRoots: (sourceSet.javaSourceRoots || []).map((value) => path.resolve(value)),
      classpath: Array.from(new Set([...(sourceSet.classpath || record.classpath || []), ...ajdtClasspath])),
      projectDependencies: sourceSet.projectDependencies || [],
      dependencyJavaSourceRoots: (sourceSet.dependencyJavaSourceRoots || []).map((value) => path.resolve(value)),
      compilerArguments: sourceSet.compilerArguments || [],
      compilerPluginClasspath: sourceSet.compilerPluginClasspath || []
    })).filter((sourceSet) => sourceSet.kotlin.length || sourceSet.java.length);
    return {
      ...(original || {}),
      root: path.resolve(record.projectDir),
      projectPath: record.projectPath || "",
      id: original?.id || stableId(record.projectDir),
      kotlin: sourceSets.flatMap((sourceSet) => sourceSet.kotlin),
      java: sourceSets.flatMap((sourceSet) => sourceSet.java),
      kind: sourceSets.some((sourceSet) => sourceSet.kotlin.length) && sourceSets.some((sourceSet) => sourceSet.java.length) ? "mixed" : "kotlin",
      sourceSets,
      kotlinPluginVersion: record.kotlinPluginVersion || "unknown"
    };
  });
  const modulesByProjectPath = new Map(modules.map((module) => [module.projectPath, module]));
  const linkedModules = modules.map((module) => ({
    ...module,
    sourceSets: module.sourceSets.map((sourceSet) => ({
      ...sourceSet,
      dependencyJavaSourceRoots: Array.from(new Set([...(sourceSet.dependencyJavaSourceRoots || []), ...(sourceSet.projectDependencies || []).flatMap((projectPath) => {
        const dependency = modulesByProjectPath.get(projectPath);
        if (!dependency) return [];
        return dependency.sourceSets
          .filter((candidate) => !candidate.test)
          .flatMap((candidate) => candidate.javaSourceRoots || rootsForFiles(candidate.java));
      })]))
    }))
  }));
  return { ...detected, modules: linkedModules, configurationSignature: detected.configurationSignature };
}

function collectAjdtOutputRoots(workspaceRoot) {
  const eclipseWorkspace = path.join(workspaceRoot, ".md-editor", "ajdt-diagnostics", "eclipse-workspace");
  if (!fs.existsSync(eclipseWorkspace)) return [];
  return fs.readdirSync(eclipseWorkspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(eclipseWorkspace, entry.name, "bin"))
    .filter((entry) => fs.existsSync(entry));
}

function explicitOrCollectedFiles(files, roots, matcher) {
  if (Array.isArray(files)) return files.map((file) => path.resolve(file)).filter((file) => fs.existsSync(file) && matcher.test(file)).sort();
  return collectFiles(roots || [], matcher);
}

function collectFiles(roots, matcher) {
  const result = [];
  const queue = roots.filter((root) => fs.existsSync(root));
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(candidate);
      else if (entry.isFile() && matcher.test(entry.name)) result.push(candidate);
    }
  }
  return result.sort();
}

async function runWithRetry(command, args, cwd, options) {
  try {
    return await run(command, args, cwd, options);
  } catch (error) {
    if (!error.stalled) throw error;
    options.onProgress?.("Gradle model extraction stalled; retrying once.\n");
    return run(command, args, cwd, options);
  }
}

function run(command, args, cwd, options) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { cwd, windowsHide: true, env: options.environment || process.env });
    let stderr = "";
    let lastProgress = Date.now();
    let stalled = false;
    child.stdout.on("data", (chunk) => { lastProgress = Date.now(); options.onProgress?.(String(chunk)); });
    child.stderr.on("data", (chunk) => { lastProgress = Date.now(); stderr += chunk; options.onProgress?.(String(chunk)); });
    const timer = setInterval(() => {
      if (Date.now() - lastProgress <= (options.stallTimeoutMs || 300000)) return;
      stalled = true;
      child.kill();
    }, 1000);
    child.on("error", (error) => { clearInterval(timer); reject(error); });
    child.on("exit", (code) => {
      clearInterval(timer);
      // Reduce stderr to the Gradle "What went wrong" block: raw stderr starts with
      // unrelated noise (for example git VCS probes), which would mislead the status bar.
      code === 0 ? resolve() : reject(Object.assign(new Error(describeGradleFailure(stderr, code)), { stalled }));
    });
  });
}

function stableId(value) {
  return require("crypto").createHash("sha1").update(path.resolve(value).toLowerCase()).digest("hex").slice(0, 12);
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function safeRead(file) {
  try { return fs.readFileSync(file, "utf8").trim(); } catch (_error) { return ""; }
}

module.exports = { resolveKotlinJvmModel, mergeExportedModel, parseMavenKotlinConfiguration, findGradleDescriptor };
