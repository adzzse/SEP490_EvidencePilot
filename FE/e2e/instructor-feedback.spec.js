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
      replyState: 'ANSWERED', canDraftReply: true, canMarkDone: true, canReopen: false, canEdit: false, canDelete: false,
      anchor: anchor(submittedTarget, 'target source', 1),
      messages: [
        { id: 'feedback-old', kind: 'ROOT', authorId: 'instructor', authorRole: 'INSTRUCTOR', authorName: 'Test Instructor', content: 'Existing feedback', createdAt: '2026-09-06T10:30:00', publishedAt: '2026-09-06T10:30:00', draft: false },
        { id: 'student-old', kind: 'REPLY', authorId: 'student', authorRole: 'STUDENT', authorName: 'Test Student', content: 'Student response', createdAt: '2026-09-06T11:00:00', publishedAt: '2026-09-06T11:00:00', draft: false },
      ],
    }],
  };
  const project = { id: 'instructor-feedback-project', title: 'Instructor feedback fixture', status: 'IN_REVIEW' };
  const snapshot = { state: 'AVAILABLE', snapshot: { papers: [{ id: 'paper-one', title: 'Paper', sections: [
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
    } else if (path === '/api/instructor-feedback/feedback-old/replies' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.content).toBe('Draft instructor reply');
      const reply = { id: 'reply-draft', kind: 'REPLY', authorId: 'instructor', authorRole: 'INSTRUCTOR', authorName: 'Test Instructor', content: body.content, createdAt: '2026-09-07T10:45:00', publishedAt: null, draft: true };
      state.feedback[0].messages.push(reply);
      json = reply;
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
    await route.fulfill({ json });
  });
  return state;
}

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

  await page.getByRole('button', { name: 'Reply as draft', exact: true }).click();
  await page.getByPlaceholder('Draft reply for the student…').fill('Draft instructor reply');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft instructor reply', { exact: true })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toHaveCount(2);

  await page.getByRole('button', { name: 'Return for Revision', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Draft', { exact: true })).toHaveCount(0);
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
    state: 'AVAILABLE', snapshot: { papers: [{ id: 'paper-one', title: 'Paper', sections: [
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
  await page.getByRole('button', { name: 'Methods', exact: true }).click();
  await expect(page.getByPlaceholder('Feedback for this section...')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Add feedback', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Introduction', exact: true }).click();
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
  const snapshot = (text, version) => ({ state: 'AVAILABLE', snapshot: { papers: [{ id: 'paper-one', title: 'Paper', sections: [
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

test('a returned unchanged submission offers Approve without a second Return', async ({ page }) => {
  const state = await setup(page);
  state.requests[0].status = 'RETURNED';
  state.feedback[0] = { ...state.feedback[0], threadState: 'DONE', canMarkDone: false, canReopen: true, canDraftReply: false };
  await page.route('**/api/projects/instructor-feedback-project', route => route.fulfill({ json: {
    id: 'instructor-feedback-project', title: 'Unchanged returned fixture', status: 'RETURNED',
  } }));
  await page.goto(root);
  await expect(page.locator('.cm-content')).toContainText('Submitted introduction.');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return for Revision', exact: true })).toHaveCount(0);
});
