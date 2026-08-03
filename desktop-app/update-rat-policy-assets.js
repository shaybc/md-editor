"use strict";

/** Release-maintainer utility for explicitly refreshing a pinned RAT schema artifact. */
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function main() {
  const version = readArgument("version");
  const schemaUrl = readArgument("schema-url");
  const expectedSha256 = readArgument("sha256").toLowerCase();
  if (!/^\d+\.\d+$/.test(version) || !/^https:\/\//.test(schemaUrl) || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("Usage: node update-rat-policy-assets.js --version 0.18 --schema-url https://official.example/schema.xsd --sha256 <64 hex characters>");
  }
  const content = await download(schemaUrl);
  const actualSha256 = sha256(content);
  if (actualSha256 !== expectedSha256) throw new Error(`Checksum mismatch: expected ${expectedSha256}, received ${actualSha256}.`);
  if (!content.toString("utf8", 0, Math.min(content.length, 4096)).includes("schema")) throw new Error("The downloaded artifact does not look like an XML schema.");

  const assetsRoot = path.join(__dirname, "resources", "assets", "rat-policy");
  const schemaPath = path.join(assetsRoot, "schemas", `rat-policy-${version}.xsd`);
  const manifestPath = path.join(assetsRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(schemaPath, content);
  const entry = (manifest.schemas || []).find((candidate) => candidate.ratVersion === version);
  const nextEntry = { ratVersion: version, path: `/assets/rat-policy/schemas/rat-policy-${version}.xsd`, kind: "official-pinned-artifact", source: schemaUrl, sha256: actualSha256, license: "Apache-2.0" };
  if (entry) Object.assign(entry, nextEntry);
  else manifest.schemas = [...(manifest.schemas || []), nextEntry];
  manifest.generatedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Updated RAT ${version} schema and manifest after SHA-256 verification.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
