(function(global) {
  "use strict";

  const DEFAULT_MAX_LOG_SIZE_MB = 10;
  const DEFAULT_MAX_LOG_FILES = 10;
  const DEFAULT_FLUSH_DELAY_MS = 50;
  const DEFAULT_MAX_BATCH_LINES = 50;
  const BYTES_PER_MB = 1024 * 1024;
  const preparedLogDirectories = new WeakMap();

  function normalizePositiveInteger(value, fallback, max = 1000) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(1, Math.min(max, Math.floor(numericValue)));
  }

  function getBackupLogPath(logPath, index) {
    const normalizedIndex = normalizePositiveInteger(index, 1);
    const path = String(logPath || "");
    const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
    const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex > 0) {
      return `${directory}${fileName.slice(0, dotIndex)}-${normalizedIndex}${fileName.slice(dotIndex)}`;
    }
    return `${directory}${fileName}-${normalizedIndex}`;
  }

  async function getFileSize(filesystem, path) {
    if (!filesystem?.getStats) return null;
    try {
      const stats = await filesystem.getStats(path);
      const size = Number(stats?.size);
      return Number.isFinite(size) ? size : null;
    } catch (_error) {
      return null;
    }
  }

  async function pathExists(filesystem, path) {
    if (!filesystem?.getStats) return false;
    try {
      await filesystem.getStats(path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function getDirectoryPath(filePath) {
    const path = String(filePath || "");
    const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (slashIndex < 0) return "";
    const directory = path.slice(0, slashIndex);
    if (/^[A-Za-z]:$/.test(directory)) return "";
    return directory;
  }

  function getDirectoryCreationPaths(directoryPath) {
    const path = String(directoryPath || "");
    if (!path) return [];
    const separator = path.includes("\\") ? "\\" : "/";
    const normalized = path.replace(/[\\/]+/g, separator);
    const driveMatch = normalized.match(/^([A-Za-z]:)([\\/])?(.*)$/);
    let prefix = "";
    let remainder = normalized;
    if (driveMatch) {
      prefix = `${driveMatch[1]}${driveMatch[2] || separator}`;
      remainder = driveMatch[3] || "";
    } else if (normalized.startsWith(separator)) {
      prefix = separator;
      while (remainder.startsWith(separator)) remainder = remainder.slice(1);
    }
    const parts = remainder.split(separator).filter(Boolean);
    const paths = [];
    let current = prefix.replace(/[\\/]$/, "");
    parts.forEach((part) => {
      current = current ? `${current}${separator}${part}` : `${prefix}${part}`;
      paths.push(current);
    });
    return paths;
  }

  async function ensureLogFileDirectory(filesystem, logPath) {
    const directoryPath = getDirectoryPath(logPath);
    if (!directoryPath || !filesystem?.createDirectory) return false;
    let preparedDirectories = preparedLogDirectories.get(filesystem);
    if (preparedDirectories?.has(directoryPath)) return true;
    if (!preparedDirectories) {
      preparedDirectories = new Set();
      preparedLogDirectories.set(filesystem, preparedDirectories);
    }
    const directoryPaths = getDirectoryCreationPaths(directoryPath);
    for (const path of directoryPaths) {
      if (await pathExists(filesystem, path)) continue;
      try {
        await filesystem.createDirectory(path);
      } catch (error) {
        if (!(await pathExists(filesystem, path))) throw error;
      }
    }
    preparedDirectories.add(directoryPath);
    return true;
  }

  function forgetPreparedLogDirectory(filesystem, logPath) {
    preparedLogDirectories.get(filesystem)?.delete(getDirectoryPath(logPath));
  }

  async function removeIfExists(filesystem, path) {
    if (await pathExists(filesystem, path)) {
      if (!filesystem?.remove) throw new Error("Log rotation requires filesystem.remove");
      await filesystem.remove(path);
    }
  }

  async function moveIfExists(filesystem, sourcePath, targetPath) {
    if (await pathExists(filesystem, sourcePath)) {
      if (!filesystem?.move) throw new Error("Log rotation requires filesystem.move");
      await filesystem.move(sourcePath, targetPath);
    }
  }

  async function rotateLogFile(filesystem, logPath, options = {}) {
    const maxLogSizeMb = normalizePositiveInteger(options.maxLogSizeMb, DEFAULT_MAX_LOG_SIZE_MB);
    const maxLogFiles = normalizePositiveInteger(options.maxLogFiles, DEFAULT_MAX_LOG_FILES);
    const currentSize = await getFileSize(filesystem, logPath);
    if (currentSize === null || currentSize < maxLogSizeMb * BYTES_PER_MB) return false;

    await removeIfExists(filesystem, getBackupLogPath(logPath, maxLogFiles));
    for (let index = maxLogFiles - 1; index >= 1; index -= 1) {
      await moveIfExists(filesystem, getBackupLogPath(logPath, index), getBackupLogPath(logPath, index + 1));
    }
    await moveIfExists(filesystem, logPath, getBackupLogPath(logPath, 1));
    return true;
  }

  async function appendLogContent(filesystem, logPath, content) {
    if (filesystem.appendFile) {
      await filesystem.appendFile(logPath, `${content}\n`);
      return true;
    }
    if (filesystem.writeFile) {
      let existing = "";
      try {
        if (filesystem.readFile) existing = await filesystem.readFile(logPath);
      } catch (_error) {
        existing = "";
      }
      await filesystem.writeFile(logPath, `${existing || ""}${content}\n`);
      return true;
    }
    return false;
  }

  async function appendLogFileWithRotation(filesystem, logPath, line, options = {}) {
    if (!filesystem || !logPath) return false;
    await ensureLogFileDirectory(filesystem, logPath);
    await rotateLogFile(filesystem, logPath, options);
    try {
      return await appendLogContent(filesystem, logPath, line);
    } catch (error) {
      if (!filesystem?.createDirectory) throw error;
      forgetPreparedLogDirectory(filesystem, logPath);
      await ensureLogFileDirectory(filesystem, logPath);
      return appendLogContent(filesystem, logPath, line);
    }
  }

  /**
   * Creates an ordered writer that combines nearby log lines into fewer filesystem appends.
   */
  function createBufferedLogWriter(writeBatch, options = {}) {
    const flushDelayMs = normalizePositiveInteger(options.flushDelayMs, DEFAULT_FLUSH_DELAY_MS, 60000);
    const maxBatchLines = normalizePositiveInteger(options.maxBatchLines, DEFAULT_MAX_BATCH_LINES, 10000);
    let pendingPath = "";
    let pendingLines = [];
    let pendingWrites = [];
    let flushTimer = null;
    let writeQueue = Promise.resolve();

    function clearFlushTimer() {
      if (flushTimer === null) return;
      global.clearTimeout(flushTimer);
      flushTimer = null;
    }

    function flush() {
      clearFlushTimer();
      if (!pendingLines.length) return writeQueue;
      const path = pendingPath;
      const content = pendingLines.join("\n");
      const writes = pendingWrites;
      pendingPath = "";
      pendingLines = [];
      pendingWrites = [];
      const batchWrite = writeQueue.then(() => writeBatch(path, content));
      writeQueue = batchWrite.catch(() => false);
      batchWrite.then(
        (result) => writes.forEach(({ resolve }) => resolve(result)),
        (error) => writes.forEach(({ reject }) => reject(error))
      );
      return batchWrite;
    }

    function scheduleFlush() {
      if (flushTimer !== null) return;
      flushTimer = global.setTimeout(() => {
        flushTimer = null;
        void flush();
      }, flushDelayMs);
    }

    function write(path, line) {
      if (pendingLines.length && pendingPath !== path) void flush();
      pendingPath = path;
      pendingLines.push(String(line));
      const pendingWrite = new Promise((resolve, reject) => {
        pendingWrites.push({ resolve, reject });
      });
      if (pendingLines.length >= maxBatchLines) {
        void flush();
      } else {
        scheduleFlush();
      }
      return pendingWrite;
    }

    return { flush, write };
  }

  const api = {
    DEFAULT_MAX_LOG_FILES,
    DEFAULT_MAX_LOG_SIZE_MB,
    appendLogFileWithRotation,
    createBufferedLogWriter,
    ensureLogFileDirectory,
    getBackupLogPath,
    rotateLogFile
  };

  global.markdownViewerLogRotation = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
