package mdeditor.kotlin.abi;

import java.io.IOException;
import java.io.Reader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import org.eclipse.core.runtime.Platform;
import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.osgi.framework.FrameworkUtil;

import com.google.gson.Gson;

/** Owns the durable desired Kotlin ABI classpath state for one JDT workspace. */
public final class KotlinAbiSnapshotStore {
    private static final String STATE_FILE = "active-kotlin-abi.properties";
    public static final int METADATA_VERSION = 2;
    private static final Gson JSON = new Gson();

    private KotlinAbiSnapshotStore() {}

    /** A Java-visible Kotlin ABI library assigned to one Eclipse project location. */
    public record Entry(String projectUri, String jar, String contentHash, List<String> expectedFqns,
            boolean test, String patchModule) {
        public Entry {
            expectedFqns = expectedFqns == null ? null : List.copyOf(expectedFqns);
        }
    }

    /** The complete desired ABI state for the active Kotlin workspace revision. */
    public record Snapshot(int metadataVersion, String revision, String snapshotUri, List<Entry> entries) {
        public Snapshot {
            entries = List.copyOf(entries == null ? List.of() : entries);
        }
    }

    /** Return whether persisted entries can support non-vacuous ABI verification. */
    public static boolean hasCompleteVerificationMetadata(Snapshot snapshot) {
        return snapshot != null
            && snapshot.metadataVersion() >= METADATA_VERSION
            && snapshot.entries().stream().allMatch(entry -> entry.contentHash() != null
                && !entry.contentHash().isBlank() && entry.expectedFqns() != null);
    }

    /** Persist desired state atomically so a restarted container can reconstruct itself. */
    public static synchronized void save(Snapshot snapshot) throws IOException {
        Properties properties = new Properties();
        properties.setProperty("metadata.version", String.valueOf(snapshot.metadataVersion()));
        properties.setProperty("revision", value(snapshot.revision()));
        properties.setProperty("snapshotUri", value(snapshot.snapshotUri()));
        properties.setProperty("entry.count", String.valueOf(snapshot.entries().size()));
        for (int index = 0; index < snapshot.entries().size(); index++) {
            Entry entry = snapshot.entries().get(index);
            String prefix = "entry." + index + ".";
            properties.setProperty(prefix + "projectUri", value(entry.projectUri()));
            properties.setProperty(prefix + "jar", value(entry.jar()));
            properties.setProperty(prefix + "contentHash", value(entry.contentHash()));
            properties.setProperty(prefix + "expectedFqns", JSON.toJson(entry.expectedFqns()));
            properties.setProperty(prefix + "test", String.valueOf(entry.test()));
            properties.setProperty(prefix + "patchModule", value(entry.patchModule()));
        }
        Path file = stateFile();
        Files.createDirectories(file.getParent());
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        try (var writer = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            properties.store(writer, "MD-Editor Kotlin ABI state");
        }
        try {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicMoveFailure) {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Load the adapter manifest, falling back to the last confirmed persisted mapping. */
    public static synchronized Snapshot load() {
        Snapshot persisted = loadPersisted();
        if (persisted == null) return new Snapshot(0, "", "", List.of());
        Snapshot current = loadManifest(persisted.snapshotUri());
        return current != null ? current : persisted;
    }

    /** Resolve valid library entries for the supplied Eclipse project location. */
    public static IClasspathEntry[] entriesFor(IJavaProject project) {
        String projectUri = projectLocation(project);
        return load().entries().stream()
            .filter(entry -> sameUri(entry.projectUri(), projectUri))
            .filter(entry -> Files.isRegularFile(Path.of(entry.jar())))
            .map(KotlinAbiSnapshotStore::toClasspathEntry)
            .toArray(IClasspathEntry[]::new);
    }

    /** Return the normalized project locations tracked by durable state. */
    public static List<String> trackedProjectUris() {
        return load().entries().stream().map(Entry::projectUri).distinct().toList();
    }

    /** Convert an Eclipse project location into the URI used by adapter snapshots. */
    public static String projectLocation(IJavaProject project) {
        URI uri = project.getProject().getLocationURI();
        return uri == null ? "" : normalizeUri(uri.toString());
    }

    /** Compare platform file URIs without Windows casing or separator differences. */
    public static boolean sameUri(String left, String right) {
        return normalizeUri(left).equals(normalizeUri(right));
    }

    private static Snapshot loadPersisted() {
        Path file = stateFile();
        if (!Files.isRegularFile(file)) return null;
        Properties properties = new Properties();
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            properties.load(reader);
            int count = Integer.parseInt(properties.getProperty("entry.count", "0"));
            List<Entry> entries = new ArrayList<>();
            for (int index = 0; index < count; index++) {
                String prefix = "entry." + index + ".";
                String jar = properties.getProperty(prefix + "jar", "");
                if (jar.isBlank()) continue;
                String expectedJson = properties.getProperty(prefix + "expectedFqns");
                entries.add(new Entry(
                    properties.getProperty(prefix + "projectUri", ""),
                    jar,
                    properties.getProperty(prefix + "contentHash", ""),
                    expectedJson == null ? null : List.of(JSON.fromJson(expectedJson, String[].class)),
                    Boolean.parseBoolean(properties.getProperty(prefix + "test", "false")),
                    properties.getProperty(prefix + "patchModule", "")
                ));
            }
            return new Snapshot(Integer.parseInt(properties.getProperty("metadata.version", "0")),
                properties.getProperty("revision", ""),
                properties.getProperty("snapshotUri", ""), entries);
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private static Snapshot loadManifest(String snapshotUri) {
        if (snapshotUri == null || snapshotUri.isBlank()) return null;
        try {
            Path file = pathFromUri(snapshotUri);
            if (!Files.isRegularFile(file)) return null;
            try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                Manifest manifest = JSON.fromJson(reader, Manifest.class);
                if (manifest == null || manifest.entries == null) return null;
                List<Entry> entries = manifest.entries.stream().map(item -> new Entry(
                    item.projectUri,
                    !item.jarPath.isBlank() ? item.jarPath : pathFromUri(item.jarUri).toString(),
                    item.contentHash,
                    item.expectedFqns,
                    item.test,
                    item.patchModule
                )).filter(entry -> Files.isRegularFile(Path.of(entry.jar()))).toList();
                if (entries.size() != manifest.entries.size()) return null;
                return new Snapshot(manifest.metadataVersion, manifest.workspaceRevision, snapshotUri, entries);
            }
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    private static IClasspathEntry toClasspathEntry(Entry entry) {
        List<IClasspathAttribute> attributes = new ArrayList<>();
        if (entry.test()) attributes.add(JavaCore.newClasspathAttribute(IClasspathAttribute.TEST, "true"));
        if (entry.patchModule() != null && !entry.patchModule().isBlank()) {
            attributes.add(JavaCore.newClasspathAttribute(IClasspathAttribute.PATCH_MODULE, entry.patchModule()));
        }
        return JavaCore.newLibraryEntry(org.eclipse.core.runtime.Path.fromOSString(entry.jar()), null, null,
            new org.eclipse.jdt.core.IAccessRule[0], attributes.toArray(IClasspathAttribute[]::new), false);
    }

    private static Path pathFromUri(String pathOrUri) {
        return pathOrUri.startsWith("file:") ? Path.of(URI.create(pathOrUri)) : Path.of(pathOrUri);
    }

    private static Path stateFile() {
        try {
            return Platform.getStateLocation(FrameworkUtil.getBundle(KotlinAbiSnapshotStore.class)).append(STATE_FILE).toFile().toPath();
        } catch (IllegalStateException error) {
            return Path.of(System.getProperty("java.io.tmpdir"), "mdeditor-kotlin-abi", STATE_FILE);
        }
    }

    private static String normalizeUri(String value) {
        String normalized = value(value).replace('\\', '/').replaceAll("/+$", "");
        return System.getProperty("os.name", "").toLowerCase().contains("win") ? normalized.toLowerCase() : normalized;
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    private static final class Manifest {
        int metadataVersion;
        String workspaceRevision = "";
        List<ManifestEntry> entries = List.of();
    }

    private static final class ManifestEntry {
        String projectUri = "";
        String jarUri = "";
        String jarPath = "";
        String contentHash = "";
        List<String> expectedFqns;
        boolean test;
        String patchModule = "";
    }
}
