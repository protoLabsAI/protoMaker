/**
 * Quarantine Service - 4-stage validation pipeline for feature submissions
 *
 * Stages:
 * 1. Gate: Trust tier check (bypass, advisory, or full validation)
 * 2. Syntax: Basic structure validation (title/description length, null bytes, control chars)
 * 3. Content: LLM safety (sanitize markdown, detect prompt injection)
 * 4. Security: File safety (validate file paths, prevent path traversal)
 *
 * Storage: QuarantineEntry records in {projectPath}/.automaker/quarantine/{id}.json
 */

import { createLogger, atomicWriteJson, readJsonFile } from '@protolabs-ai/utils';
import {
  normalizeUnicode,
  sanitizeMarkdownForLLM,
  detectPromptInjection,
  validateFilePaths,
} from '@protolabs-ai/utils';
import type { TrustTier, QuarantineEntry, SanitizationViolation } from '@protolabs-ai/types';
import type { Feature } from '@protolabs-ai/types';
import type { TrustTierService } from './trust-tier-service.js';
import path from 'path';
import { randomUUID } from 'crypto';
import { secureFs } from '@protolabs-ai/platform';

const logger = createLogger('QuarantineService');

/**
 * Input to the quarantine pipeline
 */
export interface QuarantineInput {
  title: string;
  description: string;
  source: Feature['source'];
  trustTier: TrustTier;
  featureId?: string;
}

/**
 * Output from the quarantine pipeline
 */
export interface QuarantineOutcome {
  entry: QuarantineEntry;
  sanitizedTitle: string;
  sanitizedDescription: string;
  approved: boolean; // true if passed or bypassed
}

/**
 * QuarantineService - 4-stage validation pipeline
 */
export class QuarantineService {
  private quarantineDir: string;

  constructor(
    private trustTierService: TrustTierService,
    private projectPath: string
  ) {
    this.quarantineDir = path.join(projectPath, '.automaker', 'quarantine');
  }

  /**
   * Process a feature submission through the 4-stage quarantine pipeline
   */
  async process(input: QuarantineInput): Promise<QuarantineOutcome> {
    const entryId = randomUUID();
    const submittedAt = new Date().toISOString();

    // Initialize entry
    const entry: QuarantineEntry = {
      id: entryId,
      featureId: input.featureId,
      source: input.source,
      trustTier: input.trustTier,
      submittedAt,
      result: 'passed',
      violations: [],
      originalTitle: input.title,
      originalDescription: input.description,
    };

    let sanitizedTitle = input.title;
    let sanitizedDescription = input.description;

    // Stage 1: Gate (Trust check)
    const gateResult = await this.runGateStage(input.trustTier);
    if (gateResult.bypassed) {
      entry.result = 'bypassed';
      await this.saveEntry(entry);
      return {
        entry,
        sanitizedTitle,
        sanitizedDescription,
        approved: true,
      };
    }

    const isAdvisoryMode = gateResult.advisoryMode;

    // Stage 2: Syntax validation
    const syntaxResult = this.runSyntaxStage(sanitizedTitle, sanitizedDescription);
    entry.violations.push(...syntaxResult.violations);
    sanitizedTitle = syntaxResult.sanitizedTitle;
    sanitizedDescription = syntaxResult.sanitizedDescription;

    // Check for blocking violations in Stage 2
    if (!isAdvisoryMode && syntaxResult.violations.some((v) => v.severity === 'block')) {
      entry.result = 'failed';
      entry.stage = 'syntax';
      entry.sanitizedTitle = sanitizedTitle;
      entry.sanitizedDescription = sanitizedDescription;
      await this.saveEntry(entry);
      return {
        entry,
        sanitizedTitle,
        sanitizedDescription,
        approved: false,
      };
    }

    // Stage 3: Content (LLM safety)
    const contentResult = this.runContentStage(sanitizedTitle, sanitizedDescription);
    entry.violations.push(...contentResult.violations);
    sanitizedDescription = contentResult.sanitizedDescription;

    // Check for blocking violations in Stage 3
    if (!isAdvisoryMode && contentResult.violations.some((v) => v.severity === 'block')) {
      entry.result = 'failed';
      entry.stage = 'content';
      entry.sanitizedTitle = sanitizedTitle;
      entry.sanitizedDescription = sanitizedDescription;
      await this.saveEntry(entry);
      return {
        entry,
        sanitizedTitle,
        sanitizedDescription,
        approved: false,
      };
    }

    // Stage 4: Security (File safety)
    const securityResult = this.runSecurityStage(sanitizedDescription);
    entry.violations.push(...securityResult.violations);

    // Check for blocking violations in Stage 4
    if (!isAdvisoryMode && securityResult.violations.some((v) => v.severity === 'block')) {
      entry.result = 'failed';
      entry.stage = 'security';
      entry.sanitizedTitle = sanitizedTitle;
      entry.sanitizedDescription = sanitizedDescription;
      await this.saveEntry(entry);
      return {
        entry,
        sanitizedTitle,
        sanitizedDescription,
        approved: false,
      };
    }

    // All stages passed
    entry.result = 'passed';
    entry.sanitizedTitle = sanitizedTitle;
    entry.sanitizedDescription = sanitizedDescription;
    await this.saveEntry(entry);

    return {
      entry,
      sanitizedTitle,
      sanitizedDescription,
      approved: true,
    };
  }

  /**
   * Stage 1: Gate - Trust tier check
   */
  private async runGateStage(
    trustTier: TrustTier
  ): Promise<{ bypassed: boolean; advisoryMode: boolean }> {
    // trustTier >= 3 (maintainer/system): bypass all stages
    if (trustTier >= 3) {
      logger.info(`Trust tier ${trustTier}: bypassing all quarantine stages`);
      return { bypassed: true, advisoryMode: false };
    }

    // trustTier === 2 (contributor): advisory mode (warn doesn't block)
    if (trustTier === 2) {
      logger.info(`Trust tier ${trustTier}: running in advisory mode (warnings don't block)`);
      return { bypassed: false, advisoryMode: true };
    }

    // trustTier <= 1: full validation
    logger.info(`Trust tier ${trustTier}: running full validation`);
    return { bypassed: false, advisoryMode: false };
  }

  /**
   * Stage 2: Syntax - Basic structure validation
   */
  private runSyntaxStage(
    title: string,
    description: string
  ): {
    violations: SanitizationViolation[];
    sanitizedTitle: string;
    sanitizedDescription: string;
  } {
    const violations: SanitizationViolation[] = [];

    // Normalize unicode for both fields
    let sanitizedTitle = normalizeUnicode(title);
    let sanitizedDescription = normalizeUnicode(description);

    // Check if normalization changed the text (flag as warn)
    if (sanitizedTitle !== title) {
      violations.push({
        stage: 'syntax',
        rule: 'unicode_normalization',
        severity: 'warn',
        detail: 'Title contained unicode anomalies that were normalized',
      });
    }

    if (sanitizedDescription !== description) {
      violations.push({
        stage: 'syntax',
        rule: 'unicode_normalization',
        severity: 'warn',
        detail: 'Description contained unicode anomalies that were normalized',
      });
    }

    // Validate title length (1-200 chars)
    if (sanitizedTitle.length === 0) {
      violations.push({
        stage: 'syntax',
        rule: 'title_length',
        severity: 'block',
        detail: 'Title cannot be empty',
      });
    } else if (sanitizedTitle.length > 200) {
      violations.push({
        stage: 'syntax',
        rule: 'title_length',
        severity: 'block',
        detail: `Title too long (${sanitizedTitle.length} chars, max 200)`,
      });
    }

    // Validate description length (1-10000 chars)
    if (sanitizedDescription.length === 0) {
      violations.push({
        stage: 'syntax',
        rule: 'description_length',
        severity: 'block',
        detail: 'Description cannot be empty',
      });
    } else if (sanitizedDescription.length > 10000) {
      violations.push({
        stage: 'syntax',
        rule: 'description_length',
        severity: 'block',
        detail: `Description too long (${sanitizedDescription.length} chars, max 10000)`,
      });
    }

    // Check for null bytes
    if (sanitizedTitle.includes('\0')) {
      violations.push({
        stage: 'syntax',
        rule: 'null_byte',
        severity: 'block',
        detail: 'Title contains null bytes',
      });
      sanitizedTitle = sanitizedTitle.replace(/\0/g, '');
    }

    if (sanitizedDescription.includes('\0')) {
      violations.push({
        stage: 'syntax',
        rule: 'null_byte',
        severity: 'block',
        detail: 'Description contains null bytes',
      });
      sanitizedDescription = sanitizedDescription.replace(/\0/g, '');
    }

    // Check for control characters (except newlines \n, carriage returns \r, tabs \t)
    const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    if (controlCharPattern.test(sanitizedTitle)) {
      violations.push({
        stage: 'syntax',
        rule: 'control_characters',
        severity: 'block',
        detail: 'Title contains invalid control characters',
      });
      sanitizedTitle = sanitizedTitle.replace(controlCharPattern, '');
    }

    if (controlCharPattern.test(sanitizedDescription)) {
      violations.push({
        stage: 'syntax',
        rule: 'control_characters',
        severity: 'block',
        detail: 'Description contains invalid control characters',
      });
      sanitizedDescription = sanitizedDescription.replace(controlCharPattern, '');
    }

    return { violations, sanitizedTitle, sanitizedDescription };
  }

  /**
   * Stage 3: Content - LLM safety
   */
  private runContentStage(
    title: string,
    description: string
  ): { violations: SanitizationViolation[]; sanitizedDescription: string } {
    const violations: SanitizationViolation[] = [];

    // Sanitize markdown in description
    const markdownResult = sanitizeMarkdownForLLM(description);
    const sanitizedDescription = markdownResult.text;

    // Map markdown sanitization violations
    for (const v of markdownResult.violations) {
      violations.push({
        stage: 'content',
        rule: v.type,
        severity: v.severity,
        detail: v.message,
        offset: v.position?.start,
      });
    }

    // Detect prompt injection in title + description
    const combinedText = `${title}\n${description}`;
    const injectionViolations = detectPromptInjection(combinedText);

    // Map prompt injection violations
    for (const v of injectionViolations) {
      violations.push({
        stage: 'content',
        rule: v.type,
        severity: v.severity,
        detail: v.message,
        offset: v.position?.start,
      });
    }

    return { violations, sanitizedDescription };
  }

  /**
   * Stage 4: Security - File safety
   */
  private runSecurityStage(description: string): { violations: SanitizationViolation[] } {
    const violations: SanitizationViolation[] = [];

    // Validate file paths
    const pathViolations = validateFilePaths(description, this.projectPath);

    // Map path validation violations
    for (const v of pathViolations) {
      violations.push({
        stage: 'security',
        rule: v.type,
        severity: v.severity,
        detail: v.message,
        offset: v.position?.start,
      });
    }

    return { violations };
  }

  /**
   * Get a quarantine entry by ID
   */
  async getEntry(id: string): Promise<QuarantineEntry | null> {
    const filePath = path.join(this.quarantineDir, `${id}.json`);
    try {
      const entry = await readJsonFile<QuarantineEntry>(
        filePath,
        null as unknown as QuarantineEntry
      );
      return entry;
    } catch (_error) {
      logger.error(`Failed to read quarantine entry ${id}:`, _error);
      return null;
    }
  }

  /**
   * List all pending quarantine entries
   */
  async listPending(): Promise<QuarantineEntry[]> {
    try {
      // Ensure directory exists
      await this.ensureQuarantineDir();

      const files = (await secureFs.readdir(this.quarantineDir)) as string[];
      const entries: QuarantineEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.quarantineDir, file);
        const entry = await readJsonFile<QuarantineEntry>(
          filePath,
          null as unknown as QuarantineEntry
        );

        if (entry && entry.result === 'failed' && !entry.reviewedAt) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
      logger.error('Failed to list pending quarantine entries:', error);
      return [];
    }
  }

  /**
   * Approve a quarantine entry (manual review)
   */
  async approve(id: string, reviewedBy: string): Promise<QuarantineEntry> {
    const entry = await this.getEntry(id);
    if (!entry) {
      throw new Error(`Quarantine entry not found: ${id}`);
    }

    entry.result = 'passed';
    entry.reviewedAt = new Date().toISOString();
    entry.reviewedBy = reviewedBy;

    await this.saveEntry(entry);
    logger.info(`Quarantine entry ${id} approved by ${reviewedBy}`);

    return entry;
  }

  /**
   * Reject a quarantine entry (manual review)
   */
  async reject(id: string, reviewedBy: string, reason: string): Promise<QuarantineEntry> {
    const entry = await this.getEntry(id);
    if (!entry) {
      throw new Error(`Quarantine entry not found: ${id}`);
    }

    entry.result = 'failed';
    entry.reviewedAt = new Date().toISOString();
    entry.reviewedBy = reviewedBy;

    // Add rejection reason as a violation
    entry.violations.push({
      stage: entry.stage || 'gate',
      rule: 'manual_rejection',
      severity: 'block',
      detail: reason,
    });

    await this.saveEntry(entry);
    logger.info(`Quarantine entry ${id} rejected by ${reviewedBy}: ${reason}`);

    return entry;
  }

  /**
   * Save a quarantine entry to disk
   */
  private async saveEntry(entry: QuarantineEntry): Promise<void> {
    await this.ensureQuarantineDir();
    const filePath = path.join(this.quarantineDir, `${entry.id}.json`);
    await atomicWriteJson(filePath, entry, { indent: 2 });
    logger.debug(`Saved quarantine entry ${entry.id} (result: ${entry.result})`);
  }

  /**
   * Ensure the quarantine directory exists
   */
  private async ensureQuarantineDir(): Promise<void> {
    try {
      await secureFs.mkdir(this.quarantineDir, { recursive: true });
    } catch (_error) {
      // Ignore if directory already exists
    }
  }
}
