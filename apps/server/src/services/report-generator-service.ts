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
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Header -->
  <header class="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-8 px-6 shadow-lg">
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-4xl font-bold mb-2">ProtoLabs Standards Report</h1>
          <p class="text-blue-100 text-lg">${research.projectName}</p>
        </div>
        <div class="text-right">
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
      <div class="flex items-center gap-6">
        <div class="relative w-48 h-48">
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
              cx="96"
              cy="96"
              r="88"
              stroke="${report.overallScore >= 80 ? '#10b981' : report.overallScore >= 50 ? '#f59e0b' : '#ef4444'}"
              stroke-width="12"
              fill="none"
              stroke-dasharray="${(report.overallScore / 100) * 553.097} 553.097"
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
          <span class="bg-red-100 text-red-600 px-2 py-1 rounded text-sm">${criticalGaps.length}</span>
          Critical Gaps
        </h3>
        <div class="space-y-3">
          ${criticalGaps
            .map(
              (gap) => `
          <div class="border-l-4 border-red-500 bg-red-50 p-4 rounded">
            <div class="font-semibold text-red-900">${gap.title}</div>
            <div class="text-sm text-gray-700 mt-1">
              <span class="font-medium">Current:</span> ${gap.current}
            </div>
            <div class="text-sm text-gray-700">
              <span class="font-medium">Target:</span> ${gap.target}
            </div>
            <div class="text-xs text-gray-600 mt-2">
              <span class="bg-red-200 text-red-800 px-2 py-1 rounded">${gap.effort} effort</span>
              <span class="ml-2 text-gray-500">${gap.category}</span>
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
          <span class="bg-amber-100 text-amber-600 px-2 py-1 rounded text-sm">${recommendedGaps.length}</span>
          Recommended Improvements
        </h3>
        <div class="space-y-3">
          ${recommendedGaps
            .map(
              (gap) => `
          <div class="border-l-4 border-amber-500 bg-amber-50 p-4 rounded">
            <div class="font-semibold text-amber-900">${gap.title}</div>
            <div class="text-sm text-gray-700 mt-1">
              <span class="font-medium">Current:</span> ${gap.current}
            </div>
            <div class="text-sm text-gray-700">
              <span class="font-medium">Target:</span> ${gap.target}
            </div>
            <div class="text-xs text-gray-600 mt-2">
              <span class="bg-amber-200 text-amber-800 px-2 py-1 rounded">${gap.effort} effort</span>
              <span class="ml-2 text-gray-500">${gap.category}</span>
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
          <span class="bg-blue-100 text-blue-600 px-2 py-1 rounded text-sm">${optionalGaps.length}</span>
          Optional Enhancements
        </h3>
        <div class="space-y-3">
          ${optionalGaps
            .map(
              (gap) => `
          <div class="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
            <div class="font-semibold text-blue-900">${gap.title}</div>
            <div class="text-sm text-gray-700 mt-1">
              <span class="font-medium">Current:</span> ${gap.current}
            </div>
            <div class="text-sm text-gray-700">
              <span class="font-medium">Target:</span> ${gap.target}
            </div>
            <div class="text-xs text-gray-600 mt-2">
              <span class="bg-blue-200 text-blue-800 px-2 py-1 rounded">${gap.effort} effort</span>
              <span class="ml-2 text-gray-500">${gap.category}</span>
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
  <footer class="bg-gray-800 text-gray-300 py-8 px-6 mt-12">
    <div class="max-w-6xl mx-auto text-center">
      <div class="text-2xl font-bold text-white mb-2">ProtoLabs</div>
      <div class="text-sm mb-4">AI-Powered Development Agency</div>
      <div class="text-xs text-gray-400">
        Generated on ${timestamp}
      </div>
    </div>
  </footer>

  <script>
    // Add interactivity for collapsible sections if needed
    document.addEventListener('DOMContentLoaded', () => {
      console.log('ProtoLabs Report loaded');
    });
  </script>
</body>
</html>`;

  return html;
}

/**
 * Generate and save the HTML report to the project directory.
 * Saves to {projectPath}/protoLabs.report.html
 */
export async function generateAndSaveReport(options: ReportOptions): Promise<string> {
  const { projectPath } = options;
  const html = generateReport(options);
  const outputPath = path.join(projectPath, 'protoLabs.report.html');

  await fs.writeFile(outputPath, html, 'utf-8');
  logger.info('Report saved', { outputPath });

  return outputPath;
}
