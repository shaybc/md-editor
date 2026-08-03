package mdeditor.java.pullup;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Immutable command values supplied by the MD-Editor Pull Up dialog. */
record PullUpRequest(String uri, int selectionStart, int selectionEnd, String destinationHandle,
        Map<String, String> actions, List<String> deletedMethodHandles, boolean replaceWherePossible,
        boolean replaceInstanceof, boolean createMethodStubs) {

    static PullUpRequest from(Map<?, ?> value) {
        Map<String, String> actions = new LinkedHashMap<>();
        if (value.get("actions") instanceof Map<?, ?> rawActions) {
            rawActions.forEach((key, action) -> actions.put(String.valueOf(key), String.valueOf(action)));
        }
        List<String> deleted = value.get("deletedMethodHandles") instanceof List<?> rawDeleted
            ? rawDeleted.stream().map(String::valueOf).toList() : List.of();
        return new PullUpRequest(text(value, "uri"), number(value, "selectionStart"), number(value, "selectionEnd"),
            text(value, "destinationHandle"), actions, deleted, flag(value, "replaceWherePossible", true),
            flag(value, "replaceInstanceof", false), flag(value, "createMethodStubs", true));
    }

    private static String text(Map<?, ?> value, String key) {
        return value.get(key) == null ? "" : String.valueOf(value.get(key));
    }

    private static int number(Map<?, ?> value, String key) {
        return value.get(key) instanceof Number number ? number.intValue() : 0;
    }

    private static boolean flag(Map<?, ?> value, String key, boolean fallback) {
        return value.containsKey(key) ? Boolean.TRUE.equals(value.get(key)) : fallback;
    }
}
