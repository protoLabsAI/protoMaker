/**
 * Report Generator Service
 *
 * Takes a GapAnalysisReport + RepoResearchResult and generates a self-contained HTML report.
 * The report includes Tailwind CSS via CDN and inline JavaScript for interactivity.
 */

import { createLogger } from '@automaker/utils';
import type { GapAnalysisReport, RepoResearchResult } from '@automaker/types';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const logger = createLogger('report-generator');

interface ReportOptions {
  projectPath: string;
  research: RepoResearchResult;
  report: GapAnalysisReport;
}

/**
 * Generate a self-contained HTML report from gap analysis and research results.
 * Returns the HTML string.
 */
export function generateReport(options: ReportOptions): string {
  const { research, report } = options;
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // Group gaps by severity
  const criticalGaps = report.gaps.filter((g) => g.severity === 'critical');
  const recommendedGaps = report.gaps.filter((g) => g.severity === 'recommended');
  const optionalGaps = report.gaps.filter((g) => g.severity === 'optional');

  // Build tech stack summary
  const techStack: string[] = [];
  if (research.frontend.framework) {
    techStack.push(
      `${research.frontend.framework}${research.frontend.reactVersion ? ` ${research.frontend.reactVersion}` : ''}`
    );
  }
  if (research.frontend.metaFramework && research.frontend.metaFramework !== 'none') {
    techStack.push(
      `${research.frontend.metaFramework}${research.frontend.metaFrameworkVersion ? ` ${research.frontend.metaFrameworkVersion}` : ''}`
    );
  }
  if (research.codeQuality.hasTypeScript) {
    techStack.push(
      `TypeScript${research.codeQuality.tsVersion ? ` ${research.codeQuality.tsVersion}` : ''}`
    );
  }
  if (research.monorepo.packageManager) {
    techStack.push(research.monorepo.packageManager);
  }
  if (research.monorepo.tool) {
    techStack.push(research.monorepo.tool);
  }
  if (research.testing.hasVitest) {
    techStack.push(
      `Vitest${research.testing.vitestVersion ? ` ${research.testing.vitestVersion}` : ''}`
    );
  }
  if (research.testing.hasPlaywright) {
    techStack.push(
      `Playwright${research.testing.playwrightVersion ? ` ${research.testing.playwrightVersion}` : ''}`
    );
  }
  if (research.backend.database && research.backend.database !== 'none') {
    techStack.push(research.backend.database);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProtoLabs Report - ${research.projectName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
    }

    /* Animated SVG Score Ring */
    @keyframes scoreRingAnimation {
      from {
        stroke-dashoffset: 553.097;
      }
      to {
        stroke-dashoffset: calc(553.097 - (553.097 * ${report.overallScore} / 100));
      }
    }

    .score-ring {
      animation: scoreRingAnimation 1.5s ease-out forwards;
      stroke-dasharray: 553.097 553.097;
      stroke-dashoffset: 553.097;
    }

    /* Expandable gap sections */
    .gap-card {
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .gap-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .gap-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }

    .gap-details.expanded {
      max-height: 500px;
    }

    .expand-icon {
      transition: transform 0.3s ease;
    }

    .expand-icon.rotated {
      transform: rotate(180deg);
    }

    /* Print styles */
    @media print {
      body {
        background: white;
      }

      header {
        background: linear-gradient(to right, #2563eb, #9333ea) !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .gap-card {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .gap-details {
        max-height: none !important;
      }

      footer {
        page-break-before: avoid;
      }

      /* Hide interactive elements in print */
      .expand-icon {
        display: none;
      }
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Header -->
  <header class="text-white py-8 px-6 shadow-lg" style="background: linear-gradient(135deg, #1e293b 0%, #2563eb 50%, #9333ea 100%);">
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl md:text-4xl font-bold mb-2">ProtoLabs Standards Report</h1>
          <p class="text-blue-100 text-base md:text-lg">${research.projectName}</p>
        </div>
        <div class="text-center md:text-right">
          <div class="text-5xl font-bold">${report.overallScore}</div>
          <div class="text-sm text-blue-100">Alignment Score</div>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-6xl mx-auto px-6 py-8">
    <!-- Score Gauge -->
    <section class="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 class="text-2xl font-bold mb-4">Overall Alignment</h2>
      <div class="flex flex-col md:flex-row items-center gap-6">
        <div class="relative w-48 h-48 flex-shrink-0">
          <svg class="transform -rotate-90 w-48 h-48">
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="#e5e7eb"
              stroke-width="12"
              fill="none"
            />
            <circle
              class="score-ring"
              cx="96"
              cy="96"
              r="88"
              stroke="${report.overallScore >= 80 ? '#10b981' : report.overallScore >= 50 ? '#f59e0b' : '#ef4444'}"
              stroke-width="12"
              fill="none"
              stroke-linecap="round"
            />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="text-5xl font-bold">${report.overallScore}</div>
              <div class="text-sm text-gray-500">/ 100</div>
            </div>
          </div>
        </div>
        <div class="flex-1">
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-red-50 p-4 rounded-lg">
              <div class="text-3xl font-bold text-red-600">${report.summary.critical}</div>
              <div class="text-sm text-red-800">Critical Gaps</div>
            </div>
            <div class="bg-amber-50 p-4 rounded-lg">
              <div class="text-3xl font-bold text-amber-600">${report.summary.recommended}</div>
              <div class="text-sm text-amber-800">Recommended</div>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg">
              <div class="text-3xl font-bold text-blue-600">${report.summary.optional}</div>
              <div class="text-sm text-blue-800">Optional</div>
            </div>
            <div class="bg-green-50 p-4 rounded-lg">
              <div class="text-3xl font-bold text-green-600">${report.summary.compliant}</div>
              <div class="text-sm text-green-800">Compliant</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tech Stack Summary -->
    <section class="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 class="text-2xl font-bold mb-4">Tech Stack</h2>
      <div class="flex flex-wrap gap-2">
        ${techStack.map((tech) => `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">${tech}</span>`).join('\n        ')}
      </div>
    </section>

    <!-- Gap Analysis -->
    <section class="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 class="text-2xl font-bold mb-4">Gap Analysis</h2>

      ${
        criticalGaps.length > 0
          ? `
      <!-- Critical Gaps -->
      <div class="mb-6">
        <h3 class="text-xl font-semibold text-red-600 mb-3 flex items-center gap-2">
          <span class="inline-flex items-center justify-center bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">${criticalGaps.length}</span>
          Critical Gaps
        </h3>
        <div class="space-y-3">
          ${criticalGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-4 border-red-500 bg-red-50 p-4 rounded shadow-sm" data-gap-id="critical-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="inline-flex items-center bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold uppercase">Critical</span>
                  <span class="font-semibold text-red-900">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-red-600 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details expanded">
              <div class="text-sm text-gray-700 mt-2 pt-2 border-t border-red-200">
                <div class="mb-2">
                  <span class="font-medium text-red-900">Current:</span> ${gap.current}
                </div>
                <div class="mb-2">
                  <span class="font-medium text-red-900">Target:</span> ${gap.target}
                </div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="inline-flex items-center bg-red-200 text-red-800 px-3 py-1 rounded-full text-xs font-medium">${gap.effort} effort</span>
                  <span class="inline-flex items-center bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs">${gap.category}</span>
                </div>
              </div>
            </div>
          </div>
          `
            )
            .join('\n          ')}
        </div>
      </div>
      `
          : ''
      }

      ${
        recommendedGaps.length > 0
          ? `
      <!-- Recommended Gaps -->
      <div class="mb-6">
        <h3 class="text-xl font-semibold text-amber-600 mb-3 flex items-center gap-2">
          <span class="inline-flex items-center justify-center bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-bold">${recommendedGaps.length}</span>
          Recommended Improvements
        </h3>
        <div class="space-y-3">
          ${recommendedGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-4 border-amber-500 bg-amber-50 p-4 rounded shadow-sm" data-gap-id="recommended-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="inline-flex items-center bg-amber-500 text-white px-2 py-0.5 rounded-full text-xs font-bold uppercase">Recommended</span>
                  <span class="font-semibold text-amber-900">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-amber-600 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details">
              <div class="text-sm text-gray-700 mt-2 pt-2 border-t border-amber-200">
                <div class="mb-2">
                  <span class="font-medium text-amber-900">Current:</span> ${gap.current}
                </div>
                <div class="mb-2">
                  <span class="font-medium text-amber-900">Target:</span> ${gap.target}
                </div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="inline-flex items-center bg-amber-200 text-amber-800 px-3 py-1 rounded-full text-xs font-medium">${gap.effort} effort</span>
                  <span class="inline-flex items-center bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs">${gap.category}</span>
                </div>
              </div>
            </div>
          </div>
          `
            )
            .join('\n          ')}
        </div>
      </div>
      `
          : ''
      }

      ${
        optionalGaps.length > 0
          ? `
      <!-- Optional Gaps -->
      <div class="mb-6">
        <h3 class="text-xl font-semibold text-blue-600 mb-3 flex items-center gap-2">
          <span class="inline-flex items-center justify-center bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-bold">${optionalGaps.length}</span>
          Optional Enhancements
        </h3>
        <div class="space-y-3">
          ${optionalGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-4 border-blue-500 bg-blue-50 p-4 rounded shadow-sm" data-gap-id="optional-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="inline-flex items-center bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-bold uppercase">Optional</span>
                  <span class="font-semibold text-blue-900">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-blue-600 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details">
              <div class="text-sm text-gray-700 mt-2 pt-2 border-t border-blue-200">
                <div class="mb-2">
                  <span class="font-medium text-blue-900">Current:</span> ${gap.current}
                </div>
                <div class="mb-2">
                  <span class="font-medium text-blue-900">Target:</span> ${gap.target}
                </div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="inline-flex items-center bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">${gap.effort} effort</span>
                  <span class="inline-flex items-center bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs">${gap.category}</span>
                </div>
              </div>
            </div>
          </div>
          `
            )
            .join('\n          ')}
        </div>
      </div>
      `
          : ''
      }

      ${
        report.gaps.length === 0
          ? `
      <div class="text-center py-8 text-gray-500">
        <div class="text-6xl mb-4">🎉</div>
        <div class="text-xl font-semibold">No gaps detected!</div>
        <div class="text-sm">Your project is fully aligned with ProtoLabs standards.</div>
      </div>
      `
          : ''
      }
    </section>

    <!-- Compliance Checklist -->
    <section class="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 class="text-2xl font-bold mb-4">Compliance Checklist</h2>
      ${
        report.compliant.length > 0
          ? `
      <div class="space-y-2">
        ${report.compliant
          .map(
            (item) => `
        <div class="flex items-start gap-3 p-3 bg-green-50 rounded">
          <svg class="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <div class="flex-1">
            <div class="font-semibold text-green-900">${item.title}</div>
            <div class="text-sm text-gray-700">${item.detail}</div>
            <div class="text-xs text-gray-500 mt-1">${item.category}</div>
          </div>
        </div>
        `
          )
          .join('\n        ')}
      </div>
      `
          : `
      <div class="text-center py-8 text-gray-500">
        <div class="text-sm">No compliant items detected yet.</div>
      </div>
      `
      }
    </section>
  </main>

  <!-- Footer -->
  <footer class="bg-gray-900 text-gray-300 py-8 px-6 mt-12">
    <div class="max-w-6xl mx-auto text-center">
      <div class="text-2xl font-bold text-white mb-2">ProtoLabs</div>
      <div class="text-sm mb-4">AI-Powered Development Agency</div>
      <div class="text-xs text-gray-400">
        Generated on ${timestamp}
      </div>
    </div>
  </footer>

  <script>
    // Expandable gap sections
    document.addEventListener('DOMContentLoaded', () => {
      const gapCards = document.querySelectorAll('.gap-card');

      gapCards.forEach(card => {
        card.addEventListener('click', () => {
          const details = card.querySelector('.gap-details');
          const icon = card.querySelector('.expand-icon');

          if (details && icon) {
            details.classList.toggle('expanded');
            icon.classList.toggle('rotated');
          }
        });
      });

      console.log('ProtoLabs Report loaded - interactive features enabled');
    });
  </script>
</body>
</html>`;

  return html;
}

/**
 * Opens a file in the default browser using platform-specific commands
 */
async function openInBrowser(filePath: string): Promise<void> {
  const platform = process.platform;

  try {
    switch (platform) {
      case 'darwin': // macOS
        await execAsync(`open "${filePath}"`);
        break;
      case 'win32': // Windows
        await execAsync(`start "" "${filePath}"`);
        break;
      default: // Linux and others
        await execAsync(`xdg-open "${filePath}"`);
        break;
    }
    logger.info('Report opened in browser', { filePath, platform });
  } catch (error) {
    logger.error('Failed to open report in browser', {
      error: error instanceof Error ? error.message : String(error),
      filePath,
      platform,
    });
    // Don't throw - opening the browser is optional
  }
}

/**
 * Generate and save the HTML report to the project directory.
 * Saves to {projectPath}/protoLabs.report.html and automatically opens in browser.
 */
export async function generateAndSaveReport(options: ReportOptions): Promise<string> {
  const { projectPath } = options;
  const html = generateReport(options);
  const outputPath = path.join(projectPath, 'protoLabs.report.html');

  await fs.writeFile(outputPath, html, 'utf-8');
  logger.info('Report saved', { outputPath });

  // Auto-open in browser
  await openInBrowser(outputPath);

  return outputPath;
}

/**
 * Opens an existing report in the default browser.
 */
export async function openReport(reportPath: string): Promise<void> {
  // Verify the file exists
  try {
    await fs.access(reportPath);
  } catch {
    throw new Error(`Report file not found: ${reportPath}`);
  }

  await openInBrowser(reportPath);
}
