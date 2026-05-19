#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { get } = require("https");

const MANIFEST_FILE = path.join(__dirname, "vendor-assets.json");
const VENDOR_DIR = path.join(__dirname, "resources", "vendor");
const ASSETS = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));

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

(async function main() {
  for (const asset of ASSETS) {
    const destination = path.join(VENDOR_DIR, asset.path);
    if (
      fs.existsSync(destination) &&
      (asset.optional || fs.statSync(destination).size > 0)
    ) {
      console.log(`Vendor asset present: ${asset.path}`);
      continue;
    }

    console.log(`Downloading vendor asset: ${asset.path}`);
    try {
      await download(asset.url, destination);
    } catch (error) {
      if (!asset.optional) throw error;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, "", "utf-8");
      console.warn(`Optional vendor asset unavailable: ${asset.path}`);
    }
  }
})();
