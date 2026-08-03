package mdeditor.kotlin.abi;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.JavaCore;

/** Owns process-scoped Kotlin ABI classpath stamps and stable project fingerprints. */
public final class KotlinAbiClasspathStamp {
    static final String SESSION_ATTRIBUTE = "mdeditor.kotlin.abi.session";
    static final String CONTENT_HASH_ATTRIBUTE = "mdeditor.kotlin.abi.contentHash";
    private static final String SESSION_TOKEN = UUID.randomUUID().toString();

    private KotlinAbiClasspathStamp() {}

    /** Stamp one ABI entry with the current JDT process and its Kotlin ABI content hash. */
    public static IClasspathEntry stamp(IClasspathEntry entry, String contentHash) {
        return stamp(entry, contentHash, SESSION_TOKEN);
    }

    /** Return a stable fingerprint for the exact effective entries assigned to one project. */
    public static String fingerprint(IClasspathEntry[] entries) {
        return Arrays.stream(entries)
            .map(KotlinAbiClasspathStamp::entryFingerprint)
            .sorted()
            .reduce((left, right) -> left + "\n" + right)
            .orElse("");
    }

    /** Return whether every effective entry belongs to this JDT process. */
    public static boolean isOwnedByCurrentSession(IClasspathEntry[] entries) {
        return entries.length > 0 && Arrays.stream(entries).allMatch(KotlinAbiClasspathStamp::isOwnedByCurrentSession);
    }

    /** Return the process identity used to correlate reconciliation lifecycle records. */
    public static String sessionToken() {
        return SESSION_TOKEN;
    }

    static IClasspathEntry stamp(IClasspathEntry entry, String contentHash, String sessionToken) {
        Map<String, String> existing = new LinkedHashMap<>();
        for (IClasspathAttribute attribute : entry.getExtraAttributes()) {
            existing.put(attribute.getName(), attribute.getValue());
        }
        List<IClasspathAttribute> attributes = stampedAttributeValues(existing, contentHash, sessionToken).entrySet().stream()
            .map(attribute -> JavaCore.newClasspathAttribute(attribute.getKey(), attribute.getValue()))
            .toList();
        return JavaCore.newLibraryEntry(entry.getPath(), entry.getSourceAttachmentPath(),
            entry.getSourceAttachmentRootPath(), entry.getAccessRules(),
            attributes.toArray(IClasspathAttribute[]::new), entry.isExported());
    }

    static Map<String, String> stampedAttributeValues(Map<String, String> existing, String contentHash, String sessionToken) {
        Map<String, String> attributes = new LinkedHashMap<>(existing);
        attributes.put(SESSION_ATTRIBUTE, value(sessionToken));
        attributes.put(CONTENT_HASH_ATTRIBUTE, value(contentHash));
        return attributes;
    }

    static String fingerprint(String path, Map<String, String> attributes) {
        String values = attributes.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(attribute -> attribute.getKey() + "=" + attribute.getValue())
            .reduce((left, right) -> left + ";" + right)
            .orElse("");
        return path + "|" + values;
    }

    private static String entryFingerprint(IClasspathEntry entry) {
        Map<String, String> attributes = Arrays.stream(entry.getExtraAttributes())
            .sorted(Comparator.comparing(IClasspathAttribute::getName).thenComparing(IClasspathAttribute::getValue))
            .collect(java.util.stream.Collectors.toMap(IClasspathAttribute::getName, IClasspathAttribute::getValue,
                (left, right) -> right, LinkedHashMap::new));
        return fingerprint(entry.getPath().toPortableString(), attributes);
    }

    private static boolean isOwnedByCurrentSession(IClasspathEntry entry) {
        return Arrays.stream(entry.getExtraAttributes())
            .anyMatch(attribute -> SESSION_ATTRIBUTE.equals(attribute.getName())
                && SESSION_TOKEN.equals(attribute.getValue()));
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
