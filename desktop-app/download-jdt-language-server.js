#!/usr/bin/env node

/* Downloads the pinned Eclipse JDT LS archive used by bundled Java analysis. */

const fs = require("fs");
const path = require("path");
const { get } = require("https");

const appRoot = __dirname;
const serverRegistryPath = path.join(appRoot, "resources", "js", "lsp", "server-registry.js");
const binRoot = path.join(appRoot, "bin");
const milestonesUrl = "https://download.eclipse.org/jdtls/milestones";

function readSupportedJdtVersion() {
  const source = fs.readFileSync(serverRegistryPath, "utf8");
  const match = source.match(/supportedVersion:\s*"([^"]+)"/);
  if (!match) throw new Error("Unable to read the supported Eclipse JDT LS version from server-registry.js.");
  return match[1];
}

function requestText(url, redirects = 0) {
  if (redirects > 8) return Promise.reject(new Error("Too many redirects while reading Eclipse JDT LS metadata."));
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        requestText(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Eclipse JDT LS metadata returned HTTP ${response.statusCode}.`));
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

function download(url, destination, redirects = 0) {
  if (redirects > 8) return Promise.reject(new Error("Too many redirects while downloading Eclipse JDT LS."));
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.download`;
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Eclipse JDT LS download returned HTTP ${response.statusCode}.`));
        return;
      }
      const output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on("finish", () => {
        output.close(() => {
          fs.renameSync(temporary, destination);
          resolve();
        });
      });
      output.on("error", (error) => {
        fs.rmSync(temporary, { force: true });
        reject(error);
      });
    }).on("error", reject);
  });
}

function findLatestArchiveName(html, version) {
  const escapedVersion = String(version || "").replace(/\./g, "\\.");
  const matcher = new RegExp(`jdt-language-server-${escapedVersion}-[^\"\x27<> ]+\\.tar\\.gz`, "g");
  return Array.from(String(html || "").matchAll(matcher)).map((match) => match[0]).sort().pop() || "";
}

async function resolveArchiveFromIndex(baseUrl, version) {
  const html = await requestText(baseUrl);
  const archiveName = findLatestArchiveName(html, version);
  if (!archiveName) throw new Error(`Unable to locate the Eclipse JDT LS archive for ${version}.`);
  return {
    archiveName,
    url: `${baseUrl}${archiveName}`
  };
}

function findLocalSupportedArchiveName(version) {
  if (!fs.existsSync(binRoot)) return "";
  const escapedVersion = String(version || "").replace(/\./g, "\\.");
  const matcher = new RegExp("^jdt-language-server-" + escapedVersion + "-.+\\.tar\\.gz$");
  return fs.readdirSync(binRoot)
    .filter((name) => matcher.test(name))
    .filter((name) => fs.statSync(path.join(binRoot, name)).size > 0)
    .sort()
    .pop() || "";
}

async function resolveSupportedArchive(version) {
  try {
    return await resolveArchiveFromIndex(`${milestonesUrl}/${version}/`, version);
  } catch (_milestoneError) {
    return resolveArchiveFromIndex("https://download.eclipse.org/jdtls/snapshots/", version);
  }
}

(async function main() {
  const version = readSupportedJdtVersion();
  const localArchiveName = findLocalSupportedArchiveName(version);
  if (localArchiveName) {
    console.log("Eclipse JDT LS archive present: " + localArchiveName);
    return;
  }
  const archive = await resolveSupportedArchive(version);
  const destination = path.join(binRoot, archive.archiveName);
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
    console.log(`Eclipse JDT LS archive present: ${archive.archiveName}`);
    return;
  }
  console.log(`Downloading Eclipse JDT LS ${version}: ${archive.archiveName}`);
  await download(archive.url, destination);
})();
