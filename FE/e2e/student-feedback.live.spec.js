import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });
test.skip(!['1', 'true'].includes(process.env.STUDENT_FEEDBACK_LIVE), 'Opt-in local RUN_ID workflow');

// Private config outside Git: local urls, runId, fixture IDs and three accounts.
// Requires a fresh project with two assigned sections. Preserve all runtime data.
test('three roles complete a real snapshot, Return and revision cycle', async ({ browser, request }) => {
  test.setTimeout(180_000);
  expect(process.env.STUDENT_FEEDBACK_LIVE_CONFIG, 'A fresh RUN_ID test configuration is required').toBeTruthy();
  const config = JSON.parse(readFileSync(process.env.STUDENT_FEEDBACK_LIVE_CONFIG, 'utf8'));
  const { apiUrl, webUrl, runId, projectId, paperId, leaderSectionId, memberSectionId, accounts } = config;
  for (const value of [apiUrl, webUrl]) {
    const url = new URL(value);
    expect(['localhost', '127.0.0.1']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
  }
  expect(runId).toMatch(/^FEEDBACK-LIVE-[A-Za-z0-9-]+$/);
  expect(accounts.leader.email).not.toBe(accounts.member.email);
  const output = resolve('../../artifacts/codex/mentor-feedback-plan-2026-09-08/verification', runId);
  mkdirSync(output, { recursive: true });
  const contexts = [];
  const evidence = { runId, projectId, status: 'PARTIAL', completed: [], preserveData: true };
  const clients = {};
  try {
    for (const role of ['leader', 'member', 'instructor']) {
      const response = await request.post(`${apiUrl}/api/auth/login`, { data: accounts[role] });
      expect(response.status(), `Login ${role}`).toBe(200);
      const auth = await response.json();
      clients[role] = { headers: { Authorization: `Bearer ${auth.token}` }, token: auth.token };
    }
    const call = async (role, method, path, data, status = 200) => {
      const response = await request[method](`${apiUrl}${path}`, { headers: clients[role].headers, ...(data === undefined ? {} : { data }) });
      expect(response.status(), `${method.toUpperCase()} ${path}`).toBe(status);
      return response.json();
    };
    const project = await call('leader', 'get', `/api/projects/${projectId}`);
    expect(project.title).toBe(runId);
    expect(['ASSIGNED', 'IN_PROGRESS']).toContain(project.status);
    expect((await call('leader', 'get', '/api/feedback-requests')).filter(round => round.projectId === projectId)).toHaveLength(0);
    expect((await call('leader', 'get', `/api/projects/${projectId}/review-readiness`)).revision?.state, 'Backend must contain this implementation').toBe('FIRST_SUBMISSION');
    const sections = await call('leader', 'get', `/api/papers/${paperId}/sections`);
    expect(sections.map(section => section.id).sort()).toEqual([leaderSectionId, memberSectionId].sort());
    const pageFor = async role => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      contexts.push(context);
      const page = await context.newPage();
      await page.addInitScript(({ token, role }) => {
        localStorage.setItem('token', token); localStorage.setItem('role', role);
        localStorage.setItem('app_lang', 'en'); localStorage.setItem('app_theme', 'light');
        localStorage.setItem('student_workspace_active_tab', 'Review');
      }, { token: clients[role].token, role: role === 'instructor' ? 'INSTRUCTOR' : 'STUDENT' });
      // Real HTTP, redirected only to the explicitly designated local backend.
      await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        return route.continue({ url: `${apiUrl}${url.pathname}${url.search}` });
      });
      await page.goto(`${webUrl}/${role === 'instructor' ? 'instructor/requests' : 'student/projects'}/${projectId}`);
      await expect(page.getByRole('region', { name: 'Project workspace', exact: true })).toBeVisible();
      return page;
    };
    const confirm = async (role, sectionId) => {
      const ready = await call(role, 'get', `/api/projects/${projectId}/review-readiness`);
      const section = ready.papers.flatMap(paper => paper.sections).find(section => section.id === sectionId);
      return call(role, 'post', `/api/papers/${paperId}/sections/${sectionId}/handoff`, { expectedInputFingerprint: section.currentInputFingerprint });
    };
    await confirm('leader', leaderSectionId);
    await confirm('member', memberSectionId);
    const ready = await call('leader', 'get', `/api/projects/${projectId}/review-readiness`);
    const first = await call('leader', 'post', `/api/projects/${projectId}/reviews`, { expectedSubmissionFingerprint: ready.submissionFingerprint }, 201);
    const instructor = await pageFor('instructor');
    await expect(instructor.getByRole('region', { name: 'Submitted paper', exact: true })).toContainText(sections[0].contentTex);
    for (const [i, sectionId] of [leaderSectionId, memberSectionId, leaderSectionId].entries()) {
      await call('instructor', 'post', `/api/feedback-requests/${first.id}/feedback`, { sectionId, content: `${runId}: clarify evidence ${i + 1}.` });
    }
    expect(await call('member', 'get', `/api/feedback-requests/${first.id}/feedback`)).toEqual([]);
    await instructor.reload();
    await expect(instructor.getByText(`${runId}: clarify evidence 3.`, { exact: true })).toBeVisible();
    await instructor.screenshot({ path: resolve(output, 'instructor-drafts.png') });
    await instructor.getByRole('button', { name: 'Return for Revision', exact: true }).click();
    await instructor.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(instructor.getByRole('button', { name: 'Return for Revision', exact: true })).toHaveCount(0);
    expect(await call('member', 'get', `/api/feedback-requests/${first.id}/feedback`)).toHaveLength(3);
    evidence.completed.push('Submit N; three drafts private; Return publishes roots');
    const unchanged = await call('leader', 'get', `/api/projects/${projectId}/review-readiness`);
    expect(unchanged.revision.state).toBe('UNCHANGED');
    const conflict = await call('leader', 'post', `/api/projects/${projectId}/reviews`, { expectedSubmissionFingerprint: unchanged.submissionFingerprint }, 409);
    expect(conflict.fieldErrors.code).toBe('REVISION_UNCHANGED');
    const denied = await request.put(`${apiUrl}/api/papers/${paperId}/sections/${leaderSectionId}`, { headers: clients.instructor.headers,
      data: { content: 'Forbidden', expectedRevision: sections.find(section => section.id === leaderSectionId).revision } });
    expect(denied.status()).toBe(403);
    for (const [role, sectionId] of [['leader', leaderSectionId], ['member', memberSectionId]]) {
      const page = await pageFor(role);
      await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText(`\nRevision by ${role} for ${runId}.`);
      const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/sections/${sectionId}`));
      await page.locator('[data-tour="editor-toolbar"]').getByRole('button', { name: 'Save', exact: true }).click();
      expect((await saved).status()).toBe(200);
      await page.reload();
      await expect(page.locator('.cm-content')).toContainText(`Revision by ${role}`);
      await confirm(role, sectionId);
      await page.reload();
      await expect(page.locator('.cm-content')).toContainText(`Revision by ${role}`);
      await page.locator('[data-tour="editor-feedback"]').click();
      await expect(page.locator('#student-feedback-panel')).toBeVisible();
      await page.screenshot({ path: resolve(output, `${role}-revised.png`) });
    }
    const leader = await pageFor('leader');
    await leader.getByRole('button', { name: 'Submit for Review', exact: true }).click();
    const dialog = leader.getByRole('dialog');
    await expect(dialog).toContainText('Confirmed by:');
    await dialog.screenshot({ path: resolve(output, 'leader-readiness.png') });
    const submitted = leader.waitForResponse(response => response.request().method() === 'POST' && response.url().includes(`/projects/${projectId}/reviews`));
    await dialog.getByRole('button', { name: 'Submit for Review', exact: true }).click();
    const response = await submitted;
    expect(response.status()).toBe(201);
    const second = await response.json();
    await instructor.goto(`${webUrl}/instructor/requests/${projectId}?review=${second.id}`);
    await expect(instructor.getByRole('region', { name: 'Submitted paper', exact: true })).toContainText('Revision by member');
    for (const root of await call('instructor', 'get', `/api/feedback-requests/${first.id}/feedback`)) {
      await call('instructor', 'patch', `/api/instructor-feedback/${root.id}/state`, { state: 'DONE', expectedRevision: root.revision });
    }
    await instructor.reload();
    await instructor.getByRole('button', { name: 'Approve', exact: true }).click();
    await instructor.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await call('leader', 'get', `/api/projects/${projectId}`)).status).toBe('APPROVED');
    evidence.completed.push('Unchanged POST blocked; Instructor write blocked; both assignees Save/reload/Confirm; leader submits N+1; DONE/Approve');
    evidence.status = 'PASS';
  } finally {
    writeFileSync(resolve(output, 'result.json'), JSON.stringify(evidence, null, 2));
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('completed live review keeps old DONE links and working copy read-only', async ({ browser, request }) => {
  const config = JSON.parse(readFileSync(process.env.STUDENT_FEEDBACK_LIVE_CONFIG, 'utf8'));
  const { apiUrl, webUrl, projectId, accounts, runId } = config;
  for (const value of [apiUrl, webUrl]) expect(['localhost', '127.0.0.1']).toContain(new URL(value).hostname);
  const login = await request.post(`${apiUrl}/api/auth/login`, { data: accounts.instructor });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const project = await (await request.get(`${apiUrl}/api/projects/${projectId}`, { headers })).json();
  expect(project.title).toBe(runId);
  expect(project.status).toBe('APPROVED');
  const rounds = (await (await request.get(`${apiUrl}/api/feedback-requests`, { headers })).json())
    .filter(item => item.projectId === projectId);
  const old = rounds.find(item => item.status === 'RETURNED');
  const roots = await (await request.get(`${apiUrl}/api/feedback-requests/${old.id}/feedback`, { headers })).json();
  expect(roots).toHaveLength(3);
  expect(roots.every(item => item.threadState === 'DONE')).toBe(true);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.addInitScript(token => {
      localStorage.setItem('token', token); localStorage.setItem('role', 'INSTRUCTOR');
      localStorage.setItem('app_lang', 'en');
    }, token);
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      return route.continue({ url: `${apiUrl}${url.pathname}${url.search}` });
    });
    await page.goto(`${webUrl}/instructor/requests/${projectId}?review=${old.id}&feedback=${roots[0].id}`);
    await expect(page.getByText(roots[0].content, { exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.cm-content')).not.toContainText('Revision by');
    await page.getByRole('button', { name: 'Saved working copy', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Revision by');
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await page.screenshot({ path: resolve('../../artifacts/codex/mentor-feedback-plan-2026-09-08/verification', runId, 'instructor-history-working.png') });
  } finally {
    await context.close();
  }
});
