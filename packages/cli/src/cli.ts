#!/usr/bin/env node

/**
 * protomaker CLI
 *
 * Command-line interface for protoLabs.studio.
 *
 * Usage:
 *   protomaker <command> [options]
 *   protomaker --help
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('protomaker')
  .description('CLI for protoLabs.studio — automate AI engineering workflows')
  .version(version);

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

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.help();
}
