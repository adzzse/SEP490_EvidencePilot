import { test, expect } from '@playwright/test';
test.use({ channel: 'chrome' });
test.beforeEach(async ({ page }) => { await page.routeWebSocket(/localhost:5173/, () => {}); });

const root = 'http://localhost:5173/e2e/paper-references.html';

const refOf = (sourceId, extra = {}) => ({
  sourceId,
  citationKey: `ep${sourceId.replace(/-/g, '')}`,
  title: `${sourceId} title`,
  authors: 'A. Researcher',
  publicationYear: 2026,
  doi: null,
  processingStatus: 'READY',
  processingError: null,
  fileAvailable: true,
  retrievable: true,
  canAttachFile: false,
  ...extra,
});

test('references stay paper-scoped, persist, attach, guard insertion and 409', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const refs = {
    '11111111-1111-1111-1111-111111111111': refOf('11111111-1111-1111-1111-111111111111', { title: 'Ready Paper' }),
    '22222222-2222-2222-2222-222222222222': refOf('22222222-2222-2222-2222-222222222222', {
      title: 'Missing Paper', processingStatus: 'METADATA_FETCHED',
      processingError: 'No PDF yet', fileAvailable: false, retrievable: false, canAttachFile: true,
    }),
  };
  await page.route('**/api/papers/44444444-4444-4444-4444-444444444444/references', (route) => route.fulfill({ status: 200, json: Object.values(refs) }));
  await page.route('**/api/papers/44444444-4444-4444-4444-444444444444/references/*', (route) => {
    const sourceId = route.request().url().split('/').at(-1);
    if (route.request().method() === 'POST') {
      if (!['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'].includes(sourceId)) {
        return route.fulfill({ status: 404, json: { message: 'Source not found' } });
      }
      refs[sourceId] = refOf(sourceId, { title: `${sourceId} title` });
      return route.fulfill({ status: 200, json: refs[sourceId] });
    }
    if (sourceId === '11111111-1111-1111-1111-111111111111') {
      return route.fulfill({ status: 409, json: { message: 'REFERENCE_IN_USE: remove the citation first' } });
    }
    delete refs[sourceId];
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/documents/22222222-2222-2222-2222-222222222222/file', (route) => {
    refs['22222222-2222-2222-2222-222222222222'] = refOf('22222222-2222-2222-2222-222222222222', { title: 'Missing Paper' });
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto(root);
  const panel = page.locator('aside');
  await expect(panel.getByText('Ready Paper', { exact: true })).toBeVisible();
  await expect(panel.getByText('References', { exact: true }).first()).toBeVisible();

  // Distinct scopes: two References, three Sources.
  await expect(panel.getByText('Ready Paper', { exact: true })).toBeVisible();
  await expect(panel.getByText('Available', { exact: true })).toBeVisible();
  await expect(panel.getByText('Missing PDF', { exact: true })).toBeVisible();
  await expect(panel.getByText('Extra Paper.pdf')).toBeVisible();

  // Insert guard: undeclared 33333333-3333-3333-3333-333333333333 candidate is disabled with a reason.
  const card = page.locator('[role="dialog"]');
  const blocked = card.getByRole('button', { name: 'Insert citation' }).nth(1);
  await expect(blocked).toBeDisabled();
  await expect(blocked).toHaveAttribute('title', /not in the paper's References/);
  const allowed = card.getByRole('button', { name: 'Insert citation' }).nth(0);
  await expect(allowed).toBeEnabled();
  await allowed.click();
  await expect.poll(async () => page.evaluate(() => window.__inserted || [])).toEqual(['ep11111111111111111111111111111111']);
  // Source passage viewer stays available for every candidate.
  await card.getByRole('button', { name: /open/i }).nth(1).click();
  await expect.poll(async () => page.evaluate(() => window.__opened || [])).toEqual(['33333333-3333-3333-3333-333333333333']);

  // Add 33333333-3333-3333-3333-333333333333 to References; the card guard lifts after reload.
  await panel.getByRole('button', { name: 'Add to References' }).first().click();
  await expect(panel.getByText('Missing PDF', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remount panel', exact: true }).click();
  await expect.poll(async () => page.evaluate(
    () => document.querySelector('aside')?.textContent?.includes('33333333-3333-3333-3333-333333333333 title'))).toBe(true);
  await expect(card.getByRole('button', { name: 'Insert citation' }).nth(1)).toBeEnabled();

  // Attach a PDF to the metadata-only reference; it becomes retrievable.
  await panel.locator('input[type="file"]').first().setInputFiles({
    name: 'missing.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
  });
  await expect(panel.getByText('Available', { exact: true })).toHaveCount(2);
  await expect(panel.getByText('Missing PDF', { exact: true })).toHaveCount(0);

  // Cited reference removal is rejected with repair guidance.
  const removeButtons = panel.getByRole('button', { name: /Remove from References/ });
  await removeButtons.first().click();
  await expect(page.getByTestId('toasts')).toContainText('still cited in the paper');
  await expect(panel.getByText('Ready Paper', { exact: true })).toBeVisible();

  // Uncited reference removal succeeds while the source stays in the library.
  await panel.getByRole('button', { name: /Remove from References/ }).nth(2).click();
  await expect(panel.getByText('33333333-3333-3333-3333-333333333333 title')).toHaveCount(0);
  await expect(panel.getByText('Extra Paper.pdf')).toBeVisible();
  await expect(errors).toEqual([]);
});

test('instructor workspace reads references without mutation controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/papers/44444444-4444-4444-4444-444444444444/references', (route) => route.fulfill({ status: 200, json: [refOf('11111111-1111-1111-1111-111111111111', { title: 'Ready Paper' })] }));
  await page.goto(root);
  const panel = page.locator('aside');
  await expect(panel.getByText('Ready Paper', { exact: true })).toBeVisible();
  await page.getByLabel('Instructor mode').check();
  await expect(panel.getByRole('button', { name: 'Add to References' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Remove from References/ })).toHaveCount(0);
  await expect(panel.getByText('Ready Paper', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../../artifacts/codex/mentor-reference-citation-plan-2026-09-13/references-panel.png' });
  await expect(errors).toEqual([]);
});

test('hook ignores a late paper response and does not expose raw load errors', async ({ page }) => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/papers/44444444-4444-4444-4444-444444444444/references', async route => {
    await delayed;
    await route.fulfill({ status: 200, json: [refOf('11111111-1111-1111-1111-111111111111', { title: 'Late paper A' })] });
  });
  await page.route('**/api/papers/55555555-5555-5555-5555-555555555555/references', route => route.fulfill({ status: 200, json: [refOf('22222222-2222-2222-2222-222222222222', { title: 'Paper B' })] }));
  const first = page.waitForRequest('**/api/papers/44444444-4444-4444-4444-444444444444/references');
  await page.goto(root);
  await first;
  await page.evaluate(() => window.__fixture.switchPaper('55555555-5555-5555-5555-555555555555'));
  await expect(page.locator('aside')).toContainText('Paper B');
  const lateResponse = page.waitForResponse('**/api/papers/44444444-4444-4444-4444-444444444444/references');
  release();
  await lateResponse;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.locator('aside').innerText()).toContain('Paper B');
  await expect(page.locator('aside')).not.toContainText('Late paper A');
  await page.route('**/api/papers/66666666-6666-6666-6666-666666666666/references', route => route.fulfill({ status: 500, json: { message: 'token=secret C:\\private\\log' } }));
  await page.evaluate(() => window.__fixture.switchPaper('66666666-6666-6666-6666-666666666666'));
  await expect(page.locator('aside [role=alert]')).toHaveText('Failed to load references.');
  await expect(page.locator('aside')).not.toContainText('token=secret');
});

test('shared metadata-only Reference shows owner guidance instead of an unusable attach action', async ({ page }) => {
  await page.route('**/api/papers/44444444-4444-4444-4444-444444444444/references', route => route.fulfill({ status: 200, json: [refOf('11111111-1111-1111-1111-111111111111', { title: 'Shared metadata', fileAvailable: false, retrievable: false, processingStatus: 'METADATA_FETCHED', canAttachFile: false })] }));
  await page.goto(root);
  const panel = page.locator('aside');
  await expect(panel).toContainText('Ask the source owner');
  await expect(panel.locator('input[id^="attach-reference-pdf-"]')).toHaveCount(0);
});
