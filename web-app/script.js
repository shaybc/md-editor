import { createAppContext } from "./js/core/context.js";
import { registerDom } from "./js/modules/dom.js";
import { registerStorage } from "./js/modules/storage.js";
import { registerSettings } from "./js/modules/settings.js";
import { registerEditor } from "./js/modules/editor.js";
import { registerMarkdown } from "./js/modules/markdown.js";
import { registerFiles } from "./js/modules/files.js";
import { registerTags } from "./js/modules/tags.js";
import { registerGraph } from "./js/modules/graph.js";
import { registerExport } from "./js/modules/export.js";
import { registerUi } from "./js/modules/ui.js";
import { registerStartup } from "./js/modules/startup.js";

document.addEventListener("DOMContentLoaded", () => {
  const app = createAppContext();

  registerDom(app);
  registerStorage(app);
  registerSettings(app);
  registerEditor(app);
  registerMarkdown(app);
  registerFiles(app);
  registerTags(app);
  registerGraph(app);
  registerExport(app);
  registerUi(app);
  registerStartup(app);

  app.actions.startApp();
});
