/**
 * Prompt Quality Linter
 *
 * Static analysis tool that checks prompt strings for common quality issues.
 * Designed to run in CI to catch prompt regressions before they reach agents.
 *
 * Quality signals checked:
 * 1. Token budget — prompts exceeding ~4000 tokens risk context window pressure
 * 2. Verification gates — agent prompts must include verification steps
 * 3. Scope discipline — agent prompts must constrain scope
 * 4. Output format — prompts should specify expected output structure
 * 5. Anti-patterns — flag dangerous instructions (e.g., "skip tests")
 * 6. Actionability — prompts should end with clear next steps
 */

import { DEFAULT_PROMPTS } from './defaults.js';

/** Result of linting a single prompt */
export interface LintResult {
  name: string;
  passed: boolean;
  warnings: LintWarning[];
  errors: LintError[];
}

export interface LintWarning {
  rule: string;
  message: string;
}

export interface LintError {
  rule: string;
  message: string;
}

/** Summary of linting all prompts */
export interface LintSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  results: LintResult[];
}

/** Approximate token count (1 token ≈ 4 chars for English text) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Check if a prompt is an agent-facing prompt (not a user-facing one) */
function isAgentPrompt(name: string): boolean {
  const agentCategories = ['autoMode.', 'taskExecution.', 'agent.', 'backlogPlan.'];
  return agentCategories.some((prefix) => name.startsWith(prefix));
}

/**
 * Rule 1: Token budget — warn if prompt exceeds threshold
 */
function checkTokenBudget(name: string, prompt: string): LintWarning[] {
  const warnings: LintWarning[] = [];
  const tokens = estimateTokens(prompt);
  if (tokens > 4000) {
    warnings.push({
      rule: 'token-budget',
      message: `Prompt "${name}" is ~${tokens} tokens (exceeds 4000 token threshold). Consider splitting or condensing.`,
    });
  }
  return warnings;
}

/**
 * Rule 2: Verification gates — agent prompts should include verification steps
 */
function checkVerificationGates(name: string, prompt: string): LintWarning[] {
  if (!isAgentPrompt(name)) return [];

  const warnings: LintWarning[] = [];
  const hasVerification =
    /verification|verify|gate|check|assert|validate|build.*pass|test.*pass/i.test(prompt);

  if (!hasVerification) {
    warnings.push({
      rule: 'verification-gates',
      message: `Agent prompt "${name}" has no verification steps. Agent may not validate its own output.`,
    });
  }
  return warnings;
}

/**
 * Rule 3: Scope discipline — agent prompts should constrain scope
 */
function checkScopeDiscipline(name: string, prompt: string): LintWarning[] {
  if (!isAgentPrompt(name)) return [];

  const warnings: LintWarning[] = [];
  const hasScope = /scope|focus|only|do not|don't|never|limit|restrict|exactly what/i.test(prompt);

  if (!hasScope) {
    warnings.push({
      rule: 'scope-discipline',
      message: `Agent prompt "${name}" has no scope constraints. Agent may over-deliver or scope-creep.`,
    });
  }
  return warnings;
}

/**
 * Rule 4: Output format — prompts should specify expected output
 */
function checkOutputFormat(name: string, prompt: string): LintWarning[] {
  const warnings: LintWarning[] = [];
  const hasFormat =
    /format|output|return|respond|response|json|xml|markdown|summary|structure/i.test(prompt);

  if (!hasFormat && prompt.length > 200) {
    warnings.push({
      rule: 'output-format',
      message: `Prompt "${name}" does not specify output format. LLM may produce inconsistent output shapes.`,
    });
  }
  return warnings;
}

/**
 * Rule 5: Anti-patterns — flag dangerous instructions
 */
function checkAntiPatterns(name: string, prompt: string): LintError[] {
  const errors: LintError[] = [];

  const dangerousPatterns: Array<{ pattern: RegExp; message: string }> = [
    {
      pattern: /skip\s+(all\s+)?tests/i,
      message: 'Prompt instructs to skip tests',
    },
    {
      pattern: /ignore\s+(all\s+)?errors/i,
      message: 'Prompt instructs to ignore errors',
    },
    {
      pattern: /rm\s+-rf\s+\//,
      message: 'Prompt contains destructive rm -rf command',
    },
    {
      pattern: /force\s+push\s+(to\s+)?main/i,
      message: 'Prompt instructs force push to main',
    },
    {
      pattern: /git\s+push\s+--force\s+origin\s+main/i,
      message: 'Prompt contains force push to main',
    },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(prompt)) {
      errors.push({ rule: 'anti-pattern', message: `"${name}": ${message}` });
    }
  }

  return errors;
}

/**
 * Rule 6: Actionability — prompts should end with clear direction
 */
function checkActionability(name: string, prompt: string): LintWarning[] {
  if (!isAgentPrompt(name)) return [];

  const warnings: LintWarning[] = [];
  // Check last 500 chars for action words
  const tail = prompt.slice(-500);
  const hasAction = /begin|start|implement|create|build|now|proceed|execute|do|run/i.test(tail);

  if (!hasAction) {
    warnings.push({
      rule: 'actionability',
      message: `Agent prompt "${name}" does not end with a clear action directive. Agent may not know what to do first.`,
    });
  }
  return warnings;
}

/**
 * Lint a single prompt against all rules.
 */
export function lintPrompt(name: string, prompt: string): LintResult {
  const warnings: LintWarning[] = [
    ...checkTokenBudget(name, prompt),
    ...checkVerificationGates(name, prompt),
    ...checkScopeDiscipline(name, prompt),
    ...checkOutputFormat(name, prompt),
    ...checkActionability(name, prompt),
  ];

  const errors: LintError[] = [...checkAntiPatterns(name, prompt)];

  return {
    name,
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Lint all registered default prompts.
 * Returns a summary with pass/fail counts and individual results.
 */
export function lintAllPrompts(): LintSummary {
  const results: LintResult[] = [];

  // Flatten all prompt categories into name → prompt pairs
  for (const [category, prompts] of Object.entries(DEFAULT_PROMPTS)) {
    for (const [key, prompt] of Object.entries(prompts as unknown as Record<string, string>)) {
      const name = `${category}.${key}`;
      results.push(lintPrompt(name, prompt));
    }
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    results,
  };
}
