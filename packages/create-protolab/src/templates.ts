/**
 * Template System for create-protolab
 *
 * Handles loading and interpolating template files with variable substitution.
 * Supports both development (src/templates/) and production (dist/templates/) paths.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Resolve template directory using import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, 'templates');

/**
 * Load a template file by name
 * @param name - The template file name (e.g., 'github-ci.yml', 'README.md')
 * @returns The raw template content as a string
 * @throws Error if template file cannot be read
 */
export async function loadTemplate(name: string): Promise<string> {
  // Try production path first (dist/templates/)
  let templatePath = path.join(templatesDir, name);

  try {
    const content = await fs.readFile(templatePath, 'utf-8');
    return content;
  } catch (err) {
    // If production path fails, try development path (src/templates/)
    // This happens during development when running directly from src/
    const devTemplatesDir = path.join(__dirname, '..', 'templates');
    templatePath = path.join(devTemplatesDir, name);

    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      return content;
    } catch (devErr) {
      throw new Error(
        `Failed to load template "${name}". Tried paths:\n` +
          `  - ${path.join(templatesDir, name)}\n` +
          `  - ${templatePath}\n` +
          `Error: ${devErr instanceof Error ? devErr.message : String(devErr)}`
      );
    }
  }
}

/**
 * Interpolate template content with variables
 * Uses simple {{variable}} syntax for replacements
 *
 * @param content - The template content with {{variable}} placeholders
 * @param vars - Object containing variable name-value pairs
 * @returns The interpolated content with all variables replaced
 *
 * @example
 * ```typescript
 * const template = "Hello {{name}}, welcome to {{project}}!";
 * const result = interpolateTemplate(template, { name: "Alice", project: "ProtoLab" });
 * // Returns: "Hello Alice, welcome to ProtoLab!"
 * ```
 */
export function interpolateTemplate(content: string, vars: Record<string, string>): string {
  return Object.keys(vars).reduce((result, key) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    return result.replace(pattern, vars[key]);
  }, content);
}

/**
 * Get package manager specific values for interpolation
 * Detects package manager and provides appropriate commands
 *
 * @param packageManager - The package manager name from research.monorepo.packageManager
 * @returns Object with package manager specific interpolation variables
 *
 * @example
 * ```typescript
 * const vars = getPackageManagerVars('pnpm');
 * // Returns: {
 * //   packageManager: 'pnpm',
 * //   packageManagerCommand: 'pnpm',
 * //   installCommand: 'pnpm install',
 * //   runCommand: 'pnpm',
 * //   ...
 * // }
 * ```
 */
export function getPackageManagerVars(
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' = 'npm'
): Record<string, string> {
  const vars: Record<string, string> = {
    packageManager,
    packageManagerCommand: packageManager,
  };

  switch (packageManager) {
    case 'pnpm':
      vars.installCommand = 'pnpm install';
      vars.runCommand = 'pnpm';
      vars.execCommand = 'pnpm exec';
      vars.addCommand = 'pnpm add';
      vars.addDevCommand = 'pnpm add -D';
      break;
    case 'yarn':
      vars.installCommand = 'yarn install';
      vars.runCommand = 'yarn';
      vars.execCommand = 'yarn';
      vars.addCommand = 'yarn add';
      vars.addDevCommand = 'yarn add -D';
      break;
    case 'bun':
      vars.installCommand = 'bun install';
      vars.runCommand = 'bun';
      vars.execCommand = 'bun x';
      vars.addCommand = 'bun add';
      vars.addDevCommand = 'bun add -D';
      break;
    case 'npm':
    default:
      vars.installCommand = 'npm install';
      vars.runCommand = 'npm run';
      vars.execCommand = 'npx';
      vars.addCommand = 'npm install';
      vars.addDevCommand = 'npm install -D';
      break;
  }

  return vars;
}
