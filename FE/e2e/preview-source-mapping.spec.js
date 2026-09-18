import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome' });

const MODULE_URL = 'http://localhost:5173/src/utils/previewSelection.js';

async function resolveOnContent(page, html, select) {
  await page.goto('http://localhost:5173/');
  await page.setContent(`<div id="preview">${html}</div>`);
  return page.evaluate(async ({ moduleUrl, select }) => {
    const mod = await import(moduleUrl);
    const host = document.querySelector('#preview');
    const texts = [...host.querySelectorAll('*')]
      .flatMap(el => [...el.childNodes].filter(n => n.nodeType === 3));
    const target = texts.find(n => n.textContent.includes(select.text));
    if (!target) return { harness: 'text-not-found' };
    const range = document.createRange();
    range.setStart(target, select.from);
    range.setEnd(target, select.to);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return mod.resolvePreviewRange(host);
    // eslint-disable-next-line no-unused-vars
  }, { moduleUrl: MODULE_URL, select }).catch(error => ({ harness: String(error).slice(0, 120) }));
}

test('exact plain-text selection maps to canonical offsets', async ({ page }) => {
  const result = await resolveOnContent(
    page,
    '<p><span data-ss="0" data-se="25">A fish is different here.</span></p>',
    { text: 'fish', from: 2, to: 6 },
  );
  expect(result).toEqual({ from: 2, to: 6 });
});

test('second duplicate occurrence maps by position, not search', async ({ page }) => {
  const result = await resolveOnContent(
    page,
    '<p><span data-ss="0" data-se="38">A fish is different from another fish.</span></p>',
    { text: 'another fish.', from: 33, to: 37 },
  );
  // An indexOf-based mapping would resolve to the first "fish" (2..6).
  expect(result).toEqual({ from: 33, to: 37 });
});

test('unmapped KaTeX-style output refuses honestly', async ({ page }) => {
  const result = await resolveOnContent(
    page,
    '<p><span data-ss="0" data-se="4">See </span><span class="katex">y</span></p>',
    { text: 'y', from: 0, to: 1 },
  );
  expect(result).toEqual({ unmappable: 'unmapped-content' });
});

test('empty selection refuses', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.setContent('<div id="preview"><p><span data-ss="0" data-se="5">Hello</span></p></div>');
  const result = await page.evaluate(async moduleUrl => {
    const mod = await import(moduleUrl);
    window.getSelection()?.removeAllRanges();
    return mod.resolvePreviewRange(document.querySelector('#preview'));
  }, MODULE_URL);
  expect(result).toEqual({ unmappable: 'empty-selection' });
});

const MD_SENTENCE = 'A fish is different from another fish.';
const MD_CONTENT = [MD_SENTENCE, '', 'Second paragraph here.', '', 'Third paragraph here.'].join('\n');

async function setupMarkdownPreview(page) {
  const projectId = 'md-preview-project';
  const paperId = 'md-paper';
  const sectionId = 'md-section';
  const roundId = 'md-round';
  const state = { errors: [], posts: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'md-preview-fixture');
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
      json = { id: projectId, title: 'Markdown preview fixture', status: 'SUBMITTED_FOR_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Preview paper', originalFilename: 'preview.md', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === '/api/feedback-requests') {
      json = [{ id: roundId, projectId, status: 'PENDING', requestedAt: '2026-09-16T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${roundId}/submission-snapshot`) {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        papers: [{ id: paperId, title: 'Preview paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex: MD_CONTENT, contentVersion: 1,
        }] }],
      } };
    } else if (method === 'GET' && path === `/api/feedback-requests/${roundId}/feedback`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/references`
      || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else if (method === 'POST' && path === `/api/feedback-requests/${roundId}/feedback`) {
      const body = JSON.parse(request.postData() || '{}');
      state.posts.push(body);
      json = { id: 'preview-created', requestId: roundId, sectionId, content: body.content,
        createdAt: '2026-09-16T09:00:00Z', threadState: 'OPEN', pendingState: null,
        publishedAt: null, lineReference: null, anchor: body.anchor,
        studentStatus: null, studentNote: null, attachments: [], replies: [],
        canMarkDone: false, canReopen: false, canEdit: true, canDelete: true };
    } else {
      return route.fulfill({ status: 404, json: { message: 'Unhandled fixture request' } });
    }

    return route.fulfill({ json });
  });

  return { projectId, state };
}

async function openMarkdownPreview(page, projectId) {
  await page.goto(`http://localhost:5173/instructor/requests/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText('another fish', { timeout: 15000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.preview-content').getByText(MD_SENTENCE, { exact: true })).toBeVisible();
}

async function previewDomSelect(page, text, from, to) {
  await page.evaluate(({ wanted, start, end }) => {
    const host = document.querySelector('.preview-content');
    const textNode = [...host.querySelectorAll('*')]
      .map(el => [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.includes(wanted)))
      .find(Boolean);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, { wanted: text, start: from, end: to });
  await page.locator('.preview-content').first().dispatchEvent('mouseup');
}

test('markdown preview selection arms the exact canonical range', async ({ page }) => {
  const { projectId, state } = await setupMarkdownPreview(page);
  await openMarkdownPreview(page, projectId);

  // Select "different" (source 10..19) inside the first paragraph's text node.
  // Offsets are DOM-node-relative; the paragraph renders as one text node.
  await previewDomSelect(page, 'A fish is different', 10, 19);
  await expect(page.getByText('Line 1', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Write feedback on the selected passage').fill('Word choice here.');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();

  await expect.poll(() => state.posts.length).toBe(1);
  const anchor = state.posts[0].anchor;
  expect(anchor.from).toBe(10);
  expect(anchor.to).toBe(19);
  expect(state.errors).toEqual([]);
});

test('markdown preview maps the second duplicate fish exactly', async ({ page }) => {
  const { projectId, state } = await setupMarkdownPreview(page);
  await openMarkdownPreview(page, projectId);

  // The second "fish" lives at source 33..37 inside the same paragraph node.
  await previewDomSelect(page, 'another fish.', 33, 37);
  await expect(page.getByText('Line 1', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Write feedback on the selected passage').fill('Second fish is vague.');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();

  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0].anchor.from).toBe(33);
  expect(state.posts[0].anchor.to).toBe(37);
  expect(state.errors).toEqual([]);
});

test('markdown preview heading selection refuses honestly', async ({ page }) => {
  const { projectId, state } = await setupMarkdownPreview(page);
  await openMarkdownPreview(page, projectId);

  // The section heading renders outside .preview-content and carries no
  // source span: must refuse, never fabricate.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')]
      .find(h => h.textContent.includes('Introduction'));
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('.preview-content').first().dispatchEvent('mouseup');

  await expect(page.getByText('cannot be attached precisely', { exact: false })).toBeVisible();
  await expect(page.getByText(/Line \d/, { exact: false })).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

// \section{Introduction} (22) \n (1) 'A ' (2) → first \textbf{fish} at 25..38;
// ' is different from another ' (27) → second at 65..78. The legacy renderer
// (no text-node spans) maps structurally: nth <strong> ↔ nth scanned span.
const LATEX_CONTENT = '\\section{Introduction}\nA \\textbf{fish} is different from another \\textbf{fish}.';

async function setupLatexPreview(page) {
  const projectId = 'tex-preview-project';
  const paperId = 'tex-paper';
  const sectionId = 'tex-section';
  const roundId = 'tex-round';
  const state = { errors: [], posts: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'tex-preview-fixture');
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
      json = { id: projectId, title: 'LaTeX preview fixture', status: 'SUBMITTED_FOR_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Preview paper', originalFilename: 'preview.tex', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === '/api/feedback-requests') {
      json = [{ id: roundId, projectId, status: 'PENDING', requestedAt: '2026-09-16T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${roundId}/submission-snapshot`) {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        papers: [{ id: paperId, title: 'Preview paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex: LATEX_CONTENT, contentVersion: 1,
        }] }],
      } };
    } else if (method === 'GET' && path === `/api/feedback-requests/${roundId}/feedback`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/references`
      || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else if (method === 'POST' && path === `/api/feedback-requests/${roundId}/feedback`) {
      const body = JSON.parse(request.postData() || '{}');
      state.posts.push(body);
      json = { id: 'tex-created', requestId: roundId, sectionId, content: body.content,
        createdAt: '2026-09-16T09:00:00Z', threadState: 'OPEN', pendingState: null,
        publishedAt: null, lineReference: null, anchor: body.anchor,
        studentStatus: null, studentNote: null, attachments: [], replies: [],
        canMarkDone: false, canReopen: false, canEdit: true, canDelete: true };
    } else {
      return route.fulfill({ status: 404, json: { message: 'Unhandled fixture request' } });
    }

    return route.fulfill({ json });
  });

  return { projectId, state };
}

test('latex preview maps the second duplicate fish exactly', async ({ page }) => {
  const { projectId, state } = await setupLatexPreview(page);
  await page.goto(`http://localhost:5173/instructor/requests/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText('another', { timeout: 15000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  // Legacy path: real <strong> elements, no text-node source spans.
  await expect(page.locator('.preview-content strong')).toHaveCount(2);

  await page.evaluate(() => {
    const second = [...document.querySelectorAll('.preview-content strong')][1];
    const range = document.createRange();
    range.selectNodeContents(second.firstChild);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('.preview-content').first().dispatchEvent('mouseup');

  await expect(page.getByText('Line 2', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Write feedback on the selected passage').fill('Second fish is vague.');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();

  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0].anchor.from).toBe(65);
  expect(state.posts[0].anchor.to).toBe(78);
  expect(state.errors).toEqual([]);
});
