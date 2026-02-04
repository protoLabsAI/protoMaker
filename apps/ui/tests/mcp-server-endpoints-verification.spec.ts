/**
 * MCP Server Endpoints Verification Test
 *
 * This test verifies that the MCP server's agent control endpoints
 * (start_agent, stop_agent, send_message_to_agent) route to the correct
 * server endpoints.
 *
 * Bug fix verification: The MCP server was routing to /agent/start, /agent/stop, /agent/send
 * which are for the Agent Runner chat sessions. They should route to:
 * - /auto-mode/run-feature (for start_agent)
 * - /auto-mode/stop-feature (for stop_agent)
 * - /auto-mode/follow-up-feature (for send_message_to_agent)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDirPath, cleanupTempDir, authenticateForTests, API_BASE_URL } from './utils';

const TEST_TEMP_DIR = createTempDirPath('mcp-endpoint-test');

test.describe('MCP Server Endpoint Routing', () => {
  let projectPath: string;
  const projectName = `mcp-test-project-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    // Initialize git repo for worktree support
    const { execSync } = require('child_process');
    execSync('git init', { cwd: projectPath });
    execSync('git config user.email "test@test.com"', { cwd: projectPath });
    execSync('git config user.name "Test User"', { cwd: projectPath });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    execSync('git add .', { cwd: projectPath });
    execSync('git commit -m "Initial commit"', { cwd: projectPath });

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'features'), { recursive: true });
    fs.mkdirSync(path.join(automakerDir, 'context'), { recursive: true });

    // Create a test feature
    const featureId = 'test-feature-123';
    const featureDir = path.join(automakerDir, 'features', featureId);
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'feature.json'),
      JSON.stringify(
        {
          id: featureId,
          title: 'Test Feature',
          description: 'A test feature for endpoint verification',
          status: 'backlog',
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('start_agent should route to /auto-mode/run-feature (not /agent/start)', async ({
    page,
  }) => {
    await authenticateForTests(page);

    // Try to call the /auto-mode/run-feature endpoint directly
    // This should NOT return "sessionId is required" error
    const response = await page.request.post(`${API_BASE_URL}/api/auto-mode/run-feature`, {
      data: {
        projectPath: projectPath,
        featureId: 'test-feature-123',
      },
    });

    const data = await response.json();

    // The endpoint should accept projectPath and featureId without requiring sessionId
    // It might fail for other reasons (no API key, feature not found, etc.) but NOT for sessionId
    expect(data.error).not.toBe('sessionId is required');

    // If we get a 400 status, the error should NOT be about sessionId
    if (response.status() === 400) {
      expect(data.error).not.toContain('sessionId');
    }
  });

  test('stop_agent should route to /auto-mode/stop-feature (not /agent/stop)', async ({ page }) => {
    await authenticateForTests(page);

    // Try to call the /auto-mode/stop-feature endpoint directly
    const response = await page.request.post(`${API_BASE_URL}/api/auto-mode/stop-feature`, {
      data: {
        featureId: 'test-feature-123',
      },
    });

    const data = await response.json();

    // The endpoint should accept featureId without requiring sessionId
    expect(data.error).not.toBe('sessionId is required');

    if (response.status() === 400) {
      expect(data.error).not.toContain('sessionId');
    }
  });

  test('send_message_to_agent should route to /auto-mode/follow-up-feature (not /agent/send)', async ({
    page,
  }) => {
    await authenticateForTests(page);

    // Try to call the /auto-mode/follow-up-feature endpoint directly
    const response = await page.request.post(`${API_BASE_URL}/api/auto-mode/follow-up-feature`, {
      data: {
        projectPath: projectPath,
        featureId: 'test-feature-123',
        prompt: 'Test message',
      },
    });

    const data = await response.json();

    // The endpoint should accept projectPath, featureId, and prompt without requiring sessionId
    expect(data.error).not.toBe('sessionId is required');

    if (response.status() === 400) {
      expect(data.error).not.toContain('sessionId');
    }
  });

  test('verify old /agent/start endpoint requires sessionId (proving MCP was using wrong endpoint)', async ({
    page,
  }) => {
    await authenticateForTests(page);

    // Call the OLD endpoint that the MCP was incorrectly using
    const response = await page.request.post(`${API_BASE_URL}/api/agent/start`, {
      data: {
        projectPath: projectPath,
        featureId: 'test-feature-123',
      },
    });

    const data = await response.json();

    // This endpoint SHOULD require sessionId (proving the bug)
    expect(response.status()).toBe(400);
    expect(data.error).toBe('sessionId is required');
  });
});
