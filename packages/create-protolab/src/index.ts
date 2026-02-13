#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { exit } from 'process';

interface CliOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  skip?: string;
  guildId?: string;
}

/**
 * Main CLI entry point for create-protolab
 */
export async function main(): Promise<void> {
  const program = new Command();

  program
    .name('create-protolab')
    .description('Create and scan Protolab projects')
    .version('1.0.0')
    .argument('[path]', 'Path to the project directory (defaults to current directory)', '.')
    .option('--yes', 'Skip prompts and accept defaults')
    .option('--dry-run', 'Scan only mode without making changes')
    .option('--json', 'Output results in machine-readable JSON format')
    .option('--skip <phases>', 'Comma-separated list of phases to skip')
    .option('--guild-id <id>', 'Discord Guild ID for integration')
    .action(async (path: string, options: CliOptions) => {
      try {
        // Validate and resolve the path
        const projectPath = resolve(process.cwd(), path);

        // Parse skip phases if provided
        const skipPhases = options.skip
          ? options.skip.split(',').map(phase => phase.trim())
          : [];

        // Log configuration if not in JSON mode
        if (!options.json) {
          console.log('create-protolab CLI');
          console.log('==================');
          console.log(`Project path: ${projectPath}`);
          console.log(`Skip prompts: ${options.yes || false}`);
          console.log(`Dry run mode: ${options.dryRun || false}`);
          console.log(`JSON output: ${options.json || false}`);
          if (skipPhases.length > 0) {
            console.log(`Skip phases: ${skipPhases.join(', ')}`);
          }
          if (options.guildId) {
            console.log(`Discord Guild ID: ${options.guildId}`);
          }
        }

        // Main CLI flow would be implemented here
        // For now, this is a placeholder that demonstrates the structure
        const result = {
          success: true,
          projectPath,
          options: {
            skipPrompts: options.yes || false,
            dryRun: options.dryRun || false,
            skipPhases,
            guildId: options.guildId,
          },
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('\nCLI flow would execute here');
          console.log('Status: Ready');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (options.json) {
          console.error(JSON.stringify({ success: false, error: errorMessage }, null, 2));
        } else {
          console.error(`Error: ${errorMessage}`);
        }

        exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    exit(1);
  });
}
