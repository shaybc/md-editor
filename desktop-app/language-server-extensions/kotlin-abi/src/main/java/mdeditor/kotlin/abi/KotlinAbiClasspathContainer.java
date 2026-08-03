package mdeditor.kotlin.abi;

import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.ClasspathContainerInitializer;
import org.eclipse.jdt.core.IClasspathContainer;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;

/** Restores MD-Editor's synthetic Kotlin ABI entries whenever JDT resolves the container. */
public final class KotlinAbiClasspathContainer extends ClasspathContainerInitializer implements IClasspathContainer {
    public static final IPath PATH = new org.eclipse.core.runtime.Path("MD_EDITOR_KOTLIN_ABI");
    private final IClasspathEntry[] entries;

    public KotlinAbiClasspathContainer() { this(new IClasspathEntry[0]); }
    private KotlinAbiClasspathContainer(IClasspathEntry[] entries) { this.entries = entries; }

    @Override
    public void initialize(IPath containerPath, IJavaProject project) throws CoreException {
        apply(project, KotlinAbiSnapshotStore.entriesFor(project), null);
    }

    @Override public IClasspathEntry[] getClasspathEntries() { return this.entries.clone(); }
    @Override public String getDescription() { return "MD-Editor Kotlin ABI"; }
    @Override public int getKind() { return K_APPLICATION; }
    @Override public IPath getPath() { return PATH; }

    /** Apply an effective container value and notify JDT of the classpath delta. */
    public static void apply(IJavaProject project, IClasspathEntry[] entries, IProgressMonitor monitor) throws CoreException {
        ensureRawContainer(project, monitor);
        JavaCore.setClasspathContainer(PATH, new IJavaProject[] { project },
            new IClasspathContainer[] { new KotlinAbiClasspathContainer(entries) }, monitor);
    }

    /** Reconstruct every accessible Java project's container from durable desired state. */
    public static void reapplyAll(IProgressMonitor monitor) {
        for (var project : org.eclipse.core.resources.ResourcesPlugin.getWorkspace().getRoot().getProjects()) {
            if (!project.isAccessible()) continue;
            try {
                IJavaProject javaProject = JavaCore.create(project);
                if (!javaProject.exists()) continue;
                IClasspathEntry[] desired = KotlinAbiSnapshotStore.entriesFor(javaProject);
                boolean rawContainerPresent = hasRawContainer(javaProject);
                if (desired.length == 0 && !rawContainerPresent) continue;
                if (!rawContainerPresent) {
                    ensureRawContainer(javaProject, monitor);
                    continue;
                }
                IClasspathContainer current = JavaCore.getClasspathContainer(PATH, javaProject);
                if (current != null
                        && KotlinAbiClasspathStamp.isOwnedByCurrentSession(current.getClasspathEntries())) continue;
                if (current != null) continue;
                new KotlinAbiClasspathContainer().initialize(PATH, javaProject);
            } catch (CoreException ignored) {}
        }
    }

    /** Return the actual effective container entries currently visible to JDT. */
    public static IClasspathEntry[] get(IJavaProject project) {
        try {
            IClasspathContainer container = JavaCore.getClasspathContainer(PATH, project);
            return container == null ? new IClasspathEntry[0] : container.getClasspathEntries().clone();
        } catch (CoreException ignored) {
            return new IClasspathEntry[0];
        }
    }

    private static boolean hasRawContainer(IJavaProject project) throws CoreException {
        for (IClasspathEntry entry : project.getRawClasspath()) {
            if (entry.getEntryKind() == IClasspathEntry.CPE_CONTAINER && PATH.equals(entry.getPath())) return true;
        }
        return false;
    }

    private static void ensureRawContainer(IJavaProject project, IProgressMonitor monitor) throws CoreException {
        for (IClasspathEntry entry : project.getRawClasspath()) {
            if (entry.getEntryKind() == IClasspathEntry.CPE_CONTAINER && PATH.equals(entry.getPath())) return;
        }
        IClasspathEntry[] current = project.getRawClasspath();
        IClasspathEntry[] replacement = java.util.Arrays.copyOf(current, current.length + 1);
        replacement[current.length] = JavaCore.newContainerEntry(PATH);
        project.setRawClasspath(replacement, monitor);
    }
}
