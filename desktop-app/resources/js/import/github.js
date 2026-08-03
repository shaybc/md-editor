(function(global) {
  global.registerMarkdownViewerGitHubImport = function registerMarkdownViewerGitHubImport(app, deps) {
    const api = {};

    with (deps) {
  function buildRawGitHubUrl(owner, repo, ref, filePath) {
    const encodedPath = filePath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`;
  }

  async function fetchGitHubJson(url) {
    const now = Date.now();
    const waitTime = GITHUB_IMPORT_MIN_REQUEST_INTERVAL_MS - (now - lastGitHubImportRequestAt);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastGitHubImportRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status})`);
    }
    return response.json();
  }

  async function fetchTextContent(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file (${response.status})`);
    }
    return response.text();
  }

  function parseGitHubImportUrl(input) {
    let parsedUrl;
    try {
      parsedUrl = new URL((input || "").trim());
    } catch (_) {
      return null;
    }

    const host = parsedUrl.hostname.replace(/^www\./, "");
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (host === "raw.githubusercontent.com") {
      if (segments.length < 5) return null;
      const [owner, repo, ref, ...rest] = segments;
      const filePath = rest.join("/");
      return { owner, repo, ref, type: "file", filePath };
    }

    if (host !== "github.com" || segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");
    if (segments.length === 2) {
      return { owner, repo, type: "repo" };
    }

    const mode = segments[2];
    if (mode === "blob" && segments.length >= 5) {
      return {
        owner,
        repo,
        type: "file",
        ref: segments[3],
        filePath: segments.slice(4).join("/")
      };
    }

    if (mode === "tree" && segments.length >= 4) {
      return {
        owner,
        repo,
        type: "tree",
        ref: segments[3],
        basePath: segments.slice(4).join("/")
      };
    }

    return { owner, repo, type: "repo" };
  }

  async function getDefaultBranch(owner, repo) {
    const repoInfo = await fetchGitHubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    return repoInfo.default_branch;
  }

  async function listMarkdownFiles(owner, repo, ref, basePath) {
    const treeResponse = await fetchGitHubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    const normalizedBasePath = (basePath || "").replace(/^\/+|\/+$/g, "");

    return (treeResponse.tree || [])
      .filter((entry) => entry.type === "blob" && isMarkdownPath(entry.path))
      .filter((entry) => !normalizedBasePath || entry.path === normalizedBasePath || entry.path.startsWith(normalizedBasePath + "/"))
      .map((entry) => entry.path)
      .sort((a, b) => a.localeCompare(b));
  }

  function buildMarkdownFileTree(paths) {
    const root = { folders: {}, files: [] };
    (paths || []).forEach((path) => {
      const segments = (path || "").split("/").filter(Boolean);
      if (!segments.length) return;
      const fileName = segments.pop();
      let node = root;
      segments.forEach((segment) => {
        if (!node.folders[segment]) {
          node.folders[segment] = { folders: {}, files: [] };
        }
        node = node.folders[segment];
      });
      node.files.push({ name: fileName, path });
    });
    return root;
  }

  function updateGitHubImportSelectedCount() {
    if (!githubImportSelectedCount) return;
    const count = selectedGitHubImportPaths.size;
    githubImportSelectedCount.textContent = `${count} selected`;
  }

  function updateGitHubSelectAllButtonLabel() {
    if (!githubImportSelectAllBtn) return;
    const total = availableGitHubImportPaths.length;
    const allSelected = total > 0 && selectedGitHubImportPaths.size === total;
    githubImportSelectAllBtn.textContent = allSelected ? "Clear All" : "Select All";
  }

  function syncGitHubSelectionToButtons() {
    if (!githubImportTree) return;
    Array.from(githubImportTree.querySelectorAll(".github-tree-file-btn")).forEach((btn) => {
      const isSelected = selectedGitHubImportPaths.has(btn.dataset.path);
      btn.classList.toggle("is-selected", isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  function setGitHubSelectedPaths(paths) {
    selectedGitHubImportPaths.clear();
    (paths || []).forEach((path) => selectedGitHubImportPaths.add(path));
    updateGitHubImportSelectedCount();
    syncGitHubSelectionToButtons();
    updateGitHubSelectAllButtonLabel();
  }

  function toggleGitHubSelectedPath(path) {
    if (!path) return;
    if (selectedGitHubImportPaths.has(path)) {
      selectedGitHubImportPaths.delete(path);
    } else {
      selectedGitHubImportPaths.add(path);
    }
    updateGitHubImportSelectedCount();
    syncGitHubSelectionToButtons();
    updateGitHubSelectAllButtonLabel();
  }

  function renderGitHubImportTree(paths) {
    if (!githubImportTree || !githubImportFileSelect) return;
    githubImportTree.innerHTML = "";
    const tree = buildMarkdownFileTree(paths);

    const createTreeBranch = function(node, parentPath) {
      const list = document.createElement("ul");
      const folderNames = Object.keys(node.folders).sort((a, b) => a.localeCompare(b));
      folderNames.forEach((folderName) => {
        const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const item = document.createElement("li");
        const folderLabel = document.createElement("span");
        folderLabel.className = "github-tree-folder-label";
        folderLabel.textContent = `📁 ${folderName}`;
        item.appendChild(folderLabel);
        item.appendChild(createTreeBranch(node.folders[folderName], folderPath));
        list.appendChild(item);
      });

      node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .forEach((file) => {
          const fileItem = document.createElement("li");
          const fileButton = document.createElement("button");
          fileButton.type = "button";
          fileButton.className = "github-tree-file-btn";
          fileButton.dataset.path = file.path;
          fileButton.setAttribute("aria-pressed", "false");
          fileButton.textContent = `📄 ${file.name}`;
          fileButton.addEventListener("click", function() {
            toggleGitHubSelectedPath(file.path);
          });
          fileItem.appendChild(fileButton);
          list.appendChild(fileItem);
        });

      return list;
    };

    githubImportTree.appendChild(createTreeBranch(tree, ""));
    syncGitHubSelectionToButtons();
  }

  function setGitHubImportLoading(isLoading) {
    if (!githubImportSubmitBtn) return;
    if (isLoading) {
      githubImportSubmitBtn.dataset.loadingText = githubImportSubmitBtn.textContent;
      githubImportSubmitBtn.textContent = "Importing...";
    } else if (githubImportSubmitBtn.dataset.loadingText) {
      githubImportSubmitBtn.textContent = githubImportSubmitBtn.dataset.loadingText;
      delete githubImportSubmitBtn.dataset.loadingText;
    }
  }

  function setGitHubImportMessage(message, options = {}) {
    if (!githubImportError) return;
    const { isError = true } = options;
    githubImportError.classList.toggle("is-info", !isError);
    if (!message) {
      githubImportError.textContent = "";
      githubImportError.style.display = "none";
      return;
    }
    githubImportError.textContent = message;
    githubImportError.style.display = "block";
  }

  function resetGitHubImportModal() {
    if (!githubImportUrlInput || !githubImportFileSelect || !githubImportSubmitBtn) return;
    if (githubImportTitle) {
      githubImportTitle.textContent = "Import Markdown from GitHub";
    }
    githubImportUrlInput.value = "";
    githubImportUrlInput.style.display = "block";
    githubImportUrlInput.disabled = false;
    githubImportFileSelect.innerHTML = "";
    githubImportFileSelect.style.display = "none";
    githubImportFileSelect.disabled = false;
    if (githubImportSelectionToolbar) {
      githubImportSelectionToolbar.style.display = "none";
    }
    availableGitHubImportPaths = [];
    setGitHubSelectedPaths([]);
    if (githubImportTree) {
      githubImportTree.innerHTML = "";
      githubImportTree.style.display = "none";
    }
    githubImportSubmitBtn.dataset.step = "url";
    delete githubImportSubmitBtn.dataset.owner;
    delete githubImportSubmitBtn.dataset.repo;
    delete githubImportSubmitBtn.dataset.ref;
    githubImportSubmitBtn.textContent = "Import";
    setGitHubImportMessage("");
  }

  function openGitHubImportModal() {
    if (!githubImportModal || !githubImportUrlInput || !githubImportSubmitBtn) return;
    resetGitHubImportModal();
    githubImportModal.style.display = "flex";
    githubImportUrlInput.focus();
  }

  function closeGitHubImportModal() {
    if (!githubImportModal) return;
    githubImportModal.style.display = "none";
    resetGitHubImportModal();
  }

  async function handleGitHubImportSubmit() {
    if (!githubImportSubmitBtn || !githubImportUrlInput || !githubImportFileSelect) return;
    const setGitHubImportDialogDisabled = (disabled) => {
      githubImportSubmitBtn.disabled = disabled;
      if (githubImportCancelBtn) {
        githubImportCancelBtn.disabled = disabled;
      }
      if (githubImportSelectAllBtn) {
        githubImportSelectAllBtn.disabled = disabled;
      }
    };
    const step = githubImportSubmitBtn.dataset.step || "url";
    if (step === "select") {
      const selectedPaths = Array.from(selectedGitHubImportPaths);
      const owner = githubImportSubmitBtn.dataset.owner;
      const repo = githubImportSubmitBtn.dataset.repo;
      const ref = githubImportSubmitBtn.dataset.ref;
      if (!owner || !repo || !ref || !selectedPaths.length) {
        setGitHubImportMessage("Please select at least one file to import.");
        return;
      }
      setGitHubImportLoading(true);
      setGitHubImportDialogDisabled(true);
      try {
        for (const selectedPath of selectedPaths) {
          const markdown = await fetchTextContent(buildRawGitHubUrl(owner, repo, ref, selectedPath));
          newTab(markdown, getFileName(selectedPath).replace(/\.(md|markdown)$/i, ""));
        }
        closeGitHubImportModal();
      } catch (error) {
        console.error("GitHub import failed:", error);
        setGitHubImportMessage("GitHub import failed: " + error.message);
      } finally {
        setGitHubImportDialogDisabled(false);
        setGitHubImportLoading(false);
      }
      return;
    }

    const urlInput = githubImportUrlInput.value.trim();
    if (!urlInput) {
      setGitHubImportMessage("Please enter a GitHub URL.");
      return;
    }

    const parsed = parseGitHubImportUrl(urlInput);
    if (!parsed || !parsed.owner || !parsed.repo) {
      setGitHubImportMessage("Please enter a valid GitHub URL.");
      return;
    }

    setGitHubImportMessage("");
    setGitHubImportLoading(true);
    setGitHubImportDialogDisabled(true);
    try {
      if (parsed.type === "file") {
        if (!isMarkdownPath(parsed.filePath)) {
          throw new Error("The provided URL does not point to a Markdown file.");
        }
        const markdown = await fetchTextContent(buildRawGitHubUrl(parsed.owner, parsed.repo, parsed.ref, parsed.filePath));
        newTab(markdown, getFileName(parsed.filePath).replace(/\.(md|markdown)$/i, ""));
        closeGitHubImportModal();
        return;
      }

      const ref = parsed.ref || await getDefaultBranch(parsed.owner, parsed.repo);
      const files = await listMarkdownFiles(parsed.owner, parsed.repo, ref, parsed.basePath || "");

      if (!files.length) {
        setGitHubImportMessage("No Markdown files were found at that GitHub location.");
        return;
      }

      const shownFiles = files.slice(0, MAX_GITHUB_FILES_SHOWN);
      if (files.length === 1) {
        const targetPath = files[0];
        const markdown = await fetchTextContent(buildRawGitHubUrl(parsed.owner, parsed.repo, ref, targetPath));
        newTab(markdown, getFileName(targetPath).replace(/\.(md|markdown)$/i, ""));
        closeGitHubImportModal();
        return;
      }

      githubImportFileSelect.innerHTML = "";
      githubImportUrlInput.style.display = "none";
      githubImportFileSelect.style.display = "none";
      if (githubImportSelectionToolbar) {
        githubImportSelectionToolbar.style.display = "flex";
      }
      if (githubImportTree) {
        githubImportTree.style.display = "block";
      }
      shownFiles.forEach((filePath) => {
        const option = document.createElement("option");
        option.value = filePath;
        option.textContent = filePath;
        githubImportFileSelect.appendChild(option);
      });
      availableGitHubImportPaths = shownFiles.slice();
      setGitHubSelectedPaths(shownFiles[0] ? [shownFiles[0]] : []);
      renderGitHubImportTree(shownFiles);
      if (files.length > MAX_GITHUB_FILES_SHOWN) {
        setGitHubImportMessage(`Showing first ${MAX_GITHUB_FILES_SHOWN} of ${files.length} Markdown files.`, { isError: false });
      } else {
        setGitHubImportMessage("");
      }
      if (githubImportTitle) {
        githubImportTitle.textContent = "Select Markdown file(s) to import";
      }
      githubImportSubmitBtn.dataset.step = "select";
      githubImportSubmitBtn.dataset.owner = parsed.owner;
      githubImportSubmitBtn.dataset.repo = parsed.repo;
      githubImportSubmitBtn.dataset.ref = ref;
      githubImportSubmitBtn.textContent = "Import Selected";
    } catch (error) {
      console.error("GitHub import failed:", error);
      setGitHubImportMessage("GitHub import failed: " + error.message);
    } finally {
      setGitHubImportDialogDisabled(false);
      setGitHubImportLoading(false);
    }
  }


      api.buildRawGitHubUrl = buildRawGitHubUrl;
      api.fetchGitHubJson = fetchGitHubJson;
      api.fetchTextContent = fetchTextContent;
      api.parseGitHubImportUrl = parseGitHubImportUrl;
      api.getDefaultBranch = getDefaultBranch;
      api.listMarkdownFiles = listMarkdownFiles;
      api.buildMarkdownFileTree = buildMarkdownFileTree;
      api.updateGitHubImportSelectedCount = updateGitHubImportSelectedCount;
      api.updateGitHubSelectAllButtonLabel = updateGitHubSelectAllButtonLabel;
      api.syncGitHubSelectionToButtons = syncGitHubSelectionToButtons;
      api.setGitHubSelectedPaths = setGitHubSelectedPaths;
      api.toggleGitHubSelectedPath = toggleGitHubSelectedPath;
      api.renderGitHubImportTree = renderGitHubImportTree;
      api.setGitHubImportLoading = setGitHubImportLoading;
      api.setGitHubImportMessage = setGitHubImportMessage;
      api.resetGitHubImportModal = resetGitHubImportModal;
      api.openGitHubImportModal = openGitHubImportModal;
      api.closeGitHubImportModal = closeGitHubImportModal;
      api.handleGitHubImportSubmit = handleGitHubImportSubmit;
    }

    return api;
  };
})(window);
