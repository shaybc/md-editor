import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class RegexTesterRunner {
    private static final int MAX_MATCHES = 10_000;

    public static void main(String[] args) throws Exception {
        System.out.println("READY\t" + encode(System.getProperty("java.version", "unknown")));
        System.out.flush();
        try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = input.readLine()) != null) {
                if (line.isEmpty()) continue;
                String[] fields = line.split("\t", -1);
                if (fields.length < 8 || !"REQ".equals(fields[0])) continue;
                String requestId = fields[1];
                try {
                    Result result = evaluate(
                        requestId,
                        fields[2],
                        fields[3],
                        decode(fields[4]),
                        decode(fields[5]),
                        decode(fields[6])
                    );
                    System.out.println("RES\t" + requestId + "\t" + encode(result.toJson()));
                } catch (Throwable error) {
                    System.out.println("ERR\t" + requestId + "\t" + encode(error.getMessage() == null ? error.toString() : error.getMessage()));
                }
                System.out.flush();
            }
        }
    }

    private static Result evaluate(String requestId, String mode, String flags, String patternText, String testText, String replacement) {
        long started = System.nanoTime();
        int patternFlags = 0;
        if (flags.contains("i")) patternFlags |= Pattern.CASE_INSENSITIVE;
        if (flags.contains("m")) patternFlags |= Pattern.MULTILINE;
        if (flags.contains("s")) patternFlags |= Pattern.DOTALL;
        if (flags.contains("u")) patternFlags |= Pattern.UNICODE_CASE;
        if (flags.contains("U")) patternFlags |= Pattern.UNICODE_CHARACTER_CLASS;
        if (flags.contains("x")) patternFlags |= Pattern.COMMENTS;
        if (flags.contains("d")) patternFlags |= Pattern.UNIX_LINES;
        Pattern pattern = Pattern.compile(patternText, patternFlags);
        Matcher matcher = pattern.matcher(testText);
        Map<Integer, String> namesByIndex = findNamedGroups(patternText);
        List<MatchResult> matches = new ArrayList<>();
        boolean global = flags.contains("g");
        boolean truncated = false;
        while (matcher.find()) {
            List<GroupResult> groups = new ArrayList<>();
            for (int groupIndex = 1; groupIndex <= matcher.groupCount(); groupIndex++) {
                int start = matcher.start(groupIndex);
                int end = matcher.end(groupIndex);
                groups.add(new GroupResult(groupIndex, namesByIndex.get(groupIndex), start, end, start >= 0 ? matcher.group(groupIndex) : "", start >= 0));
            }
            matches.add(new MatchResult(matches.size(), matcher.start(), matcher.end(), matcher.group(), groups));
            if (!global) break;
            if (matches.size() >= MAX_MATCHES) {
                truncated = matcher.find();
                break;
            }
        }
        String replacementOutput = "";
        List<ReplacementRange> replacementRanges = new ArrayList<>();
        if ("replace".equals(mode)) {
            ReplacementResult replacementResult = replaceWithRanges(pattern, testText, replacement, global);
            replacementOutput = replacementResult.output();
            replacementRanges = replacementResult.ranges();
        }
        double elapsedMs = (System.nanoTime() - started) / 1_000_000.0;
        return new Result(requestId, elapsedMs, matches, replacementOutput, replacementRanges, truncated);
    }

    private static ReplacementResult replaceWithRanges(Pattern pattern, String testText, String replacement, boolean global) {
        Matcher replacementMatcher = pattern.matcher(testText);
        String replacementOutput = global ? replacementMatcher.replaceAll(replacement) : replacementMatcher.replaceFirst(replacement);
        String markerSource = testText + replacement;
        int markerIndex = 0;
        String startMarker;
        String endMarker;
        do {
            startMarker = "\uE000REGEX_TESTER_START_" + markerIndex + "\uE001";
            endMarker = "\uE000REGEX_TESTER_END_" + markerIndex + "\uE001";
            markerIndex++;
        } while (markerSource.contains(startMarker) || markerSource.contains(endMarker));

        Matcher markedMatcher = pattern.matcher(testText);
        String markedReplacement = startMarker + replacement + endMarker;
        String markedOutput = global ? markedMatcher.replaceAll(markedReplacement) : markedMatcher.replaceFirst(markedReplacement);
        List<ReplacementRange> ranges = new ArrayList<>();
        StringBuilder strippedOutput = new StringBuilder();
        int cursor = 0;
        while (cursor < markedOutput.length()) {
            int markerStart = markedOutput.indexOf(startMarker, cursor);
            if (markerStart < 0) {
                strippedOutput.append(markedOutput, cursor, markedOutput.length());
                break;
            }
            strippedOutput.append(markedOutput, cursor, markerStart);
            int valueStart = markerStart + startMarker.length();
            int markerEnd = markedOutput.indexOf(endMarker, valueStart);
            if (markerEnd < 0) break;
            int start = strippedOutput.length();
            strippedOutput.append(markedOutput, valueStart, markerEnd);
            ranges.add(new ReplacementRange(ranges.size(), start, strippedOutput.length()));
            cursor = markerEnd + endMarker.length();
        }
        return new ReplacementResult(replacementOutput, ranges);
    }

    private static Map<Integer, String> findNamedGroups(String pattern) {
        Map<Integer, String> names = new LinkedHashMap<>();
        int groupIndex = 0;
        boolean escaped = false;
        boolean inClass = false;
        for (int index = 0; index < pattern.length(); index++) {
            char character = pattern.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character == '\\') {
                escaped = true;
                continue;
            }
            if (character == '[') inClass = true;
            else if (character == ']') inClass = false;
            else if (character == '(' && !inClass) {
                if (index + 2 < pattern.length() && pattern.charAt(index + 1) == '?' && pattern.charAt(index + 2) == '<') {
                    if (index + 3 < pattern.length() && (pattern.charAt(index + 3) == '=' || pattern.charAt(index + 3) == '!')) continue;
                    int end = pattern.indexOf('>', index + 3);
                    groupIndex++;
                    if (end > index) names.put(groupIndex, pattern.substring(index + 3, end));
                } else if (index + 1 >= pattern.length() || pattern.charAt(index + 1) != '?') {
                    groupIndex++;
                }
            }
        }
        return names;
    }

    private static String decode(String value) {
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String encode(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String quote(String value) {
        if (value == null) return "null";
        StringBuilder result = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '\\': result.append("\\\\"); break;
                case '"': result.append("\\\""); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    if (character < 0x20) result.append(String.format("\\u%04x", (int) character));
                    else result.append(character);
            }
        }
        return result.append('"').toString();
    }

    private record GroupResult(int index, String name, int start, int end, String value, boolean matched) {
        String toJson() {
            return "{\"index\":" + index + ",\"name\":" + quote(name) + ",\"start\":" + start + ",\"end\":" + end
                + ",\"value\":" + quote(value) + ",\"matched\":" + matched + "}";
        }
    }

    private record MatchResult(int index, int start, int end, String value, List<GroupResult> groups) {
        String toJson() {
            return "{\"index\":" + index + ",\"start\":" + start + ",\"end\":" + end + ",\"value\":" + quote(value)
                + ",\"groups\":[" + groups.stream().map(GroupResult::toJson).reduce((left, right) -> left + "," + right).orElse("") + "]}";
        }
    }

    private record ReplacementRange(int index, int start, int end) {
        String toJson() {
            return "{\"index\":" + index + ",\"start\":" + start + ",\"end\":" + end + "}";
        }
    }

    private record ReplacementResult(String output, List<ReplacementRange> ranges) {}

    private record Result(String requestId, double elapsedMs, List<MatchResult> matches, String replacementOutput,
                          List<ReplacementRange> replacementRanges, boolean truncated) {
        String toJson() {
            return "{\"requestId\":" + quote(requestId) + ",\"engine\":\"java\",\"ok\":true,\"elapsedMs\":" + elapsedMs
                + ",\"matches\":[" + matches.stream().map(MatchResult::toJson).reduce((left, right) -> left + "," + right).orElse("")
                + "],\"replacementOutput\":" + quote(replacementOutput) + ",\"replacementRanges\":["
                + replacementRanges.stream().map(ReplacementRange::toJson).reduce((left, right) -> left + "," + right).orElse("")
                + "],\"truncated\":" + truncated + ",\"error\":null}";
        }
    }
}
