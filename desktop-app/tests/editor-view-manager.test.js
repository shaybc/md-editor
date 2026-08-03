const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/view-manager.js"), "utf8").replace(/^\uFEFF/, "");
const editorSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/codemirror-editor.js"), "utf8").replace(/^\uFEFF/, "");
const catalogSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/license-reference-catalog.js"), "utf8").replace(/^\uFEFF/, "");
const headerSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/editor/license-summary-header.js"), "utf8").replace(/^\uFEFF/, "");
const saveSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/files/save.js"), "utf8").replace(/^\uFEFF/, "");
const tabsSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/index.js"), "utf8").replace(/^\uFEFF/, "");

test("textarea facade avoids recursive primary textarea focus", () => {
  const nativeFocusIndex = source.indexOf("const nativeFocus = primaryTextarea.focus.bind(primaryTextarea);");
  const overrideIndex = source.indexOf("primaryTextarea.focus = function(options)");
  const primaryGuardIndex = source.indexOf("if (target && target !== primaryTextarea) target.focus?.(options);");
  const nativeFocusCallIndex = source.indexOf("else nativeFocus(options);");

  assert.notEqual(nativeFocusIndex, -1);
  assert.notEqual(overrideIndex, -1);
  assert.equal(nativeFocusIndex < overrideIndex, true);
  assert.equal(overrideIndex < primaryGuardIndex, true);
  assert.equal(primaryGuardIndex < nativeFocusCallIndex, true);
});

test("textarea facade uses native primary textarea methods for primary target", () => {
  assert.match(source, /const nativeSetSelectionRange = primaryTextarea\.setSelectionRange\.bind\(primaryTextarea\);/);
  assert.match(source, /const nativeBlur = primaryTextarea\.blur\.bind\(primaryTextarea\);/);
  assert.match(source, /target && target !== primaryTextarea/);
  assert.match(source, /nativeSetSelectionRange\.apply\(primaryTextarea, arguments\);/);
  assert.match(source, /else nativeBlur\(\);/);
});

test("editor view manager passes and updates CodeMirror autocomplete preferences", () => {
  assert.match(source, /const getAutocompletePreferences = deps\.getAutocompletePreferences/);
  assert.match(source, /const autocompletePreferences = getAutocompletePreferences\(\);/);
  assert.match(source, /languageAutocompleteEnabled: autocompletePreferences\.language === true/);
  assert.match(source, /languageServerAutocompleteEnabled: autocompletePreferences\.languageServer === true/);
  assert.match(source, /snippetAutocompleteEnabled: autocompletePreferences\.snippets === true/);
  assert.match(source, /const getSnippetDefinitions = deps\.getSnippetDefinitions/);
  assert.match(source, /getSnippetDefinitions,/);
  assert.match(source, /function setAutocompletePreferencesForEditorViews\(preferences\)/);
  assert.match(source, /view\.codeMirrorEditor\?\.setAutocompletePreferences\?\.\(preferences \|\| \{\}\)/);
  assert.match(source, /function refreshSnippetDefinitionsForEditorViews\(\)/);
  assert.match(source, /view\.codeMirrorEditor\?\.refreshSnippetDefinitions\?\.\(\)/);
});

test("editor view manager delays LSP attachment and detaches background tabs", () => {
  assert.match(source, /LSP_TAB_ACTIVATION_DELAY_MS = Number\.isFinite\(deps\.lspActivationDelayMs\) \? deps\.lspActivationDelayMs : 750/);
  assert.match(source, /function shouldDelayJavaLspAttachment\(view\)/);
  assert.match(source, /language\?\.id === "java" \|\| language\?\.codeMirrorLanguage === "java"/);
  assert.match(source, /lspActivationEnabled: !shouldDelayJavaLspAttachment\(view\)/);
  assert.match(source, /function scheduleActiveViewLspAttachment\(view\)/);
  assert.match(source, /if \(!shouldDelayJavaLspAttachment\(view\)/);
  assert.match(source, /if \(activeView !== view\) return;/);
  assert.match(source, /void view\.codeMirrorEditor\.setLspActivationEnabled\(true\);/);
  assert.match(source, /void view\.codeMirrorEditor\?\.setLspActivationEnabled\?\.\(false\);/);
  assert.match(editorSource, /if \(lspActivationEnabled\) void refreshLspSessionForActivePath\(\);/);
  assert.match(editorSource, /function setLspActivationEnabled\(enabled\)/);
  assert.match(editorSource, /lspSessionRequestId \+= 1;/);
  assert.match(editorSource, /codeMirror\.setLspSession\?\.\(null\);/);
});

test("offline license catalog gates known filenames before exact matching", async () => {
  const context = vm.createContext({ console });
  vm.runInContext(catalogSource, context, { filename: "license-reference-catalog.js" });
  const candidateNames = [
    "LICENSE", "LICENSE.txt", "LICENSE.md", "LICENSE.rst", "LICENCE", "LICENCE.txt", "LICENCE.md",
    "COPYING", "COPYING.txt", "COPYING.md", "COPYRIGHT", "COPYRIGHT.txt", "COPYRIGHT.md",
    "NOTICE", "NOTICE.txt", "NOTICE.md", "LEGAL", "LEGAL.txt", "LEGAL.md", "PATENTS", "PATENTS.txt",
    "UNLICENSE", "UNLICENSE.txt", "LICENSE-MIT", "LICENSE-APACHE", "LICENSE-GPL", "LICENSE.BSD",
    "LICENSE.third-party", "LICENSES.txt", "THIRD_PARTY_LICENSES", "THIRD-PARTY-NOTICES",
    "ThirdPartyNotices.txt", "OpenSourceNotices.txt"
  ];
  let fetchCount = 0;
  const manifest = {
    formatVersion: 1,
    labels: { "commercial-use": "Commercial use", warranty: "Warranty", "include-copyright": "License notice" },
    licenses: [{
      id: "Test",
      name: "Test License",
      description: "Test description",
      permissions: ["commercial-use"],
      limitations: ["warranty"],
      conditions: ["include-copyright"],
      textPath: "/test-license.txt"
    }]
  };
  const catalog = context.registerMarkdownViewerLicenseReferenceCatalog(null, {
    fetch: async (url) => {
      fetchCount += 1;
      if (url === "/assets/license-header/manifest.json") return { ok: true, json: async () => manifest };
      if (url === "/test-license.txt") return { ok: true, text: async () => "line one\nline two\n" };
      return { ok: false };
    }
  });

  candidateNames.forEach((name) => assert.equal(catalog.isCandidateFileName(`C:\\project\\${name.toLowerCase()}`), true, name));
  assert.equal(catalog.isCandidateFileName("LICENSE.backup"), false);
  assert.equal(catalog.isCandidateFileName("my-license.txt"), false);
  assert.equal(await catalog.match("README.md", "line one\nline two\n"), null);
  assert.equal(fetchCount, 0);

  const matched = await catalog.match("C:\\project\\LICENSE", "\uFEFFline one\r\nline two\r\n");
  assert.equal(matched.name, "Test License");
  assert.deepEqual(Array.from(matched.permissions), ["Commercial use"]);
  assert.equal(await catalog.match("LICENSE", "line one\nline two!\n"), null);
  assert.equal(await catalog.match("LICENSE", "line one\nline two"), null);
  assert.equal(await catalog.match("LICENSE", "line one \nline two\n"), null);
  assert.equal(fetchCount, 2, "manifest and canonical text should be cached after the first eligible match");
});

test("offline license catalog treats declared copyright fields as placeholders", async () => {
  const context = vm.createContext({ console });
  vm.runInContext(catalogSource, context, { filename: "license-reference-catalog.js" });
  const canonicalApache = fs.readFileSync(
    path.resolve(__dirname, "../resources/assets/license-header/licenses/apache-2.0.txt"),
    "utf8"
  );
  const manifest = {
    formatVersion: 1,
    placeholderTokens: ["[year]", "[yyyy]", "[fullname]", "[name of copyright owner]"],
    labels: {},
    licenses: [{
      id: "Apache-2.0",
      name: "Apache License 2.0",
      description: "Apache",
      permissions: [],
      limitations: [],
      conditions: [],
      textPath: "/apache-2.0.txt"
    }]
  };
  const catalog = context.registerMarkdownViewerLicenseReferenceCatalog(null, {
    fetch: async (url) => url === "/assets/license-header/manifest.json"
      ? { ok: true, json: async () => manifest }
      : { ok: true, text: async () => canonicalApache }
  });
  const completedLicense = canonicalApache
    .replace("[yyyy]", "2024")
    .replace("[name of copyright owner]", "ThisIs_Developer");

  assert.equal((await catalog.match("LICENSE", completedLicense))?.id, "Apache-2.0");
  assert.equal((await catalog.match("LICENSE", completedLicense.replace("Licensed under", "Licensed below"))), null);
  assert.equal((await catalog.match("LICENSE", canonicalApache.replace("[yyyy]", ""))), null);
  assert.equal((await catalog.match("LICENSE", completedLicense.replace("ThisIs_Developer", "ThisIs\nDeveloper"))), null);
});
test("offline license catalog fails closed and warns only once", async () => {
  const context = vm.createContext({ console });
  vm.runInContext(catalogSource, context, { filename: "license-reference-catalog.js" });
  let warningCount = 0;
  const catalog = context.registerMarkdownViewerLicenseReferenceCatalog(null, {
    fetch: async () => ({ ok: false }),
    console: { warn: () => { warningCount += 1; } }
  });

  assert.equal(await catalog.match("LICENSE", "unknown"), null);
  assert.equal(await catalog.match("LICENSE", "unknown"), null);
  assert.equal(warningCount, 1);
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) this.values.add(name);
    else if (force === false) this.values.delete(name);
    else if (this.values.has(name)) this.values.delete(name);
    else this.values.add(name);
    return this.values.has(name);
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = "";
    this.value = "";
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children.forEach((child) => { child.parentElement = null; }); this.children = []; this.append(...children); }
  insertBefore(child, reference) {
    child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type) { this.listeners.get(type)?.forEach((listener) => listener({ type, target: this })); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

function collectFakeText(element) {
  return [element.textContent, ...element.children.map(collectFakeText)].filter(Boolean).join(" ");
}

function createHeaderController(catalog) {
  const context = vm.createContext({ console });
  vm.runInContext(headerSource, context, { filename: "license-summary-header.js" });
  return context.registerMarkdownViewerLicenseSummaryHeader(null, {
    catalog,
    document: { createElement: (tagName) => new FakeElement(tagName) }
  });
}

function createHeaderMount(controller, value = "canonical") {
  const editorPane = new FakeElement("div");
  const editorShell = editorPane.appendChild(new FakeElement("div"));
  const textarea = new FakeElement("textarea");
  textarea.value = value;
  const host = controller.mount({ tabId: "tab-1", getPath: () => "LICENSE", editorPane, editorShell, textarea });
  return { editorPane, editorShell, textarea, host };
}

test("license summary header renders safely and follows input and destroy lifecycle", async () => {
  const match = Object.freeze({
    name: "Test <License>",
    description: "Description <script>",
    permissions: ["Commercial use"],
    limitations: ["Warranty"],
    conditions: ["License notice"]
  });
  const catalog = {
    isCandidateFileName: () => true,
    match: async (_path, content) => content === "canonical" ? match : null
  };
  const controller = createHeaderController(catalog);
  const mounted = createHeaderMount(controller);

  await controller.refresh("tab-1");
  assert.equal(mounted.host.hidden, false);
  assert.match(collectFakeText(mounted.host), /Test <License>/);
  assert.match(collectFakeText(mounted.host), /Permissions/);
  assert.match(collectFakeText(mounted.host), /Limitations/);
  assert.match(collectFakeText(mounted.host), /Conditions/);
  assert.match(collectFakeText(mounted.host), /This is not legal advice/);
  assert.equal(mounted.editorPane.classList.contains("license-summary-visible"), true);

  mounted.textarea.value = "changed";
  mounted.textarea.dispatch("input");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mounted.host.hidden, true);

  mounted.textarea.value = "canonical";
  mounted.textarea.dispatch("input");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mounted.host.hidden, false);

  controller.destroy("tab-1");
  assert.equal(controller.getMountedTabCount(), 0);
  assert.equal(mounted.textarea.listeners.get("input").size, 0);
  assert.equal(mounted.host.parentElement, null);
  assert.doesNotMatch(headerSource, /innerHTML/);
});

test("license summary header ignores stale asynchronous matches", async () => {
  const pending = [];
  const catalog = {
    isCandidateFileName: () => true,
    match: async (_path, content) => new Promise((resolve) => pending.push({ content, resolve }))
  };
  const controller = createHeaderController(catalog);
  const mounted = createHeaderMount(controller, "first");
  mounted.textarea.value = "second";
  mounted.textarea.dispatch("input");
  assert.equal(pending.length, 2);

  pending[1].resolve({ name: "Second", description: "Latest", permissions: [], limitations: [], conditions: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(collectFakeText(mounted.host), /Second/);
  pending[0].resolve({ name: "First", description: "Stale", permissions: [], limitations: [], conditions: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(collectFakeText(mounted.host), /First/);
});

test("editor, save, and rename flows delegate license header lifecycle", () => {
  assert.match(source, /licenseSummaryHeader\?\.mount\?\./);
  assert.match(source, /licenseSummaryHeader\?\.destroy\?\.\(tabId\)/);
  assert.match(source, /refreshLicenseHeaderForTab/);
  assert.match(saveSource, /onTabSourceMetadataChanged\?\.\(tab\)/);
  assert.match(tabsSource, /refreshLicenseHeaderForTab\?\.\(tab\.id\)/);
});
