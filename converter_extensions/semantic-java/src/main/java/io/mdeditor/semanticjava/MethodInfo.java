package io.mdeditor.semanticjava;

import java.util.List;

record MethodInfo(
    String name,
    String kind,
    String signature,
    List<String> returnValues,
    List<String> exceptions
) {
}
