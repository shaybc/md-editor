/* One-shot headless AJDT build for a resolved Gradle AspectJ module. */
package mdeditor.ajdt.diagnostics;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.eclipse.ajdt.core.AspectJPlugin;
import org.eclipse.core.resources.ICommand;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IWorkspaceDescription;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.equinox.app.IApplication;
import org.eclipse.equinox.app.IApplicationContext;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.launching.JavaRuntime;

/** Builds one copied Gradle module and writes its complete AJDT diagnostic snapshot. */
public final class AjdtDiagnosticsApplication implements IApplication {
    private static final String AJDT_BUILDER = "org.eclipse.ajdt.core.ajbuilder";

    @Override
    public Object start(IApplicationContext context) throws Exception {
        Arguments arguments = Arguments.parse(context);
        try {
            AspectjGradleModel model = AspectjGradleModel.load(arguments.modelPath());
            disableAutoBuilding();
            IProject project = createProject(model);
            HeadlessDiagnosticCompilerFactory compilerFactory = configureHeadlessDiagnostics(project);
            compilerFactory.resetDiagnostics(project);
            project.build(IncrementalProjectBuilder.FULL_BUILD, new NullProgressMonitor());
            compilerFactory.publishDiagnostics(project);
            Files.createDirectories(arguments.reportPath().getParent());
            Files.writeString(arguments.reportPath(), DiagnosticReport.capture(project, model), StandardCharsets.UTF_8);
            return EXIT_OK;
        } catch (Throwable failure) {
            failure.printStackTrace(System.err);
            return Integer.valueOf(1);
        }
    }

    @Override
    public void stop() {
    }

    private static void disableAutoBuilding() throws CoreException {
        IWorkspaceDescription description = ResourcesPlugin.getWorkspace().getDescription();
        description.setAutoBuilding(false);
        ResourcesPlugin.getWorkspace().setDescription(description);
    }

    private static IProject createProject(AspectjGradleModel model) throws Exception {
        NullProgressMonitor monitor = new NullProgressMonitor();
        String projectName = "MD_EDITOR_AJDT_" + Integer.toHexString(model.projectRoot().toString().toLowerCase().hashCode());
        IProject project = ResourcesPlugin.getWorkspace().getRoot().getProject(projectName);
        if (project.exists()) project.delete(true, true, monitor);
        project.create(monitor);
        project.open(monitor);

        IProjectDescription description = project.getDescription();
        description.setNatureIds(new String[] { JavaCore.NATURE_ID });
        ICommand aspectjBuilder = description.newCommand();
        aspectjBuilder.setBuilderName(AJDT_BUILDER);
        description.setBuildSpec(new ICommand[] { aspectjBuilder });
        project.setDescription(description, monitor);

        List<IClasspathEntry> classpath = new ArrayList<>();
        for (int index = 0; index < model.sourceRoots().size(); index++) {
            IFolder sourceFolder = project.getFolder("source-" + index);
            sourceFolder.create(true, true, monitor);
            copySourceTree(model.sourceRoots().get(index), sourceFolder.getLocation().toFile().toPath());
            sourceFolder.refreshLocal(IFolder.DEPTH_INFINITE, monitor);
            classpath.add(JavaCore.newSourceEntry(sourceFolder.getFullPath()));
        }
        classpath.add(JavaCore.newContainerEntry(JavaRuntime.newDefaultJREContainerPath()));
        for (Path entry : model.classpath()) {
            classpath.add(JavaCore.newLibraryEntry(org.eclipse.core.runtime.Path.fromOSString(entry.toString()), null, null));
        }

        IFolder output = project.getFolder("bin");
        output.create(true, true, monitor);
        IJavaProject javaProject = JavaCore.create(project);
        javaProject.setRawClasspath(classpath.toArray(IClasspathEntry[]::new), output.getFullPath(), monitor);
        Map<String, String> options = javaProject.getOptions(false);
        JavaCore.setComplianceOptions(model.javaVersion(), options);
        javaProject.setOptions(options);
        project.refreshLocal(IProject.DEPTH_INFINITE, monitor);
        return project;
    }

    private static HeadlessDiagnosticCompilerFactory configureHeadlessDiagnostics(IProject project) {
        AspectJPlugin plugin = AspectJPlugin.getDefault();
        plugin.getCompilerFactory().removeCompilerForProject(project);
        plugin.setHeadless(true);
        HeadlessDiagnosticCompilerFactory compilerFactory = new HeadlessDiagnosticCompilerFactory();
        plugin.setCompilerFactory(compilerFactory);
        return compilerFactory;
    }

    private static void copySourceTree(Path sourceRoot, Path targetRoot) throws IOException {
        try (Stream<Path> paths = Files.walk(sourceRoot)) {
            for (Path source : paths.toList()) {
                Path target = targetRoot.resolve(sourceRoot.relativize(source).toString());
                if (Files.isDirectory(source)) Files.createDirectories(target);
                else {
                    Files.createDirectories(target.getParent());
                    Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }

    private record Arguments(Path modelPath, Path reportPath) {
        private static Arguments parse(IApplicationContext context) {
            String[] values = (String[]) context.getArguments().get(IApplicationContext.APPLICATION_ARGS);
            Path model = null;
            Path report = null;
            for (int index = 0; index < values.length - 1; index++) {
                if ("-model".equals(values[index])) model = Path.of(values[++index]).toAbsolutePath();
                else if ("-report".equals(values[index])) report = Path.of(values[++index]).toAbsolutePath();
            }
            if (model == null || report == null) throw new IllegalArgumentException("AJDT diagnostics require -model and -report paths.");
            return new Arguments(model, report);
        }
    }
}
