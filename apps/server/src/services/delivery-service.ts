/**
 * Delivery Service - Delivers alignment work back to client repos via fork+PR
 *
 * Workflow:
 * 1. Fork the client repo to proto-labs-ai GitHub org
 * 2. Clone the fork (or use existing ./labs/ clone and add fork as remote)
 * 3. Create an 'aligned-by-protolabs' branch
 * 4. Add branding commits (footer + README eyebrow)
 * 5. Include alignment work commits if provided
 * 6. Push branch to fork
 * 7. Create PR from fork to client repo
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@automaker/utils';
import { labsService } from './labs-service.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('DeliveryService');

const FORK_ORG = 'proto-labs-ai';
const BRANCH_NAME = 'aligned-by-protolabs';

export interface DeliveryOptions {
  /** Client repository URL (e.g., https://github.com/owner/repo) */
  clientRepoUrl: string;
  /** Alignment score before alignment work */
  scoreBefore?: number;
  /** Alignment score after alignment work */
  scoreAfter?: number;
  /** Summary of gaps identified */
  gapsSummary?: string;
  /** List of changes made during alignment */
  changesMade?: string[];
  /** Whether alignment work was performed (vs just branding) */
  alignmentPerformed?: boolean;
  /** Labs directory (defaults to ./labs) */
  labsDir?: string;
}

export interface DeliveryResult {
  success: boolean;
  prUrl?: string;
  forkUrl?: string;
  error?: string;
}

/**
 * Extract owner and repo from GitHub URL
 * Examples:
 *   https://github.com/owner/repo -> { owner: 'owner', repo: 'repo' }
 *   https://github.com/owner/repo.git -> { owner: 'owner', repo: 'repo' }
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Remove .git suffix if present
  const normalized = url.replace(/\.git$/, '');

  // Match GitHub URL patterns
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

/**
 * Detect project framework to determine where to add footer component
 */
async function detectFramework(repoPath: string): Promise<string | null> {
  try {
    const packageJsonPath = path.join(repoPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.react || deps['react-dom']) {
      return 'react';
    }
    if (deps.vue) {
      return 'vue';
    }
    if (deps.angular) {
      return 'angular';
    }
    if (deps.next) {
      return 'next';
    }

    // Check for HTML files
    const files = await fs.readdir(repoPath);
    if (files.some((f) => f.endsWith('.html'))) {
      return 'html';
    }

    return null;
  } catch (error) {
    logger.warn('Could not detect framework', { error });
    return null;
  }
}

/**
 * Add ProtoLabs footer component based on detected framework
 */
async function addFooterComponent(repoPath: string, framework: string | null): Promise<void> {
  if (!framework) {
    logger.info('No framework detected, skipping footer component');
    return;
  }

  logger.info('Adding footer component', { framework });

  switch (framework) {
    case 'react':
    case 'next':
      await addReactFooter(repoPath);
      break;
    case 'html':
      await addHtmlFooter(repoPath);
      break;
    default:
      logger.info(`Framework ${framework} not yet supported for footer component`);
  }
}

/**
 * Add React footer component
 */
async function addReactFooter(repoPath: string): Promise<void> {
  const footerContent = `import React from 'react';

export function ProtoLabsFooter() {
  return (
    <footer style={{
      padding: '1rem',
      textAlign: 'center',
      borderTop: '1px solid #eee',
      marginTop: '2rem',
      fontSize: '0.875rem',
      color: '#666'
    }}>
      <a
        href="https://protolabs.ai"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#0066cc', textDecoration: 'none' }}
      >
        Aligned by ProtoLabs
      </a>
    </footer>
  );
}
`;

  // Try to find components directory
  const possibleDirs = [
    path.join(repoPath, 'src', 'components'),
    path.join(repoPath, 'components'),
    path.join(repoPath, 'src'),
  ];

  for (const dir of possibleDirs) {
    try {
      await fs.access(dir);
      const footerPath = path.join(dir, 'ProtoLabsFooter.tsx');
      await fs.writeFile(footerPath, footerContent);
      logger.info('React footer component created', { footerPath });
      return;
    } catch {
      // Directory doesn't exist, try next
    }
  }

  // Fallback: create in src/components
  const defaultDir = path.join(repoPath, 'src', 'components');
  await fs.mkdir(defaultDir, { recursive: true });
  const footerPath = path.join(defaultDir, 'ProtoLabsFooter.tsx');
  await fs.writeFile(footerPath, footerContent);
  logger.info('React footer component created in default location', { footerPath });
}

/**
 * Add HTML footer to index.html
 */
async function addHtmlFooter(repoPath: string): Promise<void> {
  const files = await fs.readdir(repoPath);
  const htmlFile = files.find((f) => f === 'index.html');

  if (!htmlFile) {
    logger.warn('No index.html found, skipping HTML footer');
    return;
  }

  const htmlPath = path.join(repoPath, htmlFile);
  let content = await fs.readFile(htmlPath, 'utf-8');

  // Add footer before closing body tag
  const footerHtml = `
  <footer style="padding: 1rem; text-align: center; border-top: 1px solid #eee; margin-top: 2rem; font-size: 0.875rem; color: #666;">
    <a href="https://protolabs.ai" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: none;">
      Aligned by ProtoLabs
    </a>
  </footer>
`;

  if (content.includes('</body>')) {
    content = content.replace('</body>', `${footerHtml}\n</body>`);
    await fs.writeFile(htmlPath, content);
    logger.info('HTML footer added', { htmlPath });
  } else {
    logger.warn('Could not find </body> tag in HTML file');
  }
}

/**
 * Add 'Aligned by ProtoLabs' eyebrow to README
 */
async function addReadmeEyebrow(repoPath: string): Promise<void> {
  const files = await fs.readdir(repoPath);
  const readmeFile = files.find((f) => f.toLowerCase() === 'readme.md');

  if (!readmeFile) {
    logger.warn('No README.md found, skipping eyebrow');
    return;
  }

  const readmePath = path.join(repoPath, readmeFile);
  const content = await fs.readFile(readmePath, 'utf-8');

  // Check if eyebrow already exists
  if (content.includes('Aligned by ProtoLabs')) {
    logger.info('README already has ProtoLabs eyebrow');
    return;
  }

  // Add eyebrow at the top
  const eyebrow =
    '[![Aligned by ProtoLabs](https://img.shields.io/badge/Aligned%20by-ProtoLabs-blue)](https://protolabs.ai)\n\n';
  const newContent = eyebrow + content;

  await fs.writeFile(readmePath, newContent);
  logger.info('README eyebrow added', { readmePath });
}

/**
 * Generate PR description with alignment details
 */
function generatePrDescription(options: DeliveryOptions): string {
  const {
    scoreBefore,
    scoreAfter,
    gapsSummary,
    changesMade = [],
    alignmentPerformed = false,
  } = options;

  let description = '# ProtoLabs Alignment\n\n';

  // Score section
  if (scoreBefore !== undefined || scoreAfter !== undefined) {
    description += '## Alignment Score\n\n';
    if (scoreBefore !== undefined && scoreAfter !== undefined) {
      description += `- **Before:** ${scoreBefore}%\n`;
      description += `- **After:** ${scoreAfter}%\n`;
      description += `- **Improvement:** +${scoreAfter - scoreBefore}%\n\n`;
    } else if (scoreAfter !== undefined) {
      description += `- **Current Score:** ${scoreAfter}%\n\n`;
    }
  }

  // Gaps summary
  if (gapsSummary) {
    description += '## Gaps Identified\n\n';
    description += `${gapsSummary}\n\n`;
  }

  // Changes made
  if (changesMade.length > 0) {
    description += '## Changes Made\n\n';
    changesMade.forEach((change) => {
      description += `- ${change}\n`;
    });
    description += '\n';
  }

  // Branding info
  description += '## ProtoLabs Branding\n\n';
  description += 'This PR includes:\n';
  description += '- ProtoLabs footer component\n';
  description += '- "Aligned by ProtoLabs" badge in README\n';
  if (alignmentPerformed) {
    description += '- Alignment work to improve codebase quality\n';
  }
  description += '\n';

  // Attribution
  description += '---\n\n';
  description +=
    '**Aligned by [ProtoLabs](https://protolabs.ai)** - AI-powered codebase alignment\n';

  return description;
}

export class DeliveryService {
  private defaultLabsDir: string;

  constructor(baseDir?: string) {
    this.defaultLabsDir = baseDir || path.join(process.cwd(), 'labs');
  }

  /**
   * Deliver alignment work to client repo via fork+PR
   */
  async deliver(options: DeliveryOptions): Promise<DeliveryResult> {
    const { clientRepoUrl, labsDir = this.defaultLabsDir } = options;

    logger.info('Starting delivery workflow', { clientRepoUrl });

    // Parse GitHub URL
    const parsed = parseGitHubUrl(clientRepoUrl);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid GitHub URL. Must be in format: https://github.com/owner/repo',
      };
    }

    const { owner, repo } = parsed;
    const clientRepo = `${owner}/${repo}`;

    try {
      // Step 1: Fork the client repo
      logger.info('Forking repository', { clientRepo, org: FORK_ORG });
      const { stdout: forkOutput } = await execFileAsync('gh', [
        'api',
        'POST',
        `/repos/${clientRepo}/forks`,
        '-f',
        `organization=${FORK_ORG}`,
      ]);
      const forkData = JSON.parse(forkOutput);
      const forkUrl = forkData.html_url as string;
      const forkCloneUrl = forkData.clone_url as string;
      logger.info('Fork created', { forkUrl });

      // Wait a bit for fork to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Clone or use existing repo
      const repoPath = path.join(labsDir, repo);
      let repoExists = false;
      try {
        await fs.access(path.join(repoPath, '.git'));
        repoExists = true;
        logger.info('Repository already exists in labs', { repoPath });
      } catch {
        // Repo doesn't exist, need to clone
      }

      if (!repoExists) {
        // Clone the original repo
        logger.info('Cloning client repository', { clientRepoUrl });
        const cloneResult = await labsService.cloneRepo({
          gitUrl: clientRepoUrl,
          labsDir,
          shallow: false, // Need full history for proper PR
        });

        if (!cloneResult.success) {
          return {
            success: false,
            error: `Failed to clone repository: ${cloneResult.error}`,
          };
        }
      }

      // Add fork as remote if not already present
      try {
        await execFileAsync('git', ['remote', 'add', 'fork', forkCloneUrl], { cwd: repoPath });
        logger.info('Fork added as remote');
      } catch (error) {
        // Remote might already exist, try to update it
        try {
          await execFileAsync('git', ['remote', 'set-url', 'fork', forkCloneUrl], {
            cwd: repoPath,
          });
          logger.info('Fork remote updated');
        } catch {
          // Ignore errors
        }
      }

      // Step 3: Create aligned-by-protolabs branch
      logger.info('Creating alignment branch', { branch: BRANCH_NAME });

      // Make sure we're on main/master
      try {
        await execFileAsync('git', ['checkout', 'main'], { cwd: repoPath });
      } catch {
        try {
          await execFileAsync('git', ['checkout', 'master'], { cwd: repoPath });
        } catch (error) {
          logger.warn('Could not checkout main/master, continuing from current branch');
        }
      }

      // Delete branch if it exists
      try {
        await execFileAsync('git', ['branch', '-D', BRANCH_NAME], { cwd: repoPath });
      } catch {
        // Branch doesn't exist, that's fine
      }

      // Create new branch
      await execFileAsync('git', ['checkout', '-b', BRANCH_NAME], { cwd: repoPath });

      // Step 4: Add branding commits
      const framework = await detectFramework(repoPath);

      // Add footer component
      await addFooterComponent(repoPath, framework);

      // Stage and commit footer
      try {
        await execFileAsync('git', ['add', '.'], { cwd: repoPath });
        await execFileAsync(
          'git',
          [
            'commit',
            '-m',
            'feat: Add ProtoLabs footer component\n\nCo-Authored-By: ProtoLabs <noreply@protolabs.ai>',
          ],
          { cwd: repoPath }
        );
        logger.info('Footer component committed');
      } catch (error) {
        logger.warn('No changes to commit for footer component', { error });
      }

      // Add README eyebrow
      await addReadmeEyebrow(repoPath);

      // Stage and commit README
      try {
        await execFileAsync('git', ['add', '.'], { cwd: repoPath });
        await execFileAsync(
          'git',
          [
            'commit',
            '-m',
            'docs: Add ProtoLabs alignment badge to README\n\nCo-Authored-By: ProtoLabs <noreply@protolabs.ai>',
          ],
          { cwd: repoPath }
        );
        logger.info('README eyebrow committed');
      } catch (error) {
        logger.warn('No changes to commit for README', { error });
      }

      // Step 5: Push branch to fork
      logger.info('Pushing branch to fork', { branch: BRANCH_NAME });
      await execFileAsync('git', ['push', '-f', 'fork', BRANCH_NAME], { cwd: repoPath });

      // Step 6: Create PR from fork to client repo
      logger.info('Creating pull request');
      const prDescription = generatePrDescription(options);
      const prTitle = 'Aligned by ProtoLabs';

      const { stdout: prOutput } = await execFileAsync(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          clientRepo,
          '--head',
          `${FORK_ORG}:${BRANCH_NAME}`,
          '--title',
          prTitle,
          '--body',
          prDescription,
        ],
        { cwd: repoPath }
      );

      const prUrl = prOutput.trim();
      logger.info('Pull request created', { prUrl });

      return {
        success: true,
        prUrl,
        forkUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Delivery failed', { error: errorMessage });

      // Provide more specific error messages
      if (errorMessage.includes('Not Found')) {
        return {
          success: false,
          error: 'Repository not found. Check the URL and ensure the repository exists.',
        };
      }

      if (errorMessage.includes('permission') || errorMessage.includes('403')) {
        return {
          success: false,
          error: 'Permission denied. Ensure gh CLI is authenticated and has fork permissions.',
        };
      }

      return {
        success: false,
        error: `Delivery failed: ${errorMessage}`,
      };
    }
  }
}

// Export singleton instance
export const deliveryService = new DeliveryService();
