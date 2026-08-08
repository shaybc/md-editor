/** Declarative workspace-path activation for conditional skills. */

"use strict";

const { selectValues } = require("../rules/tool-path-observer");

const MAX_PATHS_PER_TOOL = 100;

class SkillPathObserver {
  constructor(catalog) { this.catalog = catalog; }

  /** Discover and activate skills associated with declared tool arguments. */
  beforeTool(name, args, registration) { return this.observe(args, registration?.rulePaths?.arguments, `tool-input:${name}`); }

  /** Discover and activate skills associated with declared successful results. */
  afterTool(name, result, registration) { return this.observe(result, registration?.rulePaths?.results, `tool-result:${name}`); }

  async observe(value, selectors, reason) {
    if (!this.catalog || !Array.isArray(selectors) || !selectors.length) return [];
    const paths = Array.from(new Set(selectors.flatMap((selector) => selectValues(value, selector)).map(String).filter(Boolean))).slice(0, MAX_PATHS_PER_TOOL);
    return paths.length ? this.catalog.activateForPaths(paths, reason) : [];
  }
}

module.exports = { SkillPathObserver };
