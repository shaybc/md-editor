const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createRouter() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/platform/spawned-process-router.js"), "utf8");
  let listener = null;
  const context = {
    Date,
    Map,
    Set,
    Promise,
    setTimeout,
    clearTimeout,
    Neutralino: { events: { on: async (_name, handler) => { listener = handler; } } }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "spawned-process-router.js" });
  const app = { registerModule() {} };
  const router = context.registerMarkdownViewerSpawnedProcessRouter(app, { Neutralino: context.Neutralino });
  return { router, emit: (detail) => listener({ detail }) };
}

test("spawned process router delivers output only to its owner and accepts id zero", async () => {
  const { router, emit } = createRouter();
  await router.start();
  const first = [];
  const zero = [];
  router.registerProcess({ id: 5 }, { onStdout: (data) => first.push(data) });
  router.registerProcess({ id: 0 }, { onStdout: (data) => zero.push(data) });
  emit({ id: 5, action: "stdOut", data: "jdt" });
  emit({ id: 0, action: "stdOut", data: "terminal" });
  emit({ id: 9, action: "stdOut", data: "unknown" });
  assert.deepEqual(first, ["jdt"]);
  assert.deepEqual(zero, ["terminal"]);
});

test("spawned process router replays bounded startup-race output", async () => {
  const { router, emit } = createRouter();
  await router.start();
  emit({ id: 12, action: "stdOut", data: "early" });
  const received = [];
  router.registerProcess({ id: 12 }, { onStdout: (data) => received.push(data) });
  assert.deepEqual(received, ["early"]);
  assert.equal(router._test.countPendingEvents(), 0);
});
