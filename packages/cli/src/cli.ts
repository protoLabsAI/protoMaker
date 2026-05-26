#!/usr/bin/env node

/**
 * protomaker CLI
 *
 * Command-line interface for protoLabs.studio.
 *
 * Usage:
 *   protomaker <command> [options]
 *   protomaker --help
 *
 * Global flags:
 *   --json          Emit JSON output
 *   --quiet         Suppress non-essential output
 *   --project <p>   Override project path (default: cwd)
 *
 * Exit codes:
 *   0  Success
 *   1  Runtime error
 *   2  Usage error
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { parseGlobalFlags } from './utils/flags.js';
import { EXIT_ERROR, EXIT_USAGE } from './utils/exit.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// ---------------------------------------------------------------------------
// Parse global flags
// ---------------------------------------------------------------------------

const globalFlags = parseGlobalFlags();

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('protomaker')
  .description('CLI for protoLabs.studio — automate AI engineering workflows')
  .version(version)
  .option('--json', 'Emit JSON output', globalFlags.json)
  .option('--quiet', 'Suppress non-essential output', globalFlags.quiet)
  .option('--project <path>', 'Project root path (default: cwd)', globalFlags.projectPath)
  .exitOverride() // Prevent Commander from calling process.exit — we handle codes ourselves
  .configureOutput({
    writeOut: (str) => {
      if (!globalFlags.quiet) process.stdout.write(str);
    },
    writeErr: (str) => process.stderr.write(str),
  });

// ---------------------------------------------------------------------------
// Command groups
// ---------------------------------------------------------------------------

/**
 * Project commands — initialize, configure, and manage protomaker projects.
 */
const projectCmd = new Command('project');
projectCmd
  .description('Manage protomaker projects')
  .addHelpText(
    'afterAll',
    `\nCommands:\n  init    Initialize a new protomaker project\n  config  View or edit project configuration`
  );

/**
 * Agent commands — manage AI agents and workflows.
 */
const agentCmd = new Command('agent');
agentCmd
  .description('Manage AI agents and workflows')
  .addHelpText(
    'afterAll',
    `\nCommands:\n  list    List available agents\n  run     Run an agent workflow`
  );

/**
 * Dev commands — development and debugging utilities.
 */
const devCmd = new Command('dev');
devCmd
  .description('Development and debugging utilities')
  .addHelpText('afterAll', `\nCommands:\n  info    Show environment and project info`);

// ---------------------------------------------------------------------------
// Register command groups
// ---------------------------------------------------------------------------

program.addCommand(projectCmd);
program.addCommand(agentCmd);
program.addCommand(devCmd);

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  try {
    await program.parseAsync(process.argv);

    // Show help if no command provided
    if (!process.argv.slice(2).length) {
      program.help();
    }
  } catch (error: any) {
    // Commander exitOverride throws exit code errors
    const exitCode = error.exitCode;

    if (exitCode === EXIT_USAGE) {
      process.exit(EXIT_USAGE);
    } else if (exitCode === EXIT_ERROR) {
      process.exit(EXIT_ERROR);
    } else if (exitCode && typeof exitCode === 'number') {
      process.exit(exitCode);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(EXIT_ERROR);
    } else {
      console.error('An unexpected error occurred.');
      process.exit(EXIT_ERROR);
    }
  }
}

run();
