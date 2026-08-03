package mdeditor.java.pushdown;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.IField;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.corext.refactoring.structure.PushDownRefactoringProcessor;
import org.eclipse.jdt.internal.corext.refactoring.structure.PushDownRefactoringProcessor.MemberActionInfo;
import org.eclipse.jdt.ls.core.internal.ChangeUtil;
import org.eclipse.lsp4j.WorkspaceEdit;
import org.eclipse.ltk.core.refactoring.RefactoringStatus;
import org.eclipse.ltk.core.refactoring.participants.ProcessorBasedRefactoring;

/** Configures Eclipse's Push Down processor and produces preview workspace edits. */
final class PushDownRefactoringService {
    MapResult preview(PushDownRequest request, IProgressMonitor monitor) throws Exception {
        Prepared prepared = prepare(request, monitor);
        if (!prepared.status().hasError()) prepared.status().merge(prepared.refactoring().checkFinalConditions(monitor));
        WorkspaceEdit edit = null;
        if (!prepared.status().hasError()) edit = ChangeUtil.convertToWorkspaceEdit(prepared.refactoring().createChange(monitor));
        return new MapResult(edit, PushDownStatusMapper.describe(prepared.status()));
    }

    static Prepared prepare(PushDownRequest request, IProgressMonitor monitor) throws Exception {
        PushDownContextResolver.Context context = PushDownContextResolver.resolve(request);
        List<IMember> activeMembers = new ArrayList<>();
        request.actions().forEach((handle, action) -> {
            if ("none".equals(action)) return;
            IJavaElement element = JavaCore.create(handle);
            if ((element instanceof IField || element instanceof IMethod)
                    && context.declaringType().equals(((IMember) element).getDeclaringType())) {
                activeMembers.add((IMember) element);
            }
        });
        if (activeMembers.isEmpty()) throw new IllegalArgumentException("Select at least one member to push down.");
        PushDownRefactoringProcessor processor = new PushDownRefactoringProcessor(activeMembers.toArray(IMember[]::new));
        ProcessorBasedRefactoring refactoring = new ProcessorBasedRefactoring(processor);
        RefactoringStatus status = refactoring.checkInitialConditions(monitor);
        if (!status.hasFatalError()) applyActions(processor, request.actions());
        return new Prepared(processor, refactoring, status);
    }

    private static void applyActions(PushDownRefactoringProcessor processor, Map<String, String> actions) {
        for (MemberActionInfo info : processor.getMemberActionInfos()) {
            String requested = actions.getOrDefault(info.getMember().getHandleIdentifier(), "none");
            int action = PushDownMemberMapper.actionCode(requested);
            boolean available = Arrays.stream(info.getAvailableActions()).anyMatch(candidate -> candidate == action);
            if (!available) {
                throw new IllegalArgumentException("Action " + requested + " is not available for "
                    + info.getMember().getElementName() + ".");
            }
            info.setAction(action);
        }
    }

    record Prepared(PushDownRefactoringProcessor processor, ProcessorBasedRefactoring refactoring, RefactoringStatus status) {}
    record MapResult(WorkspaceEdit edit, List<Map<String, Object>> problems) {}
}
