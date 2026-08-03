"use strict";

const path = require("path");
const { spawnCommand } = require("../lsp-proxy-common/process-launcher.cjs");

/** Exports Maven's effective model and dependency classpath without a compile lifecycle. */
async function exportMavenModel(options) {
  const effectivePom = path.join(options.cacheRoot, "maven-effective-pom.xml");
  const classpath = path.join(options.cacheRoot, "maven-classpath.txt");
  await runWithRetry(options.mavenExecutable, ["-q", "-f", options.pom, `-Dmaven.repo.local=${options.repository}`, "help:effective-pom", `-Doutput=${effectivePom}`], options);
  await runWithRetry(options.mavenExecutable, ["-q", "-f", options.pom, `-Dmaven.repo.local=${options.repository}`, "dependency:build-classpath", `-Dmdep.outputFile=${classpath}`], options);
  return { effectivePom, classpath };
}

async function runWithRetry(command, args, options) {
  try {
    return await run(command, args, options);
  } catch (error) {
    if (!error.stalled) throw error;
    options.onProgress?.("Maven model extraction stalled; retrying once.\n");
    return run(command, args, options);
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, { cwd: options.cwd, windowsHide: true, env: options.environment || process.env });
    let output = "";
    let lastProgress = Date.now();
    let stalled = false;
    const accept = (chunk) => {
      const text = String(chunk);
      output += text;
      lastProgress = Date.now();
      options.onProgress?.(text);
    };
    child.stdout.on("data", accept);
    child.stderr.on("data", accept);
    const timer = setInterval(() => {
      if (Date.now() - lastProgress <= (options.stallTimeoutMs || 300000)) return;
      stalled = true;
      child.kill();
    }, 1000);
    child.on("error", (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearInterval(timer);
      code === 0 ? resolve() : reject(Object.assign(new Error(output.trim() || `Maven exited with ${code}.`), { stalled }));
    });
  });
}

module.exports = { exportMavenModel };
