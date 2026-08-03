"use strict";

/* Private Eclipse/AJDT runtime provisioning for the diagnostics sidecar. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { runProcess } = require("./gradle-model-exporter.cjs");

const ECLIPSE_SDK_URL = "https://download.eclipse.org/eclipse/downloads/drops4/R-4.40-202606010713/eclipse-SDK-4.40-win32-win32-x86_64.zip";
const ECLIPSE_SDK_SHA512 = "8120a18ccdd7baeb2b6e6dc09ae457e2cfa110e33bd77cef97a30db03742c15807097ca89b0bdc5f832787068bcdc01ae542283ec977c29221542cf24a083d41";
const AJDT_REPOSITORY = "https://download.eclipse.org/tools/aspectj/ajdt/439/dev/update/ajdt-e439-2.3.0.202602251945";

/** Resolve or create the private Eclipse runtime used only by AJDT diagnostics. */
async function ensureAjdtRuntime(options) {
  if (process.platform !== "win32") throw new Error("The experimental bundled AJDT runtime currently supports Windows only.");
  const runtimeRoot = path.join(os.homedir(), ".md-editor", "language-servers", "ajdt");
  const eclipseHome = path.join(runtimeRoot, "eclipse");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  if (!fs.existsSync(path.join(eclipseHome, "eclipsec.exe"))) {
    await downloadAndExtractEclipse(runtimeRoot, eclipseHome, options.onStatus);
  }
  await installAjdtIfMissing(eclipseHome, options.toolingJdkHome, options.workRoot, options.onStatus);
  return { runtimeRoot, eclipseHome };
}

async function downloadAndExtractEclipse(runtimeRoot, eclipseHome, onStatus) {
  const downloads = path.join(runtimeRoot, "downloads");
  const archivePath = path.join(downloads, "eclipse-sdk-4.40-win32-win32-x86_64.zip");
  fs.mkdirSync(downloads, { recursive: true });
  if (!fs.existsSync(archivePath)) {
    onStatus?.("Downloading the private Eclipse runtime for AJDT diagnostics...");
    await downloadFile(ECLIPSE_SDK_URL, archivePath);
  }
  const digest = crypto.createHash("sha512").update(fs.readFileSync(archivePath)).digest("hex");
  if (digest !== ECLIPSE_SDK_SHA512) throw new Error("The downloaded Eclipse SDK checksum did not match the expected release.");
  const extractionRoot = path.dirname(eclipseHome);
  if (fs.existsSync(extractionRoot)) {
    for (const entry of fs.readdirSync(extractionRoot)) {
      if (entry !== "downloads") fs.rmSync(path.join(extractionRoot, entry), { recursive: true, force: true });
    }
  }
  onStatus?.("Extracting the private Eclipse runtime...");
  const escapedArchive = archivePath.replace(/'/g, "''");
  const escapedDestination = extractionRoot.replace(/'/g, "''");
  const result = await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDestination}' -Force`], { cwd: runtimeRoot, env: process.env, shell: false });
  if (result.code !== 0 || !fs.existsSync(path.join(eclipseHome, "eclipsec.exe"))) throw new Error("The Eclipse SDK could not be extracted for AJDT diagnostics.");
}

async function installAjdtIfMissing(eclipseHome, toolingJdkHome, workRoot, onStatus) {
  const plugins = path.join(eclipseHome, "plugins");
  if (fs.readdirSync(plugins).some((name) => /^org\.eclipse\.ajdt\.core_.*\.jar$/i.test(name))) return;
  onStatus?.("Installing AJDT into its private diagnostics runtime...");
  const executable = path.join(eclipseHome, "eclipsec.exe");
  const javaw = path.join(toolingJdkHome, "bin", "javaw.exe");
  const result = await runProcess(executable, [
    "-vm", javaw,
    "-nosplash",
    "-application", "org.eclipse.equinox.p2.director",
    "-repository", AJDT_REPOSITORY,
    "-installIU", "org.eclipse.ajdt.feature.group",
    "-destination", eclipseHome,
    "-profile", "SDKProfile",
    "-profileProperties", "org.eclipse.update.install.features=true"
  ], { cwd: eclipseHome, env: process.env, shell: false });
  fs.writeFileSync(path.join(workRoot, "ajdt-install.log"), `${result.stdout}\n${result.stderr}`, "utf8");
  if (result.code !== 0 || !fs.readdirSync(plugins).some((name) => /^org\.eclipse\.ajdt\.core_.*\.jar$/i.test(name))) {
    throw new Error(`AJDT installation failed with exit code ${result.code}.`);
  }
}

/** Download one HTTPS artifact while following Eclipse mirror redirects. */
function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > 8) return Promise.reject(new Error("Too many redirects while downloading the Eclipse SDK."));
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirected = new URL(response.headers.location, url).toString();
        downloadFile(redirected, destination, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Eclipse SDK download returned HTTP ${response.statusCode}.`));
        return;
      }
      const temporary = `${destination}.download`;
      const output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on("finish", () => {
        output.close();
        fs.renameSync(temporary, destination);
        resolve();
      });
      output.on("error", reject);
    });
    request.on("error", reject);
  });
}

module.exports = { ensureAjdtRuntime };
