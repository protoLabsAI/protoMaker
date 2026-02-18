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

  const scoreColor =
    report.overallScore >= 80 ? '#4ade80' : report.overallScore >= 50 ? '#facc15' : '#f87171';

  const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>protoLabs Report — ${research.projectName}</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#9670;</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'system-ui', 'sans-serif'],
            mono: ['Geist Mono', 'monospace'],
          },
          colors: {
            surface: { 0: '#09090b', 1: '#111113', 2: '#18181b', 3: '#222225' },
            accent: { DEFAULT: '#a78bfa', dim: '#7c5cbf' },
            muted: '#71717a',
          },
        },
      },
    };
  </script>
  <style>
    html { scroll-behavior: smooth; }
    body {
      background-color: #09090b;
      color: #fafafa;
      font-family: 'Geist', system-ui, sans-serif;
    }
    a:focus-visible, button:focus-visible {
      outline: 2px solid #a78bfa;
      outline-offset: 2px;
    }

    /* Animated SVG Score Ring */
    @keyframes scoreRingAnimation {
      from { stroke-dashoffset: 553.097; }
      to { stroke-dashoffset: calc(553.097 - (553.097 * ${report.overallScore} / 100)); }
    }
    .score-ring {
      animation: scoreRingAnimation 1.5s ease-out forwards;
      stroke-dasharray: 553.097 553.097;
      stroke-dashoffset: 553.097;
    }

    /* Expandable gap sections */
    .gap-card { cursor: pointer; transition: all 0.2s ease; }
    .gap-card:hover { transform: translateY(-1px); box-shadow: 0 0 40px rgba(167, 139, 250, 0.06); }
    .gap-details { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
    .gap-details.expanded { max-height: 500px; }
    .expand-icon { transition: transform 0.3s ease; }
    .expand-icon.rotated { transform: rotate(180deg); }

    /* Badges */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge-red { background: rgba(248, 113, 113, 0.15); color: #f87171; }
    .badge-amber { background: rgba(250, 204, 21, 0.15); color: #facc15; }
    .badge-blue { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
    .badge-green { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
    .badge-purple { background: rgba(167, 139, 250, 0.15); color: #a78bfa; }

    /* Glow */
    .glow { box-shadow: 0 0 80px rgba(167, 139, 250, 0.08); }

    /* Scroll-triggered fade-in */
    .fade-section { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease-out, transform 0.7s ease-out; }
    .fade-section.visible { opacity: 1; transform: translateY(0); }

    /* Hero animation */
    @keyframes fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-up { animation: fade-up 0.8s ease-out forwards; }
    .animate-delay-1 { animation-delay: 0.15s; opacity: 0; }
    .animate-delay-2 { animation-delay: 0.3s; opacity: 0; }

    /* Print styles */
    @media print {
      body { background: #09090b; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .gap-card { page-break-inside: avoid; break-inside: avoid; }
      .gap-details { max-height: none !important; }
      .expand-icon { display: none; }
      .fade-section { opacity: 1 !important; transform: none !important; }
    }
  </style>
</head>
<body class="min-h-screen antialiased">

  <!-- Header -->
  <header class="border-b border-white/5">
    <div class="max-w-5xl mx-auto px-6 py-10 md:py-14">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div class="animate-fade-up">
          <div class="flex items-center gap-2 text-sm text-zinc-500 mb-3">
            <span class="text-accent text-lg">&#9670;</span>
            <span>proto<span class="text-zinc-300">Labs</span></span>
            <span class="text-zinc-700">&middot;</span>
            <span>setupLab Report</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-bold text-white">${research.projectName}</h1>
        </div>
        <div class="text-center md:text-right animate-fade-up animate-delay-1">
          <div class="text-5xl font-bold font-mono" style="color: ${scoreColor}">${report.overallScore}</div>
          <div class="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-mono">Alignment Score</div>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-5xl mx-auto px-6 py-10">

    <!-- Score Gauge -->
    <section class="rounded-xl border border-white/5 bg-surface-1/50 p-6 md:p-8 mb-8 glow fade-section">
      <p class="text-accent text-sm font-mono uppercase tracking-widest mb-6">Overall Alignment</p>
      <div class="flex flex-col md:flex-row items-center gap-8">
        <div class="relative w-48 h-48 flex-shrink-0">
          <svg class="transform -rotate-90 w-48 h-48">
            <circle cx="96" cy="96" r="88" stroke="#222225" stroke-width="12" fill="none" />
            <circle class="score-ring" cx="96" cy="96" r="88" stroke="${scoreColor}" stroke-width="12" fill="none" stroke-linecap="round" />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="text-5xl font-bold font-mono text-white">${report.overallScore}</div>
              <div class="text-sm text-zinc-500">/ 100</div>
            </div>
          </div>
        </div>
        <div class="flex-1 w-full">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-white/5 p-4" style="background: rgba(248, 113, 113, 0.06)">
              <div class="text-3xl font-bold font-mono text-red-400">${report.summary.critical}</div>
              <div class="text-xs text-zinc-500 mt-1">Critical Gaps</div>
            </div>
            <div class="rounded-lg border border-white/5 p-4" style="background: rgba(250, 204, 21, 0.06)">
              <div class="text-3xl font-bold font-mono text-yellow-400">${report.summary.recommended}</div>
              <div class="text-xs text-zinc-500 mt-1">Recommended</div>
            </div>
            <div class="rounded-lg border border-white/5 p-4" style="background: rgba(96, 165, 250, 0.06)">
              <div class="text-3xl font-bold font-mono text-blue-400">${report.summary.optional}</div>
              <div class="text-xs text-zinc-500 mt-1">Optional</div>
            </div>
            <div class="rounded-lg border border-white/5 p-4" style="background: rgba(74, 222, 128, 0.06)">
              <div class="text-3xl font-bold font-mono text-green-400">${report.summary.compliant}</div>
              <div class="text-xs text-zinc-500 mt-1">Compliant</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tech Stack Summary -->
    <section class="rounded-xl border border-white/5 bg-surface-1/50 p-6 md:p-8 mb-8 fade-section">
      <p class="text-accent text-sm font-mono uppercase tracking-widest mb-4">Detected Stack</p>
      <div class="flex flex-wrap gap-2">
        ${techStack.map((tech) => `<span class="badge badge-purple">${tech}</span>`).join('\n        ')}
      </div>
    </section>

    <!-- Gap Analysis -->
    <section class="rounded-xl border border-white/5 bg-surface-1/50 p-6 md:p-8 mb-8 fade-section">
      <p class="text-accent text-sm font-mono uppercase tracking-widest mb-6">Gap Analysis</p>

      ${
        criticalGaps.length > 0
          ? `
      <!-- Critical Gaps -->
      <div class="mb-8">
        <h3 class="text-base font-semibold text-red-400 mb-3 flex items-center gap-2">
          <span class="badge badge-red">${criticalGaps.length}</span>
          Critical Gaps
        </h3>
        <div class="space-y-3">
          ${criticalGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-2 border-red-500/60 rounded-lg p-4" style="background: rgba(248, 113, 113, 0.04)" data-gap-id="critical-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="badge badge-red">Critical</span>
                  <span class="font-medium text-zinc-200">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-zinc-500 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details expanded">
              <div class="text-sm mt-3 pt-3 border-t border-white/5 space-y-2">
                <div><span class="text-zinc-500">Current:</span> <span class="text-zinc-300">${gap.current}</span></div>
                <div><span class="text-zinc-500">Target:</span> <span class="text-zinc-300">${gap.target}</span></div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="badge badge-red">${gap.effort} effort</span>
                  <span class="badge" style="background: rgba(255,255,255,0.05); color: #71717a">${gap.category}</span>
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
      <div class="mb-8">
        <h3 class="text-base font-semibold text-yellow-400 mb-3 flex items-center gap-2">
          <span class="badge badge-amber">${recommendedGaps.length}</span>
          Recommended Improvements
        </h3>
        <div class="space-y-3">
          ${recommendedGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-2 border-yellow-500/60 rounded-lg p-4" style="background: rgba(250, 204, 21, 0.04)" data-gap-id="recommended-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="badge badge-amber">Recommended</span>
                  <span class="font-medium text-zinc-200">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-zinc-500 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details">
              <div class="text-sm mt-3 pt-3 border-t border-white/5 space-y-2">
                <div><span class="text-zinc-500">Current:</span> <span class="text-zinc-300">${gap.current}</span></div>
                <div><span class="text-zinc-500">Target:</span> <span class="text-zinc-300">${gap.target}</span></div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="badge badge-amber">${gap.effort} effort</span>
                  <span class="badge" style="background: rgba(255,255,255,0.05); color: #71717a">${gap.category}</span>
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
      <div class="mb-8">
        <h3 class="text-base font-semibold text-blue-400 mb-3 flex items-center gap-2">
          <span class="badge badge-blue">${optionalGaps.length}</span>
          Optional Enhancements
        </h3>
        <div class="space-y-3">
          ${optionalGaps
            .map(
              (gap, index) => `
          <div class="gap-card border-l-2 border-blue-500/60 rounded-lg p-4" style="background: rgba(96, 165, 250, 0.04)" data-gap-id="optional-${index}">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="badge badge-blue">Optional</span>
                  <span class="font-medium text-zinc-200">${gap.title}</span>
                </div>
              </div>
              <svg class="expand-icon w-5 h-5 text-zinc-500 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="gap-details">
              <div class="text-sm mt-3 pt-3 border-t border-white/5 space-y-2">
                <div><span class="text-zinc-500">Current:</span> <span class="text-zinc-300">${gap.current}</span></div>
                <div><span class="text-zinc-500">Target:</span> <span class="text-zinc-300">${gap.target}</span></div>
                <div class="flex flex-wrap gap-2 mt-3">
                  <span class="badge badge-blue">${gap.effort} effort</span>
                  <span class="badge" style="background: rgba(255,255,255,0.05); color: #71717a">${gap.category}</span>
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
      <div class="text-center py-12">
        <div class="text-5xl mb-4">&#9670;</div>
        <div class="text-xl font-semibold text-white">Fully aligned</div>
        <div class="text-sm text-zinc-500 mt-2">No gaps detected. Your project meets protoLabs standards.</div>
      </div>
      `
          : ''
      }
    </section>

    <!-- Compliance Checklist -->
    <section class="rounded-xl border border-white/5 bg-surface-1/50 p-6 md:p-8 mb-8 fade-section">
      <p class="text-accent text-sm font-mono uppercase tracking-widest mb-6">Compliance Checklist</p>
      ${
        report.compliant.length > 0
          ? `
      <div class="space-y-2">
        ${report.compliant
          .map(
            (item) => `
        <div class="flex items-start gap-3 p-3 rounded-lg" style="background: rgba(74, 222, 128, 0.04)">
          <div class="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 mt-0.5" style="background: rgba(74, 222, 128, 0.15); color: #4ade80; font-size: 10px;">&#10003;</div>
          <div class="flex-1">
            <div class="font-medium text-zinc-200 text-sm">${item.title}</div>
            <div class="text-sm text-zinc-500 mt-0.5">${item.detail}</div>
            <div class="text-xs text-zinc-600 mt-1">${item.category}</div>
          </div>
        </div>
        `
          )
          .join('\n        ')}
      </div>
      `
          : `
      <div class="text-center py-8 text-zinc-500">
        <div class="text-sm">No compliant items detected yet.</div>
      </div>
      `
      }
    </section>
  </main>

  <!-- Footer -->
  <footer class="border-t border-white/5">
    <div class="max-w-5xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2 text-sm text-zinc-500">
        <span class="text-accent">&#9670;</span>
        <span>proto<span class="text-zinc-400">Labs</span></span>
        <span class="text-zinc-700">&middot;</span>
        <span>AI-native development agency</span>
      </div>
      <div class="text-xs text-zinc-600">
        Generated on ${timestamp}
      </div>
    </div>
  </footer>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Expandable gap sections
      document.querySelectorAll('.gap-card').forEach(card => {
        card.addEventListener('click', () => {
          const details = card.querySelector('.gap-details');
          const icon = card.querySelector('.expand-icon');
          if (details && icon) {
            details.classList.toggle('expanded');
            icon.classList.toggle('rotated');
          }
        });
      });

      // Scroll-triggered fade-in
      const sections = document.querySelectorAll('.fade-section');
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
        sections.forEach(s => observer.observe(s));
      } else {
        sections.forEach(s => s.classList.add('visible'));
      }
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
