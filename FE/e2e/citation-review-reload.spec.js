import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const baseUrl = 'http://localhost:5173';
const projectId = 'citation-reload-project';
const paperId = 'citation-reload-paper';
const sectionId = 'citation-reload-section';
const jobId = 'citation-reload-job';
const sourceJobId = 'citation-reload-source-job';
const content = 'Partial claim needs evidence.';
const review = {
  findings: [{
    startOffset: 0, endOffset: 7, severity: 'HIGH',
    claim: 'Partial claim', explanation: 'partial finding', relation: 'NOT_FOUND',
  }],
  complete: false,
  limitations: ['provider-unavailable'],
};

async function setup(page) {
  const state = { jobPolls: 0, errors: [], unhandled: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'citation-reload-fixture');
    localStorage.setItem('role', 'STUDENT');
    localStorage.setItem('user_id', 'student-reload');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let json;
    if (path === '/api/users/profile') {
      json = { id: 'student-reload', role: 'STUDENT', firstName: 'Reload', lastName: 'Student' };
    } else if (path === '/api/notifications') {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === '/api/projects') {
      json = { content: [{ id: projectId, title: 'Citation reload fixture', status: 'IN_PROGRESS', currentUserRole: 'LEADER' }], last: true };
    } else if (path === `/api/projects/${projectId}`) {
      json = { id: projectId, title: 'Citation reload fixture', status: 'IN_PROGRESS', currentUserRole: 'LEADER' };
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Reload paper', originalFilename: 'reload.tex', processingStatus: 'READY' }];
    } else if (path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/sections`) {
      json = [{ id: sectionId, documentId: paperId, sectionTitle: 'Introduction', sectionType: 'BODY',
        sectionOrder: 0, contentTex: content, version: 1, revision: 1, assignedUserId: 'student-reload', active: true }];
    } else if (path === `/api/papers/${paperId}/references` || path === `/api/papers/${paperId}/references/check`) {
      json = [];
    } else if (path === '/api/feedback-requests') {
      json = [];
    } else if (path === `/api/papers/${paperId}/sections/${sectionId}/review`) {
      json = { jobId, status: 'RUNNING', finishedCount: 2, totalCount: 5,
        complete: false, review };
    } else if (path === `/api/jobs/${jobId}`) {
      state.jobPolls += 1;
      json = state.jobPolls === 1
        ? { id: jobId, kind: 'SECTION_CITATION_REVIEW', status: 'PROCESSING', progressCurrent: 2, progressTotal: 5, result: review }
        : { id: jobId, kind: 'SECTION_CITATION_REVIEW', status: 'SUCCESS', progressCurrent: 5, progressTotal: 5, result: review };
    } else if (path === `/api/jobs/${sourceJobId}`) {
      json = { id: sourceJobId, kind: 'SECTION_CITATION_SOURCE_MATCH', status: 'SUCCESS', progressCurrent: 1, progressTotal: 1, result: { findings: [] } };
    } else if (path.includes('/review/source-matches')) {
      json = { jobId: sourceJobId };
    } else {
      state.unhandled.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 404, json: { message: 'Unhandled citation reload fixture request' } });
    }
    return route.fulfill({ json });
  });
  return state;
}

test('Citation Review reattaches from server state after localStorage job removal', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/student/projects/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText('Partial claim');
  await expect(page.getByRole('button', { name: 'Open 1 Citation Review findings' })).toBeVisible();
  await expect.poll(() => state.jobPolls).toBeGreaterThan(0);

  await page.evaluate(section => localStorage.removeItem(`citation_review_job:${section}`), sectionId);
  const pollsBeforeReload = state.jobPolls;
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Partial claim');
  await expect(page.getByRole('button', { name: 'Open 1 Citation Review findings' })).toBeVisible();
  await expect.poll(() => state.jobPolls).toBeGreaterThan(pollsBeforeReload);
  expect(state.unhandled).toEqual([]);
  expect(state.errors).toEqual([]);
});
