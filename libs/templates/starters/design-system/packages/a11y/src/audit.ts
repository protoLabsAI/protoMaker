/**
 * audit.ts
 *
 * High-level accessibility audit API. Orchestrates axe-core scanning
 * and produces structured WCAG compliance reports for individual components
 * or full HTML pages.
 *
 * ## Usage
 *
 *   import { auditComponent, auditPage } from '@@PROJECT_NAME-a11y';
 *
 *   // Audit a single component
 *   const report = await auditComponent('<button>Click me</button>');
 *   console.log(report.summary);
 *
 *   // Audit a full page
 *   const html = await fs.readFile('dist/index.html', 'utf-8');
 *   const pageReport = await auditPage(html, { wcagLevel: 'AA' });
 */

import { runAxeAudit } from './axe-wrapper.js';
import type { AxeViolation, AxePass, AxeIncomplete, WcagLevel } from './axe-wrapper.js';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { AxeViolation, AxePass, AxeIncomplete, WcagLevel } from './axe-wrapper.js';
export { runAxeAudit } from './axe-wrapper.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditScope = 'component' | 'page';

export interface AuditOptions {
  /** WCAG conformance level to check against (default: "AA") */
  wcagLevel?: WcagLevel;
  /** CSS selector for the root element to audit */
  rootSelector?: string;
  /** axe-core rule IDs to disable */
  disabledRules?: string[];
}

export interface ViolationSummary {
  /** Rule identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Severity impact */
  impact: AxeViolation['impact'];
  /** Number of affected nodes */
  nodeCount: number;
  /** WCAG success criterion tags */
  wcagTags: string[];
  /** Link to documentation */
  helpUrl: string;
}

export interface AuditSummary {
  /** Number of rules that passed */
  passingRules: number;
  /** Number of rules that were violated */
  failingRules: number;
  /** Number of rules that could not be determined */
  incompleteRules: number;
  /** Total elements with violations */
  affectedElements: number;
  /** WCAG levels found in violations */
  wcagLevels: WcagLevel[];
  /** Whether all WCAG A + AA rules pass */
  wcagAAPassing: boolean;
  /** Whether all WCAG A + AA + AAA rules pass */
  wcagAAAPassing: boolean;
  /** Overall compliance grade */
  grade: 'pass' | 'warn' | 'fail';
}

export interface AuditReport {
  /** Whether this audited a component or a full page */
  scope: AuditScope;
  /** ISO timestamp of the audit */
  timestamp: string;
  /** High-level summary metrics */
  summary: AuditSummary;
  /** Ordered list of violations (critical first) */
  violations: ViolationSummary[];
  /** Rules that passed */
  passes: AxePass[];
  /** Rules that could not be fully determined */
  incomplete: AxeIncomplete[];
  /** Whether real axe-core was used (false = mock result) */
  usedRealAxe: boolean;
  /** The raw HTML that was audited */
  auditedHtml: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<AxeViolation['impact'], number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function toViolationSummary(v: AxeViolation): ViolationSummary {
  return {
    id: v.id,
    description: v.description,
    impact: v.impact,
    nodeCount: v.nodes.length,
    wcagTags: v.tags.filter((t) => t.startsWith('wcag')),
    helpUrl: v.helpUrl,
  };
}

function computeGrade(summary: Omit<AuditSummary, 'grade'>): AuditSummary['grade'] {
  if (!summary.wcagAAPassing) return 'fail';
  if (summary.incompleteRules > 0) return 'warn';
  return 'pass';
}

function wrapInDocument(html: string): string {
  // If already a full HTML document, return as-is
  if (/^\s*<!doctype\s+html/i.test(html) || /^\s*<html/i.test(html)) {
    return html;
  }
  // Wrap component HTML in a minimal document
  return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Component audit</title></head>
  <body>${html}</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Audit a single component's HTML for accessibility issues.
 *
 * The HTML is wrapped in a minimal document before auditing so axe-core
 * has the full DOM context it needs. Use `auditPage` when you have a
 * complete HTML document.
 *
 * @param html    - Component HTML markup (e.g. the rendered output of a Button)
 * @param options - Audit configuration
 * @returns       Structured audit report with violations and WCAG compliance status
 *
 * @example
 * const report = await auditComponent('<button>Save changes</button>');
 * if (report.summary.grade === 'fail') {
 *   report.violations.forEach(v => console.error(`[${v.impact}] ${v.id}: ${v.description}`));
 * }
 */
export async function auditComponent(
  html: string,
  options: AuditOptions = {}
): Promise<AuditReport> {
  const wrapped = wrapInDocument(html);
  const axeResult = await runAxeAudit(wrapped, {
    level: options.wcagLevel ?? 'AA',
    rootSelector: options.rootSelector,
    disabledRules: options.disabledRules,
  });

  const violations = axeResult.violations
    .sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact])
    .map(toViolationSummary);

  const affectedElements = violations.reduce((sum, v) => sum + v.nodeCount, 0);

  const summaryBase = {
    passingRules: axeResult.passes.length,
    failingRules: violations.length,
    incompleteRules: axeResult.incomplete.length,
    affectedElements,
    wcagLevels: axeResult.wcagLevels,
    wcagAAPassing: axeResult.wcagAAPassing,
    wcagAAAPassing: axeResult.wcagAAAPassing,
  };

  const summary: AuditSummary = {
    ...summaryBase,
    grade: computeGrade(summaryBase),
  };

  return {
    scope: 'component',
    timestamp: new Date().toISOString(),
    summary,
    violations,
    passes: axeResult.passes,
    incomplete: axeResult.incomplete,
    usedRealAxe: axeResult.usedRealAxe,
    auditedHtml: html,
  };
}

/**
 * Audit a full HTML page for accessibility issues.
 *
 * Expects a complete HTML document (with `<html>`, `<head>`, and `<body>`).
 * For component-level auditing use `auditComponent` instead.
 *
 * @param html    - Full HTML page source
 * @param options - Audit configuration
 * @returns       Structured audit report with violations and WCAG compliance status
 *
 * @example
 * const html = await fs.readFile('dist/index.html', 'utf-8');
 * const report = await auditPage(html, { wcagLevel: 'AAA' });
 * console.log(`Grade: ${report.summary.grade}, Failures: ${report.summary.failingRules}`);
 */
export async function auditPage(html: string, options: AuditOptions = {}): Promise<AuditReport> {
  const axeResult = await runAxeAudit(html, {
    level: options.wcagLevel ?? 'AA',
    rootSelector: options.rootSelector,
    disabledRules: options.disabledRules,
  });

  const violations = axeResult.violations
    .sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact])
    .map(toViolationSummary);

  const affectedElements = violations.reduce((sum, v) => sum + v.nodeCount, 0);

  const summaryBase = {
    passingRules: axeResult.passes.length,
    failingRules: violations.length,
    incompleteRules: axeResult.incomplete.length,
    affectedElements,
    wcagLevels: axeResult.wcagLevels,
    wcagAAPassing: axeResult.wcagAAPassing,
    wcagAAAPassing: axeResult.wcagAAAPassing,
  };

  const summary: AuditSummary = {
    ...summaryBase,
    grade: computeGrade(summaryBase),
  };

  return {
    scope: 'page',
    timestamp: new Date().toISOString(),
    summary,
    violations,
    passes: axeResult.passes,
    incomplete: axeResult.incomplete,
    usedRealAxe: axeResult.usedRealAxe,
    auditedHtml: html,
  };
}
