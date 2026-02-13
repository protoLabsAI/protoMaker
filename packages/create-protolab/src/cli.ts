#!/usr/bin/env node

import * as clack from '@clack/prompts';
import pc from 'picocolors';

/**
 * CLI for ProtoLabs setup and initialization
 *
 * Interactive flow:
 * 1. Intro banner with project name and path
 * 2. Spinner for research phase
 * 3. Display gap analysis results (score, compliant items, gaps by severity)
 * 4. Multi-select prompt for which phases to run (pre-select all recommended)
 * 5. Spinner for each phase with status updates
 * 6. Summary with created files and next steps
 * 7. Outro
 */

// Types (simplified for CLI - would normally import from @automaker/types)
interface GapItem {
  id: string;
  category: string;
  severity: 'critical' | 'recommended' | 'optional';
  title: string;
  current: string;
  target: string;
  effort: 'small' | 'medium' | 'large';
  featureDescription: string;
}

interface ComplianceItem {
  category: string;
  title: string;
  detail: string;
}

interface GapAnalysisReport {
  projectPath: string;
  analyzedAt: string;
  overallScore: number;
  gaps: GapItem[];
  compliant: ComplianceItem[];
  summary: {
    critical: number;
    recommended: number;
    optional: number;
    compliant: number;
  };
}

interface CLIOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  projectPath?: string;
}

// Parse CLI arguments
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      options.projectPath = arg;
    }
  }

  return options;
}

// Mock functions for demonstration (in real implementation, these would call the server API)
async function performResearch(projectPath: string): Promise<any> {
  // Simulate research phase
  await new Promise(resolve => setTimeout(resolve, 2000));
  return {
    projectPath,
    projectName: projectPath.split('/').pop() || 'unknown',
    git: { isRepo: true, provider: 'github' },
    monorepo: { isMonorepo: true, tool: 'turbo', packageManager: 'pnpm' },
    frontend: { framework: 'react', metaFramework: 'vite', hasShadcn: true },
    testing: { hasVitest: true, hasPlaywright: false },
    codeQuality: { hasTypeScript: true, hasPrettier: true, hasESLint: true },
  };
}

async function performGapAnalysis(researchResult: any): Promise<GapAnalysisReport> {
  // Simulate gap analysis
  await new Promise(resolve => setTimeout(resolve, 1500));
  return {
    projectPath: researchResult.projectPath,
    analyzedAt: new Date().toISOString(),
    overallScore: 72,
    gaps: [
      {
        id: 'gap-1',
        category: 'testing',
        severity: 'critical',
        title: 'Missing Playwright E2E tests',
        current: 'No E2E testing framework',
        target: 'Playwright configured with test suite',
        effort: 'medium',
        featureDescription: 'Add Playwright for end-to-end testing',
      },
      {
        id: 'gap-2',
        category: 'ci',
        severity: 'critical',
        title: 'No CI pipeline',
        current: 'No automated checks',
        target: 'GitHub Actions with build, test, format, audit',
        effort: 'small',
        featureDescription: 'Set up GitHub Actions CI pipeline',
      },
      {
        id: 'gap-3',
        category: 'automation',
        severity: 'recommended',
        title: 'Missing .automaker/ directory',
        current: 'Not initialized',
        target: '.automaker/ with context files',
        effort: 'small',
        featureDescription: 'Initialize ProtoLabs automation',
      },
    ],
    compliant: [
      {
        category: 'monorepo',
        title: 'Monorepo with Turbo',
        detail: 'Using Turborepo with pnpm workspaces',
      },
      {
        category: 'frontend',
        title: 'React + Vite + shadcn/ui',
        detail: 'Modern React stack with component library',
      },
      {
        category: 'quality',
        title: 'TypeScript + ESLint + Prettier',
        detail: 'Code quality tools configured',
      },
    ],
    summary: {
      critical: 2,
      recommended: 1,
      optional: 0,
      compliant: 3,
    },
  };
}

async function runPhase(phaseName: string, action: () => Promise<any>): Promise<any> {
  const spinner = clack.spinner();
  spinner.start(phaseName);
  try {
    const result = await action();
    spinner.stop(pc.green(`✓ ${phaseName}`));
    return result;
  } catch (error) {
    spinner.stop(pc.red(`✗ ${phaseName}`));
    throw error;
  }
}

async function initializeAutomaker(): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return ['.automaker/context/spec.md', '.automaker/context/CLAUDE.md', '.automaker/settings.json'];
}

async function initializeBeads(): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 800));
  return ['.beads/config.json', '.beads/tasks/.gitkeep'];
}

async function setupCIPipeline(): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 1200));
  return ['.github/workflows/build.yml', '.github/workflows/test.yml', '.github/workflows/format-check.yml'];
}

async function createFeatures(gaps: GapItem[]): Promise<number> {
  await new Promise(resolve => setTimeout(resolve, 1500));
  return gaps.length;
}

// Display functions
function displayGapAnalysis(report: GapAnalysisReport, useColors: boolean) {
  const c = useColors ? pc : { green: (s: string) => s, yellow: (s: string) => s, red: (s: string) => s, cyan: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s };

  clack.log.info(c.bold('\n📊 Gap Analysis Results\n'));
  clack.log.info(`Overall Score: ${c.cyan(report.overallScore + '%')}`);
  clack.log.info(`Project: ${c.dim(report.projectPath)}\n`);

  // Display summary
  clack.log.info(c.bold('Summary:'));
  clack.log.info(`  ${c.green('✓')} Compliant: ${report.summary.compliant}`);
  if (report.summary.critical > 0) {
    clack.log.info(`  ${c.red('✗')} Critical gaps: ${report.summary.critical}`);
  }
  if (report.summary.recommended > 0) {
    clack.log.info(`  ${c.yellow('⚠')} Recommended: ${report.summary.recommended}`);
  }
  if (report.summary.optional > 0) {
    clack.log.info(`  ${c.dim('○')} Optional: ${report.summary.optional}`);
  }

  // Display compliant items
  if (report.compliant.length > 0) {
    clack.log.info(c.bold('\n✓ Compliant:'));
    for (const item of report.compliant) {
      clack.log.info(`  ${c.green('✓')} ${item.title}`);
      clack.log.info(`    ${c.dim(item.detail)}`);
    }
  }

  // Display gaps by severity
  const criticalGaps = report.gaps.filter(g => g.severity === 'critical');
  const recommendedGaps = report.gaps.filter(g => g.severity === 'recommended');
  const optionalGaps = report.gaps.filter(g => g.severity === 'optional');

  if (criticalGaps.length > 0) {
    clack.log.info(c.bold('\n✗ Critical Gaps:'));
    for (const gap of criticalGaps) {
      clack.log.info(`  ${c.red('✗')} ${gap.title} (${gap.effort} effort)`);
      clack.log.info(`    ${c.dim(`Current: ${gap.current}`)}`);
      clack.log.info(`    ${c.dim(`Target: ${gap.target}`)}`);
    }
  }

  if (recommendedGaps.length > 0) {
    clack.log.info(c.bold('\n⚠ Recommended:'));
    for (const gap of recommendedGaps) {
      clack.log.info(`  ${c.yellow('⚠')} ${gap.title} (${gap.effort} effort)`);
      clack.log.info(`    ${c.dim(`Current: ${gap.current}`)}`);
      clack.log.info(`    ${c.dim(`Target: ${gap.target}`)}`);
    }
  }

  if (optionalGaps.length > 0) {
    clack.log.info(c.bold('\n○ Optional:'));
    for (const gap of optionalGaps) {
      clack.log.info(`  ${c.dim('○')} ${gap.title} (${gap.effort} effort)`);
      clack.log.info(`    ${c.dim(`Current: ${gap.current}`)}`);
      clack.log.info(`    ${c.dim(`Target: ${gap.target}`)}`);
    }
  }
}

function displaySummary(createdFiles: string[], featuresCreated: number, useColors: boolean) {
  const c = useColors ? pc : { green: (s: string) => s, cyan: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s };

  clack.log.info(c.bold('\n✨ Setup Complete!\n'));

  clack.log.info(c.bold('Created Files:'));
  for (const file of createdFiles) {
    clack.log.info(`  ${c.green('✓')} ${file}`);
  }

  if (featuresCreated > 0) {
    clack.log.info(`\n${c.bold('Features Created:')} ${c.cyan(featuresCreated.toString())}`);
  }

  clack.log.info(c.bold('\nNext Steps:'));
  clack.log.info(`  1. ${c.dim('Review the generated files and configuration')}`);
  clack.log.info(`  2. ${c.dim('Run')} ${c.cyan('npm install')} ${c.dim('to install dependencies')}`);
  clack.log.info(`  3. ${c.dim('Run')} ${c.cyan('npm run dev')} ${c.dim('to start development')}`);
  clack.log.info(`  4. ${c.dim('Check the ProtoMaker board for alignment features')}`);
}

// Main CLI flow
async function main() {
  const options = parseArgs();
  const projectPath = options.projectPath || process.cwd();

  // JSON mode: output machine-readable format, no prompts
  if (options.json) {
    try {
      const researchResult = await performResearch(projectPath);
      const gapAnalysis = await performGapAnalysis(researchResult);

      const output: any = {
        success: true,
        projectPath,
        research: researchResult,
        gapAnalysis,
        dryRun: options.dryRun || false,
      };

      if (!options.dryRun) {
        const automakerFiles = await initializeAutomaker();
        const beadsFiles = await initializeBeads();
        const ciFiles = await setupCIPipeline();
        const featuresCreated = await createFeatures(gapAnalysis.gaps);

        output.initialized = true;
        output.files = [...automakerFiles, ...beadsFiles, ...ciFiles];
        output.featuresCreated = featuresCreated;
      }

      console.log(JSON.stringify(output, null, 2));
      process.exit(0);
    } catch (error) {
      console.log(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, null, 2));
      process.exit(1);
    }
  }

  // Interactive mode
  clack.intro(pc.bgCyan(pc.black(' create-protolab ')));

  clack.log.info(pc.bold('ProtoLabs Setup & Initialization'));
  clack.log.info(`Project: ${pc.cyan(projectPath)}\n`);

  try {
    // Phase 1: Research
    const researchResult = await runPhase(
      'Analyzing repository structure...',
      () => performResearch(projectPath)
    );

    // Phase 2: Gap Analysis
    const gapAnalysis = await runPhase(
      'Running gap analysis...',
      () => performGapAnalysis(researchResult)
    );

    // Display gap analysis results
    displayGapAnalysis(gapAnalysis, !options.json);

    // Check if dry-run mode
    if (options.dryRun) {
      clack.log.info(pc.yellow('\n⚠ Dry run mode - stopping after analysis'));
      clack.outro(pc.dim('Run without --dry-run to execute setup phases'));
      process.exit(0);
    }

    // Phase selection (skip if --yes mode)
    let selectedPhases: string[] = [];

    if (options.yes) {
      // Pre-select all recommended phases
      selectedPhases = ['automaker', 'beads', 'ci', 'features'];
      clack.log.info(pc.dim('\nRunning all phases (--yes mode)'));
    } else {
      const phaseSelection = await clack.multiselect({
        message: 'Which phases would you like to run?',
        options: [
          {
            value: 'automaker',
            label: 'Initialize .automaker/',
            hint: 'recommended',
          },
          {
            value: 'beads',
            label: 'Initialize .beads/ task tracker',
            hint: 'recommended',
          },
          {
            value: 'ci',
            label: 'Set up CI/CD pipeline',
            hint: 'recommended',
          },
          {
            value: 'features',
            label: 'Create alignment features',
            hint: 'recommended',
          },
        ],
        initialValues: ['automaker', 'beads', 'ci', 'features'],
        required: false,
      });

      if (clack.isCancel(phaseSelection)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      selectedPhases = phaseSelection as string[];
    }

    if (selectedPhases.length === 0) {
      clack.log.warn(pc.yellow('No phases selected'));
      clack.outro(pc.dim('Setup completed without changes'));
      process.exit(0);
    }

    // Execute selected phases
    const createdFiles: string[] = [];
    let featuresCreated = 0;

    if (selectedPhases.includes('automaker')) {
      const files = await runPhase(
        'Initializing .automaker/ directory...',
        initializeAutomaker
      );
      createdFiles.push(...files);
    }

    if (selectedPhases.includes('beads')) {
      const files = await runPhase(
        'Initializing .beads/ task tracker...',
        initializeBeads
      );
      createdFiles.push(...files);
    }

    if (selectedPhases.includes('ci')) {
      const files = await runPhase(
        'Setting up CI/CD pipeline...',
        setupCIPipeline
      );
      createdFiles.push(...files);
    }

    if (selectedPhases.includes('features')) {
      featuresCreated = await runPhase(
        'Creating alignment features...',
        () => createFeatures(gapAnalysis.gaps)
      );
    }

    // Display summary
    displaySummary(createdFiles, featuresCreated, !options.json);

    clack.outro(pc.green('🚀 Ready to build with ProtoLabs!'));
  } catch (error) {
    clack.log.error(pc.red('Setup failed: ' + (error instanceof Error ? error.message : 'Unknown error')));
    clack.outro(pc.red('Setup failed'));
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
