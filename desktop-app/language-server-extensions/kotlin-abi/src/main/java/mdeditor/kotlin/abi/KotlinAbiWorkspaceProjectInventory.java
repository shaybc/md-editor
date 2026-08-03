package mdeditor.kotlin.abi;

import java.util.List;
import java.util.Map;

/** Supplies the canonical JDT project inventory as Kotlin ABI reconciliation evidence. */
final class KotlinAbiWorkspaceProjectInventory {
    private KotlinAbiWorkspaceProjectInventory() {}

    /**
     * Capture the same project inventory used by the analysis-scope gate.
     *
     * @return Stable, JSON-serializable JDT project records.
     */
    static List<Map<String, Object>> describe() {
        return JdtWorkspaceProjectInventory.describe();
    }
}
