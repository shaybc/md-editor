package mdeditor.java.pushdown;

import java.util.LinkedHashMap;
import java.util.Map;

/** Immutable command values supplied by the MD-Editor Push Down dialog. */
record PushDownRequest(String uri, int selectionStart, int selectionEnd, Map<String, String> actions) {
    static PushDownRequest from(Map<?, ?> value) {
        Map<String, String> actions = new LinkedHashMap<>();
        if (value.get("actions") instanceof Map<?, ?> rawActions) {
            rawActions.forEach((key, action) -> actions.put(String.valueOf(key), String.valueOf(action)));
        }
        return new PushDownRequest(text(value, "uri"), number(value, "selectionStart"),
            number(value, "selectionEnd"), actions);
    }

    private static String text(Map<?, ?> value, String key) {
        return value.get(key) == null ? "" : String.valueOf(value.get(key));
    }

    private static int number(Map<?, ?> value, String key) {
        return value.get(key) instanceof Number number ? number.intValue() : 0;
    }
}
