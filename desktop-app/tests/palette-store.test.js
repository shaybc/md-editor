const test = require("node:test");
const assert = require("node:assert/strict");

const catalog = require("../resources/js/image-editor/palettes/palette-catalog.js");
const { ImageEditorPaletteStore } = require("../resources/js/image-editor/palettes/palette-store.js");

function memoryStore(initial = {}) {
  let saved = initial;
  const store = new ImageEditorPaletteStore({
    loadState: () => saved,
    saveState: (patch) => { saved = { ...saved, ...patch }; }
  });
  return { store, saved: () => saved };
}

test("palette store falls back to Default for legacy and corrupt preferences", () => {
  assert.equal(memoryStore().store.active().id, "default");
  const { store } = memoryStore({ imageEditorPalettes: {
    version: 1,
    activePaletteId: "missing",
    customPalettes: [{ id: "bad", name: "Bad", slots: ["nope"] }]
  } });
  assert.equal(store.active().id, "default");
  assert.equal(store.list().length, 31);
});

test("custom palettes persist, sort newest first, and can be selected", () => {
  const fixture = memoryStore({ foregroundColor: "#112233", backgroundColor: "#445566" });
  const older = fixture.store.createCustom({ name: "Older", slots: ["#123456"], createdAt: 10 });
  const newer = fixture.store.createCustom({ name: "Newer", slots: ["#ABCDEF"], createdAt: 20 });
  assert.deepEqual(fixture.store.list().slice(1, 3).map((palette) => palette.id), [newer.id, older.id]);
  assert.equal(fixture.store.select(newer.id), true);
  assert.equal(fixture.saved().imageEditorPalettes.activePaletteId, newer.id);
  assert.equal(fixture.saved().foregroundColor, "#112233");
  assert.equal(fixture.saved().backgroundColor, "#445566");

  const reloaded = memoryStore(fixture.saved()).store;
  assert.equal(reloaded.active().name, "Newer");
  assert.equal(reloaded.toolbarColors().length, 20);
});

test("ASE imports split groups over twelve without losing order or names", () => {
  const { store } = memoryStore();
  const colors = Array.from({ length: 14 }, (_, index) => ({
    hex: `#${index.toString(16).padStart(6, "0").toUpperCase()}`,
    name: `Color ${index + 1}`
  }));
  const created = store.importCustom([{ name: "Large", colors }]);
  assert.equal(created.length, 2);
  assert.deepEqual(created.map((palette) => palette.name), ["Large 1", "Large 2"]);
  assert.deepEqual(created[0].slots.slice(0, 2), ["#000000", "#000001"]);
  assert.deepEqual(created[1].slots.slice(0, 2), ["#00000C", "#00000D"]);
  assert.deepEqual(created[1].colorNames.slice(0, 2), ["Color 13", "Color 14"]);
  assert.deepEqual(catalog.toolbarColors(created[1]).slice(12), catalog.BASIC_COLORS);
});
