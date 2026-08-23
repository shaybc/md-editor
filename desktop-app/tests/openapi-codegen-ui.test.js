const assert = require("node:assert/strict");
const test = require("node:test");

const codegen = require("../resources/js/tools/openapi/codegen.js");

test("OpenAPI codegen exposes grouped technology choices", () => {
  const groups = codegen.getGeneratorGroups();
  assert.deepEqual(groups.map((group) => group.id), ["clients", "servers", "docs"]);

  const generators = codegen.getGenerators();
  assert.ok(generators.some((generator) => generator.groupId === "clients" && generator.id === "java"));
  assert.ok(generators.some((generator) => generator.groupId === "servers" && generator.id === "nodejs-server"));
  assert.ok(generators.some((generator) => generator.groupId === "docs" && generator.id === "openapi-yaml"));
});

test("OpenAPI codegen Spring sub-technologies map to Swagger Codegen spring libraries", () => {
  const generators = codegen.getGenerators();
  const springBoot = generators.find((generator) => generator.id === "spring-boot");
  const springMvc = generators.find((generator) => generator.id === "spring-mvc");
  const springCloud = generators.find((generator) => generator.id === "spring-cloud");

  assert.equal(springBoot.generatorName, "spring");
  assert.equal(springBoot.label, "Spring Boot microservice");
  assert.equal(springBoot.presetProperties.library, "spring-boot");
  assert.equal(springBoot.presetProperties.delegatePattern, "true");

  assert.equal(springMvc.generatorName, "spring");
  assert.equal(springMvc.presetProperties.library, "spring-mvc");

  assert.equal(springCloud.generatorName, "spring");
  assert.equal(springCloud.presetProperties.library, "spring-cloud");
  assert.equal(springCloud.presetProperties.generateForOpenFeign, "true");
});