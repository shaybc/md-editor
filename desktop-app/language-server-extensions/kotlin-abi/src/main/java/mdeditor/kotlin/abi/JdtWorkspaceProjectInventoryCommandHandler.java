package mdeditor.kotlin.abi;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

/** Exposes the projects that JDT actually imported into its Eclipse workspace. */
public final class JdtWorkspaceProjectInventoryCommandHandler implements IDelegateCommandHandler {
    private static final String COMMAND_ID = "mdeditor.java.getWorkspaceProjectInventory";

    /**
     * Return a generation-correlated, JSON-serializable snapshot of the JDT workspace.
     *
     * @param commandId requested JDT delegate command
     * @param arguments optional request containing the renderer generation identifier
     * @param monitor Eclipse progress monitor for the command
     * @return authoritative JDT project inventory
     */
    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) {
        if (!COMMAND_ID.equals(commandId)) {
            throw new IllegalArgumentException("Unsupported command: " + commandId);
        }
        Map<?, ?> request = arguments.isEmpty() || !(arguments.get(0) instanceof Map<?, ?> value)
            ? Map.of()
            : value;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("generationId", numberValue(request.get("generationId")));
        result.put("capturedAt", System.currentTimeMillis());
        result.put("projects", JdtWorkspaceProjectInventory.describe());
        return result;
    }

    private static long numberValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(value == null ? "" : String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
