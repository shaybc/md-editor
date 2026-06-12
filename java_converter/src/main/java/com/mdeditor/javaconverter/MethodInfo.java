package com.mdeditor.javaconverter;

import java.util.List;

record MethodInfo(
    String name,
    String kind,
    String signature,
    List<String> returnCodes,
    List<String> exceptions
) {
}
