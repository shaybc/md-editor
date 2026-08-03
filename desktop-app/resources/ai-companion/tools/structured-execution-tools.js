/**
 * Typed build, test, dependency, and package operations for AI agents.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { StructuredExecutionBroker } = require("../security/structured-execution-broker");
const { isPackageOperationAllowed } = require("../security/effective-policy");
const { createPackageProviderRegistry } = require("./package-providers");

const broker = new StructuredExecutionBroker();
const BUILD_MODES = new Set(["incremental", "clean"]);
const TEST_RUNNERS = new Set(["auto", "junit", "node", "playwright"]);
const TEST_SCOPES = new Set(["project", "module", "file", "class", "method"]);
const PACKAGE_ACTIONS = new Set(["install", "update", "remove", "download"]);
const ECOSYSTEMS = new Set(["npm", "yarn", "pnpm", "maven", "gradle"]);

function validateEnum(name, value, allowed) {
  if (!allowed.has(value)) throw new Error(`${name} must be one of: ${Array.from(allowed).join(", ")}.`);
}

function validateSelector(scope, selector) {
  const value = String(selector || "").trim();
  if (scope === "project" || scope === "module") return value;
  if (!value) throw new Error(`A selector is required for ${scope} test scope.`);
  if (value.startsWith("-") || !/^[\w@ ./\\:$#*?[\]-]+$/.test(value)) throw new Error("The test selector contains unsupported characters.");
  return value;
}

function validatePackageId(packageId) {
  const value = String(packageId || "").trim();
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value)) throw new Error("The package ID is invalid.");
  return value;
}

function validateVersion(version) {
  const value = String(version || "*").trim() || "*";
  if (!/^[a-z0-9*^~<>=|.+_-]+$/i.test(value)) throw new Error("The package version is invalid.");
  return value;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function resolveTarget(workspaceRoot, targetPath = ".") {
  const root = await fs.realpath(path.resolve(String(workspaceRoot || "")));
  const requested = path.resolve(root, String(targetPath || "."));
  const realTarget = await fs.realpath(requested);
  if (realTarget !== root && !realTarget.startsWith(root + path.sep)) throw new Error("The target path is outside the workspace.");
  const stat = await fs.stat(realTarget);
  return { root, target: realTarget, directory: stat.isDirectory() ? realTarget : path.dirname(realTarget) };
}

async function findProjectRoot(workspaceRoot, targetDirectory) {
  let current = targetDirectory;
  const manifests = ["pom.xml", "build.gradle", "build.gradle.kts", "package.json"];
  while (current === workspaceRoot || current.startsWith(workspaceRoot + path.sep)) {
    for (const manifest of manifests) {
      if (await pathExists(path.join(current, manifest))) return { projectRoot: current, manifest };
    }
    if (current === workspaceRoot) break;
    current = path.dirname(current);
  }
  throw new Error("No supported project manifest was found for the target.");
}

async function findExecutable(projectRoot, candidates) {
  for (const candidate of candidates) {
    const executable = path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
    if (await pathExists(executable)) return executable;
  }
  return candidates[candidates.length - 1];
}

function baseDescriptor(workspaceRoot, projectRoot, executable, args, environment = {}) {
  return { workspaceRoot, cwd: projectRoot, executable, args, environment };
}

const packageProviders = createPackageProviderRegistry({ baseDescriptor, findExecutable });

async function listJavaSources(targetPath, includeTestSources, files = []) {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith(".java")) files.push(targetPath);
    return files;
  }
  for (const entry of await fs.readdir(targetPath, { withFileTypes: true })) {
    if ([".git", ".gradle", "build", "target"].includes(entry.name)) continue;
    const child = path.join(targetPath, entry.name);
    if (!includeTestSources && /[\\/]src[\\/]test(?:[\\/]|$)/i.test(child)) continue;
    if (entry.isDirectory()) await listJavaSources(child, includeTestSources, files);
    else if (entry.isFile() && entry.name.endsWith(".java")) files.push(child);
  }
  return files;
}

async function createCompileDescriptor(workspaceRoot, args, policy) {
  validateEnum("buildMode", args.buildMode, BUILD_MODES);
  const resolved = await resolveTarget(workspaceRoot, args.targetPath);
  let project;
  try {
    project = await findProjectRoot(resolved.root, resolved.directory);
  } catch (error) {
    if (!/No supported project manifest/.test(error?.message || "")) throw error;
    const sources = await listJavaSources(resolved.target, args.includeTestSources === true);
    if (!sources.length) throw new Error("No Java source files were found for compile_project.");
    const outputDirectory = path.join(resolved.root, ".md-editor", "ai-build", "classes");
    const executable = process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "javac.exe" : "javac")
      : process.platform === "win32" ? "javac.exe" : "javac";
    return {
      ...baseDescriptor(resolved.root, resolved.root, executable, ["-d", outputDirectory, ...sources]),
      prepareDirectories: [outputDirectory],
      cleanDirectories: args.buildMode === "clean" ? [outputDirectory] : []
    };
  }
  if (project.manifest === "pom.xml") {
    const executable = await findExecutable(project.projectRoot, [process.platform === "win32" ? "mvnw.cmd" : "mvnw", process.platform === "win32" ? "mvn.cmd" : "mvn"]);
    const commandArgs = [];
    if (args.buildMode === "clean") commandArgs.push("clean");
    commandArgs.push(args.includeTestSources ? "test-compile" : "compile");
    if (policy.execution.networkAccess === false) commandArgs.unshift("--offline");
    return baseDescriptor(resolved.root, project.projectRoot, executable, commandArgs, { CI: "true" });
  }
  if (project.manifest.startsWith("build.gradle")) {
    const executable = await findExecutable(project.projectRoot, [process.platform === "win32" ? "gradlew.bat" : "gradlew", process.platform === "win32" ? "gradle.bat" : "gradle"]);
    const commandArgs = [];
    if (args.buildMode === "clean") commandArgs.push("clean");
    commandArgs.push(args.includeTestSources ? "testClasses" : "classes", "--no-daemon");
    if (policy.execution.networkAccess === false) commandArgs.push("--offline");
    return baseDescriptor(resolved.root, project.projectRoot, executable, commandArgs, { CI: "true" });
  }
  throw new Error("compile_project supports Maven and Gradle Java projects in this version.");
}

async function detectTestRunner(project, requested) {
  if (requested !== "auto") return requested;
  if (project.manifest === "pom.xml" || project.manifest.startsWith("build.gradle")) return "junit";
  const packageJson = JSON.parse(await fs.readFile(path.join(project.projectRoot, "package.json"), "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  return dependencies["@playwright/test"] || dependencies.playwright ? "playwright" : "node";
}

async function createTestDescriptor(workspaceRoot, args, policy) {
  validateEnum("runner", args.runner, TEST_RUNNERS);
  validateEnum("scope", args.scope, TEST_SCOPES);
  const selector = validateSelector(args.scope, args.selector);
  const resolved = await resolveTarget(workspaceRoot, args.targetPath);
  const project = await findProjectRoot(resolved.root, resolved.directory);
  const runner = await detectTestRunner(project, args.runner);
  if (runner === "junit" && project.manifest === "pom.xml") {
    const executable = await findExecutable(project.projectRoot, [process.platform === "win32" ? "mvnw.cmd" : "mvnw", process.platform === "win32" ? "mvn.cmd" : "mvn"]);
    const commandArgs = ["test"];
    if (policy.execution.networkAccess === false) commandArgs.unshift("--offline");
    const junitSelector = args.scope === "file" ? path.basename(selector).replace(/\.java$/i, "") : selector;
    if (junitSelector) commandArgs.push(`-Dtest=${junitSelector}`);
    return { runner, descriptor: baseDescriptor(resolved.root, project.projectRoot, executable, commandArgs, { CI: "true" }) };
  }
  if (runner === "junit" && project.manifest.startsWith("build.gradle")) {
    const executable = await findExecutable(project.projectRoot, [process.platform === "win32" ? "gradlew.bat" : "gradlew", process.platform === "win32" ? "gradle.bat" : "gradle"]);
    const commandArgs = ["test", "--no-daemon"];
    if (policy.execution.networkAccess === false) commandArgs.push("--offline");
    const junitSelector = args.scope === "file" ? path.basename(selector).replace(/\.java$/i, "") : selector;
    if (junitSelector) commandArgs.push("--tests", junitSelector.replace(/#/g, "."));
    return { runner, descriptor: baseDescriptor(resolved.root, project.projectRoot, executable, commandArgs, { CI: "true" }) };
  }
  if (runner === "node") {
    const commandArgs = ["--test"];
    if (selector && ["class", "method"].includes(args.scope)) commandArgs.push("--test-name-pattern", selector);
    else if (selector) commandArgs.push(selector);
    return { runner, descriptor: baseDescriptor(resolved.root, project.projectRoot, process.execPath, commandArgs, { CI: "true" }) };
  }
  if (runner === "playwright") {
    if (!["project", "file"].includes(args.scope)) throw new Error("Playwright supports project and file test scopes in this version.");
    const cliPath = path.join(project.projectRoot, "node_modules", "@playwright", "test", "cli.js");
    if (await pathExists(cliPath)) {
      const commandArgs = [cliPath, "test"];
      if (selector) commandArgs.push(selector);
      return { runner, descriptor: baseDescriptor(resolved.root, project.projectRoot, process.execPath, commandArgs, { CI: "true" }) };
    }
    if (policy.packageBinaries.npx !== true) throw new Error("The local Playwright runner is unavailable and the npx package-binary launcher is disabled by policy.");
    if (policy.execution.networkAccess === false) throw new Error("The local Playwright runner is unavailable and policy forbids npx network access.");
    if (policy.packages.allowTransitiveDependencies === false) throw new Error("Playwright download through npx is disabled because transitive dependencies are not allowed by policy.");
    const packageJson = JSON.parse(await fs.readFile(path.join(project.projectRoot, "package.json"), "utf8"));
    const playwrightVersion = packageJson.devDependencies?.["@playwright/test"] || packageJson.dependencies?.["@playwright/test"] || "*";
    const registry = await resolveRegistry(project.projectRoot, "npm");
    if (!isPackageOperationAllowed(policy, { ecosystem: "npm", action: "download", packageId: "@playwright/test", version: playwrightVersion, registry })) {
      throw new Error("The Playwright package required by npx is not allowed by the effective package whitelist.");
    }
    const executable = packageProviders.get("npm")?.resolvePackageBinary("npx", policy);
    if (!executable) throw new Error("The npx package-binary launcher is unavailable.");
    const packageSpec = playwrightVersion === "*" ? "@playwright/test" : `@playwright/test@${playwrightVersion}`;
    const commandArgs = ["--yes", "--package", packageSpec, "playwright", "test"];
    if (selector) commandArgs.push(selector);
    return { runner, descriptor: baseDescriptor(resolved.root, project.projectRoot, executable, commandArgs, { CI: "true" }) };
  }
  throw new Error("The requested test runner does not match the detected project.");
}

async function detectPackageEcosystem(projectRoot, requested) {
  if (requested && requested !== "auto") return requested;
  if (await pathExists(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await pathExists(path.join(projectRoot, "yarn.lock"))) return "yarn";
  if (await pathExists(path.join(projectRoot, "package.json"))) return "npm";
  if (await pathExists(path.join(projectRoot, "pom.xml"))) return "maven";
  if (await pathExists(path.join(projectRoot, "build.gradle")) || await pathExists(path.join(projectRoot, "build.gradle.kts"))) return "gradle";
  throw new Error("No supported package ecosystem was detected.");
}

async function resolveRegistry(projectRoot, ecosystem) {
  if (["npm", "yarn", "pnpm"].includes(ecosystem)) {
    try {
      const npmrc = await fs.readFile(path.join(projectRoot, ".npmrc"), "utf8");
      const match = npmrc.match(/^\s*registry\s*=\s*(.+?)\s*$/mi);
      if (match) return match[1];
    } catch (_error) {
      // The package manager's default registry applies when no project override exists.
    }
    return "https://registry.npmjs.org/";
  }
  return "*";
}

async function createRestoreDescriptor(workspaceRoot, args) {
  const resolved = await resolveTarget(workspaceRoot, args.targetPath);
  const project = await findProjectRoot(resolved.root, resolved.directory);
  const ecosystem = await detectPackageEcosystem(project.projectRoot, args.ecosystem);
  validateEnum("ecosystem", ecosystem, ECOSYSTEMS);
  const provider = packageProviders.get(ecosystem);
  if (!provider) throw new Error(`No package provider supports ${ecosystem}.`);
  const descriptor = await provider.restoreDependencies({
    workspaceRoot: resolved.root,
    projectRoot: project.projectRoot,
    refresh: args.refresh === true
  });
  return { ecosystem, projectRoot: project.projectRoot, descriptor };
}

async function createPackageDescriptor(workspaceRoot, args, policy) {
  validateEnum("ecosystem", args.ecosystem, ECOSYSTEMS);
  validateEnum("action", args.action, PACKAGE_ACTIONS);
  const packageId = validatePackageId(args.packageId);
  const version = validateVersion(args.version);
  const resolved = await resolveTarget(workspaceRoot, args.targetPath);
  const project = await findProjectRoot(resolved.root, resolved.directory);
  const operation = { ecosystem: args.ecosystem, action: args.action, packageId, version, registry: await resolveRegistry(project.projectRoot, args.ecosystem) };
  if (!isPackageOperationAllowed(policy, operation)) throw new Error("The package operation is not allowed by the effective AI security policy.");
  const provider = packageProviders.get(args.ecosystem);
  if (!provider) throw new Error(`No package provider supports ${args.ecosystem}.`);
  const descriptor = await provider.managePackage({
    workspaceRoot: resolved.root,
    projectRoot: project.projectRoot,
    action: args.action,
    packageId,
    version,
    development: args.development === true
  });
  return { operation, descriptor };
}

function auditBase(options, tool, requestedOperation, decision) {
  return {
    taskId: options.requestId || "",
    requestId: options.requestId || "",
    workspace: options.workspaceRoot,
    tool,
    requestedOperation,
    classification: tool,
    policyVersion: options.policy.version,
    policyHash: options.policy.metadata?.hash || "",
    policySource: options.policy.metadata?.source || "",
    decision,
    modelProvider: options.modelProvider || "",
    appVersion: options.appVersion || ""
  };
}

function normalizeDiagnostics(stdout, stderr) {
  const diagnostics = [];
  for (const line of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const match = line.match(/^(.+?):(\d+)(?::(\d+))?\s*[:\-]\s*(?:error\s*[:\-]\s*)?(.+)$/i);
    if (match && /error|failed|exception/i.test(line)) diagnostics.push({ path: match[1], line: Number(match[2]), column: Number(match[3] || 1), severity: "error", message: match[4] });
  }
  return diagnostics.slice(0, 200);
}

function normalizeTestSummary(stdout, stderr) {
  const output = `${stdout}\n${stderr}`;
  const junit = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/i);
  if (junit) {
    const total = Number(junit[1]);
    const failed = Number(junit[2]) + Number(junit[3]);
    const skipped = Number(junit[4]);
    return { total, passed: Math.max(0, total - failed - skipped), failed, skipped };
  }
  const tapTotal = output.match(/^(?:#|ℹ)\s*tests\s+(\d+)/mi);
  const tapPassed = output.match(/^(?:#|ℹ)\s*pass\s+(\d+)/mi);
  const tapFailed = output.match(/^(?:#|ℹ)\s*fail\s+(\d+)/mi);
  const tapSkipped = output.match(/^(?:#|ℹ)\s*skipped\s+(\d+)/mi);
  if (tapTotal) return { total: Number(tapTotal[1]), passed: Number(tapPassed?.[1] || 0), failed: Number(tapFailed?.[1] || 0), skipped: Number(tapSkipped?.[1] || 0) };
  return {};
}

function normalizeExecutionResult(result, metadata) {
  return {
    ...result,
    stdoutExcerpt: result.stdout,
    stderrExcerpt: result.stderr,
    diagnostics: normalizeDiagnostics(result.stdout, result.stderr),
    testCases: [],
    summary: normalizeTestSummary(result.stdout, result.stderr),
    artifacts: [],
    ...metadata
  };
}

async function recordDenied(tool, args, options, error) {
  await options.auditLogger?.record({ ...auditBase({ ...options, workspaceRoot: options.workspaceRoot }, tool, args, "deny"), error: error?.message || String(error) });
}

async function executeAudited(tool, requestedOperation, descriptor, options, metadata = {}) {
  if (options.policyError) {
    const error = new Error(`Structured execution is denied because the effective security policy could not be loaded: ${options.policyError}`);
    await recordDenied(tool, requestedOperation, options, error);
    error.auditRecorded = true;
    throw error;
  }
  await options.auditLogger?.record(auditBase(options, tool, requestedOperation, "allow"));
  let result;
  try {
    result = await broker.execute(descriptor, options.policy, { signal: options.signal });
  } catch (error) {
    await options.auditLogger?.record({ ...auditBase(options, tool, requestedOperation, "execution-error"), error: error?.message || String(error) });
    error.auditRecorded = true;
    throw error;
  }
  const normalized = normalizeExecutionResult(result, metadata);
  await options.auditLogger?.record({ ...auditBase(options, tool, requestedOperation, result.success ? "executed-success" : "executed-failure"), executionResult: normalized });
  return normalized;
}

async function compileProject(workspaceRoot, args, options) {
  const executionOptions = { ...options, workspaceRoot };
  try {
    const descriptor = await createCompileDescriptor(workspaceRoot, args, options.policy);
    return executeAudited("compile_project", args, descriptor, executionOptions);
  } catch (error) {
    if (!error.auditRecorded) await recordDenied("compile_project", args, executionOptions, error);
    throw error;
  }
}

async function runTests(workspaceRoot, args, options) {
  const executionOptions = { ...options, workspaceRoot };
  try {
    const operation = await createTestDescriptor(workspaceRoot, args, options.policy);
    return executeAudited("run_tests", args, operation.descriptor, executionOptions, { runner: operation.runner });
  } catch (error) {
    if (!error.auditRecorded) await recordDenied("run_tests", args, executionOptions, error);
    throw error;
  }
}

async function restoreDependencies(workspaceRoot, args, options) {
  const executionOptions = { ...options, workspaceRoot };
  try {
    const operation = await createRestoreDescriptor(workspaceRoot, args);
    const policyOperation = { ecosystem: operation.ecosystem, action: "download", packageId: "*", version: "*", registry: await resolveRegistry(operation.projectRoot, operation.ecosystem) };
    if (!isPackageOperationAllowed(options.policy, policyOperation)) throw new Error("Dependency restore is not allowed by the effective AI security policy.");
    if (options.policy.packages.allowTransitiveDependencies === false) throw new Error("Dependency restore is disabled because transitive dependencies are not allowed by policy.");
    if (options.policy.execution.networkAccess === false) {
      if (operation.ecosystem === "maven") operation.descriptor.args.unshift("--offline");
      else operation.descriptor.args.push("--offline");
    }
    return executeAudited("restore_dependencies", args, operation.descriptor, executionOptions, { ecosystem: operation.ecosystem });
  } catch (error) {
    if (!error.auditRecorded) await recordDenied("restore_dependencies", args, executionOptions, error);
    throw error;
  }
}

async function managePackage(workspaceRoot, args, options) {
  const executionOptions = { ...options, workspaceRoot };
  try {
    if (options.policy.execution.networkAccess === false && args.action !== "remove") throw new Error("Package changes requiring network access are disabled by the effective AI security policy.");
    if (options.policy.packages.allowTransitiveDependencies === false && args.action !== "remove") {
      throw new Error("This package operation is disabled because transitive dependencies are not allowed by policy.");
    }
    const operation = await createPackageDescriptor(workspaceRoot, args, options.policy);
    return executeAudited("manage_package", args, operation.descriptor, executionOptions, { ecosystem: operation.operation.ecosystem });
  } catch (error) {
    if (!error.auditRecorded) await recordDenied("manage_package", args, executionOptions, error);
    throw error;
  }
}

module.exports = {
  compileProject,
  managePackage,
  restoreDependencies,
  runTests
};
