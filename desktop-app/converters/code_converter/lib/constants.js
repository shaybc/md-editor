const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cs",
]);

const JS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const PY_EXTENSIONS = [".py"];
const JAVA_EXTENSIONS = [".java"];
const CSHARP_EXTENSIONS = [".cs"];

const IGNORED_DIRS = new Set([
  ".git",
  ".github",
  ".gitlab",
  ".gitea",
  ".md-editor",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  ".vs",
  ".settings",
  ".metadata",
  ".recommenders",
  ".externalToolBuilders",
  ".mvn",
  ".gradle",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".yarn-cache",
  "bower_components",
  "dist",
  "build",
  "coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".angular",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vite",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".ipynb_checkpoints",
  "target",
  "out",
  "bin",
  "obj",
  ".cxx",
  ".externalNativeBuild",
  "captures",
  "DerivedData",
  ".swiftpm",
  ".build",
]);

const REPORT_JSON_FILE = "missing_dependencies_report.json";
const REPORT_MARKDOWN_FILE = "missing_dependencies_report.md";
const MD_EDITOR_DIR = ".md-editor";
const MD_EDITOR_RECOVERY_DIR = "recovery";
const PROJECT_METADATA_FILE = "_md_editor_project.json";

module.exports = {
  SOURCE_EXTENSIONS,
  JS_EXTENSIONS,
  PY_EXTENSIONS,
  JAVA_EXTENSIONS,
  CSHARP_EXTENSIONS,
  IGNORED_DIRS,
  MD_EDITOR_DIR,
  MD_EDITOR_RECOVERY_DIR,
  PROJECT_METADATA_FILE,
  REPORT_JSON_FILE,
  REPORT_MARKDOWN_FILE,
};
