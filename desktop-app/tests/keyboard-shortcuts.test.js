const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadKeyboardShortcutsModule(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/keyboard-shortcuts.js"), "utf8");
  const listeners = {};
  const listenerOptions = {};
  let mutationCallback = null;
  const document = {
    documentElement: {},
    addEventListener(type, listener, options) {
      listeners[type] = listener;
      listenerOptions[type] = options;
    },
    querySelectorAll: () => options.frames || []
  };
  const context = {
    window: {
      getSelection: () => ({ toString: () => "" }),
      MutationObserver: class {
        constructor(callback) {
          mutationCallback = callback;
        }

        observe() {}
      }
    },
    document
  };
  context.window.window = context.window;
  context.window.document = document;
  vm.runInNewContext(source, context, { filename: "keyboard-shortcuts.js" });
  return {
    register: context.window.registerMarkdownViewerKeyboardShortcuts,
    listeners,
    listenerOptions,
    triggerAddedNodes(nodes) {
      mutationCallback?.([{ addedNodes: nodes }]);
    }
  };
}

function createFrame(contentDocument) {
  const listeners = {};
  return {
    tagName: "IFRAME",
    contentDocument,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatchLoad() {
      listeners.load?.();
    }
  };
}

function createFrameDocument() {
  const listeners = {};
  let keydownRegistrationCount = 0;
  return {
    addEventListener(type, listener) {
      listeners[type] = listener;
      if (type === "keydown") keydownRegistrationCount += 1;
    },
    dispatchKeydown(event) {
      listeners.keydown?.(event);
    },
    getKeydownRegistrationCount: () => keydownRegistrationCount
  };
}

function createShortcutDeps(overrides = {}) {
  return {
    activeEditorCommands: {
      getActiveEditorSelection: () => ({ start: 0, end: 0 })
    },
    canReloadActiveTabFromDisk: () => false,
    closeGraphComparisonDetailsModal: () => {},
    closeMermaidModal: () => {},
    closeTab: () => {},
    copyMarkdownButton: { click: () => {} },
    getActiveTabId: () => "tab-1",
    getActiveTabType: () => "markdown",
    getCurrentViewMode: () => "split",
    goToEditorLinePrompt: () => {},
    hideGraphStaleModal: () => {},
    markdownEditor: { selectionStart: 0, selectionEnd: 0 },
    newTab: () => {},
    openEditorFindReplaceModal: () => {},
    openFindInFilesModal: () => {},
    openFileByNameModal: () => {},
    openGraphFindDialog: () => {},
    openWorkspaceSearchModal: () => {},
    reloadActiveTabFromDisk: () => {},
    saveCurrentFileIfChanged: () => {},
    toggleProblemsPanel: () => {},
    toggleTasksPanel: () => {},
    toggleFindInFilesResultsPanel: () => {},
    toggleSyncScrolling: () => {},
    ...overrides
  };
}

test("Ctrl+R reloads the active tab only when it can read from disk", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let reloadCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    canReloadActiveTabFromDisk: () => true,
    reloadActiveTabFromDisk: () => {
      reloadCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "r",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(reloadCount, 1);
});

test("Ctrl+R is captured by the app when the active tab cannot reload", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let reloadCount = 0;
  let stopped = false;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    canReloadActiveTabFromDisk: () => false,
    reloadActiveTabFromDisk: () => {
      reloadCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "r",
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(reloadCount, 0);
});

test("Ctrl+R in the focused editor is captured without browser refresh", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let reloadCount = 0;
  let stopped = false;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    canReloadActiveTabFromDisk: () => false,
    isActiveEditorFocused: () => true,
    reloadActiveTabFromDisk: () => {
      reloadCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "r",
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(reloadCount, 0);
});

test("Ctrl+Shift+F opens workspace search and prevents the browser shortcut", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let openCount = 0;
  let initialQuery = null;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    activeEditorCommands: {
      getActiveEditorSelection: () => ({ start: 7, end: 22 }),
      getActiveEditorValue: () => "Search selected string in the workspace."
    },
    openWorkspaceSearchModal: (query) => {
      openCount += 1;
      initialQuery = query;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    key: "f",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(openCount, 1);
  assert.equal(initialQuery, "selected string");
});

test("Ctrl+Alt+F opens find in files and prevents the browser shortcut", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let openCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    openFindInFilesModal: () => {
      openCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: true,
    key: "f",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(openCount, 1);
});

test("Ctrl+Shift+N opens file by name and prevents the browser shortcut", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let openCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    openFileByNameModal: () => {
      openCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    key: "n",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(openCount, 1);
});

test("Ctrl+H opens editor find and replace with replace focus", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let openOptions = null;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    openEditorFindReplaceModal: (options) => {
      openOptions = options;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "h",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(openOptions.replace, true);
  assert.equal(openOptions.focusReplace, true);
});

test("Ctrl+G opens the editor go to line prompt", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let promptCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    goToEditorLinePrompt: () => {
      promptCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "g",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(promptCount, 1);
});

test("F7 toggles find in files results panel", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let toggleCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    toggleFindInFilesResultsPanel: () => {
      toggleCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F7",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(toggleCount, 1);
});

test("F8 toggles the Problems panel", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let showCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    toggleProblemsPanel: () => {
      showCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F8",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(showCount, 1);

  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F8",
    preventDefault: () => {}
  });

  assert.equal(showCount, 1);
});

test("F9 toggles the Tasks tab without replacing Ctrl+F9 rebuild", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let toggleCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    toggleTasksPanel: () => { toggleCount += 1; }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F9",
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(toggleCount, 1);

  listeners.keydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F9",
    preventDefault: () => {}
  });
  assert.equal(toggleCount, 1);
});

test("keyboard shortcuts listen during capture so focused panels cannot consume global shortcuts", () => {
  const { register, listenerOptions } = loadKeyboardShortcutsModule();
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps());

  assert.equal(listenerOptions.keydown, true);
  assert.equal(listenerOptions.wheel.capture, true);
  assert.equal(listenerOptions.wheel.passive, false);
});

test("app-wide shortcuts work from an accessible preview frame", () => {
  const frameDocument = createFrameDocument();
  const frame = createFrame(frameDocument);
  const { register } = loadKeyboardShortcutsModule({ frames: [frame] });
  let toggleCount = 0;
  let workspaceSearchCount = 0;
  register({ registerModule: () => {} }, createShortcutDeps({
    toggleFindInFilesResultsPanel: () => {
      toggleCount += 1;
    },
    openWorkspaceSearchModal: () => {
      workspaceSearchCount += 1;
    }
  }));

  frameDocument.dispatchKeydown({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F7",
    preventDefault: () => {}
  });
  frameDocument.dispatchKeydown({
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    key: "f",
    preventDefault: () => {}
  });

  assert.equal(toggleCount, 1);
  assert.equal(workspaceSearchCount, 1);
});

test("dynamically discovered and reloaded frames register each document once", () => {
  const firstDocument = createFrameDocument();
  const frame = createFrame(firstDocument);
  const { register, triggerAddedNodes } = loadKeyboardShortcutsModule();
  register({ registerModule: () => {} }, createShortcutDeps());

  triggerAddedNodes([frame]);
  triggerAddedNodes([frame]);
  frame.dispatchLoad();
  assert.equal(firstDocument.getKeydownRegistrationCount(), 1);

  const reloadedDocument = createFrameDocument();
  frame.contentDocument = reloadedDocument;
  frame.dispatchLoad();
  assert.equal(reloadedDocument.getKeydownRegistrationCount(), 1);
});

test("inaccessible preview frames are ignored without disrupting main document shortcuts", () => {
  const inaccessibleFrame = {
    tagName: "IFRAME",
    addEventListener: () => {}
  };
  Object.defineProperty(inaccessibleFrame, "contentDocument", {
    get() {
      throw new Error("Blocked by sandbox");
    }
  });
  const { register, listeners } = loadKeyboardShortcutsModule({ frames: [inaccessibleFrame] });
  let toggleCount = 0;
  register({ registerModule: () => {} }, createShortcutDeps({
    toggleFindInFilesResultsPanel: () => {
      toggleCount += 1;
    }
  }));

  listeners.keydown({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: "F7",
    preventDefault: () => {}
  });

  assert.equal(toggleCount, 1);
});

test("context-sensitive editor shortcuts are not forwarded from preview frames", () => {
  const frameDocument = createFrameDocument();
  const frame = createFrame(frameDocument);
  const { register } = loadKeyboardShortcutsModule({ frames: [frame] });
  let editorFindCount = 0;
  let goToLineCount = 0;
  register({ registerModule: () => {} }, createShortcutDeps({
    openEditorFindReplaceModal: () => {
      editorFindCount += 1;
    },
    goToEditorLinePrompt: () => {
      goToLineCount += 1;
    }
  }));

  ["h", "g"].forEach((key) => {
    frameDocument.dispatchKeydown({
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      key,
      preventDefault: () => {}
    });
  });

  assert.equal(editorFindCount, 0);
  assert.equal(goToLineCount, 0);
});

test("Ctrl+mouse wheel uses app zoom and prevents browser zoom", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let zoomInCount = 0;
  let zoomOutCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    zoomIn: () => {
      zoomInCount += 1;
    },
    zoomOut: () => {
      zoomOutCount += 1;
    }
  }));

  let wheelUpPrevented = false;
  listeners.wheel({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    deltaY: -120,
    preventDefault: () => {
      wheelUpPrevented = true;
    }
  });

  let wheelDownPrevented = false;
  listeners.wheel({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    deltaY: 120,
    preventDefault: () => {
      wheelDownPrevented = true;
    }
  });

  assert.equal(wheelUpPrevented, true);
  assert.equal(wheelDownPrevented, true);
  assert.equal(zoomInCount, 1);
  assert.equal(zoomOutCount, 1);
});

test("plain mouse wheel is left to normal scrolling", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let zoomInCount = 0;
  let prevented = false;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    zoomIn: () => {
      zoomInCount += 1;
    }
  }));

  listeners.wheel({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    deltaY: -120,
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, false);
  assert.equal(zoomInCount, 0);
});

test("Cmd+Shift+F opens workspace search and prevents the browser shortcut", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let openCount = 0;
  const app = { registerModule: () => {} };
  register(app, createShortcutDeps({
    openWorkspaceSearchModal: () => {
      openCount += 1;
    }
  }));

  let prevented = false;
  listeners.keydown({
    ctrlKey: false,
    metaKey: true,
    shiftKey: true,
    altKey: false,
    key: "F",
    preventDefault: () => {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(openCount, 1);
});

test("normalizes configurable shortcut overrides and ignores unknown commands", () => {
  const { register } = loadKeyboardShortcutsModule();
  const api = register({ registerModule: () => {} }, createShortcutDeps());
  const overrides = api.normalizeOverrides({
    "save-current-file": { key: "k", primary: true, alt: false, shift: false },
    "new-document": null,
    unknown: { key: "x", primary: true }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(overrides)), {
    "save-current-file": { key: "k", primary: true, alt: false, shift: false },
    "new-document": null
  });
});

test("custom bindings apply immediately and unassigned commands stop matching", () => {
  const { register, listeners } = loadKeyboardShortcutsModule();
  let saveCount = 0;
  const api = register({ registerModule: () => {} }, createShortcutDeps({
    saveCurrentFileIfChanged: () => { saveCount += 1; }
  }));
  api.setOverrides({
    "save-current-file": { key: "k", primary: true, alt: false, shift: false },
    "new-document": null
  });

  listeners.keydown({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: "s", preventDefault() {} });
  listeners.keydown({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: "k", preventDefault() {} });

  assert.equal(saveCount, 1);
  assert.equal(api.getEffectiveBinding("new-document"), null);
});

test("primary modifier bindings match Command on macOS-style events", () => {
  const { register } = loadKeyboardShortcutsModule();
  const api = register({ registerModule: () => {} }, createShortcutDeps());

  assert.equal(api.eventMatchesBinding({ key: "s", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, api.getEffectiveBinding("save-current-file")), true);
  assert.equal(api.formatBinding(api.getEffectiveBinding("save-current-file"), "MacIntel"), "Cmd+S");
});
