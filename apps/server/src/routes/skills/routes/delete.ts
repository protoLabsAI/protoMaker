/**
 * POST /skills/delete endpoint - Delete a skill
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { deleteSkill, type SkillsFsModule } from '@automaker/utils';
import { createLogger } from '@automaker/utils';

const logger = createLogger('skills:delete');

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

interface DeleteRequest {
  projectPath: string;
  skillName: string;
}

export function createDeleteHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, skillName } = req.body as DeleteRequest;

      if (!projectPath || !skillName) {
        res.status(400).json({
          success: false,
          error: 'projectPath and skillName are required',
        });
        return;
      }

      logger.debug(`Deleting skill ${skillName} for project: ${projectPath}`);

      const deleted = await deleteSkill(projectPath, skillName, fsModule);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: `Skill not found: ${skillName}`,
        });
        return;
      }

      res.json({
        success: true,
        message: `Skill ${skillName} deleted successfully`,
      });
    } catch (error) {
      logger.error('Error deleting skill:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
