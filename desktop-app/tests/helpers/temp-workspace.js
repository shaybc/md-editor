const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

/**
 * Create a temporary desktop workspace with optional files.
 * @param {Record<string, string>} files - Relative file paths and UTF-8 contents.
 * @param {string} prefix - Temporary folder prefix.
 * @returns {Promise<string>} Absolute temporary workspace path.
 */
async function createTempWorkspace(files = {}, prefix = "md-editor-desktop-folder-") {
  const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  for (const [relativePath, content] of Object.entries(files)) {
    await writeWorkspaceFile(folderPath, relativePath, content);
  }
  return folderPath;
}

/**
 * Create a temporary desktop workspace from nested folder data.
 * @param {Record<string, string | Record<string, unknown>>} tree - Nested folder/file data.
 * @param {string} prefix - Temporary folder prefix.
 * @returns {Promise<string>} Absolute temporary workspace path.
 */
async function createWorkspaceTree(tree = {}, prefix = "md-editor-desktop-tree-") {
  const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await writeWorkspaceTree(folderPath, "", tree);
  return folderPath;
}

async function writeWorkspaceTree(folderPath, currentPath, tree) {
  for (const [name, value] of Object.entries(tree)) {
    const relativePath = path.join(currentPath, name);
    if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
      await fs.mkdir(getWorkspacePath(folderPath, relativePath), { recursive: true });
      await writeWorkspaceTree(folderPath, relativePath, value);
    } else {
      await writeWorkspaceFile(folderPath, relativePath, String(value ?? ""));
    }
  }
}

/**
 * Create a large-enough fixture to exercise lazy folder UI paths without a huge disk cost.
 * @param {number} fileCount - Number of files to create.
 * @param {string} prefix - Temporary folder prefix.
 * @returns {Promise<string>} Absolute temporary workspace path.
 */
async function createLazyWorkspace(fileCount = 160, prefix = "md-editor-desktop-lazy-") {
  const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  for (let index = 0; index < fileCount; index += 1) {
    await writeWorkspaceFile(folderPath, `item-${String(index).padStart(3, "0")}.md`, `# Item ${index}\n`);
  }
  return folderPath;
}

/**
 * Remove a temporary desktop workspace.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @returns {Promise<void>}
 */
async function removeTempWorkspace(folderPath) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}
/**
 * Resolve a path inside a temporary desktop workspace.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @param {string} relativePath - Relative path inside the workspace.
 * @returns {string} Absolute path to the workspace item.
 */
function getWorkspacePath(folderPath, relativePath) {
  return path.join(folderPath, relativePath);
}

/**
 * Write a UTF-8 file inside a temporary desktop workspace.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @param {string} relativePath - Relative path inside the workspace.
 * @param {string} content - File content.
 * @returns {Promise<string>} Absolute path to the written file.
 */
async function writeWorkspaceFile(folderPath, relativePath, content) {
  const filePath = getWorkspacePath(folderPath, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Read a UTF-8 file from a temporary desktop workspace.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @param {string} relativePath - Relative path inside the workspace.
 * @returns {Promise<string>} File content.
 */
async function readWorkspaceFile(folderPath, relativePath) {
  return fs.readFile(getWorkspacePath(folderPath, relativePath), "utf8");
}

/**
 * Read a JSON file from an absolute path.
 * @param {string} filePath - Absolute JSON file path.
 * @returns {Promise<unknown>} Parsed JSON content.
 */
async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

/**
 * Rename a workspace item.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @param {string} oldRelativePath - Existing relative path.
 * @param {string} newRelativePath - New relative path.
 * @returns {Promise<string>} New absolute path.
 */
async function renameWorkspacePath(folderPath, oldRelativePath, newRelativePath) {
  const oldPath = getWorkspacePath(folderPath, oldRelativePath);
  const newPath = getWorkspacePath(folderPath, newRelativePath);
  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(oldPath, newPath);
  return newPath;
}

/**
 * Delete a workspace item.
 * @param {string} folderPath - Absolute temporary workspace path.
 * @param {string} relativePath - Relative path to delete.
 * @returns {Promise<void>}
 */
async function removeWorkspacePath(folderPath, relativePath) {
  await fs.rm(getWorkspacePath(folderPath, relativePath), { recursive: true, force: true });
}

module.exports = {
  createLazyWorkspace,
  createTempWorkspace,
  createWorkspaceTree,
  getWorkspacePath,
  readJsonFile,
  readWorkspaceFile,
  removeTempWorkspace,
  removeWorkspacePath,
  renameWorkspacePath,
  writeWorkspaceFile,
};
