#!/usr/bin/env node

/**
 * create-protolab CLI
 * Initializes a project with comprehensive error handling and graceful degradation
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  ErrorCode,
  ProtolabCliError,
  createError,
  handleError,
  formatError,
  isFatalError,
} from './lib/error-handler.js';
import {
  validateFatalRequirements,
  validateOptionalTools,
  checkEnvironment,
  isAutomakerInitialized,
  isBeadsInitialized,
  detectCompletedPhases,
  detectMonorepo,
  isAutomakerServerRunning,
  isCommandAvailable,
} from './lib/validators.js';
import {
  RollbackManager,
  RollbackActions,
  safeMkdir,
  safeWriteFile,
} from './lib/rollback.js';

interface SetupOptions {
  force?: boolean;
  verbose?: boolean;
  skipPrompts?: boolean;
  automakerApiKey?: string;
}

interface SetupPhase {
  name: string;
  description: string;
  required: boolean;
  execute: () => Promise<void>;
}

/**
 * Main setup function
 */
async function setupProtolab(projectPath: string, options: SetupOptions = {}): Promise<void> {
  const rollback = new RollbackManager({ verbose: options.verbose });
  let hasErrors = false;

  try {
    printBanner();
    console.log(`\n📁 Project: ${projectPath}\n`);

    // Phase 1: Validate prerequisites
    await runPhase('validate-prerequisites', async () => {
      console.log('🔍 Phase 1: Validating Prerequisites\n');

      // Check environment
      const envChecks = checkEnvironment();
      const missingRequired = envChecks.filter(check => check.required && !check.available);
      const missingOptional = envChecks.filter(check => !check.required && !check.available);

      // Report required tools
      console.log('Required tools:');
      for (const check of envChecks.filter(c => c.required)) {
        if (check.available) {
          console.log(`  ✓ ${check.name} ${check.version || ''}`);
        } else {
          console.log(`  ✗ ${check.name} (not found)`);
        }
      }

      // Report optional tools
      if (missingOptional.length > 0) {
        console.log('\nOptional tools:');
        for (const check of missingOptional) {
          console.log(`  ⚠ ${check.name} (not found - some features will be unavailable)`);
          if (check.installUrl) {
            console.log(`    Install: ${check.installUrl}`);
          }
        }
      }

      // Fatal if required tools missing
      if (missingRequired.length > 0) {
        console.log('\n✗ Missing required tools\n');
        process.exit(1);
      }

      console.log('\n✓ All required tools available\n');

      // Validate fatal requirements
      try {
        validateFatalRequirements(projectPath);
        console.log('✓ Project path valid');
        console.log('✓ Write access verified');
        console.log('✓ Git repository detected');
        console.log('✓ package.json found');
      } catch (error) {
        if (error instanceof ProtolabCliError && error.code === ErrorCode.NOT_GIT_REPO) {
          console.log('\n⚠ Not a git repository. Initializing...');
          const { execSync } = await import('child_process');
          execSync('git init', { cwd: projectPath, stdio: 'ignore' });
          console.log('✓ Git repository initialized');
        } else {
          throw error;
        }
      }

      // Detect monorepo
      const monorepoInfo = detectMonorepo(projectPath);
      if (monorepoInfo.isMonorepo) {
        console.log(`\n📦 Monorepo detected (${monorepoInfo.type || 'unknown'})`);
        if (!monorepoInfo.hasWorkspaces) {
          console.log('  ⚠ No workspace configuration found (detected from structure)');
        }
      }

      // Check for partial setup
      const completed = detectCompletedPhases(projectPath);
      if (completed.automakerInitialized || completed.beadsInitialized) {
        console.log('\n⚠ Partial setup detected from previous run');
        if (completed.automakerInitialized) {
          console.log('  • Automaker already initialized');
        }
        if (completed.beadsInitialized) {
          console.log('  • Beads already initialized');
        }

        if (!options.force) {
          console.log('\n  Use --force to reinitialize\n');
          return;
        }
      }

      rollback.markCompleted('validate-prerequisites');
    });

    // Phase 2: Initialize Beads (optional)
    if (isCommandAvailable('bd')) {
      await runPhase('initialize-beads', async () => {
        console.log('🔨 Phase 2: Initializing Beads\n');

        if (isBeadsInitialized(projectPath) && !options.force) {
          console.log('⚠ Beads already initialized. Skipping.\n');
          rollback.markCompleted('initialize-beads');
          return;
        }

        try {
          const { execSync } = await import('child_process');
          const projectName = path.basename(projectPath);

          if (options.verbose) {
            console.log(`  Running: bd init --prefix ${projectName} --no-daemon`);
          }

          execSync(`bd init --prefix "${projectName}" --no-daemon`, {
            cwd: projectPath,
            stdio: options.verbose ? 'inherit' : 'ignore',
          });

          console.log('✓ Beads initialized\n');

          // Add rollback action
          rollback.addAction(
            RollbackActions.removeDirectory(path.join(projectPath, '.beads'), 'Remove .beads directory')
          );

          rollback.markCompleted('initialize-beads');
        } catch (error) {
          const cliError = createError(ErrorCode.BD_CLI_MISSING, error instanceof Error ? error.message : String(error));
          if (handleError(cliError, options)) {
            rollback.markCompleted('initialize-beads');
          } else {
            hasErrors = true;
          }
        }
      });
    } else {
      console.log('⚠ Beads CLI not available. Skipping Beads initialization.\n');
    }

    // Phase 3: Initialize Automaker
    await runPhase('initialize-automaker', async () => {
      console.log('🤖 Phase 3: Initializing Automaker\n');

      if (isAutomakerInitialized(projectPath) && !options.force) {
        console.log('⚠ Automaker already initialized. Skipping.\n');
        rollback.markCompleted('initialize-automaker');
        return;
      }

      // Check if server is running
      const serverRunning = await isAutomakerServerRunning();
      if (!serverRunning) {
        const error = createError(ErrorCode.AUTOMAKER_SERVER_DOWN);
        console.log('\n' + formatError(error));
        console.log('\n  Continuing with local initialization...\n');
      }

      // Create .automaker directory structure
      const automakerDir = path.join(projectPath, '.automaker');
      safeMkdir(automakerDir, rollback);
      safeMkdir(path.join(automakerDir, 'features'), rollback);
      safeMkdir(path.join(automakerDir, 'context'), rollback);
      safeMkdir(path.join(automakerDir, 'worktrees'), rollback);
      safeMkdir(path.join(automakerDir, 'backlog'), rollback);

      // Create default settings
      const settings = {
        version: '1.0.0',
        initialized: new Date().toISOString(),
        project: {
          name: path.basename(projectPath),
          path: projectPath,
        },
      };

      safeWriteFile(
        path.join(automakerDir, 'settings.json'),
        JSON.stringify(settings, null, 2),
        rollback
      );

      // Create default context
      const contextReadme = `# Project Context\n\nAdd markdown files here to provide context to AI agents.\n`;
      safeWriteFile(path.join(automakerDir, 'context', 'README.md'), contextReadme, rollback);

      console.log('✓ Automaker directory structure created');
      console.log('  • .automaker/features');
      console.log('  • .automaker/context');
      console.log('  • .automaker/worktrees');
      console.log('  • .automaker/backlog\n');

      rollback.markCompleted('initialize-automaker');
    });

    // Phase 4: Setup CI/CD (optional)
    if (isCommandAvailable('gh')) {
      await runPhase('setup-ci-cd', async () => {
        console.log('🔄 Phase 4: CI/CD Setup (Optional)\n');

        // This would be implemented based on the setup-ci-cd.sh script
        console.log('⚠ CI/CD setup can be run manually with: npm run setup-ci -- ' + projectPath + '\n');

        rollback.markCompleted('setup-ci-cd');
      });
    }

    // Success! Clear rollback and show summary
    rollback.clear();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Setup Complete!\n');
    console.log('Your ProtoLab is ready:\n');
    console.log('  ✓ Git repository');
    if (rollback.isCompleted('initialize-beads')) {
      console.log('  ✓ Beads issue tracker (.beads/)');
    }
    console.log('  ✓ Automaker structure (.automaker/)');
    console.log('\nNext steps:\n');
    console.log('  1. Start Automaker: npm run dev');
    console.log('  2. Open the project in the Automaker UI');
    console.log('  3. Create your first feature\n');
    console.log('Happy building! 🚀\n');

  } catch (error) {
    // Handle fatal errors
    if (error instanceof ProtolabCliError) {
      console.error('\n' + formatError(error) + '\n');

      if (isFatalError(error)) {
        // Perform rollback
        await rollback.rollback();
        process.exit(1);
      }
    } else {
      console.error('\n✗ Unexpected error:', error);
      await rollback.rollback();
      process.exit(1);
    }
  }

  // If there were recoverable errors, exit with code 1
  if (hasErrors) {
    process.exit(1);
  }
}

/**
 * Run a phase with error handling
 */
async function runPhase(name: string, execute: () => Promise<void>): Promise<void> {
  try {
    await execute();
  } catch (error) {
    if (error instanceof ProtolabCliError) {
      throw error;
    }
    throw new Error(`Phase ${name} failed: ${error}`);
  }
}

/**
 * Print banner
 */
function printBanner(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧪 ProtoLab Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Parse command line arguments
 */
function parseArgs(): { projectPath: string; options: SetupOptions } {
  const args = process.argv.slice(2);

  const options: SetupOptions = {
    force: args.includes('--force') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipPrompts: args.includes('--yes') || args.includes('-y'),
    automakerApiKey: process.env.AUTOMAKER_API_KEY,
  };

  // Get project path (first non-flag argument)
  const projectPath = args.find(arg => !arg.startsWith('-'));

  if (!projectPath) {
    console.error('\n✗ Error: Project path is required\n');
    console.log('Usage: create-protolab <project-path> [options]\n');
    console.log('Options:');
    console.log('  --force, -f      Force reinitialize even if already set up');
    console.log('  --verbose, -v    Show detailed output');
    console.log('  --yes, -y        Skip all prompts\n');
    process.exit(1);
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(projectPath);

  return { projectPath: resolvedPath, options };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { projectPath, options } = parseArgs();
  await setupProtolab(projectPath, options);
}

// Run CLI
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
