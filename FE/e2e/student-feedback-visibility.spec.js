import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const baseUrl = 'http://localhost:5173';

const SEC1 = 'Member section text.';
const CONTENT = (body) => [body, ...Array.from({ length: 20 }, (_, i) => `Filler line ${i}.`)].join('\n\n');

async function setupStudent(page, { role, userId }) {
  const projectId = 'student-proj';
  const paperId = 'student-paper';
  const state = { errors: [], feedbackCalls: [] };

  const thread = (id, requestId, sectionId, assignee, content, createdAt) => ({
    id, requestId, sectionId, content, createdAt,
    updatedAt: createdAt, threadState: 'OPEN', pendingState: null,
    publishedAt: createdAt, lineReference: null,
    anchor: {
      original: { representation: 'latex-source-lf-v1', offsetUnit: 'utf16', contentVersion: 1,
        fingerprint: '0'.repeat(64), from: 0, to: 6, exact: 'Member', prefix: '', suffix: ' section text.' },
      current: { status: 'ATTACHED', contentVersion: 1, fingerprint: '0'.repeat(64), from: 0, to: 6 },
    },
    studentStatus: null, studentNote: null, attachments: [],
    replies: [{ id: `${id}-reply`, authorName: 'Instructor', authorRole: 'INSTRUCTOR',
      content: `Legacy reply on ${id}.`, createdAt }],
    assignedUserId: assignee, assignedUserName: assignee === 'member-1' ? 'Member One' : 'Member Two',
    sectionTitle: sectionId === 'sec-1' ? 'Introduction' : 'Methods',
    instructorName: 'Test Instructor',
    canEdit: false, canDelete: false,
  });

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ token, role: userRole, uid }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', userRole);
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
    localStorage.setItem('user_id', uid);
  }, { token: 'student-fixture', role: 'STUDENT', uid: userId });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let json;

    if (path === '/api/users/profile') {
      json = { id: userId, role: 'STUDENT', firstName: 'Test', lastName: 'Student' };
    } else if (path === '/api/notifications' || path === '/api/review-guides'
      || path === `/api/projects/${projectId}/evidence-traces`
      || path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === '/api/projects') {
      json = { content: [{ id: projectId, title: 'Student fixture', status: 'RETURNED', currentUserRole: role }], last: true };
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'Student fixture', status: 'RETURNED', currentUserRole: role };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Student paper', originalFilename: 'student.tex', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === `/api/papers/${paperId}/sections`) {
      json = [
        { id: 'sec-1', documentId: paperId, sectionTitle: 'Introduction', sectionOrder: 0,
          contentTex: CONTENT(SEC1), version: 1, assignedUserId: 'member-1', active: true },
        { id: 'sec-2', documentId: paperId, sectionTitle: 'Methods', sectionOrder: 1,
          contentTex: CONTENT('Other section text.'), version: 1, assignedUserId: 'member-2', active: true },
      ];
    } else if (path === '/api/feedback-requests') {
      json = [
        { id: 'round-2', projectId, status: 'RETURNED', requestedAt: '2026-09-17T08:00:00Z' },
        { id: 'round-1', projectId, status: 'RETURNED', requestedAt: '2026-09-16T08:00:00Z' },
      ];
    } else if (method === 'GET' && path === '/api/feedback-requests/round-2/feedback') {
      state.feedbackCalls.push('round-2');
      json = [
        thread('own-new', 'round-2', 'sec-1', 'member-1', 'Own section feedback.', '2026-09-17T09:00:00Z'),
        thread('other-new', 'round-2', 'sec-2', 'member-2', 'Other section feedback.', '2026-09-17T09:00:00Z'),
      ];
    } else if (method === 'GET' && path === '/api/feedback-requests/round-1/feedback') {
      state.feedbackCalls.push('round-1');
      json = [thread('old-item', 'round-1', 'sec-1', 'member-1', 'Old round feedback.', '2026-09-16T09:00:00Z')];
    } else if (path === `/api/papers/${paperId}/references`
      || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else {
      return route.fulfill({ status: 404, json: { message: 'Unhandled fixture request' } });
    }

    return route.fulfill({ json });
  });

  return { projectId, state };
}

async function openStudentFeedback(page, projectId, expectedText = 'Member section text.') {
  await page.goto(`${baseUrl}/student/projects/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText(expectedText, { timeout: 15000 });
  await page.locator('[data-tour="editor-feedback"]').click();
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
}

test('Member sees only latest returned own-section feedback, no status or round controls', async ({ page }) => {
  const { projectId, state } = await setupStudent(page, { role: 'MEMBER', userId: 'member-1' });
  await openStudentFeedback(page, projectId);
  const scroller = page.locator('[data-testid="feedback-scroller"]');

  await expect(scroller.getByText('Own section feedback.')).toBeVisible();
  await expect(page.getByText('Other section feedback.')).toHaveCount(0);
  await expect(page.getByText('Old round feedback.')).toHaveCount(0);
  // No obsolete thread-status filter and no round selector for members.
  await expect(page.getByLabel('Feedback status')).toHaveCount(0);
  await expect(page.locator('select[aria-label="Review round"]')).toHaveCount(0);
  await expect(page.getByText('Round 2 · Returned', { exact: true })).toBeVisible();
  // No status chips or assignee line on the member card.
  await expect(page.getByText('Open', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Assignee:/)).toHaveCount(0);
  // Passage block, legacy discussion collapsed.
  await expect(scroller.getByText('Passage', { exact: true })).toBeVisible();
  await scroller.getByText('Own section feedback.').click();
  await expect(scroller.getByText('Legacy discussion')).toBeVisible();
  await scroller.getByText('Legacy discussion').click();
  await expect(scroller.getByText('Legacy reply on own-new.')).toBeVisible();
  // Historical round is never fetched for the member view.
  await expect.poll(() => state.feedbackCalls).toContain('round-2');
  expect(state.feedbackCalls).not.toContain('round-1');
  expect(state.errors).toEqual([]);
});

test('Leader sees whole project one round at a time with assignee context', async ({ page }) => {
  const { projectId, state } = await setupStudent(page, { role: 'LEADER', userId: 'leader-1' });
  await page.goto(`${baseUrl}/student/projects/${projectId}`);
  // Leaders start with no assignment: open the section explicitly.
  await page.locator('[data-tour="file-panel"]').getByText('Introduction').click();
  await expect(page.locator('.cm-content')).toContainText('Member section text.', { timeout: 15000 });
  await page.locator('[data-tour="editor-feedback"]').click();
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
  const scroller = page.locator('[data-testid="feedback-scroller"]');

  // Defaults to the latest returned round: both sections, assignee shown.
  await page.getByLabel('Feedback scope').selectOption('project');
  await expect(scroller.getByText('Own section feedback.')).toBeVisible();
  await expect(scroller.getByText('Other section feedback.')).toBeVisible();
  await expect(scroller.getByText(/Assignee:/).first()).toBeVisible();
  await expect(page.getByText('Old round feedback.')).toHaveCount(0);

  // Explicit round switch replaces the dataset, never merges.
  await page.getByLabel('Review round').selectOption('round-1');
  await expect(scroller.getByText('Old round feedback.')).toBeVisible();
  await expect(page.getByText('Own section feedback.')).toHaveCount(0);
  await expect(page.getByText('Other section feedback.')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('Feedback panel is a compact stacked list with same-row filters', async ({ page }) => {
  const { projectId, state } = await setupStudent(page, { role: 'LEADER', userId: 'leader-1' });
  await page.goto(`${baseUrl}/student/projects/${projectId}`);
  await page.locator('[data-tour="file-panel"]').getByText('Introduction').click();
  await expect(page.locator('.cm-content')).toContainText('Member section text.', { timeout: 15000 });
  await page.locator('[data-tour="editor-feedback"]').click();
  const panel = page.locator('#student-feedback-panel');
  await expect(panel).toBeVisible();
  const scroller = page.locator('[data-testid="feedback-scroller"]');

  // Filters are always visible in one row container — no collapsed <details>.
  const grid = panel.locator('div.grid').first();
  await expect(grid.getByLabel('Feedback scope')).toBeVisible();
  await expect(grid.getByLabel('Review round')).toBeVisible();
  // Defaults: This section + latest returned round.
  await expect(grid.getByLabel('Feedback scope')).toHaveValue('section');
  await expect(grid.getByLabel('Review round')).toHaveValue('round-2');
  // Filter row sits directly above the card list in DOM order.
  const filtersAboveList = await grid.evaluate((node, scrollerSelector) => {
    const scrollerNode = document.querySelector(scrollerSelector);
    return Boolean(node.compareDocumentPosition(scrollerNode) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, '[data-testid="feedback-scroller"]');
  expect(filtersAboveList).toBe(true);

  // Stacked cards in section scope: activate the card, then assert normal
  // flow (no absolute anchor-mirroring) and no connector element.
  await scroller.getByText('Own section feedback.').click();
  const sectionCards = scroller.locator('article[data-feedback-card]');
  await expect(sectionCards.first()).not.toHaveCSS('position', 'absolute');
  await expect(sectionCards.locator('svg')).toHaveCount(0);

  // Two visible cards, no Go-to dropdown, no overlap buttons, no offscreen note.
  await page.getByLabel('Feedback scope').selectOption('project');
  await expect(scroller.getByText('Own section feedback.')).toBeVisible();
  await expect(scroller.getByText('Other section feedback.')).toBeVisible();
  const cards = scroller.locator('article[data-feedback-card]');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).not.toHaveCSS('position', 'absolute');
  await expect(cards.locator('svg')).toHaveCount(0);
  await expect(panel.locator('select[aria-label="Go to feedback"]')).toHaveCount(0);
  await expect(panel.getByText('Feedback on this passage')).toHaveCount(0);
  await expect(panel.getByText(/outside the editor view/)).toHaveCount(0);
  expect(state.errors).toEqual([]);
});
