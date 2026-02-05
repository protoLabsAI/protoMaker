/**
 * Temporary Verification Test for Discord Project Settings
 *
 * This test verifies that the Discord settings UI is correctly integrated
 * into the project settings view. It will be deleted after verification.
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, handleLoginScreenIfPresent, setupTestProject } from './apps/ui/tests/utils';

test.describe('Discord Project Settings Verification', () => {
  test('should display Discord settings section in project settings', async ({ page }) => {
    // Authenticate and set up a test project
    await authenticateForTests(page);
    await setupTestProject(page, { projectName: 'discord-test' });

    // Navigate to project settings
    await page.goto('/project-settings');
    await page.waitForLoadState('load');
    await handleLoginScreenIfPresent(page);

    // Wait for project settings view to be visible
    await expect(page.locator('[data-testid="project-settings-view"]')).toBeVisible({ timeout: 15000 });

    // Verify Discord navigation item exists
    const discordNavItem = page.locator('button:has-text("Discord")');
    await expect(discordNavItem).toBeVisible({ timeout: 5000 });

    // Click on Discord navigation item
    await discordNavItem.click();

    // Wait for Discord section to be visible
    await expect(page.locator('h2:has-text("Discord Integration")')).toBeVisible({ timeout: 5000 });

    // Verify key UI elements exist
    await expect(page.locator('label:has-text("Enable Discord Integration")')).toBeVisible();
    await expect(page.locator('#discordEnabled')).toBeVisible();

    // Enable Discord integration
    const enableSwitch = page.locator('#discordEnabled');
    await enableSwitch.click();

    // Verify channel mapping fields appear
    await expect(page.locator('label:has-text("Features Channel")')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('label:has-text("Errors Channel")')).toBeVisible();
    await expect(page.locator('label:has-text("Completions Channel")')).toBeVisible();

    // Verify auto-create channels toggle
    await expect(page.locator('label:has-text("Auto-Create Channels")')).toBeVisible();

    // Verify sync button
    await expect(page.locator('button:has-text("Sync Channels")')).toBeVisible();

    // Fill in channel IDs
    await page.locator('#featuresChannel').fill('123456789012345678');
    await page.locator('#errorsChannel').fill('234567890123456789');
    await page.locator('#completionsChannel').fill('345678901234567890');

    // Verify external link buttons appear for filled channels
    const externalLinkButtons = page.locator('button:has([class*="lucide-external-link"])');
    await expect(externalLinkButtons).toHaveCount(3);

    // Enable auto-create channels
    await page.locator('#autoCreateChannels').click();

    // Save settings
    await page.locator('button:has-text("Save Settings")').click();

    // Verify success toast
    await expect(page.locator('text=Discord settings saved')).toBeVisible({ timeout: 5000 });

    // Reload and verify settings persisted
    await page.reload();
    await page.waitForLoadState('load');

    // Navigate back to Discord settings
    await page.locator('button:has-text("Discord")').click();

    // Verify Discord is still enabled
    const enabledSwitch = page.locator('#discordEnabled');
    await expect(enabledSwitch).toBeChecked();

    // Verify channel values persisted
    await expect(page.locator('#featuresChannel')).toHaveValue('123456789012345678');
    await expect(page.locator('#errorsChannel')).toHaveValue('234567890123456789');
    await expect(page.locator('#completionsChannel')).toHaveValue('345678901234567890');

    // Verify auto-create is still enabled
    await expect(page.locator('#autoCreateChannels')).toBeChecked();
  });

  test('should handle Discord integration toggle correctly', async ({ page }) => {
    await authenticateForTests(page);
    await setupTestProject(page, { projectName: 'discord-toggle-test' });

    await page.goto('/project-settings');
    await page.waitForLoadState('load');

    // Click Discord navigation
    await page.locator('button:has-text("Discord")').click();

    // Initially, channel fields should not be visible
    const featuresChannelLabel = page.locator('label:has-text("Features Channel")');
    await expect(featuresChannelLabel).not.toBeVisible();

    // Enable Discord
    await page.locator('#discordEnabled').click();

    // Now channel fields should be visible
    await expect(featuresChannelLabel).toBeVisible({ timeout: 2000 });

    // Disable Discord
    await page.locator('#discordEnabled').click();

    // Channel fields should be hidden again
    await expect(featuresChannelLabel).not.toBeVisible();
  });

  test('should display documentation section', async ({ page }) => {
    await authenticateForTests(page);
    await setupTestProject(page, { projectName: 'discord-docs-test' });

    await page.goto('/project-settings');
    await page.waitForLoadState('load');

    await page.locator('button:has-text("Discord")').click();

    // Verify documentation section exists
    await expect(page.locator('h3:has-text("Setting up Discord Integration")')).toBeVisible();

    // Verify key documentation points
    await expect(page.locator('text=Ensure the Discord MCP server is configured')).toBeVisible();
    await expect(page.locator('text=right-clicking a channel in Discord')).toBeVisible();
  });
});
