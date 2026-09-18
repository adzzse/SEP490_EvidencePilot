import { test, expect } from '@playwright/test';

// Every selection the source map cannot resolve must refuse with an honest
// banner — never a wrong anchor, never a silent no-op.
test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const MD_CONTENT = 'Energy $E=mc^2$ here.\n\n$$\nx^2\n$$\n\nSecond paragraph here.';
const TEX_CONTENT = [
  '\\section{Intro}',
  'A plain sentence here.',
  'A \\textbf{fish} here.',
  '$$y^2$$',
  '\\begin{table}\n\\begin{tabular}{c}\ncell \\textbf{bold}\n\\end{tabular}\n\\end{table}',
].join('\n\n');

async function setupRefusal(page, contentTex, filename) {
  const projectId = 'refusal-project';
  const paperId = 'refusal-paper';
  const sectionId = 'refusal-section';
  const roundId = 'refusal-round';
  const state = { errors: [], posts: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'refusal-fixture');
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
      json = { id: projectId, title: 'Refusal fixture', status: 'SUBMITTED_FOR_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Refusal paper', originalFilename: filename, processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === '/api/feedback-requests') {
      json = [{ id: roundId, projectId, status: 'PENDING', requestedAt: '2026-09-16T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${roundId}/submission-snapshot`) {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        papers: [{ id: paperId, title: 'Refusal paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex, contentVersion: 1,
        }] }],
      } };
    } else if (method === 'GET' && path === `/api/feedback-requests/${roundId}/feedback`) {
      json = [];
    } else if (method === 'POST' && path === `/api/feedback-requests/${roundId}/feedback`) {
      state.posts.push(JSON.parse(request.postData() || '{}'));
      return route.fulfill({ status: 200, json: { id: 'refused-should-not-exist' } });
    } else if (path === `/api/papers/${paperId}/references`
      || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else {
      return route.fulfill({ status: 404, json: { message: 'Unhandled fixture request' } });
    }

    return route.fulfill({ json });
  });

  await page.goto(`http://localhost:5173/instructor/requests/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText('here', { timeout: 15000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.preview-content')).toBeVisible();
  return state;
}

async function expectRefusal(page, state) {
  await page.locator('.preview-content').first().dispatchEvent('mouseup');
  await expect(page.getByText('cannot be attached precisely', { exact: false })).toBeVisible();
  await expect(page.getByText(/Line \d/, { exact: false })).toHaveCount(0);
  expect(state.posts).toEqual([]);
  expect(state.errors).toEqual([]);
}

async function selectNodeContents(page, selector, index = 0) {
  await page.evaluate(({ selector, index }) => {
    const el = [...document.querySelectorAll(selector)][index];
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, { selector, index });
}

test('markdown inline-math (KaTeX) refuses', async ({ page }) => {
  const state = await setupRefusal(page, MD_CONTENT, 'refusal.md');
  await expect(page.locator('.preview-content .katex').first()).toBeVisible();
  await selectNodeContents(page, '.preview-content .katex', 0);
  await expectRefusal(page, state);
});

test('markdown display-math refuses', async ({ page }) => {
  const state = await setupRefusal(page, MD_CONTENT, 'refusal.md');
  await expect(page.locator('.preview-content .katex-display').first()).toBeVisible();
  await selectNodeContents(page, '.preview-content .katex-display', 0);
  await expectRefusal(page, state);
});

test('legacy display-math refuses', async ({ page }) => {
  const state = await setupRefusal(page, TEX_CONTENT, 'refusal.tex');
  await expect(page.locator('.preview-content [data-display]').first()).toBeVisible();
  await selectNodeContents(page, '.preview-content [data-display]', 0);
  await expectRefusal(page, state);
});

test('legacy table cell refuses', async ({ page }) => {
  const state = await setupRefusal(page, TEX_CONTENT, 'refusal.tex');
  await expect(page.locator('.preview-content table').first()).toBeVisible();
  await selectNodeContents(page, '.preview-content table th, .preview-content table td', 0);
  await expectRefusal(page, state);
});

test('legacy cross-block range refuses', async ({ page }) => {
  const state = await setupRefusal(page, TEX_CONTENT, 'refusal.tex');
  await expect(page.locator('.preview-content strong').first()).toBeVisible();
  // Anchor in the heading, focus in the construct paragraph: one range, two
  // blocks — must refuse, never pick either side.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('Introduction'));
    const strong = document.querySelector('.preview-content strong');
    const range = document.createRange();
    range.setStart(heading.firstChild, 0);
    range.setEnd(strong.firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expectRefusal(page, state);
});

test('legacy plain prose refuses', async ({ page }) => {
  const state = await setupRefusal(page, TEX_CONTENT, 'refusal.tex');
  await expect(page.locator('.preview-content strong').first()).toBeVisible();
  // The construct-free paragraph has no scanned spans: nothing to expand to.
  await page.evaluate(() => {
    const para = [...document.querySelectorAll('.preview-content p')]
      .find(p => p.textContent.includes('A plain sentence here.'));
    const range = document.createRange();
    range.selectNodeContents(para.firstChild);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expectRefusal(page, state);
});
