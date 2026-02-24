/**
 * POST /skills/record-usage endpoint - Record skill usage (success/failure)
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { recordSkillUsage, type SkillsFsModule } from '@protolabs-ai/utils';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('skills:record-usage');

const fsModule: SkillsFsModule = {
  readFile: (path, encoding) => fs.readFile(path, encoding as BufferEncoding),
  writeFile: fs.writeFile,
  readdir: fs.readdir as (path: string) => Promise<string[]>,
  stat: fs.stat,
  mkdir: async (path, options) => {
    await fs.mkdir(path, options);
  },
  unlink: fs.unlink,
  access: fs.access,
};

interface RecordUsageRequest {
  projectPath: string;
  skillName: string;
  success: boolean;
}

export function createRecordUsageHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, skillName, success } = req.body as RecordUsageRequest;

      if (!projectPath || !skillName || typeof success !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'projectPath, skillName, and success (boolean) are required',
        });
        return;
      }

      logger.debug(`Recording usage for skill ${skillName}: ${success ? 'success' : 'failure'}`);

      await recordSkillUsage(projectPath, skillName, success, fsModule);

      res.json({
        success: true,
        message: `Usage recorded for skill ${skillName}`,
      });
    } catch (error) {
      logger.error('Error recording skill usage:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
