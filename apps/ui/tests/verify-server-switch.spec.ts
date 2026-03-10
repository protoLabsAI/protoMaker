/**
 * Temporary verification test for the Server URL Runtime Switching feature.
 * Verifies the instance name badge and quick-switch dropdown in the bottom panel.
 * Delete after confirming the feature passes.
 */
import { test, expect } from '@playwright/test';

test.describe('Bottom Panel: Server instance badge', () => {
  test('shows Server icon and a label in the bottom panel status bar', async ({ page }) => {
    await page.goto('/');

    // Wait for the bottom panel to appear
    const bottomPanel = page.locator('.shrink-0.h-8');
    await expect(bottomPanel).toBeVisible({ timeout: 10000 });

    // The Server badge button should be present
    const serverBadge = page.getByRole('button', { name: /switch server connection/i });
    await expect(serverBadge).toBeVisible();

    // It should show a label (instance name or hostname)
    const badgeText = await serverBadge.textContent();
    expect(badgeText).toBeTruthy();
    expect(badgeText!.trim().length).toBeGreaterThan(0);
  });

  test('clicking the badge opens a dropdown with "Switch Server" header', async ({ page }) => {
    await page.goto('/');

    const serverBadge = page.getByRole('button', { name: /switch server connection/i });
    await expect(serverBadge).toBeVisible({ timeout: 10000 });

    await serverBadge.click();

    // Dropdown should appear with "Switch Server" text
    const dropdown = page.getByText('Switch Server');
    await expect(dropdown).toBeVisible();

    // Dropdown should have a "Manage connections..." option
    const manageOption = page.getByText('Manage connections...');
    await expect(manageOption).toBeVisible();
  });

  test('tooltip shows full URL and connection status on hover', async ({ page }) => {
    await page.goto('/');

    const serverBadge = page.getByRole('button', { name: /switch server connection/i });
    await expect(serverBadge).toBeVisible({ timeout: 10000 });

    await serverBadge.hover();

    // Tooltip should show "Server Connection" heading
    const tooltipHeading = page.getByText('Server Connection');
    await expect(tooltipHeading).toBeVisible({ timeout: 3000 });

    // Tooltip should show URL row
    const urlLabel = page.getByText('URL');
    await expect(urlLabel).toBeVisible();

    // Tooltip should show connection status
    const statusLabel = page.getByText('connected');
    await expect(statusLabel).toBeVisible();
  });
});
