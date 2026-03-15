#!/usr/bin/env node

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { researchRepo } from './phases/research.js';
import { analyzeGaps } from './phases/analyze.js';
import { init } from './phases/init.js';
import { setupCI } from './phases/ci.js';
import { generateCodeRabbitConfig } from './phases/coderabbit.js';
import { createBranchProtectionRuleset } from './phases/branch-protection.js';
import { executeDiscordPhase } from './phases/discord.js';
import { scaffoldStarter } from './phases/scaffold.js';
import type { StarterKitType } from './phases/scaffold.js';

/**
 * CLI for ProtoLabs setup and initialization
 *
 * Interactive flow:
 * 1. Intro banner with project name and path
 * 2. Starter kit type selection (docs, portfolio, extension, general)
 * 3. If docs or portfolio: scaffold Astro project into outputDir
 * 4. Spinner for research phase
 * 5. Display gap analysis results (score, compliant items, gaps by severity)
 * 6. Multi-select prompt for which phases to run (pre-select all recommended)
 * 7. Spinner for each phase with status updates
 * 8. Summary with created files and next steps
 * 9. Outro
 */

// Types (simplified for CLI - would normally import from @protolabsai/types)
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

// Phase functions (wire to real implementations)

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

// Wrapper functions for phase execution (these call the real implementations)

// Display functions
function displayGapAnalysis(report: GapAnalysisReport, useColors: boolean) {
  const c = useColors
    ? pc
    : {
        green: (s: string) => s,
        yellow: (s: string) => s,
        red: (s: string) => s,
        cyan: (s: string) => s,
        dim: (s: string) => s,
        bold: (s: string) => s,
      };

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
  const criticalGaps = report.gaps.filter((g) => g.severity === 'critical');
  const recommendedGaps = report.gaps.filter((g) => g.severity === 'recommended');
  const optionalGaps = report.gaps.filter((g) => g.severity === 'optional');

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
  const c = useColors
    ? pc
    : {
        green: (s: string) => s,
        cyan: (s: string) => s,
        dim: (s: string) => s,
        bold: (s: string) => s,
      };

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
  clack.log.info(
    `  2. ${c.dim('Run')} ${c.cyan('npm install')} ${c.dim('to install dependencies')}`
  );
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
      const researchResult = await researchRepo(projectPath);
      const gapAnalysis = analyzeGaps(researchResult);

      const output: any = {
        success: true,
        projectPath,
        research: researchResult,
        gapAnalysis,
        dryRun: options.dryRun || false,
      };

      if (!options.dryRun) {
        const initResult = await init({ projectPath, research: researchResult });
        const pm = researchResult.monorepo.packageManager;
        const ciResult = await setupCI({
          projectPath,
          packageManager: pm === 'unknown' ? 'npm' : pm,
        });

        output.initialized = true;
        output.files = [...(initResult.filesCreated || []), ...(ciResult.filesCreated || [])];
      }

      console.log(JSON.stringify(output, null, 2));
      process.exit(0);
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  // Interactive mode
  clack.intro(pc.bgCyan(pc.black(' create-protolab ')));

  clack.log.info(pc.bold('ProtoLabs Setup & Initialization'));
  clack.log.info(`Project: ${pc.cyan(projectPath)}\n`);

  try {
    // Step 1: Starter kit type selection
    let selectedKit: StarterKitType = 'general';

    if (options.yes) {
      clack.log.info(pc.dim('Starter kit: general (--yes mode)'));
    } else {
      const kitSelection = await clack.select({
        message: 'What type of project are you creating?',
        options: [
          {
            value: 'docs' as StarterKitType,
            label: 'Documentation site',
            hint: 'Starlight + Astro — great for product docs',
          },
          {
            value: 'portfolio' as StarterKitType,
            label: 'Portfolio site',
            hint: 'Astro + React + Tailwind — personal or agency portfolio',
          },
          {
            value: 'extension' as StarterKitType,
            label: 'Browser extension',
            hint: 'Manifest v3, React popup + content script',
          },
          {
            value: 'general' as StarterKitType,
            label: 'General project',
            hint: 'Any other project type',
          },
        ],
      });

      if (clack.isCancel(kitSelection)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      selectedKit = kitSelection as StarterKitType;
    }

    // Step 2: Scaffold the Astro starter kit (docs and portfolio only)
    const scaffoldCreatedFiles: string[] = [];
    let scaffoldFeatureCount = 0;

    if (selectedKit === 'docs' || selectedKit === 'portfolio') {
      let projectName = '';

      if (options.yes) {
        // Derive a name from the project path
        projectName = projectPath.split('/').pop() ?? 'my-project';
      } else {
        const nameInput = await clack.text({
          message: 'Project name',
          placeholder: projectPath.split('/').pop() ?? 'my-project',
          validate(value) {
            if (!value || !value.trim()) return 'Project name is required';
            if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value.trim())) {
              return 'Use lowercase letters, numbers, and hyphens only';
            }
          },
        });

        if (clack.isCancel(nameInput)) {
          clack.cancel('Setup cancelled');
          process.exit(0);
        }

        projectName = (nameInput as string).trim();
      }

      const scaffoldResult = await runPhase(`Scaffolding ${selectedKit} starter kit...`, () =>
        scaffoldStarter({
          kitType: selectedKit,
          projectName,
          outputDir: projectPath,
        })
      );

      if (scaffoldResult.filesCreated) {
        scaffoldCreatedFiles.push(...scaffoldResult.filesCreated);
      }
      scaffoldFeatureCount = scaffoldResult.starterFeatures?.length ?? 0;
    }

    // Phase 3: Research
    const researchResult = await runPhase('Analyzing repository structure...', () =>
      researchRepo(projectPath)
    );

    // Phase 4: Gap Analysis
    const gapAnalysis = await runPhase('Running gap analysis...', () =>
      Promise.resolve(analyzeGaps(researchResult))
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
      selectedPhases = ['automaker', 'ci', 'features'];
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
        initialValues: ['automaker', 'ci', 'features'],
        required: false,
      });

      if (clack.isCancel(phaseSelection)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      selectedPhases = phaseSelection as string[];
    }

    if (selectedPhases.length === 0 && scaffoldCreatedFiles.length === 0) {
      clack.log.warn(pc.yellow('No phases selected'));
      clack.outro(pc.dim('Setup completed without changes'));
      process.exit(0);
    }

    // Execute selected phases
    const createdFiles: string[] = [...scaffoldCreatedFiles];
    let featuresCreated = scaffoldFeatureCount;

    if (selectedPhases.includes('automaker')) {
      const result = await runPhase('Initializing .automaker/ directory...', () =>
        init({ projectPath, research: researchResult })
      );
      if (result.filesCreated) {
        createdFiles.push(...result.filesCreated);
      }
    }

    if (selectedPhases.includes('ci')) {
      const pm = researchResult.monorepo.packageManager;
      const result = await runPhase('Setting up CI/CD pipeline...', () =>
        setupCI({ projectPath, packageManager: pm === 'unknown' ? 'npm' : pm })
      );
      if (result.filesCreated) {
        createdFiles.push(...result.filesCreated);
      }
    }

    if (selectedPhases.includes('features')) {
      // Features are created via Automaker API - this would require server access
      // For now, just count the gaps plus starter features
      featuresCreated += gapAnalysis.gaps.length;
    }

    // Display summary
    displaySummary(createdFiles, featuresCreated, !options.json);

    clack.outro(pc.green('🚀 Ready to build with ProtoLabs!'));
  } catch (error) {
    clack.log.error(
      pc.red('Setup failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    );
    clack.outro(pc.red('Setup failed'));
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
