package mdeditor.java.pushdown;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.internal.corext.refactoring.structure.PushDownRefactoringProcessor;
import org.eclipse.ltk.core.refactoring.RefactoringStatus;
import org.eclipse.ltk.core.refactoring.participants.ProcessorBasedRefactoring;

/** Discovers Push Down members and resolves required member dependencies. */
final class PushDownAnalysisService {
    Map<String, Object> check(PushDownRequest request, IProgressMonitor monitor) throws Exception {
        PushDownContextResolver.Context context = PushDownContextResolver.resolve(request);
        PushDownRefactoringProcessor processor = new PushDownRefactoringProcessor(context.selectedMembers());
        RefactoringStatus status = new ProcessorBasedRefactoring(processor).checkInitialConditions(monitor);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", !status.hasError());
        result.put("sourceType", context.declaringType().getFullyQualifiedName());
        result.put("members", status.hasFatalError() ? java.util.List.of()
            : Arrays.stream(processor.getMemberActionInfos()).map(PushDownMemberMapper::describe).toList());
        result.put("problems", PushDownStatusMapper.describe(status));
        return result;
    }

    Map<String, Object> resolve(PushDownRequest request, IProgressMonitor monitor) throws Exception {
        PushDownRefactoringService.Prepared prepared = PushDownRefactoringService.prepare(request, monitor);
        if (!prepared.status().hasError()) prepared.processor().computeAdditionalRequiredMembersToPushDown(monitor);
        return Map.of(
            "members", prepared.status().hasFatalError() ? java.util.List.of()
                : Arrays.stream(prepared.processor().getMemberActionInfos()).map(PushDownMemberMapper::describe).toList(),
            "problems", PushDownStatusMapper.describe(prepared.status())
        );
    }
}
