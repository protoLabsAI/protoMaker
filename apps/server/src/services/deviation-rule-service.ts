/**
 * Deviation Rule Service
 *
 * Evaluates agent scope against per-feature constraints.
 * Rules are loaded from the structured plan's deviationRules field or from
 * workflow settings defaults. Formatted rules are injected into agent system
 * prompts as explicit operating instructions.
 *
 * In v1, enforcement is advisory — the rules are instructions, not hard blocks.
 */

import type { DeviationRule, StructuredPlan } from '@protolabsai/types';

/**
 * Built-in four-category deviation rules matching the GSD model.
 * Used when neither the structured plan nor workflow settings provide rules.
 */
export const DEFAULT_DEVIATION_RULES: DeviationRule[] = [
  {
    category: 'auto-fix-bugs',
    condition:
      'A bug is discovered during implementation that is within the scope of files being modified',
    action:
      'Fix the bug immediately and continue with the main task. Document the fix in your summary.',
  },
  {
    category: 'auto-fix-critical',
    condition:
      'Missing critical functionality that directly blocks achieving the stated goal of this feature',
    action:
      'Implement the missing functionality, staying strictly within the stated scope. Do not expand to adjacent features.',
  },
  {
    category: 'auto-fix-blocking',
    condition:
      'Blocking issues such as missing imports, type errors, or compilation failures in files within scope',
    action:
      'Fix the blocking issue immediately to unblock implementation progress. This is part of normal implementation work.',
  },
  {
    category: 'escalate-architecture',
    condition:
      'Architecture changes, new external dependencies, database schema changes, or scope expansion beyond the stated feature',
    action:
      'Stop implementation. Document the blocker and the reason clearly. Do NOT proceed autonomously — escalate for human review.',
  },
];

export class DeviationRuleService {
  /**
   * Load deviation rules for a feature execution.
   *
   * Priority order:
   * 1. Structured plan's deviationRules (if present and non-empty)
   * 2. Provided defaultRules (from workflow settings)
   * 3. Built-in DEFAULT_DEVIATION_RULES
   */
  loadRules(structuredPlan?: StructuredPlan, defaultRules?: DeviationRule[]): DeviationRule[] {
    if (structuredPlan?.deviationRules && structuredPlan.deviationRules.length > 0) {
      return structuredPlan.deviationRules;
    }
    if (defaultRules && defaultRules.length > 0) {
      return defaultRules;
    }
    return DEFAULT_DEVIATION_RULES;
  }

  /**
   * Format deviation rules as agent instructions suitable for injection into
   * an agent system prompt. Returns a markdown section with clear, actionable
   * instructions and an example for each rule category.
   */
  formatForPrompt(rules: DeviationRule[]): string {
    if (rules.length === 0) {
      return '';
    }

    const lines: string[] = [
      '## Deviation Rules',
      '',
      'These rules define how to handle situations where the implementation diverges from the original plan.',
      'Follow them strictly — they define the boundaries of your autonomous authority.',
      '',
    ];

    for (const rule of rules) {
      const categoryLabel = rule.category ? `[${rule.category}] ` : '';
      lines.push(`**${categoryLabel}When:** ${rule.condition}`);
      lines.push(`**Do:** ${rule.action}`);
      lines.push('');
    }

    lines.push(
      'If you are unsure whether a situation falls within these rules, treat it as `escalate-architecture` and stop.'
    );

    return lines.join('\n');
  }
}
