/**
 * Executes validated executable-plus-argument descriptors without a shell.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

async function canonicalizeExistingParent(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      const realParent = await fs.realpath(current);
      return path.join(realParent, path.relative(current, path.resolve(candidate)));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function resolveExecutable(executable, environment) {
  const requested = String(executable || "");
  if (path.isAbsolute(requested)) return fs.realpath(requested);
  if (requested.includes("/") || requested.includes(path.sep)) return fs.realpath(path.resolve(requested));
  const extensions = process.platform === "win32"
    ? String(environment.PATHEXT || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  const names = path.extname(requested) ? [requested] : extensions.map((extension) => requested + extension.toLowerCase());
  const pathValue = environment.PATH || environment.Path || process.env.PATH || process.env.Path || "";
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      try {
        return await fs.realpath(path.join(directory, name));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  throw new Error(`Structured executable '${requested}' could not be resolved from the filtered PATH.`);
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      return await fs.realpath(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function resolveJavaExecutable(environment) {
  const javaName = process.platform === "win32" ? "java.exe" : "java";
  if (environment.JAVA_HOME) {
    const java = await firstExisting([path.join(environment.JAVA_HOME, "bin", javaName)]);
    if (java) return java;
  }
  return resolveExecutable(javaName, environment);
}

async function translateWindowsLauncher(executable, args, cwd, environment) {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(executable)) return { executable, args };
  const launcher = path.basename(executable).toLowerCase();
  const launcherDirectory = path.dirname(executable);
  const nodeEntries = {
    "npm.cmd": ["node_modules/npm/bin/npm-cli.js", "../node_modules/npm/bin/npm-cli.js", "node_modules/corepack/dist/npm.js"],
    "npx.cmd": ["node_modules/npm/bin/npx-cli.js", "../node_modules/npm/bin/npx-cli.js", "node_modules/corepack/dist/npx.js"],
    "yarn.cmd": ["node_modules/corepack/dist/yarn.js", "../node_modules/corepack/dist/yarn.js"],
    "pnpm.cmd": ["node_modules/corepack/dist/pnpm.js", "../node_modules/corepack/dist/pnpm.js"]
  };
  if (nodeEntries[launcher]) {
    const cli = await firstExisting(nodeEntries[launcher].map((entry) => path.resolve(launcherDirectory, entry)));
    if (!cli) throw new Error(`The trusted ${launcher} Node entry point could not be resolved without a shell.`);
    const node = await firstExisting([path.join(launcherDirectory, "node.exe"), process.execPath]);
    if (!node) throw new Error("The Node runtime for the package launcher is unavailable.");
    return { executable: node, args: [cli, ...args] };
  }
  if (launcher === "mvnw.cmd") {
    const wrapperJar = await firstExisting([path.join(cwd, ".mvn", "wrapper", "maven-wrapper.jar")]);
    if (!wrapperJar) throw new Error("The Maven wrapper JAR is unavailable; the command script will not be invoked through a shell.");
    return { executable: await resolveJavaExecutable(environment), args: ["-classpath", wrapperJar, "org.apache.maven.wrapper.MavenWrapperMain", ...args] };
  }
  if (launcher === "gradlew.bat") {
    const wrapperJar = await firstExisting([path.join(cwd, "gradle", "wrapper", "gradle-wrapper.jar")]);
    if (!wrapperJar) throw new Error("The Gradle wrapper JAR is unavailable; the batch script will not be invoked through a shell.");
    return { executable: await resolveJavaExecutable(environment), args: ["-classpath", wrapperJar, "org.gradle.wrapper.GradleWrapperMain", ...args] };
  }
  if (launcher === "mvn.cmd") {
    const mavenHome = path.dirname(launcherDirectory);
    const bootDirectory = path.join(mavenHome, "boot");
    const bootEntries = await fs.readdir(bootDirectory).catch(() => []);
    const classworlds = await firstExisting(bootEntries.filter((name) => /^plexus-classworlds-.+\.jar$/i.test(name)).map((name) => path.join(bootDirectory, name)));
    if (!classworlds) throw new Error("The Maven launcher JAR is unavailable; mvn.cmd will not be invoked through a shell.");
    return {
      executable: await resolveJavaExecutable(environment),
      args: ["-classpath", classworlds, `-Dclassworlds.conf=${path.join(mavenHome, "bin", "m2.conf")}`, `-Dmaven.home=${mavenHome}`, "org.codehaus.plexus.classworlds.launcher.Launcher", ...args]
    };
  }
  if (launcher === "gradle.bat") {
    const gradleHome = path.dirname(launcherDirectory);
    const libDirectory = path.join(gradleHome, "lib");
    const libEntries = await fs.readdir(libDirectory).catch(() => []);
    const gradleLauncher = await firstExisting(libEntries.filter((name) => /^gradle-launcher-.+\.jar$/i.test(name)).map((name) => path.join(libDirectory, name)));
    if (!gradleLauncher) throw new Error("The Gradle launcher JAR is unavailable; gradle.bat will not be invoked through a shell.");
    return { executable: await resolveJavaExecutable(environment), args: ["-classpath", gradleLauncher, "org.gradle.launcher.GradleMain", ...args] };
  }
  throw new Error(`The script launcher '${launcher}' is not supported by the shell-free structured broker.`);
}

class StructuredExecutionBroker {
  constructor() {
    this.active = 0;
    this.waiters = [];
  }

  async acquire(limit) {
    if (this.active < limit) {
      this.active += 1;
      return;
    }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  release() {
    this.active -= 1;
    this.waiters.shift()?.();
  }

  async validateDescriptor(descriptor, policy) {
    if (!descriptor || !Array.isArray(descriptor.args)) throw new Error("A structured executable and argument array are required.");
    const workspaceRoot = await fs.realpath(path.resolve(descriptor.workspaceRoot));
    const allowedRoots = policy.execution.allowedWorkspaceRoots || [];
    const workspaceAllowed = allowedRoots.some((entry) => {
      if (entry === "${workspaceRoot}") return true;
      const allowedRoot = path.resolve(String(entry || ""));
      return workspaceRoot === allowedRoot || workspaceRoot.startsWith(allowedRoot + path.sep);
    });
    if (!workspaceAllowed) throw new Error("The workspace root is not allowed by the effective AI security policy.");
    const cwd = await canonicalizeExistingParent(path.resolve(descriptor.cwd || workspaceRoot));
    if (!isInside(workspaceRoot, cwd)) throw new Error("Structured execution target escapes the workspace.");
    const validateWorkspacePaths = async (values) => {
      const paths = [];
      for (const value of values || []) {
        const candidate = await canonicalizeExistingParent(path.resolve(String(value || "")));
        if (!isInside(workspaceRoot, candidate)) throw new Error("A structured execution preparation path escapes the workspace.");
        paths.push(candidate);
      }
      return paths;
    };
    const environment = this.createEnvironment(descriptor, policy);
    const executable = await resolveExecutable(descriptor.executable, environment);
    const executableName = path.basename(executable).toLowerCase();
    const allowed = (policy.execution.allowedExecutables || []).some((entry) => {
      if (entry === "*") return true;
      if (path.isAbsolute(entry)) return path.resolve(entry).toLowerCase() === path.resolve(executable).toLowerCase();
      return path.basename(entry).toLowerCase() === executableName;
    });
    if (!allowed) throw new Error(`Executable '${executableName}' is not allowed by the effective AI security policy.`);
    const translated = await translateWindowsLauncher(executable, descriptor.args.map(String), cwd, environment);
    return {
      workspaceRoot,
      cwd,
      executable: translated.executable,
      args: translated.args,
      environment,
      prepareDirectories: await validateWorkspacePaths(descriptor.prepareDirectories),
      cleanDirectories: await validateWorkspacePaths(descriptor.cleanDirectories)
    };
  }

  createEnvironment(descriptor, policy) {
    const environment = {};
    for (const name of policy.execution.allowedEnvironmentVariables || []) {
      if (Object.hasOwn(process.env, name)) environment[name] = process.env[name];
    }
    for (const [name, value] of Object.entries(descriptor.environment || {})) {
      if ((policy.execution.allowedEnvironmentVariables || []).includes(name)) environment[name] = String(value);
    }
    return environment;
  }

  async execute(descriptor, policy, options = {}) {
    if (options.signal?.aborted) throw new Error("Structured execution was cancelled before it started.");
    const validated = await this.validateDescriptor(descriptor, policy);
    const limit = Math.max(1, Number(policy.execution.concurrency || 1));
    await this.acquire(limit);
    const startedAt = Date.now();
    try {
      if (options.signal?.aborted) throw new Error("Structured execution was cancelled before it started.");
      for (const directory of validated.cleanDirectories) await fs.rm(directory, { recursive: true, force: true });
      for (const directory of validated.prepareDirectories) await fs.mkdir(directory, { recursive: true });
      return await new Promise((resolve, reject) => {
        const outputLimit = Math.max(1024, Number(policy.shell.outputLimitBytes || 4194304));
        const child = spawn(validated.executable, validated.args, {
          cwd: validated.cwd,
          env: validated.environment,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let truncated = false;
        let timedOut = false;
        let capturedBytes = 0;
        const append = (current, chunk) => {
          const buffer = Buffer.from(chunk);
          const remaining = Math.max(0, outputLimit - capturedBytes);
          const accepted = buffer.subarray(0, remaining);
          capturedBytes += accepted.length;
          if (accepted.length < buffer.length) truncated = true;
          return current + accepted.toString();
        };
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
        child.on("error", reject);
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, Math.max(1000, Number(policy.shell.timeoutMs || 120000)));
        const abort = () => child.kill();
        options.signal?.addEventListener?.("abort", abort, { once: true });
        child.on("close", (exitCode, signal) => {
          clearTimeout(timeout);
          options.signal?.removeEventListener?.("abort", abort);
          resolve({
            success: exitCode === 0 && !timedOut && !options.signal?.aborted,
            exitCode,
            signal,
            stdout,
            stderr,
            outputTruncated: truncated,
            timedOut,
            cancelled: options.signal?.aborted === true,
            diagnostics: [],
            testCases: [],
            summary: {},
            artifacts: [],
            durationMs: Date.now() - startedAt,
            policySource: policy.metadata?.source || "product-defaults"
          });
        });
      });
    } finally {
      this.release();
    }
  }
}

module.exports = {
  StructuredExecutionBroker
};
