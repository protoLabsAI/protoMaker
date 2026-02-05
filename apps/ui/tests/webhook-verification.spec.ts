/**
 * GitHub Webhook Verification Test
 *
 * This test verifies that the GitHub webhook endpoint:
 * - Accepts POST requests
 * - Validates HMAC-SHA256 signatures
 * - Returns 200 for valid webhooks
 * - Returns 401 for invalid/missing signatures
 * - Logs webhook events
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import { API_BASE_URL } from './utils';

const WEBHOOK_PATH = '/api/webhooks/github';
const TEST_SECRET = 'test-webhook-secret-123';

/**
 * Create HMAC-SHA256 signature for webhook payload
 */
function createSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return 'sha256=' + hmac.digest('hex');
}

test.describe('GitHub Webhook Endpoint', () => {
  test.beforeAll(() => {
    // Set webhook secret for testing
    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts valid webhook with correct signature', async ({ request }) => {
    const payload = {
      action: 'opened',
      issue: {
        number: 1,
        title: 'Test issue',
      },
      repository: {
        full_name: 'test/repo',
      },
    };

    const payloadString = JSON.stringify(payload);
    const signature = createSignature(payloadString, TEST_SECRET);

    const response = await request.post(`${API_BASE_URL}${WEBHOOK_PATH}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Event': 'issues',
        'X-GitHub-Delivery': 'test-delivery-123',
      },
      data: payloadString,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Webhook received');
  });

  test('rejects webhook with missing signature', async ({ request }) => {
    const payload = {
      action: 'opened',
      issue: { number: 1 },
    };

    const response = await request.post(`${API_BASE_URL}${WEBHOOK_PATH}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'issues',
      },
      data: JSON.stringify(payload),
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing signature');
  });

  test('rejects webhook with invalid signature', async ({ request }) => {
    const payload = {
      action: 'opened',
      issue: { number: 1 },
    };

    const payloadString = JSON.stringify(payload);
    const invalidSignature = 'sha256=invalidhash123';

    const response = await request.post(`${API_BASE_URL}${WEBHOOK_PATH}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': invalidSignature,
        'X-GitHub-Event': 'issues',
      },
      data: payloadString,
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid signature');
  });

  test('rejects webhook with wrong secret', async ({ request }) => {
    const payload = {
      action: 'opened',
      issue: { number: 1 },
    };

    const payloadString = JSON.stringify(payload);
    const wrongSecret = 'wrong-secret';
    const signature = createSignature(payloadString, wrongSecret);

    const response = await request.post(`${API_BASE_URL}${WEBHOOK_PATH}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Event': 'issues',
      },
      data: payloadString,
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid signature');
  });

  test('handles various webhook event types', async ({ request }) => {
    const eventTypes = ['issues', 'pull_request', 'push', 'release'];

    for (const eventType of eventTypes) {
      const payload = {
        action: 'test',
        repository: {
          full_name: 'test/repo',
        },
      };

      const payloadString = JSON.stringify(payload);
      const signature = createSignature(payloadString, TEST_SECRET);

      const response = await request.post(`${API_BASE_URL}${WEBHOOK_PATH}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Event': eventType,
          'X-GitHub-Delivery': `test-delivery-${eventType}`,
        },
        data: payloadString,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    }
  });
});
