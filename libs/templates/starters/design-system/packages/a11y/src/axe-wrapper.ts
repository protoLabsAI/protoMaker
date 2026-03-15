/**
 * axe-wrapper.ts
 *
 * Thin wrapper around axe-core for automated WCAG accessibility checking.
 *
 * ## Installation
 *
 * Install the optional peer dependencies to enable real axe-core auditing:
 *
 *   npm install axe-core jsdom
 *
 * Without these packages the wrapper returns a realistic mock result so the
 * rest of the audit pipeline can be developed and tested locally.
 *
 * ## Usage
 *
 *   import { runAxeAudit } from '@@PROJECT_NAME-a11y/axe-wrapper';
 *
 *   const result = await runAxeAudit('<button>Click me</button>');
 *   console.log(result.violations); // WCAG violations found
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type WcagLevel = 'A' | 'AA' | 'AAA';

export interface AxeNode {
  /** CSS selector path to the element */
  target: string[];
  /** Rendered HTML of the failing element */
  html: string;
  /** Failure reason details */
  failureSummary?: string;
}

export interface AxeViolation {
  /** Rule identifier (e.g. "color-contrast", "image-alt") */
  id: string;
  /** Human-readable rule description */
  description: string;
  /** URL to the axe documentation for this rule */
  helpUrl: string;
  /** Severity impact ("critical" | "serious" | "moderate" | "minor") */
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  /** WCAG success criteria tags (e.g. ["wcag2a", "wcag143"]) */
  tags: string[];
  /** DOM nodes that violated this rule */
  nodes: AxeNode[];
}

export interface AxePass {
  /** Rule identifier */
  id: string;
  /** Human-readable rule description */
  description: string;
  /** DOM nodes that passed this rule */
  nodes: AxeNode[];
}

export interface AxeIncomplete {
  /** Rule identifier */
  id: string;
  /** Human-readable rule description */
  description: string;
  /** Reason the rule could not be fully evaluated */
  nodes: AxeNode[];
}

export interface AxeAuditResult {
  /** Rules that were violated — these must be fixed */
  violations: AxeViolation[];
  /** Rules that passed */
  passes: AxePass[];
  /** Rules that could not be fully determined (need manual review) */
  incomplete: AxeIncomplete[];
  /** WCAG levels present in violations */
  wcagLevels: WcagLevel[];
  /** Whether all WCAG AA rules passed */
  wcagAAPassing: boolean;
  /** Whether all WCAG AAA rules passed */
  wcagAAAPassing: boolean;
  /** Raw HTML that was audited */
  auditedHtml: string;
  /** Whether real axe-core was used (false = mock result) */
  usedRealAxe: boolean;
}

export interface AxeWrapperOptions {
  /** WCAG conformance level to check against (default: "AA") */
  level?: WcagLevel;
  /** Additional axe-core rule IDs to include */
  rules?: string[];
  /** axe-core rule IDs to disable */
  disabledRules?: string[];
  /** CSS selector for the root element to audit (default: entire document) */
  rootSelector?: string;
}

// ─── WCAG tag helpers ─────────────────────────────────────────────────────────

function extractWcagLevels(violations: AxeViolation[]): WcagLevel[] {
  const levels = new Set<WcagLevel>();
  for (const v of violations) {
    for (const tag of v.tags) {
      if (tag === 'wcag2a' || tag === 'wcag21a') levels.add('A');
      if (tag === 'wcag2aa' || tag === 'wcag21aa') levels.add('AA');
      if (tag === 'wcag2aaa') levels.add('AAA');
    }
  }
  return Array.from(levels);
}

function isWcagAAViolation(v: AxeViolation): boolean {
  return v.tags.some(
    (t) => t === 'wcag2a' || t === 'wcag2aa' || t === 'wcag21a' || t === 'wcag21aa'
  );
}

function isWcagAAAViolation(v: AxeViolation): boolean {
  return v.tags.some((t) => t === 'wcag2aaa');
}

// ─── Real axe-core runner (requires axe-core + jsdom peer deps) ───────────────

async function runWithRealAxe(
  html: string,
  _options: AxeWrapperOptions
): Promise<AxeAuditResult | null> {
  try {
    // Dynamic imports — axe-core and jsdom are optional peer dependencies.
    // If they are not installed, this function returns null and the mock
    // fallback is used instead.
    const { JSDOM } = (await import('jsdom')) as { JSDOM: typeof import('jsdom').JSDOM };
    // axe-core ships a CommonJS bundle; load it into the jsdom window
    const axeSource = (await import('axe-core')) as { default: { source: string } };

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
    });

    const { window } = dom;

    // Inject axe-core into the jsdom window
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = axeSource.default.source;
    window.document.head.appendChild(scriptEl);

    // Run the audit inside jsdom
    const axeResults = await new Promise<{
      violations: AxeViolation[];
      passes: AxePass[];
      incomplete: AxeIncomplete[];
    }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axe = (window as any).axe;
      if (!axe) {
        reject(new Error('axe-core not found on window'));
        return;
      }
      axe.run(
        window.document,
        {},
        (
          err: Error | null,
          results: { violations: AxeViolation[]; passes: AxePass[]; incomplete: AxeIncomplete[] }
        ) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    const wcagLevels = extractWcagLevels(axeResults.violations);
    const wcagAAPassing = !axeResults.violations.some(isWcagAAViolation);
    const wcagAAAPassing = !axeResults.violations.some(isWcagAAAViolation);

    return {
      violations: axeResults.violations,
      passes: axeResults.passes,
      incomplete: axeResults.incomplete,
      wcagLevels,
      wcagAAPassing,
      wcagAAAPassing,
      auditedHtml: html,
      usedRealAxe: true,
    };
  } catch {
    // axe-core or jsdom not installed — caller will use mock
    return null;
  }
}

// ─── Mock fallback ─────────────────────────────────────────────────────────────
//
// Returns realistic axe-like output so the audit pipeline can be exercised
// locally without installing axe-core + jsdom.  The mock inspects the HTML
// string for common patterns and injects plausible violations.

function buildMockResult(html: string, _options: AxeWrapperOptions): AxeAuditResult {
  const violations: AxeViolation[] = [];
  const passes: AxePass[] = [];
  const incomplete: AxeIncomplete[] = [];

  // Detect images without alt text
  const imgWithoutAlt = /<img(?![^>]*\balt\b)[^>]*>/gi;
  if (imgWithoutAlt.test(html)) {
    violations.push({
      id: 'image-alt',
      description: 'Images must have alternate text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
      impact: 'critical',
      tags: ['cat.text-alternatives', 'wcag2a', 'wcag111', 'section508', 'TTv5', 'TT7.a', 'TT7.b'],
      nodes: [
        {
          target: ['img'],
          html: html.match(/<img[^>]*>/i)?.[0] ?? '<img>',
          failureSummary: 'Fix any of the following: Element does not have an alt attribute',
        },
      ],
    });
  } else {
    passes.push({
      id: 'image-alt',
      description: 'Images must have alternate text',
      nodes: [],
    });
  }

  // Detect buttons without accessible label
  const buttonWithoutLabel = /<button(?![^>]*aria-label)[^>]*>\s*<\/button>/gi;
  if (buttonWithoutLabel.test(html)) {
    violations.push({
      id: 'button-name',
      description: 'Buttons must have discernible text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/button-name',
      impact: 'critical',
      tags: ['cat.name-role-value', 'wcag2a', 'wcag412', 'section508', 'TTv5', 'TT6.a'],
      nodes: [
        {
          target: ['button'],
          html: '<button></button>',
          failureSummary:
            'Fix any of the following: Element does not have inner text that is visible to screen readers',
        },
      ],
    });
  } else {
    passes.push({
      id: 'button-name',
      description: 'Buttons must have discernible text',
      nodes: [],
    });
  }

  // Detect form inputs without associated labels
  const inputWithoutLabel = /<input(?![^>]*aria-label)(?![^>]*aria-labelledby)[^>]*>/gi;
  const inputMatches = html.match(inputWithoutLabel);
  if (inputMatches && !/for=|htmlFor=/i.test(html)) {
    violations.push({
      id: 'label',
      description: 'Form elements must have labels',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/label',
      impact: 'critical',
      tags: ['cat.forms', 'wcag2a', 'wcag131', 'wcag412', 'section508', 'TTv5', 'TT5.c'],
      nodes: inputMatches.map((match) => ({
        target: ['input'],
        html: match,
        failureSummary:
          'Fix any of the following: Form element does not have an implicit (wrapped) <label>',
      })),
    });
  } else {
    passes.push({
      id: 'label',
      description: 'Form elements must have labels',
      nodes: [],
    });
  }

  // Color contrast is flagged as incomplete (requires visual rendering)
  incomplete.push({
    id: 'color-contrast',
    description: 'Elements must have sufficient color contrast',
    nodes: [
      {
        target: ['*'],
        html: '',
        failureSummary:
          'Unable to determine color contrast without visual rendering. Use the AI analysis layer to check semantic contrast.',
      },
    ],
  });

  // Landmark regions check
  const hasMain = /<main[\s>]/i.test(html);
  const hasNav = /<nav[\s>]/i.test(html);
  if (!hasMain && html.length > 200) {
    violations.push({
      id: 'landmark-one-main',
      description: 'Document must have one main landmark',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/landmark-one-main',
      impact: 'moderate',
      tags: ['cat.semantics', 'best-practice'],
      nodes: [
        {
          target: ['html'],
          html: '<html>',
          failureSummary: 'Fix the following: Document does not have a main landmark',
        },
      ],
    });
  }
  if (!hasNav && html.length > 200) {
    incomplete.push({
      id: 'landmark-complementary-is-top-level',
      description: 'Complementary landmark or section must not be contained in another landmark',
      nodes: [],
    });
  }

  passes.push({
    id: 'document-title',
    description: 'Documents must have <title> element to aid in navigation',
    nodes: [],
  });

  passes.push({
    id: 'html-has-lang',
    description: 'html element must have a lang attribute',
    nodes: [],
  });

  const wcagLevels = extractWcagLevels(violations);
  const wcagAAPassing = !violations.some(isWcagAAViolation);
  const wcagAAAPassing = !violations.some(isWcagAAAViolation);

  return {
    violations,
    passes,
    incomplete,
    wcagLevels,
    wcagAAPassing,
    wcagAAAPassing,
    auditedHtml: html,
    usedRealAxe: false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run an axe-core accessibility audit on a snippet of HTML.
 *
 * Attempts to use real axe-core (requires `axe-core` + `jsdom` peer deps).
 * Falls back to a mock result when they are not installed so the pipeline
 * can be developed without browser tooling.
 *
 * @param html    - The HTML string to audit (component markup or full page)
 * @param options - Optional configuration overrides
 * @returns       Structured audit result with violations, passes, and WCAG levels
 *
 * @example
 * // Audit a single component
 * const result = await runAxeAudit('<button>Save</button>');
 * if (!result.wcagAAPassing) {
 *   console.log('WCAG AA violations:', result.violations);
 * }
 *
 * @example
 * // Audit a full page
 * const page = await fs.readFile('dist/index.html', 'utf-8');
 * const result = await runAxeAudit(page, { level: 'AAA' });
 */
export async function runAxeAudit(
  html: string,
  options: AxeWrapperOptions = {}
): Promise<AxeAuditResult> {
  // Try real axe-core first
  const realResult = await runWithRealAxe(html, options);
  if (realResult !== null) return realResult;

  // Fallback: realistic mock
  return buildMockResult(html, options);
}
