// JSON array flattening and delimited export logic for the JSON Array to Table tool.
(function(root) {
  "use strict";

  const EXPORT_FORMATS = {
    csv: { label: "Comma separated values (CSV)", delimiter: ",", extension: "csv", mimeType: "text/csv;charset=utf-8" },
    tsv: { label: "Tab separated values (TSV)", delimiter: "\t", extension: "tsv", mimeType: "text/tab-separated-values;charset=utf-8" },
    semicolon: { label: "Semicolon separated values (CSV French)", delimiter: ";", extension: "csv", mimeType: "text/csv;charset=utf-8" }
  };

  function normalizeColumnName(pathParts) {
    return pathParts.join("_").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "value";
  }

  function formatCell(value) {
    if (value === null || typeof value === "undefined") return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }

  function flattenValue(value, pathParts, row) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.keys(value).forEach(function(key) {
        flattenValue(value[key], pathParts.concat(key), row);
      });
      return;
    }
    row[normalizeColumnName(pathParts)] = formatCell(value);
  }

  function parseJsonArray(source) {
    const parsed = JSON.parse(String(source || ""));
    if (!Array.isArray(parsed) || parsed.some(function(item) { return !item || typeof item !== "object" || Array.isArray(item); })) {
      throw new Error("Please provide a valid JSON array of objects");
    }
    return parsed;
  }

  function convertJsonArrayToTable(source) {
    const items = parseJsonArray(source);
    const columns = [];
    const seenColumns = new Set();
    const rows = items.map(function(item) {
      const row = {};
      flattenValue(item, [], row);
      Object.keys(row).forEach(function(column) {
        if (!seenColumns.has(column)) {
          seenColumns.add(column);
          columns.push(column);
        }
      });
      return row;
    });
    return {
      columns,
      rows: rows.map(function(row) {
        return columns.map(function(column) { return row[column] || ""; });
      })
    };
  }

  function escapeDelimitedCell(value, delimiter) {
    const text = String(value ?? "");
    if (text.includes("\"") || text.includes("\n") || text.includes("\r") || text.includes(delimiter)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  }

  function tableToDelimited(table, format) {
    const selected = EXPORT_FORMATS[format] || EXPORT_FORMATS.csv;
    const lines = [table.columns].concat(table.rows).map(function(row) {
      return row.map(function(value) { return escapeDelimitedCell(value, selected.delimiter); }).join(selected.delimiter);
    });
    return lines.join("\r\n");
  }

  function registerMarkdownViewerJsonArrayTableCodec(app) {
    const api = { EXPORT_FORMATS, convertJsonArrayToTable, tableToDelimited, parseJsonArray };
    app?.registerModule?.("jsonArrayTableCodec", api);
    return api;
  }

  root.registerMarkdownViewerJsonArrayTableCodec = registerMarkdownViewerJsonArrayTableCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { EXPORT_FORMATS, convertJsonArrayToTable, tableToDelimited, parseJsonArray, _test: { flattenValue, normalizeColumnName } };
  }
})(typeof window !== "undefined" ? window : globalThis);
