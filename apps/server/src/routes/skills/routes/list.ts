/**
 * POST /skills/list endpoint - List all skills in a project
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { listSkills, type SkillsFsModule } from '@automaker/utils';
import { createLogger } from '@automaker/utils';

const logger = createLogger('skills:list');

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

interface ListRequest {
  projectPath: string;
}

export function createListHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as ListRequest;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      logger.debug(`Listing skills for project: ${projectPath}`);

      const skills = await listSkills(projectPath, fsModule);

      res.json({
        success: true,
        skills: skills.map((skill) => ({
          name: skill.name,
          emoji: skill.emoji,
          description: skill.description,
          tags: skill.metadata.tags,
          usageCount: skill.metadata.usageCount,
          successRate: skill.metadata.successRate,
          source: skill.metadata.source,
        })),
        count: skills.length,
      });
    } catch (error) {
      logger.error('Error listing skills:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
