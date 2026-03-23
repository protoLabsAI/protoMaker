/**
 * Verification test for Board Settings Panel feature.
 *
 * Verifies:
 * 1. The settings toggle button renders in the board header
 * 2. Clicking the toggle opens the settings panel
 * 3. The panel shows the expected settings sections
 * 4. Closing the panel works via the X button
 *
 * Delete after verification.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDirPath, setupRealProject, authenticateForTests } from './utils';

const TEST_TEMP_DIR = createTempDirPath('board-settings-panel-test');

test.describe('Board Settings Panel', () => {
  let projectPath: string;
  const projectName = `board-settings-test-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
  });

  test.afterAll(() => {
    if (fs.existsSync(TEST_TEMP_DIR)) {
      fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await authenticateForTests(page);
    await setupRealProject(page, projectPath, projectName, { setAsCurrent: true });
    await page.goto('/');
    await page.waitForSelector('[data-testid="board-view"]', { timeout: 15000 });
  });

  test('settings toggle button is visible in the board header', async ({ page }) => {
    const toggleBtn = page.getByTestId('board-settings-toggle');
    await expect(toggleBtn).toBeVisible();
  });

  test('clicking the toggle opens the settings panel', async ({ page }) => {
    const toggleBtn = page.getByTestId('board-settings-toggle');
    await toggleBtn.click();

    const panel = page.getByTestId('board-settings-panel');
    await expect(panel).toBeVisible();
  });

  test('settings panel contains expected controls', async ({ page }) => {
    const toggleBtn = page.getByTestId('board-settings-toggle');
    await toggleBtn.click();

    const panel = page.getByTestId('board-settings-panel');
    await expect(panel).toBeVisible();

    // Check concurrency slider is present
    await expect(panel.getByTestId('board-settings-concurrency-slider')).toBeVisible();

    // Check skip verification toggle is present
    await expect(panel.getByTestId('board-settings-skip-verification')).toBeVisible();

    // Check planning mode select is present
    await expect(panel.getByTestId('board-settings-planning-mode')).toBeVisible();

    // Check git workflow toggles are present
    await expect(panel.getByTestId('board-settings-auto-commit')).toBeVisible();
    await expect(panel.getByTestId('board-settings-auto-push')).toBeVisible();
    await expect(panel.getByTestId('board-settings-auto-create-pr')).toBeVisible();
    await expect(panel.getByTestId('board-settings-auto-merge-pr')).toBeVisible();
  });

  test('closing the panel via X button hides it', async ({ page }) => {
    const toggleBtn = page.getByTestId('board-settings-toggle');
    await toggleBtn.click();

    const panel = page.getByTestId('board-settings-panel');
    await expect(panel).toBeVisible();

    const closeBtn = page.getByTestId('board-settings-panel-close');
    await closeBtn.click();

    await expect(panel).not.toBeVisible();
  });

  test('toggle button shows active state when panel is open', async ({ page }) => {
    const toggleBtn = page.getByTestId('board-settings-toggle');

    // Before opening — should not have active/primary styling
    await expect(toggleBtn).not.toHaveClass(/bg-primary/);

    // After opening — should have active/primary styling
    await toggleBtn.click();
    await expect(toggleBtn).toHaveClass(/bg-primary/);
  });
});
