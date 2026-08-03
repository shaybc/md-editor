/**
 * Fixed-argument package provider registry used by structured execution.
 */

"use strict";

function createPackageProviderRegistry(deps) {
  function nodePackageProvider(ecosystem) {
    return {
      id: ecosystem,
      supports(value) {
        return value === ecosystem;
      },
      async restoreDependencies(context) {
        const executable = process.platform === "win32" ? `${ecosystem}.cmd` : ecosystem;
        const args = ecosystem === "yarn" ? ["install", "--non-interactive", "--ignore-scripts"] : ["install", "--ignore-scripts"];
        return deps.baseDescriptor(context.workspaceRoot, context.projectRoot, executable, args, { CI: "true" });
      },
      async managePackage(context) {
        const executable = process.platform === "win32" ? `${ecosystem}.cmd` : ecosystem;
        const packageSpec = context.version === "*" || context.action === "remove"
          ? context.packageId
          : `${context.packageId}@${context.version}`;
        let args;
        if (ecosystem === "npm") {
          const verb = context.action === "remove" ? "uninstall" : context.action === "download" ? "pack" : context.action;
          args = [verb, packageSpec, "--ignore-scripts"];
          if (context.development && !["remove", "download"].includes(context.action)) args.push("--save-dev");
        } else if (ecosystem === "yarn") {
          const verb = context.action === "remove" ? "remove" : context.action === "download" ? "cache" : context.action === "install" ? "add" : "upgrade";
          args = verb === "cache" ? ["cache", "list", "--pattern", context.packageId] : [verb, packageSpec];
          if (context.development && verb === "add") args.push("--dev");
          args.push("--ignore-scripts");
        } else {
          const verb = context.action === "remove" ? "remove" : context.action === "download" ? "fetch" : context.action === "install" ? "add" : "update";
          args = [verb, packageSpec];
          if (context.development && verb === "add") args.push("--save-dev");
          args.push("--ignore-scripts");
        }
        return deps.baseDescriptor(context.workspaceRoot, context.projectRoot, executable, args, { CI: "true" });
      },
      resolvePackageBinary(name, policy) {
        if (name === "npx" && policy.packageBinaries?.npx === true) return process.platform === "win32" ? "npx.cmd" : "npx";
        if (name === "yarnDlx" && policy.packageBinaries?.yarnDlx === true) return process.platform === "win32" ? "yarn.cmd" : "yarn";
        if (name === "pnpmDlx" && policy.packageBinaries?.pnpmDlx === true) return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
        return null;
      }
    };
  }

  const providers = [
    nodePackageProvider("npm"),
    nodePackageProvider("yarn"),
    nodePackageProvider("pnpm"),
    {
      id: "maven",
      supports(value) {
        return value === "maven";
      },
      async restoreDependencies(context) {
        const executable = await deps.findExecutable(context.projectRoot, [process.platform === "win32" ? "mvnw.cmd" : "mvnw", process.platform === "win32" ? "mvn.cmd" : "mvn"]);
        return deps.baseDescriptor(context.workspaceRoot, context.projectRoot, executable, ["dependency:go-offline"], { CI: "true" });
      },
      async managePackage() {
        throw new Error("Maven dependency declarations must be made through a reviewed file edit; use restore_dependencies afterward.");
      }
    },
    {
      id: "gradle",
      supports(value) {
        return value === "gradle";
      },
      async restoreDependencies(context) {
        const executable = await deps.findExecutable(context.projectRoot, [process.platform === "win32" ? "gradlew.bat" : "gradlew", process.platform === "win32" ? "gradle.bat" : "gradle"]);
        const args = ["dependencies", "--no-daemon"];
        if (context.refresh) args.push("--refresh-dependencies");
        return deps.baseDescriptor(context.workspaceRoot, context.projectRoot, executable, args, { CI: "true" });
      },
      async managePackage() {
        throw new Error("Gradle dependency declarations must be made through a reviewed file edit; use restore_dependencies afterward.");
      }
    }
  ];

  function get(ecosystem) {
    return providers.find((provider) => provider.supports(ecosystem)) || null;
  }

  return { get, providers };
}

module.exports = {
  createPackageProviderRegistry
};
