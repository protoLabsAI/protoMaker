/**
 * Phase: Scaffold Starter Kit
 *
 * Copies a starter kit (docs or portfolio) to the output directory,
 * substituting project name in package.json and astro.config.mjs,
 * then writes .automaker/CONTEXT.md with the kit-specific agent context.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  scaffoldDocsStarter,
  scaffoldPortfolioStarter,
  scaffoldLandingPageStarter,
  scaffoldAiAgentAppStarter,
  getDocsStarterContext,
  getPortfolioStarterContext,
  getAiAgentAppStarterContext,
  getStarterFeatures,
} from '@protolabsai/templates';

import type { StarterKitType, StarterFeature } from '@protolabsai/templates';

export type { StarterKitType };

export interface ScaffoldStarterOptions {
  /** Starter kit type — 'docs' | 'portfolio' | 'extension' | 'general' */
  kitType: StarterKitType;
  /** Human-readable project name, used as package.json name and in config substitution. */
  projectName: string;
  /** Absolute path to the destination directory. */
  outputDir: string;
}

export interface ScaffoldStarterResult {
  success: boolean;
  outputDir: string;
  filesCreated: string[];
  starterFeatures: StarterFeature[];
  error?: string;
}

/**
 * Scaffold a starter kit into outputDir, then write the .automaker/CONTEXT.md
 * agent context file. Returns the list of starter features to create on the board.
 */
export async function scaffoldStarter(
  options: ScaffoldStarterOptions
): Promise<ScaffoldStarterResult> {
  const { kitType, projectName, outputDir } = options;

  // Only docs and portfolio have Astro scaffolding — extension and general
  // produce only the .automaker/ directory and feature list.
  let filesCreated: string[] = [];

  if (kitType === 'docs') {
    const result = await scaffoldDocsStarter({ projectName, outputDir });
    if (!result.success) {
      return {
        success: false,
        outputDir,
        filesCreated: result.filesCreated,
        starterFeatures: [],
        error: result.error,
      };
    }
    filesCreated = result.filesCreated;
  } else if (kitType === 'portfolio') {
    const result = await scaffoldPortfolioStarter({ projectName, outputDir });
    if (!result.success) {
      return {
        success: false,
        outputDir,
        filesCreated: result.filesCreated,
        starterFeatures: [],
        error: result.error,
      };
    }
    filesCreated = result.filesCreated;
  } else if (kitType === 'landing-page') {
    const result = await scaffoldLandingPageStarter({ projectName, outputDir });
    if (!result.success) {
      return {
        success: false,
        outputDir,
        filesCreated: result.filesCreated,
        starterFeatures: [],
        error: result.error,
      };
    }
    filesCreated = result.filesCreated;
  } else if (kitType === 'ai-agent-app') {
    const result = await scaffoldAiAgentAppStarter({ projectName, outputDir });
    if (!result.success) {
      return {
        success: false,
        outputDir,
        filesCreated: result.filesCreated,
        starterFeatures: [],
        error: result.error,
      };
    }
    filesCreated = result.filesCreated;
  }

  // Write .automaker/CONTEXT.md
  try {
    const automakerDir = path.join(outputDir, '.automaker');
    await fs.mkdir(automakerDir, { recursive: true });

    let contextContent: string | null = null;
    if (kitType === 'docs') {
      contextContent = getDocsStarterContext();
    } else if (kitType === 'portfolio') {
      contextContent = getPortfolioStarterContext();
    } else if (kitType === 'ai-agent-app') {
      contextContent = getAiAgentAppStarterContext();
    }

    if (contextContent !== null) {
      const contextPath = path.join(automakerDir, 'CONTEXT.md');
      await fs.writeFile(contextPath, contextContent, 'utf-8');
      filesCreated.push(path.join(outputDir, '.automaker', 'CONTEXT.md'));
    } else {
      filesCreated.push(path.join(outputDir, '.automaker') + '/');
    }
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      starterFeatures: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const starterFeatures = getStarterFeatures(kitType);

  return {
    success: true,
    outputDir,
    filesCreated,
    starterFeatures,
  };
}
