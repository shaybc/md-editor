#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { get } = require("https");

const MANIFEST_FILE = path.join(__dirname, "vendor-assets.json");
const VENDOR_DIR = path.join(__dirname, "resources", "vendor");
const DOWNLOAD_DIR = path.join(__dirname, "vendor", ".downloads");

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, ""));
}

const ASSETS = readJsonFile(MANIFEST_FILE);

function download(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    const request = get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadText(new URL(response.headers.location, url).toString())
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve(text));
    });

    request.on("error", reject);
  });
}

function getFileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function getExpectedSha256(asset) {
  if (asset.sha256) return String(asset.sha256).trim().toLowerCase();
  if (!asset.checksumUrl) return "";
  const checksumText = await downloadText(asset.checksumUrl);
  return String(checksumText || "").trim().split(/\s+/)[0].toLowerCase();
}

async function getAvailableSha256(asset) {
  try {
    return await getExpectedSha256(asset);
  } catch (error) {
    console.warn(`Checksum unavailable for ${asset.path}: ${error.message}`);
    return "";
  }
}

async function isExistingAssetValid(asset, destination) {
  if (!fs.existsSync(destination) || (!asset.optional && fs.statSync(destination).size <= 0)) return false;
  const expectedSha256 = await getExpectedSha256(asset);
  if (!expectedSha256) return true;
  return getFileSha256(destination) === expectedSha256;
}
function getCachedAssetPath(asset) {
  return asset.downloadPath ? path.join(DOWNLOAD_DIR, asset.downloadPath) : "";
}

function copyLocalAsset(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

async function restoreFromCachedDownload(asset, destination) {
  const cachedAssetPath = getCachedAssetPath(asset);
  if (!cachedAssetPath || !await isExistingAssetValid(asset, cachedAssetPath)) return false;
  copyLocalAsset(cachedAssetPath, destination);
  console.log(`Vendor asset restored from cache: ${asset.path}`);
  return true;
}

async function downloadAsset(asset, destination) {
  const cachedAssetPath = getCachedAssetPath(asset);
  const downloadDestination = cachedAssetPath || destination;
  await download(asset.url, downloadDestination);
  const expectedSha256 = await getAvailableSha256(asset);
  if (expectedSha256 && getFileSha256(downloadDestination) !== expectedSha256) {
    throw new Error(`Checksum mismatch for ${asset.path}`);
  }
  if (cachedAssetPath) copyLocalAsset(cachedAssetPath, destination);
}
function copySwaggerUiAssets() {
  const packageJsonPath = require.resolve("swagger-ui-dist/package.json");
  const sourceDir = path.dirname(packageJsonPath);
  const destinationDir = path.join(VENDOR_DIR, "swagger-ui");
  const files = ["swagger-ui-bundle.js", "swagger-ui.css", "LICENSE", "NOTICE"];
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(destinationDir, file));
    console.log(`Vendor asset present: swagger-ui/${file}`);
  }
}
(async function main() {
  copySwaggerUiAssets();

  for (const asset of ASSETS) {
    const destination = path.join(VENDOR_DIR, asset.path);
    if (await isExistingAssetValid(asset, destination)) {
      console.log(`Vendor asset present: ${asset.path}`);
      continue;
    }

    if (await restoreFromCachedDownload(asset, destination)) continue;

    console.log(`Downloading vendor asset: ${asset.path}`);
    try {
      await downloadAsset(asset, destination);
    } catch (error) {
      if (!asset.optional) throw error;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, "", "utf-8");
      console.warn(`Optional vendor asset unavailable: ${asset.path}`);
    }
  }
})();
