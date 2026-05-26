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
 *   --json      Output results as JSON
 *   --quiet     Suppress all non-error output
 *   --project   Project path (defaults to cwd)
 *
 * Exit codes:
 *   0 = success
 *   1 = runtime error
 *   2 = usage error
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { type GlobalFlags, usageError, exitError } from './output.js';
import { listCommand, getCommand, createCommand, updateCommand, moveCommand } from './feature.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('protomaker')
  .description('CLI for protoLabs.studio — automate AI engineering workflows')
  .version(version)
  // -----------------------------------------------------------------------
  // Global flags
  // -----------------------------------------------------------------------
  .option('--json', 'Output results as JSON', false)
  .option('--quiet', 'Suppress all non-error output', false)
  .option('--project <path>', 'Project path (defaults to cwd)', process.cwd())
  .exitOverride(); // Prevent Commander from calling process.exit — we control exit codes

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

/**
 * Feature commands — core board operations (list, get, create, update, move).
 */
const featureCmd = new Command('feature');
featureCmd
  .description('Core board commands — manage features')
  .addHelpText(
    'afterAll',
    `\nCommands:\n  list      List features grouped by status\n  get       Show full feature details\n  create    Create a new feature\n  update    Update a feature\n  move      Transition feature status`
  );

// ---------------------------------------------------------------------------
// Register command groups
// ---------------------------------------------------------------------------

program.addCommand(projectCmd);
program.addCommand(agentCmd);
program.addCommand(devCmd);
program.addCommand(featureCmd);

// ---------------------------------------------------------------------------
// Entry — exit-code discipline
// ---------------------------------------------------------------------------

try {
  // Show help if no command provided (exit code 2 = usage error).
  // outputHelp() prints without exiting; help() would call process.exit(0)
  // internally, making the intended exit(2) below unreachable.
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(2);
  }

  program.parse(process.argv);

  // Extract global flags after parsing
  const opts = program.opts();
  const globalFlags: GlobalFlags = {
    json: opts.json ?? false,
    quiet: opts.quiet ?? false,
    project: opts.project ?? process.cwd(),
  };

  // Success — exit code 0
  process.exit(0);
} catch (err: any) {
  // Commander exitOverride throws CommanderError on failures
  const commanderCode = err?.code;

  // --help / --version are fine
  if (commanderCode === 'COMMANDER_HELP' || commanderCode === 'COMMANDER_VERSION') {
    process.exit(0);
  }

  // Usage errors (unknown command, missing required arg, etc.) → exit 2
  if (
    commanderCode === 'COMMANDER_INCORRECTVALUE' ||
    commanderCode === 'COMMANDER_ARGUMENT_MISSING' ||
    commanderCode === 'COMMANDER_CREATE_OPTION_FAILED'
  ) {
    usageError(err.message || String(err));
  }

  // Runtime error → exit 1
  exitError(err.message || String(err));
}
