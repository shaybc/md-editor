const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerLessToCssConverter } = require("../resources/js/editor/less-to-css-converter.js");

function createConverter() {
  const modules = {};
  const app = { registerModule(name, api) { modules[name] = api; } };
  return registerMarkdownViewerLessToCssConverter(app);
}

test("LESS to CSS converter resolves variables and nested selectors", () => {
  const converter = createConverter();
  const css = converter.convertLessToCss(`
@brand: #0ea5e9;

.card {
  color: @brand;

  &:hover {
    color: white;
  }

  .title {
    border-color: @brand;
  }
}
`);

  assert.equal(css, `.card {
  color: #0ea5e9;
}

.card:hover {
  color: white;
}

.card .title {
  border-color: #0ea5e9;
}
`);
});

test("LESS to CSS converter preserves at-rule containers", () => {
  const converter = createConverter();
  const css = converter.convertLessToCss(`
@mobile: 640px;

@media (max-width: @mobile) {
  .panel {
    display: block;
  }
}
`);

  assert.equal(css, `@media (max-width: 640px) {
  .panel {
    display: block;
  }
}
`);
});
