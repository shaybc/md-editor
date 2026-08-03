const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const regexRoot = path.resolve(__dirname, "../resources/js/tools/regex-tester");
const { evaluateRequest, advanceIndex } = require(path.join(regexRoot, "javascript-worker.js"));
const { tokenizePattern } = require(path.join(regexRoot, "explanation.js"));
const { registerMarkdownViewerRegexTesterJavascriptEngine } = require(path.join(regexRoot, "javascript-engine.js"));
const { getQuickReference, getQuickReferenceGroups } = require(path.join(regexRoot, "quick-reference.js"));
const {
  registerMarkdownViewerRegexTesterStorage,
  createDefaultState,
  normalizeState
} = require(path.join(regexRoot, "storage.js"));
const { registerMarkdownViewerRegexTesterJavaEngine } = require(path.join(regexRoot, "java-engine.js"));
const { registerMarkdownViewerRegexTester } = require(path.join(regexRoot, "regex-tester.js"));

function evaluate(overrides = {}) {
  return evaluateRequest({
    requestId: "request-1",
    engine: "javascript",
    mode: "match",
    pattern: "",
    testString: "",
    replacement: "",
    flags: "gm",
    ...overrides
  });
}

test("JavaScript engine returns numbered and named captures with source ranges", () => {
  const result = evaluate({
    pattern: "(?<word>[a-z]+)-(\\d+)",
    testString: "abc-12 xyz-34",
    flags: "gi"
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches[0].groups.map((group) => ({
      index: group.index,
      name: group.name,
      start: group.start,
      end: group.end,
      value: group.value,
      matched: group.matched
    })),
    [
      { index: 1, name: "word", start: 0, end: 3, value: "abc", matched: true },
      { index: 2, name: null, start: 4, end: 6, value: "12", matched: true }
    ]
  );
});

test("JavaScript engine implements first/all replacement and native tokens", () => {
  const first = evaluate({
    mode: "replace",
    pattern: "(?<word>\\w+)",
    testString: "one two",
    replacement: "[$<word>]-$$-$&",
    flags: ""
  });
  const all = evaluate({
    mode: "replace",
    pattern: "(\\w+)",
    testString: "one two",
    replacement: "<$1>",
    flags: "g"
  });

  assert.equal(first.replacementOutput, "[one]-$-one two");
  assert.equal(all.replacementOutput, "<one> <two>");
  assert.deepEqual(first.replacementRanges, [
    { index: 0, start: 0, end: 11 }
  ]);
  assert.deepEqual(all.replacementRanges, [
    { index: 0, start: 0, end: 5 },
    { index: 1, start: 6, end: 11 }
  ]);
});

test("JavaScript engine reports syntax errors, caps results, and advances zero-width Unicode matches", () => {
  const invalid = evaluate({ pattern: "(", testString: "x" });
  const truncated = evaluate({ pattern: "(?=a)", testString: "a".repeat(10001), flags: "g" });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.type, "syntax");
  assert.equal(truncated.matches.length, 10000);
  assert.equal(truncated.truncated, true);
  assert.equal(advanceIndex("😀x", 0, true), 2);
  assert.equal(advanceIndex("😀x", 0, false), 1);
});

test("JavaScript worker adapter times out, terminates the worker, and recovers on the next request", async () => {
  const instances = [];
  class FakeWorker {
    constructor() {
      this.terminated = false;
      instances.push(this);
    }

    postMessage(request) {
      if (request.pattern === "hang") return;
      setTimeout(() => this.onmessage({ data: evaluateRequest(request) }), 0);
    }

    terminate() {
      this.terminated = true;
    }
  }

  const engine = registerMarkdownViewerRegexTesterJavascriptEngine({}, { Worker: FakeWorker, timeoutMs: 10 });
  const timedOut = await engine.evaluate({
    requestId: "timeout",
    pattern: "hang",
    testString: "text",
    replacement: "",
    mode: "match",
    flags: "g"
  });
  const recovered = await engine.evaluate({
    requestId: "recovered",
    pattern: "a",
    testString: "a",
    replacement: "",
    mode: "match",
    flags: "g"
  });

  assert.equal(timedOut.error.type, "timeout");
  assert.equal(instances[0].terminated, true);
  assert.equal(recovered.ok, true);
  assert.equal(instances.length, 2);
  engine.dispose();
});

test("explanation returns stable source ranges for groups, classes, escapes, anchors, alternation, quantifiers, and flags", () => {
  const pattern = "^(?<name>[A-Z]+|\\d{2})$";
  const tokens = tokenizePattern(pattern, "javascript", "gm");
  const types = new Set(tokens.map((token) => token.type));

  ["anchor", "group", "character-class", "quantifier", "alternation", "escape", "flag"].forEach((type) => {
    assert.equal(types.has(type), true, `missing ${type}`);
  });
  tokens.filter((token) => token.type !== "flag").forEach((token) => {
    assert.equal(pattern.slice(token.start, token.end), token.text);
  });
});

test("quick reference filters engine-specific replacement entries", () => {
  assert.equal(getQuickReference("javascript", "$<name>").some((entry) => entry.token.includes("$<name>")), true);
  assert.equal(getQuickReference("java", "${name}").some((entry) => entry.token.includes("${name}")), true);
  assert.equal(getQuickReference("java", "$&").length, 0);
});

test("quick reference exposes grouped engine-aware tokens", () => {
  assert.deepEqual(getQuickReferenceGroups().map((group) => group.id), [
    "all", "common", "general", "anchors", "meta", "quantifiers", "groups", "classes", "flags", "substitution"
  ]);
  assert.equal(getQuickReference("javascript", "", "quantifiers").every((entry) => entry.group === "quantifiers"), true);
  assert.equal(getQuickReference("javascript", "possessive", "quantifiers").length, 0);
  assert.equal(getQuickReference("java", "possessive", "quantifiers").length, 3);
  assert.equal(getQuickReference("javascript", "quoted literal", "meta").length, 0);
  assert.equal(getQuickReference("java", "quoted literal", "meta")[0].token, "\\Q...\\E");
  assert.equal(getQuickReference("javascript", "", "common").every((entry) => entry.group && entry.groupLabel), true);
});

test("storage defaults, normalizes mutually exclusive Unicode flags, and flushes local fallback", async () => {
  const values = new Map();
  const storage = registerMarkdownViewerRegexTesterStorage({}, {
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); }
    }
  });

  assert.deepEqual(await storage.loadLastSession(), createDefaultState());
  const normalized = normalizeState({
    version: 1,
    engine: "javascript",
    mode: "replace",
    pattern: "a",
    testString: "a",
    replacement: "b",
    flagsByEngine: { javascript: "guv", java: "gix" }
  });
  assert.equal(normalized.flagsByEngine.javascript, "gu");
  storage.saveLastSession(normalized);
  await storage.flush();
  const restoredStorage = registerMarkdownViewerRegexTesterStorage({}, {
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); }
    }
  });
  const restoredState = await restoredStorage.loadLastSession();
  assert.equal(restoredState.mode, "replace");
  assert.equal(restoredState.pattern, "a");
  assert.equal(restoredState.testString, "a");
});

test("profile storage updates and restores the pattern when its directory already exists", async () => {
  let profileText = JSON.stringify({
    version: 1,
    engine: "javascript",
    mode: "match",
    pattern: "",
    testString: "previous text",
    replacement: "",
    flagsByEngine: { javascript: "gm", java: "gm" }
  });
  const Neutralino = {
    filesystem: {
      async createDirectory() {
        throw new Error("directory already exists");
      },
      async writeFile(_path, value) {
        profileText = value;
      },
      async readFile() {
        return profileText;
      }
    }
  };
  const dependencies = {
    Neutralino,
    getProfileDataFilePath: async () => "C:/profile/regex-tester/last-session.json"
  };
  const storage = registerMarkdownViewerRegexTesterStorage({}, dependencies);
  storage.saveLastSession({
    version: 1,
    engine: "javascript",
    mode: "match",
    pattern: "restored-pattern",
    testString: "restored text",
    replacement: "",
    flagsByEngine: { javascript: "gm", java: "gm" }
  });
  await storage.flush();

  const restartedStorage = registerMarkdownViewerRegexTesterStorage({}, dependencies);
  const restoredState = await restartedStorage.loadLastSession();
  assert.equal(restoredState.pattern, "restored-pattern");
  assert.equal(restoredState.testString, "restored text");
});

test("Java engine parses framed Unicode responses and exposes helper version", () => {
  const processRouter = { registerProcess() { return () => {}; } };
  const engine = registerMarkdownViewerRegexTesterJavaEngine({}, {
    isNeutralinoRuntime: () => false,
    processRouter,
    Neutralino: {}
  });
  const response = {
    requestId: "java-1",
    engine: "java",
    ok: true,
    elapsedMs: 1,
    matches: [],
    replacementOutput: "שלום",
    truncated: false,

    error: null
  };
  const encode = engine._test.encodeBase64;
  engine._test.handleStdout(`READY\t${encode("21.0.4")}\nRES\tjava-1\t${encode(JSON.stringify(response))}\n`);
  assert.equal(engine.getJavaVersion(), "21.0.4");
});
test("Java engine leaves JavaScript usable when the bundled runtime is unavailable", async () => {
  const engine = registerMarkdownViewerRegexTesterJavaEngine({}, {
    isNeutralinoRuntime: () => false,
    Neutralino: {},
    processRouter: {}
  });
  const result = await engine.evaluate({ requestId: "missing-java" });

  assert.equal(result.ok, false);
  assert.equal(result.error.type, "unavailable");
  assert.match(result.error.message, /bundled tooling JDK unavailable/i);
});

test("active Regex-Tester rail clicks switch back to its sidebar and toggle sidebar visibility", () => {
  let sidebarVisible = true;
  let sidebarView = "regex-tester";
  const sidebarVisibilityCalls = [];
  const sidebarViewCalls = [];
  const module = registerMarkdownViewerRegexTester({}, {
    getActiveTab: () => ({ type: "regex-tester" }),
    openRegexTesterInTab: () => ({ id: "regex-tester", type: "regex-tester" }),
    isSidebarVisible: () => sidebarVisible,
    getSidebarView: () => sidebarView,
    setSidebarVisible(visible) {
      sidebarVisible = visible;
      sidebarVisibilityCalls.push(visible);
    },
    setSidebarView(view) {
      sidebarView = view;
      sidebarViewCalls.push(view);
    }
  });

  module.openRegexTester();
  assert.equal(sidebarVisible, false);

  module.openRegexTester();
  assert.equal(sidebarVisible, true);
  assert.equal(sidebarView, "regex-tester");

  sidebarView = "files";
  module.openRegexTester();
  assert.equal(sidebarVisible, true);
  assert.equal(sidebarView, "regex-tester");
  assert.deepEqual(sidebarVisibilityCalls, [false, true, true]);
  assert.deepEqual(sidebarViewCalls, ["regex-tester", "regex-tester"]);
});

test("tab integration declares singleton creation, lifecycle, and session exclusion", () => {
  const tabsSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/index.js"), "utf8");
  const viewManagerSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/view-manager.js"), "utf8");
  const persistenceSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/persistence.js"), "utf8");
  const indexSource = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/script.js"), "utf8");

  assert.match(tabsSource, /function createRegexTesterTab\(\)/);
  assert.match(tabsSource, /tabs\.find\(function\(candidate\) \{ return candidate\?\.type === "regex-tester"; \}\)/);
  assert.match(viewManagerSource, /mountRegexTesterTab/);
  assert.match(viewManagerSource, /destroyRegexTesterTab/);
  assert.match(persistenceSource, /tab\.type === "regex-tester"\) return null/);
  assert.match(appSource, /await regexTesterStorage\.flush\(\);/);
  const railStart = indexSource.indexOf('data-sidebar-view="api-client"');
  const railMarkup = indexSource.slice(railStart, railStart + 1200);
  assert.ok(railMarkup.indexOf("open-regex-tester") > 0);
  assert.ok(railMarkup.indexOf("open-regex-tester") < railMarkup.indexOf("open-code-converter-dialog"));
  const regexTesterSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/tools/regex-tester/regex-tester.js"), "utf8");
  assert.match(regexTesterSource, /class="regex-tester-text-editor"/);
  assert.match(regexTesterSource, /class="regex-tester-highlight-overlay" aria-hidden="true"/);
  assert.equal((regexTesterSource.match(/class="regex-tester-test-string"/g) || []).length, 1);
  assert.doesNotMatch(regexTesterSource, /aria-label="Highlighted matches"/);
});
