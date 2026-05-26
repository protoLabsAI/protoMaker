/**
 * Phase: CI Setup
 *
 * Creates .github/workflows/ directory and writes GitHub Actions workflow files
 * from templates with package manager specific interpolation.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CIOptions {
  projectPath: string;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
}

export interface CIResult {
  success: boolean;
  filesCreated: string[];
  error?: string;
}

/**
 * Setup GitHub Actions CI workflows with package manager specific configuration.
 */
export async function setupCI(options: CIOptions): Promise<CIResult> {
  const { projectPath, packageManager } = options;
  const filesCreated: string[] = [];

  try {
    // 1. Create .github/workflows/ directory
    const workflowsDir = path.join(projectPath, '.github', 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });
    filesCreated.push('.github/workflows/');

    // 2. Load workflow templates
    const templateNames = ['build.yml', 'test.yml', 'format-check.yml', 'security-audit.yml'];

    // 3. Get package manager specific variables
    const pmVars = getPackageManagerVars(packageManager);

    // 4. Load and interpolate each workflow template
    for (const templateName of templateNames) {
      const workflowPath = path.join(workflowsDir, templateName);

      // Check if file already exists (idempotent)
      if (await fileExists(workflowPath)) {
        filesCreated.push(`.github/workflows/${templateName} (already exists)`);
        continue;
      }

      // Load template
      const templateContent = await loadTemplate(`.github/workflows/${templateName}`);

      // Interpolate variables
      const interpolatedContent = interpolateTemplate(templateContent, pmVars);

      // Write workflow file
      await fs.writeFile(workflowPath, interpolatedContent, 'utf-8');
      filesCreated.push(`.github/workflows/${templateName}`);
    }

    return {
      success: true,
      filesCreated,
    };
  } catch (error) {
    return {
      success: false,
      filesCreated,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a template file from the templates directory.
 */
async function loadTemplate(templatePath: string): Promise<string> {
  // Resolve template directory using import.meta.url
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const templatesDir = path.join(__dirname, '..', 'templates');
  const fullPath = path.join(templatesDir, templatePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (err) {
    throw new Error(
      `Failed to load template "${templatePath}" at ${fullPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Interpolate template content with variables.
 * Uses simple {{variable}} syntax for replacements.
 */
function interpolateTemplate(content: string, vars: Record<string, string>): string {
  return Object.keys(vars).reduce((result, key) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    return result.replace(pattern, vars[key]);
  }, content);
}

/**
 * Get package manager specific values for interpolation.
 * Handles package manager setup action and command variations.
 */
function getPackageManagerVars(
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'
): Record<string, string> {
  const vars: Record<string, string> = {
    packageManager,
  };

  switch (packageManager) {
    case 'pnpm':
      vars.packageManagerSetup = `      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest

`;
      vars.installCommand = 'pnpm install';
      vars.buildCommand = 'pnpm build';
      vars.testCommand = 'pnpm test';
      vars.formatCheckCommand = 'pnpm format:check';
      vars.auditCommand = 'pnpm audit';
      break;

    case 'yarn':
      vars.packageManagerSetup = '';
      vars.installCommand = 'yarn install';
      vars.buildCommand = 'yarn build';
      vars.testCommand = 'yarn test';
      vars.formatCheckCommand = 'yarn format:check';
      vars.auditCommand = 'yarn audit';
      break;

    case 'bun':
      vars.packageManagerSetup = `      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

`;
      vars.installCommand = 'bun install';
      vars.buildCommand = 'bun run build';
      vars.testCommand = 'bun test';
      vars.formatCheckCommand = 'bun run format:check';
      vars.auditCommand = 'bun audit';
      break;

    case 'npm':
    default:
      vars.packageManagerSetup = '';
      vars.installCommand = 'npm install';
      vars.buildCommand = 'npm run build';
      vars.testCommand = 'npm test';
      vars.formatCheckCommand = 'npm run format:check';
      vars.auditCommand = 'npm audit';
      break;
  }

  return vars;
}
