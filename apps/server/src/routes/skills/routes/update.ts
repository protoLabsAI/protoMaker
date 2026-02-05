/**
 * POST /skills/update endpoint - Update an existing skill
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { updateSkill, type SkillsFsModule } from '@automaker/utils';
import type { UpdateSkillOptions } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('skills:update');

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

interface UpdateRequest {
  projectPath: string;
  skillName: string;
  updates: UpdateSkillOptions;
}

export function createUpdateHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, skillName, updates } = req.body as UpdateRequest;

      if (!projectPath || !skillName || !updates) {
        res.status(400).json({
          success: false,
          error: 'projectPath, skillName, and updates are required',
        });
        return;
      }

      logger.debug(`Updating skill ${skillName} for project: ${projectPath}`);

      const skill = await updateSkill(projectPath, skillName, updates, fsModule);

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
      logger.error('Error updating skill:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
