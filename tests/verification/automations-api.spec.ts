/**
 * Verification test for Automation Registry REST API
 *
 * Tests all /api/automations endpoints:
 * - GET  /api/automations/list
 * - GET  /api/automations/:id
 * - POST /api/automations/create
 * - PUT  /api/automations/:id
 * - DELETE /api/automations/:id
 * - GET  /api/automations/:id/history
 * - POST /api/automations/:id/run
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.AUTOMAKER_API_URL || 'http://localhost:3008';
const API_KEY = process.env.AUTOMAKER_API_KEY || 'test-key';

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

async function get(path: string) {
  return fetch(`${API_BASE_URL}${path}`, { headers });
}

async function post(path: string, body: unknown) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function put(path: string, body: unknown) {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

async function del(path: string) {
  return fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers });
}

test.describe('Automation Registry REST API', () => {
  let createdId: string;

  test('GET /api/automations/list returns an array', async () => {
    const res = await get('/api/automations/list');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { automations: unknown[] };
    expect(Array.isArray(data.automations)).toBe(true);
  });

  test('POST /api/automations/create requires name and flowId', async () => {
    const res = await post('/api/automations/create', {});
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(typeof data.error).toBe('string');
  });

  test('POST /api/automations/create creates a cron automation', async () => {
    const res = await post('/api/automations/create', {
      name: 'Test Verification Automation',
      flowId: 'test-flow',
      trigger: { type: 'cron', expression: '0 * * * *' },
      enabled: false,
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      name: string;
      enabled: boolean;
      trigger: { type: string; expression: string };
    };
    expect(data.id).toBeTruthy();
    expect(data.name).toBe('Test Verification Automation');
    expect(data.enabled).toBe(false);
    expect(data.trigger.type).toBe('cron');
    createdId = data.id;
  });

  test('GET /api/automations/list includes the created automation', async () => {
    const res = await get('/api/automations/list');
    const data = (await res.json()) as { automations: Array<{ id: string }> };
    expect(data.automations.some((a) => a.id === createdId)).toBe(true);
  });

  test('GET /api/automations/:id returns the automation', async () => {
    const res = await get(`/api/automations/${createdId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.id).toBe(createdId);
    expect(data.name).toBe('Test Verification Automation');
  });

  test('GET /api/automations/:id returns 404 for unknown id', async () => {
    const res = await get('/api/automations/nonexistent-id-000');
    expect(res.status).toBe(404);
  });

  test('PUT /api/automations/:id updates automation fields', async () => {
    const res = await put(`/api/automations/${createdId}`, { enabled: true });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; enabled: boolean };
    expect(data.id).toBe(createdId);
    expect(data.enabled).toBe(true);
  });

  test('PUT /api/automations/:id returns 404 for unknown id', async () => {
    const res = await put('/api/automations/nonexistent-id-000', { enabled: true });
    expect(res.status).toBe(404);
  });

  test('GET /api/automations/:id/history returns run array', async () => {
    const res = await get(`/api/automations/${createdId}/history`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { runs: unknown[] };
    expect(Array.isArray(data.runs)).toBe(true);
  });

  test('GET /api/automations/:id/history returns 404 for unknown id', async () => {
    const res = await get('/api/automations/nonexistent-id-000/history');
    expect(res.status).toBe(404);
  });

  test('POST /api/automations/:id/run returns 404 for unknown id', async () => {
    const res = await post('/api/automations/nonexistent-id-000/run', {});
    expect(res.status).toBe(404);
  });

  test('DELETE /api/automations/:id deletes the automation', async () => {
    const res = await del(`/api/automations/${createdId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; id: string };
    expect(data.success).toBe(true);
    expect(data.id).toBe(createdId);
  });

  test('DELETE /api/automations/:id returns 404 for unknown id', async () => {
    const res = await del('/api/automations/nonexistent-id-000');
    expect(res.status).toBe(404);
  });

  test('GET /api/automations/:id returns 404 after deletion', async () => {
    const res = await get(`/api/automations/${createdId}`);
    expect(res.status).toBe(404);
  });
});
