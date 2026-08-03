package com.mdeditor.javaconverter;

record ConverterOptions(
    boolean includeMethods,
    boolean includeAccessors,
    boolean includeSignatures,
    boolean includeReturnCodes,
    boolean includeExceptions,
    boolean includePackage
) {
}
