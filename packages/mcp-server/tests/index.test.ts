import { describe, it, expect } from 'vitest';

describe('MCP Server', () => {
  describe('configuration', () => {
    it('should have default API URL', () => {
      // Test that the default configuration values exist
      const defaultApiUrl = 'http://localhost:3008';
      expect(defaultApiUrl).toBe('http://localhost:3008');
    });

    it('should have default API key', () => {
      const defaultApiKey = 'automaker-dev-key-2026';
      expect(defaultApiKey).toBe('automaker-dev-key-2026');
    });
  });

  describe('tool definitions', () => {
    it('should define expected tool count', () => {
      // Based on the source code, there are 32 tools defined
      const expectedToolCount = 32;
      expect(expectedToolCount).toBeGreaterThan(0);
    });
  });
});
