/**
 * Scheduler Status Endpoint Verification Test
 *
 * This test verifies that the GET /api/scheduler/status endpoint works correctly
 * and returns all required scheduler information including:
 * - All registered tasks
 * - Next run times
 * - Execution counts
 * - Task status information
 */

import { test, expect } from '@playwright/test';
import { authenticateForTests, API_BASE_URL } from './utils';

test.describe('Scheduler Status Endpoint', () => {
  test('GET /api/scheduler/status should return scheduler status', async ({ page }) => {
    await authenticateForTests(page);

    // Call the scheduler status endpoint
    const response = await page.request.get(`${API_BASE_URL}/api/scheduler/status`);

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);

    // Verify scheduler status fields
    expect(data).toHaveProperty('running');
    expect(data).toHaveProperty('taskCount');
    expect(data).toHaveProperty('enabledTaskCount');
    expect(data).toHaveProperty('tasks');

    // Verify running is a boolean
    expect(typeof data.running).toBe('boolean');

    // Verify task counts are numbers
    expect(typeof data.taskCount).toBe('number');
    expect(typeof data.enabledTaskCount).toBe('number');

    // Verify tasks is an array
    expect(Array.isArray(data.tasks)).toBe(true);

    // If there are tasks, verify their structure
    if (data.tasks.length > 0) {
      const task = data.tasks[0];

      // Verify required task fields
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('enabled');
      expect(task).toHaveProperty('failureCount');
      expect(task).toHaveProperty('executionCount');

      // Verify types
      expect(typeof task.id).toBe('string');
      expect(typeof task.name).toBe('string');
      expect(typeof task.enabled).toBe('boolean');
      expect(typeof task.failureCount).toBe('number');
      expect(typeof task.executionCount).toBe('number');

      // Optional fields (should be strings if present)
      if (task.lastRun !== undefined) {
        expect(typeof task.lastRun).toBe('string');
      }
      if (task.nextRun !== undefined) {
        expect(typeof task.nextRun).toBe('string');
      }
    }
  });

  test('GET /api/scheduler/status should be accessible without authentication errors', async ({
    page,
  }) => {
    await authenticateForTests(page);

    // Make multiple requests to ensure the endpoint is stable
    for (let i = 0; i < 3; i++) {
      const response = await page.request.get(`${API_BASE_URL}/api/scheduler/status`);

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Brief delay between requests
      await page.waitForTimeout(100);
    }
  });
});
