import { test, expect } from '@playwright/test';

/**
 * E2E: 409 Conflict race in Sections batch update
 * - User A holds draft (rename + reorder) -> Save Changes is single PUT /papers/{docId}/sections/batch
 * - User B bumps opt_version on same section -> A save should 409 with fieldErrors.sectionId
 * - UI must highlight row ring-amber-400 and preserve draftSections (no wipe)
 */
test('batch 409 preserves draft and highlights conflict', async ({ page, request }) => {
  // Assumes seeded project; use API to get real ids if available
  // Intercept batch endpoint
  await page.goto('/login');
  // Login as instructor (adjust credentials to seed)
  await page.getByPlaceholder('Email').fill('instructor@example.com');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/instructor\/projects/);

  // Open first project -> Sections tab
  await page.getByRole('link', { name: /Project/ }).first().click();
  await page.getByRole('button', { name: 'Sections' }).click();

  // Capture first section row and its id
  const firstRow = page.locator('[data-testid^="section-row-"]').first().or(page.locator('.ring-amber-400').first());
  // Fallback: get draggable rows
  const rows = page.locator('[data-draggable-id]');
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  const firstId = await rows.first().getAttribute('data-draggable-id');

  // Hold draft: rename first section via draft (click rename)
  await page.getByRole('button', { name: 'Rename' }).first().click();
  const input = page.locator('input').first();
  await input.fill('Draft Title ' + Date.now());
  await page.keyboard.press('Enter');
  // Save Changes should become enabled
  const saveBtn = page.getByRole('button', { name: 'Save Changes' });
  await expect(saveBtn).toBeEnabled();

  // Intercept batch to inject 409 on next call
  await page.route('**/api/papers/*/sections/batch', async route => {
    const body = await route.request().postDataJSON().catch(() => null);
    // Return 409 with fieldErrors.sectionId for first section
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

  // Capture draft title before save
  const draftTitle = await input.inputValue().catch(() => 'Draft Title');

  await saveBtn.click();

  // Assert conflict highlight and preserved draft
  const conflictRow = page.locator('.ring-amber-400');
  await expect(conflictRow).toBeVisible();
  // Draft should still contain our rename (not reverted)
  await expect(page.locator('text=' + draftTitle.slice(0, 10))).toBeVisible();

  // Reload button should appear on conflict row
  const reloadBtn = page.getByRole('button', { name: 'Reload' });
  await expect(reloadBtn).toBeVisible();

  // Banner
  await expect(page.getByText(/modified by another user/)).toBeVisible();

  // Ensure we did NOT reload page or wipe draft (Save Changes still visible)
  await expect(saveBtn).toBeVisible();
});
