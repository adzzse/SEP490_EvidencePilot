import { test, expect } from '@playwright/test';

// Cross-renderer parity: the same logical passage selected in either renderer
// arms that dialect's exact canonical offsets, and the same unmappable class
// refuses in both. A renderer change that shifts anchors breaks here, loudly.
test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

// Markdown: 'A **fish** …' — second fish at 39..43.
// Legacy: '\section{Parity}\nA \textbf{fish} …' — second fish at 59..72.
const DIALECTS = [
  {
    name: 'markdown',
    contentTex: 'A **fish** is different from another **fish**.',
    mathTex: 'Energy $E=mc^2$ here.',
    secondFish: { from: 39, to: 43 },
    pin: page => expect(page.locator('.preview-content [data-ss]').first()).toBeVisible(),
  },
  {
    name: 'latex',
    contentTex: '\\section{Parity}\nA \\textbf{fish} is different from another \\textbf{fish}.',
    mathTex: '\\section{Math}\nEnergy $E=mc^2$ here.',
    secondFish: { from: 59, to: 72 },
    pin: page => expect(page.locator('.preview-content strong')).toHaveCount(2),
  },
];

async function setupParity(page, contentTex, waitText) {
  const projectId = 'parity-project';
  const paperId = 'parity-paper';
  const sectionId = 'parity-section';
  const roundId = 'parity-round';
  const state = { errors: [], posts: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'parity-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json;

    if (path === '/api/users/profile') {
      json = { id: 'instructor-one', role: 'INSTRUCTOR', firstName: 'Test', lastName: 'Instructor' };
    } else if (path === '/api/notifications' || path === '/api/review-guides'
      || path === `/api/projects/${projectId}/evidence-traces`
      || path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'Parity fixture', status: 'SUBMITTED_FOR_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Parity paper', originalFilename: 'parity', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === '/api/feedback-requests') {
      json = [{ id: roundId, projectId, status: 'PENDING', requestedAt: '2026-09-16T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${roundId}/submission-snapshot`) {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        papers: [{ id: paperId, title: 'Parity paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex, contentVersion: 1,
        }] }],
      } };
    } else if (method === 'GET' && path === `/api/feedback-requests/${roundId}/feedback`) {
      json = [];
    } else if (method === 'POST' && path === `/api/feedback-requests/${roundId}/feedback`) {
      const body = JSON.parse(request.postData() || '{}');
      state.posts.push(body);
      json = { id: 'parity-created', requestId: roundId, sectionId, content: body.content,
        createdAt: '2026-09-16T09:00:00Z', threadState: 'OPEN', pendingState: null,
        publishedAt: null, lineReference: null, anchor: body.anchor,
        studentStatus: null, studentNote: null, attachments: [], replies: [],
        canMarkDone: false, canReopen: false, canEdit: true, canDelete: true };
    } else if (path === `/api/papers/${paperId}/references`
      || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else {
      return route.fulfill({ status: 404, json: { message: 'Unhandled fixture request' } });
    }

    return route.fulfill({ json });
  });

  await page.goto(`http://localhost:5173/instructor/requests/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText(waitText, { timeout: 15000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.preview-content')).toBeVisible();
  return state;
}

for (const dialect of DIALECTS) {
  test(`${dialect.name}: second fish arms the dialect's exact offsets`, async ({ page }) => {
    const state = await setupParity(page, dialect.contentTex, 'another');
    await dialect.pin(page);

    // Identical logical selection in both renderers: the second bold "fish".
    await page.evaluate(() => {
      const second = [...document.querySelectorAll('.preview-content strong')][1];
      const range = document.createRange();
      range.selectNodeContents(second.firstChild);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator('.preview-content').first().dispatchEvent('mouseup');

    await expect(page.getByText(/Line \d/, { exact: false }).first()).toBeVisible();
    await page.getByPlaceholder('Write feedback on the selected passage').fill('Second fish note.');
    await page.getByRole('button', { name: 'Save feedback', exact: true }).click();

    await expect.poll(() => state.posts.length).toBe(1);
    expect(state.posts[0].anchor.from).toBe(dialect.secondFish.from);
    expect(state.posts[0].anchor.to).toBe(dialect.secondFish.to);
    expect(state.posts[0].anchor.contentVersion).toBe(1);
    expect(state.errors).toEqual([]);
  });

  test(`${dialect.name}: inline math refuses like the other renderer`, async ({ page }) => {
    const state = await setupParity(page, dialect.mathTex, 'Energy');
    await expect(page.locator('.preview-content .katex').first()).toBeVisible();

    await page.evaluate(() => {
      const el = document.querySelector('.preview-content .katex');
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator('.preview-content').first().dispatchEvent('mouseup');

    await expect(page.getByText('cannot be attached precisely', { exact: false })).toBeVisible();
    await expect(page.getByText(/Line \d/, { exact: false })).toHaveCount(0);
    expect(state.posts).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}
