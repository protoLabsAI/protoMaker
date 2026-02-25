/**
 * Quarantine and trust tier types for feature sanitization
 */

import type { Feature } from './feature.js';

/**
 * Trust tier levels for feature submission sources
 * Higher numbers = more trust, higher privileges
 */
export type TrustTier = 0 | 1 | 2 | 3 | 4;
// 0 = anonymous (external, unknown)
// 1 = github_user (verified GitHub account, opened issue)
// 2 = contributor (past merged contribution via idea)
// 3 = maintainer (team member, bypasses quarantine)
// 4 = system (internal/MCP/CLI, full trust)

/**
 * Stages in the quarantine process
 */
export type QuarantineStage = 'gate' | 'syntax' | 'content' | 'security';

/**
 * Possible outcomes of quarantine processing
 */
export type QuarantineResult = 'passed' | 'failed' | 'bypassed';

/**
 * Records a single rule violation during sanitization
 */
export interface SanitizationViolation {
  stage: QuarantineStage;
  rule: string;
  severity: 'info' | 'warn' | 'block';
  detail: string;
  offset?: number; // character position in original text
}

/**
 * Complete record of a feature's quarantine processing
 */
export interface QuarantineEntry {
  id: string;
  featureId?: string;
  source: Feature['source'];
  trustTier: TrustTier;
  submittedAt: string; // ISO timestamp
  reviewedAt?: string;
  result: QuarantineResult;
  stage?: QuarantineStage; // stage where failure occurred
  violations: SanitizationViolation[];
  originalTitle: string;
  originalDescription: string;
  sanitizedTitle?: string;
  sanitizedDescription?: string;
  reviewedBy?: string; // maintainer who approved/rejected if manual review
}

/**
 * Records trust tier grants for GitHub users
 */
export interface TrustTierRecord {
  githubUsername: string;
  tier: TrustTier;
  grantedAt: string;
  grantedBy: string;
  reason?: string;
}
