const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class ElementStub {
  constructor(selector = "") {
    this.selector = selector;
    this.dataset = {};
    this.children = [];
    this.style = {};
    this.disabled = false;
    this.attributes = {};
    this.listeners = {};
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {} };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    const index = this.children.indexOf(reference);
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  blur() {
    this.blurred = true;
  }
}

function loadTerminal(extraDeps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/terminal/desktop-terminal.js"), "utf8");
  const buttons = {
    default: [new ElementStub(".open-terminal-default")],
    profile: [new ElementStub(".open-terminal-profile")]
  };
  buttons.profile[0].dataset.terminalProfile = "git-bash";
  const savedState = extraDeps.savedState || {};
  const addedBottomPanelTabs = [];
  const env = {
    HOMEDRIVE: "C:",
    HOMEPATH: "\\Users\\shayg",
    USERPROFILE: "C:\\Users\\fallback",
    HOME: "/home/fallback"
  };
  const context = {
    console,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    unescape,
    encodeURIComponent,
    window: {
      setTimeout: (fn) => fn(),
      addEventListener: () => {},
      document: null
    },
    document: {
      createElement: () => new ElementStub(),
      querySelectorAll: (selector) => {
        if (selector === ".open-terminal-default, .open-terminal-profile") return [...buttons.default, ...buttons.profile];
        if (selector === ".open-terminal-default") return buttons.default;
        if (selector === ".open-terminal-profile") return buttons.profile;
        return [];
      }
    }
  };
  if (extraDeps.Terminal) context.window.Terminal = extraDeps.Terminal;
  if (extraDeps.FitAddon) context.window.FitAddon = { FitAddon: extraDeps.FitAddon };
  if (extraDeps.ResizeObserver) context.window.ResizeObserver = extraDeps.ResizeObserver;
  context.window.document = context.document;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "desktop-terminal.js" });
  const app = { modules: extraDeps.appModules || {}, registerModule: () => {} };
  const api = context.window.registerMarkdownViewerDesktopTerminal(app, {
    isNeutralinoRuntime: () => true,
    getActiveFolderPath: () => "C:/work/repo",
    bottomPanel: { addTab: (tab) => { addedBottomPanelTabs.push(tab); } },
    loadGlobalState: () => savedState,
    saveGlobalState: (patch) => Object.assign(savedState, patch),
    closeMobileMenu: () => {},
    alert: () => {},
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => env[name] || "",
        spawnProcess: async () => ({ id: 1 }),
        updateSpawnedProcess: async () => {}
      }
    },
    ...extraDeps
  });
  return { api, buttons, savedState, addedBottomPanelTabs };
}

function decodeTerminalLaunchRequest(command) {
  const encodedRequest = String(command || "").trim().split(/\s+/).pop();
  return JSON.parse(Buffer.from(encodedRequest, "base64").toString("utf8"));
}

test("desktop terminal defaults to Git CMD with home cwd", async () => {
  const { api } = loadTerminal();
  const request = await api.buildTerminalLaunchRequest(api.DEFAULT_TERMINAL_PROFILE_ID);

  assert.equal(api.DEFAULT_TERMINAL_PROFILE_ID, "git-cmd");
  assert.equal(request.profileId, "git-cmd");
  assert.equal(request.cwd, "C:\\Users\\shayg");
  assert.equal(request.homeCwd, "C:\\Users\\shayg");
});

test("Git Bash also uses the screenshot-style home cwd", async () => {
  const { api } = loadTerminal();
  const request = await api.buildTerminalLaunchRequest("git-bash");

  assert.equal(request.profileId, "git-bash");
  assert.equal(request.cwd, "C:\\Users\\shayg");
});

test("CMD and PowerShell prefer the opened folder cwd", async () => {
  const { api } = loadTerminal();

  assert.equal((await api.buildTerminalLaunchRequest("cmd")).cwd, "C:/work/repo");
  assert.equal((await api.buildTerminalLaunchRequest("powershell")).cwd, "C:/work/repo");
});

test("opening CMD and PowerShell stores terminal tab preferences", async () => {
  const { api, savedState } = loadTerminal();

  await api.openTerminal("cmd");
  await api.openTerminal("powershell");

  assert.deepEqual(JSON.parse(JSON.stringify(savedState.desktopTerminalTabs)), [
    { profileId: "cmd", cwd: "C:/work/repo" },
    { profileId: "powershell", cwd: "C:/work/repo" }
  ]);

  await api.stopAllTerminals();

  assert.deepEqual(JSON.parse(JSON.stringify(savedState.desktopTerminalTabs)), [
    { profileId: "cmd", cwd: "C:/work/repo" },
    { profileId: "powershell", cwd: "C:/work/repo" }
  ]);
});

test("closing a terminal tab removes it from terminal preferences", async () => {
  const { api, savedState, addedBottomPanelTabs } = loadTerminal();

  await api.openTerminal("cmd");
  await api.openTerminal("powershell");
  addedBottomPanelTabs[0].onClose();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(JSON.stringify(savedState.desktopTerminalTabs)), [
    { profileId: "powershell", cwd: "C:/work/repo" }
  ]);
});

test("startup restore opens terminal preferences with saved cwd", async () => {
  const launchRequests = [];
  const { api } = loadTerminal({
    savedState: {
      desktopTerminalTabs: [
        { profileId: "cmd", cwd: "D:/client/repo" },
        { profileId: "powershell", cwd: "E:/scripts" }
      ]
    },
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async (command) => {
          launchRequests.push(decodeTerminalLaunchRequest(command));
          return { id: launchRequests.length };
        },
        updateSpawnedProcess: async () => {}
      }
    }
  });

  const restored = await api.restoreTerminalsFromPreferences();

  assert.equal(restored.length, 2);
  assert.deepEqual(launchRequests.map((request) => ({ profileId: request.profileId, cwd: request.cwd })), [
    { profileId: "cmd", cwd: "D:/client/repo" },
    { profileId: "powershell", cwd: "E:/scripts" }
  ]);
});

test("hamburger Tools menu exposes terminal submenu in desired order", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const toolsIndex = html.indexOf("tools-menu-submenu");
  const terminalIndex = html.indexOf("terminal-menu-submenu");
  const terminalMenu = html.slice(terminalIndex, html.indexOf("</div>", html.indexOf("</div>", terminalIndex) + 1));

  assert.ok(toolsIndex >= 0);
  assert.ok(terminalIndex > toolsIndex);
  assert.match(terminalMenu, /Open Terminal/);
  assert.ok(terminalMenu.indexOf('data-terminal-profile="cmd"') < terminalMenu.indexOf('data-terminal-profile="powershell"'));
  assert.ok(terminalMenu.indexOf('data-terminal-profile="powershell"') < terminalMenu.indexOf('data-terminal-profile="git-cmd"'));
  assert.ok(terminalMenu.indexOf('data-terminal-profile="git-cmd"') < terminalMenu.indexOf('data-terminal-profile="git-bash"'));
});

test("stopping terminals sends bridge close before spawned process exit", async () => {
  const updates = [];
  const { api } = loadTerminal({
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 7 }),
        updateSpawnedProcess: async (id, action, data) => {
          updates.push({ id, action, data });
        }
      }
    }
  });

  await api.openTerminal("cmd");
  await api.stopAllTerminals();

  const closeIndex = updates.findIndex((entry) => entry.action === "stdIn" && JSON.parse(entry.data).type === "close");
  const exitIndex = updates.findIndex((entry) => entry.action === "exit");

  assert.ok(closeIndex >= 0);
  assert.ok(exitIndex > closeIndex);
});

test("unrelated spawned process events do not create terminal debug log entries", () => {
  const logs = [];
  let spawnedProcessHandler = null;
  loadTerminal({
    debugLog: async (level, message, details) => {
      logs.push({ level, message, details });
    },
    Neutralino: {
      events: {
        on: (name, handler) => {
          if (name === "spawnedProcess") spawnedProcessHandler = handler;
        }
      },
      os: {
        getEnv: async () => "",
        spawnProcess: async () => ({ id: 7 }),
        updateSpawnedProcess: async () => {}
      }
    }
  });

  spawnedProcessHandler({ detail: { id: 99, action: "stdOut", data: "language server output" } });

  assert.deepEqual(logs, []);
});

test("terminal container resize refits without resetting scroll and sends new pty dimensions", async () => {
  const updates = [];
  let observedResize = null;
  let fitCalls = 0;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    loadAddon(addon) {
      this.addon = addon;
    }
    open() {}
    onData() {}
    scrollToBottom() {
      assert.fail("resizing should preserve the terminal scroll position");
    }
  }
  class FitAddonStub {
    fit() {
      fitCalls += 1;
    }
  }
  class ResizeObserverStub {
    constructor(callback) {
      observedResize = callback;
    }
    observe() {}
    disconnect() {}
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    FitAddon: FitAddonStub,
    ResizeObserver: ResizeObserverStub,
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 9 }),
        updateSpawnedProcess: async (id, action, data) => {
          updates.push({ id, action, data });
        }
      }
    }
  });

  await api.openTerminal("powershell");
  observedResize();

  assert.ok(fitCalls >= 2);
  assert.ok(updates.some((entry) => entry.action === "stdIn" && JSON.parse(entry.data).type === "resize"));
});

test("restored command output refits when its container resizes", () => {
  let observedResize = null;
  let fitCalls = 0;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    loadAddon(addon) {
      this.addon = addon;
    }
    open() {}
    scrollToBottom() {}
  }
  class FitAddonStub {
    fit() {
      fitCalls += 1;
    }
  }
  class ResizeObserverStub {
    constructor(callback) {
      observedResize = callback;
    }
    observe() {}
    disconnect() {}
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    FitAddon: FitAddonStub,
    ResizeObserver: ResizeObserverStub
  });

  api.showCommandOutput("saved build output", { tabId: "java-rebuild", activate: false });
  observedResize();

  assert.equal(fitCalls, 2);
});

test("terminal panel uses constrained flex sizing", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  const contentHostRule = css.match(/\.bottom-panel-content-host\s*\{([^}]*)\}/)?.[1] || "";
  const terminalRootRule = css.match(/\.terminal-root\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(contentHostRule, /min-height:\s*0;/);
  assert.match(contentHostRule, /overflow:\s*hidden;/);
  assert.match(terminalRootRule, /flex:\s*1\s+1\s+0;/);
  assert.match(terminalRootRule, /min-height:\s*0;/);
  assert.match(terminalRootRule, /overflow:\s*hidden;/);
});

test("opening the first terminal focuses xterm after mount", async () => {
  let focusCalls = 0;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    open() {}
    onData() {}
    focus() {
      focusCalls += 1;
    }
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 11 }),
        updateSpawnedProcess: async () => {}
      }
    }
  });

  await api.openTerminal("cmd");

  assert.equal(focusCalls, 1);
});

test("terminal input before bridge ready is queued and flushed", async () => {
  const updates = [];
  const spawnedHandlers = {};
  let onDataHandler = null;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    open() {}
    onData(handler) {
      onDataHandler = handler;
    }
    focus() {}
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    Neutralino: {
      events: {
        on: (name, handler) => {
          spawnedHandlers[name] = handler;
        }
      },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 13 }),
        updateSpawnedProcess: async (id, action, data) => {
          updates.push({ id, action, data });
        }
      }
    }
  });

  await api.openTerminal("cmd");
  onDataHandler("dir\r");

  assert.equal(updates.some((entry) => entry.data && JSON.parse(entry.data).type === "input"), false);

  spawnedHandlers.spawnedProcess({
    detail: {
      id: 13,
      action: "stdOut",
      data: `${JSON.stringify({ type: "ready" })}\n`
    }
  });

  assert.ok(updates.some((entry) => entry.data && JSON.parse(entry.data).type === "input" && JSON.parse(entry.data).data === "dir\r"));
});

test("terminal debug logs omit typed input content", async () => {
  const logs = [];
  let onDataHandler = null;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    open() {}
    onData(handler) {
      onDataHandler = handler;
    }
    focus() {}
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    debugLog: async (level, message, details) => {
      logs.push({ level, message, details });
    },
    Neutralino: {
      events: { on: () => {} },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 15 }),
        updateSpawnedProcess: async () => {}
      }
    }
  });

  await api.openTerminal("cmd");
  onDataHandler("secret-command\r");

  assert.equal(JSON.stringify(logs).includes("secret-command"), false);
  assert.equal(logs.some((entry) => Object.prototype.hasOwnProperty.call(entry.details || {}, "inputLength")), true);
});

test("terminal input is forwarded when Neutralino process id is zero", async () => {
  const updates = [];
  const spawnedHandlers = {};
  let onDataHandler = null;
  class TerminalStub {
    constructor() {
      this.cols = 80;
      this.rows = 24;
    }
    open() {}
    onData(handler) {
      onDataHandler = handler;
    }
    focus() {}
  }
  const { api } = loadTerminal({
    Terminal: TerminalStub,
    Neutralino: {
      events: {
        on: (name, handler) => {
          spawnedHandlers[name] = handler;
        }
      },
      os: {
        getEnv: async (name) => ({ HOMEDRIVE: "C:", HOMEPATH: "\\Users\\shayg" })[name] || "",
        spawnProcess: async () => ({ id: 0 }),
        updateSpawnedProcess: async (id, action, data) => {
          updates.push({ id, action, data });
        }
      }
    }
  });

  await api.openTerminal("cmd");
  spawnedHandlers.spawnedProcess({
    detail: {
      id: 0,
      action: "stdOut",
      data: `${JSON.stringify({ type: "ready" })}\n`
    }
  });
  onDataHandler("a");

  assert.ok(updates.some((entry) => entry.id === 0 && entry.action === "stdIn" && JSON.parse(entry.data).type === "input"));
});

test("terminal menu click closes action menus and blurs the trigger", () => {
  let closedMenus = 0;
  const { buttons } = loadTerminal({
    closeActionMenus: () => {
      closedMenus += 1;
    }
  });
  let prevented = false;

  buttons.profile[0].listeners.click({
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(closedMenus, 1);
  assert.equal(buttons.profile[0].blurred, true);
});

test("runCommand streams process output and resolves its completion details", async () => {
  const spawnedHandlers = {};
  const spawned = [];
  const { api, addedBottomPanelTabs } = loadTerminal({
    Neutralino: {
      events: {
        on: (name, handler) => {
          spawnedHandlers[name] = handler;
        }
      },
      os: {
        getEnv: async () => "",
        spawnProcess: async (command, options) => {
          spawned.push({ command, options });
          return { id: 21 };
        },
        updateSpawnedProcess: async () => {}
      }
    }
  });

  const completion = api.runCommand("javac @sources.txt", { cwd: "C:/Project", title: "Java Rebuild", captureOutput: true });
  await new Promise((resolve) => setImmediate(resolve));
  spawnedHandlers.spawnedProcess({ detail: { id: 21, action: "stdOut", data: "starting\n" } });
  spawnedHandlers.spawnedProcess({ detail: { id: 21, action: "stdErr", data: "warning\n" } });
  spawnedHandlers.spawnedProcess({ detail: { id: 21, action: "exit", exitCode: 2 } });
  const result = await completion;

  assert.deepEqual(JSON.parse(JSON.stringify(spawned)), [{ command: "javac @sources.txt", options: { cwd: "C:/Project" } }]);
  assert.equal(addedBottomPanelTabs.at(-1).title, "Java Rebuild");
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "starting\n");
  assert.equal(result.stderr, "warning\n");
  assert.equal(result.output, "starting\nwarning\n");
  assert.equal(result.session.consoleOutputNewlineCount, 6);
  assert.equal(result.session.consoleOutputSizeBytes, Buffer.byteLength(result.session.consoleOutput, "utf8"));
});

test("runCommand does not write bridge resize messages after command exit", async () => {
  const spawnedHandlers = {};
  const updates = [];
  const { api, addedBottomPanelTabs } = loadTerminal({
    Neutralino: {
      events: {
        on: (name, handler) => {
          spawnedHandlers[name] = handler;
        }
      },
      os: {
        getEnv: async () => "",
        spawnProcess: async () => ({ id: 3 }),
        updateSpawnedProcess: async (id, action, data) => {
          updates.push({ id, action, data });
          throw new Error(`Unable to update process id: ${id}`);
        }
      }
    }
  });

  const completion = api.runCommand("mvn help:effective-pom", { title: "Maven Effective POM" });
  await new Promise((resolve) => setImmediate(resolve));
  spawnedHandlers.spawnedProcess({ detail: { id: 3, action: "exit", exitCode: 0 } });
  await completion;
  addedBottomPanelTabs.at(-1).onActivate();

  assert.deepEqual(updates, []);
});


test("attachCommandResult shows a lower-panel result summary button", async () => {
  const spawnedHandlers = {};
  let reopened = null;
  const { api, addedBottomPanelTabs } = loadTerminal({
    appModules: { projectCommandResultModal: { open: (result) => { reopened = result; } } },
    Neutralino: {
      events: { on: (name, handler) => { spawnedHandlers[name] = handler; } },
      os: {
        getEnv: async () => "",
        spawnProcess: async () => ({ id: 31 }),
        updateSpawnedProcess: async () => {}
      }
    }
  });

  const completion = api.runCommand("kubectl apply --dry-run=client -f app.yaml", { title: "Kubernetes" });
  await new Promise((resolve) => setImmediate(resolve));
  const tab = addedBottomPanelTabs.at(-1);
  const result = { ok: true, commandName: "kubernetes-dry-run", terminalTabId: tab.id };

  assert.equal(api.attachCommandResult(tab.id, result), true);
  const actions = tab.view.children.find((child) => child.className === "terminal-command-result-actions");
  assert.equal(actions.hidden, false);
  actions.children[0].listeners.click();
  assert.equal(reopened, result);

  spawnedHandlers.spawnedProcess({ detail: { id: 31, action: "exit", exitCode: 0 } });
  await completion;
});
