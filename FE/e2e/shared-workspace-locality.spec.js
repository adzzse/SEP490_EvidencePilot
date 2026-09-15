import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const baseUrl = 'http://localhost:5173';

async function setupStudent(page) {
  const projectId = 'student-locality-project';
  const paperId = 'student-paper';
  const sectionId = 'student-section';
  const draftKey = `workspace_draft_${projectId}_${sectionId}`;
  const draft = 'Local draft with an evidence target.';
  const excerpt = 'evidence target';
  const state = { downloads: 0, errors: [], revision: 3, saves: [], unhandled: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ draftKey, draft }) => {
    localStorage.setItem('token', 'student-workspace-fixture');
    localStorage.setItem('role', 'STUDENT');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
    localStorage.setItem(draftKey, draft);
    localStorage.setItem('student_workspace_active_tab', 'Source');
  }, { draftKey, draft });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json;

    if (path === '/api/users/profile') {
      json = { id: 'student-one', role: 'STUDENT', firstName: 'Test', lastName: 'Student' };
    } else if (path === '/api/notifications') {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === '/api/projects') {
      json = { content: [{ id: projectId, title: 'Student locality fixture', status: 'RETURNED', currentUserRole: 'MEMBER' }] };
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'Student locality fixture', status: 'RETURNED', currentUserRole: 'MEMBER' };
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [{ id: 'source-one', title: 'Reference source', originalFilename: 'reference.pdf', extractionStatus: 'READY' }], last: true };
    } else if (path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Student paper', originalFilename: 'student-paper.tex', processingStatus: 'READY' }];
    } else if (path === `/api/papers/${paperId}/sections` && method === 'GET') {
      json = [
        { id: 'unassigned-section', sectionTitle: 'Abstract', sectionOrder: 0, contentTex: 'Not assigned.', version: 1, revision: 0, assignedUserId: 'another-student' },
        { id: sectionId, sectionTitle: 'Introduction', sectionOrder: 1, contentTex: 'Server content.', version: 4, revision: state.revision, assignedUserId: 'student-one' },
      ];
    } else if (path === `/api/papers/${paperId}/references`) {
      json = [{ sourceId: 'source-one', citationKey: 'source2026', retrievable: true, title: 'Reference source' }];
    } else if (path === '/api/feedback-requests') {
      json = [];
    } else if (path === `/api/papers/${paperId}/sections/${sectionId}` && method === 'PUT') {
      const body = request.postDataJSON();
      state.saves.push(body);
      expect(body.expectedRevision).toBe(state.revision);
      state.revision += 1;
      json = { id: sectionId, contentTex: body.content, content: body.content, version: 4 + state.saves.length, revision: state.revision };
    } else if (path === `/api/papers/${paperId}/sections/${sectionId}/review` && method === 'GET') {
      if (state.saves.length < 2) return route.fulfill({ status: 204 });
      json = {
        complete: true,
        sectionVersion: 6,
        findings: [{
          type: 'UNSUBSTANTIATED_CLAIM',
          confidence: 'HIGH',
          startOffset: draft.indexOf(excerpt),
          endOffset: draft.indexOf(excerpt) + excerpt.length,
          excerpt,
          rationale: 'The statement needs source support.',
          evidence: [{ sourceId: 'source-one', chunkId: 'chunk-one', quote: 'Supporting Evidence Passage', relation: 'SUPPORTS' }],
        }],
      };
    } else if (path === `/api/papers/${paperId}/sections/${sectionId}/review/source-matches` && method === 'POST') {
      json = { jobId: 'source-match-job' };
    } else if (path === '/api/jobs/source-match-job') {
      json = { status: 'SUCCESS', result: { findings: [{ findingIndex: 0, candidates: [{
        documentId: 'source-one', documentChunkId: 'chunk-one', title: 'Reference source',
        excerpt: 'Supporting Evidence Passage', similarityScore: 0.91, citationKey: 'source2026',
      }] }] } };
    } else if (path === '/api/documents/source-one/chunks') {
      json = [{ id: 'chunk-one', chunkIndex: 0, text: 'Before Supporting Evidence Passage after.' }];
    } else if (path === '/api/documents/source-one/download') {
      state.downloads += 1;
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 fixture' });
    } else {
      state.unhandled.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unhandled fixture request: ${method} ${path}` } });
    }

    return route.fulfill({ json });
  });

  return { draft, draftKey, projectId, state };
}

async function setupInstructor(page) {
  const projectId = 'instructor-locality-project';
  const paperId = 'instructor-paper';
  const sectionId = 'instructor-section';
  const draftKey = `workspace_draft_${projectId}_${sectionId}`;
  const privateDraft = 'PRIVATE UNSAVED STUDENT TEXT';
  const state = { errors: [], paperWrites: [], unhandled: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ draftKey, privateDraft }) => {
    localStorage.setItem('token', 'instructor-workspace-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
    localStorage.setItem(draftKey, privateDraft);
  }, { draftKey, privateDraft });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json;

    if (path.startsWith('/api/papers/') && !['GET', 'HEAD'].includes(method)) {
      state.paperWrites.push(`${method} ${path}`);
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
      json = { id: projectId, title: 'Instructor locality fixture', status: 'IN_REVIEW' };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Working paper', originalFilename: 'working-paper.tex', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === '/api/feedback-requests') {
      json = [
        { id: 'round-two', projectId, status: 'PENDING', requestedAt: '2026-09-15T09:00:00Z' },
        { id: 'round-one', projectId, status: 'RETURNED', requestedAt: '2026-09-15T08:00:00Z' },
      ];
    } else if (path === '/api/feedback-requests/round-one/submission-snapshot') {
      json = { state: 'AVAILABLE', snapshot: {
        schemaVersion: 1,
        projectId,
        submittedByName: 'Test Student',
        submittedAt: '2026-09-15T08:00:00Z',
        papers: [{ id: paperId, title: 'Submitted paper', sections: [{
          id: sectionId, title: 'Introduction', order: 0,
          contentTex: 'Submitted snapshot content.', contentVersion: 4,
        }, {
          id: 'instructor-methods', title: 'Methods', order: 1,
          contentTex: 'Submitted methods snapshot.', contentVersion: 4,
        }] }],
      } };
    } else if (path === `/api/papers/${paperId}/sections`) {
      json = [
        { id: sectionId, sectionTitle: 'Introduction', sectionOrder: 0, contentTex: 'Saved working content.', version: 5, revision: 4 },
        { id: 'instructor-methods', sectionTitle: 'Methods', sectionOrder: 1, contentTex: 'Saved working methods.', version: 5, revision: 4 },
      ];
    } else if (path === `/api/papers/${paperId}/references`) {
      json = [];
    } else if (path === '/api/feedback-requests/round-one/feedback') {
      json = [{
        id: 'feedback-one', requestId: 'round-one', paperId, sectionId,
        sectionTitle: 'Introduction', content: 'Deep linked feedback.',
        publishedAt: '2026-09-15T08:05:00Z', threadState: 'DONE', revision: 1,
      }];
    } else if (path === '/api/feedback-requests/round-two/feedback') {
      json = [];
    } else {
      state.unhandled.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unhandled fixture request: ${method} ${path}` } });
    }

    return route.fulfill({ json });
  });

  return { draftKey, privateDraft, projectId, state };
}

async function setupProjectDetail(page) {
  const projectId = 'project-detail-handoff';
  const requestId = 'feedback-request-one';

  await page.addInitScript(() => {
    localStorage.setItem('token', 'instructor-project-detail-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });

  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json;

    if (path === '/api/users/profile') {
      json = { id: 'instructor-one', role: 'INSTRUCTOR', firstName: 'Test', lastName: 'Instructor' };
    } else if (path === '/api/notifications') {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'Project detail handoff', status: 'IN_REVIEW', targetStandard: 'APA' };
    } else if (path === `/api/projects/${projectId}/members`
      || path === `/api/projects/${projectId}/papers`
      || path === `/api/sources/projects/${projectId}`
      || path === '/api/users') {
      json = [];
    } else if (path === '/api/feedback-requests') {
      json = [{ id: requestId, projectId, status: 'PENDING', studentName: 'Test Student', requestedAt: '2026-09-15T08:00:00Z' }];
    } else {
      return route.fulfill({ status: 404, json: { message: `Unhandled fixture request: ${path}` } });
    }

    return route.fulfill({ json });
  });

  return { projectId, requestId };
}

test('Student restores and saves its assigned draft, then opens Citation Review evidence', async ({ page }) => {
  const { draft, draftKey, projectId, state } = await setupStudent(page);

  await page.goto(`${baseUrl}/student/projects/${projectId}`);
  await expect(page.locator('[data-tour="editor-section-name"]')).toHaveText('Introduction');
  await expect(page.locator('.cm-content')).toContainText(draft);

  await page.locator('#editor-preview-container').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0]).toMatchObject({ content: draft, expectedRevision: 3 });
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();

  await page.getByRole('button', { name: 'Citation Review', exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(2);
  await expect(page.locator('.cm-review-finding')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show citation review', exact: true }).click();

  const review = page.getByRole('dialog', { name: 'Citation Review', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText('evidence target');
  await review.getByRole('button', { name: 'Open passage', exact: true }).click();

  const viewer = page.getByRole('dialog', { name: 'reference.pdf', exact: true });
  await expect(viewer.getByRole('button', { name: 'Extracted passage', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.locator('mark')).toHaveText('Supporting Evidence Passage');
  await viewer.getByRole('button', { name: 'Original file', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Original file', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => state.downloads).toBe(1);

  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Instructor opens the selected round read-only and never consumes Student draft storage', async ({ page }) => {
  const { draftKey, privateDraft, projectId, state } = await setupInstructor(page);

  await page.goto(`${baseUrl}/instructor/requests/${projectId}?review=round-one&feedback=feedback-one`);
  await expect(page).toHaveURL(`${baseUrl}/instructor/requests/${projectId}`);
  await expect(page.getByRole('region', { name: 'Submitted paper', exact: true })).toContainText('Submitted snapshot content.');
  await expect(page.locator('.cm-content')).not.toContainText(privateDraft);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Citation Review', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Methods', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Submitted methods snapshot.');

  await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved working copy', exact: true })).toContainText('Saved working methods.');
  await page.getByRole('button', { name: 'Methods', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Saved working methods.');
  await expect(page.locator('.cm-content')).not.toContainText(privateDraft);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Citation Review', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey)).toBe(privateDraft);

  await expect(page.getByText('Deep linked feedback.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI Suggestions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, '', `${location.pathname}?feedback=feedback-one`);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(`${baseUrl}/instructor/requests/${projectId}`);
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(page.getByText('Deep linked feedback.', { exact: true })).toBeVisible();

  expect(state.paperWrites).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('ProjectDetail hands a review request to the canonical shared workspace route', async ({ page }) => {
  const { projectId, requestId } = await setupProjectDetail(page);
  const target = `/instructor/requests/${projectId}?review=${requestId}`;

  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();

  const requestCard = page.getByTestId(`feedback-${requestId}`);
  await expect(requestCard).toHaveAttribute('href', target);
  await requestCard.click();
  await expect(page).toHaveURL(`${baseUrl}${target}`);
});
