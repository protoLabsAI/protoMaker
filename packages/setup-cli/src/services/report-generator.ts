/**
 * report-generator
 *
 * Generates a self-contained HTML gap analysis report from a GapAnalysisReport.
 * No server or API key required. All styles are inlined.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { GapAnalysisReport } from 'create-protolab';

type GapItem = GapAnalysisReport['gaps'][number];

export interface HtmlReportOptions {
  /** Output directory for the report (defaults to projectPath/.automaker/) */
  outputDir?: string;
  /** Report filename (defaults to gap-report.html) */
  filename?: string;
}

function severityBadge(severity: GapItem['severity']): string {
  const map: Record<string, string> = {
    critical: 'badge-critical',
    recommended: 'badge-recommended',
    optional: 'badge-optional',
  };
  return `<span class="badge ${map[severity] ?? 'badge-optional'}">${severity}</span>`;
}

function effortBadge(effort: GapItem['effort']): string {
  return `<span class="badge badge-effort">${effort} effort</span>`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Needs Work';
  return 'Critical';
}

function renderGapRows(gaps: GapItem[]): string {
  if (gaps.length === 0) {
    return `<tr><td colspan="5" class="empty">No gaps in this category</td></tr>`;
  }
  return gaps
    .map(
      (g) => `
    <tr>
      <td>${g.title}</td>
      <td>${severityBadge(g.severity)}</td>
      <td class="dim">${g.current}</td>
      <td class="dim">${g.target}</td>
      <td>${effortBadge(g.effort)}</td>
    </tr>`
    )
    .join('');
}

function renderCompliantRows(items: GapAnalysisReport['compliant']): string {
  if (items.length === 0) return `<tr><td colspan="2" class="empty">No compliant items</td></tr>`;
  return items
    .map(
      (c) => `
    <tr>
      <td><span class="check">&#10003;</span> ${c.title}</td>
      <td class="dim">${c.detail}</td>
    </tr>`
    )
    .join('');
}

/** Generate a fully self-contained HTML report string */
export function buildHtmlReport(report: GapAnalysisReport): string {
  const critical = report.gaps.filter((g) => g.severity === 'critical');
  const recommended = report.gaps.filter((g) => g.severity === 'recommended');
  const optional = report.gaps.filter((g) => g.severity === 'optional');
  const color = scoreColor(report.overallScore);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProtoLabs Gap Report — ${report.projectPath}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f11; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid #1e293b; flex-wrap: wrap; gap: 1rem; }
    .brand { font-size: 1.1rem; font-weight: 700; color: #6ee7f7; letter-spacing: -0.02em; }
    .brand span { color: #94a3b8; font-weight: 400; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
    .meta { font-size: 0.8rem; color: #64748b; margin-top: 0.25rem; }
    .score-ring { text-align: center; }
    .score-value { font-size: 3rem; font-weight: 800; color: ${color}; line-height: 1; }
    .score-label { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
    .stat { background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; text-align: center; }
    .stat-number { font-size: 2rem; font-weight: 700; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .stat-critical .stat-number { color: #ef4444; }
    .stat-recommended .stat-number { color: #f59e0b; }
    .stat-optional .stat-number { color: #94a3b8; }
    .stat-compliant .stat-number { color: #22c55e; }
    section { margin-bottom: 2.5rem; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #f1f5f9; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .table-wrap { overflow-x: auto; border-radius: 0.75rem; border: 1px solid #1e293b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #1e293b; padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
    td { padding: 0.75rem 1rem; border-top: 1px solid #1e293b; vertical-align: top; }
    tr:hover td { background: #1a2233; }
    .dim { color: #94a3b8; font-size: 0.8rem; }
    .empty { color: #475569; text-align: center; padding: 1.5rem; }
    .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 99px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    .badge-critical { background: #450a0a; color: #ef4444; border: 1px solid #7f1d1d; }
    .badge-recommended { background: #451a03; color: #f59e0b; border: 1px solid #78350f; }
    .badge-optional { background: #0f172a; color: #94a3b8; border: 1px solid #334155; }
    .badge-effort { background: #0f172a; color: #6ee7f7; border: 1px solid #164e63; }
    .check { color: #22c55e; font-weight: 700; }
    footer { text-align: center; font-size: 0.75rem; color: #334155; padding-top: 2rem; border-top: 1px solid #1e293b; margin-top: 3rem; }
    footer a { color: #6ee7f7; text-decoration: none; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <div class="brand">proto<span>Labs</span> / Gap Report</div>
      <h1>${path.basename(report.projectPath)}</h1>
      <div class="meta">${report.projectPath} &nbsp;·&nbsp; ${new Date(report.analyzedAt).toLocaleString()}</div>
    </div>
    <div class="score-ring">
      <div class="score-value" style="color:${color}">${report.overallScore}%</div>
      <div class="score-label">${scoreLabel(report.overallScore)}</div>
    </div>
  </header>

  <div class="stats">
    <div class="stat stat-critical">
      <div class="stat-number">${report.summary.critical}</div>
      <div class="stat-label">Critical Gaps</div>
    </div>
    <div class="stat stat-recommended">
      <div class="stat-number">${report.summary.recommended}</div>
      <div class="stat-label">Recommended</div>
    </div>
    <div class="stat stat-optional">
      <div class="stat-number">${report.summary.optional}</div>
      <div class="stat-label">Optional</div>
    </div>
    <div class="stat stat-compliant">
      <div class="stat-number">${report.summary.compliant}</div>
      <div class="stat-label">Compliant</div>
    </div>
  </div>

  ${
    critical.length > 0
      ? `<section>
    <h2><span style="color:#ef4444">&#9679;</span> Critical Gaps</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Issue</th><th>Severity</th><th>Current</th><th>Target</th><th>Effort</th></tr></thead>
        <tbody>${renderGapRows(critical)}</tbody>
      </table>
    </div>
  </section>`
      : ''
  }

  ${
    recommended.length > 0
      ? `<section>
    <h2><span style="color:#f59e0b">&#9679;</span> Recommended</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Issue</th><th>Severity</th><th>Current</th><th>Target</th><th>Effort</th></tr></thead>
        <tbody>${renderGapRows(recommended)}</tbody>
      </table>
    </div>
  </section>`
      : ''
  }

  ${
    optional.length > 0
      ? `<section>
    <h2><span style="color:#64748b">&#9679;</span> Optional</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Issue</th><th>Severity</th><th>Current</th><th>Target</th><th>Effort</th></tr></thead>
        <tbody>${renderGapRows(optional)}</tbody>
      </table>
    </div>
  </section>`
      : ''
  }

  ${
    report.compliant.length > 0
      ? `<section>
    <h2><span style="color:#22c55e">&#10003;</span> Already Compliant</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Detail</th></tr></thead>
        <tbody>${renderCompliantRows(report.compliant)}</tbody>
      </table>
    </div>
  </section>`
      : ''
  }

  <footer>
    Generated by <a href="https://protolabs.studio" target="_blank">ProtoLabs</a> &nbsp;·&nbsp;
    <a href="https://protolabs.studio/docs" target="_blank">Documentation</a>
  </footer>
</div>
</body>
</html>`;
}

/** Generate and write the HTML report. Returns the output file path. */
export async function generateHtmlReport(
  report: GapAnalysisReport,
  projectPath: string,
  options: HtmlReportOptions = {}
): Promise<string> {
  const outputDir = options.outputDir ?? path.join(projectPath, '.automaker');
  const filename = options.filename ?? 'gap-report.html';
  const outputPath = path.join(outputDir, filename);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, buildHtmlReport(report), 'utf-8');

  return outputPath;
}
