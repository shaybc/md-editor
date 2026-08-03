"use strict";

/**
 * Kotlin ABI dependency planning.
 *
 * Builds a deterministic DAG of source-set compilation groups. Cycles contained inside
 * one module are compiled as one group; cross-module cycles are rejected as invalid model data.
 */

function createSourceSetKey(module, sourceSet) {
  return `${String(module.projectPath || module.id || module.root)}:${String(sourceSet.name || "main")}`;
}

function listSourceSetItems(model) {
  return (model?.modules || []).flatMap((module) => (module.sourceSets || [])
    .filter((sourceSet) => Array.isArray(sourceSet.kotlin) && sourceSet.kotlin.length)
    .map((sourceSet) => ({ key: createSourceSetKey(module, sourceSet), module, sourceSet })));
}

function dependencyKeysFor(item, byKey) {
  const keys = new Set();
  const projectPath = String(item.module.projectPath || "");
  if (item.sourceSet.test === true || item.sourceSet.dependsOnMain === true) {
    keys.add(`${projectPath}:main`);
  }
  for (const sourceSetName of item.sourceSet.localSourceSetDependencies || []) {
    keys.add(`${projectPath}:${sourceSetName}`);
  }
  for (const dependencyProjectPath of item.sourceSet.projectDependencies || []) {
    keys.add(`${dependencyProjectPath}:main`);
  }
  keys.delete(item.key);
  return Array.from(keys).filter((key) => byKey.has(key)).sort();
}

/** Return topologically ordered compilation groups for a Kotlin JVM workspace model. */
function createKotlinAbiDependencyPlan(model) {
  const items = listSourceSetItems(model);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const dependencies = new Map(items.map((item) => [item.key, dependencyKeysFor(item, byKey)]));
  const components = stronglyConnectedComponents(items.map((item) => item.key), dependencies);
  const componentByKey = new Map();
  const groups = components.map((keys, index) => {
    const componentItems = keys.map((key) => byKey.get(key));
    const modules = new Set(componentItems.map((item) => String(item.module.projectPath || item.module.id || item.module.root)));
    if (keys.length > 1 && modules.size > 1) {
      throw Object.assign(new Error(`Kotlin ABI dependency cycle spans modules: ${keys.join(" -> ")}`), {
        code: "kotlin-abi-cross-module-cycle",
        sourceSetKeys: keys
      });
    }
    const group = {
      id: `abi-group-${index}`,
      items: componentItems.sort((left, right) => left.key.localeCompare(right.key)),
      dependencyGroupIds: []
    };
    keys.forEach((key) => componentByKey.set(key, group));
    return group;
  });
  for (const group of groups) {
    group.dependencyGroupIds = Array.from(new Set(group.items.flatMap((item) => dependencies.get(item.key) || [])
      .map((key) => componentByKey.get(key)?.id)
      .filter((id) => id && id !== group.id))).sort();
  }
  return topologicallyOrderGroups(groups);
}

function stronglyConnectedComponents(keys, dependencies) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexes = new Map();
  const lowLinks = new Map();
  const components = [];

  function visit(key) {
    indexes.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);
    for (const dependency of dependencies.get(key) || []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(key, Math.min(lowLinks.get(key), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(key, Math.min(lowLinks.get(key), indexes.get(dependency)));
      }
    }
    if (lowLinks.get(key) !== indexes.get(key)) return;
    const component = [];
    while (stack.length) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === key) break;
    }
    components.push(component.sort());
  }

  keys.slice().sort().forEach((key) => {
    if (!indexes.has(key)) visit(key);
  });
  return components;
}

function topologicallyOrderGroups(groups) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const ordered = [];
  const visited = new Set();
  function visit(group) {
    if (visited.has(group.id)) return;
    visited.add(group.id);
    group.dependencyGroupIds.map((id) => byId.get(id)).filter(Boolean)
      .sort((left, right) => left.id.localeCompare(right.id)).forEach(visit);
    ordered.push(group);
  }
  groups.slice().sort((left, right) => left.id.localeCompare(right.id)).forEach(visit);
  return ordered;
}

module.exports = { createKotlinAbiDependencyPlan, createSourceSetKey };
