const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDialog() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-compile-save-dialog.js"), "utf8");
  const buttons = ["save-current", "save-all", "continue", "cancel"].map((choice) => ({
    dataset: { javaCompileSaveChoice: choice },
    onclick: null
  }));
  const message = { textContent: "" };
  const modal = {
    style: { display: "none" },
    onclick: null,
    querySelectorAll() { return buttons; }
  };
  const document = {
    getElementById(id) {
      if (id === "java-compile-save-modal") return modal;
      if (id === "java-compile-save-message") return message;
      return null;
    }
  };
  const context = { window: {}, globalThis: {}, document, Promise };
  vm.runInNewContext(source, context);
  const api = context.window.registerMarkdownViewerJavaCompileSaveDialog({ registerModule() {} });
  return { api, buttons, message, modal };
}

test("dirty Java save dialog returns each explicit choice and hides itself", async () => {
  for (const choice of ["save-current", "save-all", "continue", "cancel"]) {
    const harness = loadDialog();
    const result = harness.api.choose({ message: "Unsaved Java files" });
    assert.equal(harness.modal.style.display, "flex");
    assert.equal(harness.message.textContent, "Unsaved Java files");
    harness.buttons.find((button) => button.dataset.javaCompileSaveChoice === choice).onclick();
    assert.equal(await result, choice);
    assert.equal(harness.modal.style.display, "none");
  }
});
