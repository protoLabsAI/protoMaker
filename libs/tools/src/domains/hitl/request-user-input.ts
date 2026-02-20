/**
 * request_user_input - Request structured input from the user via a form dialog
 *
 * Creates a JSON Schema form request that the UI renders as a dialog.
 * Returns immediately with a formId — the response arrives later via followUp.
 */

import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolResult } from '../../types.js';

const FormStepSchema = z.object({
  schema: z
    .record(z.string(), z.unknown())
    .describe('JSON Schema (draft-07) defining the form fields'),
  uiSchema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('@rjsf layout hints (field ordering, widgets)'),
  title: z.string().optional().describe('Step title shown in wizard header'),
  description: z.string().optional().describe('Step description shown below title'),
});

const RequestUserInputInputSchema = z.object({
  title: z.string().describe('Form dialog title shown to the user'),
  description: z.string().optional().describe('Optional description shown below the title'),
  steps: z
    .array(FormStepSchema)
    .min(1)
    .describe('One or more form steps. Multiple steps render as a wizard.'),
});

const RequestUserInputOutputSchema = z.object({
  formId: z.string().describe('Unique form ID. The response will reference this ID.'),
  message: z.string().describe('Human-readable status message'),
});

export type RequestUserInputInput = z.infer<typeof RequestUserInputInputSchema>;
export type RequestUserInputOutput = z.infer<typeof RequestUserInputOutputSchema>;

/**
 * request_user_input — Agent tool for structured user input
 *
 * When an agent needs specific configuration values, credentials, or choices,
 * it calls this tool with a JSON Schema describing the required fields.
 * The UI renders the schema as a form dialog. The user's response arrives
 * as a follow-up message to the agent.
 */
export const requestUserInput = defineSharedTool({
  name: 'request_user_input',
  description:
    'Request structured input from the user via a form dialog. ' +
    'Provide a JSON Schema defining the fields you need. ' +
    'Returns a formId — the user response will arrive as a follow-up message. ' +
    'Use for config values, choices, credentials, or any structured data collection.',
  inputSchema: RequestUserInputInputSchema,
  outputSchema: RequestUserInputOutputSchema,
  metadata: {
    category: 'hitl',
    tags: ['hitl', 'form', 'user-input', 'dialog'],
    version: '1.0.0',
  },
  execute: async (input, context): Promise<ToolResult<RequestUserInputOutput>> => {
    try {
      const typedInput = input as RequestUserInputInput;

      const hitlFormService = context.services?.hitlFormService as any;
      if (!hitlFormService) {
        return {
          success: false,
          error:
            'HITLFormService not available in context. Ensure the service is injected when executing this tool.',
        };
      }

      const featureId = context.featureId;
      const projectPath = context.projectPath;

      if (!featureId) {
        return {
          success: false,
          error: 'featureId is required in context for agent-initiated form requests.',
        };
      }

      const form = hitlFormService.create({
        title: typedInput.title,
        description: typedInput.description,
        steps: typedInput.steps,
        callerType: 'agent',
        featureId,
        projectPath,
      });

      return {
        success: true,
        data: {
          formId: form.id,
          message:
            `Form "${typedInput.title}" sent to the user (${typedInput.steps.length} step(s)). ` +
            'The user\'s response will arrive as a follow-up message with type "hitl_form_response". ' +
            'Wait for that message before proceeding.',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to create HITL form: ${errorMessage}`,
      };
    }
  },
});
