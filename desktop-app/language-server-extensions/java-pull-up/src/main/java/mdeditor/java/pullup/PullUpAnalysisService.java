package mdeditor.java.pullup;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.Flags;
import org.eclipse.jdt.core.IField;
import org.eclipse.jdt.core.IMember;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.Signature;
import org.eclipse.jdt.internal.corext.codemanipulation.CodeGenerationSettings;
import org.eclipse.jdt.internal.corext.refactoring.structure.PullUpRefactoringProcessor;
import org.eclipse.ltk.core.refactoring.RefactoringStatus;
import org.eclipse.ltk.core.refactoring.participants.ProcessorBasedRefactoring;

/** Discovers Pull Up destinations, pullable members, and matching subtype methods. */
final class PullUpAnalysisService {
    Map<String, Object> check(PullUpRequest request, IProgressMonitor monitor) throws Exception {
        PullUpContextResolver.Context context = PullUpContextResolver.resolve(request);
        PullUpRefactoringProcessor processor = processor(context.selectedMembers());
        RefactoringStatus status = new ProcessorBasedRefactoring(processor).checkInitialConditions(monitor);
        List<IType> candidates = Arrays.asList(processor.getCandidateTypes(status, monitor));
        if (candidates.isEmpty()) status.addFatalError("The selected type has no superclass or interface that can receive members.");
        Set<String> selectedHandles = Arrays.stream(context.selectedMembers()).map(IMember::getHandleIdentifier).collect(Collectors.toSet());
        List<Map<String, Object>> members = Arrays.stream(processor.getPullableMembersOfDeclaringType())
            .map(member -> describeMember(member, selectedHandles.contains(member.getHandleIdentifier()))).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("available", !status.hasError());
        result.put("sourceType", context.declaringType().getFullyQualifiedName());
        result.put("destinations", candidates.stream().map(PullUpAnalysisService::describeType).toList());
        result.put("members", members);
        result.put("problems", PullUpStatusMapper.describe(status));
        return result;
    }

    Map<String, Object> resolve(PullUpRequest request, IProgressMonitor monitor) throws Exception {
        PullUpRefactoringService.Prepared prepared = PullUpRefactoringService.prepare(request, monitor);
        List<Map<String, Object>> required = Arrays.stream(prepared.processor().getAdditionalRequiredMembersToPullUp(monitor))
            .map(member -> describeMember(member, true)).toList();
        List<Map<String, Object>> matches = new ArrayList<>();
        for (IMember member : prepared.processor().getMatchingElements(monitor, false)) {
            matches.add(Map.of("handle", member.getHandleIdentifier(), "label", memberLabel(member),
                "declaringType", member.getDeclaringType().getFullyQualifiedName()));
        }
        return Map.of("requiredMembers", required, "matchingMethods", matches,
            "problems", PullUpStatusMapper.describe(prepared.status()));
    }

    static PullUpRefactoringProcessor processor(IMember[] selectedMembers) {
        return new PullUpRefactoringProcessor(selectedMembers, new CodeGenerationSettings());
    }

    static Map<String, Object> describeMember(IMember member, boolean selected) {
        String kind = member instanceof IMethod ? "method" : member instanceof IField ? "field" : "type";
        boolean canDeclareAbstract = member instanceof IMethod method && !safeConstructor(method)
            && !Flags.isStatic(safeFlags(member)) && !Flags.isPrivate(safeFlags(member));
        return Map.of("handle", member.getHandleIdentifier(), "label", memberLabel(member), "kind", kind,
            "selected", selected, "canDeclareAbstract", canDeclareAbstract);
    }

    private static Map<String, Object> describeType(IType type) {
        return Map.of("handle", type.getHandleIdentifier(), "label", type.getFullyQualifiedName(),
            "interfaceType", safeInterface(type));
    }

    private static String memberLabel(IMember member) {
        if (member instanceof IMethod method) {
            try {
                return method.getElementName() + "(" + Arrays.stream(method.getParameterTypes())
                    .map(Signature::toString).collect(Collectors.joining(", ")) + ")";
            } catch (RuntimeException ignored) {
                return method.getElementName() + "()";
            }
        }
        return member.getElementName();
    }

    private static int safeFlags(IMember member) {
        try { return member.getFlags(); } catch (JavaModelException ignored) { return 0; }
    }

    private static boolean safeConstructor(IMethod method) {
        try { return method.isConstructor(); } catch (JavaModelException ignored) { return false; }
    }

    private static boolean safeInterface(IType type) {
        try { return type.isInterface(); } catch (JavaModelException ignored) { return false; }
    }
}
