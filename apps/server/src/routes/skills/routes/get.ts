/**
 * POST /skills/get endpoint - Get a specific skill by name
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { getSkill, type SkillsFsModule } from '@protolabs-ai/utils';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('skills:get');

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

interface GetRequest {
  projectPath: string;
  skillName: string;
}

export function createGetHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, skillName } = req.body as GetRequest;

      if (!projectPath || !skillName) {
        res.status(400).json({
          success: false,
          error: 'projectPath and skillName are required',
        });
        return;
      }

      logger.debug(`Getting skill ${skillName} for project: ${projectPath}`);

      const skill = await getSkill(projectPath, skillName, fsModule);

      if (!skill) {
        res.status(404).json({
          success: false,
          error: `Skill not found: ${skillName}`,
        });
        return;
      }

      res.json({
        success: true,
        skill,
      });
    } catch (error) {
      logger.error('Error getting skill:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
