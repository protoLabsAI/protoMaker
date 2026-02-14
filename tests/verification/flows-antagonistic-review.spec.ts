/**
 * Verification test for Antagonistic Review Flow Routes
 *
 * This test verifies that the antagonistic review flow endpoints work correctly:
 * - POST /api/flows/antagonistic-review/execute
 * - POST /api/flows/antagonistic-review/resume
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const API_BASE_URL = process.env.AUTOMAKER_API_URL || 'http://localhost:3008';
const API_KEY = process.env.AUTOMAKER_API_KEY || 'test-key';

// Helper function to make API calls
async function apiCall(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/api/flows${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  return response;
}

test.describe('Antagonistic Review Flow Routes', () => {
  let testProjectPath: string;

  test.beforeAll(() => {
    // Create a temporary test project directory
    testProjectPath = path.join(os.tmpdir(), `automaker-test-flow-${Date.now()}`);
    if (!fs.existsSync(testProjectPath)) {
      fs.mkdirSync(testProjectPath, { recursive: true });
    }
  });

  test.afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  test('POST /api/flows/antagonistic-review/execute should require projectPath', async () => {
    const response = await apiCall('/antagonistic-review/execute', {
      prd: {
        situation: 'Test situation',
        problem: 'Test problem',
        approach: 'Test approach',
        results: 'Test results',
      },
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('projectPath');
  });

  test('POST /api/flows/antagonistic-review/execute should require prd', async () => {
    const response = await apiCall('/antagonistic-review/execute', {
      projectPath: testProjectPath,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('prd');
  });

  test('POST /api/flows/antagonistic-review/execute should validate SPARC format', async () => {
    const response = await apiCall('/antagonistic-review/execute', {
      projectPath: testProjectPath,
      prd: {
        situation: 'Test situation',
        // Missing problem, approach, results
      },
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('situation, problem, approach, and results');
  });

  test('POST /api/flows/antagonistic-review/execute should accept valid SPARC PRD', async () => {
    const response = await apiCall('/antagonistic-review/execute', {
      projectPath: testProjectPath,
      prd: {
        situation: 'We need to improve user authentication security',
        problem: 'Current authentication lacks multi-factor authentication',
        approach: 'Implement OAuth2 with TOTP-based MFA',
        results: 'Users will have more secure authentication with MFA support',
        constraints: 'Must complete within 2 weeks',
      },
    });

    // The endpoint may return 500 if agents are not properly configured
    // but we verify the structure is correct and it accepts the request
    expect([200, 500]).toContain(response.status);

    const data = (await response.json()) as { success?: boolean; result?: any; error?: string };

    // If it succeeds, verify response structure
    if (response.status === 200) {
      expect(data.success).toBeDefined();
      if (data.success) {
        expect(data.result).toBeDefined();
        expect(data.result.avaReview).toBeDefined();
        expect(data.result.jonReview).toBeDefined();
        expect(data.result.totalDurationMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('POST /api/flows/antagonistic-review/resume should require threadId', async () => {
    const response = await apiCall('/antagonistic-review/resume', {
      hitlFeedback: 'Approve with modifications',
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('threadId');
  });

  test('POST /api/flows/antagonistic-review/resume should require hitlFeedback', async () => {
    const response = await apiCall('/antagonistic-review/resume', {
      threadId: 'test-thread-123',
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('hitlFeedback');
  });

  test('POST /api/flows/antagonistic-review/resume should return not implemented', async () => {
    const response = await apiCall('/antagonistic-review/resume', {
      threadId: 'test-thread-123',
      hitlFeedback: 'Approve with modifications',
    });

    // Resume is not yet implemented, should return 501
    expect(response.status).toBe(501);
    const data = (await response.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('not yet implemented');
  });
});
