const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadModel() {
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.resolve(
    __dirname,
    "../resources/js/editor/source-actions/languages/introduce-parameter-object/java-parameter-object-model.js"
  ), "utf8"), context);
  return context.markdownViewerJavaParameterObjectModel;
}

test("parameter object model uses Eclipse defaults and projects the changed signature", () => {
  const modelApi = loadModel();
  const analysis = {
    methodName: "save",
    owner: { name: "Order" },
    parameters: [
      { originalIndex: 0, type: "String", name: "customer" },
      { originalIndex: 1, type: "int", name: "quantity" }
    ],
    returnType: "void",
    visibility: "public",
    isConstructor: false,
    isStatic: false
  };
  const model = modelApi.createModel(analysis);
  assert.equal(model.className, "OrderParameter");
  assert.equal(model.parameterName, "parameterObject");
  assert.equal(model.createGetters, true);
  assert.equal(model.createSetters, true);
  assert.equal(model.keepDelegate, false);
  assert.equal(modelApi.validate(model, analysis), "");
  assert.equal(modelApi.buildSignature(model, analysis), "public void save(OrderParameter parameterObject)");
  model.destination = "nested";
  assert.equal(modelApi.buildSignature(model, analysis), "public void save(OrderParameter parameterObject)");
});

test("parameter object model preserves unselected parameters and validates edited names", () => {
  const modelApi = loadModel();
  const analysis = {
    methodName: "save",
    owner: { name: "Order" },
    parameters: [
      { originalIndex: 0, type: "String", name: "customer" },
      { originalIndex: 1, type: "int", name: "quantity" },
      { originalIndex: 2, type: "boolean", name: "expedited" }
    ],
    returnType: "void",
    visibility: "",
    isConstructor: false
  };
  const model = modelApi.createModel(analysis);
  model.fields[1].selected = false;
  model.fields[2].fieldName = "rush";
  assert.equal(
    modelApi.buildSignature(model, analysis),
    "void save(OrderParameter parameterObject, int quantity)"
  );
  model.fields[2].fieldName = "customer";
  assert.match(modelApi.validate(model, analysis), /duplicated/);
  model.fields[2].fieldName = "rush";
  model.parameterName = "quantity";
  assert.match(modelApi.validate(model, analysis), /conflicts/);
});
