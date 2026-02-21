/**
 * Engine Status API Verification Test
 *
 * Verifies that the POST /api/engine/status endpoint works correctly
 * and returns all required engine information including:
 * - Auto-mode status
 * - Agent execution status
 * - Git workflow status
 * - Signal intake status
 * - PR feedback status
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, API_BASE_URL } from '../utils';

test.describe('Engine Status API Verification', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateForTests(page);
  });

  test('POST /api/engine/status should return expected structure', async ({ page }) => {
    const response = await page.request.post(`${API_BASE_URL}/api/engine/status`, {
      data: {},
    });

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify top-level structure
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('autoMode');
    expect(data).toHaveProperty('agentExecution');
    expect(data).toHaveProperty('gitWorkflow');
    expect(data).toHaveProperty('signalIntake');
    expect(data).toHaveProperty('prFeedback');

    // Verify autoMode structure
    expect(data.autoMode).toHaveProperty('running');
    expect(typeof data.autoMode.running).toBe('boolean');
    expect(data.autoMode).toHaveProperty('queueDepth');
    expect(typeof data.autoMode.queueDepth).toBe('number');

    // Verify agentExecution structure
    expect(data.agentExecution).toHaveProperty('activeAgents');
    expect(Array.isArray(data.agentExecution.activeAgents)).toBe(true);

    // Verify gitWorkflow structure
    expect(data.gitWorkflow).toHaveProperty('activeWorktrees');
    expect(typeof data.gitWorkflow.activeWorktrees).toBe('number');

    // Verify signalIntake structure (if present)
    if (data.signalIntake) {
      expect(typeof data.signalIntake).toBe('object');
    }

    // Verify prFeedback structure (if present)
    if (data.prFeedback) {
      expect(typeof data.prFeedback).toBe('object');
    }
  });
});
