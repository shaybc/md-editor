// Binary source access for the built-in hex editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerHexEditor = global.MarkdownViewerHexEditor || {};

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(0);
  }

  /**
   * Create a range-readable binary source from a desktop path, browser file, or file handle.
   * @param {object} source - File identity and available browser/native handles.
   * @param {object} deps - Runtime filesystem dependencies.
   * @returns {object} Binary source with metadata, range reading, and optional writing.
   */
  function createBinarySource(source = {}, deps = {}) {
    const path = source.path || source.fullPath || null;
    const handle = source.handle || null;
    let browserFile = source.file || null;
    let metadata = {
      size: Number(source.size || browserFile?.size || 0) || 0,
      modifiedAt: Number(source.modifiedAt || browserFile?.lastModified || 0) || 0
    };

    async function resolveBrowserFile() {
      if (handle?.getFile) browserFile = await handle.getFile();
      if (!browserFile) throw new Error("No readable binary file was provided.");
      return browserFile;
    }

    async function refreshMetadata() {
      if (path && deps.Neutralino?.filesystem?.getStats) {
        const stats = await deps.Neutralino.filesystem.getStats(path);
        metadata = {
          size: Number(stats?.size || 0) || 0,
          modifiedAt: Number(stats?.modifiedAt || 0) || 0
        };
      } else {
        const file = await resolveBrowserFile();
        metadata = {
          size: Number(file.size || 0) || 0,
          modifiedAt: Number(file.lastModified || 0) || 0
        };
      }
      return { ...metadata };
    }

    async function readRange(offset, length) {
      const start = Math.max(0, Number(offset || 0));
      const size = Math.max(0, Number(length || 0));
      if (!size) return new Uint8Array(0);
      if (path && deps.Neutralino?.filesystem?.readBinaryFile) {
        const data = await deps.Neutralino.filesystem.readBinaryFile(path, { pos: start, size });
        return toUint8Array(data);
      }
      const file = await resolveBrowserFile();
      return new Uint8Array(await file.slice(start, start + size).arrayBuffer());
    }

    async function readAll() {
      const current = metadata.size ? { ...metadata } : await refreshMetadata();
      return readRange(0, current.size);
    }

    async function writeAll(data) {
      const bytes = toUint8Array(data);
      if (path && deps.Neutralino?.filesystem?.writeBinaryFile) {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await deps.Neutralino.filesystem.writeBinaryFile(path, buffer);
        return refreshMetadata();
      }
      if (handle?.createWritable) {
        const writable = await handle.createWritable();
        try {
          await writable.write(bytes);
          await writable.close();
        } catch (error) {
          await writable.abort?.();
          throw error;
        }
        return refreshMetadata();
      }
      throw new Error("This binary source is not writable.");
    }

    function canWrite() {
      return !!((path && deps.Neutralino?.filesystem?.writeBinaryFile) || handle?.createWritable);
    }

    function getMetadata() {
      return { ...metadata };
    }

    return {
      name: source.name || path?.split(/[\\/]/).pop() || browserFile?.name || handle?.name || "Binary file",
      path,
      handle,
      getMetadata,
      refreshMetadata,
      readRange,
      readAll,
      writeAll,
      canWrite
    };
  }

  namespace.toUint8Array = toUint8Array;
  namespace.createBinarySource = createBinarySource;
})(typeof window !== "undefined" ? window : globalThis);
