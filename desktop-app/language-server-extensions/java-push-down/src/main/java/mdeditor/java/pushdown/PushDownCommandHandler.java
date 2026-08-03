package mdeditor.java.pushdown;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

/** Routes MD-Editor Push Down commands to stateless Eclipse refactoring services. */
public final class PushDownCommandHandler implements IDelegateCommandHandler {
    private final PushDownAnalysisService analysis = new PushDownAnalysisService();
    private final PushDownRefactoringService refactoring = new PushDownRefactoringService();

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        Map<?, ?> values = arguments.isEmpty() || !(arguments.get(0) instanceof Map<?, ?> map) ? Map.of() : map;
        PushDownRequest request = PushDownRequest.from(values);
        if ("mdeditor.java.pushDown.check".equals(commandId)) return analysis.check(request, monitor);
        if ("mdeditor.java.pushDown.resolve".equals(commandId)) return analysis.resolve(request, monitor);
        if ("mdeditor.java.pushDown.preview".equals(commandId)) {
            PushDownRefactoringService.MapResult preview = refactoring.preview(request, monitor);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("edit", preview.edit());
            result.put("problems", preview.problems());
            return result;
        }
        throw new IllegalArgumentException("Unsupported command: " + commandId);
    }
}
