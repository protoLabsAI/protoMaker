/**
 * Filesystem Validator
 *
 * Validates filesystem operations including:
 * - Path traversal prevention (security)
 * - Template path existence checks
 * - Required file validation (package.json, .git/)
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createLogger } from '@automaker/utils';

const logger = createLogger('FilesystemValidator');

/**
 * Validate that a path doesn't escape the project root
 * Prevents path traversal attacks
 *
 * @param targetPath - Path to validate
 * @param projectRoot - Project root directory
 * @returns Validation result
 */
export function validatePathWithinRoot(
  targetPath: string,
  projectRoot: string
): {
  success: boolean;
  error?: string;
  normalizedPath?: string;
} {
  try {
    // Normalize and resolve both paths
    const normalizedRoot = path.resolve(projectRoot);
    const normalizedTarget = path.resolve(normalizedRoot, targetPath);

    // Check if target is within root
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      logger.error('Path traversal attempt:', { targetPath, projectRoot, normalizedTarget });
      return {
        success: false,
        error: `Path '${targetPath}' attempts to escape project root`,
      };
    }

    return {
      success: true,
      normalizedPath: normalizedTarget,
    };
  } catch (error) {
    logger.error('Path validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid path',
    };
  }
}

/**
 * Validate that a file or directory exists
 *
 * @param filePath - Path to check
 * @returns Validation result with file stats
 */
export async function validatePathExists(filePath: string): Promise<{
  success: boolean;
  exists?: boolean;
  isFile?: boolean;
  isDirectory?: boolean;
  error?: string;
}> {
  try {
    const stats = await fs.stat(filePath);
    return {
      success: true,
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        success: true,
        exists: false,
      };
    }

    logger.error('Path check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Path check failed',
    };
  }
}

/**
 * Validate that required files exist in a project
 *
 * @param projectRoot - Project root directory
 * @param requiredFiles - List of required file paths (relative to root)
 * @returns Validation result with missing files
 */
export async function validateRequiredFiles(
  projectRoot: string,
  requiredFiles: string[]
): Promise<{
  success: boolean;
  missingFiles?: string[];
  errors?: string[];
}> {
  const missingFiles: string[] = [];

  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    const result = await validatePathExists(filePath);

    if (!result.exists) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    const errors = missingFiles.map((file) => `Required file not found: ${file}`);
    logger.error('Missing required files:', missingFiles);
    return {
      success: false,
      missingFiles,
      errors,
    };
  }

  return { success: true };
}

/**
 * Validate that a directory exists and is readable
 *
 * @param dirPath - Directory path to validate
 * @returns Validation result
 */
export async function validateDirectoryReadable(dirPath: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${dirPath}`,
      };
    }

    // Try to read directory to verify permissions
    await fs.readdir(dirPath);
    return { success: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        error: `Directory not found: ${dirPath}`,
      };
    }

    if (error.code === 'EACCES') {
      return {
        success: false,
        error: `Directory not readable (permission denied): ${dirPath}`,
      };
    }

    logger.error('Directory validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Directory validation failed',
    };
  }
}

/**
 * Validate template directory structure
 *
 * @param templateRoot - Root directory of templates
 * @param expectedTemplates - List of expected template paths
 * @returns Validation result
 */
export async function validateTemplateStructure(
  templateRoot: string,
  expectedTemplates: string[]
): Promise<{
  success: boolean;
  missingTemplates?: string[];
  errors?: string[];
}> {
  // First validate template root exists
  const rootCheck = await validateDirectoryReadable(templateRoot);
  if (!rootCheck.success) {
    return {
      success: false,
      errors: [rootCheck.error || 'Template root directory validation failed'],
    };
  }

  // Check each expected template
  const missingTemplates: string[] = [];

  for (const template of expectedTemplates) {
    const templatePath = path.join(templateRoot, template);
    const result = await validatePathExists(templatePath);

    if (!result.exists) {
      missingTemplates.push(template);
    }
  }

  if (missingTemplates.length > 0) {
    const errors = missingTemplates.map((tmpl) => `Template not found: ${tmpl}`);
    logger.error('Missing templates:', missingTemplates);
    return {
      success: false,
      missingTemplates,
      errors,
    };
  }

  return { success: true };
}

/**
 * Validate that a path is safe for file operations
 * Checks for:
 * - Null bytes
 * - Reserved filenames (Windows)
 * - Excessively long paths
 *
 * @param filePath - Path to validate
 * @returns Validation result
 */
export function validatePathSafe(filePath: string): {
  success: boolean;
  error?: string;
} {
  // Check for null bytes (security)
  if (filePath.includes('\0')) {
    return {
      success: false,
      error: 'Path contains null byte',
    };
  }

  // Check for excessively long paths
  if (filePath.length > 4096) {
    return {
      success: false,
      error: 'Path is too long (max 4096 characters)',
    };
  }

  // Check for Windows reserved names
  const basename = path.basename(filePath);
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
  const nameWithoutExt = basename.split('.')[0]?.toUpperCase();

  if (nameWithoutExt && reservedNames.includes(nameWithoutExt)) {
    return {
      success: false,
      error: `Path uses reserved filename: ${nameWithoutExt}`,
    };
  }

  return { success: true };
}

/**
 * Check if project is a git repository
 *
 * @param projectRoot - Project root directory
 * @returns Whether .git directory exists
 */
export async function validateGitRepository(projectRoot: string): Promise<{
  success: boolean;
  isGitRepo?: boolean;
  error?: string;
}> {
  const gitPath = path.join(projectRoot, '.git');
  const result = await validatePathExists(gitPath);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    isGitRepo: result.exists && result.isDirectory,
  };
}

/**
 * Validate file is readable and return its size
 *
 * @param filePath - File path to validate
 * @returns Validation result with file size
 */
export async function validateFileReadable(filePath: string): Promise<{
  success: boolean;
  size?: number;
  error?: string;
}> {
  try {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${filePath}`,
      };
    }

    // Try to read a byte to verify permissions
    const handle = await fs.open(filePath, 'r');
    await handle.close();

    return {
      success: true,
      size: stats.size,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    if (error.code === 'EACCES') {
      return {
        success: false,
        error: `File not readable (permission denied): ${filePath}`,
      };
    }

    logger.error('File validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'File validation failed',
    };
  }
}
