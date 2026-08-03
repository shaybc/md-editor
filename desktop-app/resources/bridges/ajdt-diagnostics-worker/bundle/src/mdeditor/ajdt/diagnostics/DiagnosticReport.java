/* Atomic LSP-style serialization of AJDT-owned Eclipse problem markers. */
package mdeditor.ajdt.diagnostics;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;

/** Converts one completed AJDT build into publications consumed by MD-Editor. */
public final class DiagnosticReport {
    private DiagnosticReport() {
    }

    /** Capture only markers owned by the headless AJDT compiler bridge. */
    public static String capture(IProject project, AspectjGradleModel model) throws Exception {
        Map<String, List<Diagnostic>> diagnosticsByUri = new LinkedHashMap<>();
        for (IMarker marker : project.findMarkers(IMarker.PROBLEM, true, IProject.DEPTH_INFINITE)) {
            if (!HeadlessProblemMarkerMessageHandler.owns(marker)) continue;
            String relativePath = marker.getResource().getProjectRelativePath().toString();
            Path originalPath = model.resolveOriginalPath(relativePath);
            String uri = originalPath.toUri().toASCIIString();
            int line = Math.max(0, marker.getAttribute(IMarker.LINE_NUMBER, 1) - 1);
            int character = resolveCharacter(originalPath, line, marker.getAttribute(IMarker.CHAR_START, -1));
            diagnosticsByUri.computeIfAbsent(uri, ignored -> new ArrayList<>()).add(new Diagnostic(
                severity(marker.getAttribute(IMarker.SEVERITY, IMarker.SEVERITY_INFO)),
                marker.getAttribute(IMarker.MESSAGE, "Unknown AspectJ problem"), line, character));
        }
        return toJson(diagnosticsByUri);
    }

    private static int resolveCharacter(Path sourcePath, int line, int characterOffset) {
        if (characterOffset < 0 || !Files.isRegularFile(sourcePath)) return 0;
        try {
            String source = Files.readString(sourcePath, StandardCharsets.UTF_8);
            int lineStart = 0;
            for (int currentLine = 0; currentLine < line && lineStart < source.length(); currentLine++) {
                int newline = source.indexOf('\n', lineStart);
                if (newline < 0) return 0;
                lineStart = newline + 1;
            }
            return Math.max(0, characterOffset - lineStart);
        } catch (IOException ignored) {
            return 0;
        }
    }

    private static int severity(int markerSeverity) {
        if (markerSeverity == IMarker.SEVERITY_ERROR) return 1;
        if (markerSeverity == IMarker.SEVERITY_WARNING) return 2;
        return 3;
    }

    private static String toJson(Map<String, List<Diagnostic>> diagnosticsByUri) {
        StringBuilder json = new StringBuilder("{\"publications\":[");
        boolean firstPublication = true;
        for (Map.Entry<String, List<Diagnostic>> entry : diagnosticsByUri.entrySet()) {
            if (!firstPublication) json.append(',');
            firstPublication = false;
            json.append("{\"uri\":\"").append(escape(entry.getKey())).append("\",\"diagnostics\":[");
            boolean firstDiagnostic = true;
            for (Diagnostic diagnostic : entry.getValue()) {
                if (!firstDiagnostic) json.append(',');
                firstDiagnostic = false;
                json.append(diagnostic.toJson());
            }
            json.append("]}");
        }
        return json.append("]}").toString();
    }

    private static String escape(String value) {
        return String.valueOf(value).replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t");
    }

    private record Diagnostic(int severity, String message, int line, int character) {
        private String toJson() {
            return "{\"severity\":" + severity + ",\"message\":\"" + escape(message)
                + "\",\"source\":\"ajdt\",\"range\":{\"start\":{\"line\":" + line
                + ",\"character\":" + character + "},\"end\":{\"line\":" + line
                + ",\"character\":" + (character + 1) + "}}}";
        }
    }
}
