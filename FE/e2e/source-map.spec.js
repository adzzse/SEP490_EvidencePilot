import { test, expect } from '@playwright/test';
test.use({ channel: 'chrome' });
// Keep the local Vite watcher from reloading a fixture while it is measuring unsaved state.
test.beforeEach(async ({ page }) => { await page.routeWebSocket(/localhost:5173/, () => {}); });

const root = 'http://localhost:5173/e2e/source-map.html';
const source = (id, extra = {}) => ({ id: `source:${id}`, documentId: id, type: 'SOURCE', title: `Paper ${id}`, authors: '["Alice Smith"]', doi: `10.1234/${id}`, processingStatus: 'READY', ...extra });
const data = (id = 'one', count = 3, edgeCount = 1) => {
  const nodes = [{ id: `project:${id}`, type: 'PROJECT', title: `Project ${id}` }, ...Array.from({ length: count }, (_, i) => source(String(i), { fileAvailable: i === 0, originalFilename: `Paper ${i}.pdf` }))];
  return { project: { id, title: `Project ${id}` }, nodes, limitations: ['SAVED_METADATA_ONLY'], edges: [
    ...nodes.slice(1).map(node => ({ sourceId: nodes[0].id, targetId: node.id, type: 'PROJECT_SOURCE' })),
    ...Array.from({ length: edgeCount }, (_, i) => ({ sourceId: `source:${i % count}`, targetId: `source:${(i % count + 1 + Math.floor(i / count)) % count}`, type: 'CITES', referenceIds: [`r${i}`] })),
  ] };
};

test('dialog, source relations, viewer, retry, project switch and draft retention', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let fail = false;
  await page.route('**/api/projects/*/source-map', async route => {
    const id = route.request().url().split('/').at(-2);
    if (id === 'slow') await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ status: fail ? 503 : 200, json: data(id) });
  });
  await page.route('**/api/documents/*/download', route => route.fulfill({ status: 503, body: 'Fixture unavailable file' }));
  await page.goto(root);
  await page.getByRole('textbox', { name: 'Draft' }).fill('Unsaved draft survives');
  await expect(page.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved draft survives');
  await page.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Draft', includeHidden: true })).toHaveValue('Unsaved draft survives');
  const dialog = page.locator('dialog');
  await expect(dialog.locator('canvas')).toBeVisible();
  await expect(dialog).toContainText('3 sources · 1 citation relationships');
  await dialog.getByRole('button', { name: 'Paper 0', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Cites', exact: true })).toContainText('Paper 1');
  await dialog.getByRole('button', { name: 'Open source', exact: true }).click();
  await expect(dialog.getByRole('dialog', { name: 'Paper 0.pdf' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('dialog')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Open source', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open map', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved draft survives');
  fail = true;
  await page.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.locator('canvas')).toBeVisible();
  await page.evaluate(() => window.switchSourceMapProject('slow'));
  await page.evaluate(() => window.switchSourceMapProject('two'));
  await expect(dialog).toContainText('Project two');
  await page.waitForTimeout(800);
  await expect(dialog).not.toContainText('Project slow');
  await page.screenshot({ path: '../../artifacts/codex/project-visual-map-plan/fixture-desktop.png' });
  expect(errors).toEqual([]);
});

test('mobile VI dark mode, reduced motion and large graph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'vi'); localStorage.setItem('app_theme', 'dark'); });
  await page.route('**/api/projects/*/source-map', route => route.fulfill({ json: { ...data('one', 100, 1000), limitations: ['SAVED_METADATA_ONLY', 'SOURCES_WITHOUT_DOI', 'AMBIGUOUS_SOURCE_DOI'] } }));
  await page.goto(root);
  const started = Date.now();
  await page.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(page.locator('dialog canvas')).toBeVisible();
  const opened = Date.now() - started;
  const search = page.locator('dialog input[type=search]');
  await search.fill('10.1234/99');
  await page.getByRole('button', { name: 'Paper 99', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('100');
  const bounds = await page.locator('dialog').evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 2);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 2);
  await page.screenshot({ path: '../../artifacts/codex/project-visual-map-plan/fixture-mobile.png' });
  console.log(JSON.stringify({ fixture: '100 sources / 1000 citations', openedMs: opened, bounds }));
});

test('large graph remains interactive with normal physics', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/projects/*/source-map', route => route.fulfill({ json: data('one', 100, 1000) }));
  await page.goto(root);
  const start = Date.now();
  await page.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(page.locator('dialog canvas')).toBeVisible();
  const openedMs = Date.now() - start;
  const interaction = Date.now();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  const canvas = page.locator('dialog canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 100, { steps: 8 });
  await page.mouse.up();
  await page.locator('dialog input[type=search]').fill('10.1234/99');
  await page.getByRole('button', { name: 'Paper 99', exact: true }).click();
  await expect(page.locator('dialog h3').filter({ hasText: 'Paper 99' })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ fixture: '100 sources / 1000 citations; normal physics', openedMs, interactionSequenceMs: Date.now() - interaction }));
});
