import { test, expect } from '@playwright/test';
import { UI_BASE_URL, TIMEOUTS } from './utils';
import { setupProjectWithAuth } from './utils/project/setup';

test.describe('Mobile Bottom Navigation', () => {
  test('should show bottom nav on mobile and hide on desktop', async ({ page }) => {
    // Set up a project with authentication
    await setupProjectWithAuth(page);

    // Set desktop viewport first
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${UI_BASE_URL}/board`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(TIMEOUTS.settle);

    // Bottom nav should not be visible on desktop
    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await expect(bottomNav).not.toBeVisible();

    // Switch to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(TIMEOUTS.settle);

    // Bottom nav should be visible on mobile
    await expect(bottomNav).toBeVisible();
  });

  test('should navigate between tabs correctly on mobile', async ({ page }) => {
    await setupProjectWithAuth(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${UI_BASE_URL}/board`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(TIMEOUTS.settle);

    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();

    // Test navigation to Analytics
    const analyticsButton = page.getByRole('button', { name: 'Analytics' });
    await analyticsButton.click();
    await page.waitForTimeout(TIMEOUTS.animation);
    expect(page.url()).toContain('/analytics');
    await expect(analyticsButton).toHaveClass(/text-primary/);

    // Test navigation to Notes
    const notesButton = page.getByRole('button', { name: 'Notes' });
    await notesButton.click();
    await page.waitForTimeout(TIMEOUTS.animation);
    expect(page.url()).toContain('/notes');
    await expect(notesButton).toHaveClass(/text-primary/);

    // Test navigation to Settings
    const settingsButton = page.getByRole('button', { name: 'Settings' });
    await settingsButton.click();
    await page.waitForTimeout(TIMEOUTS.animation);
    expect(page.url()).toContain('/settings');
    await expect(settingsButton).toHaveClass(/text-primary/);

    // Test navigation back to Board
    const boardButton = page.getByRole('button', { name: 'Board' });
    await boardButton.click();
    await page.waitForTimeout(TIMEOUTS.animation);
    expect(page.url()).toContain('/board');
    await expect(boardButton).toHaveClass(/text-primary/);
  });

  test('should have correct safe area padding', async ({ page }) => {
    await setupProjectWithAuth(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${UI_BASE_URL}/board`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(TIMEOUTS.settle);

    const bottomNav = page.getByTestId('mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();

    // Check that bottom nav has the correct classes for safe area
    const classes = await bottomNav.getAttribute('class');
    expect(classes).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(classes).toContain('h-[56px]');
  });

  test('should hide sidebar toggle on mobile', async ({ page }) => {
    await setupProjectWithAuth(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${UI_BASE_URL}/board`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(TIMEOUTS.settle);

    // Sidebar toggle should not be visible on mobile (< 768px)
    const sidebarToggle = page.getByTestId('mobile-sidebar-toggle');
    await expect(sidebarToggle).not.toBeVisible();
  });
});
