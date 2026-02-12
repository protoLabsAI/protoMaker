/**
 * POST /api/agents/execute - Create and run a dynamic agent from a template
 *
 * Takes a template name, project path, optional overrides, and a prompt.
 * Uses AgentFactoryService to resolve config, then DynamicAgentExecutor to run.
 */

import type { Request, Response } from 'express';
import type {
  AgentFactoryService,
  AgentOverrides,
} from '../../../services/agent-factory-service.js';
import type { DynamicAgentExecutor } from '../../../services/dynamic-agent-executor.js';
import { getErrorMessage, logError } from '../common.js';

interface ExecuteRequest {
  templateName: string;
  projectPath: string;
  prompt: string;
  overrides?: AgentOverrides;
  additionalSystemPrompt?: string;
}

export function createExecuteHandler(factory: AgentFactoryService, executor: DynamicAgentExecutor) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { templateName, projectPath, prompt, overrides, additionalSystemPrompt } =
        req.body as ExecuteRequest;

      if (!templateName) {
        res.status(400).json({ success: false, error: 'templateName is required' });
        return;
      }

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prompt) {
        res.status(400).json({ success: false, error: 'prompt is required' });
        return;
      }

      // Resolve template → config
      const config = factory.createFromTemplate(templateName, projectPath, overrides);

      // Execute agent
      const result = await executor.execute(config, {
        prompt,
        additionalSystemPrompt,
      });

      res.json({
        success: result.success,
        output: result.output,
        error: result.error,
        errorType: result.errorType,
        durationMs: result.durationMs,
        templateName: result.templateName,
        model: result.model,
      });
    } catch (error) {
      logError(error, 'Execute agent failed');

      // Distinguish "template not found" from internal errors
      const message = getErrorMessage(error);
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  };
}
