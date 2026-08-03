const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadViewWindowControlsModule() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/ui/view-window-controls.js"), "utf8");
  const documentElement = {
    dataset: {},
    style: {
      zoom: "",
      setProperty(name, value) {
        this[name] = value;
      }
    }
  };
  const document = { documentElement };
  const window = {
    dispatchEvent() {},
    navigator: { userAgent: "Neutralinojs" },
    open: () => null
  };
  function CustomEvent(type, init) {
    return { type, detail: init && init.detail };
  }
  window.CustomEvent = CustomEvent;
  const context = {
    CustomEvent,
    console,
    document,
    window
  };
  context.window.window = window;
  context.window.document = document;
  vm.runInNewContext(source, context, { filename: "view-window-controls.js" });
  return {
    register: context.window.registerMarkdownViewerViewWindowControls,
    window
  };
}

function createButton() {
  return {
    disabled: false,
    listeners: {},
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
  };
}

test("Downloads menu click uses explicit Neutralino Ctrl+J key events", async () => {
  const { register } = loadViewWindowControlsModule();
  const downloadsButton = createButton();
  let command = "";
  const app = {
    actions: {},
    registerModule() {}
  };

  register(app, {
    loadGlobalState: () => ({ appZoomPercent: 100 }),
    openDownloadsWindowButtons: [downloadsButton],
    Neutralino: {
      os: {
        execCommand: async (value) => {
          command = value;
        }
      }
    },
    saveGlobalState() {}
  });

  let prevented = false;
  let stopped = false;
  await downloadsButton.listeners.click({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.match(command, /keybd_event\(0x11,0,0/);
  assert.match(command, /keybd_event\(0x4A,0,0/);
  assert.match(command, /keybd_event\(0x4A,0,2/);
  assert.match(command, /keybd_event\(0x11,0,2/);
  assert.doesNotMatch(command, /SendKeys|NUMLOCK/i);
});

test("Neutralino fullscreen restores maximized window after exit", async () => {
  const { register } = loadViewWindowControlsModule();
  const app = {
    actions: {},
    registerModule() {}
  };
  const calls = [];
  let fullscreen = false;

  register(app, {
    loadGlobalState: () => ({ appZoomPercent: 100 }),
    Neutralino: {
      window: {
        isFullScreen: async () => {
          calls.push("isFullScreen");
          return fullscreen;
        },
        isMaximized: async () => {
          calls.push("isMaximized");
          return true;
        },
        unmaximize: async () => {
          calls.push("unmaximize");
        },
        setFullScreen: async () => {
          calls.push("setFullScreen");
          fullscreen = true;
        },
        exitFullScreen: async () => {
          calls.push("exitFullScreen");
          fullscreen = false;
        },
        maximize: async () => {
          calls.push("maximize");
        }
      }
    },
    saveGlobalState() {}
  });

  assert.equal(await app.actions.toggleFullscreen(), true);
  assert.equal(await app.actions.toggleFullscreen(), true);
  assert.deepEqual(calls, [
    "isFullScreen",
    "isMaximized",
    "unmaximize",
    "setFullScreen",
    "isFullScreen",
    "exitFullScreen",
    "maximize"
  ]);
});
