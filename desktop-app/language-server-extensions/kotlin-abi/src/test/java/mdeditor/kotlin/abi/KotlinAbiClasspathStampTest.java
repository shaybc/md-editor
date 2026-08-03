package mdeditor.kotlin.abi;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.LinkedHashMap;
import java.util.Map;

import org.eclipse.jdt.core.IClasspathAttribute;
import org.junit.jupiter.api.Test;

/** Verifies the pure process and content stamp values used by JDT classpath entries. */
final class KotlinAbiClasspathStampTest {
    @Test
    void identicalSessionAndContentProduceTheSameFingerprint() {
        Map<String, String> first = stampValues("hash-1", "session-1");
        Map<String, String> second = stampValues("hash-1", "session-1");

        assertEquals(KotlinAbiClasspathStamp.fingerprint("C:/cache/module-abi.jar", first),
            KotlinAbiClasspathStamp.fingerprint("C:/cache/module-abi.jar", second));
    }

    @Test
    void newSessionOrContentProducesADifferentFingerprint() {
        String original = KotlinAbiClasspathStamp.fingerprint("C:/cache/module-abi.jar",
            stampValues("hash-1", "session-1"));

        assertNotEquals(original, KotlinAbiClasspathStamp.fingerprint("C:/cache/module-abi.jar",
            stampValues("hash-1", "session-2")));
        assertNotEquals(original, KotlinAbiClasspathStamp.fingerprint("C:/cache/module-abi.jar",
            stampValues("hash-2", "session-1")));
    }

    @Test
    void stampingPreservesTestAndPatchModuleAttributes() {
        Map<String, String> attributes = stampValues("hash-1", "session-1");

        assertEquals("true", attributes.get(IClasspathAttribute.TEST));
        assertEquals("module.name", attributes.get(IClasspathAttribute.PATCH_MODULE));
        assertEquals("session-1", attributes.get(KotlinAbiClasspathStamp.SESSION_ATTRIBUTE));
        assertEquals("hash-1", attributes.get(KotlinAbiClasspathStamp.CONTENT_HASH_ATTRIBUTE));
    }

    private static Map<String, String> stampValues(String contentHash, String sessionToken) {
        Map<String, String> existing = new LinkedHashMap<>();
        existing.put(IClasspathAttribute.TEST, "true");
        existing.put(IClasspathAttribute.PATCH_MODULE, "module.name");
        return KotlinAbiClasspathStamp.stampedAttributeValues(existing, contentHash, sessionToken);
    }
}