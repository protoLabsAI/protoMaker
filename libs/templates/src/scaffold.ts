/**
 * Starter Kit Scaffolding
 *
 * Functions that copy starter kit directories to a new location,
 * substituting the project name in package.json and config files.
 *
 * These are async/file-I/O functions — the only ones in this package.
 * They exist here because scaffolding is tightly coupled to the starter
 * kit source layout, which lives alongside this code.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ScaffoldOptions } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the path to a starter kit directory.
 * Works from both the compiled `dist/` and the `src/` directory during dev.
 */
function resolveStarterDir(kitName: 'docs' | 'portfolio' | 'general' | 'landing-page'): string {
  // From dist/: ../starters/<kit>  (libs/templates/starters/<kit>)
  const fromDist = path.resolve(__dirname, '..', 'starters', kitName);
  return fromDist;
}

/**
 * Recursively copy a directory, skipping node_modules and package-lock.json.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'package-lock.json') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Apply name/config substitutions to key files after copying.
 * - package.json: replaces the `name` field with the project name
 * - astro.config.mjs: replaces the placeholder site URL comment with the project name
 */
async function applySubstitutions(outputDir: string, projectName: string): Promise<void> {
  // Patch package.json name
  const pkgPath = path.join(outputDir, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    pkg.name = projectName;
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  } catch {
    // package.json missing or malformed — skip
  }

  // Patch VitePress config.mts: replace placeholder title and description
  const configPath = path.join(outputDir, '.vitepress', 'config.mts');
  try {
    let config = await fs.readFile(configPath, 'utf-8');
    config = config.replace(/title:\s*['"]My Project['"]/, `title: '${projectName}'`);
    config = config.replace(
      /description:\s*['"]Documentation for My Project\.?['"]/,
      `description: 'Documentation for ${projectName}.'`
    );
    await fs.writeFile(configPath, config, 'utf-8');
  } catch {
    // config.mts missing — skip
  }

  // Patch home page hero name
  const indexPath = path.join(outputDir, 'index.md');
  try {
    let index = await fs.readFile(indexPath, 'utf-8');
    index = index.replace(/name:\s*My Project/, `name: ${projectName}`);
    await fs.writeFile(indexPath, index, 'utf-8');
  } catch {
    // index.md missing — skip
  }
}

/**
 * Result of a scaffold operation.
 */
export interface ScaffoldResult {
  success: boolean;
  outputDir: string;
  filesCreated: string[];
  error?: string;
}

/**
 * Scaffold a new **docs** starter kit at `options.outputDir`.
 *
 * Copies `starters/docs/` to the output directory, substituting
 * `projectName` into package.json and .vitepress/config.mts.
 *
 * @example
 * ```ts
 * const result = await scaffoldDocsStarter({ projectName: 'my-docs', outputDir: '/tmp/my-docs' });
 * // → /tmp/my-docs/ contains a ready-to-run VitePress site
 * ```
 */
export async function scaffoldDocsStarter(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { projectName, outputDir } = options;
  const filesCreated: string[] = [];

  try {
    const starterDir = resolveStarterDir('docs');
    await copyDir(starterDir, outputDir);
    await applySubstitutions(outputDir, projectName);

    // List top-level created entries for reporting
    const entries = await fs.readdir(outputDir);
    filesCreated.push(...entries.map((e) => path.join(outputDir, e)));

    return { success: true, outputDir, filesCreated };
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scaffold a new **portfolio** starter kit at `options.outputDir`.
 *
 * Copies `starters/portfolio/` to the output directory, substituting
 * `projectName` into package.json and astro.config.mjs.
 *
 * @example
 * ```ts
 * const result = await scaffoldPortfolioStarter({ projectName: 'jane-dev', outputDir: '/tmp/jane-dev' });
 * // → /tmp/jane-dev/ contains a ready-to-run portfolio site
 * ```
 */
export async function scaffoldPortfolioStarter(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { projectName, outputDir } = options;
  const filesCreated: string[] = [];

  try {
    const starterDir = resolveStarterDir('portfolio');
    await copyDir(starterDir, outputDir);
    await applySubstitutions(outputDir, projectName);

    // List top-level created entries for reporting
    const entries = await fs.readdir(outputDir);
    filesCreated.push(...entries.map((e) => path.join(outputDir, e)));

    return { success: true, outputDir, filesCreated };
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Scaffold a blank **general** project at `options.outputDir`.
 *
 * Copies `starters/general/` to the output directory — provides the
 * standard `.automaker/` structure (settings, categories, context, features).
 */
/**
 * Scaffold a new **landing page** starter kit at `options.outputDir`.
 *
 * Copies `starters/landing-page/` to the output directory, substituting
 * `projectName` into package.json and astro.config.mjs.
 */
export async function scaffoldLandingPageStarter(
  options: ScaffoldOptions
): Promise<ScaffoldResult> {
  const { projectName, outputDir } = options;
  const filesCreated: string[] = [];

  try {
    const starterDir = resolveStarterDir('landing-page');
    await copyDir(starterDir, outputDir);
    await applySubstitutions(outputDir, projectName);

    // Patch site config with project name
    const configPath = path.join(outputDir, 'src', 'content', 'siteConfig', 'main.json');
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      if (config.brand) {
        config.brand.name = projectName;
      }
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    } catch {
      // Config missing — skip
    }

    const entries = await fs.readdir(outputDir);
    filesCreated.push(...entries.map((e) => path.join(outputDir, e)));

    return { success: true, outputDir, filesCreated };
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function scaffoldGeneralStarter(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { projectName, outputDir } = options;
  const filesCreated: string[] = [];

  try {
    const starterDir = resolveStarterDir('general');
    await copyDir(starterDir, outputDir);

    // Write app_spec.txt with the project name
    const specPath = path.join(outputDir, '.automaker', 'app_spec.txt');
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await fs.writeFile(
      specPath,
      `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>\n`,
      'utf-8'
    );

    const entries = await fs.readdir(outputDir);
    filesCreated.push(...entries.map((e) => path.join(outputDir, e)));

    return { success: true, outputDir, filesCreated };
  } catch (error) {
    return {
      success: false,
      outputDir,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
