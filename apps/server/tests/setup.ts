/**
 * Vitest global setup file
 * Runs before each test file
 */

import { vi, beforeEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = '/tmp/test-data';
// Skip the app-compliance gate in unit tests — it is a production concern that
// hits the filesystem + gh and would reject the mock project paths used here.
// (app-compliance-service.test.ts manages this var itself to exercise the real logic.)
process.env.AUTOMAKER_SKIP_COMPLIANCE_CHECK = '1';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
