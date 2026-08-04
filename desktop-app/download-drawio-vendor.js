#!/usr/bin/env node

/** Materializes the pinned draw.io web application as an offline MD-Editor resource. */
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const DESKTOP_ROOT = __dirname;
const MANIFEST_PATH = path.join(DESKTOP_ROOT, "drawio-vendor.json");
const OVERLAY_ROOT = path.join(DESKTOP_ROOT, "drawio-overlay");
const DOWNLOAD_ROOT = path.join(DESKTOP_ROOT, "vendor", ".downloads");
const EXTRACTION_ROOT = path.join(DESKTOP_ROOT, "vendor", ".drawio-extract");
const DESTINATION_ROOT = path.join(DESKTOP_ROOT, "resources", "vendor", "diagram-editor");
const VERIFY_ONLY = process.argv.includes("--verify-only");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function assertPathInside(parentPath, candidatePath, label) {
  const parent = path.resolve(parentPath) + path.sep;
  const candidate = path.resolve(candidatePath);
  if (!candidate.startsWith(parent)) throw new Error(`${label} escapes its expected root: ${candidate}`);
  return candidate;
}

function removeGeneratedDirectory(parentPath, candidatePath) {
  const resolved = assertPathInside(parentPath, candidatePath, "Generated draw.io path");
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const file = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(file, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(file);
  }
  return hash.digest("hex");
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "md-editor-drawio-vendor" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Unable to download ${url}: HTTP ${response.statusCode}`));
        return;
      }
      const output = fs.createWriteStream(destination);
      response.pipe(output);
      output.on("finish", () => output.close(resolve));
      output.on("error", reject);
    });
    request.on("error", reject);
  });
}

function listArchiveEntries(archivePath) {
  const result = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Unable to inspect draw.io archive: ${result.stderr || result.stdout}`);
  const entries = result.stdout.split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\\/g, "/"));
  entries.forEach((entry) => {
    const normalized = path.posix.normalize(entry);
    if (normalized.startsWith("../") || normalized.includes("/../") || path.posix.isAbsolute(normalized)) {
      throw new Error(`Unsafe draw.io archive entry: ${entry}`);
    }
  });
  return entries;
}

function validateArchive(manifest, archivePath) {
  const actualHash = sha256(archivePath);
  if (actualHash !== String(manifest.sha256).toLowerCase()) {
    throw new Error(`draw.io checksum mismatch: expected ${manifest.sha256}, got ${actualHash}`);
  }
  const entries = listArchiveEntries(archivePath);
  for (const required of manifest.requiredEntries || []) {
    const expected = `${manifest.archiveRoot}/${required}`;
    if (!entries.some((entry) => entry === expected || entry.startsWith(`${expected}/`))) {
      throw new Error(`draw.io archive is missing required entry: ${required}`);
    }
  }
}

function validateManifest(manifest) {
  for (const field of ["version", "commit", "archive", "url", "sha256", "archiveRoot", "webappPath"]) {
    if (!String(manifest[field] || "").trim()) throw new Error(`drawio-vendor.json is missing ${field}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("drawio-vendor.json contains an invalid SHA-256");
  if (!Array.isArray(manifest.runtimeDirectories) || !manifest.runtimeDirectories.length) {
    throw new Error("drawio-vendor.json must declare runtimeDirectories");
  }
}

function extractArchive(manifest, archivePath, extractionPath) {
  fs.mkdirSync(extractionPath, { recursive: true });
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", extractionPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Unable to extract draw.io archive: ${result.stderr || result.stdout}`);
  const sourceRoot = path.join(extractionPath, manifest.archiveRoot);
  const webappRoot = path.join(sourceRoot, manifest.webappPath);
  if (!fs.existsSync(path.join(webappRoot, "index.html"))) throw new Error("Extracted draw.io web application is incomplete");
  return { sourceRoot, webappRoot };
}

function copyRuntime(manifest, webappRoot, destinationRoot) {
  fs.mkdirSync(destinationRoot, { recursive: true });
  for (const directory of manifest.runtimeDirectories) {
    const source = assertPathInside(webappRoot, path.join(webappRoot, directory), "draw.io runtime directory");
    if (!fs.existsSync(source)) throw new Error(`Pinned draw.io runtime directory is missing: ${directory}`);
    fs.cpSync(source, path.join(destinationRoot, directory), { recursive: true });
  }
  for (const file of manifest.runtimeFiles || []) {
    const source = assertPathInside(webappRoot, path.join(webappRoot, file), "draw.io runtime file");
    if (!fs.existsSync(source)) throw new Error(`Pinned draw.io runtime file is missing: ${file}`);
    fs.copyFileSync(source, path.join(destinationRoot, file));
  }
}

function applyOfflineOverlay(destinationRoot) {
  fs.copyFileSync(path.join(OVERLAY_ROOT, "js", "PreConfig.js"), path.join(destinationRoot, "js", "PreConfig.js"));
  fs.copyFileSync(path.join(OVERLAY_ROOT, "js", "PostConfig.js"), path.join(destinationRoot, "js", "PostConfig.js"));
  fs.copyFileSync(path.join(OVERLAY_ROOT, "md-editor.css"), path.join(destinationRoot, "styles", "md-editor.css"));

  const indexPath = path.join(destinationRoot, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Diagram Editor</title>");
  html = html.replace(/\s*<link rel="canonical"[^>]*>/gi, "");
  html = html.replace(/\s*<link rel="manifest"[^>]*>/gi, "");
  html = html.replace(/\s*<meta itemprop="image"[^>]*>/gi, "");
  const csp = "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
  const cspTag = `    <meta http-equiv="Content-Security-Policy" content="${csp}">`;
  if (!html.includes("Content-Security-Policy")) html = html.replace(/(<meta charset="utf-8">)/i, `$1\n${cspTag}`);
  if (!html.includes("styles/md-editor.css")) {
    html = html.replace(/(<link rel="stylesheet" type="text\/css" href="styles\/grapheditor\.css">)/i, "$1\n    <link rel=\"stylesheet\" type=\"text/css\" href=\"styles/md-editor.css\">");
  }
  if (!html.includes(cspTag) || !html.includes("styles/md-editor.css")) throw new Error("Unable to apply the draw.io index overlay");
  fs.writeFileSync(indexPath, html, "utf8");
}

function copyLicenses(sourceRoot, destinationRoot) {
  const licenseRoot = path.join(destinationRoot, "licenses");
  fs.mkdirSync(licenseRoot, { recursive: true });
  for (const file of ["LICENSE", "README.md"]) {
    const source = path.join(sourceRoot, file);
    if (!fs.existsSync(source)) throw new Error(`Pinned draw.io source is missing ${file}`);
    fs.copyFileSync(source, path.join(licenseRoot, file));
  }
  const noticePath = path.join(DESKTOP_ROOT, "resources", "vendor-licenses", "drawio", "NOTICE.md");
  if (!fs.existsSync(noticePath)) throw new Error("MD-Editor draw.io NOTICE is missing");
  fs.copyFileSync(noticePath, path.join(licenseRoot, "MD-EDITOR-NOTICE.md"));

}

function writeMaterialization(manifest, destinationRoot) {
  fs.writeFileSync(path.join(destinationRoot, "md-editor-materialization.json"), `${JSON.stringify({
    version: manifest.version,
    commit: manifest.commit,
    sha256: manifest.sha256,
    generatedAtUtc: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

function verifyMaterialized(manifest) {
  const markerPath = path.join(DESTINATION_ROOT, "md-editor-materialization.json");
  if (!fs.existsSync(markerPath)) throw new Error("Bundled Diagram Editor is missing. Run npm run setup:drawio.");
  const marker = readJson(markerPath);
  if (marker.commit !== manifest.commit || marker.sha256 !== manifest.sha256) {
    throw new Error("Bundled Diagram Editor does not match drawio-vendor.json. Run npm run setup:drawio.");
  }
  for (const file of ["index.html", "js/app.min.js", "js/PreConfig.js", "js/PostConfig.js", "styles/md-editor.css", "licenses/LICENSE", "licenses/README.md", "licenses/MD-EDITOR-NOTICE.md"]) {
    if (!fs.existsSync(path.join(DESTINATION_ROOT, file))) throw new Error(`Bundled Diagram Editor is missing ${file}`);
  }
  console.log(`Verified bundled Diagram Editor ${manifest.version} (${manifest.commit.slice(0, 12)}).`);
}

async function ensureArchive(manifest) {
  fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
  const archivePath = path.join(DOWNLOAD_ROOT, manifest.archive);
  const suppliedArchive = String(process.env.MDEDITOR_DRAWIO_ARCHIVE || "").trim();
  if (suppliedArchive) {
    fs.copyFileSync(path.resolve(suppliedArchive), archivePath);
  } else if (!fs.existsSync(archivePath)) {
    const partialPath = `${archivePath}.part`;
    if (fs.existsSync(partialPath)) fs.rmSync(partialPath, { force: true });
    console.log(`Downloading draw.io ${manifest.version}...`);
    await download(manifest.url, partialPath);
    fs.renameSync(partialPath, archivePath);
  }
  validateArchive(manifest, archivePath);
  return archivePath;
}

async function main() {
  const manifest = readJson(MANIFEST_PATH);
  validateManifest(manifest);
  if (VERIFY_ONLY) return verifyMaterialized(manifest);

  const archivePath = await ensureArchive(manifest);
  fs.mkdirSync(EXTRACTION_ROOT, { recursive: true });
  const extractionPath = assertPathInside(EXTRACTION_ROOT, path.join(EXTRACTION_ROOT, `drawio-${process.pid}-${Date.now()}`), "draw.io extraction path");
  try {
    const { sourceRoot, webappRoot } = extractArchive(manifest, archivePath, extractionPath);
    removeGeneratedDirectory(path.dirname(DESTINATION_ROOT), DESTINATION_ROOT);
    copyRuntime(manifest, webappRoot, DESTINATION_ROOT);
    applyOfflineOverlay(DESTINATION_ROOT);
    copyLicenses(sourceRoot, DESTINATION_ROOT);
    writeMaterialization(manifest, DESTINATION_ROOT);
    verifyMaterialized(manifest);
  } finally {
    removeGeneratedDirectory(EXTRACTION_ROOT, extractionPath);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
