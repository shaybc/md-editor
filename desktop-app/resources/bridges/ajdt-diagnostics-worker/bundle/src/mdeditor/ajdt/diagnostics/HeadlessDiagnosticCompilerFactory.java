/* AJDT compiler composition for headless diagnostic publication. */
package mdeditor.ajdt.diagnostics;

import java.util.HashMap;
import java.util.Map;

import org.aspectj.ajde.core.AjCompiler;
import org.eclipse.ajdt.internal.core.ajde.CoreBuildProgressMonitor;
import org.eclipse.ajdt.internal.core.ajde.CoreCompilerConfiguration;
import org.eclipse.ajdt.internal.core.ajde.ICompilerFactory;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.CoreException;

/** Creates incremental AJDT compilers that publish headless problem markers. */
public final class HeadlessDiagnosticCompilerFactory implements ICompilerFactory {
    private final Map<IProject, AjCompiler> compilers = new HashMap<>();
    private final Map<IProject, HeadlessProblemMarkerMessageHandler> messageHandlers = new HashMap<>();

    /** Clear captured messages before one complete diagnostics build. */
    public void resetDiagnostics(IProject project) {
        getMessageHandler(project).reset();
    }

    /** Publish the completed compiler-message snapshot as Eclipse problem markers. */
    public void publishDiagnostics(IProject project) throws CoreException {
        getMessageHandler(project).publish();
    }

    @Override
    public AjCompiler getCompilerForProject(IProject project) {
        return compilers.computeIfAbsent(project, this::createCompiler);
    }

    @Override
    public void removeCompilerForProject(IProject project) {
        AjCompiler compiler = compilers.remove(project);
        messageHandlers.remove(project);
        if (compiler != null) compiler.clearLastState();
    }

    @Override
    public boolean hasCompilerForProject(IProject project) {
        return compilers.containsKey(project);
    }

    private AjCompiler createCompiler(IProject project) {
        return new AjCompiler(project.getName(), new CoreCompilerConfiguration(project),
            new CoreBuildProgressMonitor(project), getMessageHandler(project));
    }

    private HeadlessProblemMarkerMessageHandler getMessageHandler(IProject project) {
        return messageHandlers.computeIfAbsent(project, HeadlessProblemMarkerMessageHandler::new);
    }
}
