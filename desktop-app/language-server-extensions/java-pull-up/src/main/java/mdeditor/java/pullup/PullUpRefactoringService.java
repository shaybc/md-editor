package mdeditor.java.pullup;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.corext.refactoring.structure.PullUpRefactoringProcessor;
import org.eclipse.jdt.ls.core.internal.ChangeUtil;
import org.eclipse.lsp4j.WorkspaceEdit;
import org.eclipse.ltk.core.refactoring.RefactoringStatus;
import org.eclipse.ltk.core.refactoring.participants.ProcessorBasedRefactoring;

/** Configures Eclipse's Pull Up processor and produces the preview workspace edit. */
final class PullUpRefactoringService {
    MapResult preview(PullUpRequest request, IProgressMonitor monitor) throws Exception {
        Prepared prepared = prepare(request, monitor);
        ProcessorBasedRefactoring refactoring = prepared.refactoring();
        if (!prepared.status().hasError()) prepared.status().merge(refactoring.checkFinalConditions(monitor));
        WorkspaceEdit edit = null;
        if (!prepared.status().hasError()) edit = ChangeUtil.convertToWorkspaceEdit(refactoring.createChange(monitor));
        return new MapResult(edit, PullUpStatusMapper.describe(prepared.status()));
    }

    static Prepared prepare(PullUpRequest request, IProgressMonitor monitor) throws Exception {
        PullUpContextResolver.resolve(request);
        List<IMember> moved = new ArrayList<>();
        List<IMethod> abstractMethods = new ArrayList<>();
        request.actions().forEach((handle, action) -> {
            IJavaElement element = JavaCore.create(handle);
            if (!(element instanceof IMember member)) return;
            if ("pullUp".equals(action)) moved.add(member);
            if ("declareAbstract".equals(action) && member instanceof IMethod method) abstractMethods.add(method);
        });
        List<IMember> initial = new ArrayList<>(moved);
        initial.addAll(abstractMethods);
        if (initial.isEmpty()) throw new IllegalArgumentException("Select at least one member to pull up.");
        PullUpRefactoringProcessor processor = PullUpAnalysisService.processor(initial.toArray(IMember[]::new));
        ProcessorBasedRefactoring refactoring = new ProcessorBasedRefactoring(processor);
        RefactoringStatus status = refactoring.checkInitialConditions(monitor);
        IJavaElement destination = JavaCore.create(request.destinationHandle());
        if (!(destination instanceof IType destinationType)) throw new IllegalArgumentException("Select a valid destination type.");
        processor.setDestinationType(destinationType);
        processor.setMembersToMove(moved.toArray(IMember[]::new));
        processor.setAbstractMethods(abstractMethods.toArray(IMethod[]::new));
        processor.setDeletedMethods(request.deletedMethodHandles().stream().map(JavaCore::create)
            .filter(IMethod.class::isInstance).map(IMethod.class::cast).toArray(IMethod[]::new));
        processor.setCreateMethodStubs(request.createMethodStubs());
        processor.setReplace(request.replaceWherePossible());
        processor.setInstanceOf(request.replaceWherePossible() && request.replaceInstanceof());
        return new Prepared(processor, refactoring, status);
    }

    record Prepared(PullUpRefactoringProcessor processor, ProcessorBasedRefactoring refactoring, RefactoringStatus status) {}
    record MapResult(WorkspaceEdit edit, List<Map<String, Object>> problems) {}
}
