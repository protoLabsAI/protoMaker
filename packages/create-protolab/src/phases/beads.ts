import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';

export interface BeadsInitResult {
  success: boolean;
  alreadyInitialized?: boolean;
  error?: string;
}

/**
 * Initializes the .beads/ task tracker for the project.
 *
 * This function:
 * 1. Checks if the bd CLI is available
 * 2. Skips initialization if .beads/ directory already exists
 * 3. Runs `bd init` if available and not already initialized
 * 4. Sets `no-daemon: true` in .beads/config.yaml after init
 * 5. Handles errors gracefully
 *
 * @param projectDir - The project directory where .beads should be initialized
 * @returns Status object indicating success, already initialized, or error
 */
export async function initializeBeads(projectDir: string): Promise<BeadsInitResult> {
  try {
    // Check if .beads/ directory already exists
    const beadsDir = join(projectDir, '.beads');
    if (existsSync(beadsDir)) {
      console.log('✓ .beads/ directory already exists, skipping initialization');
      return {
        success: true,
        alreadyInitialized: true,
      };
    }

    // Check if bd CLI is available
    let bdAvailable = false;
    try {
      // Try which (Unix/Linux/macOS) or where (Windows)
      const command = process.platform === 'win32' ? 'where bd' : 'which bd';
      execSync(command, { stdio: 'pipe' });
      bdAvailable = true;
    } catch (error) {
      console.warn('⚠ bd CLI not found. Skipping .beads initialization.');
      console.warn('  Install bd from: https://github.com/beads-project/bd');
      return {
        success: false,
        error: 'bd CLI not available',
      };
    }

    if (!bdAvailable) {
      return {
        success: false,
        error: 'bd CLI not available',
      };
    }

    // Run bd init
    try {
      execSync('bd init', {
        cwd: projectDir,
        stdio: 'pipe',
      });
      console.log('✓ Initialized .beads/ directory');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('✗ Failed to run bd init:', errorMessage);
      return {
        success: false,
        error: `bd init failed: ${errorMessage}`,
      };
    }

    // Set no-daemon: true in .beads/config.yaml
    try {
      const configPath = join(beadsDir, 'config.yaml');

      if (existsSync(configPath)) {
        const configContent = readFileSync(configPath, 'utf-8');
        const config = yaml.parse(configContent) || {};

        // Set no-daemon to true
        config['no-daemon'] = true;

        // Write back the config
        const newConfigContent = yaml.stringify(config);
        writeFileSync(configPath, newConfigContent, 'utf-8');
        console.log('✓ Set no-daemon: true in .beads/config.yaml');
      } else {
        console.warn('⚠ .beads/config.yaml not found, skipping no-daemon configuration');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠ Failed to set no-daemon in config.yaml:', errorMessage);
      // Don't fail the entire operation if config update fails
    }

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('✗ Unexpected error during beads initialization:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
