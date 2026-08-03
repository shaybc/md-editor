/* Downloads the pinned Kotlin LSP and public compiler used by the desktop release. */
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const appRoot = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "kotlin-language-tools.json"), "utf8"));
const vendorRoot = path.join(appRoot, "vendor");

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 8) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        return;
      }
      const output = fs.createWriteStream(destination);
      response.pipe(output);
      output.on("finish", () => output.close(resolve));
      output.on("error", reject);
    }).on("error", reject);
  });
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function extractZip(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:MDEDITOR_KOTLIN_ARCHIVE -DestinationPath $env:MDEDITOR_KOTLIN_DESTINATION -Force"
  ], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, MDEDITOR_KOTLIN_ARCHIVE: archive, MDEDITOR_KOTLIN_DESTINATION: destination }
  });
  if (result.status !== 0) throw new Error(`Unable to extract ${path.basename(archive)}.`);
}

async function installArchive(definition, destination) {
  if (definition.entry && fs.existsSync(path.join(destination, ...definition.entry.split("/")))) return;
  const cacheRoot = path.join(vendorRoot, ".downloads");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const archive = path.join(cacheRoot, definition.archive);
  if (!fs.existsSync(archive) || sha256(archive) !== definition.sha256) await download(definition.url, archive);
  const actual = sha256(archive);
  if (actual !== definition.sha256) throw new Error(`Checksum mismatch for ${definition.archive}: ${actual}`);
  extractZip(archive, destination);
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(`No bundled Kotlin tools are pinned for ${process.platform}-${process.arch}.`);
  }
  await installArchive(manifest.kotlinLsp.platforms["win-x64"], path.join(vendorRoot, "kotlin-lsp"));
  await installArchive(manifest.kotlinCompiler, path.join(vendorRoot, "kotlin-compiler"));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

