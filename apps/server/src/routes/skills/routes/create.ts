/**
 * POST /skills/create endpoint - Create a new skill
 */

import type { Request, Response, RequestHandler } from 'express';
import { promises as fs } from 'fs';
import { createSkill, type SkillsFsModule } from '@automaker/utils';
import type { CreateSkillOptions } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('skills:create');

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

interface CreateRequest {
  projectPath: string;
  name: string;
  description: string;
  content: string;
  emoji?: string;
  requires?: {
    bins?: string[];
    files?: string[];
    env?: string[];
  };
  author?: string;
  tags?: string[];
  source?: 'learned' | 'imported' | 'built-in';
}

export function createCreateHandler(): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, name, description, content, emoji, requires, author, tags, source } =
        req.body as CreateRequest;

      if (!projectPath || !name || !description || !content) {
        res.status(400).json({
          success: false,
          error: 'projectPath, name, description, and content are required',
        });
        return;
      }

      logger.debug(`Creating skill ${name} for project: ${projectPath}`);

      const options: CreateSkillOptions = {
        name,
        description,
        content,
        emoji,
        requires,
        author,
        tags,
        source,
      };

      const skill = await createSkill(projectPath, options, fsModule);

      res.json({
        success: true,
        skill,
      });
    } catch (error) {
      logger.error('Error creating skill:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
