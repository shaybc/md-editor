(function(window) {
  "use strict";

  /**
   * Installs supported VSIX language servers into MD-Editor's profile folder.
   */
  function registerMarkdownViewerLspVsixInstaller(app, deps) {
    const registry = deps.registry;
    const JSZip = deps.JSZip || window.JSZip;
    const TEXT_DECODER = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
    const JDTLS_MILESTONES_URL = "https://download.eclipse.org/jdtls/milestones";
    const LEMMINX_RELEASES_URL = "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/org.eclipse.lemminx";
    const LEMMINX_MAVEN_RELEASES_URL = "https://repo.eclipse.org/content/repositories/lemminx-releases/org/eclipse/lemminx/lemminx-maven";
    const LEMMINX_EXTENSION_DIR = "extensions";
    const BUNDLED_LANGUAGE_SERVER_BIN_DIR = "bin";

    function log(level, message, details) {
      try {
        deps.appDebugLog?.(level, message, details);
      } catch (_error) {
        // LSP installer logging should never block install or uninstall flows.
      }
    }

    /**
     * Return whether a VSIX zip entry is safe to extract.
     * @param {string} path - Entry path inside the VSIX archive.
     * @returns {boolean} True when the path stays inside the target folder.
     */
    function isSafeArchivePath(path) {
      const normalized = String(path || "").replace(/\\/g, "/");
      return !!normalized
        && !normalized.startsWith("/")
        && !/^[A-Za-z]:\//.test(normalized)
        && !normalized.split("/").includes("..");
    }

    /**
     * Normalize VSIX paths by stripping the extension/ package root.
     * @param {string} path - Archive entry path.
     * @returns {string} Relative install path.
     */
    function getInstallRelativePath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/^extension\//, "");
    }

    /**
     * Validate that a loaded VSIX can provide the supported server.
     * @param {object} zip - Loaded JSZip archive.
     * @param {object} server - Supported server definition.
     * @returns {object} Validation result.
     */
    function validateVsix(zip, server) {
      if (!zip || !server) return { valid: false, missingFiles: [], variant: null };
      const archiveFiles = Object.keys(zip.files || {}).map(getInstallRelativePath);
      for (const variant of server.variants || []) {
        const missingFiles = variant.requiredFiles.filter((filePath) => !archiveFiles.includes(filePath));
        if (!missingFiles.length) return { valid: true, missingFiles: [], variant };
      }
      const preferredVariant = server.variants?.[0] || null;
      const missingFiles = preferredVariant
        ? preferredVariant.requiredFiles.filter((filePath) => !archiveFiles.includes(filePath))
        : [];
      return { valid: false, missingFiles, variant: null };
    }

    /**
     * Read a selected local VSIX file as an ArrayBuffer.
     * @param {string} path - Local VSIX path.
     * @returns {Promise<ArrayBuffer>} VSIX bytes.
     */
    async function readVsixFile(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.filesystem?.readBinaryFile) throw new Error("VSIX install requires desktop file access.");
      return Neutralino.filesystem.readBinaryFile(path);
    }

    /**
     * Ensure a directory and its parents exist.
     * @param {string} path - Directory path.
     * @returns {Promise<void>}
     */
    async function ensureDirectory(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.createDirectory) return;
      const parts = registry.normalizeLocalPath(path).split("/");
      let current = "";
      for (const part of parts) {
        current = current ? registry.joinPath(current, part) : part;
        if (/^[A-Za-z]:$/.test(current)) continue;
        try {
          await Neutralino.filesystem.createDirectory(current);
        } catch (_error) {
          // Existing directories are fine; Neutralino reports them as create failures.
        }
      }
    }

    /**
     * Remove a folder if it already exists.
     * @param {string} path - Folder path.
     * @returns {Promise<void>}
     */
    async function pathExists(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.getStats) return false;
      try {
        await Neutralino.filesystem.getStats(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    function getDirectoryEntryName(entry) {
      return entry?.entry || entry?.name || "";
    }

    function isDirectoryEntry(entry) {
      const type = String(entry?.type || "").toUpperCase();
      return type === "DIRECTORY" || entry?.isDirectory === true;
    }

    function quoteCommandArg(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    function quotePowerShellString(value) {
      return `'${String(value || "").replace(/'/g, "''")}'`;
    }

    function quotePowerShellScript(value) {
      return quoteCommandArg(String(value || ""));
    }

    function getCommandResultText(result) {
      return String(result?.stdOut || result?.output || result?.stdErr || "");
    }

    async function execDesktopCommand(command, errorMessage) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.execCommand) throw new Error("Desktop command execution is unavailable.");
      const result = await Neutralino.os.execCommand(command);
      const exitCode = Number(result?.exitCode ?? 0);
      if (Number.isFinite(exitCode) && exitCode !== 0) {
        throw new Error(`${errorMessage}: ${getCommandResultText(result) || `exit code ${exitCode}`}`);
      }
      return result;
    }

    async function readRemoteText(url, errorMessage = "Unable to read release metadata") {
      const script = `$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri ${quotePowerShellString(url)}).Content`;
      const result = await execDesktopCommand(`powershell -NoProfile -ExecutionPolicy Bypass -Command ${quoteCommandArg(script)}`, errorMessage);
      return getCommandResultText(result);
    }

    function compareVersionsDescending(left, right) {
      const leftParts = String(left || "").split(".").map((part) => Number(part) || 0);
      const rightParts = String(right || "").split(".").map((part) => Number(part) || 0);
      for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
        const diff = (rightParts[index] || 0) - (leftParts[index] || 0);
        if (diff) return diff;
      }
      return 0;
    }
    async function resolveSupportedJdtLsArchive() {
      const version = registry.serverDefinitions.java?.variants
        ?.find((variant) => variant.id === "eclipse-jdt-ls")?.supportedVersion || "";
      if (!version) throw new Error("The supported Eclipse JDT LS version is not configured.");
      const releaseHtml = await readRemoteText(`${JDTLS_MILESTONES_URL}/${version}/`, "Unable to read Eclipse JDT LS release metadata");
      const archiveName = releaseHtml.match(/jdt-language-server-[^"'<> ]+\.tar\.gz/)?.[0] || "";
      if (!archiveName) throw new Error(`Unable to locate the Eclipse JDT LS archive for ${version}.`);
      return {
        version,
        archiveName,
        url: `${JDTLS_MILESTONES_URL}/${version}/${archiveName}`
      };
    }

    async function downloadFile(url, targetPath, errorMessage = "Unable to download language server") {
      const script = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri ${quotePowerShellString(url)} -OutFile ${quotePowerShellString(targetPath)}`;
      await execDesktopCommand(`powershell -NoProfile -ExecutionPolicy Bypass -Command ${quoteCommandArg(script)}`, errorMessage);
    }

    async function extractTarGz(archivePath, targetDir) {
      await execDesktopCommand(`tar -xzf ${quoteCommandArg(archivePath)} -C ${quoteCommandArg(targetDir)}`, "Unable to extract Eclipse JDT LS");
    }

    async function isDirectoryEmpty(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.readDirectory) return false;
      try {
        const entries = await Neutralino.filesystem.readDirectory(path);
        return !(entries || []).some((entry) => {
          const name = getDirectoryEntryName(entry);
          return name && name !== "." && name !== "..";
        });
      } catch (_error) {
        return false;
      }
    }

    async function removePathTree(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.filesystem?.remove) throw new Error("Desktop file removal is unavailable.");
      try {
        await Neutralino.filesystem.remove(path);
      } catch (directError) {
        if (!Neutralino.filesystem?.readDirectory) throw directError;
        const entries = await Neutralino.filesystem.readDirectory(path);
        for (const entry of entries || []) {
          const name = getDirectoryEntryName(entry);
          if (!name || name === "." || name === "..") continue;
          const childPath = registry.joinPath(path, name);
          await removePathTree(childPath);
        }
        await Neutralino.filesystem.remove(path);
      }
    }


    function isSafeLanguageServerRemovalPath(path) {
      const normalized = registry.normalizeLocalPath(path);
      return /^[A-Za-z]:\/Users\/[^/]+\/\.md-editor\/language-servers\/[^/]+$/i.test(normalized)
        || /\/\.md-editor\/language-servers\/[^/]+$/i.test(normalized);
    }

    async function removePathTreeWithDesktopFallback(path, originalError) {
      if (!isSafeLanguageServerRemovalPath(path)) throw originalError;
      const script = `Remove-Item -LiteralPath ${quotePowerShellString(path)} -Recurse -Force -ErrorAction Stop`;
      await execDesktopCommand(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command ${quotePowerShellScript(script)}`,
        "Unable to remove language server folder"
      );
    }
    async function removeIfExists(path) {
      if (!path) return false;
      if (!(await pathExists(path))) return false;
      log("info", "[lsp] Removing language server folder", { path });
      let removeError = null;
      try {
        await removePathTree(path);
      } catch (error) {
        removeError = error;
      }
      if (await pathExists(path)) {
        if (await isDirectoryEmpty(path)) {
          log("warning", "[lsp] Language server folder is empty but could not be removed", {
            path,
            message: removeError?.message || ""
          });
          return true;
        }
        if (removeError) {
          await removePathTreeWithDesktopFallback(path, removeError);
          if (!(await pathExists(path))) {
            log("info", "[lsp] Removed language server folder with desktop fallback", { path });
            return true;
          }
          throw removeError;
        }
        await removePathTreeWithDesktopFallback(path, new Error(`Language server folder still exists after removal: ${path}`));
        if (!(await pathExists(path))) {
          log("info", "[lsp] Removed language server folder with desktop fallback", { path });
          return true;
        }
        throw new Error(`Language server folder still exists after removal: ${path}`);      }
      log("info", "[lsp] Removed language server folder", { path });
      return true;
    }

    async function readDirectory(path) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!path || !Neutralino?.filesystem?.readDirectory) return [];
      try {
        return await Neutralino.filesystem.readDirectory(path);
      } catch (_error) {
        return [];
      }
    }

    function globToRegExp(pattern) {
      return new RegExp(`^${String(pattern || "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    }

    async function resolveExistingPath(installDir, relativePath) {
      const normalizedRelativePath = registry.normalizeLocalPath(relativePath);
      if (!normalizedRelativePath.includes("*")) {
        const exactPath = registry.joinPath(installDir, normalizedRelativePath);
        return await pathExists(exactPath) ? exactPath : "";
      }
      const slashIndex = normalizedRelativePath.lastIndexOf("/");
      const parentRelativePath = slashIndex >= 0 ? normalizedRelativePath.slice(0, slashIndex) : "";
      const filePattern = slashIndex >= 0 ? normalizedRelativePath.slice(slashIndex + 1) : normalizedRelativePath;
      const parentPath = registry.joinPath(installDir, parentRelativePath);
      const matcher = globToRegExp(filePattern);
      const entries = await readDirectory(parentPath);
      const match = (entries || []).map(getDirectoryEntryName).find((entryName) => matcher.test(entryName));
      return match ? registry.joinPath(parentPath, match) : "";
    }

    async function validateJdtLsInstallDir(installDir, server) {
      const variant = (server?.variants || []).find((candidate) => candidate.id === "eclipse-jdt-ls") || null;
      const missingFiles = [];
      for (const filePath of variant?.requiredFiles || []) {
        if (!await resolveExistingPath(installDir, filePath)) missingFiles.push(filePath);
      }
      return {
        valid: !!variant && missingFiles.length === 0,
        missingFiles,
        variant
      };
    }
    function getFileName(path) {
      return String(path || "").split(/[\\/]/).pop() || "";
    }
    function getBundledArtifactVersion(name, matcher) {
      return String(name || "").match(matcher)?.[1] || "";
    }

    function compareBundledArtifactsDescending(left, right) {
      const versionDiff = compareVersionsDescending(left.version, right.version);
      if (versionDiff) return versionDiff;
      return String(right.name || "").localeCompare(String(left.name || ""));
    }

    async function getBundledLanguageServerBinDir() {
      const rootPath = await registry.getDesktopAppRootPath?.();
      return rootPath ? registry.joinPath(rootPath, BUNDLED_LANGUAGE_SERVER_BIN_DIR) : "";
    }

    async function findBundledArtifact(options) {
      const binDir = await getBundledLanguageServerBinDir();
      if (!binDir) return null;
      const matcher = options?.matcher;
      const versionMatcher = options?.versionMatcher || matcher;
      const entries = await readDirectory(binDir);
      const matches = (entries || [])
        .map((entry) => getDirectoryEntryName(entry))
        .filter(Boolean)
        .filter((name) => matcher?.test(name))
        .map((name) => ({
          name,
          path: registry.joinPath(binDir, name),
          version: getBundledArtifactVersion(name, versionMatcher)
        }))
        .sort(compareBundledArtifactsDescending);
      return matches[0] || null;
    }

    function findBundledJdtLsArchive() {
      return findBundledArtifact({
        matcher: /^jdt-language-server-.+\.t(?:ar\.)?gz$/i,
        versionMatcher: /^jdt-language-server-(.+)\.t(?:ar\.)?gz$/i
      });
    }

    function findBundledLemMinXServerJar() {
      return findBundledArtifact({
        matcher: /^org\.eclipse\.lemminx-.+-uber\.jar$/i,
        versionMatcher: /^org\.eclipse\.lemminx-(.+)-uber\.jar$/i
      });
    }

    function findBundledLemMinXMavenExtensionJar() {
      return findBundledArtifact({
        matcher: /^lemminx[-.]maven-.+\.jar$/i,
        versionMatcher: /^lemminx[-.]maven-(.+)\.jar$/i
      });
    }

    function findBundledLemMinXMavenExtensionZip() {
      return findBundledArtifact({
        matcher: /^lemminx[-.]maven-.+-(?:zip-with-dependencies|vscode-uber-jars)\.zip$/i,
        versionMatcher: /^lemminx[-.]maven-(.+?)-(?:zip-with-dependencies|vscode-uber-jars)\.zip$/i
      });
    }

    function isLemMinXServerJar(path) {
      return /(^|[\\/])[^\\/]*lemminx[^\\/]*-uber\.jar$/i.test(String(path || ""));
    }

    function isLemMinXMavenExtensionJar(path) {
      return /(^|[\\/])[^\\/]*lemminx[-.]maven[^\\/]*\.jar$/i.test(String(path || ""));
    }

    function isLemMinXMavenExtensionZip(path) {
      return /(^|[\\/])[^\\/]*lemminx[-.]maven[^\\/]*-(?:zip-with-dependencies|vscode-uber-jars)\.zip$/i.test(String(path || ""));
    }

    function isLemMinXMavenExtensionPackage(path) {
      return isLemMinXMavenExtensionJar(path) || isLemMinXMavenExtensionZip(path);
    }

    function getRepositoryVersions(metadataXml) {
      return Array.from(String(metadataXml || "").matchAll(/<version>([^<]+)<\/version>/g))
        .map((match) => match[1] || "")
        .filter((version) => /^\d+\.\d+\.\d+/.test(version))
        .filter((version, index, values) => values.indexOf(version) === index)
        .sort(compareVersionsDescending);
    }

    function getLatestRepositoryVersion(metadataXml) {
      const text = String(metadataXml || "");
      return text.match(/<release>([^<]+)<\/release>/)?.[1]
        || text.match(/<latest>([^<]+)<\/latest>/)?.[1]
        || getRepositoryVersions(text)[0]
        || "";
    }

    async function resolveLatestRepositoryJar(options) {
      const baseUrl = String(options?.baseUrl || "").replace(/\/+$/, "");
      const displayName = options?.displayName || "language server";
      const artifactName = String(options?.artifactName || "");
      const metadataXml = await readRemoteText(`${baseUrl}/maven-metadata.xml`, `Unable to read ${displayName} release metadata`);
      const version = getLatestRepositoryVersion(metadataXml);
      if (!version) throw new Error(`Unable to locate the latest ${displayName} release.`);
      const jarName = artifactName.replace(/\{version\}/g, version);
      if (!jarName) throw new Error(`Unable to locate the ${displayName} JAR for ${version}.`);
      return {
        version,
        archiveName: jarName,
        url: `${baseUrl}/${version}/${jarName}`
      };
    }

    async function copyBinaryFile(sourcePath, targetPath) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.filesystem?.readBinaryFile || !Neutralino?.filesystem?.writeBinaryFile) {
        throw new Error("Language-server install requires desktop file access.");
      }
      await Neutralino.filesystem.writeBinaryFile(targetPath, await Neutralino.filesystem.readBinaryFile(sourcePath));
    }

    function getParentPath(filePath) {
      return String(filePath || "").replace(/[\\/][^\\/]*$/, "");
    }

    async function copyLemMinXMavenZipJars(zipPath, extensionDir) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!JSZip?.loadAsync) throw new Error("POM language-server dependency ZIP install requires JSZip.");
      if (!Neutralino?.filesystem?.writeBinaryFile) throw new Error("POM language-server install requires desktop file access.");
      const zip = await JSZip.loadAsync(await readVsixFile(zipPath));
      let jarCount = 0;
      let hasMavenExtensionJar = false;
      for (const entry of Object.values(zip.files || {})) {
        if (!entry || entry.dir) continue;
        const entryName = String(entry.name || "").replace(/\\/g, "/");
        if (!isSafeArchivePath(entryName)) throw new Error(`Unsafe LemMinX Maven dependency ZIP path: ${entryName}`);
        const jarName = getFileName(entryName);
        if (!/\.jar$/i.test(jarName)) continue;
        const data = await entry.async("uint8array");
        const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await Neutralino.filesystem.writeBinaryFile(registry.joinPath(extensionDir, jarName), bytes);
        jarCount += 1;
        if (isLemMinXMavenExtensionJar(jarName)) hasMavenExtensionJar = true;
      }
      if (!hasMavenExtensionJar) throw new Error("The LemMinX Maven dependency ZIP does not contain lemminx-maven.jar.");
      return jarCount;
    }

    async function copySiblingLemMinXMavenJars(jarPath, extensionDir) {
      const parentPath = getParentPath(jarPath);
      if (!parentPath) return 0;
      const entries = await readDirectory(parentPath);
      let jarCount = 0;
      for (const entry of entries || []) {
        const entryName = getDirectoryEntryName(entry);
        if (!entryName || !/\.jar$/i.test(entryName) || isLemMinXServerJar(entryName)) continue;
        await copyBinaryFile(registry.joinPath(parentPath, entryName), registry.joinPath(extensionDir, entryName));
        jarCount += 1;
      }
      return jarCount;
    }

    async function findSiblingLemMinXMavenExtensionZip(jarPath) {
      const parentPath = getParentPath(jarPath);
      if (!parentPath) return null;
      const entries = await readDirectory(parentPath);
      const matches = (entries || [])
        .map((entry) => getDirectoryEntryName(entry))
        .filter((name) => isLemMinXMavenExtensionZip(name))
        .map((name) => ({
          name,
          path: registry.joinPath(parentPath, name),
          version: getBundledArtifactVersion(name, /^lemminx[-.]maven-(.+?)-(?:zip-with-dependencies|vscode-uber-jars)\.zip$/i)
        }))
        .sort(compareBundledArtifactsDescending);
      return matches[0] || null;
    }

    async function installLemMinXMavenExtensionPackage(packagePath, extensionDir) {
      if (isLemMinXMavenExtensionZip(packagePath)) {
        const jarCount = await copyLemMinXMavenZipJars(packagePath, extensionDir);
        return { packageType: "zip", jarCount, dependencyArchiveName: getFileName(packagePath) };
      }
      const jarName = getFileName(packagePath) || "lemminx-maven.jar";
      await copyBinaryFile(packagePath, registry.joinPath(extensionDir, jarName));
      const siblingZip = await findSiblingLemMinXMavenExtensionZip(packagePath);
      if (siblingZip?.path) {
        const jarCount = await copyLemMinXMavenZipJars(siblingZip.path, extensionDir);
        return { packageType: "jar+zip", jarCount, dependencyArchiveName: siblingZip.name };
      }
      const jarCount = await copySiblingLemMinXMavenJars(packagePath, extensionDir);
      return { packageType: "jar", jarCount: Math.max(jarCount, 1), dependencyArchiveName: "" };
    }

    async function validateLemMinXInstallDir(installDir, server) {
      const variant = (server?.variants || []).find((candidate) => candidate.id === "eclipse-lemminx") || null;
      const missingFiles = [];
      for (const filePath of variant?.requiredFiles || []) {
        if (!await resolveExistingPath(installDir, filePath)) missingFiles.push(filePath);
      }
      return {
        valid: !!variant && missingFiles.length === 0,
        missingFiles,
        variant
      };
    }

    async function writeXmlServerMetadata(metadata) {
      const Neutralino = deps.Neutralino || window.Neutralino;
      await Neutralino.filesystem.writeFile(
        await registry.getServerMetadataPath("xml"),
        JSON.stringify(metadata, null, 2)
      );
    }

    /**
     * Extract a validated VSIX archive to the fixed server install folder.
     * @param {object} options - Install options.
     * @param {string} options.serverId - Supported server id.
     * @param {string} options.vsixPath - Selected VSIX path.
     * @returns {Promise<object>} Installed server metadata.
     */
    async function installVsix(options) {
      const serverId = String(options?.serverId || "typescript");
      const vsixPath = String(options?.vsixPath || "");
      const server = registry.serverDefinitions[serverId];
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!server) throw new Error("Unsupported language server.");
      if (!JSZip) throw new Error("VSIX install requires JSZip.");
      if (!vsixPath) throw new Error("Choose a VSIX file to install.");
      const installDir = await registry.getServerInstallDir(serverId);
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");

      const zip = await JSZip.loadAsync(await readVsixFile(vsixPath));
      const validation = validateVsix(zip, server);
      if (!validation.valid) {
        throw new Error(`The VSIX is missing required Sourcegraph JavaScript/TypeScript server files: ${validation.missingFiles.join(", ")}`);
      }

      const stagingDir = `${installDir}.staging`;
      await removeIfExists(stagingDir);
      await ensureDirectory(stagingDir);

      const entries = Object.values(zip.files || {});
      for (const entry of entries) {
        if (!entry || entry.dir) continue;
        if (!isSafeArchivePath(entry.name)) throw new Error(`Unsafe VSIX path: ${entry.name}`);
        const relativePath = getInstallRelativePath(entry.name);
        if (!relativePath) continue;
        const targetPath = registry.joinPath(stagingDir, relativePath);
        const parentPath = targetPath.replace(/\/[^/]+$/, "");
        await ensureDirectory(parentPath);
        const data = await entry.async("uint8array");
        const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await Neutralino.filesystem.writeBinaryFile(targetPath, bytes);
      }

      await removeIfExists(installDir);
      await Neutralino.filesystem.move(stagingDir, installDir);
      const metadata = {
        version: 1,
        serverId,
        variantId: validation.variant.id,
        variantLabel: validation.variant.label,
        entryFile: validation.variant.entryFile,
        installedAt: new Date().toISOString(),
        vsixName: vsixPath.split(/[\\/]/).pop() || "server.vsix",
        installDir
      };
      await Neutralino.filesystem.writeFile(
        await registry.getServerMetadataPath(serverId),
        JSON.stringify(metadata, null, 2)
      );
      return metadata;
    }

    /**
     * Open a VSIX picker and install the selected TypeScript server.
     * @returns {Promise<object|null>} Install metadata, or null when cancelled.
     */
    async function installTypeScriptVsixFromDialog() {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.showOpenDialog) throw new Error("VSIX install requires the desktop app.");
      const selected = await Neutralino.os.showOpenDialog("Install TypeScript language server VSIX", {
        filters: [{ name: "VSIX packages", extensions: ["vsix"] }]
      });
      const vsixPath = Array.isArray(selected) ? selected[0] : selected;
      if (!vsixPath) return null;
      return installVsix({ serverId: "typescript", vsixPath });
    }

    async function installJavaJdtLsArchive({ archivePath, release = {}, source = "file", preserveSourceArchive = false }) {
      const serverId = "java";
      const server = registry.serverDefinitions[serverId];
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!server) throw new Error("Unsupported language server.");
      if (!Neutralino?.filesystem?.move) throw new Error("Java language-server install requires desktop file access.");
      if (!archivePath) throw new Error("Choose an Eclipse JDT LS archive to install.");
      const installDir = await registry.getServerInstallDir(serverId);
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");

      const stagingDir = `${installDir}.staging`;
      await removeIfExists(stagingDir);
      await ensureDirectory(stagingDir);
      await extractTarGz(archivePath, stagingDir);

      const validation = await validateJdtLsInstallDir(stagingDir, server);
      if (!validation.valid) {
        await removeIfExists(stagingDir);
        throw new Error(`The Eclipse JDT LS archive is missing required server files: ${validation.missingFiles.join(", ")}`);
      }

      await removeIfExists(installDir);
      await Neutralino.filesystem.move(stagingDir, installDir);
      if (!preserveSourceArchive) {
        try {
          await removeIfExists(archivePath);
        } catch (_error) {
          // Download cache cleanup is best-effort.
        }
      }
      const metadata = {
        version: 1,
        serverId,
        variantId: validation.variant.id,
        variantLabel: validation.variant.label,
        entryFile: validation.variant.entryFile,
        installedAt: new Date().toISOString(),
        installSource: source,
        downloadUrl: release.url || "",
        releaseVersion: release.version || "",
        archiveName: release.archiveName || archivePath.split(/[\\/]/).pop() || "jdt-language-server.tar.gz",
        installDir
      };
      await Neutralino.filesystem.writeFile(
        await registry.getServerMetadataPath(serverId),
        JSON.stringify(metadata, null, 2)
      );
      return metadata;
    }

    async function installJavaJdtLsFromEclipse() {
      const installDir = await registry.getServerInstallDir("java");
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");
      const parentDir = installDir.replace(/\/[^/]+$/, "");
      const archivePath = registry.joinPath(parentDir, "jdt-language-server.tar.gz");
      const release = await resolveSupportedJdtLsArchive();
      await ensureDirectory(parentDir);
      await downloadFile(release.url, archivePath, "Unable to download Eclipse JDT LS");
      try {
        return await installJavaJdtLsArchive({ archivePath, release, source: "download" });
      } finally {
        try {
          await removeIfExists(archivePath);
        } catch (_error) {
          // Download cache cleanup is best-effort.
        }
      }
    }

    async function installJavaJdtLsFromDialog() {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.showOpenDialog) throw new Error("Java language-server install requires the desktop app.");
      const selected = await Neutralino.os.showOpenDialog("Install Eclipse JDT Language Server archive", {
        filters: [{ name: "Eclipse JDT LS archives", extensions: ["gz", "tgz"] }]
      });
      const archivePath = Array.isArray(selected) ? selected[0] : selected;
      if (!archivePath) return null;
      if (!/\.t(?:ar\.)?gz$/i.test(archivePath)) throw new Error("Choose an Eclipse JDT LS .tar.gz or .tgz archive.");
      return installJavaJdtLsArchive({ archivePath, source: "file" });
    }
    async function installJavaJdtLsFromBundledArchive(artifact) {
      if (!artifact?.path) throw new Error("Bundled Eclipse JDT LS archive was not found.");
      return installJavaJdtLsArchive({
        archivePath: artifact.path,
        release: {
          version: artifact.version || "",
          archiveName: artifact.name || getFileName(artifact.path)
        },
        source: "bundled",
        preserveSourceArchive: true
      });
    }
    async function installXmlLemMinXJar({ jarPath, release = {}, source = "file" }) {
      const serverId = "xml";
      const server = registry.serverDefinitions[serverId];
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!server) throw new Error("Unsupported language server.");
      if (!Neutralino?.filesystem?.move) throw new Error("XML language-server install requires desktop file access.");
      if (!jarPath) throw new Error("Choose a LemMinX XML Language Server JAR to install.");
      if (!isLemMinXServerJar(jarPath)) throw new Error("Choose a LemMinX XML Language Server uber JAR.");
      const installDir = await registry.getServerInstallDir(serverId);
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");

      const stagingDir = `${installDir}.staging`;
      await removeIfExists(stagingDir);
      await ensureDirectory(stagingDir);
      const jarName = getFileName(jarPath) || release.archiveName || "org.eclipse.lemminx-uber.jar";
      await copyBinaryFile(jarPath, registry.joinPath(stagingDir, jarName));

      const validation = await validateLemMinXInstallDir(stagingDir, server);
      if (!validation.valid) {
        await removeIfExists(stagingDir);
        throw new Error(`The LemMinX XML Language Server JAR is missing required server files: ${validation.missingFiles.join(", ")}`);
      }

      await removeIfExists(installDir);
      await Neutralino.filesystem.move(stagingDir, installDir);
      try {
        if (source === "download") await removeIfExists(jarPath);
      } catch (_error) {
        // Download cache cleanup is best-effort.
      }
      const metadata = {
        version: 1,
        serverId,
        variantId: validation.variant.id,
        variantLabel: validation.variant.label,
        entryFile: validation.variant.entryFile,
        installedAt: new Date().toISOString(),
        installSource: source,
        downloadUrl: release.url || "",
        releaseVersion: release.version || "",
        archiveName: release.archiveName || jarName,
        installDir
      };
      await writeXmlServerMetadata(metadata);
      return metadata;
    }

    async function installXmlLemMinXMavenExtension({ jarPath, release = {}, source = "file" }) {
      const serverId = "xml";
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.filesystem?.writeFile) throw new Error("POM language-server install requires desktop file access.");
      if (!jarPath) throw new Error("Choose a LemMinX Maven extension ZIP or JAR to install.");
      if (!isLemMinXMavenExtensionPackage(jarPath)) throw new Error("Choose a LemMinX Maven extension dependency ZIP or JAR.");
      const status = await registry.getServerStatus(serverId);
      if (!status.installed) throw new Error("Install the XML language server before installing POM support.");
      const installDir = await registry.getServerInstallDir(serverId);
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");
      const extensionDir = registry.joinPath(installDir, LEMMINX_EXTENSION_DIR);
      await removeIfExists(extensionDir);
      await ensureDirectory(extensionDir);
      const packageName = getFileName(jarPath) || release.archiveName || "lemminx-maven.zip";
      const packageInstall = await installLemMinXMavenExtensionPackage(jarPath, extensionDir);
      try {
        if (source === "download") await removeIfExists(jarPath);
      } catch (_error) {
        // Download cache cleanup is best-effort.
      }
      const metadata = {
        ...(status.metadata || {}),
        version: 1,
        serverId,
        variantId: status.variant?.id || "eclipse-lemminx",
        variantLabel: status.variant?.label || "Eclipse LemMinX XML Language Server",
        entryFile: status.variant?.entryFile || "org.eclipse.lemminx-*-uber.jar",
        installedAt: status.metadata?.installedAt || new Date().toISOString(),
        installDir,
        mavenExtensionInstalledAt: new Date().toISOString(),
        mavenExtensionSource: source,
        mavenExtensionDownloadUrl: release.url || "",
        mavenExtensionVersion: release.version || "",
        mavenExtensionName: release.archiveName || packageName,
        mavenExtensionPackageType: packageInstall.packageType,
        mavenExtensionDependencyArchive: packageInstall.dependencyArchiveName || "",
        mavenExtensionJarCount: packageInstall.jarCount
      };
      await writeXmlServerMetadata(metadata);
      return metadata;
    }

    async function installXmlLemMinXFromEclipse() {
      const installDir = await registry.getServerInstallDir("xml");
      if (!installDir) throw new Error("Profile language-server folder is unavailable.");
      const parentDir = installDir.replace(/\/[^/]+$/, "");
      await ensureDirectory(parentDir);
      const serverRelease = await resolveLatestRepositoryJar({
        baseUrl: LEMMINX_RELEASES_URL,
        displayName: "LemMinX XML Language Server",
        artifactName: "org.eclipse.lemminx-{version}-uber.jar"
      });
      const serverJarPath = registry.joinPath(parentDir, serverRelease.archiveName);
      await downloadFile(serverRelease.url, serverJarPath, "Unable to download LemMinX XML Language Server");
      const serverMetadata = await installXmlLemMinXJar({ jarPath: serverJarPath, release: serverRelease, source: "download" });
      const mavenRelease = await resolveLatestRepositoryJar({
        baseUrl: LEMMINX_MAVEN_RELEASES_URL,
        displayName: "LemMinX Maven extension dependencies",
        artifactName: "lemminx-maven-{version}-zip-with-dependencies.zip"
      });
      const mavenPackagePath = registry.joinPath(parentDir, mavenRelease.archiveName);
      await downloadFile(mavenRelease.url, mavenPackagePath, "Unable to download LemMinX Maven extension dependencies");
      return installXmlLemMinXMavenExtension({ jarPath: mavenPackagePath, release: mavenRelease, source: "download", serverMetadata });
    }

    async function installXmlLemMinXFromDialog() {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.showOpenDialog) throw new Error("XML language-server install requires the desktop app.");
      const selected = await Neutralino.os.showOpenDialog("Install LemMinX XML Language Server JAR", {
        filters: [{ name: "LemMinX XML Language Server JAR", extensions: ["jar"] }]
      });
      const jarPath = Array.isArray(selected) ? selected[0] : selected;
      if (!jarPath) return null;
      return installXmlLemMinXJar({ jarPath, source: "file" });
    }

    async function installXmlLemMinXMavenExtensionFromDialog() {
      const Neutralino = deps.Neutralino || window.Neutralino;
      if (!Neutralino?.os?.showOpenDialog) throw new Error("POM language-server install requires the desktop app.");
      const selected = await Neutralino.os.showOpenDialog("Install LemMinX Maven extension ZIP or JAR", {
        filters: [{ name: "LemMinX Maven extension ZIP or JAR", extensions: ["zip", "jar"] }]
      });
      const jarPath = Array.isArray(selected) ? selected[0] : selected;
      if (!jarPath) return null;
      return installXmlLemMinXMavenExtension({ jarPath, source: "file" });
    }

    /**
     * Remove the fixed install folder for a supported server.
     * @param {string} serverId - Supported server id.
     * @returns {Promise<boolean>} True when removal was attempted.
     */

    async function hasInstalledLemMinXMavenExtension(installDir) {
      return !!await resolveExistingPath(installDir, `${LEMMINX_EXTENSION_DIR}/*lemminx*maven*.jar`);
    }

    async function hasInstalledLemMinXMavenDependencies(installDir) {
      return !!await resolveExistingPath(installDir, `${LEMMINX_EXTENSION_DIR}/maven-settings-builder-*.jar`)
        || !!await resolveExistingPath(installDir, `${LEMMINX_EXTENSION_DIR}/maven-settings-*.jar`);
    }

    async function ensureBundledJavaLanguageServerInstalled(status) {
      if (status?.installed) return { installed: false, reason: "already-installed", status };
      const artifact = await findBundledJdtLsArchive();
      if (!artifact) return { installed: false, reason: "missing-bundled-artifact", serverId: "java" };
      const metadata = await installJavaJdtLsFromBundledArchive(artifact);
      return { installed: true, reason: "installed", serverId: "java", artifact, metadata };
    }

    async function ensureBundledXmlLanguageServerInstalled(status) {
      let currentStatus = status || await registry.getServerStatus("xml");
      let metadata = currentStatus.metadata || null;
      let installedServer = false;
      if (!currentStatus.installed) {
        const serverArtifact = await findBundledLemMinXServerJar();
        if (!serverArtifact) return { installed: false, reason: "missing-bundled-artifact", serverId: "xml" };
        metadata = await installXmlLemMinXJar({
          jarPath: serverArtifact.path,
          release: {
            version: serverArtifact.version || "",
            archiveName: serverArtifact.name || getFileName(serverArtifact.path)
          },
          source: "bundled"
        });
        installedServer = true;
        currentStatus = await registry.getServerStatus("xml");
      }

      const installDir = currentStatus.installDir || await registry.getServerInstallDir("xml");
      const hasMavenExtension = installDir ? await hasInstalledLemMinXMavenExtension(installDir) : false;
      const hasMavenDependencies = installDir ? await hasInstalledLemMinXMavenDependencies(installDir) : false;
      if (!hasMavenExtension || !hasMavenDependencies) {
        const mavenArtifact = await findBundledLemMinXMavenExtensionZip() || await findBundledLemMinXMavenExtensionJar();
        if (mavenArtifact) {
          metadata = await installXmlLemMinXMavenExtension({
            jarPath: mavenArtifact.path,
            release: {
              version: mavenArtifact.version || "",
              archiveName: mavenArtifact.name || getFileName(mavenArtifact.path)
            },
            source: "bundled"
          });
          return {
            installed: true,
            reason: installedServer ? "installed" : "installed-extension",
            serverId: "xml",
            artifact: mavenArtifact,
            metadata
          };
        }
      }

      return {
        installed: installedServer,
        reason: installedServer ? "installed" : "already-installed",
        serverId: "xml",
        metadata
      };
    }

    async function ensureBundledLanguageServerInstalled(serverId) {
      const normalizedServerId = String(serverId || "");
      if (normalizedServerId !== "java" && normalizedServerId !== "xml") {
        return { installed: false, reason: "unsupported", serverId: normalizedServerId };
      }
      try {
        const status = await registry.getServerStatus(normalizedServerId);
        return normalizedServerId === "java"
          ? await ensureBundledJavaLanguageServerInstalled(status)
          : await ensureBundledXmlLanguageServerInstalled(status);
      } catch (error) {
        log("warning", "[lsp] Bundled language server install failed", {
          serverId: normalizedServerId,
          message: error?.message || String(error)
        });
        return {
          installed: false,
          reason: "install-failed",
          serverId: normalizedServerId,
          error
        };
      }
    }
    async function removeServer(serverId) {
      const installDir = await registry.getServerInstallDir(serverId);
      if (!installDir) return false;
      log("info", "[lsp] Removing language server install", { serverId, installDir });
      const removed = await removeIfExists(installDir);
      log("info", "[lsp] Language server uninstall verification complete", { serverId, installDir, removed });
      return true;
    }

    const api = {
      ensureBundledLanguageServerInstalled,
      installJavaJdtLsArchive,
      installJavaJdtLsFromDialog,
      installJavaJdtLsFromEclipse,
      installTypeScriptVsixFromDialog,
      installXmlLemMinXFromDialog,
      installXmlLemMinXFromEclipse,
      installXmlLemMinXMavenExtensionFromDialog,
      installVsix,
      isSafeArchivePath,
      removeServer,
      validateJdtLsInstallDir,
      validateLemMinXInstallDir,
      validateVsix
    };

    app.registerModule("lspVsixInstaller", api);
    return api;
  }

  window.registerMarkdownViewerLspVsixInstaller = registerMarkdownViewerLspVsixInstaller;
})(window);
