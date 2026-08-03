package mdeditor.java.pushdown;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import org.eclipse.jdt.core.IField;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.Signature;
import org.eclipse.jdt.internal.corext.refactoring.structure.PushDownRefactoringProcessor.MemberActionInfo;

/** Maps Eclipse Push Down members and actions to renderer-safe values. */
final class PushDownMemberMapper {
    private PushDownMemberMapper() {}

    static Map<String, Object> describe(MemberActionInfo info) {
        IMember member = info.getMember();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("handle", member.getHandleIdentifier());
        result.put("label", label(member));
        result.put("kind", member instanceof IMethod ? "method" : "field");
        result.put("action", actionName(info.getAction()));
        result.put("availableActions", Arrays.stream(info.getAvailableActions()).mapToObj(PushDownMemberMapper::actionName).toList());
        return result;
    }

    static int actionCode(String action) {
        return switch (String.valueOf(action)) {
            case "pushDown" -> MemberActionInfo.PUSH_DOWN_ACTION;
            case "leaveAbstract" -> MemberActionInfo.PUSH_ABSTRACT_ACTION;
            default -> MemberActionInfo.NO_ACTION;
        };
    }

    private static String actionName(int action) {
        return switch (action) {
            case MemberActionInfo.PUSH_DOWN_ACTION -> "pushDown";
            case MemberActionInfo.PUSH_ABSTRACT_ACTION -> "leaveAbstract";
            default -> "none";
        };
    }

    private static String label(IMember member) {
        if (member instanceof IMethod method) {
            try {
                return method.getElementName() + "(" + Arrays.stream(method.getParameterTypes())
                    .map(Signature::toString).reduce((left, right) -> left + ", " + right).orElse("") + ")";
            } catch (RuntimeException ignored) {
                return method.getElementName() + "()";
            }
        }
        if (member instanceof IField field) {
            try { return field.getElementName() + " : " + Signature.toString(field.getTypeSignature()); }
            catch (JavaModelException ignored) { return field.getElementName(); }
        }
        return member.getElementName();
    }
}
