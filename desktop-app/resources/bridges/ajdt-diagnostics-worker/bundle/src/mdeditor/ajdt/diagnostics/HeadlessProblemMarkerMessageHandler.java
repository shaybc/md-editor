/* AspectJ compiler-message bridge for a headless Eclipse workspace. */
package mdeditor.ajdt.diagnostics;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.aspectj.ajde.core.IBuildMessageHandler;
import org.aspectj.bridge.AbortException;
import org.aspectj.bridge.IMessage;
import org.aspectj.bridge.ISourceLocation;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;

/** Captures AspectJ compiler messages without loading AJDT Workbench UI code. */
public final class HeadlessProblemMarkerMessageHandler implements IBuildMessageHandler {
    private static final String SOURCE_ID = "mdeditor.ajdt.diagnostics.headless";
    private final IProject project;
    private final List<IMessage> messages = new ArrayList<>();
    private final Set<IMessage.Kind> ignoredKinds = new HashSet<>();

    public HeadlessProblemMarkerMessageHandler(IProject project) {
        this.project = project;
    }

    /** Report whether this bridge owns a marker. */
    public static boolean owns(IMarker marker) throws CoreException {
        return SOURCE_ID.equals(marker.getAttribute(IMarker.SOURCE_ID, ""));
    }

    /** Start one replacement compiler snapshot. */
    public synchronized void reset() {
        messages.clear();
    }

    /** Replace the bridge's previous markers with the captured messages. */
    public synchronized void publish() throws CoreException {
        for (IMarker marker : project.findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_INFINITE)) {
            if (owns(marker)) marker.delete();
        }
        for (IMessage message : messages) {
            if (message.isError() || message.isWarning()) createMarker(message);
        }
    }

    @Override
    public synchronized boolean handleMessage(IMessage message) throws AbortException {
        if (!isIgnoring(message.getKind())) messages.add(message);
        return true;
    }

    @Override public synchronized boolean isIgnoring(IMessage.Kind kind) { return ignoredKinds.contains(kind); }
    @Override public synchronized void dontIgnore(IMessage.Kind kind) { ignoredKinds.remove(kind); }
    @Override public synchronized void ignore(IMessage.Kind kind) { ignoredKinds.add(kind); }

    private void createMarker(IMessage message) throws CoreException {
        IResource resource = resolveResource(message.getSourceLocation());
        IMarker marker = resource.createMarker(IMarker.PROBLEM);
        marker.setAttribute(IMarker.SOURCE_ID, SOURCE_ID);
        marker.setAttribute(IMarker.MESSAGE, message.getMessage());
        marker.setAttribute(IMarker.SEVERITY, message.isError() ? IMarker.SEVERITY_ERROR : (message.isWarning() ? IMarker.SEVERITY_WARNING : IMarker.SEVERITY_INFO));
        ISourceLocation location = message.getSourceLocation();
        if (location != null) {
            if (location.getLine() > 0) marker.setAttribute(IMarker.LINE_NUMBER, location.getLine());
            if (message.getSourceStart() >= 0) marker.setAttribute(IMarker.CHAR_START, message.getSourceStart());
            if (message.getSourceEnd() >= message.getSourceStart()) marker.setAttribute(IMarker.CHAR_END, message.getSourceEnd() + 1);
        }
    }

    private IResource resolveResource(ISourceLocation location) {
        if (location == null || location.getSourceFile() == null || project.getLocation() == null) return project;
        File sourceFile = location.getSourceFile();
        Path projectPath = project.getLocation().toFile().toPath().toAbsolutePath().normalize();
        Path sourcePath = sourceFile.toPath().toAbsolutePath().normalize();
        if (!sourcePath.startsWith(projectPath)) return project;
        IFile file = project.getFile(projectPath.relativize(sourcePath).toString().replace('\\', '/'));
        return file.exists() ? file : project;
    }
}
