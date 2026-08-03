package mdeditor.kotlin.abi;

import java.io.DataInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.jar.JarFile;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.ElementChangedEvent;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaElementDelta;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;

/** Verifies that applied Kotlin ABI artifacts are physically readable and resolvable by JDT. */
public final class KotlinAbiResolutionVerifier {
    private static final long DELTA_WAIT_MS = 2_000;
    private static final long RESOLUTION_WAIT_MS = 10_000;
    private static final long POLL_INTERVAL_MS = 50;

    /** One ABI artifact and its independently source-derived Java-visible type expectations. */
    public record EntryExpectation(String jar, List<String> expectedFqns) {
        public EntryExpectation {
            expectedFqns = List.copyOf(expectedFqns == null ? List.of() : expectedFqns);
        }
    }

    /** All ABI expectations assigned to one Eclipse Java project. */
    public record ProjectExpectation(String projectUri, IJavaProject project, List<EntryExpectation> entries,
            String expectedContainerFingerprint) {
        public ProjectExpectation {
            entries = List.copyOf(entries == null ? List.of() : entries);
        }
    }

    /** Result returned to the renderer before Kotlin ABI readiness may be released. */
    public record VerificationResult(int resolvedTypeCount, List<Map<String, Object>> unresolvedTypes,
            List<Map<String, Object>> incompatibleClassFiles, List<Map<String, Object>> projects) {}

    private record DeltaObservation(boolean observed, long elapsedMs) {}

    private KotlinAbiResolutionVerifier() {}

    /** Register before classpath application so a fast Java-model delta cannot be missed. */
    public static DeltaAwaiter watch(List<IJavaProject> changedProjects) {
        return new DeltaAwaiter(changedProjects);
    }

    /** Refresh external archives and causally wait until each stamped container and expected type resolves. */
    public static VerificationResult verify(List<ProjectExpectation> expectations, DeltaAwaiter deltaAwaiter,
            IProgressMonitor monitor) throws Exception {
        Map<String, DeltaObservation> deltaObservations = deltaAwaiter.awaitAll();
        for (ProjectExpectation expectation : expectations) {
            // Revision JAR paths are immutable and unique. Resolving the project classpath
            // after its matching delta is the supported JDT API that makes the new archive visible.
            expectation.project().getResolvedClasspath(true);
        }

        long deadline = System.currentTimeMillis() + RESOLUTION_WAIT_MS;
        ResolutionAttempt attempt;
        do {
            attempt = resolve(expectations, deltaObservations, monitor);
            if (attempt.confirmed()) break;
            if (!attempt.retryable()) break;
            if (monitor != null && monitor.isCanceled()) break;
            Thread.sleep(POLL_INTERVAL_MS);
        } while (System.currentTimeMillis() < deadline);
        return new VerificationResult(attempt.resolvedTypeCount(), attempt.unresolvedTypes(),
            attempt.incompatibleClassFiles(), attempt.projects());
    }

    private static ResolutionAttempt resolve(List<ProjectExpectation> expectations,
            Map<String, DeltaObservation> deltaObservations, IProgressMonitor monitor) throws Exception {
        int resolved = 0;
        List<Map<String, Object>> unresolved = new ArrayList<>();
        List<Map<String, Object>> incompatible = new ArrayList<>();
        List<Map<String, Object>> projectResults = new ArrayList<>();
        boolean retryable = false;
        boolean confirmed = true;
        for (ProjectExpectation expectation : expectations) {
            DeltaObservation delta = deltaObservations.getOrDefault(expectation.project().getElementName(),
                new DeltaObservation(false, DELTA_WAIT_MS));
            String effectiveFingerprint = KotlinAbiClasspathStamp.fingerprint(
                KotlinAbiClasspathContainer.get(expectation.project()));
            boolean containerConfirmed = expectation.expectedContainerFingerprint().equals(effectiveFingerprint);
            if (!containerConfirmed) {
                retryable = true;
                confirmed = false;
            }

            Set<String> expectedTypes = new LinkedHashSet<>();
            Set<String> unavailableTypes = new LinkedHashSet<>();
            int maximumClassFileMajor = 0;
            String compliance = expectation.project().getOption(JavaCore.COMPILER_COMPLIANCE, true);
            int complianceMajor = complianceClassFileMajor(compliance);
            for (EntryExpectation entry : expectation.entries()) {
                expectedTypes.addAll(entry.expectedFqns());
                for (String fqn : entry.expectedFqns()) {
                    int classFileMajor = classFileMajor(entry.jar(), fqn);
                    maximumClassFileMajor = Math.max(maximumClassFileMajor, classFileMajor);
                    if (classFileMajor == 0) {
                        unavailableTypes.add(fqn);
                        unresolved.add(value(expectation.projectUri(), fqn, entry.jar(),
                            0, compliance, "expected-class-missing-from-jar"));
                        confirmed = false;
                    }
                    if (classFileMajor > 0 && complianceMajor > 0 && classFileMajor > complianceMajor) {
                        incompatible.add(value(expectation.projectUri(), fqn, entry.jar(),
                            classFileMajor, compliance, "class-file-major-exceeds-project-compliance"));
                        confirmed = false;
                    }
                }
            }
            int projectResolved = 0;
            if (containerConfirmed) {
                for (String fqn : expectedTypes) {
                    if (unavailableTypes.contains(fqn)) continue;
                    if (expectation.project().findType(fqn, monitor) != null) {
                        resolved += 1;
                        projectResolved += 1;
                    } else {
                        retryable = true;
                        confirmed = false;
                        unresolved.add(value(expectation.projectUri(), fqn, "", 0, compliance, "type-not-resolved"));
                    }
                }
            }
            Map<String, Object> projectResult = new LinkedHashMap<>();
            projectResult.put("project", expectation.projectUri());
            projectResult.put("expectedTypeCount", expectedTypes.size());
            projectResult.put("resolvedTypeCount", projectResolved);
            projectResult.put("classFileMajor", maximumClassFileMajor);
            projectResult.put("projectCompliance", compliance);
            projectResult.put("classpathDeltaObserved", delta.observed());
            projectResult.put("classpathDeltaWaitMs", delta.elapsedMs());
            projectResult.put("expectedContainerFingerprint", expectation.expectedContainerFingerprint());
            projectResult.put("effectiveContainerFingerprint", effectiveFingerprint);
            projectResult.put("effectiveContainerConfirmed", containerConfirmed);
            projectResults.add(projectResult);
        }
        return new ResolutionAttempt(resolved, List.copyOf(unresolved), List.copyOf(incompatible),
            List.copyOf(projectResults), retryable, confirmed);
    }

    private static Map<String, Object> value(String projectUri, String fqn, String jar, int classFileMajor,
            String compliance, String reason) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("project", projectUri);
        value.put("fqn", fqn);
        value.put("jar", jar);
        value.put("classFileMajor", classFileMajor);
        value.put("projectCompliance", compliance);
        value.put("reason", reason);
        return value;
    }

    private static int classFileMajor(String jarPath, String fqn) {
        String entryName = fqn.replace('.', '/') + ".class";
        try (JarFile jar = new JarFile(jarPath)) {
            var entry = jar.getJarEntry(entryName);
            if (entry == null) return 0;
            try (DataInputStream input = new DataInputStream(jar.getInputStream(entry))) {
                if (input.readInt() != 0xCAFEBABE) return 0;
                input.readUnsignedShort();
                return input.readUnsignedShort();
            }
        } catch (IOException ignored) {
            return 0;
        }
    }

    private static int complianceClassFileMajor(String compliance) {
        try {
            String normalized = String.valueOf(compliance);
            int feature = normalized.startsWith("1.") ? Integer.parseInt(normalized.substring(2)) : Integer.parseInt(normalized);
            return feature + 44;
        } catch (RuntimeException ignored) {
            return 0;
        }
    }

    private record ResolutionAttempt(int resolvedTypeCount, List<Map<String, Object>> unresolvedTypes,
            List<Map<String, Object>> incompatibleClassFiles, List<Map<String, Object>> projects,
            boolean retryable, boolean confirmed) {}

    /** Project-correlated Java-model delta listener with bounded lifetime. */
    public static final class DeltaAwaiter implements AutoCloseable {
        private final Map<String, CountDownLatch> projectLatches = new LinkedHashMap<>();
        private final Map<String, Long> observedAtNanos = new ConcurrentHashMap<>();
        private final long startedAtNanos = System.nanoTime();
        private final org.eclipse.jdt.core.IElementChangedListener listener;

        private DeltaAwaiter(List<IJavaProject> projects) {
            projects.stream().map(IJavaProject::getElementName).distinct()
                .forEach(name -> projectLatches.put(name, new CountDownLatch(1)));
            this.listener = event -> observeClasspathDeltas(event.getDelta());
            JavaCore.addElementChangedListener(listener, ElementChangedEvent.POST_CHANGE);
        }

        private void observeClasspathDeltas(IJavaElementDelta delta) {
            if (delta == null) return;
            IJavaElement element = delta.getElement();
            if (element instanceof IJavaProject project
                    && (delta.getFlags() & IJavaElementDelta.F_CLASSPATH_CHANGED) != 0) {
                CountDownLatch latch = projectLatches.get(project.getElementName());
                if (latch != null) {
                    observedAtNanos.putIfAbsent(project.getElementName(), System.nanoTime());
                    latch.countDown();
                }
            }
            for (IJavaElementDelta child : delta.getAffectedChildren()) observeClasspathDeltas(child);
        }

        private Map<String, DeltaObservation> awaitAll() throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DELTA_WAIT_MS);
            for (CountDownLatch latch : projectLatches.values()) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) break;
                latch.await(remaining, TimeUnit.NANOSECONDS);
            }
            Map<String, DeltaObservation> observations = new LinkedHashMap<>();
            for (Map.Entry<String, CountDownLatch> entry : projectLatches.entrySet()) {
                Long observedAt = observedAtNanos.get(entry.getKey());
                long elapsedMs = observedAt == null ? DELTA_WAIT_MS
                    : TimeUnit.NANOSECONDS.toMillis(observedAt - startedAtNanos);
                observations.put(entry.getKey(), new DeltaObservation(observedAt != null, elapsedMs));
            }
            return observations;
        }

        @Override
        public void close() {
            JavaCore.removeElementChangedListener(listener);
        }
    }
}