/**
 * Docs API Routes
 *
 * Exposes internal documentation files:
 * - GET /api/docs/list - Get all markdown files in docs/internal/
 * - GET /api/docs/file?path= - Get raw markdown content for a specific file
 */

import { Router } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, basename, extname, resolve } from 'node:path';

const logger = createLogger('DocsRoutes');

/**
 * Validate that the requested path is within docs/internal/ and is a .md file.
 * Uses realpath to resolve symlinks and prevent symlink traversal attacks.
 */
async function isPathSafe(docsDir: string, requestedPath: string): Promise<boolean> {
  // Must be a .md file
  if (extname(requestedPath) !== '.md') {
    return false;
  }

  try {
    const resolvedDocsDir = await realpath(docsDir);
    const targetPath = join(docsDir, requestedPath);
    const resolvedTarget = await realpath(targetPath);
    return resolvedTarget.startsWith(resolvedDocsDir + '/') || resolvedTarget === resolvedDocsDir;
  } catch {
    // realpath fails if the file doesn't exist — fall back to static check
    const normalized = resolve(docsDir, requestedPath);
    const resolvedDocsDir = resolve(docsDir);
    return normalized.startsWith(resolvedDocsDir + '/');
  }
}

/**
 * Extract title from markdown content.
 * Looks for first H1 heading (# Title) or derives from filename.
 */
function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  const nameWithoutExt = basename(filename, '.md');
  return nameWithoutExt
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate slug from filename: "brand.md" -> "brand"
 */
function generateSlug(filename: string): string {
  return basename(filename, '.md');
}

export function createDocsRoutes(repoRoot: string): Router {
  const docsDir = join(repoRoot, 'docs/internal');
  const router = Router();

  /**
   * GET /api/docs/list
   * Returns array of all .md files in docs/internal/
   */
  router.get('/list', async (_req, res) => {
    try {
      const files = await readdir(docsDir);
      const mdFiles = files.filter((file) => file.endsWith('.md'));

      const docsData = await Promise.all(
        mdFiles.map(async (file) => {
          try {
            const filePath = join(docsDir, file);
            const content = await readFile(filePath, 'utf-8');
            const title = extractTitle(content, file);
            const slug = generateSlug(file);
            return { path: file, title, slug };
          } catch (error) {
            logger.error(`Failed to read file ${file}:`, error);
            return {
              path: file,
              title: generateSlug(file)
                .split('-')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' '),
              slug: generateSlug(file),
            };
          }
        })
      );

      res.json({ success: true, docs: docsData });
    } catch (error) {
      logger.error('Failed to list docs:', error);
      res.status(500).json({
        error: 'Failed to list documentation files',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/docs/file?path=brand.md
   * Returns raw markdown content for the specified file
   */
  router.get('/file', async (req, res) => {
    try {
      const { path } = req.query;

      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'path parameter is required' });
        return;
      }

      if (!(await isPathSafe(docsDir, path))) {
        res.status(400).json({
          error: 'Invalid path',
          message: 'Path must be a .md file within docs/internal',
        });
        return;
      }

      const filePath = join(docsDir, path);
      const content = await readFile(filePath, 'utf-8');
      const title = extractTitle(content, path);

      res.json({ success: true, path, title, content });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        res.status(404).json({
          error: 'File not found',
          message: `The requested file does not exist: ${req.query.path}`,
        });
        return;
      }

      logger.error('Failed to read doc file:', error);
      res.status(500).json({
        error: 'Failed to read documentation file',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
