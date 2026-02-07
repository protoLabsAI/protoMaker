/**
 * Verification test for Context File CRUD Routes
 *
 * This test verifies that the context file CRUD endpoints work correctly:
 * - POST /api/context/list
 * - POST /api/context/get
 * - POST /api/context/create
 * - POST /api/context/delete
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const API_BASE_URL = process.env.AUTOMAKER_API_URL || 'http://localhost:3008';
const API_KEY = process.env.AUTOMAKER_API_KEY || 'test-key';

// Helper function to make API calls
async function apiCall(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/api/context${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  return response;
}

test.describe('Context File CRUD Routes', () => {
  let testProjectPath: string;

  test.beforeAll(() => {
    // Create a temporary test project directory
    testProjectPath = path.join(os.tmpdir(), `automaker-test-${Date.now()}`);
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

  test('POST /api/context/list should return empty array for new project', async () => {
    const response = await apiCall('/list', {
      projectPath: testProjectPath,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      success?: boolean;
      files?: Array<{ name: string; size: number }>;
    };
    expect(data.success).toBe(true);
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files?.length).toBe(0);
  });

  test('POST /api/context/create should create a new context file', async () => {
    const response = await apiCall('/create', {
      projectPath: testProjectPath,
      filename: 'test-context.md',
      content: '# Test Context\n\nThis is a test context file.',
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(true);
  });

  test('POST /api/context/list should return created file', async () => {
    const response = await apiCall('/list', {
      projectPath: testProjectPath,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      success?: boolean;
      files?: Array<{ name: string; size: number }>;
    };
    expect(data.success).toBe(true);
    expect(data.files?.length).toBe(1);
    expect(data.files?.[0].name).toBe('test-context.md');
    expect(data.files?.[0].size).toBeGreaterThan(0);
  });

  test('POST /api/context/get should read context file', async () => {
    const response = await apiCall('/get', {
      projectPath: testProjectPath,
      filename: 'test-context.md',
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success?: boolean; content?: string };
    expect(data.success).toBe(true);
    expect(data.content).toBe('# Test Context\n\nThis is a test context file.');
  });

  test('POST /api/context/get should return 404 for non-existent file', async () => {
    const response = await apiCall('/get', {
      projectPath: testProjectPath,
      filename: 'non-existent.md',
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });

  test('POST /api/context/create should reject invalid filenames', async () => {
    const response = await apiCall('/create', {
      projectPath: testProjectPath,
      filename: '../etc/passwd',
      content: 'malicious',
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });

  test('POST /api/context/create should reject files without .md or .txt extension', async () => {
    const response = await apiCall('/create', {
      projectPath: testProjectPath,
      filename: 'test.json',
      content: 'content',
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });

  test('POST /api/context/delete should delete context file', async () => {
    // Create a file first
    await apiCall('/create', {
      projectPath: testProjectPath,
      filename: 'delete-test.md',
      content: 'This will be deleted',
    });

    // Delete the file
    const response = await apiCall('/delete', {
      projectPath: testProjectPath,
      filename: 'delete-test.md',
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(true);

    // Verify it's gone
    const listResponse = await apiCall('/list', {
      projectPath: testProjectPath,
    });
    const listData = (await listResponse.json()) as {
      files?: Array<{ name: string }>;
    };
    expect(listData.files?.some((f) => f.name === 'delete-test.md')).toBe(false);
  });

  test('POST /api/context/delete should return 404 for non-existent file', async () => {
    const response = await apiCall('/delete', {
      projectPath: testProjectPath,
      filename: 'non-existent.md',
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });

  test('POST /api/context/create should support .txt files', async () => {
    const response = await apiCall('/create', {
      projectPath: testProjectPath,
      filename: 'test-rules.txt',
      content: 'Some text rules',
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(true);

    // Verify it can be read
    const getResponse = await apiCall('/get', {
      projectPath: testProjectPath,
      filename: 'test-rules.txt',
    });
    const getData = (await getResponse.json()) as { content?: string };
    expect(getData.content).toBe('Some text rules');
  });

  test('POST /api/context/list should require projectPath', async () => {
    const response = await apiCall('/list', {
      projectPath: undefined,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });

  test('POST /api/context/create should require all fields', async () => {
    const response = await apiCall('/create', {
      projectPath: testProjectPath,
      filename: 'test.md',
      // missing content
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { success?: boolean };
    expect(data.success).toBe(false);
  });
});
