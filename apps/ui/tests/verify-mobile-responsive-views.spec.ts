/**
 * Temporary verification test for mobile-responsive memory and context views.
 * This test verifies the responsive layout changes made to memory-view.tsx
 * and context-view.tsx are working correctly.
 * DELETE THIS FILE after verification passes.
 */

import { test, expect } from '@playwright/test';
import {
  resetContextDirectory,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForNetworkIdle,
  authenticateForTests,
  waitForElement,
  waitForSplashScreenToDisappear,
  TIMEOUTS,
} from './utils';

/**
 * Navigate to the memory view with retry on session expiry.
 * Uses direct API auth (not UI login form) to recover from server restarts.
 */
async function navigateToMemory(page: Parameters<typeof navigateToContext>[0]): Promise<void> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Authenticate right before each navigation attempt
    await authenticateForTests(page);
    await page.goto('/memory');
    await page.waitForLoadState('load');
    await waitForSplashScreenToDisappear(page, 3000);

    // Check if we landed on logged-out or login page (synchronous URL check)
    const currentUrl = page.url();
    const loggedOut = await page
      .getByRole('heading', { name: /logged out/i })
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (!loggedOut && !currentUrl.includes('/login') && !currentUrl.includes('/logged-out')) {
      // Successfully reached the app
      break;
    }

    if (attempt === maxAttempts) {
      throw new Error(`Failed to navigate to memory view after ${maxAttempts} attempts`);
    }

    // Wait briefly before retry to allow server to stabilize
    await page.waitForTimeout(2000);
  }

  // Wait for loading indicator to disappear if present
  const loadingElement = page.locator('[data-testid="memory-view-loading"]');
  try {
    const loadingVisible = await loadingElement.isVisible({ timeout: 2000 });
    if (loadingVisible) {
      await loadingElement.waitFor({ state: 'hidden', timeout: 10000 });
    }
  } catch {
    // Loading element not found or already hidden
  }

  // Wait for the memory view to be visible
  await waitForElement(page, 'memory-view', { timeout: 15000 });
}

test.describe('Mobile Responsive Views', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  // ── Context view tests ─────────────────────────────────────────────────────

  test('context view - file list visible on mobile (no file selected)', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToContext(page);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(TIMEOUTS.settle);

    await expect(page.getByTestId('context-view')).toBeVisible();
    await expect(page.getByTestId('context-file-list')).toBeVisible();
  });

  test('context view - file list visible on desktop', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await authenticateForTests(page);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await navigateToContext(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(TIMEOUTS.settle);

    await expect(page.getByTestId('context-view')).toBeVisible();
    await expect(page.getByTestId('context-file-list')).toBeVisible();
  });

  // ── Memory view tests ─────────────────────────────────────────────────────

  test('memory view - file list visible on mobile (no file selected)', async ({ page }) => {
    test.setTimeout(120000);
    await setupProjectWithFixture(page, getFixturePath());
    await navigateToMemory(page);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(TIMEOUTS.settle);

    await expect(page.getByTestId('memory-view')).toBeVisible();
    await expect(page.getByTestId('memory-file-list')).toBeVisible();
  });

  test('memory view - file list visible on desktop', async ({ page }) => {
    test.setTimeout(120000);
    await setupProjectWithFixture(page, getFixturePath());
    await navigateToMemory(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(TIMEOUTS.settle);

    await expect(page.getByTestId('memory-view')).toBeVisible();
    await expect(page.getByTestId('memory-file-list')).toBeVisible();
  });
});
