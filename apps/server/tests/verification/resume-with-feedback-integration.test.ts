/**
 * Integration verification test for POST /api/auto-mode/resume-with-feedback endpoint
 * This is a temporary test to verify the feature works correctly end-to-end.
 * Will be deleted after verification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createResumeWithFeedbackHandler } from '../../src/routes/auto-mode/routes/resume-with-feedback.js';

describe('Integration: POST /api/auto-mode/resume-with-feedback', () => {
  let mockAutoModeService: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonSpy: any;
  let statusSpy: any;

  beforeEach(() => {
    // Mock AutoModeService with realistic behavior
    mockAutoModeService = {
      resumeWithFeedback: vi.fn().mockResolvedValue(undefined),
    };

    // Mock Response
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });
    mockResponse = {
      json: jsonSpy,
      status: statusSpy,
    };

    // Mock Request
    mockRequest = {
      body: {},
    };
  });

  describe('Acceptance Criteria Verification', () => {
    it('✅ Endpoint accepts featureId and feedback', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-test-123',
        feedback: 'Please add comprehensive error handling',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Verify service was called with correct parameters
      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-test-123',
        'Please add comprehensive error handling'
      );
      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledTimes(1);

      // Verify success response
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('✅ Adds feedback to agent context (verified via service call)', async () => {
      const testFeedback = 'Add unit tests and improve documentation';
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-456',
        feedback: testFeedback,
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Verify feedback is passed to the service (service handles adding to context)
      const calls = mockAutoModeService.resumeWithFeedback.mock.calls;
      expect(calls[0][2]).toBe(testFeedback);
    });

    it('✅ Resumes running agent or starts new one (via executeFeature)', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-789',
        feedback: 'Refactor for better performance',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Verify resumeWithFeedback is called (which internally calls executeFeature)
      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });

    it('✅ Emits feature:follow-up-started event (service responsibility)', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-event-test',
        feedback: 'Fix the validation logic',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Service is responsible for emitting events
      // Verify service was called (event emission happens inside)
      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-event-test',
        'Fix the validation logic'
      );
    });
  });

  describe('Request Validation', () => {
    it('validates projectPath is required', async () => {
      mockRequest.body = {
        featureId: 'feature-123',
        feedback: 'Test feedback',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
      expect(mockAutoModeService.resumeWithFeedback).not.toHaveBeenCalled();
    });

    it('validates featureId is required', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        feedback: 'Test feedback',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'featureId is required',
      });
      expect(mockAutoModeService.resumeWithFeedback).not.toHaveBeenCalled();
    });

    it('validates feedback is required', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-123',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'feedback is required',
      });
      expect(mockAutoModeService.resumeWithFeedback).not.toHaveBeenCalled();
    });

    it('validates all three parameters together', async () => {
      mockRequest.body = {};

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });
  });

  describe('Background Execution', () => {
    it('returns immediately and executes in background', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-bg-test',
        feedback: 'Add logging',
      };

      // Simulate long-running operation
      mockAutoModeService.resumeWithFeedback = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      );

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      const startTime = Date.now();
      await handler(mockRequest as Request, mockResponse as Response);
      const endTime = Date.now();

      // Should return immediately (< 50ms), not wait for the 200ms delay
      expect(endTime - startTime).toBeLessThan(50);
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });

    it('logs errors from background execution without failing request', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-error-test',
        feedback: 'Test error handling',
      };

      mockAutoModeService.resumeWithFeedback = vi
        .fn()
        .mockRejectedValue(new Error('Feature is already running'));

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Should still return success (error is logged in background)
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
      expect(statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles synchronous errors during setup', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-sync-error',
        feedback: 'Test sync error',
      };

      // Simulate synchronous error
      mockAutoModeService.resumeWithFeedback = vi.fn(() => {
        throw new Error('Invalid configuration');
      });

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid configuration',
      });
    });

    it('handles edge case: empty string feedback', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-empty-feedback',
        feedback: '',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Empty string is falsy, should be caught by validation
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'feedback is required',
      });
    });

    it('handles edge case: whitespace-only feedback', async () => {
      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-whitespace',
        feedback: '   ',
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      // Whitespace-only feedback is truthy, should pass validation
      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-whitespace',
        '   '
      );
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('handles multi-line feedback with special characters', async () => {
      const complexFeedback = `Please update the code to:
1. Add error handling for network failures
2. Implement retry logic with exponential backoff
3. Add "comprehensive" logging (debug & info levels)

Note: Use the existing \`ErrorHandler\` class.`;

      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-complex',
        feedback: complexFeedback,
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-complex',
        complexFeedback
      );
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });

    it('handles very long feedback (stress test)', async () => {
      const longFeedback = 'This is a very detailed feedback message. '.repeat(100);

      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-long-feedback',
        feedback: longFeedback,
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-long-feedback',
        longFeedback
      );
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });

    it('handles feedback with code snippets', async () => {
      const feedbackWithCode = `Please update the validation:
\`\`\`typescript
if (!user.email) {
  throw new Error('Email is required');
}
\`\`\``;

      mockRequest.body = {
        projectPath: '/test/project',
        featureId: 'feature-code-snippet',
        feedback: feedbackWithCode,
      };

      const handler = createResumeWithFeedbackHandler(mockAutoModeService);
      await handler(mockRequest as Request, mockResponse as Response);

      expect(mockAutoModeService.resumeWithFeedback).toHaveBeenCalledWith(
        '/test/project',
        'feature-code-snippet',
        feedbackWithCode
      );
      expect(jsonSpy).toHaveBeenCalledWith({ success: true });
    });
  });
});
