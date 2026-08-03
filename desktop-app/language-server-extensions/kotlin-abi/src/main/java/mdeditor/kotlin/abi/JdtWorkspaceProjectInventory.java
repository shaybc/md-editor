package mdeditor.kotlin.abi;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.JavaCore;

/** Describes the authoritative Eclipse workspace projects imported by JDT. */
final class JdtWorkspaceProjectInventory {
    private static final String INTERNAL_FALLBACK_PROJECT = "jdt.ls-java-project";

    private JdtWorkspaceProjectInventory() {}

    /**
     * Capture the project identity and location that JDT currently sees.
     *
     * @return Stable, JSON-serializable project records for renderer validation.
     */
    static List<Map<String, Object>> describe() {
        List<Map<String, Object>> projects = new ArrayList<>();
        for (IProject project : ResourcesPlugin.getWorkspace().getRoot().getProjects()) {
            Map<String, Object> value = new LinkedHashMap<>();
            URI location = project.getLocationURI();
            value.put("name", project.getName());
            value.put("locationUri", location == null ? "" : location.toString());
            value.put("open", project.isOpen());
            value.put("accessible", project.isAccessible());
            IJavaProject javaProject = JavaCore.create(project);
            value.put("javaProject", project.isAccessible() && javaProject.exists());
            value.put("sourceRoots", describeSourceRoots(javaProject));
            value.put("internal", INTERNAL_FALLBACK_PROJECT.equals(project.getName()));
            projects.add(value);
        }
        return List.copyOf(projects);
    }

    /**
     * Capture source roots configured on one imported Java project.
     *
     * @param project imported JDT project
     * @return JSON-serializable source-root location URIs
     */
    private static List<String> describeSourceRoots(IJavaProject project) {
        if (!project.exists()) return List.of();
        List<String> roots = new ArrayList<>();
        try {
            for (IPackageFragmentRoot root : project.getPackageFragmentRoots()) {
                if (root.getKind() != IPackageFragmentRoot.K_SOURCE) continue;
                IClasspathEntry entry = root.getRawClasspathEntry();
                URI location = root.getResource() == null ? null : root.getResource().getLocationURI();
                if (entry.getEntryKind() == IClasspathEntry.CPE_SOURCE && location != null) {
                    roots.add(location.toString());
                }
            }
        } catch (JavaModelException ignored) {
            return List.of();
        }
        return List.copyOf(roots);
    }
}
