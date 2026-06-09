package io.mdeditor.semanticjava;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

final class ConverterOptions {
  final Path root;
  final Path vault;
  final boolean includeMethods;
  final boolean includeAccessors;
  final boolean includeSignatures;
  final boolean includeReturnCodes;
  final boolean includeExceptions;
  final boolean includePackage;

  private ConverterOptions(
      Path root,
      Path vault,
      Set<String> flags
  ) {
    this.root = root;
    this.vault = vault;
    this.includeMethods = flags.contains("--include-methods");
    this.includeAccessors = flags.contains("--include-accessors");
    this.includeSignatures = flags.contains("--include-signatures");
    this.includeReturnCodes = flags.contains("--include-return-codes");
    this.includeExceptions = flags.contains("--include-exceptions");
    this.includePackage = flags.contains("--include-package");
  }

  static ConverterOptions parse(String[] args) {
    Path root = null;
    Path vault = null;
    Set<String> flags = new HashSet<>();

    for (int i = 0; i < args.length; i += 1) {
      String arg = args[i];
      switch (arg) {
        case "--root" -> {
          root = Path.of(readValue(args, ++i, arg)).toAbsolutePath().normalize();
        }
        case "--vault" -> {
          vault = Path.of(readValue(args, ++i, arg)).toAbsolutePath().normalize();
        }
        case "--include-methods",
             "--include-accessors",
             "--include-signatures",
             "--include-return-codes",
             "--include-exceptions",
             "--include-package" -> flags.add(arg);
        default -> {
          if (arg.startsWith("--")) {
            throw new IllegalArgumentException("Unknown switch: " + arg);
          }
          throw new IllegalArgumentException("Unexpected positional argument: " + arg);
        }
      }
    }

    if (root == null) throw new IllegalArgumentException("Missing --root <source-folder>");
    if (vault == null) throw new IllegalArgumentException("Missing --vault <destination-folder>");
    return new ConverterOptions(root, vault, flags);
  }

  private static String readValue(String[] args, int index, String flag) {
    if (index >= args.length || args[index].startsWith("--")) {
      throw new IllegalArgumentException("Missing value for " + flag);
    }
    return args[index];
  }
}
