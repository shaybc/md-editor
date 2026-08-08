/** Declarative extraction of workspace paths touched by autonomous tools. */

"use strict";

const MAX_PATHS_PER_TOOL = 100;

class ToolPathObserver {
  constructor(ruleCatalog) {
    this.ruleCatalog = ruleCatalog;
  }

  /** Activate rules for declared path-bearing tool arguments. */
  async beforeTool(name, args, registration) {
    const selectors = registration?.rulePaths?.arguments || defaultSelectors(name).arguments;
    return this.observe(args, selectors, `tool-input:${name}`);
  }

  /** Activate rules for declared paths confirmed by a successful result. */
  async afterTool(name, args, result, registration) {
    const selectors = registration?.rulePaths?.results || defaultSelectors(name).results;
    return this.observe(result, selectors, `tool-result:${name}`);
  }

  async observe(value, selectors, reason) {
    if (!this.ruleCatalog || !selectors?.length) return [];
    const paths = Array.from(new Set(selectors.flatMap((selector) => selectValues(value, selector)).map(String).filter(Boolean))).slice(0, MAX_PATHS_PER_TOOL);
    return paths.length ? this.ruleCatalog.activateForPaths(paths, reason) : [];
  }
}

function defaultSelectors(name) {
  if (["read_file", "apply_edit", "write_file"].includes(name)) return { arguments: ["path"], results: ["path"] };
  if (name === "search_text") return { arguments: [], results: ["[].path"] };
  return { arguments: [], results: [] };
}

function selectValues(value, selector) {
  const segments = String(selector || "").split(".").filter(Boolean);
  return descend([value], segments).filter((entry) => typeof entry === "string");
}

function descend(values, segments) {
  if (!segments.length) return values;
  const [segment, ...rest] = segments;
  const array = segment === "[]" || segment.endsWith("[]");
  const key = segment === "[]" ? "" : segment.replace(/\[\]$/, "");
  const next = [];
  for (const value of values) {
    const selected = key ? value?.[key] : value;
    if (array) {
      if (Array.isArray(selected)) next.push(...selected);
    } else if (selected !== undefined && selected !== null) {
      next.push(selected);
    }
  }
  return descend(next, rest);
}

module.exports = { MAX_PATHS_PER_TOOL, ToolPathObserver, selectValues };
