"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnCommandSync } = require("./resources/bridges/lsp-proxy-common/process-launcher.cjs");

/** Selects the newest matching OSGi bundle from an installed JDT LS plugins folder. */
function findBundle(plugins, prefix) {
  return fs.readdirSync(plugins).filter((name) => name.startsWith(`${prefix}_`) && name.endsWith(".jar")).sort().pop() || "";
}

/** Selects an installed Java 21+ runtime for compiling the JDT extension. */
function resolveJavaHome() {
  const candidates = [process.env.JAVA_HOME, ...[path.join(process.env.ProgramFiles || "C:\\Program Files", "Java")]
    .filter(fs.existsSync)
    .flatMap((root) => fs.readdirSync(root).map((name) => path.join(root, name)))];
  return candidates.filter((candidate) => candidate && fs.existsSync(path.join(candidate, "bin", "java.exe")))
    .map((candidate) => ({ candidate, feature: Number((path.basename(candidate).match(/(?:jdk-?)?(\d+)/i) || [])[1]) || 0 }))
    .filter((entry) => entry.feature >= 21)
    .sort((left, right) => right.feature - left.feature)[0]?.candidate || process.env.JAVA_HOME || "";
}

/** Builds and installs the Java Pull Up companion bundle used by JDT LS. */
function main() {
  const appRoot = __dirname;
  const projectRoot = path.join(appRoot, "language-server-extensions", "java-pull-up");
  const plugins = process.env.MDEDITOR_JDTLS_PLUGINS || path.join(os.homedir(), ".md-editor", "language-servers", "java", "plugins");
  const required = {
    "jdt.ls.core.jar": findBundle(plugins, "org.eclipse.jdt.ls.core"),
    "jdt.manipulation.jar": findBundle(plugins, "org.eclipse.jdt.core.manipulation"),
    "ltk.refactoring.jar": findBundle(plugins, "org.eclipse.ltk.core.refactoring"),
    "lsp4j.jar": findBundle(plugins, "org.eclipse.lsp4j")
  };
  const missing = Object.entries(required).filter(([, file]) => !file).map(([key]) => key);
  if (missing.length) throw new Error(`Required JDT LS bundles were not found under ${plugins}: ${missing.join(", ")}`);
  const properties = Object.entries(required).map(([key, file]) => `-D${key}=${path.join(plugins, file)}`);
  const result = spawnCommandSync(process.platform === "win32" ? "mvn.cmd" : "mvn", ["-q", "-f", path.join(projectRoot, "pom.xml"), ...properties, "package"], {
    cwd: appRoot,
    env: { ...process.env, JAVA_HOME: resolveJavaHome() },
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("Java Pull Up JDT extension build failed.");
  const source = path.join(projectRoot, "target", "mdeditor-java-pull-up-jdt-1.0.0.jar");
  const destinationRoot = path.join(appRoot, "resources", "language-server-extensions");
  fs.mkdirSync(destinationRoot, { recursive: true });
  fs.copyFileSync(source, path.join(destinationRoot, "mdeditor-java-pull-up.jar"));
}

try { main(); } catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
