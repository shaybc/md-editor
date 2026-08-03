import * as prettier from "prettier/standalone";
import prettierJava from "prettier-plugin-java";

function getDefaultPlugin(module) {
  return module && module.default ? module.default : module;
}

function getJavaFormatOptions() {
  return {
    parser: "java",
    plugins: [getDefaultPlugin(prettierJava)],
    printWidth: 100,
    tabWidth: 2,
    useTabs: false
  };
}

async function formatJavaCode(source) {
  const formatted = await prettier.format(String(source || ""), getJavaFormatOptions());
  return typeof formatted === "string" ? formatted : String(formatted || "");
}

async function formatJavaCodeWithCursor(source, cursorOffset) {
  return prettier.formatWithCursor(String(source || ""), {
    ...getJavaFormatOptions(),
    cursorOffset: Math.max(0, Number(cursorOffset) || 0)
  });
}

window.MarkdownViewerJavaFormatter = {
  formatJavaCode,
  formatJavaCodeWithCursor
};