import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const baseUrl = 'http://localhost:5173';

// "Alpha comparisons beta comparisons gamma."
//  ^0    ^6...........^17 ^18  ^23...........^34
// The sentence leads so its offsets stay exact; filler below makes the editor
// scrollable (a one-line doc fires no scroll events at all).
const SENTENCE = 'Alpha comparisons beta comparisons gamma.';
const CONTENT = [SENTENCE, ...Array.from({ length: 60 }, (_, i) => `Filler line ${i}.`)].join('\n\n');
const SECOND_FROM = 23;
const SECOND_TO = 34;

async function setupReview(page) {
  const projectId = 'fab-anchor-project';
  const paperId = 'fab-paper';
  const sectionId = 'fab-section';
  const roundId = 'fab-round';
  const state = { errors: [], unhandled: [], posts: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fab-anchor-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json;

    if (method === 'POST' && (path.startsWith('/api/feedback-requests/') || path.startsWith('/api/instructor-feedback/'))) {
      state.posts.push(`${method} ${path}`);
    }

    if (path === '/api/users/profile') {
      json = { id: 'instructor-one', role: 'INSTRUCTOR', firstName: 'Test', lastName: 'Instructor' };
    } else if (path === '/api/notifications') {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === '/api/review-guides') {
      json = [];
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'FAB anchor fixture', status: 'SUBMITTED_FOR_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Anchor paper', originalFilename: 'anchor.tex', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === `/api/projects/${projectId}/evidence-traces`) {
      json = [];
    } else if (path === '/api/feedback-requests') {
      json = [{ id: roundId, projectId, status: 'PENDING', requestedAt: '2026-09-16T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${roundId}/submission-snapshot`) {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        papers: [{ id: paperId, title: 'Anchor paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex: CONTENT, contentVersion: 1,
        }] }],
      } };
    } else if (path === `/api/feedback-requests/${roundId}/feedback`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/references`) {
      json = [];
    } else {
      state.unhandled.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unhandled fixture request: ${method} ${path}` } });
    }

    return route.fulfill({ json });
  });

  return { projectId, state };
}

async function openReviewEditor(page, projectId) {
  await page.goto(`${baseUrl}/instructor/requests/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText(SENTENCE);
  // Wait for snapshot hydration to settle: the editor mounts empty, then the
  // submitted content replaces the whole doc (which would clobber a selection
  // dispatched too early). Poll the live doc length, not the DOM text.
  await expect.poll(() => page.evaluate(
    () => document.querySelector('.cm-editor')?.__cmView?.state.doc.length)).toBe(CONTENT.length);
}

// Programmatic selection via the real CodeMirror dispatch (readOnly editors
// are not keyboard-focusable, and mouse drags are viewport-flaky). This still
// exercises the full production path: dispatch → selectionSet → coordsAtPos →
// portal. No mouse movement involved.
// Keyboard-only selection: Home normalizes the caret to offset 0 (no mouse,
// no viewport math), then discrete arrows extend it. Fully deterministic.
async function cmSelect(page, anchor, head) {
  await page.evaluate(({ anchor, head }) => {
    document.querySelector('.cm-editor').__cmView.dispatch({ selection: { anchor, head } });
  }, { anchor, head });
}

test('FAB appears on keyboard selection and arms the draft with absolute offsets', async ({ page }) => {
  const { projectId, state } = await setupReview(page);
  await openReviewEditor(page, projectId);

  // Select the SECOND "comparisons" (23-34). An indexOf-based anchor would report 6-17.
  await cmSelect(page, SECOND_FROM, SECOND_TO);

  const fab = page.getByRole('button', { name: 'Comment', exact: true });
  await expect(fab).toBeVisible();

  await fab.click();
  // En-dash is the catalog's separator (see instructor.review.selectionReady).
  await expect(page.getByText(`Selected source range ${SECOND_FROM}\u2013${SECOND_TO}`, { exact: true })).toBeVisible();
  expect(state.posts).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('FAB unmounts on editor wheel-scroll', async ({ page }) => {
  const { projectId, state } = await setupReview(page);
  await openReviewEditor(page, projectId);

  await cmSelect(page, 0, 5);
  const fab = page.getByRole('button', { name: 'Comment', exact: true });
  await expect(fab).toBeVisible();

  await page.locator('.cm-content').hover();
  await page.mouse.wheel(0, 400);
  await expect(fab).toBeHidden();

  expect(state.errors).toEqual([]);
});

test('Preview selection routes to the Editor and creates no anchor', async ({ page }) => {
  const { projectId, state } = await setupReview(page);
  await openReviewEditor(page, projectId);

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const previewText = page.locator('.preview-content').getByText(SENTENCE, { exact: true });
  await expect(previewText).toBeVisible();

  // Programmatic DOM range (deterministic, no mouse drag), then the real mouseup path.
  await page.evaluate(() => {
    const host = document.querySelector('.preview-content');
    const textNode = [...host.querySelectorAll('*')]
      .map(el => [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.includes('comparisons')))
      .find(Boolean);
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 17);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('.preview-content').first().dispatchEvent('mouseup');

  await expect(page.getByText("Preview highlighting isn't available.", { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Click here to switch to the Editor and lock this highlight.', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  // No draft was armed from the preview: composer shows whole-section, never a range.
  await expect(page.getByText(/Selected source range \d+\u2013\d+/)).toHaveCount(0);
  expect(state.posts).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});
