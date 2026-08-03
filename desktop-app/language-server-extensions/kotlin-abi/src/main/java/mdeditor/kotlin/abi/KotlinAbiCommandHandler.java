package mdeditor.kotlin.abi;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

/** Reconciles Kotlin ABI containers and verifies the Java-visible types JDT must resolve. */
public final class KotlinAbiCommandHandler implements IDelegateCommandHandler {
    private static final Map<String, String> RECONCILED_FINGERPRINTS = new ConcurrentHashMap<>();

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        Map<?, ?> request = arguments.isEmpty() || !(arguments.get(0) instanceof Map<?, ?> value) ? Map.of() : value;
        if ("mdeditor.kotlin.reconcileAbiClasspaths".equals(commandId)) return reconcile(request, monitor);
        Object projectReference = request.containsKey("project") ? request.get("project") : "";
        IJavaProject project = findProject(String.valueOf(projectReference));
        if (project == null) throw new IllegalArgumentException("JDT project was not found.");
        if ("mdeditor.kotlin.getAbiClasspaths".equals(commandId)) return describe(project);
        if ("mdeditor.kotlin.clearAbiClasspaths".equals(commandId)) {
            KotlinAbiClasspathContainer.apply(project, new IClasspathEntry[0], monitor);
            return describe(project);
        }
        if (!"mdeditor.kotlin.updateAbiClasspaths".equals(commandId)) {
            throw new IllegalArgumentException("Unsupported command: " + commandId);
        }
        KotlinAbiClasspathContainer.apply(project, parseEntries(request.get("entries")), monitor);
        return describe(project);
    }

    private static Map<String, Object> reconcile(Map<?, ?> request, IProgressMonitor monitor) throws Exception {
        ParsedRequest parsed = parseRequest(request);
        Set<String> previouslyTracked = new LinkedHashSet<>(KotlinAbiSnapshotStore.trackedProjectUris());
        List<String> missingProjects = new ArrayList<>();
        List<String> missingJars = parsed.durableEntries().stream().map(KotlinAbiSnapshotStore.Entry::jar)
            .filter(jar -> !Files.isRegularFile(Path.of(jar))).distinct().toList();
        if (!missingJars.isEmpty()) {
            return reconciliationResult(request, List.of(), List.of(), List.of(), List.of(), missingProjects,
                missingJars, List.of(), emptyVerification());
        }


        List<ContainerAction> actions = new ArrayList<>();
        List<KotlinAbiResolutionVerifier.ProjectExpectation> expectations = new ArrayList<>();
        List<String> unchanged = new ArrayList<>();
        Set<String> desiredUris = new LinkedHashSet<>();
        for (DesiredProject desired : parsed.projects()) {
            desiredUris.add(desired.projectUri());
            IJavaProject project = findProject(desired.projectUri());
            if (project == null) {
                missingProjects.add(desired.projectUri());
                continue;
            }
            IClasspathEntry[] entries = desired.entries().stream()
                .map(entry -> KotlinAbiClasspathStamp.stamp(toEntry(entry), requestValue(entry, "contentHash")))
                .toArray(IClasspathEntry[]::new);
            String fingerprintKey = KotlinAbiSnapshotStore.projectLocation(project);
            String fingerprint = KotlinAbiClasspathStamp.fingerprint(entries);
            boolean alreadyApplied = fingerprint.equals(RECONCILED_FINGERPRINTS.get(fingerprintKey))
                && java.util.Arrays.equals(KotlinAbiClasspathContainer.get(project), entries);
            if (alreadyApplied) unchanged.add(desired.projectUri());
            else actions.add(new ContainerAction(desired.projectUri(), project, entries, fingerprintKey, fingerprint, false));
            expectations.add(new KotlinAbiResolutionVerifier.ProjectExpectation(
                desired.projectUri(),
                project,
                desired.entries().stream().map(entry -> new KotlinAbiResolutionVerifier.EntryExpectation(
                    requestValue(entry, "jar"), stringList(entry.get("expectedFqns")))).toList(),
                fingerprint
            ));
        }
        for (String projectUri : previouslyTracked) {
            if (desiredUris.stream().anyMatch(uri -> KotlinAbiSnapshotStore.sameUri(uri, projectUri))) continue;
            IJavaProject project = findProject(projectUri);
            if (project != null) {
                actions.add(new ContainerAction(projectUri, project, new IClasspathEntry[0],
                    KotlinAbiSnapshotStore.projectLocation(project), "", true));
            }
        }

        List<IJavaProject> changedProjects = actions.stream().filter(action -> !action.clear())
            .map(ContainerAction::project).distinct().toList();
        KotlinAbiResolutionVerifier.VerificationResult verification;
        try (var deltaAwaiter = KotlinAbiResolutionVerifier.watch(changedProjects)) {
            ResourcesPlugin.getWorkspace().run(workspaceMonitor -> {
                for (ContainerAction action : actions) {
                    KotlinAbiClasspathContainer.apply(action.project(), action.entries(), workspaceMonitor);
                }
            }, ResourcesPlugin.getWorkspace().getRoot(), IWorkspace.AVOID_UPDATE, monitor);
            verification = KotlinAbiResolutionVerifier.verify(expectations, deltaAwaiter, monitor);
        }

        boolean reconciliationConfirmed = parsed.metadataComplete()
            && missingProjects.isEmpty()
            && verification.unresolvedTypes().isEmpty()
            && verification.incompatibleClassFiles().isEmpty()
            && verification.projects().stream()
                .allMatch(project -> Boolean.TRUE.equals(project.get("effectiveContainerConfirmed")));
        if (reconciliationConfirmed) {
            KotlinAbiSnapshotStore.save(new KotlinAbiSnapshotStore.Snapshot(
                (int) numberValue(request, "metadataVersion"),
                requestValue(request, "revision"),
                requestValue(request, "snapshotUri"),
                parsed.durableEntries()
            ));
        }

        List<String> applied = new ArrayList<>();
        List<String> invalidated = new ArrayList<>();
        List<String> cleared = new ArrayList<>();
        for (ContainerAction action : actions) {
            if (action.clear()) {
                if (reconciliationConfirmed) RECONCILED_FINGERPRINTS.remove(action.fingerprintKey());
                cleared.add(action.projectUri());
            } else {
                if (reconciliationConfirmed) {
                    RECONCILED_FINGERPRINTS.put(action.fingerprintKey(), action.fingerprint());
                }
                applied.add(action.projectUri());
                invalidated.add(action.projectUri());
            }
        }

        List<Map<String, Object>> effectiveEntries = new ArrayList<>();
        for (DesiredProject desired : parsed.projects()) {
            IJavaProject project = findProject(desired.projectUri());
            if (project == null) continue;
            for (Map<String, Object> entry : describe(project)) {
                Map<String, Object> effective = new LinkedHashMap<>(entry);
                effective.put("project", desired.projectUri());
                effectiveEntries.add(effective);
            }
        }
        return reconciliationResult(request, applied, unchanged, invalidated, cleared, missingProjects,
            missingJars, effectiveEntries, verification);
    }

    private static ParsedRequest parseRequest(Map<?, ?> request) {
        List<KotlinAbiSnapshotStore.Entry> durableEntries = new ArrayList<>();
        List<DesiredProject> projects = new ArrayList<>();
        Object rawProjects = request.get("projects");
        if (rawProjects instanceof List<?> values) {
            for (Object raw : values) {
                if (!(raw instanceof Map<?, ?> value)) continue;
                String projectUri = String.valueOf(value.get("project"));
                List<Map<?, ?>> entries = new ArrayList<>();
                Object rawEntries = value.get("entries");
                if (rawEntries instanceof List<?> entryValues) {
                    for (Object rawEntry : entryValues) {
                        if (!(rawEntry instanceof Map<?, ?> entry)) continue;
                        entries.add(entry);
                        durableEntries.add(new KotlinAbiSnapshotStore.Entry(
                            projectUri,
                            requestValue(entry, "jar"),
                            requestValue(entry, "contentHash"),
                            entry.containsKey("expectedFqns") ? stringList(entry.get("expectedFqns")) : null,
                            Boolean.TRUE.equals(entry.get("test")),
                            requestValue(entry, "patchModule")
                        ));
                    }
                }
                projects.add(new DesiredProject(projectUri, List.copyOf(entries)));
            }
        }
        return new ParsedRequest(List.copyOf(projects), List.copyOf(durableEntries),
            numberValue(request, "metadataVersion") >= KotlinAbiSnapshotStore.METADATA_VERSION
                && durableEntries.stream().allMatch(entry -> entry.contentHash() != null
                    && !entry.contentHash().isBlank() && entry.expectedFqns() != null));
    }

    private static Map<String, Object> reconciliationResult(Map<?, ?> request, List<String> applied,
            List<String> unchanged, List<String> invalidated, List<String> cleared, List<String> missingProjects,
            List<String> missingJars, List<Map<String, Object>> effectiveEntries,
            KotlinAbiResolutionVerifier.VerificationResult verification) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("metadataVersion", numberValue(request, "metadataVersion"));
        result.put("verificationMetadataComplete", requestMetadataComplete(request));
        result.put("sessionToken", KotlinAbiClasspathStamp.sessionToken());
        result.put("generationId", numberValue(request, "generationId"));
        result.put("revision", requestValue(request, "revision"));
        result.put("appliedProjects", applied);
        result.put("unchangedProjects", unchanged);
        result.put("invalidatedProjects", invalidated);
        result.put("clearedProjects", cleared);
        result.put("missingProjects", missingProjects);
        result.put("missingJars", missingJars);
        result.put("effectiveEntries", effectiveEntries);
        result.put("resolvedTypeCount", verification.resolvedTypeCount());
        result.put("unresolvedTypes", verification.unresolvedTypes());
        result.put("incompatibleClassFiles", verification.incompatibleClassFiles());
        result.put("projectVerification", verification.projects());
        result.put("workspaceProjects", KotlinAbiWorkspaceProjectInventory.describe());
        return result;
    }

    private static KotlinAbiResolutionVerifier.VerificationResult emptyVerification() {
        return new KotlinAbiResolutionVerifier.VerificationResult(0, List.of(), List.of(), List.of());
    }

    private static IClasspathEntry[] parseEntries(Object rawEntries) {
        List<IClasspathEntry> entries = new ArrayList<>();
        if (rawEntries instanceof List<?> values) {
            for (Object raw : values) if (raw instanceof Map<?, ?> value) entries.add(toEntry(value));
        }
        return entries.toArray(IClasspathEntry[]::new);
    }

    private static IClasspathEntry toEntry(Map<?, ?> value) {
        var attributes = new ArrayList<IClasspathAttribute>();
        if (Boolean.TRUE.equals(value.get("test"))) {
            attributes.add(JavaCore.newClasspathAttribute(IClasspathAttribute.TEST, "true"));
        }
        if (!requestValue(value, "patchModule").isBlank()) {
            attributes.add(JavaCore.newClasspathAttribute(IClasspathAttribute.PATCH_MODULE, requestValue(value, "patchModule")));
        }
        return JavaCore.newLibraryEntry(org.eclipse.core.runtime.Path.fromOSString(requestValue(value, "jar")),
            null, null, new org.eclipse.jdt.core.IAccessRule[0],
            attributes.toArray(IClasspathAttribute[]::new), false);
    }

    private static IJavaProject findProject(String reference) {
        for (IProject project : ResourcesPlugin.getWorkspace().getRoot().getProjects()) {
            if (!project.isAccessible()) continue;
            if (project.getName().equals(reference) || sameLocation(project, reference)) return JavaCore.create(project);
        }
        return null;
    }

    private static boolean sameLocation(IProject project, String reference) {
        try {
            URI projectUri = project.getLocationURI();
            URI requestedUri = URI.create(reference);
            return projectUri != null && "file".equalsIgnoreCase(requestedUri.getScheme())
                && Paths.get(projectUri).normalize().equals(Paths.get(requestedUri).normalize());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static List<Map<String, Object>> describe(IJavaProject project) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (IClasspathEntry entry : KotlinAbiClasspathContainer.get(project)) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("jar", entry.getPath().toOSString());
            for (IClasspathAttribute attribute : entry.getExtraAttributes()) {
                value.put(attribute.getName(), attribute.getValue());
            }
            result.add(value);
        }
        return result;
    }

    private static String requestValue(Map<?, ?> request, String key) {
        Object value = request.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static long numberValue(Map<?, ?> request, String key) {
        Object value = request.get(key);
        // JDT LS/Gson materializes numeric values in generic command arguments as Number instances.
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(value == null ? "" : String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static boolean requestMetadataComplete(Map<?, ?> request) {
        if (numberValue(request, "metadataVersion") < KotlinAbiSnapshotStore.METADATA_VERSION) return false;
        Object rawProjects = request.get("projects");
        if (!(rawProjects instanceof List<?> projects)) return false;
        for (Object rawProject : projects) {
            if (!(rawProject instanceof Map<?, ?> project)) return false;
            Object rawEntries = project.get("entries");
            if (!(rawEntries instanceof List<?> entries)) return false;
            for (Object rawEntry : entries) {
                if (!(rawEntry instanceof Map<?, ?> entry)
                        || requestValue(entry, "contentHash").isBlank()
                        || !entry.containsKey("expectedFqns")
                        || !(entry.get("expectedFqns") instanceof List<?>)) return false;
            }
        }
        return true;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> values)) return List.of();
        return values.stream().map(String::valueOf).filter(item -> !item.isBlank()).distinct().sorted().toList();
    }

    private record ParsedRequest(List<DesiredProject> projects, List<KotlinAbiSnapshotStore.Entry> durableEntries,
            boolean metadataComplete) {}
    private record DesiredProject(String projectUri, List<Map<?, ?>> entries) {}
    private record ContainerAction(String projectUri, IJavaProject project, IClasspathEntry[] entries,
            String fingerprintKey, String fingerprint, boolean clear) {}
}
