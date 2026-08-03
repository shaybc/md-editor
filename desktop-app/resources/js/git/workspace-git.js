(function(global) {
  "use strict";

  const GIT_ACTIONS = new Set(["status", "fetch", "pull", "push", "stage", "unstage", "commit", "compareFile", "compareConflictFile", "compareStashFile", "branchList", "switchBranch", "branchCreate", "branchRename", "branchPush", "branchDeleteLocal", "branchDeleteRemote", "branchActivity", "tagCreate", "tagDelete", "resetToRemote", "stashList", "stashCreate", "stashPop", "discardChanges", "stashDrop", "changesDigest"]);
  const GIT_PANEL_MODES = new Set(["push", "stash"]);
  const FULL_BRANCH_SWITCHER_THRESHOLD = 16;

  /**
   * Size caps for the AI change-summary digest, mirrored from git-bridge.cjs
   * so the direct-CLI fallback produces the same shape as the bridge.
   */
  const DIGEST_LIMITS = Object.freeze({
    patchFileLines: 400,
    sectionBytes: 48 * 1024,
    untrackedFileBytes: 8 * 1024,
    untrackedTotalBytes: 48 * 1024,
    untrackedMaxFiles: 40,
    totalBytes: 120 * 1024
  });

  /** Null byte used to detect binary content without embedding control characters in source. */
  const NULL_CHARACTER = String.fromCharCode(0);

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function encodeJsonRequest(request) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(request || {}))));
  }

  function quoteCommandArg(value) {
    const text = String(value || "").replace(/\\/g, "/");
    if (typeof NL_OS !== "undefined" && NL_OS !== "Windows") return `'${text.replace(/'/g, "'\\''")}'`;
    return `"${text.replace(/"/g, '\\"')}"`;
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  function normalizeFiles(files) {
    return (Array.isArray(files) ? files : []).map((file) => normalizePath(file).trim()).filter(Boolean);
  }

  function normalizeBranchName(value) {
    const branch = String(value || "").trim();
    if (!branch) throw new Error("Branch name is required.");
    if (branch.startsWith("-") || branch.endsWith("/") || branch.endsWith(".") || branch.includes("..") || branch.includes("//") || /[\s~^:?*[\\]/.test(branch)) {
      throw new Error("Branch name is invalid.");
    }
    return branch;
  }

  function normalizeTagName(value) {
    const tag = String(value || "").trim();
    if (!tag) throw new Error("Tag name is required.");
    if (tag.startsWith("-") || tag.endsWith("/") || tag.endsWith(".") || tag.includes("..") || tag.includes("//") || /[\s~^:?*[\\]/.test(tag)) {
      throw new Error("Tag name is invalid.");
    }
    return tag;
  }

  function debugWorkspaceGitBranch(message, data) {
    if (global.console?.debug) global.console.debug(`[workspace-git] ${message}`, data);
  }

  function normalizeRemoteBranchName(value) {
    const branch = normalizePath(value).trim();
    if (!branch) throw new Error("Remote branch name is required.");
    if (!branch.includes("/")) {
      debugWorkspaceGitBranch("invalid remote branch name", { value, normalized: branch });
      throw new Error(`Remote branch name is invalid: ${branch}`);
    }
    normalizeBranchName(branch);
    return branch;
  }

  function getLocalBranchNameFromRemote(remoteBranch) {
    const branch = normalizeRemoteBranchName(remoteBranch);
    return normalizeBranchName(branch.split("/").slice(1).join("/"));
  }

  function splitRemoteBranchName(remoteBranch) {
    const branch = normalizeRemoteBranchName(remoteBranch);
    const [remote, ...branchParts] = branch.split("/");
    return {
      remote: normalizeBranchName(remote),
      branch: normalizeBranchName(branchParts.join("/"))
    };
  }

  function normalizeStashRef(value) {
    const ref = String(value || "").trim();
    if (!/^stash@\{\d+\}$/.test(ref)) throw new Error("Git stash reference is invalid.");
    return ref;
  }

  function normalizeStashRefs(values) {
    return (Array.isArray(values) ? values : []).map(normalizeStashRef);
  }

  function getStashRefIndex(ref) {
    const match = normalizeStashRef(ref).match(/^stash@\{(\d+)\}$/);
    return match ? Number(match[1]) : -1;
  }

  function sortStashRefsForDrop(values) {
    return normalizeStashRefs(values).sort((left, right) => getStashRefIndex(right) - getStashRefIndex(left));
  }

  function parsePorcelainStatus(output) {
    return String(output || "").split(/\r?\n/).filter((line) => line && !line.startsWith("##")).map((line) => {
      const index = line.slice(0, 1);
      const workingDir = line.slice(1, 2);
      const rawPath = line.slice(3).trim();
      const renameParts = rawPath.split(/\s+->\s+/);
      return {
        path: normalizePath(renameParts[renameParts.length - 1] || rawPath),
        originalPath: normalizePath(renameParts.length > 1 ? renameParts[0] : ""),
        index,
        workingDir
      };
    });
  }

  function parseBranchStatus(output) {
    const firstLine = String(output || "").split(/\r?\n/)[0] || "";
    const match = firstLine.match(/^##\s+([^\s.]+|\S+?)(?:\.\.\.([^\s]+))?(?:\s+\[(.*?)\])?/);
    const divergence = match?.[3] || "";
    const aheadMatch = divergence.match(/ahead\s+(\d+)/);
    const behindMatch = divergence.match(/behind\s+(\d+)/);
    return {
      branch: match?.[1] || "",
      tracking: match?.[2] || "",
      ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
      behind: behindMatch ? Number(behindMatch[1]) : 0
    };
  }

  function createStatusResult(output, isRepo = true) {
    const files = parsePorcelainStatus(output);
    return {
      isRepo,
      status: {
        ...parseBranchStatus(output),
        staged: files.filter((file) => file.index && file.index !== " " && file.index !== "?"),
        unstaged: files.filter((file) => file.workingDir && file.workingDir !== " "),
        files
      }
    };
  }

  function isGitConflictFile(file) {
    const state = `${file?.index || " "}${file?.workingDir || " "}`;
    return /^(AA|AU|DD|DU|UA|UD|UU)$/.test(state);
  }

  function getDiscardFileGroups(status, files) {
    const selected = normalizeFiles(files);
    const statusFiles = Array.isArray(status?.files) ? status.files : [];
    const statusByPath = new Map(statusFiles.map((file) => [normalizePath(file.path), file]));
    return selected.reduce((groups, filePath) => {
      const file = statusByPath.get(normalizePath(filePath));
      if (file?.index === "?" || file?.workingDir === "?") groups.untracked.push(filePath);
      else if (isGitConflictFile(file)) groups.conflicted.push(filePath);
      else groups.tracked.push(filePath);
      return groups;
    }, { tracked: [], untracked: [], conflicted: [] });
  }

  function getDirtyStatusPaths(status) {
    const paths = [];
    (Array.isArray(status?.files) ? status.files : []).forEach((file) => {
      expandGitFilePath(file?.path).forEach((path) => paths.push(path));
      expandGitFilePath(file?.originalPath).forEach((path) => paths.push(path));
    });
    return normalizeFiles(paths);
  }

  function getStashPopDirtyOverlap(status, stashFiles) {
    const dirtyKeys = new Set(getDirtyStatusPaths(status).map(getComparablePath));
    const overlap = [];
    const seen = new Set();
    normalizeFiles(stashFiles).forEach((stashPath) => {
      const hasOverlap = expandGitFilePath(stashPath).some((path) => dirtyKeys.has(getComparablePath(path)));
      const key = getComparablePath(stashPath);
      if (!hasOverlap || seen.has(key)) return;
      seen.add(key);
      overlap.push(stashPath);
    });
    return overlap;
  }

  function parseStashListOutput(output) {
    return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const match = line.match(/^(stash@\{\d+\}):\s*(.*)$/);
      const ref = normalizeStashRef(match?.[1] || "");
      return {
        ref,
        message: match?.[2] || ref,
        files: []
      };
    });
  }

  function parseStashFilesOutput(output) {
    return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const parts = line.split(/\t+/);
      const status = parts.shift() || "";
      const path = parts.length > 1 ? `${normalizePath(parts[0])} -> ${normalizePath(parts[parts.length - 1])}` : normalizePath(parts[0] || line);
      return { status, path };
    }).filter((file) => file.path);
  }

  /**
   * Cap one diff patch for the changes digest: each per-file chunk is limited
   * to DIGEST_LIMITS.patchFileLines lines and the whole section to
   * DIGEST_LIMITS.sectionBytes bytes. Pure function - no IO.
   */
  function capDigestPatchText(patch, limits = DIGEST_LIMITS) {
    const text = String(patch || "");
    if (!text) return { text: "", truncated: false };
    let truncated = false;
    const chunks = text.split(/^(?=diff --git )/m).map((chunk) => {
      const lines = chunk.split("\n");
      if (lines.length <= limits.patchFileLines) return chunk;
      truncated = true;
      return `${lines.slice(0, limits.patchFileLines).join("\n")}\n...[patch truncated]`;
    });
    let capped = chunks.join("");
    if (capped.length > limits.sectionBytes) {
      truncated = true;
      capped = `${capped.slice(0, limits.sectionBytes)}\n...[section truncated]`;
    }
    return { text: capped, truncated };
  }

  /**
   * Enforce the digest total-size budget by dropping the least important
   * content first: patch bodies (unpushed, then unstaged, then staged), then
   * untracked file contents. Stat lines and untracked paths always stay.
   */
  function enforceDigestTotalBudget(digest, limits = DIGEST_LIMITS) {
    const patchFields = ["unpushedPatch", "unstagedPatch", "stagedPatch"];
    const digestSize = () => JSON.stringify(digest).length;
    for (const field of patchFields) {
      if (digestSize() <= limits.totalBytes) break;
      if (!digest[field]) continue;
      digest[field] = "";
      if (!digest.truncated.includes(field)) digest.truncated.push(field);
    }
    if (digestSize() > limits.totalBytes && Array.isArray(digest.untracked)) {
      for (const entry of digest.untracked) {
        if (digestSize() <= limits.totalBytes) break;
        if (!entry.content) continue;
        entry.content = "";
        entry.truncated = true;
        const marker = `untracked:${entry.path}`;
        if (!digest.truncated.includes(marker)) digest.truncated.push(marker);
      }
    }
    return digest;
  }

  /**
   * Cap the untracked file list for the digest: at most untrackedMaxFiles
   * entries carry content, within a shared untrackedTotalBytes budget.
   * Mutates entries in place and returns truncation markers.
   */
  function capUntrackedDigestEntries(untracked, limits = DIGEST_LIMITS) {
    const markers = [];
    let remainingBytes = limits.untrackedTotalBytes;
    (Array.isArray(untracked) ? untracked : []).forEach((entry, index) => {
      if (!entry.content) return;
      if (index >= limits.untrackedMaxFiles || entry.content.length > remainingBytes) {
        entry.content = "";
        entry.truncated = true;
        markers.push(`untracked:${entry.path}`);
        return;
      }
      remainingBytes -= entry.content.length;
    });
    return markers;
  }

  /**
   * Assemble the AI change-summary digest from raw git command outputs.
   * Mirrors collectChangesDigest in git-bridge.cjs. Pure function - the
   * caller gathers command outputs and untracked file entries.
   */
  function buildChangesDigest(input = {}) {
    const status = input.status || {};
    const tracking = status.tracking || "";
    const truncated = [];
    const capSection = (name, patch) => {
      const capped = capDigestPatchText(patch);
      if (capped.truncated) truncated.push(name);
      return capped.text;
    };
    const untracked = (Array.isArray(input.untracked) ? input.untracked : []).map((entry) => {
      if (entry?.truncated) truncated.push(`untracked:${entry.path}`);
      return entry;
    });
    capUntrackedDigestEntries(untracked).forEach((marker) => {
      if (!truncated.includes(marker)) truncated.push(marker);
    });
    const digest = {
      branch: status.branch || "",
      tracking,
      ahead: Number(status.ahead || 0),
      behind: Number(status.behind || 0),
      clean: !(status.files || []).length,
      commitScope: (status.staged || []).length ? "staged" : "all",
      unpushedCommits: parseBranchActivityOutput(input.unpushedLog || "").map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        author: entry.author,
        subject: entry.subject
      })),
      unpushedStat: String(input.unpushedStat || ""),
      unpushedPatch: capSection("unpushedPatch", input.unpushedPatch || ""),
      stagedStat: String(input.stagedStat || ""),
      stagedPatch: capSection("stagedPatch", input.stagedPatch || ""),
      unstagedStat: String(input.unstagedStat || ""),
      unstagedPatch: capSection("unstagedPatch", input.unstagedPatch || ""),
      untracked,
      truncated
    };
    return enforceDigestTotalBudget(digest);
  }

  function getCommandResultText(result) {
    return [result?.stdOut || result?.stdout || "", result?.stdErr || result?.stderr || "", result?.output || ""]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function getCommandExitCode(result) {
    const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
    return Number.isFinite(exitCode) ? exitCode : 0;
  }

  function assertGitAction(action) {
    if (!GIT_ACTIONS.has(action)) throw new Error("Git action is not allowed.");
  }

  function buildDirectGitCommand(folderPath, action, options = {}) {
    assertGitAction(action);
    const git = `git -C ${quoteCommandArg(folderPath)}`;
    const files = normalizeFiles(options.files);
    const quotedFiles = files.map(quoteCommandArg);
    if (action === "status") return `${git} status --porcelain=v1 --branch`;
    if (action === "fetch") return `${git} fetch`;
    if (action === "pull") return `${git} pull`;
    if (action === "push") return `${git} push`;
    if (action === "stage") return `${git} add -- ${quotedFiles.join(" ")}`;
    if (action === "unstage") return `${git} reset -- ${quotedFiles.join(" ")}`;
    if (action === "commit") return `${git} commit -m ${quoteCommandArg(options.message || "")}`;
    if (action === "compareConflictFile") return `${git} show ${quoteCommandArg(`:3:${normalizePath(options.filePath)}`)}`;
    if (action === "compareStashFile") return `${git} show ${quoteCommandArg(`${normalizeStashRef(options.stashRef)}:${normalizePath(options.filePath)}`)}`;
    if (action === "branchList") return `${git} fetch --prune`;
    if (action === "switchBranch") {
      const remoteBranch = normalizePath(options.remoteBranch || "");
      if (remoteBranch) return `${git} switch --track ${quoteCommandArg(normalizeRemoteBranchName(remoteBranch))}`;
      return `${git} switch ${quoteCommandArg(normalizeBranchName(options.branch || ""))}`;
    }
    if (action === "branchCreate") return `${git} switch -c ${quoteCommandArg(normalizeBranchName(options.branch || ""))}`;
    if (action === "branchRename") return `${git} branch -m ${quoteCommandArg(normalizeBranchName(options.branch || options.oldBranch || ""))} ${quoteCommandArg(normalizeBranchName(options.newBranch || ""))}`;
    if (action === "branchPush") return `${git} push -u origin ${quoteCommandArg(normalizeBranchName(options.branch || ""))}`;
    if (action === "branchDeleteLocal") return `${git} branch -d ${quoteCommandArg(normalizeBranchName(options.branch || ""))}`;
    if (action === "branchDeleteRemote") {
      const remoteBranch = splitRemoteBranchName(options.remoteBranch || options.branch || "");
      return `${git} push ${quoteCommandArg(remoteBranch.remote)} --delete ${quoteCommandArg(remoteBranch.branch)}`;
    }
    if (action === "branchActivity") {
      const limit = normalizeBranchActivityLimit(options.activityLimit);
      const skip = normalizeBranchActivitySkip(options.activitySkip);
      return `${git} log --skip=${skip} -n ${limit + 1} --date=relative --pretty=format:${quoteCommandArg("%h%x1f%ad%x1f%an%x1f%s")} ${quoteCommandArg(normalizeBranchName(options.ref || options.branch || options.remoteBranch || ""))}`;
    }
    if (action === "tagCreate") return `${git} tag ${quoteCommandArg(normalizeTagName(options.tag || ""))}`;
    if (action === "tagDelete") return `${git} tag -d ${quoteCommandArg(normalizeTagName(options.tag || ""))}`;
    if (action === "discardChanges") return `${git} restore --worktree -- ${quotedFiles.join(" ")}`;
    if (action === "stashList") return `${git} stash list`;
    if (action === "stashCreate") {
      const message = String(options.message || "").trim();
      const messageArgs = message ? ` -m ${quoteCommandArg(message)}` : "";
      return `${git} stash push --include-untracked --keep-index${messageArgs} -- ${quotedFiles.join(" ")}`;
    }
    if (action === "stashPop") return `${git} stash pop ${quoteCommandArg(normalizeStashRef(options.stashRef))}`;
    if (action === "stashDrop") return sortStashRefsForDrop(options.stashRefs).map((ref) => `${git} stash drop ${quoteCommandArg(ref)}`).join(" && ");
    if (action === "resetToRemote") {
      const branch = normalizeBranchName(options.branch || "main");
      return `${git} switch -f ${quoteCommandArg(branch)} && ${git} fetch origin && ${git} reset --hard ${quoteCommandArg(`origin/${branch}`)} && ${git} clean -fd`;
    }
    throw new Error("Git action is not allowed.");
  }

  function getFileName(filePath) {
    return normalizePath(filePath).split("/").pop() || "file";
  }

  function getComparablePath(filePath) {
    return normalizePath(filePath).toLowerCase();
  }

  function joinWorkspacePath(folderPath, filePath) {
    const folder = normalizePath(folderPath).replace(/\/+$/, "");
    const child = normalizePath(filePath).replace(/^\/+/, "");
    return folder ? `${folder}/${child}` : child;
  }

  function expandGitFilePath(filePath) {
    const normalized = normalizePath(filePath);
    const parts = normalized.split(/\s+->\s+/).map((part) => normalizePath(part).trim()).filter(Boolean);
    return parts.length ? parts : [normalized].filter(Boolean);
  }

  function getGitFilePathPair(filePath, originalPath = "") {
    const expandedPaths = expandGitFilePath(filePath);
    const path = normalizePath(expandedPaths[expandedPaths.length - 1] || filePath);
    return {
      path,
      originalPath: normalizePath(originalPath) || normalizePath(expandedPaths.length > 1 ? expandedPaths[0] : "")
    };
  }

  function resolveWorkspaceGitFilePaths(folderPath, filePaths) {
    const seen = new Set();
    const paths = [];
    (Array.isArray(filePaths) ? filePaths : []).forEach((filePath) => {
      expandGitFilePath(filePath).forEach((expandedPath) => {
        const fullPath = joinWorkspacePath(folderPath, expandedPath);
        const key = getComparablePath(fullPath);
        if (!key || seen.has(key)) return;
        seen.add(key);
        paths.push(fullPath);
      });
    });
    return paths;
  }

  function getTabSourcePath(tab) {
    return tab?.sourceFilePath || tab?.openedSource?.path || tab?.largeFileSource?.path || "";
  }

  function getCompareScope(value) {
    if (value === "staged" || value === "unstaged") return value;
    throw new Error("Git compare scope is invalid.");
  }

  function parseLocalBranchListOutput(output) {
    return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, tracking = "", head = "", updatedAt = "", commitHash = ""] = line.split("|");
      return {
        name: normalizeBranchName(name || ""),
        tracking: normalizePath(tracking || ""),
        current: head === "*",
        updatedAt,
        commitHash
      };
    });
  }

  function parseRemoteBranchListOutput(output) {
    const lines = String(output || "").split(/\r?\n/).map((line) => normalizePath(line).trim()).filter(Boolean);
    debugWorkspaceGitBranch("remote branch list lines", lines);
    return lines.map((line) => {
      const [name = "", updatedAt = "", commitHash = ""] = line.split("|");
      return { name: normalizePath(name).trim(), updatedAt, commitHash };
    }).filter((branch) => branch.name.includes("/") && !/\/HEAD(?:\s*->.*)?$/.test(branch.name)).map((branch) => ({
      name: normalizeRemoteBranchName(branch.name),
      localName: getLocalBranchNameFromRemote(branch.name),
      updatedAt: branch.updatedAt,
      commitHash: branch.commitHash
    }));
  }

  function parseBranchActivityOutput(output) {
    return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const [hash = "", date = "", author = "", subject = ""] = line.split("\x1f");
      return { hash, date, author, subject };
    });
  }

  function parseTagListOutput(output) {
    return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const [name = "", updatedAt = "", commitHash = ""] = line.split("|");
      return {
        name: normalizeTagName(name || ""),
        updatedAt,
        commitHash
      };
    });
  }

  function normalizeBranchActivityLimit(value) {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 ? Math.min(count, 100) : 20;
  }

  function normalizeBranchActivitySkip(value) {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  function createBranchList(localBranches, remoteBranches, currentBranch = "") {
    const localByName = new Map((Array.isArray(localBranches) ? localBranches : []).map((branch) => [branch.name, branch]));
    const remoteItems = (Array.isArray(remoteBranches) ? remoteBranches : []).map((remote) => {
      const local = localByName.get(remote.localName);
      return {
        type: "remote",
        name: remote.name,
        localName: remote.localName,
        hasLocal: !!local,
        current: currentBranch === remote.localName,
        tracking: local?.tracking || remote.name,
        updatedAt: local?.updatedAt || remote.updatedAt || "",
        commitHash: local?.commitHash || remote.commitHash || ""
      };
    });
    const remoteLocalNames = new Set(remoteItems.map((branch) => branch.localName));
    const localOnly = (Array.isArray(localBranches) ? localBranches : []).filter((branch) => !remoteLocalNames.has(branch.name)).map((branch) => ({
      type: "local",
      name: branch.name,
      current: !!branch.current,
      tracking: branch.tracking || "",
      updatedAt: branch.updatedAt || "",
      commitHash: branch.commitHash || ""
    }));
    return { remote: remoteItems, localOnly };
  }

  function getBranchListCount(branches) {
    return (Array.isArray(branches?.remote) ? branches.remote.length : 0) + (Array.isArray(branches?.localOnly) ? branches.localOnly.length : 0);
  }

  function getBranchDisplayName(branch) {
    if (!branch) return "";
    return branch.type === "remote" ? (branch.localName || getLocalBranchNameFromRemote(branch.name)) : branch.name;
  }

  function getBranchSourceLabel(branch) {
    if (!branch) return "";
    if (branch.type === "remote") return branch.hasLocal ? "Local + remote" : "Remote only";
    return branch.tracking ? "Local + remote" : "Local only";
  }

  function formatBranchUpdatedAt(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function getBranchActionData(branch) {
    const label = getBranchDisplayName(branch);
    const remoteBranch = branch?.type === "remote" && !branch.hasLocal ? branch.name : "";
    const localBranch = branch?.type === "remote" && branch.hasLocal ? branch.localName : (branch?.type === "local" ? branch.name : "");
    const actionRemoteBranch = branch?.type === "remote" ? branch.name : "";
    const activityRef = localBranch || actionRemoteBranch || label;
    return { label, remoteBranch, localBranch, actionRemoteBranch, activityRef };
  }

  function getBranchCreateSuggestion(searchText, branches, currentBranch = "") {
    const rawBranch = String(searchText || "").trim();
    if (!rawBranch) return null;
    let branch = "";
    try {
      branch = normalizeBranchName(rawBranch);
    } catch (_error) {
      return null;
    }
    const normalizedBranch = branch.toLowerCase();
    const exists = [...(branches?.remote || []), ...(branches?.localOnly || [])].some((item) => {
      return [item?.name, item?.localName, getBranchDisplayName(item)].filter(Boolean).some((name) => String(name).toLowerCase() === normalizedBranch);
    });
    if (exists) return null;
    return {
      branch,
      fromBranch: currentBranch || "current branch"
    };
  }

  function getTagCreateSuggestion(searchText, tags, currentBranch = "") {
    const rawTag = String(searchText || "").trim();
    if (!rawTag) return null;
    let tag = "";
    try {
      tag = normalizeTagName(rawTag);
    } catch (_error) {
      return null;
    }
    const normalizedTag = tag.toLowerCase();
    const exists = (Array.isArray(tags) ? tags : []).some((item) => String(item?.name || "").toLowerCase() === normalizedTag);
    if (exists) return null;
    return {
      tag,
      fromBranch: currentBranch || "current branch"
    };
  }

  function getBranchSwitchMode(branches) {
    const branchItems = [...(branches?.remote || []), ...(branches?.localOnly || [])];
    const hasLongName = branchItems.some((branch) => getBranchDisplayName(branch).length > 34 || String(branch?.name || "").length > 42);
    return getBranchListCount(branches) > FULL_BRANCH_SWITCHER_THRESHOLD || hasLongName ? "full" : "compact";
  }

  function isGitStatusDirty(status) {
    return !!(Array.isArray(status?.files) && status.files.length);
  }

  function isTabUnsaved(tab, normalizeContent) {
    if (!tab || tab.type === "graph") return false;
    const normalize = typeof normalizeContent === "function" ? normalizeContent : (value) => String(value || "");
    return normalize(tab.content || "") !== normalize(tab.savedContent || "");
  }

  function getBranchSwitchBlockedMessage() {
    return "Cannot switch branches because there are unsaved or uncommitted changes. Save, stash, commit, or discard them first.";
  }

  function createGitCompareDescriptor(options = {}) {
    const filePath = normalizePath(options.filePath);
    const scope = getCompareScope(options.scope);
    const name = getFileName(filePath);
    const isStaged = scope === "staged";
    const workingTreePath = normalizePath(options.workingTreePath || "");
    return {
      title: `${isStaged ? "Staged changes" : "Unstaged changes"}: ${filePath}`,
      left: {
        name: `${isStaged ? "HEAD" : "Index"}: ${name}`,
        content: options.leftContent || ""
      },
      right: {
        name: `${isStaged ? "Staged" : "Working tree"}: ${name}`,
        path: isStaged ? undefined : workingTreePath,
        content: options.rightContent || ""
      },
      viewMode: "side-by-side"
    };
  }

  function createGitConflictCompareDescriptor(options = {}) {
    const filePath = normalizePath(options.filePath);
    const name = getFileName(filePath);
    const workingTreePath = normalizePath(options.workingTreePath || "");
    return {
      title: `Resolve conflict: ${filePath}`,
      left: {
        name: `Stashed: ${name}`,
        content: options.leftContent || ""
      },
      right: {
        name: `Working tree: ${name}`,
        path: workingTreePath,
        content: options.rightContent || ""
      },
      gitConflict: {
        filePath
      },
      viewMode: "side-by-side"
    };
  }

  function createGitStashCompareDescriptor(options = {}) {
    const filePath = normalizePath(options.filePath);
    const name = getFileName(filePath);
    const workingTreePath = normalizePath(options.workingTreePath || "");
    const stashRef = normalizeStashRef(options.stashRef || "");
    return {
      title: `Stashed file: ${filePath}`,
      left: {
        name: `Stashed: ${name}`,
        content: options.leftContent || ""
      },
      right: {
        name: `Working tree: ${name}`,
        path: workingTreePath,
        content: options.rightContent || ""
      },
      gitStash: {
        stashRef,
        filePath,
        originalPath: normalizePath(options.originalPath || "")
      },
      viewMode: "side-by-side"
    };
  }

  function renderGitFileRow(file, scope) {
    const filePath = file.path || "";
    const originalPath = file.originalPath || "";
    const isConflict = isGitConflictFile(file);
    return `
        <div class="workspace-git-file${isConflict ? " is-conflict" : ""}">
          <input class="workspace-git-file-check" type="checkbox" value="${escapeHtml(filePath)}">
          <span class="workspace-git-file-state">${escapeHtml(`${file.index || " "}${file.workingDir || " "}`)}</span>
          <button class="workspace-git-file-path workspace-git-file-compare" type="button" data-scope="${escapeHtml(scope)}" data-file-path="${escapeHtml(filePath)}" data-original-path="${escapeHtml(originalPath)}" data-conflict="${isConflict ? "true" : "false"}" title="${isConflict ? "Resolve conflict in" : "Compare"} ${escapeHtml(filePath)}">${escapeHtml(filePath)}</button>
        </div>
      `;
  }

  function renderGitStashRow(stash) {
    const ref = normalizeStashRef(stash?.ref || "");
    const files = Array.isArray(stash?.files) ? stash.files : [];
    const fileList = files.length
      ? files.map((file) => `
              <div class="workspace-git-stash-file"><span class="workspace-git-file-state">${escapeHtml(file.status || "")}</span> ${renderGitStashFileButton(ref, file)}</div>
            `).join("")
      : `<div class="workspace-git-stash-file">No file list available.</div>`;
    return `
        <div class="workspace-git-stash">
          <input class="workspace-git-stash-check" type="checkbox" value="${escapeHtml(ref)}">
          <div class="workspace-git-stash-body">
            <div class="workspace-git-stash-title"><span class="workspace-git-stash-ref">${escapeHtml(ref)}</span> ${escapeHtml(stash?.message || ref)}</div>
            <div class="workspace-git-stash-files">${fileList}</div>
          </div>
        </div>
      `;
  }

  function renderGitStashFileButton(stashRef, file) {
    const pair = getGitFilePathPair(file?.path || "", file?.originalPath || "");
    return `<button class="workspace-git-stash-file-compare workspace-git-file-path" type="button" data-stash-ref="${escapeHtml(stashRef)}" data-file-path="${escapeHtml(pair.path)}" data-original-path="${escapeHtml(pair.originalPath)}" title="Compare stashed ${escapeHtml(pair.path)}">${escapeHtml(file?.path || pair.path)}</button>`;
  }

  function getSelectedFilePaths(container) {
    return Array.from(container?.querySelectorAll(".workspace-git-file-check:checked") || [])
      .map((input) => input.value)
      .filter(Boolean);
  }

  function getSelectedStashRefs(container) {
    return Array.from(container?.querySelectorAll(".workspace-git-stash-check:checked") || [])
      .map((input) => input.value)
      .filter(Boolean);
  }

  function isCommitReady(status, message) {
    return !!(status?.staged?.length && String(message || "").trim());
  }

  function isPushReady(status) {
    return !!(status?.tracking && Number(status?.ahead || 0) > 0);
  }

  function isDiscardReady(files) {
    return normalizeFiles(files).length > 0;
  }

  function isPopReady(stashRefs) {
    return normalizeStashRefs(stashRefs).length === 1;
  }

  function isDropReady(stashRefs) {
    return normalizeStashRefs(stashRefs).length > 0;
  }

  function shouldSuppressFolderWatcherForGitAction(action) {
    return action === "stashCreate" || action === "stashPop" || action === "discardChanges" || action === "switchBranch";
  }

  function isStashPopConflictError(error) {
    return /conflict|needs merge|unmerged|could not restore untracked files|after resolving the conflicts/i.test(error?.message || "");
  }

  function isStashPopLocalOverwriteError(error) {
    return /would be overwritten by merge|Please commit your changes or stash them|Your local changes.*would be overwritten|Aborting/i.test(error?.message || "");
  }

  function getGitConflictFiles(status) {
    return (Array.isArray(status?.files) ? status.files : []).filter(isGitConflictFile);
  }

  function getStashPopConflictMessage(conflictCount) {
    const count = Number(conflictCount || 0);
    if (count > 0) {
      return `Stash pop created ${count} conflict${count === 1 ? "" : "s"}. Resolve conflicted files before continuing.`;
    }
    return "Stash pop created conflicts. Resolve conflicted files before continuing.";
  }

  function getStashPopBlockedMessage(fileCount) {
    const count = Number(fileCount || 0);
    if (count > 0) {
      return `Cannot pop this stash because ${count} file${count === 1 ? "" : "s"} already have local changes. Commit, stash, or discard those files first.`;
    }
    return "Cannot pop this stash because local changes would be overwritten. Commit, stash, or discard those files first.";
  }

  function formatGitStatusMessage(message, details) {
    const sourceMessage = String(message || "").trim();
    const fullDetails = String(details ?? sourceMessage).trim();
    let displayMessage = sourceMessage || fullDetails;
    if (displayMessage.length > 140 || /\r?\n/.test(displayMessage)) {
      displayMessage = displayMessage.split(/\r?\n/)[0].trim();
      if (displayMessage.length > 140) displayMessage = `${displayMessage.slice(0, 137)}...`;
    }
    const detailText = fullDetails && fullDetails !== displayMessage ? fullDetails : "";
    return { message: displayMessage, details: detailText, hasDetails: !!detailText };
  }

  function getBranchDebugNames(branches, tags = []) {
    return {
      remote: (branches?.remote || []).map((branch) => branch.name),
      localOnly: (branches?.localOnly || []).map((branch) => branch.name),
      tags: (Array.isArray(tags) ? tags : []).map((tag) => tag.name)
    };
  }

  function createWorkspaceGitRunner(deps) {
    function logGitBranchDebug(message, details) {
      if (typeof deps.debugLog === "function") {
        const result = deps.debugLog("debug", `[workspace-git] ${message}`, details);
        result?.catch?.(() => {});
      }
      debugWorkspaceGitBranch(message, details);
    }

    async function runBridge(folderPath, action, options = {}) {
      const request = {
        action,
        folderPath,
        files: normalizeFiles(options.files),
        filePath: normalizePath(options.filePath),
        originalPath: normalizePath(options.originalPath),
        scope: options.scope || "",
        branch: options.branch || "",
        newBranch: options.newBranch || "",
        tag: options.tag || "",
        ref: options.ref || "",
        activityLimit: normalizeBranchActivityLimit(options.activityLimit),
        activitySkip: normalizeBranchActivitySkip(options.activitySkip),
        remoteBranch: options.remoteBranch || "",
        stashRef: options.stashRef || "",
        stashRefs: normalizeStashRefs(options.stashRefs || []),
        message: options.message || ""
      };
      const command = `node ${quoteCommandArg("resources/bridges/git-bridge/git-bridge.cjs")} ${encodeJsonRequest(request)}`;
      if (action === "branchList" || action === "switchBranch" || action === "branchCreate" || action === "branchRename" || action === "branchPush" || action === "branchDeleteLocal" || action === "branchDeleteRemote" || action === "branchActivity" || action === "tagCreate" || action === "tagDelete") {
        logGitBranchDebug("bridge command", {
          action,
          folderPath,
          command,
          branch: request.branch,
          newBranch: request.newBranch,
          tag: request.tag,
          ref: request.ref,
          activityLimit: request.activityLimit,
          activitySkip: request.activitySkip,
          remoteBranch: request.remoteBranch || ""
        });
      }
      const result = await deps.Neutralino.os.execCommand(command);
      const text = getCommandResultText(result);
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch (_error) {
        throw new Error(text || "Git bridge failed.");
      }
      if (!parsed?.ok) throw new Error(parsed?.error || text || "Git bridge failed.");
      if (action === "branchList") {
        logGitBranchDebug("bridge branch names received", getBranchDebugNames(parsed.branches, parsed.tags));
      }
      return parsed;
    }

    function getDirectCommandStdOut(result) {
      return String(result?.stdOut ?? result?.stdout ?? result?.output ?? "");
    }

    function getDirectGitPathspecOption(pathspecPath) {
      return `--pathspec-from-file=${quoteCommandArg(pathspecPath)} --pathspec-file-nul`;
    }

    async function writeDirectGitPathspecFile(files) {
      if (!deps.Neutralino?.filesystem?.writeFile || !deps.Neutralino?.os?.getPath) throw new Error("Git selected-file actions require desktop file access.");
      const tempFolder = normalizePath(await deps.Neutralino.os.getPath("temp")).replace(/\/+$/, "");
      const randomPart = Math.random().toString(36).slice(2);
      const pathspecPath = `${tempFolder}/md-editor-git-${Date.now()}-${randomPart}.pathspec`;
      await deps.Neutralino.filesystem.writeFile(pathspecPath, `${files.join(NULL_CHARACTER)}${NULL_CHARACTER}`);
      return pathspecPath;
    }

    async function runDirectPathspecAction(folderPath, action, options = {}) {
      const files = normalizeFiles(options.files);
      if (!files.length) throw new Error("Select files before running this Git action.");
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      const pathspecPath = await writeDirectGitPathspecFile(files);
      try {
        const pathspecOption = getDirectGitPathspecOption(pathspecPath);
        const message = String(options.message || "").trim();
        const messageArgs = message ? ` -m ${quoteCommandArg(message)}` : "";
        let command = "";
        if (action === "stage") command = `${git} add ${pathspecOption}`;
        else if (action === "unstage") command = `${git} reset ${pathspecOption}`;
        else if (action === "stashCreate") command = `${git} stash push --include-untracked --keep-index${messageArgs} ${pathspecOption}`;
        else throw new Error("Git action is not allowed.");
        const result = await deps.Neutralino.os.execCommand(command);
        const text = getCommandResultText(result);
        const exitCode = getCommandExitCode(result);
        if (exitCode !== 0) throw new Error(text || `Git ${action} failed with exit code ${exitCode}.`);
        if (action === "stashCreate") {
          const status = await runDirect(folderPath, "status");
          const stashList = await runDirectStashList(folderPath);
          return { ...status, action, stashes: stashList.stashes };
        }
        return runDirect(folderPath, "status");
      } finally {
        await deps.Neutralino?.filesystem?.remove?.(pathspecPath).catch?.(() => {});
      }
    }

    async function readDirectGitSnapshot(folderPath, revision, filePath) {
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      const result = await deps.Neutralino.os.execCommand(`${git} show ${quoteCommandArg(`${revision}:${filePath}`)}`);
      if (getCommandExitCode(result) !== 0) return "";
      return getDirectCommandStdOut(result);
    }

    async function readDirectWorkingTreeSnapshot(folderPath, filePath) {
      if (!deps.Neutralino?.filesystem?.readFile) throw new Error("Git comparison requires desktop file access.");
      const root = String(folderPath || "").replace(/[\\/]+$/, "");
      try {
        return await deps.Neutralino.filesystem.readFile(`${root}/${filePath}`);
      } catch (_error) {
        return "";
      }
    }

    function assertTextSnapshot(content, name) {
      if (/\u0000/.test(String(content || ""))) {
        throw new Error(`"${name || "This file"}" appears to be a binary file and cannot be compared as text.`);
      }
    }

    async function runDirectCompareFile(folderPath, options = {}) {
      const scope = getCompareScope(options.scope);
      const filePath = normalizePath(options.filePath);
      const originalPath = normalizePath(options.originalPath) || filePath;
      if (!filePath) throw new Error("Git file path is required.");
      const leftContent = scope === "staged"
        ? await readDirectGitSnapshot(folderPath, "HEAD", originalPath)
        : await readDirectGitSnapshot(folderPath, "", originalPath);
      const rightContent = scope === "staged"
        ? await readDirectGitSnapshot(folderPath, "", filePath)
        : await readDirectWorkingTreeSnapshot(folderPath, filePath);
      assertTextSnapshot(leftContent, filePath);
      assertTextSnapshot(rightContent, filePath);
      return {
        action: "compareFile",
        isRepo: true,
        compare: createGitCompareDescriptor({ filePath, scope, leftContent, rightContent, workingTreePath: joinWorkspacePath(folderPath, filePath) })
      };
    }

    async function runDirectCompareConflictFile(folderPath, options = {}) {
      const filePath = normalizePath(options.filePath);
      if (!filePath) throw new Error("Git file path is required.");
      const leftContent = await readDirectGitSnapshot(folderPath, ":3", filePath);
      const rightContent = await readDirectWorkingTreeSnapshot(folderPath, filePath);
      assertTextSnapshot(leftContent, filePath);
      assertTextSnapshot(rightContent, filePath);
      return {
        action: "compareConflictFile",
        isRepo: true,
        compare: createGitConflictCompareDescriptor({ filePath, leftContent, rightContent, workingTreePath: joinWorkspacePath(folderPath, filePath) })
      };
    }

    async function runDirectCompareStashFile(folderPath, options = {}) {
      const stashRef = normalizeStashRef(options.stashRef || "");
      const filePath = normalizePath(options.filePath);
      const originalPath = normalizePath(options.originalPath);
      if (!filePath) throw new Error("Git file path is required.");
      const leftContent = await readDirectGitSnapshot(folderPath, stashRef, filePath);
      const rightContent = await readDirectWorkingTreeSnapshot(folderPath, filePath);
      assertTextSnapshot(leftContent, filePath);
      assertTextSnapshot(rightContent, filePath);
      return {
        action: "compareStashFile",
        isRepo: true,
        compare: createGitStashCompareDescriptor({ stashRef, filePath, originalPath, leftContent, rightContent, workingTreePath: joinWorkspacePath(folderPath, filePath) })
      };
    }

    async function runDirectFetchBranches(folderPath) {
      const pruneCommand = buildDirectGitCommand(folderPath, "branchList");
      logGitBranchDebug("direct command", { action: "branchList", command: pruneCommand });
      const pruneResult = await deps.Neutralino.os.execCommand(pruneCommand);
      if (getCommandExitCode(pruneResult) === 0) return;
      const fetchCommand = buildDirectGitCommand(folderPath, "fetch");
      logGitBranchDebug("direct command fallback", { action: "fetch", command: fetchCommand, pruneOutput: getCommandResultText(pruneResult) });
      const fetchResult = await deps.Neutralino.os.execCommand(fetchCommand);
      if (getCommandExitCode(fetchResult) !== 0) throw new Error(getCommandResultText(fetchResult) || getCommandResultText(pruneResult) || "Git fetch failed.");
    }

    async function runDirectBranchList(folderPath) {
      await runDirectFetchBranches(folderPath);
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      const localCommand = `${git} branch --format=${quoteCommandArg("%(refname:short)|%(upstream:short)|%(HEAD)|%(committerdate:iso8601)|%(objectname:short)")}`;
      const remoteCommand = `${git} branch -r --format=${quoteCommandArg("%(refname:short)|%(committerdate:iso8601)|%(objectname:short)")}`;
      const tagCommand = `${git} tag --sort=-creatordate --format=${quoteCommandArg("%(refname:short)|%(creatordate:iso8601)|%(objectname:short)")}`;
      logGitBranchDebug("direct command", { action: "localBranchList", command: localCommand });
      const localResult = await deps.Neutralino.os.execCommand(localCommand);
      logGitBranchDebug("direct command", { action: "remoteBranchList", command: remoteCommand });
      const remoteResult = await deps.Neutralino.os.execCommand(remoteCommand);
      logGitBranchDebug("direct command", { action: "tagList", command: tagCommand });
      const tagResult = await deps.Neutralino.os.execCommand(tagCommand);
      if (getCommandExitCode(localResult) !== 0) throw new Error(getCommandResultText(localResult) || "Git branch list failed.");
      if (getCommandExitCode(remoteResult) !== 0) throw new Error(getCommandResultText(remoteResult) || "Git remote branch list failed.");
      if (getCommandExitCode(tagResult) !== 0) throw new Error(getCommandResultText(tagResult) || "Git tag list failed.");
      const localOutput = getCommandResultText(localResult);
      const remoteOutput = getCommandResultText(remoteResult);
      const tagOutput = getCommandResultText(tagResult);
      logGitBranchDebug("branch names received", {
        localLines: localOutput.split(/\r?\n/).filter(Boolean),
        remoteLines: remoteOutput.split(/\r?\n/).filter(Boolean),
        tagLines: tagOutput.split(/\r?\n/).filter(Boolean)
      });
      const localBranches = parseLocalBranchListOutput(localOutput);
      const remoteBranches = parseRemoteBranchListOutput(remoteOutput);
      const tags = parseTagListOutput(tagOutput);
      const currentBranch = localBranches.find((branch) => branch.current)?.name || "";
      const branches = createBranchList(localBranches, remoteBranches, currentBranch);
      logGitBranchDebug("parsed branch names", getBranchDebugNames(branches, tags));
      return { action: "branchList", isRepo: true, branches, tags };
    }

    async function runDirectSwitchBranch(folderPath, options = {}) {
      const command = buildDirectGitCommand(folderPath, "switchBranch", options);
      logGitBranchDebug("direct command", { action: "switchBranch", command, branch: options.branch || "", remoteBranch: options.remoteBranch || "" });
      const result = await deps.Neutralino.os.execCommand(command);
      const text = getCommandResultText(result);
      if (getCommandExitCode(result) !== 0) throw new Error(text || "Git branch switch failed.");
      const status = await runDirect(folderPath, "status");
      return { ...status, action: "switchBranch" };
    }

    async function runDirectCreateBranch(folderPath, options = {}) {
      const command = buildDirectGitCommand(folderPath, "branchCreate", options);
      logGitBranchDebug("direct command", { action: "branchCreate", command, branch: options.branch || "" });
      const result = await deps.Neutralino.os.execCommand(command);
      const text = getCommandResultText(result);
      if (getCommandExitCode(result) !== 0) throw new Error(text || "Git branch create failed.");
      const status = await runDirect(folderPath, "status");
      return { ...status, action: "branchCreate" };
    }

    async function runDirectBranchMutation(folderPath, action, options = {}) {
      const command = buildDirectGitCommand(folderPath, action, options);
      logGitBranchDebug("direct command", { action, command, branch: options.branch || "", remoteBranch: options.remoteBranch || "", newBranch: options.newBranch || "", tag: options.tag || "" });
      const result = await deps.Neutralino.os.execCommand(command);
      const text = getCommandResultText(result);
      if (getCommandExitCode(result) !== 0) throw new Error(text || "Git action failed.");
      const status = await runDirect(folderPath, "status");
      return { ...status, action };
    }

    async function runDirectBranchActivity(folderPath, options = {}) {
      const command = buildDirectGitCommand(folderPath, "branchActivity", options);
      logGitBranchDebug("direct command", { action: "branchActivity", command, ref: options.ref || options.branch || options.remoteBranch || "" });
      const result = await deps.Neutralino.os.execCommand(command);
      const text = getCommandResultText(result);
      if (getCommandExitCode(result) !== 0) throw new Error(text || "Unable to load branch activity.");
      const limit = normalizeBranchActivityLimit(options.activityLimit);
      const entries = parseBranchActivityOutput(text);
      return { action: "branchActivity", isRepo: true, activity: entries.slice(0, limit), hasMore: entries.length > limit };
    }

    async function runDirectStashList(folderPath) {
      const result = await deps.Neutralino.os.execCommand(buildDirectGitCommand(folderPath, "stashList"));
      const text = getCommandResultText(result);
      const exitCode = getCommandExitCode(result);
      if (exitCode !== 0) throw new Error(text || `Git stash list failed with exit code ${exitCode}.`);
      const stashes = parseStashListOutput(text);
      for (const stash of stashes) {
        const git = `git -C ${quoteCommandArg(folderPath)}`;
        const filesResult = await deps.Neutralino.os.execCommand(`${git} stash show --name-status ${quoteCommandArg(stash.ref)}`);
        if (getCommandExitCode(filesResult) === 0) stash.files = parseStashFilesOutput(getCommandResultText(filesResult));
      }
      return { action: "stashList", isRepo: true, stashes };
    }

    async function runDirectDiscardChanges(folderPath, options = {}) {
      const files = normalizeFiles(options.files);
      if (!files.length) throw new Error("Select files to discard.");
      const status = await runDirect(folderPath, "status");
      const groups = getDiscardFileGroups(status?.status, files);
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      if (groups.conflicted.length) {
        const conflictResult = await deps.Neutralino.os.execCommand(`${git} restore --source=HEAD --staged --worktree -- ${groups.conflicted.map(quoteCommandArg).join(" ")}`);
        if (getCommandExitCode(conflictResult) !== 0) throw new Error(getCommandResultText(conflictResult) || "Git discard failed.");
      }
      if (groups.tracked.length) {
        const restoreResult = await deps.Neutralino.os.execCommand(buildDirectGitCommand(folderPath, "discardChanges", { files: groups.tracked }));
        if (getCommandExitCode(restoreResult) !== 0) throw new Error(getCommandResultText(restoreResult) || "Git discard failed.");
      }
      if (groups.untracked.length) {
        const cleanResult = await deps.Neutralino.os.execCommand(`${git} clean -fd -- ${groups.untracked.map(quoteCommandArg).join(" ")}`);
        if (getCommandExitCode(cleanResult) !== 0) throw new Error(getCommandResultText(cleanResult) || "Git clean failed.");
      }
      const result = await runDirect(folderPath, "status");
      return { ...result, action: "discardChanges", discardedTracked: groups.tracked, discardedUntracked: groups.untracked, discardedConflicted: groups.conflicted };
    }

    async function runDirectStashDrop(folderPath, options = {}) {
      const stashRefs = sortStashRefsForDrop(options.stashRefs || []);
      if (!stashRefs.length) throw new Error("Select stashes to drop.");
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      for (const stashRef of stashRefs) {
        const result = await deps.Neutralino.os.execCommand(`${git} stash drop ${quoteCommandArg(stashRef)}`);
        const text = getCommandResultText(result);
        const exitCode = getCommandExitCode(result);
        if (exitCode !== 0) throw new Error(text || `Git stash drop failed with exit code ${exitCode}.`);
      }
      const status = await runDirect(folderPath, "status");
      const stashList = await runDirectStashList(folderPath);
      return { ...status, action: "stashDrop", stashes: stashList.stashes };
    }

    /**
     * Read one untracked file for the digest, capped to
     * DIGEST_LIMITS.untrackedFileBytes, with a binary marker for files that
     * cannot be summarized as text.
     */
    async function readUntrackedDigestEntry(folderPath, filePath) {
      let content = "";
      try {
        content = await readDirectWorkingTreeSnapshot(folderPath, filePath);
      } catch (_error) {
        content = "";
      }
      if (content.slice(0, 4096).includes(NULL_CHARACTER)) return { path: filePath, content: "", binary: true, truncated: false };
      const truncated = content.length > DIGEST_LIMITS.untrackedFileBytes;
      return {
        path: filePath,
        content: truncated ? `${content.slice(0, DIGEST_LIMITS.untrackedFileBytes)}\n...[file truncated]` : content,
        binary: false,
        truncated
      };
    }

    /**
     * Direct-CLI fallback for the changesDigest action: gathers status,
     * unpushed commit log, staged/unstaged diffs, and untracked file
     * contents, then shapes them with buildChangesDigest. Read-only.
     */
    async function runDirectChangesDigest(folderPath) {
      const statusResult = await runDirect(folderPath, "status");
      const status = statusResult?.status || {};
      const git = `git -C ${quoteCommandArg(folderPath)}`;
      async function readGitOutputSafe(command) {
        const result = await deps.Neutralino.os.execCommand(command);
        return getCommandExitCode(result) === 0 ? getDirectCommandStdOut(result) : "";
      }
      const tracking = status.tracking || "";
      const logRange = tracking ? quoteCommandArg(`${tracking}..HEAD`) : "";
      const diffRange = tracking ? quoteCommandArg(`${tracking}...HEAD`) : "";
      const untrackedFiles = (status.files || []).filter((file) => file.index === "?" || file.workingDir === "?");
      const untracked = [];
      for (const file of untrackedFiles) {
        untracked.push(await readUntrackedDigestEntry(folderPath, normalizePath(file.path)));
      }
      return {
        action: "changesDigest",
        isRepo: statusResult?.isRepo !== false,
        digest: buildChangesDigest({
          status,
          unpushedLog: tracking ? await readGitOutputSafe(`${git} log ${logRange} --date=short --pretty=format:${quoteCommandArg("%h%x1f%ad%x1f%an%x1f%s")}`) : "",
          unpushedStat: tracking ? await readGitOutputSafe(`${git} diff --stat ${diffRange}`) : "",
          unpushedPatch: tracking ? await readGitOutputSafe(`${git} diff ${diffRange}`) : "",
          stagedStat: await readGitOutputSafe(`${git} diff --cached --stat`),
          stagedPatch: await readGitOutputSafe(`${git} diff --cached`),
          unstagedStat: await readGitOutputSafe(`${git} diff --stat`),
          unstagedPatch: await readGitOutputSafe(`${git} diff`),
          untracked
        })
      };
    }

    async function runDirect(folderPath, action, options = {}) {
      if (action === "stage" && !normalizeFiles(options.files).length) throw new Error("Select files to stage.");
      if (action === "unstage" && !normalizeFiles(options.files).length) throw new Error("Select files to unstage.");
      if (action === "discardChanges" && !normalizeFiles(options.files).length) throw new Error("Select files to discard.");
      if (action === "stashCreate" && !normalizeFiles(options.files).length) throw new Error("Select files to stash.");
      if (action === "stashPop" && !normalizeStashRef(options.stashRef)) throw new Error("Select a stash to pop.");
      if (action === "stashDrop" && !normalizeStashRefs(options.stashRefs).length) throw new Error("Select stashes to drop.");
      if (action === "tagCreate" && !normalizeTagName(options.tag || "")) throw new Error("Tag name is required.");
      if (action === "tagDelete" && !normalizeTagName(options.tag || "")) throw new Error("Tag name is required.");
      if (action === "commit" && !String(options.message || "").trim()) throw new Error("Commit message is required.");
      if (action === "stage" || action === "unstage" || action === "stashCreate") return runDirectPathspecAction(folderPath, action, options);
      if (action === "compareFile") return runDirectCompareFile(folderPath, options);
      if (action === "compareConflictFile") return runDirectCompareConflictFile(folderPath, options);
      if (action === "compareStashFile") return runDirectCompareStashFile(folderPath, options);
      if (action === "branchList") return runDirectBranchList(folderPath);
      if (action === "switchBranch") return runDirectSwitchBranch(folderPath, options);
      if (action === "branchCreate") return runDirectCreateBranch(folderPath, options);
      if (action === "branchRename" || action === "branchPush" || action === "branchDeleteLocal" || action === "branchDeleteRemote" || action === "tagCreate" || action === "tagDelete") return runDirectBranchMutation(folderPath, action, options);
      if (action === "branchActivity") return runDirectBranchActivity(folderPath, options);
      if (action === "stashList") return runDirectStashList(folderPath);
      if (action === "discardChanges") return runDirectDiscardChanges(folderPath, options);
      if (action === "stashDrop") return runDirectStashDrop(folderPath, options);
      if (action === "changesDigest") return runDirectChangesDigest(folderPath);
      const result = await deps.Neutralino.os.execCommand(buildDirectGitCommand(folderPath, action, options));
      const text = getCommandResultText(result);
      const exitCode = getCommandExitCode(result);
      if (exitCode !== 0) {
        if (action === "status" && /not a git repository/i.test(text)) return createStatusResult("", false);
        throw new Error(text || `Git ${action} failed with exit code ${exitCode}.`);
      }
      if (action === "status") return createStatusResult(text, true);
      if (action === "stashCreate" || action === "stashPop") {
        const status = await runDirect(folderPath, "status");
        const stashList = await runDirectStashList(folderPath);
        return { ...status, action, stashes: stashList.stashes };
      }
      return runDirect(folderPath, "status");
    }

    return async function runWorkspaceGitAction(folderPath, action, options = {}) {
      assertGitAction(action);
      if (!folderPath) throw new Error("Open a folder before using Git.");
      if (!deps.Neutralino?.os?.execCommand) throw new Error("Git integration is available in the desktop app.");
      try {
        return await runBridge(folderPath, action, options);
      } catch (error) {
        if (!/node|git bridge|cannot find module|not recognized|not found|command line is too long/i.test(error?.message || "")) throw error;
        return runDirect(folderPath, action, options);
      }
    };
  }

  function registerMarkdownViewerWorkspaceGit(app, deps = {}) {
    const panel = document.getElementById("workspace-git-panel");
    const statusElement = document.getElementById("workspace-git-status");
    const statusDetailsButton = document.getElementById("workspace-git-status-details");
    const statusDetailsModal = document.getElementById("workspace-git-status-details-modal");
    const statusDetailsContent = document.getElementById("workspace-git-status-details-content");
    const statusDetailsCloseButton = document.getElementById("workspace-git-status-details-close");
    const statusDetailsDoneButton = document.getElementById("workspace-git-status-details-done");
    const summaryElement = document.getElementById("workspace-git-summary");
    const branchButton = document.getElementById("workspace-git-branch-button");
    const branchNameElement = document.getElementById("workspace-git-branch-name");
    const branchesFullButton = document.getElementById("workspace-git-branches-full-button");
    const branchesFullCount = document.getElementById("workspace-git-branches-full-count");
    const tagsFullButton = document.getElementById("workspace-git-tags-full-button");
    const tagsFullCount = document.getElementById("workspace-git-tags-full-count");
    const branchTrackingElement = document.getElementById("workspace-git-tracking");
    const branchDivergenceElement = document.getElementById("workspace-git-divergence");
    const branchDropdown = document.getElementById("workspace-git-branch-dropdown");
    const branchDropdownSearch = document.getElementById("workspace-git-branch-search");
    const branchDropdownState = document.getElementById("workspace-git-branch-state");
    const branchDropdownList = document.getElementById("workspace-git-branch-list");
    const branchDropdownCount = document.getElementById("workspace-git-branch-count");
    const branchViewAllButton = document.getElementById("workspace-git-branch-view-all");
    const branchModal = document.getElementById("workspace-git-branch-modal");
    const branchModalSearch = document.getElementById("workspace-git-branch-modal-search");
    const branchModalState = document.getElementById("workspace-git-branch-modal-state");
    const branchModalList = document.getElementById("workspace-git-branch-modal-list");
    const branchModalCount = document.getElementById("workspace-git-branch-modal-count");
    const branchModalCloseButton = document.getElementById("workspace-git-branch-modal-close");
    const branchDropdownTabButtons = Array.from(branchDropdown?.querySelectorAll(".workspace-git-branch-tab") || []);
    const branchModalTabButtons = Array.from(branchModal?.querySelectorAll(".workspace-git-branch-tab") || []);
    if (branchModal && global.document?.body && branchModal.parentElement !== global.document.body) {
      global.document.body.appendChild(branchModal);
    }
    const modeTitleElement = document.getElementById("workspace-git-mode-title");
    const modeOptionButtons = document.querySelectorAll(".workspace-git-mode-option");
    const secondaryTitleElement = document.getElementById("workspace-git-secondary-title");
    const unstagedFilesElement = document.getElementById("workspace-git-unstaged-files");
    const stagedFilesElement = document.getElementById("workspace-git-staged-files");
    const unstagedSelectAllInput = document.getElementById("workspace-git-select-all-unstaged");
    const stagedSelectAllLabel = document.getElementById("workspace-git-select-all-staged-label");
    const stagedSelectAllInput = document.getElementById("workspace-git-select-all-staged");
    const refreshButton = document.getElementById("workspace-git-refresh");
    const resetButton = document.getElementById("workspace-git-reset");
    const fetchButton = document.getElementById("workspace-git-fetch");
    const pullButton = document.getElementById("workspace-git-pull");
    const pushButton = document.getElementById("workspace-git-push");
    const stageButton = document.getElementById("workspace-git-stage");
    const discardButton = document.getElementById("workspace-git-discard");
    const unstageButton = document.getElementById("workspace-git-unstage");
    const stashDropButton = document.getElementById("workspace-git-stash-drop");
    const commitButton = document.getElementById("workspace-git-commit");
    const commitLabel = document.getElementById("workspace-git-commit-label");
    const commitInput = document.getElementById("workspace-git-commit-message");
    const commitActions = document.getElementById("workspace-git-commit-actions");
    const openButtons = document.querySelectorAll(".open-workspace-git");
    const runGitAction = deps.runGitAction || createWorkspaceGitRunner(deps);

    function confirmWorkspaceGitAction(message, options = {}) {
      if (typeof app?.services?.confirm === "function") {
        return app.services.confirm(Object.assign({ message }, options));
      }
      return Promise.resolve(typeof global.confirm === "function" ? global.confirm(message) : false);
    }

    let lastStatus = null;
    let lastStashes = [];
    let lastBranches = { remote: [], localOnly: [] };
    let lastTags = [];
    let hasBranchCache = false;
    let branchDropdownSearchText = "";
    let branchModalSearchText = "";
    let branchDropdownMode = "branches";
    let branchModalMode = "branches";
    let gitPanelMode = "push";
    let currentStatusDetails = "";
    let branchActionMenu = null;
    let branchActivityDialog = null;
    let branchActivityState = { branchName: "", ref: "", activity: [], hasMore: false, loading: false };

    function getActiveFolderPath() {
      return deps.getActiveFolderPath ? deps.getActiveFolderPath() : "";
    }

    function isStashMode() {
      return gitPanelMode === "stash";
    }

    function getOpenTabsForPaths(filePaths, includeChildren = false) {
      const pathKeys = (Array.isArray(filePaths) ? filePaths : []).map((filePath) => getComparablePath(filePath).replace(/\/+$/, "")).filter(Boolean);
      if (!pathKeys.length) return [];
      return (deps.tabs || []).filter((tab) => {
        if (!tab || tab.type === "graph") return false;
        const tabPathKey = getComparablePath(getTabSourcePath(tab)).replace(/\/+$/, "");
        return pathKeys.some((pathKey) => tabPathKey === pathKey || (includeChildren && tabPathKey.startsWith(`${pathKey}/`)));
      });
    }

    function getStashFilePaths(stashRef) {
      const stash = lastStashes.find((entry) => entry?.ref === stashRef);
      return (stash?.files || []).map((file) => file?.path).filter(Boolean);
    }

    function getStashPopBlockedDetails(overlappingFiles, sourceDetails = "") {
      const files = normalizeFiles(overlappingFiles);
      const lines = files.length
        ? ["Files with local changes:", ...files.map((file) => `- ${file}`)]
        : ["Git refused to pop the stash because local changes would be overwritten."];
      if (sourceDetails) lines.push("", "Git output:", String(sourceDetails).trim());
      return lines.join("\n");
    }

    function blockStashPopForDirtyFiles(overlappingFiles, sourceDetails = "") {
      const message = getStashPopBlockedMessage(overlappingFiles.length);
      const details = getStashPopBlockedDetails(overlappingFiles, sourceDetails);
      alertUser(message);
      setStatus(message, details);
      return null;
    }

    async function reloadOpenTabsFromDisk(filePaths) {
      const Neutralino = typeof deps.Neutralino !== "undefined" ? deps.Neutralino : null;
      if (!Neutralino?.filesystem?.readFile) return false;
      const openTabs = getOpenTabsForPaths(filePaths);
      if (!openTabs.length) return false;
      const normalizeContent = typeof deps.normalizeEditorContent === "function"
        ? deps.normalizeEditorContent
        : (value) => String(value || "");
      let changed = false;
      for (const tab of openTabs) {
        const sourcePath = getTabSourcePath(tab);
        try {
          const content = await Neutralino.filesystem.readFile(sourcePath);
          const normalizedContent = normalizeContent(content);
          tab.content = normalizedContent;
          tab.savedContent = normalizedContent;
          tab.sourceFileName = getFileName(sourcePath);
          tab.sourceFilePath = sourcePath;
          if (tab.openedSource) tab.openedSource = { ...tab.openedSource, path: sourcePath, name: tab.sourceFileName };
          if (tab.id === deps.activeTabId) {
            deps.setActiveEditorContent?.(normalizedContent);
            deps.renderEditorSyntaxHighlights?.();
            deps.updateEditorLineNumbers?.();
            deps.renderMarkdown?.();
          } else {
            deps.destroyTabView?.(tab.id);
          }
          changed = true;
        } catch (error) {
          // A stashed untracked file may no longer exist on disk after the operation.
        }
      }
      if (changed) {
        deps.saveTabsToStorage?.(deps.tabs || []);
        deps.renderTabBar?.(deps.tabs || [], deps.activeTabId);
        deps.updateSaveCurrentFileButtons?.();
      }
      return changed;
    }

    function closeOpenTabsForPaths(filePaths) {
      const openTabs = getOpenTabsForPaths(filePaths, true);
      openTabs.forEach((tab) => deps.closeTab?.(tab.id, { promptForUnsaved: false }));
      return openTabs.length > 0;
    }

    function setBusy(isBusy) {
      panel?.classList.toggle("is-busy", !!isBusy);
      [branchButton, branchesFullButton, tagsFullButton, refreshButton, resetButton, fetchButton, pullButton, pushButton, stageButton, discardButton, unstageButton, stashDropButton, commitButton].forEach((button) => {
        if (button) button.disabled = !!isBusy;
      });
      if (isBusy) {
        [unstagedSelectAllInput, stagedSelectAllInput].forEach((input) => {
          if (input) input.disabled = true;
        });
      } else {
        updateAllSelectAllStates();
        updatePushAvailability();
        updateCommitAvailability();
        updateWorkspaceGitModeControls();
      }
    }

    function setStatus(message, details) {
      const formatted = formatGitStatusMessage(message, details);
      currentStatusDetails = formatted.details;
      if (statusElement) statusElement.textContent = formatted.message;
      if (statusDetailsButton) statusDetailsButton.hidden = !formatted.hasDetails;
    }

    function openStatusDetails() {
      if (!currentStatusDetails || !statusDetailsModal) return;
      if (statusDetailsContent) statusDetailsContent.textContent = currentStatusDetails;
      statusDetailsModal.classList.remove("hidden");
      statusDetailsModal.setAttribute("aria-hidden", "false");
      statusDetailsCloseButton?.focus();
    }

    function closeStatusDetails() {
      if (!statusDetailsModal) return;
      statusDetailsModal.classList.add("hidden");
      statusDetailsModal.setAttribute("aria-hidden", "true");
      statusDetailsButton?.focus();
    }

    function renderBranchSummary(status) {
      const branchText = status?.branch ? status.branch : "Detached HEAD";
      const divergence = [status?.ahead ? `${status.ahead} ahead` : "", status?.behind ? `${status.behind} behind` : ""].filter(Boolean).join(", ");
      if (branchNameElement) branchNameElement.textContent = branchText;
      else if (branchButton) branchButton.textContent = branchText;
      if (branchTrackingElement) branchTrackingElement.textContent = status?.tracking ? `-> ${status.tracking}` : "";
      if (branchDivergenceElement) branchDivergenceElement.textContent = divergence ? `(${divergence})` : "";
    }

    function getBranchItems(branches = lastBranches) {
      return [...(branches?.remote || []), ...(branches?.localOnly || [])];
    }

    function getBranchCacheKey(branches, tags = lastTags) {
      return JSON.stringify({
        remote: (branches?.remote || []).map((branch) => ({
          name: branch.name,
          localName: branch.localName,
          hasLocal: !!branch.hasLocal,
          current: !!branch.current,
          updatedAt: branch.updatedAt || "",
          commitHash: branch.commitHash || ""
        })),
        localOnly: (branches?.localOnly || []).map((branch) => ({
          name: branch.name,
          current: !!branch.current,
          tracking: branch.tracking || "",
          updatedAt: branch.updatedAt || "",
          commitHash: branch.commitHash || ""
        })),
        tags: (Array.isArray(tags) ? tags : []).map((tag) => ({
          name: tag.name,
          updatedAt: tag.updatedAt || "",
          commitHash: tag.commitHash || ""
        }))
      });
    }

    function getFilteredBranchItems(searchText, branches = lastBranches) {
      const query = String(searchText || "").trim().toLowerCase();
      const items = getBranchItems(branches);
      if (!query) return items;
      return items.filter((branch) => {
        const label = getBranchDisplayName(branch).toLowerCase();
        const name = String(branch?.name || "").toLowerCase();
        return label.includes(query) || name.includes(query);
      });
    }

    function getFilteredTagItems(searchText, tags = lastTags) {
      const query = String(searchText || "").trim().toLowerCase();
      const items = Array.isArray(tags) ? tags : [];
      if (!query) return items;
      return items.filter((tag) => String(tag?.name || "").toLowerCase().includes(query));
    }

    function updateBranchTabs(buttons, mode) {
      buttons.forEach((button) => {
        const active = button.dataset.gitRefTab === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function updateBranchSearchPlaceholder(input, mode) {
      if (!input) return;
      input.placeholder = mode === "tags" ? "Search or create a new tag..." : "Find a branch...";
    }

    function renderGitRefCountButtons() {
      const branchTotal = getBranchListCount(lastBranches);
      const tagTotal = lastTags.length;
      if (branchesFullCount) branchesFullCount.textContent = branchTotal ? `${branchTotal} ${branchTotal === 1 ? "Branch" : "Branches"}` : "Branches";
      if (tagsFullCount) tagsFullCount.textContent = tagTotal ? `${tagTotal} ${tagTotal === 1 ? "Tag" : "Tags"}` : "Tags";
    }

    function renderBranchCreateOption(suggestion) {
      if (!suggestion) return "";
      const branch = suggestion.branch;
      return `
        <button class="workspace-git-branch-option workspace-git-branch-create-option" type="button" data-branch-create="true" data-branch-name="${escapeHtml(branch)}" data-local-branch="${escapeHtml(branch)}">
          <span class="workspace-git-branch-option-main">
            <span class="workspace-git-branch-check"><i class="bi bi-diagram-2" aria-hidden="true"></i></span>
            <span class="workspace-git-branch-label">Create branch <strong>${escapeHtml(branch)}</strong> from ${escapeHtml(suggestion.fromBranch)}</span>
          </span>
        </button>`;
    }

    function renderTagCreateOption(suggestion) {
      if (!suggestion) return "";
      const tag = suggestion.tag;
      return `
        <button class="workspace-git-branch-option workspace-git-tag-create-option" type="button" data-tag-name="${escapeHtml(tag)}">
          <span class="workspace-git-branch-option-main">
            <span class="workspace-git-branch-check"><i class="bi bi-tag" aria-hidden="true"></i></span>
            <span class="workspace-git-branch-label">Create tag <strong>${escapeHtml(tag)}</strong> from ${escapeHtml(suggestion.fromBranch)}</span>
          </span>
        </button>`;
    }

    function renderBranchListItems(items, limit = Infinity, options = {}) {
      const visibleItems = items.slice(0, limit);
      const createOption = renderBranchCreateOption(options.createSuggestion);
      if (!visibleItems.length && !createOption) return `<div class="workspace-git-branch-empty">No branches found.</div>`;
      return createOption + visibleItems.map((branch) => {
        const { label, remoteBranch, localBranch } = getBranchActionData(branch);
        const meta = branch.type === "remote" ? branch.name : "local only";
        const badge = branch.current ? "Current" : (branch.type === "remote" && branch.hasLocal ? "Local" : "");
        return `
          <button class="workspace-git-branch-option${branch.current ? " active" : ""}" type="button" data-branch-type="${escapeHtml(branch.type)}" data-branch-name="${escapeHtml(label)}" data-remote-branch="${escapeHtml(remoteBranch)}" data-local-branch="${escapeHtml(localBranch)}">
            <span class="workspace-git-branch-option-main">
              <span class="workspace-git-branch-check">${branch.current ? "&#10003;" : ""}</span>
              <span class="workspace-git-branch-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            </span>
            <span class="workspace-git-branch-option-meta">
              <span title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>
              ${badge ? `<span class="workspace-git-branch-badge">${escapeHtml(badge)}</span>` : ""}
            </span>
          </button>`;
      }).join("");
    }

    function renderTagListItems(items, limit = Infinity, options = {}) {
      const visibleItems = items.slice(0, limit);
      const createOption = renderTagCreateOption(options.createSuggestion);
      if (!visibleItems.length && !createOption) return `<div class="workspace-git-branch-empty">No tags found.</div>`;
      return createOption + visibleItems.map((tag) => {
        const updated = formatBranchUpdatedAt(tag.updatedAt);
        const hash = tag.commitHash ? ` (${tag.commitHash})` : "";
        return `
          <div class="workspace-git-tag-option">
            <span class="workspace-git-branch-option-main">
              <span class="workspace-git-branch-check"><i class="bi bi-tag" aria-hidden="true"></i></span>
              <span class="workspace-git-branch-label" title="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</span>
            </span>
            <span class="workspace-git-branch-option-meta" title="${escapeHtml(updated + hash)}">${escapeHtml(updated || hash ? `${updated}${hash}` : "")}</span>
          </div>`;
      }).join("");
    }

    function renderBranchModalItems(items, options = {}) {
      const createOption = renderBranchCreateOption(options.createSuggestion);
      if (!items.length && !createOption) return `<div class="workspace-git-branch-empty">No branches found.</div>`;
      const rows = items.map((branch) => {
        const { label, remoteBranch, localBranch, actionRemoteBranch, activityRef } = getBranchActionData(branch);
        const source = getBranchSourceLabel(branch);
        const updated = formatBranchUpdatedAt(branch.updatedAt);
        const hash = branch.commitHash ? ` (${branch.commitHash})` : "";
        return `
          <div class="workspace-git-branch-table-row${branch.current ? " active" : ""}">
            <button class="workspace-git-branch-option workspace-git-branch-table-branch" type="button" data-branch-type="${escapeHtml(branch.type)}" data-branch-name="${escapeHtml(label)}" data-remote-branch="${escapeHtml(remoteBranch)}" data-local-branch="${escapeHtml(localBranch)}">
              <span class="workspace-git-branch-option-main">
                <span class="workspace-git-branch-check">${branch.current ? "&#10003;" : ""}</span>
                <span class="workspace-git-branch-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
              </span>
            </button>
            <span class="workspace-git-branch-table-cell" title="${escapeHtml(updated + hash)}">${escapeHtml(updated || "Unknown")}${escapeHtml(hash)}</span>
            <span class="workspace-git-branch-table-cell" title="${escapeHtml(branch.tracking || source)}">${escapeHtml(source)}</span>
            <span class="workspace-git-branch-table-actions">
              <button class="folder-tree-tool-button workspace-git-branch-copy" type="button" data-branch-name="${escapeHtml(label)}" title="Copy branch name" aria-label="Copy ${escapeHtml(label)} branch name">
                <i class="bi bi-copy" aria-hidden="true"></i>
              </button>
              <button class="folder-tree-tool-button workspace-git-branch-activity" type="button" data-branch-name="${escapeHtml(label)}" data-activity-ref="${escapeHtml(activityRef)}" title="Show activity" aria-label="Show ${escapeHtml(label)} activity">
                <i class="bi bi-clock-history" aria-hidden="true"></i>
              </button>
              <button class="folder-tree-tool-button workspace-git-branch-menu-button" type="button" data-branch-name="${escapeHtml(label)}" data-local-branch="${escapeHtml(localBranch)}" data-remote-branch="${escapeHtml(actionRemoteBranch)}" data-activity-ref="${escapeHtml(activityRef)}" data-current="${branch.current ? "true" : "false"}" title="Branch actions" aria-label="${escapeHtml(label)} branch actions">
                <i class="bi bi-three-dots" aria-hidden="true"></i>
              </button>
            </span>
          </div>`;
      }).join("");
      return `${createOption}<div class="workspace-git-branch-table">
        <div class="workspace-git-branch-table-header">
          <span>Branch</span>
          <span>Updated</span>
          <span>Source</span>
          <span>Actions</span>
        </div>
        ${rows}
      </div>`;
    }

    function renderTagModalItems(items, options = {}) {
      const createOption = renderTagCreateOption(options.createSuggestion);
      if (!items.length && !createOption) return `<div class="workspace-git-branch-empty">No tags found.</div>`;
      const rows = items.map((tag) => {
        const updated = formatBranchUpdatedAt(tag.updatedAt);
        return `
          <div class="workspace-git-branch-table-row">
            <span class="workspace-git-tag-table-name" title="${escapeHtml(tag.name)}"><i class="bi bi-tag" aria-hidden="true"></i>${escapeHtml(tag.name)}</span>
            <span class="workspace-git-branch-table-cell" title="${escapeHtml(updated)}">${escapeHtml(updated || "Unknown")}</span>
            <span class="workspace-git-branch-table-cell" title="${escapeHtml(tag.commitHash || "")}">${escapeHtml(tag.commitHash || "")}</span>
            <span class="workspace-git-branch-table-actions">
              <button class="folder-tree-tool-button workspace-git-tag-copy" type="button" data-tag-name="${escapeHtml(tag.name)}" title="Copy tag name" aria-label="Copy ${escapeHtml(tag.name)} tag name">
                <i class="bi bi-copy" aria-hidden="true"></i>
              </button>
              <button class="folder-tree-tool-button workspace-git-tag-menu-button" type="button" data-tag-name="${escapeHtml(tag.name)}" title="Tag actions" aria-label="${escapeHtml(tag.name)} tag actions">
                <i class="bi bi-three-dots" aria-hidden="true"></i>
              </button>
            </span>
          </div>`;
      }).join("");
      return `${createOption}<div class="workspace-git-branch-table workspace-git-tag-table">
        <div class="workspace-git-branch-table-header">
          <span>Tag</span>
          <span>Updated</span>
          <span>Commit</span>
          <span>Actions</span>
        </div>
        ${rows}
      </div>`;
    }

    function renderBranchDropdown() {
      renderGitRefCountButtons();
      updateBranchTabs(branchDropdownTabButtons, branchDropdownMode);
      updateBranchSearchPlaceholder(branchDropdownSearch, branchDropdownMode);
      if (branchDropdownMode === "tags") {
        const items = getFilteredTagItems(branchDropdownSearchText);
        const createSuggestion = getTagCreateSuggestion(branchDropdownSearchText, lastTags, lastStatus?.status?.branch || "");
        const total = lastTags.length;
        const fullMode = total > FULL_BRANCH_SWITCHER_THRESHOLD || lastTags.some((tag) => String(tag?.name || "").length > 34);
        const limit = fullMode ? 10 : FULL_BRANCH_SWITCHER_THRESHOLD;
        if (branchDropdownCount) branchDropdownCount.textContent = total ? `${total} ${total === 1 ? "tag" : "tags"}` : "";
        if (branchDropdownState) branchDropdownState.hidden = !!total || !!createSuggestion;
        if (branchDropdownState) branchDropdownState.textContent = total || createSuggestion ? "" : "No tags found.";
        if (branchDropdownList) branchDropdownList.innerHTML = renderTagListItems(items, limit, { createSuggestion });
        if (branchViewAllButton) {
          branchViewAllButton.textContent = "View all tags";
          branchViewAllButton.hidden = !fullMode && items.length <= limit;
        }
        return;
      }
      const items = getFilteredBranchItems(branchDropdownSearchText);
      const createSuggestion = getBranchCreateSuggestion(branchDropdownSearchText, lastBranches, lastStatus?.status?.branch || "");
      const total = getBranchListCount(lastBranches);
      const fullMode = getBranchSwitchMode(lastBranches) === "full";
      const limit = fullMode ? 10 : FULL_BRANCH_SWITCHER_THRESHOLD;
      if (branchDropdownCount) branchDropdownCount.textContent = total ? `${total} ${total === 1 ? "branch" : "branches"}` : "";
      if (branchDropdownState) branchDropdownState.hidden = !!total;
      if (branchDropdownState) branchDropdownState.textContent = total ? "" : "No branches found.";
      if (branchDropdownList) branchDropdownList.innerHTML = renderBranchListItems(items, limit, { createSuggestion });
      if (branchViewAllButton) {
        branchViewAllButton.textContent = "View all branches";
        branchViewAllButton.hidden = !fullMode && items.length <= limit;
      }
    }

    function renderBranchModal() {
      renderGitRefCountButtons();
      updateBranchTabs(branchModalTabButtons, branchModalMode);
      updateBranchSearchPlaceholder(branchModalSearch, branchModalMode);
      if (branchModalMode === "tags") {
        const items = getFilteredTagItems(branchModalSearchText);
        const createSuggestion = getTagCreateSuggestion(branchModalSearchText, lastTags, lastStatus?.status?.branch || "");
        const total = lastTags.length;
        if (branchModalCount) branchModalCount.textContent = total ? `${total} ${total === 1 ? "tag" : "tags"}` : "";
        if (branchModalState) branchModalState.hidden = !!total || !!createSuggestion;
        if (branchModalState) branchModalState.textContent = total || createSuggestion ? "" : "No tags found.";
        if (branchModalList) branchModalList.innerHTML = renderTagModalItems(items, { createSuggestion });
        return;
      }
      const items = getFilteredBranchItems(branchModalSearchText);
      const createSuggestion = getBranchCreateSuggestion(branchModalSearchText, lastBranches, lastStatus?.status?.branch || "");
      const total = getBranchListCount(lastBranches);
      if (branchModalCount) branchModalCount.textContent = total ? `${total} ${total === 1 ? "branch" : "branches"}` : "";
      if (branchModalState) branchModalState.hidden = !!total;
      if (branchModalState) branchModalState.textContent = total ? "" : "No branches found.";
      if (branchModalList) branchModalList.innerHTML = renderBranchModalItems(items, { createSuggestion });
    }

    function positionBranchDropdown() {
      if (!branchDropdown || !branchButton) return;
      const rect = branchButton.getBoundingClientRect();
      const width = Math.min(340, Math.max(260, global.innerWidth ? global.innerWidth - 24 : 300));
      const left = Math.max(8, Math.min(rect.left, (global.innerWidth || rect.left + width) - width - 8));
      branchDropdown.style.width = `${width}px`;
      branchDropdown.style.left = `${left}px`;
      branchDropdown.style.top = `${rect.bottom + 6}px`;
    }

    function openBranchDropdownShell() {
      if (!branchDropdown) return;
      positionBranchDropdown();
      branchDropdown.classList.remove("hidden");
      branchDropdown.setAttribute("aria-hidden", "false");
      branchButton?.setAttribute("aria-expanded", "true");
    }

    function closeBranchDropdown() {
      if (!branchDropdown) return;
      branchDropdown.classList.add("hidden");
      branchDropdown.setAttribute("aria-hidden", "true");
      branchButton?.setAttribute("aria-expanded", "false");
    }

    function openBranchModal(mode = "") {
      if (!branchModal) return;
      closeBranchDropdown();
      if (mode === "branches" || mode === "tags") branchModalMode = mode;
      else branchModalMode = branchDropdownMode;
      branchModalSearchText = branchDropdownSearchText;
      if (branchModalSearch) branchModalSearch.value = branchModalSearchText;
      renderBranchModal();
      branchModal.classList.remove("hidden");
      branchModal.setAttribute("aria-hidden", "false");
      branchModalSearch?.focus();
    }

    async function openWorkspaceGitFullRefList(mode) {
      if (!updateWorkspaceGitAvailability()) return;
      branchDropdownMode = mode === "tags" ? "tags" : "branches";
      branchModalSearchText = "";
      branchDropdownSearchText = "";
      if (branchDropdownSearch) branchDropdownSearch.value = "";
      if (branchModalSearch) branchModalSearch.value = "";
      if (hasBranchCache) {
        openBranchModal(branchDropdownMode);
        setStatus(branchDropdownMode === "tags" ? "Choose a tag action." : "Choose a branch to switch.");
        loadWorkspaceGitBranches({ showLoading: false }).then((result) => {
          if (result?.changed) setStatus("Branch and tag list refreshed.");
        }).catch((error) => {
          setStatus(error?.message || "Unable to refresh branches and tags.");
        });
        return;
      }
      openBranchModal(branchDropdownMode);
      if (branchModalState) {
        branchModalState.hidden = false;
        branchModalState.textContent = branchDropdownMode === "tags" ? "Refreshing tags..." : "Refreshing branches...";
      }
      if (branchModalList) branchModalList.innerHTML = "";
      setStatus("Refreshing branches and tags...");
      try {
        await loadWorkspaceGitBranches({ showLoading: false });
        setStatus(branchDropdownMode === "tags" ? "Choose a tag action." : "Choose a branch to switch.");
      } catch (error) {
        setStatus(error?.message || "Unable to refresh branches and tags.");
        if (branchModalState) branchModalState.textContent = error?.message || "Unable to refresh branches and tags.";
      }
    }

    function closeBranchModal() {
      if (!branchModal) return;
      closeBranchActionMenu();
      branchModal.classList.add("hidden");
      branchModal.setAttribute("aria-hidden", "true");
      branchButton?.focus();
    }

    function closeBranchActionMenu() {
      if (!branchActionMenu) return;
      branchActionMenu.classList.add("hidden");
      branchActionMenu.setAttribute("aria-hidden", "true");
    }

    function getBranchActionDataset(source) {
      return {
        branchName: source?.dataset?.branchName || "",
        tagName: source?.dataset?.tagName || "",
        localBranch: source?.dataset?.localBranch || "",
        remoteBranch: source?.dataset?.remoteBranch || "",
        activityRef: source?.dataset?.activityRef || "",
        current: source?.dataset?.current === "true"
      };
    }

    function createBranchActionMenu() {
      if (branchActionMenu || !global.document?.createElement) return branchActionMenu;
      branchActionMenu = global.document.createElement("div");
      branchActionMenu.className = "workspace-git-branch-action-menu hidden";
      branchActionMenu.setAttribute("aria-hidden", "true");
      branchActionMenu.addEventListener("click", (event) => {
        const actionButton = event.target?.closest?.(".workspace-git-branch-action-command");
        if (!actionButton) return;
        event.stopPropagation?.();
        const data = getBranchActionDataset(branchActionMenu);
        closeBranchActionMenu();
        runBranchMenuAction(actionButton.dataset.branchAction, data).catch((error) => setStatus(error?.message || "Branch action failed."));
      });
      global.document.body?.appendChild(branchActionMenu);
      return branchActionMenu;
    }

    function openBranchActionMenu(button) {
      const menu = createBranchActionMenu();
      if (!menu || !button) return;
      const data = getBranchActionDataset(button);
      menu.dataset.branchName = data.branchName;
      menu.dataset.tagName = data.tagName;
      menu.dataset.localBranch = data.localBranch;
      menu.dataset.remoteBranch = data.remoteBranch;
      menu.dataset.activityRef = data.activityRef;
      menu.dataset.current = data.current ? "true" : "false";
      if (data.tagName) {
        menu.innerHTML = `
          <button class="workspace-git-branch-action-command" type="button" data-branch-action="copy-tag"><i class="bi bi-copy" aria-hidden="true"></i><span>Copy tag name</span></button>
          <button class="workspace-git-branch-action-command" type="button" data-branch-action="create-tag"><i class="bi bi-tag" aria-hidden="true"></i><span>Create tag</span></button>
          <button class="workspace-git-branch-action-command danger" type="button" data-branch-action="delete-tag"><i class="bi bi-trash" aria-hidden="true"></i><span>Delete tag</span></button>`;
      } else {
        const localActions = data.localBranch
          ? `<button class="workspace-git-branch-action-command" type="button" data-branch-action="rename"><i class="bi bi-pencil" aria-hidden="true"></i><span>Rename local branch</span></button>
            ${data.remoteBranch ? "" : `<button class="workspace-git-branch-action-command" type="button" data-branch-action="push"><i class="bi bi-cloud-upload" aria-hidden="true"></i><span>Push branch</span></button>`}
            ${data.current ? "" : `<button class="workspace-git-branch-action-command danger" type="button" data-branch-action="delete-local"><i class="bi bi-trash" aria-hidden="true"></i><span>Delete local branch</span></button>`}`
          : "";
        const remoteAction = data.remoteBranch && !data.current
          ? `<button class="workspace-git-branch-action-command danger" type="button" data-branch-action="delete-remote"><i class="bi bi-cloud-slash" aria-hidden="true"></i><span>Delete remote branch</span></button>`
          : "";
        menu.innerHTML = `
          <button class="workspace-git-branch-action-command" type="button" data-branch-action="copy"><i class="bi bi-copy" aria-hidden="true"></i><span>Copy branch name</span></button>
          <button class="workspace-git-branch-action-command" type="button" data-branch-action="activity"><i class="bi bi-clock-history" aria-hidden="true"></i><span>Activity</span></button>
          ${localActions}
          ${remoteAction}`;
      }
      const rect = button.getBoundingClientRect();
      const width = 220;
      const left = Math.max(8, Math.min(rect.right - width, (global.innerWidth || rect.right) - width - 8));
      menu.style.left = `${left}px`;
      menu.classList.remove("hidden");
      menu.style.visibility = "hidden";
      const gap = 4;
      const viewportHeight = global.innerHeight || rect.bottom + menu.offsetHeight + 8;
      const menuHeight = menu.offsetHeight || 0;
      const topBelow = rect.bottom + gap;
      const topAbove = rect.top - menuHeight - gap;
      const maxTop = viewportHeight - menuHeight - 8;
      const top = topBelow + menuHeight > viewportHeight - 8 && topAbove >= 8
        ? topAbove
        : Math.max(8, Math.min(topBelow, maxTop));
      menu.style.top = `${top}px`;
      menu.style.visibility = "";
      menu.setAttribute("aria-hidden", "false");
    }

    function createBranchActivityDialog() {
      if (branchActivityDialog || !global.document?.createElement) return branchActivityDialog;
      branchActivityDialog = global.document.createElement("div");
      branchActivityDialog.className = "workspace-git-branch-activity-modal hidden";
      branchActivityDialog.setAttribute("aria-hidden", "true");
      branchActivityDialog.addEventListener("click", (event) => {
        if (event.target === branchActivityDialog || event.target?.closest?.(".workspace-git-branch-activity-close")) closeBranchActivityDialog();
        const moreButton = event.target?.closest?.(".workspace-git-branch-activity-more");
        if (moreButton) {
          event.stopPropagation?.();
          loadMoreBranchActivity().catch((error) => setStatus(error?.message || "Unable to load more activity."));
        }
      });
      global.document.body?.appendChild(branchActivityDialog);
      return branchActivityDialog;
    }

    function closeBranchActivityDialog() {
      if (!branchActivityDialog) return;
      branchActivityDialog.classList.add("hidden");
      branchActivityDialog.setAttribute("aria-hidden", "true");
    }

    function renderBranchActivityDialog(branchName, activity, hasMore = false, loading = false, scrollTop = null) {
      const dialog = createBranchActivityDialog();
      if (!dialog) return;
      const rows = (Array.isArray(activity) ? activity : []).map((entry) => `
        <div class="workspace-git-branch-activity-row">
          <div class="workspace-git-branch-activity-subject">${escapeHtml(entry.subject || "(no commit message)")}</div>
          <div class="workspace-git-branch-activity-meta">${escapeHtml(entry.hash || "")}${entry.author ? ` by ${escapeHtml(entry.author)}` : ""}${entry.date ? `, ${escapeHtml(entry.date)}` : ""}</div>
        </div>`).join("");
      const moreButton = hasMore ? `
        <button class="workspace-git-branch-activity-more" type="button"${loading ? " disabled" : ""}>
          ${loading ? "Loading..." : "More Activities..."}
        </button>` : "";
      dialog.innerHTML = `
        <div class="workspace-git-branch-activity-dialog" role="dialog" aria-modal="true" aria-label="Branch activity">
          <div class="workspace-git-branch-dialog-header">
            <div>
              <strong>Activity</strong>
              <div class="workspace-git-branch-count">${escapeHtml(branchName)}</div>
            </div>
            <button class="folder-tree-tool-button workspace-git-branch-activity-close" type="button" aria-label="Close branch activity">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="workspace-git-branch-activity-list">${rows || `<div class="workspace-git-branch-empty">No recent commits found.</div>`}</div>
          ${moreButton}
        </div>`;
      dialog.classList.remove("hidden");
      dialog.setAttribute("aria-hidden", "false");
      if (scrollTop !== null) {
        const activityList = dialog.querySelector(".workspace-git-branch-activity-list");
        if (activityList) activityList.scrollTop = scrollTop;
      }
    }

    function getBranchActivityScrollTop() {
      return branchActivityDialog?.querySelector?.(".workspace-git-branch-activity-list")?.scrollTop || 0;
    }

    async function refreshBranchesAfterBranchAction(result, message) {
      renderGitResult(result);
      hasBranchCache = false;
      await loadWorkspaceGitBranches({ showLoading: false }).catch(() => {});
      if (branchModal && !branchModal.classList.contains("hidden")) renderBranchModal();
      setStatus(message);
    }

    async function showBranchActivity(data) {
      const ref = normalizeBranchName(data.activityRef || data.localBranch || data.remoteBranch || data.branchName || "");
      setStatus(`Loading activity for ${data.branchName || ref}...`);
      const result = await runGitAction(getActiveFolderPath(), "branchActivity", { ref, activitySkip: 0, activityLimit: 20 });
      branchActivityState = { branchName: data.branchName || ref, ref, activity: result?.activity || [], hasMore: !!result?.hasMore, loading: false };
      renderBranchActivityDialog(branchActivityState.branchName, branchActivityState.activity, branchActivityState.hasMore, branchActivityState.loading);
      setStatus(`Loaded activity for ${data.branchName || ref}.`);
    }

    async function loadMoreBranchActivity() {
      if (!branchActivityState.ref || branchActivityState.loading || !branchActivityState.hasMore) return;
      const scrollTop = getBranchActivityScrollTop();
      branchActivityState = { ...branchActivityState, loading: true };
      renderBranchActivityDialog(branchActivityState.branchName, branchActivityState.activity, branchActivityState.hasMore, true, scrollTop);
      setStatus(`Loading more activity for ${branchActivityState.branchName}...`);
      try {
        const result = await runGitAction(getActiveFolderPath(), "branchActivity", { ref: branchActivityState.ref, activitySkip: branchActivityState.activity.length, activityLimit: 20 });
        branchActivityState = {
          ...branchActivityState,
          activity: [...branchActivityState.activity, ...(result?.activity || [])],
          hasMore: !!result?.hasMore,
          loading: false
        };
        renderBranchActivityDialog(branchActivityState.branchName, branchActivityState.activity, branchActivityState.hasMore, false, scrollTop);
        setStatus(`Loaded more activity for ${branchActivityState.branchName}.`);
      } catch (error) {
        branchActivityState = { ...branchActivityState, loading: false };
        renderBranchActivityDialog(branchActivityState.branchName, branchActivityState.activity, branchActivityState.hasMore, false, scrollTop);
        throw error;
      }
    }

    async function runBranchMenuAction(action, data) {
      if (action === "copy") return copyBranchName(data.branchName);
      if (action === "activity") return showBranchActivity(data);
      if (action === "copy-tag") return copyTagName(data.tagName);
      if (action === "create-tag") {
        const nextTag = await app.services.prompt({ title: "Create Git tag", message: "Create tag from current HEAD:" });
        if (nextTag === null) return;
        return createWorkspaceGitTag(normalizeTagName(nextTag || ""));
      }
      if (action === "delete-tag") {
        const tag = normalizeTagName(data.tagName || "");
        const confirmed = await confirmWorkspaceGitAction(`Delete tag "${tag}"? This cannot be undone.`, { confirmLabel: "Delete", confirmVariant: "danger" });
        if (!confirmed) return;
        const result = await runGitAction(getActiveFolderPath(), "tagDelete", { tag });
        return refreshBranchesAfterBranchAction(result, `Deleted tag ${tag}.`);
      }
      if (action === "rename") {
        const oldBranch = normalizeBranchName(data.localBranch || "");
        const nextBranch = await app.services.prompt({
          title: "Rename local branch",
          message: `Rename local branch "${oldBranch}" to:`,
          value: oldBranch
        });
        if (nextBranch === null) return;
        const newBranch = normalizeBranchName(nextBranch || "");
        if (newBranch === oldBranch) return;
        const result = await runGitAction(getActiveFolderPath(), "branchRename", { branch: oldBranch, newBranch });
        return refreshBranchesAfterBranchAction(result, `Renamed branch ${oldBranch} to ${newBranch}.`);
      }
      if (action === "push") {
        const branch = normalizeBranchName(data.localBranch || "");
        const result = await runGitAction(getActiveFolderPath(), "branchPush", { branch });
        return refreshBranchesAfterBranchAction(result, `Pushed branch ${branch} to origin.`);
      }
      if (action === "delete-local") {
        if (data.current) throw new Error("Cannot delete the current branch.");
        const branch = normalizeBranchName(data.localBranch || "");
        const confirmed = await confirmWorkspaceGitAction(`Delete local branch "${branch}"?`, { confirmLabel: "Delete", confirmVariant: "danger" });
        if (!confirmed) return;
        const result = await runGitAction(getActiveFolderPath(), "branchDeleteLocal", { branch });
        return refreshBranchesAfterBranchAction(result, `Deleted local branch ${branch}.`);
      }
      if (action === "delete-remote") {
        if (data.current) throw new Error("Cannot delete the current branch.");
        const remoteBranch = normalizeRemoteBranchName(data.remoteBranch || "");
        const confirmed = await confirmWorkspaceGitAction(`Delete remote branch "${remoteBranch}"? This affects the remote repository.`, { confirmLabel: "Delete", confirmVariant: "danger" });
        if (!confirmed) return;
        const result = await runGitAction(getActiveFolderPath(), "branchDeleteRemote", { remoteBranch });
        return refreshBranchesAfterBranchAction(result, `Deleted remote branch ${remoteBranch}.`);
      }
      throw new Error("Branch action is not supported.");
    }

    async function createWorkspaceGitTag(tag) {
      const tagName = normalizeTagName(tag || "");
      const result = await runGitAction(getActiveFolderPath(), "tagCreate", { tag: tagName });
      return refreshBranchesAfterBranchAction(result, `Created tag ${tagName}.`);
    }

    async function createWorkspaceGitTagFromButton(button) {
      if (!button) return;
      await createWorkspaceGitTag(button.dataset.tagName || "");
    }

    async function copyBranchName(branchName) {
      const text = String(branchName || "").trim();
      if (!text) return;
      if (deps.copyTextToSystemClipboard) {
        await deps.copyTextToSystemClipboard(text);
      } else if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(text);
      } else if (global.document?.createElement && global.document?.execCommand) {
        const textarea = global.document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        global.document.body?.appendChild(textarea);
        textarea.select();
        const copied = global.document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard is unavailable.");
      } else {
        throw new Error("Clipboard is unavailable.");
      }
      setStatus(`Copied branch name ${text}.`);
    }

    async function copyTagName(tagName) {
      const text = String(tagName || "").trim();
      if (!text) return;
      if (deps.copyTextToSystemClipboard) {
        await deps.copyTextToSystemClipboard(text);
      } else if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(text);
      } else if (global.document?.createElement && global.document?.execCommand) {
        const textarea = global.document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        global.document.body?.appendChild(textarea);
        textarea.select();
        const copied = global.document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard is unavailable.");
      } else {
        throw new Error("Clipboard is unavailable.");
      }
      setStatus(`Copied tag name ${text}.`);
    }

    async function loadWorkspaceGitBranches(options = {}) {
      const showLoading = options.showLoading !== false;
      const previousKey = getBranchCacheKey(lastBranches, lastTags);
      if (showLoading && branchDropdownState) {
        branchDropdownState.hidden = false;
        branchDropdownState.textContent = branchDropdownMode === "tags" ? "Refreshing tags..." : "Refreshing branches...";
        if (branchDropdownList) branchDropdownList.innerHTML = "";
        if (branchViewAllButton) branchViewAllButton.hidden = true;
      }
      const result = await runGitAction(getActiveFolderPath(), "branchList");
      const nextBranches = result?.branches || { remote: [], localOnly: [] };
      const nextTags = Array.isArray(result?.tags) ? result.tags : [];
      const nextKey = getBranchCacheKey(nextBranches, nextTags);
      const changed = !hasBranchCache || previousKey !== nextKey;
      lastBranches = nextBranches;
      lastTags = nextTags;
      hasBranchCache = true;
      if (changed || showLoading) {
        renderBranchDropdown();
        if (branchModal && !branchModal.classList.contains("hidden")) renderBranchModal();
      }
      return { changed };
    }

    async function openWorkspaceGitBranchSwitcher() {
      if (!updateWorkspaceGitAvailability()) return;
      branchDropdownSearchText = "";
      if (branchDropdownSearch) branchDropdownSearch.value = "";
      openBranchDropdownShell();
      if (hasBranchCache) {
        renderBranchDropdown();
        setStatus("Choose a branch to switch.");
        loadWorkspaceGitBranches({ showLoading: false }).then((result) => {
          if (result?.changed) setStatus("Branch list refreshed.");
        }).catch((error) => {
          setStatus(error?.message || "Unable to refresh branches.");
        });
        return;
      }
      setStatus("Refreshing branches...");
      try {
        await loadWorkspaceGitBranches({ showLoading: true });
        setStatus("Choose a branch to switch.");
      } catch (error) {
        setStatus(error?.message || "Unable to refresh branches.");
        if (branchDropdownState) branchDropdownState.textContent = error?.message || "Unable to refresh branches.";
      }
    }

    function hasUnsavedWorkspaceGitTabs() {
      const normalizeContent = typeof deps.normalizeEditorContent === "function" ? deps.normalizeEditorContent : null;
      return (deps.tabs || []).some((tab) => isTabUnsaved(tab, normalizeContent));
    }

    async function switchWorkspaceGitBranchFromButton(button) {
      if (!button) return;
      const createBranch = button.dataset.branchCreate === "true";
      const remoteBranch = createBranch ? "" : normalizePath(button.dataset.remoteBranch || "");
      const localBranch = normalizeBranchName(button.dataset.localBranch || button.dataset.branchName || "");
      const branchLabel = button.dataset.branchName || remoteBranch || localBranch;
      if (hasUnsavedWorkspaceGitTabs()) {
        const message = getBranchSwitchBlockedMessage();
        alertUser(message);
        setStatus(message);
        return;
      }
      setBusy(true);
      try {
        setStatus("Checking working tree...");
        const statusResult = await runGitAction(getActiveFolderPath(), "status");
        if (isGitStatusDirty(statusResult?.status)) {
          renderGitResult(statusResult);
          const message = getBranchSwitchBlockedMessage();
          alertUser(message);
          setStatus(message);
          return;
        }
        setStatus(`${createBranch ? "Creating branch" : "Switching to"} ${branchLabel}...`);
        const result = await runGitAction(getActiveFolderPath(), createBranch ? "branchCreate" : "switchBranch", createBranch ? { branch: localBranch } : (remoteBranch ? { remoteBranch } : { branch: localBranch }));
        renderGitResult(result);
        if (createBranch) hasBranchCache = false;
        closeBranchDropdown();
        closeBranchModal();
        if (typeof deps.reloadOpenFolderTree === "function") await deps.reloadOpenFolderTree();
        await reloadOpenTabsFromDisk((deps.tabs || []).map((tab) => getTabSourcePath(tab)).filter(Boolean));
        if (isStashMode()) await refreshWorkspaceGitStashes().catch(() => {});
        setStatus(`${createBranch ? "Created and switched to" : "Switched to"} ${branchLabel}.`);
      } catch (error) {
        setStatus(error?.message || "Unable to switch branches.");
        throw error;
      } finally {
        setBusy(false);
      }
    }

    function alertUser(message) {
      if (typeof deps.alert === "function") deps.alert(message);
      else if (typeof global.alert === "function") global.alert(message);
    }

    function getFileCheckboxes(container) {
      return Array.from(container?.querySelectorAll(".workspace-git-file-check") || []);
    }

    function getStashCheckboxes(container) {
      return Array.from(container?.querySelectorAll(".workspace-git-stash-check") || []);
    }

    function updateFileActionAvailability() {
      const hasFolder = !!getActiveFolderPath() && deps.isDesktopRuntime?.();
      const selectedUnstagedFiles = getSelectedFilePaths(unstagedFilesElement);
      const selectedStashRefs = getSelectedStashRefs(stagedFilesElement);
      if (stageButton) stageButton.disabled = !hasFolder || !selectedUnstagedFiles.length;
      if (discardButton) discardButton.disabled = !hasFolder || !isDiscardReady(selectedUnstagedFiles);
      if (unstageButton) {
        const hasActionSelection = isStashMode()
          ? isPopReady(selectedStashRefs)
          : !!getSelectedFilePaths(stagedFilesElement).length;
        unstageButton.disabled = !hasFolder || !hasActionSelection;
      }
      if (stashDropButton) stashDropButton.disabled = !hasFolder || !isStashMode() || !isDropReady(selectedStashRefs);
    }

    function updateCheckboxSelectAllState(checkboxes, selectAllInput) {
      const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
      if (!selectAllInput) return;
      selectAllInput.disabled = !checkboxes.length;
      selectAllInput.checked = !!checkboxes.length && checkedCount === checkboxes.length;
      selectAllInput.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
      updateFileActionAvailability();
    }

    function updateSelectAllState(container, selectAllInput) {
      updateCheckboxSelectAllState(getFileCheckboxes(container), selectAllInput);
    }

    function updateStashSelectAllState() {
      updateCheckboxSelectAllState(getStashCheckboxes(stagedFilesElement), stagedSelectAllInput);
    }

    function updateAllSelectAllStates() {
      updateSelectAllState(unstagedFilesElement, unstagedSelectAllInput);
      if (isStashMode()) {
        updateStashSelectAllState();
      } else {
        updateSelectAllState(stagedFilesElement, stagedSelectAllInput);
      }
    }

    function notifyGitAiCommitSummaryAvailability() {
      // The AI commit-summary module refreshes its button state whenever the
      // commit controls re-render, so both stay in sync without polling.
      app.modules?.gitAiCommitSummary?.updateAvailability?.();
    }

    function updateCommitAvailability() {
      notifyGitAiCommitSummaryAvailability();
      if (!commitButton) return;
      const hasFolder = !!getActiveFolderPath() && deps.isDesktopRuntime?.();
      commitButton.disabled = !hasFolder || !isCommitReady(lastStatus?.status, commitInput?.value || "");
    }

    function updatePushAvailability() {
      if (!pushButton) return;
      const hasFolder = !!getActiveFolderPath() && deps.isDesktopRuntime?.();
      pushButton.disabled = !hasFolder || !isPushReady(lastStatus?.status);
    }

    function renderFileList(container, files, emptyMessage, scope) {
      if (!container) return;
      if (!files.length) {
        container.innerHTML = `<div class="workspace-git-empty">${escapeHtml(emptyMessage)}</div>`;
        return;
      }
      container.innerHTML = files.map((file) => renderGitFileRow(file, scope)).join("");
    }

    function renderStashList(container, stashes) {
      if (!container) return;
      if (!stashes.length) {
        container.innerHTML = `<div class="workspace-git-empty">No stashed files.</div>`;
        return;
      }
      container.innerHTML = stashes.map((stash) => renderGitStashRow(stash)).join("");
    }

    function renderSecondaryList(status, emptyMessage = "No staged files.") {
      if (isStashMode()) {
        renderStashList(stagedFilesElement, lastStashes);
      } else {
        renderFileList(stagedFilesElement, status?.staged || [], emptyMessage, "staged");
      }
    }

    function updateWorkspaceGitModeControls() {
      const stashMode = isStashMode();
      if (modeTitleElement) modeTitleElement.textContent = stashMode ? "Stashes" : "Changed Files";
      if (secondaryTitleElement) secondaryTitleElement.textContent = stashMode ? "Stashed Files" : "Staged Files";
      if (stageButton) stageButton.textContent = stashMode ? "Stash" : "Stage";
      if (unstageButton) unstageButton.textContent = stashMode ? "Pop" : "Unstage";
      if (stashDropButton) stashDropButton.hidden = !stashMode;
      if (stagedSelectAllLabel) stagedSelectAllLabel.hidden = false;
      if (commitLabel) commitLabel.hidden = stashMode;
      if (commitInput) commitInput.hidden = stashMode;
      if (commitActions) commitActions.hidden = stashMode;
      modeOptionButtons.forEach((button) => {
        const active = button.dataset.gitMode === gitPanelMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      updateFileActionAvailability();
    }

    function renderEmpty(message) {
      renderBranchSummary(null);
      renderFileList(unstagedFilesElement, [], message, "unstaged");
      renderSecondaryList(null, message);
      updateAllSelectAllStates();
      updatePushAvailability();
      updateCommitAvailability();
      updateWorkspaceGitModeControls();
    }

    function renderStatus(result) {
      lastStatus = result || null;
      if (!result?.isRepo) {
        setStatus("The opened folder is not a Git repository.");
        renderEmpty("No repository found in this folder.");
        return;
      }
      const status = result.status || {};
      const files = status.files || [];
      const stagedFiles = status.staged || [];
      const unstagedFiles = status.unstaged || [];
      renderBranchSummary(status);
      setStatus(files.length ? `${unstagedFiles.length} changed, ${stagedFiles.length} staged.` : "Working tree clean.");
      renderFileList(unstagedFilesElement, unstagedFiles, "No changed files.", "unstaged");
      renderSecondaryList(status);
      updateAllSelectAllStates();
      updatePushAvailability();
      updateCommitAvailability();
      updateWorkspaceGitModeControls();
    }

    function renderGitResult(result) {
      if (Array.isArray(result?.stashes)) lastStashes = result.stashes;
      if (result?.status || result?.isRepo === false) {
        renderStatus(result);
      } else {
        renderSecondaryList(lastStatus?.status);
        updateAllSelectAllStates();
        updateWorkspaceGitModeControls();
        if (result?.action === "stashList") setStatus(`${lastStashes.length} stashed ${lastStashes.length === 1 ? "entry" : "entries"}.`);
      }
    }

    async function openGitFileCompare(filePath, scope, originalPath) {
      if (!deps.openFileCompareInTab) throw new Error("Compare tabs are unavailable.");
      setBusy(true);
      setStatus(`Opening ${scope === "staged" ? "staged" : "changed"} comparison...`);
      try {
        const result = await runGitAction(getActiveFolderPath(), "compareFile", { filePath, originalPath, scope });
        const tab = deps.openFileCompareInTab(result?.compare);
        if (!tab) throw new Error("Unable to open the compare tab.");
        setStatus(`Opened comparison for ${filePath}.`);
        return tab;
      } catch (error) {
        setStatus(error?.message || "Unable to compare the selected file.");
        throw error;
      } finally {
        setBusy(false);
      }
    }

    async function openGitConflictCompare(filePath) {
      if (!deps.openFileCompareInTab) throw new Error("Compare tabs are unavailable.");
      setBusy(true);
      setStatus("Opening conflict resolver...");
      try {
        const result = await runGitAction(getActiveFolderPath(), "compareConflictFile", { filePath });
        const tab = deps.openFileCompareInTab(result?.compare);
        if (!tab) throw new Error("Unable to open the conflict resolver.");
        setStatus(`Opened conflict resolver for ${filePath}.`);
        return tab;
      } catch (error) {
        setStatus(error?.message || "Unable to open the conflict resolver.");
        throw error;
      } finally {
        setBusy(false);
      }
    }

    async function openGitStashFileCompare(stashRef, filePath, originalPath) {
      if (!deps.openFileCompareInTab) throw new Error("Compare tabs are unavailable.");
      setBusy(true);
      setStatus("Opening stashed comparison...");
      try {
        const result = await runGitAction(getActiveFolderPath(), "compareStashFile", { stashRef, filePath, originalPath });
        const tab = deps.openFileCompareInTab(result?.compare);
        if (!tab) throw new Error("Unable to open the compare tab.");
        setStatus(`Opened stashed comparison for ${filePath}.`);
        return tab;
      } catch (error) {
        setStatus(error?.message || "Unable to compare the stashed file.");
        throw error;
      } finally {
        setBusy(false);
      }
    }

    async function notifyStashPopConflicts(statusResult) {
      const conflictFiles = getGitConflictFiles(statusResult?.status);
      if (!conflictFiles.length) return false;
      const firstConflict = conflictFiles[0]?.path || "";
      const conflictMessage = getStashPopConflictMessage(conflictFiles.length);
      alertUser(`${conflictMessage}\n\nThe stash entry was kept by Git because the pop had conflicts.`);
      if (firstConflict) await openGitConflictCompare(firstConflict).catch(() => {});
      setStatus(conflictMessage);
      return true;
    }

    async function markWorkspaceGitConflictResolved(filePath) {
      const files = normalizeFiles([filePath]);
      if (!files.length) throw new Error("Git file path is required.");
      const result = await runAction("stage", { files });
      setStatus(`Saved resolution for ${files[0]}. Git staged it to mark the conflict resolved. The stash entry remains until you drop it.`);
      return result;
    }

    async function runAction(action, options = {}) {
      setBusy(true);
      setStatus(`Running git ${action}...`);
      let suppressTimer = null;
      let suppressingWatcher = false;
      function scheduleWatcherSuppression() {
        if (!shouldSuppressFolderWatcherForGitAction(action) || typeof deps.suppressFolderWatcher !== "function") return;
        suppressingWatcher = true;
        deps.suppressFolderWatcher(1000);
        if (typeof global.setTimeout === "function") suppressTimer = global.setTimeout(scheduleWatcherSuppression, 500);
      }
      try {
        scheduleWatcherSuppression();
        const result = await runGitAction(getActiveFolderPath(), action, options);
        renderGitResult(result);
        if (action === "stashPop") await notifyStashPopConflicts(result);
        return result;
      } catch (error) {
        if (action === "stashPop" && isStashPopConflictError(error)) {
          const statusResult = await runGitAction(getActiveFolderPath(), "status").catch(() => null);
          const stashResult = await runGitAction(getActiveFolderPath(), "stashList").catch(() => null);
          if (Array.isArray(stashResult?.stashes)) lastStashes = stashResult.stashes;
          if (statusResult) renderGitResult({ ...statusResult, stashes: lastStashes });
          await notifyStashPopConflicts(statusResult);
          return statusResult;
        }
        if (action === "stashPop" && isStashPopLocalOverwriteError(error)) {
          const statusResult = await runGitAction(getActiveFolderPath(), "status").catch(() => null);
          const stashResult = await runGitAction(getActiveFolderPath(), "stashList").catch(() => null);
          if (Array.isArray(stashResult?.stashes)) lastStashes = stashResult.stashes;
          if (statusResult) renderGitResult({ ...statusResult, stashes: lastStashes });
          return blockStashPopForDirtyFiles([], error?.message || "");
        }
        setStatus(error?.message || `Git ${action} failed.`);
        throw error;
      } finally {
        if (suppressTimer && typeof global.clearTimeout === "function") global.clearTimeout(suppressTimer);
        if (suppressingWatcher) deps.suppressFolderWatcher?.(500);
        setBusy(false);
      }
    }

    function openWorkspaceGitPanel() {
      deps.setSidebarView?.("git");
      if (!deps.setSidebarView) return refreshWorkspaceGitStatus();
      return lastStatus;
    }

    function refreshWorkspaceGitStatus() {
      if (!updateWorkspaceGitAvailability()) return Promise.resolve(null);
      const result = runAction("status");
      if (isStashMode()) result.then(() => runAction("stashList")).catch(() => {});
      return result;
    }

    function setWorkspaceGitMode(mode) {
      if (!GIT_PANEL_MODES.has(mode)) return;
      gitPanelMode = mode;
      renderSecondaryList(lastStatus?.status);
      updateAllSelectAllStates();
      updateWorkspaceGitModeControls();
      if (isStashMode() && getActiveFolderPath() && deps.isDesktopRuntime?.()) runAction("stashList").catch(() => {});
    }

    function createWorkspaceGitStash() {
      const files = getSelectedFilePaths(unstagedFilesElement);
      if (!files.length) {
        setStatus("Select files to stash.");
        updateFileActionAvailability();
        return null;
      }
      const affectedPaths = resolveWorkspaceGitFilePaths(getActiveFolderPath(), files);
      return runAction("stashCreate", { files, message: "MD-Editor stash" })
        .then((result) => reloadOpenTabsFromDisk(affectedPaths).then(() => result));
    }

    function popWorkspaceGitStash() {
      const stashRefs = getSelectedStashRefs(stagedFilesElement);
      if (stashRefs.length !== 1) {
        setStatus("Select one stash to pop.");
        updateFileActionAvailability();
        return null;
      }
      const stashFiles = getStashFilePaths(stashRefs[0]);
      const overlappingFiles = getStashPopDirtyOverlap(lastStatus?.status, stashFiles);
      if (overlappingFiles.length) return blockStashPopForDirtyFiles(overlappingFiles);
      const affectedPaths = resolveWorkspaceGitFilePaths(getActiveFolderPath(), stashFiles);
      return runAction("stashPop", { stashRef: stashRefs[0] })
        .then((result) => reloadOpenTabsFromDisk(affectedPaths).then(() => result));
    }

    function confirmDiscardChanges(fileCount) {
      const noun = fileCount === 1 ? "file" : "files";
      return confirmWorkspaceGitAction(`Discard changes in ${fileCount} selected ${noun}? This cannot be undone.`, { confirmLabel: "Discard", confirmVariant: "danger" });
    }

    async function discardWorkspaceGitChanges() {
      const files = getSelectedFilePaths(unstagedFilesElement);
      if (!files.length) {
        setStatus("Select files to discard.");
        updateFileActionAvailability();
        return null;
      }
      if (!await confirmDiscardChanges(files.length)) {
        setStatus("Discard stopped. No changes were made.");
        return null;
      }
      const groups = getDiscardFileGroups(lastStatus?.status, files);
      const trackedPaths = resolveWorkspaceGitFilePaths(getActiveFolderPath(), groups.tracked);
      const untrackedPaths = resolveWorkspaceGitFilePaths(getActiveFolderPath(), groups.untracked);
      return runAction("discardChanges", { files })
        .then((result) => {
          closeOpenTabsForPaths(untrackedPaths);
          return reloadOpenTabsFromDisk(trackedPaths).then(() => result);
        });
    }

    function confirmDropStashes(stashCount) {
      const noun = stashCount === 1 ? "stash entry" : "stash entries";
      return confirmWorkspaceGitAction(`Drop ${stashCount} selected ${noun}? This cannot be undone.`, { confirmLabel: "Drop", confirmVariant: "danger" });
    }

    async function dropWorkspaceGitStashes() {
      const stashRefs = getSelectedStashRefs(stagedFilesElement);
      if (!stashRefs.length) {
        setStatus("Select stashes to drop.");
        updateFileActionAvailability();
        return null;
      }
      if (!await confirmDropStashes(stashRefs.length)) {
        setStatus("Drop stopped. No changes were made.");
        return null;
      }
      return runAction("stashDrop", { stashRefs });
    }

    function getResetBranchFromUser() {
      const branch = global.prompt?.("Reset this checkout to origin/<branch>. Enter branch name:", "main");
      if (branch === null || branch === undefined) return "";
      return normalizeBranchName(branch);
    }

    function confirmResetToRemote(branch) {
      const message = [
        "WARNING: This will delete all local tracked changes and all untracked files/folders.",
        `It will reset this checkout to origin/${branch}.`,
        "",
        "Continue?"
      ].join("\n");
      return confirmWorkspaceGitAction(message, { confirmLabel: "Reset", confirmVariant: "danger" });
    }

    async function resetWorkspaceGitToRemote() {
      let branch = "";
      try {
        branch = getResetBranchFromUser();
      } catch (error) {
        setStatus(error?.message || "Branch name is invalid.");
        return null;
      }
      if (!branch) {
        setStatus("Reset stopped. No changes were made.");
        return null;
      }
      if (!await confirmResetToRemote(branch)) {
        setStatus("Reset stopped. No changes were made.");
        return null;
      }
      return runAction("resetToRemote", { branch });
    }

    function updateWorkspaceGitAvailability() {
      const hasFolder = !!getActiveFolderPath() && deps.isDesktopRuntime?.();
      openButtons.forEach((button) => {
        button.disabled = !hasFolder;
        button.setAttribute("aria-disabled", hasFolder ? "false" : "true");
        button.title = hasFolder ? "Open Git panel" : "Open a local folder to use Git";
      });
      [branchButton, branchesFullButton, tagsFullButton, refreshButton, resetButton, fetchButton, pullButton, pushButton, stageButton, discardButton, unstageButton, stashDropButton, commitButton].forEach((button) => {
        if (button) button.disabled = !hasFolder;
      });
      if (commitInput) commitInput.disabled = !hasFolder;
      if (hasFolder) {
        updateAllSelectAllStates();
        updatePushAvailability();
        updateCommitAvailability();
        updateWorkspaceGitModeControls();
      } else {
        [unstagedSelectAllInput, stagedSelectAllInput].forEach((input) => {
          if (input) input.disabled = true;
        });
      }
      if (!hasFolder) {
        lastStatus = null;
        renderEmpty("Open a local folder to use Git.");
        setStatus("Git integration is available for opened desktop folders.");
      }
      return hasFolder;
    }

    branchButton?.addEventListener("click", (event) => {
      event.stopPropagation?.();
      if (branchDropdown && !branchDropdown.classList.contains("hidden")) closeBranchDropdown();
      else openWorkspaceGitBranchSwitcher().catch(() => {});
    });
    branchesFullButton?.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openWorkspaceGitFullRefList("branches").catch(() => {});
    });
    tagsFullButton?.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openWorkspaceGitFullRefList("tags").catch(() => {});
    });
    branchDropdownSearch?.addEventListener("input", () => {
      branchDropdownSearchText = branchDropdownSearch.value || "";
      renderBranchDropdown();
    });
    branchModalSearch?.addEventListener("input", () => {
      branchModalSearchText = branchModalSearch.value || "";
      renderBranchModal();
    });
    branchDropdownTabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        branchDropdownMode = button.dataset.gitRefTab === "tags" ? "tags" : "branches";
        branchDropdownSearchText = "";
        if (branchDropdownSearch) branchDropdownSearch.value = "";
        renderBranchDropdown();
      });
    });
    branchModalTabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        branchModalMode = button.dataset.gitRefTab === "tags" ? "tags" : "branches";
        branchModalSearchText = "";
        if (branchModalSearch) branchModalSearch.value = "";
        renderBranchModal();
      });
    });
    branchViewAllButton?.addEventListener("click", () => openBranchModal());
    branchModalCloseButton?.addEventListener("click", () => closeBranchModal());
    branchModal?.addEventListener("click", (event) => {
      if (event.target === branchModal) closeBranchModal();
    });
    branchDropdownList?.addEventListener("click", (event) => {
      const tagCreateButton = event.target?.closest?.(".workspace-git-tag-create-option");
      if (tagCreateButton) {
        createWorkspaceGitTagFromButton(tagCreateButton).catch((error) => setStatus(error?.message || "Unable to create tag."));
        return;
      }
      const button = event.target?.closest?.(".workspace-git-branch-option");
      if (button) switchWorkspaceGitBranchFromButton(button).catch(() => {});
    });
    branchModalList?.addEventListener("click", (event) => {
      const tagCopyButton = event.target?.closest?.(".workspace-git-tag-copy");
      if (tagCopyButton) {
        event.stopPropagation?.();
        copyTagName(tagCopyButton.dataset.tagName).catch((error) => setStatus(error?.message || "Unable to copy tag name."));
        return;
      }
      const tagMenuButton = event.target?.closest?.(".workspace-git-tag-menu-button");
      if (tagMenuButton) {
        event.stopPropagation?.();
        openBranchActionMenu(tagMenuButton);
        return;
      }
      const tagCreateButton = event.target?.closest?.(".workspace-git-tag-create-option");
      if (tagCreateButton) {
        event.stopPropagation?.();
        createWorkspaceGitTagFromButton(tagCreateButton).catch((error) => setStatus(error?.message || "Unable to create tag."));
        return;
      }
      const copyButton = event.target?.closest?.(".workspace-git-branch-copy");
      if (copyButton) {
        event.stopPropagation?.();
        copyBranchName(copyButton.dataset.branchName).catch((error) => setStatus(error?.message || "Unable to copy branch name."));
        return;
      }
      const activityButton = event.target?.closest?.(".workspace-git-branch-activity");
      if (activityButton) {
        event.stopPropagation?.();
        showBranchActivity(getBranchActionDataset(activityButton)).catch((error) => setStatus(error?.message || "Unable to load branch activity."));
        return;
      }
      const menuButton = event.target?.closest?.(".workspace-git-branch-menu-button");
      if (menuButton) {
        event.stopPropagation?.();
        openBranchActionMenu(menuButton);
        return;
      }
      const button = event.target?.closest?.(".workspace-git-branch-option");
      if (button) switchWorkspaceGitBranchFromButton(button).catch(() => {});
    });
    if (global.document?.addEventListener) {
      global.document.addEventListener("click", (event) => {
        if (branchActionMenu && !branchActionMenu.classList.contains("hidden") && !branchActionMenu.contains(event.target) && !event.target?.closest?.(".workspace-git-branch-menu-button") && !event.target?.closest?.(".workspace-git-tag-menu-button")) closeBranchActionMenu();
        if (!branchDropdown || branchDropdown.classList.contains("hidden")) return;
        if (branchDropdown.contains(event.target) || branchButton?.contains(event.target)) return;
        closeBranchDropdown();
      });
    }
    if (global.addEventListener) {
      global.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeBranchActionMenu();
        closeBranchActivityDialog();
        closeBranchDropdown();
        closeBranchModal();
      });
    }
    refreshButton?.addEventListener("click", () => refreshWorkspaceGitStatus());
    resetButton?.addEventListener("click", () => resetWorkspaceGitToRemote()?.catch(() => {}));
    fetchButton?.addEventListener("click", () => runAction("fetch"));
    pullButton?.addEventListener("click", () => runAction("pull"));
    pushButton?.addEventListener("click", () => runAction("push"));
    modeOptionButtons.forEach((button) => button.addEventListener("click", () => setWorkspaceGitMode(button.dataset.gitMode || "push")));
    stageButton?.addEventListener("click", () => {
      if (isStashMode()) return createWorkspaceGitStash()?.catch(() => {});
      return runAction("stage", { files: getSelectedFilePaths(unstagedFilesElement) });
    });
    discardButton?.addEventListener("click", () => discardWorkspaceGitChanges()?.catch(() => {}));
    unstageButton?.addEventListener("click", () => {
      if (isStashMode()) return popWorkspaceGitStash()?.catch(() => {});
      return runAction("unstage", { files: getSelectedFilePaths(stagedFilesElement) });
    });
    stashDropButton?.addEventListener("click", () => dropWorkspaceGitStashes()?.catch(() => {}));
    statusDetailsButton?.addEventListener("click", () => openStatusDetails());
    statusDetailsCloseButton?.addEventListener("click", () => closeStatusDetails());
    statusDetailsDoneButton?.addEventListener("click", () => closeStatusDetails());
    statusDetailsModal?.addEventListener("click", (event) => {
      if (event.target === statusDetailsModal) closeStatusDetails();
    });
    unstagedSelectAllInput?.addEventListener("change", () => {
      getFileCheckboxes(unstagedFilesElement).forEach((checkbox) => {
        checkbox.checked = unstagedSelectAllInput.checked;
      });
      updateSelectAllState(unstagedFilesElement, unstagedSelectAllInput);
    });
    stagedSelectAllInput?.addEventListener("change", () => {
      const checkboxes = isStashMode() ? getStashCheckboxes(stagedFilesElement) : getFileCheckboxes(stagedFilesElement);
      checkboxes.forEach((checkbox) => {
        checkbox.checked = stagedSelectAllInput.checked;
      });
      if (isStashMode()) updateStashSelectAllState();
      else updateSelectAllState(stagedFilesElement, stagedSelectAllInput);
    });
    unstagedFilesElement?.addEventListener("change", (event) => {
      if (event.target?.classList?.contains("workspace-git-file-check")) updateSelectAllState(unstagedFilesElement, unstagedSelectAllInput);
    });
    stagedFilesElement?.addEventListener("change", (event) => {
      if (event.target?.classList?.contains("workspace-git-stash-check")) {
        updateStashSelectAllState();
      }
      if (event.target?.classList?.contains("workspace-git-file-check")) updateSelectAllState(stagedFilesElement, stagedSelectAllInput);
    });
    unstagedFilesElement?.addEventListener("click", (event) => {
      const button = event.target?.closest?.(".workspace-git-file-compare");
      if (button?.dataset.conflict === "true") openGitConflictCompare(button.dataset.filePath).catch(() => {});
      else if (button) openGitFileCompare(button.dataset.filePath, button.dataset.scope, button.dataset.originalPath).catch(() => {});
    });
    stagedFilesElement?.addEventListener("click", (event) => {
      const stashFileButton = event.target?.closest?.(".workspace-git-stash-file-compare");
      if (stashFileButton) {
        openGitStashFileCompare(stashFileButton.dataset.stashRef, stashFileButton.dataset.filePath, stashFileButton.dataset.originalPath).catch(() => {});
        return;
      }
      const button = event.target?.closest?.(".workspace-git-file-compare");
      if (button) openGitFileCompare(button.dataset.filePath, button.dataset.scope, button.dataset.originalPath).catch(() => {});
    });
    commitInput?.addEventListener("input", () => updateCommitAvailability());
    commitButton?.addEventListener("click", async () => {
      await runAction("commit", { message: commitInput?.value || "" });
      if (commitInput) commitInput.value = "";
      updateCommitAvailability();
    });
    openButtons.forEach((button) => button.addEventListener("click", () => openWorkspaceGitPanel()));

    const api = {
      buildDirectGitCommand,
      createStatusResult,
      openWorkspaceGitPanel,
      parseBranchStatus,
      parsePorcelainStatus,
      refreshWorkspaceGitStatus,
      markWorkspaceGitConflictResolved,
      resetWorkspaceGitToRemote,
      updateWorkspaceGitAvailability,
      runGitPanelAction: runAction,
      getLastGitStatus: function() { return lastStatus; },
      updateCommitAvailability,
      _test: { buildChangesDigest, capDigestPatchText, capUntrackedDigestEntries, enforceDigestTotalBudget, buildDirectGitCommand, createBranchList, createGitCompareDescriptor, createGitConflictCompareDescriptor, createGitStashCompareDescriptor, createStatusResult, formatBranchUpdatedAt, formatGitStatusMessage, getBranchActionData, getBranchCreateSuggestion, getBranchDisplayName, getBranchListCount, getBranchSourceLabel, getBranchSwitchMode, getDirtyStatusPaths, getDiscardFileGroups, getGitConflictFiles, getGitFilePathPair, getLocalBranchNameFromRemote, getStashPopBlockedMessage, getStashPopConflictMessage, getStashPopDirtyOverlap, getTagCreateSuggestion, isCommitReady, isDiscardReady, isDropReady, isGitConflictFile, isGitStatusDirty, isPopReady, isPushReady, isStashPopConflictError, isStashPopLocalOverwriteError, isTabUnsaved, normalizeBranchActivityLimit, normalizeBranchActivitySkip, normalizeBranchName, normalizeFiles, normalizeRemoteBranchName, normalizeStashRef, normalizeTagName, parseBranchActivityOutput, parseBranchStatus, parseLocalBranchListOutput, parsePorcelainStatus, parseRemoteBranchListOutput, parseStashFilesOutput, parseStashListOutput, parseTagListOutput, renderBranchModalItems, renderTagModalItems, renderGitFileRow, renderGitStashRow, resolveWorkspaceGitFilePaths, shouldSuppressFolderWatcherForGitAction, sortStashRefsForDrop, splitRemoteBranchName }
    };
    app.registerModule("workspaceGit", api);
    updateWorkspaceGitAvailability();
    return api;
  }

  global.registerMarkdownViewerWorkspaceGit = registerMarkdownViewerWorkspaceGit;
})(typeof window !== "undefined" ? window : globalThis);
