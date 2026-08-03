"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnCommandSync } = require("./resources/bridges/lsp-proxy-common/process-launcher.cjs");

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

/** Builds the Kotlin ABI OSGi bundle against MD-Editor's installed JDT LS API. */
function main() {
  const appRoot = __dirname;
  const projectRoot = path.join(appRoot, "language-server-extensions", "kotlin-abi");
  const jdtPlugins = process.env.MDEDITOR_JDTLS_PLUGINS
    || path.join(os.homedir(), ".md-editor", "language-servers", "java", "plugins");
  const jdtCore = fs.existsSync(jdtPlugins)
    ? fs.readdirSync(jdtPlugins).filter((name) => /^org\.eclipse\.jdt\.ls\.core_.+\.jar$/i.test(name)).sort().pop()
    : "";
  if (!jdtCore) throw new Error(`JDT LS core bundle was not found under ${jdtPlugins}. Install JDT LS or set MDEDITOR_JDTLS_PLUGINS.`);
  const result = spawnCommandSync(process.platform === "win32" ? "mvn.cmd" : "mvn", ["-q", "-f", path.join(projectRoot, "pom.xml"), `-Djdt.ls.core.jar=${path.join(jdtPlugins, jdtCore)}`, "package"], {
    cwd: appRoot,
    env: { ...process.env, JAVA_HOME: resolveJavaHome() },
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("Kotlin ABI JDT extension build failed.");
  const source = path.join(projectRoot, "target", "mdeditor-kotlin-abi-jdt.jar");
  const destinationRoot = path.join(appRoot, "resources", "language-server-extensions");
  fs.mkdirSync(destinationRoot, { recursive: true });
  fs.copyFileSync(source, path.join(destinationRoot, "mdeditor-kotlin-abi.jar"));
}

try { main(); } catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
