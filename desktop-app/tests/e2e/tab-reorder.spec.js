const { test, expect } = require("./desktop-fixture");

async function createTwoDocumentTabs(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await window.markdownViewerApp.modules.tabs.newTab('# Alpha', 'Alpha');
    await window.markdownViewerApp.modules.tabs.newTab('# Beta', 'Beta');
  });
  await expect(page.locator('#tab-list .tab-item')).toHaveCount(2);
  await expect(page.locator('#tab-list .tab-item').nth(0)).toContainText('Alpha');
  await expect(page.locator('#tab-list .tab-item').nth(1)).toContainText('Beta');
}

async function tabTitles(page) {
  return page.locator('#tab-list .tab-item .tab-title').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
}

async function tabTitlesWithoutDirtyMarker(page) {
  return (await tabTitles(page)).map((title) => title.replace(/\s+\*$/, ''));
}

async function storedTabTitles(page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('markdownViewerTabs') || '{}').tabs || []).map((tab) => tab.title));
}

async function dragTabToTab(page, sourceTitle, targetTitle, steps = 8) {
  const sourceBox = await page.locator('#tab-list .tab-item', { hasText: sourceTitle }).boundingBox();
  const targetBox = await page.locator('#tab-list .tab-item', { hasText: targetTitle }).boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps });
  await page.mouse.up();
}

test('document tabs can be reordered with mouse drag', async ({ page }) => {
  await createTwoDocumentTabs(page);
  await expect(page.locator('#tab-list .tab-item').first()).toHaveAttribute('draggable', 'false');

  await dragTabToTab(page, 'Beta', 'Alpha');

  await expect.poll(() => tabTitles(page)).toEqual(['Beta', 'Alpha']);
  await expect.poll(() => storedTabTitles(page)).toEqual(['Beta', 'Alpha']);
});

test('document tab clicks and small pointer moves do not reorder tabs', async ({ page }) => {
  await createTwoDocumentTabs(page);
  const alphaTab = page.locator('#tab-list .tab-item', { hasText: 'Alpha' });
  const betaTab = page.locator('#tab-list .tab-item', { hasText: 'Beta' });

  await alphaTab.click();
  await expect(alphaTab).toHaveClass(/active/);

  const alphaBox = await alphaTab.boundingBox();
  expect(alphaBox).not.toBeNull();
  await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(alphaBox.x + alphaBox.width / 2 + 2, alphaBox.y + alphaBox.height / 2 + 2);
  await page.mouse.up();

  await expect.poll(() => tabTitles(page)).toEqual(['Alpha', 'Beta']);
  await betaTab.click();
  await expect(betaTab).toHaveClass(/active/);
});

async function createDocumentTabs(page, titles) {
  await page.goto('/');
  await page.evaluate(async (tabTitles) => {
    for (const title of tabTitles) {
      await window.markdownViewerApp.modules.tabs.newTab(`# ${title}`, title);
    }
  }, titles);
  await expect(page.locator('#tab-list .tab-item')).toHaveCount(titles.length);
}

test('selected document tabs can be closed from the tab context menu', async ({ page }) => {
  await createDocumentTabs(page, ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);

  await page.locator('#tab-list .tab-item', { hasText: 'Alpha' }).click({ modifiers: ['Control'] });
  await page.locator('#tab-list .tab-item', { hasText: 'Gamma' }).click({ modifiers: ['Control'] });
  const activeTitle = (await page.locator('#tab-list .tab-item.active .tab-title').textContent()).trim().replace(/\s+\*$/, '');
  const expectedTitles = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].filter((title) => !['Alpha', 'Gamma', activeTitle].includes(title));
  await page.locator('#tab-list .tab-item', { hasText: 'Gamma' }).click({ button: 'right' });
  await page.locator(".tab-context-menu-action[data-action='close']").click();
  await page.locator('#app-notification-actions [data-notification-button-id="confirm"]').click();

  await expect.poll(() => tabTitlesWithoutDirtyMarker(page)).toEqual(expectedTitles);
});

test('close others keeps the selected document tab range open', async ({ page }) => {
  await createDocumentTabs(page, ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);

  await page.locator('#tab-list .tab-item', { hasText: 'Beta' }).click({ modifiers: ['Control'] });
  await page.locator('#tab-list .tab-item', { hasText: 'Delta' }).click({ modifiers: ['Shift'] });
  await page.locator('#tab-list .tab-item', { hasText: 'Gamma' }).click({ button: 'right' });
  await page.locator(".tab-context-menu-action[data-action='close-others']").click();

  await expect.poll(() => tabTitlesWithoutDirtyMarker(page)).toEqual(['Beta', 'Gamma', 'Delta']);
});

test('single-tab context actions are disabled when multiple tabs are selected', async ({ page }) => {
  await createDocumentTabs(page, ['Alpha', 'Beta', 'Gamma']);

  await page.locator('#tab-list .tab-item', { hasText: 'Alpha' }).click({ modifiers: ['Control'] });
  await page.locator('#tab-list .tab-item', { hasText: 'Beta' }).click({ modifiers: ['Control'] });
  await page.locator('#tab-list .tab-item', { hasText: 'Beta' }).click({ button: 'right' });

  await expect(page.locator(".tab-context-menu-action[data-action='rename']")).toBeDisabled();
  await expect(page.locator(".tab-context-menu-action[data-action='duplicate']")).toBeDisabled();
  await expect.poll(() => tabTitlesWithoutDirtyMarker(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
});