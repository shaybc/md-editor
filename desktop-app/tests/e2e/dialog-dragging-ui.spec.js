const { expect, test } = require("./desktop-fixture");
const { stubBrowserLibraries } = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

async function dragBy(page, handle, deltaX, deltaY) {
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + deltaX, bounds.y + bounds.height / 2 + deltaY);
  await page.mouse.up();
}

test("notifications and dynamic dialogs can be moved by their titles", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.services?.notify);

  await page.evaluate(() => { void window.markdownViewerApp.services.notify.alert({ title: "Move this notification", message: "Drag its title." }); });
  const notification = page.locator("#app-notification-modal .app-notification-box");
  const notificationTitle = page.locator("#app-notification-title");
  const notificationBefore = await notification.boundingBox();
  await dragBy(page, notificationTitle, 140, 90);
  const notificationAfter = await notification.boundingBox();
  expect(notificationAfter.x).toBeGreaterThan(notificationBefore.x + 100);
  expect(notificationAfter.y).toBeGreaterThan(notificationBefore.y + 50);
  await page.locator('#app-notification-modal [data-notification-button-id="ok"]').click();
  await expect(page.locator("#app-notification-modal")).toBeHidden();

  await page.evaluate(() => {
    const overlay = document.createElement("div");
    overlay.className = "reset-modal-overlay";
    overlay.innerHTML = '<section class="reset-modal-box" role="dialog" aria-modal="true" aria-labelledby="dynamic-dialog-title"><header><h2 id="dynamic-dialog-title">Dynamic dialog</h2><button type="button">Action</button></header></section>';
    document.body.appendChild(overlay);
  });
  const dynamicDialog = page.getByRole("dialog", { name: "Dynamic dialog" });
  const dynamicHeader = dynamicDialog.locator("header");
  await expect(dynamicHeader).toHaveClass(/app-dialog-drag-handle/);
  const dynamicBefore = await dynamicDialog.boundingBox();
  await dragBy(page, dynamicHeader, -160, -100);
  const dynamicAfter = await dynamicDialog.boundingBox();
  expect(dynamicAfter.x).toBeLessThan(dynamicBefore.x - 100);
  expect(dynamicAfter.y).toBeLessThan(dynamicBefore.y - 50);
  expect(await page.evaluate(() => window.getSelection().toString())).toBe("");
});
