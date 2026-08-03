package mdeditor.java.pullup;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

/** Routes MD-Editor Pull Up commands to stateless Eclipse refactoring services. */
public final class PullUpCommandHandler implements IDelegateCommandHandler {
    private final PullUpAnalysisService analysis = new PullUpAnalysisService();
    private final PullUpRefactoringService refactoring = new PullUpRefactoringService();

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        Map<?, ?> values = arguments.isEmpty() || !(arguments.get(0) instanceof Map<?, ?> map) ? Map.of() : map;
        PullUpRequest request = PullUpRequest.from(values);
        if ("mdeditor.java.pullUp.check".equals(commandId)) return analysis.check(request, monitor);
        if ("mdeditor.java.pullUp.resolve".equals(commandId)) return analysis.resolve(request, monitor);
        if ("mdeditor.java.pullUp.preview".equals(commandId)) {
            PullUpRefactoringService.MapResult preview = refactoring.preview(request, monitor);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("edit", preview.edit());
            result.put("problems", preview.problems());
            return result;
        }
        throw new IllegalArgumentException("Unsupported command: " + commandId);
    }
}
