"use strict";

/** Classify terminal JDT project-model failures without forwarding raw server logs. */
class JdtProjectModelState {
  constructor() {
    this.failure = null;
  }

  /** Accept one reduced JDT status and return a new or more specific failure. */
  acceptStatus(status = {}) {
    if (!["log", "stderr", "lifecycle"].includes(String(status.phase || ""))) return null;
    const message = status.message?.params?.message ?? status.message;
    const classified = classifyProjectModelFailure(message);
    if (!classified) return null;
    if (this.failure && failureSpecificity(classified) <= failureSpecificity(this.failure)) return null;
    this.failure = classified;
    return Object.assign({}, classified);
  }

  /** Return whether project-wide diagnostics belong to a failed import generation. */
  isFailed() {
    return Boolean(this.failure);
  }

  /** Start a fresh project-model generation after an explicit proxy restart. */
  reset() {
    this.failure = null;
  }
}

/** Convert a Java class-file major number to its Java feature release. */
function javaFeatureFromClassFileMajor(value) {
  const major = Number(value);
  return Number.isInteger(major) && major >= 45 ? major - 44 : null;
}

/** Classify a terminal project-model failure from one JDT/Buildship log message. */
function classifyProjectModelFailure(message) {
  const text = String(message || "");
  const classFileMatch = text.match(/Unsupported class file major version\s+(\d+)/i);
  if (classFileMatch) {
    const classFileMajor = Number(classFileMatch[1]);
    return {
      code: "jdk-incompatible",
      fatal: true,
      summary: "Java diagnostics unavailable because Gradle import failed.",
      reason: classFileMatch[0],
      classFileMajor,
      rejectedJavaFeature: javaFeatureFromClassFileMajor(classFileMajor),
      fingerprint: `jdk-incompatible:${classFileMajor}`
    };
  }
  const gradleFailure = text.match(/Could not fetch model of type[^\r\n]*|The supplied phased action failed[^\r\n]*|Resolution of the configuration[^\r\n]*attempted without an exclusive lock[^\r\n]*|Synchronize (?:Gradle projects? with workspace|project .+?) failed[^\r\n]*|error connecting to the Gradle build|Gradle project synchronization failed/i);
  if (gradleFailure) {
    const corruptedState = matchCorruptedGradleBuildState(text);
    if (corruptedState) {
      return {
        code: "gradle-import-failed",
        fatal: true,
        summary: "Java diagnostics unavailable because Gradle import failed.",
        reason: corruptedState,
        remediation: "Delete the stale Gradle build output referenced above (for example the project's buildSrc\\build folder), then retry Java project analysis.",
        fingerprint: "gradle-import-failed:corrupted-build-state"
      };
    }
    return {
      code: "gradle-import-failed",
      fatal: true,
      summary: "Java diagnostics unavailable because Gradle import failed.",
      reason: gradleFailure[0],
      fingerprint: `gradle-import-failed:${gradleFailureKind(gradleFailure[0])}`
    };
  }
  const jdtFailure = text.match(/Cannot invoke[^\r\n]*ProjectDescription[^\r\n]*internalGetDescription\(\)[^\r\n]*null|JDT project initialization failed|Java project initialization failed/i);
  if (jdtFailure) {
    return {
      code: "jdt-initialization-failed",
      fatal: true,
      summary: "Java diagnostics unavailable because JDT project initialization failed.",
      reason: jdtFailure[0],
      fingerprint: "jdt-initialization-failed"
    };
  }
  return null;
}

/**
 * Identify a Gradle sync failure caused by stale or corrupted build output
 * (typically binary test-results left behind by an earlier interrupted run).
 *
 * @param {string} text - The complete multi-line failure message including causes.
 * @returns {string|null} The root-cause exception line, or null when not this failure kind.
 */
function matchCorruptedGradleBuildState(text) {
  // Only trust these exceptions as "corrupted build output" when they reference
  // Gradle's on-disk build state; unrelated IO errors must keep the generic path.
  if (!/[\\\/]build[\\\/][^\r\n]*\.bin|[\\\/]test-results[\\\/]/i.test(text)) return null;
  const rootCause = text.match(/(?:java\.nio\.file\.NoSuchFileException|com\.esotericsoftware\.kryo\.KryoException|java\.io\.EOFException)[^\r\n]*/i);
  return rootCause ? rootCause[0] : null;
}

function gradleFailureKind(reason) {
  const text = String(reason || "");
  if (/exclusive lock/i.test(text)) return "exclusive-lock";
  if (/Could not fetch model/i.test(text)) return "model-fetch";
  if (/phased action/i.test(text)) return "phased-action";
  return "synchronization";
}

function failureSpecificity(failure) {
  if (failure?.code === "jdk-incompatible") return 4;
  // A named root cause with its own remediation beats every generic Gradle classification.
  if (String(failure?.fingerprint || "").endsWith("corrupted-build-state")) return 3;
  if (/exclusive lock/i.test(String(failure?.reason || ""))) return 3;
  if (/Could not fetch model|phased action/i.test(String(failure?.reason || ""))) return 2;
  return failure ? 1 : 0;
}

module.exports = { JdtProjectModelState, classifyProjectModelFailure, javaFeatureFromClassFileMajor };
