// Java debugger session orchestration for Java Application run configurations.
(function(global) {
  "use strict";

  function registerMarkdownViewerJavaDebugSession(app, deps = {}) {
    const listeners = new Set();
    const state = { state: "not-running", console: "", consoleEntries: [], threads: [], variables: [], breakpoints: [], methodBreakpoints: [], watches: [], expressionHistory: [], exceptionBreakpoint: null, selectedFrameId: "", location: null, stoppedReason: "", stoppedDescription: "", lastError: "", breakpointsMuted: false, lastEvaluation: null, restartable: false, canAcceptStdin: false };
    let activeConfiguration = null;
    let loadedProjectPath = "";
    let evaluationReturnState = "";
    let evaluationInFlightExpression = "";
    let commandRestoreState = null;
    let ignoreBridgeEventsAfterStop = false;
    let activeProtocol = null;
    const silentEvaluationCounts = new Map();
    const pendingInspectionEvaluations = new Map();

    async function ensureProjectStoreLoaded() {
      const projectPath = getProjectPath();
      if (!projectPath || projectPath === loadedProjectPath) return false;
      await deps.store.load(projectPath);
      loadedProjectPath = projectPath;
      return true;
    }

    function publish(patch = {}) {
      Object.assign(state, patch);
      listeners.forEach((listener) => { try { listener({ ...state }); } catch (_error) {} });
      return { ...state };
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener({ ...state });
      return function() { listeners.delete(listener); };
    }

    function createProtocolClient() {
      const factory = deps.protocolFactory || deps.protocol?.createClient;
      const protocol = typeof factory === "function" ? factory() : deps.protocol;
      if (!protocol) throw new Error("Java debugger protocol is unavailable.");
      return protocol;
    }

    function getProtocol() {
      if (!activeProtocol) activeProtocol = createProtocolClient();
      return activeProtocol;
    }

    async function replaceProtocolClient() {
      try { await activeProtocol?.stop?.(); } catch (_error) {}
      activeProtocol = createProtocolClient();
      return activeProtocol;
    }

    function encode(value) { return getProtocol().encodeBase64(value); }
    function getProjectPath() { return String(deps.getProjectPath?.() || "").replace(/\\/g, "/"); }
    function isSuspendedState(value) { return value === "paused" || value === "stopped-at-breakpoint"; }
    function canRunSilentEvaluation() { return state.state === "evaluating"; }
    function canEvaluateAtFrame(frameId = state.selectedFrameId) { return (isSuspendedState(state.state) || canRunSilentEvaluation()) && Boolean(frameId || state.selectedFrameId); }
    function isBreakpointStopReason(reason) { return ["breakpoint", "method-breakpoint", "exception", "run-to-cursor"].includes(String(reason || "")); }
    function isBridgeStoppedError(error) { return /Java debugger bridge is not running/i.test(String(error?.message || error || "")); }
    function shouldRefreshWatchesAfterEvaluation(expression, result) {
      if (result?.error) return false;
      const text = String(expression || "").trim().replace(/;$/, "").trim();
      if (!text) return false;
      if (hasTopLevelAssignment(text)) return true;
      return hasMethodInvocation(text);
    }

    function hasTopLevelAssignment(expression) {
      let depth = 0;
      let bracketDepth = 0;
      let quote = "";
      let escaped = false;
      for (let index = 0; index < expression.length; index += 1) {
        const char = expression[index];
        if (quote) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === quote) quote = "";
          continue;
        }
        if (char === "'" || char === '"') { quote = char; continue; }
        if (char === "(") depth += 1;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (char === "[") bracketDepth += 1;
        else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
        if (char !== "=" || depth !== 0 || bracketDepth !== 0) continue;
        const previous = index > 0 ? expression[index - 1] : "";
        const next = index + 1 < expression.length ? expression[index + 1] : "";
        if (previous === "=" || previous === "!" || previous === "<" || previous === ">" || next === "=") continue;
        return true;
      }
      return false;
    }

    function hasMethodInvocation(expression) {
      let quote = "";
      let escaped = false;
      for (let index = 0; index < expression.length; index += 1) {
        const char = expression[index];
        if (quote) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === quote) quote = "";
          continue;
        }
        if (char === "'" || char === '"') { quote = char; continue; }
        if (char !== "(") continue;
        let cursor = index - 1;
        while (cursor >= 0 && /\s/.test(expression[cursor])) cursor -= 1;
        if (cursor < 0 || !/[$_\p{L}\p{N}]/u.test(expression[cursor])) continue;
        return true;
      }
      return false;
    }

    function markSilentEvaluation(expression) {
      silentEvaluationCounts.set(expression, (silentEvaluationCounts.get(expression) || 0) + 1);
    }

    function consumeSilentEvaluation(expression) {
      const count = silentEvaluationCounts.get(expression) || 0;
      if (count <= 0) return false;
      if (count === 1) silentEvaluationCounts.delete(expression);
      else silentEvaluationCounts.set(expression, count - 1);
      return true;
    }

    function waitForInspectionEvaluation(expression) {
      const text = String(expression || "").trim();
      if (!text) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => resolveInspectionEvaluation(text, null, timer), 2500);
        const pending = pendingInspectionEvaluations.get(text) || [];
        pending.push({ resolve, timer });
        pendingInspectionEvaluations.set(text, pending);
      });
    }

    function resolveInspectionEvaluation(expression, result, timer = null) {
      const text = String(expression || "").trim();
      const pending = pendingInspectionEvaluations.get(text) || [];
      const request = pending.shift();
      if (!request) return false;
      window.clearTimeout(timer || request.timer);
      if (pending.length) pendingInspectionEvaluations.set(text, pending);
      else pendingInspectionEvaluations.delete(text);
      request.resolve(result || null);
      return true;
    }

    function restoreEvaluationState(patch = {}) {
      if (state.state === "evaluating") {
        patch.state = evaluationReturnState || "paused";
        evaluationReturnState = "";
        evaluationInFlightExpression = "";
      }
      return patch;
    }

    function rememberCommandRestoreState() {
      commandRestoreState = { ...state };
      return commandRestoreState;
    }

    function clearCommandRestoreState() {
      commandRestoreState = null;
    }

    function restoreCommandStateOnError(message) {
      const restoreState = commandRestoreState;
      commandRestoreState = null;
      const errorPatch = debuggerErrorPatch(message);
      if (state.state === "evaluating") {
        const expression = evaluationInFlightExpression;
        const patch = restoreEvaluationState(errorPatch);
        if (expression) patch.lastEvaluation = { expression, value: message, error: true, kind: "error", type: "" };
        return patch;
      }
      return restoreState ? { ...restoreState, console: errorPatch.console, consoleEntries: errorPatch.consoleEntries, lastError: message } : errorPatch;
    }

    function consoleKindForEvent(type) {
      if (type === "stderr") return "stderr";
      if (type === "stdin") return "stdin";
      if (type === "bridge-stderr") return "debugger";
      if (type === "logpoint") return "logpoint";
      return "stdout";
    }

    function withConsoleEntry(kind, text, patch = {}) {
      const output = String(text || "");
      if (!output) return patch;
      const entry = { kind, text: output, timestamp: Date.now() };
      return { ...patch, console: state.console + output, consoleEntries: (state.consoleEntries || []).concat(entry).slice(-1000) };
    }

    function debuggerErrorPatch(message) {
      const failed = ["not-running", "launching"].includes(state.state);
      return withConsoleEntry("error", `${message}\n`, { state: failed ? "failed" : state.state, lastError: message });
    }

    async function failStartup(error, fallbackMessage) {
      const message = String(error?.message || error || fallbackMessage || "Java debugging could not start.");
      try { await activeProtocol?.stop?.(); } catch (_error) {}
      publish(clearRuntimeInspectionState(withConsoleEntry("error", `${message}\n`, { state: "failed", lastError: message, canAcceptStdin: false })));
      return false;
    }

    async function handleEvent(event) {
      const body = event?.body || {};
      if (ignoreBridgeEventsAfterStop && event.type !== "terminated") return;
      if (event.type === "state") { clearCommandRestoreState(); publish(statePatchForDebuggerState(body.state || state.state)); }
      else if (event.type === "stdout" || event.type === "stderr" || event.type === "stdin" || event.type === "bridge-stderr" || event.type === "logpoint") publish(withConsoleEntry(consoleKindForEvent(event.type), body.text));
      else if (event.type === "breakpoint") {
        await deps.store.updateBreakpointStatus(body);
        publish({ breakpoints: deps.store.getBreakpoints() });
      } else if (event.type === "methodBreakpoint") {
        await deps.store.updateMethodBreakpointStatus?.(body);
        publish({ methodBreakpoints: deps.store.getMethodBreakpoints?.() || [] });
      } else if (event.type === "exceptionBreakpoint") {
        publish({ exceptionBreakpoint: body });
      } else if (event.type === "stopped") {
        const snapshot = body.snapshot || {};
        const selectedFrameId = snapshot.selectedFrameId || firstFrameId(snapshot.threads);
        const stoppedReason = String(body.reason || "");
        const stoppedAtBreakpoint = isBreakpointStopReason(stoppedReason);
        clearCommandRestoreState();
        publish({ state: stoppedAtBreakpoint ? "stopped-at-breakpoint" : "paused", stoppedReason, stoppedDescription: stoppedEventDescription(body), location: body.location || null, threads: snapshot.threads || [], selectedFrameId });
        await navigateToLocation(body.location);
        if (await requestVariables(selectedFrameId) !== false) await evaluateWatches(selectedFrameId);
      } else if (event.type === "snapshot" || event.type === "threads") {
        clearCommandRestoreState();
        const threads = body.threads || [];
        const selectedFrameId = body.selectedFrameId || state.selectedFrameId || firstFrameId(threads);
        const location = frameLocation(findFrame(selectedFrameId, threads)) || state.location;
        publish({ threads, selectedFrameId, location });
        if (event.type === "snapshot" && selectedFrameId) {
          if (location) await navigateToLocation(location);
          if (await requestVariables(selectedFrameId) !== false) await evaluateWatches(selectedFrameId);
        } else if (selectedFrameId) await requestVariables(selectedFrameId);
      } else if (event.type === "variables") {
        const frameId = body.frameId || state.selectedFrameId;
        if (state.selectedFrameId && frameId && frameId !== state.selectedFrameId) return;
        publish({ selectedFrameId: frameId, variables: body.variables || [] });
      }
      else if (event.type === "children") publish({
        variables: mergeChildren(state.variables, body.objectId, body.variables || []),
        watches: mergeWatchChildren(state.watches, body.objectId, body.variables || []),
        lastEvaluation: mergeValueChildren(state.lastEvaluation, body.objectId, body.variables || [])
      });
      else if (event.type === "evaluation") {
        resolveInspectionEvaluation(body.expression, body.result || null);
        const silent = consumeSilentEvaluation(body.expression);
        const refreshWatches = !silent && shouldRefreshWatchesAfterEvaluation(body.expression, body.result);
        const patch = { watches: updateWatchResult(state.watches, body.expression, body.result) };
        if (!silent) patch.lastEvaluation = { expression: body.expression || "", ...(body.result || {}) };
        publish(restoreEvaluationState(patch));
        if (refreshWatches) await evaluateWatches(state.selectedFrameId);
      }
      else if (event.type === "terminated") { clearCommandRestoreState(); publish(clearRuntimeInspectionState({ state: "terminated", canAcceptStdin: false })); }
      else if (event.type === "error") { const message = body.message || "Debugger error."; publish(restoreCommandStateOnError(message)); }
    }

    function firstFrameId(threads = []) { return (threads.find((thread) => thread.frames?.length)?.frames || [])[0]?.id || ""; }
    function findFrame(frameId, threads = state.threads) { for (const thread of threads || []) for (const frame of thread.frames || []) if (frame.id === frameId) return frame; return null; }
    function frameLocation(frame) { return frame ? { file: frame.file, sourceName: frame.sourceName, line: frame.line, className: frame.className, method: frame.method } : null; }
    function mergeChildren(values, objectId, children) { return (values || []).map((item) => item.objectId === objectId ? { ...item, children, expanded: true } : { ...item, children: item.children ? mergeChildren(item.children, objectId, children) : item.children }); }
    function mergeWatchChildren(watches, objectId, children) { return (watches || []).map((watch) => watch.result?.objectId === objectId ? { ...watch, result: { ...watch.result, children, expanded: true } } : { ...watch, result: watch.result?.children ? { ...watch.result, children: mergeChildren(watch.result.children, objectId, children) } : watch.result }); }
    function mergeValueChildren(value, objectId, children) { return value?.objectId === objectId ? { ...value, children, expanded: true } : value?.children ? { ...value, children: mergeChildren(value.children, objectId, children) } : value; }
    function updateWatchResult(watches, expression, result) { return (watches || []).map((watch) => watch.expression === expression ? { ...watch, result } : watch); }

    function sourceNameForPath(file) {
      const normalized = String(file || "").replace(/\\/g, "/");
      const slash = normalized.lastIndexOf("/");
      return slash >= 0 ? normalized.slice(slash + 1) : normalized;
    }

    async function navigateToSource(file, line, sourceName = "", className = "") {
      const normalizedFile = String(file || "").replace(/\\/g, "/");
      const displayName = sourceName || sourceNameForPath(normalizedFile);
      if (!normalizedFile && !displayName) return false;
      const match = await deps.findSourceFile?.(displayName, normalizedFile, className);
      const source = match || (normalizedFile ? { name: displayName, path: normalizedFile, sourceFilePath: normalizedFile } : null);
      if (!source) {
        const message = `Source file could not be found: ${displayName || normalizedFile || "unknown source"}.`;
        publish(withConsoleEntry("error", `${message}\n`, { lastError: message }));
        return false;
      }
      try {
        await deps.openSourceFile?.(source);
        deps.revealLine?.(Number(line) || 1);
        publish({ lastError: "" });
        return true;
      } catch (error) {
        const message = `Source file could not be opened: ${displayName || normalizedFile || "unknown source"}. ${error?.message || error || ""}`.trim();
        publish(withConsoleEntry("error", `${message}\n`, { lastError: message }));
        return false;
      }
    }

    async function navigateToLocation(location) {
      if (!location?.sourceName && !location?.file) return false;
      return navigateToSource(location.file, location.line, location.sourceName, location.className);
    }

    function resetSessionState() {
      publish({ state: "launching", console: "", consoleEntries: [], threads: [], variables: [], breakpoints: deps.store.getBreakpoints(), methodBreakpoints: deps.store.getMethodBreakpoints?.() || [], watches: deps.store.getWatches(), expressionHistory: deps.store.getExpressionHistory?.() || [], exceptionBreakpoint: deps.store.getExceptionBreakpoint?.() || null, selectedFrameId: "", location: null, stoppedReason: "", stoppedDescription: "", lastError: "", breakpointsMuted: state.breakpointsMuted === true, restartable: Boolean(activeConfiguration), canAcceptStdin: Boolean(activeConfiguration) });
    }

    async function resetStartupBreakpointResolutionState() {
      for (const breakpoint of deps.store.getBreakpoints()) {
        await deps.store.updateBreakpointStatus?.({ id: breakpoint.id, verified: false, message: "Pending JVM resolution", resolvedFile: "", className: "", method: "", hits: 0 });
      }
      for (const breakpoint of deps.store.getMethodBreakpoints?.() || []) {
        await deps.store.updateMethodBreakpointStatus?.({ id: breakpoint.id, verified: false, message: "Pending JVM resolution", hits: 0 });
      }
    }
    async function syncStartupBreakpoints() {
      await sendExceptionBreakpoint(deps.store.getExceptionBreakpoint?.());
      if (!state.breakpointsMuted) {
        for (const breakpoint of deps.store.getBreakpoints().filter((item) => item.enabled !== false)) await sendBreakpoint(breakpoint);
        for (const breakpoint of (deps.store.getMethodBreakpoints?.() || []).filter((item) => item.enabled !== false)) await sendMethodBreakpoint(breakpoint);
      }
    }

    async function start(configuration) {
      const projectPath = getProjectPath();
      if (!projectPath) throw new Error("Open a Java project before debugging.");
      activeConfiguration = configuration || deps.storeConfig.getActive();
      if (!activeConfiguration) throw new Error("Create or select a Java Application run configuration first.");
      await ensureProjectStoreLoaded();
      ignoreBridgeEventsAfterStop = false;
      await resetStartupBreakpointResolutionState();
      resetSessionState();
      try {
        const context = await deps.launcher.resolveJavaLaunchContext(activeConfiguration);
        const javaExecutable = await deps.resolveJavaExecutable?.(context.runtime);
        const protocol = await replaceProtocolClient();
        await protocol.start(javaExecutable ? { javaExecutable } : {}, handleEvent);
        await protocol.send(["LAUNCH", encode(activeConfiguration.java?.mainClass), encode(context.classpath), encode(activeConfiguration.java?.vmArguments), encode(activeConfiguration.java?.programArguments), encode(context.runtime?.projectJdk?.path), encode(context.projectPath)]);
        await syncStartupBreakpoints();
        await protocol.send(["START"]);
        return true;
      } catch (error) {
        return failStartup(error, "Java debugging could not start.");
      }
    }

    async function attach(host = "localhost", port = "5005") {
      const projectPath = getProjectPath();
      if (!projectPath) throw new Error("Open a Java project before attaching the debugger.");
      await ensureProjectStoreLoaded();
      activeConfiguration = null;
      ignoreBridgeEventsAfterStop = false;
      await resetStartupBreakpointResolutionState();
      resetSessionState();
      try {
        const javaExecutable = await deps.resolveJavaExecutable?.();
        const protocol = await replaceProtocolClient();
        await protocol.start(javaExecutable ? { javaExecutable } : {}, handleEvent);
        await protocol.send(["ATTACH", encode(host || "localhost"), String(port || "5005")]);
        await syncStartupBreakpoints();
        return true;
      } catch (error) {
        return failStartup(error, "Java debugger could not attach to the JVM.");
      }
    }
    async function restart() {
      const configuration = activeConfiguration;
      if (!configuration) throw new Error("Restart is available for launched Java Application debug sessions.");
      if (isDebuggeeActive()) await stop();
      else await activeProtocol?.stop?.();
      return start(configuration);
    }
    async function stop() {
      ignoreBridgeEventsAfterStop = true;
      try { await getProtocol().send(["STOP"]); } catch (_error) {}
      await activeProtocol?.stop?.();
      publish(clearRuntimeInspectionState({ state: "terminated", canAcceptStdin: false }));
      return true;
    }
    async function resume() {
      const previousState = rememberCommandRestoreState();
      publish(statePatchForDebuggerState("running"));
      try {
        return await getProtocol().send(["CONTINUE"]);
      } catch (error) {
        clearCommandRestoreState();
        publish(previousState);
        throw error;
      }
    }
    async function pause() {
      const previousState = rememberCommandRestoreState();
      publish({ state: "paused", stoppedReason: "pause", stoppedDescription: "" });
      try {
        return await getProtocol().send(["SUSPEND"]);
      } catch (error) {
        clearCommandRestoreState();
        publish(previousState);
        throw error;
      }
    }
    function canStepAtSelectedFrame() { return isSuspendedState(state.state) && Boolean(state.selectedFrameId); }
    async function step(kind) {
      if (!canStepAtSelectedFrame()) throw new Error("Pause at a Java stack frame before stepping.");
      const previousState = rememberCommandRestoreState();
      publish(statePatchForDebuggerState("stepping"));
      try {
        return await getProtocol().send(["STEP", kind]);
      } catch (error) {
        clearCommandRestoreState();
        publish(previousState);
        throw error;
      }
    }
    async function stepOver() { return step("over"); }
    async function stepInto() { return step("into"); }
    async function stepOut() { return step("out"); }
    function canDropFrame(frameId = state.selectedFrameId) {
      const frame = findFrame(frameId);
      return isSuspendedState(state.state) && frame?.canDrop === true;
    }
    async function dropToFrame(frameId = state.selectedFrameId) {
      const targetFrameId = frameId || state.selectedFrameId || "";
      if (!targetFrameId || !canDropFrame(targetFrameId)) throw new Error("Drop to Frame is not available for the selected stack frame.");
      const previousState = rememberCommandRestoreState();
      try {
        return await getProtocol().send(["DROP_TO_FRAME", targetFrameId]);
      } catch (error) {
        clearCommandRestoreState();
        publish(previousState);
        throw error;
      }
    }
    async function requestVariables(frameId = state.selectedFrameId) {
      if (!frameId) return false;
      try { return await getProtocol().send(["VARIABLES", frameId]); }
      catch (error) {
        if (ignoreBridgeEventsAfterStop || isBridgeStoppedError(error)) return false;
        throw error;
      }
    }
    async function selectFrame(frameId = state.selectedFrameId) {
      if (!frameId) return false;
      const frame = findFrame(frameId);
      const location = frame ? { file: frame.file, sourceName: frame.sourceName, line: frame.line, className: frame.className, method: frame.method } : state.location;
      publish({ selectedFrameId: frameId, location, variables: [], lastEvaluation: state.lastEvaluation });
      await getProtocol().send(["SELECT_FRAME", frameId]);
      if (frame) await navigateToLocation(location);
      if (await requestVariables(frameId) !== false) await evaluateWatches(frameId);
      return true;
    }
    async function expand(objectId) { if (!objectId) return false; return getProtocol().send(["EXPAND", objectId]); }
    async function evaluate(expression, frameId = state.selectedFrameId, options = {}) {
      const text = String(expression || "").trim();
      if (!text) return false;
      const targetFrameId = frameId || state.selectedFrameId || "";
      const shouldTrackState = options.state !== false;
      if (!(isSuspendedState(state.state) || (!shouldTrackState && canRunSilentEvaluation())) || !targetFrameId) throw new Error("Pause at a Java stack frame before evaluating expressions.");
      const shouldDisplay = options.display !== false;
      if (!shouldDisplay) markSilentEvaluation(text);
      if (options.history !== false) { await ensureProjectStoreLoaded(); await deps.store.addExpressionHistory?.(text); publish({ expressionHistory: deps.store.getExpressionHistory?.() || state.expressionHistory }); }
      const previousState = state.state;
      if (shouldTrackState && isSuspendedState(previousState)) {
        evaluationReturnState = previousState;
        evaluationInFlightExpression = text;
        publish({ state: "evaluating" });
      }
      try {
        return await getProtocol().send(["EVALUATE", targetFrameId, encode(text)]);
      } catch (error) {
        if (!shouldDisplay) consumeSilentEvaluation(text);
        if (state.state === "evaluating") publish({ state: evaluationReturnState || previousState });
        evaluationReturnState = "";
        evaluationInFlightExpression = "";
        throw error;
      }
    }
    async function evaluateForInspection(expression, frameId = state.selectedFrameId) {
      const text = String(expression || "").trim();
      const targetFrameId = frameId || state.selectedFrameId || "";
      if (!text || !isSuspendedState(state.state) || !targetFrameId) return null;
      const pendingResult = waitForInspectionEvaluation(text);
      try {
        await evaluate(text, targetFrameId, { history: false, state: false, display: false });
        return pendingResult;
      } catch (error) {
        resolveInspectionEvaluation(text, null);
        throw error;
      }
    }

    async function setValue(expression, value, frameId = state.selectedFrameId) {
      const targetFrameId = frameId || state.selectedFrameId || "";
      if (!isSuspendedState(state.state) || !targetFrameId) throw new Error("Pause at a Java stack frame before setting values.");
      const previousState = state.state;
      evaluationReturnState = previousState;
      evaluationInFlightExpression = String(expression || "").trim();
      publish({ state: "evaluating" });
      try {
        const result = await getProtocol().send(["SET", targetFrameId, encode(expression), encode(value)]);
        if (await requestVariables(targetFrameId) !== false) await evaluateWatches(targetFrameId);
        publish(restoreEvaluationState());
        return result;
      } catch (error) {
        if (state.state === "evaluating") publish({ state: evaluationReturnState || previousState });
        evaluationReturnState = "";
        evaluationInFlightExpression = "";
        throw error;
      }
    }
    async function runToCursor(file, line) {
      const targetFile = String(file || "");
      const targetLine = Math.max(0, Number(line) || 0);
      if (!isSuspendedState(state.state) || !state.selectedFrameId) throw new Error("Pause at a Java stack frame before using Run to Cursor.");
      if (!targetFile || targetLine <= 0) throw new Error("Choose a Java source line before using Run to Cursor.");
      const previousState = rememberCommandRestoreState();
      publish(statePatchForDebuggerState("stepping"));
      try {
        return await getProtocol().send(["RUN_TO", encode(targetFile), String(targetLine)]);
      } catch (error) {
        clearCommandRestoreState();
        publish(previousState);
        throw error;
      }
    }
    async function sendStdin(text) {
      if (!text) return false;
      if (state.canAcceptStdin !== true) throw new Error("Standard input is available only for launched Java debug sessions.");
      return getProtocol().send(["STDIN", encode(text)]);
    }
    function clearConsole() { return publish({ console: "", consoleEntries: [] }); }

    function clearRuntimeInspectionState(patch = {}) {
      return { threads: [], variables: [], watches: clearWatchRuntimeResults(), selectedFrameId: "", location: null, stoppedReason: "", stoppedDescription: "", lastEvaluation: null, canAcceptStdin: state.canAcceptStdin === true, ...patch };
    }

    function stoppedEventDescription(body = {}) {
      if (String(body.reason || "") !== "exception") return "";
      const exception = body.exception || {};
      const value = String(exception.value || "").trim();
      const type = String(exception.type || "").trim();
      return `Stopped at exception: ${value || type || "unknown exception"}`;
    }
    function clearWatchRuntimeResults(watches = state.watches) {
      return (watches || []).map((watch) => watch.result ? { ...watch, result: null } : watch);
    }

    function statePatchForDebuggerState(debugState) {
      const nextState = debugState || state.state;
      if (!["not-running", "launching", "running", "stepping", "terminated", "failed"].includes(nextState)) return { state: nextState };
      const patch = { state: nextState, canAcceptStdin: !["not-running", "terminated", "failed"].includes(nextState) && state.canAcceptStdin === true };
      if (nextState === "failed") {
        patch.lastError = state.lastError || "";
        patch.console = state.console || "";
        patch.consoleEntries = state.consoleEntries || [];
      }
      return clearRuntimeInspectionState(patch);
    }

    function isDebuggeeActive() {
      return !["not-running", "terminated", "failed"].includes(state.state);
    }

    function normalizeBreakpointHitCount(value) {
      const text = String(value ?? "").trim();
      if (!text) return 0;
      if (!/^\d+$/.test(text)) throw new Error("Hit count must be a whole number of 0 or higher.");
      return Number(text);
    }

    async function sendBreakpoint(breakpoint) {
      return getProtocol().send(["BREAKPOINT", encode(breakpoint.file), String(breakpoint.line), String(breakpoint.enabled !== false), encode(breakpoint.condition), String(breakpoint.hitCount || 0), encode(breakpoint.logMessage)]);
    }

    async function sendExceptionBreakpoint(exceptionBreakpoint = deps.store.getExceptionBreakpoint?.()) {
      const config = exceptionBreakpoint || { enabled: false, caught: true, uncaught: true };
      return getProtocol().send(["EXCEPTION_BREAKPOINT", String(state.breakpointsMuted !== true && config.enabled !== false), String(config.caught !== false), String(config.uncaught !== false)]);
    }

    async function sendMethodBreakpoint(breakpoint) {
      return getProtocol().send(["METHOD_BREAKPOINT", breakpoint.id, encode(breakpoint.className), encode(breakpoint.methodName), String(breakpoint.enabled !== false)]);
    }

    async function removeRuntimeMethodBreakpoint(breakpoint) {
      if (!breakpoint) return false;
      return getProtocol().send(["REMOVE_METHOD_BREAKPOINT", breakpoint.id]);
    }

    async function removeRuntimeBreakpoint(breakpoint) {
      if (!breakpoint) return false;
      return getProtocol().send(["REMOVE_BREAKPOINT", encode(breakpoint.file), String(breakpoint.line)]);
    }

    async function markAttachedBreakpointPendingResolution(breakpoint) {
      if (activeConfiguration || !breakpoint?.id || breakpoint.enabled === false) return breakpoint;
      const message = "Pending source load. If this class is already loaded, the running bytecode may be out of date with the source.";
      const updated = await deps.store.updateBreakpointStatus?.({ id: breakpoint.id, verified: false, message });
      if (updated) publish({ breakpoints: deps.store.getBreakpoints() });
      return updated || breakpoint;
    }

    async function syncRuntimeBreakpoint(breakpoint) {
      if (!isDebuggeeActive()) return false;
      if (state.breakpointsMuted || breakpoint?.enabled === false) return removeRuntimeBreakpoint(breakpoint);
      const targetBreakpoint = await markAttachedBreakpointPendingResolution(breakpoint);
      return sendBreakpoint(targetBreakpoint);
    }

    async function syncRuntimeBreakpoints(breakpoints = deps.store.getBreakpoints()) {
      if (!isDebuggeeActive()) return false;
      for (const breakpoint of breakpoints) await syncRuntimeBreakpoint(breakpoint);
      return true;
    }

    async function syncRuntimeMethodBreakpoint(breakpoint) {
      if (!isDebuggeeActive()) return false;
      if (state.breakpointsMuted || breakpoint?.enabled === false) return removeRuntimeMethodBreakpoint(breakpoint);
      return sendMethodBreakpoint(breakpoint);
    }

    async function syncRuntimeMethodBreakpoints(breakpoints = deps.store.getMethodBreakpoints?.() || []) {
      if (!isDebuggeeActive()) return false;
      for (const breakpoint of breakpoints) await syncRuntimeMethodBreakpoint(breakpoint);
      return true;
    }

    function findStoredBreakpoint(file, line) {
      return deps.store.getBreakpoints().find((breakpoint) => breakpoint.file === file && Number(breakpoint.line) === Number(line)) || null;
    }

    function getBreakpointSource(file) {
      if (typeof deps.getSourceForFile !== "function") return "";
      return String(deps.getSourceForFile(file) || "");
    }

    function assertBreakpointLineAvailable(file, line) {
      const source = getBreakpointSource(file);
      const validator = deps.sourceContext?.isJavaBreakpointLine || global.MarkdownViewerJavaDebugSourceContext?.isJavaBreakpointLine;
      if (!source || typeof validator !== "function") return true;
      if (validator({ source, file, line })) return true;
      throw new Error("Line " + line + " is not a valid Java breakpoint location. Choose an executable statement line.");
    }

    async function addBreakpoint(file, line) {
      await ensureProjectStoreLoaded();
      assertBreakpointLineAvailable(file, line);
      const breakpoint = await deps.store.updateBreakpoint(file, line, { enabled: true });
      publish({ breakpoints: deps.store.getBreakpoints() });
      await syncRuntimeBreakpoint(breakpoint);
      return breakpoint;
    }

    async function toggleBreakpoint(file, line, patch = {}) {
      await ensureProjectStoreLoaded();
      const existing = findStoredBreakpoint(file, line);
      if (!existing) assertBreakpointLineAvailable(file, line);
      const result = await deps.store.toggleBreakpoint(file, line, patch);
      publish({ breakpoints: deps.store.getBreakpoints() });
      if (isDebuggeeActive()) {
        if (result.removed) await removeRuntimeBreakpoint(result.breakpoint);
        else await syncRuntimeBreakpoint(result.breakpoint);
      }
      return result;
    }

    async function setBreakpointEnabled(file, line, enabled) {
      await ensureProjectStoreLoaded();
      if (!findStoredBreakpoint(file, line)) assertBreakpointLineAvailable(file, line);
      const breakpoint = await deps.store.updateBreakpoint(file, line, { enabled: enabled === true });
      publish({ breakpoints: deps.store.getBreakpoints() });
      await syncRuntimeBreakpoint(breakpoint);
      return breakpoint;
    }

    async function updateBreakpoint(file, line, patch = {}) {
      await ensureProjectStoreLoaded();
      if (!findStoredBreakpoint(file, line)) assertBreakpointLineAvailable(file, line);
      const nextPatch = { ...patch };
      if (Object.prototype.hasOwnProperty.call(nextPatch, "hitCount")) nextPatch.hitCount = normalizeBreakpointHitCount(nextPatch.hitCount);
      const breakpoint = await deps.store.updateBreakpoint(file, line, nextPatch);
      publish({ breakpoints: deps.store.getBreakpoints() });
      await syncRuntimeBreakpoint(breakpoint);
      return breakpoint;
    }

    async function setBreakpointsEnabled(enabled) {
      await ensureProjectStoreLoaded();
      const previousBreakpoints = deps.store.getBreakpoints();
      const previousMethodBreakpoints = deps.store.getMethodBreakpoints?.() || [];
      const previousExceptionBreakpoint = deps.store.getExceptionBreakpoint?.() || null;
      const breakpoints = await deps.store.setBreakpointsEnabled(enabled === true);
      const methodBreakpoints = deps.store.getMethodBreakpoints?.() || [];
      let exceptionBreakpoint = previousExceptionBreakpoint;
      const shouldUpdateExceptionBreakpoint = previousExceptionBreakpoint?.enabled !== false || previousExceptionBreakpoint?.disabledByBulkAction === true;
      if (shouldUpdateExceptionBreakpoint) {
        exceptionBreakpoint = await deps.store.updateExceptionBreakpoint?.({ enabled: enabled === true, disabledByBulkAction: enabled !== true && (previousExceptionBreakpoint?.enabled !== false || previousExceptionBreakpoint?.disabledByBulkAction === true) }) || previousExceptionBreakpoint;
      }
      publish({ breakpoints, methodBreakpoints, exceptionBreakpoint });
      if (isDebuggeeActive()) {
        if (enabled === true && !state.breakpointsMuted) { await syncRuntimeBreakpoints(breakpoints); await syncRuntimeMethodBreakpoints(methodBreakpoints); }
        else { for (const breakpoint of previousBreakpoints) await removeRuntimeBreakpoint(breakpoint); for (const breakpoint of previousMethodBreakpoints) await removeRuntimeMethodBreakpoint(breakpoint); }
        await sendExceptionBreakpoint(exceptionBreakpoint);
      }
      return breakpoints;
    }

    async function setBreakpointsMuted(muted) {
      await ensureProjectStoreLoaded();
      const nextMuted = muted === true;
      publish({ breakpointsMuted: nextMuted, breakpoints: deps.store.getBreakpoints(), methodBreakpoints: deps.store.getMethodBreakpoints?.() || [], exceptionBreakpoint: deps.store.getExceptionBreakpoint?.() || null });
      if (isDebuggeeActive()) {
        if (nextMuted) { for (const breakpoint of deps.store.getBreakpoints()) await removeRuntimeBreakpoint(breakpoint); for (const breakpoint of deps.store.getMethodBreakpoints?.() || []) await removeRuntimeMethodBreakpoint(breakpoint); }
        else { await syncRuntimeBreakpoints(deps.store.getBreakpoints()); await syncRuntimeMethodBreakpoints(deps.store.getMethodBreakpoints?.() || []); }
        await sendExceptionBreakpoint(deps.store.getExceptionBreakpoint?.());
      }
      return nextMuted;
    }

    async function updateExceptionBreakpoint(patch = {}) {
      await ensureProjectStoreLoaded();
      const exceptionBreakpoint = await deps.store.updateExceptionBreakpoint?.(patch);
      publish({ exceptionBreakpoint });
      if (isDebuggeeActive()) await sendExceptionBreakpoint(exceptionBreakpoint);
      return exceptionBreakpoint;
    }

    async function removeBreakpoint(file, line) {
      await ensureProjectStoreLoaded();
      const existing = deps.store.getBreakpoints().find((breakpoint) => breakpoint.file === file && Number(breakpoint.line) === Number(line));
      await deps.store.removeBreakpoint(file, line);
      publish({ breakpoints: deps.store.getBreakpoints() });
      if (isDebuggeeActive()) await removeRuntimeBreakpoint(existing || { file, line });
      return true;
    }


    async function moveBreakpoint(file, fromLine, toLine) {
      await ensureProjectStoreLoaded();
      const sourceLine = Math.max(1, Number(fromLine) || 0);
      const targetLine = Math.max(1, Number(toLine) || 0);
      if (!file || !sourceLine || !targetLine || sourceLine === targetLine) return null;
      assertBreakpointLineAvailable(file, targetLine);
      const existing = deps.store.getBreakpoints().find((breakpoint) => breakpoint.file === file && Number(breakpoint.line) === sourceLine);
      if (!existing) return null;
      await deps.store.removeBreakpoint(existing.file, existing.line);
      const breakpoint = await deps.store.upsertBreakpoint({ ...existing, line: targetLine, resolvedFile: "", hits: 0, verified: false, message: "Pending source edit" });
      publish({ breakpoints: deps.store.getBreakpoints() });
      if (isDebuggeeActive()) {
        await removeRuntimeBreakpoint(existing);
        await syncRuntimeBreakpoint(breakpoint);
      }
      return breakpoint;
    }
    async function addMethodBreakpoint(className, methodName) {
      await ensureProjectStoreLoaded();
      const breakpoint = await deps.store.addMethodBreakpoint?.(className, methodName);
      publish({ methodBreakpoints: deps.store.getMethodBreakpoints?.() || [] });
      if (breakpoint && isDebuggeeActive()) await syncRuntimeMethodBreakpoint(breakpoint);
      return breakpoint;
    }

    async function updateMethodBreakpoint(id, patch = {}) {
      await ensureProjectStoreLoaded();
      const existing = (deps.store.getMethodBreakpoints?.() || []).find((breakpoint) => breakpoint.id === id);
      const breakpoint = await deps.store.updateMethodBreakpoint?.(id, patch);
      publish({ methodBreakpoints: deps.store.getMethodBreakpoints?.() || [] });
      if (breakpoint && isDebuggeeActive()) {
        if (existing && existing.id !== breakpoint.id) await removeRuntimeMethodBreakpoint(existing);
        await syncRuntimeMethodBreakpoint(breakpoint);
      }
      return breakpoint;
    }

    async function setMethodBreakpointEnabled(id, enabled) {
      return updateMethodBreakpoint(id, { enabled: enabled === true });
    }

    async function removeMethodBreakpoint(id) {
      await ensureProjectStoreLoaded();
      const existing = (deps.store.getMethodBreakpoints?.() || []).find((breakpoint) => breakpoint.id === id);
      await deps.store.removeMethodBreakpoint?.(id);
      publish({ methodBreakpoints: deps.store.getMethodBreakpoints?.() || [] });
      if (isDebuggeeActive()) await removeRuntimeMethodBreakpoint(existing || { id });
      return true;
    }

    async function clearBreakpoints() {
      await ensureProjectStoreLoaded();
      const previousBreakpoints = deps.store.getBreakpoints();
      const previousMethodBreakpoints = deps.store.getMethodBreakpoints?.() || [];
      await deps.store.clearBreakpoints();
      const exceptionBreakpoint = deps.store.getExceptionBreakpoint?.() || null;
      publish({ breakpoints: [], methodBreakpoints: [], exceptionBreakpoint });
      if (isDebuggeeActive()) {
        for (const breakpoint of previousBreakpoints) await removeRuntimeBreakpoint(breakpoint);
        for (const breakpoint of previousMethodBreakpoints) await removeRuntimeMethodBreakpoint(breakpoint);
        await sendExceptionBreakpoint(exceptionBreakpoint);
      }
      return true;
    }

    async function evaluateWatches(frameId = state.selectedFrameId) {
      const watches = deps.store.getWatches();
      const targetFrameId = frameId || state.selectedFrameId || "";
      publish({ watches });
      if (!canEvaluateAtFrame(targetFrameId)) return false;
      for (const watch of watches.filter((item) => item.enabled)) await evaluate(watch.expression, targetFrameId, { history: false, state: false, display: false });
      return true;
    }

    async function refreshWatches(frameId = state.selectedFrameId) {
      await ensureProjectStoreLoaded();
      return evaluateWatches(frameId);
    }

    async function addWatch(expression) {
      await ensureProjectStoreLoaded();
      const watch = await deps.store.addWatch(expression);
      publish({ watches: deps.store.getWatches() });
      if (watch && canEvaluateAtFrame()) await evaluate(watch.expression, state.selectedFrameId, { history: false, state: false, display: false });
      return watch;
    }
    async function updateWatch(id, patch = {}) {
      await ensureProjectStoreLoaded();
      const watch = await deps.store.updateWatch(id, patch);
      publish({ watches: mergeWatchRuntimeState(deps.store.getWatches()) });
      if (watch?.enabled && canEvaluateAtFrame()) await evaluate(watch.expression, state.selectedFrameId, { history: false, state: false, display: false });
      return watch;
    }
    async function removeWatch(id) { await ensureProjectStoreLoaded(); await deps.store.removeWatch(id); publish({ watches: deps.store.getWatches() }); }
    async function expandWatch(objectId) { if (!objectId) return false; return expand(objectId); }
    async function loadProjectState() { await ensureProjectStoreLoaded(); return publish({ breakpoints: deps.store.getBreakpoints(), methodBreakpoints: deps.store.getMethodBreakpoints?.() || [], watches: deps.store.getWatches(), expressionHistory: deps.store.getExpressionHistory?.() || [], exceptionBreakpoint: deps.store.getExceptionBreakpoint?.() || null }); }

    function mergeWatchRuntimeState(nextWatches) {
      return (nextWatches || []).map((watch) => {
        const previous = state.watches.find((item) => item.id === watch.id);
        return previous && previous.expression === watch.expression ? { ...watch, result: previous.result } : watch;
      });
    }

    const api = { subscribe, loadProjectState, start, attach, restart, stop, resume, pause, stepOver, stepInto, stepOut, dropToFrame, requestVariables, selectFrame, expand, evaluate, evaluateForInspection, setValue, runToCursor, sendStdin, clearConsole, navigateToSource, addBreakpoint, toggleBreakpoint, setBreakpointEnabled, updateBreakpoint, setBreakpointsEnabled, setBreakpointsMuted, removeBreakpoint, moveBreakpoint, clearBreakpoints, sendBreakpoint, sendExceptionBreakpoint, sendMethodBreakpoint, addMethodBreakpoint, updateMethodBreakpoint, setMethodBreakpointEnabled, removeMethodBreakpoint, updateExceptionBreakpoint, addWatch, updateWatch, removeWatch, refreshWatches, expandWatch, getState: () => ({ ...state }) };
    if (deps.registerModule !== false) app.registerModule?.(deps.moduleName || "javaDebugSession", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugSession = registerMarkdownViewerJavaDebugSession;
})(typeof window !== "undefined" ? window : globalThis);
