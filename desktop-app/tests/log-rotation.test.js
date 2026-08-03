const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendLogFileWithRotation,
  createBufferedLogWriter,
  getBackupLogPath,
  rotateLogFile
} = require("../resources/js/logging/rotation.js");

function createFilesystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const operations = [];
  return {
    files,
    operations,
    filesystem: {
      appendFile: async (path, content) => {
        operations.push(["append", path, content]);
        files.set(path, `${files.get(path) || ""}${content}`);
      },
      getStats: async (path) => {
        operations.push(["stats", path]);
        if (!files.has(path)) throw new Error(`Missing file: ${path}`);
        return { size: Buffer.byteLength(files.get(path), "utf8") };
      },
      move: async (sourcePath, targetPath) => {
        operations.push(["move", sourcePath, targetPath]);
        if (!files.has(sourcePath)) throw new Error(`Missing file: ${sourcePath}`);
        files.set(targetPath, files.get(sourcePath));
        files.delete(sourcePath);
      },
      remove: async (path) => {
        operations.push(["remove", path]);
        files.delete(path);
      }
    }
  };
}

test("backup log paths preserve the log file extension", () => {
  assert.equal(getBackupLogPath("C:/temp/md-editor-debug.log", 1), "C:/temp/md-editor-debug-1.log");
  assert.equal(getBackupLogPath("C:/temp/debug", 2), "C:/temp/debug-2");
});

test("appendLogFileWithRotation appends without rotating below max size", async () => {
  const { files, operations, filesystem } = createFilesystem({
    "C:/temp/debug.log": "small"
  });

  const wrote = await appendLogFileWithRotation(filesystem, "C:/temp/debug.log", "next", {
    maxLogFiles: 3,
    maxLogSizeMb: 1
  });

  assert.equal(wrote, true);
  assert.equal(files.get("C:/temp/debug.log"), "smallnext\n");
  assert.deepEqual(operations.filter((operation) => operation[0] === "move"), []);
  assert.deepEqual(operations.filter((operation) => operation[0] === "remove"), []);
});

test("rotateLogFile rotates current log to newest backup and shifts existing backups", async () => {
  const oneMb = "x".repeat(1024 * 1024);
  const { files, filesystem } = createFilesystem({
    "C:/temp/debug.log": oneMb,
    "C:/temp/debug-1.log": "previous newest",
    "C:/temp/debug-2.log": "previous middle",
    "C:/temp/debug-3.log": "previous oldest"
  });

  const rotated = await rotateLogFile(filesystem, "C:/temp/debug.log", {
    maxLogFiles: 3,
    maxLogSizeMb: 1
  });

  assert.equal(rotated, true);
  assert.equal(files.has("C:/temp/debug.log"), false);
  assert.equal(files.get("C:/temp/debug-1.log"), oneMb);
  assert.equal(files.get("C:/temp/debug-2.log"), "previous newest");
  assert.equal(files.get("C:/temp/debug-3.log"), "previous middle");
});

test("appendLogFileWithRotation writes a fresh active log after rotation", async () => {
  const oneMb = "x".repeat(1024 * 1024);
  const { files, operations, filesystem } = createFilesystem({
    "C:/temp/debug.log": oneMb
  });

  const wrote = await appendLogFileWithRotation(filesystem, "C:/temp/debug.log", "fresh", {
    maxLogFiles: 2,
    maxLogSizeMb: 1
  });

  assert.equal(wrote, true);
  assert.equal(files.get("C:/temp/debug-1.log"), oneMb);
  assert.equal(files.get("C:/temp/debug.log"), "fresh\n");
  assert.deepEqual(operations.filter((operation) => operation[0] === "append").map((operation) => operation[1]), ["C:/temp/debug.log"]);
});

test("appendLogFileWithRotation creates missing log directory path", async () => {
  const files = new Map();
  const directories = new Set();
  const operations = [];
  const filesystem = {
    appendFile: async (path, content) => {
      operations.push(["append", path, content]);
      files.set(path, `${files.get(path) || ""}${content}`);
    },
    createDirectory: async (path) => {
      operations.push(["mkdir", path]);
      directories.add(path);
    },
    getStats: async (path) => {
      operations.push(["stats", path]);
      if (files.has(path)) return { size: Buffer.byteLength(files.get(path), "utf8") };
      if (directories.has(path)) return { size: 0 };
      throw new Error(`Missing path: ${path}`);
    }
  };

  const wrote = await appendLogFileWithRotation(filesystem, "C:/temp/md-editor/debug.log", "created", {
    maxLogFiles: 3,
    maxLogSizeMb: 1
  });
  const wroteAgain = await appendLogFileWithRotation(filesystem, "C:/temp/md-editor/debug.log", "again", {
    maxLogFiles: 3,
    maxLogSizeMb: 1
  });

  assert.equal(wrote, true);
  assert.equal(wroteAgain, true);
  assert.deepEqual(operations.filter((operation) => operation[0] === "mkdir").map((operation) => operation[1]), [
    "C:/temp",
    "C:/temp/md-editor"
  ]);
  assert.equal(files.get("C:/temp/md-editor/debug.log"), "created\nagain\n");
});

test("createBufferedLogWriter combines ordered lines into one append", async () => {
  const batches = [];
  const writer = createBufferedLogWriter(async (path, content) => {
    batches.push({ path, content });
    return true;
  }, {
    flushDelayMs: 1000,
    maxBatchLines: 3
  });

  const writes = [
    writer.write("C:/temp/debug.log", "one"),
    writer.write("C:/temp/debug.log", "two"),
    writer.write("C:/temp/debug.log", "three")
  ];

  assert.deepEqual(await Promise.all(writes), [true, true, true]);
  assert.deepEqual(batches, [{
    path: "C:/temp/debug.log",
    content: "one\ntwo\nthree"
  }]);
});

test("createBufferedLogWriter flushes pending lines on demand", async () => {
  const batches = [];
  const writer = createBufferedLogWriter(async (path, content) => {
    batches.push({ path, content });
    return true;
  }, {
    flushDelayMs: 1000
  });

  const firstWrite = writer.write("C:/temp/debug.log", "one");
  const secondWrite = writer.write("C:/temp/debug.log", "two");
  await writer.flush();

  assert.equal(await firstWrite, true);
  assert.equal(await secondWrite, true);
  assert.deepEqual(batches, [{
    path: "C:/temp/debug.log",
    content: "one\ntwo"
  }]);
});
