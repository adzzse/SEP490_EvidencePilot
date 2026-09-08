import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const root = 'http://localhost:5173/instructor/requests/instructor-feedback-project';
const submittedTarget = 'Submitted target source with an older feedback.';
const workingTarget = 'Working target source with the student changes.';

function anchor(content, phrase, version) {
  const from = content.indexOf(phrase);
  const to = from + phrase.length;
  const fingerprint = createHash('sha256').update(content).digest('hex');
  return {
    original: { representation: 'latex-source-lf-v1', offsetUnit: 'utf16', contentVersion: version, fingerprint, from, to, exact: phrase,
      prefix: content.slice(Math.max(0, from - 64), from), suffix: content.slice(to, to + 64) },
    current: { status: 'ATTACHED', contentVersion: version, fingerprint, from, to },
  };
}

async function setup(page) {
  const state = {
    errors: [],
    returnCalls: 0,
    requests: [
      { id: 'round-one', projectId: 'instructor-feedback-project', status: 'PENDING', requestedAt: '2026-09-07T10:00:00' },
      { id: 'round-old', projectId: 'instructor-feedback-project', status: 'RETURNED', requestedAt: '2026-09-06T10:00:00' },
    ],
    feedback: [{
      id: 'feedback-old', requestId: 'round-old', paperId: 'paper-one', sectionId: 'section-two', sectionTitle: 'Methods',
      content: 'Existing feedback', publishedAt: '2026-09-06T10:30:00', threadState: 'OPEN', revision: 1,
      replyState: 'ANSWERED', canDraftReply: false, canMarkDone: true, canReopen: false, canEdit: false, canDelete: false,
      anchor: anchor(submittedTarget, 'target source', 1),
      messages: [
        { id: 'feedback-old', kind: 'ROOT', authorId: 'instructor', authorRole: 'INSTRUCTOR', authorName: 'Test Instructor', content: 'Existing feedback', createdAt: '2026-09-06T10:30:00', publishedAt: '2026-09-06T10:30:00', draft: false },
        { id: 'student-old', kind: 'REPLY', authorId: 'student', authorRole: 'STUDENT', authorName: 'Test Student', content: 'Student response', createdAt: '2026-09-06T11:00:00', publishedAt: '2026-09-06T11:00:00', draft: false },
      ],
    }],
  };
  const project = { id: 'instructor-feedback-project', title: 'Instructor feedback fixture', status: 'IN_REVIEW' };
  const snapshot = { state: 'AVAILABLE', snapshot: { schemaVersion: 1, projectId: 'instructor-feedback-project', papers: [{ id: 'paper-one', title: 'Paper', sections: [
    { id: 'section-one', title: 'Introduction', order: 0, contentTex: 'Submitted introduction.', contentVersion: 1 },
    { id: 'section-two', title: 'Methods', order: 1, contentTex: submittedTarget, contentVersion: 1 },
  ] }] } };
  const liveSections = [
    { id: 'section-one', sectionTitle: 'Introduction', sectionOrder: 0, contentTex: 'Working introduction.', version: 2 },
    { id: 'section-two', sectionTitle: 'Methods', sectionOrder: 1, contentTex: workingTarget, version: 2 },
  ];

  page.on('pageerror', error => state.errors.push(error.message));
  await page.routeWebSocket(/ws/, () => {});
  await page.addInitScript(() => {
    localStorage.setItem('token', 'instructor-browser-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json = [];
    if (path === '/api/users/profile') json = { id: 'instructor', role: 'INSTRUCTOR', firstName: 'Test', lastName: 'Instructor' };
    else if (path === '/api/notifications') json = [{ id: 'notice-one', actionType: 'INSTRUCTOR_FEEDBACK_PUBLISHED', entityId: 'round-one', feedbackId: 'feedback-old', message: 'Open feedback thread', read: false, createdAt: '2026-09-07T10:30:00' }];
    else if (path === '/api/notifications/unread-count') json = { count: 1 };
    else if (path === '/api/notifications/notice-one/read' && method === 'PATCH') json = { id: 'notice-one', read: true };
    else if (path === '/api/review-guides') json = [];
    else if (path === '/api/projects/instructor-feedback-project') json = project;
    else if (path === '/api/projects/instructor-feedback-project/papers') json = [{ id: 'paper-one', title: 'Paper', originalFilename: 'paper.tex' }];
    else if (path === '/api/projects/instructor-feedback-project/sources') json = { content: [], last: true };
    else if (path === '/api/media/projects/instructor-feedback-project') json = [];
    else if (path === '/api/feedback-requests') json = state.requests;
    else if (path === '/api/feedback-requests/round-old/submission-snapshot') json = snapshot;
    else if (path === '/api/feedback-requests/round-one/submission-snapshot') json = snapshot;
    else if (path === '/api/papers/paper-one/sections') json = liveSections;
    else if (/^\/api\/feedback-requests\/[^/]+\/feedback$/.test(path) && method === 'GET') {
      json = state.feedback.filter(item => item.requestId === path.split('/').at(-2));
    } else if (path === '/api/feedback-requests/round-one/feedback' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({ sectionId: 'section-two', content: 'Draft root feedback' });
      const rootFeedback = {
        id: 'feedback-new', requestId: 'round-one', paperId: 'paper-one', sectionId: body.sectionId, sectionTitle: 'Methods',
        content: body.content, publishedAt: null, threadState: 'OPEN', revision: 0,
        replyState: 'UNKNOWN', canDraftReply: false, canMarkDone: false, canReopen: false, canEdit: true, canDelete: true,
        anchor: null,
        messages: [{ id: 'feedback-new', kind: 'ROOT', authorId: 'instructor', authorRole: 'INSTRUCTOR', authorName: 'Test Instructor', content: body.content, createdAt: '2026-09-07T10:40:00', publishedAt: null, draft: true }],
      };
      state.feedback.push(rootFeedback);
      json = rootFeedback;
    } else if (path === '/api/feedback-requests/round-one/status' && method === 'PATCH') {
      state.returnCalls += 1;
      state.requests[0] = { ...state.requests[0], status: 'RETURNED' };
      for (const feedback of state.feedback) {
        if (!feedback.publishedAt) feedback.publishedAt = '2026-09-07T11:00:00';
        feedback.canDraftReply = false;
        feedback.canMarkDone = false;
        feedback.messages = feedback.messages.map(message => message.draft
          ? { ...message, draft: false, publishedAt: '2026-09-07T11:00:00' }
          : message);
      }
      json = state.requests[0];
    }
    else { state.errors.push(`Unexpected API: ${method} ${path}`); return route.fulfill({ status: 501, json: { message: 'Unexpected fixture endpoint' } }); }
    await route.fulfill({ json });
  });
  return state;
}

test('a query-only review link opens its project and selected round', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/api/projects?*', route => route.fulfill({ json: { content: [{ id: 'instructor-feedback-project', title: 'Instructor feedback fixture' }] } }));
  await page.goto('http://localhost:5173/instructor/requests/?review=round-old&feedback=feedback-old');
  await expect(page.getByRole('region', { name: 'Project workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Returned/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Existing feedback', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('the previously generated project query opens the latest review for that project', async ({ page }) => {
  const state = await setup(page);
  state.requests.reverse();
  await page.route('**/api/projects?*', route => route.fulfill({ json: { content: [{ id: 'instructor-feedback-project', title: 'Instructor feedback fixture' }] } }));
  await page.goto('http://localhost:5173/instructor/requests/?review=instructor-feedback-project');
  await expect(page.getByRole('region', { name: 'Project workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pending/ })).toHaveAttribute('aria-pressed', 'true');
  expect(state.errors).toEqual([]);
});

test('review queue links preserve the project and the selected round', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/api/projects?*', route => route.fulfill({ json: { content: [{ id: 'instructor-feedback-project', title: 'Instructor feedback fixture' }] } }));
  await page.goto('http://localhost:5173/instructor/requests');
  const row = page.getByRole('row').filter({ hasText: 'Returned' });
  await expect(row.getByRole('link', { name: 'Review', exact: true })).toHaveAttribute('href', '/instructor/requests/instructor-feedback-project?review=round-old');
  await row.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Project workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Returned/ })).toHaveAttribute('aria-pressed', 'true');
  expect(state.errors).toEqual([]);
});

test('instructor views both versions, drafts a thread, returns it, and follows a feedback notification', async ({ page }) => {
  const state = await setup(page);
  await page.goto(root);

  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByText('Open feedback thread', { exact: true }).click();
  await expect(page.getByText('Existing feedback', { exact: true })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText(submittedTarget);

  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(workingTarget);
  await page.getByRole('button', { name: 'Submitted version', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(submittedTarget);

  await page.getByPlaceholder('Feedback for this section...').fill('Draft root feedback');
  await page.getByRole('button', { name: 'Add feedback', exact: true }).click();
  await expect(page.getByText('Draft root feedback', { exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Reply as draft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return for Revision', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return for Revision', exact: true })).toHaveCount(0);
  expect(state.returnCalls).toBe(1);

  await page.goto(`${root}?review=round-one&feedback=feedback-old`);
  await expect(page.getByText('Existing feedback', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('root drafts and their selected source stay with their section and round', async ({ page }) => {
  await setup(page);
  let posted;
  await page.route('**/api/feedback-requests/round-one/feedback', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    await route.fulfill({ json: { id: 'captured', ...posted } });
  });
  await page.route('**/api/feedback-requests/round-old/submission-snapshot', route => route.fulfill({ json: {
    state: 'AVAILABLE', snapshot: { schemaVersion: 1, projectId: 'instructor-feedback-project', papers: [{ id: 'paper-one', title: 'Paper', sections: [
      { id: 'section-one', title: 'Introduction', order: 0, contentTex: 'Old introduction.', contentVersion: 0 },
    ] }] },
  } }));
  await page.goto(root);
  await expect(page.locator('.cm-content')).toContainText('Submitted introduction.');
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/codemirror.js');
    EditorView.findFromDOM(document.querySelector('.cm-content')).dispatch({ selection: { anchor: 0, head: 9 } });
  });
  await page.getByRole('button', { name: 'Comment selected text', exact: true }).click();
  await page.getByPlaceholder('Feedback for this section...').fill('Comment for Introduction');
  await page.locator('[data-tour="file-panel"]').getByRole('button', { name: 'Methods', exact: true }).click();
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Add feedback', exact: true })).toBeDisabled();
  await page.locator('[data-tour="file-panel"]').getByRole('button', { name: 'Introduction', exact: true }).click();
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveValue('Comment for Introduction');
  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Working introduction.');
  await page.getByRole('button', { name: 'Submitted version', exact: true }).click();
  await page.getByRole('button', { name: /Returned/ }).click();
  await expect(page.locator('.cm-content')).toContainText('Old introduction.');
  await page.getByRole('button', { name: /Pending/ }).click();
  await expect(page.locator('.cm-content')).toContainText('Submitted introduction.');
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveValue('Comment for Introduction');
  await page.getByRole('button', { name: 'Add feedback', exact: true }).click();
  await expect.poll(() => posted).toBeTruthy();
  expect(posted).toMatchObject({ sectionId: 'section-one', content: 'Comment for Introduction',
    anchor: { from: 0, to: 9, contentVersion: 1, fingerprint: createHash('sha256').update('Submitted introduction.').digest('hex') } });
});

test('old feedback selects its passage in each viewed snapshot without using live offsets', async ({ page }) => {
  const state = await setup(page);
  const newer = 'A newly inserted preface. ' + submittedTarget;
  const original = state.feedback[0].anchor;
  state.feedback[0].anchor = { original: original.original, current: anchor(newer, 'target source', 2).current };
  const snapshot = (text, version) => ({ state: 'AVAILABLE', snapshot: { schemaVersion: 1, projectId: 'instructor-feedback-project', papers: [{ id: 'paper-one', title: 'Paper', sections: [
    { id: 'section-two', title: 'Methods', order: 0, contentTex: text, contentVersion: version },
  ] }] } });
  await page.route('**/api/feedback-requests/round-one/submission-snapshot', route => route.fulfill({ json: snapshot(newer, 2) }));
  await page.route('**/api/feedback-requests/round-old/submission-snapshot', route => route.fulfill({ json: snapshot(submittedTarget, 1) }));
  const selection = () => page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-content'));
    const { from, to } = view.state.selection.main;
    return { from, text: view.state.sliceDoc(from, to) };
  });
  await page.goto(root);
  await expect(page.locator('.cm-content')).toContainText(newer);
  await page.getByText('Existing feedback', { exact: true }).click();
  await expect.poll(selection).toEqual({ from: newer.indexOf('target source'), text: 'target source' });
  await page.getByRole('button', { name: /Returned/ }).click();
  await expect(page.locator('.cm-content')).toHaveText(submittedTarget);
  await expect.poll(selection).toEqual({ from: original.original.from, text: 'target source' });
  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(workingTarget);
  await expect.poll(selection).toMatchObject({ text: '' });
  await expect(page.locator('.cm-feedback-active')).toHaveCount(0);
});

test('history opens a DONE root in its original round and retains legacy replies', async ({ page }) => {
  const state = await setup(page);
  state.feedback[0].threadState = 'DONE';
  await page.goto(root);
  await page.getByRole('button', { name: /History/i, exact: true }).click();
  await page.getByRole('button', { name: /Existing feedback.*Student response/ }).click();
  await expect(page.getByRole('button', { name: /Returned/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Existing feedback', { exact: true })).toBeVisible();
  await page.getByText('Published reply history / legacy drafts', { exact: true }).click();
  await expect(page.getByText('Student response', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('a returned unchanged submission offers Approve without a second Return', async ({ page }) => {
  const state = await setup(page);
  state.requests[0].status = 'RETURNED';
  state.feedback[0] = { ...state.feedback[0], threadState: 'DONE', canMarkDone: false, canReopen: true, canDraftReply: false };
  await page.route('**/api/projects/instructor-feedback-project', route => route.fulfill({ json: {
    id: 'instructor-feedback-project', title: 'Unchanged returned fixture', status: 'RETURNED',
  } }));
  await page.goto(root);
  await expect(page.getByRole('region', { name: 'Submitted paper' })).toContainText('Submitted introduction.');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return for Revision', exact: true })).toHaveCount(0);
});

test('instructor reads the full submitted paper in the shared workspace', async ({ page }) => {
  await setup(page);
  await page.goto(root);
  const workspace = page.getByRole('region', { name: 'Project workspace', exact: true });
  await expect(workspace).toBeVisible();
  await page.locator('#editor-preview-container').getByRole('button', { name: 'View full paper', exact: true }).click();
  const paper = page.getByRole('dialog', { name: 'View full paper', exact: true });
  await expect(paper).toContainText('Submitted introduction.');
  await expect(paper).toContainText(submittedTarget);
  await expect(workspace.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reply as draft', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-full-paper.png' });
  await paper.getByRole('button', { name: 'Comment on a passage · Methods', exact: true }).click();
  await expect(paper).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText(submittedTarget);
  await expect(page.getByRole('button', { name: 'Return for Revision', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('#editor-preview-container').getByRole('heading', { name: 'Methods', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View full paper', exact: true }).click();
  await expect(paper).toContainText(submittedTarget);
  await page.keyboard.press('Escape');
  await expect(paper).toHaveCount(0);
  await page.getByRole('button', { name: /toggle context panel/i }).click();
  await expect(page.getByRole('button', { name: 'Return for Revision', exact: true })).toBeVisible();
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-mobile-panel.png' });
});

test('snapshot errors and legacy rounds never fall back to live content under Submitted', async ({ page }) => {
  const state = await setup(page);
  let failure = true;
  await page.route('**/api/feedback-requests/round-one/submission-snapshot', route => failure
    ? route.fulfill({ status: 503, json: { message: 'Snapshot unavailable' } })
    : route.fulfill({ json: { state: 'LEGACY_NO_SNAPSHOT' } }));
  await page.goto(root);
  await expect(page.getByRole('alert')).toContainText('snapshot');
  await expect(page.getByRole('region', { name: 'Submitted paper', exact: true })).not.toContainText('Working introduction.');
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveCount(0);
  failure = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no submission snapshot');
  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved working copy', exact: true })).toContainText('Working introduction.');
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('a template paper with a null title still displays its submitted snapshot', async ({ page }) => {
  await setup(page);
  await page.route('**/api/feedback-requests/round-one/submission-snapshot', route => route.fulfill({ json: {
    state: 'AVAILABLE', snapshot: { schemaVersion: 1, projectId: 'instructor-feedback-project', papers: [
      { id: 'paper-one', title: null, sections: [{ id: 'section-one', title: 'Introduction', order: 0, contentTex: 'Template snapshot body.', contentVersion: 1 }] },
    ] },
  } }));
  await page.goto(root);
  await expect(page.getByRole('region', { name: 'Submitted paper', exact: true })).toContainText('Template snapshot body.');
});

test('review ignores student local drafts and makes no paper writes in either view', async ({ page }) => {
  const state = await setup(page);
  const writes = [];
  page.on('request', request => { if (['PUT', 'PATCH', 'POST', 'DELETE'].includes(request.method()) && /\/api\/papers\//.test(request.url())) writes.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem('workspace_draft_instructor-feedback-project_section-one', 'PRIVATE UNSAVED STUDENT TEXT'));
  await page.goto(root);
  await expect(page.locator('.cm-content')).toContainText('Submitted introduction.');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByText('Read-only (unassigned)', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Citation Review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Working introduction.');
  await expect(page.locator('.cm-content')).not.toContainText('PRIVATE UNSAVED');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+s');
  await page.keyboard.insertText('MUST NOT WRITE');
  await expect(page.locator('.cm-content')).not.toContainText('MUST NOT WRITE');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-tour="header-history"]')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('a late snapshot response cannot replace the newly selected round', async ({ page }) => {
  const state = await setup(page);
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/api/feedback-requests/round-one/submission-snapshot', async route => {
    requested = true;
    await delayed;
    await route.fulfill({ json: { state: 'AVAILABLE', snapshot: { schemaVersion: 1, projectId: 'instructor-feedback-project', papers: [{ id: 'paper-one', title: 'Paper', sections: [{ id: 'section-one', title: 'Introduction', order: 0, contentTex: 'Late newest snapshot', contentVersion: 2 }] }] } } });
  });
  await page.goto(root);
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: /Returned/ }).click();
  await expect(page.getByRole('region', { name: 'Submitted paper', exact: true })).toContainText('Submitted introduction.');
  release();
  await expect(page.getByRole('region', { name: 'Submitted paper', exact: true })).not.toContainText('Late newest snapshot');
  expect(state.errors).toEqual([]);
});

test('review uses the Student editor and context tabs while keeping drafts across tabs', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/api/review-guides', route => route.fulfill({ json: [{ sectionType: 'Introduction', guidance: 'Check that the research problem is clear.', checklist: ['The problem is stated.'] }] }));
  await page.route('**/api/projects/instructor-feedback-project/sources?*', route => route.fulfill({ json: { content: [{ id: 'source-one', originalFilename: 'Research source.pdf', fileUrl: 'stored', processingStatus: 'READY' }], last: true } }));
  await page.route('**/api/media/projects/instructor-feedback-project', route => route.fulfill({ json: [{ id: 'media-one', texFilename: 'chart.png' }] }));
  await page.route('**/api/media/urls', route => route.fulfill({ json: {} }));
  await page.goto(root);
  await expect(page.getByRole('region', { name: 'Project workspace', exact: true })).toBeVisible();
  const context = page.locator('[data-tour="context-panel"]');
  await expect(context).toBeVisible();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Delete media', exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Feedback for this section...').fill('Keep this review draft');
  await context.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(context).toContainText('Research source.pdf');
  await expect(context.getByRole('button', { name: 'Insert source', exact: true })).toHaveCount(0);
  await context.getByRole('button', { name: 'Requirements', exact: true }).click();
  await expect(context).toContainText('Check that the research problem is clear.');
  await context.getByRole('checkbox', { name: 'The problem is stated.', exact: true }).check();
  await context.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveValue('Keep this review draft');
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-shared-workspace.png' });
  await page.setViewportSize({ width: 1680, height: 1000 });
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('#editor-preview-container').getByRole('heading', { name: 'Introduction', exact: true })).toBeVisible();
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-editor-preview.png' });
  await context.getByRole('button', { name: 'Requirements', exact: true }).click();
  await expect(context.getByRole('checkbox', { name: 'The problem is stated.', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'VN', exact: true }).click();
  await expect(context.getByRole('button', { name: 'Yêu cầu', exact: true })).toBeVisible();
  await page.locator('[data-tour="header-dark-mode"]').click();
  await expect(page.locator('#editor-preview-container').getByRole('heading', { name: 'Introduction', exact: true })).toBeInViewport();
  await page.locator('#editor-preview-container h2').screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/preview-heading.png', animations: 'disabled' });
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-guide-vi-dark.png', animations: 'disabled' });
  await page.locator('[data-tour="context-review-tab"]').click();
  await page.setViewportSize({ width: 390, height: 850 });
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await expect(page.getByRole('button', { name: 'Thêm phản hồi', exact: true })).toBeVisible();
  expect(await context.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: '../../artifacts/codex/review-ui-rework-01a080e9/instructor-review-vi-mobile.png' });
  expect(state.errors).toEqual([]);
});
