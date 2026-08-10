const { test, expect } = require("./desktop-fixture");
const crypto = require("node:crypto");

async function openApp(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => Boolean(
    window.markdownViewerApp?.modules?.desktopTerminal
      && window.markdownViewerApp?.modules?.neutralinoLspBridge
      && window.markdownViewerApp?.modules?.lspServerRegistry
      && window.markdownViewerApp?.modules?.neutralinoAiBridge
  ));
}

test("desktop AI bridge retains a Windows credential across an app reload without exposing reads", async ({ page }) => {
  await openApp(page);
  const secret = `md-editor-e2e-${crypto.randomUUID()}`;
  let credentialId = "";
  try {
    const stored = await page.evaluate(async (value) => {
      const bridge = window.markdownViewerApp.modules.neutralinoAiBridge;
      const result = await bridge.credentialStore({ secret: value });
      return {
        credentialId: result.credentialId,
        exists: (await bridge.credentialExists({ credentialId: result.credentialId })).exists,
        exposesRead: typeof bridge.readCredential === "function" || typeof bridge.credentialRead === "function",
        persistedSecret: Object.values(localStorage).some((item) => String(item).includes(value))
      };
    }, secret);
    credentialId = stored.credentialId;
    expect(stored.exists).toBe(true);
    expect(stored.exposesRead).toBe(false);
    expect(stored.persistedSecret).toBe(false);

    await page.reload();
    await page.waitForFunction(() => Boolean(window.markdownViewerApp?.modules?.neutralinoAiBridge));
    const afterReload = await page.evaluate(async (id) => {
      const bridge = window.markdownViewerApp.modules.neutralinoAiBridge;
      return (await bridge.credentialExists({ credentialId: id })).exists;
    }, credentialId);
    expect(afterReload).toBe(true);
  } finally {
    if (credentialId) {
      await page.evaluate(async (id) => {
        await window.markdownViewerApp.modules.neutralinoAiBridge.credentialDelete({ credentialId: id });
      }, credentialId).catch(() => {});
    }
  }
});

test("desktop terminal bridge starts and stops through Neutralino process APIs", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const events = [];
    const originalSpawnProcess = Neutralino.os.spawnProcess;
    const originalUpdateSpawnedProcess = Neutralino.os.updateSpawnedProcess;
    const originalGetEnv = Neutralino.os.getEnv;

    Neutralino.os.spawnProcess = async (command) => {
      events.push({ type: "spawn", command });
      return { id: 701 };
    };
    Neutralino.os.updateSpawnedProcess = async (id, action, data) => {
      events.push({ type: "update", id, action, data: String(data || "") });
    };
    Neutralino.os.getEnv = async (name) => {
      if (name === "USERPROFILE") return "C:\\Users\\DesktopTest";
      if (name === "HOMEDRIVE") return "C:";
      if (name === "HOMEPATH") return "\\Users\\DesktopTest";
      return "";
    };

    try {
      const terminal = window.markdownViewerApp.modules.desktopTerminal;
      const session = await terminal.openTerminal("cmd");
      await terminal.stopAllTerminals();
      return {
        processId: session?.processId ?? null,
        events,
      };
    } finally {
      Neutralino.os.spawnProcess = originalSpawnProcess;
      Neutralino.os.updateSpawnedProcess = originalUpdateSpawnedProcess;
      Neutralino.os.getEnv = originalGetEnv;
    }
  });

  expect(result.processId).toBe(701);
  expect(result.events.some((event) => event.type === "spawn" && event.command.includes("resources/bridges/terminal-bridge/terminal-bridge.cjs"))).toBe(true);
  expect(result.events.some((event) => event.type === "update" && event.id === 701 && event.action === "stdIn" && event.data.includes('"type":"resize"'))).toBe(true);
  expect(result.events.some((event) => event.type === "update" && event.id === 701 && event.action === "stdIn" && event.data.includes('"type":"close"'))).toBe(true);
  expect(result.events.some((event) => event.type === "update" && event.id === 701 && event.action === "exit")).toBe(true);
});

test("desktop LSP bridge reports runtime status and cleans up spawned sessions", async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const events = [];
    const bridge = window.markdownViewerApp.modules.neutralinoLspBridge;
    const registry = window.markdownViewerApp.modules.lspServerRegistry;
    const originalSpawnProcess = Neutralino.os.spawnProcess;
    const originalUpdateSpawnedProcess = Neutralino.os.updateSpawnedProcess;
    const originalExecCommand = Neutralino.os.execCommand;
    const originalRegistry = {
      getLaunchDescriptor: registry.getLaunchDescriptor,
      getServerStatus: registry.getServerStatus,
      isDesktopLspRuntime: registry.isDesktopLspRuntime,
      resolveWorkspaceRoot: registry.resolveWorkspaceRoot,
    };

    Neutralino.os.spawnProcess = async (command, options) => {
      events.push({ type: "spawn", command, cwd: options?.cwd || "" });
      return { id: 802, pid: 1802 };
    };
    Neutralino.os.updateSpawnedProcess = async (id, action, data) => {
      events.push({ type: "update", id, action, data: String(data || "") });
      if (action === "exit") {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("spawnedProcess", { detail: { id, action: "exit" } }));
        }, 0);
      }
    };
    Neutralino.os.execCommand = async (command) => {
      events.push({ type: "exec", command });
    };
    registry.isDesktopLspRuntime = () => true;
    registry.resolveWorkspaceRoot = async (filePath) => filePath.includes("/Project/") || filePath.includes("\\Project\\") || filePath.includes("C:/Project") ? "C:/Project" : "";
    registry.getServerStatus = async (serverId) => ({
      serverId,
      installed: true,
      bundled: true,
      installDir: "C:/FakeLanguageServer",
      metadata: { variantLabel: "Fake TypeScript" },
      variant: { id: "fake-typescript", label: "Fake TypeScript" },
      missingFiles: [],
    });
    registry.getLaunchDescriptor = async () => ({
      command: 'node "C:/FakeLanguageServer/server.js" --stdio',
      cwd: "C:/FakeLanguageServer",
    });

    try {
      const before = bridge.getServerRuntimeStatus("typescript");
      const session = await bridge.ensureSession({ server: { id: "typescript" }, filePath: "C:/Project/src/app.ts" });
      session.transport.send(JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} }));
      const running = bridge.getServerRuntimeStatus("typescript");
      const hasProjectSession = await bridge.hasRunningSessionForFile({ server: { id: "typescript" }, filePath: "C:/Project/src/other.ts" });
      await bridge.stopAllSessions();
      const after = bridge.getServerRuntimeStatus("typescript");
      return {
        before,
        running,
        hasProjectSession,
        after,
        processId: session?.processId ?? null,
        processPid: session?.processPid ?? null,
        events,
      };
    } finally {
      Neutralino.os.spawnProcess = originalSpawnProcess;
      Neutralino.os.updateSpawnedProcess = originalUpdateSpawnedProcess;
      Neutralino.os.execCommand = originalExecCommand;
      registry.getLaunchDescriptor = originalRegistry.getLaunchDescriptor;
      registry.getServerStatus = originalRegistry.getServerStatus;
      registry.isDesktopLspRuntime = originalRegistry.isDesktopLspRuntime;
      registry.resolveWorkspaceRoot = originalRegistry.resolveWorkspaceRoot;
    }
  });

  expect(result.before.running).toBe(false);
  expect(result.running.running).toBe(true);
  expect(result.running.sessionCount).toBe(1);
  expect(result.hasProjectSession).toBe(true);
  expect(result.after.running).toBe(false);
  expect(result.processId).toBe(802);
  expect(result.processPid).toBe(1802);
  expect(result.events.some((event) => event.type === "spawn" && event.command.includes("--stdio"))).toBe(true);
  expect(result.events.some((event) => event.type === "update" && event.id === 802 && event.action === "stdIn" && event.data.includes("Content-Length:"))).toBe(true);
  expect(result.events.some((event) => event.type === "update" && event.id === 802 && event.action === "exit")).toBe(true);
  expect(result.events.some((event) => event.type === "exec")).toBe(false);
});
