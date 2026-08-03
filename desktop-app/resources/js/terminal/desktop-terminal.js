(function(global) {
  "use strict";

  const DEFAULT_TERMINAL_PROFILE_ID = "git-cmd";
  const TERMINAL_TABS_STATE_KEY = "desktopTerminalTabs";
  const TERMINAL_BRIDGE_PATH = "resources/bridges/terminal-bridge/terminal-bridge.cjs";
  const TERMINAL_PROFILES = Object.freeze({
    "git-cmd": Object.freeze({ id: "git-cmd", label: "Git CMD", icon: "bi-terminal", homeStart: true }),
    "git-bash": Object.freeze({ id: "git-bash", label: "Git Bash", icon: "bi-git", homeStart: true }),
    cmd: Object.freeze({ id: "cmd", label: "Command Prompt", icon: "bi-window-terminal", homeStart: false }),
    powershell: Object.freeze({ id: "powershell", label: "PowerShell", icon: "bi-terminal-split", homeStart: false })
  });

  function encodeJsonRequest(request) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(request || {}))));
  }

  function quoteCommandArg(value) {
    const text = String(value || "");
    if (typeof NL_OS !== "undefined" && NL_OS !== "Windows") return `'${text.replace(/'/g, "'\\''")}'`;
    return `"${text.replace(/"/g, '\\"')}"`;
  }

  function createLineParser(onLine) {
    let pending = "";
    return function parseChunk(chunk) {
      pending += String(chunk || "");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      lines.forEach((line) => {
        if (line.trim()) onLine(line);
      });
    };
  }

  /**
   * Manage embedded desktop terminal tabs in the bottom panel.
   * @param {object} app - Application module registry.
   * @param {object} deps - Runtime and UI dependencies.
   * @returns {object} Terminal API.
   */
  function registerMarkdownViewerDesktopTerminal(app, deps = {}) {
    const sessionsByProcessId = new Map();
    const sessionsByTabId = new Map();
    const outputTextEncoder = typeof global.TextEncoder === "function" ? new global.TextEncoder() : null;
    let terminalCounter = 0;

    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function isDesktopRuntime() {
      return Boolean(deps.isNeutralinoRuntime?.() && getNeutralino()?.os?.spawnProcess && getNeutralino()?.os?.updateSpawnedProcess);
    }

    function logTerminal(level, message, details) {
      try {
        void deps.debugLog?.(level, `[terminal] ${message}`, details || {});
      } catch (_error) {
        // Debug logging must never interfere with terminal input.
      }
    }

    function hasProcessId(session) {
      return session?.processId !== null && session?.processId !== undefined;
    }

    function getLogProcessId(session) {
      return hasProcessId(session) ? session.processId : null;
    }

    async function getEnvValue(name) {
      try {
        return await getNeutralino()?.os?.getEnv?.(name) || "";
      } catch (_error) {
        return "";
      }
    }

    async function getUserHomeDirectory() {
      const homeDrive = await getEnvValue("HOMEDRIVE");
      const homePath = await getEnvValue("HOMEPATH");
      const windowsHome = `${homeDrive || ""}${homePath || ""}`.trim();
      return windowsHome || await getEnvValue("USERPROFILE") || await getEnvValue("HOME") || "";
    }

    function getProfile(profileId) {
      return TERMINAL_PROFILES[profileId] || TERMINAL_PROFILES[DEFAULT_TERMINAL_PROFILE_ID];
    }

    async function buildTerminalLaunchRequest(profileId, options = {}) {
      const profile = getProfile(profileId);
      const homeCwd = await getUserHomeDirectory();
      const workspaceCwd = String(deps.getActiveFolderPath?.() || "");
      const restoredCwd = String(options.cwd || "").trim();
      const cwd = restoredCwd || (profile.homeStart ? homeCwd : (workspaceCwd || homeCwd));
      return {
        profileId: profile.id,
        cwd,
        homeCwd,
        workspaceCwd,
        cols: 80,
        rows: 24
      };
    }

    function normalizeTerminalTabPreference(entry) {
      const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
      const profileId = String(source.profileId || "").trim();
      const profile = TERMINAL_PROFILES[profileId];
      if (!profile) return null;
      return {
        profileId: profile.id,
        cwd: String(source.cwd || "").trim()
      };
    }

    function getTerminalTabPreferences(state = deps.loadGlobalState?.()) {
      return (Array.isArray(state?.[TERMINAL_TABS_STATE_KEY]) ? state[TERMINAL_TABS_STATE_KEY] : [])
        .map(normalizeTerminalTabPreference)
        .filter(Boolean);
    }

    function getOpenTerminalPreferences() {
      return Array.from(sessionsByTabId.values())
        .filter((session) => session && !session.closed)
        .map((session) => ({
          profileId: session.profile.id,
          cwd: String(session.cwd || "").trim()
        }));
    }

    function persistOpenTerminalTabs() {
      deps.saveGlobalState?.({ [TERMINAL_TABS_STATE_KEY]: getOpenTerminalPreferences() });
    }

    function createTerminalView(tabId) {
      const view = document.createElement("section");
      view.className = "bottom-panel-view terminal-panel-view";
      view.dataset.terminalTabId = tabId;
      view.setAttribute("aria-label", "Terminal");
      const terminalRoot = document.createElement("div");
      terminalRoot.className = "terminal-root";
      view.appendChild(terminalRoot);
      return { view, terminalRoot };
    }

    function createCommandHeader(view, terminalRoot, command) {
      const header = document.createElement("pre");
      header.className = "terminal-command-header";
      header.setAttribute("aria-label", "Launch command");
      header.textContent = String(command || "");
      view.insertBefore(header, terminalRoot);
      return header;
    }

    function getTerminalConstructor() {
      return global.Terminal || global.Xterm?.Terminal || null;
    }

    function getFitAddonConstructor() {
      return global.FitAddon?.FitAddon || global.XtermAddonFit?.FitAddon || null;
    }

    function getTerminalDimensions(terminal) {
      return {
        cols: Number(terminal?.cols || 80) || 80,
        rows: Number(terminal?.rows || 24) || 24
      };
    }

    function captureTerminalOutput(session, text) {
      if (!session.captureConsole) return;
      session.consoleOutput += text;
      session.consoleOutputNewlineCount += (text.match(/\n/g) || []).length;
      session.consoleOutputSizeBytes += outputTextEncoder ? outputTextEncoder.encode(text).byteLength : text.length;
    }

    function writeTerminal(session, data) {
      const text = String(data || "");
      captureTerminalOutput(session, text);
      if (session.terminal?.write) {
        session.terminal.write(text);
      } else if (session.outputElement) {
        session.outputElement.textContent += text;
        session.outputElement.scrollTop = session.outputElement.scrollHeight;
      }
    }

    function sendBridgeMessage(session, message) {
      const Neutralino = getNeutralino();
      if ((session?.commandRun && !session?.interactiveCommand) || (session?.closed && message?.type !== "close") || !hasProcessId(session) || !Neutralino?.os?.updateSpawnedProcess) {
        logTerminal("debug", "Skipped bridge message; process is not ready", {
          tabId: session?.tabId || "",
          messageType: message?.type || "",
          hasProcessId: hasProcessId(session)
        });
        return Promise.resolve();
      }
      logTerminal("debug", "Sending bridge message", {
        tabId: session.tabId,
        processId: session.processId,
        messageType: message?.type || "",
        dataLength: message?.type === "input" ? String(message.data || "").length : undefined
      });
      const result = Neutralino.os.updateSpawnedProcess(session.processId, "stdIn", `${JSON.stringify(message)}\n`);
      return Promise.resolve(result).catch((error) => {
        logTerminal("error", "Bridge message failed", {
          tabId: session.tabId,
          processId: session.processId,
          messageType: message?.type || "",
          error: error?.message || String(error)
        });
        writeTerminal(session, `\r\nTerminal write failed: ${error?.message || String(error)}\r\n`);
      });
    }

    function sendTerminalInput(session, data) {
      const message = { type: "input", data };
      if (!session.bridgeReady) {
        session.pendingInput.push(message);
        logTerminal("debug", "Queued terminal input before bridge ready", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          inputLength: String(data || "").length,
          pendingInputCount: session.pendingInput.length
        });
        return;
      }
      logTerminal("debug", "Forwarding terminal input", {
        tabId: session.tabId,
        processId: getLogProcessId(session),
        inputLength: String(data || "").length
      });
      sendBridgeMessage(session, message);
    }

    function flushPendingInput(session) {
      const pendingInput = session.pendingInput.splice(0);
      logTerminal("debug", "Flushing queued terminal input", {
        tabId: session.tabId,
        processId: getLogProcessId(session),
        count: pendingInput.length
      });
      pendingInput.forEach((message) => sendBridgeMessage(session, message));
    }

    function fitTerminal(session) {
      try {
        session.fitAddon?.fit?.();
        logTerminal("debug", "Fitted terminal", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          ...getTerminalDimensions(session.terminal)
        });
        if (!session.closed && (!session.commandRun || session.interactiveCommand)) sendBridgeMessage(session, { type: "resize", ...getTerminalDimensions(session.terminal) });
      } catch (_error) {
        // The terminal may be hidden while the tab strip is rerendering.
      }
    }

    function observeTerminalSize(session) {
      if (typeof global.ResizeObserver !== "function" || !session?.terminalRoot) return;
      session.resizeObserver = new global.ResizeObserver(() => {
        logTerminal("debug", "Terminal container resized", {
          tabId: session.tabId,
          processId: getLogProcessId(session)
        });
        if (sessionsByTabId.get(session.tabId) === session) window.setTimeout(() => fitTerminal(session), 0);
      });
      session.resizeObserver.observe(session.terminalRoot);
    }

    function mountTerminal(session) {
      const TerminalConstructor = getTerminalConstructor();
      const FitAddonConstructor = getFitAddonConstructor();
      if (TerminalConstructor) {
        logTerminal("debug", "Mounting xterm renderer", {
          tabId: session.tabId,
          hasFitAddon: Boolean(FitAddonConstructor)
        });
        session.terminal = new TerminalConstructor({
          cursorBlink: true,
          convertEol: true,
          fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
          fontSize: 13,
          scrollback: 50000,
          theme: {
            background: "#0c0c0c",
            foreground: "#f2f2f2"
          }
        });
        if (FitAddonConstructor) {
          session.fitAddon = new FitAddonConstructor();
          session.terminal.loadAddon(session.fitAddon);
        }
        session.terminal.open(session.terminalRoot);
        if (!session.readOnly) session.terminal.onData((data) => sendTerminalInput(session, data));
        observeTerminalSize(session);
        window.setTimeout(() => {
          fitTerminal(session);
          session.terminal?.focus?.();
          logTerminal("debug", "Focused terminal after mount", {
            tabId: session.tabId,
            processId: getLogProcessId(session)
          });
        }, 0);
        return;
      }
      logTerminal("warning", "Terminal renderer failed to load", { tabId: session.tabId });
      const output = document.createElement("pre");
      output.className = "terminal-fallback-output";
      output.textContent = "Terminal renderer failed to load.\r\n";
      session.terminalRoot.appendChild(output);
      session.outputElement = output;
    }

    function notifyCommandStarted(session, pid) {
      if (!session?.commandRun || session.commandStarted) return;
      session.commandStarted = true;
      const normalizedPid = Number(pid);
      session.applicationPid = Number.isInteger(normalizedPid) && normalizedPid > 0 ? normalizedPid : null;
      if (typeof session.onProcessStarted !== "function") return;
      try {
        const notification = session.onProcessStarted({
          pid: session.applicationPid,
          processId: session.processId,
          tabId: session.tabId,
          title: session.title,
          stop: async function() {
            if (session.closed) return false;
            await stopSession(session, { persist: false });
            return true;
          }
        });
        Promise.resolve(notification).catch((error) => {
          logTerminal("error", "Command start notification failed", {
            tabId: session.tabId,
            processId: getLogProcessId(session),
            error: error?.message || String(error)
          });
        });
      } catch (error) {
        logTerminal("error", "Command start notification failed", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          error: error?.message || String(error)
        });
      }

    }
    function resolveCommandSession(session, exitCode) {
      if (!session?.commandRun || session.commandResolved) return;
      session.commandResolved = true;
      const interactiveOutput = session.interactiveCommand ? session.consoleOutput : "";
      session.resolveCommand?.({
        exitCode,
        stdout: session.interactiveCommand ? interactiveOutput : session.stdout,
        stderr: session.interactiveCommand ? "" : session.stderr,
        output: session.interactiveCommand ? interactiveOutput : session.stdout + session.stderr,
        session
      });
    }

    function parseBridgeLine(session, line) {
      let message = null;
      try {
        message = JSON.parse(line);
      } catch (_error) {
        writeTerminal(session, `${line}\r\n`);
        return;
      }
      if (message.type === "ready") {
        session.bridgeReady = true;
        logTerminal("info", "Bridge ready", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          title: message.title || "",
          pendingInputCount: session.pendingInput.length
        });
        if (message.title) session.title = message.title;
        notifyCommandStarted(session, message.pid);
        writeTerminal(session, message.banner || "");
        flushPendingInput(session);
        window.setTimeout(() => {
          session.terminal?.focus?.();
          logTerminal("debug", "Focused terminal after bridge ready", {
            tabId: session.tabId,
            processId: getLogProcessId(session)
          });
        }, 0);
      } else if (message.type === "data") {
        logTerminal("debug", "Bridge data received", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          dataLength: String(message.data || "").length
        });
        writeTerminal(session, message.data || "");
      } else if (message.type === "error") {
        logTerminal("error", "Bridge error", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          message: message.message || "Terminal failed."
        });
        writeTerminal(session, `\r\n${message.message || "Terminal failed."}\r\n`);
      } else if (message.type === "exit") {
        logTerminal("info", "Bridge exited", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          exitCode: message.exitCode ?? null,
          signal: message.signal || null
        });
        writeTerminal(session, `\r\n[process exited with code ${message.exitCode ?? ""}]\r\n`);
        session.closed = true;
        sessionsByProcessId.delete(session.processId);
        resolveCommandSession(session, Number(message.exitCode ?? 0) || 0);
      }
    }

    function handleSpawnedProcessEvent(event) {
      const detail = event?.detail || {};
      const session = sessionsByProcessId.get(detail.id);
      if (!session) return;
      if (session.commandRun && !session.interactiveCommand) {
        if (detail.action === "stdOut") {
          session.stdout += String(detail.data || "");
          writeTerminal(session, detail.data || "");
        } else if (detail.action === "stdErr") {
          session.stderr += String(detail.data || "");
          writeTerminal(session, detail.data || "");
        } else if (detail.action === "exit") {
          const exitCode = Number(detail.exitCode ?? detail.data ?? 0) || 0;
          session.closed = true;
          sessionsByProcessId.delete(detail.id);
          writeTerminal(session, `\r\n[process exited with code ${exitCode}]\r\n`);
          resolveCommandSession(session, exitCode);
        }
        return;
      }
      if (detail.action === "stdOut") {
        session.parseOutput(detail.data || "");
      } else if (detail.action === "stdErr") {
        writeTerminal(session, detail.data || "");
      } else if (detail.action === "exit") {
        session.closed = true;
        sessionsByProcessId.delete(detail.id);
        resolveCommandSession(session, Number(detail.exitCode ?? detail.data ?? 1) || 0);
      }
    }

    async function startBridgeProcess(session, request) {
      const Neutralino = getNeutralino();
      const command = `node ${quoteCommandArg(TERMINAL_BRIDGE_PATH)} ${encodeJsonRequest(request)}`;
      logTerminal("info", "Starting bridge process", {
        tabId: session.tabId,
        profileId: request.profileId,
        cwd: request.cwd,
        cols: request.cols,
        rows: request.rows
      });
      const processHandle = await Neutralino.os.spawnProcess(command);
      const processId = processHandle?.id ?? processHandle;
      session.processId = processId;
      sessionsByProcessId.set(processId, session);
      session.unregisterProcessOwner = deps.processRouter?.registerProcess?.(processHandle, {
        onStdout(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdOut", data }) }); },
        onStderr(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdErr", data }) }); },
        onExit(detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "exit" }) }); }
      });
      logTerminal("info", "Bridge process started", {
        tabId: session.tabId,
        processId,
        profileId: request.profileId
      });
      if (!session.closed && (!session.commandRun || session.interactiveCommand)) sendBridgeMessage(session, { type: "resize", ...getTerminalDimensions(session.terminal) });
    }

    async function stopSession(session, options = {}) {
      if (!session) return;
      const alreadyClosed = session.closed;
      if (!alreadyClosed) {
        logTerminal("info", "Stopping terminal session", {
          tabId: session.tabId,
          processId: getLogProcessId(session),
          bridgeReady: session.bridgeReady,
          pendingInputCount: session.pendingInput?.length || 0
        });
      }
      session.closed = true;
      sessionsByTabId.delete(session.tabId);
      if (!alreadyClosed && hasProcessId(session)) {
        const processId = session.processId;
        sessionsByProcessId.delete(session.processId);
        try {
          if (!session.commandRun || session.interactiveCommand) await sendBridgeMessage(session, { type: "close" });
          await getNeutralino()?.os?.updateSpawnedProcess?.(processId, "exit");
          if (session.commandRun) {
            resolveCommandSession(session, 130);
          }
        } catch (_error) {
          // Closing terminal processes is best-effort during tab teardown.
        }
      }
      try {
        session.resizeObserver?.disconnect?.();
        session.terminal?.dispose?.();
      } catch (_error) {
        // Renderer disposal should not block tab closure.
      }
      if (options.persist !== false) persistOpenTerminalTabs();
    }

    /**
     * Stop the newest running command whose title belongs to the requesting feature.
     * @param {string[]} titles Exact command titles owned by one background process.
     * @returns {Promise<boolean>} Whether a matching command session was stopped.
     */
    async function stopCommandSession(titles = []) {
      const allowed = new Set((titles || []).map(String));
      const session = Array.from(sessionsByTabId.values()).reverse()
        .find((candidate) => candidate.commandRun && !candidate.closed && allowed.has(candidate.title));
      if (!session) return false;
      await stopSession(session, { persist: false });
      return true;
    }

    async function openTerminal(profileId = DEFAULT_TERMINAL_PROFILE_ID, options = {}) {
      if (!isDesktopRuntime()) {
        deps.alert?.("Embedded terminals are available only in the desktop app.");
        return null;
      }
      if (!deps.bottomPanel?.addTab) {
        deps.alert?.("The bottom panel is unavailable.");
        return null;
      }
      const profile = getProfile(profileId);
      const tabId = `terminal-${Date.now()}-${++terminalCounter}`;
      const request = await buildTerminalLaunchRequest(profile.id, { cwd: options.cwd });
      logTerminal("info", "Opening terminal", {
        tabId,
        profileId: profile.id,
        title: profile.label,
        cwd: request.cwd,
        homeStart: profile.homeStart
      });
      const { view, terminalRoot } = createTerminalView(tabId);
      const session = {
        tabId,
        profile,
        title: profile.label,
        cwd: request.cwd,
        view,
        terminalRoot,
        processId: null,
        closed: false,
        bridgeReady: false,
        pendingInput: [],
        parseOutput: null
      };
      session.parseOutput = createLineParser((line) => parseBridgeLine(session, line));
      sessionsByTabId.set(tabId, session);
      deps.bottomPanel.addTab({
        id: tabId,
        title: profile.label,
        icon: profile.icon,
        view,
        onActivate: () => {
          logTerminal("debug", "Terminal tab activated", {
            tabId: session.tabId,
            processId: session.processId || null,
            bridgeReady: session.bridgeReady
          });
          fitTerminal(session);
          session.terminal?.focus?.();
        },
        onClose: () => { void stopSession(session); }
      });
      if (options.persist !== false) persistOpenTerminalTabs();
      mountTerminal(session);
      deps.contextMenu?.bind?.(session, {
        pasteText: (text) => sendTerminalInput(session, text),
        clearConsole: () => void options.onClear?.()
      });
      try {
        await startBridgeProcess(session, request);
      } catch (error) {
        logTerminal("error", "Bridge process failed to start", {
          tabId: session.tabId,
          profileId: profile.id,
          error: error?.message || String(error)
        });
        writeTerminal(session, `Terminal failed to start: ${error?.message || String(error)}\r\n`);
      }
      deps.closeMobileMenu?.();
      return session;
    }

    async function restoreTerminalsFromPreferences() {
      const preferences = getTerminalTabPreferences();
      const restoredSessions = [];
      for (const preference of preferences) {
        const session = await openTerminal(preference.profileId, {
          cwd: preference.cwd,
          persist: false
        });
        if (session) restoredSessions.push(session);
      }
      return restoredSessions;
    }

    /** Run a command in a streamed terminal tab, optionally backed by an interactive PTY. */
    async function runCommand(command, options = {}) {
      if (!isDesktopRuntime()) throw new Error("Desktop command execution is unavailable.");
      if (!deps.bottomPanel?.addTab) throw new Error("The bottom panel is unavailable.");
      const requestedTabId = String(options.tabId || "").trim();
      if (requestedTabId && sessionsByTabId.has(requestedTabId)) deps.bottomPanel.closeTab?.(requestedTabId);
      const tabId = requestedTabId || `terminal-command-${Date.now()}-${++terminalCounter}`;
      const title = String(options.title || "Command");
      const executedCommand = String(command || "");
      const interactive = options.interactive === true;
      const { view, terminalRoot } = createTerminalView(tabId);
      const session = {
        tabId,
        profile: { id: "command", label: title, icon: "bi-terminal" },
        title,
        cwd: String(options.cwd || deps.getActiveFolderPath?.() || ""),
        view,
        terminalRoot,
        processId: null,
        closed: false,
        readOnly: !interactive,
        commandRun: true,
        interactiveCommand: interactive,
        bridgeReady: false,
        pendingInput: [],
        captureConsole: options.captureOutput === true,
        consoleOutput: "",
        consoleOutputNewlineCount: 0,
        consoleOutputSizeBytes: 0,
        stdout: "",
        stderr: "",
        resolveCommand: null,
        commandResolved: false,
        parseOutput: null,
        commandStarted: false,
        applicationPid: null,
        onProcessStarted: options.onProcessStarted
      };
      if (interactive) createCommandHeader(view, terminalRoot, executedCommand);
      if (interactive) session.parseOutput = createLineParser((line) => parseBridgeLine(session, line));
      sessionsByTabId.set(tabId, session);
      deps.bottomPanel.addTab({
        id: tabId,
        title,
        icon: "bi-terminal",
        view,
        onActivate: () => {
          fitTerminal(session);
          if (interactive) session.terminal?.focus?.();
        },
        onClose: () => { void stopSession(session, { persist: false }); }
      });
      mountTerminal(session);
      deps.contextMenu?.bind?.(session, {
        pasteText: interactive ? (text) => sendTerminalInput(session, text) : undefined,
        clearConsole: () => {
          session.consoleOutput = "";
          session.consoleOutputNewlineCount = 0;
          session.consoleOutputSizeBytes = 0;
          void options.onClear?.();
        }
      });
      const commandHeaderText = `${executedCommand}\r\n\r\n`;
      if (interactive) {
        captureTerminalOutput(session, commandHeaderText);
      } else {
        writeTerminal(session, commandHeaderText);
      }
      deps.bottomPanel.activateTab?.(tabId);
      const completion = new Promise((resolve) => { session.resolveCommand = resolve; });
      try {
        if (interactive) {
          await startBridgeProcess(session, {
            command: executedCommand,
            title,
            cwd: session.cwd,
            cols: getTerminalDimensions(session.terminal).cols,
            rows: getTerminalDimensions(session.terminal).rows
          });
        } else {
          const processHandle = await getNeutralino().os.spawnProcess(executedCommand, { cwd: session.cwd });
          session.processId = processHandle?.id ?? processHandle;
          notifyCommandStarted(session, processHandle?.pid ?? session.processId);
          sessionsByProcessId.set(session.processId, session);
          session.unregisterProcessOwner = deps.processRouter?.registerProcess?.(processHandle, {
            onStdout(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdOut", data }) }); },
            onStderr(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdErr", data }) }); },
            onExit(detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "exit" }) }); }
          });
        }
      } catch (error) {
        session.closed = true;
        writeTerminal(session, `Command failed to start: ${error?.message || String(error)}\r\n`);
        error.session = session;
        throw error;
      }
      return completion;
    }

    /** Show persisted read-only command output in a terminal-styled bottom-panel tab. */
    function showCommandOutput(content, options = {}) {
      const tabId = String(options.tabId || `terminal-output-${Date.now()}-${++terminalCounter}`);
      const existing = sessionsByTabId.get(tabId);
      if (existing) {
        if (options.activate !== false) deps.bottomPanel.activateTab?.(tabId);
        return existing;
      }
      const title = String(options.title || "Command Output");
      const { view, terminalRoot } = createTerminalView(tabId);
      const session = {
        tabId,
        profile: { id: "command-output", label: title, icon: "bi-terminal" },
        title,
        cwd: "",
        view,
        terminalRoot,
        processId: null,
        closed: true,
        readOnly: true,
        commandRun: false
      };
      sessionsByTabId.set(tabId, session);
      deps.bottomPanel.addTab({
        id: tabId,
        title,
        icon: "bi-terminal",
        view,
        activate: options.activate !== false,
        onActivate: () => fitTerminal(session),
        onClose: () => { void stopSession(session, { persist: false }); }
      });
      mountTerminal(session);
      deps.contextMenu?.bind?.(session, {
        clearConsole: () => void options.onClear?.()
      });
      writeTerminal(session, String(content || ""));
      return session;
    }

    /** Close a persisted command-output tab without deleting its saved content. */
    function closeCommandOutput(tabId) {
      const id = String(tabId || "").trim();
      if (!id || !sessionsByTabId.has(id)) return false;
      return deps.bottomPanel.closeTab?.(id) === true;
    }

    function updateTerminalMenuAvailability() {
      const available = isDesktopRuntime();
      document.querySelectorAll(".open-terminal-default, .open-terminal-profile").forEach((button) => {
        button.disabled = !available;
        button.setAttribute("aria-disabled", available ? "false" : "true");
        if (!available) button.title = "Embedded terminals are available only in the desktop app";
      });
    }

    function bindTerminalMenu() {
      document.querySelectorAll(".open-terminal-default").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          deps.closeActionMenus?.();
          button.blur?.();
          void openTerminal(DEFAULT_TERMINAL_PROFILE_ID);
        });
      });
      document.querySelectorAll(".open-terminal-profile").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          deps.closeActionMenus?.();
          button.blur?.();
          void openTerminal(button.dataset.terminalProfile || DEFAULT_TERMINAL_PROFILE_ID);
        });
      });
      updateTerminalMenuAvailability();
    }

    async function stopAllTerminals() {
      await Promise.all(Array.from(sessionsByTabId.values()).map((session) => stopSession(session, { persist: false })));
    }

    if (!deps.processRouter && getNeutralino()?.events?.on) {
      getNeutralino().events.on("spawnedProcess", handleSpawnedProcessEvent);
    }
    global.addEventListener?.("beforeunload", () => { void stopAllTerminals(); });
    bindTerminalMenu();

    const api = {
      DEFAULT_TERMINAL_PROFILE_ID,
      TERMINAL_PROFILES,
      buildTerminalLaunchRequest,
      restoreTerminalsFromPreferences,
      runCommand,
      showCommandOutput,
      closeCommandOutput,
      stopCommandSession,
      openTerminal,
      stopAllTerminals,
      _test: {
        createLineParser,
        getProfile,
        getTerminalTabPreferences
      }
    };
    app.registerModule?.("desktopTerminal", api);
    return api;
  }

  global.registerMarkdownViewerDesktopTerminal = registerMarkdownViewerDesktopTerminal;
})(typeof window !== "undefined" ? window : globalThis);
