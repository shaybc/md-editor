const { test: base, expect } = require("@playwright/test");
const { launchDesktopApp } = require("../helpers/desktop-app");

const test = base.extend({
  desktopApp: async ({}, use) => {
    const app = await launchDesktopApp();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },

  context: async ({ browser, desktopApp }, use) => {
    const context = await browser.newContext({ baseURL: desktopApp.baseURL });
    await context.addInitScript((auth) => {
      Object.assign(window, auth);
    }, desktopApp.auth);
    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

module.exports = {
  expect,
  launchDesktopApp,
  test,
};
