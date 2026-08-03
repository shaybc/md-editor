package mdeditor.java.pushdown;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IField;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.ISourceRange;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.ls.core.internal.JDTUtils;

/** Resolves fields and methods intersecting the active editor selection. */
final class PushDownContextResolver {
    private PushDownContextResolver() {}

    static Context resolve(PushDownRequest request) throws JavaModelException {
        ICompilationUnit unit = JDTUtils.resolveCompilationUnit(request.uri());
        if (unit == null) throw new IllegalArgumentException("The active Java compilation unit is unavailable.");
        List<IMember> selected = new ArrayList<>();
        for (IType type : unit.getTypes()) collectSelected(type, request.selectionStart(), request.selectionEnd(), selected);
        if (selected.isEmpty()) {
            IJavaElement element = unit.getElementAt(Math.max(0, request.selectionStart()));
            while (element != null && !(element instanceof IField) && !(element instanceof IMethod)) element = element.getParent();
            if (element instanceof IMember member) selected.add(member);
        }
        if (selected.isEmpty()) throw new IllegalArgumentException("Place the caret in a field or method to push down.");
        IType declaringType = selected.get(0).getDeclaringType();
        selected.removeIf(member -> !declaringType.equals(member.getDeclaringType()));
        return new Context(unit, declaringType, selected.toArray(IMember[]::new));
    }

    private static void collectSelected(IType type, int start, int end, List<IMember> selected) throws JavaModelException {
        for (IJavaElement child : type.getChildren()) {
            if (child instanceof IField || child instanceof IMethod) {
                IMember member = (IMember) child;
                ISourceRange range = member.getSourceRange();
                int selectionEnd = Math.max(start + 1, end);
                if (range != null && start < range.getOffset() + range.getLength() && selectionEnd > range.getOffset()) selected.add(member);
            }
            if (child instanceof IType nested) collectSelected(nested, start, end, selected);
        }
    }

    record Context(ICompilationUnit unit, IType declaringType, IMember[] selectedMembers) {}
}
