import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';

test('[I18N] switch to Japanese language', async ({ page }) => {
  const { user } = await seedUser();

  await apiSignin({ page, email: user.email, redirectPath: '/documents' });

  // Open command menu with keyboard shortcut
  await page.keyboard.press('Meta+k');

  // Wait for command menu to be visible
  await expect(page.getByPlaceholder('Search or type a command...')).toBeVisible();

  // Type "language" to search for language switching command
  await page.getByPlaceholder('Search or type a command...').fill('language');

  // Click on "Change language" option
  await page.getByText('Change language').click();

  // Wait for language dialog to open and select Japanese
  await expect(page.getByPlaceholder('Search languages...')).toBeVisible();

  // Type "Japanese" to filter languages
  await page.getByPlaceholder('Search languages...').fill('Japanese');

  // Click on Japanese option
  await page.getByText('Japanese', { exact: true }).click();

  // Wait for the page to reload with Japanese language
  await page.waitForLoadState('networkidle');

  // Verify that the UI has switched to Japanese by checking for Japanese text
  // The "Documents" heading should now be in Japanese (ドキュメント)
  await expect(page.getByRole('heading', { name: 'ドキュメント' })).toBeVisible({
    timeout: 10000,
  });
});

test('[I18N] Japanese language persists across sessions', async ({ page, context }) => {
  const { user } = await seedUser();

  await apiSignin({ page, email: user.email, redirectPath: '/documents' });

  // Open command menu and switch to Japanese
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search or type a command...')).toBeVisible();
  await page.getByPlaceholder('Search or type a command...').fill('language');
  await page.getByText('Change language').click();
  await expect(page.getByPlaceholder('Search languages...')).toBeVisible();
  await page.getByPlaceholder('Search languages...').fill('Japanese');
  await page.getByText('Japanese', { exact: true }).click();

  // Wait for language to switch
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'ドキュメント' })).toBeVisible({
    timeout: 10000,
  });

  // Create a new page in the same context (simulating a new tab)
  const newPage = await context.newPage();
  await newPage.goto('/documents');

  // Wait for the page to load
  await newPage.waitForLoadState('networkidle');

  // Verify Japanese language persists in the new page
  await expect(newPage.getByRole('heading', { name: 'ドキュメント' })).toBeVisible({
    timeout: 10000,
  });

  await newPage.close();
});

test('[I18N] Japanese translations in common UI elements', async ({ page }) => {
  const { user } = await seedUser();

  await apiSignin({ page, email: user.email, redirectPath: '/documents' });

  // Switch to Japanese
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search or type a command...')).toBeVisible();
  await page.getByPlaceholder('Search or type a command...').fill('language');
  await page.getByText('Change language').click();
  await expect(page.getByPlaceholder('Search languages...')).toBeVisible();
  await page.getByPlaceholder('Search languages...').fill('Japanese');
  await page.getByText('Japanese', { exact: true }).click();
  await page.waitForLoadState('networkidle');

  // Navigate to settings page to verify more translations
  await page.goto('/settings/profile');
  await page.waitForLoadState('networkidle');

  // Check for Japanese text in settings page
  // "Profile" should be translated to "プロフィール" or similar
  await expect(page.locator('text=プロフィール').or(page.locator('text=設定'))).toBeVisible({
    timeout: 10000,
  });
});
