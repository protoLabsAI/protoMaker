/**
 * process_idea - Shared tool for processing ideas through the LangGraph flow
 *
 * This tool wraps the IdeaProcessingService and provides a unified interface
 * for processing ideas across MCP, REST API, and LangGraph contexts.
 */

import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolContext, ToolResult } from '../../types.js';

/**
 * Input schema for process_idea tool
 */
const ProcessIdeaInputSchema = z.object({
  idea: z.string().min(1, 'Idea must be a non-empty string'),
  autoApprove: z.boolean().optional().describe('Automatically approve the idea after processing'),
  countdownSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of seconds for pre-approval countdown'),
});

/**
 * Output schema for process_idea tool
 */
const ProcessIdeaOutputSchema = z.object({
  sessionId: z.string().describe('Unique session ID for tracking the idea processing'),
  status: z
    .enum(['processing', 'awaiting_approval', 'completed', 'failed'])
    .describe('Current status of the idea processing session'),
  message: z.string().optional().describe('Additional information about the processing status'),
});

export type ProcessIdeaInput = z.infer<typeof ProcessIdeaInputSchema>;
export type ProcessIdeaOutput = z.infer<typeof ProcessIdeaOutputSchema>;

/**
 * process_idea - Process an idea through the LangGraph flow
 *
 * Takes an idea string and initiates the processing flow. Returns a session ID
 * that can be used to track progress and resume if human approval is needed.
 */
export const processIdea = defineSharedTool({
  name: 'process_idea',
  description:
    'Process an idea through the LangGraph flow. Returns a session ID for tracking progress and resuming if human approval is needed.',
  inputSchema: ProcessIdeaInputSchema,
  outputSchema: ProcessIdeaOutputSchema,
  metadata: {
    category: 'ideas',
    tags: ['ideation', 'langgraph', 'workflow'],
    version: '1.0.0',
  },
  execute: async (input, context) => {
    try {
      // Type assertion for input (validated by defineSharedTool)
      const typedInput = input as ProcessIdeaInput;

      // Get IdeaProcessingService from context
      const ideaService = context.services?.ideaProcessingService as any;

      if (!ideaService) {
        return {
          success: false,
          error:
            'IdeaProcessingService not available in context. Ensure the service is injected when executing this tool.',
        };
      }

      // Call the service to process the idea
      const sessionId = await ideaService.processIdea({
        idea: typedInput.idea,
        autoApprove: typedInput.autoApprove,
        countdownSeconds: typedInput.countdownSeconds,
      });

      return {
        success: true,
        data: {
          sessionId,
          status: 'processing',
          message: `Idea processing started. Session ID: ${sessionId}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to process idea: ${errorMessage}`,
        metadata: {
          originalError: error,
        },
      };
    }
  },
});
