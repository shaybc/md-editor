#!/usr/bin/env node

/**
 * prepare.js — Build script for the Neutralinojs desktop app.
 *
 * Copies shared browser-version files (js/, script.js, styles.css, assets/)
 * from web-app/ into desktop-app/resources/, and generates a
 * Neutralinojs-compatible index.html from web-app/index.html by
 * injecting the required Neutralinojs script tags and wrapper elements.
 *
 * Run from the desktop-app/ directory:
 *   node prepare.js
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const WEB_APP_DIR = path.join(ROOT_DIR, "web-app");
const RESOURCES_DIR = path.resolve(__dirname, "resources");

/** @section Copy shared files */

/**
 * Recursively copy a directory, creating target dirs as needed.
 * Copies all files in the source directory into the generated resources tree.
 */
function copyDirSync(src, dest, exclude = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;  // ← skip excluded files
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}


/** web-app/js/ → resources/js/ */
const jsDest = path.join(RESOURCES_DIR, "js");
copyDirSync(path.join(WEB_APP_DIR, "js"), jsDest);
console.log("✓ Copied web-app/js/ → resources/js/");

/** script.js → resources/js/script.js */
fs.copyFileSync(
  path.join(WEB_APP_DIR, "script.js"),
  path.join(jsDest, "script.js"),
);
console.log("✓ Copied script.js → resources/js/script.js");

/** styles.css → resources/styles.css */
fs.copyFileSync(
  path.join(WEB_APP_DIR, "styles.css"),
  path.join(RESOURCES_DIR, "styles.css"),
);
console.log("✓ Copied styles.css → resources/styles.css");

/** assets/ → resources/assets/ */
copyDirSync(path.join(WEB_APP_DIR, "assets"), path.join(RESOURCES_DIR, "assets"));
console.log("✓ Copied assets/ → resources/assets/");

/** @section Generate index.html with Neutralinojs injections */

let html = fs.readFileSync(path.join(WEB_APP_DIR, "index.html"), "utf-8");

/** Fix relative asset paths → absolute (Neutralinojs documentRoot is /resources/) */
html = html.replace(/href="assets\//g, 'href="/assets/');
html = html.replace(/href="styles\.css"/g, 'href="/styles.css"');
html = html.replace(/src="js\/core\/context\.js"/g, 'src="/js/core/context.js"');
/** Replace web-app script.js tag with neutralino.js + main.js + script.js under /js/ */
html = html.replace(
  /<script src="script\.js"><\/script>/,
  '<script src="/js/neutralino.js"></script>\n    <script src="/js/main.js"></script>\n    <script src="/js/script.js"></script>',
);

/** Inject Neutralinojs app-info element after .app-container */
html = html.replace(
  '<div class="app-container">',
  `<div class="app-container">
      <div id="neutralino-app">
        <div id="neutralino-info"></div>
      </div>`,
);

fs.writeFileSync(path.join(RESOURCES_DIR, "index.html"), html, "utf-8");
console.log(
  "✓ Generated resources/index.html (Neutralinojs injections applied)",
);

console.log("\nDone! Run `npm run dev` to start the desktop app.");
