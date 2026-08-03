/* Resolved Gradle inputs for one production AspectJ diagnostics build. */
package mdeditor.ajdt.diagnostics;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/** Represents one Gradle module's source roots, classpath, and Java level. */
public record AspectjGradleModel(Path projectRoot, String projectPath, List<Path> sourceRoots, List<Path> classpath, String javaVersion) {
    /** Load one model serialized by the Node worker. */
    public static AspectjGradleModel load(Path modelPath) throws IOException {
        Properties properties = new Properties();
        try (Reader reader = Files.newBufferedReader(modelPath, StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        return new AspectjGradleModel(
            Path.of(properties.getProperty("project.root")).toAbsolutePath().normalize(),
            properties.getProperty("project.path", ":"),
            readPaths(properties, "source"),
            readPaths(properties, "classpath"),
            properties.getProperty("java.version", "17"));
    }

    /** Map a copied Eclipse resource back to its original Gradle source file. */
    public Path resolveOriginalPath(String projectRelativePath) {
        String normalized = projectRelativePath.replace('\\', '/');
        int separator = normalized.indexOf('/');
        String folder = separator >= 0 ? normalized.substring(0, separator) : normalized;
        if (folder.startsWith("source-")) {
            try {
                int index = Integer.parseInt(folder.substring("source-".length()));
                String relative = separator >= 0 ? normalized.substring(separator + 1) : "";
                if (index >= 0 && index < sourceRoots.size()) return sourceRoots.get(index).resolve(relative).normalize();
            } catch (NumberFormatException ignored) {
                // A project marker falls back to the module root.
            }
        }
        return projectRoot;
    }

    private static List<Path> readPaths(Properties properties, String name) {
        int count = Integer.parseInt(properties.getProperty(name + ".count", "0"));
        List<Path> paths = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            paths.add(Path.of(properties.getProperty(name + "." + index)).toAbsolutePath().normalize());
        }
        return List.copyOf(paths);
    }
}
