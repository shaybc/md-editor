const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.textContent = "";
    this.listeners = {};
  }
  set id(value) { this._id = value; this.ownerDocument.elements.set(value, this); }
  get id() { return this._id || ""; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentElement = this; child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.listeners.click?.({ target: this }); }
}

class FakeDocument {
  constructor() { this.elements = new Map(); }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.elements.get(id) || null; }
}

function findByClass(root, className) {
  const results = [];
  function visit(element) {
    if (String(element.className).split(/\s+/).includes(className)) results.push(element);
    element.children.forEach(visit);
  }
  visit(root);
  return results;
}

test("panel renders grouped options and uses the app notification service for help", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/panel.js");
  const document = new FakeDocument();
  const messages = [];
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const panel = context.window.registerMarkdownViewerMavenBuildOptionsPanel({ services: {}, registerModule() {} }, {
    document,
    notify: { alert(options) { messages.push(options); return Promise.resolve(); } }
  });
  const host = new FakeElement("div", document);
  const values = { "tests.compile": true };
  const session = {
    definitions: [{
      id: "tests.compile", label: "Compile tests", description: "Compile test sources.", help: "Long help.", badge: "",
      group: { id: "tests", label: "Tests" }, disabledReason: ""
    }],
    providerErrors: [],
    getValue(id) { return values[id]; },
    setValue(id, value) { values[id] = value; return this.resolve(); },
    resolve() { return { valid: true, values: { ...values }, arguments: [], persistedConfiguration: {}, warnings: [], errors: [] }; }
  };

  panel.mount(host, session);
  assert.equal(host.children[0].className, "maven-build-options-heading");
  assert.equal(host.children[1].className, "maven-build-options-dynamic-content");
  assert.equal(host.children[2].className, "maven-build-options-advanced");
  assert.equal(host.children[1].children[0].className, "maven-build-options-group");
  assert.equal(findByClass(host, "maven-build-options-group").length, 1);
  assert.equal(findByClass(host, "maven-build-option-label")[0].textContent, "Compile tests");
  findByClass(host, "maven-build-option-info")[1].click();
  await Promise.resolve();
  assert.equal(messages[0].title, "Compile tests");
  assert.equal(messages[0].message, "Long help.");
});

test("panel explains effective Maven configuration for detected plugins", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/panel.js");
  const document = new FakeDocument();
  const messages = [];
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const panel = context.window.registerMarkdownViewerMavenBuildOptionsPanel({ services: {}, registerModule() {} }, {
    document,
    notify: { alert(options) { messages.push(options); return Promise.resolve(); } }
  });
  const host = new FakeElement("div", document);
  const session = {
    definitions: [{
      id: "plugin.spotbugs.skip", label: "Skip SpotBugs for this rebuild", description: "Temporarily bypass SpotBugs.", help: "Plugin help.", badges: ["Quality bypass", "Profile only"],
      group: { id: "detected-plugins", label: "Detected plugins" }, disabledReason: ""
    }],
    providerErrors: [],
    getValue() { return false; },
    setValue() { return this.resolve(); },
    resolve() { return { valid: true, values: {}, arguments: [], persistedConfiguration: {}, warnings: [], errors: [] }; }
  };

  let inspections = 0;
  panel.mount(host, session, { onInspectEffectivePom() { inspections += 1; } });
  const links = findByClass(host, "maven-build-options-help-link");
  const badges = findByClass(host, "maven-build-option-badge");
  assert.deepEqual(badges.map((badge) => badge.textContent), ["Quality bypass", "Profile only"]);
  assert.match(badges[1].title, /Maven profile/);
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, "Inspect effective Maven configuration...");
  links[0].click();
  await Promise.resolve();
  assert.equal(inspections, 1);
  assert.equal(messages.length, 0);
  findByClass(host, "maven-build-option-info").find((button) => button.title === "Learn about Inspect effective Maven configuration").click();
  await Promise.resolve();
  assert.equal(messages[0].title, "Inspect effective Maven configuration");
  assert.match(messages[0].message, /active profiles/);
});

test("panel preserves scroll position when option changes rerender", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/panel.js");
  const document = new FakeDocument();
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const panel = context.window.registerMarkdownViewerMavenBuildOptionsPanel({ services: {}, registerModule() {} }, { document });
  const scroller = new FakeElement("div", document);
  const host = new FakeElement("div", document);
  scroller.appendChild(host);
  scroller.scrollTop = 340;
  host.scrollTop = 75;
  const values = { "plugin.spotless.skip": false };
  const session = {
    definitions: [{
      id: "plugin.spotless.skip", label: "Skip Spotless for this rebuild", description: "Temporarily bypass Spotless.", help: "Plugin help.", badges: ["Quality bypass"],
      group: { id: "detected-plugins", label: "Detected plugins" }, disabledReason: ""
    }],
    providerErrors: [],
    getValue(id) { return values[id]; },
    setValue(id, value) { values[id] = value; return this.resolve(); },
    resolve() { return { valid: true, values: { ...values }, arguments: [], persistedConfiguration: {}, warnings: [], errors: [] }; }
  };

  panel.mount(host, session);
  const checkbox = findByClass(host, "maven-build-option-control")[0].children[0];
  checkbox.checked = true;
  checkbox.listeners.change();

  assert.equal(scroller.scrollTop, 340);
  assert.equal(host.scrollTop, 75);
});
test("panel renders invocation-only advanced Maven arguments and validation feedback", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/panel.js");
  const document = new FakeDocument();
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const panel = context.window.registerMarkdownViewerMavenBuildOptionsPanel({ services: {}, registerModule() {} }, { document });
  const host = new FakeElement("div", document);
  let advancedRaw = "";
  let changed = 0;
  const session = {
    definitions: [],
    providerErrors: [],
    getValue() { return false; },
    getAdvancedArgumentsRaw() { return advancedRaw; },
    setAdvancedArgumentsRaw(value) { advancedRaw = value; return this.resolve(); },
    setValue() { return this.resolve(); },
    resolve() {
      const invalid = advancedRaw === "verify";
      return {
        valid: !invalid,
        values: {},
        arguments: invalid ? [] : advancedRaw.split(/\s+/).filter(Boolean),
        persistedConfiguration: {},
        warnings: [],
        errors: invalid ? [{ optionId: "advanced.maven.arguments", message: "Goals are not allowed." }] : []
      };
    }
  };

  panel.mount(host, session, { onChange() { changed += 1; } });
  const inputs = findByClass(host, "maven-build-options-advanced-input");
  assert.equal(inputs.length, 1);
  inputs[0].value = "verify";
  inputs[0].listeners.input();

  assert.equal(changed, 1);
  assert.equal(advancedRaw, "verify");
  assert.equal(findByClass(host, "maven-build-option-disabled").at(-1).textContent, "Goals are not allowed.");
});
test("panel disables effective POM inspection link while showing inspection status", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/project/maven-build-options/panel.js");
  const document = new FakeDocument();
  const messages = [];
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const panel = context.window.registerMarkdownViewerMavenBuildOptionsPanel({ services: {}, registerModule() {} }, {
    document,
    notify: { alert(options) { messages.push(options); return Promise.resolve(); } }
  });
  const host = new FakeElement("div", document);
  const session = {
    definitions: [{
      id: "plugin.spotbugs.skip", label: "Skip SpotBugs for this rebuild", description: "Temporarily bypass SpotBugs.", help: "Plugin help.", badges: ["Quality bypass", "Verified"],
      group: { id: "detected-plugins", label: "Detected plugins" }, disabledReason: ""
    }],
    providerErrors: [],
    getValue() { return false; },
    setValue() { return this.resolve(); },
    resolve() { return { valid: true, values: {}, arguments: [], persistedConfiguration: {}, warnings: [], errors: [] }; }
  };

  let inspections = 0;
  let minimized = 0;
  panel.mount(host, session, {
    inspectInProgress: true,
    statusMessage: "Inspecting effective Maven configuration in the terminal...",
    onInspectEffectivePom() { inspections += 1; },
    onMinimizeTask() { minimized += 1; }
  });

  const verifiedBadge = findByClass(host, "maven-build-option-badge").find((badge) => badge.textContent === "Verified");
  assert.match(verifiedBadge.title, /effective-POM inspection/);
  const link = findByClass(host, "maven-build-options-help-link")[0];
  assert.equal(link.disabled, true);
  link.click();
  await Promise.resolve();
  assert.equal(inspections, 0);
  const status = findByClass(host, "maven-build-options-status")[0];
  assert.equal(status.children[0].textContent, "Inspecting effective Maven configuration in the terminal...");
  const showTerminal = findByClass(host, "maven-build-options-status-action")[0];
  assert.equal(showTerminal.textContent, "Show terminal");
  showTerminal.click();
  assert.equal(minimized, 1);
  findByClass(host, "maven-build-option-info").find((button) => button.title === "Learn about Inspect effective Maven configuration").click();
  await Promise.resolve();
  assert.equal(messages[0].title, "Inspect effective Maven configuration");
  assert.match(messages[0].message, /minimizes this dialog/);
});
