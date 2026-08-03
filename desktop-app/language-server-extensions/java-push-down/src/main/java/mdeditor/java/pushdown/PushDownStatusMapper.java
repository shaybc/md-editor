package mdeditor.java.pushdown;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.eclipse.ltk.core.refactoring.RefactoringStatus;
import org.eclipse.ltk.core.refactoring.RefactoringStatusEntry;

/** Converts Eclipse refactoring diagnostics to stable JSON command results. */
final class PushDownStatusMapper {
    private PushDownStatusMapper() {}

    static List<Map<String, Object>> describe(RefactoringStatus status) {
        List<Map<String, Object>> problems = new ArrayList<>();
        for (RefactoringStatusEntry entry : status.getEntries()) {
            problems.add(Map.of("severity", severity(entry.getSeverity()), "message", entry.getMessage()));
        }
        return problems;
    }

    private static String severity(int severity) {
        return switch (severity) {
            case RefactoringStatus.FATAL -> "fatal";
            case RefactoringStatus.ERROR -> "error";
            case RefactoringStatus.WARNING -> "warning";
            default -> "info";
        };
    }
}
