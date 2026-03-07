#!/usr/bin/env node

/**
 * @protolabsai/setup CLI
 *
 * Standalone CLI that:
 * 1. Scans a target repository (no API key, no server required)
 * 2. Runs a gap analysis against the ProtoLabs gold standard
 * 3. Writes proto.config.yaml to the project root
 * 4. Scaffolds .automaker/ directory structure
 * 5. Generates an HTML gap analysis report
 * 6. Opens the report in the default browser
 *
 * Usage:
 *   npx protolabs-setup [path]
 *   npx @protolabsai/setup [path]
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { researchRepo, analyzeGaps, init } from 'create-protolab';
import { writeProtoConfig } from './services/proto-config-writer.js';
import { generateHtmlReport } from './services/report-generator.js';
import type { GapAnalysisReport } from 'create-protolab';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface CLIOptions {
  projectPath: string;
  yes: boolean;
  dryRun: boolean;
  noOpen: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    projectPath: process.cwd(),
    yes: false,
    dryRun: false,
    noOpen: false,
  };

  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--no-open') opts.noOpen = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      opts.projectPath = path.resolve(arg);
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
  ${pc.bold('protolabs-setup')} ${pc.dim('[path] [options]')}

  Scan a repository and generate:
    ${pc.cyan('proto.config.yaml')}     — project configuration
    ${pc.cyan('.automaker/')}           — automation scaffold
    ${pc.cyan('.automaker/gap-report.html')} — visual gap report

  ${pc.bold('Options:')}
    ${pc.cyan('[path]')}        Target directory (default: current directory)
    ${pc.cyan('--yes, -y')}     Skip all prompts and run all phases
    ${pc.cyan('--dry-run')}     Analyse only — write no files
    ${pc.cyan('--no-open')}     Do not open the HTML report in a browser
    ${pc.cyan('--help, -h')}    Show this help

  ${pc.bold('Examples:')}
    npx protolabs-setup
    npx protolabs-setup ./my-project
    npx protolabs-setup . --yes
    npx @protolabsai/setup /path/to/repo
`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runPhase<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const spinner = clack.spinner();
  spinner.start(label);
  try {
    const result = await fn();
    spinner.stop(pc.green(`✓ ${label}`));
    return result;
  } catch (error) {
    spinner.stop(pc.red(`✗ ${label}`));
    throw error;
  }
}

function displaySummary(
  report: GapAnalysisReport,
  filesCreated: string[],
  reportPath: string | null
): void {
  const c = pc;
  const { summary, overallScore } = report;

  // Score line
  const scoreColor = overallScore >= 80 ? c.green : overallScore >= 60 ? c.yellow : c.red;
  clack.log.info(
    `${c.bold('Score:')} ${scoreColor(overallScore + '%')}  ` +
      `${c.red(summary.critical + ' critical')}  ` +
      `${c.yellow(summary.recommended + ' recommended')}  ` +
      `${c.dim(summary.optional + ' optional')}  ` +
      `${c.green(summary.compliant + ' compliant')}`
  );

  if (filesCreated.length > 0) {
    clack.log.info(c.bold('\nFiles created:'));
    for (const f of filesCreated) {
      clack.log.info(`  ${c.green('+')} ${f}`);
    }
  }

  if (reportPath) {
    clack.log.info(`\n${c.bold('Report:')} ${c.cyan(reportPath)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs();

  clack.intro(pc.bgCyan(pc.black(' protolabs-setup ')));
  clack.log.info(
    `${pc.bold('ProtoLabs Setup')}  ${pc.dim('v' + (process.env['npm_package_version'] ?? '0.1.0'))}`
  );
  clack.log.info(`${pc.dim('Target:')} ${pc.cyan(opts.projectPath)}\n`);

  try {
    // -----------------------------------------------------------------------
    // Phase 1 — Repo research
    // -----------------------------------------------------------------------
    const research = await runPhase('Scanning repository structure…', () =>
      researchRepo(opts.projectPath)
    );

    // -----------------------------------------------------------------------
    // Phase 2 — Gap analysis
    // -----------------------------------------------------------------------
    const gapReport = await runPhase('Running gap analysis…', () =>
      Promise.resolve(analyzeGaps(research))
    );

    // Show quick summary of findings
    const { summary } = gapReport;
    clack.log.info(
      `  Found ${pc.red(summary.critical + ' critical')}, ` +
        `${pc.yellow(summary.recommended + ' recommended')}, ` +
        `${pc.dim(summary.optional + ' optional')} gaps · ` +
        `${pc.green(summary.compliant + ' compliant')}\n`
    );

    // Dry-run: show analysis and exit
    if (opts.dryRun) {
      clack.log.warn(pc.yellow('Dry-run mode — no files written.'));
      clack.outro(pc.dim('Re-run without --dry-run to apply changes.'));
      process.exit(0);
    }

    // -----------------------------------------------------------------------
    // Confirm with user (unless --yes)
    // -----------------------------------------------------------------------
    if (!opts.yes) {
      const confirm = await clack.confirm({
        message: 'Generate proto.config.yaml, .automaker/ scaffold, and HTML report?',
        initialValue: true,
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel('Setup cancelled.');
        process.exit(0);
      }
    }

    // -----------------------------------------------------------------------
    // Phase 3 — Write proto.config.yaml
    // -----------------------------------------------------------------------
    const configResult = await runPhase('Writing proto.config.yaml…', () =>
      writeProtoConfig(opts.projectPath, research)
    );

    // -----------------------------------------------------------------------
    // Phase 4 — Scaffold .automaker/ structure
    // -----------------------------------------------------------------------
    const initResult = await runPhase('Scaffolding .automaker/ structure…', () =>
      init({ projectPath: opts.projectPath, research })
    );

    // -----------------------------------------------------------------------
    // Phase 5 — Generate HTML report
    // -----------------------------------------------------------------------
    const reportPath = await runPhase('Generating HTML gap report…', () =>
      generateHtmlReport(gapReport, opts.projectPath)
    );

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    const filesCreated: string[] = [];
    if (!configResult.skipped) filesCreated.push('proto.config.yaml');
    if (initResult.filesCreated) filesCreated.push(...initResult.filesCreated);
    filesCreated.push(path.relative(opts.projectPath, reportPath));

    displaySummary(gapReport, filesCreated, reportPath);

    // -----------------------------------------------------------------------
    // Phase 6 — Open HTML report in browser
    // -----------------------------------------------------------------------
    if (!opts.noOpen) {
      try {
        const { default: open } = await import('open');
        await open(reportPath);
        clack.log.info(pc.dim('Opening report in browser…'));
      } catch {
        clack.log.warn(pc.yellow(`Could not open browser. View report at: ${pc.cyan(reportPath)}`));
      }
    }

    clack.outro(pc.green('Done! Your repo is ready for ProtoLabs.'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    clack.log.error(pc.red(`Setup failed: ${msg}`));
    if (error instanceof Error && error.stack) {
      clack.log.error(pc.dim(error.stack));
    }
    clack.outro(pc.red('Setup failed.'));
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
