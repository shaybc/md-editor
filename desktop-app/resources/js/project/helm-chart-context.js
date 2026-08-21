// Helm chart path detection and completion metadata helpers.
(function(global) {
  "use strict";

  /** Register pure Helm chart context helpers. */
  function registerMarkdownViewerHelmChartContext(app) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/");
    }

    function getFileName(filePath) {
      const normalized = normalizePath(filePath);
      return normalized.split("/").filter(Boolean).pop() || "";
    }

    function getDirectoryName(filePath) {
      const normalized = normalizePath(filePath).replace(/\/$/, "");
      const index = normalized.lastIndexOf("/");
      return index > 0 ? normalized.slice(0, index) : "";
    }

    function joinPath(parent, child) {
      const left = normalizePath(parent).replace(/\/$/, "");
      const right = normalizePath(child).replace(/^\//, "");
      return left ? `${left}/${right}` : right;
    }

    function isSameOrChildPath(path, parentPath) {
      const normalizedPath = normalizePath(path).toLowerCase();
      const normalizedParent = normalizePath(parentPath).replace(/\/$/, "").toLowerCase();
      return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`);
    }

    function looksLikeFilePath(path) {
      const name = getFileName(path).toLowerCase();
      return /\.[a-z0-9]+$/i.test(name) || name === "chart.yaml" || name === "values.yaml" || name === "_helpers.tpl";
    }

    function getStartingDirectory(context = {}) {
      const filePath = normalizePath(context.filePath || "");
      if (filePath) return looksLikeFilePath(filePath) ? getDirectoryName(filePath) : filePath;
      return normalizePath(context.folderPath || "");
    }

    function resolveLikelyChartRoot(context = {}) {
      const filePath = normalizePath(context.filePath || "");
      const folderPath = normalizePath(context.folderPath || "");
      const activePath = filePath || folderPath;
      const lowerPath = activePath.toLowerCase();
      if (!activePath) return "";
      if (/\/(?:chart|values)\.ya?ml$/i.test(lowerPath)) return getDirectoryName(activePath);
      const templateIndex = lowerPath.lastIndexOf("/templates/");
      if (templateIndex >= 0) return activePath.slice(0, templateIndex);
      if (/\/_helpers\.tpl$/i.test(lowerPath)) {
        const templatesDir = getDirectoryName(activePath);
        return /\/templates$/i.test(templatesDir) ? getDirectoryName(templatesDir) : "";
      }
      return folderPath && !looksLikeFilePath(folderPath) ? folderPath : "";
    }

    async function pathExists(path, deps = {}) {
      if (typeof deps.pathExists === "function") return await deps.pathExists(path) === true;
      return false;
    }

    /** Find the nearest Helm chart root at or above the active file or folder. */
    async function findChartRoot(context = {}, deps = {}) {
      const hinted = normalizePath(context.chartRoot || "");
      if (hinted) return hinted;
      const workspacePath = normalizePath(context.folderPath || "");
      const canCheckChartFile = typeof deps.pathExists === "function";
      let current = getStartingDirectory(context) || resolveLikelyChartRoot(context);
      while (current) {
        if (workspacePath && !isSameOrChildPath(current, workspacePath)) break;
        if (await pathExists(joinPath(current, "Chart.yaml"), deps)) return current;
        const parent = getDirectoryName(current);
        if (!parent || parent === current) break;
        current = parent;
      }
      return canCheckChartFile ? "" : resolveLikelyChartRoot(context);
    }

    function getTemplateRelativePath(filePath, chartRoot) {
      const normalizedFile = normalizePath(filePath);
      const normalizedRoot = normalizePath(chartRoot).replace(/\/$/, "");
      if (!normalizedFile || !normalizedRoot || !isSameOrChildPath(normalizedFile, normalizedRoot)) return "";
      const relativePath = normalizedFile.slice(normalizedRoot.length + 1);
      return /^templates\/.+\.ya?ml$/i.test(relativePath) ? relativePath : "";
    }

    function isHelmChartPath(filePath, chartRoot) {
      const name = getFileName(filePath).toLowerCase();
      if (name === "chart.yaml" || name === "values.yaml" || name === "_helpers.tpl") return true;
      return !!getTemplateRelativePath(filePath, chartRoot || resolveLikelyChartRoot({ filePath }));
    }

    function getDefaultReleaseName(chartRoot) {
      const name = getFileName(chartRoot).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return name || "release";
    }

    function parseValuesPaths(valuesYaml) {
      const paths = [];
      const stack = [];
      String(valuesYaml || "").split(/\r?\n/).forEach((line) => {
        if (!line.trim() || /^\s*#/.test(line)) return;
        const match = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:/);
        if (!match) return;
        const indent = match[1].replace(/\t/g, "  ").length;
        const key = match[2];
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        const path = [...stack.map((entry) => entry.key), key].join(".");
        paths.push(`.Values.${path}`);
        stack.push({ indent, key });
      });
      return Array.from(new Set(paths));
    }

    function extractNamedTemplates(helpersText) {
      const names = [];
      const pattern = /{{-?\s*define\s+"([^"]+)"/g;
      let match;
      while ((match = pattern.exec(String(helpersText || "")))) names.push(match[1]);
      return Array.from(new Set(names));
    }

    function createCompletionItems(valuesYaml, helpersText) {
      const valueItems = parseValuesPaths(valuesYaml).map((label) => ({ label, type: "variable", detail: "Helm values" }));
      const templateItems = extractNamedTemplates(helpersText).map((name) => ({
        label: `include "${name}" .`,
        type: "function",
        detail: "Helm named template"
      }));
      return [...valueItems, ...templateItems];
    }

    const api = {
      createCompletionItems,
      extractNamedTemplates,
      findChartRoot,
      getDefaultReleaseName,
      getDirectoryName,
      getFileName,
      getTemplateRelativePath,
      isHelmChartPath,
      isSameOrChildPath,
      joinPath,
      normalizePath,
      parseValuesPaths,
      resolveLikelyChartRoot
    };
    app?.registerModule?.("helmChartContext", api);
    return api;
  }

  global.registerMarkdownViewerHelmChartContext = registerMarkdownViewerHelmChartContext;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerHelmChartContext };
  }
})(typeof window !== "undefined" ? window : globalThis);

