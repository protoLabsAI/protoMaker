/**
 * POST /api/agents/execute - Create and run a dynamic agent from a template
 *
 * Takes a template name, project path, optional overrides, and a prompt.
 * Uses RoleRegistryService to resolve template config, then simpleQuery to run.
 */

import type { Request, Response } from 'express';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import { getPromptForRole, hasPrompt } from '@protolabsai/prompts';
import { resolveModelString } from '@protolabsai/model-resolver';
import { getErrorMessage, logError } from '../common.js';

interface ExecuteRequest {
  templateName: string;
  projectPath: string;
  prompt: string;
  additionalSystemPrompt?: string;
  model?: string;
}

export function createExecuteHandler(registry: RoleRegistryService) {
  return async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      const { templateName, projectPath, prompt, additionalSystemPrompt, model } =
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

      // Resolve template from registry
      const template = registry.get(templateName);
      if (!template) {
        const available = registry
          .list()
          .map((t) => t.name)
          .join(', ');
        res.status(404).json({
          success: false,
          error: `Template "${templateName}" not found in registry. Available: ${available || 'none'}`,
        });
        return;
      }

      // Resolve system prompt: template inline → prompt registry → undefined
      const parts: string[] = [];
      if (template.systemPrompt) {
        parts.push(template.systemPrompt);
      } else {
        const lookupKey = hasPrompt(template.name) ? template.name : template.role;
        if (hasPrompt(lookupKey)) {
          parts.push(getPromptForRole(lookupKey, { projectPath }));
        }
      }
      if (additionalSystemPrompt) {
        parts.push(additionalSystemPrompt);
      }
      const systemPrompt = parts.length > 0 ? parts.join('\n\n') : undefined;

      // Resolve model
      const modelAlias = model ?? template.model ?? 'sonnet';
      const resolvedModel = resolveModelString(modelAlias);

      // Execute via simpleQuery
      const result = await simpleQuery({
        prompt,
        model: resolvedModel,
        cwd: projectPath,
        systemPrompt,
        maxTurns: template.maxTurns ?? 100,
        allowedTools: template.tools ?? [],
        disallowedTools: template.disallowedTools ?? [],
      });

      const durationMs = Date.now() - startTime;

      res.json({
        success: true,
        output: result.text,
        durationMs,
        templateName,
        model: modelAlias,
      });
    } catch (error) {
      logError(error, 'Execute agent failed');

      const message = getErrorMessage(error);
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  };
}
