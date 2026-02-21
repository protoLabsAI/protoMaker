/**
 * Flow Graph Smoke Test
 *
 * Verifies that the analytics view with flow graph canvas renders successfully
 * without testing detailed interactions or data accuracy.
 *
 * This test provides basic regression detection for the flow-graph component
 * by checking that core UI elements are visible and no critical errors occur.
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, UI_BASE_URL } from '../utils';

test.describe('Flow Graph Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateForTests(page);
  });

  test('should render analytics view with flow graph canvas', async ({ page }) => {
    // Navigate to analytics route
    await page.goto(`${UI_BASE_URL}/analytics`);
    await page.waitForLoadState('load');

    // Verify flow graph view container renders
    const flowGraphView = page.getByTestId('flow-graph-view');
    await expect(flowGraphView).toBeVisible({ timeout: 10000 });

    // Verify React Flow canvas renders
    const flowGraphCanvas = page.getByTestId('flow-graph-canvas');
    await expect(flowGraphCanvas).toBeVisible({ timeout: 10000 });

    // Verify at least one node is rendered (check for any .react-flow__node element)
    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible({ timeout: 10000 });

    // Verify React Flow controls are present
    const controls = page.locator('.react-flow__controls');
    await expect(controls).toBeVisible();

    // Verify legend toggle button exists
    const legendToggle = page.getByTestId('flow-graph-legend-toggle');
    await expect(legendToggle).toBeVisible();
  });

  test('should load without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE_URL}/analytics`);
    await page.waitForLoadState('load');

    // Wait for initial render
    await page.getByTestId('flow-graph-view').waitFor({ timeout: 10000 });

    // Allow time for any deferred errors
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('ResizeObserver') && // React Flow known warning
        !err.includes('WebSocket') // WebSocket errors in test environment
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
