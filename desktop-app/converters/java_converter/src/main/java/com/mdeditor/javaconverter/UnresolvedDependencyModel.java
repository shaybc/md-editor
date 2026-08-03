package com.mdeditor.javaconverter;

record UnresolvedDependencyModel(
    String symbol,
    String kind,
    boolean staticImport,
    boolean wildcard,
    long line
) {
}
