/** Safe inspection and cell-level mutation of workspace Jupyter notebooks. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const workspaceTools = require("../../../tools/workspace-tools");

const MAX_NOTEBOOK_BYTES = 8 * 1024 * 1024;

class NotebookDocumentService {
  constructor(request, emit = () => {}, options = {}) {
    this.request = request;
    this.emit = typeof emit === "function" ? emit : () => {};
    this.artifacts = options.artifacts;
    this.observations = new Map();
  }

  /** Inspect notebook cells and remember a digest used to reject stale edits. */
  async inspect(input = {}) {
    const loaded = await loadNotebook(this.request.workspaceRoot, input.path, this.request.signal);
    const start = Math.max(0, Math.floor(Number(input.startCell) || 0));
    const maximum = Math.max(1, Math.min(Math.floor(Number(input.maxCells) || 40), 200));
    const cells = loaded.notebook.cells.slice(start, start + maximum).map((cell, index) => ({
      index: start + index,
      id: String(cell.id || ""),
      type: String(cell.cell_type || ""),
      source: sourceText(cell.source).slice(0, 12000),
      executionCount: cell.execution_count ?? null,
      outputCount: Array.isArray(cell.outputs) ? cell.outputs.length : 0,
      metadataKeys: Object.keys(cell.metadata || {}).slice(0, 30)
    }));
    this.observations.set(loaded.relativePath, { digest: loaded.digest, modifiedMs: loaded.stat.mtimeMs, inspectedAt: new Date().toISOString() });
    const result = {
      path: loaded.relativePath,
      format: `${loaded.notebook.nbformat}.${loaded.notebook.nbformat_minor}`,
      kernel: loaded.notebook.metadata?.kernelspec?.name || "",
      language: loaded.notebook.metadata?.language_info?.name || "",
      cellCount: loaded.notebook.cells.length,
      startCell: start,
      cells,
      hasMore: start + cells.length < loaded.notebook.cells.length,
      digest: loaded.digest
    };
    this.emit({ type: "notebook-inspected", path: result.path, cellCount: result.cellCount, summary: `Inspected ${result.path}.` });
    return result;
  }

  /** Apply one approved insert, replacement, or deletion against the latest inspected notebook. */
  async edit(input = {}) {
    const loaded = await loadNotebook(this.request.workspaceRoot, input.path, this.request.signal);
    const observed = this.observations.get(loaded.relativePath);
    if (!observed) throw notebookError("NOTEBOOK_INSPECTION_REQUIRED", "Inspect this notebook before editing it.");
    if (observed.digest !== loaded.digest || observed.modifiedMs !== loaded.stat.mtimeMs) throw notebookError("NOTEBOOK_STALE", "The notebook changed after inspection. Inspect it again before editing.");
    const mode = ["insert", "replace", "delete"].includes(input.mode) ? input.mode : "replace";
    const index = resolveCellIndex(loaded.notebook.cells, input.cellId, input.cellIndex, mode);
    let before = null;
    let after = null;
    if (mode === "insert") {
      const cell = createCell(input.cellType, input.source);
      loaded.notebook.cells.splice(index, 0, cell);
      after = summarizeCell(cell, index);
    } else if (mode === "delete") {
      const removed = loaded.notebook.cells.splice(index, 1)[0];
      before = summarizeCell(removed, index);
    } else {
      const cell = loaded.notebook.cells[index];
      before = summarizeCell(cell, index);
      if (input.cellType) cell.cell_type = normalizeCellType(input.cellType);
      cell.source = preserveSourceShape(cell.source, String(input.source || ""));
      if (cell.cell_type === "code") {
        if (!Array.isArray(cell.outputs)) cell.outputs = [];
        if (!Object.hasOwn(cell, "execution_count")) cell.execution_count = null;
      } else {
        delete cell.outputs;
        delete cell.execution_count;
      }
      after = summarizeCell(cell, index);
    }
    const serialized = `${JSON.stringify(loaded.notebook, null, 1)}\n`;
    let beforeArtifact = null;
    let afterArtifact = null;
    if (this.artifacts && Math.max(Buffer.byteLength(loaded.raw), Buffer.byteLength(serialized)) > 24000) {
      beforeArtifact = await this.artifacts.store(loaded.raw, { tool: "notebook_cell_edit", stage: "before", path: loaded.relativePath });
      afterArtifact = await this.artifacts.store(serialized, { tool: "notebook_cell_edit", stage: "after", path: loaded.relativePath });
    }
    const temporary = `${loaded.absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, serialized, "utf8");
    await fs.rename(temporary, loaded.absolutePath);
    const nextDigest = digest(serialized);
    const nextStat = await fs.stat(loaded.absolutePath);
    this.observations.set(loaded.relativePath, { digest: nextDigest, modifiedMs: nextStat.mtimeMs, inspectedAt: new Date().toISOString() });
    const result = {
      path: loaded.relativePath, mode, cellId: after?.id || before?.id || "", cellIndex: index, before, after, digest: nextDigest,
      artifacts: beforeArtifact && afterArtifact ? {
        before: { id: beforeArtifact.id, bytes: beforeArtifact.bytes, digest: beforeArtifact.digest },
        after: { id: afterArtifact.id, bytes: afterArtifact.bytes, digest: afterArtifact.digest }
      } : null
    };
    this.emit({ type: "notebook-updated", path: result.path, mode, cellId: result.cellId, before: result.before, after: result.after, artifactIds: result.artifacts ? [result.artifacts.before.id, result.artifacts.after.id] : [], summary: `${mode === "insert" ? "Inserted" : mode === "delete" ? "Deleted" : "Updated"} a notebook cell in ${result.path}.` });
    return result;
  }

  snapshot() { return Array.from(this.observations.entries()); }
  restore(snapshot) { this.observations = new Map(Array.isArray(snapshot) ? snapshot : []); }
}

async function loadNotebook(root, requestedPath, signal) {
  if (signal?.aborted) throw notebookError("NOTEBOOK_CANCELLED", "Notebook operation was cancelled.");
  const normalized = String(requestedPath || "").trim();
  if (!/\.ipynb$/i.test(normalized)) throw notebookError("NOTEBOOK_PATH_INVALID", "Notebook tools accept only .ipynb files.");
  if (/^(?:\\\\|\/\/)/.test(normalized)) throw notebookError("NOTEBOOK_PATH_INVALID", "UNC notebook paths are not allowed.");
  const resolved = workspaceTools.resolveWorkspacePath(root, normalized);
  const stat = await fs.stat(resolved.resolvedPath);
  if (!stat.isFile() || stat.size > MAX_NOTEBOOK_BYTES) throw notebookError("NOTEBOOK_SIZE_INVALID", `Notebook must be a file no larger than ${MAX_NOTEBOOK_BYTES} bytes.`);
  const raw = await fs.readFile(resolved.resolvedPath, "utf8");
  let notebook;
  try { notebook = JSON.parse(raw); } catch (_error) { throw notebookError("NOTEBOOK_JSON_INVALID", "Notebook content is not valid JSON."); }
  if (!Number.isInteger(notebook.nbformat) || notebook.nbformat < 3 || !Array.isArray(notebook.cells) || !notebook.metadata || typeof notebook.metadata !== "object") throw notebookError("NOTEBOOK_FORMAT_INVALID", "Notebook structure is invalid or unsupported.");
  return { notebook, raw, stat, digest: digest(raw), absolutePath: resolved.resolvedPath, relativePath: path.relative(resolved.workspaceRoot, resolved.resolvedPath).replace(/\\/g, "/") };
}

function resolveCellIndex(cells, cellId, cellIndex, mode) {
  if (mode === "insert") {
    if (cellId) { const found = cells.findIndex((cell) => String(cell.id || "") === String(cellId)); if (found < 0) throw notebookError("NOTEBOOK_CELL_NOT_FOUND", "The insertion anchor cell was not found."); return found + 1; }
    const numeric = Number(cellIndex); return Number.isInteger(numeric) ? Math.max(0, Math.min(numeric, cells.length)) : cells.length;
  }
  const index = cellId ? cells.findIndex((cell) => String(cell.id || "") === String(cellId)) : Number(cellIndex);
  if (!Number.isInteger(index) || index < 0 || index >= cells.length) throw notebookError("NOTEBOOK_CELL_NOT_FOUND", "The selected notebook cell was not found.");
  return index;
}

function createCell(type, source) {
  const cellType = normalizeCellType(type);
  const cell = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), cell_type: cellType, metadata: {}, source: preserveSourceShape([], String(source || "")) };
  if (cellType === "code") { cell.execution_count = null; cell.outputs = []; }
  return cell;
}

function normalizeCellType(value) { if (!["code", "markdown"].includes(value)) throw notebookError("NOTEBOOK_CELL_TYPE_INVALID", "Cell type must be code or markdown."); return value; }
function preserveSourceShape(previous, value) { return Array.isArray(previous) ? value.split(/(?<=\n)/) : value; }
function sourceText(value) { return Array.isArray(value) ? value.join("") : String(value || ""); }
function summarizeCell(cell, index) { return { index, id: String(cell?.id || ""), type: String(cell?.cell_type || ""), source: sourceText(cell?.source).slice(0, 8000), outputCount: Array.isArray(cell?.outputs) ? cell.outputs.length : 0 }; }
function digest(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }
function notebookError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { NotebookDocumentService, loadNotebook };
