import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });
test.skip(process.env.STUDENT_FEEDBACK_LIVE !== 'true', 'Opt-in local RUN_ID fixture validation');

test('Student workspace reads persisted anchors and saves through the real API', async ({ page, request }) => {
  const fixture = JSON.parse(readFileSync('../../artifacts/codex/student-feedback-plan/feedback-live-result.json', 'utf8'));
  expect(fixture.status).toBe('PASS');
  const { projectId, paperId, sectionId, feedbackId } = fixture.fixture;
  const env = Object.fromEntries(readFileSync('../BE/.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
  }));
  const response = await request.post('http://localhost:8080/api/auth/login', { data: { email: env.STUDENT_EMAIL, password: env.STUDENT_PASSWORD } });
  expect(response.status()).toBe(200);
  const { token } = await response.json();
  const headers = { Authorization: `Bearer ${token}` };
  const project = await request.get(`http://localhost:8080/api/projects/${projectId}`, { headers });
  expect((await project.json()).title).toBe(fixture.runId);
  await page.routeWebSocket(/localhost:5173/, () => {});
  await page.addInitScript(token => {
    localStorage.setItem('token', token); localStorage.setItem('role', 'STUDENT');
    localStorage.setItem('app_lang', 'en'); localStorage.setItem('app_theme', 'light');
    localStorage.setItem('student_workspace_active_tab', 'Source');
  }, token);
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const sectionPath = `/api/papers/${paperId}/sections/${sectionId}`;
  await page.route('**/api/**', route => {
    const req = route.request();
    if (['PUT', 'PATCH', 'POST', 'DELETE'].includes(req.method())) {
      const path = new URL(req.url()).pathname;
      if (!(req.method() === 'PUT' && path === sectionPath)) return route.abort();
      writes.push(req.postDataJSON());
    }
    return route.continue();
  });
  await page.goto(`http://localhost:5173/student/projects/${projectId}`);
  await expect(page.locator('.cm-content')).toContainText('evidence target');
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.locator('[data-tour="editor-feedback"]').click();
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption(feedbackId);
  await expect(page.locator('.cm-feedback-active')).toContainText('evidence target');
  await expect(page.locator(`[data-feedback-card="${feedbackId}"]`)).toContainText('Synthetic response.');
  await page.getByRole('button', { name: 'Go to passage', exact: true }).click();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.keyboard.insertText('UI');
  const saved = page.waitForResponse(response => response.url().endsWith(sectionPath) && response.request().method() === 'PUT');
  await page.locator('[data-tour="editor-toolbar"] button').last().click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator('.cm-feedback-active')).toContainText('eUIvidence target');
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('eUIvidence target');
  await page.locator('[data-tour="sidebar-left"] button').nth(1).click();
  await page.locator('[data-tour="editor-feedback"]').click();
  await page.getByRole('combobox', { name: 'Go to feedback', exact: true }).selectOption(feedbackId);
  await expect(page.locator('.cm-feedback-active')).toContainText('eUIvidence target');
  await expect(page.locator(`[data-feedback-card="${feedbackId}"]`)).toContainText('Passage edited since review');
  expect(writes).toHaveLength(1);
  expect(writes[0].changes).toHaveLength(1);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ runtime: 'local RUN_ID fixture', saveStatus: 200, reloadMappedRange: true, answerPreserved: true, writeCount: writes.length }));
});
