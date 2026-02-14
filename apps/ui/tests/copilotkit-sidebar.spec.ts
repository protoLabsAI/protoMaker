/**
 * CopilotKit Sidebar E2E Tests
 *
 * Verifies:
 * - CopilotKit endpoint availability / graceful degradation
 * - Thread management API endpoints
 * - Sidebar does not break app when runtime is unavailable
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, API_BASE_URL } from './utils';

test.describe('CopilotKit Integration', () => {
  test('CopilotKit endpoint responds or returns 404 gracefully', async ({ page }) => {
    await authenticateForTests(page);

    const response = await page.request.fetch(`${API_BASE_URL}/api/copilotkit`, {
      method: 'HEAD',
      failOnStatusCode: false,
    });

    // Either the endpoint exists (2xx/4xx) or returns 404 (no API key)
    // Both are valid — the frontend handles both cases
    expect(response.status()).toBeLessThan(500);
  });

  test('Thread list endpoint responds correctly', async ({ page }) => {
    await authenticateForTests(page);

    const response = await page.request.get(`${API_BASE_URL}/api/copilotkit/threads`, {
      failOnStatusCode: false,
    });

    if (response.status() === 404) {
      // CopilotKit routes disabled (no API key) — expected in CI
      return;
    }

    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty('threads');
    expect(Array.isArray(data.threads)).toBe(true);
  });

  test('App loads without errors when CopilotKit is unavailable', async ({ page }) => {
    await authenticateForTests(page);

    // Navigate to the app root
    await page.goto('http://localhost:3007');
    await page.waitForLoadState('networkidle');

    // The app should render without crashing
    // Check that the main layout is visible (sidebar nav exists)
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // No error toasts should appear from CopilotKit failure
    const errorToasts = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(errorToasts).toHaveCount(0);
  });

  test('Sidebar toggle shortcut does not crash the app', async ({ page }) => {
    await authenticateForTests(page);

    await page.goto('http://localhost:3007');
    await page.waitForLoadState('networkidle');

    // Press the sidebar toggle shortcut (backslash)
    await page.keyboard.press('\\');

    // App should still be responsive — check sidebar is still visible
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });
});
