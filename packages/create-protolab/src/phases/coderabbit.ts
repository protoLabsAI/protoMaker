import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Phase result for CodeRabbit configuration
 */
export interface CodeRabbitPhaseResult {
  success: boolean;
  existed: boolean;
}

// Get the directory name in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generates .coderabbit.yaml configuration file in the project root
 * from the hardcoded 'strict' profile template.
 *
 * @param projectRoot - The root directory of the project where .coderabbit.yaml will be created
 * @returns Status object indicating success and whether the file already existed
 */
export function generateCodeRabbitConfig(projectRoot: string): CodeRabbitPhaseResult {
  const targetPath = join(projectRoot, '.coderabbit.yaml');
  const templatePath = join(__dirname, '../../templates/coderabbit.yaml');

  // Check if file already exists (idempotent operation)
  const existed = existsSync(targetPath);
  if (existed) {
    return {
      success: true,
      existed: true,
    };
  }

  try {
    // Read the template file
    const templateContent = readFileSync(templatePath, 'utf-8');

    // Write to project root as .coderabbit.yaml
    writeFileSync(targetPath, templateContent, 'utf-8');

    return {
      success: true,
      existed: false,
    };
  } catch (error) {
    console.error('Failed to generate .coderabbit.yaml:', error);
    return {
      success: false,
      existed: false,
    };
  }
}
