import { test, expect } from '@playwright/test';

const instructorEmail = process.env.E2E_INSTRUCTOR_EMAIL;
const instructorPassword = process.env.E2E_INSTRUCTOR_PASSWORD;
const projectId = process.env.E2E_PROJECT_ID;

test.skip(!instructorEmail || !instructorPassword || !projectId,
  'Set E2E_INSTRUCTOR_EMAIL, E2E_INSTRUCTOR_PASSWORD, and E2E_PROJECT_ID for a project with an unlocked section.');

test('batch 409 preserves draft and highlights conflict', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(instructorEmail);
  await page.locator('input[name="passwordHash"]').fill(instructorPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/instructor\//);
  await page.goto(`/instructor/projects/${projectId}`);
  await page.locator('#tab-sections').click();

  const firstRow = page.locator('[data-testid^="section-row-"]').first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  const firstId = (await firstRow.getAttribute('data-testid')).replace('section-row-', '');

  const draftTitle = `Draft Title ${Date.now()}`;
  await page.getByTestId(`rename-section-${firstId}`).click();
  const input = page.getByTestId(`section-title-input-${firstId}`);
  await input.fill(draftTitle);
  await input.press('Enter');
  const saveBtn = page.getByTestId('save-section-changes');
  await expect(saveBtn).toBeEnabled();

  await page.route('**/api/papers/*/sections/batch', async route => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 409,
        error: 'Conflict',
        message: `SECTION_REVISION_CONFLICT: section ${firstId} was modified by another user.`,
        path: route.request().url(),
        fieldErrors: { sectionId: firstId, code: 'SECTION_REVISION_CONFLICT', expectedRevision: '0', actualRevision: '1' }
      })
    });
  });

  await saveBtn.click();

  await expect(firstRow).toHaveClass(/ring-amber-400/);
  await expect(firstRow).toContainText(draftTitle);
  await expect(page.getByTestId(`reload-section-${firstId}`)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/modified by another user|đã được người khác sửa/i);
  await expect(saveBtn).toBeVisible();
});
