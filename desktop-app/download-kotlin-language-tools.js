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
function readPartsManifest(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((values, line) => {
    const separator = line.indexOf("=");
    if (separator > 0) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    return values;
  }, {});
}

function restoreArchiveFromParts(packageName, partsDirectory, archive, expectedSha256) {
  if (!partsDirectory || !fs.existsSync(partsDirectory)) return false;
  const manifestPath = path.join(partsDirectory, "manifest.txt");
  if (!fs.existsSync(manifestPath)) throw new Error(`Archive parts manifest not found: ${manifestPath}`);

  const partsManifest = readPartsManifest(manifestPath);
  if (partsManifest.FileName !== path.basename(archive)) {
    throw new Error(`Archive parts filename mismatch: ${partsManifest.FileName || "missing"}`);
  }
  if (String(partsManifest.SHA256 || "").toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`Archive parts checksum does not match the pinned checksum for ${packageName}.`);
  }

  const parts = fs.readdirSync(partsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^part-.*\.bin$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const expectedPartCount = Number(partsManifest.PartCount);
  if (!parts.length) throw new Error(`No archive parts were found for ${packageName}.`);
  if (!Number.isInteger(expectedPartCount) || expectedPartCount !== parts.length) {
    throw new Error(`Expected ${partsManifest.PartCount || "a valid number of"} parts for ${packageName}, but found ${parts.length}.`);
  }

  console.log(`Restoring ${packageName} from ${parts.length} bundled archive parts...`);
  const temporary = `${archive}.restore`;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let output;
  try {
    fs.rmSync(temporary, { force: true });
    output = fs.openSync(temporary, "w");
    for (const part of parts) {
      console.log(`Adding bundled archive part: ${part}`);
      const input = fs.openSync(path.join(partsDirectory, part), "r");
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

    const actual = sha256(temporary);
    if (actual !== expectedSha256) throw new Error(`Restored archive checksum mismatch for ${packageName}: ${actual}`);
    fs.renameSync(temporary, archive);
    console.log(`Restored ${packageName}: ${archive}`);
    return true;
  } catch (error) {
    if (output !== undefined) fs.closeSync(output);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
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

async function installArchive(packageName, definition, destination, partsDirectory = null) {
  if (definition.entry && fs.existsSync(path.join(destination, ...definition.entry.split("/")))) return;
  const cacheRoot = path.join(vendorRoot, ".downloads");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const archive = path.join(cacheRoot, definition.archive);
  if (!fs.existsSync(archive)) {
    const restored = restoreArchiveFromParts(packageName, partsDirectory, archive, definition.sha256);
    if (!restored) {
      console.log(`Downloading ${packageName}: ${definition.archive}`);
      const temporary = `${archive}.download`;
      fs.rmSync(temporary, { force: true });
      try {
        await download(definition.url, temporary);
        fs.renameSync(temporary, archive);
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw error;
      }
    }
  }
  const actual = sha256(archive);
  if (actual !== definition.sha256) throw new Error(`Checksum mismatch for ${definition.archive}: ${actual}`);
  extractZip(archive, destination);
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(`No bundled Kotlin tools are pinned for ${process.platform}-${process.arch}.`);
  }
  await installArchive(`Kotlin Language Server ${manifest.kotlinLsp.version}`, manifest.kotlinLsp.platforms["win-x64"], path.join(vendorRoot, "kotlin-lsp"), path.join(vendorRoot, ".downloads", "kotlin-server-parts"));
  await installArchive(`Kotlin Compiler ${manifest.kotlinCompiler.version}`, manifest.kotlinCompiler, path.join(vendorRoot, "kotlin-compiler"));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

