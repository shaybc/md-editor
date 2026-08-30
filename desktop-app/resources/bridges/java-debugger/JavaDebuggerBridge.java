import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** JDI-backed Java debugger bridge for MD-Editor's desktop Java Application debugger. */
final class JavaDebuggerBridge {
  private final Map<String, LineBreakpoint> breakpoints = new LinkedHashMap<>();
  private final Map<String, MethodBreakpoint> methodBreakpoints = new LinkedHashMap<>();
  private final Map<Long, ObjectReference> objects = new ConcurrentHashMap<>();
  private final Map<Long, String> objectExpressions = new ConcurrentHashMap<>();
  private VirtualMachine vm;
  private EventSet suspendedEvents;
  private ThreadReference selectedThread;
  private int selectedFrameIndex;
  private volatile boolean connected;
  private volatile boolean launched;
  private volatile boolean debuggeeStarted;
  private boolean exceptionBreakpointEnabled = false;
  private boolean breakOnCaughtExceptions = true;
  private boolean breakOnUncaughtExceptions = true;

  public static void main(String[] args) throws Exception {
    JavaDebuggerBridge bridge = new JavaDebuggerBridge();
    bridge.emit("ready", "{\"state\":\"not-running\"}");
    bridge.readCommands();
  }

  private void readCommands() throws Exception {
    try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = input.readLine()) != null) {
        if (line.isBlank()) continue;
        try { handle(line.split("\\t", -1)); }
        catch (Throwable error) { emitError(error.getMessage() == null ? error.toString() : error.getMessage()); }
      }
    }
  }

  private void handle(String[] fields) throws Exception {
    String command = fields[0];
    if ("LAUNCH".equals(command)) launch(fields);
    else if ("ATTACH".equals(command)) attach(fields);
    else if ("BREAKPOINT".equals(command)) addOrUpdateBreakpoint(fields);
    else if ("REMOVE_BREAKPOINT".equals(command)) removeBreakpoint(fields);
    else if ("METHOD_BREAKPOINT".equals(command)) addOrUpdateMethodBreakpoint(fields);
    else if ("REMOVE_METHOD_BREAKPOINT".equals(command)) removeMethodBreakpoint(fields);
    else if ("EXCEPTION_BREAKPOINT".equals(command)) updateExceptionBreakpoint(fields);
    else if ("START".equals(command)) startDebuggee();
    else if ("CONTINUE".equals(command)) resumeDebuggee();
    else if ("SUSPEND".equals(command)) suspendDebuggee();
    else if ("STOP".equals(command)) stopDebuggee();
    else if ("STEP".equals(command)) step(fields.length > 1 ? fields[1] : "over");
    else if ("RUN_TO".equals(command)) runTo(fields);
    else if ("DROP_TO_FRAME".equals(command)) dropToFrame(fields.length > 1 ? fields[1] : "");
    else if ("SELECT_FRAME".equals(command)) selectDebugFrame(fields.length > 1 ? fields[1] : "");
    else if ("VARIABLES".equals(command)) emitVariables(fields.length > 1 ? fields[1] : "");
    else if ("EXPAND".equals(command)) emitObjectChildren(fields.length > 1 ? fields[1] : "");
    else if ("EVALUATE".equals(command)) evaluate(fields);
    else if ("SET".equals(command)) setValue(fields);
    else if ("STDIN".equals(command)) sendStdin(fields);
  }

  private void launch(String[] fields) throws Exception {
    if (connected) throw new IllegalStateException("A debug session is already running.");
    emit("state", "{\"state\":\"launching\"}");
    String mainClass = decode(fields, 1);
    String classpath = decode(fields, 2);
    String vmArgs = decode(fields, 3);
    String programArgs = decode(fields, 4);
    String jdkHome = decode(fields, 5);
    validateLaunchInputs(mainClass, classpath);
    LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
    Map<String, Connector.Argument> args = connector.defaultArguments();
    args.get("main").setValue(mainClass + (programArgs.isBlank() ? "" : " " + programArgs));
    args.get("options").setValue((vmArgs.isBlank() ? "" : vmArgs + " ") + "-classpath " + quoteCommand(classpath));
    if (args.containsKey("home") && !jdkHome.isBlank()) args.get("home").setValue(jdkHome);
    if (args.containsKey("suspend")) args.get("suspend").setValue("true");
    vm = connector.launch(args);
    connected = true;
    launched = true;
    debuggeeStarted = false;
    startStream("stdout", vm.process().getInputStream());
    startStream("stderr", vm.process().getErrorStream());
    configureRequests();
    startEventThread();
  }

  private void attach(String[] fields) throws Exception {
    if (connected) throw new IllegalStateException("A debug session is already running.");
    emit("state", "{\"state\":\"launching\"}");
    String host = decode(fields, 1);
    String port = fields.length > 2 ? fields[2] : "";
    String portValue = validateAttachPort(port);
    AttachingConnector connector = socketAttachingConnector();
    Map<String, Connector.Argument> args = connector.defaultArguments();
    args.get("hostname").setValue(host.isBlank() ? "localhost" : host);
    args.get("port").setValue(portValue);
    vm = connector.attach(args);
    connected = true;
    launched = false;
    configureRequests();
    startEventThread();
    emit("state", "{\"state\":\"running\"}");
    emitSnapshot("");
  }

  private void validateLaunchInputs(String mainClass, String classpath) {
    if (mainClass == null || mainClass.isBlank()) throw new IllegalArgumentException("Choose a Java Application main class before starting the debugger.");
    if (classpath == null || classpath.isBlank()) throw new IllegalArgumentException("The Java launch classpath is empty. Build the project or check the run configuration before debugging.");
  }

  private String validateAttachPort(String port) {
    String value = port == null || port.isBlank() ? "5005" : port.trim();
    try {
      int parsed = Integer.parseInt(value);
      if (parsed >= 1 && parsed <= 65535) return value;
    } catch (NumberFormatException ignored) {}
    throw new IllegalArgumentException("Attach port must be a number from 1 to 65535.");
  }

  private AttachingConnector socketAttachingConnector() {
    for (AttachingConnector connector : Bootstrap.virtualMachineManager().attachingConnectors()) {
      if ("com.sun.jdi.SocketAttach".equals(connector.name())) return connector;
    }
    throw new IllegalStateException("JDI socket attach connector is unavailable.");
  }

  private void startEventThread() {
    Thread eventThread = new Thread(this::eventLoop, "md-editor-java-debugger-events");
    eventThread.setDaemon(true);
    eventThread.start();
  }

  private void configureRequests() {
    EventRequestManager requests = vm.eventRequestManager();
    ClassPrepareRequest prepare = requests.createClassPrepareRequest();
    prepare.setSuspendPolicy(EventRequest.SUSPEND_ALL);
    prepare.enable();
    installExceptionBreakpoint();
    installBreakpointsForLoadedClasses();
  }

  private void startDebuggee() {
    debuggeeStarted = true;
    resumeDebuggee();
  }

  private void resumeDebuggee() {
    resumeDebuggee(true);
  }

  private void resumeDebuggee(boolean emitRunningState) {
    requireVm();
    EventSet pending = suspendedEvents;
    suspendedEvents = null;
    selectedThread = null;
    selectedFrameIndex = 0;
    if (pending != null) pending.resume(); else vm.resume();
    if (emitRunningState) emit("state", "{\"state\":\"running\"}");
  }

  private void suspendDebuggee() throws Exception {
    requireVm();
    vm.suspend();
    selectedThread = firstSuspendedThread();
    selectedFrameIndex = 0;
    emit("state", "{\"state\":\"paused\"}");
    emitSnapshot(selectedFrameId());
  }

  private void stopDebuggee() {
    if (vm != null) try { if (launched) vm.exit(130); else vm.dispose(); } catch (Throwable ignored) {}
    connected = false;
    emit("terminated", "{\"state\":\"terminated\"}");
  }

  private void step(String kind) throws Exception {
    requireStoppedThread();
    EventRequestManager requests = vm.eventRequestManager();
    requests.deleteEventRequests(requests.stepRequests());
    int depth = "into".equals(kind) ? StepRequest.STEP_INTO : "out".equals(kind) ? StepRequest.STEP_OUT : StepRequest.STEP_OVER;
    StepRequest request = requests.createStepRequest(selectedThread, StepRequest.STEP_LINE, depth);
    request.addCountFilter(1);
    request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
    request.enable();
    emit("state", "{\"state\":\"stepping\"}");
    resumeDebuggee(false);
  }

  private void runTo(String[] fields) throws Exception {
    String file = decode(fields, 1);
    int line = Integer.parseInt(fields[2]);
    installRunToCursorBreakpoint(file, line);
    resumeDebuggee();
  }

  private void installRunToCursorBreakpoint(String file, int line) throws Exception {
    requireVm();
    deleteRunToCursorRequests();
    String sourceName = sourceName(file);
    List<Location> locations = matchingSourceLocations(file, line);
    for (Location location : locations) {
      BreakpointRequest request = vm.eventRequestManager().createBreakpointRequest(location);
      request.putProperty("mdEditorRunToCursor", Boolean.TRUE);
      request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
      request.enable();
    }
    if (locations.isEmpty()) throw new IllegalStateException("No executable Java location was found at " + sourceName + ":" + line + ".");
  }

  private void deleteRunToCursorRequests() {
    if (vm == null) return;
    List<BreakpointRequest> toDelete = new ArrayList<>();
    for (BreakpointRequest request : vm.eventRequestManager().breakpointRequests()) {
      if (Boolean.TRUE.equals(request.getProperty("mdEditorRunToCursor"))) toDelete.add(request);
    }
    if (!toDelete.isEmpty()) vm.eventRequestManager().deleteEventRequests(toDelete);
  }

  private void dropToFrame(String frameId) throws Exception {
    FrameSelection selection = selectFrame(frameId);
    if (selection == null) throw new IllegalStateException("Select a stack frame before using Drop to Frame.");
    if (!canDropToFrame(selection.thread, selection.index)) throw new IllegalStateException("Drop to Frame is not available for the selected stack frame.");
    selection.thread.popFrames(selection.thread.frame(selection.index - 1));
    selectedThread = selection.thread;
    selectedFrameIndex = 0;
    emitSnapshot(frameIdFor(selection.thread, 0));
  }

  private void selectDebugFrame(String frameId) throws Exception {
    FrameSelection selection = selectFrame(frameId);
    if (selection == null) throw new IllegalStateException("Select an available suspended stack frame.");
    selectedThread = selection.thread;
    selectedFrameIndex = selection.index;
    emitSnapshot(frameIdFor(selection.thread, selection.index));
  }

  private void addOrUpdateBreakpoint(String[] fields) {
    String file = decode(fields, 1);
    int line = Integer.parseInt(fields[2]);
    boolean enabled = Boolean.parseBoolean(fields.length > 3 ? fields[3] : "true");
    String condition = decode(fields, 4);
    int hitCount = Integer.parseInt(fields.length > 5 && !fields[5].isBlank() ? fields[5] : "0");
    String logMessage = decode(fields, 6);
    boolean temporary = fields.length > 7 && Boolean.parseBoolean(fields[7]);
    String id = breakpointId(file, line);
    LineBreakpoint breakpoint = new LineBreakpoint(id, file, sourceName(file), line, enabled, condition, hitCount, logMessage, temporary, 0, false, "Pending source load", "", "", "");
    if (vm != null) deleteBreakpointRequests(id);
    breakpoints.put(id, breakpoint);
    if (vm != null) installBreakpoint(breakpoint);
    emit("breakpoint", breakpoint.toJson());
  }

  private void deleteBreakpointRequests(String id) {
    if (vm == null) return;
    List<BreakpointRequest> toDelete = new ArrayList<>();
    for (BreakpointRequest request : vm.eventRequestManager().breakpointRequests()) {
      if (id.equals(request.getProperty("mdEditorBreakpointId"))) toDelete.add(request);
    }
    if (!toDelete.isEmpty()) vm.eventRequestManager().deleteEventRequests(toDelete);
  }

  private void addOrUpdateMethodBreakpoint(String[] fields) {
    String id = fields.length > 1 ? fields[1] : "";
    String className = decode(fields, 2);
    String methodName = decode(fields, 3);
    boolean enabled = Boolean.parseBoolean(fields.length > 4 ? fields[4] : "true");
    MethodBreakpoint breakpoint = new MethodBreakpoint(id, className, methodName, enabled, 0, false, "Pending class load");
    if (vm != null) deleteMethodBreakpointRequests(id);
    methodBreakpoints.put(id, breakpoint);
    if (vm != null) installMethodBreakpoint(breakpoint);
    emit("methodBreakpoint", methodBreakpoints.getOrDefault(id, breakpoint).toJson());
  }

  private void deleteMethodBreakpointRequests(String id) {
    if (vm == null) return;
    List<MethodEntryRequest> toDelete = new ArrayList<>();
    for (MethodEntryRequest request : vm.eventRequestManager().methodEntryRequests()) {
      if (id.equals(request.getProperty("mdEditorMethodBreakpointId"))) toDelete.add(request);
    }
    if (!toDelete.isEmpty()) vm.eventRequestManager().deleteEventRequests(toDelete);
  }

  private void removeMethodBreakpoint(String[] fields) {
    String id = fields.length > 1 ? fields[1] : "";
    MethodBreakpoint removed = methodBreakpoints.remove(id);
    deleteMethodBreakpointRequests(id);
    if (removed != null) emit("methodBreakpoint", removed.withVerified(false, "Removed").toJson());
  }

  private void installMethodBreakpoint(MethodBreakpoint breakpoint) {
    if (!breakpoint.enabled || vm == null) return;
    deleteMethodBreakpointRequests(breakpoint.id);
    MethodEntryRequest request = vm.eventRequestManager().createMethodEntryRequest();
    request.addClassFilter(breakpoint.className);
    request.putProperty("mdEditorMethodBreakpointId", breakpoint.id);
    request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
    request.enable();
    boolean resolved = isMethodBreakpointResolved(breakpoint);
    MethodBreakpoint next = breakpoint.withVerified(resolved, resolved ? "Resolved" : unresolvedMethodBreakpointMessage(breakpoint));
    methodBreakpoints.put(breakpoint.id, next);
    emit("methodBreakpoint", next.toJson());
  }

  private void updateMethodBreakpointForPreparedClass(MethodBreakpoint breakpoint, ReferenceType preparedType) {
    if (!breakpoint.enabled || !preparedType.name().equals(breakpoint.className)) return;
    boolean resolved = !preparedType.methodsByName(breakpoint.methodName).isEmpty();
    MethodBreakpoint next = breakpoint.withVerified(resolved, resolved ? "Resolved" : unresolvedMethodBreakpointMessage(breakpoint));
    methodBreakpoints.put(breakpoint.id, next);
    emit("methodBreakpoint", next.toJson());
  }

  private boolean isMethodBreakpointResolved(MethodBreakpoint breakpoint) {
    if (vm == null) return false;
    for (ReferenceType type : vm.allClasses()) if (type.name().equals(breakpoint.className) && !type.methodsByName(breakpoint.methodName).isEmpty()) return true;
    return false;
  }

  private String unresolvedMethodBreakpointMessage(MethodBreakpoint breakpoint) {
    if (isClassLoaded(breakpoint.className)) return "No Java method " + breakpoint.methodName + "() in loaded class " + breakpoint.className;
    return "Pending class load";
  }

  private boolean isClassLoaded(String className) {
    if (vm == null) return false;
    for (ReferenceType type : vm.allClasses()) if (type.name().equals(className)) return true;
    return false;
  }

  private void removeBreakpoint(String[] fields) {
    String id = breakpointId(decode(fields, 1), Integer.parseInt(fields[2]));
    LineBreakpoint removed = breakpoints.remove(id);
    deleteBreakpointRequests(id);
    if (removed != null) emit("breakpoint", removed.withVerified(false, "Removed").toJson());
  }

  private void updateExceptionBreakpoint(String[] fields) {
    exceptionBreakpointEnabled = Boolean.parseBoolean(fields.length > 1 ? fields[1] : "true");
    breakOnCaughtExceptions = Boolean.parseBoolean(fields.length > 2 ? fields[2] : "true");
    breakOnUncaughtExceptions = Boolean.parseBoolean(fields.length > 3 ? fields[3] : "true");
    installExceptionBreakpoint();
    emit("exceptionBreakpoint", exceptionBreakpointJson());
  }

  private void installExceptionBreakpoint() {
    if (vm == null) return;
    EventRequestManager requests = vm.eventRequestManager();
    if (!requests.exceptionRequests().isEmpty()) requests.deleteEventRequests(new ArrayList<EventRequest>(requests.exceptionRequests()));
    if (!exceptionBreakpointEnabled || (!breakOnCaughtExceptions && !breakOnUncaughtExceptions)) return;
    ExceptionRequest exceptions = requests.createExceptionRequest(null, breakOnCaughtExceptions, breakOnUncaughtExceptions);
    exceptions.setSuspendPolicy(EventRequest.SUSPEND_ALL);
    exceptions.enable();
  }

  private String exceptionBreakpointJson() {
    return "{\"id\":\"java-exceptions\",\"enabled\":" + exceptionBreakpointEnabled + ",\"caught\":" + breakOnCaughtExceptions + ",\"uncaught\":" + breakOnUncaughtExceptions + "}";
  }

  private void installBreakpointsForLoadedClasses() { for (LineBreakpoint breakpoint : new ArrayList<>(breakpoints.values())) installBreakpoint(breakpoint); for (MethodBreakpoint breakpoint : new ArrayList<>(methodBreakpoints.values())) installMethodBreakpoint(breakpoint); }

  private void installBreakpointsForPreparedClass(ReferenceType preparedType) {
    for (LineBreakpoint breakpoint : new ArrayList<>(breakpoints.values())) installBreakpointForPreparedClass(breakpoint, preparedType);
    for (MethodBreakpoint breakpoint : new ArrayList<>(methodBreakpoints.values())) updateMethodBreakpointForPreparedClass(breakpoint, preparedType);
  }

  private void installBreakpoint(LineBreakpoint breakpoint) {
    if (!breakpoint.enabled) return;
    deleteBreakpointRequests(breakpoint.id);
    Location resolvedLocation = null;
    List<Location> locations = matchingSourceLocations(breakpoint.file, breakpoint.line);
    for (Location location : locations) {
      BreakpointRequest request = vm.eventRequestManager().createBreakpointRequest(location);
      request.putProperty("mdEditorBreakpointId", breakpoint.id);
      request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
      if (breakpoint.hitCount > 0) request.addCountFilter(breakpoint.hitCount);
      request.enable();
      if (resolvedLocation == null) resolvedLocation = location;
    }
    boolean installed = !locations.isEmpty();
    String message = installed ? "Resolved" : unresolvedLineBreakpointMessage(breakpoint);
    LineBreakpoint next = withBreakpointLocation(breakpoint.withVerified(installed, message), resolvedLocation);
    breakpoints.put(breakpoint.id, next);
    emit("breakpoint", next.toJson());
  }

  private void installBreakpointForPreparedClass(LineBreakpoint breakpoint, ReferenceType preparedType) {
    if (!breakpoint.enabled) return;
    List<Location> locations = matchingSourceLocations(preparedType, breakpoint.file, breakpoint.line);
    List<Location> newLocations = new ArrayList<>();
    for (Location location : locations) if (!hasBreakpointRequestAtLocation(breakpoint.id, location)) newLocations.add(location);
    if (newLocations.isEmpty()) {
      if (!breakpoint.verified && sourceMatches(preparedType, breakpoint.file)) {
        LineBreakpoint next = breakpoint.withVerified(false, unresolvedLineBreakpointMessage(breakpoint));
        breakpoints.put(breakpoint.id, next);
        emit("breakpoint", next.toJson());
      }
      return;
    }
    Location resolvedLocation = null;
    for (Location location : newLocations) {
      BreakpointRequest request = vm.eventRequestManager().createBreakpointRequest(location);
      request.putProperty("mdEditorBreakpointId", breakpoint.id);
      request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
      if (breakpoint.hitCount > 0) request.addCountFilter(breakpoint.hitCount);
      request.enable();
      if (resolvedLocation == null) resolvedLocation = location;
    }
    LineBreakpoint next = withBreakpointLocation(breakpoint.withVerified(true, "Resolved"), resolvedLocation);
    breakpoints.put(breakpoint.id, next);
    emit("breakpoint", next.toJson());
  }

  private boolean hasBreakpointRequestAtLocation(String id, Location location) {
    for (BreakpointRequest request : vm.eventRequestManager().breakpointRequests()) {
      if (id.equals(request.getProperty("mdEditorBreakpointId")) && request.location().equals(location)) return true;
    }
    return false;
  }

  private List<Location> matchingSourceLocations(String file, int line) {
    List<Location> sourceNameMatches = new ArrayList<>();
    List<Location> sourcePathMatches = new ArrayList<>();
    for (ReferenceType type : vm.allClasses()) {
      List<Location> locations = matchingSourceLocations(type, file, line);
      sourceNameMatches.addAll(locations);
      for (Location location : locations) if (sourcePathMatches(file, safeSourcePath(location))) sourcePathMatches.add(location);
    }
    return sourcePathMatches.isEmpty() ? sourceNameMatches : sourcePathMatches;
  }

  private List<Location> matchingSourceLocations(ReferenceType type, String file, int line) {
    String sourceName = sourceName(file);
    List<Location> sourceNameMatches = new ArrayList<>();
    List<Location> sourcePathMatches = new ArrayList<>();
    try {
      for (Location location : type.locationsOfLine(line)) {
        if (!safeSourceName(location).equalsIgnoreCase(sourceName)) continue;
        sourceNameMatches.add(location);
        if (sourcePathMatches(file, safeSourcePath(location))) sourcePathMatches.add(location);
      }
    } catch (AbsentInformationException ignored) {}
    return sourcePathMatches.isEmpty() ? sourceNameMatches : sourcePathMatches;
  }

  private boolean sourceMatches(ReferenceType type, String file) {
    String sourceName = sourceName(file);
    if (safeSourceName(type).equalsIgnoreCase(sourceName)) return true;
    for (String sourcePath : safeSourcePaths(type)) if (sourcePathMatches(file, sourcePath)) return true;
    return false;
  }

  private String unresolvedLineBreakpointMessage(LineBreakpoint breakpoint) {
    if (isSourceLoaded(breakpoint.file)) return "No executable Java location at " + breakpoint.sourceName + ":" + breakpoint.line + ". The running bytecode may be out of date with the source.";
    if (!launched) return "Pending source load. If this class is already loaded, the running bytecode may be out of date with the source.";
    return "Pending source load";
  }

  private boolean isSourceLoaded(String file) {
    String sourceName = sourceName(file);
    String sourceClassName = sourceClassName(sourceName);
    for (ReferenceType type : vm.allClasses()) {
      try {
        if (type.sourceName().equalsIgnoreCase(sourceName)) return true;
      } catch (AbsentInformationException ignored) {}
      if (sourceClassNameMatches(type.name(), sourceClassName)) return true;
      try {
        for (String sourcePath : type.sourcePaths(null)) if (sourcePathMatches(file, sourcePath)) return true;
      } catch (AbsentInformationException ignored) {}
    }
    return false;
  }

  private String sourceClassName(String sourceName) {
    String value = sourceName == null ? "" : sourceName.trim();
    return value.toLowerCase(Locale.ROOT).endsWith(".java") ? value.substring(0, value.length() - 5) : value;
  }

  private boolean sourceClassNameMatches(String loadedClassName, String sourceClassName) {
    if (loadedClassName == null || sourceClassName == null || sourceClassName.isBlank()) return false;
    return loadedClassName.equals(sourceClassName) || loadedClassName.endsWith("." + sourceClassName) || loadedClassName.startsWith(sourceClassName + "$") || loadedClassName.contains("." + sourceClassName + "$");
  }

  private void eventLoop() {
    try {
      EventQueue queue = vm.eventQueue();
      while (connected) {
        EventSet events = queue.remove();
        boolean shouldSuspend = false;
        boolean shouldHoldStartup = false;
        boolean terminalEvent = false;
        String reason = "pause";
        Event stopEvent = null;
        EventIterator iterator = events.eventIterator();
        while (iterator.hasNext()) {
          Event event = iterator.nextEvent();
          if (event instanceof VMStartEvent) { emit("state", "{\"state\":\"launching\"}"); shouldHoldStartup = launched && !debuggeeStarted; }
          else if (event instanceof ClassPrepareEvent classPrepare) installBreakpointsForPreparedClass(classPrepare.referenceType());
          else if (event instanceof BreakpointEvent breakpoint) { selectedThread = breakpoint.thread(); selectedFrameIndex = 0; stopEvent = event; reason = Boolean.TRUE.equals(breakpoint.request().getProperty("mdEditorRunToCursor")) ? "run-to-cursor" : "breakpoint"; shouldSuspend = handleBreakpointHit(breakpoint); }
          else if (event instanceof MethodEntryEvent methodEntry) { selectedThread = methodEntry.thread(); selectedFrameIndex = 0; stopEvent = event; reason = "method-breakpoint"; shouldSuspend = handleMethodBreakpointHit(methodEntry); }
          else if (event instanceof StepEvent step) { selectedThread = step.thread(); selectedFrameIndex = 0; stopEvent = event; shouldSuspend = true; reason = "step"; vm.eventRequestManager().deleteEventRequests(vm.eventRequestManager().stepRequests()); }
          else if (event instanceof ExceptionEvent exception) { selectedThread = exception.thread(); selectedFrameIndex = 0; stopEvent = event; shouldSuspend = true; reason = "exception"; }
          else if (event instanceof ThreadStartEvent || event instanceof ThreadDeathEvent) emitThreads();
          else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) { connected = false; terminalEvent = true; emit("terminated", "{\"state\":\"terminated\"}"); }
        }
        if (terminalEvent) continue;
        if (shouldSuspend) { deleteRunToCursorRequests(); suspendedEvents = events; emitStopped(reason, stopEvent); }
        else if (shouldHoldStartup) suspendedEvents = events;
        else events.resume();
      }
    } catch (Throwable error) {
      if (!connected) return;
      connected = false;
      emitError(error.getMessage() == null ? error.toString() : error.getMessage());
      emit("state", "{\"state\":\"failed\"}");
    }
  }

  private boolean handleBreakpointHit(BreakpointEvent event) throws Exception {
    if (Boolean.TRUE.equals(event.request().getProperty("mdEditorRunToCursor"))) {
      vm.eventRequestManager().deleteEventRequest(event.request());
      return true;
    }
    String id = String.valueOf(event.request().getProperty("mdEditorBreakpointId"));
    LineBreakpoint breakpoint = breakpoints.get(id);
    if (breakpoint == null) return true;
    LineBreakpoint hit = withBreakpointLocation(breakpoint.withHits(breakpoint.hits + 1).withVerified(true, "Resolved"), event.location());
    breakpoints.put(id, hit);
    emit("breakpoint", hit.toJson());
    if (breakpoint.temporary) { removeBreakpoint(new String[] { "REMOVE_BREAKPOINT", encode(breakpoint.file), String.valueOf(breakpoint.line) }); return true; }
    if (!conditionMatches(hit, event.thread())) return false;
    if (!hit.logMessage.isBlank()) {
      try {
        emit("logpoint", "{\"text\":" + quote(formatLogpoint(hit, event.thread())) + "}");
      } catch (Exception error) {
        emitError("Logpoint failed at " + hit.sourceName + ":" + hit.line + ": " + (error.getMessage() == null ? error.toString() : error.getMessage()));
      }
      return false;
    }
    return true;
  }

  private boolean handleMethodBreakpointHit(MethodEntryEvent event) {
    String id = String.valueOf(event.request().getProperty("mdEditorMethodBreakpointId"));
    MethodBreakpoint breakpoint = methodBreakpoints.get(id);
    if (breakpoint == null || !event.method().name().equals(breakpoint.methodName)) return false;
    MethodBreakpoint hit = breakpoint.withHits(breakpoint.hits + 1).withVerified(true, "Resolved");
    methodBreakpoints.put(id, hit);
    emit("methodBreakpoint", hit.toJson());
    return true;
  }

  private boolean conditionMatches(LineBreakpoint breakpoint, ThreadReference thread) throws Exception {
    if (breakpoint.condition.isBlank()) return true;
    try {
      return evaluateConditionExpression(breakpoint.condition, new FrameSelection(thread, thread.frame(0), 0));
    } catch (Exception error) {
      emitError("Breakpoint condition failed at " + breakpoint.sourceName + ":" + breakpoint.line + ": " + (error.getMessage() == null ? error.toString() : error.getMessage()));
      return true;
    }
  }

  private boolean evaluateConditionExpression(String condition, FrameSelection selection) throws Exception {
    String expression = stripEnclosingParentheses(condition == null ? "" : condition.trim());
    if (expression.isBlank()) return true;
    int orIndex = findTopLevelOperator(expression, "||");
    if (orIndex > 0) return evaluateConditionExpression(expression.substring(0, orIndex), selection) || evaluateConditionExpression(expression.substring(orIndex + 2), selection);
    int andIndex = findTopLevelOperator(expression, "&&");
    if (andIndex > 0) return evaluateConditionExpression(expression.substring(0, andIndex), selection) && evaluateConditionExpression(expression.substring(andIndex + 2), selection);
    String[] operators = { ">=", "<=", "==", "!=", ">", "<" };
    for (String operator : operators) {
      int index = findTopLevelOperator(expression, operator);
      if (index <= 0) continue;
      Object left = comparableValue(resolveExpression(selection, expression.substring(0, index).trim()));
      Object right = comparableConditionOperand(selection, expression.substring(index + operator.length()).trim());
      return compareConditionValues(left, right, operator);
    }
    if (expression.startsWith("!")) return !truthyConditionValue(resolveExpression(selection, expression.substring(1).trim()));
    return truthyConditionValue(resolveExpression(selection, expression));
  }

  private String formatLogpoint(LineBreakpoint breakpoint, ThreadReference thread) throws Exception {
    String message = breakpoint.logMessage.isBlank() ? breakpoint.sourceName + ":" + breakpoint.line : breakpoint.logMessage;
    StringBuilder result = new StringBuilder("[logpoint] ");
    int cursor = 0;
    FrameSelection selection = new FrameSelection(thread, thread.frame(0), 0);
    while (cursor < message.length()) {
      int open = message.indexOf('{', cursor);
      if (open < 0) { result.append(message.substring(cursor)); break; }
      int close = message.indexOf('}', open + 1);
      if (close < 0) { result.append(message.substring(cursor)); break; }
      result.append(message, cursor, open);
      String expression = message.substring(open + 1, close).trim();
      result.append(valueDisplay(resolveExpression(selection, expression)));
      cursor = close + 1;
    }
    return result.append(System.lineSeparator()).toString();
  }

  private boolean truthyConditionValue(Value value) {
    if (value == null) return false;
    if (value instanceof BooleanValue bool) return bool.value();
    if (value instanceof PrimitiveValue primitive) return !"0".equals(primitive.toString()) && !"0.0".equals(primitive.toString());
    if (value instanceof ObjectReference object) {
      Object boxed = boxedPrimitiveValue(object);
      if (boxed instanceof Boolean bool) return bool;
      if (boxed instanceof Number number) return number.doubleValue() != 0.0;
    }
    return true;
  }

  private Object comparableConditionOperand(FrameSelection selection, String text) throws Exception {
    String value = text == null ? "" : text.trim();
    if (isConditionLiteral(value)) return parseConditionLiteral(value);
    return comparableValue(resolveExpression(selection, value));
  }

  private Object parseConditionLiteral(String text) {
    if (text == null || "null".equals(text.trim())) return null;
    String value = text.trim();
    if ("true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value)) return Boolean.parseBoolean(value);
    if (isQuoted(value)) return value.substring(1, value.length() - 1);
    try { return Double.parseDouble(value.replaceAll("[fFdDlL]$", "")); } catch (NumberFormatException ignored) { return value; }
  }

  private boolean isConditionLiteral(String text) {
    return text == null || "null".equals(text.trim()) || "true".equalsIgnoreCase(text.trim()) || "false".equalsIgnoreCase(text.trim()) || isQuoted(text.trim()) || isPrimitiveLiteral(text.trim());
  }

  private int findTopLevelOperator(String expression, String operator) {
    int depth = 0;
    int bracketDepth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index <= expression.length() - operator.length(); index++) {
      char c = expression.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == '(') depth += 1;
      else if (c == ')') depth = Math.max(0, depth - 1);
      else if (c == '[') bracketDepth += 1;
      else if (c == ']') bracketDepth = Math.max(0, bracketDepth - 1);
      if (depth == 0 && bracketDepth == 0 && expression.startsWith(operator, index)) return index;
    }
    return -1;
  }

  private Object comparableValue(Value value) {
    if (value == null) return null;
    if (value instanceof BooleanValue bool) return bool.value();
    if (value instanceof StringReference string) return string.value();
    if (value instanceof PrimitiveValue primitive) {
      try { return Double.parseDouble(primitive.toString()); } catch (NumberFormatException ignored) { return primitive.toString(); }
    }
    if (value instanceof ObjectReference object) {
      Object boxed = boxedPrimitiveValue(object);
      if (boxed != null) return boxed;
    }
    return valueDisplay(value);
  }

  private Object boxedPrimitiveValue(ObjectReference object) {
    String type = object.referenceType().name();
    if (!isBoxedPrimitiveType(type)) return null;
    Field field = findInstanceField(object, "value");
    if (field == null) return null;
    Value value = object.getValue(field);
    if (value instanceof BooleanValue bool) return bool.value();
    if (value instanceof CharValue character) return String.valueOf(character.value());
    if (value instanceof PrimitiveValue primitive) {
      try { return Double.parseDouble(primitive.toString()); } catch (NumberFormatException ignored) { return primitive.toString(); }
    }
    return null;
  }

  private static boolean isBoxedPrimitiveType(String type) {
    return "java.lang.Boolean".equals(type)
      || "java.lang.Byte".equals(type)
      || "java.lang.Short".equals(type)
      || "java.lang.Integer".equals(type)
      || "java.lang.Long".equals(type)
      || "java.lang.Character".equals(type)
      || "java.lang.Float".equals(type)
      || "java.lang.Double".equals(type);
  }

  private boolean compareConditionValues(Object left, Object right, String operator) {
    if ("==".equals(operator)) return Objects.equals(left, right) || Objects.equals(String.valueOf(left), String.valueOf(right));
    if ("!=".equals(operator)) return !compareConditionValues(left, right, "==");
    if (left instanceof Number leftNumber && right instanceof Number rightNumber) {
      double leftValue = leftNumber.doubleValue();
      double rightValue = rightNumber.doubleValue();
      return switch (operator) { case ">" -> leftValue > rightValue; case ">=" -> leftValue >= rightValue; case "<" -> leftValue < rightValue; case "<=" -> leftValue <= rightValue; default -> false; };
    }
    int comparison = String.valueOf(left).compareTo(String.valueOf(right));
    return switch (operator) { case ">" -> comparison > 0; case ">=" -> comparison >= 0; case "<" -> comparison < 0; case "<=" -> comparison <= 0; default -> false; };
  }

  private void emitStopped(String reason, Event event) throws Exception {
    Location location = event instanceof LocatableEvent located ? located.location() : selectedThread != null && selectedThread.frameCount() > 0 ? selectedThread.frame(0).location() : null;
    String state = isBreakpointStopReason(reason) ? "stopped-at-breakpoint" : "paused";
    emit("state", "{\"state\":" + quote(state) + "}");
    emit("stopped", "{\"reason\":" + quote(reason) + ",\"location\":" + locationJson(location) + exceptionStopJson(event) + ",\"snapshot\":" + snapshotJson(selectedFrameId()) + "}");
  }

  private String exceptionStopJson(Event event) {
    if (!(event instanceof ExceptionEvent exception)) return "";
    ObjectReference thrown = exception.exception();
    Location catchLocation = exception.catchLocation();
    return ",\"exception\":{\"type\":" + quote(thrown == null ? "" : thrown.referenceType().name())
      + ",\"value\":" + quote(valueDisplay(thrown))
      + ",\"objectId\":" + quote(exceptionObjectId(thrown))
      + ",\"catchLocation\":" + locationJson(catchLocation) + "}";
  }

  private String exceptionObjectId(ObjectReference exception) {
    if (exception == null) return "";
    objects.put(exception.uniqueID(), exception);
    objectExpressions.put(exception.uniqueID(), "exception");
    return String.valueOf(exception.uniqueID());
  }
  private static boolean isBreakpointStopReason(String reason) {
    return "breakpoint".equals(reason) || "method-breakpoint".equals(reason) || "exception".equals(reason) || "run-to-cursor".equals(reason);
  }

  private void emitSnapshot(String selectedFrameId) throws Exception { emit("snapshot", snapshotJson(selectedFrameId)); }
  private String snapshotJson(String selectedFrameId) throws Exception { return "{\"threads\":" + threadsJson(selectedFrameId) + ",\"selectedFrameId\":" + quote(selectedFrameId) + "}"; }
  private void emitThreads() throws Exception { emit("threads", "{\"threads\":" + threadsJson("") + "}"); }

  private String threadsJson(String selectedFrameId) throws Exception {
    List<String> threads = new ArrayList<>();
    for (ThreadReference thread : vm.allThreads()) {
      List<String> frames = new ArrayList<>();
      try {
        int count = Math.min(thread.frameCount(), 128);
        for (int index = 0; index < count; index++) {
          StackFrame frame = thread.frame(index);
          String id = frameIdFor(thread, index);
          frames.add("{\"id\":" + quote(id) + ",\"threadId\":" + quote(String.valueOf(thread.uniqueID())) + ",\"index\":" + index
            + ",\"className\":" + quote(frame.location().declaringType().name()) + ",\"method\":" + quote(frame.location().method().name())
            + ",\"file\":" + quote(safeSourcePath(frame.location())) + ",\"sourceName\":" + quote(safeSourceName(frame.location()))
            + ",\"line\":" + frame.location().lineNumber() + ",\"canDrop\":" + canDropToFrame(thread, index) + ",\"selected\":" + Objects.equals(id, selectedFrameId) + "}");
        }
      } catch (IncompatibleThreadStateException ignored) {}
      threads.add("{\"id\":" + quote(String.valueOf(thread.uniqueID())) + ",\"name\":" + quote(thread.name()) + ",\"status\":" + quote(threadStatus(thread.status()))
        + ",\"suspended\":" + thread.isSuspended() + ",\"frames\":[" + String.join(",", frames) + "]}");
    }
    return "[" + String.join(",", threads) + "]";
  }

  private boolean canDropToFrame(ThreadReference thread, int frameIndex) {
    try { return vm != null && vm.canPopFrames() && thread.isSuspended() && frameIndex > 0; }
    catch (RuntimeException ignored) { return false; }
  }

  private void emitVariables(String frameId) throws Exception {
    FrameSelection selection = selectFrame(frameId);
    emit("variables", "{\"frameId\":" + quote(frameId) + ",\"variables\":" + variablesJson(selection) + "}");
  }

  private String variablesJson(FrameSelection selection) throws Exception {
    if (selection == null) return "[]";
    List<String> values = new ArrayList<>();
    StackFrame frame = selection.frame;
    Set<String> parameterNames = parameterNamesForFrame(frame);
    ObjectReference thisObject = frame.thisObject();
    if (thisObject != null) values.add(valueJson("this", thisObject.type().name(), thisObject, "this", "this"));
    try { for (LocalVariable variable : frame.visibleVariables()) values.add(valueJson(variable.name(), variable.typeName(), frame.getValue(variable), variable.name(), parameterNames.contains(variable.name()) ? "parameter" : "local")); }
    catch (AbsentInformationException ignored) {}
    appendStaticFields(values, frame.location().declaringType());
    return "[" + String.join(",", values) + "]";
  }

  private Set<String> parameterNamesForFrame(StackFrame frame) {
    Set<String> names = new HashSet<>();
    try { for (LocalVariable variable : frame.location().method().arguments()) names.add(variable.name()); }
    catch (AbsentInformationException | RuntimeException ignored) {}
    return names;
  }
  private void appendStaticFields(List<String> values, ReferenceType type) {
    Set<String> emitted = new HashSet<>();
    for (Field field : type.allFields()) {
      if (!field.isStatic()) continue;
      String id = field.declaringType().name() + "#" + field.name();
      if (!emitted.add(id)) continue;
      values.add(valueJson(field.name(), field.typeName(), field.declaringType().getValue(field), field.declaringType().name() + "." + field.name(), "static", field.declaringType().name()));
    }
  }

  private void emitObjectChildren(String objectId) {
    ObjectReference object = objects.get(parseLong(objectId));
    if (object == null) { emit("children", "{\"objectId\":" + quote(objectId) + ",\"variables\":[]}"); return; }
    List<String> values = new ArrayList<>();
    String parentExpression = objectExpressions.getOrDefault(object.uniqueID(), "");
    if (object instanceof ArrayReference array) appendArrayElements(values, array, parentExpression);
    else {
      appendCollectionElements(values, object, parentExpression);
      appendMapEntries(values, object, parentExpression);
      appendMapEntryMembers(values, object, parentExpression);
      appendObjectFields(values, object, parentExpression);
    }
    emit("children", "{\"objectId\":" + quote(objectId) + ",\"variables\":[" + String.join(",", values) + "]}");
  }

  private void appendArrayElements(List<String> values, ArrayReference array, String parentExpression) {
    int count = Math.min(array.length(), 500);
    for (int index = 0; index < count; index++) {
      Value value = array.getValue(index);
      String segment = "[" + index + "]";
      values.add(valueJson(segment, value == null ? "" : value.type().name(), value, childExpression(parentExpression, segment), "element"));
    }
    if (array.length() > count) values.add(syntheticValueJson("...", "", (array.length() - count) + " more elements", "", "summary"));
  }

  private void appendCollectionElements(List<String> values, ObjectReference object, String parentExpression) {
    if (!isAssignableTo(object.referenceType(), "java.util.Collection")) return;
    ArrayReference elements = invokeToArray(object);
    if (elements == null) return;
    int count = Math.min(elements.length(), 500);
    for (int index = 0; index < count; index++) {
      Value value = elements.getValue(index);
      String segment = "[" + index + "]";
      String expression = parentExpression.isBlank() ? segment : parentExpression + ".toArray()" + segment;
      values.add(valueJson(segment, value == null ? "" : value.type().name(), value, expression, "element"));
    }
    if (elements.length() > count) values.add(syntheticValueJson("...", "", (elements.length() - count) + " more collection elements", "", "summary"));
  }

  private void appendMapEntries(List<String> values, ObjectReference object, String parentExpression) {
    if (!isAssignableTo(object.referenceType(), "java.util.Map")) return;
    ObjectReference entrySet = invokeObjectMethod(object, "entrySet");
    ArrayReference entries = entrySet == null ? null : invokeToArray(entrySet);
    if (entries == null) return;
    int count = Math.min(entries.length(), 500);
    for (int index = 0; index < count; index++) {
      Value entry = entries.getValue(index);
      String segment = "entry[" + index + "]";
      String expression = parentExpression.isBlank() ? segment : parentExpression + ".entrySet().toArray()[" + index + "]";
      values.add(valueJson(segment, entry == null ? "" : entry.type().name(), entry, expression, "entry"));
    }
    if (entries.length() > count) values.add(syntheticValueJson("...", "", (entries.length() - count) + " more map entries", "", "summary"));
  }

  private void appendMapEntryMembers(List<String> values, ObjectReference object, String parentExpression) {
    if (!isAssignableTo(object.referenceType(), "java.util.Map$Entry")) return;
    Value key = invokeValueObjectMethod(object, "getKey");
    Value value = invokeValueObjectMethod(object, "getValue");
    values.add(valueJson("key", key == null ? "" : key.type().name(), key, parentExpression.isBlank() ? "key" : parentExpression + ".getKey()", "entry"));
    values.add(valueJson("value", value == null ? "" : value.type().name(), value, parentExpression.isBlank() ? "value" : parentExpression + ".getValue()", "entry"));
  }

  private void appendObjectFields(List<String> values, ObjectReference object, String parentExpression) {
    for (Field field : object.referenceType().allFields()) if (!field.isStatic()) values.add(valueJson(field.name(), field.typeName(), object.getValue(field), childExpression(parentExpression, field.name()), "field", field.declaringType().name()));
  }

  private String childExpression(String parentExpression, String segment) {
    String parent = parentExpression == null ? "" : parentExpression.trim();
    if (parent.isBlank()) return segment;
    return segment.startsWith("[") ? parent + segment : parent + "." + segment;
  }

  private ArrayReference invokeToArray(ObjectReference object) {
    Value value = invokeObjectMethod(object, "toArray");
    return value instanceof ArrayReference array ? array : null;
  }

  private ObjectReference invokeObjectMethod(ObjectReference object, String methodName) {
    Value value = invokeValueObjectMethod(object, methodName);
    return value instanceof ObjectReference reference ? reference : null;
  }

  private Value invokeValueObjectMethod(ObjectReference object, String methodName) {
    if (object == null || selectedThread == null) return null;
    try {
      for (Method method : object.referenceType().methodsByName(methodName)) {
        if (!method.argumentTypeNames().isEmpty()) continue;
        return object.invokeMethod(selectedThread, method, Collections.emptyList(), ObjectReference.INVOKE_SINGLE_THREADED);
      }
    } catch (Throwable ignored) {}
    return null;
  }

  private boolean isAssignableTo(ReferenceType type, String targetTypeName) {
    if (type == null) return false;
    if (targetTypeName.equals(type.name())) return true;
    if (type instanceof ClassType classType) {
      for (InterfaceType interfaceType : classType.allInterfaces()) if (targetTypeName.equals(interfaceType.name())) return true;
      ClassType parent = classType.superclass();
      while (parent != null) {
        if (targetTypeName.equals(parent.name())) return true;
        for (InterfaceType interfaceType : parent.allInterfaces()) if (targetTypeName.equals(interfaceType.name())) return true;
        parent = parent.superclass();
      }
    }
    return false;
  }

  private void evaluate(String[] fields) {
    String frameId = fields.length > 1 ? fields[1] : "";
    String expression = decode(fields, 2);
    String resultJson;
    boolean refreshVariables = false;
    try {
      FrameSelection selection = selectFrame(frameId);
      Value value = resolveExpression(selection, expression);
      refreshVariables = isAssignmentExpression(expression) || isMethodInvocationExpression(expression);
      resultJson = valueJson(expression, value == null ? "" : value.type().name(), value, expression, "result");
    } catch (Throwable error) {
      resultJson = evaluationErrorJson(expression, error.getMessage() == null ? error.toString() : error.getMessage());
    }
    emit("evaluation", "{\"expression\":" + quote(expression) + ",\"result\":" + resultJson + "}");
    if (refreshVariables) {
      try { emitVariables(frameId); }
      catch (Throwable error) { emitError(error.getMessage() == null ? error.toString() : error.getMessage()); }
    }
  }

  private void setValue(String[] fields) throws Exception {
    String frameId = fields.length > 1 ? fields[1] : "";
    String expression = decode(fields, 2);
    String text = decode(fields, 3);
    FrameSelection selection = selectFrame(frameId);
    setPathValue(selection, expression, text);
    emitVariables(frameId);
  }

  private void sendStdin(String[] fields) throws IOException {
    if (vm == null || vm.process() == null) throw new IllegalStateException("No debuggee process is available for standard input.");
    String text = decode(fields, 1);
    OutputStream stream = vm.process().getOutputStream();
    stream.write(text.getBytes(StandardCharsets.UTF_8));
    stream.flush();
    emit("stdin", "{\"text\":" + quote(text) + "}");
  }

  private Value resolveExpression(FrameSelection selection, String expression) throws Exception {
    if (selection == null || expression == null) return null;
    String text = stripEnclosingParentheses(trimExpressionStatement(expression));
    if (text.isBlank()) return null;
    int assignmentIndex = findTopLevelAssignmentOperator(text);
    if (assignmentIndex > 0) return evaluateAssignmentExpression(selection, text, assignmentIndex);
    if (isBooleanExpression(text)) return vm.mirrorOf(evaluateConditionExpression(text, selection));
    if (isExpressionLiteral(text)) return literalExpressionValue(text);
    int additiveIndex = findTopLevelArithmeticOperator(text, new char[] { '+', '-' });
    if (additiveIndex > 0) return evaluateArithmeticExpression(selection, text, additiveIndex);
    int multiplicativeIndex = findTopLevelArithmeticOperator(text, new char[] { '*', '/', '%' });
    if (multiplicativeIndex > 0) return evaluateArithmeticExpression(selection, text, multiplicativeIndex);
    String staticFieldBase = staticFieldExpressionBase(text);
    StaticFieldReference staticField = findQualifiedStaticField(staticFieldBase);
    if (staticField != null) return applyArrayIndexes(selection, staticField.type.getValue(staticField.field), text.substring(staticFieldBase.length()));
    return resolveExpressionChain(selection, text);
  }

  private Value evaluateAssignmentExpression(FrameSelection selection, String expression, int operatorIndex) throws Exception {
    String target = expression.substring(0, operatorIndex).trim();
    String value = expression.substring(operatorIndex + 1).trim();
    if (target.isBlank() || value.isBlank()) throw new IllegalArgumentException("Assignment expressions must include a target and a value.");
    setPathValue(selection, target, value);
    return resolveExpression(selection, target);
  }

  private static boolean isAssignmentExpression(String expression) {
    String text = stripEnclosingParentheses(trimExpressionStatement(expression));
    return !text.isBlank() && findTopLevelAssignmentOperator(text) > 0;
  }

  private Value evaluateArithmeticExpression(FrameSelection selection, String expression, int operatorIndex) throws Exception {
    char operator = expression.charAt(operatorIndex);
    Value left = resolveExpression(selection, expression.substring(0, operatorIndex));
    Value right = resolveExpression(selection, expression.substring(operatorIndex + 1));
    if (operator == '+' && (left instanceof StringReference || right instanceof StringReference)) return vm.mirrorOf(stringExpressionValue(left) + stringExpressionValue(right));
    double leftNumber = numericExpressionValue(left);
    double rightNumber = numericExpressionValue(right);
    double result = switch (operator) {
      case '+' -> leftNumber + rightNumber;
      case '-' -> leftNumber - rightNumber;
      case '*' -> leftNumber * rightNumber;
      case '/' -> leftNumber / rightNumber;
      case '%' -> leftNumber % rightNumber;
      default -> throw new IllegalArgumentException("Unsupported arithmetic operator: " + operator);
    };
    if (operator == '/' || isFloatingExpressionValue(left) || isFloatingExpressionValue(right)) return vm.mirrorOf(result);
    long integral = (long) result;
    if (left instanceof LongValue || right instanceof LongValue || integral > Integer.MAX_VALUE || integral < Integer.MIN_VALUE) return vm.mirrorOf(integral);
    return vm.mirrorOf((int) integral);
  }

  private double numericExpressionValue(Value value) {
    if (value instanceof PrimitiveValue primitive) {
      try { return Double.parseDouble(primitive.toString()); } catch (NumberFormatException ignored) {}
    }
    if (value instanceof ObjectReference object) {
      Object boxed = boxedPrimitiveValue(object);
      if (boxed instanceof Number number) return number.doubleValue();
    }
    throw new IllegalArgumentException("Arithmetic expressions require numeric primitive values.");
  }

  private boolean isFloatingExpressionValue(Value value) {
    if (value instanceof DoubleValue || value instanceof FloatValue) return true;
    if (value instanceof ObjectReference object) {
      String type = object.referenceType().name();
      return "java.lang.Double".equals(type) || "java.lang.Float".equals(type);
    }
    return false;
  }

  private String stringExpressionValue(Value value) {
    if (value == null) return "null";
    if (value instanceof StringReference string) return string.value();
    return valueDisplay(value);
  }

  private Value literalExpressionValue(String text) {
    String value = String.valueOf(text).trim();
    if ("null".equals(value)) return null;
    if ("true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value)) return vm.mirrorOf(Boolean.parseBoolean(value));
    if (isQuoted(value)) return vm.mirrorOf(unquote(value));
    String numeric = numericLiteral(value);
    if (value.matches("[-+]?\\d+[lL]")) return vm.mirrorOf(Long.parseLong(numeric));
    if (numeric.contains(".") || value.matches(".*[fFdD]$")) return vm.mirrorOf(Double.parseDouble(numeric));
    long parsed = Long.parseLong(numeric);
    return parsed > Integer.MAX_VALUE || parsed < Integer.MIN_VALUE ? vm.mirrorOf(parsed) : vm.mirrorOf((int) parsed);
  }

  private Value resolveExpressionChain(FrameSelection selection, String expression) throws Exception {
    List<String> segments = splitExpressionChain(expression);
    if (segments.isEmpty()) return null;
    StaticMethodResolution staticMethodValue = resolveStaticMethodChain(selection, segments);
    if (staticMethodValue.resolved) return staticMethodValue.value;
    Value value = resolveExpressionSegment(selection, null, segments.get(0), true);
    for (int index = 1; index < segments.size(); index++) value = resolveExpressionSegment(selection, value, segments.get(index), false);
    return value;
  }

  private StaticMethodResolution resolveStaticMethodChain(FrameSelection selection, List<String> segments) throws Exception {
    for (int methodIndex = 1; methodIndex < segments.size(); methodIndex++) {
      String methodSegment = segments.get(methodIndex);
      if (!isMethodCall(methodSegment)) continue;
      String className = String.join(".", segments.subList(0, methodIndex));
      for (ReferenceType type : vm.classesByName(className)) {
        if (!(type instanceof ClassType classType)) continue;
        Value value = invokeStaticMethod(selection, classType, methodSegment);
        for (int index = methodIndex + 1; index < segments.size(); index++) value = resolveExpressionSegment(selection, value, segments.get(index), false);
        return new StaticMethodResolution(true, value);
      }
    }
    return new StaticMethodResolution(false, null);
  }

  private Value resolvePath(FrameSelection selection, String expression) throws Exception {
    return resolveExpressionChain(selection, expression);
  }

  private Value resolveExpressionSegment(FrameSelection selection, Value receiver, String segment, boolean root) throws Exception {
    String base = expressionSegmentBase(segment);
    Value value;
    if (root) {
      if (isMethodCall(base)) {
        value = invokeRootMethod(selection, base);
      } else {
        value = resolveRoot(selection.frame, base);
      }
    } else {
      value = isMethodCall(base) ? invokeValueMethod(selection, receiver, base) : readObjectField(receiver, base);
    }
    return applyArrayIndexes(selection, value, segment.substring(base.length()));
  }

  private Value resolveRoot(StackFrame frame, String name) throws Exception {
    if ("this".equals(name)) return frame.thisObject();
    if ("null".equals(name)) return null;
    try { LocalVariable local = frame.visibleVariableByName(name); if (local != null) return frame.getValue(local); } catch (AbsentInformationException ignored) {}
    ObjectReference thisObject = frame.thisObject();
    if (thisObject != null) { Field field = findInstanceField(thisObject, name); if (field != null) return thisObject.getValue(field); }
    StaticFieldReference staticField = findStaticField(frame.location().declaringType(), name);
    if (staticField != null) return staticField.type.getValue(staticField.field);
    throw new IllegalArgumentException("Unknown variable or field: " + name);
  }

  private StaticFieldReference findStaticField(ReferenceType type, String name) {
    for (Field field : type.allFields()) if (field.isStatic() && field.name().equals(name)) return new StaticFieldReference(field.declaringType(), field);
    return null;
  }

  private Field findInstanceField(ObjectReference object, String name) {
    if (object == null || name == null || name.isBlank()) return null;
    for (Field field : object.referenceType().allFields()) if (!field.isStatic() && field.name().equals(name)) return field;
    return null;
  }

  private StaticFieldReference findQualifiedStaticField(String expression) {
    String target = expression == null ? "" : expression.trim();
    int dot = target.lastIndexOf('.');
    if (dot <= 0 || dot >= target.length() - 1 || vm == null) return null;
    String className = target.substring(0, dot);
    String fieldName = target.substring(dot + 1);
    for (ReferenceType type : vm.classesByName(className)) {
      StaticFieldReference field = findStaticField(type, fieldName);
      if (field != null) return field;
    }
    return null;
  }

  private static String staticFieldExpressionBase(String expression) {
    String target = expression == null ? "" : expression.trim();
    int index = firstTopLevelArrayIndex(target);
    return index < 0 ? target : target.substring(0, index).trim();
  }

  private Value readObjectField(Value receiver, String fieldName) {
    if (receiver == null) throw new IllegalArgumentException("Cannot read field " + fieldName + " from null.");
    if (!(receiver instanceof ObjectReference object)) throw new IllegalArgumentException("Cannot read field " + fieldName + " from " + receiver.type().name() + ".");
    Field field = findInstanceField(object, fieldName);
    if (field == null) throw new IllegalArgumentException("Field " + fieldName + " was not found on " + object.referenceType().name() + ".");
    return object.getValue(field);
  }

  private Value applyArrayIndexes(FrameSelection selection, Value value, String suffix) throws Exception {
    String remaining = suffix == null ? "" : suffix.trim();
    while (!remaining.isBlank()) {
      if (!remaining.startsWith("[")) throw new IllegalArgumentException("Unsupported array expression suffix: " + suffix);
      int close = findArrayIndexClose(remaining);
      if (close < 0) throw new IllegalArgumentException("Array index is missing a closing bracket: " + suffix);
      int index = resolveArrayIndex(selection, remaining.substring(1, close));
      if (value == null) throw new IllegalArgumentException("Cannot index null.");
      if (!(value instanceof ArrayReference array)) throw new IllegalArgumentException("Cannot index a non-array value.");
      if (index < 0 || index >= array.length()) throw new IllegalArgumentException("Array index " + index + " is outside 0.." + Math.max(0, array.length() - 1) + ".");
      value = array.getValue(index);
      remaining = remaining.substring(close + 1).trim();
    }
    return value;
  }

  private static String expressionSegmentBase(String segment) {
    String text = segment == null ? "" : segment.trim();
    int index = firstTopLevelArrayIndex(text);
    return index < 0 ? text : text.substring(0, index).trim();
  }

  private static int firstTopLevelArrayIndex(String text) {
    int depth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == '(') depth += 1;
      else if (c == ')') depth = Math.max(0, depth - 1);
      else if (c == '[' && depth == 0) return index;
    }
    return -1;
  }

  private int resolveArrayIndex(FrameSelection selection, String text) throws Exception {
    String value = text == null ? "" : text.trim();
    if (value.matches("\\d+")) return Integer.parseInt(value);
    Value resolved = resolveExpression(selection, value);
    double number = numericExpressionValue(resolved);
    if (number != Math.rint(number)) throw new IllegalArgumentException("Array index expression must evaluate to a whole number: " + value);
    if (number > Integer.MAX_VALUE || number < Integer.MIN_VALUE) throw new IllegalArgumentException("Array index expression is outside integer range: " + value);
    return (int) number;
  }

  private static int findArrayIndexClose(String text) {
    int depth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == '[') depth += 1;
      else if (c == ']') {
        depth -= 1;
        if (depth == 0) return index;
      }
    }
    return -1;
  }

  private Value invokeRootMethod(FrameSelection selection, String segment) throws Exception {
    ObjectReference thisObject = selection.frame.thisObject();
    if (thisObject != null) {
      try {
        return invokeValueMethod(selection, thisObject, segment);
      } catch (IllegalArgumentException error) {
        if (!String.valueOf(error.getMessage()).startsWith("No compatible method ")) throw error;
      }
    }
    ReferenceType type = selection.frame.location().declaringType();
    if (type instanceof ClassType classType) return invokeStaticMethod(selection, classType, segment);
    throw new IllegalArgumentException("No implicit this object is available for " + methodCallName(segment) + "().");
  }


  private Value invokeValueMethod(FrameSelection selection, Value receiver, String segment) throws Exception {
    if (receiver == null) throw new IllegalArgumentException("Cannot invoke " + methodCallName(segment) + "() on null.");
    if (!(receiver instanceof ObjectReference object)) throw new IllegalArgumentException("Cannot invoke " + methodCallName(segment) + "() without an object receiver.");
    String methodName = methodCallName(segment);
    List<String> argumentTexts = splitInvocationArguments(methodCallArguments(segment));
    for (Method method : rankedInvocationMethods(object.referenceType().methodsByName(methodName), argumentTexts, false)) {
      try {
        List<Value> arguments = convertInvocationArguments(selection, method, argumentTexts);
        return object.invokeMethod(selection.thread, method, arguments, ObjectReference.INVOKE_SINGLE_THREADED);
      } catch (InvalidTypeException | ClassNotLoadedException | IllegalArgumentException error) {
        // Try the next overload; the final failure below names the unresolved call.
      } catch (InvocationException error) {
        throw new IllegalStateException("Expression threw " + valueDisplay(error.exception()) + ".");
      }
    }
    throw new IllegalArgumentException("No compatible method " + methodName + "(" + argumentTexts.size() + " args) was found on " + object.referenceType().name() + ".");
  }

  private Value invokeStaticMethod(FrameSelection selection, ClassType classType, String segment) throws Exception {
    String methodName = methodCallName(segment);
    List<String> argumentTexts = splitInvocationArguments(methodCallArguments(segment));
    for (Method method : rankedInvocationMethods(classType.methodsByName(methodName), argumentTexts, true)) {
      try {
        List<Value> arguments = convertInvocationArguments(selection, method, argumentTexts);
        return classType.invokeMethod(selection.thread, method, arguments, ClassType.INVOKE_SINGLE_THREADED);
      } catch (InvalidTypeException | ClassNotLoadedException | IllegalArgumentException error) {
        // Try the next overload; the final failure below names the unresolved call.
      } catch (InvocationException error) {
        throw new IllegalStateException("Expression threw " + valueDisplay(error.exception()) + ".");
      }
    }
    throw new IllegalArgumentException("No compatible static method " + methodName + "(" + argumentTexts.size() + " args) was found on " + classType.name() + ".");
  }

  private static final class RankedMethod {
    private final Method method;
    private final int score;

    private RankedMethod(Method method, int score) {
      this.method = method;
      this.score = score;
    }
  }
  private List<Method> rankedInvocationMethods(List<Method> methods, List<String> argumentTexts, boolean requireStatic) {
    List<RankedMethod> ranked = new ArrayList<>();
    for (Method method : methods) {
      if (requireStatic && !method.isStatic()) continue;
      List<String> typeNames = method.argumentTypeNames();
      if (typeNames.size() != argumentTexts.size()) continue;
      ranked.add(new RankedMethod(method, invocationMethodScore(typeNames, argumentTexts)));
    }
    ranked.sort(Comparator.comparingInt(candidate -> candidate.score));
    List<Method> result = new ArrayList<>();
    for (RankedMethod candidate : ranked) result.add(candidate.method);
    return result;
  }

  private int invocationMethodScore(List<String> typeNames, List<String> argumentTexts) {
    int score = 0;
    for (int index = 0; index < argumentTexts.size(); index++) score += invocationArgumentScore(typeNames.get(index), argumentTexts.get(index));
    return score;
  }

  private int invocationArgumentScore(String typeName, String text) {
    String value = text == null ? "" : text.trim();
    if (value.isBlank() || "null".equals(value)) return isPrimitiveSetType(typeName) ? 1000 : 0;
    if (isQuoted(value)) {
      if ("java.lang.String".equals(typeName)) return 0;
      if ("java.lang.CharSequence".equals(typeName)) return 1;
      if ("char".equals(typeName) || "java.lang.Character".equals(typeName)) return 2;
      if ("java.lang.Object".equals(typeName)) return 4;
      return 100;
    }
    if ("true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value)) {
      if ("boolean".equals(typeName) || "java.lang.Boolean".equals(typeName)) return 0;
      if ("java.lang.Object".equals(typeName)) return 5;
      return 100;
    }
    if (isPrimitiveLiteral(value)) return numericInvocationArgumentScore(typeName, value);
    return 10;
  }

  private int numericInvocationArgumentScore(String typeName, String value) {
    String lower = value.toLowerCase(Locale.ROOT);
    boolean floating = lower.contains(".") || lower.endsWith("f") || lower.endsWith("d");
    boolean longLiteral = lower.endsWith("l");
    if (floating) {
      if ("double".equals(typeName) || "java.lang.Double".equals(typeName)) return lower.endsWith("d") ? 0 : 1;
      if ("float".equals(typeName) || "java.lang.Float".equals(typeName)) return lower.endsWith("f") ? 0 : 2;
      return "java.lang.Object".equals(typeName) ? 8 : 100;
    }
    if (longLiteral) {
      if ("long".equals(typeName) || "java.lang.Long".equals(typeName)) return 0;
      return "java.lang.Object".equals(typeName) ? 8 : 100;
    }
    if ("int".equals(typeName) || "java.lang.Integer".equals(typeName)) return 0;
    if ("long".equals(typeName) || "java.lang.Long".equals(typeName)) return 1;
    if ("short".equals(typeName) || "java.lang.Short".equals(typeName)) return 2;
    if ("byte".equals(typeName) || "java.lang.Byte".equals(typeName)) return 3;
    if ("double".equals(typeName) || "java.lang.Double".equals(typeName)) return 4;
    if ("float".equals(typeName) || "java.lang.Float".equals(typeName)) return 5;
    return "java.lang.Object".equals(typeName) ? 8 : 100;
  }
  private List<Value> convertInvocationArguments(FrameSelection selection, Method method, List<String> argumentTexts) throws Exception {
    List<Value> values = new ArrayList<>();
    List<String> typeNames = method.argumentTypeNames();
    for (int index = 0; index < argumentTexts.size(); index++) values.add(convertInvocationArgument(selection, typeNames.get(index), argumentTexts.get(index)));
    return values;
  }

  private Value convertInvocationArgument(FrameSelection selection, String typeName, String text) throws Exception {
    String value = text == null ? "" : text.trim();
    if (value.isBlank() || "null".equals(value)) return null;
    if (isQuoted(value) || isPrimitiveLiteral(value)) return parseValue(typeName, value);
    Value enumValue = parseEnumValue(typeName, value);
    if (enumValue != null) return enumValue;
    return resolveExpression(selection, value);
  }

  private static String trimExpressionStatement(String expression) {
    String text = String.valueOf(expression).trim();
    return text.endsWith(";") ? text.substring(0, text.length() - 1).trim() : text;
  }

  private static String stripEnclosingParentheses(String expression) {
    String text = String.valueOf(expression).trim();
    while (text.startsWith("(") && closesAtEnd(text)) text = text.substring(1, text.length() - 1).trim();
    return text;
  }

  private static boolean closesAtEnd(String expression) {
    int depth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < expression.length(); index++) {
      char c = expression.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == '(') depth += 1;
      else if (c == ')') {
        depth -= 1;
        if (depth == 0) return index == expression.length() - 1;
      }
    }
    return false;
  }

  private static boolean isExpressionLiteral(String text) {
    String value = String.valueOf(text).trim();
    return "null".equals(value) || "true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value) || isQuoted(value) || isPrimitiveLiteral(value);
  }

  private boolean isBooleanExpression(String expression) {
    String text = expression == null ? "" : expression.trim();
    if (text.startsWith("!") && !text.startsWith("!=")) return true;
    if (findTopLevelOperator(text, "||") > 0 || findTopLevelOperator(text, "&&") > 0) return true;
    String[] operators = { ">=", "<=", "==", "!=", ">", "<" };
    for (String operator : operators) if (findTopLevelOperator(text, operator) > 0) return true;
    return false;
  }

  private static int findTopLevelAssignmentOperator(String expression) {
    int depth = 0;
    int bracketDepth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < expression.length(); index++) {
      char c = expression.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == '(') depth += 1;
      else if (c == ')') depth = Math.max(0, depth - 1);
      else if (c == '[') bracketDepth += 1;
      else if (c == ']') bracketDepth = Math.max(0, bracketDepth - 1);
      if (c != '=' || depth != 0 || bracketDepth != 0) continue;
      char previous = index > 0 ? expression.charAt(index - 1) : '\0';
      char next = index + 1 < expression.length() ? expression.charAt(index + 1) : '\0';
      if (previous == '=' || previous == '!' || previous == '<' || previous == '>' || next == '=') continue;
      return index;
    }
    return -1;
  }

  private static int findTopLevelArithmeticOperator(String expression, char[] operators) {
    int depth = 0;
    int bracketDepth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = expression.length() - 1; index >= 0; index--) {
      char c = expression.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c == ')') { depth += 1; continue; }
      if (c == '(') { depth = Math.max(0, depth - 1); continue; }
      if (c == ']') { bracketDepth += 1; continue; }
      if (c == '[') { bracketDepth = Math.max(0, bracketDepth - 1); continue; }
      if (depth != 0 || bracketDepth != 0 || !containsOperator(operators, c) || isUnaryArithmeticOperator(expression, index)) continue;
      return index;
    }
    return -1;
  }

  private static boolean containsOperator(char[] operators, char value) {
    for (char operator : operators) if (operator == value) return true;
    return false;
  }

  private static boolean isUnaryArithmeticOperator(String expression, int index) {
    char value = expression.charAt(index);
    if (value != '+' && value != '-') return false;
    for (int cursor = index - 1; cursor >= 0; cursor--) {
      char previous = expression.charAt(cursor);
      if (Character.isWhitespace(previous)) continue;
      return previous == '(' || previous == ',' || previous == '+' || previous == '-' || previous == '*' || previous == '/' || previous == '%';
    }
    return true;
  }

  private static List<String> splitExpressionChain(String expression) {
    return splitTopLevel(expression, '.');
  }

  private static List<String> splitInvocationArguments(String arguments) {
    if (arguments == null || arguments.trim().isEmpty()) return Collections.emptyList();
    return splitTopLevel(arguments, ',');
  }

  private static List<String> splitTopLevel(String text, char separator) {
    List<String> parts = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    int depth = 0;
    int bracketDepth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (quote != 0) {
        current.append(c);
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; current.append(c); continue; }
      if (c == '(') depth += 1;
      else if (c == ')') depth = Math.max(0, depth - 1);
      else if (c == '[') bracketDepth += 1;
      else if (c == ']') bracketDepth = Math.max(0, bracketDepth - 1);
      if (c == separator && depth == 0 && bracketDepth == 0) { parts.add(current.toString().trim()); current.setLength(0); }
      else current.append(c);
    }
    if (!current.isEmpty()) parts.add(current.toString().trim());
    return parts;
  }

  private static boolean isMethodCall(String segment) { return segment != null && segment.endsWith(")") && segment.indexOf('(') > 0; }
  private static String methodCallName(String segment) { return segment.substring(0, segment.indexOf('(')).trim(); }
  private static String methodCallArguments(String segment) { int open = segment.indexOf('('); return open < 0 || !segment.endsWith(")") ? "" : segment.substring(open + 1, segment.length() - 1); }
  private static boolean isMethodInvocationExpression(String expression) {
    String text = trimExpressionStatement(expression);
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < text.length(); index++) {
      char c = text.charAt(index);
      if (quote != 0) {
        if (escaped) escaped = false;
        else if (c == '\\') escaped = true;
        else if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') { quote = c; continue; }
      if (c != '(') continue;
      int cursor = index - 1;
      while (cursor >= 0 && Character.isWhitespace(text.charAt(cursor))) cursor--;
      if (cursor < 0 || !Character.isJavaIdentifierPart(text.charAt(cursor))) continue;
      while (cursor >= 0 && Character.isJavaIdentifierPart(text.charAt(cursor))) cursor--;
      return true;
    }
    return false;
  }
  private static boolean isQuoted(String value) { return value.length() >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))); }
  private static boolean isPrimitiveLiteral(String value) { return "true".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value) || value.matches("[-+]?\\d+(\\.\\d+)?[fFdDlL]?"); }

  private void setPathValue(FrameSelection selection, String expression, String text) throws Exception {
    if (selection == null) throw new IllegalStateException("Select a suspended stack frame before setting a value.");
    String target = expression == null ? "" : expression.trim();
    if (target.isBlank()) throw new IllegalArgumentException("Set Value target is empty.");
    if (setQualifiedStaticFieldValue(selection, target, text)) return;
    if (setArrayElementValue(selection, target, text)) return;
    String[] parts = target.split("\\.");
    String name = parts[parts.length - 1];
    if (name.isBlank()) throw new IllegalArgumentException("Set Value target is incomplete: " + target);
    if (parts.length == 1) {
      try {
        LocalVariable local = selection.frame.visibleVariableByName(name);
        if (local != null) { selection.frame.setValue(local, parseSetValue(selection, local.typeName(), text, target)); return; }
      } catch (AbsentInformationException ignored) {}
      ObjectReference thisObject = selection.frame.thisObject();
      if (thisObject != null && setObjectField(selection, thisObject, name, text, target)) return;
      StaticFieldReference staticField = findStaticField(selection.frame.location().declaringType(), name);
      if (staticField != null) { setStaticFieldValue(selection, staticField, text, target); return; }
      throw new IllegalArgumentException("Set Value target was not found in the selected frame: " + target);
    }
    Value parent = resolvePath(selection, String.join(".", Arrays.copyOf(parts, parts.length - 1)));
    if (!(parent instanceof ObjectReference object)) throw new IllegalArgumentException("Set Value parent is not an object: " + target);
    if (setObjectField(selection, object, name, text, target)) return;
    throw new IllegalArgumentException("Set Value field was not found: " + target);
  }

  private boolean setQualifiedStaticFieldValue(FrameSelection selection, String target, String text) throws Exception {
    StaticFieldReference staticField = findQualifiedStaticField(target);
    if (staticField == null) return false;
    setStaticFieldValue(selection, staticField, text, target);
    return true;
  }

  private void setStaticFieldValue(FrameSelection selection, StaticFieldReference staticField, String text, String target) throws Exception {
    if (staticField.type instanceof ClassType classType) { classType.setValue(staticField.field, parseSetValue(selection, staticField.field.typeName(), text, target)); return; }
    throw new InvalidTypeException("Set Value cannot modify static field " + target + " on " + staticField.type.name() + ".");
  }

  private boolean setArrayElementValue(FrameSelection selection, String target, String text) throws Exception {
    if (!target.endsWith("]")) return false;
    int open = target.lastIndexOf('[');
    if (open < 0) return false;
    String parentExpression = target.substring(0, open).trim();
    if (parentExpression.isBlank()) throw new IllegalArgumentException("Set Value needs a parent array expression for " + target + ".");
    int index = resolveArrayIndex(selection, target.substring(open + 1, target.length() - 1));
    Value parent = resolveExpression(selection, parentExpression);
    if (!(parent instanceof ArrayReference array)) throw new IllegalArgumentException("Set Value parent is not an array: " + parentExpression);
    if (index < 0 || index >= array.length()) throw new IllegalArgumentException("Array index " + index + " is outside 0.." + Math.max(0, array.length() - 1) + ".");
    array.setValue(index, parseSetValue(selection, arrayComponentTypeName(array), text, target));
    return true;
  }

  private String arrayComponentTypeName(ArrayReference array) {
    ReferenceType type = array.referenceType();
    return type instanceof ArrayType arrayType ? arrayType.componentTypeName() : "java.lang.Object";
  }

  private boolean setObjectField(FrameSelection selection, ObjectReference object, String fieldName, String text, String target) throws Exception {
    Field field = findInstanceField(object, fieldName);
    if (field == null) return false;
    object.setValue(field, parseSetValue(selection, field.typeName(), text, target));
    return true;
  }

  private Value parseSetValue(FrameSelection selection, String typeName, String text, String target) throws InvalidTypeException {
    String value = text == null ? "" : text.trim();
    if (shouldResolveSetValueExpression(value)) {
      Value enumValue = parseEnumValue(typeName, value);
      if (enumValue != null) return enumValue;
      return resolveSetValueExpression(selection, typeName, value, target, null);
    }
    try { return parseValue(typeName, text); }
    catch (RuntimeException | InvalidTypeException error) { return resolveSetValueExpression(selection, typeName, value, target, error); }
  }

  private Value resolveSetValueExpression(FrameSelection selection, String typeName, String value, String target, Throwable literalError) throws InvalidTypeException {
    if (value.isBlank() && literalError != null) throw new InvalidTypeException("Cannot set " + target + " to " + quoteDisplay(value) + " as " + typeName + ": " + (literalError.getMessage() == null ? literalError.toString() : literalError.getMessage()));
    try { return resolveExpression(selection, value); }
    catch (Throwable error) {
      String expressionMessage = error.getMessage() == null ? error.toString() : error.getMessage();
      String literalMessage = literalError == null ? "" : " Literal conversion failed: " + (literalError.getMessage() == null ? literalError.toString() : literalError.getMessage());
      throw new InvalidTypeException("Cannot set " + target + " to " + quoteDisplay(value) + " as " + typeName + ": " + expressionMessage + literalMessage);
    }
  }

  private static boolean shouldResolveSetValueExpression(String value) {
    String text = value == null ? "" : value.trim();
    return !text.isBlank() && !"null".equals(text) && !isQuoted(text) && !isPrimitiveLiteral(text);
  }

  private Value parseValue(String typeName, String text) throws InvalidTypeException {
    String value = text == null ? "" : text.trim();
    if ("null".equals(value)) {
      if (isPrimitiveSetType(typeName)) throw new InvalidTypeException("null cannot be assigned to primitive " + typeName + ".");
      return null;
    }
    if ("boolean".equals(typeName) || "java.lang.Boolean".equals(typeName)) return vm.mirrorOf(parseBooleanSetValue(value));
    if ("byte".equals(typeName) || "java.lang.Byte".equals(typeName)) return vm.mirrorOf(Byte.parseByte(numericLiteral(value)));
    if ("short".equals(typeName) || "java.lang.Short".equals(typeName)) return vm.mirrorOf(Short.parseShort(numericLiteral(value)));
    if ("int".equals(typeName) || "java.lang.Integer".equals(typeName)) return vm.mirrorOf(Integer.parseInt(numericLiteral(value)));
    if ("long".equals(typeName) || "java.lang.Long".equals(typeName)) return vm.mirrorOf(Long.parseLong(numericLiteral(value)));
    if ("char".equals(typeName) || "java.lang.Character".equals(typeName)) { String unquoted = unquote(value); return vm.mirrorOf(unquoted.isEmpty() ? '\0' : unquoted.charAt(0)); }
    if ("float".equals(typeName) || "java.lang.Float".equals(typeName)) return vm.mirrorOf(Float.parseFloat(numericLiteral(value)));
    if ("double".equals(typeName) || "java.lang.Double".equals(typeName)) return vm.mirrorOf(Double.parseDouble(numericLiteral(value)));
    Value enumValue = parseEnumValue(typeName, value);
    if (enumValue != null) return enumValue;
    if ("java.lang.String".equals(typeName) || "java.lang.CharSequence".equals(typeName) || "java.lang.Object".equals(typeName)) return vm.mirrorOf(unquote(value));
    throw new InvalidTypeException("Set Value supports primitives, boxed primitives, String, enum constants, and null.");
  }

  private Value parseEnumValue(String typeName, String text) throws InvalidTypeException {
    if (vm == null || typeName == null || typeName.isBlank()) return null;
    String constantName = enumConstantName(typeName, text);
    for (ReferenceType type : vm.classesByName(typeName)) {
      if (!isAssignableTo(type, "java.lang.Enum")) continue;
      Field field = type.fieldByName(constantName);
      if (field != null && field.isStatic()) return type.getValue(field);
    }
    return null;
  }

  private static String enumConstantName(String typeName, String text) {
    String value = unquote(String.valueOf(text == null ? "" : text).trim());
    String simpleName = typeName.substring(typeName.lastIndexOf('.') + 1);
    if (value.startsWith(typeName + ".")) return value.substring(typeName.length() + 1);
    if (value.startsWith(simpleName + ".")) return value.substring(simpleName.length() + 1);
    int dot = value.lastIndexOf('.');
    return dot >= 0 ? value.substring(dot + 1) : value;
  }

  private static boolean parseBooleanSetValue(String value) throws InvalidTypeException {
    if ("true".equalsIgnoreCase(value)) return true;
    if ("false".equalsIgnoreCase(value)) return false;
    throw new InvalidTypeException("Expected true or false for a boolean value.");
  }

  private static boolean isPrimitiveSetType(String typeName) {
    return "boolean".equals(typeName) || "byte".equals(typeName) || "short".equals(typeName) || "int".equals(typeName) || "long".equals(typeName) || "char".equals(typeName) || "float".equals(typeName) || "double".equals(typeName);
  }
  private String evaluationErrorJson(String expression, String message) {
    return "{\"name\":" + quote(expression) + ",\"type\":\"\",\"value\":" + quote(message) + ",\"expression\":" + quote(expression) + ",\"objectId\":\"\",\"expandable\":false,\"error\":true,\"kind\":\"error\"}";
  }

  private String valueJson(String name, String type, Value value, String expression) {
    return valueJson(name, type, value, expression, "");
  }

  private String valueJson(String name, String type, Value value, String expression, String kind) {
    return valueJson(name, type, value, expression, kind, "");
  }

  private String valueJson(String name, String type, Value value, String expression, String kind, String declaringType) {
    String objectId = "";
    boolean expandable = value instanceof ObjectReference;
    if (value instanceof ObjectReference object) { objectId = String.valueOf(object.uniqueID()); objects.put(object.uniqueID(), object); if (expression != null && !expression.isBlank()) objectExpressions.put(object.uniqueID(), expression); }
    return "{\"name\":" + quote(name) + ",\"type\":" + quote(type) + ",\"value\":" + quote(valueDisplay(value)) + ",\"expression\":" + quote(expression) + ",\"objectId\":" + quote(objectId) + ",\"expandable\":" + expandable + ",\"kind\":" + quote(kind) + ",\"declaringType\":" + quote(declaringType) + "}";
  }

  private String syntheticValueJson(String name, String type, String value, String expression) {
    return syntheticValueJson(name, type, value, expression, "");
  }

  private String syntheticValueJson(String name, String type, String value, String expression, String kind) {
    return "{\"name\":" + quote(name) + ",\"type\":" + quote(type) + ",\"value\":" + quote(value) + ",\"expression\":" + quote(expression) + ",\"objectId\":\"\",\"expandable\":false,\"kind\":" + quote(kind) + "}";
  }

  private String valueDisplay(Value value) {
    if (value == null) return "null";
    if (value instanceof StringReference string) return "\"" + string.value() + "\"";
    if (value instanceof PrimitiveValue) return value.toString();
    if (value instanceof ArrayReference array) return value.type().name() + "[" + array.length() + "]";
    if (value instanceof ObjectReference object) return objectDisplay(object);
    return value.toString();
  }

  private String objectDisplay(ObjectReference object) {
    String base = object.referenceType().name() + "@" + object.uniqueID();
    if (isAssignableTo(object.referenceType(), "java.util.Map")) return base + sizeSuffix(object, " entries");
    if (isAssignableTo(object.referenceType(), "java.util.Collection")) return base + sizeSuffix(object, " elements");
    return base;
  }

  private String sizeSuffix(ObjectReference object, String label) {
    Value size = invokeValueObjectMethod(object, "size");
    return size instanceof IntegerValue integer ? " (" + integer.value() + label + ")" : "";
  }

  private FrameSelection selectFrame(String frameId) throws Exception {
    if (vm == null) return null;
    if (frameId == null || frameId.isBlank()) {
      ThreadReference thread = selectedThread != null ? selectedThread : firstSuspendedThread();
      if (thread == null || thread.frameCount() <= 0) return null;
      int index = Math.max(0, Math.min(selectedFrameIndex, thread.frameCount() - 1));
      return new FrameSelection(thread, thread.frame(index), index);
    }
    String[] parts = frameId.split(":", 2);
    long threadId = Long.parseLong(parts[0]);
    int index = Integer.parseInt(parts[1]);
    for (ThreadReference thread : vm.allThreads()) if (thread.uniqueID() == threadId) return new FrameSelection(thread, thread.frame(index), index);
    return null;
  }

  private ThreadReference firstSuspendedThread() {
    for (ThreadReference thread : vm.allThreads()) try { if (thread.isSuspended() && thread.frameCount() > 0) return thread; } catch (IncompatibleThreadStateException ignored) {}
    return null;
  }

  private String selectedFrameId() {
    try {
      if (selectedThread == null || selectedThread.frameCount() <= 0) return "";
      int index = Math.max(0, Math.min(selectedFrameIndex, selectedThread.frameCount() - 1));
      return frameIdFor(selectedThread, index);
    }
    catch (IncompatibleThreadStateException ignored) { return ""; }
  }

  private void requireVm() { if (vm == null) throw new IllegalStateException("No debug session is running."); }
  private void requireStoppedThread() throws Exception { requireVm(); if (selectedThread == null) selectedThread = firstSuspendedThread(); if (selectedThread == null) throw new IllegalStateException("The debuggee must be suspended before stepping."); }

  private void startStream(String type, InputStream stream) {
    Thread thread = new Thread(() -> {
      try (InputStreamReader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
        char[] buffer = new char[4096];
        int read;
        while ((read = reader.read(buffer)) >= 0) if (read > 0) emit(type, "{\"text\":" + quote(new String(buffer, 0, read)) + "}");
      } catch (IOException ignored) {}
    }, "md-editor-java-debugger-" + type);
    thread.setDaemon(true);
    thread.start();
  }

  private String locationJson(Location location) { return location == null ? "null" : "{\"className\":" + quote(location.declaringType().name()) + ",\"method\":" + quote(location.method().name()) + ",\"file\":" + quote(safeSourcePath(location)) + ",\"sourceName\":" + quote(safeSourceName(location)) + ",\"line\":" + location.lineNumber() + "}"; }
  private LineBreakpoint withBreakpointLocation(LineBreakpoint breakpoint, Location location) { return location == null ? breakpoint : breakpoint.withResolvedLocation(location.declaringType().name(), location.method().name(), safeSourceName(location), safeSourcePath(location)); }
  private String safeSourceName(Location location) { try { return location.sourceName(); } catch (Throwable ignored) { return ""; } }
  private String safeSourceName(ReferenceType type) { try { return type.sourceName(); } catch (Throwable ignored) { return ""; } }
  private List<String> safeSourcePaths(ReferenceType type) { try { return type.sourcePaths(null); } catch (Throwable ignored) { return Collections.emptyList(); } }
  private String safeSourcePath(Location location) { try { return location.sourcePath(); } catch (Throwable ignored) { return safeSourceName(location); } }
  private static String sourceName(String file) { String normalized = file.replace('\\', '/'); int slash = normalized.lastIndexOf('/'); return slash >= 0 ? normalized.substring(slash + 1) : normalized; }
  private static boolean sourcePathMatches(String requestedFile, String debugSourcePath) {
    String requested = normalizeSourcePath(requestedFile);
    String debugPath = normalizeSourcePath(debugSourcePath);
    if (requested.isBlank() || debugPath.isBlank() || !debugPath.contains("/")) return false;
    return requested.equals(debugPath) || requested.endsWith("/" + debugPath) || debugPath.endsWith("/" + requested);
  }
  private static String normalizeSourcePath(String value) { return String.valueOf(value == null ? "" : value).replace('\\', '/').replaceAll("/+", "/").toLowerCase(Locale.ROOT); }
  private static String breakpointId(String file, int line) { return file.replace('\\', '/') + ":" + line; }
  private static String frameIdFor(ThreadReference thread, int index) { return thread.uniqueID() + ":" + index; }
  private static String threadStatus(int status) { return switch (status) { case ThreadReference.THREAD_STATUS_MONITOR -> "monitor"; case ThreadReference.THREAD_STATUS_NOT_STARTED -> "not-started"; case ThreadReference.THREAD_STATUS_RUNNING -> "running"; case ThreadReference.THREAD_STATUS_SLEEPING -> "sleeping"; case ThreadReference.THREAD_STATUS_WAIT -> "wait"; case ThreadReference.THREAD_STATUS_ZOMBIE -> "terminated"; default -> "unknown"; }; }
  private void emitError(String message) { emit("error", "{\"message\":" + quote(message) + "}"); }
  private synchronized void emit(String type, String jsonBody) { System.out.println("EVT\t" + encode("{\"type\":" + quote(type) + ",\"body\":" + jsonBody + "}")); System.out.flush(); }
  private static String decode(String[] fields, int index) { return index < fields.length ? decode(fields[index]) : ""; }
  private static String decode(String value) { return value == null || value.isBlank() ? "" : new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8); }
  private static String encode(String value) { return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
  private static long parseLong(String value) { try { return Long.parseLong(value); } catch (NumberFormatException error) { return 0L; } }
  private static String quoteCommand(String value) { return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
  private static String numericLiteral(String value) { return String.valueOf(value == null ? "" : value).replaceAll("[fFdDlL]$", ""); }
  private static String unquote(String value) { return value.length() >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) ? value.substring(1, value.length() - 1) : value; }
  private static String quoteDisplay(String value) { return "\"" + String.valueOf(value).replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
  private static String quote(String value) {
    if (value == null) return "null";
    StringBuilder result = new StringBuilder("\"");
    for (int index = 0; index < value.length(); index++) {
      char c = value.charAt(index);
      switch (c) { case '\\' -> result.append("\\\\"); case '"' -> result.append("\\\""); case '\n' -> result.append("\\n"); case '\r' -> result.append("\\r"); case '\t' -> result.append("\\t"); default -> { if (c < 0x20) result.append(String.format("\\u%04x", (int)c)); else result.append(c); } }
    }
    return result.append('"').toString();
  }

  private record FrameSelection(ThreadReference thread, StackFrame frame, int index) {}
  private record StaticFieldReference(ReferenceType type, Field field) {}
  private record StaticMethodResolution(boolean resolved, Value value) {}
  private record MethodBreakpoint(String id, String className, String methodName, boolean enabled, int hits, boolean verified, String message) {
    MethodBreakpoint withVerified(boolean nextVerified, String nextMessage) { return new MethodBreakpoint(id, className, methodName, enabled, hits, nextVerified, nextMessage); }
    MethodBreakpoint withHits(int nextHits) { return new MethodBreakpoint(id, className, methodName, enabled, nextHits, verified, message); }
    String toJson() { return "{\"id\":" + quote(id) + ",\"className\":" + quote(className) + ",\"methodName\":" + quote(methodName) + ",\"enabled\":" + enabled + ",\"hits\":" + hits + ",\"verified\":" + verified + ",\"message\":" + quote(message) + "}"; }
  }
  private record LineBreakpoint(String id, String file, String sourceName, int line, boolean enabled, String condition, int hitCount, String logMessage, boolean temporary, int hits, boolean verified, String message, String className, String method, String resolvedFile) {
    LineBreakpoint withVerified(boolean nextVerified, String nextMessage) { return new LineBreakpoint(id, file, sourceName, line, enabled, condition, hitCount, logMessage, temporary, hits, nextVerified, nextMessage, className, method, resolvedFile); }
    LineBreakpoint withHits(int nextHits) { return new LineBreakpoint(id, file, sourceName, line, enabled, condition, hitCount, logMessage, temporary, nextHits, verified, message, className, method, resolvedFile); }
    LineBreakpoint withResolvedLocation(String nextClassName, String nextMethod, String nextSourceName, String nextResolvedFile) { return new LineBreakpoint(id, file, nextSourceName == null || nextSourceName.isBlank() ? sourceName : nextSourceName, line, enabled, condition, hitCount, logMessage, temporary, hits, verified, message, nextClassName, nextMethod, nextResolvedFile); }
    String toJson() { return "{\"id\":" + quote(id) + ",\"file\":" + quote(file) + ",\"sourceName\":" + quote(sourceName) + ",\"line\":" + line + ",\"enabled\":" + enabled + ",\"condition\":" + quote(condition) + ",\"hitCount\":" + hitCount + ",\"logMessage\":" + quote(logMessage) + ",\"hits\":" + hits + ",\"verified\":" + verified + ",\"message\":" + quote(message) + ",\"className\":" + quote(className) + ",\"method\":" + quote(method) + ",\"resolvedFile\":" + quote(resolvedFile) + "}"; }
  }
}
