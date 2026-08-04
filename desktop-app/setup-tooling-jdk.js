#!/usr/bin/env node

/* Materializes the pinned internal JDK used by JDT, AJDT, and Kotlin compiler analysis. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "tooling-jdk.json"), "utf8"));
const platform = manifest.platforms[`${process.platform}-${process.arch}`];
const binRoot = path.join(appRoot, "bin");
const installRoot = path.join(binRoot, "tooling-jdk");
const marker = path.join(installRoot, ".md-editor-tooling-jdk.json");

function isInstalled() {
  try {
    const installed = JSON.parse(fs.readFileSync(marker, "utf8"));
    return installed.version === manifest.version
      && fs.existsSync(path.join(installRoot, "bin", process.platform === "win32" ? "java.exe" : "java"))
      && fs.existsSync(path.join(installRoot, "bin", process.platform === "win32" ? "javac.exe" : "javac"))
      && fs.existsSync(path.join(installRoot, "bin", process.platform === "win32" ? "jar.exe" : "jar"));
  } catch (_error) {
    return false;
  }
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function restoreBundledArchive(downloads, archive, expectedSha256) {
  const parts = fs.readdirSync(downloads)
    .filter((name) => /^part-.*\.bin$/.test(name))
    .sort();
  if (parts.length === 0) return false;

  const temporary = `${archive}.restore`;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let output;
  try {
    fs.rmSync(temporary, { force: true });
    output = fs.openSync(temporary, "w");
    for (const part of parts) {
      console.log(`Adding bundled tooling JDK archive part: ${part}`);
      const input = fs.openSync(path.join(downloads, part), "r");
      try {
        let bytesRead;
        while ((bytesRead = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) {
          let bytesWritten = 0;
          while (bytesWritten < bytesRead) {
            bytesWritten += fs.writeSync(output, buffer, bytesWritten, bytesRead - bytesWritten);
          }
        }
      } finally {
        fs.closeSync(input);
      }
    }
    fs.closeSync(output);
    output = undefined;

    const actual = digest(temporary);
    if (actual !== expectedSha256) throw new Error(`Restored tooling JDK checksum mismatch: ${actual}`);
    fs.rmSync(archive, { force: true });
    fs.renameSync(temporary, archive);
    console.log(`Restored the bundled tooling JDK archive in ${archive}.`);
    return true;
  } catch (error) {
    if (output !== undefined) fs.closeSync(output);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function download(url, destination, redirects = 0) {
  if (redirects > 8) return Promise.reject(new Error("Too many redirects while downloading the tooling JDK."));
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Tooling JDK download returned HTTP ${response.statusCode}.`));
        return;
      }
      const temporary = `${destination}.download`;
      const output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on("finish", () => output.close(() => {
        fs.renameSync(temporary, destination);
        resolve();
      }));
      output.on("error", reject);
    }).on("error", reject);
  });
}

function extract(archive, destination) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:MDEDITOR_TOOLING_JDK_ARCHIVE -DestinationPath $env:MDEDITOR_TOOLING_JDK_DESTINATION -Force"
  ], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, MDEDITOR_TOOLING_JDK_ARCHIVE: archive, MDEDITOR_TOOLING_JDK_DESTINATION: destination }
  });
  if (result.status !== 0) throw new Error("The tooling JDK archive could not be extracted.");
}

async function main() {
  if (!platform) throw new Error(`No internal tooling JDK is pinned for ${process.platform}-${process.arch}.`);
  if (isInstalled()) {
    console.log(`MD-Editor tooling JDK ${manifest.version} is already installed.`);
    return;
  }
  const downloads = path.join(binRoot, ".downloads");
  const archive = path.join(downloads, platform.archive);
  const extractionRoot = path.join(binRoot, ".tooling-jdk-extract");
  fs.mkdirSync(downloads, { recursive: true });
  if (!fs.existsSync(archive) || digest(archive) !== platform.sha256) {
    const restored = restoreBundledArchive(downloads, archive, platform.sha256);
    if (!restored) await download(platform.url, archive);
  }
  const actual = digest(archive);
  if (actual !== platform.sha256) throw new Error(`Tooling JDK checksum mismatch: ${actual}`);
  fs.rmSync(extractionRoot, { recursive: true, force: true });
  extract(archive, extractionRoot);
  const extractedHome = path.join(extractionRoot, platform.archiveRoot);
  if (!fs.existsSync(path.join(extractedHome, "bin", "java.exe"))) throw new Error("The tooling JDK archive did not contain the expected JDK home.");
  fs.rmSync(installRoot, { recursive: true, force: true });
  fs.renameSync(extractedHome, installRoot);
  fs.rmSync(extractionRoot, { recursive: true, force: true });
  fs.writeFileSync(marker, JSON.stringify({ version: manifest.version, minimumFeature: manifest.minimumFeature }, null, 2), "utf8");
  console.log(`MD-Editor tooling JDK ${manifest.version} is ready in ${installRoot}.`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
