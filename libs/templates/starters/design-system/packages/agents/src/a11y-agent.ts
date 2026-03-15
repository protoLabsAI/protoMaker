/**
 * A11y Agent
 *
 * An AI agent that audits components and pages for accessibility issues.
 * Wraps axe-core for automated WCAG checking, then adds an AI analysis
 * layer to catch semantic issues that automated tools cannot detect:
 *
 *   - Context-dependent alt text quality
 *   - Meaningful link text evaluation
 *   - Logical tab order assessment
 *   - Heading hierarchy validation
 *   - ARIA correctness beyond basic validity
 *
 * For each violation found it generates remediation code with before/after
 * examples and WCAG criterion references.
 *
 * ## Usage
 *
 *   const agent = createA11yAgent();
 *   const result = await agent.run('<button>Submit</button>', { scope: 'component' });
 *   console.log(result.report);
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditScope = 'component' | 'page';
export type WcagLevel = 'A' | 'AA' | 'AAA';
export type ComplianceGrade = 'pass' | 'warn' | 'fail';

export interface A11yAgentConfig {
  /** Anthropic model to use (default: "claude-opus-4-6") */
  model?: string;
  /** Maximum agentic loop iterations (default: 8) */
  maxIterations?: number;
  /** Anthropic API key (default: ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** WCAG conformance level (default: "AA") */
  wcagLevel?: WcagLevel;
}

export interface SemanticIssue {
  /** Issue category */
  category:
    | 'alt-text'
    | 'link-text'
    | 'tab-order'
    | 'heading-hierarchy'
    | 'form-relationship'
    | 'color-contrast'
    | 'aria-usage'
    | 'other';
  /** Severity relative to WCAG */
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Human-readable description of the issue */
  description: string;
  /** The element or pattern that was flagged */
  element: string;
  /** WCAG success criterion referenced */
  wcagCriterion?: string;
}

export interface RemediationSuggestion {
  /** ID of the violation being remediated */
  violationId: string;
  /** Original (broken) HTML */
  before: string;
  /** Fixed, accessible HTML */
  after: string;
  /** Explanation of changes and WCAG criterion addressed */
  explanation: string;
  /** How to verify the fix works */
  verificationHint: string;
}

export interface A11yAgentResult {
  /** The agent's final narrative report */
  report: string;
  /** WCAG compliance grade */
  grade: ComplianceGrade;
  /** Whether WCAG AA requirements pass */
  wcagAAPassing: boolean;
  /** Whether WCAG AAA requirements pass */
  wcagAAAPassing: boolean;
  /** Automated violations found by axe-core */
  automatedViolations: AutomatedViolation[];
  /** Semantic issues found by AI analysis */
  semanticIssues: SemanticIssue[];
  /** Remediation suggestions with code examples */
  remediations: RemediationSuggestion[];
  /** Number of agentic loop iterations used */
  iterations: number;
}

export interface AutomatedViolation {
  id: string;
  description: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  nodeCount: number;
  wcagTags: string[];
  helpUrl: string;
}

// ─── Inline axe-audit mock ────────────────────────────────────────────────────
//
// The agents package depends only on @anthropic-ai/sdk and does not import
// sibling packages (@@PROJECT_NAME-a11y) at the module level. Instead it
// tries a dynamic import at runtime and falls back to this mock so the
// package compiles and runs standalone.

interface InlineViolation {
  id: string;
  description: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  nodeCount: number;
  wcagTags: string[];
  helpUrl: string;
}

interface InlineAuditReport {
  grade: 'pass' | 'warn' | 'fail';
  wcagAAPassing: boolean;
  wcagAAAPassing: boolean;
  wcagLevels: WcagLevel[];
  passingRules: number;
  failingRules: number;
  incompleteRules: number;
  affectedElements: number;
  violations: InlineViolation[];
  incompleteChecks: Array<{ id: string; description: string }>;
  usedRealAxe: boolean;
}

async function runInlineAxeAudit(
  html: string,
  scope: AuditScope,
  wcagLevel: WcagLevel
): Promise<InlineAuditReport> {
  // Attempt to use the real @@PROJECT_NAME-a11y package at runtime.
  // The package name is a template placeholder — use a string variable so
  // TypeScript does not attempt to statically resolve it at compile time.
  try {
    const a11yPkgName: string = '@@PROJECT_NAME-a11y';
    const pkg = (await import(a11yPkgName)) as {
      auditComponent: (
        html: string,
        opts: { wcagLevel: WcagLevel }
      ) => Promise<{
        summary: {
          grade: 'pass' | 'warn' | 'fail';
          wcagAAPassing: boolean;
          wcagAAAPassing: boolean;
          wcagLevels: WcagLevel[];
          passingRules: number;
          failingRules: number;
          incompleteRules: number;
          affectedElements: number;
        };
        violations: InlineViolation[];
        incomplete: Array<{ id: string; description: string }>;
        usedRealAxe: boolean;
      }>;
      auditPage: (
        html: string,
        opts: { wcagLevel: WcagLevel }
      ) => Promise<{
        summary: {
          grade: 'pass' | 'warn' | 'fail';
          wcagAAPassing: boolean;
          wcagAAAPassing: boolean;
          wcagLevels: WcagLevel[];
          passingRules: number;
          failingRules: number;
          incompleteRules: number;
          affectedElements: number;
        };
        violations: InlineViolation[];
        incomplete: Array<{ id: string; description: string }>;
        usedRealAxe: boolean;
      }>;
    };
    const report =
      scope === 'page'
        ? await pkg.auditPage(html, { wcagLevel })
        : await pkg.auditComponent(html, { wcagLevel });
    return {
      grade: report.summary.grade,
      wcagAAPassing: report.summary.wcagAAPassing,
      wcagAAAPassing: report.summary.wcagAAAPassing,
      wcagLevels: report.summary.wcagLevels,
      passingRules: report.summary.passingRules,
      failingRules: report.summary.failingRules,
      incompleteRules: report.summary.incompleteRules,
      affectedElements: report.summary.affectedElements,
      violations: report.violations,
      incompleteChecks: report.incomplete.map((i) => ({ id: i.id, description: i.description })),
      usedRealAxe: report.usedRealAxe,
    };
  } catch {
    // @@PROJECT_NAME-a11y not installed — use inline mock
  }

  // ─── Mock fallback ───────────────────────────────────────────────────────
  const violations: InlineViolation[] = [];

  if (/<img(?![^>]*\balt\b)[^>]*>/i.test(html)) {
    violations.push({
      id: 'image-alt',
      description: 'Images must have alternate text',
      impact: 'critical',
      nodeCount: 1,
      wcagTags: ['wcag2a', 'wcag111'],
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
    });
  }

  if (/<button(?![^>]*aria-label)[^>]*>\s*<\/button>/i.test(html)) {
    violations.push({
      id: 'button-name',
      description: 'Buttons must have discernible text',
      impact: 'critical',
      nodeCount: 1,
      wcagTags: ['wcag2a', 'wcag412'],
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/button-name',
    });
  }

  const inputMatches = html.match(/<input(?![^>]*aria-label)(?![^>]*aria-labelledby)[^>]*>/gi);
  if (inputMatches && !/for=|htmlFor=/i.test(html)) {
    violations.push({
      id: 'label',
      description: 'Form elements must have labels',
      impact: 'critical',
      nodeCount: inputMatches.length,
      wcagTags: ['wcag2a', 'wcag131', 'wcag412'],
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/label',
    });
  }

  const isAAViolation = (v: InlineViolation) =>
    v.wcagTags.some(
      (t) => t === 'wcag2a' || t === 'wcag2aa' || t === 'wcag21a' || t === 'wcag21aa'
    );
  const wcagAAPassing = !violations.some(isAAViolation);
  const wcagAAAPassing = !violations.some((v) => v.wcagTags.some((t) => t === 'wcag2aaa'));

  const wcagLevelSet = new Set<WcagLevel>();
  for (const v of violations) {
    for (const tag of v.wcagTags) {
      if (tag === 'wcag2a' || tag === 'wcag21a') wcagLevelSet.add('A');
      if (tag === 'wcag2aa' || tag === 'wcag21aa') wcagLevelSet.add('AA');
      if (tag === 'wcag2aaa') wcagLevelSet.add('AAA');
    }
  }

  return {
    grade: wcagAAPassing ? 'warn' : 'fail',
    wcagAAPassing,
    wcagAAAPassing,
    wcagLevels: Array.from(wcagLevelSet),
    passingRules: 5,
    failingRules: violations.length,
    incompleteRules: 1,
    affectedElements: violations.reduce((s, v) => s + v.nodeCount, 0),
    violations,
    incompleteChecks: [
      { id: 'color-contrast', description: 'Elements must have sufficient color contrast' },
    ],
    usedRealAxe: false,
  };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const A11Y_TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_axe_audit',
    description:
      'Run automated axe-core WCAG accessibility checking on HTML. ' +
      'Always call this first to get the mechanical violations and compliance status. ' +
      'Returns violations ordered by severity (critical first), passing rules, and incomplete checks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        html: {
          type: 'string',
          description: 'The HTML markup to audit (component snippet or full page)',
        },
        scope: {
          type: 'string',
          enum: ['component', 'page'],
          description:
            '"component" wraps the HTML in a minimal document before auditing. ' +
            '"page" expects a complete HTML document.',
        },
        wcagLevel: {
          type: 'string',
          enum: ['A', 'AA', 'AAA'],
          description: 'WCAG conformance level to check against (default: AA)',
        },
      },
      required: ['html', 'scope'],
    },
  },
  {
    name: 'analyze_html_semantics',
    description:
      'Perform deep semantic accessibility analysis that axe-core cannot do automatically. ' +
      'Evaluates alt text quality, link text meaningfulness, heading hierarchy, ARIA correctness, ' +
      'form relationships, and logical tab order. Call after run_axe_audit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        html: {
          type: 'string',
          description: 'The HTML to analyze semantically',
        },
        context: {
          type: 'string',
          description:
            "Optional description of the component's purpose or where it appears " +
            '(e.g. "Primary navigation", "Checkout form", "Hero section")',
        },
        focusAreas: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific a11y areas to focus on. ' +
            'Options: alt-text, link-text, tab-order, heading-hierarchy, form-relationship, aria-usage',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'generate_remediation',
    description:
      'Generate fixed, accessible HTML for a specific violation. ' +
      'Produces before/after code with inline comments explaining the WCAG criterion addressed ' +
      'and how to verify the fix with a screen reader or keyboard.',
    input_schema: {
      type: 'object' as const,
      properties: {
        violationId: {
          type: 'string',
          description: 'The axe-core rule ID or semantic issue category being remediated',
        },
        originalHtml: {
          type: 'string',
          description: 'The original (inaccessible) HTML snippet',
        },
        context: {
          type: 'string',
          description: 'Component purpose or surrounding context to guide the fix',
        },
        wcagCriterion: {
          type: 'string',
          description: 'The WCAG success criterion to reference (e.g. "1.1.1", "4.1.2")',
        },
      },
      required: ['violationId', 'originalHtml'],
    },
  },
];

// ─── System prompt loader ─────────────────────────────────────────────────────

function loadSystemPrompt(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = dirname(__filename);
  const promptPath = join(__dir, 'prompts', 'a11y.md');
  const raw = readFileSync(promptPath, 'utf-8');

  // Strip YAML frontmatter (--- ... ---)
  const frontmatterMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
  return frontmatterMatch ? raw.slice(frontmatterMatch[0].length).trim() : raw.trim();
}

// ─── Tool executors ───────────────────────────────────────────────────────────

async function executeRunAxeAudit(
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const html = input['html'] as string;
  const scope = (input['scope'] as AuditScope) ?? 'component';
  const wcagLevel = (input['wcagLevel'] as WcagLevel) ?? 'AA';

  const report = await runInlineAxeAudit(html, scope, wcagLevel);

  return {
    ...report,
    note: report.usedRealAxe
      ? 'Used real axe-core for this audit.'
      : 'Used mock axe-core (install @@PROJECT_NAME-a11y for real results).',
  };
}

function executeAnalyzeHtmlSemantics(input: Record<string, unknown>): Record<string, unknown> {
  const html = input['html'] as string;
  const context = (input['context'] as string | undefined) ?? '';

  // This function's return value is fed back to the LLM to trigger its own
  // semantic reasoning. The LLM will use the structured HTML + context to
  // produce SemanticIssue objects via the generate_remediation tool.
  const checks: string[] = [];

  // Alt text quality hints
  const imgTags = html.match(/<img[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const altMatch = tag.match(/alt="([^"]*)"/i);
    if (!altMatch) {
      checks.push('IMAGE_NO_ALT: Image element missing alt attribute entirely.');
    } else if (altMatch[1].trim() === '') {
      checks.push('IMAGE_DECORATIVE: Image has empty alt="" — verify it is truly decorative.');
    } else if (/^image\d*$|\.png|\.jpg|\.svg/i.test(altMatch[1])) {
      checks.push(
        `IMAGE_BAD_ALT: Alt text "${altMatch[1]}" appears to be a filename or generic label.`
      );
    }
  }

  // Link text quality hints
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  for (const anchor of anchors) {
    const textContent = anchor.replace(/<[^>]+>/g, '').trim();
    if (/^(click here|read more|learn more|here|more|link|this)$/i.test(textContent)) {
      checks.push(
        `LINK_VAGUE_TEXT: Link text "${textContent}" has no meaning out of context. Describe the destination.`
      );
    }
  }

  // Heading hierarchy hints
  const headings = html.match(/<h[1-6][^>]*>/gi) ?? [];
  const levels = headings.map((h) => parseInt(h.match(/<h([1-6])/i)?.[1] ?? '0', 10));
  const h1Count = levels.filter((l) => l === 1).length;
  if (h1Count === 0 && html.length > 200) {
    checks.push('HEADING_NO_H1: No <h1> found — document should have exactly one h1.');
  }
  if (h1Count > 1) {
    checks.push(
      `HEADING_MULTIPLE_H1: Found ${h1Count} <h1> elements — document should have only one.`
    );
  }
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      checks.push(
        `HEADING_SKIPPED: Heading jumps from h${levels[i - 1]} to h${levels[i]} — skipped levels confuse screen reader navigation.`
      );
    }
  }

  // ARIA role hints
  const divButtons = html.match(/<div[^>]*role="button"[^>]*>/gi) ?? [];
  for (const el of divButtons) {
    if (!/tabindex/i.test(el)) {
      checks.push(
        'ARIA_DIV_BUTTON_NO_TABINDEX: div[role="button"] without tabindex="0" is not keyboard accessible.'
      );
    }
  }

  return {
    html: html.slice(0, 500) + (html.length > 500 ? '...(truncated)' : ''),
    context: context || 'Not specified',
    detectedPatterns: checks,
    instructionForModel:
      'Based on the detected patterns above, identify SemanticIssue objects for each concern. ' +
      'For each, specify: category, severity, description, element snippet, and wcagCriterion. ' +
      'Then call generate_remediation for critical/serious issues.',
  };
}

function executeGenerateRemediation(input: Record<string, unknown>): Record<string, unknown> {
  const violationId = input['violationId'] as string;
  const originalHtml = input['originalHtml'] as string;
  const context = (input['context'] as string | undefined) ?? '';
  const wcagCriterion = (input['wcagCriterion'] as string | undefined) ?? '';

  // Return structured metadata for the LLM to use when generating its remediation code.
  // The actual code generation happens in the LLM's response text.
  return {
    violationId,
    originalHtml,
    context: context || 'Not specified',
    wcagCriterion: wcagCriterion || 'See axe-core helpUrl',
    guidelines: [
      'Show the original (broken) code in a comment: <!-- BEFORE: ... -->',
      'Show the fixed code immediately after: <!-- AFTER: ... -->',
      'Add inline comments referencing the specific WCAG criterion (e.g. <!-- WCAG 1.3.1 -->)',
      'Make only the minimum change needed to fix the a11y issue',
      'Include a verificationHint explaining how to test the fix (keyboard or screen reader)',
      'Prefer semantic HTML over ARIA roles when possible',
    ],
    remediationReady: true,
  };
}

async function executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'run_axe_audit':
      return executeRunAxeAudit(toolInput);
    case 'analyze_html_semantics':
      return executeAnalyzeHtmlSemantics(toolInput);
    case 'generate_remediation':
      return executeGenerateRemediation(toolInput);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Result extraction ────────────────────────────────────────────────────────

function extractAutomatedViolations(
  operations: Array<{ toolName: string; output: unknown }>
): AutomatedViolation[] {
  for (const op of operations) {
    if (op.toolName === 'run_axe_audit') {
      const out = op.output as Record<string, unknown>;
      const raw = out['violations'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(raw)) {
        return raw.map((v) => ({
          id: String(v['id'] ?? ''),
          description: String(v['description'] ?? ''),
          impact: (v['impact'] as AutomatedViolation['impact']) ?? 'minor',
          nodeCount: Number(v['nodeCount'] ?? 0),
          wcagTags: (v['wcagTags'] as string[]) ?? [],
          helpUrl: String(v['helpUrl'] ?? ''),
        }));
      }
    }
  }
  return [];
}

function extractGrade(operations: Array<{ toolName: string; output: unknown }>): {
  grade: ComplianceGrade;
  wcagAAPassing: boolean;
  wcagAAAPassing: boolean;
} {
  for (const op of operations) {
    if (op.toolName === 'run_axe_audit') {
      const out = op.output as Record<string, unknown>;
      return {
        grade: (out['grade'] as ComplianceGrade) ?? 'warn',
        wcagAAPassing: Boolean(out['wcagAAPassing']),
        wcagAAAPassing: Boolean(out['wcagAAAPassing']),
      };
    }
  }
  return { grade: 'warn', wcagAAPassing: false, wcagAAAPassing: false };
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Create an accessibility audit agent.
 *
 * @example
 * const agent = createA11yAgent({ wcagLevel: 'AA' });
 *
 * // Audit a component
 * const result = await agent.run('<button><img src="close.png"/></button>', { scope: 'component' });
 * console.log(result.grade);         // 'fail'
 * console.log(result.remediations);  // [{violationId:'button-name', before:'...', after:'...'}]
 *
 * @example
 * // Audit a full page
 * const html = fs.readFileSync('dist/index.html', 'utf-8');
 * const result = await agent.run(html, { scope: 'page', context: 'Marketing homepage' });
 */
export function createA11yAgent(config: A11yAgentConfig = {}) {
  const {
    model = 'claude-opus-4-6',
    maxIterations = 8,
    apiKey = process.env['ANTHROPIC_API_KEY'],
    wcagLevel = 'AA',
  } = config;

  const client = new Anthropic({ apiKey });

  /**
   * Run the accessibility agent on HTML markup.
   *
   * @param html    - Component HTML or full page source to audit
   * @param options - Audit options (scope, context)
   * @returns       Structured audit result with violations, semantic issues, and remediations
   */
  async function run(
    html: string,
    options: { scope?: AuditScope; context?: string } = {}
  ): Promise<A11yAgentResult> {
    const { scope = 'component', context = '' } = options;
    const systemPrompt = loadSystemPrompt();

    const userMessage =
      `Please audit the following ${scope} for accessibility issues (WCAG ${wcagLevel}).\n` +
      (context ? `Context: ${context}\n\n` : '\n') +
      '```html\n' +
      html +
      '\n```\n\n' +
      'Use run_axe_audit first, then analyze_html_semantics for semantic issues, ' +
      'then generate_remediation for each critical/serious violation. ' +
      'End with a structured report covering: compliance grade, automated findings, ' +
      'semantic issues, and all remediation code.';

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

    const toolOperations: Array<{ toolName: string; output: unknown }> = [];
    const semanticIssues: SemanticIssue[] = [];
    const remediations: RemediationSuggestion[] = [];
    let finalReport = '';
    let iterations = 0;

    // Agentic loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      iterations = iteration + 1;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: A11Y_TOOLS,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        finalReport = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      if (response.stop_reason !== 'tool_use') {
        finalReport = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        break;
      }

      // Execute tool calls
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolInput = toolUse.input as Record<string, unknown>;
        const output = await executeTool(toolUse.name, toolInput);

        toolOperations.push({ toolName: toolUse.name, output });

        // Extract semantic issues from analyze_html_semantics responses
        if (toolUse.name === 'analyze_html_semantics') {
          const out = output as Record<string, unknown>;
          const patterns = (out['detectedPatterns'] as string[]) ?? [];
          for (const p of patterns) {
            const [code, ...rest] = p.split(': ');
            const category = mapPatternToCategory(code ?? '');
            semanticIssues.push({
              category,
              severity: mapPatternToSeverity(code ?? ''),
              description: rest.join(': '),
              element: '',
            });
          }
        }

        // Extract remediations from generate_remediation responses
        // (the LLM fills in the actual code in its text response)
        if (toolUse.name === 'generate_remediation') {
          const out = output as Record<string, unknown>;
          remediations.push({
            violationId: String(out['violationId'] ?? toolInput['violationId'] ?? ''),
            before: String(toolInput['originalHtml'] ?? ''),
            after: '', // Filled from LLM response text
            explanation: '',
            verificationHint: '',
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(output),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    if (!finalReport) {
      finalReport = 'Accessibility audit completed. Review the violations and remediations above.';
    }

    const automatedViolations = extractAutomatedViolations(toolOperations);
    const { grade, wcagAAPassing, wcagAAAPassing } = extractGrade(toolOperations);

    return {
      report: finalReport,
      grade,
      wcagAAPassing,
      wcagAAAPassing,
      automatedViolations,
      semanticIssues,
      remediations,
      iterations,
    };
  }

  return { run };
}

// ─── Category/severity helpers ────────────────────────────────────────────────

function mapPatternToCategory(code: string): SemanticIssue['category'] {
  if (code.startsWith('IMAGE')) return 'alt-text';
  if (code.startsWith('LINK')) return 'link-text';
  if (code.startsWith('HEADING')) return 'heading-hierarchy';
  if (code.startsWith('ARIA')) return 'aria-usage';
  if (code.startsWith('FORM')) return 'form-relationship';
  if (code.startsWith('TAB')) return 'tab-order';
  if (code.startsWith('COLOR')) return 'color-contrast';
  return 'other';
}

function mapPatternToSeverity(code: string): SemanticIssue['severity'] {
  if (code.includes('NO_ALT') || code.includes('NO_H1') || code.includes('NO_TABINDEX')) {
    return 'critical';
  }
  if (code.includes('BAD_ALT') || code.includes('VAGUE') || code.includes('MULTIPLE_H1')) {
    return 'serious';
  }
  if (code.includes('DECORATIVE') || code.includes('SKIPPED')) {
    return 'moderate';
  }
  return 'minor';
}
