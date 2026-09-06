import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { remapAnchor } from '../src/utils/student/feedbackAnchors.js';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });
const root = 'http://localhost:5173/student/projects/feedback-project';
const fingerprint = text => createHash('sha256').update(text).digest('hex');
const originalText = `Opening paragraph. ${'This sentence provides background for the study. '.repeat(6)}The evidence target needs clarification.\n\n${Array.from({ length: 32 }, (_, i) => `Paragraph ${i + 1}. Context and source details for this project.`).join('\n\n')}`;
const start = originalText.indexOf('evidence target');
const end = start + 'evidence target'.length;
const anchor = (text, from, to) => ({ original: { representation: 'latex-source-lf-v1', offsetUnit: 'utf16', contentVersion: 1, fingerprint: fingerprint(text),
  from, to, exact: text.slice(from, to), prefix: text.slice(Math.max(0, from - 64), from), suffix: text.slice(to, to + 64) },
current: { status: 'ATTACHED', contentVersion: 1, fingerprint: fingerprint(text), from, to } });

async function setup(page, options = {}) {
  const state = { failLoad: options.failLoad || 0, failReply: false, failSave: false, saveDelay: 0, saves: [], replies: [], errors: [],
    sections: [
      { id: 'section-one', sectionTitle: 'Introduction', sectionOrder: 0, contentTex: originalText, version: 1, revision: 0, active: true, assignedUserId: 'member' },
      { id: 'section-two', sectionTitle: 'Methods', sectionOrder: 1, contentTex: 'Methods description', version: 1, revision: 0, active: true, assignedUserId: 'someone-else' },
    ],
    items: Array.from({ length: 5 }, (_, i) => ({ id: `feedback-${i}`, requestId: 'round-one', sectionId: 'section-one', paperId: 'paper-one',
      sectionTitle: 'Introduction', content: `Feedback ${i + 1}: clarify the evidence and explain the source.`, instructorName: 'Test Instructor',
      createdAt: '2026-09-06T10:00:00', answered: false, canAnswer: true, sectionVersion: 1, anchor: anchor(originalText, start, end) })) };
  state.items.push({ id: 'other-section', requestId: 'round-one', sectionId: 'section-two', paperId: 'paper-one', sectionTitle: 'Methods',
    content: 'Clarify the method.', answered: true, canAnswer: false, answerContent: 'Previous response', anchor: anchor('Methods description', 0, 7) });
  state.items.push({ id: 'legacy', requestId: 'round-old', sectionId: 'section-one', paperId: 'paper-one', sectionTitle: 'Introduction',
    content: 'Older general section feedback.', answered: true, canAnswer: false, answerContent: 'Original preserved answer.', lineReference: 'near the end', anchor: { original: null, current: { status: 'UNLOCATED' } } });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.routeWebSocket(/localhost:5173/, () => {});
  await page.routeWebSocket(/ws/, () => {});
  await page.addInitScript(() => {
    localStorage.setItem('token', 'local-browser-fixture'); localStorage.setItem('role', 'STUDENT');
    localStorage.setItem('app_lang', 'en'); localStorage.setItem('app_theme', 'light');
    localStorage.setItem('student_workspace_active_tab', 'Feedback');
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let json = [];
    const project = { id: 'feedback-project', title: 'Synthetic feedback validation', status: 'RETURNED', currentUserRole: 'MEMBER' };
    if (path === '/api/users/profile') json = { id: 'member', role: 'STUDENT', firstName: 'Test', lastName: 'Member' };
    else if (path === '/api/projects') json = { content: [project] };
    else if (path === '/api/projects/feedback-project') json = project;
    else if (path === '/api/projects/feedback-project/sources') json = { content: [], last: true };
    else if (path === '/api/projects/feedback-project/papers') json = [{ id: 'paper-one', title: 'Paper', originalFilename: 'paper.tex', processingStatus: 'READY' }];
    else if (path === '/api/papers/paper-one/sections') json = state.sections;
    else if (options.review && path.endsWith('/section-one/review')) json = { complete: true, findings: [{ type: 'UNSUBSTANTIATED_CLAIM', startOffset: start, endOffset: end, excerpt: 'evidence target', explanation: 'Synthetic citation explanation.', evidence: [] }] };
    else if (options.review && path.endsWith('/review/source-matches')) json = { jobId: 'fixture-source-matches' };
    else if (path === '/api/jobs/fixture-source-matches') json = { status: 'SUCCESS', result: { findings: [] } };
    else if (path === '/api/feedback-requests') {
      if (state.failLoad) return route.fulfill({ status: state.failLoad, json: { message: 'Fixture load failure' } });
      json = [{ id: 'round-one', projectId: project.id, status: 'RETURNED', requestedAt: '2026-09-06T10:00:00' },
        { id: 'round-old', projectId: project.id, status: 'REJECTED', requestedAt: '2026-09-05T10:00:00' }];
    } else if (/\/feedback-requests\/[^/]+\/feedback$/.test(path)) json = state.items.filter(item => item.requestId === path.split('/').at(-2));
    else if (path === '/api/notifications') json = [{ id: 'notice-one', actionType: 'INSTRUCTOR_FEEDBACK_ADDED', entityId: 'round-one', message: 'Open review feedback', read: true }];
    else if (path === '/api/notifications/unread-count') json = { count: 0 };
    else if (path.endsWith('/section-one/rollback')) {
      const previous = state.sections[0];
      state.sections[0] = { ...previous, contentTex: originalText, previousContentTex: previous.contentTex, version: previous.version + 1, revision: previous.revision + 1 };
      state.items = state.items.map(item => item.sectionId !== previous.id || !item.anchor.original ? item : ({ ...item, anchor: anchor(originalText, start, end) }));
      json = state.sections[0];
    }
    else if (path === '/api/papers/paper-one/sections/section-one' && method === 'PUT') {
      const body = route.request().postDataJSON(); state.saves.push(body);
      if (state.saveDelay) await new Promise(resolve => setTimeout(resolve, state.saveDelay));
      if (state.failSave) return route.fulfill({ status: 409, json: { message: 'Fixture conflict' } });
      const previous = state.sections[0];
      expect(body.expectedRevision).toBe(previous.revision);
      let rebuilt = ''; let cursor = 0;
      for (const change of body.changes || []) { rebuilt += previous.contentTex.slice(cursor, change.from) + change.insert; cursor = change.to; }
      rebuilt += previous.contentTex.slice(cursor);
      expect(rebuilt).toBe(body.content);
      state.sections[0] = { ...previous, contentTex: body.content, previousContentTex: previous.contentTex, version: previous.version + 1, revision: previous.revision + 1 };
      state.items = state.items.map(item => item.sectionId !== previous.id || !item.anchor.original ? item : ({ ...item,
        anchor: { ...remapAnchor(item.anchor, body.content, body.changes), current: {
          ...remapAnchor(item.anchor, body.content, body.changes).current, contentVersion: previous.version + 1, fingerprint: fingerprint(body.content) } } }));
      json = state.sections[0];
    } else if (/\/instructor-feedback\/[^/]+\/answer$/.test(path)) {
      const body = route.request().postDataJSON(); state.replies.push(body);
      if (state.failReply) return route.fulfill({ status: 503, json: { message: 'Fixture reply failure' } });
      const item = state.items.find(entry => entry.id === path.split('/').at(-2));
      Object.assign(item, { answerContent: body.content, answered: true, canAnswer: false, answeredAt: '2026-09-06T11:00:00' }); json = item;
    }
    return route.fulfill({ json });
  });
  await page.goto(root);
  await expect(page.locator('.cm-content')).toContainText('Opening paragraph');
  return state;
}

async function openFeedback(page) {
  const context = page.locator('[data-tour="context-panel"]');
  if (await context.isVisible()) await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.locator('[data-tour="editor-feedback"]').click();
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('feedback-0');
  await expect(page.locator('.cm-feedback-active').first()).toBeVisible();
}

test('real workspace: range mapping, Save, reload, one reply with retry, and preserved drafts', async ({ page }) => {
  const state = await setup(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('student_workspace_active_tab'))).toBe('Review');
  await openFeedback(page);
  const editor = page.locator('.cm-content');
  await page.evaluate(() => { window.originalEditorNode = document.querySelector('.cm-editor'); });
  const reply = page.getByRole('textbox', { name: 'Answer', exact: true });
  await reply.fill('Draft response\nSecond line');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.locator('[data-tour="editor-feedback"]').click();
  await expect(reply).toHaveValue('Draft response\nSecond line');
  expect(await page.evaluate(() => window.originalEditorNode === document.querySelector('.cm-editor'))).toBe(true);
  await editor.click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('Prefix\n');
  await page.getByRole('button', { name: 'Go to passage', exact: true }).click();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.keyboard.insertText('X');
  await expect(page.locator('.cm-feedback-active')).toContainText('eXvidence target');
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.locator('#student-feedback-panel')).toContainText('Passage edited since review');
  expect(state.saves[0].changes).toEqual([{ from: 0, to: 0, insert: 'Prefix\n' }, { from: start + 1, to: start + 1, insert: 'X' }]);
  await page.reload();
  await expect(editor).toContainText('Prefix');
  await openFeedback(page);
  await expect(page.locator('.cm-feedback-active')).toContainText('eXvidence target');
  state.failReply = true;
  await reply.fill('Changed explanation.\nPlease review.');
  await page.locator('[data-feedback-card="feedback-0"] button[type="submit"]').click();
  await expect(page.locator('[data-feedback-card="feedback-0"] [role="alert"]')).toBeVisible();
  await expect(reply).toHaveValue('Changed explanation.\nPlease review.');
  state.failReply = false;
  await page.locator('[data-feedback-card="feedback-0"] button[type="submit"]').click();
  await expect(page.locator('[data-feedback-card="feedback-0"]')).toContainText('Changed explanation.');
  await expect(reply).toHaveCount(0);
  expect(state.replies).toHaveLength(2);
  expect(state.saves).toHaveLength(1);
  expect(state.errors).toEqual([]);
  await page.screenshot({ path: '../../artifacts/codex/student-feedback-plan/feedback-desktop.png' });
});

test('five overlapping comments, geometry, deletion/undo, font/theme and three panes', async ({ page }) => {
  const state = await setup(page);
  await openFeedback(page);
  for (let i = 0; i < 5; i++) {
    await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption(`feedback-${i}`);
    await expect(page.locator(`[data-feedback-card="feedback-${i}"] textarea`)).toBeVisible();
  }
  await page.locator('.cm-feedback-active').first().click();
  const overlaps = page.locator('[aria-label="Feedback on this passage"]');
  await expect(overlaps.getByRole('button')).toHaveCount(5);
  await overlaps.getByRole('button', { name: '5', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-feedback-card="feedback-4"] textarea')).toBeVisible();
  const connectorError = async () => {
    const y = await page.locator('[data-feedback-card="feedback-4"] svg path').evaluate(path => {
      const point = path.getPointAtLength(0);
      return new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()).y;
    });
    return Math.abs(y - (await page.locator('.cm-feedback-active').first().boundingBox()).y);
  };
  await expect.poll(connectorError).toBeLessThan(2);
  const bounds = await page.locator('[data-feedback-card]').evaluateAll(cards => cards.map(card => card.getBoundingClientRect()).sort((a, b) => a.top - b.top).map(card => ({ top: card.top, bottom: card.bottom })));
  bounds.slice(1).forEach((card, i) => expect(card.top).toBeGreaterThanOrEqual(bounds[i].bottom));
  await page.getByRole('button', { name: 'Go to passage', exact: true }).click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-feedback-card="feedback-4"]')).toContainText('Location needs review');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cm-feedback-active')).toContainText('evidence target');
  const font = page.locator('input[type="range"]').first();
  await font.focus(); await page.keyboard.press('ArrowRight');
  await page.locator('[data-tour="header-dark-mode"]').click();
  await expect(page.locator('.cm-feedback-active')).toContainText('evidence target');
  await expect.poll(connectorError).toBeLessThan(2);
  await page.getByTestId('feedback-scroller').evaluate(element => { element.scrollTop += 70; });
  await expect.poll(connectorError).toBeLessThan(2);
  await page.setViewportSize({ width: 1900, height: 1000 });
  await page.getByRole('checkbox', { name: 'Keep Preview open' }).check();
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
  await expect(page.getByText('Preview', { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: '../../artifacts/codex/student-feedback-plan/feedback-three-panes.png' });
  expect(state.errors).toEqual([]);
});

test('load failure/retry and cross-section navigation respect unsaved changes', async ({ page }) => {
  const state = await setup(page, { failLoad: 500 });
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.locator('[data-tour="editor-feedback"]').click();
  await expect(page.locator('#student-feedback-panel [role="alert"]')).toContainText('could not be loaded');
  await expect(page.locator('#student-feedback-panel')).not.toContainText('No feedback matches');
  state.failLoad = 0;
  await page.locator('#student-feedback-panel [role="alert"] button').click();
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('feedback-0');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('Unsaved ');
  await page.getByRole('combobox', { name: 'Feedback scope', exact: true }).selectOption('project');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('other-section');
  await expect(page.locator('.cm-content')).toContainText('Unsaved Opening');
  await expect(page.locator('[data-tour="editor-section-name"]')).toHaveText('Introduction');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('other-section');
  await expect(page.locator('[data-tour="editor-section-name"]')).toHaveText('Methods');
  await expect(page.locator('[data-feedback-card="other-section"]')).toContainText('Previous response');
  await expect(page.locator('#student-feedback-panel textarea')).toHaveCount(0);
  state.failLoad = 403; await page.getByRole('button', { name: 'Refresh feedback' }).click();
  await expect(page.locator('#student-feedback-panel [role="alert"]')).toContainText('no longer have access');
  await expect(page.locator('[data-feedback-card]')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('Save conflict keeps changes, and edits typed while saving form the next valid revision', async ({ page }) => {
  const state = await setup(page);
  await openFeedback(page);
  const editor = page.locator('.cm-content');
  await editor.click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('One ');
  state.failSave = true;
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(editor).toContainText('One Opening');
  state.failSave = false; state.saveDelay = 800;
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await editor.click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('Two ');
  await expect.poll(() => state.sections[0].revision).toBe(1);
  await expect(editor).toContainText('Two One Opening');
  state.saveDelay = 0;
  await expect(page.locator('[data-tour="editor-toolbar"] button').last()).toBeEnabled();
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await expect.poll(() => state.sections[0].revision).toBe(2);
  expect(state.saves[2].changes).toEqual([{ from: 0, to: 0, insert: 'Two ' }]);
  expect(state.saves[2].expectedRevision).toBe(1);
  expect(state.errors).toEqual([]);
});

test('small screens retain editing and replying without horizontal overflow', async ({ page }) => {
  const state = await setup(page);
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.locator('[data-tour="sidebar-left"] button').first().click();
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    if ((await page.locator('[data-tour="editor-feedback"]').getAttribute('aria-expanded')) !== 'true') await page.locator('[data-tour="editor-feedback"]').click();
    await page.locator('#student-feedback-panel summary').first().evaluate(element => { element.parentElement.open = true; });
    await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('feedback-0');
    if (width < 780) await page.locator('#student-feedback-panel summary').first().evaluate(element => { element.parentElement.open = false; });
    await expect(page.locator('.cm-content')).toBeVisible();
    const metrics = await page.locator('#editor-preview-container').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
    const editorHeight = await page.locator('.cm-scroller').evaluate(el => el.clientHeight);
    expect(editorHeight).toBeGreaterThan(100);
    await page.screenshot({ path: `../../artifacts/codex/student-feedback-plan/feedback-width-${width}.png` });
  }
  expect(state.errors).toEqual([]);
});

test('notification and direct review links open the round; rollback keeps a valid next Save', async ({ page }) => {
  const state = await setup(page);
  await page.locator('[data-tour="header-notifications"]').click();
  await page.getByRole('button', { name: 'Open review feedback' }).click();
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption('feedback-0');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('Saved before rollback ');
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await expect.poll(() => state.sections[0].revision).toBe(1);
  await page.locator('[data-tour="header-history"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-tour="history-modal"]').getByRole('button', { name: 'Undo previous save', exact: true }).click();
  await expect(page.locator('[data-tour="history-modal"]')).toHaveCount(0);
  await expect(page.locator('.cm-content')).not.toContainText('Saved before rollback');
  await expect(page.locator('.cm-feedback-active')).toContainText('evidence target');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('After rollback ');
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[1].changes).toEqual([{ from: 0, to: 0, insert: 'After rollback ' }]);
  expect(state.saves[1].expectedRevision).toBe(2);
  await page.goto(`${root}?review=round-old`);
  await expect(page.locator('#student-feedback-panel')).toBeVisible();
  await page.locator('#student-feedback-panel summary').first().evaluate(element => { element.parentElement.open = true; });
  await expect(page.getByRole('combobox', { name: 'Review round', exact: true })).toHaveValue('round-old');
  expect(state.errors).toEqual([]);
});

test('Vietnamese dark mode and keyboard reply retain independent Citation Review highlights and popover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await setup(page, { review: true });
  await openFeedback(page);
  await expect(page.locator('.cm-finding-widget')).toBeVisible();
  await page.locator('.cm-finding-widget').click();
  await expect(page.getByRole('dialog', { name: 'Citation Review', exact: true })).toBeVisible();
  await expect(page.locator('.cm-feedback-active')).toContainText('evidence target');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'VN', exact: true }).click();
  await page.locator('[data-tour="header-dark-mode"]').click();
  const reply = page.getByRole('textbox', { name: 'Trả lời', exact: true });
  await reply.fill('Đã bổ sung dẫn chứng.\nTiếng Việt 😀');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-feedback-card="feedback-0"] button[type="submit"]')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(reply).toHaveValue('Đã bổ sung dẫn chứng.\nTiếng Việt 😀');
  await reply.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../../artifacts/codex/student-feedback-plan/feedback-mobile-vi-dark.png' });
  await reply.focus(); await page.keyboard.press('Escape');
  await expect(page.locator('#student-feedback-panel')).toBeHidden();
  await expect(page.locator('[data-tour="editor-feedback"]')).toBeFocused();
  expect(state.errors).toEqual([]);
});

test('multiline Vietnamese/emoji anchors coexist with citation pills and table preview through delete/undo/redo', async ({ page }) => {
  const state = await setup(page);
  const source = String.raw`Tiếng Việt 😀 trước.
Một đoạn có \cite{sample} và $E=mc^2$.

\begin{table}
\begin{tabular}{ll}
Tên & Giá trị \\
A & 1 \\
\end{tabular}
\end{table}
`;
  const to = source.indexOf('\n\n');
  state.sections[0].contentTex = source.replace(/\n/g, '\r\n');
  state.items[0].anchor = anchor(source, 0, to);
  state.items = [state.items[0]];
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Tiếng Việt 😀');
  await openFeedback(page);
  await expect.poll(() => page.locator('.cm-feedback-active').count()).toBeGreaterThan(1);
  await expect(page.locator('.cm-cite-pill')).toBeVisible();
  await page.getByText('View original passage', { exact: true }).click();
  await expect(page.locator('[data-feedback-card="feedback-0"] details')).toContainText(source.slice(0, to));
  await page.getByRole('button', { name: 'Go to passage', exact: true }).click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-feedback-card="feedback-0"]')).toContainText('Location needs review');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.locator('.cm-feedback-active').count()).toBeGreaterThan(1);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.cm-feedback-active')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.locator('.cm-feedback-active').count()).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.preview-content table')).toContainText('Giá trị');
  expect(state.errors).toEqual([]);
});
