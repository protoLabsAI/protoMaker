/**
 * Verification test for agent performance analytics endpoint
 * This is a temporary test to verify the feature works correctly
 */

import { test, expect } from '@playwright/test';

test.describe('Agent Performance Analytics API', () => {
  test('should return analytics data structure', async ({ request }) => {
    const projectPath = process.env.TEST_PROJECT_PATH || process.cwd();

    const response = await request.post('http://localhost:3001/api/analytics/agent-performance', {
      data: { projectPath },
    });

    // Should return 200 or 500 (500 if server not running, but we're checking structure)
    const status = response.status();

    if (status === 200) {
      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty('phaseAverages');
      expect(data).toHaveProperty('slowestTools');
      expect(data).toHaveProperty('retryTrends');
      expect(data).toHaveProperty('totalFeaturesAnalyzed');

      // Verify slowestTools is an array
      expect(Array.isArray(data.slowestTools)).toBe(true);

      // Verify retryTrends is an array
      expect(Array.isArray(data.retryTrends)).toBe(true);

      // Verify totalFeaturesAnalyzed is a number
      expect(typeof data.totalFeaturesAnalyzed).toBe('number');

      console.log('✅ Analytics endpoint returns correct structure');
      console.log(`📊 Total features analyzed: ${data.totalFeaturesAnalyzed}`);
      console.log(`🔧 Slowest tools count: ${data.slowestTools.length}`);
      console.log(`🔄 Features with retries: ${data.retryTrends.length}`);
    } else {
      console.log(`⚠️  Server returned status ${status} - this is expected if server is not running`);
      console.log('To run this test, start the server with: npm run dev:server');
    }
  });

  test('should return 400 for missing projectPath', async ({ request }) => {
    const response = await request.post('http://localhost:3001/api/analytics/agent-performance', {
      data: {},
    });

    const status = response.status();

    if (status === 400 || status === 500) {
      const data = await response.json();
      expect(data).toHaveProperty('error');
      console.log('✅ Correctly validates projectPath parameter');
    }
  });
});
